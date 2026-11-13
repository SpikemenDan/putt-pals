/**
 * Pure view models for every screen.
 *
 * Ported from the legacy syncRoom(), tick(), cardData(), showResults() and
 * fin() with the same wording, ordering and rounding, but reading the L1
 * session snapshot (src/session) instead of the legacy room/presence objects.
 * No React, DOM or timers here: inputs are plain data and `now` is the room
 * clock (the same time base as roundStartTime and votingDeadline).
 */

import { getPowerup, isOpponentPowerup, POWERUP_CATALOG, powerupName } from '../gameplay/catalog.js';
import { STARTER_COURSE_INDICES } from '../shared/constants.js';
import { CUSTOM_RULES, changedRules, ruleValueText, validRules } from '../shared/rules.js';
import { PLAYER_COLOR_COUNT, isColorIndex } from '../shared/colors.js';
import { GameModes, SessionPhases } from '../shared/session.js';
import { MODE_OPTIONS, VOTE_SECONDS } from './commands.js';

/** HUD names by power-up id, from the gameplay catalog. */
export const ITEM_NAMES = Object.freeze(Object.fromEntries(POWERUP_CATALOG.map(e => [e.id, e.name])));

const isTournament = mode => typeof mode === 'string' && mode.startsWith('tournament_');
/** Maps in the series: 3/5/7 for tournaments, otherwise 1. */
export const seriesOf = mode => (isTournament(mode) ? Number(mode.slice('tournament_'.length)) : 1);
const pad2 = n => String(n).padStart(2, '0');

/**
 * Display data for all maps, from createCourseData(): names, descriptions, map
 * par, resolved per-putt rules and preview geometry.
 */
export function createCourseInfo({ definitions, rules }) {
  return Object.freeze(definitions.map((d, index) => Object.freeze({
    index,
    name: d.name,
    desc: d.desc,
    par: d.par,
    starter: STARTER_COURSE_INDICES.includes(index),
    /** Legacy shows "PUTT k/n" and putt banners only for maps that define putts. */
    hasPutts: Array.isArray(d.putts),
    putts: Object.freeze(rules[index].putts.map(p => Object.freeze({ par: p.par, penalty: p.penalty, limitSeconds: p.limitSeconds }))),
    preview: Object.freeze({ tiles: d.tiles, pl: d.pl, rp: d.rp, w: d.w, pit: d.pit, tp: d.tp, tornado: d.tornado, tee: d.tee, hole: d.hole }),
  })));
}

const playersOf = room => Object.values(room?.players || {});
const connectedPlayers = room => playersOf(room).filter(p => p.connected);

/**
 * Player colour index: the colour the room assigned (`players[id].color`), else
 * `local.colors`, else join order (offline fixtures and old snapshots).
 */
export function colorOf(room, local, id) {
  if (local?.colors && Number.isInteger(local.colors[id])) return local.colors[id];
  const chosen = room?.players?.[id]?.color;
  if (isColorIndex(chosen)) return chosen;
  const order = Object.keys(room?.players || {});
  const at = order.indexOf(id);
  return at < 0 ? 0 : at % PLAYER_COLOR_COUNT;
}

/** Palette indexes other players hold or have reserved (connected, or on the roster), keyed by index to the holder's name. */
export function takenColors(room, local) {
  const taken = {};
  for (const [id, p] of Object.entries(room?.players || {})) {
    if (id === local?.id || !isColorIndex(p.color)) continue;
    if (p.connected || (room.roster || []).includes(id)) taken[p.color] = p.name;
  }
  return taken;
}

/** Describes the room controller, other members, or solo practice. */
export function roomLabel(room, local) {
  if (!local.roomCode) return 'Solo practice';
  const n = connectedPlayers(room).length;
  return 'Room ' + local.roomCode.toUpperCase() + ' · ' + n + ' player' + (n === 1 ? '' : 's') + ' · ' + (local.serverOwned ? (local.isHost ? 'You control the room' : 'Waiting for room controller') : (local.isHost ? 'You are the host' : 'Waiting for host'));
}

const inCountdown = (room, now) => room.phase === SessionPhases.PLAY && room.puttIndex === 0 && now < room.roundStartTime;

