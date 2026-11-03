/**
 * Upload of a verified recovery backup to the owner's private Google Drive folder through rclone, and the receipt the
 * overnight launcher requires.
 *
 * Setup (once, by the owner): install rclone, create a Drive remote with `rclone config` (scope: drive, ideally a
 * dedicated folder via root_folder_id), and set PUTT_PALS_BACKUP_REMOTE to "<remote>:<folder>", for example
 * "putt-drive:PuttPalsBackups". Credentials stay in rclone's own configuration; nothing here reads or stores them.
 *
 * Never overwrites: each backup goes to its own id-named subfolder, and an existing subfolder is an error. Success means
 * `rclone check --download` compared the uploaded bytes with the local files.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readJson, run, sha256File, writeJson } from './lib.mjs';

export const RECEIPT_VERSION = 1;

/** rclone may be a program name or [program, ...leading args] (tests substitute a fake). */
const invoke = (rclone, args, options) => { const [program, ...lead] = Array.isArray(rclone) ? rclone : [rclone]; return run(program, [...lead, ...args], options); };

/** @returns {{ok: boolean, problems: string[]}} */
export function uploadReadiness({ remote, rclone = 'rclone' }) {
  const problems = [];
  if (!remote) problems.push('PUTT_PALS_BACKUP_REMOTE (or --remote) is not set: the private Google Drive destination is missing');
  else if (!/^[^:\s]+:.*/.test(remote)) problems.push('The backup remote must look like "<rclone-remote>:<folder>"');
  const version = invoke(rclone, ['version'], { allowFail: true });
  if (version.error || version.status !== 0) problems.push('rclone is not installed or not on PATH');
  else if (remote && /^[^:\s]+:/.test(remote)) {
    const name = remote.split(':')[0] + ':';
    const remotes = invoke(rclone, ['listremotes'], { allowFail: true }).stdout.split('\n').map(s => s.trim());
    if (!remotes.includes(name)) problems.push(`rclone has no remote named ${name} (run rclone config)`);
  }
  return { ok: problems.length === 0, problems };
}

/**
 * @param {{dir: string, remote: string, rclone?: string, now?: Date}} options
 * @returns {object} the receipt that was written to <dir>/receipt.json
 */
export function uploadBackup({ dir, remote, rclone = 'rclone', now = new Date() }) {
  const ready = uploadReadiness({ remote, rclone });
  if (!ready.ok) throw new Error('Upload not possible:\n  ' + ready.problems.join('\n  '));
  const manifestFile = path.join(dir, 'manifest.json');
  const verificationFile = path.join(dir, 'verification.json');
  if (!fs.existsSync(verificationFile)) throw new Error('Backup has not been verified; run the verify step first');
  const manifest = readJson(manifestFile), verification = readJson(verificationFile);
  if (!verification.ok) throw new Error('The local backup failed verification; refusing to upload it');
  if (verification.manifestSha256 !== sha256File(manifestFile)) throw new Error('The manifest changed after verification; verify again');

  const destination = `${remote.replace(/\/+$/, '')}/${manifest.backupId}`;
  const existing = invoke(rclone, ['lsf', destination], { allowFail: true });
  if (existing.status === 0 && existing.stdout.trim()) throw new Error(`${destination} already exists; backups are never overwritten`);

  // Upload only the backup artifacts, not the local receipt (which does not exist yet) or verification scratch.
  const names = [...Object.keys(manifest.artifacts), 'manifest.json', 'SHA256SUMS', 'verification.json'];
  const listFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'putt-pals-upload-')), 'files.txt');
  fs.writeFileSync(listFile, names.map(name => name + os.EOL).join(''));
  try {
    invoke(rclone, ['copy', dir, destination, '--files-from-raw', listFile, '--immutable']);
    const check = invoke(rclone, ['check', dir, destination, '--download', '--one-way', '--files-from-raw', listFile], { allowFail: true });
    if (check.status !== 0) throw new Error(`Upload verification failed (rclone check --download): ${(check.stderr || check.stdout || '').trim().slice(0, 500)}`);
  } finally { fs.rmSync(path.dirname(listFile), { recursive: true, force: true }); }

  const receipt = {
    schemaVersion: RECEIPT_VERSION, backupId: manifest.backupId, uploadedAt: now.toISOString(),
    destination, verification: 'rclone check --download (uploaded bytes compared with the local files)',
    manifestSha256: sha256File(manifestFile), head: manifest.git.head, branch: manifest.git.branch, workingTreeDigest: manifest.workingTree.digest,
    backupCreatedAt: manifest.createdAt,
  };
  writeJson(path.join(dir, 'receipt.json'), receipt);
  return receipt;
}
