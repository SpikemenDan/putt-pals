#!/usr/bin/env node
/**
 * Enforced budgets for an overnight session.
 *
 * The launcher puts wrapper scripts for `npm`, `npx`, `node` and `gemini` first on the assistant's PATH. Each wrapper runs this
 * guard, which counts the command, refuses it when a budget is spent, runs the real program, and records the result. When a
 * budget is reached the guard writes stop.json; the launcher's watchdog sees it and stops the assistant, so the limit holds even
 * if the assistant ignores the refusal. Every attempt counts, including an identical re-run after a failure (an automatic retry).
 *
 * Counted: commands the assistant starts itself (depth 0). Programs those commands start (for example the `node` processes
 * inside `npm test`) pass straight through and are not counted again.
 *
 * Limit: a program run by its absolute path bypasses the wrappers. The session's own prompt forbids it and the other watchdogs
 * (end time, scope, stall) still apply.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const GUARDED_TOOLS = Object.freeze(['npm', 'npx', 'node', 'gemini']);
export const DEFAULT_LIMITS = Object.freeze({ maxRepeatedFailures: 4, maxTotalFailures: 25, maxGeminiAttempts: 8, maxSolverRuns: 12, maxFullSolverRuns: 2 });
const LIMIT_RANGES = Object.freeze({ maxRepeatedFailures: [1, 20], maxTotalFailures: [1, 200], maxGeminiAttempts: [0, 50], maxSolverRuns: [0, 100], maxFullSolverRuns: [0, 20] });
export const REFUSED_EXIT = 125;

/** Problems with a spec's `limits` (empty when valid). */
export function validateLimits(limits) {
  if (limits === undefined) return [];
  if (!limits || typeof limits !== 'object' || Array.isArray(limits)) return ['limits must be an object'];
  const problems = [];
  for (const [key, value] of Object.entries(limits)) {
    const range = LIMIT_RANGES[key];
    if (!range) problems.push(`unknown limit "${key}" (known: ${Object.keys(LIMIT_RANGES).join(', ')})`);
    else if (!Number.isInteger(value) || value < range[0] || value > range[1]) problems.push(`limits.${key} must be an integer from ${range[0]} to ${range[1]}`);
  }
  return problems;
}

export const resolveLimits = limits => ({ ...DEFAULT_LIMITS, ...(limits ?? {}) });

/** What kind of command this is, for the budgets that apply to it. */
export function classify(tool, args) {
  const line = args.join(' ');
  if (tool === 'gemini') return { kind: 'gemini', full: false };
  const solver = (tool === 'npm' && /^run solve(?:\s|$)/.test(line)) || (tool === 'node' && args.some(a => /(?:^|[\\/])tools[\\/]cli[\\/]main\.mjs$/.test(a)) && args.includes('solve'));
  if (solver) return { kind: 'solver', full: args.includes('--full') };
  return { kind: 'other', full: false };
}

export const signatureOf = (tool, args) => `${tool} ${args.join(' ')}`.trim().slice(0, 300);

const emptyState = () => ({ counters: { commands: 0, gemini: 0, solver: 0, solverFull: 0, totalFailures: 0 }, consecutive: {}, stop: null });

export function loadState(dir) {
  try { return JSON.parse(fs.readFileSync(path.join(dir, 'budget.json'), 'utf8')); } catch { return emptyState(); }
}

const saveState = (dir, state) => fs.writeFileSync(path.join(dir, 'budget.json'), JSON.stringify(state, null, 2) + '\n');

/** Reads the stop request written by the guard, if any. */
export function readStop(dir) {
  try { return JSON.parse(fs.readFileSync(path.join(dir, 'stop.json'), 'utf8')); } catch { return null; }
}

