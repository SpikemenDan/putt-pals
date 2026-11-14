# Q1 release readiness (#18)

Preparation and verification only. Nothing here was deployed, published or changed on hosting or credentials. Technical checks below do not stand in for owner playtests or separate-network acceptance.

## Evidence

Branch `chore/q1-release-readiness` from main `97ec6e3` (2026-11-14). This branch changes only `tools/cli` (world gravity for the solver), its test and docs, so app evidence applies to main. Local runs used Node 22.23.4 in a Linux container; CI uses Node 26.10.

| Check | Result |
| --- | --- |
| `npm run checks` | Recommended the full suite for the `tools/cli` change |
| `npm test` | **Stopped at `test:input`**: `tests/input.test.cjs:76` expects `spread(0.8125)` to equal a recorded value exactly and differs in the 17th digit (`…135` vs `…133`) on Node 22.23.4. Pre-existing and unrelated (this branch changes no input code; main CI passes on Node 26.10). The rest of `input.test.cjs` did not run locally |
| Suites after `test:input` (camera, aim-preview, ui, app, courses, cli, physics, integration, overnight, gemini) | Passed, run one by one |
| `npm run build` | Passed (`BUILD_OK`) |
| `npm run test:rooms:local` | Passed: routing and isolation, admission, eight-member capacity, controller succession, resumed identity, and a four-player six-putt game on local workerd |
| `npm run test:browser` (Chromium) | **Not verified locally.** The pinned Playwright 1.64.0 browser build is not installed in this container. Against the pre-installed Chromium (scratch config, software WebGL, solver running alongside): 10 passed, including the four-page multiplayer map, reload/drop recovery, controller handover and server-room flows; 10 failed at the same step (clicking "Choose Gaia" in the solo world view timed out after 15 s) and 1 could not launch. Main CI at `97ec6e3` passed this suite, so treat this as environmental; this PR's CI is the browser evidence |
| PR #226 CI at `7057dba` ([run 43551205550](https://github.com/SpikemenDan/putt-planet/actions/runs/43551205550)) | Passed: `baseline-ci` (full suite on Node 26.10, including `test:input` and `test:rooms:local`) and `browser-ci` on Chromium, Firefox and WebKit |

## Par routes on every putt (SV1)

Fast sweep, 2026-11-14, commit `e936daf` (main `97ec6e3` plus the world-gravity fix to `tools/cli`, which changes no Gaia result), simulation SHA-256 `460d138248db…`, all 24 maps on Gaia (gravity 700; no map on main names another world yet). `npm run measure:par -- --jobs 4` took 17 minutes.

| Result | Putts |
| --- | --- |
| Robust 1-stroke route | 48 |
| 2 strokes | 9: 1/0, 7/0, 9/0, 10/0, 15/0, 17/0, 19/0, 19/2, 23/4 |
| 3 strokes | 3: 11/0, 23/1, 23/5 |
| No route found (trial budget) | 3: 4/0 Clockwork Maze, 13/0 Hourglass, 16/0 Crescent Coast |
| No route found (candidate grid) | 1: 18/0 Comet Run |

**Playable pool: met.** Every putt of the eight playable maps (`STARTER_COURSE_INDICES`; 48 putts) has a robust route within its shipped par, and `rank --routes` reports every starter measurement current. Obsidian Spiral putts 2, 5 and 6 have no slack (route strokes equal par 3, 2 and 3).

**All maps: not met.** The fast sweep's `check --routes` fails on the four putts above, the same set as the SV1 report. One `--full` retry (`--only 4/0,13/0,16/0,18/0 --jobs 2`, 69 minutes) found a robust 3-stroke route for Hourglass (par 3) and a 4-stroke route for Crescent Coast (par 5), both within shipped par. Comet Run still has none with the full grid exhausted, and Clockwork Maze ran out of its 6 M trial budget. Those two are single-putt non-starter maps that map cards and session votes do not offer, so no released mode reaches them. An owner decision is needed before any of them joins the playable pool: redesign, a time-aware solver for moving hazards, or a wider robustness rule.

