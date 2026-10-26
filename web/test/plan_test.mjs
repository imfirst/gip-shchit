// Проверка разбора PDF дизайнера: легенда, поиск значков, оставшиеся фигуры, вывод для LISP
import { execSync } from 'child_process';
import path from 'path';
const pdfjs = await import(path.join(process.env.PDFJS_DIR || path.join(execSync('npm root -g').toString().trim(), 'pdfjs-dist'), 'legacy/build/pdf.mjs'));
import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const P = require('../src/plan/pdfplan.js');
const file = process.argv[2] || '/tmp/dz/d.pdf';
const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(file)) }).promise;
const res = {};
for (const pno of [1, 2]) {
  const t0 = Date.now();
  const D = await P.extractPage(pdfjs, doc, pno);
  const A = P.analyze(D);
  const c = P.counts(A);
  console.log('page', pno, 'paths', D.paths.length, 'ms', Date.now() - t0, 'scale 1:' + A.scaleDen, 'k', A.kMed && A.kMed.toFixed(2));
  console.log('  layers', Object.entries(D.layers).map(([k, v]) => (k || '—') + ':' + v + ':' + P.guessLayer(k || null)).join(' | '));
  A.legends.forEach(lg => console.log('  legend rows', lg.rows.map(r => r.label).join(' / ')));
  A.templates.forEach(t => console.log('   ', t.label, '→', t.map.b ? t.map.b + ':' + P.VIS[t.map.b][t.map.v] + (t.map.n > 1 ? ' ×' + t.map.n : '') : 'не ставить', '— найдено', c[t.id] || 0));
  console.log('  shapes', A.shapes.slice(0, 8).map(g => g.items.length + '×' + g.segs.length + 'seg/' + g.size.toFixed(1)).join('  '));
  res[pno] = A;
}
// подложка с листа розеток; значки: розетки -> силовой план, выключатели -> план освещения; светильники — самая частая фигура на листе 1
const mapping = {};
// встраиваемые светильники — фигура-кружок с крестом (≥40 отрезков), как выбирают в панели
res[1].shapes.filter(g => g.segs.length >= 40 && g.items.length >= 3).slice(0, 1).forEach(g => mapping[g.key] = { b: 'C', v: 3, n: 1 });
const out = P.buildOutput({ underlay: res[2], pages: [{ A: res[2], sheet: 'p' }, { A: res[1], sheet: 'l', mapping }], name: 'Сухаревская' });
console.log('output lines', out.nUnderlay, 'symbols', out.nSym, 'size mm', out.W.toFixed(0), 'x', out.H.toFixed(0), JSON.stringify(out.summary));
const OUTD = new URL('../../lisp/emu/out/plan/', import.meta.url).pathname;
fs.mkdirSync(OUTD, { recursive: true });
fs.writeFileSync(OUTD + 'gip_plan_in.txt', out.text);
console.log('bytes', out.text.length, 'non-ascii', /[^\x00-\x7f]/.test(out.text));
