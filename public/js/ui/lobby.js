// Sala de espera: jugadores en vivo, ajustes del anfitrión, chat e inicio.
import { h, clear, replace } from '../dom.js';
import { t } from '../i18n/index.js';
import { store, myId, isHost, serverNow } from '../store.js';
import { act } from '../net.js';
import { createChat } from './chat.js';
import { avatarEl } from './players.js';
import { toast } from './toast.js';

const DRAW_TIMES = [15, 30, 45, 60, 80, 100, 120, 150, 180, 210, 240];

export function mountLobby(view, { onLeave }) {
  clear(view);
  const head = h('section', { class: 'card lobby-head' });
  const playersCard = h('section', { class: 'card lobby-players' });
  const settingsCard = h('section', { class: 'card lobby-settings' });
  const chat = createChat();
  chat.setMode('lobby');
  view.append(h('div', { class: 'lobby' }, head, playersCard, settingsCard,
    h('section', { class: 'card lobby-chat' }, h('h2', {}, t('chat.title')), chat.el)));

  const link = () => `${location.origin}/?sala=${store.view.code}`;

  function renderHead() {
    const v = store.view;
    const startsIn = v.autoStartAt ? Math.max(0, Math.ceil((v.autoStartAt - serverNow()) / 1000)) : null;
    replace(head,
      h('div', {},
        h('div', { class: 'label' }, v.isPublic ? t('lobby.public') : t('lobby.code')),
        h('div', { class: 'room-code' }, v.code),
        h('p', { class: 'muted' }, v.isPublic ? (startsIn !== null ? t('lobby.startsIn', { s: startsIn }) : t('lobby.publicHint')) : t('lobby.share'))),
      h('div', { class: 'row' },
        h('button', {
          class: 'btn btn-sm', type: 'button',
          on: {
            click: async () => {
              try {
                await navigator.clipboard.writeText(link());
                toast(t('lobby.copied'), 'success');
              } catch {
                window.prompt(t('lobby.copy'), link());
              }
            },
          },
        }, `🔗 ${t('lobby.copy')}`),
        h('button', { class: 'btn btn-sm btn-danger', type: 'button', on: { click: onLeave } }, t('lobby.leave'))));
  }

  function renderPlayers() {
    const v = store.view;
    const list = h('ul', { class: 'lobby-list' }, v.players.map((p) => h('li', { class: ['lp', !p.connected && 'offline'] },
      avatarEl(p.avatar, 64),
      h('span', { class: 'lp-name' }, p.name, p.id === v.hostId ? ' 👑' : '', p.id === myId() ? h('small', {}, ` (${t('lobby.you')})`) : null),
      isHost() && p.id !== myId()
        ? h('button', { class: 'btn btn-xs btn-danger', type: 'button', on: { click: () => act('room:kick', { playerId: p.id }) } }, t('lobby.kick'))
        : null)));
    const enough = v.players.filter((p) => p.connected).length >= 2;
    replace(playersCard,
      h('h2', {}, t('lobby.players', { n: v.players.length, max: v.settings.maxPlayers })),
      list,
      isHost() && !v.isPublic
        ? h('div', { class: 'start-box' },
          h('button', { class: 'btn btn-primary btn-big', type: 'button', disabled: !enough, on: { click: () => act('room:start') } }, `🎨 ${t('lobby.start')}`),
          enough ? null : h('p', { class: 'muted' }, t('lobby.needPlayers')))
        : h('p', { class: 'muted' }, v.isPublic ? t('lobby.publicHint') : t('lobby.waiting')));
  }

  function renderSettings() {
    const v = store.view;
    const s = v.settings;
    const host = isHost() && !v.isPublic;
    const update = (patch) => act('room:settings', { patch });
    const select = (label, key, options, fmt = String) => h('label', { class: 'field' }, h('span', {}, label),
      h('select', { class: 'select', disabled: !host, on: { change: (e) => update({ [key]: Number.isNaN(Number(e.target.value)) ? e.target.value : Number(e.target.value) }) } },
        options.map((o) => h('option', { value: String(o), selected: String(o) === String(s[key]) }, fmt(o)))));
    const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
    const custom = h('textarea', {
      class: 'input textarea', rows: '3', maxlength: '6000', placeholder: t('lobby.customPh'), disabled: !host,
      'aria-label': t('lobby.customWords'),
    });
    custom.value = s.customWords.join(', ');
    custom.addEventListener('change', () => update({ customWords: custom.value }));
    const modes = ['normal', 'hidden', 'combination'];
    replace(settingsCard,
      h('h2', {}, t('lobby.settings')),
      host ? null : h('p', { class: 'muted' }, t('lobby.hostOnly')),
      h('div', { class: 'settings-grid' },
        select(t('lobby.maxPlayers'), 'maxPlayers', range(2, 20)),
        select(t('lobby.drawTime'), 'drawTime', DRAW_TIMES, (n) => t('lobby.seconds', { n })),
        select(t('lobby.rounds'), 'rounds', range(2, 10)),
        select(t('lobby.wordChoices'), 'wordChoices', range(1, 5)),
        select(t('lobby.hints'), 'hints', range(0, 5)),
        h('label', { class: 'field' }, h('span', {}, t('lobby.wordMode')),
          h('select', { class: 'select', disabled: !host, on: { change: (e) => update({ wordMode: e.target.value }) } },
            modes.map((m) => h('option', { value: m, selected: s.wordMode === m }, t(`lobby.modes.${m}`)))))),
      h('label', { class: 'field' }, h('span', {}, host ? t('lobby.customWords') : t('lobby.customCount', { n: s.customCount })), host ? custom : null),
      h('label', { class: 'check' },
        h('input', { type: 'checkbox', checked: s.customOnly, disabled: !host, on: { change: (e) => update({ customOnly: e.target.checked }) } }),
        h('span', {}, t('lobby.customOnly'))),
      h('label', { class: 'check' },
        h('input', { type: 'checkbox', checked: s.filter, disabled: !host, on: { change: (e) => update({ filter: e.target.checked }) } }),
        h('span', {}, t('lobby.filter'))),
      h('p', { class: 'muted small' }, `📚 ${t('lobby.bank', { n: '4000' })}`));
  }

  function renderAll() {
    if (!store.view) return;
    renderHead();
    renderPlayers();
    // No re-dibujar los ajustes mientras el anfitrión está escribiendo palabras.
    if (!settingsCard.contains(document.activeElement)) renderSettings();
  }

  const timer = setInterval(() => { if (store.view?.autoStartAt) renderHead(); }, 500);
  renderAll();
  return {
    update(kind, payload) {
      if (kind === 'state') renderAll();
      if (kind === 'chat') chat.append(payload);
    },
    destroy() {
      clearInterval(timer);
    },
  };
}
