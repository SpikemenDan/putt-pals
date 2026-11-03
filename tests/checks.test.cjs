// `checks` (tools/cli/checks.mjs): the changed-path to verification mapping. Uses the real repository for the mapping itself and
// a temporary git repository for the changed-path discovery.
// checks:ignore-path-literals (this test names repository paths as data, so they must not become import edges)
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
let passed = 0;
async function scenario(name, fn) { await fn(); passed++; console.log('PASS ' + name); }
const sh = (cwd, ...args) => { const r = spawnSync('git', args, { cwd, encoding: 'utf8' }); if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`); return r.stdout.trim(); };

(async () => {
  const checks = await import(pathToFileURL(path.join(root, 'tools/cli/checks.mjs')).href);
  const files = checks.listRepoFiles(root);
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const pick = changed => checks.selectChecks({ root, changed, files, pkg });
  const names = result => result.commands.map(c => c.script);

  await scenario('mapping: an app source file selects the suites that import it and the build, with the import chain as the reason', async () => {
    const result = pick(['src/render/actors.js']);
    assert.equal(result.fallback, false);
    for (const wanted of ['test:render', 'test:ui', 'test:app', 'build', 'test:browser']) assert.ok(names(result).includes(wanted), wanted);
    for (const unwanted of ['test:audio', 'test:network', 'test:overnight', 'test:rooms:local']) assert.ok(!names(result).includes(unwanted), `${unwanted} is unrelated to a renderer file`);
    const ui = result.commands.find(c => c.script === 'test:ui').reasons[0];
    assert.equal(ui.file, 'src/render/actors.js');
    assert.match(ui.why, /imported by src\/render\/renderer\.js, reached from tests\/ui\.test\.cjs/);
    // Suite order is the order `npm test` runs them in.
    const order = names(result);
    assert.ok(order.indexOf('test:render') < order.indexOf('test:ui') && order.indexOf('test:ui') < order.indexOf('test:app') && order.indexOf('test:app') < order.indexOf('build'));
  });

  await scenario('mapping: shared configuration and simulation files fan out widely and carry the fingerprint note', async () => {
    for (const file of ['src/shared/tuning.js', 'src/simulation/physics.js']) {
      const result = pick([file]);
      for (const wanted of ['check', 'test:simulation', 'test:physics', 'test:cli', 'test:courses', 'test:session', 'build', 'test:rooms:local']) assert.ok(names(result).includes(wanted), `${file} -> ${wanted}`);
      if (file.endsWith('tuning.js')) assert.ok(names(result).includes('test:input'), 'aiming reads tuning, so input checks apply to it but not to physics.js');
      else assert.ok(!names(result).includes('test:input'), 'input tests do not import the physics module');
      assert.ok(result.notes.some(n => n.startsWith(`${file}: in the simulation's import closure`) && /simulationSha256/.test(n)), `${file} fingerprint note`);
    }
    // A presentation-only file is not in the simulation closure.
    assert.ok(!pick(['src/shared/display.js']).notes.some(n => /simulationSha256/.test(n)));
  });

  await scenario('mapping: files outside the import graph are covered by rules (dependencies, build, rooms, browser, overnight)', async () => {
    const everything = names(pick(['package.json']));
    assert.equal(pick(['package.json']).fallback, true);
    for (const wanted of ['check', 'test:contracts', 'test:overnight', 'build']) assert.ok(everything.includes(wanted), `package.json -> ${wanted}`);
    assert.deepEqual(names(pick(['package-lock.json'])).slice(0, 2), ['check', 'test:contracts']);
    assert.ok(names(pick(['vite.config.mjs'])).includes('build') && names(pick(['vite.config.mjs'])).includes('test:rooms:local'));
    assert.ok(names(pick(['services/rooms/worker.mjs'])).includes('test:rooms:local') && !names(pick(['services/rooms/worker.mjs'])).includes('test:render'));
    assert.deepEqual(names(pick(['wrangler.jsonc'])), ['test:rooms:local']);
    assert.ok(names(pick(['playwright.config.cjs'])).includes('test:browser'));
    assert.deepEqual(names(pick(['tools/overnight/main.mjs'])), ['test:overnight']);
    assert.ok(names(pick(['tests/fixtures/legacy-reference/data.json'])).includes('test:courses'), 'fixtures reach the tests that read them');
    assert.ok(names(pick(['src/devtools/panel.js'])).includes('test:contracts'));
  });

  await scenario('mapping: documentation, CI and manual material produce notes, not silence and not a false full-suite fallback', async () => {
    const docs = pick(['README.md', 'docs/DISPLAY.md', 'docs/screenshots/m1a-ring-ready.png']);
    assert.deepEqual(docs.commands, []);
    assert.equal(docs.fallback, false);
    assert.ok(docs.notes.some(n => /verify links, paths and commands/.test(n)));
    const ci = pick(['.github/workflows/ci.yml']);
    assert.deepEqual(ci.commands, []);
    assert.ok(ci.notes.some(n => /confirm on the PR's CI run/.test(n)));
    const manual = pick(['tests/measure-cup-capture.mjs', 'tests/fixtures/browser-baseline/01-landing.jpg']);
    assert.equal(manual.fallback, false);
    assert.ok(manual.notes.length >= 2);
  });

  await scenario('fallback: an unknown path, a deleted file or an unreadable script gets the full suite, never silence', async () => {
    const unknown = pick(['totally/new/area.xyz', 'README.md']);
    assert.equal(unknown.fallback, true);
    assert.deepEqual(unknown.unknown, ['totally/new/area.xyz']);
    for (const wanted of ['check', 'test:contracts', 'test:simulation', 'test:app', 'test:cli', 'build']) assert.ok(names(unknown).includes(wanted), wanted);
    const deleted = pick(['src/render/removed-long-ago.js']);
    assert.equal(deleted.fallback, true);
    assert.deepEqual(deleted.unknown, ['src/render/removed-long-ago.js']);
    const weird = checks.selectChecks({ root, changed: ['README.md'], files, pkg: { ...pkg, scripts: { ...pkg.scripts, 'test:weird': 'echo not a recognizable entry' } } });
    assert.equal(weird.fallback, true);
    assert.ok(weird.notes.some(n => /test:weird/.test(n)));
    const report = checks.formatReport({ base: 'origin/main', changed: ['totally/new/area.xyz'], result: unknown }).join('\n');
    assert.match(report, /Conservative fallback: 1 path\(s\) have no mapping/);
    assert.match(report, /npm test/);
    assert.match(report, /totally\/new\/area\.xyz/);
    assert.match(report, /CI runs the full suite/);
  });

  await scenario('staleness guards: every verification script is readable and every tracked source, tool, service, script and test file is mapped', async () => {
    const { entries, unparsed } = checks.scriptEntries(root, files, pkg);
    assert.deepEqual(unparsed, [], 'every check/build/test:* script has an entry file the mapping can follow');
    for (const name of ['check', 'build', 'test:render', 'test:rooms:local', 'test:browser', 'test:overnight']) assert.ok(entries[name]?.length, name);
    const code = files.filter(f => /^(?:src|tools|services|scripts|tests)\//.test(f));
    const result = pick(code);
    // If this fails, a new kind of file is not reached by any script or covered by a rule in tools/cli/checks.mjs.
    assert.deepEqual(result.unknown, [], 'unmapped files: add a test that reaches them, or a rule in tools/cli/checks.mjs');
    // The mapping is derived, so a new test file is picked up as soon as a script runs it.
    assert.ok(names(pick(['tests/checks.test.cjs'])).includes('test:cli'), 'this test is itself part of test:cli');
  });

  await scenario('changed paths: committed, staged, unstaged, untracked and deleted work relative to the base are all found', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'putt-pals-checks-'));
    try {
      sh(dir, 'init', '-q', '-b', 'main');
      sh(dir, 'config', 'user.email', 't@example.com'); sh(dir, 'config', 'user.name', 'T');
      for (const f of ['a.txt', 'b.txt', 'c.txt', 'd.txt']) fs.writeFileSync(path.join(dir, f), f);
      sh(dir, 'add', '-A'); sh(dir, 'commit', '-q', '-m', 'base');
      sh(dir, 'switch', '-q', '-c', 'task');
      fs.writeFileSync(path.join(dir, 'a.txt'), 'changed'); sh(dir, 'commit', '-qam', 'committed change');
      fs.writeFileSync(path.join(dir, 'b.txt'), 'staged'); sh(dir, 'add', 'b.txt');
      fs.writeFileSync(path.join(dir, 'c.txt'), 'unstaged');
      fs.writeFileSync(path.join(dir, 'new.txt'), 'untracked');
      fs.rmSync(path.join(dir, 'd.txt'));
      const found = checks.changedFiles(dir, 'main');
      assert.equal(found.base, 'main');
      assert.deepEqual(found.files, ['a.txt', 'b.txt', 'c.txt', 'd.txt', 'new.txt']);
      assert.equal(checks.changedFiles(dir).base, 'main', 'falls back to main when there is no origin/main');
      assert.deepEqual(checks.changedFiles(dir, 'task').files.sort(), ['b.txt', 'c.txt', 'd.txt', 'new.txt'], 'against itself only uncommitted work remains');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  await scenario('command line: explicit paths, --json, --since and option errors', async () => {
    const text = checks.runChecks(['src/audio/adapter.js'], root);
    assert.equal(text.code, 0);
    assert.match(text.lines.join('\n'), /npm run test:audio/);
    const json = JSON.parse(checks.runChecks(['--json', 'src/audio/adapter.js'], root).lines[0]);
    assert.deepEqual(json.changed, ['src/audio/adapter.js']);
    assert.ok(json.commands.some(c => c.script === 'test:audio'));
    assert.equal(checks.runChecks(['--bogus'], root).code, 1);
    assert.equal(checks.runChecks(['--since'], root).code, 1);
    assert.deepEqual(checks.runChecks(['--since', 'HEAD'], root).code, 0);
    // The real CLI is wired in: `node tools/cli/main.mjs checks ...` and the npm script.
    const cli = spawnSync(process.execPath, [path.join(root, 'tools/cli/main.mjs'), 'checks', 'src/camera/rig.js'], { encoding: 'utf8' });
    assert.equal(cli.status, 0, cli.stderr);
    assert.match(cli.stdout, /npm run test:input/);
    assert.match(pkg.scripts.checks, /tools\/cli\/main\.mjs checks/);
  });

  console.log(`ALL CHECK-SELECTION TESTS PASSED (${passed} scenarios)`);
})().catch(error => { console.error('FAILED with error:', error); process.exitCode = 1; });
