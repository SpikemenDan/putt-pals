import { useEffect, useState } from 'react';
import { TIPS, TIP_MS, tipAt } from './tips.js';
import styles from './Loading.module.css';

/** Successive loads start on different tips without any randomness. */
let loads = 0;

/**
 * Loading screen shown over the start screen while a room is being opened (M1c): the brand, a status line and a
 * rotating gameplay tip. Mounted only while connecting, so its timer never outlives the wait.
 */
export function Loading() {
  const [start] = useState(() => loads++ * 5);
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setStep(s => s + 1), TIP_MS);
    return () => clearInterval(id);
  }, []);
  return (
    <div className={styles.loading} role="status" aria-live="polite" data-ui="loading">
      <h2 className={styles.loadingTitle}>⛳ Setting up your game…</h2>
      <div className={styles.bar} aria-hidden="true"><i /></div>
      <p className={styles.tip} data-ui="loading-tip"><b>TIP</b> {TIPS[tipAt(start, step)]}</p>
    </div>
  );
}
