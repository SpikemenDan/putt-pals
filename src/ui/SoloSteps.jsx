import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { GameModes } from '../shared/session.js';
import { WORLDS } from '../shared/worlds.js';
import { UiCommands } from './commands.js';
import { useUiContext } from './context.js';
import menu from './Landing.module.css';

/** Worlds with playable courses. Ares and Luna have none yet (VIS-G), so they show as coming soon. */
export const PLAYABLE_WORLDS = Object.freeze(['gaia']);

/** The modes the Solo steps can start, and how each is described (VIS-M4 #176). */
export const SOLO_MODES = Object.freeze({
  [GameModes.STANDARD]: 'Casual · 1 map',
  [GameModes.TOURNAMENT_3]: 'Tournament · 3 maps',
  [GameModes.TOURNAMENT_5]: 'Tournament · 5 maps',
  [GameModes.TOURNAMENT_7]: 'Tournament · 7 maps',
  [GameModes.PRACTICE]: 'Practice · whole map',
  [GameModes.PUTT_PRACTICE]: 'Practice · one putt',
  [GameModes.PONG]: 'Practice · Putt Pong',
});

const STEPS = ['mode', 'world', 'ready'];

/** Arrow order in the destination view (owner, 2026-11-12): left goes Gaia → Luna → Ares → Gaia, right goes back the other way. */
export const WORLD_ORDER = Object.freeze(['gaia', 'luna', 'ares']);
const WORLD_BLURB = Object.freeze({ gaia: 'Home: six regions of courses', luna: 'Low gravity: long, floaty putts', ares: 'Lighter gravity, red dust and canyons' });

/**
 * Solo, one question per screen (owner, 2026-11-12, layout A): how to play (Casual, Tournament and its length, or the
 * smaller Practice button), then the destination, then name, colour and Play. Play opens the solo room and goes straight
 * to the level select with the chosen mode (no lobby). Back steps back; from the first step it leaves Solo.
 */
export function SoloSteps({ name, onName, colorField, connecting, send, onExit, overlay = null }) {
  const { stage } = useUiContext();
  const [step, setStep] = useState('mode');
  const [focus, setFocus] = useState('gaia'); // the planet the destination view is showing
  const [pick, setPick] = useState(null); // 'tournament' | 'practice' while choosing a length or practice kind
  const [mode, setMode] = useState(null);
  const [world, setWorld] = useState('gaia');
  const body = useRef(null);
  useEffect(() => { body.current?.querySelector('button:not(:disabled), input')?.focus(); }, [step, pick]);
  // The destination and ready steps show space; the first step and leaving Solo bring the horizon back.
  const inSpace = step === 'world' || step === 'ready';
  useEffect(() => { stage?.setView({ space: inSpace, target: inSpace ? focus : 'gaia' }); }, [stage, inSpace, focus]);
  useEffect(() => { if (overlay) overlay.toggleAttribute('data-space', inSpace); return () => overlay?.removeAttribute('data-space'); }, [overlay, inSpace]); // the title steps aside for space
  useEffect(() => () => stage?.setView({ space: false, target: 'gaia' }), [stage]);
  const turn = dir => setFocus(f => WORLD_ORDER[(WORLD_ORDER.indexOf(f) + (dir === 'left' ? 1 : WORLD_ORDER.length - 1)) % WORLD_ORDER.length]);
  const onKeyDown = e => {
    if (step !== 'world') return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); turn('left'); }
    if (e.key === 'ArrowRight') { e.preventDefault(); turn('right'); }
  };

  const choose = next => { setMode(next); setPick(null); setStep('world'); };
  const back = () => {
    if (pick) setPick(null);
    else if (step === 'ready') setStep('world');
    else if (step === 'world') setStep('mode');
    else onExit();
  };
  const option = (label, sub, onClick, props = {}) => (
    <button type="button" className={menu.option} onClick={onClick} {...props}><span>{label}</span>{sub && <small>{sub}</small>}</button>
  );
  const index = STEPS.indexOf(step);

  return (
    <div ref={body} data-ui="solo-steps" data-step={pick ? step + ':' + pick : step} onKeyDown={onKeyDown}>
      <h2 className={menu.heading}>Solo</h2>
      <ol className={menu.steps} aria-label={`Step ${index + 1} of ${STEPS.length}`}>
        {STEPS.map((s, k) => <li key={s} data-on={k <= index || undefined} />)}
      </ol>

      {step === 'mode' && !pick && <>
        <p className={menu.question}>How do you want to play?</p>
        {option('Casual', 'One map, just for fun', () => choose(GameModes.STANDARD))}
        {option('Tournament', '3, 5 or 7 maps; your scores add up', () => setPick('tournament'))}
        <button type="button" className={menu.minor} onClick={() => setPick('practice')}>Practice</button>
      </>}
      {step === 'mode' && pick === 'tournament' && <>
        <p className={menu.question}>How many maps?</p>
        <div className={menu.lengths}>
          {[[3, GameModes.TOURNAMENT_3], [5, GameModes.TOURNAMENT_5], [7, GameModes.TOURNAMENT_7]].map(([n, m]) => (
            <button key={n} type="button" className={menu.option} onClick={() => choose(m)} aria-label={n + ' maps'}><span>{n}</span><small>maps</small></button>
          ))}
        </div>
        <p className={menu.hint}>After each map you pick the next one.</p>
      </>}
      {step === 'mode' && pick === 'practice' && <>
        <p className={menu.question}>What do you want to practise?</p>
        {option('Whole map', 'Play a map with no timer or score', () => choose(GameModes.PRACTICE))}
        {option('One putt', 'Replay a single hole as often as you like', () => choose(GameModes.PUTT_PRACTICE))}
        {option('Putt Pong', 'Practise the 1v1 cup game on your own', () => choose(GameModes.PONG))}
      </>}

      {step === 'world' && (() => {
        const shown = WORLDS.find(w => w.id === focus), open = PLAYABLE_WORLDS.includes(focus);
        const carousel = (
          <div className={menu.carousel} data-ui="world-carousel" data-world={focus}>
            <button type="button" className={menu.arrow} onClick={() => turn('left')} aria-label="Previous planet" data-ui="world-left">&lsaquo;</button>
            <div className={menu.planetName} aria-live="polite"><b>{shown.name}</b><small>{open ? WORLD_BLURB[focus] : 'Coming soon: no courses yet'}</small></div>
            <button type="button" className={menu.arrow} onClick={() => turn('right')} aria-label="Next planet" data-ui="world-right">&rsaquo;</button>
          </div>
        );
        return <>
          <p className={menu.question}>Where to?</p>
          <p className={menu.hint}>Use the arrows (or ← →) to fly between planets.</p>
          <button type="button" className={menu.go} disabled={!open} onClick={() => { setWorld(focus); setStep('ready'); }} data-world={focus} data-ui="world-choose">
            {open ? 'Choose ' + shown.name : shown.name + ': coming soon'}
          </button>
          {overlay ? createPortal(carousel, overlay) : carousel}
        </>;
      })()}

      {step === 'ready' && <>
        <p className={menu.summary} data-ui="solo-summary">{SOLO_MODES[mode]} on {WORLDS.find(w => w.id === world)?.name}</p>
        <label>Your name<input maxLength={14} autoComplete="off" value={name} onChange={e => onName(e.target.value)} /></label>
        {colorField}
        <button type="button" className={menu.go} disabled={connecting} onClick={() => send(UiCommands.PLAY_SOLO, { name, mode, world })}>Play solo</button>
      </>}

      <button type="button" className={menu.back} onClick={back} data-ui="menu-back">Back</button>
    </div>
  );
}
