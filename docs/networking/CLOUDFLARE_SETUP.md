# Local Cloudflare Worker setup

The local development path serves the normal Vite build from Cloudflare Static Assets and routes `/api/rooms/<roomCode>/socket` to a named SQLite-backed Durable Object. N4C coordination, N4D durable recovery and N4E browser adoption are merged. Local runtime success does not establish hosted or separate-network acceptance. See [SERVER_ROOMS.md](SERVER_ROOMS.md) for the contract and [CLOUDFLARE_DEPLOY.md](CLOUDFLARE_DEPLOY.md) for N4G's offline preparation and deployment approval worksheet.

## Requirements

- Node.js `^22.22.2 || ^24.15.0 || >=26.0.0`, matching the repository engines.
- npm from the matching Node.js installation.
- The pinned Wrangler CLI is installed with `npm ci`; no `wrangler login` or Cloudflare account is needed for local commands.

## Run locally

```sh
npm ci
npm run rooms:dev
```

This builds the existing modular and legacy pages, then starts Wrangler on `127.0.0.1:8787` with remote bindings disabled. Local Durable Object state persists under `.wrangler/state` and is ignored by Git. Stop the process with Ctrl-C.

The top-level Wrangler config is the development environment. The `preview` and `production` named environments use distinct room namespaces and environment values. They can be selected locally with `npx wrangler dev --local --env preview` or `--env production`; those commands still use local emulation. No deployment script is provided by this task.

## Verify the runtime

```sh
npm run test:rooms:local
npx wrangler deploy --dry-run --env=""
```

The first command builds the app, runs deterministic recovery and real local workerd hibernation/process-restart checks, then runs a bounded Wrangler runtime test with isolated temporary SQLite persistence. It checks static asset delivery, API/asset separation, invalid routes, origin rejection, v2 handshake and input limits, room isolation/eight-member capacity, controller succession and resume, and four clients completing a six-putt game. Test diagnostics under `/api/_local/rooms/<roomCode>/identity` require both the development environment and the local-only `ROOM_LOCAL_DIAGNOSTICS` CLI variable; they expose only the local Durable Object ID, not room state or credentials.

The dry run validates the pinned Worker/Static Assets/SQLite Durable Object bundle without publishing it. It is not a deployment or account-connection check. N4b does not configure remote bindings, routes, secrets, CI credentials, or account resources. Do not run `wrangler deploy` for this setup task.

## Boundaries and later setup

- `wrangler.jsonc` pins the Worker compatibility date and configures the SQLite Durable Object class through Wrangler's declarative `exports` configuration.
- Room object names include environment, protocol v2 and the canonical room code; callers reject codes outside the accepted 1–12 lowercase ASCII letter/digit form.
- `ROOM_ALLOWED_ORIGINS` is an optional comma-separated exact-origin allowlist; configure it for non-local environments. Without it, only development loopback requests are accepted (same-origin when an `Origin` header is present).
- `ROOM_POLICY` is an optional JSON object of validated new-room policy overrides (`reconnectGraceMs`, `controllerTransferDelayMs`, `emptyRoomTtlMs`). Invalid JSON, unknown fields or out-of-range values fail admission rather than silently falling back.
- The durable room adapter writes/reconstructs the validated N4a checkpoint and uses hibernating WebSockets and durable alarms. See [DURABLE_RECOVERY.md](DURABLE_RECOVERY.md) for commit guarantees, local eviction/process-restart tests, active-cost bounds and rollback limits. These local checks do not establish deployed recovery or separate-network acceptance.
- No remote account is selected and no preview/production route or custom domain is configured.
- Before a preview can be deployed, N4g must obtain explicit authorization for the exact account, plan, resource names, origins, repository/token scopes and deploy action, then configure the route, secrets and rollback process. Never put tokens in source, client assets, logs or issue comments.

Wrangler is pinned as a development dependency at `4.155.0`; its `workerd` runtime is resolved through the lockfile. Compatibility/runtime upgrades should be reviewed and tested deliberately rather than floated.
