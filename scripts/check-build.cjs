const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..');
assert.equal(fs.readFileSync(path.join(root, 'dist/_headers'), 'utf8'), fs.readFileSync(path.join(root, 'public/_headers'), 'utf8'), 'Cloudflare static header rules must survive the build');
assert.equal(fs.existsSync(path.join(root, 'dist/putt-pals.html')), false, 'the retired legacy page must not be built');

// Modular app page: root element, module entry and its assets.
const app = new JSDOM(fs.readFileSync(path.join(root, 'dist/index.html'), 'utf8'));
try {
  const doc = app.window.document;
  assert.ok(doc.getElementById('root'), 'app page has #root');
  const script = doc.querySelector('script[type="module"][src]');
  assert.ok(script, 'app page loads a module script');
  const asset = href => path.join(root, 'dist', href.replace(/^\//, ''));
  assert.ok(fs.existsSync(asset(script.getAttribute('src'))), 'app script asset exists');
  const css = [...doc.querySelectorAll('link[rel="stylesheet"]')].map(l => fs.readFileSync(asset(l.getAttribute('href')), 'utf8')).join('\n');
  assert.ok(css.length > 0, 'app page links built CSS');
  const bundle = fs.readFileSync(asset(script.getAttribute('src')), 'utf8');
  assert.ok(!bundle.includes('<script id="game">'), 'app bundle does not embed the legacy game');
  // The development tuning panel is only for `vite dev`; production bundles must not carry it.
  const everyScript = fs.readdirSync(path.join(root, 'dist/assets')).filter(f => f.endsWith('.js')).map(f => fs.readFileSync(path.join(root, 'dist/assets', f), 'utf8')).join(' ');
  for (const marker of ['putt-pals.display-overrides', 'pp-tune']) assert.ok(!everyScript.includes(marker), `production build contains development-only code (${marker})`);
  console.log('BUILD_OK: modular app page, module script, CSS and headers present; no legacy page and no development-only panel in the build');
} finally {
  app.window.close();
}
