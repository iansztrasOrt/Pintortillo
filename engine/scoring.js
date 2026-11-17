// Sistema de puntos (constantes configurables).
//
// Adivinador: round(BASE_GUESS × tiempoRestante/tiempoTotal) + ORDER_BONUS[puesto],
//             con un mínimo de MIN_GUESS por acertar.
// Dibujante:  por cada acierto, round(DRAW_BASE / adivinadores × tiempoRestante/tiempoTotal)
//             + DRAW_BONUS. Si nadie acierta, 0. Con DRAW_BASE=300 el total del
//             dibujante queda normalmente por debajo del primer adivinador (máx. 500).

export const SCORING = Object.freeze({
  BASE_GUESS: 400,
  ORDER_BONUS: Object.freeze([100, 70, 50, 30, 20, 10]),
  MIN_GUESS: 50,
  DRAW_BASE: 300,
  DRAW_BONUS: 10,
  HURRY_MS: 30000, // al primer acierto, el tiempo restante baja a 30 s (si quedaba más)
});

function ratio(remainingMs, totalMs) {
  if (!totalMs) return 0;
  return Math.min(1, Math.max(0, remainingMs / totalMs));
}

/** Puntos de quien adivina en el puesto `place` (0 = primero). */
export function guessPoints(remainingMs, totalMs, place, s = SCORING) {
  const bonus = s.ORDER_BONUS[place] ?? 0;
  return Math.max(s.MIN_GUESS, Math.round(s.BASE_GUESS * ratio(remainingMs, totalMs)) + bonus);
}

/** Puntos que suma el dibujante por UN acierto. */
export function drawerPointsForGuess(remainingMs, totalMs, guessers, s = SCORING) {
  const n = Math.max(1, guessers);
  return Math.round((s.DRAW_BASE / n) * ratio(remainingMs, totalMs)) + s.DRAW_BONUS;
}

/**
 * Ranking final: puntaje descendente; empate → menor suma de tiempos de acierto;
 * luego por orden de entrada.
 */
export function rankPlayers(players) {
  return [...players].sort((a, b) => b.score - a.score
    || (a.guessTimeSum ?? 0) - (b.guessTimeSum ?? 0)
    || (a.joinedAt ?? 0) - (b.joinedAt ?? 0));
}
