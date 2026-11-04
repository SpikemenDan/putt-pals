# G1e deployables: proposed contract (DRAFT for the integration owner)

Status: draft, not agreed. Issue: #92. Branch: `agent/g1e-deployables`. Revision 2 (adds the vertical and airborne rules the owner asked for on 2026-11-03).

Scope: the wire, tuning and simulation-rule surface for Bumper and Orbital Bumper. Sections 1 to 6 describe what is built on the branch; sections 7 to 10 are the new airborne and multi-level rules, which are specification only until the owner accepts them (the code on the branch currently ignores `z`, which is exactly what the rules below keep for a rolling ball).

Owner approval on record: the Bumper and Orbital Bumper force and designs are accepted as they are. Their rolling-ball force and look do not change in this revision.

## 1. Object record

A deployed object is a plain record, JSON-safe, with exactly these keys:

| Key | Type | Rule |
|---|---|---|
| `id` | string | `validId`; unique within the room, assigned by the host as `d<sequence>` |
| `kind` | string | a catalog id whose entry has `target: 'course'` (`bumper`, `orbital`) |
| `x`, `y` | finite numbers | simulation coordinates (x/y horizontal), `abs <= 1000000` |
| `z` | finite number | **new.** The floor height under the object, assigned by the host at placement (section 8). Never taken from the client. `abs <= 1000000` |
| `owner` | string | `validId`; a player id present in `players` |
| `impacts` | integer | `0 <= impacts < deployables.maxImpacts` (tuning, not a literal); objects at the limit are removed, never sent |
| `placedAt` | finite number | room time (seconds) at placement; the only clock, so no wall-clock reads |
| `map`, `putt` | integers | `index(map, 22)`, `index(putt, 6)`; objects apply only while that putt is in play |

No other keys. Names and free text are not allowed.

## 2. Snapshot

Add one optional key to the host snapshot (`validSnapshot` key list in `src/network/protocol.js` and the matching shared validator in `src/shared/protocol.js`):

- `deployables`: array, `length <= MAX_DEPLOYABLES`, every entry a valid object record, ids unique, every `owner` present in `players`.

Absent means none, so snapshots from before this change stay valid. Objects are cleared on `START_ROUND`, `RETURN_TO_LOBBY` and putt change.

Constants in `src/shared/constants.js`: `MAX_DEPLOYABLES = 200` is a wire safety bound, not a game limit. There is no per-player or per-room game limit (owner decision), and 200 records stay about 20 KB, well under `MAX_MESSAGE_BYTES`.

## 3. Command

One new command, `DEPLOY_OBJECT`, sent by a guest to the host (and applied directly by the host for itself). Fields (the field table in `validCommand`, `src/network/protocol.js`):

- `kind`: catalog id with `target: 'course'`.
- `x`, `y`: finite numbers, same bound as above. The client never sends `z`; the host computes it.

Host-side validation, with a silent drop on failure: sender is a connected player in `play` phase; `kind` is a course-target catalog id; power-ups are enabled for the room; the wire bound is not reached; the placement rules (section 8) hold; no existing object's body overlaps (centres closer than `2 * deployables.bumperRadius`). On success the host assigns `id`, `owner`, `placedAt`, `z`, appends to `deployables`, and the next snapshot carries it. The placing client spends the inventory slot only after it sees its object in the snapshot (peer-to-peer inventory lives on each client; under N4 the server owns the inventory).

## 4. Impact reports

Physics stays client-trusted. A client that bounces off a bumper reports the hit so every client agrees on the remaining lifetime:

- `DEPLOY_HIT` command, field `id` (a `validId`), sent by the client whose ball hit it.
- The host increments `impacts` once per accepted report, rate-limited to one per object per `deployables.hitCooldownMs` (250), ignores unknown ids, and removes the object when `impacts` reaches `deployables.maxImpacts` (3).
- Under N4 the server-room does the same count and rate-limit, and also checks the report against the reporter's latest presence: horizontal distance within `bumperRadius + ball radius + tolerance` and vertical position inside the object's body band (section 7.1, widened by the same tolerance). A client cannot kill an object early by flooding reports or by reporting from elsewhere.

## 5. Versioning

