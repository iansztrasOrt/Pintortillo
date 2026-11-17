// Lista de jugadores con puntaje en vivo, dibujante, aciertos y menú de expulsión.
import { h, clear } from '../dom.js';
import { t } from '../i18n/index.js';
import { store, myId, isHost } from '../store.js';
import { act } from '../net.js';
import { avatarSvg } from '/shared/avatar.js';

export function avatarEl(avatar, size = 40) {
  const span = h('span', { class: 'avatar', 'aria-hidden': 'true' });
  // El SVG se arma solo con partes predefinidas e índices numéricos validados.
  span.innerHTML = avatarSvg(avatar, size);
  return span;
}

export function createPlayers() {
  const list = h('ol', { class: 'players' });
  const el = h('section', { class: 'players-panel', 'aria-label': t('game.players') }, list);
  let openMenu = null;

  function render() {
    const v = store.view;
    if (!v) return;
    clear(list);
    const turn = v.turn;
    const ranked = [...v.players].sort((a, b) => b.score - a.score || a.joinedAt - b.joinedAt);
    ranked.forEach((p, i) => {
      const drawing = turn && turn.drawerId === p.id;
      const guessed = turn && turn.guessed.some((g) => g.id === p.id);
      const gained = turn ? (turn.turnPoints?.[p.id] ?? turn.guessed.find((g) => g.id === p.id)?.points) : null;
      const me = p.id === myId();
      const row = h('li', {
        class: ['player', drawing && 'drawing', guessed && 'guessed', !p.connected && 'offline', me && 'me'],
        'aria-label': `${p.name}, ${p.score} puntos${drawing ? `, ${t('game.drawing')}` : ''}${guessed ? `, ${t('game.guessed')}` : ''}`,
      },
      h('span', { class: 'rank' }, `#${i + 1}`),
      avatarEl(p.avatar, 42),
      h('div', { class: 'pinfo' },
        h('div', { class: 'pname' }, p.name, me ? h('small', {}, ` (${t('lobby.you')})`) : null,
          p.id === v.hostId ? h('span', { class: 'crown', title: t('lobby.host') }, ' 👑') : null),
        h('div', { class: 'pscore' }, `${p.score} pts`,
          gained ? h('span', { class: 'gain' }, ` +${gained}`) : null,
          p.kickVotes ? h('span', { class: 'kv', title: t('game.kickVotes', { n: p.kickVotes }) }, ` 🚫${p.kickVotes}`) : null)),
      h('span', { class: 'pstate', 'aria-hidden': 'true' }, drawing ? '✏️' : guessed ? '✅' : !p.connected ? '📴' : ''));
      if (!me) {
        row.tabIndex = 0;
        row.addEventListener('click', () => toggleMenu(row, p));
        row.addEventListener('keydown', (e) => { if (e.key === 'Enter') toggleMenu(row, p); });
      }
      list.append(row);
    });
  }

  function toggleMenu(row, p) {
    if (openMenu) {
      openMenu.remove();
      const same = openMenu.dataset.id === p.id;
      openMenu = null;
      if (same) return;
    }
    const menu = h('div', { class: 'pmenu', dataset: { id: p.id } },
      h('button', {
        type: 'button', class: 'btn btn-sm', disabled: p.iVotedKick,
        on: { click: () => { act('game:votekick', { playerId: p.id }); menu.remove(); openMenu = null; } },
      }, `🚫 ${t('game.voteKick')}`),
      isHost() ? h('button', {
        type: 'button', class: 'btn btn-sm btn-danger',
        on: { click: () => { act('room:kick', { playerId: p.id }); menu.remove(); openMenu = null; } },
      }, t('game.kick')) : null);
    row.after(menu);
    openMenu = menu;
  }

  render();
  return { el, render };
}
