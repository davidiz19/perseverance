import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
// ?datos=copia: NASA's CDN rejects headless Chrome (403), so the check uses the saved NASA copy.
const url = process.env.URL || 'http://localhost:5173/?datos=copia';
const args = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
let browser;
try { browser = await chromium.launch({ channel: 'chrome', headless: true, args }); }
catch { browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args }); }
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); else if (!m.text().startsWith('[vite]')) console.log('[page] ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(4000);

// drive: forward with a turn so the tracks show; check wheels spin and corners steer
await page.waitForFunction(() => window.rover, null, { timeout: 20000 }).catch(() => {});
const snap = () => page.evaluate(() => window.rover && { spin: window.rover.wheels.map((w) => w.spin.rotation.x), r: window.rover.wheels[0].radius, x: window.rover.rover.position.x, z: window.rover.rover.position.z });
const s0 = await snap();
await page.keyboard.down('KeyW'); await page.waitForTimeout(2500);
await page.keyboard.down('KeyA'); await page.waitForTimeout(1500);
const turning = await page.evaluate(() => window.rover && ({
  steer: window.rover.wheels.map((w) => +(w.steer.rotation.y * 57.3).toFixed(1)),
  speed: +window.rover.speed.toFixed(2) }));
await page.keyboard.up('KeyA');
await page.waitForTimeout(1500); await page.keyboard.up('KeyW'); await page.waitForTimeout(1500);
const s1 = await snap();
if (!s0 || !s1) errors.push('física: el rover no cargó');
else {
  const turns = s1.spin.map((v, i) => Math.abs(v - s0.spin[i]) / (2 * Math.PI));
  const dist = Math.hypot(s1.x - s0.x, s1.z - s0.z), expected = dist / (2 * Math.PI * s0.r);
  const steered = turning.steer.filter((a) => Math.abs(a) > 2).length;
  console.log(`Ruedas: avanzó ${dist.toFixed(1)} m → esperadas ~${expected.toFixed(1)} vueltas; dio ${turns.map((t) => t.toFixed(2)).join(' / ')} · ángulos al girar ${turning.steer.join(' / ')}° a ${turning.speed} m/s`);
  if (dist < 0.2) errors.push('física: el rover no avanzó');
  if (turns.length !== 6 || turns.some((t) => t < expected * 0.8)) errors.push('física: alguna rueda no giró lo que corresponde a la distancia');
  if (steered !== 4) errors.push(`física: se esperaban 4 ruedas de esquina orientadas, hay ${steered}`);
}

// mission control: the 4 telemetry cards must hold real numbers
await page.waitForFunction(() => {
  const cs = [...document.querySelectorAll('#mc [data-telemetry]')];
  return cs.length && cs.every((c) => c.dataset.state !== 'loading');
}, null, { timeout: 20000 }).catch(() => {});
const cards = await page.$$eval('#mc [data-telemetry]', (cs) => cs.map((c) => ({ key: c.dataset.telemetry, state: c.dataset.state,
  value: c.dataset.value, text: c.querySelector('.val').textContent, src: c.querySelector('.src').textContent })));
console.log('Control de misión:');
for (const c of cards) {
  const ok = c.state === 'ready' && Number.isFinite(Number(c.value));
  console.log(`  ${ok ? 'OK ' : 'MAL'} ${c.key.padEnd(10)} ${c.text.padEnd(12)} ${c.src}`);
  if (!ok) errors.push(`telemetría: ${c.key} no cargó (${c.state})`);
}
if (cards.length !== 4) errors.push(`telemetría: se esperaban 4 datos, hay ${cards.length}`);

mkdirSync('screenshots', { recursive: true });
await page.screenshot({ path: 'screenshots/check.png' });

// T hides the panel, T again shows it
await page.keyboard.press('KeyT'); await page.waitForTimeout(1500);
const hidden = await page.$eval('#mc', (el) => el.classList.contains('off') && getComputedStyle(el).opacity === '0');
await page.screenshot({ path: 'screenshots/check-oculto.png' });
await page.keyboard.press('KeyT'); await page.waitForTimeout(500);
const shown = await page.$eval('#mc', (el) => !el.classList.contains('off'));
console.log(`Tecla T: oculta ${hidden ? 'OK' : 'MAL'}, vuelve ${shown ? 'OK' : 'MAL'}`);
if (!hidden || !shown) errors.push('la tecla T no oculta/muestra el control de misión');

// cameras: click each glowing dot → a real NASA photo must open for that camera
await page.waitForFunction(() => window.percyCams?.list.length, null, { timeout: 20000 }).catch(() => {});
const camKeys = await page.evaluate(() => window.percyCams?.list.map((c) => c.key) ?? []);
if (camKeys.length !== 4) errors.push(`cámaras: se esperaban 4 puntos, hay ${camKeys.length}`);
for (const [i, key] of camKeys.entries()) {
  const pt = await page.evaluate((i) => window.percyCams.list[i].screen(), i);
  await page.mouse.move(pt.x, pt.y); await page.waitForTimeout(300);
  const tipText = await page.$eval('#cam-tip', (t) => (t.hidden ? '' : t.firstChild.textContent));
  await page.mouse.click(pt.x, pt.y);
  const ok = await page.waitForFunction((key) => {
    const v = document.querySelector('#photo'), img = v?.querySelector('img');
    return v?.dataset.camera === key && v.dataset.loaded === 'true' && img.naturalWidth > 0;
  }, key, { timeout: 15000 }).then(() => true).catch(() => false);
  const info = ok ? await page.$eval('#photo', (v) => ({ cap: v.querySelector('figcaption b').parentElement.firstChild.textContent.replace(/\s+/g, ' ').trim()
    + v.querySelector('figcaption div').childNodes[2]?.textContent.replace(/\s+/g, ' ') , w: v.querySelector('img').naturalWidth, src: v.querySelector('img').getAttribute('src') })) : null;
  console.log(`Cámara ${key.padEnd(8)} hover "${tipText || '—'}" → ${ok ? `foto ${info.w}px ${info.src.split('/').pop().slice(0, 28)}…` : 'NO ABRIÓ'}`);
  if (!ok) { errors.push(`cámaras: ${key} no abrió una foto`); await page.keyboard.press('Escape'); continue; }
  if (!tipText) errors.push(`cámaras: ${key} no muestra su nombre al pasar el mouse`);
  if (i === 0) {
    await page.waitForTimeout(3800); // let it develop and the hint appear
    await page.screenshot({ path: 'screenshots/check-foto.png' });
    const caption = await page.$eval('#photo figcaption', (f) => f.innerText.replace(/\s+/g, ' '));
    console.log(`  pie de foto: ${caption}`);
    if (!/sol \d+/.test(caption) || !/(hace \d+ días?|hoy)/.test(caption)) errors.push('cámaras: el pie no dice sol y hace cuántos días');
    await page.keyboard.press('ArrowRight'); await page.waitForTimeout(300);
    const count = await page.$eval('#photo .count', (c) => c.textContent);
    if (!count.startsWith('2 /')) errors.push('cámaras: la flecha → no pasa a la siguiente foto');
  }
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  if (await page.$('#photo')) errors.push('cámaras: Esc no cierra la foto');
}

await browser.close();
console.log('Capturas: screenshots/check.png, check-oculto.png, check-foto.png');
if (errors.length) { console.log(`${errors.length} error(es):`); errors.forEach(e => console.log(' - ' + e)); process.exit(1); }
console.log('0 errores de consola');
