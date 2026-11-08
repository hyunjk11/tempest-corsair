import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

const outDir = process.env.SMOKE_DIR ?? '/tmp/corsair-smoke';
fs.mkdirSync(outDir, { recursive: true });
const errors = [];

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? '/usr/local/bin/google-chrome',
  headless: true,
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-webgl',
    '--ignore-gpu-blocklist',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--window-size=1440,900',
  ],
  defaultViewport: { width: 1440, height: 900 },
});

const page = await browser.newPage();
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
page.on('pageerror', (error) => errors.push(String(error)));

await page.goto('http://127.0.0.1:43123/', { waitUntil: 'networkidle0' });
await page.waitForSelector('#btn-start');
await new Promise((resolve) => setTimeout(resolve, 800));
await page.screenshot({ path: `${outDir}/title.png` });

const gl = await page.evaluate(() => {
  const canvas = document.querySelector('#sea');
  if (!(canvas instanceof HTMLCanvasElement)) return { ok: false, reason: 'no canvas' };
  const context = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
  if (!context) return { ok: false, reason: 'no webgl', width: canvas.width, height: canvas.height };
  const extension = context.getExtension('WEBGL_debug_renderer_info');
  return {
    ok: true,
    width: canvas.width,
    height: canvas.height,
    renderer: extension ? context.getParameter(extension.UNMASKED_RENDERER_WEBGL) : 'unknown',
  };
});

await page.click('#btn-start');
await page.waitForFunction(() => window.__CORSAIR__?.status() === 'playing');
const audio = await page.evaluate(async () => {
  window.__CORSAIR__?.debugTone();
  await new Promise((resolve) => setTimeout(resolve, 150));
  return window.__CORSAIR__?.audio();
});
await page.click('#btn-sound');
const muted = await page.evaluate(() => ({
  label: document.querySelector('#btn-sound')?.textContent,
  audio: window.__CORSAIR__?.audio(),
}));
await page.click('#btn-sound');
await page.screenshot({ path: `${outDir}/after-stage0-forward.png` });
const steerBefore = await page.evaluate(() => window.__CORSAIR__?.snapshot());
await page.keyboard.down('ArrowRight');
await page.keyboard.down('ArrowUp');
await new Promise((resolve) => setTimeout(resolve, 900));
const steerAfter = await page.evaluate(() => window.__CORSAIR__?.snapshot());
await page.screenshot({ path: `${outDir}/after-arrow-right.png` });
await page.keyboard.up('ArrowRight');
await page.keyboard.up('ArrowUp');
await page.evaluate(() => window.__CORSAIR__?.startStage(0));
await page.waitForFunction(() => window.__CORSAIR__?.status() === 'playing');
await page.keyboard.down('KeyW');
await page.keyboard.down('Space');
await new Promise((resolve) => setTimeout(resolve, 1800));
const moving = await page.evaluate(() => window.__CORSAIR__?.snapshot());
await page.screenshot({ path: `${outDir}/combat.png` });

let fired = false;
for (let i = 0; i < 24; i += 1) {
  await page.keyboard.down('KeyQ');
  await page.keyboard.up('KeyQ');
  await page.keyboard.down('KeyE');
  await page.keyboard.up('KeyE');
  await new Promise((resolve) => setTimeout(resolve, 280));
  const snap = await page.evaluate(() => window.__CORSAIR__?.snapshot());
  if (snap?.projectiles > 0 || snap?.enemies?.some((enemy) => enemy.hp < 36) || snap?.status === 'victory') {
    fired = true;
    await page.screenshot({ path: `${outDir}/broadsides.png` });
    break;
  }
}
await page.keyboard.up('KeyW');
await page.keyboard.up('Space');
const afterFight = await page.evaluate(() => window.__CORSAIR__?.snapshot());

const kraken = await browser.newPage();
kraken.on('pageerror', (error) => errors.push(String(error)));
kraken.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
await kraken.goto('http://127.0.0.1:43123/?autostart=1&stage=5&mute=1', { waitUntil: 'networkidle0' });
await kraken.waitForFunction(() => window.__CORSAIR__?.snapshot()?.kraken?.alive === true);
await new Promise((resolve) => setTimeout(resolve, 1600));
await kraken.screenshot({ path: `${outDir}/kraken.png` });
const krakenSnap = await kraken.evaluate(() => window.__CORSAIR__?.snapshot());

const upgraded = await browser.newPage();
await upgraded.goto('http://127.0.0.1:43123/?autostart=1&stage=0&upgrades=2&mute=1', { waitUntil: 'networkidle0' });
await upgraded.waitForFunction(() => window.__CORSAIR__?.status() === 'playing');
await new Promise((resolve) => setTimeout(resolve, 900));
await upgraded.screenshot({ path: `${outDir}/upgraded-ship.png` });
await upgraded.close();
await kraken.close();
await page.close();

const factions = await browser.newPage();
factions.on('pageerror', (error) => errors.push(String(error)));
factions.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
await factions.goto('http://127.0.0.1:43123/?autostart=1&stage=4&mute=1', { waitUntil: 'networkidle0' });
await factions.waitForFunction(() => window.__CORSAIR__?.status() === 'playing');
await new Promise((resolve) => setTimeout(resolve, 2200));
await factions.screenshot({ path: `${outDir}/after-factions.png` });
const factionSnap = await factions.evaluate(() => window.__CORSAIR__?.snapshot());

const mobile = await browser.newPage();
await mobile.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
mobile.on('pageerror', (error) => errors.push(String(error)));
mobile.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
await mobile.goto('http://127.0.0.1:43123/?autostart=1&stage=0&mute=1', { waitUntil: 'networkidle0' });
await mobile.waitForFunction(() => window.__CORSAIR__?.status() === 'playing');
const touchShown = await mobile.evaluate(() => getComputedStyle(document.querySelector('#touch')).display);
const stick = await mobile.$('#stick');
const box = await stick?.boundingBox();
if (box) {
  await mobile.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await mobile.mouse.down();
  await mobile.mouse.move(box.x + 12, box.y + box.height / 2, { steps: 4 });
}
await new Promise((resolve) => setTimeout(resolve, 700));
const touchSnap = await mobile.evaluate(() => window.__CORSAIR__?.snapshot());
await mobile.screenshot({ path: `${outDir}/after-mobile-touch.png` });
if (box) await mobile.mouse.up();
await browser.close();

const report = { gl, moving, fired, afterFight, krakenSnap, audio, muted, steerBefore, steerAfter, factionSnap, touchShown, touchSnap, errors };
fs.writeFileSync(`${outDir}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (!gl?.ok) process.exit(1);
if (!moving?.player || moving.player.z <= -15.5) process.exit(2);
if (!fired) process.exit(3);
if (errors.length) process.exit(4);
if (!audio?.audible || audio.context !== 'running' || audio.level < 0.02 || audio.voices < 1) process.exit(5);
if (muted?.audio?.muted !== true || muted?.label !== '소리 꺼짐') process.exit(10);
if (!steerAfter?.player || steerAfter.player.heading >= -0.15) process.exit(6);
const kinds = new Set((factionSnap?.enemies ?? []).map((enemy) => enemy.faction));
if (kinds.size < 3) process.exit(7);
if (touchShown !== 'flex') process.exit(8);
if (!touchSnap?.player || touchSnap.player.heading <= 0.1) process.exit(9);
