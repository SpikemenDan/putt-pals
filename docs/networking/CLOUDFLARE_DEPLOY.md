# Cloudflare preview preparation and deployment

N4F PR #129 is accepted. Preview deployment and hosted maintenance/compatible-code-update recovery were exercised under the bounded owner authorization in #73 on 2026-11-02. The deployment record below names the tested versions. Separate-network validation is deferred, and a discovered admission fix remains local pending review. This runbook grants no additional account, production or paid-plan authorization.

## Proposed preview

| Item | Proposed value |
| --- | --- |
| Plan | Workers Free; SQLite Durable Objects; no paid upgrade |
| Worker | `putt-pals-rooms-preview` |
| Origin | `https://putt-pals-rooms-preview.<approved-workers-subdomain>.workers.dev` |
| Binding / class | `ROOMS` / `RoomDurableObject`, SQLite, declarative `exports` |
| App | Built `dist/` assets and same-origin `/api/rooms/<code>/socket` WSS |
| Origin allowlist | Exactly the approved preview origin; no wildcard |
| Room namespace | `preview`, protocol 2; isolated from development and future production |
| Policy | 8 seats, 30-second grace, immediate controller transfer, 15-minute empty retention |
| Repository integration | None; manual reviewed deployments; no GitHub deploy credentials |
| Logging | Persisted observability disabled initially; inspect only approved/redacted diagnostics |
| Production | No production route, custom domain or production deployment in this proposal |

The generator reads the pinned base configuration, keeps its compatibility date and durable class declaration, and writes ignored local JSON under `.wrangler/deploy/`. It never starts Wrangler or makes a network request. Account IDs are not credentials; API tokens must never appear in generated config, source, issue comments or screenshots.

## Fresh checkout and local review

Use the repository's pinned Node/npm and `npm ci`, then:

```sh
npm run build
node tests/rooms/preview-config.test.mjs
npm run test:rooms:local
node scripts/prepare-cloudflare-preview.mjs --account-id 00000000000000000000000000000000 --workers-subdomain review-placeholder
node scripts/prepare-cloudflare-preview.mjs --account-id 00000000000000000000000000000000 --workers-subdomain review-placeholder --maintenance
npx wrangler deploy --dry-run --config .wrangler/deploy/preview.json --outdir .wrangler/deploy/preview-bundle
npx wrangler deploy --dry-run --config .wrangler/deploy/preview-maintenance.json --outdir .wrangler/deploy/maintenance-bundle
```

The zero account and `review-placeholder` are offline review inputs, not an approved deployment target. Inspect both generated JSON files and dry-run reconciliation reports. Replacing a different generated config requires `--replace`. Absolute entry/asset paths keep the nested generated config tied to this checkout; regenerate in each checkout rather than copying it to another machine.

