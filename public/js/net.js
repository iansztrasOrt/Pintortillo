// Conexión Socket.IO: envía intenciones, recibe estado. Nunca decide nada.
import { store, notify, saveSession, clearSession, loadSession } from './store.js';
import { t } from './i18n/index.js';
import { toast } from './ui/toast.js';

let socket = null;

export function connect() {
  // eslint-disable-next-line no-undef
  socket = io({ transports: ['websocket', 'polling'] });

  socket.on('connect', async () => {
    store.connected = true;
    notify('conn');
    const s = loadSession();
    if (s) {
      const res = await call('session:resume', s);
      if (!res.ok) {
        clearSession();
        notify('route');
      }
    }
  });
  socket.on('disconnect', () => {
    store.connected = false;
    notify('conn');
  });
  socket.on('room:state', (view) => {
    const prev = store.view;
    store.serverOffset = view.serverNow - Date.now();
    store.view = view;
    notify('state', { prev });
  });
  socket.on('chat:message', (msg) => {
    store.chat.push(msg);
    if (store.chat.length > 200) store.chat.shift();
    notify('chat', msg);
  });
  socket.on('game:event', (ev) => notify('event', ev));
  socket.on('draw:cmds', (cmds) => notify('draw', cmds));
  socket.on('draw:replay', (snap) => {
    store.replay = snap;
    notify('replay', snap);
  });
  socket.on('room:kicked', () => {
    clearSession();
    toast(t('conn.kicked'), 'warn');
    notify('route');
  });
  socket.on('session:replaced', () => {
    toast(t('conn.replaced'), 'warn');
    store.connected = false;
    notify('conn');
  });
}

export function call(event, payload = {}) {
  return new Promise((resolve) => {
    if (!socket) return resolve({ ok: false, error: 'no_session' });
    socket.timeout(8000).emit(event, payload, (err, res) => {
      resolve(err ? { ok: false, error: 'timeout' } : res || { ok: false, error: 'server_error' });
    });
  });
}

/** Igual que call, pero muestra el error si falla. */
export async function act(event, payload) {
  const res = await call(event, payload);
  if (!res.ok) showError(res.error);
  return res;
}

export function showError(code) {
  const key = `errors.${code}`;
  const msg = t(key);
  toast(msg === key ? t('errors.generic', { code }) : msg, 'error');
}

export function sendDraw(cmds) {
  if (socket && cmds.length) socket.emit('draw', cmds);
}

export async function enterRoom(event, payload) {
  const res = await call(event, payload);
  if (res.ok) {
    store.chat = [];
    saveSession({ code: res.code, playerId: res.playerId, secret: res.secret });
    notify('route');
  } else {
    showError(res.error);
  }
  return res;
}
