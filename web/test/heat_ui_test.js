// node web/test/heat_ui_test.js — панель «Отопление» в Chromium: реестр из «чертежа», таблицы, правка, отправка в AutoCAD
const { chromium } = require(process.env.PW || 'playwright');
const path = require('path'), fs = require('fs'), assert = require('assert');
const OUT = path.resolve(__dirname, '../out'); fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1500, height: 1000 } })).newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.addInitScript(() => {
    window.__sent = []; window.chrome = { webview: { postMessage: m => window.__sent.push(m), addEventListener: (t, f) => { window.__on = f; } } };
  });
  await page.goto('file://' + path.resolve(__dirname, '../../dist/heat.html'));
  const reg = { type: 'heat-registry', sheets: { plan: 1, scheme: 1, spec: 2, od: 1 }, shrv: 1, len: null, rads: [], state: '',
    rooms: [{ no: 1, name: 'Гостиная', area: 20.5, h: 2700 }, { no: 2, name: 'Спальня', area: 14.2, h: 2700 }, { no: 3, name: 'Кухня', area: 9.8, h: 2700 }, { no: 4, name: 'Санузел', area: 4, h: 2700 }],
    windows: [{ id: 1, room: 1, w: 1900, manual: 0 }, { id: 2, room: 2, w: 1800, manual: 0 }, { id: 3, room: 3, w: 1500, manual: 0 }] };
  await page.evaluate(r => window.__on({ data: r }), reg);
  assert.deepStrictEqual(await page.evaluate(() => window.__sent[0]), 'ready\n');
  assert.strictEqual(await page.locator('#rooms tbody tr').count(), 4);
  assert.strictEqual(await page.locator('#rads tbody tr').count(), 3);
  // смена серии у окна 1 -> Monolit
  await page.selectOption('#rads tr[data-win="1"] select[data-k="series"]', 'monolit');
  assert(/Monolit/.test(await page.locator('#rads tr[data-win="1"]').innerText()));
  // отключить отопление кухни
  await page.click('#rooms tr[data-no="3"] input[data-k="heat"]');
  assert.strictEqual(await page.locator('#rads tbody tr').count(), 2);
  await page.screenshot({ path: OUT + '/heat_panel.png', fullPage: true });
  await page.click('#buildBtn');
  const msg = await page.evaluate(() => window.__sent[window.__sent.length - 1]);
  assert(msg.startsWith('heat\n(STATE "'), msg.slice(0, 40));
  assert(/^[\x09\x0a\x0d\x20-\x7e]*$/.test(msg), 'не ASCII');
  assert.strictEqual((msg.match(/\n\(RAD /g) || []).length, 2);
  // состояние возвращается из чертежа и восстанавливается
  const st = await page.evaluate(() => JSON.stringify(window.GIPHEATUI.S.st));
  await page.evaluate(r => window.__on({ data: r }), Object.assign({}, reg, { state: st }));
  assert.strictEqual(await page.locator('#rads tbody tr').count(), 2, 'состояние (кухня без отопления) восстановлено из чертежа');
  assert(/Monolit/.test(await page.locator('#rads tr[data-win="1"]').innerText()), 'серия окна 1 восстановлена');
  assert.deepStrictEqual(errs, []);
  await browser.close();
  console.log('heat ui: ALL OK');
})().catch(e => { console.error(e); process.exit(1); });
