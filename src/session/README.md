# Host-owned room lifecycle

L1 implements the local room coordinator as an XState 5 actor. It has no DOM, renderer, audio or transport dependency. I1/N1 adopted it in the modular PeerJS app; the legacy browser game is unchanged. N4a's server-room contract is accepted at `b30552f`, while server-side authority, durable restore and WebSocket adoption remain unimplemented in N4c–N4e.

```js
import { createRoomSession, SessionEvents } from './src/session/index.js';

const session = createRoomSession({
  hostId: 'host-peer-id',
  hostName: 'Host',
  clock: {
    now: () => performance.now(),
    setTimeout: (callback, delay) => setTimeout(callback, delay),
    clearTimeout: id => clearTimeout(id),
  },
});
const unsubscribe = session.subscribe(snapshot => renderRoom(snapshot));
session.send({ type: SessionEvents.START_VOTING, playerId: 'host-peer-id' });
// Later: unsubscribe(); session.dispose();
```

`clock` is required and must provide monotonic milliseconds plus timeout scheduling. `courses` optionally accepts the validated normalized course array from `createCourseDocument()` or `parseCourseDocument()`. Inputs and returned snapshots are independently owned. Call `getSnapshot()` for the current state; subscriptions receive subsequent actor updates. Stop/dispose cancels actor timers and rejects further commands.

## Boundary and authority

Run one coordinator per room on the host. This module does not authenticate peers: the transport must bind each event's `playerId` to the actual sender, rather than forwarding a self-declared ID. It does enforce membership, host-only commands, phases, eligible maps, room capacity and current-round score tokens. Unknown events and XState internal timer events are rejected at the public boundary.

`send(event)` returns whether a command changed actor context. Ignored, malformed, unauthorized or stale commands return false. Snapshots expose flat C1 fields (`phase`, `mode`, `mapIndex`, `puttIndex`, `roundNumber`, `roundStartTime`, `votingDeadline`, `roster`, `players`, `completedMaps`) plus `totals`, `last`, `hostId` and the nested XState `state`. These are domain snapshots, not the legacy wire protocol; N1 must translate/validate messages at its boundary.

| Event | Payload and scope |
| --- | --- |
| JOIN_ROOM | `playerId`, text-only `name`; validates identity/name and capacity; late joins spectate until the next map |
| LEAVE_ROOM | Sender's `playerId`; removes its vote and active participation; no host migration |
| SET_MODE | Host, lobby only; C1 GameModes value; practice modes require solo membership |
| SET_POWERUPS | Host, lobby only; `{ enabled: boolean }` sets the room's `powerups` flag (default true). false is the No Power-Ups mode (GM1): no `?` boxes, no inventory. Works with Standard and Tournament modes; practice always keeps power-ups on |
| START_VOTING | Host, lobby only; clears the new series' scores/totals |
| CAST_VOTE | Connected sender and eligible starter `mapIndex` |
| START_ROUND | Host in putt-practice selection only, `puttIndex`; uses the host's selected map |
| UPDATE_STROKES | Participating sender, current `roundNumber`/`puttIndex`, monotonic nonnegative safe-integer `strokes` |
| REPORT_SCORE | Same round token and count; optional boolean `timedOut`; timeout reports require the actual deadline; duplicate completion is rejected |
| RETURN_TO_LOBBY | Host at results: next tournament selection, practice selection, or lobby after the series; also exits putt practice during play |
| PRACTICE_STEP | Host in putt practice, `step: -1, 0, 1` for previous/restart/next with wrapping |
| PRACTICE_MAPS | Host in putt practice; returns to map/putt selection |

Normal map starts and putt/result advancement are automatic guarded transitions. The shared contract's ADVANCE_PUTT/FINISH_ROUND constants are not manual bypasses. `canExecuteCommand()` is a broad phase hint; the actor's mode, membership, authority and timing guards decide acceptance.

## Preserved timing and scoring

The first normal vote starts 15 seconds; subsequent votes do not reset that deadline. If all valid voters disconnect, the original deadline remains; a later valid vote after it expires starts the map countdown immediately, matching the legacy host. All connected voters completing early starts the chosen map. Voting uses the shared legacy rotating tie-break formula, ignoring disconnected votes. Course practice selects immediately; putt practice separately selects a putt and has no voting countdown.

Normal starts publish a 2500ms start timestamp. All-done advancement waits until at least 1500ms after that timestamp. The host fallback scores unfinished players at `start + limitSeconds * 1000 + 4000ms`, preserving legacy coordination grace. A local client/simulation adapter should report its own timeout at the actual deadline using the supplied round token. Putt practice has no timeout, no scorecard/tournament scoring, and loops after a 2200ms post-completion pause once the minimum-play window has elapsed.

Timeouts preserve `max(strokes, par + penalty)`, including zero penalties and strokes above 99. N1 reconciles the shared timeout helper and protocol with this uncapped behavior: wire stroke/score counts accept nonnegative safe integers, including 150. L1's existing larger-stroke safeguard remains compatible. No anti-cheat or identity recovery is claimed by trusting a participant's stroke report.

Scorecards retain each putt once; disconnected participants get null entries and do not block advancement. Late joins remain spectators across all putts of the current map and join the next map's roster. Reconnecting the same trusted identity preserves its existing score state; network recovery itself is outside this module. Tournament totals and tied map wins accumulate for 3/6/9 maps, then reset on returning to the lobby. Host departure returns the local coordinator to the lobby and cancels pending room timers; another peer is not promoted automatically.

## Verification

`npm run test:session` uses XState's SimulatedClock with explicit deadline steps. It covers voting deadlines/ties, host guards/internal-event rejection, stale tokens, starts/timeouts/no stroke cap, six-putt cards, 3/6/9-map totals, spectators/disconnects, course practice, replay controls/loops, zero penalties, unusual peer IDs, detached snapshots and cleanup. The command is in `npm test` and CI. These tests verify the headless coordinator, not browser/transport integration.

Local L1 verification: `npm test` passed end-to-end (including the lifecycle scenarios, contracts, simulation/course/CLI checks, physics and both legacy jsdom/fake-network smoke suites). `npm run build` preserved the embedded scripts. Baseline inventory and both course/arena export checks passed. The exact XState 5.33.3 dependency/lockfile, CI YAML/script references and scoped whitespace/syntax checks were verified. No real-browser or real-network adoption test is claimed.
