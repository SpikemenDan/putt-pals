// Task GM2d (issue #188): Putt Pong end-to-end integration and verification.
// Verifies:
// 1. 2-client server-room match flow (alternating turns, rack updates, redemption, win condition).
// 2. Practice solo flow (single player in Putt Pong mode).
// 3. Lofted chip-shot cup landing tuning (airborne descent and cup capture).
const assert = require('node:assert/strict');
const { createRoomSession } = require('../src/session/machine.js');
const { createPongSession, PongPhases } = require('../src/session/pong.js');
const { GameModes } = require('../src/shared/session.js');
const { SimulationEngine } = require('../src/simulation/index.js');
const { createPongChamberCourse, create10CupRack } = require('../src/courses/index.js');
const { TUNING } = require('../src/shared/tuning.js');
const { SimulationEventTypes } = require('../src/shared/simulation.js');
const { pongHudView } = require('../src/ui/model.js');

let passed = 0;
async function scenario(name, fn) {
  await fn();
  passed++;
  console.log('PASS ' + name);
}

function fakeClock() {
  let t = 1000;
  const timers = new Map();
  let seq = 0;
  return {
    now: () => t,
    setTimeout: (fn, ms) => {
      const id = ++seq;
      timers.set(id, { fn, at: t + ms });
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
    advance: (ms) => {
      t += ms;
      for (const [id, item] of [...timers.entries()]) {
        if (item.at <= t) {
          timers.delete(id);
          item.fn();
        }
      }
    },
  };
}

(async () => {
  // ---------------------------------------------------------------------------
  // 1. Lofted Chip-Shot Cup Landing Tuning
  // ---------------------------------------------------------------------------
  await scenario('chip-shot tuning: lofted shot launches with vertical lift and reliably sinks into cup', async () => {
    const course = createPongChamberCourse();
    // Putt 0: Tee at [60, 200], apex cup at [320, 200]
    const engine = new SimulationEngine(course, 0);
    const player = engine.addPlayer('chipper', 'Chipper');

    // Arm Chip In powerup
    player.armedPowerups = { chip: true };

    // Launch with power 0.35 directly toward apex cup
    const shot = engine.launch('chipper', 0, 0.35);
    assert.equal(shot.type, SimulationEventTypes.SHOT);
    assert.equal(player.vz, TUNING.powerups.chipLaunch, 'vertical launch matches chipLaunch tuning');
    assert.ok(player.vz > 0, 'shot is lofted airborne');

    let sunk = false;
    let cupEliminated = false;
    let steps = 0;

    while (player.moving && steps < 2000) {
      const { events } = engine.step();
      steps++;
      if (events.some(e => e.type === SimulationEventTypes.SINK)) {
        sunk = true;
      }
      if (events.some(e => e.type === SimulationEventTypes.CUP_ELIMINATION)) {
        cupEliminated = true;
      }
      if (sunk) break;
    }

    assert.equal(sunk, true, 'lofted chip shot must sink in target cup');
    assert.equal(cupEliminated, true, 'sinking in multi-cup course must emit CUP_ELIMINATION');
    assert.equal(player.mode, 'sunk');
  });

  await scenario('chip-shot tuning: reliable landing across multiple power settings', async () => {
    const course = createPongChamberCourse();
    const testPowers = [0.30, 0.35, 0.40, 0.50];
    let successes = 0;

    for (const power of testPowers) {
      const engine = new SimulationEngine(course, 0);
      const player = engine.addPlayer('test-p', 'Player');
      player.armedPowerups = { chip: true };
      engine.launch('test-p', 0, power);

      let steps = 0;
      while (player.moving && steps < 2000) {
        const { events } = engine.step();
        steps++;
        if (events.some(e => e.type === SimulationEventTypes.SINK)) {
          successes++;
          break;
        }
      }
    }

    assert.equal(successes, testPowers.length, 'all tuned chip-shot powers should reliably land');
  });

  // ---------------------------------------------------------------------------
  // 2. 2-Client Server-Room Match Flow
  // ---------------------------------------------------------------------------
  await scenario('2-client match flow: room session in PONG mode tracks turns, shots, and game over', async () => {
    const clock = fakeClock();
    const session = createRoomSession({
      hostId: 'host-1',
      hostName: 'Alice',
      clock,
      serverOwned: true,
      controllerId: 'host-1',
    });

    // Guest joins
    session.send({ type: 'JOIN_ROOM', playerId: 'guest-2', name: 'Bob' });
    let snap = session.getSnapshot();
    assert.equal(Object.keys(snap.players).length, 2);

    // Host selects Pong mode
    session.send({ type: 'SET_MODE', playerId: 'host-1', mode: GameModes.PONG });
    snap = session.getSnapshot();
    assert.equal(snap.mode, GameModes.PONG);

    // Host starts voting / match
    session.send({ type: 'START_VOTING', playerId: 'host-1' });
    session.send({ type: 'CAST_VOTE', playerId: 'host-1', mapIndex: 0 });
    session.send({ type: 'CAST_VOTE', playerId: 'guest-2', mapIndex: 0 });

    // Advance through start countdown and settling to reach running state
    clock.advance(2600);
    clock.advance(1600);

    // Advances to play
    snap = session.getSnapshot();
    assert.equal(snap.phase, 'play');
    assert.ok(snap.pong, 'room snapshot must contain pong context in PONG mode');
    assert.equal(snap.pong.homePlayer.id, 'host-1');
    assert.equal(snap.pong.awayPlayer.id, 'guest-2');
    assert.equal(snap.pong.remainingHomeCups, 10);
    assert.equal(snap.pong.remainingAwayCups, 10);
    assert.equal(snap.pong.activePlayerId, 'host-1', 'host starts');
    assert.equal(snap.pong.shotsRemaining, 2);

    // View model inspection for HUD
    const hudAlice = pongHudView(snap, { id: 'host-1' });
    assert.equal(hudAlice.isMyTurn, true);
    assert.equal(hudAlice.remainingAwayCups, 10);
    assert.equal(hudAlice.shotsRemaining, 2);

    // Alice takes shot 1 (hits away cup 0)
    session.send({
      type: 'PONG_SHOT',
      playerId: 'host-1',
      roundNumber: snap.roundNumber,
      cupId: 'away-0',
      hit: true,
    });
    snap = session.getSnapshot();
    assert.equal(snap.pong.remainingAwayCups, 9, 'away cup eliminated');
    assert.equal(snap.pong.shotsRemaining, 1, '1 shot remaining in turn');
    assert.equal(snap.pong.activePlayerId, 'host-1');

    // Alice takes shot 2 (hits away cup 1) -> Bonus balls back!
    session.send({
      type: 'PONG_SHOT',
      playerId: 'host-1',
      roundNumber: snap.roundNumber,
      cupId: 'away-1',
      hit: true,
    });
    snap = session.getSnapshot();
    assert.equal(snap.pong.remainingAwayCups, 8);
    assert.equal(snap.pong.shotsRemaining, 2, 'double-sink awards 2 bonus balls');
    assert.equal(snap.pong.activePlayerId, 'host-1', 'bonus turn continues for Alice');

    // Alice takes shot 3 (misses)
    session.send({
      type: 'PONG_SHOT',
      playerId: 'host-1',
      roundNumber: snap.roundNumber,
      cupId: null,
      hit: false,
    });
    snap = session.getSnapshot();
    assert.equal(snap.pong.shotsRemaining, 1);

    // Alice takes shot 4 (misses) -> turn passes to Bob
    session.send({
      type: 'PONG_SHOT',
      playerId: 'host-1',
      roundNumber: snap.roundNumber,
      cupId: null,
      hit: false,
    });
    snap = session.getSnapshot();
    assert.equal(snap.pong.activePlayerId, 'guest-2', 'turn alternates to Bob');
    assert.equal(snap.pong.shotsRemaining, 2);

    const hudBob = pongHudView(snap, { id: 'guest-2' });
    assert.equal(hudBob.isMyTurn, true);
    assert.equal(hudBob.activeShooterName, 'Bob');

    // Out-of-turn rejection: Alice cannot shoot during Bob's turn
    const rejected = session.send({
      type: 'PONG_SHOT',
      playerId: 'host-1',
      roundNumber: snap.roundNumber,
      cupId: 'away-2',
      hit: true,
    });
    assert.equal(rejected, false, 'out-of-turn shot must be rejected');

    // Bob misses twice -> turn alternates to Alice
    session.send({ type: 'PONG_SHOT', playerId: 'guest-2', roundNumber: snap.roundNumber, hit: false });
    session.send({ type: 'PONG_SHOT', playerId: 'guest-2', roundNumber: snap.roundNumber, hit: false });

    // Alice sinks away-2 and away-3 (earns 2 bonus balls)
    session.send({ type: 'PONG_SHOT', playerId: 'host-1', roundNumber: snap.roundNumber, cupId: 'away-2', hit: true });
    session.send({ type: 'PONG_SHOT', playerId: 'host-1', roundNumber: snap.roundNumber, cupId: 'away-3', hit: true });
    // Alice uses bonus balls on away-4 and away-5
    session.send({ type: 'PONG_SHOT', playerId: 'host-1', roundNumber: snap.roundNumber, cupId: 'away-4', hit: true });
    session.send({ type: 'PONG_SHOT', playerId: 'host-1', roundNumber: snap.roundNumber, cupId: 'away-5', hit: true });

    // Turn passes to Bob; Bob misses twice
    session.send({ type: 'PONG_SHOT', playerId: 'guest-2', roundNumber: snap.roundNumber, hit: false });
    session.send({ type: 'PONG_SHOT', playerId: 'guest-2', roundNumber: snap.roundNumber, hit: false });

    // Turn returns to Alice; Alice sinks away-6 and away-7 (earns 2 bonus balls), then away-8
    session.send({ type: 'PONG_SHOT', playerId: 'host-1', roundNumber: snap.roundNumber, cupId: 'away-6', hit: true });
    session.send({ type: 'PONG_SHOT', playerId: 'host-1', roundNumber: snap.roundNumber, cupId: 'away-7', hit: true });
    session.send({ type: 'PONG_SHOT', playerId: 'host-1', roundNumber: snap.roundNumber, cupId: 'away-8', hit: true });

    // Alice hits final away cup (away-9) -> triggers redemption
    session.send({
      type: 'PONG_SHOT',
      playerId: 'host-1',
      roundNumber: snap.roundNumber,
      cupId: 'away-9',
      hit: true,
    });
    snap = session.getSnapshot();
    assert.equal(snap.pong.phase, 'redemption', 'clearing all 10 cups triggers redemption');
    assert.equal(snap.pong.activePlayerId, 'guest-2', 'defender gets redemption shot');

    // Bob misses redemption shot -> Game Over, Alice wins
    session.send({
      type: 'PONG_SHOT',
      playerId: 'guest-2',
      roundNumber: snap.roundNumber,
      cupId: null,
      hit: false,
    });
    snap = session.getSnapshot();
    assert.equal(snap.pong.phase, 'game_over');
    assert.equal(snap.pong.winner, 'host-1', 'Alice is declared winner');

    // Transitions to results screen
    assert.equal(snap.phase, 'results');
    assert.deepEqual(snap.last.winners, ['host-1'], 'match winners include Alice');
  });

  // ---------------------------------------------------------------------------
  // 3. Solo Practice Flow
  // ---------------------------------------------------------------------------
  await scenario('solo practice flow: single player plays Putt Pong and tracks cup elimination', async () => {
    const clock = fakeClock();
    const session = createRoomSession({
      hostId: 'solo-dev',
      hostName: 'Solo Dev',
      clock,
      serverOwned: false,
    });

    session.send({ type: 'SET_MODE', playerId: 'solo-dev', mode: GameModes.PONG });
    session.send({ type: 'START_VOTING', playerId: 'solo-dev' });
    session.send({ type: 'CAST_VOTE', playerId: 'solo-dev', mapIndex: 0 });

    // Advance through start countdown and settling to reach running state
    clock.advance(2600);
    clock.advance(1600);

    const snap = session.getSnapshot();
    assert.equal(snap.mode, GameModes.PONG);
    assert.equal(snap.phase, 'play');
    assert.ok(snap.pong);
    assert.equal(snap.pong.homePlayer.id, 'solo-dev');
    assert.equal(snap.pong.activePlayerId, 'solo-dev');

    // Solo shoots and hits cup
    session.send({
      type: 'PONG_SHOT',
      playerId: 'solo-dev',
      roundNumber: snap.roundNumber,
      cupId: 'away-0',
      hit: true,
    });
    const afterShot = session.getSnapshot();
    assert.equal(afterShot.pong.remainingAwayCups, 9);
  });

  console.log(`\nALL ${passed} GM2d integration & verification scenarios PASSED!`);
})();
