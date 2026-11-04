/**
 * Development-only helper for trying Bumper and Orbital Bumper by hand (G1e). Solo rooms never drop course items, so
 * these buttons put one in the local inventory of the current putt, then the normal flow applies: press its number key,
 * click the course to place it, right-click or Esc to cancel. Nothing here changes a setting or a rule; the deployables
 * tuning values appear read-only in the tuning panel. Plain DOM, text only.
 */
export function mountDeployablesPreview(doc, app, kinds = ['bumper', 'orbital']) {
  const box = doc.createElement('div');
  box.dataset.ui = 'deployables-preview';
  box.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:2147483000;font:12px system-ui,sans-serif;background:#1b1b1f;color:#fff;border-radius:8px;padding:6px 10px;display:flex;gap:6px;align-items:center';
  const label = doc.createElement('span'); label.textContent = 'Deployables preview:';
  const status = doc.createElement('span'); status.setAttribute('role', 'status');
  box.append(label);
  for (const kind of kinds) {
    const b = doc.createElement('button'); b.type = 'button'; b.textContent = 'Give ' + kind;
    b.addEventListener('click', () => { status.textContent = app.grantItem(kind) ? 'Added. Press its slot key, then click the course.' : 'No free slot, or not in a putt.'; });
    box.append(b);
  }
  box.append(status);
  doc.body.append(box);
  return () => box.remove();
}
