// Máscara de la palabra y pistas (letras reveladas de a una, repartidas en el tiempo).
// Nunca se revelan espacios/guiones (ya se ven) ni la palabra completa.

const LETTER = /[\p{L}\p{N}]/u;

export function isLetter(ch) {
  return LETTER.test(ch);
}

/** Índices de los caracteres que son letras/números. */
export function letterIndices(word) {
  return [...word].map((ch, i) => (isLetter(ch) ? i : -1)).filter((i) => i >= 0);
}

/**
 * Máscara para quienes adivinan: letras ocultas como "_", los espacios y
 * guiones se muestran tal cual. revealed: índices ya revelados.
 */
export function maskOf(word, revealed = []) {
  const set = new Set(revealed);
  return [...word].map((ch, i) => (isLetter(ch) && !set.has(i) ? '_' : ch));
}

/** Cantidad de pistas a dar: la configurada, como máximo la mitad de las letras. */
export function hintCount(word, configured) {
  const letters = letterIndices(word).length;
  return Math.max(0, Math.min(Number(configured) || 0, Math.floor(letters / 2)));
}

/** Momentos (ms desde el inicio del dibujo) en que se revela cada pista. */
export function hintSchedule(drawMs, count) {
  return Array.from({ length: count }, (_, i) => Math.round((drawMs * (i + 1)) / (count + 1)));
}

/** Elige al azar una letra todavía oculta (null si no queda ninguna revelable). */
export function pickHintIndex(word, revealed, rng) {
  const hidden = letterIndices(word).filter((i) => !revealed.includes(i));
  if (hidden.length <= 1) return null; // nunca revelar la última letra
  return hidden[Math.floor(rng() * hidden.length)];
}
