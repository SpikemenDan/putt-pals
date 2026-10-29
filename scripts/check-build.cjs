const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..');
const source = new JSDOM(fs.readFileSync(path.join(root, 'putt-pals.html'), 'utf8'));
const built = new JSDOM(fs.readFileSync(path.join(root, 'dist/putt-pals.html'), 'utf8'));
try {
  const originals = [...source.window.document.scripts];
  const output = [...built.window.document.scripts];
  assert.equal(originals.length, 3, 'legacy baseline has two libraries and one game script');
  assert.equal(output.length, originals.length, 'build must preserve every runtime script');
  originals.forEach((script, index) => {
    assert.equal(output[index].textContent, script.textContent, `script ${index} changed during build`);
    assert.equal(output[index].id, script.id, `script ${index} ID changed`);
    assert.equal(output[index].src, script.src, `script ${index} URL changed`);
  });
  for (const id of ['game', 'cv', 'solo', 'go', 'mapgrid', 'cardov']) {
    assert.ok(built.window.document.getElementById(id), `missing game element: ${id}`);
  }
  // Legacy CSS must survive the build unchanged (minification once dropped standard backdrop-filter).
  const styles = doc => [...doc.querySelectorAll('style')].map(s => s.textContent);
  assert.deepEqual(styles(built.window.document), styles(source.window.document), 'legacy page CSS changed during build');

  // Modular app page (I1): root element, module entry and its assets.
  const app = new JSDOM(fs.readFileSync(path.join(root, 'dist/index.html'), 'utf8'));
  try {
    const doc = app.window.document;
    assert.ok(doc.getElementById('root'), 'app page has #root');
    const script = doc.querySelector('script[type="module"][src]');
    assert.ok(script, 'app page loads a module script');
    const asset = href => path.join(root, 'dist', href.replace(/^\//, ''));
    assert.ok(fs.existsSync(asset(script.getAttribute('src'))), 'app script asset exists');
    const css = [...doc.querySelectorAll('link[rel="stylesheet"]')].map(l => fs.readFileSync(asset(l.getAttribute('href')), 'utf8')).join('\n');
    // V1d: the comic theme has no glass panels, so the I1 backdrop-filter guard no longer applies. The app CSS must still be present.
    assert.ok(css.length > 0, 'app page links built CSS');
    assert.ok(!fs.readFileSync(asset(script.getAttribute('src')), 'utf8').includes('<script id="game">'), 'app bundle does not embed the legacy game');
  } finally {
    app.window.close();
  }
  console.log('BUILD_OK: legacy scripts and CSS preserved byte-for-byte; core UI present; modular app page and assets present');
} finally {
  source.window.close();
  built.window.close();
}
