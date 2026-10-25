// node test_model.js — проверки модели групп
require('../src/model.js');
const M = globalThis.GIPM;
let fails = 0;
function ok(c, msg) { if (!c) { fails++; console.log('FAIL', msg); } }
function nums(st) { return M.derive(st).rows.filter(r => r.t === 'g').map(r => r.num + ' ' + r.name); }
function shape(st) { return st.rows.map(r => r.t === 'u' ? '[U' + r.id + ']' : (r.prot === 'rcd' ? '  ' : '') + r.name).join(' | '); }

// 1. шаблоны
for (const k of Object.keys(M.TEMPLATES)) for (const mode of ['dif', 'rcd']) for (const ph of [1, 3]) {
  const o = M.tplOptions(k); o.mode = mode; o.phases = ph; o.inA = ph === 3 ? 25 : 40;
  const st = M.generate(o);
  const d = M.derive(st);
  ok(d.rows.length === st.rows.length, 'derive rows ' + k);
  if (k !== 'empty') ok(d.tot.groups > 5, 'groups ' + k);
  // номера по сериям подряд
  const ser = {};
  d.rows.filter(r => r.t === 'g').forEach(r => { ser[r.ser] = (ser[r.ser] || 0) + 1; ok(r.num === r.ser + '-' + ser[r.ser], 'num ' + r.num); });
  if (mode === 'rcd' && k !== 'empty') ok(st.rows.some(r => r.t === 'u'), 'rcd blocks ' + k);
  if (ph === 3) {
    st.rows.forEach(r => { if (r.t === 'g') ok(['L1', 'L2', 'L3', 'L123'].includes(r.phase), 'phase ' + r.phase); });
    ok(d.tot.imb < 40, 'imbalance ' + k + ' ' + mode + ' ' + d.tot.imb.toFixed(1));
  }
}

// 2. 3-комнатная, 3 фазы, УЗО на группы
let o = M.tplOptions('k3'); o.mode = 'rcd';
let st = M.generate(o);
let d = M.derive(st);
console.log('k3 rcd:', d.tot.groups, 'groups,', d.tot.counts, 'modules', d.tot.modules, 'rails', d.tot.rails, 'imb', d.tot.imb.toFixed(1), 'Ir', d.tot.Ir.toFixed(1));
console.log(d.fixed.map(f => f.ref + ' ' + f.name).join('; '));
console.log(d.rows.map(r => (r.t === 'u' ? r.ref + ' УЗО ' + r.phase : '  ' + r.ref + ' ' + r.num + ' ' + r.name + ' ' + r.phase)).join('\n'));

// 3. перенос: первую розетку из блока — в начало
const firstU = st.rows.find(r => r.t === 'u');
const mem = M.blocks(st).members[firstU.id];
const g0 = mem[0].id;
st = M.moveRows(st, [g0], { after: null, into: null });
ok(st.rows[0].id === g0 && st.rows[0].prot !== 'rcd', 'moved out to start');
// обратно внутрь
st = M.moveRows(st, [g0], { after: firstU.id, into: firstU.id });
ok(M.find(st, g0).prot === 'rcd' && M.blocks(st).byRow[g0] === firstU.id, 'moved back into rcd');
// перенос УЗО целиком в начало
st = M.moveRows(st, [firstU.id], { after: null, into: null });
ok(st.rows[0].id === firstU.id && M.blocks(st).members[firstU.id].length === mem.length, 'block moved with members');

// 4. нумерация после удаления
o = M.tplOptions('k2'); st = M.generate(o);
let before = nums(st);
const lo2 = M.derive(st).rows.find(r => r.num === 'ЛО-2');
st = M.removeRows(st, [lo2.id]);
let after = nums(st);
ok(after.filter(x => x.startsWith('ЛО-')).length === before.filter(x => x.startsWith('ЛО-')).length - 1, 'one less LO');
ok(after[1].startsWith('ЛО-2') && after[1].includes(before[2].split(' ').slice(1).join(' ')), 'renumber LO: ' + after[1] + ' vs ' + before[2]);

// 5. смена назначения: свет -> розетки
const firstLight = st.rows.find(r => r.t === 'g' && r.cat === 'light');
st = M.setField(st, firstLight.id, 'cat', 'sock');
let fl = M.find(st, firstLight.id);
ok(fl.cat === 'sock' && fl.In === 16 && fl.pAuto && fl.prot === 'dif' && fl.name.startsWith('Розетки: '), 'cat change ' + JSON.stringify(fl));
ok(M.derive(st).byId[fl.id].num.startsWith('ЛС-'), 'series LS after cat change');

