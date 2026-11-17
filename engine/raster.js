// Rasterizador por software, DETERMINISTA: dado el mismo historial, produce
// exactamente los mismos píxeles en cualquier navegador (y en Node, para los
// tests). Por eso el balde de pintura da el mismo resultado en todos lados.
// Solo usa +, −, ×, ÷ y sqrt (exactos en IEEE-754); nada de sin/cos.

import { W, H } from './drawing.js';

const rgbCache = new Map();
export function rgb(hex) {
  let v = rgbCache.get(hex);
  if (!v) {
    const n = parseInt(hex.slice(1), 16);
    v = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    rgbCache.set(hex, v);
  }
  return v;
}

function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const circleCache = new Map();
/** Desplazamientos enteros (dx, dy) dentro de un círculo de radio r. */
function circleOffsets(r) {
  const key = Math.round(r * 2);
  let offs = circleCache.get(key);
  if (!offs) {
    const R = key / 2;
    const lim = Math.ceil(R);
    const list = [];
    for (let dy = -lim; dy <= lim; dy += 1) {
      for (let dx = -lim; dx <= lim; dx += 1) {
        if (dx * dx + dy * dy <= R * R + 0.25) list.push(dx, dy);
      }
    }
    offs = new Int16Array(list);
    circleCache.set(key, offs);
  }
  return offs;
}

const WHITE = [255, 255, 255];

export class Raster {
  constructor(w = W, h = H) {
    this.w = w;
    this.h = h;
    this.data = new Uint8ClampedArray(w * h * 4);
    this.maskStamp = new Uint32Array(w * h);
    this.token = 0;
    this.strokes = new Map();
    this.dirty = null;
    this.clear();
  }

  // ---------------------------------------------------------------- utilidades

  clear() {
    this.data.fill(255);
    this.markDirty(0, 0, this.w - 1, this.h - 1);
  }

  markDirty(x0, y0, x1, y1) {
    const a = Math.max(0, Math.floor(Math.min(x0, x1)));
    const b = Math.max(0, Math.floor(Math.min(y0, y1)));
    const c = Math.min(this.w - 1, Math.ceil(Math.max(x0, x1)));
    const d = Math.min(this.h - 1, Math.ceil(Math.max(y0, y1)));
    if (c < a || d < b) return;
    if (!this.dirty) this.dirty = { x0: a, y0: b, x1: c, y1: d };
    else {
      this.dirty.x0 = Math.min(this.dirty.x0, a);
      this.dirty.y0 = Math.min(this.dirty.y0, b);
      this.dirty.x1 = Math.max(this.dirty.x1, c);
      this.dirty.y1 = Math.max(this.dirty.y1, d);
    }
  }

  takeDirty() {
    const d = this.dirty;
    this.dirty = null;
    return d;
  }

  newToken() {
    this.token = (this.token + 1) >>> 0;
    if (this.token === 0) {
      this.maskStamp.fill(0);
      this.token = 1;
    }
    return this.token;
  }

  /** Mezcla un píxel. Con `token`, cada píxel se pinta UNA vez por trazo (opacidad pareja). */
  blend(idx, col, alpha, token) {
    if (token) {
      if (this.maskStamp[idx] === token) return;
      this.maskStamp[idx] = token;
    }
    const d = this.data;
    const i = idx * 4;
    if (alpha >= 1) {
      d[i] = col[0];
      d[i + 1] = col[1];
      d[i + 2] = col[2];
      return;
    }
    const k = 1 - alpha;
    d[i] = Math.round(col[0] * alpha + d[i] * k);
    d[i + 1] = Math.round(col[1] * alpha + d[i + 1] * k);
    d[i + 2] = Math.round(col[2] * alpha + d[i + 2] * k);
  }

  stamp(cx, cy, r, col, alpha, token) {
    const ix = Math.round(cx);
    const iy = Math.round(cy);
    const offs = circleOffsets(Math.max(0.5, r));
    const { w, h } = this;
    for (let i = 0; i < offs.length; i += 2) {
      const x = ix + offs[i];
      const y = iy + offs[i + 1];
      if (x >= 0 && y >= 0 && x < w && y < h) this.blend(y * w + x, col, alpha, token);
    }
    const R = Math.ceil(r) + 1;
    this.markDirty(ix - R, iy - R, ix + R, iy + R);
  }

