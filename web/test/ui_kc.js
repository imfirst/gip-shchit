const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route('**/fonts.googleapis.com/**', r => r.abort());
  await p.goto('file://' + require('path').resolve(__dirname, '../out/preview.html')); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(300);
  await p.fill('#b-pAllowed', '10'); await p.press('#b-pAllowed', 'Enter'); await p.waitForTimeout(150);
  console.log(await p.evaluate(() => [GIP.derived.tot.kc, GIP.derived.tot.kcLevel, GIP.state.board.kc]));
  await p.screenshot({ path: require('path').resolve(__dirname, '../out') + '/10_kc.png', clip: { x: 0, y: 50, width: 1440, height: 380 } });
  await p.fill('#b-kc', '0,35'); await p.press('#b-kc', 'Enter'); await p.waitForTimeout(150);
  console.log(await p.evaluate(() => [GIP.derived.tot.kc, GIP.derived.tot.kcAuto, GIP.derived.tot.warn.length]));
  await p.click('#b-kcMode'); await p.waitForTimeout(150);
  console.log(await p.evaluate(() => [GIP.derived.tot.kc, GIP.derived.tot.kcAuto]));
  console.log('errors', errs); await b.close();
})();
