import { useEffect, useRef, useState } from 'react';
import { BALL_SKINS, CELEBRATIONS, TRAIL_SKINS } from '../cosmetics/catalog.js';
import { UiCommands } from './commands.js';
import { useCommands, useUiContext, useView } from './context.js';
import { ColorPicker } from './ColorPicker.jsx';
import { SoloSteps } from './SoloSteps.jsx';
import { CustomRules } from './CustomRules.jsx';
import { changedRules, rulesFromPartial } from '../shared/rules.js';
import app from './App.module.css';
import menu from './Landing.module.css';

const COSMETIC_FIELDS = [['ball', 'Ball', BALL_SKINS], ['trail', 'Trail', TRAIL_SKINS], ['celebration', 'Celebration', CELEBRATIONS]];

/** Build label: `vite.config.mjs` defines __APP_VERSION__ (package version plus commit); tests and other loaders show "dev". */
export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev'; // eslint-disable-line no-undef

/** Local storage key for the Custom rules editor's draft (a per-player convenience; rooms never read it). */
export const CUSTOM_RULES_KEY = 'puttplanet.customRules';
const readDraft = () => { try { return rulesFromPartial(JSON.parse(globalThis.window?.localStorage?.getItem(CUSTOM_RULES_KEY) || 'null')); } catch { return rulesFromPartial(null); } };
const writeDraft = rules => { try { globalThis.window?.localStorage?.setItem(CUSTOM_RULES_KEY, JSON.stringify(rules)); } catch { /* not remembered */ } };

/** Main menu views (VIS-M2 #174). Solo and Party hold today's flows until VIS-M4 #176 and VIS-M3 #175 replace them. */
export const MENU_VIEWS = Object.freeze(['home', 'solo', 'party', 'custom', 'settings']);

/**
 * Copies `display.menu` onto the menu as CSS variables. The shipped DISPLAY is frozen, so that is done once; the
 * development tuner's live object is not, so it is re-read every frame while the menu shows (presentation only).
 */
function useMenuLook(ref, display, hidden) {
  useEffect(() => {
    const el = ref.current;
    if (!el || hidden) return undefined;
    const apply = () => {
      const m = display.menu;
      el.style.setProperty('--menu-scale', String(m.buttonScale));
      el.style.setProperty('--menu-stagger', m.stagger + 's');
      el.style.setProperty('--menu-bob', m.bob + 'px');
      el.style.setProperty('--menu-tilt', m.tilt + 'deg');
    };
    apply();
    const raf = el.ownerDocument.defaultView?.requestAnimationFrame;
    if (Object.isFrozen(display.menu) || !raf) return undefined;
    let id = 0;
    const tick = () => { apply(); id = raf(tick); };
    id = raf(tick);
    return () => el.ownerDocument.defaultView.cancelAnimationFrame(id);
  }, [ref, display, hidden]);
}

/**
 * Main menu over the planet (VIS-M2 #174): Solo, Party and Custom, a smaller Settings button, and the version
 * bottom-left. The title sits where the loading screen's does. A `#room=` link opens straight onto Party.
 */
