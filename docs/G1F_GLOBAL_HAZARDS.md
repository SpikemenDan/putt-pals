# G1f global hazards — implementation notes

Status: implementation underway, 2026-11-04. Issue: [G1f #93](https://github.com/SpikemenDan/putt-pals/issues/93).
Contributor: Codex, local branch `feat/global-hazards`; remote claim not published.

G1e is integrated on main. This branch adds timed hazard records, room snapshots,
catalog entries, deterministic evaluation, fixed-step physics hooks, HUD/audio,
and a local tuning preview. Owner feel acceptance was received on 2026-11-04.
Current defaults match the accepted preview; integration checks remain. Inventory
is client-held in this build, so a room validates phase, policy, and membership
but cannot verify that a sender owns the catalog item.

## Observable completion

Players can activate Rain, Snow, Wind, Lightning, Tornado and Hurricane from
inventory in a private multiplayer room. Every client sees the same active
hazards, roaming positions and expiry, including after reconnect and controller
succession. Each client applies effects only to its own ball. Solo and Practice
exclude these multiplayer hazards, and No Power-Ups creates none. With no active
hazard, existing physics results remain bit-identical.

The owner previews activation, direction/target selection, weather indicators,
forces and friction with developer controls before appearance or feel is
accepted. Technical checks and owner acceptance remain separate gates.

## Behavior proposal

| Hazard | Gameplay | Selection and lifetime |
| --- | --- | --- |
| Rain | Reduce rolling friction and constant drag on supported surfaces; preserve zero ice drag. | Whole room, timed. |
| Snow | Increase rolling friction and constant drag. | Whole room, timed. |
| Wind | Apply a horizontal gust acceleration in the chosen direction. | Direction selector with confirm/cancel, timed. |
| Lightning | Apply one seeded horizontal impulse to the chosen player's ball. | Connected opponent selector, one accepted strike. |
| Tornado | Roam on a seeded path and fling nearby balls outward with lift. | Whole room, timed. |
| Hurricane | Roam on a seeded path and pull nearby balls inward. | Whole room, timed. |

The owner accepted the preview behavior and current values on 2026-11-04. Rain replaces
Snow and vice versa; a new activation replaces the prior instance of the same
kind. Other timed kinds have one active instance per kind. A confirmed activation
consumes the item after the room snapshot confirms it; cancelling consumes none.
Global effects include the activating player's ball. Lightning targets a single
opponent, unlike the existing aim attacks broadcast through presence.

## Existing implementation constraints

- `src/gameplay/catalog.js` includes global-target timed power-ups alongside
  the G1e course-target deployables.
- The G1f flow uses explicit room activation commands and snapshots rather than
  the presence `fx: {id, t}` attack message.
- `src/app/putt.js` supplies hazard time in seconds derived from
  `(roomNow() - roundStartTime) / 1000`. Use that time basis consistently; avoid
  independent browser clocks and streamed vortex positions.
- `src/simulation/physics.js` currently skips stationary balls. A Lightning strike
  or nearby roaming hazard needs an explicit wake path, while sunk, waiting,
  disconnected and spectator players must remain protected.
- The server room stores global hazard records beside deployables, validates
  their exact shape and scope, and includes them in durable snapshots. Hazard
  sequence state is checkpointed to keep activation IDs unique after recovery.
  Inventory possession remains client-held and is not server-verified.

## Authority and lifecycle

Use explicit activation commands and snapshot state, rather than stretching the
presence attack format. The service validates room phase, power-up policy,
sender identity, target membership, finite direction, message bounds and
activation limits. Rejected activations leave the local item unchanged.

Timed records need a unique activation id, catalog kind, owner, round and putt
identity, authoritative start time, expiry time, seed and optional direction.
Lightning additionally stores its target. Unknown fields and kinds are rejected
at the boundary, and persisted state is validated again on recovery.

The server assigns the seed and timing using injected sources. Derive Lightning's
direction from its seed once. A client applies each accepted strike at most once;
snapshot replay or reconnect must never fire it again. Persist enough sequence
state to distinguish missed events from already applied ones, and define whether
a disconnected target's missed strike expires rather than being replayed later.

Clear timed effects and pending strikes on putt changes, round restart and return
to lobby. Reconnect restores only unexpired effects for the current scope.
Controller succession must not reset seeds or lifetime. Resume roaming position
from room time, never from local accumulated frame count.

## Simulation and tuning

Put pure hazard evaluation in a dedicated module, consuming validated records,
course bounds, synchronized time and tuning. Return friction multipliers,
accelerations and one-shot domain events. Derive a bounded roaming path from the
seed and elapsed room time; constrain its centre to course bounds and document
how it crosses gaps. Rendering consumes the same path function.

Apply surface modifiers to both exponential friction and constant drag, only
while grounded. Preserve sand, slime and ice distinctions. Apply continuous
forces inside fixed physics steps, including adaptive cup-crossing substeps;
one-shot strikes must never repeat per substep. Use a bounded wake distance and
finite centre behavior for vortices. No collision, stroke count or cup rules
change when a hazard is inactive.

Extend `src/shared/tuning.js`; do not add a second defaults store. Document units,
ranges and effects in `docs/TUNING.md` and add configuration metadata. Required
settings include timed durations (seconds), weather multipliers, Wind acceleration
(world units/s²), Lightning impulse (world units/s), vortex range and roam radius
(world units), period (seconds), pull/fling acceleration and lift. Gameplay values
are preview candidates until tried by the owner. Ordinary online rooms cannot
receive temporary gameplay overrides.

Keep gameplay weather distinct from `src/render` ambient weather. Active Rain or
Snow needs an explicit timed HUD indicator so scenery never implies a friction
change. Wind shows its direction; Lightning shows its selected target and strike;
vortices show their effect radius. Reuse original procedural rendering and audio,
with explicit disposal. Add preview controls using the established panel patterns;
gameplay changes reset the preview rather than mutating an active match.

## Remaining implementation and verification

Focused coverage in `tests/global-hazards.test.cjs` passes for activation shape,
seed repeatability, time/scope boundaries, finite vortex centres, weather
replacement, actual roll distance changes, directional Wind, inactive parity,
guest command handling and No Power-Ups filtering. It runs in `test:simulation`.
Contract, network, simulation, UI, app, course, session, audio and build checks
have passed during this implementation. The legacy renderer scene comparison
fails at child 26 with hashes `2b2bfc4a2e9ace66` / `0c19ecddfaf42715`;
the identical failure was reproduced from a clean `origin/main` source snapshot.
The renderer failure is existing evidence, not a passed check.

1. One-shot Lightning targeting, snapshot deduplication and missed-strike expiry
   after reconnect are covered by the focused hazard tests.
2. Finish protocol and durable recovery checks for policy filtering, reconnect,
   expiry and controller succession.
3. Independently verify Rain rolls farther, Snow rolls less, Wind pushes in the selected
   direction, Lightning affects only its target once, Tornado flings and Hurricane
   pulls. Test sunk/resting/airborne balls and interactions with existing effects.
4. Test duplicate/rejected commands, scope resets, policy filtering, reconnect,
   durable recovery, expiry and controller succession.
5. Open the development preview, exercise each hazard and tuning import/export,
   and inspect browser errors before treating the preview as reviewed;
6. Select checks with `npm run checks`. Run relevant contract, simulation,
   network, session, app, renderer, audio and browser suites plus build. Follow
   `docs/GITHUB_WORKFLOW.md` for simulation fingerprint changes; do not replace
   fixtures to conceal a trajectory regression. Rerun affected solver/acceptance
   evidence when hazards or geometry change those scenarios.

The local preview is at
`http://127.0.0.1:5175/tests/fixtures/global-hazards/preview.html`.
Chromium exercised all six selectors, activation, launch/reset, defaults reset,
validated import/export and invalid import rejection without page errors. The
preview runs the shared physics step with isolated candidate hazard settings.
The full local Worker suite also passes. The owner accepted the local preview
on 2026-11-04 ("good"), including the current tuning defaults. CLI, app, physics,
input, UI, contracts and out-of-bounds integration checks pass after the solver
refresh. Full online browser acceptance and current-head CI remain merge gates.

The 2026-11-04 solver refresh (`node tests/measure-cup-capture.mjs`) reproduces
all 36 previous outcomes exactly, with 34 robust hole-in-one results and the
same two known robustness gaps (19/0 and 19/2). The measurement exits 1 for those
gaps; it does not establish complete par-route acceptance. The generated source
fingerprint is current. No active hazards are included in these baseline shots.
