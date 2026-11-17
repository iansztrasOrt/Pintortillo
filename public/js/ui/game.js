// Pantalla de juego: temporizador, ronda, palabra, jugadores, lienzo, herramientas y chat.
import { h, clear } from '../dom.js';
import { t } from '../i18n/index.js';
import {
  store, myId, player, isDrawer, hasGuessed, serverNow,
} from '../store.js';
import { act, call, sendDraw } from '../net.js';
import { sfx } from '../audio.js';
import { createBoard } from './canvas.js';
import { createTools } from './tools.js';
import { createChat } from './chat.js';
import { createPlayers } from './players.js';
import { renderOverlay, tickOverlay, confetti } from './overlays.js';
import { toast } from './toast.js';

const CHOOSE_MS = 15000;

export function mountGame(view, { onLeave }) {
  clear(view);
  const timerNum = h('span', { class: 'timer-num' }, '');
  const timer = h('div', { class: 'timer', role: 'timer', 'aria-live': 'off' });
  timer.innerHTML = '<svg viewBox="0 0 44 44" aria-hidden="true"><circle class="track" cx="22" cy="22" r="19"/><circle class="bar" cx="22" cy="22" r="19"/></svg>';
  timer.append(timerNum);
  const roundEl = h('div', { class: 'round' });
  const wordEl = h('div', { class: 'word', 'aria-live': 'polite' });
  const playersBtn = h('button', { class: 'icon-btn only-mobile', type: 'button', 'aria-label': t('game.players'), 'aria-expanded': 'false' }, '👥');
  const leaveBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('game.leave'), title: t('game.leave') }, '🚪');
  const top = h('header', { class: 'game-top' }, timer, roundEl, wordEl, h('div', { class: 'top-actions' }, playersBtn, leaveBtn));

  const players = createPlayers();
  const chat = createChat();
  const colPlayers = h('aside', { class: 'col-players' }, players.el);
  const boardHost = h('div', { class: 'board-host' });
  const votes = h('div', { class: 'votes' });
  const toolsHost = h('div', { class: 'tools-host' });
  const colBoard = h('main', { class: 'col-board' }, boardHost, votes, toolsHost);
  const colChat = h('aside', { class: 'col-chat' }, chat.el);
  view.append(h('div', { class: 'game-screen' }, top, h('div', { class: 'game-grid' }, colPlayers, colBoard, colChat)));

  const tools = createTools(toolsHost, {
    onCommand: (cmd) => {
      if (cmd === 'clr') {
        if (window.confirm(t('tools.confirmClear'))) board.command('clr');
      } else board.command(cmd);
    },
    onChange: () => board.redrawOverlay(),
  });
  const board = createBoard(boardHost, {
    onSend: sendDraw,
    getTool: () => tools.state,
    onPick: (color) => tools.pick(color),
  });
  board.el.append(votes); // los votos van dentro del lienzo, en una esquina

  playersBtn.addEventListener('click', () => {
    const open = colPlayers.classList.toggle('open');
    playersBtn.setAttribute('aria-expanded', String(open));
  });
  colPlayers.addEventListener('click', (e) => {
    if (e.target === colPlayers) colPlayers.classList.remove('open');
  });
  leaveBtn.addEventListener('click', () => {
    if (window.confirm(t('game.confirmLeave'))) onLeave();
  });

  let overlayKey = '';
  let lastSecond = null;

  function renderTop() {
    const v = store.view;
    const turn = v.turn;
    roundEl.textContent = v.phase === 'playing' ? t('game.round', { round: v.round, rounds: v.settings.rounds }) : '';
    clear(wordEl);
    if (!turn) return;
    if (turn.phase === 'choosing') {
      wordEl.append(h('span', { class: 'word-label' }, isDrawer() ? t('game.youChoose') : t('game.choosing')));
      return;
    }
    if (turn.word) {
      const label = turn.phase === 'end' ? t('game.wordWas') : isDrawer() ? t('game.drawThis') : '✅';
      wordEl.append(h('span', { class: 'word-label' }, label), h('span', { class: 'word-real' }, turn.word));
      return;
    }
    if (!turn.mask) {
      wordEl.append(h('span', { class: 'word-label' }, t('game.guessThis')), h('span', { class: 'word-real' }, t('game.hidden')));
      return;
    }
    const mask = h('span', { class: 'mask', 'aria-label': `${t('game.letters', { n: turn.letters })}: ${turn.mask.map((c) => (c === '_' ? 'guion' : c)).join(' ')}` });
    for (const ch of turn.mask) {
      mask.append(h('span', { class: ch === ' ' ? 'gap' : ch === '_' ? 'blank' : 'ch' }, ch === '_' ? '' : ch));
    }
    wordEl.append(mask, h('sup', { class: 'count' }, String(turn.letters)));
  }

  function updateTimer() {
    const v = store.view;
    const turn = v?.turn;
    const bar = timer.querySelector('.bar');
    if (!turn || turn.phase === 'end' || v.phase !== 'playing') {
      timerNum.textContent = '';
      bar.style.strokeDashoffset = '0';
      timer.classList.remove('low');
      return;
    }
    const left = Math.max(0, turn.endsAt - serverNow());
    const total = turn.phase === 'choosing' ? CHOOSE_MS : turn.drawMs;
    const s = Math.ceil(left / 1000);
    timerNum.textContent = String(s);
    timer.setAttribute('aria-label', t('game.timer', { s }));
    const C = 2 * Math.PI * 19;
    bar.style.strokeDasharray = String(C);
    bar.style.strokeDashoffset = String(C * (1 - Math.min(1, left / total)));
    timer.classList.toggle('low', s <= 10);
    if (turn.phase === 'drawing' && s <= 10 && s > 0 && s !== lastSecond) (s <= 3 ? sfx.tock : sfx.tick)();
    lastSecond = s;
  }

  function renderVotes() {
    const turn = store.view.turn;
    clear(votes);
    if (!turn || turn.phase === 'choosing' || isDrawer()) return;
    const mk = (value, icon, label, count) => h('button', {
      type: 'button', class: ['vote', turn.myVote === value && 'on'], 'aria-label': label, title: label,
      disabled: Boolean(turn.myVote), on: { click: () => act('game:vote', { value }) },
    }, `${icon} ${count}`);
    votes.append(mk(1, '👍', t('game.like'), turn.likes), mk(-1, '👎', t('game.dislike'), turn.dislikes));
  }

  function renderAll() {
    const v = store.view;
    if (!v) return;
    renderTop();
    updateTimer();
    players.render();
    renderVotes();
    const turn = v.turn;
    const canDraw = Boolean(turn && isDrawer() && turn.phase === 'drawing' && v.phase === 'playing');
    board.setEnabled(canDraw);
    tools.setEnabled(canDraw);
    toolsHost.hidden = !canDraw;
    chat.setMode(turn && turn.phase !== 'end' && isDrawer() ? 'drawer' : turn && turn.phase !== 'end' && hasGuessed() ? 'knower' : 'guess');
    const key = JSON.stringify([v.phase, turn?.phase, turn?.drawerId, turn?.choices, turn?.turnPoints, v.results?.ranking?.length, v.restartAt]);
    if (key !== overlayKey) {
      overlayKey = key;
      renderOverlay(board.layer, { onDownload: () => board.download() });
      board.layer.querySelector('[data-autofocus="true"]')?.focus();
    }
  }

  const interval = setInterval(() => {
    updateTimer();
    tickOverlay(board.layer);
  }, 250);

  function onEvent(ev) {
    switch (ev.type) {
      case 'turnStart':
        board.reset();
        break;
      case 'yourTurn':
        sfx.yourTurn();
        toast(t('game.youDraw'), 'success', { timeout: 2500 });
        break;
      case 'guessed':
        if (ev.playerId === myId()) {
          sfx.correct();
          confetti(1200);
        } else sfx.otherCorrect();
        break;
      case 'hint':
        sfx.hint();
        break;
      case 'hurry':
        toast(t('game.hurry'), 'warn', { timeout: 2500 });
        break;
      case 'turnEnd':
        sfx.turnEnd();
        break;
      case 'gameOver':
        sfx.win();
        confetti(4000);
        break;
      case 'join':
        sfx.join();
        break;
      default:
        break;
    }
  }

  // Si el historial del dibujo llegó antes de armar esta pantalla, se aplica ahora.
  if (store.replay && store.view?.turn && store.view.turn.phase !== 'choosing') board.replay(store.replay);
  renderAll();
  return {
    update(kind, payload) {
      if (kind === 'state') {
        const prev = payload?.prev?.turn;
        const turn = store.view.turn;
        if (turn && turn.phase === 'choosing' && (!prev || prev.phase !== 'choosing' || prev.drawerId !== turn.drawerId)) board.reset();
        renderAll();
      } else if (kind === 'chat') {
        chat.append(payload);
        if (payload.kind === 'close') sfx.close();
        else if (payload.kind === 'msg' && payload.from !== myId()) sfx.message();
      } else if (kind === 'event') onEvent(payload);
      else if (kind === 'draw') board.remote(payload);
      else if (kind === 'replay') board.replay(payload);
    },
    destroy() {
      clearInterval(interval);
      board.destroy();
      tools.destroy();
    },
  };
}

export { call, player };
