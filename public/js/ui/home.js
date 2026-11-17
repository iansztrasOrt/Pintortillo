// Inicio: nombre, avatar personalizable y Jugar / Crear sala / Unirse.
import { h, clear } from '../dom.js';
import { t } from '../i18n/index.js';
import { prefs, setPref } from '../store.js';
import { enterRoom, call } from '../net.js';
import { avatarSvg, PARTS, randomAvatar, normalizeAvatar } from '/shared/avatar.js';

export function mountHome(view) {
  clear(view);
  const params = new URLSearchParams(location.search);
  const invited = (params.get('sala') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  let avatar = normalizeAvatar(prefs('avatar', randomAvatar()));

  const nameInput = h('input', {
    class: 'input', id: 'name', maxlength: '20', autocomplete: 'nickname', placeholder: t('home.namePh'), value: prefs('name', ''),
  });
  const codeInput = h('input', {
    class: 'input code', id: 'code', maxlength: '8', autocomplete: 'off', placeholder: 'ABCDE', value: invited, 'aria-label': t('home.code'),
    on: { input: () => { codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); } },
  });
  const preview = h('div', { class: 'avatar-big', 'aria-hidden': 'true' });
  const online = h('p', { class: 'online muted' });

  function drawAvatar() {
    preview.innerHTML = avatarSvg(avatar, 140);
    setPref('avatar', avatar);
  }

  function partRow(key) {
    const step = (d) => {
      avatar = { ...avatar, [key]: (avatar[key] + d + PARTS[key]) % PARTS[key] };
      drawAvatar();
    };
    return h('div', { class: 'part-row' },
      h('button', { type: 'button', class: 'arrow', 'aria-label': `${t('home.prev')} ${t(`home.part.${key}`)}`, on: { click: () => step(-1) } }, '◀'),
      h('span', {}, t(`home.part.${key}`)),
      h('button', { type: 'button', class: 'arrow', 'aria-label': `${t('home.next')} ${t(`home.part.${key}`)}`, on: { click: () => step(1) } }, '▶'));
  }

  let busy = false;
  async function go(event, extra = {}) {
    if (busy) return;
    const name = nameInput.value.trim();
    if (!name) {
      nameInput.focus();
      nameInput.classList.add('shake');
      setTimeout(() => nameInput.classList.remove('shake'), 500);
      return;
    }
    setPref('name', name);
    busy = true;
    await enterRoom(event, { name, avatar, ...extra });
    busy = false;
  }

  const editor = h('div', { class: 'avatar-editor' },
    h('div', { class: 'avatar-stage' }, preview,
      h('button', { type: 'button', class: 'btn btn-sm dice', on: { click: () => { avatar = randomAvatar(); drawAvatar(); } } }, `🎲 ${t('home.random')}`)),
    h('div', { class: 'parts' }, ['c', 'e', 'm', 'a'].map(partRow)));

  const joinForm = h('form', {
    class: 'join-row',
    on: { submit: (e) => { e.preventDefault(); if (codeInput.value.length >= 4) go('room:join', { code: codeInput.value }); else codeInput.focus(); } },
  }, codeInput, h('button', { class: 'btn btn-teal', type: 'submit' }, t('home.join')));

  view.append(h('div', { class: 'home' },
    h('div', { class: 'hero' },
      h('h1', { class: 'logo' }, ...'PintORTillo'.split('').map((ch, i) => h('span', { style: { '--i': i } }, ch))),
      h('p', { class: 'tagline' }, t('app.tagline')),
      online),
    h('section', { class: 'card home-card', 'aria-label': t('home.play') },
      invited ? h('p', { class: 'notice' }, t('home.invited', { code: invited })) : null,
      h('label', { class: 'field', for: 'name' }, h('span', {}, t('home.name')), nameInput),
      h('div', { class: 'field' }, h('span', { class: 'label' }, t('home.avatar')), editor),
      invited
        ? h('button', { class: 'btn btn-primary btn-big', type: 'button', on: { click: () => go('room:join', { code: invited }) } }, `${t('home.join')} ${invited}`)
        : h('div', { class: 'main-actions' },
          h('button', { class: 'btn btn-primary btn-big', type: 'button', title: t('home.playHint'), on: { click: () => go('room:play') } }, `🎨 ${t('home.play')}`),
          h('button', { class: 'btn btn-purple', type: 'button', on: { click: () => go('room:create') } }, `🔒 ${t('home.create')}`)),
      h('div', { class: 'divider' }, t('home.or')),
      joinForm),
    h('section', { class: 'card how' }, h('h2', {}, t('home.how')), h('p', {}, t('home.howText')))));

  drawAvatar();
  (prefs('name', '') ? (invited ? null : null) : nameInput)?.focus();
  call('stats').then((res) => {
    if (res.ok) online.textContent = t('app.online', { players: res.stats.players, rooms: res.stats.publicRooms.length });
  });
  return { update() {}, destroy() {} };
}
