// Отопление: подбор приборов, спецификация, строки для чертежа (node web/test/heat_test.js)
'use strict';
const assert = require('assert');
const path = require('path');
global.HEAT_DB = require(path.join(__dirname, '..', 'src', 'heat', 'db.js'));
global.HEAT_NODES = require(path.join(__dirname, '..', 'src', 'heat', 'nodes.json'));
const H = require(path.join(__dirname, '..', 'src', 'heat', 'calc.js'));

// база: проверка опорных значений из каталогов
const tub = HEAT_DB.series.find(s => s.id === 'tubog');
assert.strictEqual(tub.models.find(m => m.code === '2052').q, 62);
assert.strictEqual(tub.models.find(m => m.code === '3057').q, 103);
const mono = HEAT_DB.series.find(s => s.id === 'monolit');
assert.strictEqual(mono.models.find(m => m.code === '500').q, 196);
// эталон Ильменский: TUB 2052x22 = 1055 Вт, x30 = 1439, x18 = 863 — это 48 Вт/секц., т.е. ΔT ≈ 57,5 (85/70/20)
const f = H.dtFactor({ tsup: 85, tret: 70, tin: 20 }, tub);
assert(Math.abs(62 * f * 22 - 1055) < 20, 'TUB 2052x22 при 85/70/20 ≈ 1055 Вт, получено ' + Math.round(62 * f * 22));
// длина Tubog: L = n·46 + 6 (каталог) — 22 секции = 1018 мм как в эталоне
assert.strictEqual(22 * tub.pitch + tub.add, 1018);
assert.strictEqual(30 * tub.pitch + tub.add, 1386);
// Varmann Ntherm 230x90 при 75/65/20: 1000 мм — 224 Вт (каталог)
const nt = HEAT_DB.series.find(s => s.id === 'varmann_ntherm');
assert.strictEqual(Math.round(H.interp(nt.models.find(m => m.code === '090.230').pts, 1000)), 224);

// узлы: у трубчатых нижнего подключения из стены есть термостат и Multiflex
const items = H.nodeItems('TUB', 'НС');
assert(items.some(i => i.code === '1011465'), 'нет термостата в узле');
assert(items.some(i => /Multiflex/.test(i.name)), 'нет Multiflex в узле');
assert(items.every(i => !/^Радиатор/.test(i.name)));

// реестр как из чертежа: 3 комнаты с окнами, санузел без окна
const reg = {
  rooms: [{ no: 1, name: 'Гостиная', area: 20.5, h: 2700 }, { no: 2, name: 'Спальня', area: 14.2, h: 2700 }, { no: 3, name: 'Кухня', area: 9.8, h: 2700 }, { no: 4, name: 'Санузел', area: 4, h: 2700 }],
  windows: [{ id: 1, room: 1, w: 1900 }, { id: 2, room: 1, w: 1500 }, { id: 3, room: 2, w: 1800 }, { id: 4, room: 3, w: 1500 }]
};
const st = { params: { tsup: 90, tret: 65, tin: 20, maxH: 550, q: 80 } };
const r = H.compute(reg, st);
assert.strictEqual(r.rooms.find(x => x.no === 4).heated, false, 'санузел без окна не отапливается по умолчанию');
assert.strictEqual(r.rads.length, 4);
// мощность прибора не меньше доли помещения
r.rads.forEach(x => assert(x.Q >= x.Qneed || x.warn, 'прибор окна ' + x.win + ' слабее нагрузки'));
// гостиная: нагрузка делится по ширине окон
const g = r.rads.filter(x => x.room === 1);
assert(Math.abs(g[0].Qneed / g[1].Qneed - 1900 / 1500) < 0.02);
// высота по подоконнику (maxH = 550): Tubog 2052 (515) — самая высокая ≤ 550; длинный — 3-трубный из 2-трубных
assert(r.rads.every(x => x.model === '2052' || x.model === '3052'), r.rads.map(x => x.model).join());
assert(r.rads.some(x => x.model === '2052'));
// длина не больше 0,75 ширины окна, секции целые
r.rads.forEach(x => { assert(x.L <= reg.windows.find(w => w.id === x.win).w * 0.75 + 1, 'длина ' + x.L); assert(Number.isInteger(x.N)); });
// надпись как в эталоне
assert(/^Rifar Tubog Ventil\\PTUB 2052x\d+ DV1\\P\(h=515мм\) \d+ Вт$/.test(r.rads[0].label), r.rads[0].label);
assert.strictEqual(r.rads[0].node, 'О_Узел_TUB_НС_');

