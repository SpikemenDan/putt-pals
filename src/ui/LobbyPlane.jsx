import { useEffect, useRef } from 'react';
import { colorHex } from '../shared/colors.js';
import { useUiContext } from './context.js';
import styles from './LobbyPlane.module.css';

/**
 * Copies `display.lobby` onto the plane as CSS variables. The shipped DISPLAY is frozen, so that is done once; the development
 * tuner's live object is not, so it is re-read every frame while the lobby shows (presentation only, never room state).
 */
function useLobbyLook(ref, display, hidden) {
  useEffect(() => {
    const el = ref.current;
    if (!el || hidden) return undefined;
    const apply = () => {
      const l = display.lobby;
      el.style.setProperty('--lobby-ball', l.ballSize + 'px');
      el.style.setProperty('--lobby-tilt', l.tilt + 'deg');
      el.style.setProperty('--lobby-spacing', String(l.spacing));
      el.style.setProperty('--lobby-bob', l.bob + 'px');
    };
    apply();
    const raf = el.ownerDocument.defaultView?.requestAnimationFrame;
    if (Object.isFrozen(display.lobby) || !raf) return undefined;
    let id = 0;
    const tick = () => { apply(); id = raf(tick); };
    id = raf(tick);
    return () => el.ownerDocument.defaultView.cancelAnimationFrame(id);
  }, [ref, display, hidden]);
}

/**
 * The party lobby (VIS-M3 #175): every player's ball together on one plane, drawn in the colour they chose, with their
 * name on a caption under it. Names render as React text only.
 */
export function LobbyPlane({ players = [], hidden = false }) {
  const { display } = useUiContext();
  const root = useRef(null);
  useLobbyLook(root, display, hidden);
  return (
    <div ref={root} className={styles.stage} data-ui="lobby-plane" aria-label="Players in the party" role="list">
      <div className={styles.plane} aria-hidden="true" />
      <div className={styles.balls}>
        {players.map((p, i) => (
          <div key={p.id} className={styles.player + (p.you ? ' ' + styles.you : '')} role="listitem" data-color={p.color} style={{ '--ball': colorHex(p.color), '--delay': (i * 0.37) + 's' }}>
            <span className={styles.ball} />
            <span className={styles.shadow} aria-hidden="true" />
            <span className={styles.name}>{p.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
