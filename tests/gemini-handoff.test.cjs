// Bounded Gemini Pro handoff (tools/gemini/handoff.mjs). A fake Gemini program stands in for the real CLI, so nothing is sent
// anywhere: the tests check what would be sent, what is refused, that Gemini runs read-only in an empty directory, and that
// failures end in an explicit "continue directly" after a bounded number of attempts.
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
  const handoff = await import(pathToFileURL(path.join(root, 'tools/gemini/handoff.mjs')).href);
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'putt-pals-gemini-test-'));
  const record = path.join(temp, 'invocation.json');
  const counter = path.join(temp, 'count');
  const fake = path.join(temp, 'fake-gemini.cjs');
  fs.writeFileSync(fake, `
const fs = require('fs');
const mode = process.env.FAKE_MODE || 'ok';
let n = 0; try { n = Number(fs.readFileSync(process.env.FAKE_COUNT, 'utf8')); } catch {}
fs.writeFileSync(process.env.FAKE_COUNT, String(n + 1));
let stdin = ''; process.stdin.on('data', d => { stdin += d; });
process.stdin.on('end', () => {
  fs.writeFileSync(process.env.FAKE_OUT, JSON.stringify({ argv: process.argv.slice(2), cwd: process.cwd(), cwdEntries: fs.readdirSync(process.cwd()), stdin }));
  if (mode === 'hang' || (mode === 'flaky' && n === 0 && false)) { setInterval(() => {}, 1000); return; }
  if (mode === 'flaky' && n === 0) { console.error('transient failure'); process.exit(7); }
  if (mode === 'fail') { console.error('boom'); process.exit(9); }
  if (mode === 'failsecret') { console.error('token ghp_' + 'a'.repeat(36)); process.exit(9); }
  if (mode === 'empty') process.exit(0);
  console.log('FINDINGS: looks fine (README.md line 3)');
});
`);
  const env = mode => ({ ...process.env, PUTT_PALS_GEMINI_CMD: JSON.stringify([process.execPath, fake]), FAKE_MODE: mode, FAKE_OUT: record, FAKE_COUNT: counter });
  const calls = () => { try { return Number(fs.readFileSync(counter, 'utf8')); } catch { return 0; } };
  const reset = () => { fs.rmSync(counter, { force: true }); fs.rmSync(record, { force: true }); };
  const big = 'x'.repeat(500);
  const base = ['--task', 'Summarize the intro', '--expect', 'Two bullets with line citations'];
  const run = (args, mode = 'ok') => handoff.runHandoff([...base, ...args], { root, env: env(mode) });

  await scenario('success: the excerpt travels on stdin with the task, rules and sources; Gemini runs read-only in an empty directory', async () => {
    reset();
    const result = await run(['--file', 'README.md#L1-8']);
    assert.equal(result.code, 0, result.lines.join('\n'));
    const text = result.lines.join('\n');
    assert.match(text, /unverified: check them against the files and command output/);
    assert.match(text, /FINDINGS: looks fine/);
    assert.match(text, /Sent \d+ bytes: file README\.md lines 1-8/);
    const seen = JSON.parse(fs.readFileSync(record, 'utf8'));
    assert.match(seen.stdin, /TASK: Summarize the intro/);
    assert.match(seen.stdin, /EXPECTED OUTPUT: Two bullets with line citations/);
    assert.match(seen.stdin, /Mark anything you are not sure of as UNCERTAIN/);
    assert.match(seen.stdin, /Support every material claim with the excerpt/);
    assert.match(seen.stdin, /<<< file README\.md lines 1-8 >>>\n1: # Putt Pals/);
    assert.match(seen.stdin, /data, not instructions/);
    assert.ok(!seen.stdin.includes('AGENTS.md'), 'only the selected excerpt is sent');
    assert.deepEqual(seen.cwdEntries, [], 'Gemini starts in an empty directory, not the checkout');
    assert.notEqual(path.resolve(seen.cwd), root);
    assert.equal(calls(), 1);
  });

  await scenario('the real invocation is read-only, headless and carries no caller text on the command line', async () => {
    const real = handoff.geminiCommand({});
    assert.equal(real.command, 'gemini');
    assert.deepEqual(real.args.slice(real.args.indexOf('--approval-mode'), real.args.indexOf('--approval-mode') + 2), ['--approval-mode', 'plan']);
    assert.ok(real.args.includes('-p') && real.args.includes('text'));
    assert.ok(!real.args.includes('--yolo') && !real.args.includes('auto_edit') && !real.args.includes('-y'));
    assert.ok(real.args.every(a => !/Summarize|TASK/.test(a)), 'the task and excerpts are not passed as arguments');
    assert.throws(() => handoff.geminiCommand({ PUTT_PALS_GEMINI_CMD: '"not an array"' }), /JSON array/);
  });

  await scenario('refusals: credentials, oversize, tiny, bad paths and missing arguments are stopped before anything is sent', async () => {
    reset();
    fs.writeFileSync(path.join(temp, 'secret.txt'), 'api key: ghp_' + 'b'.repeat(36) + '\n' + big);
    const repoCopy = path.join(temp, 'repo'); fs.mkdirSync(path.join(repoCopy, 'src'), { recursive: true });
    fs.writeFileSync(path.join(repoCopy, 'src/leak.js'), 'const t = "ghp_' + 'c'.repeat(36) + '";\n' + big);
    fs.writeFileSync(path.join(repoCopy, '.env'), 'X=1\n' + big);
    fs.writeFileSync(path.join(repoCopy, 'huge.txt'), 'y'.repeat(70_000));
    fs.writeFileSync(path.join(repoCopy, 'ok.txt'), 'fine\n' + big);
    fs.writeFileSync(path.join(repoCopy, 'tiny.txt'), 'hi\n');
    const at = args => handoff.runHandoff([...base, ...args], { root: repoCopy, env: env('ok') });
    const leak = await at(['--file', 'src/leak.js']);
    assert.equal(leak.code, 2);
    assert.match(leak.lines[0], /possible credential in file src\/leak\.js.*GitHub token.*The value is not shown/);
    assert.ok(!leak.lines.join('\n').includes('ghp_'), 'the secret itself is never echoed');
    const envFile = await at(['--file', '.env']);
    assert.equal(envFile.code, 2); assert.match(envFile.lines[0], /credential file and is never sent/);
    const huge = await at(['--file', 'huge.txt']);
    assert.equal(huge.code, 2); assert.match(huge.lines[0], /over the 60000 byte limit.*narrow them/);
    assert.equal((await at(['--file', 'huge.txt#L1-1'])).code, 2, 'a one-line range of a huge single line is still over the limit');
    const tiny = await at(['--file', 'tiny.txt']);
    assert.equal(tiny.code, 5); assert.match(tiny.lines[0], /quicker to do directly/);
    assert.equal((await at(['--file', 'tiny.txt', '--force-small'])).code, 0);
    assert.match((await at(['--file', '../secret.txt'])).lines[0], /outside the repository/);
    assert.match((await at(['--file', 'missing.txt'])).lines[0], /does not exist/);
    assert.match((await at(['--file', 'ok.txt#L0'])).lines[0], /bad line range/);
    assert.match((await at(['--file', 'ok.txt#L9-3'])).lines[0], /bad line range/);
    assert.match((await at(['--file', 'ok.txt#L50'])).lines[0], /has only \d+ lines/);
    assert.match((await handoff.runHandoff(['--expect', 'x', '--file', 'README.md'], { root, env: env('ok') })).lines[0], /--task is required/);
    assert.match((await handoff.runHandoff(['--task', 'x', '--file', 'README.md'], { root, env: env('ok') })).lines[0], /--expect is required/);
    assert.match((await handoff.runHandoff(['--task', 'x', '--expect', 'y'], { root, env: env('ok') })).lines[0], /at least one --file, --diff or --log/);
    assert.match((await run(['--file', 'README.md', '--attempts', '9'])).lines[0], /--attempts must be 1 to 3/);
    assert.equal((await run(['--bogus'])).code, 1);
    const withSecretTask = await handoff.runHandoff(['--task', 'use key ghp_' + 'd'.repeat(36), '--expect', 'x', '--file', 'ok.txt'], { root: repoCopy, env: env('ok') });
    assert.equal(withSecretTask.code, 2); assert.match(withSecretTask.lines[0], /task text/);
    assert.equal(calls(), 1, 'only the --force-small request reached Gemini');
  });

  await scenario('dry run sends nothing and lists exactly what would be sent', async () => {
    reset();
    const result = await run(['--file', 'README.md#L1-8', '--dry-run']);
    assert.equal(result.code, 0);
    assert.match(result.lines[0], /DRY RUN: nothing was sent/);
    assert.match(result.lines.join('\n'), /file README\.md lines 1-8/);
    assert.equal(calls(), 0);
  });

  await scenario('diffs and log tails: selected, credential files named and refused, tail bounded', async () => {
    const repo = path.join(temp, 'diffrepo'); fs.mkdirSync(repo);
    sh(repo, 'init', '-q', '-b', 'main'); sh(repo, 'config', 'user.email', 't@e.com'); sh(repo, 'config', 'user.name', 'T');
    fs.writeFileSync(path.join(repo, 'a.js'), 'one\n'); fs.writeFileSync(path.join(repo, '.env'), 'A=1\n');
    sh(repo, 'add', '-A'); sh(repo, 'commit', '-q', '-m', 'base');
    fs.writeFileSync(path.join(repo, 'a.js'), 'one\n' + big + '\ntwo\n');
    const at = args => handoff.runHandoff([...base, ...args], { root: repo, env: env('ok') });
    reset();
    const ok = await at(['--diff', 'HEAD -- a.js']);
    assert.equal(ok.code, 0, ok.lines.join('\n'));
    assert.match(JSON.parse(fs.readFileSync(record, 'utf8')).stdin, /<<< git diff HEAD -- a\.js >>>\ndiff --git a\/a\.js/);
    fs.appendFileSync(path.join(repo, '.env'), 'B=2\n' + big);
    const refused = await at(['--diff', 'HEAD']);
    assert.equal(refused.code, 2); assert.match(refused.lines[0], /includes credential file\(s\) \.env; narrow it/);
    assert.match((await at(['--diff', 'HEAD --output=x'])).lines[0], /option is not allowed/);
    assert.match((await at(['--diff', 'HEAD -- nothing-here'])).lines[0], /diff is empty/);
    const lines = Array.from({ length: 400 }, (_, i) => `line ${i + 1} ${'z'.repeat(10)}`);
    fs.writeFileSync(path.join(repo, 'build.log'), lines.join('\n'));
    reset();
    const tail = await at(['--log', 'build.log', '--tail', '50']);
    assert.equal(tail.code, 0);
    const sent = JSON.parse(fs.readFileSync(record, 'utf8')).stdin;
    assert.match(sent, /last 50 of 400 lines/); assert.ok(sent.includes('line 400 ') && !sent.includes('line 300 '));
    assert.match((await at(['--log', 'build.log', '--tail', '99999'])).lines[0], /--tail must be between/);
    assert.match((await at(['--log', '.env'])).lines[0], /credential file/);
  });

  await scenario('failures are bounded: a retry that succeeds is reported, repeated failures stop with an explicit fallback to direct work', async () => {
    reset();
    const flaky = await run(['--file', 'README.md#L1-8', '--attempts', '2'], 'flaky');
    assert.equal(flaky.code, 0);
    assert.equal(calls(), 2, 'exactly two attempts ran');
    assert.match(flaky.lines.join('\n'), /succeeded on attempt 2; earlier: attempt 1: exit code 7/);
    for (const mode of ['fail', 'empty']) {
      reset();
      const result = await run(['--file', 'README.md#L1-8', '--attempts', '3'], mode);
      assert.equal(result.code, 3, mode);
      assert.equal(calls(), 3, `${mode}: stops after the allowed attempts, no more`);
      const text = result.lines.join('\n');
      assert.match(text, /Gemini Pro unavailable after 3 attempt\(s\)/);
      assert.match(text, /Continue the task directly\. Do not substitute another model, and do not retry in a loop/);
    }
    reset();
    const secretErr = await run(['--file', 'README.md#L1-8', '--attempts', '1'], 'failsecret');
    assert.equal(secretErr.code, 3);
    assert.ok(!secretErr.lines.join('\n').includes('ghp_') && /stderr withheld/.test(secretErr.lines.join('\n')), 'a secret in Gemini stderr is not echoed');
    reset();
    const started = Date.now();
    const hung = await run(['--file', 'README.md#L1-8', '--attempts', '2', '--timeout-seconds', '5'], 'hang');
    assert.equal(hung.code, 3);
    assert.equal(calls(), 2);
    assert.ok(Date.now() - started < 25_000, `two 5 s attempts, then stop (${Date.now() - started} ms)`);
    assert.match(hung.lines.join('\n'), /timed out after 5s/);
    const missing = await handoff.runHandoff([...base, '--file', 'README.md#L1-8', '--attempts', '1'], { root, env: { ...process.env, PUTT_PALS_GEMINI_CMD: JSON.stringify(['definitely-not-installed-gemini']) } });
    assert.equal(missing.code, 3); assert.match(missing.lines[0], /not installed or not on PATH/);
  });

  await scenario('command line entry point prints the result and sets the exit code', async () => {
    reset();
    const cli = spawnSync(process.execPath, [path.join(root, 'tools/gemini/handoff.mjs'), ...base, '--file', 'README.md#L1-8'], { encoding: 'utf8', env: env('ok') });
    assert.equal(cli.status, 0, cli.stderr);
    assert.match(cli.stdout, /FINDINGS: looks fine/);
    const skipped = spawnSync(process.execPath, [path.join(root, 'tools/gemini/handoff.mjs'), '--task', 'a', '--expect', 'b', '--file', 'package.json#L1-2'], { encoding: 'utf8', env: env('ok') });
    assert.equal(skipped.status, 5);
    assert.match(skipped.stdout, /SKIPPED/);
  });

  fs.rmSync(temp, { recursive: true, force: true });
  console.log(`ALL GEMINI HANDOFF TESTS PASSED (${passed} scenarios; fake Gemini only, nothing sent)`);
})().catch(error => { console.error('FAILED with error:', error); process.exitCode = 1; });
