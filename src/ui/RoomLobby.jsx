import { useEffect, useState } from 'react';
import { GameModes } from '../shared/session.js';
import { colorHex, PLAYER_COLOR_NAMES } from '../shared/colors.js';
import { MODE_OPTIONS, UiCommands } from './commands.js';
import { useCommands, useView } from './context.js';
import { ColorPicker } from './ColorPicker.jsx';
import { LobbyPlane } from './LobbyPlane.jsx';
import { TiePicker } from './TiePicker.jsx';
import app from './App.module.css';
import buttons from './buttons.module.css';
import styles from './RoomLobby.module.css';

const ROOM_LABEL = { fontSize: '18px', fontWeight: 700, letterSpacing: '1px', color: 'var(--pink-d)' };
const soloOnly = value => MODE_OPTIONS.some(o => o.value === value && o.soloOnly);

/** The party code, big enough to read out to a friend, with Copy invite beside it. Shown only once the party exists. */
function PartyCode({ code, send }) {
  return (
    <div className={styles.code} data-ui="party-code">
      <span className={styles.codeLabel}>Party code</span>
      <strong className={styles.codeValue}>{code}</strong>
      <button type="button" className={buttons.ghost} onClick={() => send(UiCommands.INVITE)}>Copy invite</button>
    </div>
  );
}

/**
 * Colour step (VIS-M3 #175): after Create or Join, every player, host included, picks a ball colour before entering the
 * lobby. Colours other players hold are shown taken, so the pick is unique in the party.
 */
function ColorStep({ lobby, send }) {
  return (
    <div className={app.card} data-ui="party-colour">
      <h1>{lobby.created ? 'Party created' : 'Joined the party'}</h1>
      {lobby.created ? <PartyCode code={lobby.code} send={send} /> : <p style={ROOM_LABEL}>Party {lobby.code}</p>}
      <p className={app.small}>{lobby.created ? 'Share the code so friends can join. ' : ''}Pick your ball colour, then enter the lobby.</p>
      <div className={styles.preview} aria-hidden="true"><span className={styles.previewBall} style={{ '--ball-color': colorHex(lobby.myColor ?? 0) }} /></div>
      <ColorPicker selected={lobby.myColor ?? null} taken={lobby.takenColors} onPick={c => send(UiCommands.SET_COLOR, { color: c })} />
      <p className={app.small} data-ui="colour-name">{PLAYER_COLOR_NAMES[lobby.myColor] ?? ''}</p>
      <button type="button" className={styles.enter} onClick={() => send(UiCommands.ENTER_LOBBY)}>Enter lobby</button>
      <button type="button" className={buttons.ghost} onClick={() => send(UiCommands.LEAVE)}>Leave party</button>
    </div>
  );
}

/** Party lobby (VIS-M3): everyone's ball on one plane, the party code, host mode choice, Start Game and the pre-start countdown. */
export function RoomLobby({ hidden }) {
  const { send, session } = useCommands();
  const lobby = useView(v => v.lobby);
  const [mode, setMode] = useState(GameModes.STANDARD);
  const offered = lobby?.modes || MODE_OPTIONS;
  const available = value => offered.some(o => o.value === value && !o.disabled);
  // A mode the room no longer offers (practice with a second player, Putt Pong without exactly two) falls back to Standard.
  useEffect(() => { if (lobby && !available(mode)) setMode(GameModes.STANDARD); });
  const start = () => {
    if (!available(mode)) return;
    session({ type: 'SET_MODE', mode });
    session({ type: 'START_VOTING' });
  };
  if (lobby?.colorStep && !hidden) return <ColorStep lobby={lobby} send={send} />;
  const party = !!lobby?.code;
  return (
    <div className={app.card} hidden={hidden} data-ui="room-lobby">
      <h1>{party ? 'Party lobby' : 'Room lobby'}</h1>
      <p style={ROOM_LABEL}>{lobby?.label}</p>
      {party && <PartyCode code={lobby.code} send={send} />}
      <LobbyPlane players={lobby?.roster} hidden={hidden} />
      <details className={styles.recolor} hidden={!lobby}><summary>Change ball colour</summary>
        <ColorPicker selected={lobby?.myColor ?? null} taken={lobby?.takenColors} onPick={c => send(UiCommands.SET_COLOR, { color: c })} />
      </details>
      <label hidden={!lobby?.showModes}>Game mode<select value={mode} onChange={e => setMode(e.target.value)}>
        {offered.map(o => <option key={o.value} value={o.value} disabled={!!o.disabled}>{o.label}</option>)}
      </select></label>
      <p className={app.status}>{lobby?.status}</p>
      <TiePicker tie={lobby?.tie} />
      <button type="button" hidden={!lobby?.showStart} onClick={start}>Start Game</button>
      <button type="button" className={buttons.ghost} onClick={() => send(UiCommands.LEAVE)}>Leave room</button>
    </div>
  );
}
