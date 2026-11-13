/**
 * Development only (VIS-U look review, owner 2026-11-13): a "Panel look" picker that sets html[data-panel-look]
 * so the owner can compare menu panel styles on the real menu. Comic (no attribute) is the shipped look; the
 * others live in Landing.module.css and CustomRules.module.css until one is chosen. Remembered for the tab.
 */
export const PANEL_LOOKS = Object.freeze({ comic: 'Comic (current)', arcade: 'Arcade', clean: 'Clean', glass: 'Glass' });
const KEY = 'pp.dev.panelLook';

export function mountPanelLook(doc, storage = null) {
  const root = doc.documentElement;
  const apply = look => { if (look === 'comic' || !Object.hasOwn(PANEL_LOOKS, look)) delete root.dataset.panelLook; else root.dataset.panelLook = look; };
  let saved = null;
  try { saved = storage?.getItem(KEY) ?? null; } catch { /* no storage */ }
  const start = Object.hasOwn(PANEL_LOOKS, saved) ? saved : 'comic';
  apply(start);
  const box = doc.createElement('label');
  box.dataset.dev = 'panel-look';
  box.style.cssText = 'position:fixed;right:12px;bottom:48px;z-index:2147483000;font:12px system-ui,sans-serif;background:#1b1b1f;color:#fff;border-radius:8px;padding:6px 10px;display:flex;gap:6px;align-items:center';
  box.append('Panel look:');
  const select = doc.createElement('select');
  select.style.cssText = 'font:inherit';
  for (const [id, name] of Object.entries(PANEL_LOOKS)) select.append(new Option(name, id));
  select.value = start;
  select.addEventListener('change', () => { apply(select.value); try { storage?.setItem(KEY, select.value); } catch { /* not remembered */ } });
  box.append(select);
  doc.body.append(box);
  return () => { box.remove(); delete root.dataset.panelLook; };
}
