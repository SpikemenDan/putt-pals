import { useEffect, useMemo, useRef, useState } from 'react';
import { GAIA_REGIONS, REGION_COURSES } from '../shared/gaia-map.js';
import { useUiContext } from './context.js';
import styles from './WorldSelect.module.css';

/** Room a course pin and its label need on screen, in CSS px, so none cover another. */
const PIN_W = 176, PIN_H = 62;

/** Screen spots for pins, pushed apart and kept on screen. Each starts where its site is. */
export function spreadPins(sites, width, height) {
  const spots = sites.map(s => ({ x: s.x, y: s.y }));
  for (let pass = 0; pass < 80; pass++) {
    for (let i = 0; i < spots.length; i++) for (let j = i + 1; j < spots.length; j++) {
      const a = spots[i], b = spots[j], ox = PIN_W - Math.abs(a.x - b.x), oy = PIN_H - Math.abs(a.y - b.y);
      if (ox <= 0 || oy <= 0) continue;
      if (oy < ox) { const push = oy / 2 * (a.y <= b.y ? -1 : 1); a.y += push; b.y -= push; } else { const push = ox / 2 * (a.x <= b.x ? -1 : 1); a.x += push; b.x -= push; }
    }
    for (const s of spots) { s.x = Math.min(width - PIN_W / 2 - 8, Math.max(PIN_W / 2 + 8, s.x)); s.y = Math.min(height - PIN_H - 8, Math.max(96, s.y)); }
  }
  return spots;
}

/**
 * The level select: Gaia unfolded as a 3D atlas (src/render/atlas-scene.js). World view shows the regions; opening one flies the camera in and
 * reveals its courses; Back to world flies out and returns focus to that region. A course calls `onPick(mapIndex)`, the same vote or
 * selection as the plain list. Only courses in `cards` appear. Renders nothing and calls `onUnavailable` if WebGL is missing.
 */
