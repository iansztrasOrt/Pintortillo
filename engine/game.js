// Motor de la partida. Puro y serializable: no sabe de sockets ni de timers.
// Cada operación recibe ctx = { now, rng, out } y deja en ctx.out los mensajes
// para el transporte (a quién va cada uno). El servidor llama a tick() seguido.

import { fail, send, clampInt, pickOne } from './util.js';
import { SCORING, guessPoints, drawerPointsForGuess, rankPlayers } from './scoring.js';
import { isCorrectGuess, isCloseGuess } from './matcher.js';
import { maskOf, hintCount, hintSchedule, pickHintIndex, letterIndices } from './hints.js';
import { pickChoices, parseCustomWords, wordsOf, CUSTOM_MIN_WORDS } from './words.js';
import { validateCommand, applyCommand, newDrawing } from './drawing.js';
import { censor } from './profanity.js';

export const TIMING = Object.freeze({
  CHOOSE_MS: 15000,
  TURN_END_MS: 5000,
  PUBLIC_START_MS: 10000,
  PUBLIC_RESTART_MS: 20000,
});

export const LIMITS = Object.freeze({
  maxPlayers: [2, 20],
  drawTime: [15, 240],
  rounds: [2, 10],
  wordChoices: [1, 5],
  hints: [0, 5],
});

export const MIN_PLAYERS = 2;
export const WORD_MODES = ['normal', 'hidden', 'combination'];
export const CHAT_MAX = 100;

export const DEFAULT_SETTINGS = Object.freeze({
  lang: 'es',
  maxPlayers: 8,
  drawTime: 80,
  rounds: 3,
  wordChoices: 3,
  hints: 2,
  wordMode: 'normal',
  customWords: [],
  customOnly: false,
  filter: true,
});

// ---------------------------------------------------------------- helpers

export function getPlayer(room, id) {
  return room.players.find((p) => p.id === id) || null;
}

function requirePlayer(room, id) {
  const p = getPlayer(room, id);
  if (!p) fail('not_in_room');
  return p;
}

function connected(room) {
  return room.players.filter((p) => p.connected);
}

function isHost(room, id) {
  return room.hostId === id;
}

function sys(ctx, to, key, params = {}, kind = 'system') {
  send(ctx, to, 'chat', { kind, key, params, t: ctx.now });
}

function event(ctx, to, type, data = {}) {
  send(ctx, to, 'event', { type, ...data });
}

function knowers(room) {
  const t = room.turn;
  if (!t) return [];
  return [t.drawerId, ...t.guessed.map((g) => g.id)].filter((id) => getPlayer(room, id));
}

/** Quienes deberían adivinar ahora: conectados y que no son el dibujante. */
function eligibleGuessers(room) {
  const t = room.turn;
  return connected(room).filter((p) => p.id !== t.drawerId);
}

function newStats() {
  return { correct: 0, fastestMs: null, drawerPoints: 0, likes: 0, dislikes: 0, turnsDrawn: 0 };
}

// ---------------------------------------------------------------- sala

export function createRoom({ code, isPublic = false, settings = {} }, ctx) {
  return {
    code,
    isPublic,
    phase: 'lobby', // lobby | playing | gameOver
    settings: normalizeSettings({ ...DEFAULT_SETTINGS, ...settings }),
    hostId: null,
    players: [],
    round: 0,
    order: [],
    turnIdx: -1,
    turn: null,
    usedWords: [],
    kicked: [],
    results: null,
    autoStartAt: null,
    restartAt: null,
    createdAt: ctx.now,
    lastActivity: ctx.now,
    version: 1,
  };
}

export function normalizeSettings(s, current = DEFAULT_SETTINGS) {
  const pick = (k) => (s[k] !== undefined ? s[k] : current[k]);
  return {
    lang: 'es',
    maxPlayers: clampInt(pick('maxPlayers'), ...LIMITS.maxPlayers, 8),
    drawTime: clampInt(pick('drawTime'), ...LIMITS.drawTime, 80),
    rounds: clampInt(pick('rounds'), ...LIMITS.rounds, 3),
    wordChoices: clampInt(pick('wordChoices'), ...LIMITS.wordChoices, 3),
    hints: clampInt(pick('hints'), ...LIMITS.hints, 2),
    wordMode: WORD_MODES.includes(pick('wordMode')) ? pick('wordMode') : 'normal',
    customWords: parseCustomWords(pick('customWords')),
    customOnly: Boolean(pick('customOnly')),
    filter: pick('filter') !== false,
  };
}

