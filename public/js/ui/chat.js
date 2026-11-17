// Chat único: mensajes normales, de sistema, aciertos (verde), canal secreto y "casi".
import { h, clear } from '../dom.js';
import { t } from '../i18n/index.js';
import { store, player } from '../store.js';
import { call, showError } from '../net.js';
import { AVATAR_COLORS } from '/shared/avatar.js';

export function createChat() {
  const list = h('ul', { class: 'chat-list', 'aria-live': 'polite', 'aria-relevant': 'additions' });
  const input = h('input', {
    class: 'input chat-input', maxlength: '100', autocomplete: 'off', 'aria-label': t('chat.guessPh'), placeholder: t('chat.guessPh'),
  });
  const form = h('form', {
    class: 'chat-form',
    on: {
      submit: async (e) => {
        e.preventDefault();
        const text = input.value.trim();
        if (!text) return;
        input.value = '';
        const res = await call('chat:send', { text });
        if (!res.ok) {
          if (res.error !== 'rate_limited') input.value = text;
          showError(res.error);
        }
      },
    },
  }, input, h('button', { class: 'btn btn-primary btn-sm', type: 'submit' }, t('chat.send')));
  const el = h('section', { class: 'chat', 'aria-label': t('chat.title') }, list, form);

  function line(m) {
    if (m.kind === 'system' || m.kind === 'guessed') {
      return h('li', { class: ['sys', m.kind === 'guessed' && 'ok'] }, t(`chat.system.${m.key}`, m.params || {}));
    }
    if (m.kind === 'close') return h('li', { class: 'close' }, t('chat.close', m.params || {}));
    const p = player(m.from);
    const color = p ? AVATAR_COLORS[p.avatar?.c || 0] : '#888';
    return h('li', { class: ['msg', m.kind === 'secret' && 'secret'] },
      m.kind === 'secret' ? h('span', { class: 'lock', title: t('chat.secret') }, '🔒 ') : null,
      h('b', { style: { color } }, `${p ? p.name : m.name}: `),
      h('span', {}, m.text));
  }

  function render() {
    const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 60;
    clear(list);
    for (const m of store.chat.slice(-150)) list.append(line(m));
    if (atBottom) list.scrollTop = list.scrollHeight;
  }

  function append(m) {
    const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 60;
    list.append(line(m));
    while (list.children.length > 150) list.firstChild.remove();
    if (atBottom) list.scrollTop = list.scrollHeight;
  }

  function setMode(mode) {
    const ph = t(`chat.${mode}Ph`);
    input.placeholder = ph;
    input.setAttribute('aria-label', ph);
    el.dataset.mode = mode;
  }

  render();
  return { el, render, append, setMode, input };
}
