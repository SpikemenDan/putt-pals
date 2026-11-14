import { createContext, useContext, useSyncExternalStore } from 'react';
import { UiCommands } from './commands.js';

/**
 * The planet stage behind the menu (src/ui/Loading.jsx) as seen by the menus: the live scene, if one is built, and the view the menus
 * want (VIS-M4 destination view). A scene built later picks the wanted view up, so the order of mounting does not matter.
 */
export function createStageHandle() {
  const handle = {
    scene: null,
    view: { space: false, target: 'gaia' },
    setView(view) { handle.view = { ...handle.view, ...view }; handle.scene?.setView?.(handle.view); },
    attach(scene) { handle.scene = scene; scene?.setView?.(handle.view); },
    detach(scene) { if (handle.scene === scene) handle.scene = null; },
  };
  return handle;
}

/** { store, dispatch, aim, display, stage } supplied by <PuttPalsUi>. */
export const UiContext = createContext(null);

export function useUiContext() {
  const context = useContext(UiContext);
  if (!context) throw new Error('Putt Pals UI components must be rendered inside <PuttPalsUi>');
  return context;
}

/**
 * Subscribes to one section of the cached UI snapshot. Selectors must return a
 * section of the snapshot (stable identity), not a newly built object.
 */
export function useView(select) {
  const { store } = useUiContext();
  const get = () => select(store.getSnapshot());
  return useSyncExternalStore(store.subscribe, get, get);
}

/** Dispatch helpers shared by the screens. */
export function useCommands() {
  const { dispatch } = useUiContext();
  return {
    dispatch,
    send: (type, extra) => dispatch({ type, ...extra }),
    session: event => dispatch({ type: UiCommands.SESSION, event }),
  };
}