export function addPlayer(room, { id, name, avatar }, ctx) {
  if (room.kicked.includes(id)) fail('kicked');
  if (getPlayer(room, id)) fail('already_in_room');
  if (room.players.length >= room.settings.maxPlayers) fail('room_full');
  const player = {
    id, name, avatar, score: 0, connected: true, joinedAt: ctx.now, guessTimeSum: 0, kickVotes: [], stats: newStats(),
  };
  room.players.push(player);
  if (!room.hostId) room.hostId = id;
  room.lastActivity = ctx.now;
  sys(ctx, 'all', 'player_joined', { name });
  event(ctx, 'all', 'join', { playerId: id });
  maybeScheduleAutoStart(room, ctx);
  touch(room);
  return player;
}

function touch(room) {
  room.version += 1;
}

function transferHost(room, ctx) {
  const next = [...room.players].sort((a, b) => a.joinedAt - b.joinedAt).find((p) => p.connected)
    || room.players[0];
  const prev = room.hostId;
  room.hostId = next ? next.id : null;
  if (next && prev !== next.id) sys(ctx, 'all', 'new_host', { name: next.name });
}

/** Salida definitiva (botón salir, expulsión, o desconexión prolongada). */
export function removePlayer(room, pid, ctx, reason = 'left') {
  const p = getPlayer(room, pid);
  if (!p) return;
  const t = room.turn;
  const wasDrawer = room.phase === 'playing' && t && t.drawerId === pid && t.phase !== 'end';
  if (wasDrawer) endTurn(room, ctx, 'drawer_left');
  room.players = room.players.filter((x) => x.id !== pid);
  for (const other of room.players) other.kickVotes = other.kickVotes.filter((v) => v !== pid);
  sys(ctx, 'all', reason === 'kicked' ? 'player_kicked' : 'player_left', { name: p.name });
  if (room.hostId === pid) transferHost(room, ctx);
  afterPresenceChange(room, ctx);
  touch(room);
}

/** Desconexión momentánea: mantiene puntaje y lugar. */
export function setConnected(room, pid, isConnected, ctx) {
  const p = getPlayer(room, pid);
  if (!p) return;
  p.connected = isConnected;
  if (isConnected) {
    sys(ctx, 'all', 'player_back', { name: p.name });
  } else if (room.hostId === pid) {
    transferHost(room, ctx);
  }
  touch(room);
}

/** Tras el período de gracia: si era el dibujante, termina su turno; revisa condiciones. */
export function handleDisconnectTimeout(room, pid, ctx) {
  const p = getPlayer(room, pid);
  if (!p || p.connected) return;
  const t = room.turn;
  if (room.phase === 'playing' && t && t.drawerId === pid && t.phase !== 'end') endTurn(room, ctx, 'drawer_left');
  afterPresenceChange(room, ctx);
  touch(room);
}

function afterPresenceChange(room, ctx) {
  if (room.phase === 'playing') {
    if (connected(room).length < MIN_PLAYERS) {
      endGame(room, ctx, 'not_enough_players');
      return;
    }
    checkAllGuessed(room, ctx);
  }
  if (room.phase === 'lobby') maybeScheduleAutoStart(room, ctx);
}

export function updateSettings(room, pid, patch, ctx) {
  if (!isHost(room, pid)) fail('host_only');
  if (room.phase === 'playing') fail('game_in_progress');
  room.settings = normalizeSettings({ ...room.settings, ...(patch || {}) }, room.settings);
  sys(ctx, 'all', 'settings_changed', {});
  touch(room);
}

export function hostKick(room, pid, targetId, ctx) {
  if (!isHost(room, pid)) fail('host_only');
  if (targetId === pid) fail('cannot_kick_self');
  requirePlayer(room, targetId);
  kick(room, targetId, ctx);
}

