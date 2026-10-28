import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const P = require('../src/plan/pdfplan.js');

const schedule = {
  no: 2, w: 500, h: 800, texts: [
    { s: 'Экспликация помещений', x: 90, y: 720, h: 12, w: 180 },
    { s: '№', x: 100, y: 690, h: 10, w: 12 },
    { s: 'Наименование помещения', x: 145, y: 690, h: 10, w: 140 },
    { s: '1', x: 101, y: 660, h: 10, w: 8 }, { s: 'Прихожая', x: 145, y: 660, h: 10, w: 52 },
    { s: '2', x: 101, y: 635, h: 10, w: 8 }, { s: 'Кухня-гостиная', x: 145, y: 635, h: 10, w: 80 },
    { s: '3', x: 101, y: 610, h: 10, w: 8 }, { s: 'Спальня', x: 145, y: 610, h: 10, w: 43 }
  ]
};
const exp = P.extractRooms(schedule);
assert.deepEqual(exp.rooms, [
  { no: 1, name: 'Прихожая' },
  { no: 2, name: 'Кухня-гостиная' },
  { no: 3, name: 'Спальня' }
]);
assert.ok(exp.box && exp.box[0] <= 90 && exp.box[3] >= 720, 'schedule bounds');

const planPage = {
  w: 500, h: 800, paths: [],
  texts: [
    { s: '1', x: 200, y: 200, h: 10, w: 8 },
    { s: '2', x: 250, y: 240, h: 10, w: 8 },
    { s: '17', x: 225, y: 220, h: 10, w: 15 }
  ]
};
const underlay = {
  page: planPage, crop: [100, 100, 300, 300], scaleDen: 50,
  lclass: () => 'flat'
};
const markers = P.findRoomMarkers(underlay, exp.rooms);
assert.deepEqual(markers.map((m) => m.no), [1, 2]);

const merged = P.mergeRoomMarkers(markers, [
  { no: 1, x: 180, y: 190, pageNo: 1 },
  { no: 3, x: 260, y: 210, pageNo: 2 }
], exp.rooms, 1);
assert.deepEqual(merged.map((m) => m.no), [1, 2]);
assert.equal(merged.find((m) => m.no === 1).x, 180, 'manual position overrides automatic detection');
assert.equal(merged.find((m) => m.no === 2).x, 254, 'automatic position is retained for unassigned rooms');
assert.deepEqual(P.mergeRoomMarkers(markers, [{ no: 1, x: 180, y: 190, pageNo: 2 }], exp.rooms, 1), markers,
  'manual markers belong to their selected PDF page');

const out = P.buildOutput({
  underlay, pages: [], includeSymbols: false, scaleDen: 50,
  rooms: exp.rooms, markers: markers.concat([{ no: 17, x: 210, y: 220 }]),
  name: 'test'
});
assert.match(out.text, /^\(GIPPLAN 1 /);
assert.ok(out.text.includes('(R 1 "'), 'room 1 record');
assert.ok(out.text.includes('(R 2 "'), 'room 2 record');
assert.ok(out.text.includes('(R 3 "'), 'room 3 record');
assert.ok(out.text.includes('(N 1 '), 'room-number record');
assert.ok(!out.text.includes('(N 17 '), 'no unsupported NUM-POM_GIP state');
assert.ok(!out.text.includes('(S '), 'designer electrical symbols stay out of simplified workflow');
assert.equal(out.nRooms, 3);
assert.equal(out.nRoomMarkers, 2);
console.log('PDF room schedule / import records: ALL OK');


// Archicad often outlines the room-number column and labels the room-name column
// "Название помещения". The parser must recover rows and ignore the total-area row.
const outlinedSchedule = {
  no: 12, w: 1190.55, h: 841.89, texts: [
    { s: 'Экспликация помещений 1 этаж', x: 1000, y: 695, h: 10, w: 155 },
    { s: 'Название помещения', x: 1014, y: 674, h: 10, w: 104 },
    { s: 'Прихожая', x: 1006, y: 655, h: 8, w: 36 },
    { s: 'Кухня гостиная', x: 1006, y: 638, h: 8, w: 55 },
    { s: 'Спальня', x: 1006, y: 621, h: 8, w: 31 },
    { s: 'Кабинет', x: 1006, y: 604, h: 8, w: 30 },
    { s: 'Ванная', x: 1006, y: 587, h: 8, w: 27 },
    { s: '53,18 м²', x: 1014, y: 570, h: 8, w: 28 }
  ]
};
const outlined = P.extractRooms(outlinedSchedule);
assert.deepEqual(outlined.rooms, [
  { no: 1, name: 'Прихожая' },
  { no: 2, name: 'Кухня гостиная' },
  { no: 3, name: 'Спальня' },
  { no: 4, name: 'Кабинет' },
  { no: 5, name: 'Ванная' }
]);
assert.ok(outlined.box, 'outlined room schedule bounds');

// A combined scale label (not a standalone "1:45" text run) must be recognized.
const scaled = P.analyze({
  no: 3, w: 1190.55, h: 841.89, paths: [], layers: {},
  texts: [{ s: 'Масштаб 1:45', x: 1050, y: 30, h: 10, w: 80 }]
});
assert.equal(scaled.scaleDen, 45, 'PDF scale label includes surrounding text');

// PDF.js encodes constructPath as [path verbs, operands, bounds], then emits
// a separate stroke/fill operator. Guard against reverting to the old parser.
const OPS = {
  save: 1, restore: 2, transform: 3, paintFormXObjectBegin: 4, paintFormXObjectEnd: 5,
  beginMarkedContentProps: 6, beginMarkedContent: 7, endMarkedContent: 8,
  setFillRGBColor: 9, setFillGray: 10, setLineWidth: 11,
  constructPath: 90, stroke: 91, closeStroke: 92, fill: 93, eoFill: 94,
  fillStroke: 95, eoFillStroke: 96, closeFillStroke: 97, closeEOFillStroke: 98, endPath: 99,
  moveTo: 13, lineTo: 14, curveTo: 15, curveTo2: 16, curveTo3: 17, closePath: 18, rectangle: 19
};
const fakePdfJs = { OPS };
const fakeDoc = {
  getPage: async () => ({
    getViewport: () => ({ width: 100, height: 100 }),
    getOptionalContentConfig: async () => null,
    getOperatorList: async () => ({
      fnArray: [OPS.constructPath, OPS.stroke],
      argsArray: [
        [[OPS.moveTo, OPS.lineTo, OPS.lineTo], [10, 20, 30, 40, 50, 60], [10, 20, 50, 60]],
        []
      ]
    }),
    getTextContent: async () => ({ items: [] })
  })
};
const vectorPage = await P.extractPage(fakePdfJs, fakeDoc, 1);
assert.equal(vectorPage.paths.length, 1, 'modern PDF.js path operators are decoded');
assert.deepEqual(vectorPage.paths[0].pts, [[10, 20], [30, 40], [50, 60]]);
console.log('PDF scale / modern vector path / outlined room schedule: ALL OK');
