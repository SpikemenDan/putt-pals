import { createContext, useContext, useSyncExternalStore } from 'react';
import { UiCommands } from './commands.js';

/** { store, dispatch, aim } supplied by <PuttPalsUi>. */
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
