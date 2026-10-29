# Project status

Last updated: 2026-10-29. Accepted main: `333d06d` (N4c PR #81). Live ownership and blockers are in GitHub issues; the task graph is in TASKS.md and per-task evidence is in each PR and docs/reviews/.

## Where the project stands

The legacy single-file game has been rebuilt as a modular app (`index.html` and `src/`): headless shared simulation, validated course data, XState room lifecycle, React UI, Three.js 0.186.1 toon renderer with sky world, palettes, ambient weather and comic HUD, procedural audio, and PeerJS rooms with guest recovery and interpolation. `putt-pals.html` is kept as a separate build input and parity reference. The migration to server-owned Cloudflare rooms (N4) is under way: contracts, local Worker runtime and room coordination are merged; durable recovery, browser adoption, cross-browser coverage and a preview deployment are not. Online play in the browser still uses PeerJS.

The product vision (MODERNIZATION_PLAN.md) is largely unbuilt: Putt Pong, the No Power-Ups mode, most power-ups, gameplay weather, ramps, drops and tubes, floating-island course geometry, corner bouncers and cosmetics. Its task breakdown is in TASKS.md. Next work: finish N4, then Q1 (release readiness); M1 (menus and feedback) is ready; C3, U2, G1a-G1f, GM1 and F1 may start now; S3 then SV1 come before G1g and K1.

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
2. **Client-trusted gameplay.** Each browser simulates its own ball; there is no anti-cheat. PeerJS host loss has no migration path until N4 lands; relay configuration is manual.
3. **Real-world validation gaps.** Real WebRTC across separate networks, guest recovery on real networks, actual audio listening and a deployed preview have not been verified. The WebKit multiplayer browser spec is skipped in CI because it needs a relay.
4. **Legacy tooling.** `tools.js` and the migration exporters still extract code from the legacy HTML; modern CLI commands import the shared simulation directly.
5. **Renderer evidence.** Frame times were measured on a Mac M1 Pro probe and validated on two Windows laptop GPUs (docs/reviews/R2_WINDOWS_GPU.md); there is no broader hardware matrix.

## Verification

CI runs `baseline-ci` (install from lockfile, syntax and course metadata checks, build, contract, simulation, session, network, audio, course, CLI, physics and jsdom smoke suites) and `browser-ci` (Playwright in Chromium, Firefox and WebKit). Use the commands in README.md and read the current CI result for a revision instead of relying on any pass count written in a document. jsdom suites stub WebGL, canvas and audio and use fake networks; they do not prove real rendering, audio quality or WebRTC.

## Updating this file

At accepted integration points the coordinator rewrites the relevant paragraph with the date, the merged PR and any new known issue. Keep planned work distinct from verified behavior, drop entries that are no longer true instead of appending history, and never record credentials or relay tokens.
