#!/usr/bin/env node
/**
 * Overnight tooling CLI. See docs/OVERNIGHT.md. Starting a session needs a fresh explicit start command from the owner
 * (the exact phrase), a verified Google Drive backup and a bounded session file; nothing here runs on a schedule.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBackup, verifyBackup } from './backup.mjs';
import { readJson } from './lib.mjs';
import { abandonSession, overnightDir, preflight, startSession, writeHandoff } from './session.mjs';
import { uploadBackup, uploadReadiness } from './upload.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const USAGE = `Usage: node tools/overnight/main.mjs <command>
  backup [--out <dir>] [--exclude <path>]...   create and verify a local recovery backup (default dir: ../putt-pals-backups or PUTT_PALS_BACKUP_DIR)
  verify <backup-dir>                           re-run the restore verification
  readiness                                     check the Google Drive upload setup (rclone and PUTT_PALS_BACKUP_REMOTE)
  upload <backup-dir> [--remote <remote:folder>] upload a verified backup, verify the uploaded bytes and write the receipt
  preflight --session <file> --backup <dir>     check a session without starting it (add --confirm "Start overnight work" to include that check)
  start --session <file> --backup <dir> --confirm "Start overnight work"
  handoff [--id <session-id>]                   write the handoff; closes a stale lock if one exists`;

function options(argv) {
  const out = { _: [], exclude: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { out._.push(a); continue; }
    const key = a.slice(2), value = argv[++i];
    if (key === 'exclude') out.exclude.push(value); else out[key] = value;
  }
  return out;
}

async function main(argv) {
  const [command, ...rest] = argv;
  const o = options(rest);
  switch (command) {
    case 'backup': {
      const outDir = path.resolve(o.out ?? process.env.PUTT_PALS_BACKUP_DIR ?? path.join(root, '..', 'putt-pals-backups'));
      const { dir, manifest } = createBackup({ root, outDir, extraExcludes: o.exclude });
      const result = verifyBackup(dir);
      console.log(`${result.ok ? 'BACKUP VERIFIED' : 'BACKUP FAILED VERIFICATION'}: ${dir}`);
      console.log(`${manifest.workingTree.fileCount} files, ${manifest.git.refs.length} refs, HEAD ${manifest.git.head.slice(0, 7)} on ${manifest.git.branch || '(detached)'}`);
      if (manifest.excluded.credentialFilesNotBackedUp.length) console.log('NOT backed up (credentials, names only): ' + manifest.excluded.credentialFilesNotBackedUp.join(', '));
      for (const c of result.checks.filter(c => !c.ok)) console.log(`  FAIL ${c.name}${c.detail ? ': ' + c.detail : ''}`);
      console.log('Not yet uploaded: run the upload command to put it in Google Drive.');
      return result.ok ? 0 : 1;
    }
    case 'verify': {
      const result = verifyBackup(path.resolve(o._[0] ?? ''));
      console.log(result.ok ? 'VERIFIED' : 'FAILED');
      for (const c of result.checks) console.log(`  ${c.ok ? 'ok  ' : 'FAIL'} ${c.name}${c.detail ? ': ' + c.detail : ''}`);
      return result.ok ? 0 : 1;
    }
    case 'readiness': {
      const r = uploadReadiness({ remote: process.env.PUTT_PALS_BACKUP_REMOTE });
      console.log(r.ok ? 'Google Drive upload is configured.' : 'Google Drive upload is NOT ready:\n  ' + r.problems.join('\n  '));
      return r.ok ? 0 : 1;
    }
    case 'upload': {
      const receipt = uploadBackup({ dir: path.resolve(o._[0] ?? ''), remote: o.remote ?? process.env.PUTT_PALS_BACKUP_REMOTE });
      console.log(`UPLOADED AND VERIFIED: ${receipt.destination}\nReceipt: ${path.join(path.resolve(o._[0]), 'receipt.json')}`);
      return 0;
    }
    case 'preflight': {
      const spec = readJson(path.resolve(o.session ?? ''));
      const result = preflight({ root, spec, backupDir: o.backup && path.resolve(o.backup), confirmPhrase: o.confirm });
      console.log(result.ok ? 'PREFLIGHT OK (nothing was started)' : 'PREFLIGHT FAILED:\n  ' + result.problems.join('\n  '));
      return result.ok ? 0 : 1;
    }
    case 'start': {
      const spec = readJson(path.resolve(o.session ?? ''));
      const result = await startSession({ root, spec, backupDir: path.resolve(o.backup ?? ''), confirmPhrase: o.confirm });
      console.log(`Session ${result.id} ended (${result.reason}). Handoff: ${result.handoff}`);
      return result.reason === 'completed' ? 0 : 2;
    }
    case 'handoff': {
      const lock = path.join(overnightDir(root), 'lock.json');
      if (fs.existsSync(lock) && !o.id) { const r = abandonSession({ root }); console.log(`Closed stale session ${r.id}. Handoff: ${r.handoff}`); return 0; }
      const id = o.id ?? (fs.existsSync(overnightDir(root)) ? fs.readdirSync(overnightDir(root)).filter(n => n !== 'lock.json').sort().at(-1) : undefined);
      if (!id) throw new Error('No session found');
      console.log(`Handoff: ${writeHandoff({ root, id })}`);
      return 0;
    }
    default:
      console.log(USAGE);
      return command ? 1 : 0;
  }
}

main(process.argv.slice(2)).then(code => { process.exitCode = code; }, error => { console.error('ERROR: ' + error.message); process.exitCode = 1; });
