/**
 * Development-only power-up catalog: a small tab on the left edge that opens a drawer of every power-up, so a developer can put one
 * in the local inventory of the current putt without anything covering the game. Clicking a card gives the item; the normal flow then
 * applies (press its slot, then click the course if it asks). Nothing here changes a setting or a rule. Plain DOM, text only;
 * the icons are the fixed markup from src/ui/icons.js.
 */
import { POWERUP_CATALOG } from '../gameplay/catalog.js';
import { powerupIcon } from '../ui/icons.js';

const STYLE = `
[data-ui=powerup-catalog]{position:fixed;left:0;top:50%;transform:translateY(-50%);z-index:2147483000;display:flex;align-items:center;font:700 12px "Trebuchet MS","Segoe UI",system-ui,sans-serif;color:#14102a}
[data-ui=powerup-catalog] .tab{margin:0;padding:10px 6px;writing-mode:vertical-rl;border:2px solid #14102a;border-left:0;border-radius:0 10px 10px 0;background:#ffd23f;box-shadow:2px 2px 0 #14102a;font:900 11px "Arial Black",system-ui,sans-serif;letter-spacing:1px;cursor:pointer}
[data-ui=powerup-catalog] .drawer{width:252px;max-height:80vh;overflow-x:hidden;overflow-y:auto;padding:10px;border:2px solid #14102a;border-left:0;border-radius:0 12px 12px 0;background:#fff8e4;box-shadow:3px 3px 0 #14102a}
[data-ui=powerup-catalog] h2{margin:8px 0 6px;font:900 11px "Arial Black",system-ui,sans-serif;letter-spacing:1px;text-transform:uppercase;color:#4b4466}
[data-ui=powerup-catalog] h2:first-child{margin-top:0}
[data-ui=powerup-catalog] .grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:5px}
[data-ui=powerup-catalog] .card{margin:0;padding:3px;min-width:0;aspect-ratio:1;border:2px solid #14102a;border-radius:9px;background:#fff;box-shadow:2px 2px 0 #14102a;cursor:pointer}
[data-ui=powerup-catalog] .card:hover{background:#ffd23f}
[data-ui=powerup-catalog] .row{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:6px}
[data-ui=powerup-catalog] .pill{margin:0;padding:4px 8px;border:2px solid #14102a;background:#fff;box-shadow:2px 2px 0 #14102a;font:900 10px "Arial Black",system-ui,sans-serif;text-transform:uppercase;cursor:pointer}
[data-ui=powerup-catalog] .pill:hover,[data-ui=powerup-catalog] .pill[aria-pressed=true]{background:#ffd23f}
[data-ui=powerup-catalog] .status{min-height:32px;margin:8px 0 0;line-height:1.3}
`;

const BANNER_SAMPLES = [
  ['Putt', 'PUTT 2 / 6', 'SWITCHBACK GARDEN', 'event'],
  ['Power-up', 'Ana', 'TORNADO ACTIVATED', 'power'],
  ['Hole in one', 'Ben', 'HOLE IN ONE', 'hio'],
  ['Winner', 'Captain Longname', 'MAP WINNER · DUNE SERPENT', 'event'],
];

const GROUPS =[['self-utility', 'Self'], ['aim-sabotage', 'Sabotage'], ['ball-aura', 'Auras'], ['deployable', 'Course'], ['global-hazard', 'Weather']];

export function mountPowerupCatalog(doc, app, catalog = POWERUP_CATALOG) {
  const style = doc.createElement('style'); style.textContent = STYLE;
  const box = doc.createElement('div'); box.dataset.ui = 'powerup-catalog';
  const drawer = doc.createElement('div'); drawer.className = 'drawer'; drawer.hidden = true;
  const status = doc.createElement('p'); status.className = 'status'; status.setAttribute('role', 'status'); status.textContent = 'Click a power-up to add it to your inventory.';
  for (const [group, title] of GROUPS) {
    const entries = catalog.filter(e => e.group === group);
    if (!entries.length) continue;
    const heading = doc.createElement('h2'); heading.textContent = title;
    const grid = doc.createElement('div'); grid.className = 'grid';
    for (const entry of entries) {
      const card = doc.createElement('button'); card.type = 'button'; card.className = 'card'; card.title = entry.name + ': ' + entry.toast;
      card.setAttribute('aria-label', 'Give ' + entry.name);
      card.innerHTML = powerupIcon(entry.id); // fixed markup from icons.js
      card.addEventListener('click', () => { status.textContent = app.grantItem(entry.id) ? entry.name + ' added. Use its slot.' : 'No free slot, or not in a putt.'; });
      grid.append(card);
    }
    drawer.append(heading, grid);
  }
  // Banner preview (#203): fire sample announcements over the course.
  const bannerHeading = doc.createElement('h2'); bannerHeading.textContent = 'Banners';
  const sampleRow = doc.createElement('div'); sampleRow.className = 'row';
  for (const [label, text, sub, kind] of BANNER_SAMPLES) {
    const b = doc.createElement('button'); b.type = 'button'; b.className = 'pill'; b.textContent = label;
    b.addEventListener('click', () => app.store?.announce(text, sub, kind));
    sampleRow.append(b);
  }
  drawer.append(bannerHeading, sampleRow, status);
  const tab = doc.createElement('button'); tab.type = 'button'; tab.className = 'tab'; tab.textContent = 'POWER-UPS'; tab.setAttribute('aria-expanded', 'false');
  tab.addEventListener('click', () => { drawer.hidden = !drawer.hidden; tab.setAttribute('aria-expanded', String(!drawer.hidden)); });
  box.append(drawer, tab);
  doc.head.append(style); doc.body.append(box);
  return () => { box.remove(); style.remove(); };
}