export function voteKick(room, pid, targetId, ctx) {
  requirePlayer(room, pid);
  const target = requirePlayer(room, targetId);
  if (targetId === pid) fail('cannot_kick_self');
  if (target.kickVotes.includes(pid)) fail('already_voted');
  target.kickVotes.push(pid);
  const voters = connected(room).filter((p) => p.id !== targetId).length;
  const needed = Math.floor(voters / 2) + 1;
  sys(ctx, 'all', 'kick_vote', { name: getPlayer(room, pid).name, target: target.name, votes: target.kickVotes.length, needed });
  if (target.kickVotes.length >= needed) kick(room, targetId, ctx);
  touch(room);
}

function kick(room, targetId, ctx) {
  room.kicked.push(targetId);
  send(ctx, [targetId], 'kicked', {});
  removePlayer(room, targetId, ctx, 'kicked');
}

// ---------------------------------------------------------------- inicio y rondas

function maybeScheduleAutoStart(room, ctx) {
  if (!room.isPublic || room.phase !== 'lobby') return;
  if (connected(room).length >= MIN_PLAYERS) {
    if (!room.autoStartAt) room.autoStartAt = ctx.now + TIMING.PUBLIC_START_MS;
  } else {
    room.autoStartAt = null;
  }
}

export function startGame(room, pid, ctx, { auto = false } = {}) {
  if (!auto && !isHost(room, pid)) fail('host_only');
  if (room.phase === 'playing') fail('game_in_progress');
  if (connected(room).length < MIN_PLAYERS) fail('need_more_players');
  const s = room.settings;
  if (s.customOnly && s.customWords.length < CUSTOM_MIN_WORDS) fail('need_custom_words');
  room.phase = 'playing';
  room.autoStartAt = null;
  room.restartAt = null;
  room.results = null;
  room.round = 0;
  for (const p of room.players) {
    p.score = 0;
    p.guessTimeSum = 0;
    p.stats = newStats();
    p.kickVotes = [];
  }
  sys(ctx, 'all', 'game_started', {});
  event(ctx, 'all', 'gameStart');
  startRound(room, ctx);
  touch(room);
}

function startRound(room, ctx) {
  room.round += 1;
  if (room.round > room.settings.rounds) {
    endGame(room, ctx, 'finished');
    return;
  }
  room.order = [...connected(room)].sort((a, b) => a.joinedAt - b.joinedAt).map((p) => p.id);
  room.turnIdx = -1;
  sys(ctx, 'all', 'round_start', { round: room.round, rounds: room.settings.rounds });
  nextTurn(room, ctx);
}

function nextTurn(room, ctx) {
  if (room.phase !== 'playing') return;
  if (connected(room).length < MIN_PLAYERS) {
    endGame(room, ctx, 'not_enough_players');
    return;
  }
  let drawer = null;
  while (room.turnIdx + 1 < room.order.length) {
    room.turnIdx += 1;
    const cand = getPlayer(room, room.order[room.turnIdx]);
    if (cand && cand.connected) {
      drawer = cand;
      break;
    }
  }
  if (!drawer) {
    startRound(room, ctx);
    return;
  }
  const choices = pickChoices(room, room.settings.wordChoices, ctx.rng);
  room.turn = {
    drawerId: drawer.id,
    phase: 'choosing',
    choices,
    word: null,
    revealed: [],
    hintTimes: [],
    hintsGiven: 0,
    startedAt: null,
    endsAt: ctx.now + TIMING.CHOOSE_MS,
    drawMs: room.settings.drawTime * 1000,
    guessed: [],
    drawerPoints: 0,
    turnPoints: {},
    votes: {},
    drawing: newDrawing(),
    reason: null,
    hurried: false,
  };
  drawer.stats.turnsDrawn += 1;
  sys(ctx, 'all', 'choosing', { name: drawer.name });
  event(ctx, 'all', 'turnStart', { drawerId: drawer.id });
  event(ctx, [drawer.id], 'yourTurn');
  if (choices.length === 1) startDrawing(room, choices[0], ctx);
}

export function chooseWord(room, pid, index, ctx) {
  const t = room.turn;
  if (room.phase !== 'playing' || !t || t.phase !== 'choosing') fail('not_choosing');
  if (t.drawerId !== pid) fail('not_drawer');
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0 || i >= t.choices.length) fail('invalid_choice');
  startDrawing(room, t.choices[i], ctx);
  touch(room);
}

