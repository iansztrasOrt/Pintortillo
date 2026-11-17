import { describe, it, expect } from 'vitest';
import * as G from '../engine/game.js';
import { roomWith, startAndChoose, delivered, p } from './helpers.js';

const CUSTOM = { customWords: 'ropa interior, montaña, paraguas, ping-pong, sacapuntas', customOnly: true, wordChoices: 1 };

function guess(room, c, pid, text) {
  const ctx = c.ctx();
  const res = G.chat(room, pid, text, ctx);
  return { res, out: ctx.out };
}

describe('inicio', () => {
  it('mínimo 2 jugadores y solo el anfitrión inicia', () => {
    const { room, c } = roomWith(1);
    expect(() => G.startGame(room, 'p1', c.ctx())).toThrow('need_more_players');
    G.addPlayer(room, { id: 'p2', name: 'B', avatar: {} }, c.ctx());
    expect(() => G.startGame(room, 'p2', c.ctx())).toThrow('host_only');
    G.startGame(room, 'p1', c.ctx());
    expect(room.phase).toBe('playing');
    expect(room.turn.drawerId).toBe('p1');
  });

  it('nadie que no sea anfitrión cambia ajustes', () => {
    const { room, c } = roomWith(3);
    expect(() => G.updateSettings(room, 'p2', { rounds: 5 }, c.ctx())).toThrow('host_only');
    G.updateSettings(room, 'p1', { rounds: 99, drawTime: 5, maxPlayers: 50 }, c.ctx());
    expect(room.settings).toMatchObject({ rounds: 10, drawTime: 15, maxPlayers: 20 });
  });
});

describe('elección y secreto de la palabra', () => {
  it('solo el dibujante recibe las opciones; si no elige, el servidor elige', () => {
    const { room, c } = roomWith(3, { wordChoices: 3 });
    G.startGame(room, 'p1', c.ctx());
    expect(G.viewFor(room, 'p1', c.now).turn.choices).toHaveLength(3);
    expect(G.viewFor(room, 'p2', c.now).turn.choices).toBe(null);
    c.advance(G.TIMING.CHOOSE_MS + 1);
    G.tick(room, c.ctx());
    expect(room.turn.phase).toBe('drawing');
    const word = room.turn.word;
    const guesserView = JSON.stringify(G.viewFor(room, 'p2', c.now));
    expect(guesserView.includes(`"${word}"`)).toBe(false);
    expect(G.viewFor(room, 'p2', c.now).turn.mask.join('')).toMatch(/^[_ \-+]+$/);
    expect(G.viewFor(room, 'p1', c.now).turn.word).toBe(word);
  });

  it('modo oculto: sin máscara ni cantidad de letras', () => {
    const { room, c } = roomWith(2, { wordMode: 'hidden' });
    startAndChoose(room, c);
    const v = G.viewFor(room, 'p2', c.now).turn;
    expect(v.mask).toBe(null);
    expect(v.letters).toBe(null);
  });

  it('modo combinado: dos palabras, se adivina escribiendo ambas', () => {
    const { room, c } = roomWith(2, { wordMode: 'combination', ...CUSTOM, customWords: 'gato, nube, sol, luna', wordChoices: 1 });
    startAndChoose(room, c);
    expect(room.turn.word).toContain(' + ');
    const plain = room.turn.word.replace(' + ', ' ');
    guess(room, c, 'p2', plain);
    expect(room.turn.phase).toBe('end');
  });
});