export function Landing({ hidden, initialName = '', initialRoomCode = '', initialView = 'home' }) {
  const { send } = useCommands();
  const { display } = useUiContext();
  const { connecting, error, cosmetics, color } = useView(v => v.landing);
  const [name, setName] = useState(initialName);
  const [roomCode, setRoomCode] = useState(initialRoomCode);
  const [view, setView] = useState(MENU_VIEWS.includes(initialView) ? initialView : 'home');
  const [rules, setRules] = useState(readDraft); // Custom editor draft (VIS-U #168)
  const [hostRules, setHostRules] = useState(null); // rules a Party opened from Custom creates its room with; null = standard
  const editRules = next => { setRules(next); writeDraft(next); };
  const root = useRef(null);
  const homeButtons = useRef({});
  useMenuLook(root, display, hidden);
  const wasShown = useRef(!hidden);
  useEffect(() => { // once a room opens (the menu goes from shown to hidden), coming back starts from the main buttons
    if (hidden && wasShown.current) setView('home');
    wasShown.current = !hidden;
  }, [hidden]);

  const open = next => { if (next === 'party') setHostRules(null); setView(next); };
  const back = () => {
    const from = view;
    setView('home');
    setTimeout(() => homeButtons.current[from]?.focus(), 0);
  };
  useEffect(() => { // focus the first control of a sub-menu when it opens
    if (view !== 'home') root.current?.querySelector('[data-menu-view] input, [data-menu-view] button')?.focus();
  }, [view]);

  const nameField = <label>Your name<input maxLength={14} autoComplete="off" value={name} onChange={e => setName(e.target.value)} /></label>;
  const colorField = <div className={menu.field}>Ball colour<ColorPicker selected={color} onPick={c => send(UiCommands.SET_COLOR, { color: c })} /></div>;
  const backButton = <button type="button" className={menu.back} onClick={back} data-ui="menu-back">Back</button>;
  const homeButton = (id, label, sub, cls) => (
    <button type="button" ref={el => { homeButtons.current[id] = el; }} className={menu.big + ' ' + cls} disabled={connecting} onClick={() => open(id)} data-menu={id} aria-label={label}>
      <span className={menu.label}>{label}</span><span className={menu.sub} aria-hidden="true">{sub}</span>
    </button>
  );

  return (
    <div ref={root} className={menu.menu} hidden={hidden} data-ui="landing" data-view={view} data-connecting={connecting || undefined}>
      <h1 className={menu.brand}>Putt Planet</h1>
      {view === 'home' ? (
        <nav className={menu.stack} aria-label="Main menu">
          {homeButton('solo', 'Solo', 'Practice and play alone', menu.solo)}
          {homeButton('party', 'Party', 'Play with friends', menu.party)}
          {homeButton('custom', 'Custom', 'Make your own rules', menu.custom)}
          <button type="button" ref={el => { homeButtons.current.settings = el; }} className={menu.settings} onClick={() => open('settings')} data-menu="settings">Settings</button>
        </nav>
      ) : (
        <section className={menu.panel} data-menu-view={view} aria-label={view[0].toUpperCase() + view.slice(1)} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); back(); } }}>
          {view === 'solo' && <SoloSteps name={name} onName={setName} colorField={colorField} connecting={connecting} send={send} onExit={back} overlay={root.current} />}
          {view === 'party' && <>
            <h2 className={menu.heading}>Party</h2>
            {nameField}
            {/* VIS-M3 #175: Host creates the party and only then gets its code; opening this menu makes no room and no code. */}
            <div className={menu.partyPart} data-ui="party-host">
              <p className={menu.question}>Host</p>
              <button type="button" className={menu.go} disabled={connecting} onClick={() => send(UiCommands.CREATE_PARTY, { name, rules: hostRules })}>Create party</button>
              {hostRules && <p className={app.small} data-ui="party-custom-rules">Your party uses your Custom rules ({changedRules(hostRules).length} changed); everyone who joins plays them. <button type="button" className={menu.inline} onClick={() => setHostRules(null)}>Use standard</button></p>}
            </div>
            <form className={menu.partyPart} data-ui="party-join" onSubmit={e => { e.preventDefault(); if (!connecting && roomCode.trim()) send(UiCommands.JOIN, { name, roomCode }); }}>
              <p className={menu.question}>Join</p>
              <div className={menu.joinRow}>
                <label className={menu.joinCode}>Party code<input maxLength={12} autoComplete="off" spellCheck={false} placeholder="Code from your host" value={roomCode} onChange={e => setRoomCode(e.target.value)} /></label>
                <button type="submit" className={menu.joinGo} disabled={connecting || !roomCode.trim()}>Join</button>
              </div>
            </form>
          </>}
          {view === 'custom' && <>
            <h2 className={menu.heading}>Custom</h2>
            <CustomRules rules={rules} onChange={editRules} busy={connecting}
              onPlaySolo={() => send(UiCommands.PLAY_SOLO, { name, rules })}
              onHostParty={() => { setHostRules(rules); setView('party'); }} />
          </>}
          {view === 'settings' && <>
            <h2 className={menu.heading}>Settings</h2>
            <details data-ui="cosmetics" open><summary>Your style</summary>
              <div className={menu.style}>
                {COSMETIC_FIELDS.map(([kind, label, records]) => (
                  <label key={kind}>{label}
                    <select value={cosmetics[kind]} onChange={e => send(UiCommands.SET_COSMETIC, { kind, id: e.target.value })}>
                      {records.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  </label>
                ))}
              </div>
            </details>
            <details><summary>How to play</summary>
              <p>3D party mini golf. Everyone plays the same hole at once, and the next hole starts when all players finish. Ride ramps, jump pads and teleporters, dodge fans and water, and mess with your friends.</p>
              <p className={app.small}>Drag backward anywhere on the course, then release to putt. Longer pulls add power and widen a sine sway; release as the arrow crosses center for a perfectly straight shot. Escape cancels. Keys 1–3 use power-ups. Right-drag rotates the ball camera.</p>
            </details>
          </>}
          <p className={app.status} role="status" data-ui="connect-error" hidden={!error}>{error}</p>
          {view !== 'solo' && backButton}
        </section>
      )}
      {view === 'home' && <p className={app.status} role="status" data-ui="connect-error" hidden={!error}>{error}</p>}
      <p className={menu.version} data-ui="version">v{APP_VERSION}</p>
    </div>
  );
}
