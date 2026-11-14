/**
 * Small original comic icons for the main menu and the Solo steps (owner, 2026-11-14): flat shapes with an ink outline, drawn
 * in a 32-unit box. Decorative only (aria-hidden); every button keeps its own text label.
 */
const INK = 'var(--ink)';
const line = { fill: 'none', stroke: INK, strokeWidth: 2.6, strokeLinecap: 'round', strokeLinejoin: 'round' };

const PATHS = {
  /** Casual: a hole flag in the turf. */
  flag: <>
    <ellipse cx="16" cy="27" rx="10" ry="3" fill="#2fbf5b" stroke={INK} strokeWidth="2.2" />
    <path d="M12 27V5" {...line} />
    <path d="M12 5l13 4.5L12 14z" fill="#ff3d8b" stroke={INK} strokeWidth="2.4" strokeLinejoin="round" />
  </>,
  /** Tournament: a cup trophy. */
  trophy: <>
    <path d="M9 5h14v6a7 7 0 0 1-14 0z" fill="#ffd23f" stroke={INK} strokeWidth="2.4" strokeLinejoin="round" />
    <path d="M9 8H5.5a3.5 3.5 0 0 0 4 4.5M23 8h3.5a3.5 3.5 0 0 1-4 4.5" {...line} />
    <path d="M16 18v4" {...line} />
    <path d="M10.5 27.5h11l-1.5-5h-8z" fill="#ffd23f" stroke={INK} strokeWidth="2.4" strokeLinejoin="round" />
  </>,
  /** Practice: a target with a ball on the bullseye. */
  target: <>
    <circle cx="16" cy="16" r="12" fill="#fff" stroke={INK} strokeWidth="2.4" />
    <circle cx="16" cy="16" r="7.5" fill="#ff3d8b" stroke={INK} strokeWidth="2.2" />
    <circle cx="16" cy="16" r="3" fill="#fff" stroke={INK} strokeWidth="2" />
  </>,
  /** Whole map: a folded map with a dotted route to a flag. */
  map: <>
    <path d="M4 8l7-3 10 3 7-3v19l-7 3-10-3-7 3z" fill="#fff8e4" stroke={INK} strokeWidth="2.4" strokeLinejoin="round" />
    <path d="M11 5v19M21 8v19" fill="none" stroke={INK} strokeWidth="1.6" opacity=".45" />
    <path d="M7 21c3-1 5-6 9-5s4-5 8-6" fill="none" stroke="#ff3d8b" strokeWidth="2.2" strokeDasharray="2.4 2.6" strokeLinecap="round" />
  </>,
  /** One putt: a golf ball rolling toward a cup. */
  putt: <>
    <ellipse cx="22" cy="25" rx="7" ry="3" fill={INK} />
    <circle cx="11" cy="16" r="7" fill="#fff" stroke={INK} strokeWidth="2.4" />
    <circle cx="9.5" cy="14.5" r="1" fill={INK} opacity=".35" /><circle cx="13" cy="15" r="1" fill={INK} opacity=".35" /><circle cx="11" cy="18.5" r="1" fill={INK} opacity=".35" />
    <path d="M3 25h7" {...line} strokeWidth="2" opacity=".6" />
  </>,
  /** Putt Pong: three cups with a ball dropping in. */
  pong: <>
    <path d="M4 15h8l-1.4 12h-5.2zM12 15h8l-1.4 12h-5.2zM20 15h8l-1.4 12h-5.2z" fill="#d7261e" stroke={INK} strokeWidth="2.2" strokeLinejoin="round" />
    <path d="M4 15h24" {...line} strokeWidth="2.2" />
    <circle cx="16" cy="7" r="4" fill="#fff" stroke={INK} strokeWidth="2.2" />
  </>,
  /** Solo (main menu): a ball on a tee in front of a flag. */
  solo: <>
    <path d="M22 28V4" {...line} />
    <path d="M22 4l8 3-8 3.2z" fill="#ffd23f" stroke={INK} strokeWidth="2.2" strokeLinejoin="round" />
    <path d="M10 24l1.5 5h1l1.5-5z" fill="#fff8e4" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
    <circle cx="12" cy="17" r="7" fill="#fff" stroke={INK} strokeWidth="2.4" />
    <circle cx="10" cy="15" r="1.1" fill={INK} opacity=".35" /><circle cx="14" cy="15.5" r="1.1" fill={INK} opacity=".35" /><circle cx="12" cy="19" r="1.1" fill={INK} opacity=".35" />
  </>,
};

/** One icon by name (see PATHS). */
export function MenuIcon({ name, className }) {
  return <svg className={className} viewBox="0 0 32 32" aria-hidden="true" focusable="false" data-icon={name}>{PATHS[name]}</svg>;
}
