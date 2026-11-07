/* Кондиционирование: подбор блоков по помещениям, связи с наружными, спецификация, данные для LISP (gip_cond_in.txt) */
var COND = (function () {
  'use strict';
  var DB = (typeof COND_DB !== 'undefined') ? COND_DB : require('./db.js');
  var DEF = { brand: 'haier_split', type: 'wall', q: 100, h0: 2.7 };

  function params(st) { var p = {}, s = (st && st.params) || {}; Object.keys(DEF).forEach(function (k) { p[k] = (s[k] != null && s[k] !== '') ? s[k] : DEF[k]; }); return p; }
  function brand(id) { return DB.brands.filter(function (b) { return b.id === id; })[0] || DB.brands[0]; }
  function indoorModels(bid, type) { return DB.indoor.filter(function (m) { return m.brand === bid && (!type || m.type === type); }).sort(function (a, b) { return a.q - b.q; }); }
  function outdoorModels(bid) { return DB.outdoor.filter(function (m) { return m.brand === bid; }).sort(function (a, b) { return a.q - b.q; }); }
  function byModel(list, model) { return list.filter(function (m) { return m.model === model; })[0]; }
  function num(v) { var n = parseFloat(String(v == null ? '' : v).replace(',', '.')); return isFinite(n) ? n : null; }
  function r1(x) { return Math.round(x * 10) / 10; }

  // холодильная нагрузка помещения, кВт: площадь × удельная (Вт/м² при высоте 2,7 м) с поправкой на высоту
  function roomLoad(room, p) {
    if (!room || !(+room.area > 0)) return null;
    var h = (+room.h > 100 ? room.h / 1000 : +room.h) || p.h0;
    return r1(room.area * p.q * Math.max(1, h / p.h0) / 1000);
  }

  // связи внутренних с наружными (как в LISP): split — ближайший свободный; multi/vrf — все к ближайшему к центру тяжести
  function autoLinks(units, mode) {
    var ins = units.filter(function (u) { return u.kind === 'I'; }), outs = units.filter(function (u) { return u.kind === 'O' || u.kind === 'R'; }), res = {};
    if (!outs.length || ins.some(function (u) { return u.x == null; }) || outs.some(function (u) { return u.x == null; })) { ins.forEach(function (u) { res[u.id] = u.link; }); return res; }
    var d = function (a, b) { return Math.hypot(a.x - b.x, a.y - b.y); };
    if (mode === 'split') {
      var free = outs.slice();
      ins.forEach(function (u) { var pool = free.length ? free : outs, best = pool.reduce(function (m, o) { return !m || d(u, o) < d(u, m) ? o : m; }, null); free = free.filter(function (o) { return o !== best; }); res[u.id] = best.id; });
    } else {
      var c = { x: 0, y: 0 }; ins.forEach(function (u) { c.x += u.x / ins.length; c.y += u.y / ins.length; });
      var b = outs.reduce(function (m, o) { return !m || d(c, o) < d(c, m) ? o : m; }, null);
      ins.forEach(function (u) { res[u.id] = b.id; });
    }
    return res;
  }

  function compute(reg, st) {
    st = st || {}; st.units = st.units || {};
    var p = params(st), b = brand(p.brand), mode = b.mode, warn = [];
    var rooms = {}; (reg.rooms || []).forEach(function (r) { rooms[r.no] = r; });
    var units = reg.units || [];
    var ins = [], outs = [], ks = [];
    units.forEach(function (u) {
      if (u.kind === 'I') ins.push(u); else if (u.kind === 'O' || u.kind === 'R') outs.push(u); else if (u.kind === 'K') ks.push(u);
    });
    var models = indoorModels(b.id, p.type); if (!models.length) models = indoorModels(b.id, null);
    var auto = autoLinks(units, mode);
    // внутренние: подбор по нагрузке помещения (или выбор пользователя)
    var I = ins.map(function (u) {
      var su = st.units[u.id] || {}, room = rooms[u.room], load = su.load != null && su.load !== '' ? num(su.load) : roomLoad(room, p);
      var m = su.model && byModel(models, su.model);
      if (!m) m = models.filter(function (x) { return load == null ? x.q >= 2.0 : x.q >= load; })[0] || models[models.length - 1];
      var link = su.link != null && su.link !== '' && outs.some(function (o) { return o.id === +su.link; }) ? +su.link : auto[u.id];
      return { id: u.id, room: u.room, roomName: room ? room.name : '', area: room ? room.area : null, load: load, m: m, link: link, pump: !!su.pump };
    });
    // наружные
    var omods = outdoorModels(b.id);
    var O = outs.map(function (u) {
      var su = st.units[u.id] || {}, linked = I.filter(function (x) { return x.link === u.id; });
      var sum = r1(linked.reduce(function (s, x) { return s + (x.m ? x.m.q : 0); }, 0)), m = null;
      if (u.kind === 'O') {
        if (su.model) m = byModel(omods, su.model);
        if (!m && mode === 'split' && linked[0] && linked[0].m) m = byModel(omods, linked[0].m.out);
        if (!m) m = omods.filter(function (x) { return x.q * (x.maxIdx || 1) >= sum && (!x.ports || x.ports >= linked.length); })[0] || omods[omods.length - 1];
      }
      return { id: u.id, kind: u.kind, m: m, linked: linked.map(function (x) { return x.id; }), sum: sum };
    });
    // проверки
    if (!ins.length) warn.push('Не указаны внутренние блоки — кнопка «Внутренние блоки».');
    if (!outs.length) warn.push(mode === 'vrf' ? 'Не указан наружный блок или точка подключения к магистрали VRF.' : 'Не указаны наружные блоки.');
    if (!ks.length) warn.push('Не указан выпуск дренажа в К1 — дренаж не будет построен.');
    I.forEach(function (x) {
      if (x.load != null && x.m && x.m.q < x.load) warn.push('Блок ' + x.id + ' (' + (x.roomName || 'пом. ' + x.room) + '): ' + x.m.model + ' ' + x.m.q + ' кВт меньше нагрузки ' + x.load + ' кВт.');
      if (!x.link) warn.push('Блок ' + x.id + ' не связан с наружным.');
    });
    O.forEach(function (o) {
      if (mode === 'split' && o.linked.length > 1) warn.push('Сплит-система: к наружному блоку ' + o.id + ' привязано ' + o.linked.length + ' внутренних — укажите ещё наружные или выберите мульти-сплит.');
      if (o.m && o.m.ports && o.linked.length > o.m.ports) warn.push('Наружный ' + o.m.model + ': внутренних блоков ' + o.linked.length + ' больше, чем портов (' + o.m.ports + ').');
      if (o.m && mode !== 'split' && o.sum) {
        var idx = o.sum / o.m.q;
        if (idx > (o.m.maxIdx || 1.3) + 1e-9 || idx < 0.5) warn.push('Наружный ' + o.m.model + ': индекс загрузки ' + Math.round(idx * 100) + '% (допустимо 50–' + Math.round((o.m.maxIdx || 1.3) * 100) + '%).');
      }
      if (o.kind === 'R' && mode !== 'vrf') warn.push('Точка подключения к магистрали используется только для VRF.');
    });
    var approx = {};
    I.forEach(function (x) { if (x.m && x.m.src === 'approx') approx[x.m.model] = 1; });
    O.forEach(function (o) { if (o.m && o.m.src === 'approx') approx[o.m.model] = 1; });
    if (Object.keys(approx).length) warn.push('Размеры/данные ориентировочные, сверьте с каталогом: ' + Object.keys(approx).join(', ') + '.');
    return { p: p, brand: b, mode: mode, I: I, O: O, K: ks, warn: warn, spec: specRows(b, mode, I, O) };
  }

  function typeName(t) { return t === 'duct' ? 'канального типа' : 'настенного типа'; }
  function specRows(b, mode, I, O) {
    var rows = [{ sec: '' }], cnt = {};
    function add(key, row) { if (cnt[key]) cnt[key].qty += row.qty; else { cnt[key] = row; rows.push(row); } }
    if (mode === 'split') {
      I.forEach(function (x) { if (x.m) add('s' + x.m.model, { name: 'Сплит-система ' + typeName(x.m.type), type: x.m.model + ' / ' + (x.m.out || ''), maker: b.maker, unit: 'компл.', qty: 1 }); });
    } else {
      I.forEach(function (x) { if (x.m) add('i' + x.m.model, { name: 'Внутренний блок ' + typeName(x.m.type), type: x.m.model, maker: b.maker, unit: 'шт.', qty: 1 }); });
      O.forEach(function (o) { if (o.m) add('o' + o.m.model, { name: 'Наружный блок', type: o.m.model, maker: b.maker, unit: 'шт.', qty: 1 }); });
      (b.extras || []).forEach(function (e) { add('e' + e.type, { name: e.name, type: e.type, maker: b.maker, unit: e.unit, qty: I.length }); });
      if (mode === 'vrf' && b.refnet) rows.push({ name: b.refnet.name, type: b.refnet.code, maker: b.maker, unit: b.refnet.unit, key: 'REF', k: 1 });
    }
    var np = I.filter(function (x) { return x.pump; }).length;
    if (np) DB.pump.forEach(function (pp) { rows.push({ name: pp.name, type: pp.type, maker: pp.maker, unit: pp.unit, qty: pp.perUnit ? r1(pp.perUnit * np) : np }); });
    // трубы: все диаметры, которые могут встретиться (лишние строки с нулём LISP не выводит)
    var ds = {};
    I.forEach(function (x) { if (x.m) { ds[x.m.liq] = 1; ds[x.m.gas] = 1; } });
    O.forEach(function (o) { if (o.m && o.m.liq) { ds[o.m.liq] = 1; ds[o.m.gas] = 1; } });
    if (mode === 'vrf') (b.vrft || []).forEach(function (t) { ds[t[1]] = 1; ds[t[2]] = 1; });
    var dl = Object.keys(ds).sort(function (a, c) { return num(a) - num(c); });
    rows.push({ sec: 'Трубы и материалы' });
    dl.forEach(function (d) { var c = DB.copper[d] || {}; rows.push({ name: 'Трубы медные %%C' + d + ' мм', type: '%%C' + d + (c.inch ? ' (' + c.inch + ')' : ''), maker: '', unit: 'п.м.', key: 'CU:' + d, k: 1.1 }); });
    dl.forEach(function (d) { var c = DB.copper[d] || {}; rows.push({ name: 'Теплоизоляция для трубы %%C' + d + ' - ' + (c.ins || 'K-Flex ST'), type: c.ins || '', maker: 'K-Flex', unit: 'п.м.', key: 'INS:' + d, k: 1.1 }); });
    DB.drain.forEach(function (d) { rows.push({ name: d.name, type: d.type, maker: d.maker, unit: d.unit, key: d.key, k: d.k }); });
    return rows;
  }

  // строки ASCII для LISP: не-ASCII как ~uXXXX
  function esc(s) { return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[^\x20-\x7e]/g, function (c) { return '~u' + ('000' + c.charCodeAt(0).toString(16).toUpperCase()).slice(-4); }); }
  function q(s) { return '"' + esc(s) + '"'; }
  function inFile(res, st) {
    var L = ['(STATE ' + q(JSON.stringify(st || {})) + ')', '(OPT "mode" ' + q(res.mode) + ')', '(OPT "specclear" ' + q(st && st.specclear ? '1' : '0') + ')'];
    res.I.forEach(function (x) { if (x.m) L.push('(UNIT ' + x.id + ' ' + q(res.brand.maker) + ' ' + q(x.m.model) + ' ' + x.m.W + ' ' + x.m.D + ' ' + x.m.H + ' ' + q(x.m.liq) + ' ' + q(x.m.gas) + ' ' + x.m.q + ')'); });
    res.O.forEach(function (o) { if (o.m) L.push('(UNIT ' + o.id + ' ' + q(res.brand.maker) + ' ' + q(o.m.model) + ' ' + o.m.W + ' ' + o.m.D + ' ' + o.m.H + ' ' + (o.m.liq ? q(o.m.liq) + ' ' + q(o.m.gas) : 'nil nil') + ' ' + o.m.q + ')'); });
    res.I.forEach(function (x) { if (x.link) L.push('(LINK ' + x.id + ' ' + x.link + ')'); });
    if (res.mode === 'vrf') (res.brand.vrft || []).forEach(function (t) { L.push('(VRFT ' + t[0] + ' ' + q(t[1]) + ' ' + q(t[2]) + ')'); });
    res.spec.forEach(function (r) {
      if (r.sec != null) L.push('(SEC ' + q(r.sec) + ')');
      else if (r.key) L.push('(PIPE ' + q(r.name) + ' ' + q(r.type) + ' ' + q(r.maker) + ' ' + q(r.unit) + ' ' + q(r.key) + ' ' + r.k + ')');
      else L.push('(ROW ' + q(r.name) + ' ' + q(r.type) + ' ' + q(r.maker) + ' ' + q(r.unit) + ' ' + r.qty + ')');
    });
    return L.join('\r\n') + '\r\n';
  }

  return { DB: DB, autoLinks: autoLinks, params: params, brand: brand, indoorModels: indoorModels, outdoorModels: outdoorModels, roomLoad: roomLoad, compute: compute, inFile: inFile, esc: esc };
})();
if (typeof module !== 'undefined') module.exports = COND;
