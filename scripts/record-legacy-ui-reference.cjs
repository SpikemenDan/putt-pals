// One-off recorder for the UI parity test: replays one tournament state in the legacy game and records its HUD line,
// scoreboard, scorecard and results strings. Output: tests/fixtures/legacy-reference/ui.json.
const fs = require('node:fs');
const path = require('node:path');
const { bootLegacy } = require('../tests/support/legacy-dom.cjs');

(async () => {
  const legacy = await bootLegacy();
  const { P } = legacy;
  await legacy.play(8, 2, 'tournament');
  const R = P().R, active = P().active, me = P().me;
  const meColor = me.c;
  R.setRoom({ series: 3, mapNo: 1, roster: [R.id(), 'b', 'c'], card: {
    solo: { n: 'Ana', s: [2, 4], o: [0, 0] }, b: { n: 'Ben', s: [1, 8], o: [0, 1] }, c: { n: 'Cy', s: [3, 3], o: [0, 0] } } });
  const presence = {
    b: { n: 'Ben', c: 1, h: 8, round: active, done: true, s: [2], str: 2, tot: 9, over: false, mode: 'sunk' },
    c: { n: 'Cy', c: 4, h: 8, round: active, done: false, s: [], str: 5, tot: 6, over: false, mode: 'play' },
    d: { n: 'Dee', c: 6, h: 8, round: active, done: false, s: [], str: 0, tot: 0, over: false, mode: 'spectator' },
  };
  const own = R.peers;
  R.peers = () => [...own(), ...Object.entries(presence).map(([peer, p]) => ({ peer, isMe: false, presence: p }))];
  me.str = 1; me.tot = 6; P().pub(true);
  await legacy.until(() => /STROKES 1/.test(legacy.$('info').textContent) && legacy.$('sb').children.length === 5);
  const hud = legacy.$('info').textContent;
  const scoreboard = [...legacy.$('sb').children].map(r => [...r.children].map(c => c.textContent));
  const dots = [...legacy.$('sb').children].slice(1).map(r => r.querySelector('i').style.background);
  const cardEl = legacy.w.document.createElement('div');
  P().renderCard(cardEl);
  const card = [...cardEl.querySelectorAll('tr')].map(tr => [...tr.children].map(td => [td.textContent, td.className]));
  const title = cardEl.querySelector('.ptitle').textContent;
  const leaders = [...cardEl.querySelectorAll('tbody tr')].map(tr => tr.className === 'lead');

  me.s = [2]; me.mode = 'sunk'; P().pub(true);
  presence.c = { ...presence.c, done: true, s: [4], mode: 'sunk' };
  const r = R.room();
  R.setRoom({ putt: 5, card: { solo: { n: 'Ana', s: [2, 4, 1, 2, 3], o: [0, 0, 0, 0, 0] }, b: { n: 'Ben', s: [1, 8, 2, 2, 2], o: [0, 1, 0, 0, 0] }, c: { n: 'Cy', s: [3, 3, 5, 2, 3], o: [0, 0, 0, 0, 0] } },
    totals: { solo: { n: 'Ana', t: 10, w: 1 }, b: { n: 'Ben', t: 13, w: 0 }, c: { n: 'Cy', t: 12, w: 0 } }, round: r.round });
  me.tot = 12; presence.b.tot = 15; presence.c.tot = 16;
  R.setRoom({ phase: 'results', mapNo: 2, totals: { solo: { n: 'Ana', t: 24, w: 2 }, b: { n: 'Ben', t: 30, w: 0 }, c: { n: 'Cy', t: 32, w: 0 } },
    last: { map: 8, sc: { solo: 14, b: 17, c: 20 }, names: { solo: 'Ana', b: 'Ben', c: 'Cy' }, win: ['solo'] } });
  await legacy.until(() => !legacy.$('end').hidden && legacy.$('endt').textContent.includes('Ana'));
  const out = { schemaVersion: 1, evidence: 'recorded from the legacy single-file game before its retirement',
    state: 'Dune Serpent putt 3, map 2 of a 3-map tournament; Ben done with a hole in one and a timeout, Cy tied, Dee spectating',
    meColor, hud, scoreboard, dots, card, title, leaders, resultsText: legacy.$('endt').textContent, againLabel: legacy.$('again').textContent, errors: legacy.errors };
  fs.writeFileSync(path.join(__dirname, '../tests/fixtures/legacy-reference/ui.json'), JSON.stringify(out, null, 1) + '\n');
  console.log(JSON.stringify({ meColor, hud, againLabel: out.againLabel, errors: out.errors, rows: scoreboard.length, cardRows: card.length }));
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
