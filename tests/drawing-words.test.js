import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { validateCommand, applyCommand, newDrawing } from '../engine/drawing.js';
import { Raster } from '../engine/raster.js';
import { loadBank, pickChoices, parseCustomWords } from '../engine/words.js';
import { seededRng } from '../engine/util.js';
import { normalizeSettings, DEFAULT_SETTINGS } from '../engine/game.js';

function scribble(id, n, seed) {
  const rng = seededRng(seed);
  const p = [];
  for (let i = 0; i < n; i += 1) p.push(Math.round(rng() * 7990) / 10, Math.round(rng() * 5990) / 10, Math.round(rng() * 100) / 100);
  return p;
}

const strokeCmds = (id, tool, pts, batch, extra = {}) => {
  const cmds = [{ t: 's', id, tool, c: '#1e88e5', a: 0.7, w: 14, sym: false, p: pts.slice(0, 3), ...extra }];
  for (let i = 3; i < pts.length; i += batch * 3) cmds.push({ t: 'p', id, p: pts.slice(i, i + batch * 3) });
  cmds.push({ t: 'e', id });
  return cmds;
};

/** Aplica comandos como lo hace el cliente: historial + render incremental. */
function playIncremental(cmds) {
  const d = newDrawing();
  const r = new Raster();
  for (const raw of cmds) {
    const cmd = validateCommand(raw);
    if (['s', 'f', 'sh', 'clr'].includes(cmd.t)) r.endAllStrokes();
    if (!applyCommand(d, cmd)) continue;
    const last = d.actions[d.actions.length - 1];
    if (cmd.t === 's') r.strokeStart(last);
    else if (cmd.t === 'p') r.strokeContinue(cmd.id);
    else if (cmd.t === 'e') r.strokeEnd(cmd.id);
    else if (cmd.t === 'undo' || cmd.t === 'redo') r.renderAll(d.actions, d.open);
    else r.renderAction(last);
  }
  return { d, r };
}

describe('comandos de dibujo', () => {
  it('valida y rechaza comandos malos', () => {
    expect(() => validateCommand({ t: 's', id: 1, tool: 'laser', c: '#000000', a: 1, w: 5, p: [1, 1, 1] })).toThrow();
    expect(() => validateCommand({ t: 'f', x: 1, y: 1, c: 'red', tol: 2 })).toThrow();
    expect(() => validateCommand({ t: 'p', id: 1, p: [1, 2] })).toThrow();
    expect(validateCommand({ t: 'p', id: 1, p: [5000, -3, 7] }).p).toEqual([799.9, 0, 1]);
  });

  it('deshacer y rehacer', () => {
    const d = newDrawing();
    for (const c of strokeCmds(1, 'pen', scribble(1, 5, 1), 2)) applyCommand(d, validateCommand(c));
    applyCommand(d, validateCommand({ t: 'f', x: 1, y: 1, c: '#ff0000', tol: 10 }));
    expect(d.actions).toHaveLength(2);
    applyCommand(d, { t: 'undo' });
    expect(d.actions).toHaveLength(1);
    applyCommand(d, { t: 'redo' });
    expect(d.actions.map((a) => a.k)).toEqual(['stroke', 'fill']);
  });
});

