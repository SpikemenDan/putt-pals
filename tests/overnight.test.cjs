// Overnight tooling (tools/overnight): recovery backup and restore verification, the Drive upload gate, session preflight,
// enforced limits and the handoff. Uses temporary git repositories, a fake rclone and a fake assistant: no real upload and no
// real assistant session is ever started by this test.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const load = rel => import(pathToFileURL(path.join(__dirname, '..', rel)).href);
const sh = (cwd, ...args) => { const r = spawnSync('git', args, { cwd, encoding: 'utf8' }); if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`); return r.stdout.trim(); };
let passed = 0;
async function scenario(name, fn) { await fn(); passed++; console.log('PASS ' + name); }
const iso = (offsetMs, base = Date.now()) => new Date(base + offsetMs).toISOString();

(async () => {
  const lib = await load('tools/overnight/lib.mjs');
  const backupLib = await load('tools/overnight/backup.mjs');
  const uploadLib = await load('tools/overnight/upload.mjs');
  const sessionLib = await load('tools/overnight/session.mjs');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'putt-pals-overnight-test-'));
  let counter = 0;
  const fresh = name => { const d = path.join(temp, `${name}-${++counter}`); fs.mkdirSync(d, { recursive: true }); return d; };

  /** A repository with history, a second branch, an uncommitted edit, an untracked file, ignored credentials and a bare remote. */
  function makeRepo() {
    const bare = fresh('remote') ;
    sh(bare, 'init', '--bare', '-q', '-b', 'main');
    const root = fresh('repo');
    sh(root, 'init', '-q', '-b', 'dev/tester');
    sh(root, 'config', 'user.email', 't@example.com'); sh(root, 'config', 'user.name', 'Tester'); sh(root, 'config', 'core.autocrlf', 'false');
    fs.mkdirSync(path.join(root, 'src')); fs.mkdirSync(path.join(root, 'docs')); fs.mkdirSync(path.join(root, 'node_modules/pkg'), { recursive: true });
    fs.writeFileSync(path.join(root, '.gitignore'), 'node_modules/\n.env\n');
    fs.writeFileSync(path.join(root, 'src/a.js'), 'export const a = 1;\n');
    fs.writeFileSync(path.join(root, 'docs/x.md'), '# docs\n');
    sh(root, 'add', '-A'); sh(root, 'commit', '-q', '-m', 'first');
    sh(root, 'remote', 'add', 'origin', bare);
    sh(root, 'push', '-q', 'origin', 'dev/tester');
    sh(root, 'checkout', '-q', '-b', 'side'); fs.writeFileSync(path.join(root, 'src/side.js'), 's\n'); sh(root, 'add', '-A'); sh(root, 'commit', '-q', '-m', 'side work'); sh(root, 'checkout', '-q', 'dev/tester');
    fs.writeFileSync(path.join(root, 'src/b.js'), 'b\n'); sh(root, 'add', '-A'); sh(root, 'commit', '-q', '-m', 'local only commit');
    fs.writeFileSync(path.join(root, 'src/a.js'), 'export const a = 2; // uncommitted\n');
    fs.writeFileSync(path.join(root, 'src/new-untracked.js'), 'untracked\n');
    fs.writeFileSync(path.join(root, '.env'), 'API_TOKEN=not-a-real-secret-value\n');
    fs.writeFileSync(path.join(root, 'node_modules/pkg/index.js'), 'dependency\n');
    return { root, bare };
  }

  // ---------------------------------------------------------------- backup
  await scenario('backup: tar listings parse the same with LF (GNU tar) and CRLF (Windows bsdtar) line endings', async () => {
    const names = ['a.txt', 'dir/b.js', 'dir/c d.md'];
    assert.deepEqual(backupLib.parseTarListing(names.join('\n') + '\n'), names);
    assert.deepEqual(backupLib.parseTarListing(names.join('\r\n') + '\r\n'), names);
    assert.deepEqual(backupLib.parseTarListing('dir/\r\ndir/b.js\r\n'), ['dir/b.js'], 'directory entries are skipped');
  });

  await scenario('backup: history with unpushed commits, uncommitted and untracked files restore and verify; credentials and dependencies are excluded', async () => {
    const { root } = makeRepo();
    sh(root, 'stash', 'push', '-q', '-u', '-m', 'wip'); // a stash must survive too
    fs.writeFileSync(path.join(root, 'src/a.js'), 'export const a = 3; // uncommitted\n');
    fs.writeFileSync(path.join(root, 'src/new-untracked.js'), 'untracked\n');
    fs.writeFileSync(path.join(root, '.env'), 'API_TOKEN=not-a-real-secret-value\n');
    const out = fresh('out');
    const { dir, manifest } = backupLib.createBackup({ root, outDir: out });
    const paths = manifest.workingTree.files.map(f => f.path);
    assert.ok(paths.includes('src/new-untracked.js') && paths.includes('src/a.js') && paths.includes('src/b.js'));
    assert.ok(!paths.some(p => p.startsWith('node_modules/')) && !paths.includes('.env'), 'dependencies and credentials are not archived');
    assert.deepEqual(manifest.excluded.credentialFilesNotBackedUp, ['.env'], 'the credential file is named, not backed up');
    assert.equal(manifest.git.branch, 'dev/tester');
    assert.equal(manifest.git.head, sh(root, 'rev-parse', 'HEAD'));
    assert.ok(manifest.git.refs.some(r => r.endsWith(' refs/heads/side')) && manifest.git.stashes.length === 1, 'local refs and the stash are recorded');
    assert.equal(manifest.workingTree.files.find(f => f.path === 'src/a.js').modified, true);
    // The secret-looking value is nowhere in the backup folder.
    for (const name of fs.readdirSync(dir)) assert.ok(!fs.readFileSync(path.join(dir, name)).includes('not-a-real-secret-value'), `${name} leaks the credential value`);
    const result = backupLib.verifyBackup(dir);
    assert.equal(result.ok, true, JSON.stringify(result.checks.filter(c => !c.ok)));
    assert.ok(result.checks.length >= 12);
    // Restore for real and look at it.
    const restored = fresh('restored');
    assert.equal(spawnSync('git', ['clone', '-q', path.join(dir, 'repo.bundle'), restored]).status, 0);
    assert.equal(sh(restored, 'rev-parse', 'HEAD'), manifest.git.head, 'the restored clone is at the recorded HEAD');
    assert.equal(sh(restored, 'log', '-1', '--format=%s'), 'local only commit', 'the unpushed commit is in the bundle');
  });

  await scenario('backup: a file with a credential-shaped value aborts the backup, naming the path and pattern but not the value', async () => {
    const { root } = makeRepo();
    const key = '-----BEGIN PRIVATE ' + 'KEY-----\nabc\n-----END PRIVATE KEY-----\n';
    fs.writeFileSync(path.join(root, 'src/oops.js'), 'const k = `' + key + '`;\n');
    const out = fresh('out');
    assert.throws(() => backupLib.createBackup({ root, outDir: out }), error => /src\/oops\.js \(private key block\)/.test(error.message) && !error.message.includes('abc'));
    assert.deepEqual(fs.readdirSync(out), [], 'nothing was written');
    const { manifest } = backupLib.createBackup({ root, outDir: out, extraExcludes: ['src/oops.js'] });
    assert.deepEqual(manifest.excluded.explicit, ['src/oops.js']);
  });

  await scenario('backup: tampering with any artifact fails verification; backups are never overwritten; remote URLs are redacted', async () => {
    const { root } = makeRepo();
    sh(root, 'remote', 'add', 'secretremote', 'https://someone:hunter2token@example.com/repo.git');
    const out = fresh('out');
    const now = new Date('2026-11-02T22:00:00Z');
    const { dir, manifest } = backupLib.createBackup({ root, outDir: out, now });
    assert.ok(manifest.git.remotes.every(r => !r.includes('hunter2token')) && manifest.git.remotes.some(r => r.includes('***@')));
    assert.equal(backupLib.verifyBackup(dir).ok, true);
    assert.throws(() => backupLib.createBackup({ root, outDir: out, now }), /never overwritten/);
    for (const artifact of ['working-tree.tar.gz', 'repo.bundle', 'uncommitted.patch']) {
      const file = path.join(dir, artifact);
      const original = fs.readFileSync(file);
      const damaged = Buffer.from(original); damaged[Math.floor(damaged.length / 2) || 0] ^= 0xff;
      fs.writeFileSync(file, damaged.length ? damaged : Buffer.from('x'));
      const result = backupLib.verifyBackup(dir);
      assert.equal(result.ok, false, `${artifact} damage is detected`);
      assert.ok(result.checks.some(c => !c.ok && c.name.includes(artifact)), artifact);
      fs.writeFileSync(file, original);
    }
    assert.equal(backupLib.verifyBackup(dir).ok, true, 'restoring the files restores verification');
  });

  // ---------------------------------------------------------------- upload (fake rclone)
  const fakeScript = path.join(temp, 'fake-rclone.cjs');
  fs.writeFileSync(fakeScript, `
const fs = require('fs'), path = require('path');
const [cmd, ...rest] = process.argv.slice(2);
const store = process.env.FAKE_RCLONE_STORE;
const map = remote => path.join(store, remote.replace(/^[^:]+:/, ''));
const flag = name => { const i = rest.indexOf(name); return i >= 0 ? rest[i + 1] : null; };
if (cmd === 'version') { console.log('rclone fake'); process.exit(0); }
if (cmd === 'listremotes') { console.log('fake:'); process.exit(0); }
if (cmd === 'lsf') { const d = map(rest[0]); if (!fs.existsSync(d)) process.exit(3); console.log(fs.readdirSync(d).join('\\n')); process.exit(0); }
if (cmd === 'copy') {
  const [src, dst] = rest, list = fs.readFileSync(flag('--files-from-raw'), 'utf8').split(/\\r?\\n/).filter(Boolean), d = map(dst);
  fs.mkdirSync(d, { recursive: true });
  for (const f of list) { if (fs.existsSync(path.join(d, f))) { console.error('immutable'); process.exit(1); } const bytes = fs.readFileSync(path.join(src, f)); fs.writeFileSync(path.join(d, f), process.env.FAKE_RCLONE_CORRUPT ? Buffer.concat([bytes, Buffer.from('x')]) : bytes); }
  process.exit(0);
}
if (cmd === 'check') {
  const [src, dst] = rest, list = fs.readFileSync(flag('--files-from-raw'), 'utf8').split(/\\r?\\n/).filter(Boolean), d = map(dst);
  const bad = list.filter(f => !fs.existsSync(path.join(d, f)) || !fs.readFileSync(path.join(src, f)).equals(fs.readFileSync(path.join(d, f))));
  if (bad.length) { console.error('differences: ' + bad.join(',')); process.exit(1); }
  process.exit(0);
}
process.exit(2);
`);
  const fakeRclone = [process.execPath, fakeScript];
  const store = fresh('drive');
  process.env.FAKE_RCLONE_STORE = store;
  // Every upload gets its own folder: backup ids are time + HEAD, and two fixture repositories built in the same second
  // have identical commits, so a shared folder would (correctly) report an existing backup on a fast machine.
  let remotes = 0;
  const nextRemote = () => 'fake:Backups' + (++remotes);

  async function verifiedBackup(root, now = new Date()) {
    const { dir } = backupLib.createBackup({ root, outDir: fresh('out'), now });
    assert.equal(backupLib.verifyBackup(dir).ok, true);
    return dir;
  }

  await scenario('upload: readiness names every missing piece; a verified upload is byte-checked and leaves a receipt; nothing is overwritten', async () => {
    assert.deepEqual(uploadLib.uploadReadiness({ remote: undefined, rclone: ['definitely-not-installed-rclone'] }).problems.length, 2);
    assert.match(uploadLib.uploadReadiness({ remote: 'nocolon', rclone: fakeRclone }).problems[0], /<rclone-remote>:<folder>/);
    assert.match(uploadLib.uploadReadiness({ remote: 'other:folder', rclone: fakeRclone }).problems[0], /no remote named other:/);
    assert.equal(uploadLib.uploadReadiness({ remote: nextRemote(), rclone: fakeRclone }).ok, true);
    const { root } = makeRepo();
    const dir = await verifiedBackup(root);
    const remote = nextRemote();
    const receipt = uploadLib.uploadBackup({ dir, remote, rclone: fakeRclone });
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
    assert.equal(receipt.backupId, manifest.backupId);
    assert.equal(receipt.head, manifest.git.head);
    assert.equal(receipt.workingTreeDigest, manifest.workingTree.digest);
    assert.match(receipt.verification, /rclone check --download/);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'receipt.json'), 'utf8')), receipt);
    assert.ok(fs.existsSync(path.join(store, remote.split(':')[1], manifest.backupId, 'repo.bundle')));
    assert.throws(() => uploadLib.uploadBackup({ dir, remote, rclone: fakeRclone }), /already exists/);
    assert.ok(!fs.readdirSync(path.join(store, remote.split(':')[1], manifest.backupId)).includes('receipt.json'), 'the local receipt is not uploaded');
  });

  await scenario('upload: an unverified, tampered or corrupted-in-transit backup is refused and leaves no receipt', async () => {
    const { root } = makeRepo();
    const unverified = backupLib.createBackup({ root, outDir: fresh('out') }).dir;
    assert.throws(() => uploadLib.uploadBackup({ dir: unverified, remote: nextRemote(), rclone: fakeRclone }), /not been verified/);
    const tampered = await verifiedBackup(root, new Date(Date.now() + 1000));
    const manifest = JSON.parse(fs.readFileSync(path.join(tampered, 'manifest.json'), 'utf8')); manifest.git.branch = 'edited';
    fs.writeFileSync(path.join(tampered, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    assert.throws(() => uploadLib.uploadBackup({ dir: tampered, remote: nextRemote(), rclone: fakeRclone }), /manifest changed after verification/);
    const transit = await verifiedBackup(root, new Date(Date.now() + 2000));
    process.env.FAKE_RCLONE_CORRUPT = '1';
    try { assert.throws(() => uploadLib.uploadBackup({ dir: transit, remote: nextRemote(), rclone: fakeRclone }), /Upload verification failed/); } finally { delete process.env.FAKE_RCLONE_CORRUPT; }
    assert.equal(fs.existsSync(path.join(transit, 'receipt.json')), false, 'no receipt for a failed upload');
    const noRemote = await verifiedBackup(root, new Date(Date.now() + 3000));
    assert.throws(() => uploadLib.uploadBackup({ dir: noRemote, remote: undefined, rclone: fakeRclone }), /destination is missing/);
  });

  // ---------------------------------------------------------------- preflight
  const goodSpec = (overrides = {}) => ({
    schemaVersion: 1, contributor: 'tester', branch: 'dev/tester',
    tasks: [{ id: 'T1', outcome: 'Edit the source file', ownedPaths: ['src/'] }],
    endTime: iso(60 * 60_000), verifyCommands: ['node -e "process.exit(0)"'], permittedOperations: ['edit', 'test', 'local-commit'],
    otherContributorConfirmed: true, ...overrides,
  });
  async function readyRepo() {
    const { root, bare } = makeRepo();
    const dir = await verifiedBackup(root);
    uploadLib.uploadBackup({ dir, remote: nextRemote(), rclone: fakeRclone, now: new Date() });
    return { root, bare, dir };
  }
  const PHRASE = sessionLib.START_PHRASE;
  const problems = (root, spec, dir, extra = {}) => sessionLib.preflight({ root, spec, backupDir: dir, confirmPhrase: PHRASE, ...extra }).problems.join(' | ');

  await scenario('preflight: passes with a fresh uploaded backup of this exact state, and refuses each missing guarantee', async () => {
    const { root, dir } = await readyRepo();
    const ok = sessionLib.preflight({ root, spec: goodSpec(), backupDir: dir, confirmPhrase: PHRASE });
    assert.equal(ok.ok, true, ok.problems.join('; '));
    assert.match(problems(root, goodSpec(), dir, { confirmPhrase: 'go' }), /fresh explicit start command/);
    assert.match(problems(root, goodSpec(), undefined), /no verified Google Drive backup receipt/);
    assert.match(problems(root, goodSpec({ branch: 'main' }), dir), /never main/);
    assert.match(problems(root, goodSpec({ branch: 'dev/other' }), dir), /the checkout is on "dev\/tester"/);
    assert.match(problems(root, goodSpec({ permittedOperations: ['edit', 'push'] }), dir), /"push" is never permitted/);
    assert.match(problems(root, goodSpec({ permittedOperations: ['edit', 'install-dependencies'] }), dir), /"install-dependencies" is never permitted/);
    assert.match(problems(root, goodSpec({ permittedOperations: ['edit', 'rm-rf'] }), dir), /unknown operation/);
    for (const bad of ['.', '/', '*', '../outside', path.resolve('/abs')]) assert.match(problems(root, goodSpec({ tasks: [{ id: 'T', outcome: 'x', ownedPaths: [bad] }] }), dir), /ownedPaths must list specific relative paths/, bad);
    assert.match(problems(root, goodSpec({ tasks: [] }), dir), /at least one bounded task/);
    assert.match(problems(root, goodSpec({ endTime: iso(-1000) }), dir), /in the past/);
    assert.match(problems(root, goodSpec({ endTime: iso(13 * 3600_000) }), dir), /more than 12 hours/);
    assert.match(problems(root, goodSpec({ endTime: 'tomorrow' }), dir), /endTime must be an ISO/);
    assert.match(problems(root, goodSpec({ verifyCommands: [] }), dir), /verifyCommands/);
    assert.match(problems(root, goodSpec({ otherContributorConfirmed: false }), dir), /other contributor/);
    assert.match(problems(root, goodSpec(), dir, { now: new Date(Date.now() + 3 * 3600_000) }), /minutes old/);
  });

  await scenario('preflight: refuses when HEAD, the working tree or the backup changed, or a session lock exists', async () => {
    let ctx = await readyRepo();
    fs.appendFileSync(path.join(ctx.root, 'src/a.js'), '// later edit\n');
    assert.match(problems(ctx.root, goodSpec(), ctx.dir), /working tree changed since the backup/);
    ctx = await readyRepo();
    sh(ctx.root, 'add', '-A'); sh(ctx.root, 'commit', '-q', '-m', 'moved on');
    assert.match(problems(ctx.root, goodSpec(), ctx.dir), /HEAD changed since the backup/);
    ctx = await readyRepo();
    const manifestFile = path.join(ctx.dir, 'manifest.json');
    fs.writeFileSync(manifestFile, fs.readFileSync(manifestFile, 'utf8') + ' ');
    assert.match(problems(ctx.root, goodSpec(), ctx.dir), /manifest changed after upload/);
    ctx = await readyRepo();
    fs.mkdirSync(sessionLib.overnightDir(ctx.root), { recursive: true });
    fs.writeFileSync(path.join(sessionLib.overnightDir(ctx.root), 'lock.json'), JSON.stringify({ id: 'stale' }));
    assert.match(problems(ctx.root, goodSpec(), ctx.dir), /session lock exists.*never restart automatically/);
    fs.rmSync(path.join(sessionLib.overnightDir(ctx.root), 'lock.json'));
    sh(ctx.root, 'checkout', '-q', '--detach');
    assert.match(problems(ctx.root, goodSpec(), ctx.dir), /HEAD is detached/);
  });

  // ---------------------------------------------------------------- sessions with a fake assistant
  const assistantScript = (body) => {
    const file = path.join(fresh('assistant'), 'assistant.cjs');
    fs.writeFileSync(file, `const { spawnSync } = require('child_process'), fs = require('fs'), path = require('path');
const git = (...a) => spawnSync('git', a, { encoding: 'utf8' });
const report = {};
${body}
fs.writeFileSync(process.env.REPORT, JSON.stringify(report));
`);
    return file;
  };

  await scenario('session: a normal run commits a labeled checkpoint, cannot push, merge, branch or write an unlabeled commit, and ends with a handoff', async () => {
    const { root, bare, dir } = await readyRepo();
    const report = path.join(temp, 'report-1.json');
    process.env.REPORT = report;
    const script = assistantScript(`
fs.writeFileSync('src/a.js', 'export const a = 4; // by the assistant\\n');
git('add', 'src/a.js');
report.unlabeled = git('commit', '-m', 'plain message').status;
report.labeled = git('commit', '-m', 'overnight checkpoint: edit a').status;
report.push = git('push', 'origin', 'dev/tester').status;
report.pushOther = git('push', 'origin', 'HEAD:refs/heads/elsewhere').status;
report.branch = git('branch', 'sneaky').status;
report.tag = git('tag', 'v1').status;
report.merge = git('merge', '--no-ff', '-m', 'overnight checkpoint merge', 'side').status;
report.env = { session: !!process.env.PUTT_PALS_OVERNIGHT, end: process.env.PUTT_PALS_OVERNIGHT_END };
`);
    const remoteBefore = sh(bare, 'for-each-ref');
    const spec = goodSpec({ assistantCommand: [process.execPath, script], verifyCommands: ['node -e "process.exit(0)"', 'node -e "process.exit(3)"'] });
    const result = await sessionLib.startSession({ root, spec, backupDir: dir, confirmPhrase: PHRASE, pollMs: 200 });
    const r = JSON.parse(fs.readFileSync(report, 'utf8'));
    assert.equal(result.reason, 'completed');
    assert.notEqual(r.unlabeled, 0, 'an unlabeled commit is refused'); assert.equal(r.labeled, 0, 'a labeled checkpoint commit works');
    assert.notEqual(r.push, 0, 'push is refused'); assert.notEqual(r.pushOther, 0, 'push to another ref is refused');
    assert.notEqual(r.branch, 0, 'creating a branch is refused'); assert.notEqual(r.tag, 0, 'creating a tag is refused'); assert.notEqual(r.merge, 0, 'a merge commit is refused');
    assert.equal(r.env.session, true);
    assert.equal(sh(bare, 'for-each-ref'), remoteBefore, 'the remote repository is untouched');
    assert.equal(sh(root, 'branch', '--list', 'sneaky'), '');
    assert.equal(fs.existsSync(path.join(sessionLib.overnightDir(root), 'lock.json')), false, 'the lock is released');
    const handoff = JSON.parse(fs.readFileSync(path.join(path.dirname(result.handoff), 'handoff.json'), 'utf8'));
    assert.equal(handoff.endReason, 'completed');
    assert.equal(handoff.commits.length, 1); assert.equal(handoff.commits[0].labeledCheckpoint, true); assert.deepEqual(handoff.commits[0].files, ['src/a.js']);
    assert.deepEqual(handoff.unlabeledCommits, []); assert.deepEqual(handoff.outsideOwnedPaths, []);
    assert.deepEqual(handoff.verification.map(v => v.exitCode), [0, 3], 'verification commands really ran and failures are reported');
    assert.match(fs.readFileSync(result.handoff, 'utf8'), /FAIL `node -e "process.exit\(3\)"`/);
    // The launcher changed no persistent git configuration.
    assert.equal(spawnSync('git', ['config', '--get', 'core.hooksPath'], { cwd: root, encoding: 'utf8' }).stdout.trim(), '');
    // No automatic restart: the state moved on, so a new session needs a fresh backup and a fresh start command.
    assert.match(problems(root, goodSpec(), dir), /HEAD changed since the backup/);
  });

  await scenario('session: the end time stops the assistant and its children, and the session is closed without restarting', async () => {
    const { root, dir } = await readyRepo();
    process.env.REPORT = path.join(temp, 'report-2.json');
    const script = assistantScript(`setInterval(() => {}, 1000); // runs until killed`);
    const started = Date.now();
    const spec = goodSpec({ endTime: iso(3500), assistantCommand: [process.execPath, script] });
    const result = await sessionLib.startSession({ root, spec, backupDir: dir, confirmPhrase: PHRASE, pollMs: 300, verifyTimeoutMs: 20_000 });
    assert.equal(result.reason, 'time-limit');
    assert.ok(Date.now() - started < 15_000, `stopped promptly (${Date.now() - started} ms)`);
    assert.equal(fs.existsSync(path.join(sessionLib.overnightDir(root), 'lock.json')), false);
    assert.equal(JSON.parse(fs.readFileSync(path.join(path.dirname(result.handoff), 'ended.json'), 'utf8')).reason, 'time-limit');
  });

  await scenario('session: editing outside the owned paths or switching branch stops the assistant', async () => {
    let { root, dir } = await readyRepo();
    process.env.REPORT = path.join(temp, 'report-3.json');
    const outside = assistantScript(`fs.writeFileSync('docs/outside.md', 'not mine\\n'); setInterval(() => {}, 1000);`);
    let result = await sessionLib.startSession({ root, spec: goodSpec({ assistantCommand: [process.execPath, outside] }), backupDir: dir, confirmPhrase: PHRASE, pollMs: 300 });
    assert.equal(result.reason, 'scope-violation');
    const handoff = JSON.parse(fs.readFileSync(path.join(path.dirname(result.handoff), 'handoff.json'), 'utf8'));
    assert.deepEqual(handoff.outsideOwnedPaths, ['docs/outside.md']);
    ({ root, dir } = await readyRepo());
    const switcher = assistantScript(`git('checkout', '-q', 'side'); setInterval(() => {}, 1000);`);
    result = await sessionLib.startSession({ root, spec: goodSpec({ assistantCommand: [process.execPath, switcher] }), backupDir: dir, confirmPhrase: PHRASE, pollMs: 300 });
    assert.equal(result.reason, 'branch-switched');
  });

  await scenario('session: the stall limit, an abnormal end and a failing assistant are handled; a stale lock is closed explicitly, never restarted', async () => {
    const { root, dir } = await readyRepo();
    const owned = ['src/'];
    const startFiles = lib_files(root);
    const session = { spec: goodSpec({ endTime: iso(11 * 3600_000) }), start: { files: startFiles, excluded: [] } };
    const base = sessionLib.checkSession({ root, session, now: new Date() });
    assert.equal(base.stop, null);
    const signature = base.signature;
    assert.equal(sessionLib.checkSession({ root, session, now: new Date(Date.now() + 91 * 60_000), lastChangeAt: { signature, at: Date.now() } }).stop, 'stalled');
    assert.equal(sessionLib.checkSession({ root, session, now: new Date(Date.now() + 30 * 60_000), lastChangeAt: { signature, at: Date.now() } }).stop, null);
    assert.equal(sessionLib.checkSession({ root, session: { ...session, spec: goodSpec({ endTime: iso(-1) }) }, now: new Date() }).stop, 'time-limit');
    assert.deepEqual(sessionLib.outsideOwned(['src/a.js', 'src/deep/b.js', 'srcx/c.js', 'docs/d.md'], owned), ['srcx/c.js', 'docs/d.md']);
    // A crashing assistant.
    process.env.REPORT = path.join(temp, 'report-4.json');
    const crash = assistantScript('process.exit(7);');
    const failed = await sessionLib.startSession({ root, spec: goodSpec({ assistantCommand: [process.execPath, crash] }), backupDir: dir, confirmPhrase: PHRASE, pollMs: 300 });
    assert.equal(failed.reason, 'assistant-failed');
    // A session that died without cleanup leaves a lock; the handoff command closes it and nothing restarts.
    const second = await readyRepo();
    const abandoned = path.join(sessionLib.overnightDir(second.root), 'dead-session');
    fs.mkdirSync(abandoned, { recursive: true });
    const spec = goodSpec();
    fs.writeFileSync(path.join(abandoned, 'session.json'), JSON.stringify({ id: 'dead-session', startedAt: new Date().toISOString(), spec, backup: { id: 'b', destination: 'd' }, start: { head: sh(second.root, 'rev-parse', 'HEAD'), files: {}, excluded: [], status: [] } }));
    fs.writeFileSync(path.join(sessionLib.overnightDir(second.root), 'lock.json'), JSON.stringify({ id: 'dead-session' }));
    const closed = sessionLib.abandonSession({ root: second.root });
    assert.equal(closed.id, 'dead-session');
    assert.equal(fs.existsSync(path.join(sessionLib.overnightDir(second.root), 'lock.json')), false);
    assert.equal(JSON.parse(fs.readFileSync(path.join(abandoned, 'ended.json'), 'utf8')).reason, 'abandoned');
    assert.match(fs.readFileSync(closed.handoff, 'utf8'), /not run/);
    assert.throws(() => sessionLib.abandonSession({ root: second.root }), /No session lock/);
  });

  // ---------------------------------------------------------------- enforced limits (guard wrappers, budgets, blocker)
  const guard = await load('tools/overnight/guard.mjs');
  const fakeTool = path.join(temp, 'fake-tool.cjs');
  // Exits 1 when any argument is "boom" (or when asked to, via FAKE_FAIL), 0 otherwise; counts its own runs.
  fs.writeFileSync(fakeTool, `
const fs = require('fs');
const file = process.env.FAKE_TOOL_COUNT;
if (file) { let n = 0; try { n = Number(fs.readFileSync(file, 'utf8')); } catch {} fs.writeFileSync(file, String(n + 1)); }
process.exit(process.argv.includes('boom') && !process.env.FAKE_FORCE_OK ? 1 : 0);
`);
  const realMap = JSON.stringify({ npm: [process.execPath, fakeTool], node: [process.execPath, fakeTool], gemini: [process.execPath, fakeTool, 'boom'], npx: [process.execPath, fakeTool] });
  const guardFile = path.join(__dirname, '..', 'tools/overnight/guard.mjs');
  const budgetDir = () => fresh('budget');
  const runGuard = (dir, limits, tool, args, extraEnv = {}) => spawnSync(process.execPath, [guardFile, tool, ...args], {
    encoding: 'utf8', env: { ...process.env, PUTT_PALS_GUARD_DIR: dir, PUTT_PALS_GUARD_LIMITS: JSON.stringify(limits), PUTT_PALS_GUARD_REAL: realMap, FAKE_TOOL_COUNT: path.join(dir, 'ran'), ...extraEnv },
  });
  const ran = dir => { try { return Number(fs.readFileSync(path.join(dir, 'ran'), 'utf8')); } catch { return 0; } };
  const stopOf = dir => guard.readStop(dir);

  await scenario('limits: the spec accepts bounded integer limits and rejects unknown, fractional and out-of-range ones', async () => {
    assert.deepEqual(guard.validateLimits(undefined), []);
    assert.deepEqual(guard.validateLimits({ maxRepeatedFailures: 3, maxGeminiAttempts: 0, maxFullSolverRuns: 1 }), []);
    assert.match(guard.validateLimits({ maxCake: 1 })[0], /unknown limit "maxCake"/);
    assert.match(guard.validateLimits({ maxRepeatedFailures: 0 })[0], /integer from 1 to 20/);
    assert.match(guard.validateLimits({ maxGeminiAttempts: 2.5 })[0], /limits.maxGeminiAttempts must be an integer/);
    assert.match(guard.validateLimits({ maxSolverRuns: 1000 })[0], /from 0 to 100/);
    assert.match(guard.validateLimits([])[0], /must be an object/);
    assert.deepEqual(guard.resolveLimits({ maxGeminiAttempts: 1 }), { ...guard.DEFAULT_LIMITS, maxGeminiAttempts: 1 });
    const { root, dir } = await readyRepo();
    assert.equal(sessionLib.preflight({ root, spec: goodSpec({ limits: { maxRepeatedFailures: 3 } }), backupDir: dir, confirmPhrase: PHRASE }).ok, true);
    assert.match(problems(root, goodSpec({ limits: { maxRepeatedFailures: 99 } }), dir), /limits.maxRepeatedFailures must be an integer from 1 to 20/);
  });

  await scenario('limits: commands are classified (Gemini, solver, exhaustive solver) from the tool and its arguments', async () => {
    assert.deepEqual(guard.classify('gemini', ['-p', 'x']), { kind: 'gemini', full: false });
    assert.deepEqual(guard.classify('npm', ['run', 'solve', '--', '0', '0']), { kind: 'solver', full: false });
    assert.deepEqual(guard.classify('npm', ['run', 'solve', '--', '0', '0', '--full']), { kind: 'solver', full: true });
    assert.deepEqual(guard.classify('node', ['tools/cli/main.mjs', 'solve', '0', '0', '--full']), { kind: 'solver', full: true });
    assert.deepEqual(guard.classify('node', ['C:\\repo\\tools\\cli\\main.mjs', 'solve', '1', '2']), { kind: 'solver', full: false });
    for (const other of [['npm', ['run', 'test:render']], ['npm', ['run', 'rank']], ['node', ['tests/physics.test.cjs']], ['node', ['tools/cli/main.mjs', 'check']], ['npx', ['vite', 'build']]]) {
      assert.equal(guard.classify(...other).kind, 'other', other.join(' '));
    }
  });

  await scenario('guard: the same command failing repeatedly stops after the allowed attempts, counts every retry and refuses further runs', async () => {
    const dir = budgetDir(), limits = guard.resolveLimits({ maxRepeatedFailures: 3 });
    assert.equal(runGuard(dir, limits, 'npm', ['run', 'ok']).status, 0);
    assert.equal(stopOf(dir), null);
    assert.equal(runGuard(dir, limits, 'npm', ['run', 'boom']).status, 1);
    assert.equal(runGuard(dir, limits, 'npm', ['run', 'boom']).status, 1);
    assert.equal(runGuard(dir, limits, 'npm', ['run', 'ok']).status, 0, 'a different command is independent');
    assert.equal(stopOf(dir), null, 'two failures of the same command are within the limit of three');
    assert.equal(runGuard(dir, limits, 'npm', ['run', 'boom']).status, 1);
    const stop = stopOf(dir);
    assert.equal(stop.limit, 'repeated-failures');
    assert.match(stop.detail, /"npm run boom" failed 3 time\(s\) in a row/);
    const before = ran(dir);
    const refused = runGuard(dir, limits, 'npm', ['run', 'anything']);
    assert.equal(refused.status, guard.REFUSED_EXIT);
    assert.match(refused.stderr, /the session is stopping/);
    assert.equal(ran(dir), before, 'a refused command is never run');
    assert.equal(guard.loadState(dir).counters.totalFailures, 3);
    // A success of the same command resets its streak, so an intermittent failure does not stop a session.
    const dir2 = budgetDir();
    for (const forceOk of [false, false, true, false, false]) runGuard(dir2, limits, 'npm', ['boom'], forceOk ? { FAKE_FORCE_OK: '1' } : {});
    assert.equal(stopOf(dir2), null);
    assert.equal(fs.readFileSync(path.join(dir2, 'commands.jsonl'), 'utf8').trim().split(String.fromCharCode(10)).length, 5, 'every command is logged');
    runGuard(dir2, limits, 'npm', ['boom']);
    assert.equal(stopOf(dir2).limit, 'repeated-failures', 'a third failure in a row after the reset stops the session');
  });

  await scenario('guard: total failures, Gemini attempts, solver runs and exhaustive solver runs each have their own budget', async () => {
    let dir = budgetDir();
    const total = guard.resolveLimits({ maxTotalFailures: 3, maxRepeatedFailures: 9 });
    for (const arg of ['a', 'b']) runGuard(dir, total, 'npm', ['run', 'boom', arg]);
    assert.equal(stopOf(dir), null);
    runGuard(dir, total, 'npm', ['run', 'boom', 'c']);
    assert.equal(stopOf(dir).limit, 'total-failures');

    dir = budgetDir();
    const gem = guard.resolveLimits({ maxGeminiAttempts: 2, maxRepeatedFailures: 9 });
    assert.equal(runGuard(dir, gem, 'gemini', ['-p', 'x']).status, 1, 'the fake Gemini fails, and the attempt still counts');
    assert.equal(runGuard(dir, gem, 'gemini', ['-p', 'x']).status, 1, 'an identical automatic retry counts too');
    assert.equal(stopOf(dir), null);
    const before = ran(dir);
    const third = runGuard(dir, gem, 'gemini', ['-p', 'x']);
    assert.equal(third.status, guard.REFUSED_EXIT);
    assert.match(third.stderr, /gemini-attempts.*2 Gemini attempts used of 2, retries included/);
    assert.equal(stopOf(dir).limit, 'gemini-attempts');
    assert.equal(ran(dir), before);
    assert.equal(guard.loadState(dir).counters.gemini, 2);

    dir = budgetDir();
    const solver = guard.resolveLimits({ maxSolverRuns: 3, maxFullSolverRuns: 1 });
    const full = ['tools/cli/main.mjs', 'solve', '0', '0', '--full'], fast = ['tools/cli/main.mjs', 'solve', '0', '0'];
    assert.equal(runGuard(dir, solver, 'node', full).status, 0);
    assert.equal(runGuard(dir, solver, 'node', fast).status, 0);
    const secondFull = runGuard(dir, solver, 'node', full);
    assert.equal(secondFull.status, guard.REFUSED_EXIT);
    assert.equal(stopOf(dir).limit, 'solver-full-runs');
    assert.equal(guard.loadState(dir).counters.solverFull, 1);
    dir = budgetDir();
    for (let i = 0; i < 3; i++) assert.equal(runGuard(dir, solver, 'npm', ['run', 'solve', '--', String(i), '0']).status, 0);
    assert.equal(runGuard(dir, solver, 'npm', ['run', 'solve', '--', '9', '0']).status, guard.REFUSED_EXIT);
    assert.equal(stopOf(dir).limit, 'solver-runs');
    // A budget of zero forbids the whole kind.
    dir = budgetDir();
    assert.equal(runGuard(dir, guard.resolveLimits({ maxGeminiAttempts: 0 }), 'gemini', ['-p', 'x']).status, guard.REFUSED_EXIT);
  });

  await scenario('guard: programs started by a guarded command pass through uncounted, but not once the session is stopping', async () => {
    const dir = budgetDir(), limits = guard.resolveLimits({ maxRepeatedFailures: 2 });
    for (let i = 0; i < 5; i++) assert.equal(runGuard(dir, limits, 'node', ['inner', 'boom'], { PUTT_PALS_GUARD_DEPTH: '1' }).status, 1);
    assert.equal(guard.loadState(dir).counters.commands, 0, 'nested commands are not counted again');
    assert.equal(stopOf(dir), null);
    fs.writeFileSync(path.join(dir, 'stop.json'), JSON.stringify({ limit: 'repeated-failures', detail: 'x' }));
    assert.equal(runGuard(dir, limits, 'node', ['inner'], { PUTT_PALS_GUARD_DEPTH: '1' }).status, guard.REFUSED_EXIT);
  });

  await scenario('shims: npm, npx, node and gemini wrappers route through the guard', async () => {
    const dir = budgetDir();
    const bin = guard.writeShims(path.join(dir, 'bin'), guardFile);
    for (const tool of guard.GUARDED_TOOLS) {
      assert.ok(fs.readFileSync(path.join(bin, tool), 'utf8').includes('guard.mjs'), tool);
      if (process.platform === 'win32') assert.ok(fs.readFileSync(path.join(bin, `${tool}.cmd`), 'utf8').includes(`guard.mjs" ${tool} %*`), `${tool}.cmd`);
    }
    // Run a real wrapper the way an assistant's shell would.
    const pathKey = Object.keys(process.env).find(k => k.toLowerCase() === 'path') ?? 'PATH';
    const env = { ...process.env, [pathKey]: bin + path.delimiter + process.env[pathKey], PUTT_PALS_GUARD_DIR: dir, PUTT_PALS_GUARD_BIN: bin, PUTT_PALS_GUARD_LIMITS: JSON.stringify(guard.resolveLimits({ maxRepeatedFailures: 2 })), PUTT_PALS_GUARD_REAL: realMap, FAKE_TOOL_COUNT: path.join(dir, 'ran') };
    const viaShell = spawnSync('npm run boom', { shell: true, env, encoding: 'utf8' });
    assert.equal(viaShell.status, 1);
    assert.equal(guard.loadState(dir).counters.commands, 1, 'the wrapper, not the real npm, handled the command');
    spawnSync('npm run boom', { shell: true, env, encoding: 'utf8' });
    assert.equal(stopOf(dir).limit, 'repeated-failures');
  });

  /** A fake assistant that works on an owned file, then runs the given commands through the wrappers on PATH. */
  const budgetAssistant = (commands, { ignoreRefusals = true } = {}) => assistantScript(`
fs.mkdirSync('src', { recursive: true });
fs.writeFileSync('src/a.js', 'export const a = 5; // work in progress\\n');
const codes = [];
for (const c of ${JSON.stringify(commands)}) codes.push(spawnSync(c, { shell: true, stdio: 'ignore' }).status);
report.codes = codes;
${ignoreRefusals ? 'setInterval(() => {}, 1000); // keeps running after refusals, to prove the launcher stops it' : ''}
`);

  for (const [name, limits, commands, expectedLimit] of [
    ['the same failing command', { maxRepeatedFailures: 3 }, ['npm run boom', 'npm run boom', 'npm run boom', 'npm run boom'], 'limit:repeated-failures'],
    ['Gemini retries', { maxGeminiAttempts: 2 }, ['gemini -p x', 'gemini -p x', 'gemini -p x'], 'limit:gemini-attempts'],
    ['an exhaustive solver run', { maxFullSolverRuns: 1 }, ['node tools/cli/main.mjs solve 0 0 --full', 'node tools/cli/main.mjs solve 0 0 --full'], 'limit:solver-full-runs'],
  ]) {
    await scenario(`session: ${name} stops the assistant at the limit, preserves its work and records the blocker and resume point`, async () => {
      const { root, bare, dir } = await readyRepo();
      process.env.REPORT = path.join(temp, `report-limit-${++counter}.json`);
      process.env.PUTT_PALS_GUARD_REAL = realMap;
      process.env.FAKE_TOOL_COUNT = path.join(temp, `fake-count-${counter}`);
      const remoteBefore = sh(bare, 'for-each-ref');
      const spec = goodSpec({ limits, assistantCommand: [process.execPath, budgetAssistant(commands)] });
      const started = Date.now();
      const result = await sessionLib.startSession({ root, spec, backupDir: dir, confirmPhrase: PHRASE, pollMs: 200 });
      delete process.env.PUTT_PALS_GUARD_REAL; delete process.env.FAKE_TOOL_COUNT;
      assert.equal(result.reason, expectedLimit);
      assert.ok(Date.now() - started < 30_000, 'stopped promptly even though the assistant kept running');
      const sessionDir = path.dirname(result.handoff);
      const blocker = JSON.parse(fs.readFileSync(path.join(sessionDir, 'blocker.json'), 'utf8'));
      assert.equal(blocker.reason, expectedLimit);
      assert.equal(blocker.limit, expectedLimit.replace('limit:', ''));
      assert.ok(blocker.detail && blocker.command !== undefined);
      assert.equal(blocker.resumePoint.branch, 'dev/tester');
      assert.deepEqual(blocker.resumePoint.uncommittedPaths.filter(l => l.includes('src/a.js')).length, 1, 'the assistant\'s unfinished edit is listed as uncommitted work');
      assert.equal(fs.readFileSync(path.join(root, 'src/a.js'), 'utf8').includes('work in progress'), true, 'the work is still on disk, untouched');
      assert.equal(sh(root, 'rev-parse', 'HEAD'), blocker.resumePoint.head, 'the launcher committed, reset and removed nothing');
      assert.ok(blocker.resumePoint.nextSteps.length >= 2 && blocker.resumePoint.nextSteps.some(s => /preserved exactly/.test(s)));
      assert.ok(blocker.lastCommands.length >= 1);
      const text = fs.readFileSync(result.handoff, 'utf8');
      assert.match(text, /## Blocker and resume point/);
      assert.match(text, new RegExp('Stopped by: ' + expectedLimit.replace(':', ':')));
      assert.equal(fs.existsSync(path.join(sessionLib.overnightDir(root), 'lock.json')), false, 'the lock is released; nothing restarts');
      assert.equal(sh(bare, 'for-each-ref'), remoteBefore, 'no remote writes');
      assert.equal(JSON.parse(fs.readFileSync(path.join(sessionDir, 'ended.json'), 'utf8')).reason, expectedLimit);
    });
  }

  await scenario('session: time-limit stops also record a blocker and resume point, and the prompt states the budgets', async () => {
    const { root, dir } = await readyRepo();
    process.env.REPORT = path.join(temp, 'report-time-blocker.json');
    const result = await sessionLib.startSession({ root, spec: goodSpec({ endTime: iso(3500), limits: { maxGeminiAttempts: 3 }, assistantCommand: [process.execPath, assistantScript('setInterval(() => {}, 1000);')] }), backupDir: dir, confirmPhrase: PHRASE, pollMs: 300 });
    assert.equal(result.reason, 'time-limit');
    const sessionDir = path.dirname(result.handoff);
    assert.equal(JSON.parse(fs.readFileSync(path.join(sessionDir, 'blocker.json'), 'utf8')).reason, 'time-limit');
    assert.match(fs.readFileSync(path.join(sessionDir, 'prompt.md'), 'utf8'), /3 Gemini attempts, 12 solver runs of which 2 may use --full/);
    assert.ok(fs.existsSync(path.join(sessionDir, 'bin', 'npm')), 'the wrappers were created for this session');
    // A clean completion writes no blocker.
    const second = await readyRepo();
    process.env.REPORT = path.join(temp, 'report-clean.json');
    const clean = await sessionLib.startSession({ root: second.root, spec: goodSpec({ assistantCommand: [process.execPath, assistantScript('')] }), backupDir: second.dir, confirmPhrase: PHRASE, pollMs: 300 });
    assert.equal(clean.reason, 'completed');
    assert.equal(fs.existsSync(path.join(path.dirname(clean.handoff), 'blocker.json')), false);
  });

  await scenario('assistant command and prompt: the default forbids pushing, merging, installs and remote tools, and states every limit', async () => {
    const spec = goodSpec();
    const command = sessionLib.buildAssistantCommand(spec);
    assert.equal(command[0], 'claude');
    const disallowed = command.slice(command.indexOf('--disallowedTools') + 1);
    for (const needle of ['Bash(git push:*)', 'Bash(git merge:*)', 'Bash(npm install:*)', 'Bash(gh:*)']) assert.ok(disallowed.includes(needle), needle);
    assert.ok(!command.slice(command.indexOf('--allowedTools'), command.indexOf('--disallowedTools')).some(a => /push|merge|install|gh:/.test(a)));
    const prompt = sessionLib.buildPrompt(spec);
    for (const text of [spec.endTime, 'src/', 'overnight checkpoint', 'Never: push, merge, deploy', 'node -e "process.exit(0)"']) assert.ok(prompt.includes(text), text);
    assert.deepEqual(sessionLib.buildAssistantCommand({ assistantCommand: ['x', 'y'] }), ['x', 'y']);
  });

  function lib_files(root) {
    const listing = lib.listProjectFiles(root);
    return Object.fromEntries(lib.hashProjectFiles(root, listing.files).files.map(f => [f.path, f.sha256]));
  }

  fs.rmSync(temp, { recursive: true, force: true });
  console.log(`ALL OVERNIGHT TESTS PASSED (${passed} scenarios; fake rclone and fake assistant only, no real upload or session)`);
})().catch(error => { console.error('FAILED with error:', error); process.exitCode = 1; });