function withLock(dir, fn) {
  const lock = path.join(dir, '.budget.lock');
  const deadline = Date.now() + 10_000;
  for (;;) {
    try { fs.mkdirSync(lock); break; } catch (error) {
      if (error.code !== 'EEXIST' || Date.now() > deadline) { if (error.code === 'EEXIST') { fs.rmSync(lock, { recursive: true, force: true }); continue; } throw error; }
      const until = Date.now() + 20; while (Date.now() < until) { /* brief spin; commands are short */ }
    }
  }
  try { return fn(); } finally { fs.rmSync(lock, { recursive: true, force: true }); }
}

function requestStop(dir, state, limit, detail, command) {
  state.stop = { limit, detail, command, counters: { ...state.counters }, at: new Date().toISOString() };
  fs.writeFileSync(path.join(dir, 'stop.json'), JSON.stringify(state.stop, null, 2) + '\n');
}

/**
 * Called before a command runs. Counts the attempt and decides whether it may run.
 * @returns {{allow: boolean, reason?: string}}
 */
export function beforeRun(dir, limits, tool, args) {
  return withLock(dir, () => {
    const state = loadState(dir);
    const command = signatureOf(tool, args);
    if (state.stop) return { allow: false, reason: `the session is stopping (${state.stop.limit}: ${state.stop.detail}); do not start more commands` };
    const { kind, full } = classify(tool, args);
    const refuse = (limit, detail) => { requestStop(dir, state, limit, detail, command); saveState(dir, state); return { allow: false, reason: `limit reached (${limit}): ${detail}. The session will stop and preserve your work` }; };
    if ((state.consecutive[command] ?? 0) >= limits.maxRepeatedFailures) return refuse('repeated-failures', `"${command}" already failed ${state.consecutive[command]} time(s) in a row`);
    if (kind === 'gemini' && state.counters.gemini >= limits.maxGeminiAttempts) return refuse('gemini-attempts', `${state.counters.gemini} Gemini attempts used of ${limits.maxGeminiAttempts}, retries included`);
    if (kind === 'solver' && full && state.counters.solverFull >= limits.maxFullSolverRuns) return refuse('solver-full-runs', `${state.counters.solverFull} exhaustive solver runs used of ${limits.maxFullSolverRuns}`);
    if (kind === 'solver' && state.counters.solver >= limits.maxSolverRuns) return refuse('solver-runs', `${state.counters.solver} solver runs used of ${limits.maxSolverRuns}`);
    state.counters.commands++;
    if (kind === 'gemini') state.counters.gemini++;
    if (kind === 'solver') { state.counters.solver++; if (full) state.counters.solverFull++; }
    saveState(dir, state);
    return { allow: true };
  });
}

/** Called after a command ran: tracks failures and requests a stop when a failure budget is reached. */
export function afterRun(dir, limits, tool, args, exitCode, milliseconds = 0) {
  return withLock(dir, () => {
    const state = loadState(dir);
    const command = signatureOf(tool, args);
    fs.appendFileSync(path.join(dir, 'commands.jsonl'), JSON.stringify({ at: new Date().toISOString(), command, exitCode, milliseconds }) + '\n');
    if (exitCode === 0) { state.consecutive[command] = 0; saveState(dir, state); return null; }
    state.counters.totalFailures++;
    state.consecutive[command] = (state.consecutive[command] ?? 0) + 1;
    if (!state.stop && state.consecutive[command] >= limits.maxRepeatedFailures) requestStop(dir, state, 'repeated-failures', `"${command}" failed ${state.consecutive[command]} time(s) in a row`, command);
    else if (!state.stop && state.counters.totalFailures >= limits.maxTotalFailures) requestStop(dir, state, 'total-failures', `${state.counters.totalFailures} failed commands in this session`, command);
    saveState(dir, state);
    return state.stop;
  });
}

