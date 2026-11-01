# Project status

Refreshed 2026-11-01 against main `a315bf3`; live issue ownership is authoritative. Live ownership and blockers are in GitHub issues; the task graph is in TASKS.md and per-task evidence is in each PR and docs/reviews/.

## Where the project stands

The legacy single-file game has been rebuilt as a modular app (`index.html` and `src/`): headless shared simulation, validated course data, XState room lifecycle, React UI, Three.js 0.186.1 toon renderer with sky world, palettes, ambient weather and comic HUD, procedural audio, and server-owned WebSocket rooms with guest recovery and interpolation. `putt-pals.html` is kept as a separate build input and parity reference. The migration to server-owned Cloudflare rooms (N4) is under way: contracts, local Worker runtime, room coordination, durable recovery and browser adoption are merged (N4D #122, N4E #123). All configured N4E CI projects passed. N4F coverage/quota evidence (PR #129) and N4G preview config with rollback (PR #130) are merged; connecting Cloudflare, deploying a preview and separate-network acceptance still need owner authorization.

The product vision (MODERNIZATION_PLAN.md) is largely unbuilt: Putt Pong, the No Power-Ups mode, most power-ups, gameplay weather, ramps, drops and tubes, floating-island course geometry, corner bouncers and cosmetics. Its task breakdown is in TASKS.md. Merged from the vision backlog so far: G1a power-up framework (PR #115), G1b self utility power-ups (PR #118), GM1 No Power-Ups flag (PR #119), S3 forgiving physics (PR #125), CL2 render clipping fixes (PR #128), F1 local cosmetics (PR #132), C3 eight-player rooms (PR #133), T2 (one validated gameplay tuning module, `src/shared/tuning.js`, fields in docs/TUNING.md; PR #109, issue #83 closed), U2 (proportional aim arrow; PR #107, issue #84 stays open until the owner has judged the drag feel by hand) and CL1 (static geometry integrity validator over all 22 maps; PR #108, issue #102 stays open because two mover findings, Hourglass and Elevator Alley, are waived pending owner approval). Next work: finish N4 acceptance, then Q1 (release readiness); M1 (menus and feedback) is partly merged; G1c-G1f may start now; SV1 (par solver, unblocked by S3) comes before G1g and K1, and the volumetric model K0 (true 3D levels, then water W2 and wind W3) before K1a.

## Confirmed owner decisions

- Private friend rooms, desktop browsers, normal hosted build; no offline single file or native packaging.
- Prefer established libraries; keep the custom physics. Rapier is deferred after evaluation.
- Server-owned rooms on Cloudflare Workers and SQLite Durable Objects over WebSockets. Defaults: immediate controller succession, 30-second reconnect grace, 15-minute empty-room retention. N3 TURN stays paused.
- Original comic art direction: smooth flat colour, ink outlines, no scenery clutter. Ambient weather on Frost Hollow and Cyclone Ring is visual only.
- Course direction: per-putt walled islands with designed gaps, true portal pairs, stronger fans, 3D courses and more complicated level design. Every putt must be possible in par (2 to 6); hole-in-one guarantees are removed; physics should be more forgiving.
- Product vision and room rules as recorded in MODERNIZATION_PLAN.md: 8 players, 3 inventory slots, free-for-all on the same hole with everyone putting at once and advancing together, lowest strokes minus par wins, Rewind/Reversiball/Zanyball retired, skins selectable.
- Approval is required before commits and remote writes (AGENTS.md).

## Known issues and gaps

1. **Difficulty is not certified, and the acceptance rule is changing.** The solver, `rank` ladder and par defaults all assume every putt has a robust single-shot hole-in-one, and S2's cup-capture change already left five hard putts (Cyclone Ring putts 3 and 5, Grand Finale putts 1, 3 and 5) without one. The owner has dropped that requirement: every putt must instead be completable in par (2 to 6). S3 (forgiving physics) and SV1 (par solver) replace the old measures; until then recorded counts are stale. Details: docs/reviews/S2_CUP_CAPTURE.md and B4_DIFFICULTY.md.
2. **Client-trusted gameplay.** Each browser simulates its own ball; there is no anti-cheat. The service now owns room continuity and controller election. Hosted quota behavior and separate-network recovery still require N4G acceptance.
3. **Real-world validation gaps.** Real WebRTC across separate networks, guest recovery on real networks, actual audio listening and a deployed preview have not been verified. The WebKit multiplayer browser spec is skipped in CI because it needs a relay.
4. **Legacy tooling.** `tools.js` and the migration exporters still extract code from the legacy HTML; modern CLI commands import the shared simulation directly.
5. **Renderer evidence.** Frame times were measured on a Mac M1 Pro probe and validated on two Windows laptop GPUs (docs/reviews/R2_WINDOWS_GPU.md); there is no broader hardware matrix.

## Verification

CI runs `baseline-ci` (install from lockfile, syntax and course metadata checks, build, contract, simulation, session, network, audio, course, CLI, physics and jsdom smoke suites) and `browser-ci` (Playwright in Chromium, Firefox and WebKit). Use the commands in README.md and read the current CI result for a revision instead of relying on any pass count written in a document. jsdom suites stub WebGL, canvas and audio and use fake networks; they do not prove real rendering, audio quality or WebRTC.

## Updating this file

At accepted integration points the coordinator rewrites the relevant paragraph with the date, the merged PR and any new known issue. Keep planned work distinct from verified behavior, drop entries that are no longer true instead of appending history, and never record credentials or relay tokens.
