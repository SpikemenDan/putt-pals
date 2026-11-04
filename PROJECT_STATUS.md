# Project status

Implementation snapshot supplied as refreshed 2026-11-01 against main `a315bf3`. These implementation claims have not been freshly audited against current code or GitHub. Workflow decisions below were updated from the owner's confirmed instructions; they do not imply new code was implemented. Live issues/PRs and actual code must be checked before acting.

## Where the project stands

The legacy single-file game has been rebuilt as a modular app (`index.html` and `src/`): headless shared simulation, validated course data, XState room lifecycle, React UI, Three.js 0.186.1 toon renderer with sky world, palettes, ambient weather and comic HUD, procedural audio, and server-owned WebSocket rooms with guest recovery and interpolation. `putt-pals.html` remains a temporary build/tooling dependency pending verified retirement. The migration to server-owned Cloudflare rooms (N4) is under way: contracts, local Worker runtime, room coordination, durable recovery and browser adoption are merged (N4D #122, N4E #123). All configured N4E CI projects passed. N4F coverage/quota evidence (PR #129) and N4G preview preparation are on main (restored by PR #141, 78bfe7f). N4a–N4f are complete. Hosted four-client physical-shot play and maintenance/compatible-code-update recovery passed on 2026-11-02; the original preview game version is restored. N4g and parent N4 remain open for preview deployment of the empty-room admission fix in PR #145 and the separate-network check the user deferred. Provider measurements and idle-data limitations are recorded in docs/reviews/N4_SERVER_ROOMS.md.

The product vision (MODERNIZATION_PLAN.md) is only partly built. Not built: Putt Pong, gameplay weather, ramps, drops and tubes, floating-island course geometry, corner bouncers, deployables (G1e) and global hazards (G1f). Merged pieces (itemized below) include the power-up framework and an 11-entry power-up catalog (`src/gameplay/catalog.js`: seven self utility power-ups, the opponent-targeted 360° Aim and 180° Aim sabotage, and the Love Ball and Hate Ball auras), the No Power-Ups flag, local cosmetics and eight-player rooms (`MAX_PLAYERS = 8` in `src/shared/constants.js`, enforced by the server-room member limit). Merged means the code is on main; it does not mean tested on real networks or accepted for release. Its task breakdown is in TASKS.md. Merged from the vision backlog so far: G1a power-up framework (PR #115), G1b self utility power-ups (PR #118), G1c aim sabotage (PR #135), G1d ball auras (PR #134), GM1 No Power-Ups flag (PR #119), S3 forgiving physics (PR #125), CL2 render clipping fixes (PR #128) and its per-map screenshot spec (PR #136), F1 local cosmetics (PR #132), C3 eight-player rooms (PR #133), T2 (one validated gameplay tuning module, `src/shared/tuning.js`, fields in docs/TUNING.md; PR #109, issue #83 closed), U2 (proportional aim arrow; PR #107, issue #84 stays open until the owner has judged the drag feel by hand) and CL1 (static geometry integrity validator over all 22 maps; PR #108, issue #102 stays open because two mover findings, Hourglass and Elevator Alley, are waived pending owner approval). Next work: finish N4 acceptance, then Q1 (release readiness); M1 (menus and feedback) is partly merged; G1e and G1f may start now; SV1 (par solver, unblocked by S3) comes before G1g and K1, and the volumetric model K0 (true 3D levels, then water W2 and wind W3) before K1a.

## Confirmed owner decisions

- Private friend rooms, desktop browsers, normal hosted build; no offline single file or native packaging.
- Prefer established libraries; keep the custom physics. Rapier is deferred after evaluation.
- Server-owned rooms on Cloudflare Workers and SQLite Durable Objects over WebSockets. Defaults: immediate controller succession, 30-second reconnect grace, 15-minute empty-room retention. N3 TURN stays paused.
- Original comic art direction: smooth flat colour, ink outlines, no scenery clutter. Ambient weather on Frost Hollow and Cyclone Ring is visual only.
- Course direction: per-putt walled islands with designed gaps, true portal pairs, stronger fans, 3D courses and more complicated level design. Every putt must be possible in par (2 to 6); hole-in-one guarantees are removed; physics should be more forgiving.
- Product vision and room rules as recorded in MODERNIZATION_PLAN.md: 8 players, 3 inventory slots, free-for-all on the same hole with everyone putting at once and advancing together, lowest strokes minus par wins, Rewind/Reversiball/Zanyball retired, skins selectable.
- Putt Planet vision (owner, 2026-11-03; recorded in MODERNIZATION_PLAN.md, not yet implemented): worlds Gaia, Ares and Luna with per-world gravity; tournaments of 3, 5 or 7 maps on one world; six holes per map; at least 21 rainbow ball colours, unique per party; room voting with a shared random tie-break; rejoin and late-arrival rules with missed-hole penalties; skydive and cloud arrival sequence; Custom rules editor. The 8-player cap and 3 inventory slots stay. Ares and Luna environment effects are visual only. Several open decisions are listed in MODERNIZATION_PLAN.md.
- Direct implementation requests authorize scoped local commits. Remote writes, merging and deployment follow AGENTS.md; repeated local commit approval is not required.

## Known issues and gaps

1. **Difficulty is not certified, and the acceptance rule is changing.** The solver, `rank` ladder and par defaults all assume every putt has a robust single-shot hole-in-one, and S2's cup-capture change already left five hard putts (Cyclone Ring putts 3 and 5, Grand Finale putts 1, 3 and 5) without one. The owner has dropped that requirement: every putt must instead be completable in par (2 to 6). S3 (forgiving physics) and SV1 (par solver) replace the old measures; until then recorded counts are stale. Details: docs/reviews/S2_CUP_CAPTURE.md and B4_DIFFICULTY.md.
2. **Client-trusted gameplay.** Each browser simulates its own ball; there is no anti-cheat. The service now owns room continuity and controller election. The retained empty-room admission fix is delivered in PR #145 (`28072ff`), pending preview deployment; separate-network acceptance is deferred. Namespace usage observations are recorded, but no hosted quota-exhaustion or zero-idle-cost claim is made.
3. **Real-world validation gaps.** Hosted same-network browser play and recovery are verified; independent-network play/recovery is deferred. Actual audio listening and broader hosted browser/hardware coverage remain separate acceptance work.
4. **Renderer evidence.** Frame times were measured on a Mac M1 Pro probe and validated on two Windows laptop GPUs (docs/reviews/R2_WINDOWS_GPU.md); there is no broader hardware matrix.

## Verification

CI runs `baseline-ci` (install from lockfile, syntax and course metadata checks, build, contract, simulation, session, network, audio, course, CLI, physics and jsdom smoke suites) and `browser-ci` (Playwright in Chromium, Firefox and WebKit). Use the commands in README.md and read the current CI result for a revision instead of relying on any pass count written in a document. jsdom suites stub WebGL, canvas and audio and use fake networks; they do not prove real rendering, audio quality or WebRTC.

## Updating this file

When implementation facts materially change, the integrating contributor updates the relevant paragraph with the date, evidence and any new known issue. Keep planned work distinct from verified behavior, drop entries that are no longer true instead of appending history, and never record credentials or relay tokens.


## Confirmed development-workflow decisions

- Two contributors use short-lived task branches (one per coherent feature, fix or
  cleanup, created from updated main); no automatic worktrees or clones. The earlier
  permanent contributor branches are retired (docs/GITHUB_WORKFLOW.md).
- Direct implementation requests authorize scoped local commits of the task's
  own changes. Remote writes and merges retain AGENTS.md's boundaries.
- Claude leads. Gemini Pro supplies worthwhile routine drafts/summaries for
  Claude to verify and apply, without concurrent checkout edits.
- Substantial work uses lightweight ownership and overlap coordination.
- Extend the existing validated tuning system while preserving defaults during
  configuration extraction.
- Build a development-only tuning panel. Relevant appearance/feel proposals need
  a local browser preview with controls and owner feedback before acceptance.
- Retire legacy runnable HTML/tooling after dependency and coverage migration.
- Overnight work requires a fresh explicit start, bounded scope/time and verified
  private Google Drive recovery backup. No remote writes, pushes, merges,
  deployments or automatic restarts.

These are operating decisions and implementation targets, not evidence that
DX1-DX6 are complete. See TASKS.md for pending work.
