/**
 * Recovery backup for overnight work: Git history and every local ref (unpushed commits included), the project's
 * working files with their uncommitted content, untracked non-ignored files, and a manifest with checksums. Then an
 * independent verification that restores everything into a temporary directory and compares it with the manifest.
 *
 * Excluded: dependencies, build output, caches and anything that looks like a credential. Credential-named files that
 * exist are listed by name in the manifest (never their contents), so recovery knows what to re-supply. They are NOT
 * backed up.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EXCLUDED_DIRS, SECRET_PATTERNS, git, hashProjectFiles, listProjectFiles, readJson, redactRemote, run, scanForSecrets, sha256File, tar, writeJson } from './lib.mjs';

export const MANIFEST_VERSION = 1;
const stamp = date => date.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');

/**
 * @param {{root: string, outDir: string, now?: Date, extraExcludes?: string[]}} options
 * @returns {{dir: string, manifest: object}}
 */
export function createBackup({ root, outDir, now = new Date(), extraExcludes = [] }) {
  const head = git(root, ['rev-parse', 'HEAD']).trim();
  const branch = git(root, ['branch', '--show-current']).trim();
  const id = `${stamp(now)}-${head.slice(0, 7)}`;
  const dir = path.join(outDir, id);
  if (fs.existsSync(dir)) throw new Error(`Backup ${id} already exists; backups are never overwritten`);

  const listing = listProjectFiles(root, extraExcludes);
  const secrets = scanForSecrets(root, listing.files.map(f => f.path));
  if (secrets.length) {
    throw new Error('Possible credentials found; nothing was written. Remove them, or pass --exclude <path>:\n' + secrets.map(s => `  ${s.path} (${s.pattern})`).join('\n'));
  }
  fs.mkdirSync(dir, { recursive: true });

  git(root, ['bundle', 'create', path.join(dir, 'repo.bundle'), '--all']);
  const { files, digest } = hashProjectFiles(root, listing.files);
  fs.writeFileSync(path.join(dir, 'files.txt'), files.map(f => f.path).join('\n') + '\n');
  tar(['-czf', 'working-tree.tar.gz', '-C', root, '-T', 'files.txt'], dir);
  fs.writeFileSync(path.join(dir, 'uncommitted.patch'), git(root, ['diff', 'HEAD', '--binary']));

  const refs = git(root, ['for-each-ref', '--format=%(objectname) %(refname)']).trim().split('\n').filter(Boolean).sort();
  const artifacts = Object.fromEntries(['repo.bundle', 'working-tree.tar.gz', 'uncommitted.patch', 'files.txt'].map(name => {
    const file = path.join(dir, name);
    return [name, { sha256: sha256File(file), bytes: fs.statSync(file).size }];
  }));
  const manifest = {
    schemaVersion: MANIFEST_VERSION, backupId: id, createdAt: now.toISOString(), tool: 'tools/overnight/backup.mjs',
    git: {
      branch, head, detached: !branch,
      status: git(root, ['status', '--porcelain=v1', '--untracked-files=all']).split('\n').filter(Boolean),
      stashes: git(root, ['stash', 'list', '--format=%gd %H']).split('\n').filter(Boolean),
      remotes: git(root, ['remote', '-v']).split('\n').filter(Boolean).map(redactRemote),
      refs,
    },
    workingTree: { digest, fileCount: files.length, files: files.map(({ path: p, sha256, size, tracked, modified, blob }) => ({ path: p, sha256, size, tracked, modified, ...(blob ? { blob } : {}) })), deletedTracked: listing.deleted },
    artifacts,
    excluded: {
      directories: EXCLUDED_DIRS, directoryFilesSkipped: listing.excluded.directoryFiles,
      credentialFilesNotBackedUp: listing.excluded.credentialFiles, explicit: listing.excluded.extra,
      contentScanned: SECRET_PATTERNS.map(([name]) => name),
      note: 'Credentials and their values are not backed up and must be re-supplied separately on recovery.',
    },
  };
  writeJson(path.join(dir, 'manifest.json'), manifest);
  fs.writeFileSync(path.join(dir, 'SHA256SUMS'), [...Object.entries(artifacts), ['manifest.json', { sha256: sha256File(path.join(dir, 'manifest.json')) }]].map(([n, a]) => `${a.sha256}  ${n}`).join('\n') + '\n');
  return { dir, manifest };
}

/**
 * Independent verification: artifact checksums, archive integrity, bundle integrity and refs, then a full restore into a
 * temporary directory compared with the manifest. Writes verification.json next to the backup.
 * @returns {{ok: boolean, checks: Array<{name: string, ok: boolean, detail?: string}>}}
 */