`public/_headers` makes fingerprinted `/assets/*` immutable for one year and requires HTML revalidation. It also sets nosniff and a referrer policy for static responses. API responses are produced by the Worker, not these static rules. No CSP is introduced: the existing UI uses inline styles and the separate legacy reference has inline scripts/CDN libraries. Any CSP needs its own compatibility review. [Static asset header rules](https://developers.cloudflare.com/workers/static-assets/headers/)

## Approval worksheet, before connecting

Record these nonsecret details in the deployment approval request after the preparation PR is reviewable:

1. Exact Cloudflare account display name and 32-character ID, confirmed Free plan, existing `workers.dev` subdomain, and final generated origin.
2. Permission to create only `putt-pals-rooms-preview` and its `RoomDurableObject` SQLite namespace; record any existing resource with that name before proceeding. Stop on an unexpected existing Worker or reconciliation deletion/rename/transfer.
3. Authentication path and exact resource scopes. Prefer the owner creating the empty named Worker, then supplying a short-lived per-Worker **Editor** token through the local secret environment. Otherwise first creation requires Workers product-level **Admin** in the selected account and must be explicitly approved; reduce it after creation. No zone/route/domain permission is needed for this `workers.dev` proposal. Durable Object access follows its implementing Worker. [Workers roles](https://developers.cloudflare.com/workers/authorization/workers/), [Durable Object roles](https://developers.cloudflare.com/workers/authorization/durable-objects/)
4. Approval for two explicit publications to that same preview: maintenance baseline first, then the reviewed game build. This gives the game a rollback target with identical class lifecycle. It is a public preview URL containing invitation-only friend rooms, not an authenticated private website.
5. Approval for the bounded hosted acceptance/restart/rollback exercise and read-only metrics inspection. No paid plan, automatic deployment, repository connection or production publication is included.

Do not run `wrangler login`, `whoami`, remote resource listing, deploy, token creation or account API calls before this approval. Credentials should be entered through the owner's secure local environment, never pasted into chat or GitHub. If the actual account permission model differs, revise the scope worksheet rather than broadening the token silently.

## Authorized publication procedure

Only after the exact worksheet is approved and N4F is accepted:

1. Check out the approved commit with a clean tree. Record `git rev-parse HEAD`, Node/Wrangler versions, passing CI and the bundle/course/rules/checkpoint versions. Build and regenerate both configs with the approved ID/subdomain; review the diff from the offline placeholder versions.
2. Authenticate through the approved method. Inspect the selected account and existing Worker using the approved read scope. Confirm Free plan in the dashboard. Stop if a paid upgrade, unexpected resource, extra permission or lifecycle deletion is requested.
3. Publish the maintenance baseline and record its version/deployment IDs and class namespace ID:

   ```sh
   npx wrangler deploy --config .wrangler/deploy/preview-maintenance.json
   npx wrangler versions list --config .wrangler/deploy/preview.json
   npx wrangler deployments list --config .wrangler/deploy/preview.json
   ```

4. Confirm `/api/rooms/<test-code>/socket` returns `503`, `Cache-Control: no-store`, and no game admission; static HTML still returns 200 because assets route before the Worker. Then publish the approved game:

   ```sh
   npx wrangler deploy --config .wrangler/deploy/preview.json
   ```

5. Record the game version/deployment IDs and reconciliation result. Verify HTML revalidation, immutable hashed JS/CSS, no client credentials, WebSocket `101`, exact-origin rejection, and preview/development room isolation. `ROOM_LOCAL_DIAGNOSTICS` must be absent. Existing tabs with incompatible course/protocol data must fail visibly and preserve stored checkpoints.
6. Perform the four-client, separate-network checklist in [N4_SERVER_ROOMS.md](../reviews/N4_SERVER_ROOMS.md). Record actual browser/OS/networks, scores, controller leave, guest retries, background behavior, compatible deploy/restart recovery, timings and provider measurements. A local pass does not fill these rows.

## Rollback and retention

Both proposed entries export the exact same `RoomDurableObject` class and SQLite configuration. The maintenance entry returns `503` for new HTTP/WebSocket requests; it preserves checkpoints and does not revoke room identities. Already-connected Durable Object sockets may continue until they close or expire, so this is not an immediate kill switch for active games.

Cloudflare blocks rollback across Durable Object lifecycle changes. Keep the same class name, storage backend, bindings and `exports`; never remove the class or return to legacy `migrations` as a rollback tactic. [Class lifecycle](https://developers.cloudflare.com/durable-objects/reference/durable-objects-migrations/), [Rollback constraints](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/)

After publishing the game, exercise rollback to the recorded maintenance version under the approved test window:

```sh
npx wrangler rollback APPROVED_MAINTENANCE_VERSION_ID --config .wrangler/deploy/preview.json
```

Confirm new admissions fail safely and retained state is not deleted. Redeploy the approved compatible game config, then resume a reserved seat within grace. Record the new deployment ID, unchanged session/score/deadline, and any socket reconnect. For later game-to-game rollback, verify checkpoint field compatibility, schema/rules versions and course hash; matching version numbers alone are insufficient. Incompatible checkpoints intentionally fail closed and must not be deleted to make a rollout look successful. Use a forward fix or a separately approved data-migration plan.

### Release rollback procedure (Q1 #18)

One Worker serves both the hosted build (`dist/` static assets) and the room Durable Objects, so a Worker version is the unit of release and of rollback: rolling back restores that version's page, scripts and room code together. Rollback is an owner-authorized action like a deploy; this section authorizes nothing.

Before every publication, record the rollback target in the deployment record:

1. The currently serving game version ID and the maintenance version ID (`npx wrangler deployments list --config .wrangler/deploy/preview.json`).
2. For both the serving and the new version: git commit, `PROTOCOL_VERSION` (`src/shared/constants.js`), `SERVER_ROOM_VERSION` and `CHECKPOINT_VERSION` (`src/network/contracts/server-room.js`), and course data hash. The new version is **checkpoint-compatible** with the old one only if the old code can read every checkpoint the new code writes: same room/checkpoint versions and course hash, confirmed by `npm run test:rooms:local` on the old commit, not by version numbers alone.

To roll back after a bad release:

1. **Stop new admissions first** if the fault is in rooms or data: `npx wrangler rollback <MAINTENANCE_VERSION_ID> --config .wrangler/deploy/preview.json`. New sockets get `503`; retained checkpoints stay. Connected sockets may persist until they close.
2. **Compatible target**: deploy it at 100% with `npx wrangler versions deploy <GAME_VERSION_ID>@100 --durable-objects-code-update-mode immediate --config .wrangler/deploy/preview.json` (the commands exercised in N4g). Static assets switch with it; open tabs must reload (HTML revalidates; older hashed assets are not served by the new version).
3. **Incompatible target** (any of the versions or the course hash differ): do not roll back game code under live rooms. Either keep maintenance until active rooms end and empty-room retention (15 minutes) passes, then deploy the old version and accept that retained newer checkpoints fail closed with a visible incompatible-checkpoint error; or ship a forward fix. Never delete checkpoints, rename/remove `RoomDurableObject` or add `migrations` to make a rollback succeed.
4. **Verify**: `deployments list` shows the target at 100%; `/` returns 200 with the expected build; `/api/rooms/<test-code>/socket` returns `101` for a game version (`503` for maintenance); a fresh two-tab room completes a putt; a reserved seat resumes within grace on a compatible rollback. Record the IDs, times and results in the deployment record below.

The recorded preview versions below predate current main (`PROTOCOL_VERSION` 6, `SERVER_ROOM_VERSION` 8, 24 maps). After main is deployed, version `57061c95…` is therefore an **incompatible** rollback target; use the maintenance version and step 3, or record a new compatible game version as the target.

Preserve version IDs and redacted logs, never raw resume tokens, hashes, WebSocket frames, client IPs or player content in issues. Basic provider metrics should measure DO request units, active duration, SQLite rows/bytes and failures over an active game and idle retention. Compare against the dated Free estimate in N4F. There is no automatic paid upgrade, TURN fallback or automatic switch of an active game to solo. Account-wide quota exhaustion may prevent code from running at all.

## Deployment record

Owner deployment confirmation and hosted checks were recorded on 2026-11-02; see [the acceptance report](../reviews/N4_SERVER_ROOMS.md). Deployment is complete. Provider-authenticated recovery/rollback passed; separate-network acceptance and integration of the discovered admission fix remain outstanding.

| Gate | Evidence |
| --- | --- |
| Exact account / plan / scopes approved | Owner authorization recorded in #73 |
| N4F accepted with current-head CI | Complete: PR #129, issue #72 closed |
| Maintenance version / namespace | `56829c13-2e98-4d0f-846c-14bc6137d7ea` / `3bf1f90737004e2186569fad5d7451b4` |
| Game version / deployment / origin | Restored `57061c95-7170-4bbf-96bc-55d3cf35e46e`, deployment `d1efb74a-c19b-451e-8204-2c9199377d12`; HTTPS 200 |
| Four-player separate-network game | Not performed |
| Controller leave / retry / compatible code-update recovery | Passed on hosted preview, including fresh-socket resume and post-recovery round advancement; see acceptance report |
| Rollback and restored checkpoint | Passed immediate maintenance/game updates; identities, scores and deadlines retained |
| Measured hosted quota and idle cost | Namespace request/duration/rows/storage observations recorded; idle window has no rows, not a zero-cost claim |

N4G and the parent N4/Q1 network gate remain incomplete until this record is accepted. Production publication requires its own decision.
