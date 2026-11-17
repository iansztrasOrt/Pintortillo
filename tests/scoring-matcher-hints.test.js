import { describe, it, expect } from 'vitest';
import { SCORING, guessPoints, drawerPointsForGuess, rankPlayers } from '../engine/scoring.js';
import { normalize, isCorrectGuess, isCloseGuess, levenshtein } from '../engine/matcher.js';
import { maskOf, hintCount, hintSchedule, pickHintIndex, letterIndices } from '../engine/hints.js';
import { seededRng } from '../engine/util.js';

describe('puntos', () => {
  it('adivinador: base por tiempo restante + bonus por orden, mínimo 50', () => {
    expect(guessPoints(80000, 80000, 0)).toBe(500);
    expect(guessPoints(40000, 80000, 0)).toBe(300);
    expect(guessPoints(40000, 80000, 1)).toBe(270);
    expect(guessPoints(40000, 80000, 9)).toBe(200);
    expect(guessPoints(0, 80000, 8)).toBe(SCORING.MIN_GUESS);
  });

  it('el primero gana más que el último', () => {
    const t = 60000;
    expect(guessPoints(t, 80000, 0)).toBeGreaterThan(guessPoints(t, 80000, 5));
  });

  it('dibujante: más aciertos y más rápidos = más puntos; total debajo del primer adivinador', () => {
    const fast = drawerPointsForGuess(70000, 80000, 4) * 4;
    const slow = drawerPointsForGuess(20000, 80000, 4) * 4;
    expect(fast).toBeGreaterThan(slow);
    expect(drawerPointsForGuess(70000, 80000, 4) * 1).toBeLessThan(fast);
    // Caso ideal para el dibujante (todos aciertan al instante) vs primer adivinador.
    for (const n of [1, 3, 7]) {
      const drawerTotal = drawerPointsForGuess(80000, 80000, n) * n;
      expect(drawerTotal).toBeLessThan(guessPoints(80000, 80000, 0));
    }
  });

  it('empates en el podio por suma de tiempos de acierto', () => {
    const r = rankPlayers([
      { id: 'a', score: 500, guessTimeSum: 9000 },
      { id: 'b', score: 500, guessTimeSum: 3000 },
      { id: 'c', score: 700, guessTimeSum: 1 },
    ]);
    expect(r.map((x) => x.id)).toEqual(['c', 'b', 'a']);
  });
});

describe('comparación de palabras', () => {
  it('ignora mayúsculas, tildes, puntuación y espacios extra', () => {
    expect(normalize('  ¡Árbol   GRANDE!  ')).toBe('arbol grande');
    expect(isCorrectGuess('arbol', 'árbol')).toBe(true);
    expect(isCorrectGuess('PARAGUAS', 'paraguas')).toBe(true);
    expect(isCorrectGuess('ropa  interior', 'ropa interior')).toBe(true);
    expect(isCorrectGuess('ropainterior', 'ropa interior')).toBe(true);
    expect(isCorrectGuess('ping pong', 'ping-pong')).toBe(true);
    expect(isCorrectGuess('pingüino', 'pinguino')).toBe(true);
  });

  it('la ñ y la n son distintas', () => {
    expect(isCorrectGuess('montaña', 'montaña')).toBe(true);
    expect(isCorrectGuess('MONTAÑA', 'montaña')).toBe(true);
    expect(isCorrectGuess('montana', 'montaña')).toBe(false);
    expect(isCloseGuess('montana', 'montaña')).toBe(true);
  });

  it('la palabra dentro de una frase cuenta (y no se filtra al chat)', () => {
    expect(isCorrectGuess('es un gato!', 'gato')).toBe(true);
    expect(isCorrectGuess('gatos', 'gato')).toBe(false);
  });

  it('"casi": a una letra de distancia', () => {
    expect(levenshtein('gato', 'pato')).toBe(1);
    expect(isCloseGuess('gatto', 'gato')).toBe(true);
    expect(isCloseGuess('perro', 'gato')).toBe(false);
    expect(isCloseGuess('gato', 'gato')).toBe(false);
  });
});

describe('pistas', () => {
  it('la máscara respeta espacios y guiones', () => {
    expect(maskOf('ropa interior').join('')).toBe('____ ________');
    expect(maskOf('ping-pong').join('')).toBe('____-____');
    expect(maskOf('montaña', [5]).join('')).toBe('_____ñ_');
  });

  it('nunca más pistas que la mitad de las letras ni que lo configurado', () => {
    expect(hintCount('sol', 5)).toBe(1);
    expect(hintCount('paraguas', 2)).toBe(2);
    expect(hintCount('paraguas', 5)).toBe(4);
    expect(hintCount('ropa interior', 0)).toBe(0);
  });

  it('se reparten uniformemente en el tiempo', () => {
    expect(hintSchedule(90000, 2)).toEqual([30000, 60000]);
  });

  it('nunca revela espacios ni la última letra oculta', () => {
    const rng = seededRng(5);
    const word = 'ropa interior';
    const revealed = [];
    for (let i = 0; i < 50; i += 1) {
      const idx = pickHintIndex(word, revealed, rng);
      if (idx === null) break;
      expect(word[idx]).not.toBe(' ');
      revealed.push(idx);
    }
    expect(revealed.length).toBe(letterIndices(word).length - 1);
  });
});
