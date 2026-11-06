/**
 * Putt Pong (1v1) turn-based session state machine and rules coordinator (Task GM2b, issue #186).
 *
 * Implements confirmed rules from MODERNIZATION_PLAN.md:
 * - 1v1 turn alternation between Home and Away players.
 * - 2 balls per standard turn.
 * - Bonus balls ("balls back"): sinking two consecutive cups in one turn grants 2 extra balls.
 * - Round end detection when all 10 cups of a rack are eliminated.
 * - Redemption shot sequence: defending player gets 1 ball, continuing on each sink until a miss or tie.
 * - Redemption success: if the defender clears all remaining cups of the opponent, both racks
 *   reset, starting player alternates, and a new round begins.
 * - Redemption failure: missing on redemption ends the game; the clearing player wins.
 * - Concession / forfeit handling.
 */

import { setup, assign, createActor } from 'xstate';

export const PongEvents = Object.freeze({
  PONG_SHOT: 'PONG_SHOT',
  CONCEDE: 'CONCEDE',
  RESET: 'RESET',
});

export const PongPhases = Object.freeze({
  TURN: 'turn',
  REDEMPTION: 'redemption',
  ROUND_RESET: 'round_reset',
  GAME_OVER: 'game_over',
});

/**
 * Creates initial rack of cups for a team.
 *
 * @param {'home'|'away'} team
 * @param {number} [count=10]
 * @returns {Array<{ id: string, rackIndex: number, team: string, active: boolean }>}
 */
export function createInitialCups(team, count = 10) {
  return Array.from({ length: count }, (_, i) => ({
    id: `${team}-${i}`,
    rackIndex: i,
    team,
    active: true,
  }));
}

/**
 * Creates initial session context for a Putt Pong match.
 *
 * @param {object} options
 * @param {{ id: string, name: string, color?: number }} options.homePlayer
 * @param {{ id: string, name: string, color?: number }} options.awayPlayer
 * @param {number} [options.rackSize=10]
 * @returns {object}
 */
export function createInitialPongContext({ homePlayer, awayPlayer, rackSize = 10 } = {}) {
  if (!homePlayer?.id || !awayPlayer?.id) {
    throw new Error('Both homePlayer and awayPlayer with valid ids are required');
  }
  return {
    roundNumber: 1,
    rackSize,
    starterPlayerId: homePlayer.id,
    activePlayerId: homePlayer.id,
    homePlayer: { ...homePlayer, team: 'home' },
    awayPlayer: { ...awayPlayer, team: 'away' },
    homeCups: createInitialCups('home', rackSize),
    awayCups: createInitialCups('away', rackSize),
    turn: {
      turnNumber: 1,
      playerId: homePlayer.id,
      shotsRemaining: 2,
      shotsTaken: 0,
      sinks: 0,
      bonusAwarded: false,
    },
    redemption: null,
    clearedBy: null,
    winner: null,
    history: [],
  };
}

/** Helper to check whether a shot hits an active opposing cup. */
function resolveShotTarget(c, e) {
  const isHome = c.activePlayerId === c.homePlayer.id;
  const targetRackKey = isHome ? 'awayCups' : 'homeCups';
  const targetCup = (e.hit && e.cupId && !e.timedOut)
    ? c[targetRackKey].find(cup => cup.id === e.cupId && cup.active)
    : null;
  const isHit = !!targetCup;
  const remainingActive = c[targetRackKey].filter(cup => cup.active).length;
  return { isHome, targetRackKey, targetCup, isHit, remainingActive };
}

/**
 * Creates an XState 5 state machine for a 1v1 Putt Pong match.
 *
 * @param {object} initialContext
 * @returns {import('xstate').StateMachine}
 */
