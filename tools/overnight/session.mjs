/**
 * Overnight session launcher: preflight, enforced limits, the assistant process, and the handoff.
 *
 * What the launcher enforces (see docs/OVERNIGHT.md for the full list and what it cannot enforce):
 *  - it refuses to start without a fresh, verified, uploaded recovery backup that matches the current HEAD and working tree;
 *  - it refuses unbounded scope: owned paths, a hard end time (12 h at most), verification commands and permitted operations
 *    are required, and push, merge, deploy, publish, branch deletion, dependency installs and similar operations are rejected;
 *  - the assistant runs with git configured through environment variables only (nothing persistent): hooks block pushes and
 *    merge commits and require "overnight checkpoint" in commit messages, and every remote's push URL is disabled;
 *  - a watchdog stops the assistant at the end time, when it changes files outside the owned paths or switches branch, or when
 *    nothing changes for the stall limit;
 *  - it never restarts: a finished, stopped or crashed session leaves a handoff, and a stale lock must be closed explicitly.
 */

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadState, readStop, resolveLimits, validateLimits, writeShims } from './guard.mjs';
import { git, hashProjectFiles, listProjectFiles, readJson, sha256, sha256File, workingTreeDigest, writeJson } from './lib.mjs';

export const SESSION_VERSION = 1;
export const START_PHRASE = 'Start overnight work';
export const CHECKPOINT_TOKEN = 'overnight checkpoint';
export const MAX_RUNTIME_HOURS = 12;
export const MAX_BACKUP_AGE_MINUTES = 120;
export const ALLOWED_OPERATIONS = Object.freeze(['edit', 'test', 'local-commit', 'gemini-draft']);
export const FORBIDDEN_OPERATIONS = Object.freeze(['push', 'merge', 'deploy', 'publish', 'delete-branch', 'change-credentials', 'provision', 'change-repository-protection', 'install-dependencies', 'upgrade-dependencies']);
const PROTECTED_BRANCHES = ['main', 'master'];
const SAFE_BRANCH = /^[A-Za-z0-9._/-]+$/;

const stamp = date => date.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
const gitDir = root => path.resolve(root, git(root, ['rev-parse', '--git-dir']).trim());
export const overnightDir = root => path.join(gitDir(root), 'putt-pals-overnight');
const lockFile = root => path.join(overnightDir(root), 'lock.json');

const safeRelative = p => typeof p === 'string' && p.trim() !== '' && !path.isAbsolute(p) && !p.split(/[\\/]/).includes('..') && !/^(\.|\*|\*\*|\/)$/.test(p.trim());

/** Problems with a session specification (empty when valid). */
export function validateSessionSpec(spec, now = new Date()) {
  const problems = [];
  if (!spec || typeof spec !== 'object') return ['The session specification must be a JSON object'];
  if (spec.schemaVersion !== SESSION_VERSION) problems.push(`schemaVersion must be ${SESSION_VERSION}`);
  if (typeof spec.contributor !== 'string' || !spec.contributor.trim()) problems.push('contributor is required');
  if (typeof spec.branch !== 'string' || !SAFE_BRANCH.test(spec.branch)) problems.push('branch is required and may only contain letters, digits and ._/-');
  else if (PROTECTED_BRANCHES.includes(spec.branch)) problems.push('overnight work must use a dedicated task branch, never main');
  if (!Array.isArray(spec.tasks) || !spec.tasks.length) problems.push('at least one bounded task is required');
  else spec.tasks.forEach((task, i) => {
    if (!task || typeof task.id !== 'string' || !task.id) problems.push(`task ${i}: id is required`);
    if (!task || typeof task.outcome !== 'string' || !task.outcome.trim()) problems.push(`task ${i}: a concrete outcome is required`);
    if (!task || !Array.isArray(task.ownedPaths) || !task.ownedPaths.length || !task.ownedPaths.every(safeRelative)) problems.push(`task ${i}: ownedPaths must list specific relative paths (not the whole repository)`);
  });
  const end = Date.parse(spec.endTime);
  if (!Number.isFinite(end)) problems.push('endTime must be an ISO date-time');
  else if (end <= now.getTime()) problems.push('endTime is in the past');
  else if (end > now.getTime() + MAX_RUNTIME_HOURS * 3600_000) problems.push(`endTime is more than ${MAX_RUNTIME_HOURS} hours away`);
  if (!Array.isArray(spec.verifyCommands) || !spec.verifyCommands.length || !spec.verifyCommands.every(c => typeof c === 'string' && c.trim())) problems.push('verifyCommands must list at least one command');
  if (!Array.isArray(spec.permittedOperations) || !spec.permittedOperations.length) problems.push('permittedOperations is required');
  else for (const op of spec.permittedOperations) {
    if (FORBIDDEN_OPERATIONS.includes(op)) problems.push(`operation "${op}" is never permitted overnight`);
    else if (!ALLOWED_OPERATIONS.includes(op)) problems.push(`unknown operation "${op}" (allowed: ${ALLOWED_OPERATIONS.join(', ')})`);
  }
  if (spec.otherContributorConfirmed !== true) problems.push('otherContributorConfirmed must be true: the other contributor will not edit the owned paths');
  if (spec.maxStallMinutes !== undefined && !(spec.maxStallMinutes >= 10 && spec.maxStallMinutes <= 480)) problems.push('maxStallMinutes must be between 10 and 480');
  problems.push(...validateLimits(spec.limits));
  if (spec.assistantCommand !== undefined && (!Array.isArray(spec.assistantCommand) || !spec.assistantCommand.every(a => typeof a === 'string'))) problems.push('assistantCommand must be an array of strings');
  return problems;
}