/** Which screens are shown (legacy `hidden` toggles). */
export function screensView(room, local, now) {
  const active = !!local.active && !!room;
  const play = active && room.phase === SessionPhases.PLAY;
  return {
    landing: !local.active,
    lobby: active && (room.phase === SessionPhases.LOBBY || inCountdown(room, now)),
    voting: active && room.phase === SessionPhases.SELECT,
    game: (play && !inCountdown(room, now)) || (active && room.phase === SessionPhases.RESULTS),
    results: active && room.phase === SessionPhases.RESULTS,
    netNotice: !!local.active && local.connected === false,
    reconnecting: !!local.active && !!local.reconnecting,
    connectionReason: local.connectionReason || '',
  };
}

/** Room lobby card, including the pre-start countdown. */
export function lobbyView(room, local, now, courses) {
  const players = connectedPlayers(room);
  const n = players.length;
  let status;
  const tie = inCountdown(room, now) && room.tie ? {
    options: room.tie.options.map(i => ({
      index: i,
      name: courses[i]?.name || 'Course ' + (i + 1),
      par: courses[i]?.par,
      preview: courses[i]?.preview,
    })),
    winner: room.tie.winner,
    winnerName: courses[room.tie.winner]?.name || 'Course ' + (room.tie.winner + 1),
  } : null;
  if (inCountdown(room, now)) {
    const course = courses[room.mapIndex];
    status = (tie ? 'Vote tied! Random pick: ' : '') + course.name + (course.putts.length > 1 ? ' · putt ' + ((room.puttIndex | 0) + 1) + '/' + course.putts.length : '') + ' starts in ' + Math.ceil((room.roundStartTime - now) / 1000) + '…';
  } else {
    status = local.isHost ? 'Pick a game mode, then start to open map voting.' : (local.serverOwned ? 'The room controller will pick the mode and start map voting.' : 'The host will pick the mode and start map voting.');
    if (room.powerups === false) status += ' Power-ups are off.';
    // The room's Custom rules (VIS-U), fixed when it was created; power-ups are already reported above.
    const custom = validRules(room.rules) ? changedRules(room.rules).filter(id => id !== 'powerups') : [];
    if (custom.length) status += ' Custom rules: ' + custom.map(id => CUSTOM_RULES.find(r => r.id === id).label + ' ' + ruleValueText(id, room.rules[id])).join(', ') + '.';
  }
  return {
    label: roomLabel(room, local),
    roster: players.map(p => ({ id: p.id, name: p.name + (p.id === local.id ? ' (you)' : ''), color: colorOf(room, local, p.id) })),
    myColor: colorOf(room, local, local.id),
    takenColors: takenColors(room, local),
    showModes: !!local.isHost,
    powerups: room.powerups !== false,
    showStart: !!local.isHost && room.phase === SessionPhases.LOBBY,
    showInvite: !!local.roomCode,
    modes: MODE_OPTIONS.map(o => ({ value: o.value, label: o.label, disabled: o.soloOnly && n > 1 })),
    multiplayer: n > 1,
    status,
    tie,
  };
}

/** Map voting / practice selection. */
export function votingView(room, local, now, courses) {
  const ids = connectedPlayers(room).map(p => p.id);
  const votes = Object.entries(room.votes || {}).filter(([id, map]) => ids.includes(id) && Number.isInteger(map) && STARTER_COURSE_INDICES.includes(map));
  const tally = {};
  for (const [, map] of votes) tally[map] = (tally[map] || 0) + 1;
  const left = room.votingDeadline ? Math.max(0, Math.ceil((room.votingDeadline - now) / 1000)) : VOTE_SECONDS;
  let status;
  if (room.mode === GameModes.PUTT_PRACTICE) status = 'Practice · pick a map, then the putt to replay. No scoring, no timer.';
  else if (room.mode === GameModes.PRACTICE) status = 'Practice · pick any map to start. No voting, no opponents.';
  else {
    status = (isTournament(room.mode) ? 'Map ' + ((room.completedMaps?.length | 0) + 1) + '/' + seriesOf(room.mode) + ' · ' : '')
      + (votes.length ? 'Voting ends in ' + left + 's · ' + votes.length + '/' + ids.length + ' voted' : 'Vote for a map. The first vote starts a ' + VOTE_SECONDS + 's countdown.');
  }
  const mine = (room.votes || {})[local.id];
  const pickable = room.mode === GameModes.PUTT_PRACTICE && Number.isInteger(mine) && STARTER_COURSE_INDICES.includes(mine);
  return {
    status,
    cards: STARTER_COURSE_INDICES.map((index, k) => {
      const c = courses[index];
      return { index, number: pad2(k + 1), name: c.name, desc: c.desc, par: c.par, votes: tally[index] || 0, selected: mine === index, preview: c.preview };
    }),
    puttPicker: pickable ? { mapIndex: mine, putts: courses[mine].putts.map((p, k) => ({ index: k, label: 'Putt ' + (k + 1) + ' · Par ' + p.par })) } : null,
  };
}