describe('rasterizador determinista', () => {
  const cmdsA = [
    ...strokeCmds(1, 'pen', scribble(1, 40, 3), 5),
    ...strokeCmds(2, 'spray', scribble(2, 30, 4), 7, { c: '#43a047' }),
    ...strokeCmds(3, 'highlighter', scribble(3, 25, 5), 3, { c: '#fdd835', sym: true }),
    ...strokeCmds(4, 'dashed', scribble(4, 20, 6), 4),
    { t: 'sh', k: 'rect', x1: 100, y1: 100, x2: 300, y2: 250, c: '#000000', w: 6, a: 1, fill: false, sym: false },
    { t: 'f', x: 200, y: 175, c: '#e53935', tol: 30 },
    { t: 'sh', k: 'ellipse', x1: 400, y1: 300, x2: 600, y2: 450, c: '#8e24aa', w: 8, a: 0.5, fill: true, sym: true },
    { t: 'sh', k: 'tri', x1: 50, y1: 400, x2: 250, y2: 580, c: '#000000', w: 4, a: 1, fill: false, sym: false },
    ...strokeCmds(5, 'eraser', scribble(5, 10, 7), 2),
  ];

  it('incremental (en lotes distintos) == redibujado completo', () => {
    const a = playIncremental(cmdsA);
    const b = playIncremental(cmdsA.flatMap((c) => (c.t === 'p' ? [c] : [c])));
    const full = new Raster();
    full.renderAll(a.d.actions);
    expect(a.r.hash()).toBe(full.hash());
    expect(b.r.hash()).toBe(full.hash());
    // Otro agrupamiento de puntos da exactamente el mismo dibujo.
    const regrouped = [
      ...strokeCmds(1, 'pen', scribble(1, 40, 3), 1),
      ...strokeCmds(2, 'spray', scribble(2, 30, 4), 11, { c: '#43a047' }),
      ...strokeCmds(3, 'highlighter', scribble(3, 25, 5), 2, { c: '#fdd835', sym: true }),
      ...strokeCmds(4, 'dashed', scribble(4, 20, 6), 9),
      ...cmdsA.slice(cmdsA.findIndex((c) => c.t === 'sh')),
    ];
    expect(playIncremental(regrouped).r.hash()).toBe(full.hash());
  });

  it('deshacer redibuja igual que si nunca se hubiera dibujado', () => {
    const base = playIncremental(cmdsA.slice(0, 5));
    const withUndo = playIncremental([...cmdsA.slice(0, 5), ...strokeCmds(99, 'pen', scribble(9, 15, 9), 3), { t: 'undo' }]);
    const ref = new Raster();
    ref.renderAll(base.d.actions);
    expect(withUndo.r.hash()).toBe(ref.hash());
  });

  it('el balde no se escapa de una figura cerrada', () => {
    const { r } = playIncremental([
      { t: 'sh', k: 'rect', x1: 100, y1: 100, x2: 200, y2: 200, c: '#000000', w: 4, a: 1, fill: false, sym: false },
      { t: 'f', x: 150, y: 150, c: '#ff0000', tol: 20 },
    ]);
    expect(r.getPixelHex(150, 150)).toBe('#ff0000');
    expect(r.getPixelHex(50, 50)).toBe('#ffffff');
    expect(r.getPixelHex(300, 300)).toBe('#ffffff');
  });

  it('la goma pinta de blanco y el modo espejo refleja', () => {
    const { r } = playIncremental([
      { t: 'f', x: 0, y: 0, c: '#000000', tol: 0 },
      ...strokeCmds(1, 'eraser', [100, 300, 1, 120, 300, 1], 1, { w: 20 }),
      ...strokeCmds(2, 'pen', [50, 50, 1], 1, { w: 10, c: '#ff0000', a: 1, sym: true }),
    ]);
    expect(r.getPixelHex(110, 300)).toBe('#ffffff');
    expect(r.getPixelHex(50, 50)).toBe('#ff0000');
    expect(r.getPixelHex(749, 50)).toBe('#ff0000');
  });
});

describe('banco de palabras', () => {
  const words = loadBank('es');

  it('tiene muchísimas palabras, sin repetidas y con largo válido', () => {
    expect(words.length).toBeGreaterThan(4000);
    expect(new Set(words).size).toBe(words.length);
    expect(words.every((w) => w.length >= 2 && w.length <= 30)).toBe(true);
    const json = JSON.parse(fs.readFileSync(new URL('../engine/words/es.json', import.meta.url)));
    expect(json.count).toBe(words.length);
  });

  it('no repite palabras ya usadas en la sala', () => {
    const room = { settings: normalizeSettings(DEFAULT_SETTINGS), usedWords: [] };
    const rng = seededRng(3);
    const seen = new Set();
    for (let i = 0; i < 300; i += 1) {
      const choices = pickChoices(room, 3, rng);
      for (const w of choices) expect(seen.has(w)).toBe(false);
      choices.forEach((w) => seen.add(w));
      room.usedWords.push(...choices);
    }
  });

  it('palabras personalizadas: se limpian y se pueden usar solas', () => {
    expect(parseCustomWords('  Gato, perro ,gato,, ropa   interior, x')).toEqual(['gato', 'perro', 'ropa interior']);
    const room = { settings: normalizeSettings({ customWords: 'uno, dos, tres, cuatro', customOnly: true }), usedWords: [] };
    const choices = pickChoices(room, 3, seededRng(1));
    expect(choices.every((w) => ['uno', 'dos', 'tres', 'cuatro'].includes(w))).toBe(true);
  });
});
