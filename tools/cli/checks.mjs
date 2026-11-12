/**
 * `checks`: recommends which existing verification commands to run for a set of changed paths, and why.
 *
 * Nothing here is a second list of what depends on what. The mapping is derived from the repository itself:
 *  - which test files each npm script runs comes from package.json;
 *  - which files each test file (and the app build) reaches comes from the import graph of the working tree, including
 *    dynamic import(), require() and the path literals tests use to read fixtures;
 *  - RULES below covers only what imports cannot show (dependency and build configuration, deployment configuration,
 *    documentation) and the fingerprint note for the simulation's import closure (tools/cli/provenance.mjs).
 * A path that no script reaches and no rule covers gets the conservative fallback: the full suite. Nothing is skipped
 * silently. CI is unchanged and still runs everything before merge; this is for choosing local checks while iterating.
 */
// checks:ignore-path-literals (this file names repository paths as data, so they must not become import edges)

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { simulationSourceFiles } from './provenance.mjs';

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const CODE = /\.(?:js|mjs|cjs|jsx)$/;
const GRAPH_EXTENSIONS = ['', '.js', '.mjs', '.cjs', '.jsx', '.json', '.css'];
const STATIC_IMPORT = /^\s*(?:import|export)\b[^'"]*?['"](\.{1,2}\/[^'"]+)['"]/gm;
// Specifiers and path literals: './x.js', '../src/x.js', 'src/x.js', 'fixtures/x.json'. Matches anywhere in a code file.
const PATH_LITERAL = /(['"`])((?:\.{1,2}\/)?(?:[\w@.-]+\/)+[\w@.-]+\.(?:js|mjs|cjs|jsx|json|css|html|png|txt))\1/g;

/** Commands the mapping may recommend, in the order they are run in the full suite, then the ones the suite does not run. */
const SUITE_TAIL = ['test:rooms:local', 'test:browser'];

export function git(root, args) {
  const result = spawnSync('git', ['-C', root, '-c', 'core.quotepath=false', ...args], { encoding: 'utf8', maxBuffer: 1 << 28 });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${(result.stderr || '').trim()}`);
  return result.stdout;
}

const nul = out => out.split('\0').filter(Boolean);

export const listRepoFiles = root => nul(git(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard'])).filter(f => fs.existsSync(path.join(root, f)));

/**
 * Paths changed relative to `base` (merge-base form), plus staged, unstaged and untracked work.
 * @param {string} root
 * @param {string} [base] defaults to origin/main, then main
 */
export function changedFiles(root, base) {
  const ref = base ?? ['origin/main', 'main'].find(r => spawnSync('git', ['-C', root, 'rev-parse', '--verify', '--quiet', r]).status === 0);
  const files = new Set();
  if (ref) for (const f of nul(git(root, ['diff', '--name-only', '--no-renames', '-z', `${ref}...HEAD`]))) files.add(f);
  for (const f of nul(git(root, ['diff', '--name-only', '--no-renames', '-z', 'HEAD']))) files.add(f);
  for (const f of nul(git(root, ['ls-files', '-z', '--others', '--exclude-standard']))) files.add(f);
  return { base: ref ?? null, files: [...files].sort() };
}

/** Import graph of the working tree: file -> files it reaches directly. */
export function buildGraph(root, files) {
  const known = new Set(files);
  const resolveFrom = (from, specifier) => {
    const dir = path.posix.dirname(from);
    const candidates = [path.posix.normalize(path.posix.join(dir, specifier)), path.posix.normalize(specifier)];
    for (const base of candidates) for (const ext of GRAPH_EXTENSIONS) if (known.has(base + ext)) return base + ext;
    return null;
  };
  const graph = new Map();
  for (const file of files) {
    const edges = new Set();
    if (CODE.test(file)) {
      const source = fs.readFileSync(path.join(root, file), 'utf8');
      for (const m of source.matchAll(STATIC_IMPORT)) { const t = resolveFrom(file, m[1]); if (t && t !== file) edges.add(t); }
      if (!source.includes('checks:ignore-path-literals')) for (const m of source.matchAll(PATH_LITERAL)) { const t = resolveFrom(file, m[2]); if (t && t !== file) edges.add(t); }
      for (const m of source.matchAll(/(?:import|require)\(\s*(['"`])(\.{1,2}\/[^'"`]+)\1\s*\)/g)) { const t = resolveFrom(file, m[2]); if (t && t !== file) edges.add(t); }
    }
    graph.set(file, edges);
  }
  return graph;
}

/** Breadth-first closure from entry files; returns file -> chain of files from an entry to it. */
export function reach(graph, entries) {
  const chains = new Map();
  const queue = [];
  for (const e of entries) if (graph.has(e) && !chains.has(e)) { chains.set(e, [e]); queue.push(e); }
  while (queue.length) {
    const file = queue.shift();
    for (const next of graph.get(file) ?? []) if (!chains.has(next)) { chains.set(next, [...chains.get(file), next]); queue.push(next); }
  }
  return chains;
}

/**
 * Entry files per verification script, from package.json. Scripts without a recognizable entry are reported in `unparsed`
 * so a new script cannot silently drop out of the mapping.
 */
export function scriptEntries(root, files, pkg) {
  const scripts = pkg.scripts ?? {};
  const relevant = Object.keys(scripts).filter(n => n === 'check' || n === 'build' || n.startsWith('test:'));
  const entries = {}, unparsed = [];
  const appEntry = ['src/app/main.js'].filter(f => files.includes(f));
  // A script that runs `npm run build` first (test:rooms:local) depends on the build configuration but does not exercise the app
  // bundle, so a nested build contributes only its configuration files.
  const resolveScript = (name, seen = new Set(), nested = false) => {
    if (seen.has(name)) return [];
    seen.add(name);
    const out = [];
    for (const part of String(scripts[name] ?? '').split('&&').map(s => s.trim())) {
      let m;
      if ((m = part.match(/^node\s+(\S+)/)) && files.includes(m[1])) out.push(m[1]);
      else if ((m = part.match(/^npm run (\S+)/))) out.push(...resolveScript(m[1], seen, true));
      else if (/^vite build/.test(part)) out.push(...(nested ? [] : appEntry), ...files.filter(f => /^vite\.config.*\.mjs$/.test(f)), 'index.html');
      else if (/^playwright test/.test(part)) out.push(...appEntry, 'playwright.config.cjs', ...files.filter(f => /^tests\/browser\/.+\.spec\.cjs$/.test(f)));
    }
    return out.filter(f => files.includes(f));
  };
  for (const name of relevant) {
    const found = [...new Set(resolveScript(name))];
    if (found.length) entries[name] = found; else unparsed.push(name);
  }
  return { entries, unparsed, scripts };
}

/** Order the full suite runs its checks in (the `test` script), then build, then the checks CI runs outside `npm test`. */
export function suiteOrder(pkg, available) {
  const fromTest = [...String(pkg.scripts?.test ?? '').matchAll(/npm run (\S+)/g)].map(m => m[1]);
  const ordered = [...fromTest, 'build', ...SUITE_TAIL];
  return [...new Set(ordered)].filter(n => available.includes(n));
}

/** What imports cannot show. First matching rule decides; `scripts: 'all'` means the full suite. */
export const RULES = [
  { test: f => f === 'package.json' || f === 'package-lock.json' || f === 'src/package.json', scripts: 'all', reason: 'dependency or script change: any suite and the build can be affected' },
  { test: f => /^vite\.config.*\.mjs$/.test(f) || f === 'index.html' || f.startsWith('public/') || f === 'scripts/check-build.cjs', scripts: ['build', 'test:rooms:local'], reason: 'build configuration or served assets: the build and the Worker runtime that serves it' },
  { test: f => f === 'wrangler.jsonc' || f.startsWith('services/') || f === 'scripts/prepare-cloudflare-preview.mjs', scripts: ['test:rooms:local'], reason: 'Worker and room runtime configuration' },
  { test: f => f === 'playwright.config.cjs' || f.startsWith('tests/browser/'), scripts: ['test:browser'], reason: 'real-browser suite configuration' },
  { test: f => f.startsWith('tools/overnight/'), scripts: ['test:overnight'], reason: 'overnight tooling (the CLI entry is not imported by its tests)' },
  { test: f => f === 'tools/gaia/import-azgaar.mjs', scripts: ['test:ui'], reason: 'run by hand; writes src/shared/gaia-reference.js, which the map tests read' },
  { test: f => /^src\/ui\/fonts\/.*\.(?:otf|ttf|woff2?)$/.test(f), scripts: ['build'], reason: 'font file, reached only through a stylesheet' },
  { test: f => f.startsWith('.github/'), scripts: [], note: 'CI or template change: nothing runs locally; confirm on the PR\'s CI run', reason: 'GitHub configuration' },
  { test: f => f.startsWith('prototypes/'), scripts: [], note: 'isolated prototype with its own package; no suite covers it', reason: 'prototype' },
  { test: f => f === 'scripts/make-portable.cjs', scripts: [], note: 'only build:portable runs this, and that distribution path is unverified', reason: 'portable build helper' },
  { test: f => /\.(?:md|txt)$/i.test(f) || f.startsWith('docs/') || ['.gitattributes', '.gitignore'].includes(f), docsOnly: true, scripts: [], note: 'documentation: no suite covers it; verify links, paths and commands (AGENTS.md, "Verification")', reason: 'documentation or repository metadata' },
];

/** Applied only to a path nothing else covers: reference or manual material that no suite reads. */
export const LAST_RESORT = [
  { test: f => /^src\/devtools\/[a-z-]+-preview\.js$/.test(f), note: 'development-only interactive chamber: exercise its controls and inspect browser errors manually' },
  { test: f => f.startsWith('tests/fixtures/') || f.startsWith('tests/render/') || /^tests\/(?:measure-cup-capture|cup-capture-browser)\.mjs$/.test(f), note: 'manual measurement tool or recorded reference material that no suite reads' },
];

const unique = list => [...new Set(list)];

/** True when the path of any changed file occurs as text in a code file of the working tree. */
export function referencedByCode(root, files, changed) {
  const sources = files.filter(f => CODE.test(f)).map(f => fs.readFileSync(path.join(root, f), 'utf8'));
  return changed.some(c => sources.some(src => src.includes(c)));
}

/**
 * @param {{root?: string, changed: string[], files?: string[], pkg?: object}} options
 * @returns {{commands: Array<{script: string, command: string, reasons: Array<{file: string, why: string}>}>, notes: string[], unknown: string[], fallback: boolean}}
 */
export function selectChecks({ root = defaultRoot, changed, files = listRepoFiles(root), pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) }) {
  const graph = buildGraph(root, files);
  const { entries, unparsed } = scriptEntries(root, files, pkg);
  const reachable = Object.fromEntries(Object.entries(entries).map(([name, list]) => [name, reach(graph, list)]));
  const available = Object.keys(entries);
  const hits = new Map(); // script -> reasons
  const add = (script, file, why) => { if (!hits.has(script)) hits.set(script, []); hits.get(script).push({ file, why }); };
  const notes = [];
  const unknown = [];
  let nonDocs = false; // a changed path outside the documentation rule
  const simulation = new Set(simulationSourceFiles());
  let all = false;

  for (const file of changed) {
    let covered = false;
    const rule = RULES.find(r => r.test(file));
    if (!rule?.docsOnly) nonDocs = true;
    if (rule) {
      covered = true;
      if (rule.scripts === 'all') { all = true; add('*', file, rule.reason); }
      else for (const s of rule.scripts) if (available.includes(s)) add(s, file, rule.reason);
      if (rule.note) notes.push(`${file}: ${rule.note}`);
    }
    for (const name of available) {
      const chain = reachable[name].get(file);
      if (chain) {
        covered = true;
        add(name, file, chain.length === 1 ? 'is run or built by this script' : `imported by ${chain.at(-2)}, reached from ${chain[0]}`);
      }
    }
    if (simulation.has(file)) {
      notes.push(`${file}: in the simulation's import closure, so simulationSha256 fixtures may need regeneration; follow docs/GITHUB_WORKFLOW.md ("Merging changes to simulation fingerprints") and re-run the affected solver and acceptance checks`);
      covered = true;
    }
    if (!covered) {
      const late = LAST_RESORT.find(r => r.test(file));
      if (late) notes.push(`${file}: ${late.note}`); else unknown.push(file);
    }
  }

  const fallback = unknown.length > 0 || unparsed.length > 0 || all;
  if (unparsed.length) notes.push(`package.json scripts the mapping cannot read (${unparsed.join(', ')}); treat as unmapped and run the full suite`);
  let scripts;
  if (fallback) scripts = suiteOrder(pkg, available).filter(n => n !== 'test:browser' && n !== 'test:rooms:local');
  else scripts = suiteOrder(pkg, available).filter(n => hits.has(n));
  if (fallback) for (const s of ['test:rooms:local', 'test:browser']) if (hits.has(s) && !scripts.includes(s)) scripts.push(s);

  const reasons = script => hits.get(script) ?? (fallback ? [{ file: '(fallback)', why: all ? 'a change that can affect every suite' : 'a changed path has no mapping, so the full suite is recommended' }] : []);
  const commands = scripts.map(script => ({ script, command: script === 'build' ? 'npm run build' : `npm run ${script}`, reasons: reasons(script) }));
  // Documentation only (used by CI to skip the heavy steps): something changed, every changed path is documentation or
  // repository metadata, no script reaches any of them (a test may read a docs file) and nothing needed the fallback.
  // A documentation file whose path appears in any code file is treated as an input to that code (a test may assert on its
  // text), so it is not documentation only.
  const docsOnly = changed.length > 0 && !nonDocs && !fallback && commands.length === 0 && unknown.length === 0 && !referencedByCode(root, files, changed);
  return { commands, notes: unique(notes), unknown, fallback, docsOnly };
}

