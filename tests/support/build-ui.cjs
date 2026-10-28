// Builds source entries (src/ui, src/app) with Vite's production JSX and CSS Modules transforms into
// ES modules that Node tests can import. Output lives under node_modules/.cache so bare imports resolve
// from the project. The project Vite configuration is not used.
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..', '..');

/**
 * Builds one source entry as an ES module for Node tests. Bare imports of runtime packages stay
 * external so tests share the project's single React/Three.js/XState instances.
 */
async function buildEntry(entry, name) {
  const outDir = path.join(root, 'node_modules', '.cache', 'putt-pals-tests', name);
  const { build } = await import('vite');
  // Vite sets process.env.NODE_ENV for the whole process during a build; restore it so tests keep
  // React's development build (act(), warnings).
  const nodeEnv = process.env.NODE_ENV;
  try {
  await build({
    configFile: false,
    root,
    logLevel: 'warn',
    build: {
      outDir,
      emptyOutDir: true,
      minify: false,
      lib: { entry: path.join(root, entry), formats: ['es'], fileName: name },
      rolldownOptions: { external: [/^react(-dom)?(\/.*)?$/, /^three(\/.*)?$/, /^peerjs$/, /^xstate(\/.*)?$/] },
    },
  });
  } finally {
    if (nodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = nodeEnv;
  }
  const files = fs.readdirSync(outDir);
  const js = files.find(f => f === name + '.mjs' || f === name + '.js');
  const css = files.find(f => f.endsWith('.css'));
  // import() needs a file URL: a bare Windows path (c:\...) is read as a URL with scheme "c:".
  const modulePath = path.join(outDir, js);
  return { modulePath, moduleUrl: pathToFileURL(modulePath).href, css: css ? fs.readFileSync(path.join(outDir, css), 'utf8') : '' };
}

const buildUi = () => buildEntry('src/ui/index.js', 'ui');
const buildApp = () => buildEntry('src/app/index.js', 'app');

module.exports = { buildUi, buildApp, buildEntry };
