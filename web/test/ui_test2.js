const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1366, height: 900 } }); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route('**/fonts.googleapis.com/**', r => r.abort());
  await p.goto('file://' + require('path').resolve(__dirname, '../out/preview.html')); await p.waitForTimeout(300);
  await p.evaluate(() => { localStorage.clear(); });
  await p.reload(); await p.waitForTimeout(300);
  await p.evaluate(() => window.scrollTo(0, document.getElementById('bar').getBoundingClientRect().top + scrollY - 10));
  const g = await p.evaluate(() => GIP.derived.rows.filter(r => r.t === 'g').map(r => r.id + ' ' + r.num));
  const id = i => g[i].split(' ')[0];
  // выделить ЛС-1 и ЛС-2 (8-я и 9-я группы), перетащить за ячейку «Группа» в самое начало
  await p.locator(`tr[data-id="${id(7)}"] td.c-num`).click();
  await p.locator(`tr[data-id="${id(8)}"] td.c-num`).click({ modifiers: ['Shift'] });
  const src = await p.locator(`tr[data-id="${id(8)}"] td.c-num`).boundingBox();
  const dst = await p.locator(`tr[data-id="${id(0)}"]`).boundingBox();
  await p.mouse.move(src.x + 20, src.y + 10); await p.mouse.down();
  await p.mouse.move(src.x + 40, src.y - 20, { steps: 4 }); await p.mouse.move(src.x + 40, dst.y + 3, { steps: 10 });
  await p.mouse.up(); await p.waitForTimeout(300);
  console.log('multi-drag:', (await p.evaluate(() => GIP.derived.rows.filter(r => r.t === 'g').slice(0, 4).map(r => r.num + ' ' + r.name))).join(' | '));
  // Alt+↓ дважды для первой строки
  await p.keyboard.press('Escape');
  const f = await p.evaluate(() => GIP.derived.rows.find(r => r.t === 'g').id);
  await p.locator(`tr[data-id="${f}"] td.c-ref`).click();
  await p.keyboard.press('Alt+ArrowDown'); await p.keyboard.press('Alt+ArrowDown'); await p.waitForTimeout(200);
  console.log('alt-down x2:', (await p.evaluate(() => GIP.derived.rows.filter(r => r.t === 'g').slice(0, 4).map(r => r.num + ' ' + r.name))).join(' | '));
  // сохранение после перезагрузки
  const snap = await p.evaluate(() => JSON.stringify(GIP.state.rows.map(r => r.id)));
  await p.reload(); await p.waitForTimeout(300);
  const snap2 = await p.evaluate(() => JSON.stringify(GIP.state.rows.map(r => r.id)));
  console.log('persist:', snap === snap2 ? 'OK' : 'FAIL');
  // защита: розетку под новое УЗО, потом вторую под то же УЗО
  const socks = await p.evaluate(() => GIP.derived.rows.filter(r => r.t === 'g' && r.cat === 'sock').map(r => r.id));
  await p.selectOption(`#c-${socks[0]}-prot`, 'rcd:new'); await p.waitForTimeout(150);
  const u = await p.evaluate(id => GIP.derived.byId[id].rcd, socks[0]);
  await p.selectOption(`#c-${socks[3]}-prot`, 'rcd:' + u); await p.waitForTimeout(150);
  console.log('prot menu:', await p.evaluate(([a, b2, u]) => [GIP.derived.byId[a].rcd === u, GIP.derived.byId[b2].rcd === u, GIP.derived.byId[u].members.length].join(','), [socks[0], socks[3], u]));
  await p.screenshot({ path: require('path').resolve(__dirname, '../out') + '/08_rcd_new.png', clip: { x: 0, y: 0, width: 1366, height: 900 } });
  console.log('errors', errs);
  await b.close();
})();
