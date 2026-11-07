// Кондиционирование: подбор блоков, связи, спецификация, файл для LISP
const assert = require('assert');
global.COND_DB = require('../src/cond/db.js');
const COND = require('../src/cond/calc.js');
const DB = COND.DB;
// база: у всех моделей есть размеры и диаметры, мощности растут, диаметры в справочнике меди
DB.indoor.forEach(m => { assert(m.W > 300 && m.H > 100 && m.D > 100 && m.q > 0, m.model); assert(DB.copper[m.liq] && DB.copper[m.gas], 'медь ' + m.model); });
DB.outdoor.forEach(m => { assert(m.W > 500 && m.H > 300 && m.D > 200 && m.q > 0, m.model); });
DB.indoor.filter(m => m.brand === 'haier_split').forEach(m => assert(DB.outdoor.some(o => o.model === m.out), 'нет наружного ' + m.out));
['lg_vrf', 'hisense_vrf', 'haier_split', 'haier_multi'].forEach(b => { assert(COND.indoorModels(b).length >= 3 && COND.outdoorModels(b).length >= 3, b); });
const reg = { rooms: [{ no: 1, name: 'Гостиная', area: 24, h: 2.8 }, { no: 2, name: 'Спальня', area: 14, h: 2.7 }, { no: 3, name: 'Кабинет', area: 9, h: 2.7 }],
  units: [{ id: 1, kind: 'I', room: 1, link: 2 }, { id: 2, kind: 'O', room: 0, link: null }, { id: 3, kind: 'I', room: 2, link: 4 }, { id: 4, kind: 'O', room: 0, link: null },
          { id: 5, kind: 'I', room: 3, link: 6 }, { id: 6, kind: 'O', room: 0, link: null }, { id: 7, kind: 'K', room: 0, link: null }], sheets: { plan: 1, scheme: 1, spec: 2 } };
// сплит Haier: нагрузка 24 м² × 100 Вт × 2,8/2,7 = 2,5 кВт -> AS25; 14 м² -> 1,4 -> AS20
let r = COND.compute(reg, { params: { brand: 'haier_split' } });
assert.strictEqual(r.mode, 'split');
assert.strictEqual(r.I[0].load, 2.5); assert.strictEqual(r.I[0].m.model, 'AS25HQJ2HRA-W');
assert.strictEqual(r.I[1].m.model, 'AS20HQJ2HRA-W');
assert.strictEqual(r.O[0].m.model, '1U25HQJ2FRA', 'наружный по паре');
const sp = r.spec.filter(x => x.name && x.name.startsWith('Сплит'));
assert.strictEqual(sp.length, 2); assert.strictEqual(sp.find(x => x.type.startsWith('AS20')).qty, 2);
assert(r.spec.some(x => x.key === 'CU:6,35') && r.spec.some(x => x.key === 'INS:9,52') && r.spec.some(x => x.key === 'HL'));
assert(!r.warn.some(w => /меньше нагрузки/.test(w)), r.warn);
let f = COND.inFile(r, { v: 1 });
assert(/^\(STATE "/.test(f) && f.includes('(OPT "mode" "split")') && f.includes('(UNIT 1 "Haier" "AS25HQJ2HRA-W" 700 190 265 "6,35" "9,52" 2.6)') && f.includes('(LINK 1 2)'));
assert(!/[^\x00-\x7e]/.test(f), 'файл только ASCII');
// ручная нагрузка и модель
r = COND.compute(reg, { params: { brand: 'haier_split' }, units: { 5: { load: '4,8' } } });
assert.strictEqual(r.I[2].m.model, 'AS50HQJ2HRA-W');
r = COND.compute(reg, { params: { brand: 'haier_split' }, units: { 5: { model: 'AS20HQJ2HRA-W', load: 3 } } });
assert(r.warn.some(w => /меньше нагрузки/.test(w)));
// VRF LG: все на один наружный, рефнеты, пульты, таблица диаметров
const reg2 = JSON.parse(JSON.stringify(reg)); reg2.units = reg2.units.filter(u => u.id !== 4 && u.id !== 6).map(u => u.kind === 'I' ? Object.assign(u, { link: 2 }) : u);
r = COND.compute(reg2, { params: { brand: 'lg_vrf' } });
assert.strictEqual(r.mode, 'vrf'); assert.strictEqual(r.O[0].linked.length, 3);
assert.strictEqual(r.O[0].m.model, 'ARUN040GSS0');
assert(r.spec.some(x => x.key === 'REF' && x.type === 'ARBLN01621'));
assert.strictEqual(r.spec.find(x => x.type === 'PWLSSB21H').qty, 3);
f = COND.inFile(r, {});
assert(f.includes('(VRFT 5.6 "6,35" "12,7")') && f.includes('(UNIT 2 "LG" "ARUN040GSS0" 950 330 834 "9,52" "15,88" 12.1)'));
// сплит с одним наружным на три внутренних — предупреждение
r = COND.compute(reg2, { params: { brand: 'haier_split' } });
assert(r.warn.some(w => /Сплит-система: к наружному/.test(w)));
// мульти Haier: порты и индекс загрузки
r = COND.compute(reg2, { params: { brand: 'haier_multi' } });
assert.strictEqual(r.O[0].m.ports >= 3, true, r.O[0].m.model);
// нет точек
r = COND.compute({ rooms: [], units: [] }, {});
assert(r.warn.length >= 3);
console.log('cond calc: ALL OK');
// автосвязи по координатам: vrf — все к ближайшему к центру; split — каждому свой
{
  const u = [{ id: 1, kind: 'I', x: 0, y: 0 }, { id: 2, kind: 'I', x: 5000, y: 0 }, { id: 3, kind: 'O', x: 0, y: -1000 }, { id: 4, kind: 'O', x: 5000, y: -1000 }, { id: 5, kind: 'R', x: 2500, y: 100 }];
  assert.deepStrictEqual(COND.autoLinks(u, 'split'), { 1: 3, 2: 4 });
  assert.deepStrictEqual(COND.autoLinks(u, 'vrf'), { 1: 5, 2: 5 });
  const r2 = COND.compute({ rooms: [], units: u }, { params: { brand: 'lg_vrf' } });
  assert.strictEqual(r2.O.find(o => o.id === 5).linked.length, 2);
  console.log('cond links: ALL OK');
}