function startDrawing(room, word, ctx) {
  const t = room.turn;
  t.phase = 'drawing';
  t.word = word;
  t.choices = [];
  t.startedAt = ctx.now;
  t.endsAt = ctx.now + t.drawMs;
  room.usedWords.push(...wordsOf(word));
  if (room.usedWords.length > 5000) room.usedWords.splice(0, room.usedWords.length - 5000);
  const n = room.settings.wordMode === 'hidden' ? 0 : hintCount(word, room.settings.hints);
  t.hintTimes = hintSchedule(t.drawMs, n).map((ms) => ctx.now + ms);
  const drawer = getPlayer(room, t.drawerId);
  sys(ctx, 'all', 'drawing_now', { name: drawer ? drawer.name : '' });
  event(ctx, 'all', 'drawStart', { drawerId: t.drawerId });
}

// ---------------------------------------------------------------- reloj

export function tick(room, ctx) {
  const v = room.version;
  if (room.phase === 'lobby' && room.autoStartAt && ctx.now >= room.autoStartAt) {
    room.autoStartAt = null;
    if (connected(room).length >= MIN_PLAYERS) startGame(room, null, ctx, { auto: true });
  }
  if (room.phase === 'gameOver' && room.restartAt && ctx.now >= room.restartAt) {
    room.restartAt = null;
    backToLobby(room, ctx);
  }
  const t = room.turn;
  if (room.phase === 'playing' && t) {
    if (t.phase === 'choosing' && ctx.now >= t.endsAt) {
      startDrawing(room, pickOne(t.choices, ctx.rng), ctx);
      touch(room);
    } else if (t.phase === 'drawing') {
      while (t.hintsGiven < t.hintTimes.length && ctx.now >= t.hintTimes[t.hintsGiven]) {
        t.hintsGiven += 1;
        const idx = pickHintIndex(t.word, t.revealed, ctx.rng);
        if (idx !== null) {
          t.revealed.push(idx);
          event(ctx, 'all', 'hint');
        }
        touch(room);
      }
      if (ctx.now >= t.endsAt) endTurn(room, ctx, 'time');
    } else if (t.phase === 'end' && ctx.now >= t.endsAt) {
      nextTurn(room, ctx);
      touch(room);
    }
  }
  return room.version !== v;
}

// ---------------------------------------------------------------- aciertos

function registerGuess(room, player, ctx) {
  const t = room.turn;
  const remaining = Math.max(0, t.endsAt - ctx.now);
  const place = t.guessed.length;
  const pts = guessPoints(remaining, t.drawMs, place);
  const guessers = eligibleGuessers(room).length;
  const dpts = drawerPointsForGuess(remaining, t.drawMs, guessers);
  const elapsed = ctx.now - t.startedAt;
  player.score += pts;
  player.guessTimeSum += elapsed;
  player.stats.correct += 1;
  if (player.stats.fastestMs === null || elapsed < player.stats.fastestMs) player.stats.fastestMs = elapsed;
  t.guessed.push({ id: player.id, at: ctx.now, points: pts, elapsed });
  t.turnPoints[player.id] = pts;
  const drawer = getPlayer(room, t.drawerId);
  if (drawer) {
    drawer.score += dpts;
    drawer.stats.drawerPoints += dpts;
    t.drawerPoints += dpts;
    t.turnPoints[drawer.id] = t.drawerPoints;
  }
  sys(ctx, 'all', 'guessed', { name: player.name }, 'guessed');
  event(ctx, 'all', 'guessed', { playerId: player.id, points: pts, place });
  // El primero en acertar acelera el final: quedan como máximo 30 s.
  if (place === 0 && t.endsAt - ctx.now > SCORING.HURRY_MS) {
    t.endsAt = ctx.now + SCORING.HURRY_MS;
    t.hurried = true;
    event(ctx, 'all', 'hurry');
  }
  checkAllGuessed(room, ctx);
}

function checkAllGuessed(room, ctx) {
  const t = room.turn;
  if (room.phase !== 'playing' || !t || t.phase !== 'drawing') return;
  const pending = eligibleGuessers(room).filter((p) => !t.guessed.some((g) => g.id === p.id));
  if (pending.length === 0 && t.guessed.length > 0) endTurn(room, ctx, 'all_guessed');
}

