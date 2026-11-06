const assert = require('node:assert/strict');

(async () => {
  const { SimulatedClock } = await import('xstate');
  const { createPongSession, PongEvents, PongPhases } = await import('../src/session/pong.js');
  const { GameModes } = await import('../src/shared/session.js');

  console.log('--- Testing Putt Pong (1v1) Turn-Based Session Rules (GM2b, #186) ---');

  const p1 = { id: 'alice', name: 'Alice', color: 0 };
  const p2 = { id: 'bob', name: 'Bob', color: 1 };

  // Helper to create session with SimulatedClock
  const createSession = (rackSize = 10) => {
    const clock = new SimulatedClock();
    const session = createPongSession({
      homePlayer: p1,
      awayPlayer: p2,
      rackSize,
      clock,
    });
    return {
      session,
      clock,
      state: () => session.getSnapshot(),
      shoot: (playerId, hit, cupId = null, timedOut = false) =>
        session.send({ type: PongEvents.PONG_SHOT, playerId, hit, cupId, timedOut }),
      concede: (playerId) =>
        session.send({ type: PongEvents.CONCEDE, playerId }),
    };
  };

  // 1. Initial State & Turn Alternation (2 balls per turn)
  {
    const s = createSession(10);
    const snap = s.state();
    assert.equal(snap.phase, PongPhases.TURN);
    assert.equal(snap.roundNumber, 1);
    assert.equal(snap.turnNumber, 1);
    assert.equal(snap.starterPlayerId, 'alice');
    assert.equal(snap.activePlayerId, 'alice');
    assert.equal(snap.shotsRemaining, 2);
    assert.equal(snap.remainingHomeCups, 10);
    assert.equal(snap.remainingAwayCups, 10);
    assert.equal(snap.bonusAwarded, false);

    // Alice shoots ball 1 of 2 (Miss)
    assert.equal(s.shoot('alice', false), true);
    assert.equal(s.state().shotsRemaining, 1);
    assert.equal(s.state().activePlayerId, 'alice', 'Alice still has 1 shot left');

    // Bob tries to shoot out of turn (must be rejected)
    assert.equal(s.shoot('bob', false), false, 'Bob cannot shoot during Alice turn');

    // Alice shoots ball 2 of 2 (Miss)
    assert.equal(s.shoot('alice', false), true);
    // Turn alternates to Bob
    assert.equal(s.state().activePlayerId, 'bob', 'Turn alternates to Bob after 2 shots');
    assert.equal(s.state().turnNumber, 2);
    assert.equal(s.state().shotsRemaining, 2);

    // Bob shoots ball 1 of 2 (Sink away cup away-0? No, Bob is awayPlayer, so Bob shoots at homeCups!)
    // If Bob tries to hit away-0, it is on his own rack so it is treated as a miss
    assert.equal(s.shoot('bob', true, 'away-0'), true);
    assert.equal(s.state().remainingAwayCups, 10, 'Own cups cannot be hit');

    // Bob shoots ball 2 of 2 at home-0 (Home cup)
    assert.equal(s.shoot('bob', true, 'home-0'), true);
    assert.equal(s.state().remainingHomeCups, 9, 'Home cup home-0 eliminated');
    assert.equal(s.state().homeCups.find(c => c.id === 'home-0').active, false);

    // Turn alternates back to Alice
    assert.equal(s.state().activePlayerId, 'alice');
    assert.equal(s.state().shotsRemaining, 2);
    s.session.dispose();
    console.log('PASS: 1v1 turn alternation and 2 balls per turn');
  }

  // 2. Bonus Balls ("Balls Back" on Double Sink)
  {
    const s = createSession(10);
    // Alice shoots ball 1 (Sink away-0)
    assert.equal(s.shoot('alice', true, 'away-0'), true);
    assert.equal(s.state().remainingAwayCups, 9);
    assert.equal(s.state().shotsRemaining, 1);
    assert.equal(s.state().bonusAwarded, false);

    // Alice shoots ball 2 (Sink away-1) -> Two in a row!
    assert.equal(s.shoot('alice', true, 'away-1'), true);
    assert.equal(s.state().remainingAwayCups, 8);
    // Sinking 2 in a row earns 2 bonus balls!
    assert.equal(s.state().bonusAwarded, true, 'Bonus balls awarded for double-sink');
    assert.equal(s.state().shotsRemaining, 2, 'Shots remaining increased by 2 bonus balls');
    assert.equal(s.state().activePlayerId, 'alice', 'Alice keeps shooting bonus balls');

    // Alice shoots bonus ball 1 (Miss)
    assert.equal(s.shoot('alice', false), true);
    assert.equal(s.state().shotsRemaining, 1);

    // Alice shoots bonus ball 2 (Miss)
    assert.equal(s.shoot('alice', false), true);
    // Now Alice turn is complete, alternates to Bob
    assert.equal(s.state().activePlayerId, 'bob');
    assert.equal(s.state().shotsRemaining, 2);
    s.session.dispose();
    console.log('PASS: Bonus balls (double-sink grants 2 extra balls)');
  }

  // 3. Round End & Redemption Failure (Winner Declared)
  {
    // Use rackSize = 2 for quick simulation
    const s = createSession(2);
    assert.equal(s.state().remainingAwayCups, 2);

    // Alice sinks away-0
    s.shoot('alice', true, 'away-0');
    // Alice sinks away-1 (Clearing Bob rack!)
    s.shoot('alice', true, 'away-1');

    // Target rack cleared! Phase transitions to REDEMPTION
    const snap = s.state();
    assert.equal(snap.remainingAwayCups, 0);
    assert.equal(snap.phase, PongPhases.REDEMPTION);
    assert.equal(snap.activePlayerId, 'bob', 'Bob gets redemption shot');
    assert.equal(snap.redemption.playerId, 'bob');
    assert.equal(snap.redemption.shotsRemaining, 1);
    assert.equal(snap.clearedBy, 'alice');

    // Bob misses redemption shot
    s.shoot('bob', false);

    // Redemption failed! Game over!
    assert.equal(s.state().phase, PongPhases.GAME_OVER);
    assert.equal(s.state().isGameOver, true);
    assert.equal(s.state().winner, 'alice', 'Alice declared winner on redemption failure');
    assert.equal(s.shoot('bob', true, 'home-0'), false, 'Cannot shoot after game over');
    s.session.dispose();
    console.log('PASS: Redemption failure ends game and declares winner');
  }

  // 4. Redemption Success & Round Reset (Alternating Starter)
  {
    // Use rackSize = 2. Alice clears Bob's rack, Bob redeems by sinking both of Alice's cups!
    const s = createSession(2);
    s.shoot('alice', true, 'away-0');
    s.shoot('alice', true, 'away-1'); // Clears Bob rack

    assert.equal(s.state().phase, PongPhases.REDEMPTION);
    assert.equal(s.state().activePlayerId, 'bob');

    // Bob redemption shot 1: Sinks home-0!
    s.shoot('bob', true, 'home-0');
    // Sinking on redemption grants another redemption shot!
    assert.equal(s.state().phase, PongPhases.REDEMPTION);
    assert.equal(s.state().redemption.shotsRemaining, 1);
    assert.equal(s.state().remainingHomeCups, 1);

    // Bob redemption shot 2: Sinks home-1! (Clearing Alice's rack too!)
    s.shoot('bob', true, 'home-1');

    // REDEMPTION SUCCESS! Round resets!
    const resetSnap = s.state();
    assert.equal(resetSnap.phase, PongPhases.TURN, 'Returns to turn phase');
    assert.equal(resetSnap.roundNumber, 2, 'Round number increments to 2');
    assert.equal(resetSnap.remainingHomeCups, 2, 'Both home cups reset');
    assert.equal(resetSnap.remainingAwayCups, 2, 'Both away cups reset');
    assert.equal(resetSnap.starterPlayerId, 'bob', 'Starting player alternates each round (Bob starts round 2)');
    assert.equal(resetSnap.activePlayerId, 'bob', 'Bob is active for first turn of round 2');
    assert.equal(resetSnap.shotsRemaining, 2);
    assert.equal(resetSnap.winner, null);
    assert.equal(resetSnap.redemption, null);
    s.session.dispose();
    console.log('PASS: Redemption success resets both racks and alternates starting player');
  }

  // 5. Concession / Forfeit
  {
    const s = createSession(10);
    assert.equal(s.concede('alice'), true);
    assert.equal(s.state().phase, PongPhases.GAME_OVER);
    assert.equal(s.state().winner, 'bob', 'Bob wins when Alice concedes');
    s.session.dispose();
    console.log('PASS: Concession terminates game and declares opponent as winner');
  }

  // 6. Subscriptions and State Immutability
  {
    const s = createSession(10);
    let notifyCount = 0;
    const unsub = s.session.subscribe(snap => {
      notifyCount++;
      assert.ok(snap.activePlayerId);
    });
    s.shoot('alice', false);
    assert.ok(notifyCount >= 1, 'Subscriber notified of shot');
    unsub();
    const countBefore = notifyCount;
    s.shoot('alice', false);
    assert.equal(notifyCount, countBefore, 'Unsubscribed listener receives no further notifications');
    s.session.dispose();
    console.log('PASS: Session subscriptions and disposal');
  }

  // 7. Edge Cases: Out-of-turn, duplicate hits, and timed-out shots
  {
    const s = createSession(3);
    // Out-of-turn shot rejected
    assert.equal(s.shoot('bob', false), false);

    // Alice sinks away-0 on shot 1
    assert.equal(s.shoot('alice', true, 'away-0'), true);
    assert.equal(s.state().remainingAwayCups, 2);

    // Alice tries to sink away-0 AGAIN on shot 2 (already eliminated cup)
    // Should be treated as miss, does not reduce cup count further
    assert.equal(s.shoot('alice', true, 'away-0'), true);
    assert.equal(s.state().remainingAwayCups, 2, 'Already eliminated cup cannot be sunk again');
    assert.equal(s.state().bonusAwarded, false, 'No bonus balls if second shot is on inactive cup');

    // Turn alternates to Bob
    assert.equal(s.state().activePlayerId, 'bob');

    // Bob times out on shot 1
    assert.equal(s.shoot('bob', true, 'home-0', true), true); // timedOut = true
    assert.equal(s.state().remainingHomeCups, 3, 'Timed-out shot is treated as miss');

    // Bob misses shot 2
    assert.equal(s.shoot('bob', false), true);

    // Turn alternates to Alice
    assert.equal(s.state().activePlayerId, 'alice');
    s.session.dispose();
    console.log('PASS: Edge cases (duplicate cup hits, timeouts, out-of-turn rejection)');
  }

  // 8. Multiple Overtime / Ties (Alternating Starter p1 -> p2 -> p1)
  {
    const s = createSession(1); // 1 cup each for fast round cycles
    // Round 1: Alice clears away-0
    s.shoot('alice', true, 'away-0');
    assert.equal(s.state().phase, PongPhases.REDEMPTION);
    // Bob redeems by sinking home-0!
    s.shoot('bob', true, 'home-0');

    // Round 2 starts: Bob starts!
    assert.equal(s.state().roundNumber, 2);
    assert.equal(s.state().starterPlayerId, 'bob');
    assert.equal(s.state().activePlayerId, 'bob');

    // Bob clears home-0
    s.shoot('bob', true, 'home-0');
    assert.equal(s.state().phase, PongPhases.REDEMPTION);
    // Alice redeems by sinking away-0!
    s.shoot('alice', true, 'away-0');

    // Round 3 starts: Alice starts!
    assert.equal(s.state().roundNumber, 3);
    assert.equal(s.state().starterPlayerId, 'alice');
    assert.equal(s.state().activePlayerId, 'alice');

    // Alice clears away-0
    s.shoot('alice', true, 'away-0');
    // Bob misses redemption
    s.shoot('bob', false);

    // Game Over! Alice wins!
    assert.equal(s.state().phase, PongPhases.GAME_OVER);
    assert.equal(s.state().winner, 'alice');
    s.session.dispose();
    console.log('PASS: Multiple round resets alternate starting player across multiple rounds');
  }

  console.log('\nAll Putt Pong (1v1) Session Rules tests passed successfully!');
})();
