// Integración: clientes reales de Socket.IO contra el servidor.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { io as connect } from 'socket.io-client';
import { startServer } from '../server/index.js';

let srv;
let url;
const sockets = [];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const call = (s, ev, payload = {}) => new Promise((resolve) => s.emit(ev, payload, resolve));

function client() {
  const s = connect(url, { transports: ['websocket'], forceNew: true });
  s.log = [];
  s.state = null;
  s.onAny((event, data) => {
    s.log.push({ event, json: JSON.stringify(data ?? null) });
    if (event === 'room:state') s.state = data;
  });
  sockets.push(s);
  return s;
}

beforeAll(async () => {
  srv = await startServer({ port: 0, quiet: true });
  url = `http://localhost:${srv.port}`;
});

afterAll(async () => {
  sockets.forEach((s) => s.close());
  await srv.close();
});

const SECRETS = ['zorrotrompeta', 'quesovolador', 'tortugalunar', 'pianoburbuja'];

describe('servidor', () => {
  it('la palabra nunca llega a quien adivina antes de tiempo; dibujo, chat secreto y reconexión', async () => {
    const host = client();
    const b = client();
    const c = client();
    const created = await call(host, 'room:create', { name: 'Host', avatar: { c: 1, e: 2, m: 3, a: 4 } });
    expect(created.ok).toBe(true);
    const jb = await call(b, 'room:join', { code: created.code, name: 'Beto' });
    const jc = await call(c, 'room:join', { code: created.code, name: '<script>Caro' });
    expect(jb.ok && jc.ok).toBe(true);
    await wait(60);
    expect(c.state.players.map((p) => p.name)).toContain('scriptCaro');

    // Solo el anfitrión cambia ajustes; nadie más ve las palabras personalizadas.
    expect((await call(b, 'room:settings', { patch: { rounds: 9 } })).error).toBe('host_only');
    await call(host, 'room:settings', { patch: { customWords: SECRETS.join(', '), customOnly: true, wordChoices: 1, rounds: 2 } });
    await wait(40);
    expect(b.state.settings.customWords).toEqual([]);
    expect(b.state.settings.customCount).toBe(4);
    expect((await call(host, 'room:start')).ok).toBe(true);
    await wait(80);
    const word = host.state.turn.word;
    expect(SECRETS).toContain(word);
    expect(b.state.turn.word).toBe(null);
    expect(b.state.turn.mask.length).toBe(word.length);

    // Un espectador no puede dibujar; el dibujante sí, y los demás lo reciben.
    c.emit('draw', [{ t: 'clr' }]);
    host.emit('draw', [{ t: 's', id: 1, tool: 'pen', c: '#000000', a: 1, w: 6, sym: false, p: [10, 10, 1, 20, 20, 1] }]);
    await wait(80);
    expect(b.log.filter((l) => l.event === 'draw:cmds')).toHaveLength(1);
    expect(host.log.filter((l) => l.event === 'draw:cmds')).toHaveLength(0);

    // Hasta acá, ningún mensaje recibido por B o C contiene ninguna palabra secreta.
    for (const s of [b, c]) {
      for (const l of s.log) for (const w of SECRETS) expect(l.json.includes(w)).toBe(false);
    }

    // B adivina: C no ve el texto ni los mensajes secretos de B.
    await call(b, 'chat:send', { text: word.toUpperCase() });
    await call(b, 'chat:send', { text: `jaja era ${word}` });
    await wait(80);
    expect(b.state.turn.word).toBe(word);
    for (const l of c.log) for (const w of SECRETS) expect(l.json.includes(w)).toBe(false);
    expect(c.log.some((l) => l.event === 'chat:message' && l.json.includes('guessed'))).toBe(true);

    // Entrada tardía: recibe el dibujo en curso (replay).
    const late = client();
    const jl = await call(late, 'room:join', { code: created.code, name: 'Tarde' });
    expect(jl.ok).toBe(true);
    await wait(60);
    const replay = late.log.find((l) => l.event === 'draw:replay');
    expect(JSON.parse(replay.json).actions).toHaveLength(1);

    // C acierta también... o se acaba: forzamos fin respondiendo bien.
    await call(c, 'chat:send', { text: word });
    await call(late, 'chat:send', { text: word });
    await wait(80);
    expect(c.state.turn.phase).toBe('end');
    expect(c.state.turn.word).toBe(word);

    // Reconexión con la sesión guardada: recupera puntaje.
    const scoreB = b.state.players.find((p) => p.id === jb.playerId).score;
    expect(scoreB).toBeGreaterThan(0);
    b.close();
    await wait(60);
    const b2 = client();
    expect((await call(b2, 'session:resume', { code: created.code, playerId: jb.playerId, secret: jb.secret })).ok).toBe(true);
    await wait(60);
    expect(b2.state.players.find((p) => p.id === jb.playerId).score).toBe(scoreB);
    expect((await call(b2, 'session:resume', { code: created.code, playerId: jb.playerId, secret: 'x' })).error).toBe('invalid_session');
  });

  it('"Jugar" empareja en salas públicas y límite de tasa del chat', async () => {
    const a = client();
    const b2 = client();
    const r1 = await call(a, 'room:play', { name: 'Ana' });
    const r2 = await call(b2, 'room:play', { name: 'Bruno' });
    expect(r1.code).toBe(r2.code);
    const stats = await call(a, 'stats');
    expect(stats.stats.publicRooms.length).toBeGreaterThan(0);
    const results = await Promise.all(Array.from({ length: 20 }, () => call(a, 'chat:send', { text: 'hola' })));
    expect(results.some((r) => r.error === 'rate_limited')).toBe(true);
  });
});
