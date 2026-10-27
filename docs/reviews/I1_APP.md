# I1 modular application review handoff

Task: [I1 #12](https://github.com/SpikemenDan/putt-pals/issues/12), integrate the modular application. Worker: Claude (claude.ai session 015v2ri1Ws6wj6hzYTNCFWab), branch `agent/i1-modular-app` from main `e7a59ed`, acting as integration owner at the user's request (2026-10-27). Status: ready for REVIEW, not DONE.

## Delivered

- `index.html` + `src/app/` (`main.js`, `app.js`, `room.js`, `putt.js`, `rules.js`): `createApp()` composes D1 courses, S1 simulation, L1 session, N1 transports, A1 audio, R1 renderer/camera and U1 UI/input. It owns one animation loop, one HUD tick and explicit disposal. Solo, course practice, putt practice and online tournaments run entirely on the modules. See `src/app/README.md`.
- `putt-pals.html` stays unchanged and is still built (`dist/putt-pals.html`), so the legacy game remains available until the modular app is accepted.
- `tests/app.test.cjs` (`npm run test:app`) with `tests/support/app-harness.cjs`; added to `npm test` and CI.

## Integration-owner changes

| Area | Change |
| --- | --- |
| Dependencies | `three` 0.128.0 and `peerjs` 1.5.4, exactly the embedded versions (lockfile additive only; existing `libc` metadata preserved). `npm run test:app` proves npm three builds all 22 courses identically to the embedded copy. The Three.js upgrade remains R2. |
| Build | Vite builds `index.html` and `putt-pals.html`. CSS is no longer minified: Lightning CSS dropped standard `backdrop-filter` wherever `-webkit-backdrop-filter` was also declared, so the shipped legacy build had no frosted glass in Chrome/Firefox (finding from U1). `scripts/check-build.cjs` now asserts the legacy CSS is byte-identical and checks the app page, assets and standard `backdrop-filter`. |
| Contracts | `PLAYER_COLORS` (src/shared) is now the game's 8-colour palette used by renderer and UI (finding from U1). Presence accepts optional validated `effect` and `fx` fields so power-up auras and Reversiball/Zanyball attacks keep working between players; unknown fields are still rejected. |
| UI store | Hole-in-one banners also fire from newly recorded scores, because the session can record a putt and start the next one in one update (the solo case). Leaving a room clears pending toasts and banners. |

## Integration decisions

- **Scores are reported once per putt, at completion** (`REPORT_SCORE`, including timeouts at the real deadline). Live stroke counts travel in presence, as in the legacy scoreboard. `UPDATE_STROKES` is not used: the session rejects lower counts, and Rewind lowers the count, which would make a later sink unreportable.
- **Sounds** use the legacy frame-to-frame inference fed once into the A1 adapter (A1 asked I1 to preserve the legacy bounce significance filter). Banner fanfares play when a banner shows, as the legacy page did.
- **Room namespace** `puttpals-circuit-v6-<code>` (legacy `-v5-`), because the protocols are incompatible.
- **Leaving** returns to the start screen instead of reloading; repeated join/leave is verified leak-free.

## Acceptance evidence

| Requirement | Evidence |
| --- | --- |
| Real-UI solo/practice/replay/tournament flows | `test:app`: full solo map (six holes in one, transitions, banners, sounds, waiting/free roam), canvas drag and shortcuts, course practice with a timeout scoring par + penalty, putt-practice replay and stepping, and a four-client three-map tournament (Zanyball attack ×1.6, guest leaves and rejoins as a spectator, identical totals on every client, host loss notice). |
| Compare visuals with B1 | Same Chromium, frozen clock, fixed randomness: the built app's game screen including the WebGL course matches the live legacy page RESULT_VISUAL. B1's reference screenshots were taken from that legacy page. |
| Scoring and four-client coordination | Fake network: the `test:app` tournament. Real network: RESULT_WEBRTC |
| Integrated test/build suite | RESULT_NPM_TEST; `npm run build` RESULT_BUILD |
| Repeated join/leave cleanup | Ten cycles: one animation loop, no extra window/document/canvas listeners, no leftover timers, every transport closed, audio reset each time, the renderer reused. `dispose()` leaves zero listeners/timers/frames, disposes WebGL and audio and unmounts React. |
| Runtime without marker-based extraction | The app bundle contains no VM, legacy adapter, HTML/tools.js references, `readFileSync` or `new Function`; app sources read no legacy files. |

## Not verified / limits

- Firefox and WebKit, real GPUs, frame rate and GPU memory: the container renders WebGL in software (a few frames per second at full size), so long real-browser sessions were run at a small viewport.
- WebRTC across separate machines/networks, NAT traversal and TURN (N3). The real-network run uses loopback host candidates and a local PeerServer.
- Guest recovery/resume identity and interpolation (N2): a rejoining player is a new identity.
- Audio listening tests in a real browser (A1 limit).
- The legacy page is still the default `putt-pals.html`; switching hosting to `index.html` and retiring the legacy build is a release decision (Q1).

## Next

- Review the integration-owner changes above, then merge with user approval after green CI.
- T1 can turn `scripts/ui-visual-parity.cjs` and the I1 browser runs into Playwright tests in `tests/browser`. N2/N3/R2/Q1 are unblocked by this integration.
