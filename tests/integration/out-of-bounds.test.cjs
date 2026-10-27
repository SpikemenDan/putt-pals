// Ports legacy smoke assertion at tools.js:202 ("P24: a splash after 12 strokes does not end the putt") to the modular simulation.
const assert = require('node:assert/strict');

async function run() {
  const { outOfBounds } = await import('../../src/simulation/physics.js');
  const { SimulationEventTypes } = await import('../../src/shared/simulation.js');

  // 1. For strokes = 1, 12 and 30 with prevPosition [40, 50, 2]
  for (const strokes of [1, 12, 30]) {
    const player = {
      x: 0,
      y: 0,
      z: 0,
      vx: 5,
      vy: 5,
      vz: 5,
      moving: true,
      strokes,
      mode: 'play',
      prevPosition: [40, 50, 2],
    };
    const course = { tee: [10, 20] };
    const events = [];

    outOfBounds(player, course, events);

    assert.equal(player.x, 40);
    assert.equal(player.y, 50);
    assert.equal(player.z, 2);
    assert.equal(player.vx, 0);
    assert.equal(player.vy, 0);
    assert.equal(player.vz, 0);
    assert.equal(player.moving, false);
    assert.equal(player.strokes, strokes);
    assert.equal(player.mode, 'play');
    assert.equal(player.over, undefined);
    assert.equal(player.done, undefined);
    assert.equal(player.prevPosition, null);
    assert.equal(events.length, 1);
    assert.equal(events[0].type, SimulationEventTypes.OUT_OF_BOUNDS);
    assert.equal(events[0].strokes, strokes);
    assert.deepEqual(events[0].position, [40, 50, 2]);
  }
  console.log('PASS: outOfBounds resets ball to prevPosition with correct strokes, event, and no stroke cap or game end');

  // 2. Without prevPosition
  {
    const player = {
      x: 0,
      y: 0,
      z: 0,
      vx: 2,
      vy: 2,
      vz: 0,
      moving: true,
      strokes: 5,
      mode: 'play',
      prevPosition: null,
    };
    const course = { tee: [10, 20] };
    const events = [];

    outOfBounds(player, course, events);

    assert.equal(player.x, 10);
    assert.equal(player.y, 20);
    assert.equal(player.z, 0);
    assert.deepEqual(events[0].position, [10, 20, 0]);
  }
  console.log('PASS: outOfBounds without prevPosition returns ball to course tee [10, 20, 0]');

  // 3. An armed magnet is cleared: armedPowerups { mag: 1 } becomes { mag: 0 }; other armedPowerups keys left untouched
  {
    const player = {
      x: 0,
      y: 0,
      z: 0,
      vx: 1,
      vy: 1,
      vz: 0,
      moving: true,
      strokes: 2,
      mode: 'play',
      prevPosition: [30, 30, 0],
      armedPowerups: { mag: 1, zany: 1 },
    };
    const course = { tee: [10, 20] };
    const events = [];

    outOfBounds(player, course, events);

    assert.equal(player.armedPowerups.mag, 0);
    assert.equal(player.armedPowerups.zany, 1);
  }
  console.log('PASS: outOfBounds clears armed magnet powerup and preserves other powerup keys');

  // 4. Calling it with no events array does not throw
  {
    const player = {
      x: 0,
      y: 0,
      z: 0,
      vx: 1,
      vy: 1,
      vz: 0,
      moving: true,
      strokes: 2,
      mode: 'play',
      prevPosition: [30, 30, 0],
    };
    const course = { tee: [10, 20] };

    assert.doesNotThrow(() => {
      outOfBounds(player, course);
    });
  }
  console.log('PASS: outOfBounds does not throw when events array argument is omitted');
}

run().catch((err) => {
  console.error('FAIL: outOfBounds integration test failed:', err);
  process.exit(1);
});
