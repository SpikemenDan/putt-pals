# G1e deployables — local review candidate

Codex owns G1e on `feat/deployables`, from main `d7d7dbe`, following the owner's
2026-11-03 instruction to continue G1e as well as G1f. The earlier worker's named
branch and checkout were not present in this clone; no files were overwritten.
The claim is local and has not been published to issue #92.

Owned paths: gameplay catalog/effects and new deployable modules; simulation
hooks; server-room contracts, runtime and recovery; app/input integration;
renderer and audio; corresponding tests, tuning and this documentation.
The owner also authorized adding pickup boxes to the six online maps, one per
chamber (36 total). They are non-colliding and follow nominal opening routes.
Independent geometry checks cover their floor/chamber positions, current-data
renderer tests cover their actors, and a real Chrome/local Worker test proves a
physical opening shot earns an item once and broadcasts the inventory.
Historical physical-geometry and scene fixtures remain unchanged; their harnesses
remove only these approved new pickup actors before legacy comparison.

G1f remains a separate dependent implementation; its design branch is preserved.

## Result

Bumper and Orbital Bumper are multiplayer-only inventory entries. Select one,
move the placement ghost to clear level ground, then left-click to confirm.
Right-click or Escape cancels without spending the item. Tees, cups, pickups,
walls, unsupported ground, steep surfaces and overlapping placements are rejected.
Room and per-player limits are 12 and 2. Each object affects its owner too,
has no timeout, and disappears after three accepted impacts. Orbital Bumper
adds a fading inward force and two visible range rings. Lights show remaining
impacts. Ghost Ball skips the solid body; Sticky Ball stops on contact.

The service owns pickup receipts, bounded inventories, placement acceptance and
impact counts. A pickup needs a recent, nearby client presence; it can be claimed
only once per player per putt. Placement spends an owned slot only on acceptance.
Impact reports require nearby presence and are limited to one per object per
250 ms. Client physics and client-reported positions remain trusted; this is not
anti-cheat or proof that a reported impact physically happened.

The top-level server snapshot's optional `gameplay` record is validated and
checkpointed, including inventories, pickup receipts, last activations, objects,
and impact cooldowns. A checkpoint without gameplay loads empty state only if its
course/configuration compatibility hash matches; v2 rooms are not migrated. Objects
reset when the putt/round changes or the room returns to the lobby. Only tournament
inventories carry across putts. Reconnect restores inventory and objects; old
self-effect activations are not replayed into the new ball instance.

The server wire version is **3**, distinct from the retained local transport's
`PROTOCOL_VERSION = 1`. Versioned Durable Object names consequently use `v3`:
existing v2 rooms and resume identities are not migrated into that namespace.
The handshake course hash now covers the course document plus TUNING, so mismatched
gameplay settings are rejected while DISPLAY preferences remain local.
Clients and Worker must be released together; deployment is not authorized by
this local work. Checkpoint schema/rules versions remain unchanged because the
gameplay record is additive and old checkpoints are supported by the new code.
An old server cannot read a new checkpoint with the extra field.

## Preview and acceptance

Run `npm run dev`, then open
`/tests/fixtures/deployables/preview.html`. The chamber uses the production input,
simulation and renderer with local objects; it does not simulate room authority.
It offers sliders with units/ranges/defaults, per-field and global reset, and
validated import/export. Changes reset the chamber and remain temporary. No
online room receives preview overrides. Shipped values remain in
`src/shared/tuning.js`.

Chrome headless exercised Bumper and Orbital test shots and right-click
cancellation with no page/console errors. All 7 physics sliders rendered.
Validated import/export, rejection without partial application, reset and the
approved default values were also exercised in Chrome. This is real
browser chamber evidence, separate from fake-socket durable tests and hosted
multi-client gameplay. The owner approved Orbital pull 1000 and requested bumper height 7 on 2026-11-03.
Those values are now authoritative. The owner refreshed the preview and
confirmed the shorter appearance looks right on 2026-11-03.

## Verification

Passing so far: `test:contracts`, `test:simulation` (including new authority,
collision, policy, resting-ball acceleration and input placement checks), `test:input`, `test:app`,
`test:ui`, `test:audio`, `node tests/render-modern.test.cjs`,
`node tests/rooms/durable-recovery.test.mjs`,
`node tests/rooms/server-client.test.mjs`, and build.

The legacy scene-parity suite already failed on untouched main before this work
(`follow full scene @2016.7`, Mesh child 26). It remains a separate known failure;
do not change its expected geometry hashes to conceal it.

`node tests/measure-cup-capture.mjs` regenerates the source-fingerprinted inactive
solver evidence. Its expected two unresolved robust-shot gaps (5/5 and 19/2)
remain release limitations; a nonzero exit must not be reported as a complete
solver pass. `npm test` reaches the same pre-existing scene-parity failure after check,
contracts, simulation, session, network and audio pass. The app/UI/current renderer
checks were run separately after the pickup additions and passed.
`npm run test:rooms:local` passed its real local Wrangler/workerd routing,
controller/recovery, capacity and four-player six-putt game checks.
Chrome (installed channel) passed `tests/browser/input.spec.cjs` and the new
`tests/browser/deployables.spec.cjs`. Firefox, WebKit, deployed play and actual
audio listening were not run for this task.

Final provenance verification confirmed all 36 measured inactive outcomes are
identical to main, with 34 robust shots and the same two gaps. CLI tests passed.
The check-selection guard initially flagged the isolated preview as unmapped;
a manual-browser note now covers development-only preview modules, and all eight
check-selection scenarios pass.
