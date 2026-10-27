import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PuttPalsUi } from './App.jsx';
import { UiCommands } from './commands.js';

/**
 * Wraps the application's command handler: scorecard open/close is UI state and
 * is applied to the store first; every command (including those) is then
 * forwarded. Give the same function to the input adapter so keyboard
 * shortcuts and buttons behave identically.
 */
export function createUiDispatcher(store, appDispatch) {
  return command => {
    if (command.type === UiCommands.TOGGLE_CARD) store.toggleCard();
    else if (command.type === UiCommands.CLOSE_CARD) store.closeCard();
    appDispatch(command);
  };
}

/**
 * Mounts the UI into an element. Returns an unmount function that removes the
 * React tree and its subscriptions; the caller still disposes the store,
 * input adapter and renderer it owns.
 */
export function mountUi(element, props) {
  const root = createRoot(element);
  root.render(<StrictMode><PuttPalsUi {...props} /></StrictMode>);
  return () => root.unmount();
}