`PROTOCOL_VERSION` stays 1 only if the owner is happy for an old client to ignore an unknown snapshot key. Because `validSnapshot` rejects unknown keys today (`keys(s, [...])`), an old client would reject new snapshots. Recommendation: bump `PROTOCOL_VERSION` to 2 in the same PR as the contract change. The new record key `z` is covered by the same bump.

## 6. Tuning (owner-validated, `src/shared/tuning.js`)

Built and in use (values as on the branch):

| Field | Value | Meaning |
|---|---|---|
| `deployables.bumperRadius` | 14 | solid body radius (world units), both kinds |
| `deployables.bumperRestitution` | 1.4 | normal speed multiplier on a Bumper bounce |
| `deployables.orbitalRestitution` | 1.4 | the same for the Orbital Bumper body |
| `deployables.bumperKick` | 300 | slowest speed (units/s) either body throws a ball back out at |
| `deployables.minHitSpeed` | 15 | slowest approach speed that counts as an impact |
| `deployables.maxImpacts` | 3 | impacts before removal |
| `deployables.orbitalRange` | 40.625 | pull ring radius (world units) |
| `deployables.orbitalPull` | 1150 | pull acceleration at the ring centre, falling off linearly to the ring edge |
| `deployables.orbitalSpeedRef` | 250 | speed above which the pull is scaled by (speed / ref) squared so a fast ball still bends |
| `deployables.hitCooldownMs` | 250 | per-object report rate limit |

Proposed for the vertical rules (new, defaults chosen so a rolling ball is unchanged):

| Field | Proposed | Meaning |
|---|---|---|
| `deployables.bodyHeight` | 12 | height of the solid body above the object's `z` (world units); matches the drawn body |
| `deployables.orbitalReach` | 40 | height of the pull volume above the object's `z` (world units) |
| `deployables.placementSlopeTolerance` | 2 | largest floor-height difference allowed across the footprint at placement (world units) |

Every number in this section lives in the tuning block; none appears as a literal in simulation, render or host code. The block is world-independent: per-world gravity (Gaia, Ares, Luna) changes airtime and arcs, never these values (section 7.6).

## 7. Vertical volume and airborne rules (new)

Notation: the ball's height `b` is its simulated contact height (the underside of the ball, the same `z` the simulation already keeps, with the centre at `b + ball radius`); `R` is the ball radius; the object's floor height is `z`; `H = deployables.bodyHeight`; `G = rest.groundTolerance`.

### 7.1 Volume

Each object is a vertical cylinder standing on its floor height `z`:

- **Solid body:** radius `deployables.bumperRadius`, from `z` up to `z + H`. It is a solid only against the ball's side. Its top is not a surface: a ball cannot land on a bumper.
- **Orbital pull volume:** radius `deployables.orbitalRange`, from `z - G` up to `z + deployables.orbitalReach`. The Orbital Bumper has both the body and the pull volume; the Bumper has only the body.

### 7.2 Which heights are affected

- **Bumper body (both kinds):** affects a ball whose vertical span overlaps the body: `b < z + H` and `b + 2R > z - G`. A ball whose underside is at or above `z + H` passes over the object untouched: no force, no impact, no event, and its trajectory is identical to the same shot with no object.
- **Orbital pull:** affects a ball whose underside is inside `[z - G, z + orbitalReach]` and whose horizontal distance to the axis is inside the ring. Above that band, or below `z - G` (for example a lower level under a platform), the ball is unaffected.
- A rolling ball on the object's own level has `b = z` (within `G`), so it is always inside both volumes; that is why rolling behaviour is unchanged (section 7.7).

### 7.3 Bounce direction and kick for a ball moving up or down

- The contact normal is always horizontal: the unit vector from the object's axis to the ball in x/y. The vertical component of the normal is zero.
- Restitution and the minimum kick (`bumperKick`) apply to the ball's horizontal speed along that normal only. The ball's vertical velocity `vz` is left exactly as it was, whether it is rising or falling; gravity (per world) keeps shaping the arc. A bumper never launches, damps or reverses a vertical motion.
- A ball descending through the top edge: when its underside crosses below `z + H` while inside the footprint, it meets the body from the side. It is pushed out horizontally to the contact radius and counts as an impact only if its horizontal approach speed is at least `deployables.minHitSpeed`; `vz` is unchanged. (A ball cannot rest on top.)
- Impacts are reported once per contact as in section 4; an airborne contact counts exactly like a rolling one.

