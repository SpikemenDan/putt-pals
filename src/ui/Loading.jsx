import { useEffect, useRef, useState } from 'react';
import { TIPS, TIP_MS, tipAt } from './tips.js';
import { useUiContext } from './context.js';
import styles from './Loading.module.css';

/** Successive loads start on different tips and different traffic, without wall-clock randomness. Gaia itself is always the same place. */
let loads = 0;

/** Small seeded generator for the scene, so a load's planet is reproducible. */
function seeded(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/**
 * The 3D planet behind the main menu and the loading screen (src/render/planet-scene.js, built by the app and passed down as
 * `createLoadingScene`). One scene serves both, so the menu turns into the loading screen with no reload or jump. Rendered only while
 * one of them is up: the scene is built after the first paint and released when the game takes over. Under `prefers-reduced-motion`
 * it is one still frame.
 */
export function PlanetStage() {
  const { display, createLoadingScene } = useUiContext();
  const [load] = useState(() => loads);
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !createLoadingScene) return undefined;
    const win = canvas.ownerDocument.defaultView;
    const reducedMotion = !!win.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let scene = null;
    const build = setTimeout(() => { // after the first paint, so the title and form show at once
      try { scene = createLoadingScene({ canvas, display, random: seeded(load * 7919 + 1), reducedMotion, win }); scene.start(); } catch { scene = null; } // decoration only: the CSS sky stays
    }, 0);
    return () => { clearTimeout(build); scene?.dispose(); };
  }, [display, load, createLoadingScene]);
  return <div className={styles.stage} aria-hidden="true" data-ui="planet-stage"><canvas ref={canvasRef} className={styles.planet} data-ui="loading-planet" /></div>;
}

/**
 * Loading screen shown while a room is being opened (M1c, VIS-M1): over the planet stage, the brand, a rotating gameplay tip and three golf
 * balls with a highlight running across them until the game is ready. When `done` is set all three stay lit for
 * `display.loading.finishTime` seconds, then `onDone` closes the screen. Mounted only while loading, so its timers never outlive the wait.
 * Under `prefers-reduced-motion` the balls do not animate.
 */
export function Loading({ done = false, onDone }) {
  const { display } = useUiContext();
  const [load] = useState(() => loads++);
  const [step, setStep] = useState(0);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  useEffect(() => {
    const id = setInterval(() => setStep(s => s + 1), TIP_MS);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (!done) return undefined;
    const id = setTimeout(() => doneRef.current?.(), display.loading.finishTime * 1000);
    return () => clearTimeout(id);
  }, [done, display]);
  return (
    <div className={styles.loading} role="status" aria-live="polite" data-ui="loading" data-state={done ? 'done' : 'loading'}>
      <div className={styles.copy}>
        <h2 className={styles.brand} data-ui="loading-title">Putt Planet</h2>
        <p className={styles.status}>Setting up your game…</p>
        <div className={styles.balls} aria-hidden="true" data-ui="loading-balls"><i className={styles.ball} /><i className={styles.ball} /><i className={styles.ball} /></div>
      </div>
      <p className={styles.tip} data-ui="loading-tip"><b>TIP</b> {TIPS[tipAt(load * 5, step)]}</p>
    </div>
  );
}

/**
 * Owns when the loading screen is on screen: shown while `connecting`, and kept for a moment after a successful load with all three
 * balls lit. A failed connection (`failed`) closes it at once. The planet stage stays up for the `menu` and the loading screen alike.
 */
export function LoadingGate({ connecting, failed = false, menu = false }) {
  const [state, setState] = useState(connecting ? 'running' : 'idle');
  if (connecting && state !== 'running') setState('running');
  else if (!connecting && state === 'running') setState(failed ? 'idle' : 'finishing');
  else if (failed && state === 'finishing') setState('idle');
  const loading = state !== 'idle' && (connecting || state !== 'running');
  return (
    <>
      {(menu || loading) && <PlanetStage />}
      {loading && <Loading done={state === 'finishing'} onDone={() => setState('idle')} />}
    </>
  );
}
