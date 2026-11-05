import { useEffect, useRef, useState } from 'react';
import { TIPS, TIP_MS, tipAt } from './tips.js';
import { useUiContext } from './context.js';
import { createPlanetScene, mulberry32 } from './planet-scene.js';
import { createPuttProgress } from './putt-progress.js';
import '@fontsource/bangers/latin-400.css';
import '@fontsource/nunito/latin-800.css';
import styles from './Loading.module.css';

/** Successive loads start on different tips, and paint different planets and flights, without wall-clock randomness. */
let loads = 0;

/**
 * Loading screen shown over the start screen while a room is being opened (M1c, VIS-M1): the brand over the curved horizon of Gaia
 * with Ares and Luna in the distance and golf balls now and then flying across the sky, a rotating gameplay tip, and the progress
 * itself: one ball rolling left to right along a green toward the cup. When `done` is set (the game is ready) the ball rolls the
 * rest of the way in and `onDone` is called so the owner can close the screen. Mounted only while loading, so its timers and
 * animation loops never outlive the wait. Under `prefers-reduced-motion` the planet is still and no balls fly.
 */
export function Loading({ done = false, onDone }) {
  const { display } = useUiContext();
  const [load] = useState(() => loads++);
  const [step, setStep] = useState(0);
  const canvasRef = useRef(null);
  const ballsRef = useRef(null);
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
    const canvas = canvasRef.current, ballLayer = ballsRef.current;
    if (!canvas || !ballLayer) return undefined;
    const win = canvas.ownerDocument.defaultView;
    const reducedMotion = !!win.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const scene = createPlanetScene({ canvas, ballLayer, display, random: mulberry32(0x9a1a + load * 7919), worlds: { ares: aresRef.current, luna: lunaRef.current }, reducedMotion, win });
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
      track.style.setProperty('--p', p.step(dt).toFixed(4));
      if (p.done && !closed) {
        closed = true;
        track.dataset.state = 'sunk'; // the ball drops into the cup
        timer = setTimeout(() => doneRef.current?.(), 350);
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
      <div className={styles.stars} aria-hidden="true"><i /><i /><i /></div>
      <div ref={ballsRef} className={styles.balls} aria-hidden="true" />
      <div className={styles.copy}>
        <h2 className={styles.brand} data-ui="loading-title">Putt Pals</h2>
        <p className={styles.status}>Setting up your game…</p>
        <div ref={puttRef} className={styles.putt} aria-hidden="true" data-ui="loading-putt">
          <i className={styles.turf} /><b className={styles.cup} /><s className={styles.flag} /><em className={styles.putter} /><u className={styles.rollball} />
        </div>
      </div>
      <p className={styles.tip} data-ui="loading-tip"><b>TIP</b> {TIPS[tipAt(load * 5, step)]}</p>
    </div>
  );
}

/**
 * Owns when the loading screen is on screen: shown while `connecting`, and kept for the finishing roll after a successful load so
 * the ball visibly reaches the cup before the game appears. A failed connection (`failed`) closes it at once.
 */
export function LoadingGate({ connecting, failed = false }) {
  const [state, setState] = useState(connecting ? 'running' : 'idle');
  if (connecting && state !== 'running') setState('running');
  else if (!connecting && state === 'running') setState(failed ? 'idle' : 'finishing');
  else if (failed && state === 'finishing') setState('idle');
  if (state === 'idle' || (!connecting && state === 'running')) return null;
  return <Loading done={state === 'finishing'} onDone={() => setState('idle')} />;
}