/**
 * Strokes counted so far on this map plus the live putt (legacy tot + (s[0] ?? str)).
 * Once the session records the current putt in `scores` (at results), it is not added again.
 */
function mapTotal(player, local, puttIndex) {
  const scores = player.scores || [];
  const prior = scores.reduce((sum, s) => sum + (s ? s.score : 0), 0);
  if (scores.length > puttIndex) return prior;
  const live = player.done ? player.score : (player.id === local.id ? local.strokes : player.strokes);
  return prior + (live || 0);
}

/** View model for Putt Pong rack tracker and turn status (GM2c, issue #187). */
export function pongHudView(room, local) {
  if (!room || (room.mode !== GameModes.PONG && !room.pong)) return null;
  const p = room.pong;
  if (p) {
    const isMyTurn = p.activePlayerId === local?.id;
    const activeShooterName = p.activePlayerId === p.homePlayer?.id
      ? p.homePlayer?.name
      : p.activePlayerId === p.awayPlayer?.id
      ? p.awayPlayer?.name
      : 'Shooter';

    return {
      phase: p.phase || 'turn',
      homePlayer: p.homePlayer,
      awayPlayer: p.awayPlayer,
      activePlayerId: p.activePlayerId,
      activeShooterName,
      isMyTurn,
      shotsRemaining: p.shotsRemaining ?? 0,
      remainingHomeCups: p.remainingHomeCups ?? p.homeCups?.filter(c => c.active !== false).length ?? 0,
      remainingAwayCups: p.remainingAwayCups ?? p.awayCups?.filter(c => c.active !== false).length ?? 0,
      homeCups: p.homeCups || [],
      awayCups: p.awayCups || [],
      turnSinks: p.turnSinks ?? 0,
      bonusAwarded: !!p.bonusAwarded,
      winner: p.winner || null,
      isGameOver: !!p.isGameOver,
    };
  }

  // Fallback when room.mode === GameModes.PONG
  const roster = room?.roster || [];
  const homeId = roster[0] || local?.id || 'player-1';
  const awayId = roster[1] || 'player-2';
  const homeName = room?.players?.[homeId]?.name || 'Home';
  const awayName = room?.players?.[awayId]?.name || 'Away';
  return {
    phase: 'turn',
    homePlayer: { id: homeId, name: homeName, team: 'home' },
    awayPlayer: { id: awayId, name: awayName, team: 'away' },
    activePlayerId: homeId,
    activeShooterName: homeName,
    isMyTurn: homeId === local?.id,
    shotsRemaining: 2,
    remainingHomeCups: 10,
    remainingAwayCups: 10,
    homeCups: Array.from({ length: 10 }, (_, i) => ({ id: `home-${i}`, rackIndex: i, active: true, team: 'home' })),
    awayCups: Array.from({ length: 10 }, (_, i) => ({ id: `away-${i}`, rackIndex: i, active: true, team: 'away' })),
    turnSinks: 0,
    bonusAwarded: false,
    winner: null,
    isGameOver: false,
  };
}

