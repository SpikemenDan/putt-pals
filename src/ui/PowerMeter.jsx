import { useEffect, useRef } from 'react';
import { accuracyText } from '../input/aim.js';
import { useUiContext } from './context.js';
import hud from './Hud.module.css';

/**
 * Power bar and accuracy caption. Charge changes on every pointer move, so the
 * meter writes to the DOM through refs instead of React state (legacy frame()
 * updated #pwi and #accuracy directly).
 */
export function PowerMeter() {
  const { aim } = useUiContext();
  const bar = useRef(null), caption = useRef(null);
  useEffect(() => {
    if (!aim) return undefined;
    return aim.subscribeAim((charging, charge) => {
      if (bar.current) {
        bar.current.style.width = (charge * 100) + '%';
        bar.current.parentElement.setAttribute('aria-valuenow', String(Math.round(charge * 100)));
      }
      if (caption.current) caption.current.textContent = accuracyText(charging, charge);
    });
  }, [aim]);
  return (
    <div className={hud.ctl}>
      <span className={hud.hit}>DRAG BACK → RELEASE</span>
      <div className={hud.pw} role="meter" aria-label="Shot power" aria-valuemin={0} aria-valuemax={100} aria-valuenow={0}><i className={hud.pwi} ref={bar} /></div>
      <span className={hud.accuracy} ref={caption}>Pull to set power</span>
    </div>
  );
}
