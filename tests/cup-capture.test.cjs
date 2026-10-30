const assert = require("node:assert/strict");

(async () => {
  const { stepBall, cupCollision, GRAVITY } = await import(
    "../src/simulation/physics.js"
  );
  const { createPlayerState } = await import("../src/shared/simulation.js");
  const dt = 1 / 240;
  let cases = 0;
  function trial({
    radius = 15,
    speed = 100,
    angle = 0,
    offset = 0,
    height = 0,
    vertical = 0,
    start = -30,
    magnet = false,
  } = {}) {
    const a = angle,
      ca = Math.cos(a),
      sa = Math.sin(a);
    const course = {
      hole: [0, 0],
      tee: [start * ca - offset * sa, start * sa + offset * ca],
      tiles: [[-2000, -2000, 4000, 4000]],
      w: [],
      cup: radius,
    };
    const player = createPlayerState("Probe", 0, {
      x: course.tee[0],
      y: course.tee[1],
      z: height,
    });
    Object.assign(player, {
      vx: speed * ca,
      vy: speed * sa,
      vz: vertical,
      moving: true,
    });
    player.armedPowerups.mag = magnet ? 1 : 0;
    const events = [],
      trace = [];
    let minZ = height;
    for (let i = 0; i < 1200 && player.moving && player.mode === "play"; i++) {
      events.push(...stepBall(player, course, dt));
      assert(
        [player.x, player.y, player.z, player.vx, player.vy, player.vz].every(
          Number.isFinite,
        ),
      );
      minZ = Math.min(minZ, player.z);
      trace.push([player.x, player.y, player.z, player.vz]);
      if (player.x * ca + player.y * sa > 60) break;
    }
    cases++;
    return { player, course, events, trace, minZ };
  }
  // All supported cup radii and approach angles: capture depends on residence time.
  for (let radius = 8; radius <= 15; radius++) {
    for (const angle of [0, 0.4, Math.PI / 2, 2.1, Math.PI, -1.2]) {
      const slow = trial({ radius, angle, speed: 40 });
      assert.equal(
        slow.player.mode,
        "sunk",
        `slow capture radius=${radius} angle=${angle}`,
      );
      assert.equal(slow.events.filter((e) => e.type === "sink").length, 1);
      assert(
        slow.trace.slice(0, -1).every((p) => p[2] > -12),
        "no premature score",
      );
      const count = slow.events.length;
      slow.events.push(...stepBall(slow.player, slow.course));
      assert.equal(
        cupCollision(slow.player, slow.course, dt, slow.events),
        false,
      );
      assert.equal(
        slow.events.length,
        count,
        "settled ball cannot score twice",
      );
      for (const speed of [350, 600, 900, 1500, 9000]) {
        const fast = trial({ radius, angle, speed });
        assert.equal(
          fast.player.mode,
          "play",
          `overshoot radius=${radius} angle=${angle} speed=${speed}`,
        );
        assert.equal(fast.events.filter((e) => e.type === "sink").length, 0);
        assert(
          fast.player.x * Math.cos(angle) + fast.player.y * Math.sin(angle) >
            radius,
          "emerge from far side",
        );
        assert(fast.minZ > -5, "fast shot cannot be pulled deep into the cup");
      }
      const airborne = trial({ radius, angle, speed: 600, height: 30 });
      assert.equal(airborne.player.mode, "play");
      assert(airborne.minZ > 10, "airborne crossing clears the rim");
      const grazing = trial({
        radius,
        angle,
        speed: 100,
        offset: radius * 0.95,
      });
      assert.equal(
        grazing.player.mode,
        "play",
        "grazing overlap alone cannot sink",
      );
    }
  }
  // This case reproduced the bug: old downhill projection injected ~-342 vertical speed.
  const overshoot = trial({ speed: 900, start: -50 });
  assert(
    overshoot.trace.every((p) => p[3] >= -40),
    "flat cup cannot create a large downward impulse",
  );
  // A partly submerged edge shot hits the inner lip and emerges without scoring.
  const lip = trial({ speed: 130, offset: 9.5 }); // S3: the cup fillet guides gentler edge balls in; this one still lips out
  assert(lip.events.some((e) => e.type === "cup_lip"));
  assert.equal(lip.player.mode, "play");
  assert(Math.abs(lip.player.y - 9.5) > 1, "lip deflects the shot");
  const descend = trial({ start: 0, speed: 0, height: 8, vertical: -20 });
  assert.equal(descend.player.mode, "sunk", "descending into cup can score");
  const submerged = trial({ start: 0, speed: 0, height: -7, vertical: -20 });
  assert.equal(submerged.player.mode, "sunk");
  const edge = trial({ start: -15, speed: 0, offset: 0 });
  assert.equal(edge.player.mode, "play", "touching rim at rest is not a score");
  assert.deepEqual(
    trial({ speed: 220, offset: 7 }).trace,
    trial({ speed: 220, offset: 7 }).trace,
  );
  // Magnet remains an explicit attraction outside the cup, not an instant capture.
  const plain = trial({ start: -60, speed: 10 });
  const magnet = trial({ start: -60, speed: 10, magnet: true });
  assert(
    magnet.trace[0][0] > plain.trace[0][0] ||
      magnet.trace[1][0] > plain.trace[1][0],
  );
  assert.equal(
    magnet.events.filter((e) => e.type === "sink").length <= 1,
    true,
  );
  // Across sub-tick phase shifts a boosted shot still passes rather than tunnelling into a score.
  for (let start = -45; start < -20; start += 0.7) {
    assert.equal(trial({ radius: 8, speed: 9000, start }).player.mode, "play");
  }
  // Neighbouring speeds straddle the gravity/residence-time transition; there is
  // no runtime speed cutoff. Tiny height changes must not cause instant capture.
  assert.equal(trial({ speed: 238 }).player.mode, 'sunk');
  assert.equal(trial({ speed: 239 }).player.mode, 'play');
  for (const height of [-.01, 0, .001, .1, .8, 1, 4.9, 5.1]) {
    const fall = trial({ start: 0, speed: 0, height });
    assert.equal(fall.player.mode, 'sunk');
    assert(fall.trace[0][2] > -1, 'near-rim start must fall rather than score instantly');
  }
  assert.equal(GRAVITY, 700);
  console.log(
    `Cup capture: ${cases} controlled trajectories passed (slow/fast/airborne/grazing/lip/magnet/repeatability).`,
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
