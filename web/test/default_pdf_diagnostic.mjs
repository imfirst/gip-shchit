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
    const page = await doc.getPage(no);
    const ol = await page.getOperatorList();
    const opNames = {};
    const byFn = {};
    const revOps = {};
    Object.keys(pdfjs.OPS).forEach(k => { if (typeof pdfjs.OPS[k] === 'number') revOps[pdfjs.OPS[k]] = k; });
    ol.fnArray.forEach(fn => {
      const n = revOps[fn] || String(fn);
      byFn[n] = (byFn[n] || 0) + 1;
    });
    const pathOps = ol.fnArray.map((fn, idx) => ({ fn, idx, a: ol.argsArray[idx] }))
      .filter(x => x.fn === pdfjs.OPS.constructPath).slice(0, 3).map(x => ({
        argsLength: x.a && x.a.length,
        firstType: x.a && x.a[0],
        secondType: x.a && x.a[1] && x.a[1].constructor && x.a[1].constructor.name,
        secondLength: x.a && x.a[1] && x.a[1].length,
        secondFirstType: x.a && x.a[1] && x.a[1][0] != null ? (x.a[1][0].constructor && x.a[1][0].constructor.name || typeof x.a[1][0]) : null,
        secondSample: x.a && x.a[1] ? Array.from(x.a[1]).slice(0, 5).map(v => typeof v === 'number' ? v : { type: v && v.constructor && v.constructor.name, length: v && v.length, first: v && v.length ? Array.from(v).slice(0, 12) : null }) : null,
        thirdType: x.a && x.a[2] && x.a[2].constructor && x.a[2].constructor.name,
        thirdSample: x.a && x.a[2] && x.a[2].length ? Array.from(x.a[2]).slice(0, 4) : null
      }));
    const D = await P.extractPage(pdfjs, doc, no);
    const A = P.analyze(D);
    const classes = {};
    for (const p of D.paths) {
      const k = A.lclass(p.L) + ':' + (p.f || 'stroke');
      classes[k] = (classes[k] || 0) + 1;
    }
    const R = P.extractRooms(D);
    const output = P.buildOutput({ underlay: A, pages: [], includeSymbols: false, rooms: R.rooms || [], markers: [], scaleDen: A.scaleDen, fills: false, name: 'diagnostic' });
    const outputLines = output.text.split(/\\r?\\n/);
    const maxOutputLineLength = outputLines.reduce((m, line) => Math.max(m, line.length), 0);
    console.log('PAGE', JSON.stringify({
      no, pageSize: [T.w, T.h], textObjects: T.texts.length, paths: D.paths.length,
      operatorCount: ol.fnArray.length, operatorNames: byFn, pathOps,
      layerPaths: Object.entries(D.layers).map(([name, n]) => ({ name: name || '(none)', n })).slice(0, 30),
      scaleTexts, parserScale: A.scaleDen, crop: A.crop.map(x => Math.round(x * 100) / 100),
      classes, roomCount: (R.rooms || []).length, rooms: R.rooms || [], roomTitleFound: !!R.title,
      roomScore: R.score || 0, symbols: A.hits.length, unmatchedShapes: A.shapes.length,
      outputChars: output.text.length, outputLines: outputLines.length, maxOutputLineLength,
      emittedUnderlayObjects: output.nUnderlay, outputSizeMm: [Math.round(output.W), Math.round(output.H)],
      roomText: no === 12 ? D.texts.filter(t => /экспликац|назван|наимен|прихож|кухн|спальн|кабинет|ванная|^\\s*[1-5]\\s*$/.test(String(t.s || '').toLowerCase())).map(t => ({ s: t.s, x: Math.round(t.x), y: Math.round(t.y), w: Math.round(t.w), h: Math.round(t.h) })).slice(0, 35) : [],
      dimensionText: [12, 13, 14, 15, 16].includes(no) ? D.texts.filter(t => /^\\s*\\d{3,4}(?:[,.]\\d+)?\\s*$/.test(String(t.s || ''))).map(t => ({ s: t.s.trim(), x: Math.round(t.x), y: Math.round(t.y), w: Math.round(t.w), h: Math.round(t.h) })).slice(0, 120) : []
    }));
  } catch (e) { console.log('PAGE_ERROR', no, String(e).slice(0,200)); }
}
