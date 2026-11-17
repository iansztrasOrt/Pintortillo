// Banco de palabras y elección de opciones para el dibujante.
// El banco vive en engine/words/es.json (generado desde es*.txt con `npm run words`).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { shuffle, pickOne } from './util.js';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'words');
const cache = new Map();

export function loadBank(lang = 'es') {
  if (!cache.has(lang)) {
    const file = path.join(DIR, `${lang}.json`);
    const data = JSON.parse(fs.readFileSync(fs.existsSync(file) ? file : path.join(DIR, 'es.json'), 'utf8'));
    cache.set(lang, data.words);
  }
  return cache.get(lang);
}

export const CUSTOM_MIN_WORDS = 4;
export const CUSTOM_MAX_LEN = 30;
export const CUSTOM_MAX_WORDS = 500;

/** "gato, perro ,  ropa interior" → ['gato', 'perro', 'ropa interior'] (sin repetidas). */
export function parseCustomWords(input) {
  const list = Array.isArray(input) ? input : String(input || '').split(/[,\n]/);
  const out = [];
  for (const piece of list) {
    const w = String(piece).replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
    if (w.length >= 2 && w.length <= CUSTOM_MAX_LEN && !out.includes(w)) out.push(w);
    if (out.length >= CUSTOM_MAX_WORDS) break;
  }
  return out;
}

/**
 * Elige `n` opciones sin repetir palabras ya usadas en la sala.
 * Modo "combinada": cada opción son dos palabras ("gato + nube").
 * Palabras personalizadas: si customOnly, solo esas; si no, cada opción tiene
 * 1/3 de probabilidad de salir de la lista personalizada.
 */
export function pickChoices(room, n, rng) {
  const { settings } = room;
  const used = new Set(room.usedWords);
  const bank = loadBank(settings.lang);
  const custom = settings.customWords || [];
  let poolMain = settings.customOnly && custom.length >= CUSTOM_MIN_WORDS ? custom : bank;
  let available = poolMain.filter((w) => !used.has(w));
  let availableCustom = settings.customOnly ? [] : custom.filter((w) => !used.has(w));
  const need = settings.wordMode === 'combination' ? n * 2 : n;
  if (available.length + availableCustom.length < need) {
    // Se acabaron: se reinicia la memoria de palabras usadas de la sala.
    room.usedWords = [];
    available = [...poolMain];
    availableCustom = settings.customOnly ? [] : [...custom];
  }
  const taken = new Set();
  const draw = () => {
    const fromCustom = availableCustom.length && rng() < 1 / 3;
    const pool = (fromCustom ? availableCustom : available).filter((w) => !taken.has(w));
    const fallback = (fromCustom ? available : availableCustom).filter((w) => !taken.has(w));
    const src = pool.length ? pool : fallback;
    const w = src.length ? pickOne(src, rng) : pickOne(poolMain, rng);
    taken.add(w);
    return w;
  };
  const choices = [];
  for (let i = 0; i < n; i += 1) {
    choices.push(settings.wordMode === 'combination' ? `${draw()} + ${draw()}` : draw());
  }
  return shuffle(choices, rng);
}

/** Palabras que componen una opción (para marcarlas como usadas). */
export function wordsOf(choice) {
  return choice.split(' + ');
}
