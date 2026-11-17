// Estado del cliente: solo lo que manda el servidor + preferencias locales.
const SESSION_KEY = 'pintortillo.session';

export const store = {
  session: null, // { code, playerId, secret }
  view: null, // room:state (vista personal)
  chat: [],
  serverOffset: 0,
  replay: null, // último historial de dibujo recibido (para quien entra tarde)
  connected: false,
};

const listeners = new Set();

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function notify(kind, payload) {
  for (const fn of listeners) fn(kind, payload);
}

export function loadSession() {
  try {
    store.session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
  } catch {
    store.session = null;
  }
  return store.session;
}

export function saveSession(s) {
  store.session = s;
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch { /* */ }
}

export function clearSession() {
  store.session = null;
  store.view = null;
  store.chat = [];
  try { localStorage.removeItem(SESSION_KEY); } catch { /* */ }
}

export function prefs(key, fallback) {
  try {
    const v = localStorage.getItem(`pintortillo.${key}`);
    return v === null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
}

export function setPref(key, value) {
  try { localStorage.setItem(`pintortillo.${key}`, JSON.stringify(value)); } catch { /* */ }
}

export const myId = () => store.view?.me || store.session?.playerId || null;
export const player = (id) => store.view?.players.find((p) => p.id === id) || null;
export const isHost = () => store.view && store.view.hostId === myId();
export const isDrawer = () => Boolean(store.view?.turn && store.view.turn.drawerId === myId());
export const hasGuessed = () => Boolean(store.view?.turn?.guessed.some((g) => g.id === myId()));
export const serverNow = () => Date.now() + store.serverOffset;