const quoteForCmd = a => (/[\s"&|<>^%]/.test(a) ? `"${a.replace(/"/g, '""')}"` : a);

/** Finds the real program, skipping the wrapper directory. Tests substitute programs through PUTT_PALS_GUARD_REAL. */
export function resolveReal(tool, env = process.env) {
  if (env.PUTT_PALS_GUARD_REAL) {
    const map = JSON.parse(env.PUTT_PALS_GUARD_REAL);
    if (map[tool]) return { command: map[tool][0], args: map[tool].slice(1), shell: false };
  }
  if (tool === 'node') return { command: process.execPath, args: [], shell: false };
  const pathKey = Object.keys(env).find(k => k.toLowerCase() === 'path') ?? 'PATH';
  const skip = path.resolve(env.PUTT_PALS_GUARD_BIN ?? '\0');
  const names = process.platform === 'win32' ? [`${tool}.cmd`, `${tool}.exe`, `${tool}.bat`, tool] : [tool];
  for (const dir of String(env[pathKey] ?? '').split(path.delimiter).filter(Boolean)) {
    if (path.resolve(dir) === skip) continue;
    for (const name of names) {
      const full = path.join(dir, name);
      if (fs.existsSync(full) && fs.statSync(full).isFile()) return { command: full, args: [], shell: /\.(?:cmd|bat)$/i.test(full) };
    }
  }
  return null;
}

/**
 * Runs `tool args` under the budgets in `dir`. Resolves to the exit code.
 * @param {{tool: string, args: string[], dir: string, limits: object, env?: object}} options
 */
export async function runGuarded({ tool, args, dir, limits, env = process.env }) {
  const real = resolveReal(tool, env);
  if (!real) { console.error(`guard: cannot find the real "${tool}"`); return 127; }
  const nested = Number(env.PUTT_PALS_GUARD_DEPTH ?? 0) > 0;
  const childEnv = { ...env, PUTT_PALS_GUARD_DEPTH: String(Number(env.PUTT_PALS_GUARD_DEPTH ?? 0) + 1) };
  if (!nested) {
    const decision = beforeRun(dir, limits, tool, args);
    if (!decision.allow) { console.error(`guard: refused "${signatureOf(tool, args)}": ${decision.reason}`); return REFUSED_EXIT; }
  } else if (readStop(dir)) { console.error('guard: the session is stopping; not starting more commands'); return REFUSED_EXIT; }
  const started = Date.now();
  const child = real.shell
    ? spawn([real.command, ...real.args, ...args].map(quoteForCmd).join(' '), { env: childEnv, shell: true, stdio: 'inherit', windowsHide: true })
    : spawn(real.command, [...real.args, ...args], { env: childEnv, stdio: 'inherit', windowsHide: true });
  const code = await new Promise(resolve => { child.on('error', error => { console.error(`guard: ${error.message}`); resolve(127); }); child.on('close', c => resolve(c ?? 1)); });
  if (!nested) afterRun(dir, limits, tool, args, code, Date.now() - started);
  return code;
}

/** Writes the wrapper scripts. Windows gets .cmd files (PowerShell, cmd) and extensionless scripts (Git Bash). */
export function writeShims(binDir, guardFile, nodePath = process.execPath) {
  fs.mkdirSync(binDir, { recursive: true });
  for (const tool of GUARDED_TOOLS) {
    fs.writeFileSync(path.join(binDir, tool), `#!/bin/sh\nexec "${nodePath.replace(/\\/g, '/')}" "${guardFile.replace(/\\/g, '/')}" ${tool} "$@"\n`, { mode: 0o755 });
    if (process.platform === 'win32') fs.writeFileSync(path.join(binDir, `${tool}.cmd`), `@echo off\r\n"${nodePath}" "${guardFile}" ${tool} %*\r\n`);
  }
  return binDir;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [tool, ...args] = process.argv.slice(2);
  const dir = process.env.PUTT_PALS_GUARD_DIR;
  if (!tool || !dir) { console.error('guard: run through the overnight launcher'); process.exitCode = 1; }
  else runGuarded({ tool, args, dir, limits: resolveLimits(JSON.parse(process.env.PUTT_PALS_GUARD_LIMITS ?? '{}')) }).then(code => { process.exitCode = code; });
}
