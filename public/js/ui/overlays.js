// Capas sobre el lienzo: elegir palabra, alguien está eligiendo, fin de turno y podio.
import { h, clear } from '../dom.js';
import { t } from '../i18n/index.js';
import { store, myId, player, isHost, serverNow } from '../store.js';
import { act } from '../net.js';
import { avatarEl } from './players.js';

function secondsLeft(ts) {
  return Math.max(0, Math.ceil((ts - serverNow()) / 1000));
}

export function renderOverlay(layer, { onDownload }) {
  const v = store.view;
  clear(layer);
  layer.className = 'board-layer';
  if (!v) return;
  if (v.phase === 'gameOver' && v.results) {
    layer.append(podium(v));
    layer.classList.add('show', 'solid');
    return;
  }
  const turn = v.turn;
  if (!turn) return;
  const drawer = player(turn.drawerId);
  if (turn.phase === 'choosing') {
    layer.classList.add('show');
    if (turn.choices) {
      layer.append(h('div', { class: 'ov-card' },
        h('h2', {}, t('game.youChoose')),
        h('div', { class: 'choices' }, turn.choices.map((w, i) => h('button', {
          type: 'button', class: 'choice', 'data-autofocus': i === 0,
          on: { click: () => act('game:choose', { index: i }) },
        }, w))),
        h('p', { class: 'countdown', dataset: { until: turn.endsAt } }, `${secondsLeft(turn.endsAt)} s`)));
    } else {
      layer.append(h('div', { class: 'ov-card' },
        drawer ? avatarEl(drawer.avatar, 84) : null,
        h('h2', {}, t('game.isChoosing', { name: drawer ? drawer.name : '…' })),
        h('p', { class: 'countdown', dataset: { until: turn.endsAt } }, `${secondsLeft(turn.endsAt)} s`)));
    }
    return;
  }
  if (turn.phase === 'end') {
    layer.classList.add('show');
    const pts = turn.turnPoints || {};
    const rows = [...v.players].sort((a, b) => (pts[b.id] || 0) - (pts[a.id] || 0));
    const nobody = !turn.guessed.length;
    layer.append(h('div', { class: 'ov-card turn-end' },
      h('p', { class: 'reason' }, t(`game.reasons.${turn.reason}`) || ''),
      turn.word ? h('p', { class: 'was' }, t('game.wordWas')) : h('p', { class: 'was' }, t('game.noWord')),
      turn.word ? h('h2', { class: 'big-word' }, turn.word) : null,
      nobody && turn.word ? h('p', { class: 'muted' }, t('game.nobody')) : null,
      h('ul', { class: 'gains' }, rows.map((p) => h('li', {},
        avatarEl(p.avatar, 28), h('span', {}, p.name),
        h('b', { class: pts[p.id] ? 'plus' : 'zero' }, pts[p.id] ? `+${pts[p.id]}` : '0')))),
      h('div', { class: 'row' },
        h('button', { type: 'button', class: 'btn btn-sm', on: { click: onDownload } }, `⬇️ ${t('game.download')}`),
        h('span', { class: 'countdown muted', dataset: { until: turn.endsAt, label: 'game.next' } }, t('game.next', { s: secondsLeft(turn.endsAt) })))));
  }
}

function podium(v) {
  const r = v.results;
  const top = r.ranking.slice(0, 3);
  const order = [top[1], top[0], top[2]].filter(Boolean);
  const awards = r.awards || {};
  const wrap = h('div', { class: 'ov-card podium-card' },
    h('h2', {}, t('over.title')),
    r.reason === 'not_enough_players' ? h('p', { class: 'muted' }, t('over.notEnough')) : null,
    h('div', { class: 'podium' }, order.map((p) => h('div', { class: `step place-${p.place}` },
      avatarEl(p.avatar, p.place === 1 ? 76 : 58),
      h('div', { class: 'pname' }, p.name),
      h('div', { class: 'ppts' }, t('over.points', { n: p.score })),
      h('div', { class: 'block' }, ['🥇', '🥈', '🥉'][p.place - 1])))),
    h('div', { class: 'awards' },
      awards.fastest ? h('span', { class: 'chip' }, `${t('over.fastest')}: ${awards.fastest.name} (${(awards.fastest.ms / 1000).toFixed(1)} s)`) : null,
      awards.bestDrawer ? h('span', { class: 'chip' }, `${t('over.bestDrawer')}: ${awards.bestDrawer.name}`) : null,
      awards.sharpest ? h('span', { class: 'chip' }, `${t('over.sharpest')}: ${awards.sharpest.name} (${t('over.correct', { n: awards.sharpest.correct })})`) : null),
    h('table', { class: 'final-table' },
      h('thead', {}, h('tr', {}, h('th', {}, '#'), h('th', {}, ''), h('th', {}, t('over.table')), h('th', {}, 'pts'), h('th', {}, '✅'), h('th', {}, '👍'))),
      h('tbody', {}, r.ranking.map((p) => h('tr', { class: p.id === myId() ? 'me' : '' },
        h('td', {}, String(p.place)), h('td', {}, avatarEl(p.avatar, 26)), h('td', {}, p.name),
        h('td', {}, String(p.score)), h('td', {}, String(p.stats.correct)), h('td', {}, String(p.stats.likes)))))),
    h('div', { class: 'row' },
      v.isPublic
        ? h('span', { class: 'countdown muted', dataset: { until: v.restartAt || 0, label: 'over.publicAgain' } }, '')
        : isHost()
          ? h('button', { type: 'button', class: 'btn btn-primary', on: { click: () => act('room:again') } }, `🔁 ${t('over.again')}`)
          : h('span', { class: 'muted' }, t('over.waitAgain'))));
  return wrap;
}

/** Actualiza los contadores "s" de la capa sin re-renderizar. */
export function tickOverlay(layer) {
  for (const el of layer.querySelectorAll('.countdown[data-until]')) {
    const s = Math.max(0, Math.ceil((Number(el.dataset.until) - serverNow()) / 1000));
    el.textContent = el.dataset.label ? t(el.dataset.label, { s }) : `${s} s`;
  }
}

/** Confeti simple en un canvas a pantalla completa. */
export function confetti(duration = 3500) {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const c = h('canvas', { class: 'confetti', 'aria-hidden': 'true' });
  document.body.append(c);
  const ctx = c.getContext('2d');
  const resize = () => { c.width = innerWidth; c.height = innerHeight; };
  resize();
  const colors = ['#ff5d8f', '#ffd23f', '#3ec1d3', '#7b5cff', '#1dd1a1', '#ff9f43'];
  const parts = Array.from({ length: 160 }, () => ({
    x: Math.random() * c.width, y: -20 - Math.random() * c.height * 0.5, vx: (Math.random() - 0.5) * 4,
    vy: 2 + Math.random() * 4, r: 4 + Math.random() * 6, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3,
    color: colors[Math.floor(Math.random() * colors.length)],
  }));
  const start = performance.now();
  function frame(now) {
    ctx.clearRect(0, 0, c.width, c.height);
    for (const p of parts) {
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2);
      ctx.restore();
    }
    if (now - start < duration) requestAnimationFrame(frame);
    else c.remove();
  }
  requestAnimationFrame(frame);
}
