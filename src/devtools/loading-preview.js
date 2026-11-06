/**
 * Development-only controls for the loading screen (VIS-M1): a button that shows it without opening a room, and two font
 * selectors for comparing the display and body typefaces. The button only toggles the same `connecting` flag the real join flow
 * sets; a font choice sets --pp-display / --pp-body on the page root and is never saved, so it cannot become the shipped
 * default by accident (to ship one, change the imports and the default in src/ui/Loading.jsx and Loading.module.css).
 * Font files are loaded on demand, only from this dev module. Plain DOM, text only.
 */

const DISPLAY_FONTS = {
  Bangers: () => import('@fontsource/bangers/latin-400.css'),
  'Luckiest Guy': () => import('@fontsource/luckiest-guy/latin-400.css'),
  'Titan One': () => import('@fontsource/titan-one/latin-400.css'),
  Chewy: () => import('@fontsource/chewy/latin-400.css'),
  'Paytone One': () => import('@fontsource/paytone-one/latin-400.css'),
  'Lilita One': () => import('@fontsource/lilita-one/latin-400.css'),
  Orbitron: () => import('@fontsource/orbitron/latin-800.css'),
  'Three-D (AidenFont, CC BY)': async () => { await import('../ui/fonts/three-d/three-d.css'); await document.fonts.load("48px 'Three-D'"); },
};
const BODY_FONTS = {
  Nunito: () => import('@fontsource/nunito/latin-800.css'),
  Fredoka: () => import('@fontsource/fredoka/latin-600.css'),
  'Baloo 2': () => import('@fontsource/baloo-2/latin-700.css'),
  Orbitron: () => import('@fontsource/orbitron/latin-800.css'),
};

export function mountLoadingPreview(doc, app) {
  const box = doc.createElement('div');
  box.dataset.ui = 'loading-preview';
  box.style.cssText = 'position:fixed;left:12px;bottom:56px;z-index:2147483000;font:12px system-ui,sans-serif;background:#1b1b1f;color:#fff;border-radius:8px;padding:6px 10px;display:flex;gap:6px;align-items:center;flex-wrap:wrap;max-width:360px';
  const button = doc.createElement('button');
  button.type = 'button';
  const sync = () => { button.textContent = app.store.getSnapshot().landing.connecting ? 'Hide loading screen' : 'Loading screen preview'; };
  button.addEventListener('click', () => { app.store.setLocal({ connecting: !app.store.getSnapshot().landing.connecting }); sync(); });
  sync();
  if (new URLSearchParams(doc.defaultView.location.search).has('loading')) { app.store.setLocal({ connecting: true }); sync(); } // http://localhost:5173/?loading opens straight onto it
  box.append(button);
  const picker = (label, fonts, variable) => {
    const wrap = doc.createElement('label');
    wrap.style.cssText = 'display:flex;gap:4px;align-items:center;white-space:nowrap;color:#fff';
    wrap.append(label + ':');
    const select = doc.createElement('select');
    select.style.cssText = 'font:inherit;max-width:120px';
    for (const name of Object.keys(fonts)) select.append(new Option(name, name));
    select.addEventListener('change', async () => {
      await fonts[select.value]();
      doc.documentElement.style.setProperty(variable, `'${select.value.replace(/ \(.*$/, '')}', 'Arial Black', sans-serif`);
    });
    wrap.append(select);
    box.append(wrap);
  };
  picker('Title font', DISPLAY_FONTS, '--pp-display');
  picker('Body font', BODY_FONTS, '--pp-body');
  doc.body.append(box);
  return () => { doc.documentElement.style.removeProperty('--pp-display'); doc.documentElement.style.removeProperty('--pp-body'); box.remove(); };
}
