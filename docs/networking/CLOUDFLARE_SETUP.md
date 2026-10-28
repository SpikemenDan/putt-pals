# Local Cloudflare Worker setup

N4b adds a local-only development path for the accepted server-room contract in [SERVER_ROOMS.md](SERVER_ROOMS.md). It serves the normal Vite build from Cloudflare Static Assets and routes `/api/rooms/<roomCode>/socket` to a named SQLite-backed Durable Object. The Durable Object currently proves only local class binding, room/environment isolation and WebSocket upgrade routing; N4c/N4d own admission, protocol handling, game authority and recovery.

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

The first command builds the app and runs a bounded local runtime smoke test with isolated temporary SQLite persistence. It checks static asset delivery, API/asset separation, unknown and invalid routes, the WebSocket upgrade, repeatable room identity and distinct room/environment names. Test diagnostics under `/api/_local/rooms/<roomCode>/identity` require both the development environment and the local-only `ROOM_LOCAL_DIAGNOSTICS` CLI variable; they expose only the local Durable Object ID, not room state or credentials.

The dry run validates the pinned Worker/Static Assets/SQLite Durable Object bundle without publishing it. It is not a deployment or account-connection check. N4b does not configure remote bindings, routes, secrets, CI credentials, or account resources. Do not run `wrangler deploy` for this setup task.

## Boundaries and later setup

- `wrangler.jsonc` pins the Worker compatibility date and configures the SQLite Durable Object class through Wrangler's declarative `exports` configuration.
- Room object names include environment, protocol v2 and the canonical room code; callers reject codes outside the accepted 1–12 lowercase ASCII letter/digit form.
- The local WebSocket endpoint accepts the platform upgrade but intentionally does not implement the v2 hello/session protocol. A received frame closes with a transient-unavailable status until N4c integrates the server authority.
- No remote account is selected and no preview/production route or custom domain is configured.
- Before a preview can be deployed, N4g must obtain explicit authorization for the exact account, plan, resource names, origins, repository/token scopes and deploy action, then configure the route, secrets and rollback process. Never put tokens in source, client assets, logs or issue comments.

Wrangler is pinned as a development dependency at `4.155.0`; its `workerd` runtime is resolved through the lockfile. Compatibility/runtime upgrades should be reviewed and tested deliberately rather than floated.