export function createPongMachine(initialContext) {
  return setup({
    guards: {
      canConcede: ({ context: c, event: e }) =>
        !c.winner && (e.playerId === c.homePlayer.id || e.playerId === c.awayPlayer.id),

      // Turn guards
      isTurnClearedRack: ({ context: c, event: e }) => {
        if (e.playerId !== c.activePlayerId || c.turn.shotsRemaining <= 0) return false;
        const { isHit, remainingActive } = resolveShotTarget(c, e);
        return isHit && remainingActive === 1;
      },
      canShootTurn: ({ context: c, event: e }) =>
        e.playerId === c.activePlayerId && c.turn.shotsRemaining > 0,

      // Redemption guards
      isRedemptionMiss: ({ context: c, event: e }) => {
        if (e.playerId !== c.activePlayerId || !c.redemption || c.redemption.shotsRemaining <= 0) return false;
        const { isHit } = resolveShotTarget(c, e);
        return !isHit;
      },
      isRedemptionTie: ({ context: c, event: e }) => {
        if (e.playerId !== c.activePlayerId || !c.redemption || c.redemption.shotsRemaining <= 0) return false;
        const { isHit, remainingActive } = resolveShotTarget(c, e);
        return isHit && remainingActive === 1;
      },
      canShootRedemption: ({ context: c, event: e }) =>
        e.playerId === c.activePlayerId && c.redemption && c.redemption.shotsRemaining > 0,
    },
    actions: {
      handleClearingTurnShot: assign(({ context: c, event: e }) => {
        const { isHome, targetRackKey, targetCup } = resolveShotTarget(c, e);
        const updatedRack = c[targetRackKey].map(cup => cup.id === e.cupId ? { ...cup, active: false } : cup);
        const defendingPlayerId = isHome ? c.awayPlayer.id : c.homePlayer.id;

        return {
          ...c,
          [targetRackKey]: updatedRack,
          clearedBy: c.activePlayerId,
          activePlayerId: defendingPlayerId,
          redemption: {
            playerId: defendingPlayerId,
            shotsRemaining: 1,
            sinks: 0,
          },
          history: [...c.history, {
            round: c.roundNumber,
            turn: c.turn.turnNumber,
            playerId: c.activePlayerId,
            isRedemption: false,
            hit: true,
            cupId: targetCup.id,
            clearedRack: true,
          }],
        };
      }),

      handleTurnShot: assign(({ context: c, event: e }) => {
        const { isHome, targetRackKey, targetCup, isHit } = resolveShotTarget(c, e);
        const updatedRack = isHit
          ? c[targetRackKey].map(cup => cup.id === e.cupId ? { ...cup, active: false } : cup)
          : c[targetRackKey];

        const shotsRemaining = c.turn.shotsRemaining - 1;
        const shotsTaken = c.turn.shotsTaken + 1;
        const sinks = c.turn.sinks + (isHit ? 1 : 0);

        // Bonus balls: sinking two in a row in a turn earns two extra balls ("balls back")
        let bonusAwarded = c.turn.bonusAwarded;
        let extraShots = 0;
        if (sinks === 2 && !bonusAwarded) {
          bonusAwarded = true;
          extraShots = 2;
        }
        const finalShotsRemaining = shotsRemaining + extraShots;

        const historyEntry = {
          round: c.roundNumber,
          turn: c.turn.turnNumber,
          playerId: c.activePlayerId,
          isRedemption: false,
          hit: isHit,
          cupId: targetCup ? targetCup.id : (e.cupId || null),
          timedOut: !!e.timedOut,
          bonusAwarded: extraShots > 0,
        };

        if (finalShotsRemaining > 0) {
          return {
            ...c,
            [targetRackKey]: updatedRack,
            turn: {
              ...c.turn,
              shotsRemaining: finalShotsRemaining,
              shotsTaken,
              sinks,
              bonusAwarded,
            },
            history: [...c.history, historyEntry],
          };
        }

        // Turn complete: alternate to next player
        const nextPlayerId = isHome ? c.awayPlayer.id : c.homePlayer.id;
        return {
          ...c,
          [targetRackKey]: updatedRack,
          activePlayerId: nextPlayerId,
          turn: {
            turnNumber: c.turn.turnNumber + 1,
            playerId: nextPlayerId,
            shotsRemaining: 2,
            shotsTaken: 0,
            sinks: 0,
            bonusAwarded: false,
          },
          history: [...c.history, historyEntry],
        };
      }),

      handleRedemptionMiss: assign(({ context: c, event: e }) => ({
        ...c,
        winner: c.clearedBy,
        redemption: {
          ...c.redemption,
          shotsRemaining: 0,
        },
        history: [...c.history, {
          round: c.roundNumber,
          playerId: c.activePlayerId,
          isRedemption: true,
          hit: false,
          timedOut: !!e.timedOut,
          redemptionFailed: true,
        }],
      })),

      handleRedemptionTie: assign(({ context: c, event: e }) => {
        const nextStarter = (c.starterPlayerId === c.homePlayer.id) ? c.awayPlayer.id : c.homePlayer.id;
        return {
          ...c,
          roundNumber: c.roundNumber + 1,
          starterPlayerId: nextStarter,
          activePlayerId: nextStarter,
          homeCups: createInitialCups('home', c.rackSize),
          awayCups: createInitialCups('away', c.rackSize),
          turn: {
            turnNumber: 1,
            playerId: nextStarter,
            shotsRemaining: 2,
            shotsTaken: 0,
            sinks: 0,
            bonusAwarded: false,
          },
          redemption: null,
          clearedBy: null,
          winner: null,
          history: [...c.history, {
            round: c.roundNumber,
            playerId: c.activePlayerId,
            isRedemption: true,
            hit: true,
            cupId: e.cupId,
            redemptionSucceeded: true,
          }],
        };
      }),

      handleRedemptionHit: assign(({ context: c, event: e }) => {
        const { targetRackKey } = resolveShotTarget(c, e);
        const updatedRack = c[targetRackKey].map(cup => cup.id === e.cupId ? { ...cup, active: false } : cup);
        return {
          ...c,
          [targetRackKey]: updatedRack,
          redemption: {
            playerId: c.activePlayerId,
            shotsRemaining: 1, // Sinking earns an extra ball
            sinks: c.redemption.sinks + 1,
          },
          history: [...c.history, {
            round: c.roundNumber,
            playerId: c.activePlayerId,
            isRedemption: true,
            hit: true,
            cupId: e.cupId,
          }],
        };
      }),

      handleConcede: assign(({ context: c, event: e }) => {
        const winner = e.playerId === c.homePlayer.id ? c.awayPlayer.id : c.homePlayer.id;
        return {
          ...c,
          winner,
          history: [...c.history, { type: 'CONCEDE', playerId: e.playerId, winner }],
        };
      }),
    },
  }).createMachine({
    id: 'pongSession',
    initial: initialContext?.phase === 'redemption' ? 'redemption' : initialContext?.phase === 'game_over' ? 'gameOver' : 'turn',
    context: initialContext,
    states: {
      turn: {
        on: {
          PONG_SHOT: [
            {
              guard: 'isTurnClearedRack',
              target: 'redemption',
              actions: 'handleClearingTurnShot',
            },
            {
              guard: 'canShootTurn',
              actions: 'handleTurnShot',
            },
          ],
          CONCEDE: {
            guard: 'canConcede',
            target: 'gameOver',
            actions: 'handleConcede',
          },
        },
      },
      redemption: {
        on: {
          PONG_SHOT: [
            {
              guard: 'isRedemptionMiss',
              target: 'gameOver',
              actions: 'handleRedemptionMiss',
            },
            {
              guard: 'isRedemptionTie',
              target: 'turn',
              actions: 'handleRedemptionTie',
            },
            {
              guard: 'canShootRedemption',
              actions: 'handleRedemptionHit',
            },
          ],
          CONCEDE: {
            guard: 'canConcede',
            target: 'gameOver',
            actions: 'handleConcede',
          },
        },
      },
      gameOver: {
        type: 'final',
      },
    },
  });
}

