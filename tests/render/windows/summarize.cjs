// Tabulates a folder of profile.cjs runs (r<rev>-<gpu>-<mode>/report.json) as Markdown and summary.json.
//   node tests/render/windows/summarize.cjs <folder>
const fs = require('node:fs');
const path = require('node:path');

const folder = path.resolve(process.argv[2] || 'test-results/r2w');
const runs = fs.readdirSync(folder).filter(d => fs.existsSync(path.join(folder, d, 'report.json')))
  .map(d => ({ id: d, ...JSON.parse(fs.readFileSync(path.join(folder, d, 'report.json'), 'utf8')) }));
const f = (x, d = 2) => (x == null ? '—' : x.toFixed(d));
const gpuName = r => (/NVIDIA/.test(r.hardware.gpu) ? 'RTX 5060' : /Radeon/.test(r.hardware.gpu) ? 'Radeon 860M' : r.hardware.gpu);
const out = [];

out.push('| Run | Rendered by (UNMASKED_RENDERER) | chrome://gpu active | Framebuffer | Errors | Plateau |', '| --- | --- | --- | --- | ---: | --- |');
for (const r of runs) out.push(`| ${r.id} | ${r.hardware.gpu} | ${r.hardware.chromeGpuActive?.join(', ') || '—'} | ${r.hardware.framebuffer.width}×${r.hardware.framebuffer.height} (${r.hardware.canvasCss.width}×${r.hardware.canvasCss.height} CSS @ DPR ${r.hardware.dpr}) | ${r.errors.length} | ${r.resources.plateau ? 'yes' : 'NO'} |`);

out.push('', '| Run | Starter | Mean interval | p95 interval | Late frames | CPU submit mean / p95 | GPU time mean / p95 | Calls / triangles |', '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |');
const summary = [];
for (const r of runs) for (const s of r.samples) {
  out.push(`| ${r.id} | ${s.name} | ${f(s.frameIntervalMs.mean)} | ${f(s.frameIntervalMs.p95)} | ${s.pacing.lateFrames} | ${f(s.renderSubmissionMs.mean)} / ${f(s.renderSubmissionMs.p95)} | ${f(s.gpuTimeMs?.mean)} / ${f(s.gpuTimeMs?.p95)} | ${s.diagnostics.calls} / ${s.diagnostics.triangles} |`);
  summary.push({ run: r.id, gpu: gpuName(r), revision: r.hardware.revision, mode: r.mode, starter: s.name, intervalMean: s.frameIntervalMs.mean, intervalP95: s.frameIntervalMs.p95, lateFrames: s.pacing.lateFrames, cpuMean: s.renderSubmissionMs.mean, cpuP95: s.renderSubmissionMs.p95, gpuMean: s.gpuTimeMs?.mean ?? null, gpuP95: s.gpuTimeMs?.p95 ?? null });
}

const apps = runs.filter(r => r.app);
if (apps.length) {
  out.push('', '| Run | Starter (complete app, solo, idle at tee) | Framebuffer | Mean interval | p95 interval | Late frames |', '| --- | --- | --- | ---: | ---: | ---: |');
  for (const r of apps) for (const a of r.app) out.push(`| ${r.id} | ${a.hud?.split(' · ')[0]} | ${a.framebuffer.width}×${a.framebuffer.height} | ${f(a.frameIntervalMs.mean)} | ${f(a.frameIntervalMs.p95)} | ${a.pacing.lateFrames} |`);
}

out.push('', '| Run | Builds | Counters per swap cycle (geometries/textures/programs) | JS heap first → last cycle (MB) |', '| --- | ---: | --- | --- |');
for (const r of runs) {
  const c = r.resources.cycles;
  out.push(`| ${r.id} | ${r.resources.builds} | ${[...new Set(c.map(x => `${x.geometries}/${x.textures}/${x.programs}`))].join(' → ')} | ${f(c[0].jsHeapBytes / 1e6)} → ${f(c.at(-1).jsHeapBytes / 1e6)} |`);
}

fs.writeFileSync(path.join(folder, 'summary.json'), JSON.stringify(summary, null, 1) + '\n');
fs.writeFileSync(path.join(folder, 'summary.md'), out.join('\n') + '\n');
console.log(out.join('\n'));
