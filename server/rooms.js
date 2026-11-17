// Gestión de salas: creación, emparejamiento público, sesiones, reconexión,
// relojes y limpieza. No conoce los sockets: entrega los mensajes por hooks.

import crypto from 'node:crypto';
import * as G from '../engine/game.js';
import { RuleError } from '../engine/util.js';
import { normalizeAvatar } from '../shared/avatar.js';
import { cleanName, cleanCode } from './sanitize.js';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const cryptoRng = () => crypto.randomInt(0, 2 ** 32) / 2 ** 32;

const ok = (extra = {}) => ({ ok: true, ...extra });
const no = (error) => ({ ok: false, error });

export class RoomManager {
  /**
   * hooks: { deliver(entry, msgs), broadcast(entry), replay(entry, pid), kicked(entry, pid) }
   */
  constructor({
    hooks,
    rng = cryptoRng,
    now = () => Date.now(),
    graceMs = Number(process.env.DISCONNECT_GRACE_MS) || 10000,
    dropMs = 3 * 60 * 1000,
    lobbyDropMs = 45 * 1000,
    idleMs = 30 * 60 * 1000,
    maxRooms = 2000,
  }) {
    Object.assign(this, { hooks, rng, now, graceMs, dropMs, lobbyDropMs, idleMs, maxRooms });
    this.rooms = new Map(); // code → { room, members: Map(pid → member) }
  }

  ctx() {
    return { now: this.now(), rng: this.rng, out: [] };
  }

  newCode() {
    for (let i = 0; i < 1000; i += 1) {
      let code = '';
      for (let j = 0; j < 5; j += 1) code += CODE_ALPHABET[crypto.randomInt(0, CODE_ALPHABET.length)];
      if (!this.rooms.has(code)) return code;
    }
    throw new Error('no_codes');
  }

  get(code) {
    const c = cleanCode(code);
    return c ? this.rooms.get(c) || null : null;
  }

  /** Ejecuta una operación del motor, entrega mensajes y difunde el estado si cambió. */
  run(entry, fn) {
    const ctx = this.ctx();
    const before = entry.room.version;
    try {
      const result = fn(ctx);
      this.flush(entry, ctx, before);
      return ok(result && typeof result === 'object' ? { result } : {});
    } catch (e) {
      if (e instanceof RuleError) {
        this.flush(entry, ctx, before);
        return no(e.code);
      }
      throw e;
    }
  }

  flush(entry, ctx, before) {
    if (ctx.out.length) {
      for (const m of ctx.out) if (m.type === 'kicked') this.hooks.kicked(entry, m.to[0]);
      this.hooks.deliver(entry, ctx.out.filter((m) => m.type !== 'kicked'));
    }
    if (entry.room.version !== before) this.hooks.broadcast(entry);
  }

  createEntry(isPublic) {
    if (this.rooms.size >= this.maxRooms) return null;
    const code = this.newCode();
    const room = G.createRoom({ code, isPublic }, this.ctx());
    const entry = { room, members: new Map() };
    this.rooms.set(code, entry);
    return entry;
  }

  addMember(entry, { name, avatar }) {
    const n = cleanName(name);
    if (!n) return no('invalid_name');
    const id = `p_${crypto.randomBytes(5).toString('hex')}`;
    const secret = crypto.randomBytes(18).toString('hex');
    let finalName = n;
    let k = 2;
    while (entry.room.players.some((p) => p.name.toLowerCase() === finalName.toLowerCase())) finalName = `${n.slice(0, 17)} ${k++}`;
    const res = this.run(entry, (ctx) => G.addPlayer(entry.room, { id, name: finalName, avatar: normalizeAvatar(avatar) }, ctx));
    if (!res.ok) return res;
    entry.members.set(id, { secret, socketId: null, disconnectedAt: null, graceHandled: false });
    return ok({ entry, playerId: id, secret });
  }

