// Comandos de dibujo: validación (servidor) e historial (servidor y clientes).
// Módulo puro: lo importan el servidor, los tests y el navegador.
//
// Lienzo lógico fijo de 800×600; todas las coordenadas viajan en ese sistema.
// Comandos compactos:
//   { t:'s', id, tool, c, a, w, sym, p:[x,y,pr, ...] }  inicio de trazo
//   { t:'p', id, p:[...] }                              más puntos del trazo
//   { t:'e', id }                                       fin de trazo
//   { t:'f', x, y, c, tol }                             balde de pintura
//   { t:'sh', k, x1, y1, x2, y2, c, w, a, fill, sym }  forma
//   { t:'clr' } · { t:'undo' } · { t:'redo' }

export const W = 800;
export const H = 600;
export const TOOLS = ['pen', 'eraser', 'highlighter', 'spray', 'dashed'];
export const SHAPES = ['line', 'rect', 'ellipse', 'tri'];
export const MAX_POINTS_PER_CMD = 240; // tríos (x, y, presión)
export const MAX_ACTIONS = 4000;
export const MAX_TOTAL_POINTS = 200000;

const COLOR = /^#[0-9a-f]{6}$/;

class DrawError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function bad(code = 'invalid_draw') {
  throw new DrawError(code);
}

function num(v, min, max, decimals = 0) {
  const n = Number(v);
  if (!Number.isFinite(n)) bad();
  const f = 10 ** decimals;
  return Math.round(Math.min(max, Math.max(min, n)) * f) / f;
}

function color(c) {
  const s = String(c || '').toLowerCase();
  if (!COLOR.test(s)) bad();
  return s;
}

function points(p) {
  if (!Array.isArray(p) || p.length === 0 || p.length % 3 !== 0 || p.length > MAX_POINTS_PER_CMD * 3) bad();
  const out = new Array(p.length);
  for (let i = 0; i < p.length; i += 3) {
    out[i] = num(p[i], 0, W - 0.1, 1);
    out[i + 1] = num(p[i + 1], 0, H - 0.1, 1);
    out[i + 2] = num(p[i + 2], 0, 1, 2);
  }
  return out;
}

/** Valida y normaliza un comando; lanza DrawError si es inválido. */
export function validateCommand(cmd) {
  if (!cmd || typeof cmd !== 'object') bad();
  switch (cmd.t) {
    case 's':
      if (!TOOLS.includes(cmd.tool)) bad();
      return {
        t: 's', id: num(cmd.id, 1, 1e9), tool: cmd.tool, c: color(cmd.c), a: num(cmd.a, 0.05, 1, 2),
        w: num(cmd.w, 1, 100), sym: Boolean(cmd.sym), p: points(cmd.p),
      };
    case 'p':
      return { t: 'p', id: num(cmd.id, 1, 1e9), p: points(cmd.p) };
    case 'e':
      return { t: 'e', id: num(cmd.id, 1, 1e9) };
    case 'f':
      return { t: 'f', x: num(cmd.x, 0, W - 1), y: num(cmd.y, 0, H - 1), c: color(cmd.c), tol: num(cmd.tol, 0, 128) };
    case 'sh':
      if (!SHAPES.includes(cmd.k)) bad();
      return {
        t: 'sh', k: cmd.k,
        x1: num(cmd.x1, 0, W - 1), y1: num(cmd.y1, 0, H - 1), x2: num(cmd.x2, 0, W - 1), y2: num(cmd.y2, 0, H - 1),
        c: color(cmd.c), w: num(cmd.w, 1, 100), a: num(cmd.a, 0.05, 1, 2), fill: Boolean(cmd.fill), sym: Boolean(cmd.sym),
      };
    case 'clr':
    case 'undo':
    case 'redo':
      return { t: cmd.t };
    default:
      return bad();
  }
}

export function newDrawing() {
  return { actions: [], redo: [], open: null, totalPoints: 0 };
}

function closeOpen(d) {
  d.open = null;
}

/**
 * Aplica un comando (ya validado) al historial. Devuelve true si cambió algo.
 * Servidor y clientes usan esta MISMA función, así el historial es idéntico.
 */
export function applyCommand(d, cmd) {
  switch (cmd.t) {
    case 's':
      if (d.actions.length >= MAX_ACTIONS || d.totalPoints + cmd.p.length / 3 > MAX_TOTAL_POINTS) return false;
      closeOpen(d);
      d.actions.push({
        k: 'stroke', id: cmd.id, tool: cmd.tool, c: cmd.c, a: cmd.a, w: cmd.w, sym: cmd.sym, p: [...cmd.p],
      });
      d.totalPoints += cmd.p.length / 3;
      d.open = cmd.id;
      d.redo = [];
      return true;
    case 'p': {
      if (d.open !== cmd.id) return false;
      if (d.totalPoints + cmd.p.length / 3 > MAX_TOTAL_POINTS) return false;
      const last = d.actions[d.actions.length - 1];
      if (!last || last.k !== 'stroke' || last.id !== cmd.id) return false;
      for (const v of cmd.p) last.p.push(v);
      d.totalPoints += cmd.p.length / 3;
      return true;
    }
    case 'e':
      if (d.open !== cmd.id) return false;
      d.open = null;
      return true;
    case 'f':
      if (d.actions.length >= MAX_ACTIONS) return false;
      closeOpen(d);
      d.actions.push({ k: 'fill', x: cmd.x, y: cmd.y, c: cmd.c, tol: cmd.tol });
      d.redo = [];
      return true;
    case 'sh': {
      if (d.actions.length >= MAX_ACTIONS) return false;
      closeOpen(d);
      const { t, ...rest } = cmd;
      d.actions.push({ ...rest, k: 'shape', shape: cmd.k });
      d.redo = [];
      return true;
    }
    case 'clr':
      if (d.actions.length >= MAX_ACTIONS) return false;
      closeOpen(d);
      d.actions.push({ k: 'clear' });
      d.redo = [];
      return true;
    case 'undo':
      closeOpen(d);
      if (!d.actions.length) return false;
      d.redo.push(d.actions.pop());
      return true;
    case 'redo':
      closeOpen(d);
      if (!d.redo.length) return false;
      d.actions.push(d.redo.pop());
      return true;
    default:
      return false;
  }
}

export { DrawError };
