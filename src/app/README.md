# Modular application (I1)

`index.html` → `src/app/main.js` → `createApp()` runs the game from the extracted modules: course data (D1), simulation (S1), room session (L1), transports (N1), audio (A1), renderer and camera (R1), React UI and input (U1). The legacy single-file game stays at `putt-pals.html`, unchanged and still built; Q1 owns the hosting/release decision. N4a's server-room contract is accepted at `b30552f`, but the modular app still uses PeerJS until N4's server and browser-adoption tasks are integrated.

```js
import * as THREE from 'three';          // three@0.128.0, the version the legacy page embeds
import { Peer } from 'peerjs';           // peerjs@1.5.4, ditto
import { createApp } from './src/app/index.js';

const app = createApp({ root: document.getElementById('root'), THREE, Peer, peerServer: {} });
// ...
await app.dispose();                     // leaves the room and releases everything
```

## What the app owns

- **One loop.** A single `requestAnimationFrame` loop advances the local ball in fixed 1/240 s steps (frame time clamped to 0.05 s, as before), renders through `createGameView()` and updates the audio listener. A 100 ms interval refreshes the HUD and room countdowns. Nothing runs at 240 Hz through React.
- **Rooms** (`room.js`). Solo uses the in-memory solo transport with a local session. Online, the first player to claim `puttpals-circuit-v6-<code>` on the signalling server becomes host (session + `bindRoomSession`), and later players join as guests (legacy behaviour). The namespace changed from `-v5-` because the protocol is incompatible with the legacy page. `peerServer` optionally points PeerJS at a self-hosted PeerServer; `main.js` reads `window.__PP_PEER_SERVER` for that.
- **Rounds** (`putt.js`). When the room's round starts, the app builds the putt's scene, creates a `SimulationEngine` (hazard time = room time since the start, as before), aims at the hole and, for putts 2–6 outside putt practice, plays the putt-to-putt arc and warp cue. It reports each finished putt once with `REPORT_SCORE`, including timeouts at the real deadline. Live stroke counts travel in presence, which is how the legacy scoreboard got them. Rewind can lower a count, which the session's `UPDATE_STROKES` would reject.
- **Legacy rules around the simulation** (`rules.js`): fans, tornadoes and moving hazards wake a resting ball; a ball moving for 25 s returns to its last spot; `?` blocks give random power-ups (inventory of 3, reset each putt); sunk players switch to waiting/free roam after 1.2 s; the scorecard opens on sinking (not in putt practice); power-ups and their toasts/banners; Zanyball ×1.6 and Reversiball.
- **Presence** every 70 ms (or immediately on shots, sinks and power-ups): rounded position, mode, strokes, aura `effect` and attack `fx`. Remote balls of players still putting are drawn with names, auras and shadows; finished players' balls are hidden (legacy). Remote shots and sinks are audible; attacks land as pending Reversiball/Zanyball with the legacy toast.
- **Audio.** Local cues come from the same frame-to-frame inference the legacy page used (shot, splash, teleport, jump pad, significant bounce, sink), fed once into the A1 adapter. Banner fanfares play when a banner shows. The warp cue plays on putt transitions.
- **Commands.** The UI dispatcher and the input adapter share one handler: join/solo/leave, session commands, shot, items, camera view (free-roam hint when flying), quality, sound and invite (copies `#room=<code>` link, legacy wording).
- **Leaving** closes the transport, session bridge, putt and timers, resets audio voices and returns to the start screen without a page reload. The renderer and loop are reused. `dispose()` also removes every listener, stops the loop and interval, disposes the WebGL renderer, unmounts React and closes audio.

## Deliberate differences from the legacy page

- Leaving a room returns to the start screen instead of reloading the page.
- Ball colours follow join order (the protocol carries no colour; legacy picked randomly). All screens and balls agree.
- A player who leaves and rejoins gets a new identity, so tournament totals list them twice; resume identity is N2's scope.
- Presence gained two optional, validated fields (`effect`, `fx`) to keep power-up auras and attacks working across players; see `src/network/protocol.js`.

## Verification

`npm run test:app` runs the composed app in jsdom clients on one virtual clock (stub WebGL renderer and audio, N1 in-memory transport). It covers:
- a full solo map of six holes in one through the real UI (transitions, banners, sounds, waiting/free roam);
- a real canvas drag and keyboard shortcuts;
- course practice with a timeout scoring par + penalty;
- putt-practice replay and stepping;
- a four-player three-map tournament with a Zanyball attack, a guest leaving and rejoining as a spectator, identical totals everywhere and host loss;
- ten join/leave cycles with one loop and no leaked listeners/timers/rooms, plus full disposal;
- a bundle check that the runtime contains no legacy extraction;
- a check that npm three@0.128.0 builds all 22 courses identically to the embedded copy.

Real-browser evidence (Chromium, WebGL, real PeerJS/WebRTC) is recorded in `docs/reviews/I1_APP.md`.
