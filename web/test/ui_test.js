// node ui_test.js — проверка страницы в Chromium
const { chromium } = require('playwright');
const OUT = require('path').resolve(__dirname, '../out');
require('fs').mkdirSync(OUT, { recursive: true });
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  await page.route('**/fonts.googleapis.com/**', r => r.abort());
  await page.goto('file://' + require('path').resolve(__dirname, '../out/preview.html'));
  await page.waitForTimeout(400);
  await page.screenshot({ path: OUT + '/01_light.png', fullPage: true });

  const info = await page.evaluate(() => ({ groups: GIP.derived.tot.groups, rows: document.querySelectorAll('#tbody tr').length, w: document.documentElement.scrollWidth }));
  console.log('initial', info);

  // --- перетаскивание: ЛО-1 вниз на место после ЛО-3
  const nums0 = await page.evaluate(() => GIP.derived.rows.filter(r => r.t === 'g').map(r => r.num + ' ' + r.name));
  const ids = await page.evaluate(() => GIP.derived.rows.filter(r => r.t === 'g').map(r => r.id));
  const h1 = page.locator(`tr[data-id="${ids[0]}"] .handle`);
  const t3 = page.locator(`tr[data-id="${ids[3]}"]`);
  const hb = await h1.boundingBox(), tb = await t3.boundingBox();
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + 10, hb.y + 30, { steps: 4 });
  await page.mouse.move(hb.x + 10, tb.y + 2, { steps: 8 });
  await page.waitForTimeout(100);
  await page.screenshot({ path: OUT + '/02_dragging.png', clip: { x: 0, y: 380, width: 1440, height: 420 } });
  await page.mouse.up();
  await page.waitForTimeout(400);
  const nums1 = await page.evaluate(() => GIP.derived.rows.filter(r => r.t === 'g').map(r => r.num + ' ' + r.name));
  console.log('before:', nums0.slice(0, 4).join(' | '));
  console.log('after: ', nums1.slice(0, 4).join(' | '));

  // --- перетаскивание розетки в другой блок УЗО (3к — блоки есть только в режиме УЗО; соберём такой щит через модель)
  await page.evaluate(() => { GIP.commit(st => { const o = GIP.M.tplOptions('k3'); o.mode = 'rcd'; return GIP.M.generate(o, st.board); }); });
  await page.waitForTimeout(200);
  const blk = await page.evaluate(() => { const d = GIP.derived; const us = d.rows.filter(r => r.t === 'u'); return { u1: us[0].id, u2: us[1].id, m1: us[0].members, m2: us[1].members, ref2: us[1].ref }; });
  await page.evaluate(() => { window.scrollTo(0, document.getElementById('bar').getBoundingClientRect().top + window.scrollY - 10); });
  await page.evaluate((id) => { const w = document.getElementById('wrap'); const tr = document.querySelector(`tr[data-id="${id}"]`); w.scrollTop = tr.offsetTop - 120; }, blk.m1[0]);
  await page.waitForTimeout(100);
  const hs = page.locator(`tr[data-id="${blk.m1[0]}"] .handle`);
  const tgt = page.locator(`tr[data-id="${blk.m2[1]}"]`);
  const b1 = await hs.boundingBox(), b2 = await tgt.boundingBox();
  await page.mouse.move(b1.x + 8, b1.y + 8); await page.mouse.down();
  await page.mouse.move(b1.x + 300, b1.y + 40, { steps: 5 });
  await page.mouse.move(b1.x + 300, b2.y + 3, { steps: 10 });
  await page.waitForTimeout(80);
  await page.screenshot({ path: OUT + '/03_drag_into_block.png', clip: { x: 0, y: Math.max(0, b2.y - 220), width: 1440, height: 360 } });
  await page.mouse.up(); await page.waitForTimeout(300);
  const res2 = await page.evaluate((b) => { const d = GIP.derived; const v = d.byId[b.m1[0]]; return { rcd: v.rcd, num: v.num, toast: document.getElementById('toastTxt').textContent }; }, blk);
  console.log('into block', res2.rcd === blk.u2 ? 'OK' : 'FAIL', res2);

  // --- блок УЗО целиком наверх
  const hu = page.locator(`tr[data-id="${blk.u2}"] .handle`);
  const firstG = page.locator('tr[data-kind="g"]').first();
  const bu = await hu.boundingBox(), bf = await firstG.boundingBox();
  await page.mouse.move(bu.x + 8, bu.y + 8); await page.mouse.down();
  await page.mouse.move(bu.x + 8, bu.y - 40, { steps: 5 });
  await page.mouse.move(bu.x + 8, bf.y + 2, { steps: 12 });
  await page.mouse.up(); await page.waitForTimeout(300);
  const top = await page.evaluate(() => GIP.state.rows.slice(0, 3).map(r => r.t + ':' + (r.name || r.id)));
  console.log('block to top:', top.join(' | '));

  // --- выделение двух строк и удаление клавишей
  const gids = await page.evaluate(() => GIP.derived.rows.filter(r => r.t === 'g').map(r => r.id));
  await page.locator(`tr[data-id="${gids[5]}"] .c-ref`).click();
  await page.locator(`tr[data-id="${gids[6]}"] .c-ref`).click({ modifiers: ['Control'] });
  const n0 = await page.evaluate(() => GIP.derived.tot.groups);
  await page.keyboard.press('Delete');
  await page.waitForTimeout(200);
  const n1 = await page.evaluate(() => GIP.derived.tot.groups);
  console.log('delete 2:', n0, '->', n1);
  await page.keyboard.press('Control+z'); await page.waitForTimeout(200);
  console.log('undo ->', await page.evaluate(() => GIP.derived.tot.groups));

  // --- правка ячейки: мощность и Enter
  const pid = gids[8];
  await page.locator(`#c-${pid}-p`).click();
  await page.keyboard.type('4,5'); await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  console.log('p edit:', await page.evaluate(id => GIP.state.rows.find(r => r.id === id).p, pid), 'focus:', await page.evaluate(() => document.activeElement.id), 'expected c-' + gids[9] + '-p');

  // --- назначение: сменить на освещение
  const sid = gids[12];
  await page.selectOption(`#c-${sid}-cat`, 'light');
  await page.waitForTimeout(150);
  console.log('cat->light:', await page.evaluate(id => GIP.derived.byId[id].num + ' ' + GIP.derived.byId[id].name, sid));

  // --- балансировка
  await page.click('#balBtn'); await page.click('[data-bal="power"]'); await page.waitForTimeout(150);
  console.log('balance power imb', await page.evaluate(() => GIP.derived.tot.imb.toFixed(1)));

  // --- шаблон
  await page.click('#tplBtn');
  await page.selectOption('#t-tpl', 'studio');
  await page.click('#t-build'); await page.waitForTimeout(200);
  console.log('studio groups', await page.evaluate(() => GIP.derived.tot.groups));
  await page.screenshot({ path: OUT + '/04_tpl.png', fullPage: false });
  await page.click('#t-close');
  await page.keyboard.press('Control+z'); await page.waitForTimeout(200);

  // --- тёмная тема и телефон
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForTimeout(150);
  await page.screenshot({ path: OUT + '/05_dark.png', fullPage: false });
  await page.setViewportSize({ width: 400, height: 860 });
  await page.waitForTimeout(150);
  const ov = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  console.log('phone overflow', ov);
  await page.screenshot({ path: OUT + '/06_phone_dark.png', fullPage: true });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.screenshot({ path: OUT + '/07_phone_light.png', fullPage: false });

  console.log('ERRORS', errs);
  await browser.close();
})();
