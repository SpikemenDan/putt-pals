/**
 * Traceability for the configuration systems: what each setting measures, how a change takes effect, and which files read it.
 *
 * Only units and the restart rule are written down here. Consumers are derived from the source itself (`findConsumers`), so
 * the list cannot go stale: it follows `TUNING.a.b`, `DISPLAY.a.b`, aliases such as `const AIM = TUNING.aim`, destructuring
 * such as `const { surface: SURF } = TUNING`, and group-wide uses such as `{ ...TUNING.surfaceDragMultiplier }`.
 *
 * This file is not imported by the simulation, so editing it never changes the simulation fingerprint.
 */

/** [pattern, units], first match wins. Every TUNING field must match one (tests/config-meta.test.cjs). */
export const TUNING_UNITS = Object.freeze([
  [/^gravity$/, 'units/s²'],
  [/^shotPower$/, 'units/s (launch speed at full charge)'],
  [/^(?:ball\.radius|wallHeight|cup\.(?:defaultRadius|minRadius|depth|sinkMargin|filletWidth|filletDepth)|bounce\.ledgeHeight|rest\.(?:airTolerance|groundTolerance)|powerups\.(?:magnetRange|auraRange)|hazards\.(?:padRadius|teleporterRadius)|aim\.arrowMaxLength)$/, 'world units'],
  [/^cup\.lipRestitution(?:Base|Gain)$/, 'factor'],
  [/^surface\.(?:turf|sand|ice|slime)\.friction$|^surface\.padFrictionBonus$/, '1/s'],
  [/^surface\.(?:turf|sand|ice|slime)\.drag$/, 'units/s²'],
  [/^surface\.speedFrictionGain$/, 'fraction'],
  [/^surface\.speedFrictionRef$/, 'units/s'],
  [/^surfaceDragMultiplier\./, 'multiplier'],
  [/^bounce\.(?:wallRestitution|ledgeDamping|landingRestitution)$/, 'factor'],
  [/^bounce\.landingSpeed$/, 'units/s'],
  [/^rest\.maxSlope$/, 'slope (rise over run)'],
  [/^rest\.(?:maxSpeed|maxVertical)$/, 'units/s'],
  [/^powerups\.(?:magnetPull|auraPull|auraPush)$/, 'units/s²'],
  [/^powerups\.chipLaunch$/, 'units/s'],
  [/^powerups\.(?:smallBallScale|tallBallScale)$/, 'multiplier'],
  [/^deployables\.(?:bumperRadius|orbitalRange)$/, 'world units'],
  [/^deployables\.orbitalPull$/, 'units/s²'],
  [/^deployables\.(?:bumperKick|minHitSpeed|orbitalSpeedRef)$/, 'units/s'],
  [/^deployables\.(?:bumperRestitution|orbitalRestitution)$/, 'factor'],
  [/^deployables\.hitCooldownMs$/, 'milliseconds'],
  [/^deployables\.maxImpacts$/, 'impacts'],
  [/^hazards\.padLaunch$/, 'units/s'],
  [/^hazards\.(?:padCooldown|teleporterCooldown)$/, 'seconds'],
  [/^aim\.(?:swayPeriod|spinPeriod|sweepPeriod)$/, 'seconds'],
  [/^aim\.(?:spreadBase|spreadGain|keyStep)$/, 'radians'],
  [/^aim\.spreadExponent$/, 'exponent'],
  [/^aim\.fullPullPx$/, 'CSS px'],
  [/^aim\.canvasPullFraction$/, 'fraction of canvas width'],
  [/^aim\.dragRadiansPerPx$/, 'radians per CSS px'],
  [/^aim\.(?:guideMinCharge|shotMinCharge)$/, 'fraction of full power'],
]);

export const DISPLAY_UNITS = Object.freeze({
  'ball.visualScale': 'multiplier',
  'aim.arrowMaxLength': 'world units',
  'aim.arrowShaftHalfWidth': 'world units',
  'aim.arrowHeadHalfWidth': 'world units',
  'aim.arrowHeadLength': 'world units',
  'aim.arrowOpacity': 'opacity, 0 to 1',
});

/** How a change takes effect. */
export const RESTART = Object.freeze({
  live: 'live: read every frame, a change shows at once',
  reload: 'reload: read when the modules load, so a change needs a page reload (and a new match); it also changes the simulation fingerprint and invalidates difficulty evidence',
});

export const CONFIG_DOMAINS = Object.freeze({
  display: { label: 'DISPLAY (presentation)', roots: ['DISPLAY', 'display'], restart: 'live', file: 'src/shared/display.js', doc: 'docs/DISPLAY.md' },
  tuning: { label: 'TUNING (simulation, input, physics)', roots: ['TUNING'], restart: 'reload', file: 'src/shared/tuning.js', doc: 'docs/TUNING.md' },
});

