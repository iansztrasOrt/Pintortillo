// Servidor HTTP + Socket.IO de PintORTillo. El servidor es la fuente de verdad:
// elige palabras, valida adivinanzas, calcula puntos y controla los tiempos.
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';
import { attachSockets } from './sockets.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TICK_MS = 200;

export async function startServer({ port = Number(process.env.PORT) || 3000, quiet = false, managerOptions = {} } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
      + "font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self' ws: wss:; "
      + "base-uri 'self'; form-action 'self'; frame-ancestors 'self'",
    );
    next();
  });
  // El navegador solo necesita los módulos puros del motor (nunca el banco de palabras).
  const pure = ['drawing.js', 'raster.js', 'hints.js'];
  app.get('/engine/:file', (req, res, next) => {
    if (!pure.includes(req.params.file)) return res.status(404).end();
    return res.sendFile(path.join(ROOT, 'engine', req.params.file));
  });
  app.use('/shared', express.static(path.join(ROOT, 'shared')));
  app.use(express.static(path.join(ROOT, 'public')));
  app.get('/healthz', (req, res) => res.json({ ok: true, ...manager.stats() }));
  app.get('/sala/:code', (req, res) => res.redirect(`/?sala=${encodeURIComponent(req.params.code)}`));

  const server = http.createServer(app);
  const io = new Server(server, { maxHttpBufferSize: 32 * 1024, pingInterval: 10000, pingTimeout: 8000 });
  const manager = attachSockets(io, { quiet, managerOptions });
  const timer = setInterval(() => manager.tick(), TICK_MS);

  await new Promise((resolve) => server.listen(port, resolve));
  const actual = server.address().port;
  if (!quiet) console.log(`PintORTillo escuchando en http://localhost:${actual}`);

  return {
    io, server, manager, port: actual,
    async close() {
      clearInterval(timer);
      io.close();
      await new Promise((resolve) => server.close(() => resolve()));
    },
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const srv = await startServer();
  const stop = async () => {
    await srv.close();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