/** In-game HUD: info line, scoreboard, inventory and bar labels. */
export function hudView(room, local, now, courses) {
  const hazardTime = typeof room.now === 'function' ? room.now() : now;
  const course = courses[room.mapIndex];
  const putt = course.putts[room.puttIndex] || course.putts[0];
  const spectating = local.mode === 'spectator';
  const practice = room.mode === GameModes.PUTT_PRACTICE;
  const left = Math.max(0, Math.ceil((room.roundLimitSeconds * 1000 - Math.max(0, now - room.roundStartTime)) / 1000));
  const info = course.name + (course.hasPutts ? ' · PUTT ' + ((room.puttIndex | 0) + 1) + '/' + course.putts.length : '') + ' · PAR ' + putt.par + ' · '
    + (spectating ? 'SPECTATING' : 'STROKES ' + local.strokes + (practice ? ' · PRACTICE' : ' · ' + Math.floor(left / 60) + ':' + pad2(left % 60)));
  const list = connectedPlayers(room).map(p => {
    const watching = p.id === local.id ? spectating : !(room.roster || []).includes(p.id);
    return { player: p, watching, total: watching ? 0 : mapTotal(p, local, room.puttIndex | 0) };
  });
  list.sort((a, b) => a.total - b.total || String(a.player.name).localeCompare(String(b.player.name)));
  const scoreboard = list.map(({ player: p, watching, total }) => ({
    id: p.id,
    color: colorOf(room, local, p.id),
    name: (1 + list.filter(o => o.total < total).length) + '. ' + p.name + (p.id === local.id ? ' (you)' : ''),
    status: watching ? 'Watching' : p.done ? '✔ ' + p.score : String(p.id === local.id ? local.strokes : p.strokes),
    total: String(total),
  }));
  const inventory = [0, 1, 2].map(i => {
    const item = (local.inventory || [])[i];
    return { index: i, id: item || '', name: item ? powerupName(item) : '', ability: item ? getPowerup(item)?.toast || '' : '', label: item ? (i + 1) + '. ' + powerupName(item) : (i + 1) + '. empty', kind: !item ? 'empty' : isOpponentPowerup(item) ? 'attack' : 'item' };
  });
  return {
    info,
    title: {
      map: course.name, putt: course.hasPutts ? ((room.puttIndex | 0) + 1) + '/' + course.putts.length : '', par: putt.par,
      stat: spectating ? 'SPECTATE' : String(local.strokes), statLabel: spectating ? 'MODE' : 'STROKES',
      time: spectating ? '' : practice ? 'FREE' : Math.floor(left / 60) + ':' + pad2(left % 60),
    },
    pong: pongHudView(room, local),
    warn: local.mode === 'play' && left <= 10,
    practiceBar: !!local.isHost && practice && room.phase === SessionPhases.PLAY,
    scoreboard,
    connection: local.roomCode ? 'Room ' + local.roomCode + ' · ' + list.length + ' players' : 'Solo practice',
    inventory,
    hazardPrompt: local.hazardPrompt ? {
      ...local.hazardPrompt,
      targets: (room.roster || []).filter(id => id !== local.id && room.players?.[id]?.connected)
        .map(id => ({ id, name: room.players[id].name })),
    } : null,
    activeHazards: (room.globalHazards || []).map(h => ({
      id: h.id, kind: h.kind,
      seconds: Math.max(0, Math.ceil(h.endTime - Math.max(0, (hazardTime - room.roundStartTime) / 1000))),
      direction: h.kind === 'wind' ? ['→','↘','↓','↙','←','↖','↑','↗'][Math.round(((h.direction + 2 * Math.PI) % (2 * Math.PI)) / (Math.PI / 4)) % 8] : '',
      targetName: h.kind === 'lightning' ? room.players?.[h.targetId]?.name || 'opponent' : '',
    })).filter(h => h.seconds > 0),
    viewLabel: 'View: ' + (local.viewLabel || 'Ball cam'),
    soundLabel: 'Sound: ' + (local.soundOn === false ? 'Off' : 'On'),
    volume: Number.isFinite(local.volume) ? local.volume : 1,
    qualityLabel: 'Quality: ' + (local.qualityHigh === false ? 'Low' : 'High'),
  };
}

/** Paper scorecard (legacy cardData + renderCard). Rows sort live by total, ties by name. */
export function scorecardView(room, local, courses) {
  const course = courses[room.mapIndex];
  const n = course.putts.length, pars = course.putts.map(p => p.par);
  const live = room.phase === SessionPhases.PLAY;
  const rows = [];
  for (const id of room.roster || []) {
    const p = room.players?.[id];
    const scores = p?.scores || [];
    const cells = [];
    for (let k = 0; k < n; k++) {
      if (k < scores.length) cells.push(scores[k] == null ? null : { v: scores[k].score, to: !!scores[k].timedOut, missed: !!scores[k].missed });
      else if (live && p && p.connected && k === room.puttIndex) cells.push(p.done ? { v: p.score, to: !!p.timedOut, missed: !!p.missed } : { v: id === local.id ? local.strokes : p.strokes, live: true });
      else cells.push(null);
    }
    if (!cells.some(Boolean) && !(p && p.connected)) continue;
    let total = 0, parSum = 0, hio = 0, to = 0, missed = 0;
    cells.forEach((x, k) => { if (!x) return; total += x.v; parSum += pars[k]; if (!x.live) { if (x.v === 1 && !x.missed) hio++; if (x.missed) missed++; else if (x.to) to++; } });
    rows.push({ id, name: p?.name || room.totals?.[id]?.name || 'Player', color: colorOf(room, local, id), me: id === local.id, cells, total, diff: total - parSum, counted: cells.some(Boolean), hio, to, missed });
  }
  rows.sort((a, b) => a.total - b.total || String(a.name).localeCompare(String(b.name)));
  const series = isTournament(room.mode) ? seriesOf(room.mode) : 0;
  const mapNo = room.completedMaps?.length | 0;
  return {
    title: course.name + (series ? ' · Map ' + Math.min(series, room.phase === SessionPhases.RESULTS ? mapNo : mapNo + 1) + '/' + series : ''),
    pars,
    parTotal: pars.reduce((a, b) => a + b, 0),
    rows: rows.map(x => {
      const rank = 1 + rows.filter(o => o.total < x.total).length;
      return {
        id: x.id,
        color: x.color,
        lead: rank === 1 && x.counted,
        label: rank + '. ' + x.name + (x.me ? ' (you)' : ''),
        cells: x.cells.map((cell, k) => cell && {
          text: cell.v + (cell.missed ? '!' : (cell.to ? '*' : '')),
          kind: cell.live ? 'live' : cell.missed ? 'over' : cell.v === 1 ? 'hio' : cell.v < pars[k] ? 'under' : cell.v > pars[k] ? 'over' : 'par',
        }),
        total: x.counted ? String(x.total) : '',
        diff: x.counted ? (x.diff === 0 ? 'E' : (x.diff > 0 ? '+' : '') + x.diff) : '',
        hio: x.hio ? String(x.hio) : '',
        timeouts: x.to ? String(x.to) : '',
      };
    }),
  };
}

