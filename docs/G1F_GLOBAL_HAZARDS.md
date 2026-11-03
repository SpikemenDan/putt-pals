# G1f global hazards — proposed implementation

Status: design only, 2026-11-03. Issue: [G1f #93](https://github.com/SpikemenDan/putt-pals/issues/93).
Contributor: Codex, local branch `feat/global-hazards`, based on `d7d7dbe`.
The claim has not been published; remote writes are not authorized.

The owner requested G1f, but could not confirm exclusive ownership or a path
split with the active G1e contributor. Do not edit the overlapping catalog,
simulation, renderer, app integration or shared contracts until that work lands
or ownership is coordinated. This document proposes a design; it does not
establish an agreed contract with G1e or implement any hazard.

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

These choices refine the vision and require preview acceptance. Propose replacing
Rain with Snow and vice versa, rather than multiplying opposing weather factors.
Propose one active instance per timed kind; reactivation refreshes its lifetime.
Specify replacement, refresh and room caps in tests before integration. A
confirmed activation consumes the item once; cancelling a selector consumes none.
Global effects include the activating player's ball. Lightning targets a single
opponent, unlike the existing aim attacks broadcast through presence.

## Existing implementation constraints

- `src/gameplay/catalog.js` currently has self and opponent targets and next-shot
  and stroke durations. G1e also needs a course target and a new lifetime model:
  reconcile these additions once rather than independently extending the schema.
- `src/app/putt.js` currently activates items locally, consumes inventory, and
  exposes an opponent attack as presence `fx: {id, t}`. That message has no chosen
  target, direction, seed, authoritative start time or persistent lifetime.
- `src/app/putt.js` already supplies hazard time in seconds derived from
  `(roomNow() - roundStartTime) / 1000`. Use that time basis consistently; avoid
  independent browser clocks and streamed vortex positions.
- `src/simulation/physics.js` currently skips stationary balls. A Lightning strike
  or nearby roaming hazard needs an explicit wake path, while sunk, waiting,
  disconnected and spectator players must remain protected.
- The server room currently receives client presence and stroke updates. Do not
  claim it verifies inventory ownership merely because a catalog id is valid.
  G1e's proposed server activation/inventory path must be reconciled with G1f.

## Proposed authority and lifecycle

Use explicit activation commands and snapshot state, rather than stretching the
presence attack format. The service validates room phase, power-up policy,
sender identity, target membership, finite direction, message bounds, inventory
ownership, activation limits and duplicate request ids. Inventory consumption and
hazard creation must be one accepted operation; rejected requests leave inventory
unchanged. The required authoritative inventory design is an integration
dependency, not functionality already present.

Timed records need a unique activation id, catalog kind, owner, round and putt
identity, authoritative start time, expiry time, seed and optional direction.
Lightning additionally needs its target and a bounded event sequence. Exact
field names, limits, version changes and snapshot schema are deferred until the
G1e contract is reconciled. Unknown fields and kinds must be rejected at the
boundary, and persisted state validated again on recovery.

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

## Implementation and verification after coordination

1. Reconcile G1e catalog, activation, inventory, protocol and snapshot changes;
   update validators, consumers, mocks and version compatibility together.
2. Add the pure evaluator and tests for seed repeatability, time boundaries,
   finite centres, opposing weather replacement and inactive identity.
3. Integrate fixed-step friction, impulses, force and wake behavior. Independently
   verify Rain rolls farther, Snow rolls less, Wind pushes in the selected
   direction, Lightning affects only its target once, Tornado flings and Hurricane
   pulls. Test sunk/resting/airborne balls and interactions with existing effects.
4. Test duplicate/rejected commands, inventory consumption, scope resets, policy
   filtering, reconnect, durable recovery, expiry and controller succession.
5. Add indicators, selection flows, audio and development preview controls;
   inspect browser errors and present the preview for owner feedback.
6. Select checks with `npm run checks`. Run relevant contract, simulation,
   network, session, app, renderer, audio and browser suites plus build. Follow
   `docs/GITHUB_WORKFLOW.md` for simulation fingerprint changes; do not replace
   fixtures to conceal a trajectory regression. Rerun affected solver/acceptance
   evidence when hazards or geometry change those scenarios.

No implementation, hazard tests, browser preview or owner acceptance is claimed
by this design document. Current blocker: overlapping G1e paths are uncoordinated.
