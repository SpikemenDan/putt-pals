# Procedural audio adapter (A1)

`createAudioAdapter()` preserves the eleven legacy procedural sounds: putt, bounce, sink, sinkover, hio, power, event, splash, teleport, warp and boing. It has no React, Three.js, DOM lookup, simulation mutation, network or audio-file dependency. The embedded browser still uses its original audio; I1 owns adoption. No audio library or new dependency is introduced.

```js
import { createAudioAdapter } from './src/audio/index.js';

// One adapter per application, reused across rooms. Construction creates no AudioContext.
const audio = createAudioAdapter();
const unbindGestures = audio.bindGestures(window);
// In the application, after simulation.launch()/step(), consume each emitted event once:
audio.handleEvent(shotEvent, { origin: [courseOriginX, courseOriginY] });
audio.updateListener({ position: [cx, cy, cz], forward: [dx, dy, dz] });
// UI mute button: await audio.toggleMute(); read audio.getStatus().muted for its label.
// On room departure: stop event delivery, then audio.resetSession().
// On app teardown: unbindGestures(); await audio.dispose().
```

## Ownership and browser lifecycle

`unlock()` synchronously creates/resumes the context inside the caller's user gesture and returns a Promise<boolean>. `bindGestures(target)` binds pointerdown, keydown, click and touchstart in capture/passive mode; repeated binding of the same target returns the same idempotent disposer. It performs no global registration unless explicitly called. Simultaneous unlocks share the resume/failed-initialization cleanup promise. Unsupported audio and failed/resume-denied contexts return false; optional `onError(error)` receives diagnostics without breaking gameplay. No sound is queued before the context is running, avoiding delayed bursts after unlock.

`setMuted(boolean)` persists `pp_mute` as 1/0 when storage is available and sets the legacy master gain to 0 or 0.7. Denied storage is tolerated. Muting stops current scheduled voices so stale tails do not revive after unmute. `toggleMute()` attempts unlock on unmute and plays the original event preview at volume 0.5. Call it from the mute button/key gesture. UI labels are application-owned; the adapter does not query or modify the DOM.

`resetSession()` stops/disconnects voices while keeping the one unlocked context, mute preference and application gesture bindings. It is the room join/leave cleanup path. `dispose()` is terminal/idempotent: removes all registered gesture handlers, cancels sources, detaches their ended callbacks, disconnects all owned nodes/master, drops the shared noise buffer and closes its owned context. Await its returned promise before constructing a replacement adapter. Failed partial context creation is also closed, with retries gated until cleanup finishes. Supply `createContext`, `storage`, `random` and `onError` for testing or alternate hosts; the factory transfers context ownership to the adapter. A returned context must implement the normal WebAudio node/lifecycle APIs. No module import touches AudioContext or storage.

Each voice owns its oscillator/buffer sources, filters, gains and optional panner. Ended events release its whole graph when the last scheduled source ends. The default capacity is 32 concurrent cues (`maxVoices`, 1..128); overflow returns false without allocating nodes. `play(name, worldPositionOrNull, volume=1)` rejects unknown/inherited-property names, nonfinite positions and volume outside 0..1. Panners retain equalpower/inverse distance, refDistance 250, rolloff 0.6 and maxDistance 4000. The shared half-second mono noise buffer and bounce variation use injected randomness; tone/filter/envelope/timing parameters match the legacy recipes.

## Domain events and coordinates

`handleEvent(event, options)` accepts simulation coordinates in `event.position: [x,y,z]`, with x/y horizontal and z elevation. `options.origin` is the two-component course offset; the shared `simToWorld` conversion applies ball-center height. `play()` and `updateListener()` instead accept world coordinates; do not convert the camera a second time. Listener vectors are finite world-space `[x,y,z]` arrays, `up` defaulting to `[0,1,0]`. Modern AudioParams and legacy positional/orientation setters are supported. The renderer/application supplies camera vectors directly; no Three.js object is imported.

| Event | Cue and policy |
| --- | --- |
| shot | putt, local volume from event power or `options.speed`; remote 0.8 |
| bounce | bounce, volume from optional speed or default 0.6 |
| sink | sink/sinkover from timedOut; remote volume 0.9 |
| timeout | sinkover, only when no corresponding timed-out sink event is consumed |
| out_of_bounds | splash |
| hazard: pad / teleporter | boing / teleport, volume 0.8 |
| banner: hio / power / event | Matching nonspatial cue at 0.9 |
| putt_change | warp, except when `initial:true` |
| rest / cup_lip / surface_change / unknown | Silent |

`options.remote:true` admits only shot/sink/timeout, preserving the legacy remote-audio policy. Network snapshots are not themselves an event stream: I1 must derive each remote stroke/completion once and not replay it every snapshot. Consume either timeout or timed-out sink for one completion. A hole-in-one sink emits the sink cue only; the application emits one separate hio banner event, matching the original banner-triggered fanfare. Power/banner/putt-change are explicit application events, not additions to simulation contracts. No new turn-ready or menu-hover sounds are added by this extraction.

The old browser inferred local bounce/hazard sounds from frame snapshots. The adapter consumes existing S1 domain events instead. I1 must preserve the legacy significance filtering for collision playback (previous/current speeds above 40/20 and velocity direction cosine below 0.75), supplying the post-collision speed; event physics thresholds are not changed by A1. Do not feed both old snapshot inference and the new event adapter in the integrated browser. Audio consumes caller-owned events without mutating them; scheduling and per-frame listener updates remain outside React state.

## Verification and limits

`npm run test:audio` has nine instrumented-node scenarios. Every recipe's waveform, frequency/filter automation, gains and start/stop times are compared against the legacy source using a migration-only reference harness. Production audio never reads/evaluates legacy source. Tests additionally cover actual SimulationEngine shot/sink events, coordinate conversion, modern/legacy listener/panner APIs, lazy/concurrent unlock, denied storage/resume, mute preview, partial initialization/voice failures, source-ended cleanup, twenty room reset cycles, capacity and disposal during resume.

These are deterministic node/API checks, not listening or autoplay acceptance in a real browser. Real-browser sound quality, spatial balance, gesture/autoplay behavior and repeated integrated joins/leaves remain I1/T1/manual release checks. A1 preserves synthesis and adapter ownership; it does not certify the future integrated browser.

API references: [AudioContext close](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/close), [source ended event](https://developer.mozilla.org/en-US/docs/Web/API/AudioScheduledSourceNode/ended_event), [AudioListener](https://developer.mozilla.org/en-US/docs/Web/API/AudioListener).
