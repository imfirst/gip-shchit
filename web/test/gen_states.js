// Готовит состояния таблицы для проверки LISP-построения
require('../src/model.js');
const M = globalThis.GIPM, fs = require('fs');
const out = {};
// a) 3-комнатная, 3 фазы, УЗО на группы + резерв, аварийное освещение, 4P УЗО, дифавтомат 10 мА, перестановки
let o = M.tplOptions('k3'); o.mode = 'rcd'; let st = M.generate(o);
let r = M.addGroup(st, 'reserve', null); st = r.st;
r = M.addGroup(st, 'elight', st.rows[2].id); st = r.st;
const hob = st.rows.find(x => x.cat === 'hob');
const sockF = st.rows.find(x => x.cat === 'sock' && x.prot !== 'rcd');
const firstSock = st.rows.find(x => x.cat === 'sock');
st = M.setField(st, firstSock.id, 'prot', 'dif'); st = M.setField(st, firstSock.id, 'idn', 10);
const u = st.rows.find(x => x.t === 'u'); st = M.setField(st, u.id, 'type', 'AC');
// перенести последний кондиционер в начало
const ac = st.rows.filter(x => x.cat === 'ac').pop(); st = M.moveRows(st, [ac.id], { after: null, into: null });
// 4P УЗО: варочная + ПММ
const dw = st.rows.find(x => x.key === 'dw');
r = M.wrapRcd(st, [hob.id]); st = r.st; st = M.setField(st, r.id, 'poles', 4);
st = M.setBoard(st, 'pAllowed', 15);
st = M.setBoard(st, 'olLen', true); st = M.setBoard(st, 'route', 'Пол, потолок');
out.k3_rcd = st;
// b) 2-комнатная, 1 фаза, дифавтоматы, один блок УЗО из розеток, ручная длина и кабель
o = M.tplOptions('k2'); st = M.generate(o);
const socks = st.rows.filter(x => x.cat === 'sock').map(x => x.id);
r = M.wrapRcd(st, socks.slice(0, 3)); st = r.st;
st = M.setField(st, socks[3], 'len', '42'); st = M.setField(st, socks[3], 'cable', '3×4');
st = M.setBoard(st, 'brand', 'iek');
st = M.setBoard(st, 'xb', true); st = M.setBoard(st, 'kmType', '40-20');
out.k2_dif = st;
// c) пустой щит
o = M.tplOptions('empty'); st = M.generate(o); out.empty = st;
for (const k in out) fs.writeFileSync(require('path').resolve(__dirname, '../../lisp/emu/out/panel') + '/' + k + '.json', JSON.stringify(out[k]));
console.log(Object.keys(out).map(k => k + ':' + out[k].rows.length).join(' '));