  getPixelHex(x, y) {
    const ix = Math.min(this.w - 1, Math.max(0, Math.round(x)));
    const iy = Math.min(this.h - 1, Math.max(0, Math.round(y)));
    const i = (iy * this.w + ix) * 4;
    return `#${[this.data[i], this.data[i + 1], this.data[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  }

  /** Huella del lienzo (para tests de determinismo). */
  hash() {
    let h = 2166136261;
    const d = this.data;
    for (let i = 0; i < d.length; i += 1) {
      h ^= d[i];
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16);
  }

  // ---------------------------------------------------------------- trazos

  strokeStart(action) {
    const tool = action.tool;
    const st = {
      action,
      n: 0,
      sinceStamp: 0,
      total: 0,
      stampIdx: 0,
      prev: null,
      token: tool === 'spray' ? 0 : this.newToken(),
      col: tool === 'eraser' ? WHITE : rgb(action.c),
      alpha: tool === 'eraser' ? 1 : tool === 'highlighter' ? action.a * 0.35 : action.a,
    };
    this.strokes.set(action.id, st);
    this.strokeContinue(action.id);
    return st;
  }

  strokeContinue(id) {
    const st = this.strokes.get(id);
    if (!st) return;
    const count = st.action.p.length / 3;
    while (st.n < count) {
      this.processPoint(st, st.n);
      st.n += 1;
    }
  }

  strokeEnd(id) {
    const st = this.strokes.get(id);
    if (!st) return;
    this.strokeContinue(id);
    if (st.n >= 2) this.segmentLine(st, this.mid(st, st.n - 2, st.n - 1), this.pt(st, st.n - 1));
    this.strokes.delete(id);
  }

  endAllStrokes() {
    for (const id of [...this.strokes.keys()]) this.strokeEnd(id);
  }

  pt(st, k) {
    const p = st.action.p;
    return { x: p[k * 3], y: p[k * 3 + 1], pr: p[k * 3 + 2] };
  }

  mid(st, a, b) {
    const A = this.pt(st, a);
    const B = this.pt(st, b);
    return { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2, pr: (A.pr + B.pr) / 2 };
  }

  processPoint(st, k) {
    if (k === 0) {
      const P = this.pt(st, 0);
      st.prev = P;
      this.dab(st, P.x, P.y, P.pr);
      return;
    }
    if (k === 1) {
      this.segmentLine(st, this.pt(st, 0), this.mid(st, 0, 1));
      return;
    }
    // Suavizado: curva cuadrática entre puntos medios con control en el punto anterior.
    this.segmentQuad(st, this.mid(st, k - 2, k - 1), this.pt(st, k - 1), this.mid(st, k - 1, k));
  }

  segmentLine(st, a, b) {
    const L = Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
    const steps = Math.max(1, Math.ceil(L));
    for (let i = 1; i <= steps; i += 1) {
      const t = i / steps;
      this.advance(st, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.pr + (b.pr - a.pr) * t);
    }
  }

  segmentQuad(st, a, c, b) {
    const L = Math.sqrt((c.x - a.x) ** 2 + (c.y - a.y) ** 2) + Math.sqrt((b.x - c.x) ** 2 + (b.y - c.y) ** 2);
    const steps = Math.max(1, Math.ceil(L));
    for (let i = 1; i <= steps; i += 1) {
      const t = i / steps;
      const mt = 1 - t;
      const x = mt * mt * a.x + 2 * mt * t * c.x + t * t * b.x;
      const y = mt * mt * a.y + 2 * mt * t * c.y + t * t * b.y;
      this.advance(st, x, y, a.pr + (b.pr - a.pr) * t);
    }
  }

  radius(st, pr) {
    const base = st.action.w / 2;
    const r = base * (0.35 + 0.65 * pr);
    return st.action.tool === 'highlighter' ? r * 1.4 : r;
  }

  advance(st, x, y, pr) {
    const prev = st.prev || { x, y };
    const d = Math.sqrt((x - prev.x) ** 2 + (y - prev.y) ** 2);
    st.prev = { x, y };
    st.sinceStamp += d;
    st.total += d;
    const r = this.radius(st, pr);
    const spacing = st.action.tool === 'spray' ? Math.max(2, r * 0.4) : Math.max(0.75, r * 0.25);
    if (st.sinceStamp >= spacing) {
      st.sinceStamp = 0;
      this.dab(st, x, y, pr);
    }
  }

  dab(st, x, y, pr) {
    const { action } = st;
    const r = this.radius(st, pr);
    if (action.tool === 'dashed') {
      const dash = Math.max(6, action.w * 2.5);
      const gap = Math.max(5, action.w * 2);
      if (st.total % (dash + gap) >= dash) return;
    }
    const mirrorX = (v) => this.w - 1 - v;
    if (action.tool === 'spray') {
      const rand = prng((Math.imul(action.id, 2654435761) + Math.imul(st.stampIdx, 40503)) >>> 0);
      const count = Math.max(3, Math.round(r * 0.6));
      for (let j = 0; j < count; j += 1) {
        let dx = 0;
        let dy = 0;
        for (let tries = 0; tries < 8; tries += 1) {
          dx = rand() * 2 - 1;
          dy = rand() * 2 - 1;
          if (dx * dx + dy * dy <= 1) break;
        }
        this.stamp(x + dx * r, y + dy * r, 0.5, st.col, st.alpha, 0);
        if (action.sym) this.stamp(mirrorX(x + dx * r), y + dy * r, 0.5, st.col, st.alpha, 0);
      }
    } else {
      this.stamp(x, y, r, st.col, st.alpha, st.token);
      if (action.sym) this.stamp(mirrorX(x), y, r, st.col, st.alpha, st.token);
    }
    st.stampIdx += 1;
  }

  // ---------------------------------------------------------------- balde

  fill(x0, y0, hex, tol = 32) {
    const { w, h, data: d } = this;
    const x = Math.min(w - 1, Math.max(0, Math.round(x0)));
    const y = Math.min(h - 1, Math.max(0, Math.round(y0)));
    const col = rgb(hex);
    const seed = (y * w + x) * 4;
    const sr = d[seed];
    const sg = d[seed + 1];
    const sb = d[seed + 2];
    if (sr === col[0] && sg === col[1] && sb === col[2]) return;
    const visited = new Uint8Array(w * h);
    const match = (j) => {
      if (visited[j]) return false;
      const k = j * 4;
      return Math.abs(d[k] - sr) <= tol && Math.abs(d[k + 1] - sg) <= tol && Math.abs(d[k + 2] - sb) <= tol;
    };
    const stack = [y * w + x];
    let minX = x;
    let maxX = x;
    let minY = y;
    let maxY = y;
    while (stack.length) {
      const j = stack.pop();
      if (!match(j)) continue;
      const py = (j / w) | 0;
      const row = py * w;
      let lx = j - row;
      let rx = lx;
      while (lx > 0 && match(row + lx - 1)) lx -= 1;
      while (rx < w - 1 && match(row + rx + 1)) rx += 1;
      let upOpen = false;
      let downOpen = false;
      for (let xx = lx; xx <= rx; xx += 1) {
        const q = row + xx;
        visited[q] = 1;
        const k = q * 4;
        d[k] = col[0];
        d[k + 1] = col[1];
        d[k + 2] = col[2];
        if (py > 0) {
          const m = match(q - w);
          if (m && !upOpen) stack.push(q - w);
          upOpen = m;
        }
        if (py < h - 1) {
          const m = match(q + w);
          if (m && !downOpen) stack.push(q + w);
          downOpen = m;
        }
      }
      if (lx < minX) minX = lx;
      if (rx > maxX) maxX = rx;
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
    }
    this.markDirty(minX, minY, maxX, maxY);
  }

  // ---------------------------------------------------------------- formas

  lineDabs(ax, ay, bx, by, r, col, alpha, token) {
    const L = Math.sqrt((bx - ax) ** 2 + (by - ay) ** 2);
    const spacing = Math.max(0.75, r * 0.25);
    const n = Math.max(1, Math.ceil(L / spacing));
    for (let i = 0; i <= n; i += 1) {
      const t = i / n;
      this.stamp(ax + (bx - ax) * t, ay + (by - ay) * t, r, col, alpha, token);
    }
  }

  shape(a) {
    const token = this.newToken();
    this.drawShape(a, false, token);
    if (a.sym) this.drawShape(a, true, token);
  }

  drawShape(a, mirror, token) {
    const m = (v) => (mirror ? this.w - 1 - v : v);
    const x1 = m(a.x1);
    const x2 = m(a.x2);
    const { y1, y2 } = a;
    const col = rgb(a.c);
    const alpha = a.a;
    const r = a.w / 2;
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);
    const { w } = this;
    const px = (x, y) => {
      if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.blend(y * w + x, col, alpha, token);
    };
    switch (a.shape) {
      case 'line':
        this.lineDabs(x1, y1, x2, y2, r, col, alpha, token);
        break;
      case 'rect':
        if (a.fill) {
          for (let y = Math.round(minY); y <= Math.round(maxY); y += 1) {
            for (let x = Math.round(minX); x <= Math.round(maxX); x += 1) px(x, y);
          }
          this.markDirty(minX, minY, maxX, maxY);
        } else {
          this.lineDabs(minX, minY, maxX, minY, r, col, alpha, token);
          this.lineDabs(maxX, minY, maxX, maxY, r, col, alpha, token);
          this.lineDabs(maxX, maxY, minX, maxY, r, col, alpha, token);
          this.lineDabs(minX, maxY, minX, minY, r, col, alpha, token);
        }
        break;
      case 'ellipse': {
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;
        const rx = (maxX - minX) / 2;
        const ry = (maxY - minY) / 2;
        if (rx < 0.5 || ry < 0.5) {
          this.lineDabs(minX, minY, maxX, maxY, r, col, alpha, token);
          break;
        }
        if (a.fill) {
          for (let y = Math.ceil(cy - ry); y <= Math.floor(cy + ry); y += 1) {
            const dy = (y - cy) / ry;
            const half = rx * Math.sqrt(Math.max(0, 1 - dy * dy));
            for (let x = Math.ceil(cx - half); x <= Math.floor(cx + half); x += 1) px(x, y);
          }
          this.markDirty(minX, minY, maxX, maxY);
        } else {
          // Parametrización racional del cuarto de elipse (sin seno/coseno).
          const n = Math.max(8, Math.ceil((rx + ry) / 2));
          const quarter = [];
          for (let i = 0; i <= n; i += 1) {
            const t = i / n;
            const den = 1 + t * t;
            quarter.push([(rx * (1 - t * t)) / den, (ry * 2 * t) / den]);
          }
          const pts = [];
          for (const [sx, sy] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) {
            const q = sx * sy > 0 ? quarter : [...quarter].reverse();
            for (const [qx, qy] of q) pts.push([cx + sx * qx, cy + sy * qy]);
          }
          for (let i = 1; i < pts.length; i += 1) this.lineDabs(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], r, col, alpha, token);
        }
        break;
      }
      case 'tri': {
        const ax = (minX + maxX) / 2;
        const ay = minY;
        const bx = minX;
        const by = maxY;
        const cx = maxX;
        const cy = maxY;
        if (a.fill) {
          const edge = (x0, y0, x1e, y1e, x, y) => (x1e - x0) * (y - y0) - (y1e - y0) * (x - x0);
          const area = edge(ax, ay, bx, by, cx, cy);
          for (let y = Math.round(minY); y <= Math.round(maxY); y += 1) {
            for (let x = Math.round(minX); x <= Math.round(maxX); x += 1) {
              const e1 = edge(ax, ay, bx, by, x, y);
              const e2 = edge(bx, by, cx, cy, x, y);
              const e3 = edge(cx, cy, ax, ay, x, y);
              if (area === 0) continue;
              if ((e1 >= 0 && e2 >= 0 && e3 >= 0 && area > 0) || (e1 <= 0 && e2 <= 0 && e3 <= 0 && area < 0)) px(x, y);
            }
          }
          this.markDirty(minX, minY, maxX, maxY);
        } else {
          this.lineDabs(ax, ay, bx, by, r, col, alpha, token);
          this.lineDabs(bx, by, cx, cy, r, col, alpha, token);
          this.lineDabs(cx, cy, ax, ay, r, col, alpha, token);
        }
        break;
      }
      default:
        break;
    }
  }

  // ---------------------------------------------------------------- historial

  renderAction(action, { open = false } = {}) {
    switch (action.k) {
      case 'stroke':
        this.strokeStart(action);
        if (!open) this.strokeEnd(action.id);
        break;
      case 'fill':
        this.fill(action.x, action.y, action.c, action.tol);
        break;
      case 'shape':
        this.shape(action);
        break;
      case 'clear':
        this.clear();
        break;
      default:
        break;
    }
  }

  /** Redibuja todo el historial (al entrar tarde, reconectar, deshacer o rehacer). */
  renderAll(actions, openId = null) {
    this.strokes.clear();
    this.clear();
    actions.forEach((a, i) => {
      const open = a.k === 'stroke' && a.id === openId && i === actions.length - 1;
      this.renderAction(a, { open });
    });
  }
}