function currentState(root, extraExcludes = []) {
  const listing = listProjectFiles(root, extraExcludes);
  const { files, digest } = hashProjectFiles(root, listing.files);
  return {
    head: git(root, ['rev-parse', 'HEAD']).trim(), branch: git(root, ['branch', '--show-current']).trim(),
    status: git(root, ['status', '--porcelain=v1', '--untracked-files=all']).split('\n').filter(Boolean),
    digest, files: Object.fromEntries(files.map(f => [f.path, f.sha256])),
  };
}

/**
 * Checks everything that must hold before a session may start. Reads only; creates nothing.
 * @returns {{ok: boolean, problems: string[], state?: object}}
 */
export function preflight({ root, spec, backupDir, now = new Date(), confirmPhrase, maxBackupAgeMinutes = MAX_BACKUP_AGE_MINUTES }) {
  const problems = validateSessionSpec(spec, now);
  if (confirmPhrase !== START_PHRASE) problems.push(`a fresh explicit start command is required: pass the exact phrase "${START_PHRASE}"`);
  if (fs.existsSync(lockFile(root))) problems.push('a session lock exists (a session is running, or one ended abnormally); close it with the handoff command first. Sessions never restart automatically');

  let state;
  try { state = currentState(root, backupDir && fs.existsSync(path.join(backupDir, 'manifest.json')) ? readJson(path.join(backupDir, 'manifest.json')).excluded?.explicit ?? [] : []); } catch (error) { problems.push(`cannot read the repository state: ${error.message}`); }
  if (state) {
    if (!state.branch) problems.push('HEAD is detached; check out the task branch for this session');
    else if (spec && spec.branch && state.branch !== spec.branch) problems.push(`the checkout is on "${state.branch}" but the session is for "${spec.branch}"`);
  }

  const receiptFile = backupDir && path.join(backupDir, 'receipt.json');
  if (!receiptFile || !fs.existsSync(receiptFile)) problems.push('no verified Google Drive backup receipt (run backup, verify and upload first)');
  else {
    try {
      const receipt = readJson(receiptFile);
      const manifestFile = path.join(backupDir, 'manifest.json'), verificationFile = path.join(backupDir, 'verification.json');
      if (!fs.existsSync(verificationFile) || readJson(verificationFile).ok !== true) problems.push('the backup is not locally verified');
      if (receipt.manifestSha256 !== sha256File(manifestFile)) problems.push('the backup manifest changed after upload');
      const age = (now.getTime() - Date.parse(receipt.uploadedAt)) / 60_000;
      if (!(age >= 0)) problems.push('the backup receipt is dated in the future');
      else if (age > maxBackupAgeMinutes) problems.push(`the backup is ${Math.round(age)} minutes old (limit ${maxBackupAgeMinutes}); make a fresh one`);
      if (state && receipt.head !== state.head) problems.push('HEAD changed since the backup; make a fresh backup');
      if (state && receipt.workingTreeDigest !== state.digest) problems.push('the working tree changed since the backup; make a fresh backup');
    } catch (error) { problems.push(`cannot read the backup receipt: ${error.message}`); }
  }
  return { ok: problems.length === 0, problems, ...(state ? { state } : {}) };
}

