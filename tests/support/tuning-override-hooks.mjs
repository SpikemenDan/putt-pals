// Test-only module loader hook: when PP_TUNING_OVERRIDES holds a JSON object, src/shared/tuning.js builds TUNING with those
// overrides (through its own validated createTuning), so a child process can run the real consumers with non-default values.
// Nothing here ships and src/shared/tuning.js itself is not changed.
export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context);
  if (url.endsWith('/src/shared/tuning.js') && process.env.PP_TUNING_OVERRIDES) {
    const source = String(result.source);
    const patched = source.replace('export const TUNING = createTuning();', 'export const TUNING = createTuning(JSON.parse(process.env.PP_TUNING_OVERRIDES));');
    if (patched === source) throw new Error('src/shared/tuning.js no longer has the expected `export const TUNING = createTuning();` line; update this hook');
    return { ...result, source: patched };
  }
  return result;
}
