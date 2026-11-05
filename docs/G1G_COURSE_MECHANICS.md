# G1g course mechanics

Status: implementation started, 2026-11-05. Owner: Codex. Local task branch:
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

No mechanic implementation, passing tests, or preview acceptance is claimed by
this initial work claim.
