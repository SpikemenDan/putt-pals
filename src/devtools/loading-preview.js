/**
 * Development-only button that shows the loading screen without opening a room (VIS-M1), so its look can be reviewed with the
 * display tuning panel's Loading settings. It only toggles the same `connecting` flag the real join flow sets, so nothing
 * else changes; closing it (or the next real join) clears the flag. Plain DOM, text only.
 */
export function mountLoadingPreview(doc, app) {
  const box = doc.createElement('div');
  box.dataset.ui = 'loading-preview';
  box.style.cssText = 'position:fixed;left:12px;bottom:56px;z-index:2147483000;font:12px system-ui,sans-serif;background:#1b1b1f;color:#fff;border-radius:8px;padding:6px 10px;display:flex;gap:6px;align-items:center';
  const button = doc.createElement('button');
  button.type = 'button';
  const sync = () => { button.textContent = app.store.getSnapshot().landing.connecting ? 'Hide loading screen' : 'Loading screen preview'; };
  button.addEventListener('click', () => { app.store.setLocal({ connecting: !app.store.getSnapshot().landing.connecting }); sync(); });
  sync();
  box.append(button);
  doc.body.append(box);
  return () => box.remove();
}
