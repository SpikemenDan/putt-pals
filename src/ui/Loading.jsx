import { useEffect, useRef, useState } from 'react';
import { TIPS, TIP_MS, tipAt } from './tips.js';
import { useUiContext } from './context.js';
import { createPlanetScene, mulberry32 } from './planet-scene.js';
import styles from './Loading.module.css';

/** Successive loads start on different tips, and paint different planets and flights, without wall-clock randomness. */
let loads = 0;

/**
 * Loading screen shown over the start screen while a room is being opened (M1c, VIS-M1): the brand and a status line over the
 * curved horizon of Gaia with golf balls now and then flying across the sky, plus a rotating gameplay tip. Mounted only while
 * connecting, so its timers and animation loop never outlive the wait. Under `prefers-reduced-motion` the planet is still and
 * no balls fly.
 */
export function Loading() {
  const { display } = useUiContext();
  const [load] = useState(() => loads++);
  const [step, setStep] = useState(0);
  const canvasRef = useRef(null);
  const ballsRef = useRef(null);
  useEffect(() => {
    const id = setInterval(() => setStep(s => s + 1), TIP_MS);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    const canvas = canvasRef.current, ballLayer = ballsRef.current;
    if (!canvas || !ballLayer) return undefined;
    const win = canvas.ownerDocument.defaultView;
    const reducedMotion = !!win.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const scene = createPlanetScene({ canvas, ballLayer, display, random: mulberry32(0x9a1a + load * 7919), reducedMotion, win });
    scene.start();
    return () => scene.dispose();
  }, [display, load]);
  return (
    <div className={styles.loading} role="status" aria-live="polite" data-ui="loading">
      <canvas ref={canvasRef} className={styles.planet} aria-hidden="true" data-ui="loading-planet" />
      <div ref={ballsRef} className={styles.balls} aria-hidden="true" />
      <div className={styles.copy}>
        <h2 className={styles.brand} data-ui="loading-title">Putt Pals</h2>
        <p className={styles.status}>⛳ Setting up your game…</p>
        <div className={styles.bar} aria-hidden="true"><i /></div>
      </div>
      <p className={styles.tip} data-ui="loading-tip"><b>TIP</b> {TIPS[tipAt(load * 5, step)]}</p>
    </div>
  );
}
