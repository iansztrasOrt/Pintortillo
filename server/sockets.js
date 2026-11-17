// Capa Socket.IO: valida, limita la tasa y traduce eventos ↔ RoomManager.
import * as G from '../engine/game.js';
import { RoomManager } from './rooms.js';
import { createLimiters } from './rateLimit.js';

const channel = (code) => `room:${code}`;

export function attachSockets(io, { quiet = false, managerOptions = {} } = {}) {
  const sockets = new Map(); // `${code}:${pid}` → socket.id
  const sid = (code, pid) => sockets.get(`${code}:${pid}`);
  const socketOf = (code, pid) => {
    const id = sid(code, pid);
    return id ? io.sockets.sockets.get(id) : null;
  };

  function sendView(entry, pid) {
    const s = socketOf(entry.room.code, pid);
    if (s) s.emit('room:state', G.viewFor(entry.room, pid, Date.now()));
  }

  const hooks = {
    broadcast(entry) {
      for (const p of entry.room.players) sendView(entry, p.id);
    },
    deliver(entry, msgs) {
      const code = entry.room.code;
      for (const m of msgs) {
        const event = m.type === 'chat' ? 'chat:message' : m.type === 'draw' ? 'draw:cmds' : 'game:event';
        if (m.to === 'all') io.to(channel(code)).emit(event, m.data);
        else if (Array.isArray(m.to)) {
          for (const pid of m.to) socketOf(code, pid)?.emit(event, m.data);
        } else if (m.to && m.to.except) {
          const except = sid(code, m.to.except);
          const target = io.to(channel(code));
          (except ? target.except(except) : target).emit(event, m.data);
        }
      }
    },
    replay(entry, pid) {
      const s = socketOf(entry.room.code, pid);
      if (s) s.emit('draw:replay', G.drawingSnapshot(entry.room));
    },
    kicked(entry, pid) {
      const s = socketOf(entry.room.code, pid);
      if (s) {
        s.emit('room:kicked');
        s.leave(channel(entry.room.code));
        s.data = {};
      }
      sockets.delete(`${entry.room.code}:${pid}`);
    },
  };

  const manager = new RoomManager({ hooks, ...managerOptions });

  function bind(socket, entry, pid) {
    const code = entry.room.code;
    const prev = socketOf(code, pid);
    if (prev && prev.id !== socket.id) {
      prev.emit('session:replaced');
      prev.leave(channel(code));
      prev.data = {};
    }
    if (socket.data.code) unbind(socket);
    sockets.set(`${code}:${pid}`, socket.id);
    socket.data = { code, pid };
    socket.join(channel(code));
    manager.setConnected(entry, pid, true, socket.id);
    sendView(entry, pid);
  }

  function unbind(socket) {
    const { code, pid } = socket.data || {};
    socket.data = {};
    if (!code) return;
    socket.leave(channel(code));
    if (sid(code, pid) !== socket.id) return;
    sockets.delete(`${code}:${pid}`);
    const entry = manager.rooms.get(code);
    if (entry) manager.setConnected(entry, pid, false);
  }

  io.on('connection', (socket) => {
    socket.data = {};
    const limits = createLimiters();
    const current = () => {
      const { code, pid } = socket.data;
      const entry = code ? manager.rooms.get(code) : null;
      return entry ? { entry, pid } : null;
    };

    function on(event, handler, { limiter = 'actions', needsRoom = true } = {}) {
      socket.on(event, (payload, ack) => {
        const reply = typeof ack === 'function' ? ack : () => {};
        if (!limits[limiter].take()) {
          reply({ ok: false, error: 'rate_limited' });
          return;
        }
        try {
          let res;
          if (needsRoom) {
            const c = current();
            if (!c) {
              reply({ ok: false, error: 'no_session' });
              return;
            }
            res = handler(payload ?? {}, c) || { ok: true };
          } else {
            res = handler(payload ?? {}) || { ok: true };
          }
          if (!res.ok && !quiet) console.warn(`[rechazado] ${event} → ${res.error}`);
          reply(publicResult(res));
        } catch (e) {
          console.error(`[socket] ${event}`, e);
          reply({ ok: false, error: 'server_error' });
        }
      });
    }

    const enter = (res) => {
      if (!res.ok) return res;
      bind(socket, res.entry, res.playerId);
      return { ok: true, code: res.entry.room.code, playerId: res.playerId, secret: res.secret };
    };

    on('room:play', (p) => enter(manager.play(p)), { needsRoom: false });
    on('room:create', (p) => enter(manager.create({ ...p, isPublic: false })), { needsRoom: false });
    on('room:join', (p) => enter(manager.join(p)), { needsRoom: false });
    on('session:resume', (p) => enter(manager.resume(p)), { needsRoom: false });
    on('stats', () => ({ ok: true, stats: manager.stats() }), { needsRoom: false });

    on('room:leave', (p, { entry, pid }) => {
      sockets.delete(`${entry.room.code}:${pid}`);
      socket.leave(channel(entry.room.code));
      socket.data = {};
      manager.leave(entry, pid);
      return { ok: true };
    });
    on('room:settings', ({ patch }, { entry, pid }) => manager.op(entry, pid, (room, ctx) => G.updateSettings(room, pid, patch, ctx)));
    on('room:start', (p, { entry, pid }) => manager.op(entry, pid, (room, ctx) => G.startGame(room, pid, ctx)));
    on('room:kick', ({ playerId }, { entry, pid }) => manager.op(entry, pid, (room, ctx) => G.hostKick(room, pid, playerId, ctx)));
    on('room:again', (p, { entry, pid }) => manager.op(entry, pid, (room, ctx) => G.playAgain(room, pid, ctx)));
    on('game:choose', ({ index }, { entry, pid }) => manager.op(entry, pid, (room, ctx) => G.chooseWord(room, pid, index, ctx)));
    on('game:vote', ({ value }, { entry, pid }) => manager.op(entry, pid, (room, ctx) => G.vote(room, pid, Number(value), ctx)));
    on('game:votekick', ({ playerId }, { entry, pid }) => manager.op(entry, pid, (room, ctx) => G.voteKick(room, pid, playerId, ctx)));
    on('chat:send', ({ text }, { entry, pid }) => manager.op(entry, pid, (room, ctx) => {
      G.chat(room, pid, typeof text === 'string' ? text.slice(0, 300) : '', ctx);
    }), { limiter: 'chat' });

    // Dibujo: alta frecuencia, sin ack. Solo el dibujante activo (lo valida el motor).
    socket.on('draw', (cmds) => {
      if (!limits.draw.take()) return;
      const c = current();
      if (!c) return;
      const res = manager.op(c.entry, c.pid, (room, ctx) => G.draw(room, c.pid, cmds, ctx));
      if (!res.ok && !quiet) console.warn(`[dibujo rechazado] ${c.pid} → ${res.error}`);
    });

    socket.on('disconnect', () => unbind(socket));
  });

  return manager;
}

function publicResult(res) {
  const out = { ok: res.ok };
  for (const k of ['error', 'code', 'playerId', 'secret', 'stats']) if (res[k] !== undefined) out[k] = res[k];
  return out;
}
