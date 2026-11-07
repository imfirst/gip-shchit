// node web/test/cond_ui_test.js — панели «Кондиционирование» и «Проект» в Chromium: реестр, подбор, отправка в AutoCAD
const { chromium } = require(process.env.PW || 'playwright');
const path = require('path'), fs = require('fs'), assert = require('assert');
const OUT = path.resolve(__dirname, '../out'); fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  async function open(file) {
    const page = await ctx.newPage(), errs = [];
    page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.addInitScript(() => { window.__sent = []; window.chrome = { webview: { postMessage: m => window.__sent.push(m), addEventListener: (t, f) => { window.__on = f; } } }; });
    await page.goto('file://' + path.resolve(__dirname, '../../dist/' + file));
    return { page, errs };
  }
  // ---- кондиционирование
  let { page, errs } = await open('cond.html');
  const reg = { type: 'cond-registry', sheets: { plan: 1, scheme: 1, spec: 2 }, len: null, state: '',
    rooms: [{ no: 1, name: 'Гостиная', area: 24, h: 2.8 }, { no: 2, name: 'Спальня', area: 14, h: 2.7 }],
    units: [{ id: 1, kind: 'I', room: 1, link: 2 }, { id: 2, kind: 'O', room: 0, link: null }, { id: 3, kind: 'I', room: 2, link: 4 }, { id: 4, kind: 'O', room: 0, link: null }, { id: 5, kind: 'K', room: 0, link: null }] };
  await page.evaluate(r => window.__on({ data: r }), reg);
  assert.strictEqual(await page.evaluate(() => window.__sent[0]), 'ready\n');
  assert.strictEqual(await page.locator('#ins tbody tr').count(), 2);
  assert.strictEqual(await page.locator('#outs tbody tr').count(), 2);
  assert(/AS25HQJ2HRA-W/.test(await page.locator('#ins tr[data-id="1"]').innerHTML()));
  await page.selectOption('#ins tr[data-id="3"] select[data-k="model"]', 'AS35HQJ2HRA-W');
  assert(/3\.5/.test(await page.locator('#ins tr[data-id="3"]').innerText()));
  assert(/1U35HQJ2FRA/.test(await page.locator('#outs tr[data-id="4"]').innerHTML()), 'наружный по паре');
  // смена оборудования на LG VRF: один наружный — предупреждения про сплит не будет, но будет индекс
  await page.selectOption('#p_brand', 'lg_vrf');
  assert(/ARNU/.test(await page.locator('#ins tbody').innerHTML()));
  await page.screenshot({ path: OUT + '/cond_panel.png', fullPage: true });
  await page.click('#wallsBtn');
  assert.strictEqual(await page.evaluate(() => window.__sent[window.__sent.length - 1]), 'cmd\nGIPWALLS');
  await page.click('#buildBtn');
  const msg = await page.evaluate(() => window.__sent[window.__sent.length - 1]);
  assert(msg.startsWith('build\n(STATE "') && msg.includes('(OPT "mode" "vrf")') && /\(UNIT 1 "LG" "ARNU/.test(msg), msg.slice(0, 200));
  assert(!/[^\x00-\x7e]/.test(msg), 'в AutoCAD только ASCII');
  // ответ AutoCAD и восстановление состояния из чертежа
  const st = JSON.parse(msg.split('\n')[1].match(/^\(STATE "(.*)"\)\r?$/)[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\'));
  await page.evaluate(([r, s]) => window.__on({ data: Object.assign({}, r, { state: JSON.stringify(s) }) }), [reg, st]);
  assert.strictEqual(await page.inputValue('#p_brand'), 'lg_vrf');
  assert.deepStrictEqual(errs, []);
  // ---- проект
  ({ page, errs } = await open('proekt.html'));
  await page.evaluate(() => window.__on({ data: { type: 'project-registry', rooms: { n: 5, area: 62.4 }, eom: { sheets: 12, panel: false },
    heat: { plan: true, scheme: true, spec: 2, windows: 3, shrv: true, built: true, t1: 25.3, rads: 3 }, cond: { plan: true, scheme: true, spec: 2, I: 2, O: 0, R: 0, K: 1, built: false }, walls: [], state: '' } }));
  assert.strictEqual(await page.locator('.pj-card').count(), 4);
  const au = await page.locator('#audit').innerText();
  assert(/адрес/.test(au) && /наружного блока/.test(au) && /группы щита/.test(au), au);
  await page.fill('#f_address', 'г. Москва, Ильменский пр-д, д. 4');
  await page.dispatchEvent('#f_address', 'change');
  assert(!/адрес объекта/.test(await page.locator('#audit').innerText()));
  await page.click('.pj-card button[data-tab="cond"]');
  assert.strictEqual(await page.evaluate(() => window.__sent[window.__sent.length - 1]), 'tab\ncond');
  await page.click('#saveBtn');
  const sv = await page.evaluate(() => window.__sent[window.__sent.length - 1]);
  assert(sv.startsWith('build\n(STATE "') && sv.includes('~u0418'), sv.slice(0, 120));
  await page.screenshot({ path: OUT + '/proekt_panel.png', fullPage: true });
  assert.deepStrictEqual(errs, []);
  await browser.close();
  console.log('cond/proekt UI: ALL OK');
})().catch(e => { console.error(e); process.exit(1); });
