#!/usr/bin/env node
/**
 * Imports an Azgaar Fantasy Map Generator save (.map) as Gaia's reference world: src/shared/gaia-reference.js.
 *
 *   node tools/gaia/import-azgaar.mjs "path/to/World.map"
 *
 * The map must cover the whole globe (Azgaar "coordinates": latitude 90 to -90, longitude -180 to 180), so map x is longitude and map y is
 * latitude. Taken from the save: land and lake outlines and biome areas (vectors from its SVG), river centre lines, the height grid, towns
 * and cities (burgs), and volcano markers. Nothing else (states, economy, names of seas) is used. Re-run it after editing the map in
 * Azgaar; the game reads only the generated file.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const source = process.argv[2];
if (!source) { console.error('usage: node tools/gaia/import-azgaar.mjs <file.map>'); process.exit(1); }
const text = readFileSync(source, 'utf8'), lines = text.split(/\r?\n/);
const settings = JSON.parse(lines[1]), coords = settings.geography?.coordinates ?? {};
const W = settings.graph.width, H = settings.graph.height;
if (coords.latN !== 90 || coords.latS !== -90 || coords.lonW !== -180 || coords.lonE !== 180) {
  console.error('This map does not cover the whole globe (set Map coordinates to the full world in Azgaar before saving).');
  process.exit(1);
}
const svgStart = lines.findIndex(l => l.startsWith('<svg')), svgEnd = lines.findIndex((l, i) => i > svgStart && l.includes('</svg>'));
const svg = lines.slice(svgStart, svgEnd + 1).join('\n'), after = lines.slice(svgEnd + 1);
const json = i => JSON.parse(after[i]);
const biomesData = JSON.parse(lines[3]);
const features = json(6), burgs = json(9), rivers = json(26), markers = json(29), grid = json(0), heights = after[1].split(',').map(Number);
if (!Array.isArray(features) || !Array.isArray(burgs) || !grid.cellsX) { console.error('Unexpected file layout: this importer was written for Azgaar 1.156.'); process.exit(1); }

/** Points of an SVG path's subpaths (absolute M, L, C, Q and Z), keeping each segment's end point. */
function subpaths(d) {
  const out = [];
  let ring = null;
  const tokens = d.match(/[MLCQZHVmlcqzhv]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
  let cmd = 'M', i = 0, x = 0, y = 0;
  const num = () => Number(tokens[i++]);
  while (i < tokens.length) {
    if (/[A-Za-z]/.test(tokens[i])) cmd = tokens[i++];
    if (cmd === 'Z' || cmd === 'z') { if (ring?.length) out.push(ring); ring = null; continue; }
    if (cmd === 'M') { if (ring?.length) out.push(ring); x = num(); y = num(); ring = [[x, y]]; cmd = 'L'; continue; }
    if (cmd === 'L') { x = num(); y = num(); }
    else if (cmd === 'H') x = num();
    else if (cmd === 'V') y = num();
    else if (cmd === 'C') { i += 4; x = num(); y = num(); }
    else if (cmd === 'Q') { i += 2; x = num(); y = num(); }
    else throw new Error('unsupported path command ' + cmd);
    ring ??= [];
    ring.push([x, y]);
  }
  if (ring?.length) out.push(ring);
  return out;
}

/** Douglas–Peucker on a closed ring. */
function simplify(points, tolerance) {
  if (points.length < 8) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop(), [ax, ay] = points[a], [bx, by] = points[b], dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy) || 1;
    let worst = -1, far = tolerance;
    for (let k = a + 1; k < b; k++) { const q = Math.abs((points[k][0] - ax) * dy - (points[k][1] - ay) * dx) / l; if (q > far) { far = q; worst = k; } }
    if (worst > 0) { keep[worst] = 1; stack.push([a, worst], [worst, b]); }
  }
  return points.filter((_, k) => keep[k]);
}