/** Changed paths relative to the state at session start: added, removed or modified project files. */
export function changedSince(root, startFiles, extraExcludes = []) {
  const now = currentState(root, extraExcludes);
  const changed = new Set();
  for (const [file, hash] of Object.entries(now.files)) if (startFiles[file] !== hash) changed.add(file);
  for (const file of Object.keys(startFiles)) if (!(file in now.files)) changed.add(file);
  return { changed: [...changed].sort(), now };
}

export const outsideOwned = (files, ownedPaths) => files.filter(f => !ownedPaths.some(o => { const dir = o.replace(/[\\/]+$/, ''); return f === dir || f.startsWith(dir + '/'); }));

/** Decides whether the watchdog must stop the assistant. */
export function checkSession({ root, session, now = new Date(), lastChangeAt, current }) {
  if (now.getTime() >= Date.parse(session.spec.endTime)) return { stop: 'time-limit' };
  const { changed, now: state } = current ?? changedSince(root, session.start.files, session.start.excluded);
  if (state.branch !== session.spec.branch) return { stop: 'branch-switched', detail: state.branch };
  const owned = session.spec.tasks.flatMap(t => t.ownedPaths);
  const outside = outsideOwned(changed, owned);
  if (outside.length) return { stop: 'scope-violation', detail: outside.slice(0, 10).join(', ') };
  const signature = sha256(state.head + state.digest);
  const stallMs = (session.spec.maxStallMinutes ?? 90) * 60_000;
  if (lastChangeAt && signature === lastChangeAt.signature && now.getTime() - lastChangeAt.at >= stallMs) return { stop: 'stalled' };
  return { stop: null, signature };
}

/** Hooks live in the session directory and are applied to the assistant's git through environment variables only. */
export function writeHooks(dir, branch) {
  const hooks = path.join(dir, 'hooks');
  fs.mkdirSync(hooks, { recursive: true });
  const write = (name, body) => fs.writeFileSync(path.join(hooks, name), '#!/bin/sh\n' + body, { mode: 0o755 });
  const refuse = what => `echo "Overnight session: ${what} is not permitted." >&2\nexit 1\n`;
  write('pre-push', refuse('pushing'));
  write('pre-merge-commit', refuse('merging'));
  write('commit-msg', `grep -qi "${CHECKPOINT_TOKEN}" "$1" || { echo 'Overnight session: commit messages must contain "${CHECKPOINT_TOKEN}".' >&2; exit 1; }\n`);
  write('reference-transaction', `[ "$1" = prepared ] || exit 0
while read old new ref; do
  case "$ref" in
    refs/heads/${branch})
      case "$new" in 0000000000000000000000000000000000000000*) echo "Overnight session: the session's task branch cannot be deleted." >&2; exit 1;; esac;;
    refs/stash|refs/remotes/*|HEAD|ORIG_HEAD|FETCH_HEAD|MERGE_HEAD|CHERRY_PICK_HEAD|REVERT_HEAD|AUTO_MERGE) ;;
    *) echo "Overnight session: updating $ref is not permitted." >&2; exit 1;;
  esac
done
`);
  return hooks;
}

export function gitEnvironment(root, hooksDir, sessionId, spec) {
  const remotes = git(root, ['remote']).split('\n').map(s => s.trim()).filter(Boolean);
  const entries = [['core.hooksPath', hooksDir.replace(/\\/g, '/')], ...remotes.map(r => [`remote.${r}.pushurl`, 'overnight-push-blocked://disabled'])];
  const env = { GIT_CONFIG_COUNT: String(entries.length), PUTT_PALS_OVERNIGHT: sessionId, PUTT_PALS_OVERNIGHT_END: spec.endTime, PUTT_PALS_OVERNIGHT_BRANCH: spec.branch };
  entries.forEach(([key, value], i) => { env[`GIT_CONFIG_KEY_${i}`] = key; env[`GIT_CONFIG_VALUE_${i}`] = value; });
  return env;
}

