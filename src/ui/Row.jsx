import { PLAYER_COLORS } from '../shared/constants.js';
import styles from './Row.module.css';

/** Legacy row(c, name, a, b, hd): colour dot, name and two right-aligned columns. */
export function Row({ color = 0, name, a, b, header = false, variant }) {
  const className = [styles.row, header && styles.hd, variant === 'roster' && styles.inRoster, variant === 'scoreboard' && styles.inSb].filter(Boolean).join(' ');
  const dot = header ? { background: 'transparent', border: '0' } : { background: PLAYER_COLORS[color % 8] };
  return (
    <div className={className}>
      <i style={dot} />
      <b>{name}</b>
      <span>{a}</span>
      <span>{b}</span>
    </div>
  );
}