function endTurn(room, ctx, reason) {
  const t = room.turn;
  if (!t || t.phase === 'end') return;
  const drawer = getPlayer(room, t.drawerId);
  if (reason === 'drawer_left' && drawer && t.drawerPoints) {
    drawer.score -= t.drawerPoints;
    drawer.stats.drawerPoints -= t.drawerPoints;
    t.drawerPoints = 0;
    delete t.turnPoints[drawer.id];
  }
  t.phase = 'end';
  t.reason = reason;
  t.endsAt = ctx.now + TIMING.TURN_END_MS;
  if (t.drawing.open !== null) t.drawing.open = null;
  sys(ctx, 'all', t.word ? 'word_was' : 'turn_skipped', { word: t.word || '', reason });
  event(ctx, 'all', 'turnEnd', { word: t.word, reason, points: t.turnPoints });
  touch(room);
}

function endGame(room, ctx, reason) {
  if (room.phase !== 'playing') return;
  room.phase = 'gameOver';
  room.turn = null;
  const ranking = rankPlayers(room.players);
  const fastest = room.players.filter((p) => p.stats.fastestMs !== null).sort((a, b) => a.stats.fastestMs - b.stats.fastestMs)[0];
  const bestDrawer = [...room.players].sort((a, b) => b.stats.drawerPoints - a.stats.drawerPoints || b.stats.likes - a.stats.likes)[0];
  const sharpest = [...room.players].sort((a, b) => b.stats.correct - a.stats.correct)[0];
  room.results = {
    reason,
    ranking: ranking.map((p, i) => ({
      id: p.id, name: p.name, avatar: p.avatar, score: p.score, place: i + 1, stats: { ...p.stats },
    })),
    awards: {
      fastest: fastest ? { id: fastest.id, name: fastest.name, ms: fastest.stats.fastestMs } : null,
      bestDrawer: bestDrawer && bestDrawer.stats.drawerPoints > 0 ? { id: bestDrawer.id, name: bestDrawer.name, points: bestDrawer.stats.drawerPoints } : null,
      sharpest: sharpest && sharpest.stats.correct > 0 ? { id: sharpest.id, name: sharpest.name, correct: sharpest.stats.correct } : null,
    },
  };
  if (room.isPublic) room.restartAt = ctx.now + TIMING.PUBLIC_RESTART_MS;
  sys(ctx, 'all', 'game_over', { name: ranking[0] ? ranking[0].name : '', reason });
  event(ctx, 'all', 'gameOver');
  touch(room);
}

function backToLobby(room, ctx) {
  room.phase = 'lobby';
  room.turn = null;
  room.round = 0;
  for (const p of room.players) {
    p.score = 0;
    p.kickVotes = [];
  }
  maybeScheduleAutoStart(room, ctx);
  touch(room);
}

export function playAgain(room, pid, ctx) {
  if (!isHost(room, pid)) fail('host_only');
  if (room.phase !== 'gameOver') fail('game_not_over');
  room.restartAt = null;
  backToLobby(room, ctx);
  sys(ctx, 'all', 'play_again', {});
}

export function forceEnd(room, ctx) {
  endGame(room, ctx, 'host');
}

// ---------------------------------------------------------------- chat

export function chat(room, pid, rawText, ctx) {
  const p = requirePlayer(room, pid);
  let text = String(rawText || '').replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX);
  if (!text) fail('empty_message');
  if (room.settings.filter) text = censor(text);
  room.lastActivity = ctx.now;
  const t = room.turn;
  const msg = { kind: 'msg', from: pid, name: p.name, text, t: ctx.now };
  if (room.phase === 'playing' && t && t.phase !== 'end') {
    const isKnower = t.drawerId === pid || t.guessed.some((g) => g.id === pid);
    if (isKnower) {
      // Canal "solo quienes ya saben": el dibujante y los que ya acertaron.
      send(ctx, knowers(room), 'chat', { ...msg, kind: 'secret' });
      return { channel: 'secret' };
    }
    if (t.phase === 'drawing' && t.word) {
      const words = wordsOf(t.word);
      const correct = isCorrectGuess(text, t.word) || (words.length > 1 && isCorrectGuess(text, words.join(' ')));
      if (correct) {
        registerGuess(room, p, ctx);
        touch(room);
        return { channel: 'guess', correct: true };
      }
      if (isCloseGuess(text, t.word.replace(' + ', ' '))) {
        send(ctx, 'all', 'chat', msg);
        send(ctx, [pid], 'chat', { kind: 'close', key: 'close_guess', params: { text }, t: ctx.now });
        return { channel: 'public', close: true };
      }
    }
  }
  send(ctx, 'all', 'chat', msg);
  return { channel: 'public' };
}

