// Filtro opcional de insultos: reemplaza la palabra por asteriscos.
import { normalize } from './matcher.js';

const BAD = [
  'puta', 'puto', 'putos', 'putas', 'mierda', 'pendejo', 'pendeja', 'pelotudo', 'pelotuda', 'forro', 'forra',
  'verga', 'pija', 'chota', 'coño', 'gilipollas', 'idiota', 'imbecil', 'estupido', 'estupida',
  'boludo', 'boluda', 'mogolico', 'tarado', 'tarada', 'cagon', 'culo', 'orto', 'carajo', 'joder', 'hdp',
  'malparido', 'cabron', 'maricon', 'trolo', 'fuck', 'shit', 'bitch', 'asshole',
];

const BAD_SET = new Set(BAD);

/** Devuelve el texto con los insultos tapados. */
export function censor(text) {
  return text.replace(/[\p{L}\p{N}]+/gu, (word) => (BAD_SET.has(normalize(word)) ? '*'.repeat(word.length) : word));
}
