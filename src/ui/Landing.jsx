import { useState } from 'react';
import { UiCommands } from './commands.js';
import { useCommands, useView } from './context.js';
import app from './App.module.css';
import buttons from './buttons.module.css';

const TAGLINE = { display: 'block', fontSize: '12px', letterSpacing: '4px', color: '#e6b283', margin: '12px 0' };
const ICE_PLACEHOLDER = '[{"urls":"turn:your-server:3478","username":"temporary-user","credential":"temporary-password"}]';

/** Start screen: name, room code, join/solo and optional ICE settings (legacy #lobby). */
export function Landing({ hidden, initialName = '', initialRoomCode = '' }) {
  const { send } = useCommands();
  const { connecting } = useView(v => v.landing);
  const [name, setName] = useState(initialName);
  const [roomCode, setRoomCode] = useState(initialRoomCode);
  const [iceText, setIceText] = useState('');
  return (
    <div className={app.card} hidden={hidden} data-ui="landing">
      <h1>⛳ Putt Pals <span style={TAGLINE}>PARTY CIRCUIT · 20 MAPS</span></h1>
      <p>3D party mini golf. Everyone plays the same hole at once, and the next hole starts when all players finish. Ride ramps, jump pads and teleporters, dodge fans and water, and mess with your friends.</p>
      <label>Your name<input maxLength={14} autoComplete="off" value={name} onChange={e => setName(e.target.value)} /></label>
      <label>Room code (friends type the same one)<input maxLength={12} autoComplete="off" value={roomCode} onChange={e => setRoomCode(e.target.value)} /></label>
      <button type="button" disabled={connecting || !roomCode.trim()} onClick={() => send(UiCommands.JOIN, { name, roomCode, iceText })}>Join room</button>
      <button type="button" className={buttons.ghost} disabled={connecting} onClick={() => send(UiCommands.PLAY_SOLO, { name })}>Play solo</button>
      <p className={app.small}>Drag backward anywhere on the course, then release to putt. Longer pulls add power and widen a sine sway; release as the arrow crosses center for a perfectly straight shot. Escape cancels. Keys 1–3 use power-ups. Right-drag rotates the ball camera.</p>
      <details><summary>Online connection settings</summary><p>Optional ICE server JSON for your own TURN relay. Use temporary credentials; these settings stay in this tab.</p><textarea aria-label="ICE servers JSON" placeholder={ICE_PLACEHOLDER} value={iceText} onChange={e => setIceText(e.target.value)} /></details>
    </div>
  );
}