// ---------------------------------------------------------------- dibujo y votos

/** Comandos de dibujo: solo el dibujante activo, durante la fase de dibujo. */
export function draw(room, pid, cmds, ctx) {
  const t = room.turn;
  if (room.phase !== 'playing' || !t || t.phase !== 'drawing' || t.drawerId !== pid) fail('not_drawer');
  if (!Array.isArray(cmds) || cmds.length === 0 || cmds.length > 40) fail('invalid_draw');
  const applied = [];
  for (const raw of cmds) {
    let cmd;
    try {
      cmd = validateCommand(raw);
    } catch {
      continue;
    }
    if (applyCommand(t.drawing, cmd)) applied.push(cmd);
  }
  if (applied.length) send(ctx, { except: pid }, 'draw', applied);
  return applied.length;
}

export function vote(room, pid, value, ctx) {
  const t = room.turn;
  if (room.phase !== 'playing' || !t || t.phase === 'choosing') fail('cannot_vote');
  if (t.drawerId === pid) fail('cannot_vote_self');
  requirePlayer(room, pid);
  if (t.votes[pid]) fail('already_voted');
  const v = value > 0 ? 1 : -1;
  t.votes[pid] = v;
  const drawer = getPlayer(room, t.drawerId);
  if (drawer) {
    if (v > 0) drawer.stats.likes += 1;
    else drawer.stats.dislikes += 1;
  }
  event(ctx, 'all', 'vote', { value: v, playerId: pid });
  touch(room);
}

// ---------------------------------------------------------------- vista por jugador

/** Lo que ve cada jugador. La palabra solo la reciben el dibujante y quienes ya acertaron. */
export function viewFor(room, pid, now) {
  const t = room.turn;
  const isDrawer = Boolean(t && t.drawerId === pid);
  const knows = Boolean(t && (isDrawer || t.guessed.some((g) => g.id === pid)));
  let turn = null;
  if (t) {
    const reveal = t.phase === 'end' || knows;
    const hidden = room.settings.wordMode === 'hidden';
    turn = {
      drawerId: t.drawerId,
      phase: t.phase,
      endsAt: t.endsAt,
      drawMs: t.drawMs,
      choices: isDrawer && t.phase === 'choosing' ? t.choices : null,
      word: reveal ? t.word : null,
      mask: t.word && !reveal ? (hidden ? null : maskOf(t.word, t.revealed)) : null,
      letters: t.word && !hidden ? letterIndices(t.word).length : null,
      guessed: t.guessed.map((g) => ({ id: g.id, points: g.points })),
      turnPoints: t.phase === 'end' ? t.turnPoints : null,
      likes: Object.values(t.votes).filter((v) => v > 0).length,
      dislikes: Object.values(t.votes).filter((v) => v < 0).length,
      myVote: t.votes[pid] || 0,
      reason: t.reason,
      hurried: t.hurried,
    };
  }
  const host = isHost(room, pid);
  return {
    code: room.code,
    isPublic: room.isPublic,
    phase: room.phase,
    hostId: room.hostId,
    me: pid,
    round: room.round,
    settings: {
      ...room.settings,
      customWords: host ? room.settings.customWords : [],
      customCount: room.settings.customWords.length,
    },
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      score: p.score,
      connected: p.connected,
      joinedAt: p.joinedAt,
      kickVotes: p.kickVotes.length,
      iVotedKick: p.kickVotes.includes(pid),
    })),
    turn,
    results: room.results,
    autoStartAt: room.autoStartAt,
    restartAt: room.restartAt,
    serverNow: now,
  };
}

/** Historial del dibujo actual (para quien entra tarde o se reconecta). */
export function drawingSnapshot(room) {
  const t = room.turn;
  if (!t || t.phase === 'choosing') return { actions: [], open: null };
  return { actions: t.drawing.actions, open: t.drawing.open };
}

export { isCorrectGuess };