**Re-run when new maps land** (Ares/Luna maps, #165, or any course, physics or gravity change). Each course is solved at its own world's gravity (`courseWorld`), so the same commands cover all worlds:

```sh
npm run measure:par -- --jobs 4 --out routes.json   # whole sweep; --only 24/0,25/1 for just the new putts
node tools/cli/main.mjs check --routes routes.json  # fails on any putt whose par is below its shortest robust route
node tools/cli/main.mjs rank --routes routes.json   # exit 2 if any starter measurement is stale
```

Record the commit, counts and every non-`route` putt here. A `none`/`budget` result is a search limit, not proof the putt is impossible, but a release putt needs a found route or an owner decision.

## Production-like local preview

`npm run test:browser` and `npm run test:rooms:local` both build `dist/` and serve it from the real local Worker and Durable Objects on one origin (`wrangler dev --local`), the same shape as the hosted preview. To try it by hand: `npm run rooms:dev`, then open `http://127.0.0.1:8787/` in two browser windows. No Cloudflare account is used.

## Rollback

Procedure: [CLOUDFLARE_DEPLOY.md, "Release rollback procedure"](../networking/CLOUDFLARE_DEPLOY.md#release-rollback-procedure-q1-18). The hosted maintenance/game rollback was exercised on the preview in N4g (2026-11-02). The recorded game version predates current main, so it is not a compatible rollback target for a main deployment; record a new one at the next authorized publication.

## Owner playtest checklist

Run on the build to be released (`npm run rooms:dev` locally, or the hosted preview once authorized), desktop Chrome plus one other browser. Record date, browser/OS, commit and any failure with steps.

**Solo**
- [ ] Solo → Practice · whole map: finish a map; strokes, par and results screen are right.
- [ ] Practice · one putt / replay one putt and pick any map: the chosen putt loads and restarts cleanly.
- [ ] Practice · Putt Pong: rack, turns and cup removal behave.
- [ ] Power-ups appear in Solo only where the catalog allows; No Power-Ups shows none.

**Worlds**
- [ ] Planet switcher shows Gaia, Ares and Luna; loading globe and level select work for each available world.
- [ ] Gravity feels right per world (Gaia 700, Ares 490, Luna 315): Ares and Luna balls fly visibly further and hang longer.
- [ ] The Precipitation power-up shows as rain/snow on Gaia, a Dust Storm on Ares and the Solar Wind on Luna, with the same slippery effect.

**Party** (two or more windows or machines)
- [ ] Create a room, join by code, ready up and finish a map; scores match on every client.
- [ ] Tournament · 3, 5 and 7 maps: map voting/advance and final standings are consistent.
- [ ] Putt Pong · 1v1: alternating turns, bonus balls, redemption and win condition.
- [ ] Power-ups and opponent effects (aim sabotage, deployables, global hazards) show the same result on both clients.
- [ ] Unique ball colours and names; a spectator joining mid-map plays from the next map.

**Custom**
- [ ] Make your own rules, start a room with them; every client shows and plays the same rules; settings persist after reload.

**Rejoin and recovery**
- [ ] Close the room creator's tab mid-map: the room continues with a new controller and unchanged scores/deadline.
- [ ] Drop a guest's network briefly (within grace): "Reconnecting…", same seat and score on return.
- [ ] Stay away past grace: a clear message, and a fresh join works.
- [ ] Reload a guest tab mid-map: note whether it resumes the seat or needs a fresh join, and that the message says which.
- [ ] Background a tab for two minutes: room time and roster are correct on return.

**Separate networks (hosted only, needs authorization)**: the N4G checklist in [N4_SERVER_ROOMS.md](N4_SERVER_ROOMS.md#n4g-deployment-and-separate-network-checklist) with four players on at least two independent connections.

## Remaining before release

- Owner playtests from the checklist above, on the release build.
- Separate-network four-player validation on the hosted preview (N4G checklist), and recording a rollback target compatible with the build being deployed. Both need owner authorization for the hosted steps; nothing was deployed here.
- When #165 (Ares/Luna maps) lands: re-run the par sweep and record it here. Each map is then solved at its own world's gravity.
- Owner decision on Clockwork Maze and Comet Run (no robust route found) before they join the playable pool. Shipped par values were not changed.
- Release notes, production hosting and publication are separate, owner-authorized steps.
