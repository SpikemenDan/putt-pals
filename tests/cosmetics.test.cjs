// F1 cosmetics: catalog data, untrusted-id normalisation, local persistence, renderer actors and the
// guarantee that physics cannot see a cosmetic. Run directly or through render-modern.test.cjs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

async function run() {
  const THREE = await import('three');
  const catalog = await import('../src/cosmetics/catalog.js');
  const storageModule = await import('../src/cosmetics/storage.js');
  const { applyBallSkin, createConfetti, createTrail } = await import('../src/render/actors.js');
  const { BALL_SKINS, TRAIL_SKINS, CELEBRATIONS, DEFAULT_COSMETICS, cosmeticRecord, isCosmeticId, normalizeCosmetics, rainbowHex, selectCosmetic } = catalog;
  const { COSMETICS_KEY, loadCosmetics, saveCosmetics } = storageModule;

  // Catalog: unique ids, default first, frozen, text-only names.
  for (const [kind, records] of Object.entries(catalog.COSMETIC_KINDS)) {
    assert.ok(records.length >= 3, `${kind} offers a choice`);
    assert.equal(new Set(records.map(r => r.id)).size, records.length, `${kind} ids are unique`);
    assert.equal(DEFAULT_COSMETICS[kind], records[0].id, `${kind} default is the first record`);
    assert.ok(Object.isFrozen(records) && records.every(Object.isFrozen), `${kind} catalog is frozen`);
    assert.ok(records.every(r => /^[a-z]+$/.test(r.id) && typeof r.name === 'string' && r.name.length <= 20), `${kind} ids and names are plain text`);
  }
  assert.ok(Object.isFrozen(DEFAULT_COSMETICS));

  // Untrusted ids: unknown, wrongly typed and prototype-key values never reach the renderer.
  assert.deepEqual({ ...normalizeCosmetics(undefined) }, { ...DEFAULT_COSMETICS });
  assert.deepEqual({ ...normalizeCosmetics({ ball: 'ember', trail: 'nope', celebration: 7, extra: '<script>' }) }, { ball: 'ember', trail: 'classic', celebration: 'confetti' });
  assert.deepEqual({ ...normalizeCosmetics({ ball: '__proto__', trail: 'constructor' }) }, { ...DEFAULT_COSMETICS });
  assert.equal(isCosmeticId('ball', 'glow'), true);
  assert.equal(isCosmeticId('ball', 'rainbow'), false, 'ids are per kind');
  assert.equal(isCosmeticId('toString', 'x'), false);
  assert.equal(cosmeticRecord('trail', 'bogus').id, 'classic');
  const picked = selectCosmetic({}, 'trail', 'comet');
  assert.equal(picked.trail, 'comet');
  assert.deepEqual({ ...selectCosmetic(picked, 'trail', 'bogus') }, { ...picked }, 'an unknown id keeps the current choice');
  assert.equal(selectCosmetic(picked, 'hat', 'comet').trail, 'comet', 'an unknown kind changes nothing');

  // Rainbow stays a valid, cycling colour.
  const hues = new Set();
  for (let t = 0; t < 4; t += 0.25) { const h = rainbowHex(t); assert.ok(Number.isInteger(h) && h >= 0 && h <= 0xffffff); hues.add(h); }
  assert.ok(hues.size > 4);
  assert.ok(Number.isInteger(rainbowHex(-3.3)));

  // Persistence: round trip, junk, missing and throwing storage.
  const memory = () => { const m = new Map(); return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, v), raw: m }; };
  const store = memory();
  assert.deepEqual({ ...loadCosmetics(store) }, { ...DEFAULT_COSMETICS });
  assert.equal(saveCosmetics(store, { ball: 'frost', trail: 'sparks', celebration: 'gold' }), true);
  assert.deepEqual({ ...loadCosmetics(store) }, { ball: 'frost', trail: 'sparks', celebration: 'gold' });
  store.raw.set(COSMETICS_KEY, '{not json');
  assert.deepEqual({ ...loadCosmetics(store) }, { ...DEFAULT_COSMETICS });
  store.raw.set(COSMETICS_KEY, JSON.stringify({ ball: 'frost', trail: { evil: 1 } }));
  assert.deepEqual({ ...loadCosmetics(store) }, { ball: 'frost', trail: 'classic', celebration: 'confetti' });
  assert.deepEqual({ ...loadCosmetics(null) }, { ...DEFAULT_COSMETICS });
  const denied = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); } };
  assert.deepEqual({ ...loadCosmetics(denied) }, { ...DEFAULT_COSMETICS });
  assert.equal(saveCosmetics(denied, DEFAULT_COSMETICS), false);

  // Ball skin: glow on materials that have an emissive channel, ignored otherwise.
  const ball = new THREE.Mesh(new THREE.SphereGeometry(1), new THREE.MeshToonMaterial({ color: 0xff0000 }));
  const colorBefore = ball.material.color.getHex();
  applyBallSkin(ball, BALL_SKINS[0]);
  assert.equal(ball.material.emissiveIntensity, 0);
  const ember = BALL_SKINS.find(s => s.id === 'ember');
  applyBallSkin(ball, ember);
  assert.equal(ball.material.emissive.getHex(), ember.emissive);
  assert.equal(ball.material.emissiveIntensity, ember.emissiveIntensity);
  assert.equal(ball.material.color.getHex(), colorBefore, 'the player colour is untouched');
  applyBallSkin({ material: {} }, ember);
  applyBallSkin(null, ember);

  // Trail: classic keeps the legacy shader; a sized skin swaps to a scaled one and back.
  const trail = createTrail(THREE, { toon: true });
  const classicMaterial = trail.points.material;
  assert.equal(classicMaterial.uniforms.size, undefined, 'classic trail has the legacy uniforms');
  const p = new THREE.Vector3(0, 0, 0);
  trail.update(p, true, true, 0xffffff, 1);
  assert.equal(trail.points.material, classicMaterial);
  trail.update(p, true, true, 0xffd23f, TRAIL_SKINS.find(s => s.id === 'comet').size);
  assert.notEqual(trail.points.material, classicMaterial);
  assert.equal(trail.points.material.uniforms.size.value, 1.5);
  assert.match(trail.points.material.vertexShader, /a\*30\.\*size\*/);
  trail.update(p, true, true, 0xffffff, 1);
  assert.equal(trail.points.material, classicMaterial);

  // Celebration: the default reproduces the classic burst exactly; others change the launch only.
  const burstOf = (celebration, seed = 5) => {
    let s = seed;
    const confetti = createConfetti(THREE, () => (s = (s * 16807) % 2147483647) / 2147483647);
    celebration === undefined ? confetti.burst({ x: 1, y: 2, z: 3 }) : confetti.burst({ x: 1, y: 2, z: 3 }, celebration);
    confetti.update(0.1);
    return { positions: Array.from(confetti.points.geometry.attributes.position.array), colors: Array.from(confetti.points.geometry.attributes.ccol.array), remaining: confetti.remaining };
  };
  const classic = burstOf();
  assert.deepEqual(burstOf(CELEBRATIONS[0]), classic, 'the default celebration is the classic confetti');
  const fireworks = burstOf(CELEBRATIONS.find(c => c.id === 'fireworks'));
  assert.notDeepEqual(fireworks.positions, classic.positions);
  assert.ok(fireworks.positions.every(Number.isFinite));
  const gold = burstOf(CELEBRATIONS.find(c => c.id === 'gold'));
  assert.ok(gold.remaining > classic.remaining, 'gold lasts longer');

  // Physics cannot see cosmetics: simulation and shared code never import them, so shot results are identical.
  const root = path.join(__dirname, '..', 'src');
  const offenders = [];
  const walk = dir => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full);
    else if (/\.(js|mjs|json)$/.test(e.name) && /cosmetic/i.test(fs.readFileSync(full, 'utf8'))) offenders.push(path.relative(root, full));
  } };
  walk(path.join(root, 'simulation'));
  walk(path.join(root, 'shared'));
  assert.deepEqual(offenders, [], 'src/simulation and src/shared reference no cosmetics');

  console.log('Cosmetics: catalog, id validation, persistence, ball/trail/celebration actors and physics isolation checks passed.');
}

module.exports = run();
if (require.main === module) module.exports.catch(e => { console.error(e); process.exitCode = 1; });
