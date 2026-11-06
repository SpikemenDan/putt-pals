import { UiContext, useView } from './context.js';
import { Banner } from './Banner.jsx';
import { GameScreen } from './GameScreen.jsx';
import { Landing } from './Landing.jsx';
import { LoadingGate } from './Loading.jsx';
import { MapSelect } from './MapSelect.jsx';
import { Results } from './Results.jsx';
import { RoomLobby } from './RoomLobby.jsx';
import { ScorecardOverlay } from './Scorecard.jsx';
import { MESSAGES } from './commands.js';
import { DISPLAY } from '../shared/display.js';
import app from './App.module.css';
import './fonts/fonts.css';
import './global.css';

function Screens({ onCanvas, initialName, initialRoomCode }) {
  const screens = useView(v => v.screens);
  const webglUnavailable = useView(v => v.webglUnavailable);
  const landing = useView(v => v.landing);
  return (
    <div className={app.app}>
      <div className={app.netnotice} hidden={!webglUnavailable} role="status" data-ui="webgl-notice">{webglUnavailable ? MESSAGES.webglUnavailable : ''}</div>
      <Landing hidden={!screens.landing} initialName={initialName} initialRoomCode={initialRoomCode} />
      <LoadingGate connecting={landing.connecting} failed={!!landing.error} menu={screens.landing} />
      <RoomLobby hidden={!screens.lobby} />
      <MapSelect hidden={!screens.voting} />
      <div className={app.netnotice} hidden={!screens.netNotice} role="alert">{screens.netNotice ? (screens.reconnecting ? MESSAGES.reconnecting : screens.connectionReason || MESSAGES.connectionLost) : ''}</div>
      <ScorecardOverlay />
      <Banner />
      <GameScreen hidden={!screens.game} onCanvas={onCanvas} />
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
 * @param {typeof DISPLAY} [props.display] Presentation settings (read live by the planet behind the menu and loading screen); defaults to DISPLAY
 * @param {Function} [props.createLoadingScene] Builds the 3D planet behind the menu and loading screen; without it only the CSS sky shows
 */
export function PuttPalsUi({ store, dispatch, aim = null, onCanvas, initialName = '', initialRoomCode = '', display = DISPLAY, createLoadingScene = null }) {
  return (
    <UiContext.Provider value={{ store, dispatch, aim, display, createLoadingScene }}>
      <Screens onCanvas={onCanvas} initialName={initialName} initialRoomCode={initialRoomCode} />
    </UiContext.Provider>
  );
}
