// Расчёт отопления для панели GIPHEAT: теплопотери помещений (укрупнённо), подбор приборов под окна,
// узлы подключения, спецификация, данные для чертежа (gip_heat_in.txt).
// Чистые функции: проверяются в node (web/test/heat_test.js).
var HEAT = (function () {
  'use strict';
  var DB = (typeof HEAT_DB !== 'undefined') ? HEAT_DB : require('./db.js');
  var NODES = (typeof HEAT_NODES !== 'undefined') ? HEAT_NODES : (typeof require !== 'undefined' ? require('./nodes.json') : []);

  var DEF = {
    tsup: 90, tret: 65, tin: 20,          // °C (как в пояснительной записке ГИП: теплоноситель 90-65)
    q: 80, hRef: 2700, reserve: 1.1, corner: 1.2,   // Вт/м² при высоте hRef; запас; угловое помещение
    series: 'tubog', maxH: 600, cols: 2, conn: 'НС', lenMax: 0.75, D: 100,
    conv: '090.230', pipe: 'rehau16', collector: 'noservo'
  };
  var WET = /сан|с\/у|ванн|туал|душ|wc|гардер|кладов|постир|корид|прих|холл|лодж|балк|тамбур|техн|гардероб/i;

  function params(st) { var p = {}, k; for (k in DEF) p[k] = DEF[k]; if (st && st.params) for (k in st.params) if (st.params[k] !== '' && st.params[k] != null) p[k] = st.params[k]; return p; }
  function seriesById(id) { return DB.series.filter(function (s) { return s.id === id; })[0] || DB.series[0]; }
  function dtFactor(p, s) { var dT = (+p.tsup + +p.tret) / 2 - p.tin; return Math.pow(Math.max(1, dT) / s.dt, s.n); }
  function fill(t, v) { return t.replace(/\{(\w+)\}/g, function (m, k) { return v[k] != null ? v[k] : m; }); }
  function interp(pts, L) {
    if (L <= pts[0][0]) return pts[0][1] * L / pts[0][0];
    for (var i = 1; i < pts.length; i++) if (L <= pts[i][0]) { var a = pts[i - 1], b = pts[i]; return a[1] + (b[1] - a[1]) * (L - a[0]) / (b[0] - a[0]); }
    var x = pts[pts.length - 1], y = pts[pts.length - 2];
    return x[1] + (x[1] - y[1]) * (L - x[0]) / (x[0] - y[0]);
  }

  // ---- нагрузка помещения, Вт
  function roomLoad(room, p, ro) {
    if (ro && ro.qman > 0) return +ro.qman;
    var a = +room.area || 0, h = +room.h || p.hRef;
    var q = a * p.q * Math.max(1, h / p.hRef) * (ro && ro.corner ? p.corner : 1) * p.reserve;
    return Math.round(q);
  }
  function defaultHeated(room, wins) { return wins.length > 0 && !WET.test(room.name || ''); }

  // ---- подбор секционного/трубчатого прибора
  function pickSec(s, Q, p, maxL, ov) {
    var f = dtFactor(p, s);
    var models = s.models.slice();
    if (ov && ov.model) models = models.filter(function (m) { return m.code === ov.model; });
    else {
      models = models.filter(function (m) { return m.H <= p.maxH; });
      if (!models.length) models = s.models.slice().sort(function (a, b) { return a.H - b.H; }).slice(0, 2);
    }
    // предпочтение: заданное число колонок, наибольшая высота под подоконником; затем больше колонок, затем выше нельзя
    models.sort(function (a, b) {
      var ca = (a.cols || 2) === +p.cols ? 0 : 1, cb = (b.cols || 2) === +p.cols ? 0 : 1;
      if (ca !== cb) return ca - cb; return b.H - a.H;
    });
    var best = null, warn = '';
    models.forEach(function (m) {
      var N = ov && ov.N ? +ov.N : Math.max(s.min, Math.ceil(Q / (m.q * f)));
      var L = N * s.pitch + s.add;
      var r = { model: m, N: N, L: L, Q: Math.round(N * m.q * f), fit: N <= s.max && L <= maxL };
      if (!best) best = r;
      else if (!best.fit && r.fit) best = r;
    });
    if (best && !best.fit) warn = best.N > s.max ? 'секций больше допустимого' : 'прибор длиннее ' + Math.round(maxL) + ' мм';
    if (best) best.warn = warn;
    return best;
  }
  // ---- подбор внутрипольного конвектора по длине
  function pickConv(s, Q, p, maxL, ov) {
    var f = dtFactor(p, s);
    var m = s.models.filter(function (x) { return x.code === ((ov && ov.model) || p.conv); })[0] || s.models[0];
    var best = null;
    s.lengths.forEach(function (L) {
      var q = interp(m.pts, L) * f;
      if (ov && ov.N && +ov.N !== L) return;
      if (!best && q >= Q && L <= maxL) best = { model: m, L: L, N: L, Q: Math.round(q), fit: true };
    });
    if (!best) {
      var L = Math.min(s.lengths[s.lengths.length - 1], Math.max(s.lengths[0], Math.floor(maxL / 200) * 200));
      if (ov && ov.N) L = +ov.N;
      best = { model: m, L: L, N: L, Q: Math.round(interp(m.pts, L) * f), fit: false, warn: 'мощности конвектора не хватает' };
    }
    return best;
  }

  // ---- основной расчёт: reg — реестр из чертежа, st — состояние панели
  function compute(reg, st) {
    st = st || {}; var p = params(st), rooms = [], rads = [], warn = [];
    var ros = st.rooms || {}, rds = st.rads || {};
    var wins = (reg && reg.windows) || [];
    (reg && reg.rooms || []).forEach(function (r) {
      var ws = wins.filter(function (w) { return w.room === r.no; });
      var ro = ros[r.no] || {};
      var heated = ro.heat != null ? !!ro.heat : defaultHeated(r, ws);
      var Q = heated ? roomLoad(r, p, ro) : 0;
      rooms.push({ no: r.no, name: r.name, area: r.area, h: r.h, heated: heated, corner: !!ro.corner, qman: ro.qman || '', Q: Q, wins: ws.map(function (w) { return w.id; }) });
      if (heated && !ws.length) warn.push('помещение ' + r.no + ' «' + r.name + '»: нет окон — укажите окно или снимите отопление');
      var on = ws.filter(function (w) { return !(rds[w.id] && rds[w.id].off); });
      var wsum = on.reduce(function (a, w) { return a + (+w.w || 1); }, 0);
      on.forEach(function (w) {
        if (!heated) return;
        var ov = rds[w.id] || {};
        var s = seriesById(ov.series || p.series);
        var Qw = Math.round(Q * (+w.w || 1) / wsum);
        var maxL = s.type === 'len' ? Math.max(800, (+w.w || 1000) - 100) : Math.max(400, (+w.w || 1000) * p.lenMax);
        var pk = s.type === 'len' ? pickConv(s, Qw, p, maxL, ov) : pickSec(s, Qw, p, maxL, ov);
        if (!pk) return;
        var m = pk.model, v = { code: m.code, N: pk.N, L: pk.L, H: m.H, W: m.W, Q: pk.Q };
        var conn = ov.conn || p.conn;
        var r1 = {
          win: w.id, room: r.no, roomName: r.name, series: s.id, kind: s.kind, model: m.code, N: pk.N, L: pk.L, H: m.H, Qneed: Qw, Q: pk.Q,
          D: s.kind === 'CONV' ? (m.W || 230) : p.D, conn: conn, approx: !!m.approx, warn: pk.warn || '',
          label: s.label.map(function (t) { return fill(t, v); }).join('\\P'),
          specName: fill(s.spec.name, v), specType: fill(s.spec.type, v), maker: s.maker, unit: s.spec.unit,
          node: s.kind === 'CONV' ? '' : 'О_Узел_' + s.kind + '_' + conn + '_'
        };
        if (r1.warn) warn.push('окно ' + w.id + ' (' + r.name + '): ' + r1.warn);
        rads.push(r1);
      });
    });
    var spec = specRows(rads, p);
    return { params: p, rooms: rooms, rads: rads, spec: spec, warn: warn };
  }

  // ---- состав узла: из таблиц библиотеки узлов (без строки «Радиатор…»)
  function nodeItems(kind, conn) {
    var n = NODES.filter(function (x) { return x.kind === kind && x.conn === conn; })[0];
    if (!n) n = NODES.filter(function (x) { return x.kind === 'TUB' && x.conn === conn; })[0];
    if (!n) return [];
    return n.items.filter(function (it) { return !/^Радиатор/.test(it.name); }).map(function (it) {
      return { name: it.name, code: it.code, maker: DB.makerOf(it.code), k: /Резьбозажим|Трубка Г|Переходник/.test(it.name) ? 2 : 1, unit: /труба/i.test(it.name) ? 'м' : 'шт.' };
    });
  }
  function convItems() {
    return [{ name: 'Термостат "Uni LH"', code: '1011465', maker: 'Oventrop', k: 1, unit: 'шт.' },
            { name: 'Термостатический вентиль R1/2"хG3/4", осевой', code: '1181492', maker: 'Oventrop', k: 1, unit: 'шт.' },
            { name: 'Вентиль на обр. подводку R1/2"хG3/4", угловой', code: '1091072', maker: 'Oventrop', k: 1, unit: 'шт.' },
            { name: 'Резьбозажимное соед. для мет. трубки G3/4"-15', code: '240601-003', maker: 'Rehau', k: 2, unit: 'шт.' }];
  }

  // ---- спецификация: разделы в порядке ГИП
  function specRows(rads, p) {
    var out = [], n = rads.length, i;
    if (!n) return out;
    // 1. приборы (без названия раздела — номер у первой строки)
    out.push(['SEC', '']);
    var g = {};
    rads.forEach(function (r) { var k = r.specName + '|' + r.specType; if (!g[k]) g[k] = { r: r, q: 0 }; g[k].q++; });
    Object.keys(g).forEach(function (k) { out.push(['ROW', g[k].r.specName, g[k].r.specType, g[k].r.maker, g[k].r.unit, g[k].q]); });
    // 2. арматура и фитинги
    out.push(['SEC', 'Арматура и фитинги']);
    var it = {}, order = [];
    rads.forEach(function (r) {
      (r.kind === 'CONV' ? convItems() : nodeItems(r.kind, r.conn)).forEach(function (x) {
        var k = x.name + '|' + x.code;
        if (!it[k]) { it[k] = { x: x, q: 0 }; order.push(k); }
        it[k].q += x.k;
      });
    });
    order.forEach(function (k) { var x = it[k].x; out.push(['ROW', x.name, x.code, x.maker, x.unit, it[k].q]); });
    // 3. трубы и теплоизоляция
    var pipe = DB.pipes.filter(function (x) { return x.id === p.pipe; })[0] || DB.pipes[0];
    out.push(['SEC', 'Трубы и теплоизоляция']);
    pipe.rows.forEach(function (r) { out.push(r.slice()); });
    // 4. ШРВ
    out.push(['SEC', 'ШРВ отопления']);
    var cab = DB.cabinets.filter(function (c) { return c[0] >= n; })[0] || DB.cabinets[DB.cabinets.length - 1];
    out.push(['ROW', cab[1], cab[2], 'STOUT', 'шт.', 1]);
    out.push(['ROW', 'Коллектор из нерж. стали без расходомеров 1"х3/4", ' + Math.max(2, n) + ' вых.', 'SMS 0912 0000' + ('0' + Math.max(2, n)).slice(-2), 'STOUT', 'шт.', 1]);
    pipe.fit.forEach(function (f) { out.push(['ROW', f[0], f[1], f[2], 'шт.', f[3] * n]); });
    out.push(['ROW', 'Угольник НВ никелированный 1"', 'SFT-0012-000001', 'STOUT', 'шт.', 2]);
    return out;
  }

  // ---- строки для чертежа (ASCII, русские буквы как ~uXXXX)
  function esc(s) {
    s = String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    var r = '';
    for (var i = 0; i < s.length; i++) { var c = s.charCodeAt(i); r += c < 127 && c >= 32 ? s.charAt(i) : '~u' + ('000' + c.toString(16).toUpperCase()).slice(-4); }
    return '"' + r + '"';
  }
  function num(x) { x = +x || 0; return (Math.round(x * 10) / 10).toFixed(1); }
  function inFile(res, st) {
    var L = ['(STATE ' + esc(JSON.stringify(st || {})) + ')'];
    res.rads.forEach(function (r, i) {
      L.push('(RAD ' + (i + 1) + ' ' + r.win + ' ' + num(r.L) + ' ' + num(r.D) + ' ' + Math.round(r.H || 0) + ' ' + Math.round(r.Q) + ' ' +
             esc(r.kind) + ' ' + esc(r.conn) + ' ' + esc(r.label) + ' ' + esc(r.node) + ')');
    });
    res.spec.forEach(function (r) {
      if (r[0] === 'SEC') L.push('(SEC ' + esc(r[1]) + ')');
      else if (r[0] === 'ROW') L.push('(ROW ' + esc(r[1]) + ' ' + esc(r[2]) + ' ' + esc(r[3]) + ' ' + esc(r[4]) + ' ' + (typeof r[5] === 'number' ? r[5] : esc(r[5])) + ')');
      else if (r[0] === 'PIPE') L.push('(PIPE ' + esc(r[1]) + ' ' + esc(r[2]) + ' ' + esc(r[3]) + ' ' + esc(r[4]) + ' ' + esc(r[5]) + ' ' + num(r[6]) + ')');
    });
    var col = DB.collectors.filter(function (c) { return c.id === res.params.collector; })[0] || DB.collectors[0];
    L.push('(SHRV ' + esc(col.block) + ' ' + Math.max(2, res.rads.length) + ')');
    return L.join('\r\n') + '\r\n';
  }

  return { DEF: DEF, params: params, compute: compute, inFile: inFile, esc: esc, dtFactor: dtFactor, seriesById: seriesById, nodeItems: nodeItems, roomLoad: roomLoad, interp: interp };
})();
if (typeof module !== 'undefined') module.exports = HEAT;
