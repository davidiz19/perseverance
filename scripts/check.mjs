import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
const url = process.env.URL || 'http://localhost:5173';
const args = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
let browser;
try { browser = await chromium.launch({ channel: 'chrome', headless: true, args }); }
catch { browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args }); }
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(4000);
mkdirSync('screenshots', { recursive: true });
await page.screenshot({ path: 'screenshots/check.png' });
await browser.close();
console.log('Captura: screenshots/check.png');
if (errors.length) { console.log(`${errors.length} error(es):`); errors.forEach(e => console.log(' - ' + e)); process.exit(1); }
console.log('0 errores de consola');