// спецификация: разделы и количества
const secs = r.spec.filter(x => x[0] === 'SEC').map(x => x[1]);
assert.deepStrictEqual(secs, ['', 'Арматура и фитинги', 'Трубы и теплоизоляция', 'ШРВ отопления']);
const therm = r.spec.find(x => x[0] === 'ROW' && x[2] === '1011465');
assert.strictEqual(therm[5], 4, 'термостатов по числу приборов');
const rez = r.spec.find(x => x[0] === 'ROW' && x[2] === '240601-003');
assert.strictEqual(rez[5], 8, 'резьбозажимных по 2 на прибор');
const col = r.spec.find(x => x[0] === 'ROW' && /Коллектор/.test(x[1]));
assert(/4 вых/.test(col[1]) && col[2] === 'SMS 0912 000004', col.join('|'));
const cab = r.spec.find(x => x[0] === 'ROW' && /Шкаф/.test(x[1]));
assert(/ШРВ-1/.test(cab[1]));

// ручная правка: другой ряд, свои секции, отключение прибора
const st2 = { params: { tsup: 80, tret: 60, tin: 20 }, rads: { 1: { series: 'monolit', N: 8 }, 2: { off: true } }, rooms: { 2: { qman: 2500 } } };
const r2 = H.compute(reg, st2);
const w1 = r2.rads.find(x => x.win === 1);
assert.strictEqual(w1.series, 'monolit'); assert.strictEqual(w1.N, 8); assert.strictEqual(w1.kind, 'BIM');
assert(!r2.rads.some(x => x.win === 2));
assert.strictEqual(r2.rooms.find(x => x.no === 2).Q, 2500);
assert.strictEqual(r2.rads.find(x => x.room === 1).Qneed, r2.rooms.find(x => x.no === 1).Q, 'вся гостиная — на оставшийся прибор');
// конвектор: длина из ряда, ширина — глубина на плане
const r3 = H.compute(reg, { params: { series: 'varmann_ntherm', tsup: 75, tret: 65 } });
r3.rads.forEach(x => { assert(HEAT_DB.series.find(s => s.id === 'varmann_ntherm').lengths.includes(x.L)); assert.strictEqual(x.D, 230); assert.strictEqual(x.node, ''); });

// строки для чертежа: только ASCII, читаются как формы LISP
const txt = H.inFile(r, st);
assert(/^[\x09\x0a\x0d\x20-\x7e]*$/.test(txt), 'не ASCII');
const lines = txt.trim().split(/\r\n/);
assert(lines[0].startsWith('(STATE "'));
assert.strictEqual(lines.filter(l => l.startsWith('(RAD ')).length, 4);
assert(lines.some(l => l.startsWith('(PIPE ') && / "T" 1\.1\)$/.test(l)));
assert(lines[lines.length - 1].startsWith('(SHRV '));
// экранирование: \P надписи — двойная обратная черта, кавычки
assert(H.esc('a\\Pb"c') === '"a\\\\Pb\\"c"');
assert(H.esc('Т1') === '"~u04221"');
lines.forEach(l => { let d = 0, q = false; for (let i = 0; i < l.length; i++) { const c = l[i]; if (c === '\\') { i++; continue; } if (c === '"') q = !q; else if (!q && c === '(') d++; else if (!q && c === ')') d--; } assert.strictEqual(d, 0, 'скобки: ' + l); });
console.log('heat: ALL OK');