/**
 * Creates and starts a PongSession coordinator.
 * Conforms to the shared session observer pattern (getSnapshot, send, subscribe, dispose).
 *
 * @param {object} options
 * @param {{ id: string, name: string, color?: number }} options.homePlayer
 * @param {{ id: string, name: string, color?: number }} options.awayPlayer
 * @param {number} [options.rackSize=10]
 * @param {object} [options.clock]
 * @returns {object}
 */
export function createPongSession({
  homePlayer,
  awayPlayer,
  rackSize = 10,
  context = null,
  clock,
} = {}) {
  const initialContext = context ? {
    ...context,
    turn: context.turn ? { ...context.turn } : {
      turnNumber: context.turnNumber ?? 1,
      playerId: context.activePlayerId,
      shotsRemaining: context.shotsRemaining ?? 2,
      shotsTaken: 0,
      sinks: context.turnSinks ?? 0,
      bonusAwarded: context.bonusAwarded ?? false,
    },
    history: context.history ? [...context.history] : [],
  } : createInitialPongContext({ homePlayer, awayPlayer, rackSize });
  const machine = createPongMachine(initialContext);
  const actor = createActor(machine, { ...(clock ? { clock } : {}) });

  let disposed = false;
  actor.start();

  const getSnapshot = () => {
    const snap = actor.getSnapshot();
    const c = snap.context;
    const homeRemaining = c.homeCups.filter(cup => cup.active).length;
    const awayRemaining = c.awayCups.filter(cup => cup.active).length;
    const phase = snap.matches('gameOver')
      ? PongPhases.GAME_OVER
      : snap.matches('redemption')
      ? PongPhases.REDEMPTION
      : PongPhases.TURN;

    return {
      phase,
      roundNumber: c.roundNumber,
      turnNumber: c.turn?.turnNumber ?? 0,
      starterPlayerId: c.starterPlayerId,
      activePlayerId: c.activePlayerId,
      homePlayer: { ...c.homePlayer },
      awayPlayer: { ...c.awayPlayer },
      homeCups: c.homeCups.map(cup => ({ ...cup })),
      awayCups: c.awayCups.map(cup => ({ ...cup })),
      remainingHomeCups: homeRemaining,
      remainingAwayCups: awayRemaining,
      rackSize: c.rackSize || 10,
      shotsRemaining: snap.matches('redemption')
        ? (c.redemption?.shotsRemaining ?? 0)
        : (c.turn?.shotsRemaining ?? 0),
      turn: c.turn ? { ...c.turn } : null,
      turnSinks: c.turn?.sinks ?? 0,
      bonusAwarded: c.turn?.bonusAwarded ?? false,
      redemption: c.redemption ? { ...c.redemption } : null,
      clearedBy: c.clearedBy,
      winner: c.winner,
      isGameOver: snap.matches('gameOver'),
      history: c.history ? [...c.history] : [],
      historyLength: c.history.length,
    };
  };

  return {
    getSnapshot,
    send(event) {
      if (disposed || !event || typeof event !== 'object' || typeof event.type !== 'string') return false;
      const before = actor.getSnapshot();
      try {
        actor.send(structuredClone(event));
      } catch {
        return false;
      }
      return before !== actor.getSnapshot();
    },
    subscribe(listener) {
      const sub = actor.subscribe(() => listener(getSnapshot()));
      return () => sub.unsubscribe();
    },
    dispose() {
      disposed = true;
      actor.stop();
    },
  };
}