describe('adivinanzas', () => {
  it('acierto: no se muestra el texto, todos ven "adivinó", suma puntos y acelera a 30 s', () => {
    const { room, c } = roomWith(3, CUSTOM);
    const t = startAndChoose(room, c);
    c.advance(10000);
    const { out } = guess(room, c, 'p2', t.word.toUpperCase());
    expect(out.some((m) => m.type === 'chat' && m.data.kind === 'msg')).toBe(false);
    expect(out.some((m) => m.to === 'all' && m.data.kind === 'guessed')).toBe(true);
    expect(p(room, 'p2').score).toBe(Math.round(400 * (70 / 80)) + 100);
    expect(p(room, 'p1').score).toBeGreaterThan(0);
    expect(room.turn.endsAt - c.now).toBe(30000);
    expect(G.viewFor(room, 'p2', c.now).turn.word).toBe(t.word);
  });

  it('"casi": solo quien escribió ve el aviso', () => {
    const { room, c } = roomWith(3, { ...CUSTOM, customWords: 'paraguas, sacapuntas, montaña, linterna', wordChoices: 1 });
    const t = startAndChoose(room, c);
    const almost = `${t.word}x`;
    const { out } = guess(room, c, 'p2', almost);
    const close = out.filter((m) => m.data.kind === 'close');
    expect(close).toHaveLength(1);
    expect(close[0].to).toEqual(['p2']);
  });

  it('todos aciertan antes de tiempo → el turno termina al instante', () => {
    const { room, c } = roomWith(3, CUSTOM);
    const t = startAndChoose(room, c);
    guess(room, c, 'p2', t.word);
    expect(room.turn.phase).toBe('drawing');
    guess(room, c, 'p3', t.word);
    expect(room.turn.phase).toBe('end');
    expect(room.turn.reason).toBe('all_guessed');
  });

  it('sala de 2: el turno termina cuando el único adivinador acierta', () => {
    const { room, c } = roomWith(2, CUSTOM);
    const t = startAndChoose(room, c);
    guess(room, c, 'p2', t.word);
    expect(room.turn.phase).toBe('end');
  });

  it('nadie acierta: se revela la palabra y el dibujante gana 0', () => {
    const { room, c } = roomWith(3, CUSTOM);
    const t = startAndChoose(room, c);
    guess(room, c, 'p2', 'cualquier cosa');
    c.advance(room.settings.drawTime * 1000 + 1);
    const ctx = c.ctx();
    G.tick(room, ctx);
    expect(room.turn.phase).toBe('end');
    expect(room.turn.reason).toBe('time');
    expect(p(room, 'p1').score).toBe(0);
    expect(G.viewFor(room, 'p2', c.now).turn.word).toBe(t.word);
    expect(ctx.out.some((m) => m.data.key === 'word_was')).toBe(true);
  });

  it('dos aciertos casi simultáneos: el orden de llegada define el puesto', () => {
    const { room, c } = roomWith(4, CUSTOM);
    const t = startAndChoose(room, c);
    c.advance(5000);
    guess(room, c, 'p3', t.word);
    guess(room, c, 'p2', t.word);
    expect(room.turn.guessed.map((g) => g.id)).toEqual(['p3', 'p2']);
    expect(p(room, 'p3').score).toBeGreaterThan(p(room, 'p2').score);
  });

  it('palabras con espacios, guiones, tildes y ñ', () => {
    for (const w of ['ropa interior', 'montaña', 'paraguas', 'ping-pong']) {
      const { room, c } = roomWith(2, { customWords: `${w}, aaaa, bbbb, cccc`, customOnly: true, wordChoices: 1 });
      G.startGame(room, 'p1', c.ctx());
      room.turn.phase = 'choosing';
      room.turn.choices = [w];
      G.chooseWord(room, 'p1', 0, c.ctx());
      const variants = { 'ropa interior': 'Ropa Interior', montaña: 'MONTAÑA', paraguas: 'paraguas!', 'ping-pong': 'ping pong' };
      guess(room, c, 'p2', variants[w]);
      expect(room.turn.phase).toBe('end');
    }
  });
});

describe('chat secreto (anti-spoiler)', () => {
  it('quien ya acertó y el dibujante solo hablan entre ellos, aunque dividan la palabra', () => {
    const { room, c } = roomWith(4, CUSTOM);
    const t = startAndChoose(room, c);
    guess(room, c, 'p2', t.word);
    const half = Math.ceil(t.word.length / 2);
    for (const part of [t.word.slice(0, half), t.word.slice(half)]) {
      const { res, out } = guess(room, c, 'p2', part);
      expect(res.channel).toBe('secret');
      expect(out.every((m) => Array.isArray(m.to) && !m.to.includes('p3') && !m.to.includes('p4'))).toBe(true);
    }
    const drawerMsg = guess(room, c, 'p1', `es ${t.word}`);
    expect(drawerMsg.res.channel).toBe('secret');
    expect(delivered(drawerMsg.out, 'p3')).toHaveLength(0);
  });
});

describe('desconexiones y salidas', () => {
  it('el dibujante se va: el turno termina sin puntos para él y sigue el próximo', () => {
    const { room, c } = roomWith(4, CUSTOM);
    const t = startAndChoose(room, c);
    guess(room, c, 'p2', t.word);
    expect(p(room, 'p1').score).toBeGreaterThan(0);
    G.removePlayer(room, 'p1', c.ctx());
    expect(room.turn.reason).toBe('drawer_left');
    expect(room.hostId).toBe('p2');
    c.advance(G.TIMING.TURN_END_MS + 1);
    G.tick(room, c.ctx());
    expect(room.turn.drawerId).toBe('p2');
  });

  it('el dibujante se desconecta (tras la gracia) y el turno pasa', () => {
    const { room, c } = roomWith(3, CUSTOM);
    startAndChoose(room, c);
    G.setConnected(room, 'p1', false, c.ctx());
    G.handleDisconnectTimeout(room, 'p1', c.ctx());
    expect(room.turn.phase).toBe('end');
    expect(room.turn.reason).toBe('drawer_left');
  });

  it('un adivinador desconectado no frena "todos acertaron"', () => {
    const { room, c } = roomWith(4, CUSTOM);
    const t = startAndChoose(room, c);
    G.setConnected(room, 'p4', false, c.ctx());
    guess(room, c, 'p2', t.word);
    guess(room, c, 'p3', t.word);
    expect(room.turn.phase).toBe('end');
  });

  it('fin de partida si quedan menos de 2 conectados', () => {
    const { room, c } = roomWith(3, CUSTOM);
    startAndChoose(room, c);
    G.removePlayer(room, 'p3', c.ctx());
    expect(room.phase).toBe('playing');
    G.setConnected(room, 'p2', false, c.ctx());
    G.handleDisconnectTimeout(room, 'p2', c.ctx());
    expect(room.phase).toBe('gameOver');
    expect(room.results.reason).toBe('not_enough_players');
  });
});

