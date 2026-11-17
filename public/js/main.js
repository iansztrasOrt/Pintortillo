// Arranque y router de pantallas: inicio → sala de espera → partida.
import { store, subscribe, loadSession, clearSession, prefs, setPref } from './store.js';
import { connect, call } from './net.js';
import { t } from './i18n/index.js';
import { isMuted, setMuted, getVolume, setVolume } from './audio.js';
import { h, clear } from './dom.js';
import { mountHome } from './ui/home.js';
import { mountLobby } from './ui/lobby.js';
import { mountGame } from './ui/game.js';

const view = document.getElementById('view');
let screen = null;
let screenName = null;

function desired() {
  if (!store.session) return 'home';
  if (!store.view) return 'loading';
  return store.view.phase === 'lobby' ? 'lobby' : 'game';
}

async function leave() {
  await call('room:leave');
  clearSession();
  history.replaceState(null, '', '/');
  route();
}

function route() {
  const next = desired();
  if (next === screenName) return false;
  screen?.destroy?.();
  screenName = next;
  document.body.dataset.screen = next;
  if (next === 'home') screen = mountHome(view);
  else if (next === 'lobby') screen = mountLobby(view, { onLeave: leave });
  else if (next === 'game') screen = mountGame(view, { onLeave: leave });
  else {
    clear(view).append(h('p', { class: 'loading' }, '🎨…'));
    screen = null;
  }
  return true;
}

subscribe((kind, payload) => {
  if (kind === 'route' || kind === 'state') {
    if (route() && kind === 'route') return;
  }
  if (kind === 'conn') {
    document.getElementById('conn').textContent = store.connected || !store.session ? '' : t('conn.offline');
  }
  screen?.update?.(kind, payload);
});

// ---------------------------------------------------------------- tema y sonido
const themeBtn = document.getElementById('theme-toggle');
let theme = prefs('theme', window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
function applyTheme() {
  document.documentElement.dataset.theme = theme;
  themeBtn.textContent = theme === 'dark' ? '☀️' : '🌙';
}
themeBtn.addEventListener('click', () => {
  theme = theme === 'dark' ? 'light' : 'dark';
  setPref('theme', theme);
  applyTheme();
});
applyTheme();

const soundBtn = document.getElementById('sound-toggle');
const vol = document.getElementById('volume');
function renderSound() {
  soundBtn.textContent = isMuted() ? '🔇' : '🔊';
  soundBtn.setAttribute('aria-pressed', String(isMuted()));
  vol.value = String(Math.round(getVolume() * 100));
}
soundBtn.addEventListener('click', () => {
  setMuted(!isMuted());
  renderSound();
});
vol.addEventListener('input', () => {
  setVolume(Number(vol.value) / 100);
  if (isMuted() && Number(vol.value) > 0) setMuted(false);
  renderSound();
});
renderSound();

loadSession();
route();
connect();
