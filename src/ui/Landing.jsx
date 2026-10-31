import { useState } from 'react';
import { UiCommands } from './commands.js';
import { useCommands, useView } from './context.js';
import app from './App.module.css';
import buttons from './buttons.module.css';
import menu from './Landing.module.css';

const TAGLINE = { display: 'block', fontSize: '12px', letterSpacing: '4px', color: 'var(--pink-d)', margin: '12px 0' };

/** Start screen: name and room code for online rooms, or solo play. */
export function Landing({ hidden, initialName = '', initialRoomCode = '' }) {
  const { send } = useCommands();
  const { connecting, error } = useView(v => v.landing);
  const [name, setName] = useState(initialName);
  const [roomCode, setRoomCode] = useState(initialRoomCode);
  return (
    <div className={menu.menu} hidden={hidden} data-ui="landing">
    <div className={menu.panel}>
      <h1>⛳ Putt Pals <span style={TAGLINE}>PARTY CIRCUIT · 20 MAPS</span></h1>
      <label>Your name<input maxLength={14} autoComplete="off" value={name} onChange={e => setName(e.target.value)} /></label>
      <button type="button" className={menu.solo} disabled={connecting} onClick={() => send(UiCommands.PLAY_SOLO, { name })}>Play solo</button>
      <p className={menu.or}>or play with friends</p>
      <label>Room code (friends type the same one)<input maxLength={12} autoComplete="off" value={roomCode} onChange={e => setRoomCode(e.target.value)} /></label>
      <button type="button" className={menu.join} disabled={connecting || !roomCode.trim()} onClick={() => send(UiCommands.JOIN, { name, roomCode })}>Join room</button>
      <p className={app.status} role="status" data-ui="connect-error" hidden={!error}>{error}</p>
      <details><summary>How to play</summary>
      <p>3D party mini golf. Everyone plays the same hole at once, and the next hole starts when all players finish. Ride ramps, jump pads and teleporters, dodge fans and water, and mess with your friends.</p>
      <p className={app.small}>Drag backward anywhere on the course, then release to putt. Longer pulls add power and widen a sine sway; release as the arrow crosses center for a perfectly straight shot. Escape cancels. Keys 1–3 use power-ups. Right-drag rotates the ball camera.</p>
      </details>
    </div>
    </div>
  );
}
