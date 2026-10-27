import { useEffect, useRef } from 'react';
import { PLAYER_COLORS } from '../shared/constants.js';
import { UiCommands } from './commands.js';
import { useCommands, useView } from './context.js';
import styles from './Scorecard.module.css';

const CELL_CLASS = { live: styles.lv, hio: styles.hio, under: styles.u, over: styles.o, par: undefined };

/** Paper scorecard table (legacy renderCard). Names render as text only. */
export function Paper({ card }) {
  return (
    <div className={styles.paper} data-ui="scorecard">
      <div className={styles.ptitle}><b>SCORECARD</b><span>{card.title}</span></div>
      <div className={styles.ptbl}>
        <table>
          <thead>
            <tr>
              <th className={styles.nm}>Player</th>
              {card.pars.map((_, k) => <th key={k}>{k + 1}</th>)}
              {['Total', '+/-', 'HIO', 'T/O'].map(t => <th key={t} className={styles.st}>{t}</th>)}
            </tr>
            <tr className={styles.par}>
              <td className={styles.nm}>Par</td>
              {card.pars.map((p, k) => <td key={k}>{p}</td>)}
              <td className={styles.st}>{card.parTotal}</td><td className={styles.st} /><td className={styles.st} /><td className={styles.st} />
            </tr>
          </thead>
          <tbody>
            {card.rows.map(row => (
              <tr key={row.id} className={row.lead ? styles.lead : undefined}>
                <td className={styles.nm}><i style={{ background: PLAYER_COLORS[row.color % 8] }} />{row.label}</td>
                {row.cells.map((cell, k) => <td key={k} className={cell ? CELL_CLASS[cell.kind] : undefined}>{cell && <span>{cell.text}</span>}</td>)}
                <td className={styles.st}>{row.total}</td><td className={styles.st}>{row.diff}</td><td className={styles.st}>{row.hio}</td><td className={styles.st}>{row.timeouts}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={styles.pleg}>* timed out (par + penalty) · circle = under par · italic = in progress</div>
    </div>
  );
}

/**
 * Scorecard overlay (legacy #cardov). Opening moves focus to the close button;
 * closing returns focus to whatever had it before.
 */
export function ScorecardOverlay() {
  const { send } = useCommands();
  const open = useView(v => v.cardOpen);
  const card = useView(v => v.scorecard);
  const close = useRef(null), returnTo = useRef(null);
  useEffect(() => {
    if (open) {
      returnTo.current = document.activeElement;
      close.current?.focus();
    } else if (returnTo.current) {
      const target = returnTo.current;
      returnTo.current = null;
      if (target.isConnected && typeof target.focus === 'function') target.focus();
    }
  }, [open]);
  return (
    <div className={styles.overlay} hidden={!open} role="dialog" aria-label="Scorecard">
      <div className={styles.wrap}>
        <button type="button" className={styles.close} ref={close} aria-label="Close scorecard" onClick={() => send(UiCommands.CLOSE_CARD)}>×</button>
        <div>{open && card && <Paper card={card} />}</div>
      </div>
    </div>
  );
}