/** Environment that routes the assistant's npm, npx, node and gemini through the budget guard. */
export function guardEnvironment(dir, spec, baseEnv = process.env) {
  const bin = writeShims(path.join(dir, 'bin'), fileURLToPath(new URL('./guard.mjs', import.meta.url)));
  const pathKey = Object.keys(baseEnv).find(k => k.toLowerCase() === 'path') ?? 'PATH';
  return { [pathKey]: `${bin}${path.delimiter}${baseEnv[pathKey] ?? ''}`, PUTT_PALS_GUARD_DIR: dir, PUTT_PALS_GUARD_BIN: bin, PUTT_PALS_GUARD_LIMITS: JSON.stringify(resolveLimits(spec.limits)) };
}

export function buildPrompt(spec) {
  const limits = resolveLimits(spec.limits);
  const tasks = spec.tasks.map(t => `- ${t.id}: ${t.outcome}\n  Owned paths: ${t.ownedPaths.join(', ')}`).join('\n');
  return `You are running an unattended overnight session for ${spec.contributor} on branch ${spec.branch}. Follow AGENTS.md and CLAUDE.md.

Tasks (stay inside the owned paths):
${tasks}

Permitted: ${spec.permittedOperations.join(', ')}. Local checkpoint commits only; every commit message must contain "${CHECKPOINT_TOKEN}".
Never: push, merge, deploy, publish, delete branches, change credentials, provision services, alter repository protection, install or upgrade dependencies, or expand into other work.
Verification commands to run before finishing: ${spec.verifyCommands.join(' ; ')}
Hard stop at ${spec.endTime}. Stop early on conflicting edits, unclear requirements, or repeated failures without progress, leaving unfinished work committed or in the working tree.
Budgets are enforced by wrappers around npm, npx, node and gemini (every attempt counts, retries included): the same command may fail ${limits.maxRepeatedFailures} times in a row, at most ${limits.maxTotalFailures} commands may fail in total, ${limits.maxGeminiAttempts} Gemini attempts, ${limits.maxSolverRuns} solver runs of which ${limits.maxFullSolverRuns} may use --full. When a budget is reached the session stops and your work is preserved; do not try to get around it, and diagnose a failing command instead of re-running it unchanged.
Visual or feel changes stay pending the owner's preview acceptance. Finish with a brief summary; the launcher writes the handoff.`;
}

/** The default assistant: Claude Code in non-interactive mode with a tool allowlist. Overridable with spec.assistantCommand. */
export function buildAssistantCommand(spec) {
  if (spec.assistantCommand) return spec.assistantCommand;
  return ['claude', '-p', '--permission-mode', 'acceptEdits',
    '--allowedTools', 'Read', 'Grep', 'Glob', 'Edit', 'Write', 'Bash(npm run test:*)', 'Bash(node:*)', 'Bash(git status:*)', 'Bash(git diff:*)', 'Bash(git log:*)', 'Bash(git add:*)', 'Bash(git commit:*)',
    '--disallowedTools', 'Bash(git push:*)', 'Bash(git merge:*)', 'Bash(git branch -D:*)', 'Bash(npm install:*)', 'Bash(npm ci:*)', 'Bash(gh:*)', 'Bash(wrangler:*)', 'Bash(npx wrangler:*)'];
}

function killTree(child) {
  if (!child.pid) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
  else { try { process.kill(-child.pid, 'SIGKILL'); } catch { try { child.kill('SIGKILL'); } catch { /* already gone */ } } }
}

/**
 * Starts the session and blocks until it ends. Never restarts the assistant.
 * @returns {Promise<{id: string, reason: string, handoff: string}>}
 */