### 7.4 Orbital pull and vertical velocity

- The pull is purely horizontal: it adds acceleration toward the axis in x/y and adds nothing to `vz`. A ball arcing through the ring bends sideways while its rise, apex and fall stay exactly as the world's gravity gives them.
- The pull strength does not vary with the ball's height inside the band. The speed boost (`orbitalSpeedRef`) uses the ball's horizontal speed.
- A ball outside the band is neither pulled nor affected by the body or any rest rule.

### 7.5 Rest and wake

The rule that a ball inside the ring (not touching the body) is not allowed to come to rest, and that a resting ball inside it wakes, applies only to a grounded ball: `b` within `G` of the floor under it and inside the band. An airborne ball is never "at rest", so these rules never act on it.

### 7.6 Per-world gravity

Gravity differs per world, so airtime, arcs and chip-shot apex differ. The deployables block does not depend on gravity: heights and radii are geometry, and force values are horizontal. Consequences, all deterministic: the same shot may clear a bumper on a low-gravity world and strike it on a high-gravity world; the orbital bends an arc by the time the ball spends in its band, which also differs per world. Every test chamber in section 10 runs once per world gravity (and once with the current single `gravity`) and states its expectation per world.

### 7.7 Rolling-ball parity

For a ball on the same floor level as the object, `b` equals `z` within `G`, so every vertical test above is true, the horizontal force and look are exactly as accepted, and results are bit-identical to the current build for every existing fixture and shot. The new vertical checks change behaviour only for a ball on a different level or in the air.

## 8. Placement on non-flat and multi-level floors

- **`z` is host-assigned:** the host sets `z = surfaceHeight(course, x, y)` for the putt in play. The command carries only `x, y`, so a client cannot place an object at a height of its choosing, and the record's `z` is trusted by every client.
- **Single-valued height field:** `surfaceHeight` returns one height per `(x, y)` (the highest platform or ramp there). So an object always sits on the highest surface at that point. Placing under an overpass or on a lower level directly beneath another is not possible until maps with overlapping levels exist; then the command needs a level identifier (open question 2, section 12).
- **Host validation (in addition to section 3):** the point is on the floor (`surfaceHeight > -999`), not over a pit; the floor height at the centre and at 16 evenly spaced points on a circle of radius `deployables.bumperRadius` all differ from `z` by at most `deployables.placementSlopeTolerance`. That rejects ramps, sloped ground, platform ledges and pit edges under the footprint, so an object always stands flat on one level. The existing horizontal rules stay: at least `bumperRadius` from every wall (walls are checked regardless of level, which is conservative), not covering the cup, no overlap with another object.
- **Client side:** the placement hologram runs the same function against the same course, picking the floor point with a ray against the actual floor surfaces (not a fixed plane), so green and red match what the host will accept. The host re-checks everything; a refused command is dropped silently and the item is kept.
- **N4:** the server-room runs the same function with its own course data.

## 9. Determinism and parity

- With `deployables` empty or absent, every hook receives an empty list and returns without changing any number, so existing fixtures and `simulationSha256` expectations are unchanged apart from the fingerprint, which changes only because simulation source files are added or changed. Following "Merging PRs that change the simulation fingerprint" in `docs/GITHUB_WORKFLOW.md`.
- No randomness: placement comes from the command, expiry from impact count, and the orbital effect is a pure function of ball position, velocity and the tuning block.
- Rolling parity (section 7.7) is itself a test: every existing deployables chamber must give identical results before and after the vertical rules are implemented.

## 10. Test chambers for airborne cases (named; to be built after acceptance)

All live in `tests/deployables.test.cjs` as walled boxes with fixed shots, each run per world gravity as in section 7.6, and each has a no-object control so the effect is proven by the difference.

