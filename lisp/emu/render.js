// node render.js file.dxf outprefix [maxSheets] — листы А3 альбома в PNG
const { chromium } = require('playwright'); const fs = require('fs');
const SP = require('path').join(__dirname, 'd2_view.js');
(async () => {
  const [file, pref, only, boxf] = process.argv.slice(2);
  const txt = fs.readFileSync(file, 'utf8').replace(/\r?\n/g, '\r\n');
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1600, height: 1200 } });
  await p.setContent('<html><body style="margin:0;background:#fff"><div id="o"></div></body></html>');
  await p.addScriptTag({ content: fs.readFileSync(SP, 'utf8') });
  const boxes = await p.evaluate((t) => {
    window.__M = dxfModel(t);
    const res = [];
    window.__M.ents.forEach(e => { const g = c => { for (const x of e) if (x[0] === c) return x[1]; return null; };
      if (e[0][1] === 'INSERT' && g(2) === 'А3-GIP-ALBOM') { const x = parseFloat(g(10)), y = parseFloat(g(20)); res.push([x - 20961, y, x, y + 14850]); } });
    return res;
  }, txt);
  if (boxf) { boxes.length = 0; JSON.parse(fs.readFileSync(boxf, 'utf8')).forEach(x => boxes.push(x)); } else boxes.sort((a, c) => (c[1] - a[1]) || (a[0] - c[0]));
  const sel = (only && only !== 'all') ? only.split(',').map(Number) : boxes.map((_, i) => i);
  for (const i of sel) { if (!boxes[i]) continue;
    await p.evaluate((bx) => { document.getElementById('o').innerHTML = dxfSheetSVG(window.__M, bx, 1600); }, boxes[i]);
    await p.locator('#o svg').screenshot({ path: pref + '_' + i + '.png' }); }
  console.log('sheets', boxes.length, JSON.stringify(boxes.map(x => x.map(Math.round))));
  await b.close();
})();
