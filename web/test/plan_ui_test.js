// Страница «План из PDF» в Chromium: открыть PDF дизайнера, проверить найденные значки, сохранить файл для AutoCAD
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const DIST = process.argv[2] || path.resolve(__dirname, '../dist');
const PDF = process.argv[3] || '/tmp/dz/d.pdf';
const OUT = process.argv[4] || path.resolve(__dirname, '../out');
const types = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript' };
const srv = http.createServer((q, r) => { const f = path.join(DIST, decodeURIComponent(q.url.split('?')[0])); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); });
(async () => {
  await new Promise((r) => srv.listen(0, r));
  const port = srv.address().port;
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 950 }, acceptDownloads: true });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto('http://localhost:' + port + '/plan.html'); await p.evaluate(() => localStorage.clear());
  await p.setInputFiles('#file', PDF);
  await p.waitForFunction(() => window.GIPPLANUI && window.GIPPLANUI.S.pages.length && window.GIPPLANUI.S.pages.every((pg) => !pg.role || pg.A), null, { timeout: 120000 });
  await p.waitForTimeout(300);
  const info = await p.evaluate(() => window.GIPPLANUI.S.pages.map((pg) => ({ no: pg.no, title: pg.title, role: pg.role, hits: pg.A ? pg.A.hits.length : null, tpl: pg.A ? pg.A.templates.map((t) => t.label + '=' + t.map.b + t.map.v) : null, shapes: pg.A ? pg.A.shapes.length : null })));
  console.log(JSON.stringify(info, null, 1));
  console.log('sum:', await p.textContent('#sum'));
  await p.screenshot({ path: OUT + '/40_plan_p.png' });
  // лист освещения: первая «фигура» из 72 отрезков — светильник
  const tab = await p.$('[data-tab]:not([aria-pressed="true"])'); if (tab) await tab.click();
  await p.waitForTimeout(200);
  await p.click('#shapesWrap > summary');
  const keys = await p.evaluate(() => { const pg = window.GIPPLANUI.S.pages.find((x) => x.no === window.GIPPLANUI.S.cur); return pg.A.shapes.map((g) => [g.key, g.segs.length, g.items.length]); });
  const lamp = keys.find((k) => k[1] >= 40);
  console.log('lamp shape', lamp && lamp.slice(1));
  if (lamp) await p.selectOption('select[data-map="' + lamp[0].replace(/"/g, '\\"') + '"]', 'C:3');
  await p.waitForTimeout(200);
  console.log('sum:', await p.textContent('#sum'));
  await p.hover('.sym'); await p.waitForTimeout(150);
  await p.screenshot({ path: OUT + '/41_plan_l.png' });
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#save')]);
  const f = await dl.path(); const txt = fs.readFileSync(f, 'utf8');
  const OD = path.resolve(__dirname, '../../lisp/emu/out/plan_ui'); fs.mkdirSync(OD, { recursive: true }); fs.writeFileSync(path.join(OD, 'gip_plan_in.txt'), txt);
  console.log('download lines', txt.split('\n').length, 'S lines', txt.split('\n').filter((l) => l.startsWith('(S')).length, 'ascii', !/[^\x00-\x7f]/.test(txt));
  // память: после перезагрузки лампа сопоставлена сама
  await p.reload(); await p.setInputFiles('#file', PDF);
  await p.waitForFunction(() => window.GIPPLANUI.S.pages.length && window.GIPPLANUI.S.pages.every((pg) => !pg.role || pg.A), null, { timeout: 120000 });
  console.log('remembered sum:', await p.textContent('#sum'));
  await p.setViewportSize({ width: 430, height: 900 }); await p.waitForTimeout(300);
  console.log('phone overflow', await p.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]));
  console.log('errors', errs);
  await b.close(); srv.close();
})();