const nameOf = (room, id) => room.players?.[id]?.name || room.totals?.[id]?.name || 'Player';

/**
 * Results card text, button and the banners announced on arrival
 * (legacy showResults() and fin()).
 */
const toPar = n => n > 0 ? '+' + n : n < 0 ? String(n) : 'E';

export function resultsView(room, local, courses) {
  const practice = room.mode === GameModes.PRACTICE;
  const tournament = isTournament(room.mode);
  const series = seriesOf(room.mode);
  const mapNo = room.completedMaps?.length | 0;
  const more = tournament && mapNo < series;
  const last = room.last;
  const banners = [];
  let text;
  if (last) {
    const map = courses[last.mapIndex];
    const ids = Object.keys(last.scores || {});
    const rel = id => last.scores[id] - (last.pars?.[id] ?? 0);
    const lines = ids.slice().sort((a, b) => rel(a) - rel(b)).map(id => nameOf(room, id) + ' ' + last.scores[id] + ' (' + toPar(rel(id)) + ')');
    const win = (last.winners || []).map(id => nameOf(room, id)).join(' & ');
    text = map.name + ': ' + lines.join(' · ') + (practice ? '. Practice round finished.' : '. Map winner: ' + win + '.');
    banners.push({ text: practice ? 'PRACTICE DONE' : win, sub: (practice ? '' : 'MAP WINNER · ') + map.name.toUpperCase(), kind: 'event' });
    if (tournament) {
      const relative = x => x.total - (x.par ?? 0);
      const standings = Object.values(room.totals || {}).sort((a, b) => relative(a) - relative(b));
      text += ' Standings after map ' + mapNo + '/' + series + ': ' + standings.map(x => x.name + ' ' + toPar(relative(x))).join(' · ') + '.';
      if (!more && standings.length) {
        const champion = standings.filter(x => relative(x) === relative(standings[0])).map(x => x.name).join(' & ');
        text += ' OVERALL CHAMPION: ' + champion + '!';
        banners.push({ text: champion, sub: 'TOURNAMENT CHAMPION', kind: 'hio' });
      }
    }
  } else {
    // Legacy fin() wording, shown only when no map result exists.
    const course = courses[room.mapIndex];
    const me = room.players?.[local.id];
    const total = (me?.scores || []).reduce((sum, s) => sum + (s ? s.score : 0), 0);
    const d = total - course.putts.reduce((a, p) => a + p.par, 0);
    const n = course.putts.length;
    text = 'You finished ' + n + (n > 1 ? ' putts' : ' putt') + ' in ' + total + ' strokes (' + (d > 0 ? '+' : '') + d + ' vs par). The scoreboard shows how everyone else is doing.';
  }
  if (local.mode === 'spectator') text = 'Round finished. You joined as a spectator; join the next map to play.';
  if (!local.isHost) text += local.serverOwned ? ' Waiting for the room controller to return to the lobby.' : ' Waiting for the host to return to the lobby.';
  return {
    text,
    buttonLabel: practice ? 'Pick another map' : more ? 'Next map vote' : 'Back to lobby',
    showButton: !!local.isHost,
    banners,
  };
}
