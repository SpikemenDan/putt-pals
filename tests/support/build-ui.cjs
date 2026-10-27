// Builds src/ui with Vite's production JSX and CSS Modules transforms into an ES module that Node
// tests can import. Output lives under node_modules/.cache so bare imports (react, react-dom)
// resolve from the project. No Vite configuration file is used or changed.
const path = require('node:path');
const fs = require('node:fs');

const root = path.resolve(__dirname, '..', '..');
const outDir = path.join(root, 'node_modules', '.cache', 'putt-pals-tests', 'ui');

async function buildUi() {
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
      lib: { entry: path.join(root, 'src/ui/index.js'), formats: ['es'], fileName: 'ui' },
      rolldownOptions: { external: [/^react(-dom)?(\/.*)?$/] },
    },
  });
  } finally {
    if (nodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = nodeEnv;
  }
  const files = fs.readdirSync(outDir);
  const js = files.find(f => /^ui\.(m?js)$/.test(f));
  const css = files.find(f => f.endsWith('.css'));
  return { modulePath: path.join(outDir, js), css: css ? fs.readFileSync(path.join(outDir, css), 'utf8') : '' };
}

module.exports = { buildUi };