// 6. защита: дифавтомат -> под новое УЗО -> под существующее -> обратно
o = M.tplOptions('k1'); st = M.generate(o);
const socks = st.rows.filter(r => r.t === 'g' && r.cat === 'sock');
st = M.setField(st, socks[0].id, 'prot', 'rcd:new');
let u1 = st.rows.find(r => r.t === 'u');
ok(u1 && M.blocks(st).byRow[socks[0].id] === u1.id, 'rcd:new');
st = M.setField(st, socks[2].id, 'prot', 'rcd:' + u1.id);
ok(M.blocks(st).byRow[socks[2].id] === u1.id, 'rcd:existing');
st = M.setField(st, socks[0].id, 'prot', 'dif');
ok(M.find(st, socks[0].id).prot === 'dif' && !M.blocks(st).byRow[socks[0].id], 'out of rcd');
ok(M.blocks(st).byRow[socks[2].id] === u1.id, 'other member stays');
console.log('k1 after prot edits:', shape(st));

// 7. объединить под УЗО и удалить УЗО
const ids = st.rows.filter(r => r.t === 'g' && r.cat === 'app').map(r => r.id);
let res = M.wrapRcd(st, ids); st = res.st;
ok(M.blocks(st).members[res.id].length === ids.length, 'wrap all apps');
st = M.removeRows(st, [res.id]);
ok(ids.every(id => M.find(st, id).prot === 'dif'), 'remove rcd keeps groups as dif');

// 8. балансировка 3ф
o = M.tplOptions('k3'); st = M.generate(o);
st = M.balance(st, 'power'); d = M.derive(st);
console.log('k3 power balance imb', d.tot.imb.toFixed(1), d.tot.phases.map(p => p.ph + '=' + p.P.toFixed(1)).join(' '));
ok(d.tot.imb < 10, 'power balance');
st = M.balance(st, 'seq'); d = M.derive(st);
console.log('k3 seq balance imb', d.tot.imb.toFixed(1));
// закреплённая фаза не меняется
const h = st.rows.find(r => r.t === 'g' && r.poles === 1 && r.cat === 'sock');
st = M.setField(st, h.id, 'phase', 'L3');
st = M.balance(st, 'power');
ok(M.find(st, h.id).phase === 'L3', 'locked phase kept');

// 9. сдвиг на одну позицию проходит через блок по шагам
o = M.tplOptions('k2'); o.mode = 'rcd'; st = M.generate(o);
const free = st.rows.find((r, i) => r.t === 'g' && r.prot !== 'rcd' && st.rows[i + 1] && st.rows[i + 1].t === 'u');
if (free) {
  const U = st.rows[M.blocks(st) && st.rows.indexOf(free) + 1];
  st = M.nudge(st, [free.id], 1);
  ok(M.blocks(st).byRow[free.id] === U.id, 'nudge into block');
  const n = M.blocks(st).members[U.id].length;
  for (let k = 0; k < n; k++) st = M.nudge(st, [free.id], 1);
  ok(!M.blocks(st).byRow[free.id], 'nudge out of block bottom');
  console.log('nudge:', shape(st));
}

// 10. 1ф <-> 3ф
o = M.tplOptions('k2'); o.heater = 'flow'; st = M.generate(o);
st = M.setBoard(st, 'phases', 3); d = M.derive(st);
ok(d.tot.phases && d.tot.imb < 40, '1->3 balance ' + d.tot.imb);
st = M.setBoard(st, 'phases', 1); d = M.derive(st);
ok(st.rows.every(r => r.phase === 'L'), '3->1 phases L');

// 11. дублирование и добавление после выделенной внутри блока
o = M.tplOptions('k2'); o.mode = 'rcd'; st = M.generate(o);
const m0 = st.rows.find(r => r.t === 'g' && r.prot === 'rcd');
res = M.addGroup(st, 'sock', m0.id); st = res.st;
ok(M.blocks(st).byRow[res.id] === M.blocks(st).byRow[m0.id], 'add into block');
res = M.duplicate(st, [m0.id]); st = res.st;
ok(M.blocks(st).byRow[res.ids[0]] === M.blocks(st).byRow[m0.id], 'duplicate stays in block');
res = M.addGroup(st, 'light', null); st = res.st;
ok(st.rows[st.rows.length - 1].id === res.id && M.find(st, res.id).km, 'add light at end via KM');

// 12. проверки: кабель и ΔU
o = M.tplOptions('k1'); st = M.generate(o);
const s1 = st.rows.find(r => r.t === 'g' && r.cat === 'sock');
st = M.setField(st, s1.id, 'In', 32);
d = M.derive(st);
ok(d.byId[s1.id].cableEff === '3×6', 'auto cable follows In: ' + d.byId[s1.id].cableEff);
st = M.setField(st, s1.id, 'cable', '3×2,5');
d = M.derive(st);
ok(d.byId[s1.id].warn.some(w => w.f === 'cable'), 'cable warn');
st = M.setField(st, s1.id, 'len', '120');
d = M.derive(st);
ok(d.byId[s1.id].dU > 4 && d.byId[s1.id].warn.some(w => w.f === 'dU'), 'dU warn ' + d.byId[s1.id].dU);


