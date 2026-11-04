import { PLAYER_COLORS, PLAYER_COLOR_NAMES } from '../shared/colors.js';
import styles from './ColorPicker.module.css';

/**
 * Ball colour picker (#161): one round swatch per palette colour, drawn in the colour the ball will have.
 * `selected` is the chosen palette index (or null before a choice); `taken` maps palette indexes held by
 * other players to their names, and those swatches are disabled and say who has them.
 */
export function ColorPicker({ selected = null, taken = {}, onPick }) {
  return (
    <div className={styles.picker} role="radiogroup" aria-label="Ball colour" data-ui="color-picker">
      {PLAYER_COLORS.map((hex, index) => {
        const holder = taken[index];
        const on = selected === index;
        return (
          <button
            key={hex}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={PLAYER_COLOR_NAMES[index] + (holder ? ' (taken by ' + holder + ')' : '')}
            title={PLAYER_COLOR_NAMES[index] + (holder ? ' · taken by ' + holder : '')}
            disabled={!!holder}
            className={styles.swatch + (on ? ' ' + styles.on : '') + (holder ? ' ' + styles.taken : '')}
            style={{ '--swatch': hex }}
            data-color={index}
            onClick={() => onPick?.(index)}
          />
        );
      })}
    </div>
  );
}
