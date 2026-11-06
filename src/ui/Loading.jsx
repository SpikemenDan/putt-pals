import { useEffect, useRef, useState } from 'react';
import { TIPS, TIP_MS, tipAt } from './tips.js';
import { useUiContext } from './context.js';
import { createPlanetScene, mulberry32 } from './planet-scene.js';
import { createPuttProgress } from './putt-progress.js';
import styles from './Loading.module.css';

/** Number of putt balls in the progress indicator; each one drops into its cup as progress passes its share. */
const BALLS = 3;

/** Successive loads start on different tips, and paint different planets and flights, without wall-clock randomness. */
let loads = 0;

/**
 * Loading screen shown over the start screen while a room is being opened (M1c, VIS-M1): the brand over the curved horizon of Gaia
 * with cities, planes, boats and satellites, Ares and Luna in the distance, a rotating gameplay tip, and the progress itself: one
 * spinning ball with a comet tail flying left to right along a dotted shot arc toward the flag. When `done` is set (the game is ready) the ball flies the
 * rest of the way in and `onDone` is called so the owner can close the screen. Mounted only while loading, so its timers and
 * animation loops never outlive the wait. Under `prefers-reduced-motion` the planet is still and nothing flies.
 */
export function Loading({ done = false, onDone }) {
  const { display } = useUiContext();
  const [load] = useState(() => loads++);
  const [step, setStep] = useState(0);
  const canvasRef = useRef(null);
  const spritesRef = useRef(null);
  const aresRef = useRef(null);
  const lunaRef = useRef(null);
  const puttRef = useRef(null);
  const progress = useRef(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  if (!progress.current) progress.current = createPuttProgress(display);
  useEffect(() => {
    const id = setInterval(() => setStep(s => s + 1), TIP_MS);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const win = canvas.ownerDocument.defaultView;
    const reducedMotion = !!win.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const scene = createPlanetScene({ canvas, sprites: spritesRef.current, display, random: mulberry32(0x9a1a + load * 7919), worlds: { ares: aresRef.current, luna: lunaRef.current }, reducedMotion, win });
    scene.start();
    return () => scene.dispose();
  }, [display, load]);
  useEffect(() => { if (done) progress.current.finish(); }, [done]);
  useEffect(() => { // drives the putt progress: the ball position is a CSS variable, so React does not re-render each frame
    const track = puttRef.current, win = track?.ownerDocument.defaultView;
    if (!track || !win?.requestAnimationFrame) return undefined;
    let frame = null, last = null, closed = false, timer = null;
    const tick = now => {
      const dt = last === null ? 0 : Math.min(0.1, (now - last) / 1000);
      last = now;
      const p = progress.current;
      const v = p.step(dt);
      track.dataset.sunk = String(Math.min(BALLS, Math.floor(v * BALLS + 1e-6))); // balls already in their cups
      if (p.done && !closed) {
        closed = true;
        track.dataset.state = 'sunk'; // the last ball drops in
        timer = setTimeout(() => doneRef.current?.(), 650);
      }
      if (!closed) frame = win.requestAnimationFrame(tick);
    };
    frame = win.requestAnimationFrame(tick);
    return () => { if (frame !== null) win.cancelAnimationFrame(frame); clearTimeout(timer); };
  }, []);
  return (
    <div className={styles.loading} role="status" aria-live="polite" data-ui="loading" data-state={done ? 'done' : 'loading'}>
      <canvas ref={canvasRef} className={styles.planet} aria-hidden="true" data-ui="loading-planet" />
      <div className={styles.worlds} aria-hidden="true">
        <canvas ref={aresRef} className={`${styles.world} ${styles.ares}`} data-world="ares" />
        <canvas ref={lunaRef} className={`${styles.world} ${styles.luna}`} data-world="luna" />
      </div>
      <canvas ref={spritesRef} className={styles.sprites} aria-hidden="true" data-ui="loading-traffic" />
      <div className={styles.stars} aria-hidden="true"><i /><i /><i /></div>
      <div className={styles.copy}>
        <h2 className={styles.brand} data-ui="loading-title">Putt Pals</h2>
        <p className={styles.status}>Setting up your game…</p>
        <div ref={puttRef} className={styles.putts} aria-hidden="true" data-ui="loading-putt" data-sunk="0">
          {Array.from({ length: BALLS }, (_, k) => <span key={k} className={styles.slot}><u className={styles.ball} /><i className={styles.cup} /></span>)}
        </div>
      </div>
      <p className={styles.tip} data-ui="loading-tip"><b>TIP</b> {TIPS[tipAt(load * 5, step)]}</p>
    </div>
  );
}

/**
 * Owns when the loading screen is on screen: shown while `connecting`, and kept for the finishing roll after a successful load so
 * the last ball visibly drops in before the game appears. A failed connection (`failed`) closes it at once.
 */
export function LoadingGate({ connecting, failed = false }) {
  const [state, setState] = useState(connecting ? 'running' : 'idle');
  if (connecting && state !== 'running') setState('running');
  else if (!connecting && state === 'running') setState(failed ? 'idle' : 'finishing');
  else if (failed && state === 'finishing') setState('idle');
  if (state === 'idle' || (!connecting && state === 'running')) return null;
  return <Loading done={state === 'finishing'} onDone={() => setState('idle')} />;
}
