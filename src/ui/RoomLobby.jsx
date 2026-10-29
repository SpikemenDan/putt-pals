import { useEffect, useState } from 'react';
import { GameModes } from '../shared/session.js';
import { MODE_OPTIONS, UiCommands } from './commands.js';
import { useCommands, useView } from './context.js';
import { Row } from './Row.jsx';
import app from './App.module.css';
import buttons from './buttons.module.css';

const ROOM_LABEL = { fontSize: '18px', fontWeight: 700, letterSpacing: '1px', color: 'var(--pink-d)' };
const soloOnly = value => MODE_OPTIONS.some(o => o.value === value && o.soloOnly);

/** Room lobby: roster, host mode choice, Start Game and the pre-start countdown (legacy #waiting). */
export function RoomLobby({ hidden }) {
  const { send, session } = useCommands();
  const lobby = useView(v => v.lobby);
  const [mode, setMode] = useState(GameModes.STANDARD);
  const multiplayer = !!lobby?.multiplayer;
  // Legacy: practice modes are solo only; a second player resets the choice to Standard.
  useEffect(() => { if (multiplayer && soloOnly(mode)) setMode(GameModes.STANDARD); }, [multiplayer, mode]);
  const start = () => {
    if (soloOnly(mode) && multiplayer) return;
    session({ type: 'SET_MODE', mode });
    session({ type: 'START_VOTING' });
  };
  return (
    <div className={app.card} hidden={hidden} data-ui="room-lobby">
      <h1>Room lobby</h1>
      <p style={ROOM_LABEL}>{lobby?.label}</p>
      <div>{lobby?.roster.map(p => <Row key={p.id} variant="roster" color={p.color} name={p.name} a="Joined" b="" />)}</div>
      <label hidden={!lobby?.showModes}>Game mode<select value={mode} onChange={e => setMode(e.target.value)}>
        {(lobby?.modes || MODE_OPTIONS).map(o => <option key={o.value} value={o.value} disabled={!!o.disabled}>{o.label}</option>)}
      </select></label>
      <p className={app.status}>{lobby?.status}</p>
      <button type="button" hidden={!lobby?.showStart} onClick={start}>Start Game</button>
      <button type="button" className={buttons.ghost} hidden={!lobby?.showInvite} onClick={() => send(UiCommands.INVITE)}>Copy invite</button>
      <button type="button" className={buttons.ghost} onClick={() => send(UiCommands.LEAVE)}>Leave room</button>
    </div>
  );
}