export function WorldSelect({ cards, onPick, onUnavailable, children }) {
  const { createAtlasScene } = useUiContext();
  const canvasRef = useRef(null), sceneRef = useRef(null), regionRefs = useRef({}), courseRefs = useRef({}), lineRefs = useRef({}), backRef = useRef(null), spotsRef = useRef({}), openRef = useRef(null), comeBack = useRef(null);
  const [open, setOpen] = useState(null), [settled, setSettled] = useState(false), [hover, setHover] = useState(null), [ready, setReady] = useState(false);
  openRef.current = open;
  const pinsOf = useMemo(() => Object.fromEntries(GAIA_REGIONS.map(r => [r.id, (REGION_COURSES[r.id] ?? []).map((index, k) => ({ index, site: r.maps[k], card: cards.find(c => c.index === index) })).filter(p => p.card)])), [cards]);

  const pinsRef = useRef(pinsOf);
  pinsRef.current = pinsOf; // votes change the cards every second: the scene must not be rebuilt for that

  useEffect(() => {
    const canvas = canvasRef.current, win = canvas.ownerDocument.defaultView;
    const reducedMotion = !!win.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let scene = null, retry = null, tries = 0;
    const follow = () => { // overlays ride the camera; React stays out of the frame loop
      for (const r of GAIA_REGIONS) {
        const el = regionRefs.current[r.id];
        if (el) { const p = scene.project(r.u, r.lat, 3); el.style.transform = `translate(${p.x}px,${p.y}px) translate(-50%,-50%)`; }
      }
      const id = openRef.current;
      if (!id) return;
      const spots = spotsRef.current[id] ?? [];
      (pinsRef.current[id] ?? []).forEach((pin, k) => {
        const el = courseRefs.current[pin.index], spot = spots[k], line = lineRefs.current[pin.index];
        if (!el || !spot) return;
        el.style.transform = `translate(${spot.x}px,${spot.y}px) translate(-50%,-14px)`;
        const at = scene.project(pin.site.u, pin.site.lat);
        if (line) { line.setAttribute('x1', spot.x); line.setAttribute('y1', spot.y); line.setAttribute('x2', at.x); line.setAttribute('y2', at.y); }
      });
    };
    const build = () => {
      try { scene = createAtlasScene?.({ canvas, random: Math.random, reducedMotion, win }); } catch { scene = null; }
      if (!scene) { // the menu planet may still be letting go of the graphics card: try again briefly where WebGL exists
        if (win.WebGL2RenderingContext && ++tries < 5) retry = setTimeout(build, 400); else onUnavailable?.();
        return;
      }
      sceneRef.current = scene;
      if (win.__PP_APP_HOOK) win.__ppAtlas = scene; // browser checks only
      scene.onFrame(follow);
      scene.start();
      setReady(true);
    };
    build();
    return () => { clearTimeout(retry); sceneRef.current = null; scene?.dispose(); };
  }, [createAtlasScene, onUnavailable]);

  const light = id => { setHover(id); sceneRef.current?.highlight(id); };
  const openRegion = async id => {
    const scene = sceneRef.current;
    if (!scene || !pinsOf[id]?.length) return;
    comeBack.current = id;
    light(null);
    setSettled(false); setOpen(id);
    await scene.openRegion(id);
    if (openRef.current !== id) return;
    const { width, height } = scene.size;
    spotsRef.current[id] = spreadPins(pinsOf[id].map(p => scene.project(p.site.u, p.site.lat)), width, height);
    scene.step(0);
    setSettled(true);
    scene.highlight(id);
  };
  useEffect(() => { // focus lands on the first course as they appear
    if (settled && open) setTimeout(() => { courseRefs.current[pinsOf[open]?.[0]?.index]?.focus(); sceneRef.current?.step(0); }, 0);
  }, [settled, open, pinsOf]);
  const back = async () => {
    const scene = sceneRef.current, from = comeBack.current;
    setOpen(null); setSettled(false);
    scene?.highlight(null);
    await scene?.openWorld();
    regionRefs.current[from]?.focus();
  };
  const canvasHover = e => { if (e.pointerType === 'touch' || open) return; const id = sceneRef.current?.hit(e.nativeEvent.offsetX, e.nativeEvent.offsetY); const usable = id && pinsOf[id]?.length ? id : null; if (usable !== hover) light(usable); };
  const canvasClick = e => { if (open) return; const id = sceneRef.current?.hit(e.nativeEvent.offsetX, e.nativeEvent.offsetY); if (id) openRegion(id); };

  return (
    <div className={styles.stage} data-ui="world-select" data-view={open ?? 'world'} data-settled={settled || undefined}>
      <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" data-ui="atlas-canvas" onPointerMove={canvasHover} onPointerLeave={() => !open && light(null)} onClick={canvasClick} style={{ cursor: hover ? 'pointer' : 'default' }} />
      <div className={styles.layer} hidden={!ready}>
        {!open && GAIA_REGIONS.map(r => {
          const count = pinsOf[r.id].length; // a mode may offer only some courses; the region still reads on the map
          return (
            <button key={r.id} type="button" disabled={!count} ref={el => { regionRefs.current[r.id] = el; }} className={`${styles.region}${hover === r.id ? ' ' + styles.lit : ''}`} data-region={r.id}
              onPointerEnter={e => count && e.pointerType !== 'touch' && light(r.id)} onPointerLeave={e => e.pointerType !== 'touch' && light(null)} onFocus={() => light(r.id)} onBlur={() => light(null)} onClick={() => openRegion(r.id)}>
              {r.name}
            </button>
          );
        })}
        {open && settled && <svg className={styles.lines} aria-hidden="true">{pinsOf[open].map(p => <line key={p.index} ref={el => { lineRefs.current[p.index] = el; }} />)}</svg>}
        {open && settled && pinsOf[open].map((p, k) => (
          <button key={p.index} type="button" ref={el => { courseRefs.current[p.index] = el; }} className={`${styles.course}${p.card.selected ? ' ' + styles.picked : ''}`} style={{ animationDelay: k * 70 + 'ms' }}
            data-v={p.card.votes} data-map={p.index} aria-pressed={p.card.selected} onClick={() => onPick(p.index)}>
            <i aria-hidden="true">{k + 1}</i><b>{p.card.name}</b><small>{'Par ' + p.card.par}{p.card.votes ? ' · ' + p.card.votes + ' vote' + (p.card.votes > 1 ? 's' : '') : ''}</small>
          </button>
        ))}
        {open && <button type="button" ref={backRef} className={styles.back} data-ui="back-to-world" onClick={back}>Back to world</button>}
      </div>
      {children}
    </div>
  );
}
