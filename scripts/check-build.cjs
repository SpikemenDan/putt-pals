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
  console.log('BUILD_OK: embedded libraries and game script preserved byte-for-byte; core UI present');
} finally {
  source.window.close();
  built.window.close();
}
