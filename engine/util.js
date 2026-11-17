// Utilidades del motor.

export class RuleError extends Error {
  constructor(code, params = {}) {
    super(code);
    this.name = 'RuleError';
    this.code = code;
    this.params = params;
  }
}

export function fail(code, params) {
  throw new RuleError(code, params);
}

/** Generador determinista (mulberry32). */
export function seededRng(seed = 1) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(list, rng) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function pickOne(list, rng) {
  return list[Math.floor(rng() * list.length)];
}

export function clampInt(value, min, max, fallback) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** Contexto de una operación: reloj, azar y bandeja de salida de mensajes. */
export function makeCtx({ now = Date.now(), rng = Math.random } = {}) {
  return { now, rng, out: [] };
}

/**
 * Encola un mensaje para el transporte.
 * to: 'all' | string[] (ids de jugadores) | { except: id }
 */
export function send(ctx, to, type, data) {
  ctx.out.push({ to, type, data });
}
