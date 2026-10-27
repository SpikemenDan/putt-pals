# Camera

`createCameraRig()` is the game camera as plain state and arithmetic: no Three.js, DOM or input listeners. It reproduces the legacy camera exactly (same operation order as the original `THREE.Vector3` chain) and is verified frame by frame against the legacy game in `npm run test:render`.

- Views: `follow` (Ball cam), `hole` (Hole view), `strategic` (World view), cycled with `cycleView()`. Players who are waiting or spectating get `free` roam automatically; `update()` reports `free-roam-start`/`free-roam-end` events so the UI can show its hint and view label.
- Spring-damper smoothing per view, snapping after `reset()` (called on every course build).
- The putt-to-putt arc: `startPuttTransition({ from, to, now, reducedMotion })`; `update()` then returns the ball override position and ends with a `transition-end` event. Input should ignore shots while `transitioning` is true, as the legacy pointer handler did.
- Input hooks mirror the legacy handlers and their clamps: `zoom(deltaY)`, `orbitKey(key)`, `orbitDrag(start, x, y)`, `freeLook(start, x, y)`, `freeDolly(deltaY)`. `orbitKey`/`orbitDrag` return `false` in views that rotate the aim instead, so the input adapter (U1) can apply the aim change.

All positions are Three.js world coordinates; convert simulation positions with `src/render/transform.js`. `update()` takes `now` explicitly (legacy used `performance.now()` for the transition), so tests and the app drive one clock.