export async function startSession({ root, spec, backupDir, confirmPhrase, now = () => new Date(), pollMs = 30_000, verifyTimeoutMs = 20 * 60_000 }) {
  const check = preflight({ root, spec, backupDir, confirmPhrase, now: now() });
  if (!check.ok) throw new Error('Preflight failed:\n  ' + check.problems.join('\n  '));
  const started = now();
  const id = `${stamp(started)}-${spec.branch.replace(/[^A-Za-z0-9]+/g, '-')}`;
  const dir = path.join(overnightDir(root), id);
  fs.mkdirSync(dir, { recursive: true });
  const backup = readJson(path.join(backupDir, 'receipt.json'));
  const excluded = readJson(path.join(backupDir, 'manifest.json')).excluded?.explicit ?? [];
  const session = { schemaVersion: SESSION_VERSION, id, startedAt: started.toISOString(), startPhrase: confirmPhrase, spec, backup: { id: backup.backupId, destination: backup.destination, uploadedAt: backup.uploadedAt },
    start: { head: check.state.head, branch: check.state.branch, status: check.state.status, digest: check.state.digest, files: check.state.files, excluded } };
  writeJson(path.join(dir, 'session.json'), session);
  fs.writeFileSync(lockFile(root), JSON.stringify({ id, startedAt: session.startedAt, endTime: spec.endTime }), { flag: 'wx' });

  const hooks = writeHooks(dir, spec.branch);
  const env = { ...gitEnvironment(root, hooks, id, spec), ...guardEnvironment(dir, spec) };
  const prompt = buildPrompt(spec);
  fs.writeFileSync(path.join(dir, 'prompt.md'), prompt);
  const [command, ...args] = buildAssistantCommand(spec);
  const log = fs.openSync(path.join(dir, 'assistant.log'), 'a');
  let reason = null, exitCode = null, lastChange = { signature: sha256(check.state.head + check.state.digest), at: started.getTime() };

  const child = spawn(command, args, { cwd: root, env: { ...process.env, ...env }, stdio: ['pipe', log, log], detached: process.platform !== 'win32', windowsHide: true });
  const exited = new Promise(resolve => { child.on('exit', code => { exitCode = code; resolve(); }); child.on('error', error => { reason ??= 'failed-to-start'; fs.writeSync(log, `\nlauncher: ${error.message}\n`); resolve(); }); });
  child.stdin.on('error', () => {});
  child.stdin.end(prompt);

  const stop = why => { if (!reason) { reason = why; killTree(child); } };
  const endTimer = setTimeout(() => stop('time-limit'), Math.max(0, Date.parse(spec.endTime) - now().getTime()));
  const watchdog = setInterval(() => {
    try {
      const budget = readStop(dir);
      if (budget) { fs.writeSync(log, `\nlauncher: stopping (limit:${budget.limit}: ${budget.detail})\n`); stop(`limit:${budget.limit}`); return; }
      const verdict = checkSession({ root, session, now: now(), lastChangeAt: lastChange });
      if (verdict.stop) { fs.writeSync(log, `\nlauncher: stopping (${verdict.stop}${verdict.detail ? ': ' + verdict.detail : ''})\n`); stop(verdict.stop); }
      else if (verdict.signature !== lastChange.signature) lastChange = { signature: verdict.signature, at: now().getTime() };
    } catch (error) { fs.writeSync(log, `\nlauncher: watchdog error ${error.message}\n`); }
  }, pollMs);
  await exited;
  clearTimeout(endTimer);
  clearInterval(watchdog);
  fs.closeSync(log);

  const budgetStop = readStop(dir);
  reason ??= budgetStop ? `limit:${budgetStop.limit}` : exitCode === 0 ? 'completed' : 'assistant-failed';
  writeJson(path.join(dir, 'ended.json'), { reason, exitCode, endedAt: now().toISOString() });
  if (reason !== 'completed') writeBlocker({ root, dir, session, reason, now: now() });
  fs.rmSync(lockFile(root), { force: true });
  const results = runVerification(root, spec.verifyCommands, verifyTimeoutMs);
  writeJson(path.join(dir, 'verification-results.json'), results);
  return { id, reason, handoff: writeHandoff({ root, id, now: now() }) };
}

