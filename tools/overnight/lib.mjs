/**
 * Shared helpers for the overnight tooling: process and git wrappers, hashing, and the rules that decide which
 * project files are backed up. Credentials are excluded by name and by content scan; matched values are never
 * printed or stored, only the path and the pattern's name.
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const sha256 = data => createHash('sha256').update(data).digest('hex');

export function sha256File(file) {
  const hash = createHash('sha256');
  const fd = fs.openSync(file, 'r');
  const buffer = Buffer.allocUnsafe(1 << 20);
  try {
    for (;;) {
      const n = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (!n) break;
      hash.update(buffer.subarray(0, n));
    }
  } finally { fs.closeSync(fd); }
  return hash.digest('hex');
}

/** Runs a program and returns the spawn result. Throws on a non-zero exit unless allowFail is set. */
export function run(command, args, { cwd, env, input, allowFail = false } = {}) {
  const result = spawnSync(command, args, { cwd, env: env ? { ...process.env, ...env } : process.env, input, encoding: 'utf8', maxBuffer: 1 << 29, windowsHide: true });
  if (result.error && !allowFail) throw result.error;
  if (result.status !== 0 && !allowFail) {
    throw new Error(`${command} ${args.join(' ')} failed (${result.status}): ${(result.stderr || '').trim().slice(0, 500)}`);
  }
  return result;
}

export const git = (root, args, options) => run('git', ['-C', root, '-c', 'core.quotepath=false', ...args], options).stdout;

/** tar with paths relative to `cwd` (a Windows drive letter in -f confuses GNU tar, so --force-local is added for it). */
export function tar(args, cwd, allowFail = false) {
  const gnu = /GNU/.test(run('tar', ['--version'], { allowFail: true }).stdout || '');
  return run('tar', [...(gnu ? ['--force-local'] : []), ...args], { cwd, allowFail });
}

export const EXCLUDED_DIRS = Object.freeze(['node_modules', 'dist', 'release', '.wrangler', '.vite', 'coverage', 'playwright-report', 'test-results']);

const CREDENTIAL_NAME = /(^|\/)(\.env(\.[^/]*)?|\.dev\.vars(\.[^/]*)?|\.npmrc|\.netrc|id_(rsa|dsa|ecdsa|ed25519)(\.pub)?|[^/]*\.(pem|key|p12|pfx|jks|keystore)|settings\.local\.json)$/i;
export const isCredentialName = file => CREDENTIAL_NAME.test(file) && !/\.env\.(example|sample)$/i.test(file);

export function isExcludedDir(file) {
  const parts = file.split('/');
  return EXCLUDED_DIRS.includes(parts[0]) || parts.includes('node_modules');
}

/** Strong secret shapes. A hit aborts the backup, naming the file and pattern only. */
export const SECRET_PATTERNS = Object.freeze([
  ['private key block', /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/],
  ['GitHub token', /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b|\bgithub_pat_[A-Za-z0-9_]{40,}\b/],
  ['AWS access key id', /\bAKIA[0-9A-Z]{16}\b/],
  ['Slack token', /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/],
  ['API key (sk-)', /\bsk-(?:ant-)?[A-Za-z0-9_-]{24,}\b/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
]);

const MAX_SCAN_BYTES = 5 * 1024 * 1024;

/** Names of the secret patterns found in a piece of text (never the matched value). */
export const scanTextForSecrets = text => SECRET_PATTERNS.filter(([, pattern]) => pattern.test(text)).map(([name]) => name);

/** @returns {Array<{path: string, pattern: string}>} */
export function scanForSecrets(root, files) {
  const hits = [];
  for (const file of files) {
    const full = path.join(root, file);
    let stat;
    try { stat = fs.lstatSync(full); } catch { continue; }
    if (!stat.isFile() || stat.size > MAX_SCAN_BYTES) continue;
    const buffer = fs.readFileSync(full);
    if (buffer.subarray(0, 8000).includes(0)) continue;
    for (const pattern of scanTextForSecrets(buffer.toString('utf8'))) hits.push({ path: file, pattern });
  }
  return hits;
}

const nulList = output => output.split('\0').filter(Boolean);

/**
 * Files that belong in a recovery backup: tracked files (with their uncommitted content) and untracked files that are
 * not git-ignored, minus build output, dependencies and credentials.
 */
export function listProjectFiles(root, extraExcludes = []) {
  const tracked = new Set(nulList(git(root, ['ls-files', '-z', '--cached'])));
  const blobs = new Map();
  for (const entry of nulList(git(root, ['ls-files', '-z', '--stage']))) {
    const tab = entry.indexOf('\t');
    blobs.set(entry.slice(tab + 1), entry.slice(0, tab).split(' ')[1]);
  }
  const changed = new Set();
  const status = nulList(git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all']));
  for (let i = 0; i < status.length; i++) {
    const code = status[i].slice(0, 2);
    changed.add(status[i].slice(3));
    if (code[0] === 'R' || code[0] === 'C') i++;
  }
  const everything = new Set([...tracked, ...nulList(git(root, ['ls-files', '-z', '--others', '--exclude-standard']))]);
  const files = [], deleted = [], excludedCredentials = [], excludedExtra = [];
  let excludedDirFiles = 0;
  for (const file of [...everything].sort()) {
    if (file.includes('\n')) throw new Error(`File name contains a newline and cannot be archived safely: ${JSON.stringify(file)}`);
    if (isExcludedDir(file)) { excludedDirFiles++; continue; }
    if (isCredentialName(file)) { excludedCredentials.push(file); continue; }
    if (extraExcludes.includes(file)) { excludedExtra.push(file); continue; }
    let stat;
    try { stat = fs.lstatSync(path.join(root, file)); } catch { stat = null; }
    if (!stat) { if (tracked.has(file)) deleted.push(file); continue; }
    if (!stat.isFile() && !stat.isSymbolicLink()) continue;
    files.push({ path: file, tracked: tracked.has(file), modified: changed.has(file), ...(tracked.has(file) ? { blob: blobs.get(file) } : {}) });
  }
  // Credential-named files that git ignores (for example .env) are not backed up; list them so recovery knows what to re-supply.
  const ignored = nulList(git(root, ['ls-files', '-z', '--others', '--ignored', '--exclude-standard', '--directory']));
  const ignoredCredentials = ignored.filter(file => !file.endsWith('/') && !isExcludedDir(file) && isCredentialName(file));
  return { files, deleted, excluded: { directoryFiles: excludedDirFiles, credentialFiles: [...new Set([...excludedCredentials, ...ignoredCredentials])].sort(), extra: excludedExtra } };
}

/** Order-independent digest of file paths and content hashes; two equal digests mean the same working tree. */
export const workingTreeDigest = files => sha256([...files].sort((a, b) => (a.path < b.path ? -1 : 1)).map(f => `${f.path}\0${f.sha256}\n`).join(''));

/** Hashes every project file and returns the digest, for the backup manifest and for the runner's "unchanged since backup" check. */
export function hashProjectFiles(root, files) {
  const hashed = files.map(f => ({ ...f, ...hashOne(path.join(root, f.path)) }));
  return { files: hashed, digest: workingTreeDigest(hashed) };
}

function hashOne(full) {
  const stat = fs.lstatSync(full);
  if (stat.isSymbolicLink()) return { sha256: sha256('symlink:' + fs.readlinkSync(full)), size: stat.size };
  return { sha256: sha256File(full), size: stat.size };
}

/** Remote URLs may embed credentials; keep only scheme and host. */
export const redactRemote = url => url.replace(/\/\/[^@/\s]+@/, '//***@');

export const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
export const writeJson = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