export function formatReport({ base, changed, result }) {
  const lines = [`Changed paths: ${changed.length}${base ? ` (against ${base})` : ''}`];
  if (!changed.length) return [...lines, 'Nothing changed, so no checks are needed.'];
  if (result.fallback) lines.push(result.unknown.length ? `Conservative fallback: ${result.unknown.length} path(s) have no mapping, so the full suite is recommended.` : 'Conservative fallback: this change can affect every suite.');
  if (!result.commands.length) lines.push('No test suite covers these paths.');
  else if (result.fallback) lines.push('', 'Run the full suite: `npm test` (several minutes) and `npm run build`.', 'Checks with a specific reason for your changes:');
  else lines.push('', 'Recommended, in the order the full suite runs them:');
  for (const c of result.commands) {
    if (result.fallback && c.reasons.every(r => r.file === '(fallback)')) continue;
    lines.push(`  ${c.command}`);
    const shown = c.reasons.slice(0, 3);
    for (const r of shown) lines.push(`      ${r.file}: ${r.why}`);
    if (c.reasons.length > shown.length) lines.push(`      ... and ${c.reasons.length - shown.length} more changed path(s)`);
  }
  if (result.unknown.length) lines.push('', 'Unmapped paths:', ...result.unknown.slice(0, 10).map(f => `  ${f}`), ...(result.unknown.length > 10 ? [`  ... and ${result.unknown.length - 10} more`] : []));
  if (result.notes.length) lines.push('', 'Also:', ...result.notes.slice(0, 8).map(n => `  ${n}`));
  lines.push('', 'CI runs the full suite and the real-browser checks before merge; this list is for choosing local checks while you iterate.');
  return lines;
}