const NEXT_STEPS = {
  'time-limit': ['The end time was reached. Review the handoff, then start a new session (fresh backup and start command) only if more time is wanted.'],
  'scope-violation': ['Files outside the owned paths changed. Review and revert or move them yourself before resuming.'],
  'branch-switched': ['The branch changed during the session. Switch back to the session branch and check the working tree before resuming.'],
  stalled: ['Nothing changed for the stall limit. Read assistant.log for where it was stuck before resuming.'],
  'assistant-failed': ['The assistant process exited with an error. Read assistant.log before resuming.'],
  'failed-to-start': ['The assistant could not be started. Check the assistant command and that it is installed.'],
  'limit:repeated-failures': ['The same command kept failing. Diagnose it by hand (see lastCommands) before any new session; re-running it will not help.'],
  'limit:total-failures': ['Too many commands failed overall. Read lastCommands and assistant.log to find the common cause first.'],
  'limit:gemini-attempts': ['The Gemini attempt budget (retries included) is spent. Continue the remaining drafting directly, or check Gemini availability.'],
  'limit:solver-runs': ['The solver budget is spent. Run any further solver checks yourself, deliberately, outside a session.'],
  'limit:solver-full-runs': ['The exhaustive solver budget is spent. Run the --full sweep yourself, deliberately, outside a session.'],
};

/** Records why a session stopped early and where to pick up. Preserves work: nothing is committed, reset or removed. */
export function writeBlocker({ root, dir, session, reason, now = new Date() }) {
  const stop = readStop(dir);
  const state = loadState(dir);
  const lines = (() => { try { return fs.readFileSync(path.join(dir, 'commands.jsonl'), 'utf8').trim().split('\n').filter(Boolean).slice(-10).map(l => JSON.parse(l)); } catch { return []; } })();
  const head = git(root, ['rev-parse', 'HEAD']).trim();
  const blocker = {
    schemaVersion: 1, sessionId: session.id, reason, at: now.toISOString(),
    ...(stop ? { limit: stop.limit, detail: stop.detail, command: stop.command } : {}),
    counters: state.counters, limits: resolveLimits(session.spec.limits),
    resumePoint: {
      branch: git(root, ['branch', '--show-current']).trim(), startHead: session.start.head, head, lastCommit: git(root, ['log', '-1', '--format=%h %s']).trim(),
      uncommittedPaths: git(root, ['status', '--porcelain=v1', '--untracked-files=all']).split('\n').filter(Boolean),
      tasks: session.spec.tasks.map(t => ({ id: t.id, outcome: t.outcome, ownedPaths: t.ownedPaths })),
      nextSteps: [...(NEXT_STEPS[reason] ?? ['Read assistant.log and the handoff before resuming.']), 'Work in progress is preserved exactly as it was; nothing was committed, reset or deleted by the launcher.'],
    },
    lastCommands: lines,
  };
  writeJson(path.join(dir, 'blocker.json'), blocker);
  return blocker;
}

function runVerification(root, commands, timeout) {
  return commands.map(command => {
    const started = Date.now();
    const r = spawnSync(command, { cwd: root, shell: true, encoding: 'utf8', timeout, maxBuffer: 1 << 26, windowsHide: true });
    const output = ((r.stdout || '') + (r.stderr || '')).trim();
    return { command, exitCode: r.status, timedOut: r.error?.code === 'ETIMEDOUT', seconds: Math.round((Date.now() - started) / 1000), outputTail: output.slice(-1500) };
  });
}

/** Closes a session that did not end cleanly (crash, power loss) without running anything. Never restarts it. */
export function abandonSession({ root, now = new Date() }) {
  const file = lockFile(root);
  if (!fs.existsSync(file)) throw new Error('No session lock to close');
  const { id } = readJson(file);
  const dir = path.join(overnightDir(root), id);
  writeJson(path.join(dir, 'ended.json'), { reason: 'abandoned', exitCode: null, endedAt: now.toISOString() });
  fs.rmSync(file, { force: true });
  return { id, handoff: writeHandoff({ root, id, now }) };
}

