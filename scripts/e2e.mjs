// Prueba end-to-end con navegadores reales (Playwright).
// Requisito (una vez):  npm i -D playwright && npx playwright install chromium
// Uso:                  npm run e2e      (SCREENSHOTS=1 guarda capturas en ./e2e-shots)
//
// Recorre: inicio → sala privada → 2 jugadores (uno en celular) → partida de 2
// rondas dibujando y adivinando → alguien entra tarde y ve el dibujo → podio →
// sala pública con emparejamiento automático.

import { createRequire } from 'node:module';
import fs from 'node:fs';
import { startServer } from '../server/index.js';

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    if (process.env.PLAYWRIGHT_PATH) return createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH);
    console.error('Falta Playwright. Instalalo con:  npm i -D playwright && npx playwright install chromium');
    process.exit(2);
  }
}

const { chromium, devices } = await loadPlaywright();
const shots = process.env.SCREENSHOTS ? 'e2e-shots' : null;
if (shots) fs.mkdirSync(shots, { recursive: true });
const srv = await startServer({ port: 0, quiet: true });
const base = `http://localhost:${srv.port}`;
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const errors = [];
let failed = false;

const check = (cond, msg) => {
  console.log(`${cond ? '✓' : '✗'} ${msg}`);
  if (!cond) failed = true;
};
const snap = async (page, name) => { if (shots) await page.screenshot({ path: `${shots}/${name}.png` }); };

async function newPlayer(name, opts = { viewport: { width: 1360, height: 860 } }) {
  const page = await (await browser.newContext(opts)).newPage();
  page.on('pageerror', (e) => errors.push(`[${name}] ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${name}] ${m.text()}`); });
  await page.goto(base);
  await page.fill('#name', name);
  return page;
}

async function drawSomething(page) {
  const box = await page.locator('.board .over').boundingBox();
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.6);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.3, { steps: 12 });
  await page.mouse.up();
}

try {
  const a = await newPlayer('Ana');
  await snap(a, '01-inicio');
  await a.click('text=Crear sala privada');
  await a.waitForSelector('.room-code');
  const code = (await a.textContent('.room-code')).trim();
  check(/^[A-Z0-9]{5}$/.test(code), `sala privada creada (${code})`);
  await a.selectOption('.settings-grid select >> nth=2', '2');

  const b = await newPlayer('Beto', { ...devices['iPhone 13'] });
  await b.fill('#code', code);
  await b.click('button:has-text("Unirse")');
  await b.waitForSelector('.room-code');
  await a.waitForTimeout(300);
  await snap(a, '02-sala');
  await a.click('button:has-text("Empezar")');

  const pages = { Ana: a, Beto: b };
  let late = null;
  let turns = 0;
  let lateSawDrawing = false;
  for (let i = 0; i < 400; i += 1) {
    for (const p of Object.values(pages)) {
      const choice = p.locator('.choice');
      if (!(await choice.count())) continue;
      if (turns === 0) await snap(p, '03-elegir');
      await choice.first().click();
      await p.waitForTimeout(300);
      await drawSomething(p);
      await p.waitForTimeout(300);
      const word = (await p.locator('.word-real').textContent()).trim();
      turns += 1;
      if (turns === 1) await snap(p, '04-dibujando');
      if (turns === 2 && !late) {
        late = await newPlayer('Tardío');
        await late.fill('#code', code);
        await late.click('button:has-text("Unirse")');
        await late.waitForSelector('.board');
        await late.waitForTimeout(800);
        // ¿Ve el trazo ya dibujado? (algún píxel no blanco en el lienzo)
        lateSawDrawing = await late.evaluate(() => {
          const c = document.querySelector('.board .paint');
          const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
          for (let k = 0; k < d.length; k += 4) if (d[k] < 200) return true;
          return false;
        });
        await snap(late, '05-entra-tarde');
      }
      for (const q of [...Object.values(pages), late].filter(Boolean)) {
        if (q === p) continue;
        await q.locator('.chat-input').fill(word);
        await q.locator('.chat-input').press('Enter');
      }
    }
    if (late && !pages['Tardío']) pages['Tardío'] = late;
    if (await a.locator('.podium-card').count()) break;
    await a.waitForTimeout(250);
  }
  await a.waitForTimeout(1200);
  await snap(a, '06-podio');
  check(turns === 5, `cada uno dibujó una vez por ronda; el que entró tarde se sumó en la ronda 2 (${turns} turnos)`);
  check(lateSawDrawing, 'quien entra tarde ve el dibujo en curso');
  check(await a.locator('.podium-card').count() === 1, 'podio final');
  check(await a.locator('.final-table tbody tr').count() === 3, 'tabla final con 3 jugadores');

  const d = await newPlayer('Dani');
  await d.click('text=¡Jugar!');
  const e = await newPlayer('Eli');
  await e.click('text=¡Jugar!');
  await d.waitForSelector('.room-code');
  await e.waitForSelector('.room-code');
  check((await d.textContent('.room-code')) === (await e.textContent('.room-code')), '"¡Jugar!" empareja en la misma sala pública');
  await d.waitForSelector('.board', { timeout: 15000 });
  check(true, 'la sala pública arrancó sola');
} catch (err) {
  console.error(err);
  failed = true;
} finally {
  check(errors.length === 0, `sin errores en consola${errors.length ? `:\n  ${errors.join('\n  ')}` : ''}`);
  await browser.close();
  await srv.close();
  process.exit(failed ? 1 : 0);
}
