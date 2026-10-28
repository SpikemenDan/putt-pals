// DIAGNOSTIC ONLY (never merged): four contexts join one room, logging ICE and PeerJS events per page.
const { test, expect } = require('@playwright/test');
const { openApp } = require('./support/app.cjs');
const NAMES = ['Ana', 'Ben', 'Cy', 'Dee'];
function rtcProbe() {
  const t0 = performance.now(), log = (...a) => console.log('[diag ' + Math.round(performance.now() - t0) + 'ms]', ...a);
  const Native = window.RTCPeerConnection; let n = 0;
  window.RTCPeerConnection = function (...args) {
    const pc = new Native(...args), id = ++n;
    log('pc' + id, 'new', JSON.stringify(args[0] || {}));
    pc.addEventListener('icecandidate', e => log('pc' + id, 'local', e.candidate ? e.candidate.candidate : '(end)'));
    pc.addEventListener('icegatheringstatechange', () => log('pc' + id, 'gathering', pc.iceGatheringState));
    pc.addEventListener('iceconnectionstatechange', async () => {
      log('pc' + id, 'ice', pc.iceConnectionState);
      if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'connected') {
        const stats = await pc.getStats(); const rows = [];
        stats.forEach(s => { if (s.type === 'candidate-pair') rows.push(`pair ${s.state} nom=${s.nominated} req=${s.requestsSent}/${s.requestsReceived} resp=${s.responsesSent}/${s.responsesReceived} ${s.localCandidateId}->${s.remoteCandidateId}`);
          if (s.type === 'local-candidate' || s.type === 'remote-candidate') rows.push(`${s.type} ${s.id} ${s.candidateType} ${s.address}:${s.port} ${s.protocol}`); });
        log('pc' + id, 'stats\n  ' + rows.join('\n  '));
      }
    });
    pc.addEventListener('connectionstatechange', () => log('pc' + id, 'conn', pc.connectionState));
    const watch = (dc, how) => {
      log('pc' + id, 'dc', how, dc.label, 'state', dc.readyState, 'ordered', dc.ordered, 'id', dc.id);
      let rx = 0, tx = 0; const dec = new TextDecoder();
      const peek = d => { try { return (typeof d === 'string' ? d : dec.decode(d)).slice(0, 90); } catch { return '?'; } };
      for (const ev of ['open', 'close', 'closing', 'error']) dc.addEventListener(ev, e => log('pc' + id, 'dc', ev, e?.error?.message || '', 'sctp', pc.sctp?.state, 'buffered', dc.bufferedAmount));
      dc.addEventListener('message', e => { if (++rx <= 4) log('pc' + id, 'dc rx', rx, peek(e.data)); });
      const send = dc.send.bind(dc);
      dc.send = d => { if (++tx <= 4) log('pc' + id, 'dc tx', tx, dc.readyState, peek(d)); return send(d); };
    };
    const create = pc.createDataChannel.bind(pc);
    pc.createDataChannel = (...a) => { const dc = create(...a); watch(dc, 'created'); return dc; };
    pc.addEventListener('datachannel', e => watch(e.channel, 'received'));
    const add = pc.addIceCandidate.bind(pc);
    pc.addIceCandidate = c => { log('pc' + id, 'remote', c?.candidate); return add(c).catch(e => { log('pc' + id, 'addIceCandidate failed', e.message); throw e; }); };
    return pc;
  };
  window.RTCPeerConnection.prototype = Native.prototype;
}
test('join repro', async ({ browser }, testInfo) => {
  const code = 'T1' + Date.now().toString(36).slice(-5).toUpperCase();
  const contexts = await Promise.all(NAMES.map(() => browser.newContext({ baseURL: testInfo.project.use.baseURL, viewport: { width: 800, height: 600 } })));
  const players = [];
  try {
    for (const [i, name] of NAMES.entries()) {
      const page = await contexts[i].newPage();
      await page.addInitScript(rtcProbe);
      const p = await openApp(page, name);
      players.push(p);
      const t0 = Date.now();
      try { await p.join(code); } finally { console.log(name, 'join ms', Date.now() - t0, JSON.stringify(await p.banners())); }
    }
    await expect(players[0].ui('room-lobby').locator('p').first()).toHaveText(`Room ${code} · 4 players · You are the host`, { timeout: 30_000 });
    if (testInfo.repeatEachIndex === 0) for (const p of players) console.log('===== (pass) ' + p.name + ' console\n' + p.log.join('\n'));
  } catch (e) {
    for (const p of players) console.log('===== ' + p.name + ' console\n' + p.log.join('\n'));
    throw e;
  } finally { await Promise.all(contexts.map(c => c.close())); }
});
