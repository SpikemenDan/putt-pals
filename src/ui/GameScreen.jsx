import { useState } from 'react';
import { courseRules } from '../courses/definitions.js';
import { spawnPool } from '../gameplay/catalog.js';
import { UiCommands } from './commands.js';
import { useCommands, useView } from './context.js';
import { HUD_ICONS, powerupIcon } from './icons.js';
import { PowerMeter } from './PowerMeter.jsx';
import { PongHud } from './PongHud.jsx';
import { Row } from './Row.jsx';
import buttons from './buttons.module.css';
import hud from './Hud.module.css';

/**
 * Game view: HUD over the canvas (legacy #game). The canvas element is always
 * mounted so the WebGL context survives screen changes; `onCanvas` hands it to
 * the renderer and input adapter.
 */
const POWERUP_COUNT = spawnPool().length;

/**
 * Square icon button with a hover tooltip. The label stays in the DOM for screen readers. The tooltip belongs to the wrapper, not the
 * button, because generated text inside a button becomes part of its accessible name.
 */
function Tool({ icon, label, tip = label, active, onClick }) {
  return (
    <span className={hud.toolWrap} data-tip={tip}>
      <button type="button" className={`${hud.tool}${active ? ' ' + hud.toolOn : ''}`} aria-pressed={active === undefined ? undefined : active} onClick={onClick}>
        <Svg markup={HUD_ICONS[icon]} /><span className={hud.sr}>{label}</span>
      </button>
    </span>
  );
}

/** One readout in the title plate. */
const Stat = ({ label, value, timer }) => <div className={`${hud.stat}${timer ? ' ' + hud.statTimer : ''}`}><small>{label}</small><b>{value}</b></div>;

/** Fixed markup from icons.js; never peer content. */
const Svg = ({ markup, className }) => <span className={className || hud.icon} aria-hidden="true" dangerouslySetInnerHTML={{ __html: markup }} />;