describe('seguridad', () => {
  it('nadie dibuja si no es el dibujante activo; comandos inválidos se descartan', () => {
    const { room, c } = roomWith(3, CUSTOM);
    startAndChoose(room, c);
    const stroke = { t: 's', id: 1, tool: 'pen', c: '#000000', a: 1, w: 6, sym: false, p: [10, 10, 1] };
    expect(() => G.draw(room, 'p2', [stroke], c.ctx())).toThrow('not_drawer');
    const ctx = c.ctx();
    expect(G.draw(room, 'p1', [stroke, { t: 'hack' }, { t: 'f', x: 5, y: 5, c: 'red', tol: 1 }], ctx)).toBe(1);
    expect(ctx.out[0].to).toEqual({ except: 'p1' });
    expect(G.drawingSnapshot(room).actions).toHaveLength(1);
  });
});

describe('flujo completo', () => {
  it('cada jugador dibuja una vez por ronda; al final hay podio y premios', () => {
    const { room, c } = roomWith(3, { ...CUSTOM, rounds: 2, wordChoices: 1 });
    G.startGame(room, 'p1', c.ctx());
    const drawers = [];
    while (room.phase === 'playing') {
      const t = room.turn;
      if (t.phase === 'drawing') {
        drawers.push(t.drawerId);
        for (const pl of room.players) if (pl.id !== t.drawerId) guess(room, c, pl.id, t.word);
      }
      c.advance(G.TIMING.TURN_END_MS + 1);
      G.tick(room, c.ctx());
    }
    expect(drawers).toEqual(['p1', 'p2', 'p3', 'p1', 'p2', 'p3']);
    expect(room.results.ranking).toHaveLength(3);
    expect(room.results.awards.fastest).toBeTruthy();
    G.playAgain(room, 'p1', c.ctx());
    expect(room.phase).toBe('lobby');
    expect(room.players.every((pl) => pl.score === 0)).toBe(true);
  });

  it('entrada tardía: ve el dibujo en curso y entra en el orden desde la próxima ronda', () => {
    const { room, c } = roomWith(2, { ...CUSTOM, rounds: 2 });
    startAndChoose(room, c);
    G.draw(room, 'p1', [{ t: 's', id: 7, tool: 'pen', c: '#ff0000', a: 1, w: 8, sym: false, p: [1, 1, 1, 50, 50, 1] }], c.ctx());
    G.addPlayer(room, { id: 'late', name: 'Tarde', avatar: {} }, c.ctx());
    expect(G.drawingSnapshot(room).actions).toHaveLength(1);
    expect(room.order).not.toContain('late');
    // Termina ronda 1
    for (let i = 0; i < 4 && room.round === 1; i += 1) {
      c.advance(200000);
      G.tick(room, c.ctx());
      if (room.turn.phase === 'choosing') G.chooseWord(room, room.turn.drawerId, 0, c.ctx());
    }
    expect(room.round).toBe(2);
    expect(room.order).toContain('late');
  });

  it('votos 👍/👎 una vez por turno y expulsión por mayoría', () => {
    const { room, c } = roomWith(4, CUSTOM);
    startAndChoose(room, c);
    G.vote(room, 'p2', 1, c.ctx());
    expect(() => G.vote(room, 'p2', -1, c.ctx())).toThrow('already_voted');
    expect(() => G.vote(room, 'p1', 1, c.ctx())).toThrow('cannot_vote_self');
    // 3 votantes posibles (sin contar al acusado): la mayoría son 2.
    G.voteKick(room, 'p1', 'p4', c.ctx());
    expect(p(room, 'p4')).toBeTruthy();
    expect(() => G.voteKick(room, 'p1', 'p4', c.ctx())).toThrow('already_voted');
    G.voteKick(room, 'p2', 'p4', c.ctx());
    expect(p(room, 'p4')).toBe(undefined);
    expect(() => G.addPlayer(room, { id: 'p4', name: 'X', avatar: {} }, c.ctx())).toThrow('kicked');
  });

  it('sala pública: arranca sola con 2 jugadores', () => {
    const c0 = roomWith(0).c;
    const room = G.createRoom({ code: 'PUB01', isPublic: true }, c0.ctx());
    G.addPlayer(room, { id: 'a', name: 'A', avatar: {} }, c0.ctx());
    G.addPlayer(room, { id: 'b', name: 'B', avatar: {} }, c0.ctx());
    expect(room.autoStartAt).toBeTruthy();
    c0.advance(G.TIMING.PUBLIC_START_MS + 1);
    G.tick(room, c0.ctx());
    expect(room.phase).toBe('playing');
  });
});