const pathD = id => { const m = svg.match(new RegExp(`<path[^>]*id="${id}"[^>]*>`)) ?? svg.match(new RegExp(`<path[^>]*d="[^"]*"[^>]*id="${id}"`)); return m ? (m[0].match(/ d="([^"]*)"/) ?? [])[1] : null; };
/** A closed ring simplified in two halves, so its matching first and last points cannot collapse it. */
const simplifyRing = (r, tolerance) => { const half = Math.floor(r.length / 2); return r.length < 8 ? r : [...simplify(r.slice(0, half + 1), tolerance).slice(0, -1), ...simplify([...r.slice(half), r[0]], tolerance).slice(0, -1)]; };
const pack = rings => rings.filter(r => r.length > 2).map(r => simplifyRing(r, 0.18).flatMap(([x, y]) => [Math.round(x * 10), Math.round(y * 10)]));

const land = [], lakes = [];
for (const f of features) {
  if (!f || !f.i) continue;
  const d = pathD('feature_' + f.i);
  if (!d) continue;
  if (f.land) land.push(...pack(subpaths(d)));
  else if (f.type === 'lake') lakes.push(...pack(subpaths(d)));
}
const biomes = [];
biomesData.forEach(b => {
  if (!b.i) return;
  const d = pathD('biome' + b.i);
  if (d) biomes.push({ id: b.i, rings: pack(subpaths(d)) });
});
const riverLines = [];
for (const r of rivers) {
  const d = pathD('river' + r.i);
  if (!d) continue;
  const outline = subpaths(d)[0], n = outline.length, half = Math.floor(n / 2), centre = [];
  for (let k = 0; k < half; k++) { const a = outline[k], b = outline[n - 1 - k]; centre.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, Math.hypot(a[0] - b[0], a[1] - b[1])]); }
  const kept = centre.filter((_, k) => k % 2 === 0 || k === centre.length - 1);
  riverLines.push(kept.flatMap(([x, y, w]) => [Math.round(x * 10), Math.round(y * 10), Math.round(w * 10)]));
}
const towns = burgs.filter(b => b && b.i && !b.removed).map(b => [Math.round(b.x * 10), Math.round(b.y * 10), Math.round(b.population * 100) / 100, b.capital ? 1 : 0, b.port ? 1 : 0, b.name]);
const volcanoes = markers.filter(m => m.type === 'volcanoes').map(m => [Math.round(m.x * 10), Math.round(m.y * 10)]);
const header = `/**
 * Gaia's reference world, imported from an Azgaar Fantasy Map Generator save by tools/gaia/import-azgaar.mjs. Generated: do not edit by hand,
 * edit the map in Azgaar and import again. Source: ${source.split(/[\\\\/]/).pop()}.
 *
 * Coordinates are map pixels times ten on a ${W} x ${H} map that spans the whole globe: x is longitude west to east, y latitude north to south.
 * LAND and LAKES are flat [x, y, x, y, ...] rings. BIOMES lists each Azgaar biome's rings by its index in BIOME_NAMES. RIVERS are centre lines
 * of [x, y, width] triples. HEIGHTS is Azgaar's 0-100 height grid (20 and up is land), GRID_COLUMNS wide. BURGS are
 * [x, y, population in thousands, capital, port, name]. VOLCANOES are [x, y].
 */
`;
const body = [
  `export const MAP_WIDTH = ${W}, MAP_HEIGHT = ${H};`,
  `export const BIOME_NAMES = ${JSON.stringify(biomesData.map(b => b.name))};`,
  `export const BIOME_COLOURS = ${JSON.stringify(biomesData.map(b => b.color))};`,
  `export const LAND = ${JSON.stringify(land)};`,
  `export const LAKES = ${JSON.stringify(lakes)};`,
  `export const BIOMES = ${JSON.stringify(biomes)};`,
  `export const RIVERS = ${JSON.stringify(riverLines)};`,
  `export const GRID_COLUMNS = ${grid.cellsX}, GRID_ROWS = ${grid.cellsY}, GRID_SPACING = ${grid.spacing};`,
  `export const HEIGHTS = ${JSON.stringify(heights.join(','))};`,
  `export const BURGS = ${JSON.stringify(towns)};`,
  `export const VOLCANOES = ${JSON.stringify(volcanoes)};`,
].join('\n');
const target = resolve(dirname(fileURLToPath(import.meta.url)), '../../src/shared/gaia-reference.js');
writeFileSync(target, header + '\n' + body + '\n');
console.log(`wrote ${target}: ${land.length} land rings, ${lakes.length} lakes, ${biomes.length} biomes, ${riverLines.length} rivers, ${towns.length} burgs, ${volcanoes.length} volcanoes, ${Math.round((header.length + body.length) / 1024)} KB`);
