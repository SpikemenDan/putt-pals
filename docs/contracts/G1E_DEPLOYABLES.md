# G1e deployables: proposed contract (DRAFT for the integration owner)

Status: draft, not agreed. Issue: #92. Branch: `agent/g1e-deployables`. Nothing here is implemented; the worker will build against mocks that match this text until the owner accepts or changes it.

Scope: the wire and `src/shared` surface for Bumper and Orbital Bumper. Gameplay catalog, simulation hooks and rendering stay in worker-owned paths.

## 1. Object record

A deployed object is a plain record, JSON-safe, with exactly these keys:

| Key | Type | Rule |
|---|---|---|
| `id` | string | `validId`; unique within the room, assigned by the host as `d<sequence>` |
| `kind` | string | a catalog id whose entry has `target: 'course'` (`bumper`, `orbital`) |
| `x`, `y` | finite numbers | simulation coordinates (x/y horizontal), `abs <= 1000000`; the host also checks the point is on the floor and clear of walls (`HAZARD_WALL_CLEARANCE`) |
| `owner` | string | `validId`; a player id present in `players` |
| `impacts` | integer | `0 <= impacts < maxImpacts`; objects at the limit are removed, never sent |
| `placedAt` | finite number | room time (seconds) at placement; the only clock, so no wall-clock reads |
| `map`, `putt` | integers | `index(map, 22)`, `index(putt, 6)`; objects apply only while that putt is in play |

No other keys. Names and free text are not allowed.

## 2. Snapshot

Add one optional key to the host snapshot (`validSnapshot` key list in `src/network/protocol.js` and the matching shared validator in `src/shared/protocol.js`):

- `deployables`: array, `length <= MAX_DEPLOYABLES`, every entry a valid object record, ids unique, every `owner` present in `players`.

Absent means none, so snapshots from before this change stay valid. Objects are cleared on `START_ROUND`, `RETURN_TO_LOBBY` and putt change.

Proposed constants in `src/shared/constants.js`:

- `MAX_DEPLOYABLES = 12` (whole room), `MAX_DEPLOYABLES_PER_PLAYER = 2`.
- The snapshot stays well under `MAX_MESSAGE_BYTES` (12 records is about 1.2 KB).

## 3. Command

One new command, `DEPLOY_OBJECT`, sent by a guest to the host (and applied directly by the host for itself). Fields (the field table in `validCommand`, `src/network/protocol.js`):

- `kind`: catalog id with `target: 'course'`.
- `x`, `y`: finite numbers, same bound as above.

Host-side validation, in order, with a silent drop on failure: sender is a connected player in `play` phase; `kind` is a course-target catalog id; the sender holds that item in their inventory; power-ups are enabled for the room; the per-player and room caps; placement rules. On success the host consumes the inventory slot, assigns `id`, `owner`, `placedAt`, appends to `deployables`, and the next snapshot carries it.

## 4. Impact reports

Physics stays client-trusted. A client that bounces off a bumper reports the hit so every client agrees on the remaining lifetime:

- `DEPLOY_HIT` command, field `id` (a `validId`), sent by the client whose ball hit it.
- The host increments `impacts` once per accepted report, rate-limited to one per object per 250 ms, ignores unknown ids, and removes the object when `impacts` reaches `maxImpacts` (3).
- Under N4 the server-room does the same count and rate-limit, so a client cannot kill an object early by flooding reports.

## 5. Versioning

`PROTOCOL_VERSION` stays 1 only if the owner is happy for an old client to ignore an unknown snapshot key. Because `validSnapshot` rejects unknown keys today (`keys(s, [...])`), an old client would reject new snapshots. Recommendation: bump `PROTOCOL_VERSION` to 2 in the same PR as the contract change.

## 6. Tuning (owner-validated, `src/shared/tuning.js`)

Worker proposes these fields for `docs/TUNING.md`; values are the owner's call:

| Field | Proposed | Meaning |
|---|---|---|
| `deployables.bumperRadius` | 14 | solid bumper radius (world units) |
| `deployables.bumperRestitution` | 1.1 | speed multiplier on a bounce (above 1 gives the pinball kick) |
| `deployables.maxImpacts` | 3 | impacts before removal |
| `deployables.orbitalRange` | 90 | gravity ring radius |
| `deployables.orbitalPull` | 220 | pull acceleration at the ring edge, falling off linearly toward the centre |
| `deployables.hitCooldownMs` | 250 | per-object report rate limit |

Gameplay numbers must come from this file and not appear as literals in simulation or render code.

## 7. Determinism and parity

- With `deployables` empty or absent, every hook receives an empty list and returns without changing any number, so existing fixtures and `simulationSha256` expectations are unchanged apart from the fingerprint, which changes only because new simulation source files are added. Following "Merging PRs that change the simulation fingerprint" in `docs/GITHUB_WORKFLOW.md`.
- No randomness: placement comes from the command, expiry from impact count, and the orbital ring effect is a pure function of ball position.

## 8. Files the owner would touch

- `src/shared/constants.js`: new constants, `PROTOCOL_VERSION`.
- `src/shared/protocol.js`, `src/network/protocol.js`: snapshot key, `validDeployable`, `DEPLOY_OBJECT` and `DEPLOY_HIT` commands.
- `src/shared/tuning.js` and `docs/TUNING.md`: the `deployables` block.
- `src/shared/mocks.js`: sample snapshot with `deployables`.
- `src/network/server-room.js`: apply the same host rules in the server-owned room.

The worker then owns: catalog entries and the `course` target, `src/gameplay/deployables.js`, the simulation hook, renderer, HUD, audio and tests.

## 9. Open questions for the owner

1. Placement: current ball position, an aimed point, or the opponent's ball? This draft takes an explicit `x`, `y` from the client so any of these works, and the host validates it.
2. Does a bumper affect its owner? This draft applies it to every player's own ball (each client applies it locally), which is the simplest; "opponents only" needs the owner id compared on each client.
3. Timeout expiry on top of three impacts? None is proposed.
4. Bump `PROTOCOL_VERSION` to 2 (recommended) or keep it at 1?