export function unitsOf(domain, path) {
  if (domain === 'display') return DISPLAY_UNITS[path] ?? null;
  return TUNING_UNITS.find(([pattern]) => pattern.test(path))?.[1] ?? null;
}

const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Files whose source never counts as a consumer: the definitions themselves, this module and the development panel. */
const NOT_CONSUMERS = [/(?:^|\/)src\/shared\/(?:tuning|display|config-meta)\.js$/, /(?:^|\/)src\/devtools\//];

/** Aliases a file declares for configuration groups: Map(alias -> dotted prefix). */
function aliasesIn(source, roots) {
  const rootPattern = `(?:${roots.map(escape).join('|')})`;
  const aliases = new Map();
  for (const m of source.matchAll(new RegExp(`(?:const|let|var)\\s+(\\w+)\\s*=\\s*${rootPattern}((?:\\.\\w+)+)\\s*;`, 'g'))) aliases.set(m[1], m[2].slice(1));
  for (const m of source.matchAll(new RegExp(`(?:const|let|var)\\s*\\{([^}]*)\\}\\s*=\\s*${rootPattern}\\s*;`, 'g'))) {
    for (const item of m[1].split(',').map(s => s.trim()).filter(Boolean)) {
      const [key, alias] = item.split(':').map(s => s.trim());
      aliases.set(alias ?? key, key);
    }
  }
  // Aliases of aliases (const S = SURF.turf), a few levels deep.
  for (let pass = 0; pass < 3; pass++) {
    for (const m of source.matchAll(/(?:const|let|var)\s+(\w+)\s*=\s*(\w+)((?:\.\w+)+)\s*;/g)) if (aliases.has(m[2]) && !aliases.has(m[1])) aliases.set(m[1], `${aliases.get(m[2])}${m[3]}`);
  }
  return aliases;
}

/**
 * Files in `sources` that read the setting `path` (for example "aim.fullPullPx").
 * @param {string} path dotted setting path
 * @param {Record<string, string>} sources file name -> source text
 * @param {string[]} roots names the configuration object is imported under (["TUNING"] or ["DISPLAY", "display"])
 * @returns {string[]} sorted file names
 */
export function findConsumers(path, sources, roots) {
  const rootPattern = `(?:${roots.map(escape).join('|')})`;
  const parts = path.split('.');
  const found = [];
  for (const [file, source] of Object.entries(sources)) {
    if (NOT_CONSUMERS.some(p => p.test(file))) continue;
    // Alias assignments (`const AIM = TUNING.aim;`) declare a name, not a use; they are handled below.
    const stripped = source.replace(new RegExp(`(?:const|let|var)\\s+\\w+\\s*=\\s*${rootPattern}(?:\\.\\w+)+\\s*;`, 'g'), '');
    let hit = new RegExp(`\\b${rootPattern}\\.${escape(path)}(?![\\w])`).test(source);
    // A whole group used at once, for example `{ ...TUNING.surfaceDragMultiplier }`.
    for (let n = 1; !hit && n < parts.length; n++) hit = new RegExp(`\\b${rootPattern}\\.${escape(parts.slice(0, n).join('.'))}(?![.\\w])`).test(stripped);
    if (!hit) {
      for (const [alias, prefix] of aliasesIn(source, roots)) {
        if (path === prefix) { if ((source.match(new RegExp(`\\b${escape(alias)}\\b`, 'g')) ?? []).length >= 2) { hit = true; break; } }
        else if (path.startsWith(`${prefix}.`) && new RegExp(`\\b${escape(alias)}\\.${escape(path.slice(prefix.length + 1))}(?![\\w])`).test(source)) { hit = true; break; }
      }
    }
    if (hit) found.push(file);
  }
  return found.sort();
}

/**
 * One row per setting.
 * @param {{domain: 'display'|'tuning', fields: ReadonlyArray<[string, number, number, string]>, defaults: object, current?: object, sources: Record<string, string>}} options
 */
export function buildReport({ domain, fields, defaults, current = defaults, sources }) {
  const meta = CONFIG_DOMAINS[domain];
  const read = (obj, path) => path.split('.').reduce((o, k) => o?.[k], obj);
  return fields.map(([path, min, max, description]) => ({
    path, description, min, max, default: read(defaults, path), value: read(current, path), units: unitsOf(domain, path), restart: meta.restart,
    consumers: findConsumers(path, sources, meta.roots),
  }));
}

/** Settings whose value differs from the shipped default. */
export const differences = rows => rows.filter(r => r.value !== r.default);