export function GameScreen({ hidden, backdrop = false, onCanvas }) {
  const { send, session } = useCommands();
  const view = useView(v => v.hud);
  const toast = useView(v => v.toast);
  const [scoreOpen, setScoreOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const ghost = buttons.ghost;
  return (
    <div hidden={hidden} data-ui={backdrop ? 'backdrop' : 'game'} className={backdrop ? hud.backdrop : undefined} aria-hidden={backdrop || undefined}>
      <div className={hud.stage}>
        <div className={hud.bar}>
          <span className={`${hud.sr}${view?.warn ? ' ' + hud.warn : ''}`} data-ui="hud-info">{view?.info}</span>
          <div className={`${hud.title}${view?.warn ? ' ' + hud.titleWarn : ''}`} aria-hidden="true">
            <div className={hud.titleMain}>
              <b>{view?.title?.map}</b>
              {view?.title?.putt && <i>Putt {view.title.putt}</i>}
            </div>
            <Stat label="Par" value={view?.title?.par} />
            <Stat label={view?.title?.statLabel} value={view?.title?.stat} />
            {view?.title?.time && <Stat label="Time" value={view.title.time} timer />}
          </div>
          <span className={hud.tools} role="toolbar" aria-label="Game controls">
            <Tool icon="view" label={view?.viewLabel || 'View: Ball cam'} onClick={() => send(UiCommands.CYCLE_CAMERA)} />
            <Tool icon="card" label="Card" tip="Scorecard" onClick={() => send(UiCommands.TOGGLE_CARD)} />
            <Tool icon="scoreboard" label="Scoreboard" active={scoreOpen} onClick={() => setScoreOpen(open => !open)} />
            <span className={hud.tools} data-ui="practice-bar" hidden={!view?.practiceBar}>
              <Tool icon="prev" label="‹ Prev putt" tip="Previous putt" onClick={() => session({ type: 'PRACTICE_STEP', step: -1 })} />
              <Tool icon="restart" label="Restart" onClick={() => session({ type: 'PRACTICE_STEP', step: 0 })} />
              <Tool icon="next" label="Next putt ›" tip="Next putt" onClick={() => session({ type: 'PRACTICE_STEP', step: 1 })} />
              <Tool icon="maps" label="Maps" onClick={() => session({ type: 'PRACTICE_MAPS' })} />
              <Tool icon="exit" label="Exit" onClick={() => session({ type: 'RETURN_TO_LOBBY' })} />
            </span>
            <Tool icon="invite" label="Invite" onClick={() => send(UiCommands.INVITE)} />
            <Tool icon="settings" label="Settings" active={settingsOpen} onClick={() => setSettingsOpen(open => !open)} />
          </span>
        </div>
        <div className={hud.settings} data-ui="settings" hidden={!settingsOpen}>
          <h2>Settings</h2>
          <button type="button" className={ghost} onClick={() => send(UiCommands.TOGGLE_SOUND)}>{view?.soundLabel || 'Sound: On'}</button>
          <label>Volume
            <input type="range" min="0" max="100" step="5" value={Math.round((view?.volume ?? 1) * 100)} onChange={e => send(UiCommands.SET_VOLUME, { volume: Number(e.target.value) / 100 })} />
          </label>
          <button type="button" className={ghost} onClick={() => send(UiCommands.TOGGLE_QUALITY)}>{view?.qualityLabel || 'Quality: High'}</button>
          <p className={hud.conn}>{view?.connection}</p>
        </div>
        <canvas className={hud.canvas} width="800" height="500" ref={onCanvas} aria-label="Course. Drag back from the ball and release to putt." />
        {!!view?.pong && <PongHud pong={view.pong} />}
        {!!view?.activeHazards?.length && <div className={hud.hazardIndicators} aria-label="Active gameplay hazards">
          {view.activeHazards.map(h => <span key={h.id}><Svg markup={powerupIcon(h.kind)} className={hud.chipIcon} />{h.kind.toUpperCase()}{h.direction ? ` ${h.direction}` : ''}{h.targetName ? ` → ${h.targetName}` : ''} · {h.seconds}s</span>)}
        </div>}
        <PowerMeter />
        <div className={hud.guide} data-ui="guide">{'Short pull = precision · Long pull = power + sway · Esc = cancel · Right-drag / ← → = rotate · C = camera'}</div>
        <div className={hud.inv}>
          {(view?.inventory || []).map(slot => (
            <button type="button" key={slot.index} className={`${hud.slot}${slot.kind === 'empty' ? ' ' + hud.slotEmpty : ''}`}
              onClick={() => send(UiCommands.USE_ITEM, { index: slot.index })}>
              <span className={hud.sr}>{slot.label}</span>
              <span className={hud.slotKey} aria-hidden="true">{slot.index + 1}</span>
              {slot.id && <Svg key={slot.id} markup={powerupIcon(slot.id)} className={hud.slotIcon} />}
              {slot.id && <span className={hud.slotTip} aria-hidden="true"><b>{slot.name}</b>{slot.ability}</span>}
            </button>
          ))}
        </div>
        {view?.hazardPrompt && <div className={hud.hazardPrompt} role="dialog" aria-label={`${view.hazardPrompt.kind} options`}>
          <b>Strike who?</b>{' '}
          {view.hazardPrompt.targets.map(target => (
            <button type="button" className={ghost} key={target.id} onClick={() => send(UiCommands.CONFIRM_HAZARD, { kind: view.hazardPrompt.kind, index: view.hazardPrompt.index, targetId: target.id })}>{target.name}</button>
          ))}
          {view.hazardPrompt.targets.length === 0 && <span>No connected opponent</span>}
          <button type="button" className={ghost} onClick={() => send(UiCommands.CANCEL_HAZARD)}>Cancel</button>
        </div>}
        <div className={hud.toast} role="status" aria-live="polite">{toast}</div>
        <div className={hud.sb} data-ui="scoreboard" hidden={!scoreOpen}>
          <Row header variant="scoreboard" name="SCOREBOARD" a="Putt" b="Total" />
          {(view?.scoreboard || []).map(r => <Row key={r.id} variant="scoreboard" color={r.color} name={r.name} a={r.status} b={r.total} />)}
        </div>
      </div>
      <details><summary>How to play online · build notes</summary>
        <p><b>With friends:</b> Everyone opens this updated hosted game and enters the same room code. The room service keeps shared match state and chooses a room controller; the controller starts the game and chooses maps. Late joiners spectate until the next round. Use Invite to copy a room link.</p>
        <p><b>Network limits:</b> Online rooms need a working WebSocket connection to the hosted room service. The service stores match state and membership; ball movement remains local and other players' balls are visual ghosts. Connection recovery and controller succession are handled by the room service. Anti-cheat and guaranteed global connectivity are not implemented. Use solo mode if the room service is unavailable.</p>
        <p><b>Controls:</b> Click/touch the course, pull backward opposite the shot direction, release. Longer pulls mean higher speed and greater angular spread. The arrow shows direction and power; it sways more as power grows. Escape or an interrupted gesture cancels without shooting. Right-drag or arrow keys rotate ball view. Keys 1–3 activate collected power-ups. Hole Magnet deliberately adds attraction only when activated. Steady Aim removes spread.</p>
        <p><b>This build:</b> {courseRules.length} original course layouts; ramps, raised greens, jump pads, water, sand, fans and portals; {POWERUP_COUNT} collectible power-ups, including synchronized global hazards; simultaneous play and scorecards. New warm sunlight, soft shadows, natural materials, animated flags, trees, recessed cups and distance-based drag aiming. Low quality disables shadows and lowers pixel density. Cup physics uses an approximate sphere-on-lip contact model at 240 Hz, with gravity, inner-wall rebounds and below-surface scoring. It is not a full rigid-body solver. Room transitions are service-authoritative; ball motion is client-authoritative. Remote balls remain non-colliding ghosts. Tornadoes apply swirl, inward pull and core lift; moving obstacles rebound balls. Only one map is built at a time. Aim appears only while pulling and sways more at high power; the release direction matches the live indicator.</p>
      </details>
    </div>
  );
}
