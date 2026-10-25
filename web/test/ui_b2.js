// Бета 2: контактор, прокладка, кросс-модуль, длины, корпус ABB, 3 фазы -> трёхфазная варочная
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route('**/fonts.googleapis.com/**', r => r.abort());
  await p.goto('file://' + require('path').resolve(__dirname, '../out/preview.html')); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(300);
  const S = () => p.evaluate(() => { const B = GIP.state.board, D = GIP.derived; const km = D.fixed.find(f => f.id === 'km');
    return { ph: B.phases, kmType: B.kmType, km: km && km.model, kmW: km && km.w, route: B.route, xb: B.xb, olLen: B.olLen, kup: B.kup, box: D.tot.box && D.tot.box.n,
      hob: GIP.state.rows.filter(r => r.cat === 'hob').map(r => r.poles + 'P ' + r.In + 'A ' + r.phase), xbDev: !!D.fixed.find(f => f.id === 'xb'), pm: B.phaseMode }; });
  console.log('start', JSON.stringify(await S()));
  console.log('km options', await p.$$eval('#b-kmType option', os => os.map(o => o.value + '=' + o.textContent).join(' | ')));
  await p.click('#b-phases [data-v="3"]'); await p.waitForTimeout(150);
  console.log('3ph', JSON.stringify(await S()));
  console.log('km options 3ф', await p.$$eval('#b-kmType option', os => os.map(o => o.value).join(' ')));
  await p.selectOption('#b-kmType', '63-40'); await p.waitForTimeout(100);
  await p.selectOption('#b-route', 'Кабель-канал'); await p.waitForTimeout(100);
  await p.check('#b-xb'); await p.check('#b-olLen'); await p.waitForTimeout(150);
  console.log('set', JSON.stringify(await S()));
  console.log('kup checkbox present:', !!(await p.$('#b-kup')));
  console.log('box card:', (await p.textContent('#cardBox').catch(() => '')).replace(/\s+/g, ' ').trim());
  await p.selectOption('#b-kmType', ''); await p.waitForTimeout(100);
  console.log('auto again', JSON.stringify(await S()));
  await p.screenshot({ path: require('path').resolve(__dirname, '../out/20_beta2.png') + '', clip: { x: 0, y: 40, width: 1440, height: 420 } });
  await p.setViewportSize({ width: 420, height: 800 }); await p.waitForTimeout(200);
  console.log('phone overflow', await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth })));
  console.log('errors', errs); await b.close();
})();