/** CLI entry: `checks [--since <ref>] [--json] [--docs-only] [paths...]`. `--docs-only` prints `docs-only=true|false` for CI. Explicit paths replace the git-derived list. */
export function runChecks(argv, root = defaultRoot) {
  let since, json = false, docsOnlyMode = false;
  const explicit = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--since') since = argv[++i];
    else if (argv[i] === '--json') json = true;
    else if (argv[i] === '--docs-only') docsOnlyMode = true;
    else if (argv[i].startsWith('--')) return { code: 1, lines: [`ERROR: unknown option ${argv[i]}`, 'Usage: checks [--since <ref>] [--json] [--docs-only] [paths...]'] };
    else explicit.push(argv[i].replace(/\\/g, '/'));
  }
  if (since === undefined && argv.includes('--since')) return { code: 1, lines: ['ERROR: --since requires a ref'] };
  const derived = explicit.length ? { base: null, files: explicit } : changedFiles(root, since);
  const result = selectChecks({ root, changed: derived.files });
  if (docsOnlyMode) return { code: 0, lines: [`docs-only=${result.docsOnly}`] };
  if (json) return { code: 0, lines: [JSON.stringify({ base: derived.base, changed: derived.files, ...result }, null, 2)] };
  return { code: 0, lines: formatReport({ base: derived.base, changed: derived.files, result }) };
}
