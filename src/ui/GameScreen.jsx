import { UiCommands } from './commands.js';
import { useCommands, useView } from './context.js';
import { PowerMeter } from './PowerMeter.jsx';
import { Row } from './Row.jsx';
import buttons from './buttons.module.css';
import hud from './Hud.module.css';

/**
 * Game view: HUD over the canvas (legacy #game). The canvas element is always
 * mounted so the WebGL context survives screen changes; `onCanvas` hands it to
 * the renderer and input adapter.
 */
export function GameScreen({ hidden, onCanvas }) {
  const { send, session } = useCommands();
  const view = useView(v => v.hud);
  const toast = useView(v => v.toast);
  const ghost = buttons.ghost;
  return (
    <div hidden={hidden} data-ui="game">
      <div className={hud.stage}>
        <div className={hud.bar}>
          <span className={`${hud.info}${view?.warn ? ' ' + hud.warn : ''}`} data-ui="hud-info">{view?.info}</span>
          <span>
            <button type="button" className={ghost} onClick={() => send(UiCommands.CYCLE_CAMERA)}>{view?.viewLabel || 'View: Ball cam'}</button>
            <button type="button" className={ghost} onClick={() => send(UiCommands.TOGGLE_CARD)}>Card</button>
            <span hidden={!view?.practiceBar}>
              <button type="button" className={ghost} onClick={() => session({ type: 'PRACTICE_STEP', step: -1 })}>‹ Prev putt</button>
              <button type="button" className={ghost} onClick={() => session({ type: 'PRACTICE_STEP', step: 0 })}>Restart</button>
              <button type="button" className={ghost} onClick={() => session({ type: 'PRACTICE_STEP', step: 1 })}>Next putt ›</button>
              <button type="button" className={ghost} onClick={() => session({ type: 'PRACTICE_MAPS' })}>Maps</button>
              <button type="button" className={ghost} onClick={() => session({ type: 'RETURN_TO_LOBBY' })}>Exit</button>
            </span>
            <button type="button" className={ghost} onClick={() => send(UiCommands.INVITE)}>Invite</button>
            <button type="button" className={ghost} onClick={() => send(UiCommands.TOGGLE_SOUND)}>{view?.soundLabel || 'Sound: On'}</button>
            <button type="button" className={ghost} onClick={() => send(UiCommands.TOGGLE_QUALITY)}>{view?.qualityLabel || 'Quality: High'}</button>
            {' '}<span className={hud.conn}>{view?.connection}</span>
          </span>
        </div>
        <canvas className={hud.canvas} width="800" height="500" ref={onCanvas} aria-label="Course. Drag back from the ball and release to putt." />
        <PowerMeter />
        <div className={hud.guide}>Short pull = precision · Long pull = power + sway · Esc = cancel · Right-drag / ← → = rotate · C = camera</div>
        <div className={hud.inv}>
          {(view?.inventory || []).map(slot => (
            <button type="button" key={slot.index} className={slot.kind === 'empty' ? ghost : slot.kind === 'attack' ? buttons.atk : undefined}
              onClick={() => send(UiCommands.USE_ITEM, { index: slot.index })}>{slot.label}</button>
          ))}
        </div>
        <div className={hud.toast} role="status" aria-live="polite">{toast}</div>
        <div className={hud.sb} data-ui="scoreboard">
          <Row header variant="scoreboard" name="SCOREBOARD" a="Putt" b="Total" />
          {(view?.scoreboard || []).map(r => <Row key={r.id} variant="scoreboard" color={r.color} name={r.name} a={r.status} b={r.total} />)}
        </div>
      </div>
      <details><summary>How to play online · engine roadmap · build notes</summary>
        <p><b>With friends:</b> Everyone opens this same updated HTML with internet access. The first person joins a unique room code and becomes host; friends enter the identical code. The host presses Start Game, chooses one of 20 maps, then presses Play selected map. Late joiners spectate until the next round. Alternatively, host this file as index.html on an HTTPS static host and use Invite to copy a room link. This version uses a separate room namespace from the old build.</p>
        <p><b>Network limits:</b> PeerJS handles signaling, while game data travels between browsers. Some campus, workplace, mobile or restrictive networks need a TURN relay. Enter your relay's ICE JSON in the lobby on every client. No relay is included. Use temporary credentials. Host migration, anti-cheat, and guaranteed global connectivity are not implemented. If the host disconnects, reload and create a new room. Use solo mode if room connection fails.</p>
        <p><b>Controls:</b> Click/touch the course, pull backward opposite the shot direction, release. Longer pulls mean higher speed and greater angular spread. The arrow shows direction and power; it sways more as power grows. Escape or an interrupted gesture cancels without shooting. Right-drag or arrow keys rotate ball view. Keys 1–3 activate collected power-ups. Hole Magnet deliberately adds attraction only when activated. Steady Aim removes spread.</p>
        <p><b>This build:</b> Twenty original course layouts; ramps, raised greens, jump pads, water, sand, fans and portals; five collectible power-ups; simultaneous play and scorecards. New warm sunlight, soft shadows, natural materials, animated flags, trees, recessed cups and distance-based drag aiming. Low quality disables shadows and lowers pixel density. Cup physics uses an approximate sphere-on-lip contact model at 240 Hz, with gravity, inner-wall rebounds and below-surface scoring. It is not a full rigid-body solver. Room transitions are host-authoritative; ball motion is client-authoritative. Remote balls remain non-colliding ghosts. Tornadoes apply swirl, inward pull and core lift; moving obstacles rebound balls. Only one map is built at a time. Aim appears only while pulling and sways more at high power; the release direction matches the live indicator.</p>
        <p><b>Future engine version:</b> The current renderer is Three.js. A migration to Godot, Unity or Unreal is a rebuild of rendering/input/networking, not a checkbox. Keep course layouts and tuning as data, separate fixed-step simulation from rendering, replace the custom collision model with the engine's rigid-body system, then add a server-authoritative match service and synchronized lobbies. The browser version can remain the prototype. See the accompanying Putt_Pals_Architecture.md guide for source contracts and shader details. Putt Party wiki feature parity has not been verified.</p>
      </details>
    </div>
  );
}