  create({ name, avatar, isPublic = false }) {
    const entry = this.createEntry(isPublic);
    if (!entry) return no('server_full');
    const res = this.addMember(entry, { name, avatar });
    if (!res.ok) this.rooms.delete(entry.room.code);
    return res;
  }

  join({ code, name, avatar }) {
    const entry = this.get(code);
    if (!entry) return no('room_not_found');
    return this.addMember(entry, { name, avatar });
  }

  /** "Jugar": sala pública con lugar (prefiere la más llena), o una nueva. */
  play({ name, avatar }) {
    const candidates = [...this.rooms.values()]
      .filter((e) => e.room.isPublic && e.room.players.length < e.room.settings.maxPlayers && e.room.phase !== 'gameOver')
      .sort((a, b) => b.room.players.length - a.room.players.length);
    for (const entry of candidates) {
      const res = this.addMember(entry, { name, avatar });
      if (res.ok) return res;
    }
    return this.create({ name, avatar, isPublic: true });
  }

  resume({ code, playerId, secret }) {
    const entry = this.get(code);
    if (!entry) return no('room_not_found');
    const m = entry.members.get(playerId);
    if (!m || typeof secret !== 'string' || !safeEqual(m.secret, secret) || !G.getPlayer(entry.room, playerId)) {
      return no('invalid_session');
    }
    return ok({ entry, playerId, secret });
  }

  setConnected(entry, pid, isConnected, socketId = null) {
    const m = entry.members.get(pid);
    if (!m) return;
    m.socketId = isConnected ? socketId : null;
    if (isConnected) {
      const wasAway = Boolean(m.disconnectedAt);
      m.disconnectedAt = null;
      m.graceHandled = false;
      const p = G.getPlayer(entry.room, pid);
      if (p && !p.connected) this.run(entry, (ctx) => G.setConnected(entry.room, pid, true, ctx));
      else if (wasAway) this.hooks.broadcast(entry);
      this.hooks.replay(entry, pid);
    } else {
      m.disconnectedAt = this.now();
      this.run(entry, (ctx) => G.setConnected(entry.room, pid, false, ctx));
    }
  }

  leave(entry, pid) {
    entry.members.delete(pid);
    this.run(entry, (ctx) => G.removePlayer(entry.room, pid, ctx));
    if (!entry.room.players.length) this.rooms.delete(entry.room.code);
  }

  op(entry, pid, fn) {
    if (!G.getPlayer(entry.room, pid)) return no('not_in_room');
    entry.room.lastActivity = this.now();
    return this.run(entry, (ctx) => fn(entry.room, ctx));
  }

  tick() {
    const now = this.now();
    for (const entry of [...this.rooms.values()]) {
      try {
        this.tickEntry(entry, now);
      } catch (e) {
        console.error(`[tick] sala ${entry.room.code}:`, e);
      }
    }
  }

  tickEntry(entry, now) {
    const { room } = entry;
    for (const [pid, m] of entry.members) {
      if (!m.disconnectedAt) continue;
      const away = now - m.disconnectedAt;
      if (!m.graceHandled && away >= this.graceMs) {
        m.graceHandled = true;
        this.run(entry, (ctx) => G.handleDisconnectTimeout(room, pid, ctx));
      }
      const limit = room.phase === 'lobby' ? this.lobbyDropMs : this.dropMs;
      if (away >= limit) {
        entry.members.delete(pid);
        this.run(entry, (ctx) => G.removePlayer(room, pid, ctx));
      }
    }
    this.run(entry, (ctx) => G.tick(room, ctx));
    const online = room.players.some((p) => p.connected);
    if (!room.players.length || (!online && now - room.lastActivity > this.idleMs)) this.rooms.delete(room.code);
  }

  stats() {
    let players = 0;
    const publicRooms = [];
    for (const { room } of this.rooms.values()) {
      const n = room.players.filter((p) => p.connected).length;
      players += n;
      if (room.isPublic) publicRooms.push({ players: n, max: room.settings.maxPlayers, phase: room.phase });
    }
    return { players, rooms: this.rooms.size, publicRooms };
  }
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