export function verifyBackup(dir) {
  const checks = [];
  const check = (name, ok, detail) => { checks.push({ name, ok: !!ok, ...(detail ? { detail } : {}) }); return !!ok; };
  const manifestFile = path.join(dir, 'manifest.json');
  const manifest = readJson(manifestFile);
  check('manifest has the expected version', manifest.schemaVersion === MANIFEST_VERSION);

  for (const [name, meta] of Object.entries(manifest.artifacts)) {
    const file = path.join(dir, name);
    const actual = fs.existsSync(file) ? sha256File(file) : null;
    check(`checksum of ${name}`, actual === meta.sha256, actual ? undefined : 'missing');
  }
  const sums = fs.readFileSync(path.join(dir, 'SHA256SUMS'), 'utf8').trim().split('\n');
  check('SHA256SUMS covers the manifest', sums.includes(`${sha256File(manifestFile)}  manifest.json`));

  const listing = tar(['-tzf', 'working-tree.tar.gz'], dir, true);
  check('archive is readable', listing.status === 0, listing.status === 0 ? undefined : (listing.stderr || '').trim());
  const archived = listing.status === 0 ? listing.stdout.split('\n').filter(Boolean).filter(p => !p.endsWith('/')).sort() : [];
  const expectedPaths = manifest.workingTree.files.map(f => f.path).sort();
  check('archive holds exactly the manifest files', JSON.stringify(archived) === JSON.stringify(expectedPaths), `${archived.length} archived, ${expectedPaths.length} expected`);

  const bundle = path.join(dir, 'repo.bundle');
  const verified = run('git', ['bundle', 'verify', bundle], { allowFail: true });
  check('git bundle verifies', verified.status === 0, verified.status === 0 ? undefined : (verified.stderr || '').trim().slice(0, 300));
  const heads = run('git', ['bundle', 'list-heads', bundle], { allowFail: true }).stdout.split('\n').filter(Boolean).map(l => l.trim());
  const bundled = new Set(heads);
  const missingRefs = manifest.git.refs.filter(ref => ref !== '' && !bundled.has(ref));
  check('bundle holds every local ref (unpushed commits included)', missingRefs.length === 0, missingRefs.length ? `missing: ${missingRefs.join(', ')}` : `${manifest.git.refs.length} refs`);

  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'putt-pals-restore-'));
  try {
    const repo = path.join(temp, 'repo'), work = path.join(temp, 'work');
    fs.mkdirSync(work);
    const clone = run('git', ['-c', 'core.autocrlf=false', 'clone', '--quiet', bundle, repo], { allowFail: true });
    check('history restores from the bundle', clone.status === 0, clone.status === 0 ? undefined : (clone.stderr || '').trim().slice(0, 300));
    if (clone.status === 0) {
      const hasHead = run('git', ['-C', repo, 'cat-file', '-e', `${manifest.git.head}^{commit}`], { allowFail: true }).status === 0;
      check('restored history contains the recorded HEAD', hasHead);
      const fsck = run('git', ['-C', repo, 'fsck', '--connectivity-only', '--no-dangling'], { allowFail: true });
      check('restored history is connected (git fsck)', fsck.status === 0, fsck.status === 0 ? undefined : (fsck.stderr || '').trim().slice(0, 300));
      const restoredBlobs = new Map(git(repo, ['ls-tree', '-r', '-z', manifest.git.head]).split('\0').filter(Boolean).map(e => [e.slice(e.indexOf('\t') + 1), e.split(' ')[2].split('\t')[0]]));
      const wrong = manifest.workingTree.files.filter(f => f.tracked && !f.modified && restoredBlobs.get(f.path) !== f.blob).map(f => f.path);
      check('unmodified tracked files match the restored HEAD exactly', wrong.length === 0, wrong.slice(0, 5).join(', '));
    }
    const extracted = tar(['-xzf', 'working-tree.tar.gz', '-C', work], dir, true);
    check('working tree extracts', extracted.status === 0, extracted.status === 0 ? undefined : (extracted.stderr || '').trim().slice(0, 300));
    const mismatches = [];
    for (const f of manifest.workingTree.files) {
      const file = path.join(work, f.path);
      if (!fs.existsSync(file)) { mismatches.push(`${f.path} (missing)`); continue; }
      if (fs.lstatSync(file).isFile() && sha256File(file) !== f.sha256) mismatches.push(`${f.path} (changed)`);
    }
    check('restored files match the manifest checksums (uncommitted and untracked work included)', mismatches.length === 0, mismatches.slice(0, 5).join(', '));
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }

  const result = { schemaVersion: 1, backupId: manifest.backupId, ok: checks.every(c => c.ok), verifiedAt: new Date().toISOString(), manifestSha256: sha256File(manifestFile), checks };
  writeJson(path.join(dir, 'verification.json'), result);
  return result;
}
