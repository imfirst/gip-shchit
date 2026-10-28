import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const P = require('../src/plan/pdfplan.js');

/* Scale can be split by PDF.js into separate text runs. Select the note nearest the actual plan. */
const inferred = P.inferScaleDen([
  { s: '1', x: 400, y: 500, h: 8, w: 4 },
  { s: ':', x: 405, y: 500, h: 8, w: 3 },
  { s: '60', x: 409, y: 500, h: 8, w: 9 },
  { s: '1:50', x: 10, y: 10, h: 8, w: 20 }
], [390, 480, 430, 520]);
assert.equal(inferred.den, 60, 'prefer the 1:60 note next to the plan over a distant 1:50 note');
assert.equal(inferred.source, 'text');

const clipped = P.clipPolyline([[-100, 5], [5, 5], [5, 50]], [0, 0, 10, 10]);
assert.equal(clipped.length, 1, 'continuous in-frame portion must remain a single polyline');
assert.deepEqual(clipped[0], [[0, 5], [5, 5], [5, 10]]);

const crop = P.planCrop({
  w: 1000, h: 1000,
  paths: [{ pts: [[-1000, 50], [1000, 50]], L: 'walls', f: '' }]
}, () => 'flat', [[40, 40], [60, 60]]);
assert.ok(crop[0] < 0 && crop[2] > 100, 'long wall crossing the crop must contribute geometry');
assert.ok(crop[1] < 50 && crop[3] > 50, 'wall crossing the plan area must be inside crop');

/* Export clips a path crossing crop edges instead of silently dropping the whole wall. */
const out = P.buildOutput({
  underlay: {
    page: { paths: [{ pts: [[-10, 5], [5, 5]], L: 'walls', f: '' }], texts: [] },
    crop: [0, 0, 10, 10],
    scaleDen: 50,
    lclass: () => 'flat'
  },
  pages: [], includeSymbols: false, rooms: [], markers: [], scaleDen: 50, fills: false, name: 'clip-test'
});
assert.match(out.text, /\(L 0 0\.0 88\.2 88\.2 88\.2\)/,
  'wall segment intersecting the visible crop must be exported at its clipped endpoint');

/* The room table parser must also handle a whole row assembled from separate PDF text items. */
const schedule = {
  no: 4, w: 500, h: 800, texts: [
    { s: 'Экспликация', x: 100, y: 720, h: 12, w: 75 },
    { s: 'помещений', x: 178, y: 720, h: 12, w: 65 },
    { s: '1', x: 100, y: 680, h: 10, w: 6 },
    { s: 'Прихожая', x: 145, y: 680, h: 10, w: 50 },
    { s: '4,8 м²', x: 220, y: 680, h: 10, w: 30 },
    { s: '2', x: 100, y: 650, h: 10, w: 6 },
    { s: 'Кухня-гостиная', x: 145, y: 650, h: 10, w: 88 },
    { s: '20,1 м²', x: 240, y: 650, h: 10, w: 34 }
  ]
};
const rooms = P.extractRooms(schedule).rooms;
assert.deepEqual(rooms, [
  { no: 1, name: 'Прихожая' },
  { no: 2, name: 'Кухня-гостиная' }
], 'join split cells, extract room rows, and remove area values');

console.log('PDF plan geometry / scale / room extraction: ALL OK');
