import * as G from '../engine/game.js';
import { seededRng } from '../engine/util.js';

export const T0 = 1_000_000;

/** Reloj controlable + rng determinista + bandeja de salida. */
export function clock(seed = 1) {
  const c = { now: T0, rng: seededRng(seed), out: [] };
  c.ctx = () => {
    c.out = [];
    return { now: c.now, rng: c.rng, out: c.out };
  };
  c.advance = (ms) => {
    c.now += ms;
  };
  return c;
}

/** Sala con N jugadores (p1 anfitrión). */
export function roomWith(n = 3, settings = {}, c = clock()) {
  const room = G.createRoom({ code: 'TEST1', settings }, c.ctx());
  for (let i = 1; i <= n; i += 1) {
    c.advance(10);
    G.addPlayer(room, { id: `p${i}`, name: `Jugador ${i}`, avatar: { c: i, e: 0, m: 0, a: 0 } }, c.ctx());
  }
  return { room, c };
}

export function startAndChoose(room, c, index = 0) {
  G.startGame(room, 'p1', c.ctx());
  if (room.turn.phase === 'choosing') G.chooseWord(room, room.turn.drawerId, index, c.ctx());
  return room.turn;
}

/** Mensajes de la última operación dirigidos a un jugador. */
export function delivered(out, pid) {
  return out.filter((m) => m.to === 'all' || (Array.isArray(m.to) && m.to.includes(pid)) || (m.to && m.to.except && m.to.except !== pid));
}

export const p = (room, id) => room.players.find((x) => x.id === id);
