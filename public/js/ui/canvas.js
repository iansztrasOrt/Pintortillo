// Lienzo: muestra el raster determinista, captura el dibujo (Pointer Events:
// mouse, touch y lápiz con presión) y sincroniza comandos con el servidor.
import { W, H, applyCommand, newDrawing, validateCommand } from '/engine/drawing.js';
import { Raster } from '/engine/raster.js';
import { h } from '../dom.js';
import { t } from '../i18n/index.js';

const BRUSHES = ['pen', 'eraser', 'highlighter', 'spray', 'dashed'];
const SHAPES = ['line', 'rect', 'ellipse', 'tri'];
const FLUSH_MS = 40;

export function createBoard(container, { onSend, getTool, onPick }) {
  const paint = h('canvas', { class: 'paint', width: W, height: H, role: 'img', 'aria-label': 'Dibujo' });
  const over = h('canvas', { class: 'over', width: W, height: H, 'aria-hidden': 'true' });
  const layer = h('div', { class: 'board-layer' });
  const el = h('div', { class: 'board' }, paint, over, layer);
  container.append(el);
  const pctx = paint.getContext('2d');
  const octx = over.getContext('2d');

  const raster = new Raster(W, H);
  const img = new ImageData(raster.data, W, H);
  let drawing = newDrawing();
  let enabled = false;
  let queue = [];
  let outbox = [];
  let strokeId = 0;
  let idBase = 1 + Math.floor(Math.random() * 5e8);
  let active = null; // { kind: 'stroke'|'shape', id, x0, y0, last }
  let cursor = null;

  // ---------------------------------------------------------------- aplicar comandos

  function apply(cmd) {
    if (cmd.t === 's' || cmd.t === 'f' || cmd.t === 'sh' || cmd.t === 'clr') raster.endAllStrokes();
    if (!applyCommand(drawing, cmd)) return false;
    const last = drawing.actions[drawing.actions.length - 1];
    switch (cmd.t) {
      case 's': raster.strokeStart(last); break;
      case 'p': raster.strokeContinue(cmd.id); break;
      case 'e': raster.strokeEnd(cmd.id); break;
      case 'undo':
      case 'redo': raster.renderAll(drawing.actions, drawing.open); break;
      default: raster.renderAction(last); break;
    }
    return true;
  }

  /** Comando propio: se normaliza igual que en el servidor, se aplica y se encola para enviar. */
  function local(raw) {
    let cmd;
    try {
      cmd = validateCommand(raw);
    } catch {
      return;
    }
    if (apply(cmd)) outbox.push(cmd);
  }

  function flush() {
    if (!outbox.length) return;
    const merged = [];
    for (const cmd of outbox) {
      const prev = merged[merged.length - 1];
      if (cmd.t === 'p' && prev && prev.t === 'p' && prev.id === cmd.id && prev.p.length + cmd.p.length <= 240 * 3) {
        prev.p = prev.p.concat(cmd.p);
      } else {
        merged.push({ ...cmd, p: cmd.p ? [...cmd.p] : undefined });
      }
    }
    outbox = [];
    for (let i = 0; i < merged.length; i += 40) onSend(merged.slice(i, i + 40).map((c) => (c.p ? c : stripP(c))));
  }
  const stripP = ({ p, ...rest }) => rest;
  const flushTimer = setInterval(flush, FLUSH_MS);

  // Remotos: se reproducen de a poco para que el trazo se vea fluido.
  function processQueue() {
    if (!queue.length) return;
    const pending = queue.reduce((n, c) => n + (c.t === 'p' ? c.p.length / 3 : 0), 0);
    let budget = queue.length > 300 ? Infinity : Math.max(6, Math.ceil(pending / 3));
    while (queue.length) {
      const cmd = queue[0];
      if (cmd.t === 'p') {
        const n = cmd.p.length / 3;
        if (n > budget) {
          apply({ t: 'p', id: cmd.id, p: cmd.p.slice(0, budget * 3) });
          cmd.p = cmd.p.slice(budget * 3);
          break;
        }
        budget -= n;
      }
      queue.shift();
      apply(cmd);
      if (budget <= 0) break;
    }
  }

  let raf = 0;
  function frame() {
    processQueue();
    const d = raster.takeDirty();
    if (d) pctx.putImageData(img, 0, 0, d.x0, d.y0, d.x1 - d.x0 + 1, d.y1 - d.y0 + 1);
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  // ---------------------------------------------------------------- entrada

  function toLogical(e) {
    const r = over.getBoundingClientRect();
    return {
      x: Math.min(W - 0.1, Math.max(0, ((e.clientX - r.left) / r.width) * W)),
      y: Math.min(H - 0.1, Math.max(0, ((e.clientY - r.top) / r.height) * H)),
      pr: e.pointerType === 'pen' ? (e.pressure || 0.5) : 1,
    };
  }

  function shapeEnd(x0, y0, x, y, kind, shift) {
    if (!shift) return { x, y };
    const dx = x - x0;
    const dy = y - y0;
    if (kind === 'line') {
      // Shift en línea: horizontal, vertical o 45°.
      const ax = Math.abs(dx);
      const ay = Math.abs(dy);
      if (ax > ay * 2) return { x, y: y0 };
      if (ay > ax * 2) return { x: x0, y };
      const m = Math.max(ax, ay);
      return { x: x0 + Math.sign(dx) * m, y: y0 + Math.sign(dy) * m };
    }
    const m = Math.max(Math.abs(dx), Math.abs(dy));
    return { x: Math.min(W - 1, Math.max(0, x0 + Math.sign(dx || 1) * m)), y: Math.min(H - 1, Math.max(0, y0 + Math.sign(dy || 1) * m)) };
  }

  over.addEventListener('pointerdown', (e) => {
    if (!enabled || e.button > 0) return;
    e.preventDefault();
    over.setPointerCapture(e.pointerId);
    const tool = getTool();
    const pt = toLogical(e);
    if (tool.tool === 'fill') {
      local({ t: 'f', x: pt.x, y: pt.y, c: tool.color, tol: tool.tolerance });
      return;
    }
    if (tool.tool === 'picker') {
      onPick(raster.getPixelHex(pt.x, pt.y));
      return;
    }
    if (BRUSHES.includes(tool.tool)) {
      strokeId += 1;
      const id = idBase + strokeId;
      active = { kind: 'stroke', id, last: pt };
      local({ t: 's', id, tool: tool.tool, c: tool.color, a: tool.opacity, w: tool.size, sym: tool.symmetry, p: [pt.x, pt.y, pt.pr] });
    } else if (SHAPES.includes(tool.tool)) {
      active = { kind: 'shape', x0: pt.x, y0: pt.y, x: pt.x, y: pt.y, shift: e.shiftKey };
    }
  });

  over.addEventListener('pointermove', (e) => {
    if (!enabled) return;
    const pt = toLogical(e);
    cursor = pt;
    if (active && active.kind === 'stroke') {
      const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [e];
      const pts = [];
      for (const ev of events.length ? events : [e]) {
        const q = toLogical(ev);
        const d = Math.hypot(q.x - active.last.x, q.y - active.last.y);
        if (d >= 1.5) {
          pts.push(q.x, q.y, q.pr);
          active.last = q;
        }
      }
      for (let i = 0; i < pts.length; i += 240 * 3) local({ t: 'p', id: active.id, p: pts.slice(i, i + 240 * 3) });
    } else if (active && active.kind === 'shape') {
      active.x = pt.x;
      active.y = pt.y;
      active.shift = e.shiftKey;
    }
    drawOverlay();
  });

  function finish(e) {
    if (!active) return;
    if (active.kind === 'stroke') {
      local({ t: 'e', id: active.id });
    } else {
      const tool = getTool();
      const end = shapeEnd(active.x0, active.y0, active.x, active.y, tool.tool, e && e.shiftKey);
      if (Math.hypot(end.x - active.x0, end.y - active.y0) >= 2) {
        local({
          t: 'sh', k: tool.tool, x1: active.x0, y1: active.y0, x2: end.x, y2: end.y,
          c: tool.color, w: tool.size, a: tool.opacity, fill: tool.fillShape, sym: tool.symmetry,
        });
      }
    }
    active = null;
    flush();
    drawOverlay();
  }
  over.addEventListener('pointerup', finish);
  over.addEventListener('pointercancel', finish);
  over.addEventListener('pointerleave', () => {
    cursor = null;
    drawOverlay();
  });

  // Vista previa de formas, cursor del pincel y guía del espejo.
  function drawOverlay() {
    octx.clearRect(0, 0, W, H);
    if (!enabled) return;
    const tool = getTool();
    if (tool.symmetry) {
      octx.save();
      octx.setLineDash([8, 8]);
      octx.strokeStyle = 'rgba(123, 92, 255, .55)';
      octx.lineWidth = 1.5;
      octx.beginPath();
      octx.moveTo(W / 2, 0);
      octx.lineTo(W / 2, H);
      octx.stroke();
      octx.restore();
    }
    if (active && active.kind === 'shape') {
      const end = shapeEnd(active.x0, active.y0, active.x, active.y, tool.tool, active.shift);
      const draw = (mirror) => {
        const m = (v) => (mirror ? W - 1 - v : v);
        previewShape(octx, tool, m(active.x0), active.y0, m(end.x), end.y);
      };
      draw(false);
      if (tool.symmetry) draw(true);
    }
    if (cursor && !['fill', 'picker'].includes(tool.tool)) {
      octx.beginPath();
      octx.arc(cursor.x, cursor.y, Math.max(1.5, tool.size / 2), 0, Math.PI * 2);
      octx.strokeStyle = 'rgba(0,0,0,.5)';
      octx.lineWidth = 1;
      octx.stroke();
      octx.beginPath();
      octx.arc(cursor.x, cursor.y, Math.max(1.5, tool.size / 2) + 1, 0, Math.PI * 2);
      octx.strokeStyle = 'rgba(255,255,255,.7)';
      octx.stroke();
    }
  }

  return {
    el,
    layer,
    setEnabled(v) {
      enabled = v;
      el.classList.toggle('can-draw', v);
      if (!v) {
        if (active) finish();
        cursor = null;
      }
      drawOverlay();
    },
    reset() {
      queue = [];
      outbox = [];
      active = null;
      drawing = newDrawing();
      raster.strokes.clear();
      raster.clear();
      idBase = 1 + Math.floor(Math.random() * 5e8);
      strokeId = 0;
    },
    replay(snap) {
      queue = [];
      drawing = newDrawing();
      drawing.actions = JSON.parse(JSON.stringify(snap.actions || []));
      drawing.open = snap.open ?? null;
      drawing.totalPoints = drawing.actions.reduce((n, a) => n + (a.p ? a.p.length / 3 : 0), 0);
      raster.renderAll(drawing.actions, drawing.open);
    },
    remote(cmds) {
      for (const c of cmds) queue.push({ ...c, p: c.p ? [...c.p] : undefined });
    },
    command(type) {
      if (!enabled) return;
      if (type === 'undo' || type === 'redo' || type === 'clr') {
        if (active) finish();
        local({ t: type });
        flush();
      }
    },
    redrawOverlay: drawOverlay,
    download() {
      paint.toBlob((blob) => {
        if (!blob) return;
        const a = h('a', { href: URL.createObjectURL(blob), download: `pintortillo-${Date.now()}.png` });
        document.body.append(a);
        a.click();
        setTimeout(() => {
          URL.revokeObjectURL(a.href);
          a.remove();
        }, 500);
      }, 'image/png');
    },
    destroy() {
      clearInterval(flushTimer);
      cancelAnimationFrame(raf);
    },
    label: () => t('game.download'),
  };
}

function previewShape(ctx, tool, x1, y1, x2, y2) {
  ctx.save();
  ctx.globalAlpha = Math.min(1, tool.opacity) * 0.8;
  ctx.strokeStyle = tool.color;
  ctx.fillStyle = tool.color;
  ctx.lineWidth = tool.size;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const minX = Math.min(x1, x2);
  const minY = Math.min(y1, y2);
  const w = Math.abs(x2 - x1);
  const hh = Math.abs(y2 - y1);
  ctx.beginPath();
  if (tool.tool === 'line') {
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
  } else if (tool.tool === 'rect') {
    ctx.rect(minX, minY, w, hh);
  } else if (tool.tool === 'ellipse') {
    ctx.ellipse(minX + w / 2, minY + hh / 2, Math.max(0.5, w / 2), Math.max(0.5, hh / 2), 0, 0, Math.PI * 2);
  } else {
    ctx.moveTo(minX + w / 2, minY);
    ctx.lineTo(minX, minY + hh);
    ctx.lineTo(minX + w, minY + hh);
    ctx.closePath();
  }
  if (tool.fillShape && tool.tool !== 'line') ctx.fill();
  else ctx.stroke();
  ctx.restore();
}
