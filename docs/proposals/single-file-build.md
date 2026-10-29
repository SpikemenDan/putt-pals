# Proposal: double-clickable single-file build of the modular app

Status: DRAFT proposal, not scheduled. Needs an owner decision because `AGENTS.md` currently lists single-file/offline distribution as outside the migration.

## Problem
`npm run build` writes `dist/index.html` (a stub) plus `dist/assets/*.js|css`, loaded as a module script from absolute paths. Browsers block that over `file://`, so the new game cannot be opened by double-clicking. The only double-clickable page is the frozen legacy `putt-pals.html`, which lacks the toon/comic look. Sharing a build today means hosting `dist/`.

## Option A (recommended): extra build output via `vite-plugin-singlefile`
- Add `vite-plugin-singlefile` (dev dependency) and a second Vite config (e.g. `vite.single.config.mjs`) producing `dist-single/putt-pals-single.html` with all JS and CSS inlined.
- New script, e.g. `npm run build:single`. The normal hosted `npm run build` is unchanged.
- Size: the current JS bundle is about 1.2 MB, so the file would be roughly 1.3 MB.
- Needs integration-owner approval: `package.json`, lockfile and build config change.

## Option B: no dependency
Set `base: './'`, build as a classic (non-module) IIFE bundle and inline it with a small post-build script. More custom code to maintain than A.

## What works from a double-clicked file
- Solo and practice play: expected to work (audio is procedural, no fetched files; verify no other `fetch`/asset URLs).
- Online rooms: need the network (PeerJS today, server rooms later) and a secure origin for WebRTC; not expected to work from `file://`. Treat as solo only unless tested.
- Anything using workers, `import.meta.url` assets or service workers must be checked.

## Acceptance
- `npm run build:single` produces one HTML file that starts a solo game in Chromium opened from `file://` with no console errors (real-browser evidence reported separately from jsdom).
- `npm run build`, `npm test` unchanged and green; hosted build untouched.
- README documents both outputs and the solo-only limit; `AGENTS.md` scope line updated by the owner.

## Out of scope
Native packaging, auto-update, offline online-rooms.