1. `airborne-over-bumper`: a chip or ramp-launched ball whose underside stays above `z + bodyHeight` over a Bumper: no event, trajectory bit-identical to the control.
2. `airborne-through-band`: a ball descending through the body band beside a Bumper: horizontal bounce with kick, `vz` identical to the control at the same instant, impact counted once.
3. `airborne-descending-onto-top`: a ball dropping into the footprint from above: pushed out radially, never rests on top, `vz` untouched.
4. `orbital-arc-in-band`: a chip arc passing through an Orbital's pull volume: the horizontal path bends toward the axis, apex and landing time unchanged.
5. `orbital-above-reach`: the same arc above `orbitalReach`, and a ball on a lower level under a platform: both bit-identical to the control.
6. `orbital-airborne-never-rests`: an airborne ball inside the ring is never held or woken by the rest rules; a grounded ball in the same ring is.
7. `platform-levels`: a Bumper on a raised platform affects a ball rolling on the platform and does not affect a ball rolling on the lower floor through the same x/y.
8. `placement-multilevel`: the host accepts a flat platform and records its `z`; it rejects a ramp, a platform ledge straddle and a pit edge; the client hologram agrees in each case.
9. `world-gravity-sweep`: one shot over a Bumper on each world gravity: the low-gravity world clears it, the high-gravity world strikes it; each result is fixed and deterministic.
10. `n4-vertical-report`: under N4, a `DEPLOY_HIT` whose presence is above the body band or outside the footprint is refused.

## 11. Files the owner would touch

- `src/shared/constants.js`: `MAX_DEPLOYABLES`, `PROTOCOL_VERSION`.
- `src/shared/protocol.js`, `src/network/protocol.js`: snapshot key, `validDeployable` (now with `z`), `DEPLOY_OBJECT` and `DEPLOY_HIT` commands.
- `src/shared/tuning.js`, `docs/TUNING.md`, `src/shared/config-meta.js`: the `deployables` block including the three new fields (units: world units for the three heights).
- `src/shared/mocks.js`: sample snapshot with `deployables`.
- `src/network/server-room.js`, `src/network/contracts/server-room.js`: the same host rules, the vertical report check and server-side inventory.
- `package.json`: add `tests/deployables.test.cjs` to a test script.

The worker owns: catalog entries and the `course` target, `src/gameplay/deployables.js`, the simulation hook, renderer, HUD, audio and tests.

## 12. Decisions (repo owner) and open questions

Decided:

1. **Placement:** the player who activates the power-up chooses the spot; the item is consumed only when the host accepts it; right-click or Esc cancels and keeps the item. A hologram shows green where it fits and red where it does not.
2. **Owner is affected:** a bumper bounces every ball, the owner's included.
3. **No timeout:** an object lasts until it has taken `deployables.maxImpacts` hits.
4. **No per-player or per-room limit** (only the 200-record wire bound).
5. **Force and design:** the Bumper and Orbital Bumper force and designs are accepted as they are (2026-11-03).

Open, for the integration owner:

1. Bump `PROTOCOL_VERSION` from 1 to 2 in the same PR (recommended), covering the new `deployables` key and `z`.
2. Overlapping levels (a bridge over another floor): when maps need them, `DEPLOY_OBJECT` needs a level identifier because `surfaceHeight` is single-valued. Until then placement always uses the highest surface at `(x, y)`.
3. Confirm the three proposed vertical fields and values (`bodyHeight` 12, `orbitalReach` 40, `placementSlopeTolerance` 2).
4. Whether walls should be level-aware in the clearance check (today they are not, which is conservative).

## 13. Implementation notes (as built on agent/g1e-deployables)

- **Built:** sections 1 to 6 in the code, with `z` and sections 7 to 10 not yet implemented. The current hooks use x and y only, which equals the section 7 behaviour for a rolling ball on a single-level floor.
- **Inventory:** in the peer-to-peer room the inventory lives on each client, so the host cannot check it; the placing client spends its slot after the host accepted. Under N4 the server owns the inventory.
- **Placement check:** `placementClear` (floor, pit, wall and cup clearance) and the overlap test run on both the client hologram and the host (`bindRoomSession`'s `validPlacement`); section 8 extends them with `z` and the footprint-flatness rule.
- **Server-owned rooms (N4):** still refuse deployables; porting is the owner's.
- **Protocol version:** not bumped (`tests/server-room-contracts.test.cjs` records "no active protocol change" with `PROTOCOL_VERSION` 1), so an older tab rejects a snapshot that carries `deployables`.
