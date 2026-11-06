// GM2c (issue #187): Putt Pong cup rack visual presentation, HUD tracker, and mode selection tests.
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

let passed = 0;
async function scenario(name, fn) {
  await fn();
  passed++;
  console.log('PASS ' + name);
}

(async () => {
  const THREE = await import('three');
  const { createMaterialLibrary } = await import('../src/render/materials.js');
  const { createWorldTransform } = await import('../src/render/transform.js');
  const { createPongCupRack } = await import('../src/render/pong-cups.js');
  const { create10CupRack, createPongChamberCourse } = await import('../src/courses/index.js');
  const { buildCourseScene } = await import('../src/render/course-scene.js');
  const { createGameRenderer } = await import('../src/render/renderer.js');
  const { GameModes } = await import('../src/shared/session.js');
  const { MODE_OPTIONS } = await import('../src/ui/commands.js');
  const { pongHudView, hudView } = await import('../src/ui/model.js');
  const { createPongSession } = await import('../src/session/pong.js');
  const { buildUi } = require('./support/build-ui.cjs');

  const dom = new JSDOM('<canvas></canvas>');
  const canvas = dom.window.document.querySelector('canvas');
  const ctx = new Proxy({}, {
    get: (_, key) => key === 'measureText' ? () => ({ width: 10 }) : key === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {},
    set: () => true,
  });
  dom.window.HTMLCanvasElement.prototype.getContext = () => ctx;
  const library = createMaterialLibrary({ THREE, createCanvas: () => canvas, style: 'toon' });
  const transform = createWorldTransform([0, 0]);

  // ---------------------------------------------------------------------------
  // 1. 3D Cup Rack Mesh Generation
  // ---------------------------------------------------------------------------
  await scenario('createPongCupRack: builds sleeve and rim meshes for each cup in rack', async () => {
    const cups = create10CupRack({ idPrefix: 'home', team: 'home', apex: [100, 200] });
    assert.equal(cups.length, 10);

    const group = new THREE.Group();
    const rack = createPongCupRack(library, cups, transform, group);

    // 10 cups * 2 meshes each (sleeve + rim) = 20 meshes
    assert.equal(group.children.length, 20);

    // Initial state: all visible
    for (const child of group.children) {
      assert.equal(child.visible, true);
    }

    rack.dispose();
    assert.equal(group.children.length, 0);
  });

  await scenario('createPongCupRack: handles initially inactive cups', async () => {
    const cups = [
      { id: 'c1', x: 0, y: 0, team: 'home', active: true },
      { id: 'c2', x: 50, y: 0, team: 'home', active: false },
    ];
    const group = new THREE.Group();
    const rack = createPongCupRack(library, cups, transform, group);

    // c1 sleeve and rim visible; c2 sleeve and rim hidden
    const c1Meshes = group.children.filter(m => m.position.x === 0);
    const c2Meshes = group.children.filter(m => m.position.x === 50);
    assert.equal(c1Meshes.length, 2);
    assert.equal(c2Meshes.length, 2);
    assert.ok(c1Meshes.every(m => m.visible === true));
    assert.ok(c2Meshes.every(m => m.visible === false));

    rack.dispose();
  });

  await scenario('createPongCupRack: returns no-op when cups array is empty or undefined', async () => {
    const group = new THREE.Group();
    const rackEmpty = createPongCupRack(library, [], transform, group);
    assert.equal(group.children.length, 0);
    rackEmpty.update(0.1);
    rackEmpty.eliminateCup('none');
    rackEmpty.syncActive([]);
    rackEmpty.dispose();

    const rackNull = createPongCupRack(library, null, transform, group);
    rackNull.update(0.1);
    rackNull.dispose();
  });

  // ---------------------------------------------------------------------------
  // 2. Visual Elimination Feedback Effect
  // ---------------------------------------------------------------------------
  await scenario('createPongCupRack: eliminateCup triggers animated scale-down and hides mesh', async () => {
    const cups = [{ id: 'cup-target', x: 10, y: 20, team: 'away', active: true }];
    const group = new THREE.Group();
    const rack = createPongCupRack(library, cups, transform, group);

    const [sleeve, rim] = group.children;
    assert.equal(sleeve.scale.x, 1);
    assert.equal(rim.scale.x, 1);
    assert.equal(sleeve.visible, true);

    // Trigger elimination
    rack.eliminateCup('cup-target');

    // Midway through animation (0.175s of 0.35s duration)
    rack.update(0.175);
    assert.ok(sleeve.scale.x < 1 && sleeve.scale.x > 0, `scale should be reduced: ${sleeve.scale.x}`);
    assert.equal(sleeve.visible, true);

    // Finish animation (another 0.2s)
    rack.update(0.2);
    assert.equal(sleeve.visible, false, 'sleeve should be hidden after elimination completes');
    assert.equal(rim.visible, false, 'rim should be hidden after elimination completes');

    rack.dispose();
  });

  await scenario('createPongCupRack: syncActive updates state immediately without animation', async () => {
    const cups = [
      { id: 'cup-1', x: 0, y: 0, team: 'home', active: true },
      { id: 'cup-2', x: 30, y: 0, team: 'home', active: true },
    ];
    const group = new THREE.Group();
    const rack = createPongCupRack(library, cups, transform, group);

    // Sync snapshot where cup-1 is inactive
    rack.syncActive([{ id: 'cup-1', active: false }, { id: 'cup-2', active: true }]);

    const cup1Meshes = group.children.filter(m => m.position.x === 0);
    const cup2Meshes = group.children.filter(m => m.position.x === 30);
    assert.ok(cup1Meshes.every(m => m.visible === false));
    assert.ok(cup2Meshes.every(m => m.visible === true));

    rack.dispose();
  });

  // ---------------------------------------------------------------------------
  // 3. Renderer & CourseScene Integration
  // ---------------------------------------------------------------------------
  await scenario('buildCourseScene integrates pongCups controller when course.cups is present', async () => {
    const pongCourse = createPongChamberCourse();
    assert.ok(pongCourse.cups?.length > 0, 'pong chamber has cups');

    const build = buildCourseScene({ library, course: pongCourse, puttIndex: 0 });
    assert.ok(build.pongCups, 'build.pongCups must be defined');
    assert.equal(typeof build.pongCups.eliminateCup, 'function');
    assert.equal(typeof build.pongCups.update, 'function');

    // Trigger an elimination
    build.pongCups.eliminateCup('away-0');
    build.pongCups.update(0.4);

    // Clean disposal
    build.dispose();
  });

  await scenario('createGameRenderer exposes eliminatePongCup and syncPongCups', async () => {
    const pongCourse = createPongChamberCourse();
    const backend = {
      capabilities: { getMaxAnisotropy: () => 4 },
      shadowMap: {},
      info: { memory: { geometries: 2, textures: 3 }, programs: [1], render: { calls: 4, triangles: 5 } },
      setSize() {}, setPixelRatio() {}, render() {}, dispose() {},
    };
    const renderer = createGameRenderer({
      THREE,
      canvas,
      random: () => 0.5,
      createWebGLRenderer: () => backend,
    });

    renderer.setCourse(pongCourse, 0);
    assert.ok(renderer.course.pongCups);

    // Methods should run without error
    renderer.eliminatePongCup('away-0');
    renderer.syncPongCups([{ id: 'away-1', active: false }]);

    renderer.dispose();
  });

  // ---------------------------------------------------------------------------
  // 4. Lobby Game Mode Selection
  // ---------------------------------------------------------------------------
  await scenario('MODE_OPTIONS includes Putt Pong 1v1 option', async () => {
    const pongOption = MODE_OPTIONS.find(o => o.value === GameModes.PONG);
    assert.ok(pongOption, 'Putt Pong mode must exist in MODE_OPTIONS');
    assert.equal(pongOption.value, 'pong');
    assert.ok(pongOption.label.includes('Pong'), `label should mention Pong: ${pongOption.label}`);
    assert.equal(pongOption.soloOnly, false, 'Putt Pong should allow 1v1 multiplayer');
  });

  // ---------------------------------------------------------------------------
  // 5. HUD View Model (pongHudView & hudView)
  // ---------------------------------------------------------------------------
  await scenario('pongHudView: returns null for standard non-pong modes without pong snapshot', async () => {
    const room = { mode: GameModes.STANDARD, mapIndex: 0, puttIndex: 0 };
    const local = { id: 'p1' };
    assert.equal(pongHudView(room, local), null);
  });

  await scenario('pongHudView: maps full snapshot from real PongSession', async () => {
    const session = createPongSession({
      homePlayer: { id: 'p1', name: 'Alice', color: 1 },
      awayPlayer: { id: 'p2', name: 'Bob', color: 2 },
    });
    const snap = session.getSnapshot();

    const room = { mode: GameModes.PONG, pong: snap, mapIndex: 0, puttIndex: 0 };
    const local = { id: 'p1' };

    const hud = pongHudView(room, local);
    assert.ok(hud);
    assert.equal(hud.phase, 'turn');
    assert.equal(hud.homePlayer.name, 'Alice');
    assert.equal(hud.awayPlayer.name, 'Bob');
    assert.equal(hud.activePlayerId, 'p1');
    assert.equal(hud.activeShooterName, 'Alice');
    assert.equal(hud.isMyTurn, true);
    assert.equal(hud.shotsRemaining, 2);
    assert.equal(hud.remainingHomeCups, 10);
    assert.equal(hud.remainingAwayCups, 10);
    assert.equal(hud.homeCups.length, 10);
    assert.equal(hud.awayCups.length, 10);
    assert.equal(hud.isGameOver, false);

    // Opponent perspective
    const hudOpponent = pongHudView(room, { id: 'p2' });
    assert.equal(hudOpponent.isMyTurn, false);
  });

  await scenario('pongHudView: fallback generates valid 10-cup racks when room.mode is pong', async () => {
    const room = {
      mode: GameModes.PONG,
      roster: ['user-a', 'user-b'],
      players: {
        'user-a': { name: 'Player A' },
        'user-b': { name: 'Player B' },
      },
    };
    const hud = pongHudView(room, { id: 'user-a' });
    assert.ok(hud);
    assert.equal(hud.remainingHomeCups, 10);
    assert.equal(hud.remainingAwayCups, 10);
    assert.equal(hud.shotsRemaining, 2);
    assert.equal(hud.homePlayer.name, 'Player A');
    assert.equal(hud.awayPlayer.name, 'Player B');
  });

  // ---------------------------------------------------------------------------
  // 6. React PongHud UI Component Rendering
  // ---------------------------------------------------------------------------
  await scenario('PongHud React component: renders rack tracker, turn info, and balls left', async () => {
    const testDom = new JSDOM('<!doctype html><html><body><div id="test-root"></div></body></html>', { pretendToBeVisual: true, url: 'http://localhost/' });
    Object.assign(globalThis, {
      window: testDom.window,
      document: testDom.window.document,
      HTMLElement: testDom.window.HTMLElement,
      IS_REACT_ACT_ENVIRONMENT: true,
    });

    const { moduleUrl } = await buildUi();
    const ui = await import(moduleUrl);
    const React = (await import('react')).default;
    const ReactDOMClient = (await import('react-dom/client')).default;
    const { act } = React;

    const rootEl = testDom.window.document.getElementById('test-root');
    const root = ReactDOMClient.createRoot(rootEl);

    const pongData = {
      phase: 'turn',
      homePlayer: { id: 'p1', name: 'Alice' },
      awayPlayer: { id: 'p2', name: 'Bob' },
      activePlayerId: 'p1',
      activeShooterName: 'Alice',
      isMyTurn: true,
      shotsRemaining: 2,
      remainingHomeCups: 9,
      remainingAwayCups: 10,
      homeCups: [
        { id: 'h-0', active: false },
        ...Array.from({ length: 9 }, (_, i) => ({ id: `h-${i + 1}`, active: true })),
      ],
      awayCups: Array.from({ length: 10 }, (_, i) => ({ id: `a-${i}`, active: true })),
      isGameOver: false,
    };

    await act(async () => {
      root.render(React.createElement(ui.PongHud, { pong: pongData }));
    });

    const hudEl = rootEl.querySelector('[data-ui="pong-hud"]');
    assert.ok(hudEl, 'pong HUD must be rendered in DOM');

    const homeRack = rootEl.querySelector('[data-ui="pong-rack-home"]');
    assert.ok(homeRack);
    assert.ok(homeRack.textContent.includes('Alice'));
    assert.ok(homeRack.textContent.includes('9/10'));

    const awayRack = rootEl.querySelector('[data-ui="pong-rack-away"]');
    assert.ok(awayRack);
    assert.ok(awayRack.textContent.includes('Bob'));
    assert.ok(awayRack.textContent.includes('10/10'));

    const turnInfo = rootEl.querySelector('[data-ui="pong-turn-info"]');
    assert.ok(turnInfo);
    assert.ok(turnInfo.textContent.includes('Your turn!'));
    assert.ok(turnInfo.textContent.includes('Balls: ● ●'));

    // Test redemption view
    const redemptionData = {
      ...pongData,
      phase: 'redemption',
      isMyTurn: false,
      activeShooterName: 'Bob',
      shotsRemaining: 1,
    };
    await act(async () => {
      root.render(React.createElement(ui.PongHud, { pong: redemptionData }));
    });
    assert.ok(turnInfo.textContent.includes("Redemption! Bob's turn"));
    assert.ok(turnInfo.textContent.includes('Balls: ●'));

    await act(async () => {
      root.unmount();
    });
  });

  console.log(`\nALL ${passed} GM2c visual & HUD scenarios PASSED!`);
})();