// этажный щит: авто-значения, селективность, ручные настройки переживают перестройку щита
{
  let s3 = M.generate(M.tplOptions('k3'));
  let f = M.derive(s3).fs;
  ok(f.pre === 'qs' && f.preIn === 40 && f.post === 'dif' && f.postIn === 32 && f.idn === 100 && f.cable === 'ВВГнг(А)-LS 5×6', 'fs auto 3ph ' + JSON.stringify(f));
  s3 = M.setBoard(s3, 'fsPost', 'avrcd'); s3 = M.setBoard(s3, 'fire', true); f = M.derive(s3).fs;
  ok(f.rcdIn === 40 && f.idn === 300, 'fs avrcd selective rcd ' + f.rcdIn + ' idn ' + f.idn);
  s3 = M.setBoard(s3, 'fsPreIn', '63'); s3 = M.setBoard(s3, 'fsMeter', 'Меркурий 234 ARTM');
  const r = M.addGroup(s3, 'sock', null); s3 = r.st; s3 = M.removeRows(s3, [s3.rows[3].id]);
  f = M.derive(s3).fs; ok(f.preIn === 63 && f.meter === 'Меркурий 234 ARTM' && f.post === 'avrcd', 'fs settings survive edits');
  s3 = M.setBoard(s3, 'fsMark', 'АВВГнг(А)-LS'); s3 = M.setBoard(s3, 'fsCable', '4');
  ok(M.derive(s3).tot.warn.some(w => /Вводной кабель/.test(w)), 'fs cable Iz warning');
  s3 = M.setBoard(s3, 'fsReset', true); f = M.derive(s3).fs; ok(f.post === 'dif' && f.preIn === 40 && f.sec === 6, 'fs reset');
  let s1 = M.generate(M.tplOptions('k2')); f = M.derive(s1).fs;
  ok(f.post === 'av' && f.postIn === 50 && f.preIn === 63 && f.cable === 'ВВГнг(А)-LS 3×10', 'fs auto 1ph ' + f.cable);
  s1 = M.setBoard(s1, 'fsMark', 'АВВГнг(А)-LS'); ok(M.derive(s1).fs.sec === 16, 'fs Al auto 16');
}
// розетки комнат: «авто»-мощность 0,5…1,5 кВт под ровные фазы, кухня 1,5 кВт
{
  let s3 = M.generate(M.tplOptions('k3'));
  const socks = s3.rows.filter(r => r.cat === 'sock');
  const kit = socks.find(r => /кухн/i.test(r.name)), rooms = socks.filter(r => !/кухн/i.test(r.name));
  ok(kit.p === 1.5 && !kit.pAuto, 'kitchen 1.5 fixed');
  ok(rooms.every(r => r.pAuto && r.p >= 0.5 && r.p <= 1.5), 'rooms auto in range ' + rooms.map(r => r.p).join(','));
  const imbFit = M.derive(s3).tot.imb;
  const flat = M.clone(s3); flat.rows.forEach(r => { if (r.pAuto) { r.p = 1.0; r.pAuto = false; } });
  const imbFlat = M.derive(flat).tot.imb;
  ok(imbFit <= imbFlat + 1e-9, 'fit not worse: ' + imbFit.toFixed(1) + ' vs ' + imbFlat.toFixed(1));
  console.log('soft fit k3: imbalance', imbFlat.toFixed(1), '->', imbFit.toFixed(1), '%, rooms', rooms.map(r => r.p).join(' '));
  const ps1 = s3.rows.map(r => r.p).join(','); M.normalize(s3); ok(ps1 === s3.rows.map(r => r.p).join(','), 'fit idempotent');
  s3 = M.setField(s3, rooms[0].id, 'p', '0,7'); ok(M.find(s3, rooms[0].id).p === 0.7 && !M.find(s3, rooms[0].id).pAuto, 'manual p fixes');
  s3 = M.setField(s3, rooms[0].id, 'p', ''); ok(M.find(s3, rooms[0].id).pAuto, 'empty p -> auto');
  s3 = M.setField(s3, rooms[1].id, 'name', 'Розетки кухни-гостиной'); ok(M.find(s3, rooms[1].id).p === 1.5 && !M.find(s3, rooms[1].id).pAuto, 'renamed to kitchen -> 1.5');
  s3 = M.setBoard(s3, 'phases', 1); ok(s3.rows.filter(r => r.pAuto).every(r => r.p === 1.0), '1ph rooms 1.0');
  const old = M.generate(M.tplOptions('k2')); old.rows.forEach(r => { if (r.cat === 'sock') { r.p = 1.5; delete r.pAuto; } }); M.normalize(old);
  ok(old.rows.filter(r => r.cat === 'sock' && !/кухн/i.test(r.name)).every(r => r.pAuto) && old.rows.find(r => /Розетки кухни/.test(r.name)).p === 1.5, 'migration old 1.5');
  let sp = M.balance(M.generate(M.tplOptions('k3')), 'power'); console.log('power balance + fit imb', M.derive(sp).tot.imb.toFixed(1));
}
console.log(fails ? fails + ' FAILED' : 'ALL OK');
process.exit(fails ? 1 : 0);
