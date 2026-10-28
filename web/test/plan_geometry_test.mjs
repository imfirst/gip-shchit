import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const P = require('../src/plan/pdfplan.js');

/* Scale can be split by PDF.js into separate text runs. Prefer the note nearest the plan. */
const inferred = P.inferScaleDen([
  { s: '1', x: 400, y: 500, h: 8, w: 4 },
  { s: ':', x: 405, y: 500, h: 8, w: 3 },
  { s: '60', x: 409, y: 500, h: 8, w: 9 },
  { s: '1:50', x: 10, y: 10, h: 8, w: 20 }
], [390, 480, 430, 520]);
assert.equal(inferred.den, 60, 'prefer the nearby 1:60 label over a distant 1:50 label');
assert.equal(inferred.source, 'text');
assert.equal(P.inferScaleDen([{ s: 'План квартиры', x: 1, y: 1, h: 8, w: 50 }], [0, 0, 100, 100]).den, null,
  'unknown scale must not silently default to 1:50');

const clipped = P.clipPolyline([[-100, 5], [5, 5], [5, 50]], [0, 0, 10, 10]);
assert.equal(clipped.length, 1, 'continuous in-frame portion must remain a single polyline');
assert.deepEqual(clipped[0], [[0, 5], [5, 5], [5, 10]]);

const crop = P.planCrop({
  w: 1000, h: 1000,
  paths: [{ pts: [[-1000, 50], [1000, 50]], L: 'walls', f: '' }]
}, () => 'flat', [[40, 40], [60, 60]]);
assert.ok(crop[0] < 0 && crop[2] > 100, 'long wall crossing crop contributes geometry');
assert.ok(crop[1] < 50 && crop[3] > 50, 'wall crossing apartment area is included');

/* Export clips an intersecting path instead of silently discarding the whole wall. */
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
  'line crossing crop is exported using clipped coordinates');

/* Calibration fixture measured from page 16 of the supplied PDF:
   dimension 2 354 is drawn as a 148.279 pt line at the printed scale 1:45.
   It must import as 2354 mm, not be rescaled or truncated by the parser. */
const calibration = P.buildOutput({
  underlay: {
    page: { paths: [{ pts: [[0, 0], [148.279, 0]], L: 'walls', f: '' }], texts: [] },
    crop: [0, 0, 148.279, 10],
    scaleDen: 45,
    lclass: () => 'flat'
  },
  pages: [], includeSymbols: false, rooms: [], markers: [], scaleDen: 45, fills: false, name: 'scale-check'
});
const line = calibration.text.split('\n').find((x) => x.startsWith('(L 0 '));
const coords = line.match(/^\(L 0 ([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+)\)$/);
assert.ok(coords, 'calibration line is emitted as a simple polyline');
assert.ok(Math.abs(Number(coords[3]) - 2354) < 1,
  '148.279 pt at 1:45 must produce 2354 mm within rounding');

/* Join separate cells on the same baseline and strip area values from room names. */
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
]);

console.log('PDF plan geometry / scale / room extraction: ALL OK');
