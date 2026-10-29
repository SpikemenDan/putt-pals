import { UiContext, useView } from './context.js';
import { Banner } from './Banner.jsx';
import { GameScreen } from './GameScreen.jsx';
import { Landing } from './Landing.jsx';
import { Loading } from './Loading.jsx';
import { MapSelect } from './MapSelect.jsx';
import { Results } from './Results.jsx';
import { RoomLobby } from './RoomLobby.jsx';
import { ScorecardOverlay } from './Scorecard.jsx';
import { MESSAGES } from './commands.js';
import app from './App.module.css';
import './global.css';

function Screens({ onCanvas, initialName, initialRoomCode }) {
  const screens = useView(v => v.screens);
  const webglUnavailable = useView(v => v.webglUnavailable);
  const connecting = useView(v => v.landing).connecting;
  return (
    <div className={app.app}>
      <div className={app.netnotice} hidden={!webglUnavailable} role="status" data-ui="webgl-notice">{webglUnavailable ? MESSAGES.webglUnavailable : ''}</div>
      <Landing hidden={!screens.landing} initialName={initialName} initialRoomCode={initialRoomCode} />
      {connecting && <Loading />}
      <RoomLobby hidden={!screens.lobby} />
      <MapSelect hidden={!screens.voting} />
      <div className={app.netnotice} hidden={!screens.netNotice} role="alert">{screens.netNotice ? (screens.reconnecting ? MESSAGES.reconnecting : MESSAGES.connectionLost) : ''}</div>
      <ScorecardOverlay />
      <Banner />
      <GameScreen hidden={!screens.game && !screens.landing} backdrop={!screens.game && screens.landing} onCanvas={onCanvas} />
      <Results hidden={!screens.results} />
    </div>
  );
}

/**
 * Root component. Screens are always mounted and toggled with `hidden`, in the
 * legacy DOM order, so the canvas and form state persist across phases.
 *
 * @param {object} props
 * @param {ReturnType<import('./store.js').createUiStore>} props.store
 * @param {(command: object) => void} props.dispatch Use createUiDispatcher(store, appDispatch)
 * @param {{subscribeAim: Function}} [props.aim] The input adapter (power meter source)
 * @param {(canvas: HTMLCanvasElement|null) => void} [props.onCanvas]
 */
export function PuttPalsUi({ store, dispatch, aim = null, onCanvas, initialName = '', initialRoomCode = '' }) {
  return (
    <UiContext.Provider value={{ store, dispatch, aim }}>
      <Screens onCanvas={onCanvas} initialName={initialName} initialRoomCode={initialRoomCode} />
    </UiContext.Provider>
  );
}
