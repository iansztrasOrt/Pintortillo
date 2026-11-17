// Comparación de adivinanzas: sin mayúsculas, tildes, puntuación ni espacios
// extra. La "ñ" se conserva (montaña ≠ montana); "ü" → "u".

const ENYE = '';

/** Normaliza: minúsculas, sin tildes (salvo ñ), sin puntuación, espacios simples. */
export function normalize(text) {
  if (typeof text !== 'string') return '';
  return text
    .toLowerCase()
    .replace(/ñ/g, ENYE)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(new RegExp(ENYE, 'g'), 'ñ')
    .replace(/[-_/.]+/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Igual que normalize pero sin espacios ("ropa interior" → "ropainterior"). */
export function compact(text) {
  return normalize(text).replace(/ /g, '');
}

export function levenshtein(a, b, max = Infinity) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/**
 * ¿El mensaje es la palabra? Acepta la palabra exacta (normalizada, con o sin
 * espacios) o la palabra completa dentro del mensaje ("es un gato!"), para que
 * nadie la filtre al chat público por accidente.
 */
export function isCorrectGuess(message, word) {
  const m = normalize(message);
  const w = normalize(word);
  if (!m || !w) return false;
  if (m.replace(/ /g, '') === w.replace(/ /g, '')) return true;
  return ` ${m} `.includes(` ${w} `);
}

/** A una letra de distancia (Levenshtein = 1). */
export function isCloseGuess(message, word) {
  const m = compact(message);
  const w = compact(word);
  if (!m || !w || m === w) return false;
  return levenshtein(m, w, 1) === 1;
}

/** ¿El texto contiene la palabra (aunque sea pegada a otras letras)? */
export function containsWord(message, word) {
  const w = compact(word);
  return w.length > 0 && compact(message).includes(w);
}
