# G1g course mechanics

Status: implemented locally; owner preview accepted, 2026-11-05. Owner: Codex. Local task branch:
`feat/course-mechanics`, created from current `origin/main`. Issue: #94.
The issue's blocked label predates the merged SV1 implementation (PR #179).
This is a local work claim; no remote issue update has been published.

Owned paths: course schema/adapters/integrity, simulation mechanic hooks,
renderer mechanic meshes, shared tuning/metadata, CLI mechanic chambers,
focused tests, development preview, and this task's documentation.
G1f stays on `feat/global-hazards` until the owner confirms CI is ready to merge.
Reconcile shared simulation/tuning paths after that authorized merge.

## Observable completion

- A corner wedge deflects a ball along its diagonal face, with collision height
  respected by airborne balls. A bouncer adds a configurable outward impulse.
- Fans have explicit force and vertical reach. Stronger settings are proposed
  in the preview before applying changes to shipped course overrides.
- Course vortices have finite centre behavior and explicit inward, tangential
  and lift components. Their behavior is distinct from G1f roaming power-ups.
- Portal pairs preserve speed and rotate exit velocity by their endpoint
  orientation, with a shared cooldown preventing immediate re-entry. Their
  height gate and exit clearance are validated.
- Each element is represented in validated course data, shared simulation,
  renderer, and CLI/solver chambers. A chamber has a robust route within par
  and an independent stripped-element comparison proving its intended effect.
- Numeric settings use the authoritative tuning module and validated local
  preview controls with reset and import/export. Owner feel review is required.

## Migration boundary

Keep existing tuples and absent-element behavior compatible. Add explicit
records for new mechanics rather than reinterpreting existing tuples. Do not
rewrite the online map layouts while map migration scope remains undecided.
Use chambers to establish mechanic behavior first, then re-solve any approved
course changes with SV1 under the par 2..6 acceptance rule.

Existing `tp` records relocate a grounded ball and preserve its horizontal
velocity without endpoint orientation. Existing fans have a fixed global
height check; course tornadoes combine inward pull, spin and core lift with
embedded coefficients. These are the boundaries the implementation must cover.

## Verification gates

Run focused collision/force/portal tests, course schema and integrity checks,
simulation inactive parity, renderer lifecycle checks and build. Run
`node tools/cli/main.mjs check` and `npm run test:courses` for changed course
data. Generate current solver evidence and simulation fingerprints using the
documented commands; preserve historical evidence. Exercise the browser
preview and inspect console errors before owner review.

## Implemented contract

Optional `geometry.mechanics` is an array of at most 128 records with unique
lowercase `id` values. Unknown fields, nonfinite/unsafe coordinates, degenerate
faces and invalid dimensions/directions fail boundary validation. Existing
courses omit it and retain their legacy tuples and exact inactive trajectories.

| Kind | Required fields beyond `id` and `kind` | Effect |
| --- | --- | --- |
| `wedge` | `vertices`: three `[x,y]` points | Solid triangular prism, reflected face velocity. |
| `bouncer` | `a`, `b`: `[x,y]` endpoints | Finite vertical bank face with added outgoing normal impulse. |
| `fan` | `rect`: `[x,y,width,depth]`, `direction`: radians | Horizontal acceleration within the area and height gate. |
| `vortex` | `center`: `[x,y]`, `radius`, `spin`: -1 or 1 | Inward pull, signed tangential force and core lift; finite at the centre. |
| `portal` | `a`, `b`: `[x,y,outwardAngle]` | Enter inward through either endpoint, preserve speed and relative elevation, emerge along the paired orientation. |

Every record permits explicit `height`; fans and vortices also permit an
explicit `acceleration` override. Absent overrides use the authoritative
`courseMechanics` tuning block. Positions use world units; angles use radians.
The height gate is relative to the mechanic anchor's floor. Solids pass an
airborne ball whose underside clears the body; Ghost Ball bypasses solids.
Vortices and fans wake resting balls and continue to act while airborne within
their height gate. Portal transfers preserve vertical velocity. All pairs
share a cooldown; backwards entry and unsupported exits are rejected.

Solid footprints require level supported floor, clearance from cups/tees and
walls, and no overlapping solid bounding footprints. The footprint checks are
deliberately conservative for diagonal solids. Portal entry and outward exit
footprints require level ground and clearance from walls, pits and new solids.

## Evidence and preview

`tests/course-mechanics.test.cjs` and `tests/course-mechanics-integration.test.cjs`
run in `test:simulation`. They cover swept faces/end caps, high-speed collision,
overlap recovery, diagonal banking, entering/separating bouncer responses,
schema and owned-data roundtrip, floor/exit rejection, airborne passage, force
height gates, finite vortex core lift, portal orientation/cooldown and real
Three.js geometry/resources. Each of the five chambers has a robust proof shot
verified by SV1 over the nine angle/power perturbations. Removing the mechanic
makes that intended shot miss; this is not a claim that every stripped chamber
has no alternate route. Proofs sink in one stroke within chamber par 3.

The development chambers are excluded from normal voting. Their course-data
support is ready for future map authoring; the existing online layouts and their
explicit legacy force overrides are preserved pending map-migration decisions.

```sh
node tools/cli/export-mechanic-chambers.mjs > /tmp/g1g-chambers.json
node tools/cli/main.mjs check --courses /tmp/g1g-chambers.json
node tools/cli/main.mjs shot 22 0 358 0.485 --courses /tmp/g1g-chambers.json
node tools/cli/main.mjs solve 22 0 --courses /tmp/g1g-chambers.json
node tools/cli/measure-mechanics.mjs --out tests/fixtures/course-mechanics/solutions.json
npm run test:course-mechanics:preview # with Vite running on 127.0.0.1:5175
```

The export appends the five chambers after the 22 supported courses in an
ordinary validated document, usable by the existing CLI and SV1 solver. It does
not modify the supported course catalog. The evidence generator verifies the
explicit proof routes rather than reporting partial search counts as difficulty.

Preview: `http://127.0.0.1:5175/tests/fixtures/course-mechanics/preview.html`.
Chromium exercised every shared-physics proof shot, actual WebGL rendering,
reset/defaults, valid import/export and invalid import rejection without browser
errors. Red is the active ball; gray is the stripped comparison. The owner
accepted the appearance/feel and current values on 2026-11-05. This is local
preview acceptance, separate from current-head CI and hosted acceptance.

The browser check accepts `PP_PREVIEW_URL` for another local server and optional
`PP_PREVIEW_SCREENSHOT` for an exported screenshot. It is an explicit developer
preview check, not part of the hosted-browser suite, since production builds
exclude fixture previews.

## Verification results (2026-11-05)

Passed: course validation over the 22 supported maps and the exported 27-course
chamber document; contracts/config metadata; simulation and focused G1g
integration; session, network, audio, renderer, input, UI, app, courses, CLI,
physics, out-of-bounds integration, overnight/tooling regression suites; build;
local Worker runtime; and the explicit Chromium development-preview check.

Generated evidence in `tests/fixtures/course-mechanics/solutions.json` is
reproduced by the integration test. The baseline refresh reproduces all 36
previous shipped shot outcomes exactly; its optional single-shot probe still
exits 1 for the two known non-robust hole-in-ones. Those holes have refreshed,
independently replayed robust two-stroke routes within shipped par. All three
evidence files match the current simulation fingerprint. No geometry exception
was added. Full hosted-browser CI and integration review remain pre-merge gates.
