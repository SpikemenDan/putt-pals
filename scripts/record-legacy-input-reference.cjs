// One-off recorder for the input parity test: captures the legacy game's aim maths and camera angles for the
// exact event sequence the test replays on the modular adapter. Output: tests/fixtures/legacy-reference/input.json.
const fs = require('node:fs');
const path = require('node:path');
const { bootLegacy } = require('../tests/support/legacy-dom.cjs');

(async () => {
  const legacy = await bootLegacy();
  const { w, P } = legacy;
  await legacy.play(0, 0, 'standard');
  const canvas = legacy.$('cv');
  const pointer = (type, init) => canvas.dispatchEvent(new w.PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, button: 0, ...init }));
  const key = (type, k) => w.document.body.dispatchEvent(new w.KeyboardEvent(type, { key: k, bubbles: true, cancelable: true }));
  let now = 5000;
  for (let i = 0; i < 30; i++) legacy.frame(now += 16);

  const times = [0, 0.35, 0.7, 1.05, 1.4, 3.3, 12.345];
  const aim = [];
  for (let p = 0; p <= 1.0001; p += 0.0625) aim.push({ power: p, spread: P().spread(p), sway: times.map(t => P().sway(p, t)) });

  const camera = { initial: [P().camAz, P().camEl] };
  pointer('pointerdown', { clientX: 400, clientY: 250, button: 2 });
  pointer('pointermove', { clientX: 470, clientY: 300 });
  pointer('pointerup', { clientX: 470, clientY: 300 });
  camera.afterOrbit = [P().camAz, P().camEl];
  for (const k of ['ArrowLeft', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowRight']) { key('keydown', k); key('keyup', k); }
  camera.afterKeys = [P().camAz, P().camEl];
  for (let i = 0; i < 40; i++) { key('keydown', 'ArrowDown'); key('keyup', 'ArrowDown'); }
  camera.afterClamp = [P().camAz, P().camEl];

  const out = { schemaVersion: 1, evidence: 'recorded from the legacy single-file game before its retirement', times, aim, camera };
  fs.writeFileSync(path.join(__dirname, '../tests/fixtures/legacy-reference/input.json'), JSON.stringify(out, null, 1) + '\n');
  console.log('recorded', aim.length, 'power rows and', Object.keys(camera).length, 'camera checkpoints', JSON.stringify(camera));
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
