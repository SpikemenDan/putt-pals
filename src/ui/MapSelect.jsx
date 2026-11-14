import { useCallback, useState } from 'react';
import { UiCommands } from './commands.js';
import { useCommands, useUiContext, useView } from './context.js';
import { WorldSelect } from './WorldSelect.jsx';
import { WORLDS } from '../shared/worlds.js';
import { WORLD_ORDER } from './SoloSteps.jsx';
import app from './App.module.css';
import buttons from './buttons.module.css';
import styles from './MapSelect.module.css';

const rects = (list, fill) => list.map((r, k) => <rect key={fill + k} x={r[0]} y={r[1]} width={r[2]} height={r[3]} fill={fill} />);

/** Top-down course thumbnail, drawn from course geometry (legacy buildMapCards SVG). */
export function CoursePreview({ preview: p }) {
  return (
    <svg viewBox="0 0 800 500" aria-hidden="true">
      {rects(p.tiles, '#2fbf5b')}{rects(p.pl, '#ffa726')}{rects(p.rp, '#ffd640')}{rects(p.w, '#ff3d6e')}{rects(p.pit, '#2b9bff')}
      {p.tp.map((t, k) => [<circle key={'a' + k} cx={t[0]} cy={t[1]} r="16" fill="#8a2be2" />, <circle key={'b' + k} cx={t[2]} cy={t[3]} r="16" fill="#8a2be2" />])}
      {p.tornado.map((t, k) => <circle key={'t' + k} cx={t[0]} cy={t[1]} r={t[2]} fill="#ffffff" opacity=".45" />)}
      <circle cx={p.tee[0]} cy={p.tee[1]} r="12" fill="white" />
      <circle cx={p.hole[0]} cy={p.hole[1]} r="15" fill="#14102a" />
    </svg>
  );
}

/**
 * The planet switcher over the level select (VIS-M4 mix and match): the same arrows and order as the Solo destination view. Every map
 * pick, including the next map of a tournament, can move to another planet; a map's planet also sets its gravity.
 */
export function PlanetSwitcher({ world, onWorld, counts }) {
  const turn = dir => onWorld(WORLD_ORDER[(WORLD_ORDER.indexOf(world) + (dir === 'left' ? 1 : WORLD_ORDER.length - 1)) % WORLD_ORDER.length]);
  const name = WORLDS.find(w => w.id === world)?.name;
  return (
    <div className={styles.planets} data-ui="planet-switcher" data-world={world}>
      <button type="button" className={buttons.ghost} onClick={() => turn('left')} aria-label="Previous planet" data-ui="planet-left">&lsaquo;</button>
      <b>{name}</b><small>{counts[world] ? counts[world] + (counts[world] === 1 ? ' course' : ' courses') : 'No courses yet'}</small>
      <button type="button" className={buttons.ghost} onClick={() => turn('right')} aria-label="Next planet" data-ui="planet-right">&rsaquo;</button>
    </div>
  );
}

/** Course voting and practice selection (legacy #mapselect): the 3D atlas of Gaia where WebGL is available, otherwise the plain course list. */
export function MapSelect({ hidden }) {
  const { send, session } = useCommands();
  const { createAtlasScene } = useUiContext();
  const voting = useView(v => v.voting);
  const [noAtlas, setNoAtlas] = useState(false);
  const [world, setWorld] = useState('gaia');
  const allCards = voting?.cards ?? [];
  const counts = Object.fromEntries(WORLD_ORDER.map(id => [id, allCards.filter(c => (c.world ?? 'gaia') === id).length]));
  const cards = allCards.filter(c => (c.world ?? 'gaia') === world);
  const switcher = <PlanetSwitcher world={world} onWorld={setWorld} counts={counts} />;
  const empty = <p className={styles.empty} data-ui="planet-empty">{'No courses on ' + WORLDS.find(w => w.id === world)?.name + ' yet. Use the arrows to fly to another planet.'}</p>;
  const fallBack = useCallback(() => setNoAtlas(true), []);
  const pick = mapIndex => session({ type: 'CAST_VOTE', mapIndex });
  const header = <div className={app.menubar}><h1>Choose your course</h1><button type="button" className={buttons.ghost} onClick={() => send(UiCommands.LEAVE)}>Leave room</button></div>;
  const putts = (
    <div className={styles.puttpick} hidden={!voting?.puttPicker}>
      {voting?.puttPicker?.putts.map(p => <button type="button" key={p.index} onClick={() => session({ type: 'START_ROUND', puttIndex: p.index })}>{p.label}</button>)}
    </div>
  );
  if (!hidden && createAtlasScene && !noAtlas && voting && world === 'gaia') { // the 3D atlas is of Gaia
    return (
      <div className={styles.atlas} data-ui="map-select">
        <WorldSelect cards={cards} onPick={pick} onUnavailable={fallBack}>
          <div className={styles.bar}>{header}<p className={app.status}>{voting.status}</p>{putts}{switcher}</div>
        </WorldSelect>
      </div>
    );
  }
  return (
    <div className={`${app.card} ${app.wide}`} hidden={hidden} data-ui="map-select">
      {header}
      <p className={app.status}>{voting?.status}</p>
      {putts}
      {switcher}
      {cards.length === 0 && empty}
      <div className={styles.grid}>
        {cards.map(card => (
          <button type="button" key={card.index} className={`${styles.mapcard}${card.selected ? ' ' + styles.selected : ''}`} data-v={card.votes} aria-pressed={card.selected}
            onClick={() => pick(card.index)}>
            <CoursePreview preview={card.preview} />
            <strong>{card.number + ' · ' + card.name}</strong><small>{card.desc}</small><small>{'Par ' + card.par}</small>
          </button>
        ))}
      </div>
    </div>
  );
}
