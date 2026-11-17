// Genera engine/words/es.json a partir de engine/words/es*.txt
// (palabras separadas por coma o salto de línea). Para ampliar el banco:
// agregá palabras al .txt y corré:  npm run words
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'engine/words');
const OUT = path.join(ROOT, 'engine/words/es.json');

// Palabras que preferimos no usar (marcas registradas, alcohol, temas sensibles).
const EXCLUDE = new Set([
  'playa nudista', 'cerveza', 'jarra de cerveza', 'espuma de cerveza', 'vino tinto', 'uva de vino', 'copa de vino',
  'copa de champaña', 'sidra', 'despedida de soltero', 'tortuga ninja', 'walkman', 'slinky', 'premio óscar',
  'fórmula uno', 'post it', 'plasticola', 'voligoma', 'tupper', 'tazo', 'gitana', 'mendigo', 'cacique', 'geisha',
  'buda', 'robot asesino', 'ahogarse', 'curita', 'disparar', 'robar', 'borrachera de risa', 'cigarrillo de chocolate',
  'piña colada sin alcohol', 'vino de uva sin alcohol', 'silla eléctrica de juguete', 'ruleta rusa de colores',
  'tiro de gracia', 'mina terrestre', 'viudo', 'vagabundo', 'pacman', 'pantera rosa', 'rey león', 'monstruo de galletas',
  'correcaminos', 'loco de remate', 'lanzallamas de juguete', 'misil',
]);

// Lee todos los archivos es*.txt de la carpeta (es.txt, es-2.txt, ...).
const raw = fs.readdirSync(DIR).filter((f) => /^es.*\.txt$/.test(f)).sort()
  .map((f) => fs.readFileSync(path.join(DIR, f), 'utf8')).join('\n');
const seen = new Set();
const words = [];
const rejected = [];
for (const piece of raw.split(/[,\n]/)) {
  const w = piece.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!w) continue;
  if (w.length < 2 || w.length > 30 || !/^[\p{L}\p{N} '-]+$/u.test(w)) { rejected.push(w); continue; }
  if (EXCLUDE.has(w) || seen.has(w)) continue;
  seen.add(w);
  words.push(w);
}
words.sort((a, b) => a.localeCompare(b, 'es'));
fs.writeFileSync(OUT, `${JSON.stringify({ lang: 'es', count: words.length, words }, null, 0)}\n`);
console.log(`${words.length} palabras → ${path.relative(ROOT, OUT)}`);
if (rejected.length) console.log('Rechazadas:', rejected.join(' | '));
