# Q1 release readiness (#18)

Preparation and verification only. Nothing here was deployed, published or changed on hosting or credentials. Technical checks below do not stand in for owner playtests or separate-network acceptance.

## Evidence

Main at `__COMMIT__` (2026-11-14), branch `chore/q1-release-readiness`.

__CHECKS__

## Par routes on every putt (SV1)

__PAR__

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

__REMAINING__
