import { UiCommands } from './commands.js';
import { useCommands, useView } from './context.js';
import app from './App.module.css';
import buttons from './buttons.module.css';
import styles from './MapSelect.module.css';

const rects = (list, fill) => list.map((r, k) => <rect key={fill + k} x={r[0]} y={r[1]} width={r[2]} height={r[3]} fill={fill} />);

/** Top-down course thumbnail, drawn from course geometry (legacy buildMapCards SVG). */
export function CoursePreview({ preview: p }) {
  return (
    <svg viewBox="0 0 800 500" aria-hidden="true">
      {rects(p.tiles, '#528864')}{rects(p.pl, '#a9c78c')}{rects(p.rp, '#b8a56e')}{rects(p.w, '#d3b58e')}{rects(p.pit, '#246e93')}
      {p.tp.map((t, k) => [<circle key={'a' + k} cx={t[0]} cy={t[1]} r="16" fill="#c681ff" />, <circle key={'b' + k} cx={t[2]} cy={t[3]} r="16" fill="#c681ff" />])}
      {p.tornado.map((t, k) => <circle key={'t' + k} cx={t[0]} cy={t[1]} r={t[2]} fill="#d5f8ff" opacity=".2" />)}
      <circle cx={p.tee[0]} cy={p.tee[1]} r="12" fill="white" />
      <circle cx={p.hole[0]} cy={p.hole[1]} r="15" fill="#15242a" />
    </svg>
  );
}

/** Course voting and practice selection (legacy #mapselect). */
export function MapSelect({ hidden }) {
  const { send, session } = useCommands();
  const voting = useView(v => v.voting);
  return (
    <div className={`${app.card} ${app.wide}`} hidden={hidden} data-ui="map-select">
      <div className={app.menubar}><h1>Choose your course</h1><button type="button" className={buttons.ghost} onClick={() => send(UiCommands.LEAVE)}>Leave room</button></div>
      <p className={app.status}>{voting?.status}</p>
      <div className={styles.puttpick} hidden={!voting?.puttPicker}>
        {voting?.puttPicker?.putts.map(p => <button type="button" key={p.index} onClick={() => session({ type: 'START_ROUND', puttIndex: p.index })}>{p.label}</button>)}
      </div>
      <div className={styles.grid}>
        {voting?.cards.map(card => (
          <button type="button" key={card.index} className={`${styles.mapcard}${card.selected ? ' ' + styles.selected : ''}`} data-v={card.votes} aria-pressed={card.selected}
            onClick={() => session({ type: 'CAST_VOTE', mapIndex: card.index })}>
            <CoursePreview preview={card.preview} />
            <strong>{card.number + ' · ' + card.name}</strong><small>{card.desc}</small><small>{'Par ' + card.par}</small>
          </button>
        ))}
      </div>
    </div>
  );
}
