import { useEffect, useState } from 'react';
import styles from './TiePicker.module.css';

/**
 * Animated random tie picker (VIS-V #163).
 * Cycles through the room-chosen tied options during the pre-start countdown
 * and settles on the room-chosen winner.
 *
 * @param {{ tie: { options: Array<{ index: number, name: string }>, winner: number, winnerName: string } | null }} props
 */
export function TiePicker({ tie }) {
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [settled, setSettled] = useState(false);

  const optionCount = tie?.options?.length ?? 0;
  const winner = tie?.winner;
  const active = optionCount >= 2;

  useEffect(() => {
    if (!active) return undefined;
    let frame = 0;
    setSettled(false);
    setHighlightIndex(0);
    const interval = setInterval(() => {
      frame++;
      if (frame >= 10) {
        clearInterval(interval);
        setSettled(true);
      } else {
        setHighlightIndex(prev => (prev + 1) % optionCount);
      }
    }, 120);
    return () => clearInterval(interval);
  }, [active, winner, optionCount]);

  if (!active) return null;

  return (
    <div className={styles.tiePicker} data-ui="tie-picker">
      <div className={styles.tieTitle}>Vote Tied! Random Pick</div>
      <div className={styles.tieGrid}>
        {tie.options.map((opt, i) => {
          const isWinning = settled ? opt.index === tie.winner : i === highlightIndex;
          return (
            <div
              key={opt.index}
              className={`${styles.tieCard}${isWinning ? ' ' + styles.highlight : ''}`}
              data-ui="tie-option"
              data-winner={settled && opt.index === tie.winner ? 'true' : undefined}
            >
              <span>{opt.name}</span>
              {settled && opt.index === tie.winner && (
                <span className={styles.winnerBadge}>Winner!</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