/** Summarizes what a session changed, from Git and the session record. Writes handoff.md and handoff.json in the session directory. */
export function writeHandoff({ root, id, now = new Date() }) {
  const dir = path.join(overnightDir(root), id);
  const session = readJson(path.join(dir, 'session.json'));
  const ended = fs.existsSync(path.join(dir, 'ended.json')) ? readJson(path.join(dir, 'ended.json')) : { reason: 'unknown' };
  const verification = fs.existsSync(path.join(dir, 'verification-results.json')) ? readJson(path.join(dir, 'verification-results.json')) : null;
  const { changed, now: state } = changedSince(root, session.start.files, session.start.excluded);
  const owned = session.spec.tasks.flatMap(t => t.ownedPaths);
  const log = git(root, ['log', '--format=%H%x09%s', `${session.start.head}..HEAD`]).split('\n').filter(Boolean).map(line => {
    const [hash, subject] = line.split('\t');
    return { hash, subject, labeledCheckpoint: subject.toLowerCase().includes(CHECKPOINT_TOKEN), files: git(root, ['show', '--name-only', '--format=', hash]).split('\n').filter(Boolean) };
  });
  const committedOutside = outsideOwned([...new Set(log.flatMap(c => c.files))], owned);
  const blocker = fs.existsSync(path.join(dir, 'blocker.json')) ? readJson(path.join(dir, 'blocker.json')) : null;
  const handoff = {
    schemaVersion: 1, sessionId: id, blocker, contributor: session.spec.contributor, branch: session.spec.branch, startedAt: session.startedAt, endedAt: ended.endedAt ?? now.toISOString(),
    endReason: ended.reason, backup: session.backup, startHead: session.start.head, endHead: state.head, commits: log,
    unlabeledCommits: log.filter(c => !c.labeledCheckpoint).map(c => c.hash),
    changedSinceStart: changed, outsideOwnedPaths: outsideOwned(changed, owned), committedOutsideOwnedPaths: committedOutside,
    uncommittedPaths: state.status, verification: verification ?? 'not run (session closed without verification)',
    notes: ['Visual or feel changes remain pending the owner\'s preview acceptance.', 'Nothing was pushed, merged or deployed by the launcher; the assistant\'s git was configured to refuse pushes and merge commits.'],
  };
  writeJson(path.join(dir, 'handoff.json'), handoff);
  const md = [
    `# Overnight handoff ${id}`, '', `- Contributor: ${handoff.contributor}, branch \`${handoff.branch}\``, `- Ended: ${handoff.endedAt} (${handoff.endReason})`, `- Backup: ${handoff.backup.id} at ${handoff.backup.destination}`,
    `- Start HEAD ${handoff.startHead.slice(0, 7)}, end HEAD ${handoff.endHead.slice(0, 7)}`, '', `## Commits (${log.length})`, ...log.map(c => `- ${c.hash.slice(0, 7)} ${c.subject}${c.labeledCheckpoint ? '' : '  (NOT labeled as an overnight checkpoint)'}`), '',
    ...(blocker ? ['## Blocker and resume point', `- Stopped by: ${blocker.reason}${blocker.detail ? ` (${blocker.detail})` : ''}`, `- Resume on \`${blocker.resumePoint.branch}\` at ${blocker.resumePoint.lastCommit}; uncommitted paths: ${blocker.resumePoint.uncommittedPaths.length}`, ...blocker.resumePoint.nextSteps.map(n => `- ${n}`), `- Budgets used: ${blocker.counters.commands} commands, ${blocker.counters.totalFailures} failures, ${blocker.counters.gemini} Gemini attempts, ${blocker.counters.solver} solver runs (${blocker.counters.solverFull} full)`, ''] : []),
    '## Scope', handoff.outsideOwnedPaths.length ? `Changed outside the owned paths: ${handoff.outsideOwnedPaths.join(', ')}` : 'All changes are inside the owned paths.', '',
    '## Uncommitted', ...(handoff.uncommittedPaths.length ? handoff.uncommittedPaths.map(l => `- ${l}`) : ['- none']), '', '## Verification',
    ...(Array.isArray(verification) ? verification.map(v => `- ${v.exitCode === 0 ? 'PASS' : v.timedOut ? 'TIMED OUT' : 'FAIL'} \`${v.command}\` (${v.seconds}s)`) : ['- not run']), '', ...handoff.notes.map(n => `> ${n}`), '',
  ].join('\n');
  fs.writeFileSync(path.join(dir, 'handoff.md'), md);
  return path.join(dir, 'handoff.md');
}
