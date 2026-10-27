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
assert.equal(merged.find((m) => m.no === 2).x, 250, 'automatic position is retained for unassigned rooms');
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
