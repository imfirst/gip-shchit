// Short-lived diagnostics for the owner's shared public default.pdf asset.
// Print counts and scales only; never dump the PDF's textual contents.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const pdfjs = await import(path.join(process.env.PDFJS_DIR || path.join(execSync('npm root -g').toString().trim(), 'pdfjs-dist'), 'legacy/build/pdf.mjs'));
const require = createRequire(import.meta.url);
const P = require('../src/plan/pdfplan.js');
const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(process.argv[2] || 'default.pdf')), isEvalSupported: false }).promise;
console.log('DOC', JSON.stringify({ pages: doc.numPages }));
for (const no of [9, 12, 13, 14, 15, 16]) {
  try {
    const T = await P.extractTextPage(pdfjs, doc, no);
    const scaleTexts = T.texts.map(t => String(t.s || '').trim()).filter(s => /1\s*:\s*\d{1,4}/.test(s)).slice(0, 8);
    const D = await P.extractPage(pdfjs, doc, no);
    const A = P.analyze(D);
    const classes = {};
    for (const p of D.paths) {
      const k = A.lclass(p.L) + ':' + (p.f || 'stroke');
      classes[k] = (classes[k] || 0) + 1;
    }
    const R = P.extractRooms(D);
    console.log('PAGE', JSON.stringify({
      no, pageSize: [T.w, T.h], textObjects: T.texts.length, paths: D.paths.length,
      layerPaths: Object.entries(D.layers).map(([name, n]) => ({ name: name || '(none)', n })).slice(0, 30),
      scaleTexts, parserScale: A.scaleDen, crop: A.crop.map(x => Math.round(x * 100) / 100),
      classes, roomCount: (R.rooms || []).length, roomTitleFound: !!R.title,
      roomScore: R.score || 0, symbols: A.hits.length, unmatchedShapes: A.shapes.length,
      roomText: no === 12 ? D.texts.filter(t => /экспликац|назван|наимен|прихож|кухн|спальн|кабинет|ванная|^\\s*[1-5]\\s*$/.test(String(t.s || '').toLowerCase())).map(t => ({ s: t.s, x: Math.round(t.x), y: Math.round(t.y), w: Math.round(t.w), h: Math.round(t.h) })).slice(0, 35) : []
    }));
  } catch (e) { console.log('PAGE_ERROR', no, String(e).slice(0,200)); }
}
