/* ГИП · Группы щита — модель (без интерфейса).
   Один список строк щита по порядку слева направо: группы (t:'g') и УЗО (t:'u').
   Группы с защитой 'rcd' стоят сразу за своим УЗО — подряд. */
(function (root) {
  'use strict';

  var BRANDS = {
    abb: { name: 'ABB', a1: 'S201 C{I}', a2: 'S202 C{I}', a3: 'S203 C{I}', a4: 'S204 C{I}', dif: 'DS201 C{I} A30', dif4: 'DS203NC C{I} A30', rcd2: 'F202 A-{I}/0,03', rcd4: 'F204 A-{I}/0,03', fire2: 'F202 AC-{I}/0,1', fire4: 'F204 AC-{I}/0,1', km2: 'ESB 25-20', km4: 'ESB 25-40' },
    iek: { name: 'IEK', a1: 'ВА47-29 1Р C{I}', a2: 'ВА47-29 2Р C{I}', a3: 'ВА47-29 3Р C{I}', a4: 'ВА47-29 4Р C{I}', dif: 'АВДТ32 C{I} 30мА', dif4: 'АВДТ34 C{I} 30мА', rcd2: 'ВД1-63 2Р {I}А 30мА', rcd4: 'ВД1-63 4Р {I}А 30мА', fire2: 'ВД1-63 2Р {I}А 100мА', fire4: 'ВД1-63 4Р {I}А 100мА', km2: 'КМ63-20М 25А', km4: 'КМ63-40М 25А' },
    dekraft: { name: 'Dekraft', a1: 'ВА-101 1P C{I}', a2: 'ВА-101 2P C{I}', a3: 'ВА-101 3P C{I}', a4: 'ВА-101 4P C{I}', dif: 'ДИФ-103 1P+N C{I} 30мА', dif4: 'ДИФ-103 3P+N C{I} 30мА', rcd2: 'УЗО-03 2P {I}А 30мА', rcd4: 'УЗО-03 4P {I}А 30мА', fire2: 'УЗО-03 2P {I}А 100мА', fire4: 'УЗО-03 4P {I}А 100мА', km2: 'КМ-103 25А 2НО', km4: 'КМ-103 25А 4НО' },
    chint: { name: 'CHINT', a1: 'NXB-63 1P C{I}', a2: 'NXB-63 2P C{I}', a3: 'NXB-63 3P C{I}', a4: 'NXB-63 4P C{I}', dif: 'NB2LE C{I} 30мА', dif4: 'NB2LE 4P C{I} 30мА', rcd2: 'NXL-63 2P {I}A 30мА', rcd4: 'NXL-63 4P {I}A 30мА', fire2: 'NXL-63 2P {I}A 100мА', fire4: 'NXL-63 4P {I}A 100мА', km2: 'NCH8-25/20', km4: 'NCH8-25/40' }
  };
  var STD_IN = [6, 10, 16, 20, 25, 32, 40, 50, 63];
  /* Контакторы «мастер-выключателя»: ток, контакты, ширина в модулях (ABB ESB…N) */
  var KM_TYPES = [
    { k: '20-20', I: 20, c: 2, w: 1 }, { k: '25-20', I: 25, c: 2, w: 1 }, { k: '25-40', I: 25, c: 4, w: 2 },
    { k: '40-20', I: 40, c: 2, w: 3 }, { k: '40-40', I: 40, c: 4, w: 3 }, { k: '63-20', I: 63, c: 2, w: 3 }, { k: '63-40', I: 63, c: 4, w: 3 }
  ];
  var KM_MODEL = { abb: 'ESB{K}N', iek: 'КМ63-{C}0М {I}А', dekraft: 'КМ-103 {I}А {C}НО', chint: 'NCH8-{I}/{C}0' };
  /* Корпуса ABB для встраиваемого щита: ряд 12 модулей — UK600 (IP30), ряд 18 — Mistral41F (IP41) */
  var BOXES = {
    12: [{ rows: 1, n: 'UK610', art: '' }, { rows: 2, n: 'UK620', art: '' }, { rows: 3, n: 'UK630', art: '' }, { rows: 4, n: 'UK640', art: '' }, { rows: 5, n: 'UK650', art: '' }],
    18: [{ rows: 1, n: 'Mistral41F 18M', art: '1SLM004102A1104' }, { rows: 2, n: 'Mistral41F 36M', art: '1SLM004102A1106' }, { rows: 3, n: 'Mistral41F 54M', art: '1SLM004102A1109' }, { rows: 4, n: 'Mistral41F 72M', art: '1SLM004102A1110' }]
  };
  var ROUTES = ['Потолок', 'Пол, потолок', 'Кабель-канал'];
  var IN_A = [16, 20, 25, 32, 40, 50, 63];
  var RCD_IN = [25, 40, 63, 80, 100];
  var IDN = [10, 30, 100];
  var SECTIONS = [1.5, 2.5, 4, 6, 10, 16, 25];
  /* ПУЭ табл. 1.3.6, медь, кабель в воздухе: двухжильный (1ф: L+N нагружены) и трёхжильный (3ф) */
  var IZ1 = { 1.5: 19, 2.5: 27, 4: 38, 6: 50, 10: 70, 16: 90, 25: 115, 35: 140 };
  var IZ3 = { 1.5: 19, 2.5: 25, 4: 35, 6: 42, 10: 55, 16: 75, 25: 95, 35: 115 };
  /* ПУЭ табл. 1.3.7, алюминий, кабель в воздухе */
  var IZA1 = { 2.5: 21, 4: 29, 6: 38, 10: 55, 16: 70, 25: 90, 35: 105 };
  var IZA3 = { 2.5: 19, 4: 27, 6: 32, 10: 42, 16: 60, 25: 75, 35: 90 };
  /* Этажный щит: ряды номиналов, сечения и марки вводного кабеля */
  var FS_BRK = [16, 20, 25, 32, 40, 50, 63, 80, 100, 125], FS_QS = [25, 32, 40, 50, 63, 80, 100, 125], FS_RCD = [25, 40, 63, 80, 100];
  var FS_SEC = [4, 6, 10, 16, 25, 35], FS_IDN = [30, 100, 300];
  var FS_MARKS = ['ВВГнг(А)-LS', 'ВВГнг(А)-FRLS', 'ППГнг(А)-HF', 'АВВГнг(А)-LS', 'АППГнг(А)-HF'];
  var FS_METERS = { 3: ['Меркурий 236 ART', '400/230В 5-60А'], 1: ['Меркурий 204 ARTMX2-02', '230В, 5-100А'] };
  var CABLE1 = { 6: 1.5, 10: 1.5, 16: 2.5, 20: 2.5, 25: 4, 32: 6, 40: 10, 50: 10, 63: 16 };
  var CABLE3 = { 6: 1.5, 10: 1.5, 16: 2.5, 20: 2.5, 25: 4, 32: 6, 40: 10, 50: 10, 63: 16 };
  var DU_C1 = 12.8, DU_C3 = 77; /* ΔU% = P·L/(C·S), медь, 230 и 400/230 В */
  var DU_WARN = 4;
  var KC_LOW = 0.25, KC_BAD = 0.2;
  var IMB_WARN = 15;

  /* Назначения групп. ser — серия номера на плане; len — [k, c] для оценки длины по площади */
  var CAT = {
    light:   { label: 'Освещение', ser: 'ЛО', In: 10, p: 0.3, cos: 0.9, prot: 'av', len: [4.0, 10], light: true },
    elight:  { label: 'Аварийное освещение', ser: 'ЛАО', In: 10, p: 0.1, cos: 0.9, prot: 'av', len: [4.0, 10], light: true },
    sock:    { label: 'Розетки', ser: 'ЛС', In: 16, p: 1.0, cos: 0.9, prot: 'dif', len: [1.2, 4] },
    hob:     { label: 'Варочная панель', ser: 'ЛС', In: 32, p: 7.0, cos: 1.0, prot: 'av', len: [0.9, 2] },
    oven:    { label: 'Духовой шкаф', ser: 'ЛС', In: 16, p: 3.5, cos: 1.0, prot: 'dif', len: [0.9, 2] },
    app:     { label: 'Бытовая техника', ser: 'ЛС', In: 16, p: 2.2, cos: 0.9, prot: 'dif', len: [0.9, 2] },
    floor:   { label: 'Тёплый пол', ser: 'ЛС', In: 16, p: 1.2, cos: 1.0, prot: 'dif', len: [0.9, 2] },
    heat:    { label: 'Водонагреватель', ser: 'ЛС', In: 16, p: 2.0, cos: 1.0, prot: 'dif', len: [0.9, 2] },
    ac:      { label: 'Кондиционер', ser: 'ЛС', In: 16, p: 1.2, cos: 0.9, prot: 'av', len: [1.2, 4] },
    leak:    { label: 'Защита от протечек, слаботочный щит', ser: 'ЛС', In: 16, p: 0.2, cos: 0.9, prot: 'dif', len: [0.9, 2] },
    other:   { label: 'Прочее', ser: 'ЛС', In: 16, p: 1.0, cos: 0.9, prot: 'dif', len: [1.2, 4] },
    reserve: { label: 'Резерв', ser: 'ЛС', In: 16, p: 0, cos: 0.9, prot: 'av', len: [0, 0], noCable: true }
  };
  /* Розетки комнат (не кухни): обычно компьютер и зарядки — мощность «плавает» в этих пределах и подбирается
     так, чтобы выровнять фазы; кухня — 1,5 кВт (чайник, микроволновка и т. п.) */
  var SOFT = { def: 1.0, min: 0.5, max: 1.5, kitchen: 1.5 };
  function isKitchen(r) { return /кухн/i.test(r.name || ''); }
  function softOk(r) { return r.t === 'g' && r.cat === 'sock' && !isKitchen(r); }
  var CAT_ORDER = ['light', 'elight', 'sock', 'hob', 'oven', 'app', 'floor', 'heat', 'ac', 'leak', 'other', 'reserve'];

  var TEMPLATES = {
    studio: { name: 'Студия', area: 30, light: ['Прихожая', 'Кухня-гостиная', 'Санузел'], sockets: ['Розетки кухни', 'Розетки гостиной зоны', 'Розетки санузла'], floor: 1, ac: 1 },
    k1: { name: '1-комнатная', area: 40, light: ['Прихожая', 'Кухня', 'Комната', 'Санузел'], sockets: ['Розетки кухни', 'Розетки комнаты', 'Розетки прихожей', 'Розетки санузла'], floor: 1, ac: 1 },
    k2: { name: '2-комнатная', area: 60, light: ['Прихожая', 'Кухня', 'Гостиная', 'Спальня', 'Санузел'], sockets: ['Розетки кухни', 'Розетки гостиной', 'Розетки спальни', 'Розетки прихожей', 'Розетки санузла'], floor: 1, ac: 2 },
    k3: { name: '3-комнатная', area: 80, light: ['Прихожая', 'Кухня', 'Гостиная', 'Спальня', 'Детская', 'Санузел 1', 'Санузел 2'], sockets: ['Розетки кухни', 'Розетки гостиной', 'Розетки спальни', 'Розетки детской', 'Розетки прихожей', 'Розетки санузла 1', 'Розетки санузла 2'], floor: 2, ac: 3 },
    empty: { name: 'Пустой щит', area: 50, light: [], sockets: [], floor: 0, ac: 0, bare: true }
  };

  /* ------------------------------------------------------------------ утилиты */
  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function stdUp(v, list) { for (var i = 0; i < list.length; i++) if (list[i] >= v - 1e-9) return list[i]; return list[list.length - 1]; }
  function fmtModel(tpl, I) { return tpl.replace('{I}', I); }
  function num(v, def) {
    if (typeof v === 'number') return isFinite(v) ? v : def;
    if (v == null) return def;
    var s = String(v).replace(/\s+/g, '').replace(',', '.');
    if (s === '') return def;
    var n = parseFloat(s);
    return isFinite(n) ? n : def;
  }
  function round(v, d) { var k = Math.pow(10, d || 0); return Math.round(v * k) / k; }
  function fmt(v, d) {
    if (v == null || !isFinite(v)) return '—';
    var s = (d == null ? String(round(v, 2)) : v.toFixed(d));
    return s.replace('.', ',');
  }
  function secStr(S) { return String(S).replace('.', ','); }
  function cableStr(cores, S) { return cores + '×' + secStr(S); }
  function catOf(g) { return CAT[g.cat] || CAT.other; }
  function isLightCat(cat) { return !!(CAT[cat] && CAT[cat].light); }

  function newId(st, p) { st.seq = (st.seq || 0) + 1; return p + st.seq; }

  function defaultBoard() {
    return { name: 'ЩР', tpl: 'k2', area: 60, phases: 1, inA: 40, inPoles: 3, brand: 'abb', relay: true, km: true, fire: false, kup: true, kc: 0.4, kcMode: 'auto', pAllowed: null, mark: 'ВВГнг(А)-LS', railW: 18, mode: 'dif',
             kmType: null, xb: false, olLen: false, route: 'Потолок', phaseMode: 'abc' };
  }

  function tplOptions(key) {
    var t = TEMPLATES[key] || TEMPLATES.k2;
    var bare = !!t.bare;
    return {
      tpl: key, area: t.area, phases: key === 'k3' ? 3 : 1, inA: key === 'k3' ? 25 : 40, inPoles: 3,
      floor: t.floor, ac: t.ac, heater: bare ? 'none' : 'boiler', mode: 'dif',
      app: bare ? { hob: false, oven: false, fridge: false, dw: false, wash: false, dry: false, leak: false }
                : { hob: true, oven: true, fridge: true, dw: true, wash: true, dry: false, leak: true }
    };
  }

  function mkGroup(st, cat, o) {
    var c = CAT[cat] || CAT.other;
    var g = { t: 'g', id: newId(st, 'g'), cat: cat, name: c.label, prot: c.prot, poles: 1, In: c.In, p: c.p, pAuto: cat === 'sock', idn: 30, phase: 'L1', lock: false, cable: null, len: null, km: false };
    if (o) for (var k in o) g[k] = o[k];
    return g;
  }
  function mkRcd(st, o) {
    var u = { t: 'u', id: newId(st, 'u'), In: 40, idn: 30, type: 'A', poles: 2, phase: 'L1', lock: false };
    if (o) for (var k in o) u[k] = o[k];
    return u;
  }

  /* ------------------------------------------------------------------ сборка по шаблону (логика конструктора на сайте) */
  function generate(o, board) {
    var t = TEMPLATES[o.tpl] || TEMPLATES.k2;
    var st = { v: 2, seq: 0, board: board ? clone(board) : defaultBoard(), rows: [] };
    var B = st.board;
    B.tpl = o.tpl; B.area = num(o.area, t.area); B.phases = o.phases === 3 ? 3 : 1; B.inA = o.inA || (B.phases === 3 ? 25 : 40);
    B.inPoles = o.inPoles === 4 ? 4 : 3; B.mode = o.mode === 'rcd' ? 'rcd' : 'dif';
    ['brand', 'relay', 'km', 'fire'].forEach(function (k) { if (o[k] !== undefined) B[k] = o[k]; });
    B.kup = true; B.phaseMode = 'abc';
    var is3 = B.phases === 3, app = o.app || {};
    var L = [];
    t.light.forEach(function (n) { L.push({ cat: 'light', name: 'Освещение: ' + n, prot: 'a', poles: 1, In: 10, p: 0.3, km: true }); });
    if (app.hob) L.push(is3 ? { key: 'hob', cat: 'hob', name: 'Варочная панель', prot: 'a', poles: 3, In: 16, p: 7.5, cable: '5×4' } : { key: 'hob', cat: 'hob', name: 'Варочная панель', prot: 'a', poles: 1, In: 32, p: 7 });
    if (app.oven) L.push({ key: 'oven', cat: 'oven', name: 'Духовой шкаф', prot: 'd', poles: 1, In: 16, p: 3.5 });
    if (app.fridge) L.push({ key: 'fridge', cat: 'app', name: 'Холодильник', prot: 'd', poles: 1, In: 16, p: 0.5 });
    if (app.dw) L.push({ key: 'dw', cat: 'app', name: 'ПММ и измельчитель', prot: 'd', poles: 1, In: 16, p: 2.2 });
    if (app.wash) L.push({ key: 'wash', cat: 'app', name: 'Стиральная машина', prot: 'd', poles: 1, In: 16, p: 2.3 });
    if (app.dry) L.push({ key: 'dry', cat: 'app', name: 'Сушильная машина', prot: 'd', poles: 1, In: 16, p: 2.5 });
    t.sockets.forEach(function (n) { var kit = /кухн/i.test(n); L.push({ cat: 'sock', name: n, prot: 'd', poles: 1, In: 16, p: kit ? SOFT.kitchen : SOFT.def, pAuto: !kit }); });
    var nf = o.floor | 0, na = o.ac | 0;
    for (var f = 1; f <= nf; f++) L.push({ cat: 'floor', name: 'Тёплый пол' + (nf > 1 ? ' ' + f : ''), prot: 'd', poles: 1, In: 16, p: 1.2 });
    if (o.heater === 'boiler') L.push({ key: 'heater', cat: 'heat', name: 'Водонагреватель накопительный', prot: 'd', poles: 1, In: 16, p: 2 });
    if (o.heater === 'flow') L.push(is3 ? { key: 'heater', cat: 'heat', name: 'Водонагреватель проточный', prot: 'd3', poles: 3, In: 16, p: 9 } : { key: 'heater', cat: 'heat', name: 'Водонагреватель проточный', prot: 'd', poles: 1, In: 32, p: 6 });
    if (app.leak) L.push({ key: 'leak', cat: 'leak', name: 'Защита от протечек и слаботочный щит', prot: 'd', poles: 1, In: 16, p: 0.2 });
    for (var a = 1; a <= na; a++) L.push({ cat: 'ac', name: 'Кондиционер' + (na > 1 ? ' ' + a : ''), prot: 'a', poles: 1, In: 16, p: 1.2 });

    /* фазы при 3 фазах — ABC подряд под трёхфазную гребёнку (normalize), здесь только начальное значение */
    if (is3) {
      L.forEach(function (l) { if (l.poles === 3) l.phase = 'L123'; });
      var lights = L.filter(function (l) { return l.cat === 'light' && l.poles === 1; });
      lights.forEach(function (l, k) { l.phase = ['L1', 'L2', 'L3'][Math.min(2, Math.floor(k * 3 / Math.max(lights.length, 1)))]; });
      var rest = L.filter(function (l) { return l.poles === 1 && l.cat !== 'light'; });
      var cut = split3(rest.map(function (l) { return l.p; }), [0, 0, 0]);
      rest.forEach(function (l, k) { l.phase = k < cut[0] ? 'L1' : k < cut[1] ? 'L2' : 'L3'; });
    } else L.forEach(function (l) { l.phase = 'L'; });

    var ri = Math.max(40, stdUp(B.inA, [25, 40, 63, 80]));
    var run = [];
    function toGroup(l, prot) {
      return mkGroup(st, l.cat, { name: l.name, prot: prot, poles: l.poles, In: l.In, p: l.p, pAuto: !!l.pAuto, phase: l.phase, km: !!(l.km && B.km), key: l.key || null, cable: l.cable || null });
    }
    function flush() {
      if (!run.length) return;
      var g = Math.ceil(run.length / 4), sz = Math.ceil(run.length / g);
      for (var k = 0; k < run.length; k += sz) {
        var part = run.slice(k, k + sz);
        st.rows.push(mkRcd(st, { In: ri, phase: part[0].phase }));
        part.forEach(function (l) { st.rows.push(toGroup(l, 'rcd')); });
      }
      run = [];
    }
    L.forEach(function (l) {
      if (l.km) { flush(); st.rows.push(toGroup(l, 'av')); return; }
      if (B.mode === 'rcd' && l.prot === 'd' && l.poles === 1) {
        if (run.length && run[0].phase !== l.phase) flush();
        run.push(l); return;
      }
      flush();
      st.rows.push(toGroup(l, l.prot === 'a' ? 'av' : 'dif'));
    });
    flush();
    return normalize(st);
  }

  /* Деление последовательности на три сплошных участка с наиболее ровной нагрузкой.
     base — уже закреплённая нагрузка фаз. Возвращает [i, j]: участки [0,i) [i,j) [j,n). */
  function split3(p, base) {
    var n = p.length, pre = [0];
    for (var k = 0; k < n; k++) pre.push(pre[k] + p[k]);
    var best = null;
    for (var i = 0; i <= n; i++) for (var j = i; j <= n; j++) {
      var a1 = base[0] + pre[i], a2 = base[1] + pre[j] - pre[i], a3 = base[2] + pre[n] - pre[j];
      var m = Math.max(a1, a2, a3);
      var cnt = Math.max(i, j - i, n - j) - Math.min(i, j - i, n - j);
      if (!best || m < best.m - 1e-9 || (Math.abs(m - best.m) < 1e-9 && cnt < best.c)) best = { m: m, c: cnt, i: i, j: j };
    }
    return [best.i, best.j];
  }

  /* ------------------------------------------------------------------ структура: блоки УЗО */
  /* Разбор строк: для каждой группы — её УЗО (или null). Группа 'rcd' без УЗО перед ней — ошибка, normalize чинит. */
  function blocks(st) {
    var res = { byRow: {}, list: [], members: {} };
    var cur = null;
    st.rows.forEach(function (r) {
      if (r.t === 'u') { cur = r; res.list.push(r); res.members[r.id] = []; res.byRow[r.id] = r.id; return; }
      if (r.prot === 'rcd' && cur) { res.byRow[r.id] = cur.id; res.members[cur.id].push(r); }
      else { cur = null; res.byRow[r.id] = null; }
    });
    return res;
  }

  function normalize(st) {
    var B = st.board, is3 = B.phases === 3;
    var d0 = defaultBoard();
    ['kmType', 'xb', 'olLen', 'route', 'phaseMode'].forEach(function (k) { if (B[k] === undefined) B[k] = d0[k]; });
    B.kup = true;
    if (ROUTES.indexOf(B.route) < 0) B.route = 'Потолок';
    /* 3P-группы не могут стоять под УЗО 2P — выносим сразу за блок */
    var out = [], cur = null, pending = [];
    function closeBlock() { if (pending.length) { pending.forEach(function (g) { out.push(g); }); pending = []; } cur = null; }
    st.rows.forEach(function (r) {
      if (r.t === 'u') { closeBlock(); cur = r; out.push(r); return; }
      if (r.prot === 'rcd' && cur) {
        if (r.poles === 3 && cur.poles !== 4) { r.prot = 'dif'; pending.push(r); return; }
        out.push(r); return;
      }
      closeBlock();
      if (r.prot === 'rcd') r.prot = 'dif';
      out.push(r);
    });
    closeBlock();
    st.rows = out;
    var bl = blocks(st);
    st.rows.forEach(function (r) {
      if (r.t === 'u') {
        if (!is3) { r.poles = 2; r.phase = 'L'; }
        else if (r.poles === 4) r.phase = 'L123';
        else if (r.phase === 'L' || r.phase === 'L123' || !r.phase) r.phase = 'L1';
        return;
      }
      if (r.poles !== 3) r.poles = 1;
      if (!is3) {
        if (r.poles === 3) { r.poles = 1; r.In = stdUp(Math.max(16, r.In * 1.75), STD_IN); r.cable = null; }
        r.phase = 'L';
      } else if (r.poles === 3) r.phase = 'L123';
      else if (r.phase === 'L' || r.phase === 'L123' || !r.phase) r.phase = 'L1';
      var u = bl.byRow[r.id] ? find(st, bl.byRow[r.id]) : null;
      if (u && u.poles === 2) { r.phase = u.phase; r.lock = false; }
      if (r.prot === 'rcd') r.km = false;
      if (!B.km) r.km = false;
      if (r.cat === 'reserve') { r.p = 0; }
      /* розетки комнат: мощность «авто» (старые щиты — если стояли прежние 1,5 кВт) */
      if (r.pAuto === undefined) r.pAuto = softOk(r) && Math.abs(r.p - 1.5) < 1e-9;
      if (r.pAuto && !softOk(r)) { r.pAuto = false; if (r.cat === 'sock') r.p = SOFT.kitchen; }
      if (r.pAuto) r.p = SOFT.def;
    });
    if (is3 && B.phaseMode === 'abc') abcPhases(st);
    if (is3) fitSoft(st);
    return st;
  }

  /* Подбор мощности розеток комнат (0,5…1,5 кВт) под ровные фазы: фазы уже розданы, меняются только «авто»-значения.
     Ищем общий уровень T, к которому можно подтянуть каждую фазу в её пределах; при равном перекосе — ближе к 1 кВт. */
  function fitSoft(st) {
    var P = ['L1', 'L2', 'L3'], F = { L1: 0, L2: 0, L3: 0 }, soft = { L1: [], L2: [], L3: [] };
    st.rows.forEach(function (r) {
      if (r.t !== 'g') return;
      if (r.poles === 3) { P.forEach(function (p) { F[p] += r.p / 3; }); return; }
      if (F[r.phase] == null) return;
      if (r.pAuto) { soft[r.phase].push(r); F[r.phase] += SOFT.min; } else F[r.phase] += r.p;
    });
    var n = soft.L1.length + soft.L2.length + soft.L3.length;
    if (!n) return;
    var M = {}; P.forEach(function (p) { M[p] = F[p] + soft[p].length * (SOFT.max - SOFT.min); });
    var lo = Math.min(F.L1, F.L2, F.L3), hi = Math.max(M.L1, M.L2, M.L3), best = null;
    for (var T = lo; T <= hi + 1e-9; T += 0.05) {
      var L = {}, sum = 0;
      P.forEach(function (p) { L[p] = Math.min(M[p], Math.max(F[p], T)); sum += L[p] - F[p]; });
      var spread = Math.round((Math.max(L.L1, L.L2, L.L3) - Math.min(L.L1, L.L2, L.L3)) * 10) / 10;
      var dev = Math.abs(sum + n * SOFT.min - n * SOFT.def);
      if (!best || spread < best.spread - 1e-9 || (Math.abs(spread - best.spread) < 1e-9 && dev < best.dev - 1e-9)) best = { spread: spread, dev: dev, L: L };
    }
    P.forEach(function (p) {
      var k = soft[p].length; if (!k) return;
      var tot = Math.round((k * SOFT.min + best.L[p] - F[p]) * 10), base = Math.floor(tot / k), rem = tot - base * k;
      soft[p].forEach(function (r, i) { r.p = Math.max(SOFT.min, Math.min(SOFT.max, (base + (i < rem ? 1 : 0)) / 10)); });
    });
  }

  /* ABC подряд: так фазы раздаёт трёхфазная гребёнка (L1 L2 L3 L1 …). Цикл идёт через весь щит;
     3P-группы и закреплённые вручную фазы цикл не сдвигают; УЗО 2P берёт фазу целиком, под УЗО 4P группы идут по циклу. */
  function abcPhases(st) {
    var P = ['L1', 'L2', 'L3'], B = st.board, bl = blocks(st), load = { L1: 0, L2: 0, L3: 0 }, units = [], cur = null;
    function blk(r) { return bl.byRow[r.id] ? find(st, bl.byRow[r.id]) : null; }
    st.rows.forEach(function (r) {
      if (r.t !== 'g') return;
      var u = blk(r);
      if (r.poles === 3) { P.forEach(function (p) { load[p] += r.p / 3; }); return; }
      if (r.lock && !(u && u.poles === 2)) load[r.phase] = (load[r.phase] || 0) + r.p;
    });
    /* единицы: блок УЗО 2P (одна фаза на всё УЗО) и участки одной гребёнки (подряд, один тип аппарата, один источник) */
    st.rows.forEach(function (r) {
      if (r.t === 'u') {
        cur = null;
        if (r.poles === 2) units.push({ blk: r, P: bl.members[r.id].reduce(function (a, g) { return a + g.p; }, 0) });
        return;
      }
      var u = blk(r);
      if ((u && u.poles === 2) || r.poles === 3 || r.lock) { cur = null; return; }
      var key = (r.prot === 'dif' ? 'd' : 'a') + '|' + (u ? u.id : (r.km && B.km ? 'km' : 'src'));
      if (cur && cur.key === key) cur.rows.push(r);
      else { cur = { key: key, rows: [r] }; units.push(cur); }
    });
    units.forEach(function (un) {
      if (un.blk) {
        if (!un.blk.lock) un.blk.phase = P.slice().sort(function (a, b) { return load[a] - load[b]; })[0];
        load[un.blk.phase] += un.P;
        return;
      }
      var best = null;
      for (var rot = 0; rot < 3; rot++) {
        var t = { L1: load.L1, L2: load.L2, L3: load.L3 };
        un.rows.forEach(function (r, i) { t[P[(i + rot) % 3]] += r.p; });
        var m = Math.max(t.L1, t.L2, t.L3), q = t.L1 * t.L1 + t.L2 * t.L2 + t.L3 * t.L3;
        if (!best || m < best.m - 1e-9 || (Math.abs(m - best.m) < 1e-9 && q < best.q - 1e-9)) best = { rot: rot, m: m, q: q, t: t };
      }
      un.rows.forEach(function (r, i) { r.phase = P[(i + best.rot) % 3]; });
      load = best.t;
    });
    st.rows.forEach(function (r) { if (r.t === 'g') { var u = blk(r); if (u && u.poles === 2) r.phase = u.phase; } });
  }
  function kmAuto(B) {
    var a = num(B.area, 60), three = B.phases === 3;
    if (three) return a <= 70 ? '25-40' : a <= 100 ? '40-40' : '63-40';
    return a <= 40 ? '20-20' : a <= 70 ? '25-20' : '40-20';
  }
  function kmOf(B) {
    var key = B.kmType || kmAuto(B);
    for (var i = 0; i < KM_TYPES.length; i++) if (KM_TYPES[i].k === key) return KM_TYPES[i];
    return KM_TYPES[1];
  }
  function kmModel(B, t) {
    var tpl = KM_MODEL[B.brand] || KM_MODEL.abb;
    return tpl.replace('{K}', t.k).replace('{I}', t.I).replace('{C}', t.c);
  }
  /* Этажный щит: настройки fs* (пусто — авто). Селективность: автомат после счётчика на ступень больше вводного квартиры,
     УЗО на ступень больше автомата, рубильник/автомат перед счётчиком на ступень больше; при УЗО 100 мА в квартире — 300 мА. */
  function nextAbove(v, list) { for (var i = 0; i < list.length; i++) if (list[i] > v) return list[i]; return list[list.length - 1]; }
  function fsOf(B) {
    var is3 = B.phases === 3, inA = B.inA;
    var post = ['av', 'dif', 'avrcd'].indexOf(B.fsPost) >= 0 ? B.fsPost : (is3 ? 'dif' : 'av');
    var a = { post: is3 ? 'dif' : 'av' };
    a.postIn = nextAbove(inA, FS_BRK);
    var postIn = B.fsPostIn || a.postIn;
    a.rcdIn = nextAbove(postIn, FS_RCD);
    var rcdIn = post === 'avrcd' ? (B.fsRcdIn || a.rcdIn) : null;
    a.idn = B.fire ? 300 : 100;
    var idn = post !== 'av' ? (B.fsIdn || a.idn) : null;
    var pre = B.fsPre === 'qf' ? 'qf' : 'qs';
    a.preIn = nextAbove(postIn, pre === 'qs' ? FS_QS : FS_BRK);
    var preIn = B.fsPreIn || a.preIn;
    var mt = FS_METERS[is3 ? 3 : 1];
    a.mark = B.mark || 'ВВГнг(А)-LS';
    var mark = (B.fsMark && String(B.fsMark).trim()) || a.mark;
    var al = /^[АA]/.test(mark);
    a.sec = al ? (inA <= 40 ? 16 : inA <= 63 ? 25 : 35) : (inA <= 25 ? 6 : inA <= 40 ? 10 : 16);
    var sec = B.fsCable || a.sec, cores = is3 ? 5 : 3;
    var iz = (al ? (is3 ? IZA3 : IZA1) : (is3 ? IZ3 : IZ1))[sec] || null;
    var meterSpec = (B.fsMeterSpec && String(B.fsMeterSpec).trim()) || mt[1];
    var mm = /(\d+)\s*[-–]\s*(\d+)\s*[АA]/.exec(meterSpec), meterMax = mm ? +mm[2] : null;
    return { show: !B.fsHide, pre: pre, preIn: preIn, meter: (B.fsMeter && String(B.fsMeter).trim()) || mt[0], meterSpec: meterSpec, meterMax: meterMax,
      post: post, postIn: postIn, rcdIn: rcdIn, idn: idn, mark: mark, al: al, sec: sec, cores: cores, iz: iz,
      cable: mark + ' ' + cores + '×' + secStr(sec), auto: a, meterAuto: mt };
  }
  function fsWarn(B, f) {
    var w = [];
    if (f.postIn <= B.inA) w.push('Этажный щит: автомат ' + f.postIn + ' А не больше вводного квартиры ' + B.inA + ' А — нет селективности');
    if (f.post === 'avrcd' && f.rcdIn <= f.postIn) w.push('Этажный щит: УЗО ' + f.rcdIn + ' А должно быть на ступень больше автомата ' + f.postIn + ' А');
    if (f.pre === 'qf' && f.preIn <= f.postIn) w.push('Этажный щит: автомат перед счётчиком ' + f.preIn + ' А должен быть больше автомата после счётчика ' + f.postIn + ' А');
    if (f.pre === 'qs' && f.preIn < f.postIn) w.push('Этажный щит: рубильник ' + f.preIn + ' А меньше автомата ' + f.postIn + ' А');
    if (f.post !== 'av' && B.fire && f.idn <= 100) w.push('Этажный щит: в квартире УЗО 100 мА — для селективности по утечке в этажном щите нужно 300 мА');
    if (f.iz != null && f.iz < f.postIn) w.push('Вводной кабель ' + f.cable + ' допускает ' + f.iz + ' А — меньше автомата этажного щита ' + f.postIn + ' А (ПУЭ, табл. ' + (f.al ? '1.3.7' : '1.3.6') + ')');
    if (f.meterMax != null && f.meterMax < f.postIn) w.push('Счётчик до ' + f.meterMax + ' А, а автомат этажного щита ' + f.postIn + ' А');
    return w;
  }

  /* реальный корпус: наименьший с запасом 20 %, иначе наименьший, куда всё помещается */
  function pickBox(B, used, flowRows) {
    var W = B.railW || 18, list = (B.brand === 'abb' || true) ? BOXES[W] : null;
    var res = { W: W, rows: Math.max(flowRows, Math.ceil(used * 1.2 / W)), box: null, reserveOk: true };
    if (!list) return res;
    var withRes = list.filter(function (x) { return x.rows >= flowRows && x.rows * W >= used * 1.2; });
    var fit = list.filter(function (x) { return x.rows >= flowRows && x.rows * W >= used; });
    var pick = withRes[0] || fit[0] || null;
    if (pick) { res.box = pick; res.rows = pick.rows; res.reserveOk = !!withRes[0]; }
    return res;
  }

  function find(st, id) { for (var i = 0; i < st.rows.length; i++) if (st.rows[i].id === id) return st.rows[i]; return null; }
  function indexOf(st, id) { for (var i = 0; i < st.rows.length; i++) if (st.rows[i].id === id) return i; return -1; }

  /* ------------------------------------------------------------------ расчёт всего, что видно в таблице */
  function sectionOf(cable) {
    if (!cable) return null;
    var m = String(cable).match(/(\d+)\s*[×xх*]\s*(\d+(?:[.,]\d+)?)/i);
    return m ? { cores: +m[1], S: num(m[2], null) } : null;
  }
  function autoCable(g) {
    var c = catOf(g);
    if (c.noCable) return null;
    if (g.cat === 'hob' && g.poles === 3) return '5×4';
    var cores = g.poles === 3 ? 5 : 3;
    if (c.light) return cableStr(cores, 1.5);
    var S = (g.poles === 3 ? CABLE3 : CABLE1)[g.In];
    if (!S) S = g.In <= 10 ? 1.5 : g.In <= 20 ? 2.5 : g.In <= 25 ? 4 : g.In <= 32 ? 6 : g.In <= 50 ? 10 : 16;
    return cableStr(cores, S);
  }
  function autoLen(g, area) {
    var c = catOf(g);
    if (c.noCable) return 0;
    var s = Math.sqrt(Math.max(num(area, 50), 15));
    return Math.ceil((c.len[1] + c.len[0] * s) * 1.1);
  }
  function groupIr(g) {
    var c = catOf(g).cos;
    return g.poles === 3 ? g.p / (Math.sqrt(3) * 0.4 * c) : g.p / (0.23 * c);
  }
  function izOf(g, S) {
    if (S == null) return null;
    if (g.poles === 3) { var v = IZ3[S]; return v ? round(v * 0.92, 1) : null; }
    return IZ1[S] || null;
  }
  function brandModel(B, kind, In, idn, type) {
    var b = BRANDS[B.brand] || BRANDS.abb;
    var m = fmtModel(b[kind], In);
    if ((kind === 'dif' || kind === 'dif4' || kind === 'rcd2' || kind === 'rcd4') && idn && idn !== 30) {
      m = m.replace('/0,03', '/' + String(idn / 1000).replace('.', ',')).replace('A30', 'A' + idn).replace('30мА', idn + 'мА');
    }
    if ((kind === 'rcd2' || kind === 'rcd4') && type === 'AC') m = m.replace(/ A-/, ' AC-');
    return m;
  }

  function derive(st) {
    var B = st.board, is3 = B.phases === 3, b = BRANDS[B.brand] || BRANDS.abb;
    var bl = blocks(st);
    var cnt = { QF: 0, QFD: 0, QD: 0, KV: 0, KM: 0, XT: 0 };
    function ref(p) { cnt[p]++; return p + cnt[p]; }
    var fixed = [];
    var inPoles = is3 ? (B.inPoles === 4 ? 4 : 3) : 2;
    fixed.push({ id: 'in', kind: 'in', name: 'Вводной автомат', ref: ref('QF'), w: inPoles, In: B.inA, model: fmtModel(is3 ? (inPoles === 4 ? b.a4 : b.a3) : b.a2, B.inA), poles: inPoles });
    if (B.relay) {
      if (is3) ['L1', 'L2', 'L3'].forEach(function (p) { fixed.push({ id: 'rn' + p, kind: 'rn', name: 'Реле напряжения ' + p, ref: ref('KV'), w: 2, In: 63, model: 'Welrok VIP-63', phase: p }); });
      else fixed.push({ id: 'rn1', kind: 'rn', name: 'Реле напряжения', ref: ref('KV'), w: 2, In: 63, model: 'Welrok VIP-63' });
    }
    if (B.fire) {
      var fi = stdUp(Math.max(B.inA, 40), [40, 63, 80, 100]);
      fixed.push({ id: 'fire', kind: 'fire', name: 'УЗО противопожарное 100 мА', ref: ref('QD'), w: is3 ? 4 : 2, In: fi, model: fmtModel(is3 ? b.fire4 : b.fire2, fi) });
    }
    if (B.xb) fixed.push({ id: 'xb', kind: 'xb', name: 'Кросс-модуль', ref: ref('XT'), w: is3 ? 5 : 3, model: is3 ? '4П, 125 А' : '2П, 125 А' });
    var useKm = B.km && st.rows.some(function (r) { return r.t === 'g' && r.km; });
    if (useKm) {
      fixed.push({ id: 'c2', kind: 'a1', name: 'Защита катушки КМ', ref: ref('QF'), w: 1, In: 2, model: fmtModel(b.a1, 2) });
      var kt = kmOf(B);
      fixed.push({ id: 'km', kind: 'km', name: 'Контактор «мастер-выключатель»', ref: ref('KM'), w: kt.w, model: kmModel(B, kt), kmType: kt.k, kmAuto: !B.kmType });
    }

    var serN = { 'ЛО': 0, 'ЛАО': 0, 'ЛС': 0 };
    var rows = [], byId = {};
    var ph = { L1: 0, L2: 0, L3: 0 }, phI = { L1: 0, L2: 0, L3: 0 };
    var sumP = 0, sumS = 0, nG = 0, counts = { av: 0, dif: 0, rcd: 0, u: 0 }, serCount = { 'ЛО': 0, 'ЛАО': 0, 'ЛС': 0 };
    var modules = fixed.reduce(function (a, d) { return a + d.w; }, 0);
    st.rows.forEach(function (r) {
      var v = clone(r);
      if (r.t === 'u') {
        v.ref = ref('QD');
        v.w = r.poles === 4 ? 4 : 2;
        v.model = brandModel(B, r.poles === 4 ? 'rcd4' : 'rcd2', r.In, r.idn, r.type);
        v.members = bl.members[r.id].map(function (g) { return g.id; });
        v.sumIr = 0; v.sumP = 0; v.maxIn = 0; v.warn = [];
        counts.u++;
      } else {
        var c = catOf(r);
        nG++;
        v.ser = c.ser; serN[c.ser]++; serCount[c.ser]++;
        v.num = c.ser + '-' + serN[c.ser];
        v.rcd = bl.byRow[r.id];
        var kind;
        if (r.prot === 'dif') { kind = r.poles === 3 ? 'dif4' : 'dif'; v.ref = ref('QFD'); v.w = r.poles === 3 ? 4 : 2; }
        else { kind = r.poles === 3 ? 'a3' : 'a1'; v.ref = ref('QF'); v.w = r.poles === 3 ? 3 : 1; }
        counts[r.prot === 'rcd' ? 'rcd' : r.prot]++;
        v.model = r.prot === 'dif' ? brandModel(B, kind, r.In, r.idn) : fmtModel(b[kind], r.In);
        v.cos = c.cos;
        v.Ir = groupIr(r);
        v.cableAuto = autoCable(r);
        v.cableEff = c.noCable ? null : (r.cable || v.cableAuto);
        v.lenAuto = autoLen(r, B.area);
        v.lenEff = c.noCable ? 0 : (r.len != null ? r.len : v.lenAuto);
        var sec = sectionOf(v.cableEff);
        v.S = sec ? sec.S : null;
        v.Iz = sec ? izOf(r, sec.S) : null;
        v.dU = (sec && sec.S && r.p > 0) ? r.p * v.lenEff / ((r.poles === 3 ? DU_C3 : DU_C1) * sec.S) : (c.noCable ? null : 0);
        v.warn = [];
        if (!c.noCable && v.Iz != null && r.In > v.Iz + 1e-9) v.warn.push({ f: 'cable', t: 'Кабель ' + v.cableEff + ' допускает ' + fmt(v.Iz) + ' А — меньше номинала ' + r.In + ' А (ПУЭ, табл. 1.3.6)' });
        if (v.Ir > r.In + 1e-9) v.warn.push({ f: 'In', t: 'Расчётный ток ' + fmt(v.Ir, 1) + ' А больше номинала ' + r.In + ' А' });
        if (r.In >= B.inA) v.warn.push({ f: 'In', t: 'Номинал ' + r.In + ' А не меньше вводного ' + B.inA + ' А — нет селективности' });
        if (v.dU != null && v.dU > DU_WARN) v.warn.push({ f: 'dU', t: 'Потери напряжения ' + fmt(v.dU, 1) + ' % — больше ' + DU_WARN + ' %' });
        if (is3 && r.poles === 3 && r.p > 0) { ph.L1 += r.p / 3; ph.L2 += r.p / 3; ph.L3 += r.p / 3; phI.L1 += v.Ir; phI.L2 += v.Ir; phI.L3 += v.Ir; }
        else if (is3 && ph[r.phase] != null) { ph[r.phase] += r.p; phI[r.phase] += v.Ir; }
        sumP += r.p; sumS += r.p / c.cos;
        if (v.rcd) { var u = byId[v.rcd]; u.sumIr += v.Ir; u.sumP += r.p; u.maxIn = Math.max(u.maxIn, r.In); }
      }
      modules += v.w;
      rows.push(v); byId[v.id] = v;
    });
    rows.forEach(function (v) {
      if (v.t !== 'u') return;
      if (!v.members.length) v.warn.push({ f: 'empty', t: 'Под этим УЗО нет групп' });
      if (v.sumIr > v.In + 1e-9) v.warn.push({ f: 'In', t: 'Суммарный расчётный ток групп ' + fmt(v.sumIr, 1) + ' А больше номинала УЗО ' + v.In + ' А' });
      if (v.In < B.inA) v.warn.push({ f: 'In', t: 'Номинал УЗО ' + v.In + ' А меньше вводного ' + B.inA + ' А — УЗО не защищено от перегрузки' });
      if (is3 && v.poles === 2) { /* нагрузка уже учтена по группам */ }
    });
    var cosAvg = sumS > 0 ? round(sumP / sumS, 2) : 0.9;
    /* Kс: авто — наибольший, при котором щит укладывается в выделенную мощность и в вводной автомат (по самой нагруженной фазе) */
    var PbyIn = is3 ? Math.sqrt(3) * 0.4 * B.inA * cosAvg : 0.23 * B.inA * cosAvg;
    var Pall = num(B.pAllowed, null);
    var Pcap = (Pall != null && Pall > 0) ? Math.min(Pall, PbyIn) : PbyIn;
    var kcFit = 1;
    if (sumP > 0) kcFit = Pcap / sumP;
    var mxP = is3 ? Math.max(ph.L1, ph.L2, ph.L3) : sumP;
    if (mxP > 0) kcFit = Math.min(kcFit, 0.23 * B.inA * cosAvg / mxP);
    kcFit = Math.max(0.05, Math.min(1, Math.floor(kcFit * 100 + 1e-9) / 100));
    var kcAuto = B.kcMode !== 'manual';
    var kc = kcAuto ? kcFit : num(B.kc, 0.4);
    var Pr = sumP * kc;
    var Ir = is3 ? Pr / (Math.sqrt(3) * 0.4 * cosAvg) : Pr / (0.23 * cosAvg);
    var phases = null, imb = null;
    if (is3) {
      phases = ['L1', 'L2', 'L3'].map(function (p) { return { ph: p, P: ph[p], Pr: ph[p] * kc, Ir: ph[p] * kc / (0.23 * cosAvg) }; });
      var mx = Math.max(ph.L1, ph.L2, ph.L3), mn = Math.min(ph.L1, ph.L2, ph.L3);
      imb = mx > 0 ? (mx - mn) / mx * 100 : 0;
      Ir = Math.max(phases[0].Ir, phases[1].Ir, phases[2].Ir);
    }
    /* рейки: по порядку, аппарат не делится между рейками, запас 20 % */
    var W = B.railW || 18, railsN = 0, used = 0;
    fixed.concat(rows).forEach(function (d) { if (railsN === 0 || used + d.w > W) { railsN++; used = 0; } used += d.w; });
    var bx = pickBox(B, modules, railsN);
    railsN = bx.rows;
    var warn = [];
    if (Ir > B.inA + 0.05) warn.push('Расчётный ток ' + fmt(Ir, 1) + ' А больше вводного автомата ' + B.inA + ' А — уменьшите Kс или включите подбор «авто»');
    if (Pall != null && Pall > 0 && Pr > Pall + 0.05) warn.push('Расчётная мощность ' + fmt(Pr, 1) + ' кВт больше выделенной ' + fmt(Pall, 1) + ' кВт');
    var kcLevel = kc < KC_BAD - 1e-9 ? 'bad' : kc < KC_LOW - 1e-9 ? 'low' : 'ok';
    if (kcLevel === 'bad') warn.push('Kс ' + fmt(kc, 2) + ' — критично мало: щит рассчитан почти на одновременную работу лишь пятой части нагрузки. Нужно реле приоритета (отключение части нагрузки) или больше мощности по ТУ');
    else if (kcLevel === 'low') warn.push('Kс ' + fmt(kc, 2) + ' — низкий: рекомендуется реле приоритета, чтобы при включении мощной нагрузки не срабатывал вводной');
    if (is3 && imb > IMB_WARN) warn.push('Перекос фаз ' + fmt(imb, 0) + ' %');
    if (BOXES[W] && !bx.box) warn.push('Нет корпуса ABB на ' + modules + ' мод. при ряде по ' + W + ' — ' + (W === 12 ? 'возьмите ряд 18 модулей' : 'щит не помещается в Mistral41F 72M'));
    else if (bx.box && !bx.reserveOk) warn.push('Корпус ' + bx.box.n + ': запас меньше 20 %');
    if (!BOXES[W]) warn.push('Для ряда ' + W + ' модулей готового корпуса ABB нет — выберите 12 (UK600) или 18 (Mistral41F)');
    var fs = fsOf(B);
    if (fs.show) warn = warn.concat(fsWarn(B, fs));
    var nWarn = rows.reduce(function (a, v) { return a + (v.warn.length ? 1 : 0); }, 0);
    return {
      board: B, is3: is3, fixed: fixed, rows: rows, byId: byId, useKm: useKm, fs: fs,
      tot: { P: sumP, kc: kc, kcAuto: kcAuto, kcFit: kcFit, kcLevel: kcLevel, Pcap: Pcap, PbyIn: PbyIn, Pall: Pall, Pr: Pr, cos: cosAvg, Ir: Ir, phases: phases, imb: imb, modules: modules, rails: railsN, cap: railsN * W, box: bx.box, boxW: W, groups: nG, counts: counts, ser: serCount, warn: warn, nWarn: nWarn }
    };
  }

  /* ------------------------------------------------------------------ правки */
  /* Перенос строк. ids — что тащим (УЗО тянет свои группы). anchor: {after: id|null, into: rcdId|null}.
     after — строка, после которой встаёт перенос (null — в начало); into — УЗО, под которое встаёт перенос. */
  function moveRows(st, ids, anchor) {
    var bl = blocks(st), take = {}, moving = [];
    ids.forEach(function (id) {
      var r = find(st, id); if (!r) return;
      take[id] = 1;
      if (r.t === 'u') bl.members[id].forEach(function (g) { take[g.id] = 1; });
    });
    var hasRcd = ids.some(function (id) { var r = find(st, id); return r && r.t === 'u'; });
    st.rows.forEach(function (r) { if (take[r.id]) moving.push(r); });
    if (!moving.length) return st;
    var rest = st.rows.filter(function (r) { return !take[r.id]; });
    var into = hasRcd ? null : (anchor.into || null);
    /* куда вставлять */
    var pos;
    if (anchor.after == null) pos = 0;
    else {
      var i = -1;
      for (var k = 0; k < rest.length; k++) if (rest[k].id === anchor.after) { i = k; break; }
      if (i < 0) pos = rest.length;
      else {
        pos = i + 1;
        if (!into) {
          /* вне блока: если after — УЗО или группа под УЗО, встаём за весь блок */
          var a = rest[i];
          if (a.t === 'u' || a.prot === 'rcd') { while (pos < rest.length && rest[pos].t === 'g' && rest[pos].prot === 'rcd') pos++; }
        }
      }
    }
    if (!hasRcd) {
      moving.forEach(function (g) {
        if (into) { if (g.prot !== 'rcd') { g.prot = 'rcd'; g.km = false; } }
        else if (g.prot === 'rcd') g.prot = catOf(g).prot === 'av' ? 'av' : 'dif';
      });
    }
    /* группа, вставленная вне блока, не должна разорвать следующий блок: если следом идут группы под УЗО без УЗО — normalize снимет; поэтому вне блока вставляем только перед УЗО или свободной группой */
    if (!into) { while (pos < rest.length && rest[pos].t === 'g' && rest[pos].prot === 'rcd') pos++; }
    st.rows = rest.slice(0, pos).concat(moving, rest.slice(pos));
    return normalize(st);
  }

  /* Сдвиг выделенных на одну позицию (dir = -1 вверх/влево, +1 вниз/вправо) — по видимым позициям */
  function slots(st) {
    /* видимый порядок: шапка УЗО, группы блока, «хвост» блока; щели между ними с признаком into */
    var list = [], bl = blocks(st);
    st.rows.forEach(function (r, i) {
      if (r.t === 'u') { list.push({ kind: 'u', id: r.id }); return; }
      list.push({ kind: 'g', id: r.id, rcd: bl.byRow[r.id] });
      var nx = st.rows[i + 1];
      if (bl.byRow[r.id] && !(nx && nx.t === 'g' && nx.prot === 'rcd')) list.push({ kind: 'end', id: bl.byRow[r.id] });
    });
    /* блок УЗО без групп — тоже хвост */
    var out = [];
    list.forEach(function (it, i) {
      out.push(it);
      if (it.kind === 'u' && !(list[i + 1] && list[i + 1].kind === 'g' && list[i + 1].rcd === it.id)) out.push({ kind: 'end', id: it.id });
    });
    return out;
  }
  function nudge(st, ids, dir) {
    var sel = {}; ids.forEach(function (id) { sel[id] = 1; });
    var isBlock = ids.length === 1 && find(st, ids[0]) && find(st, ids[0]).t === 'u';
    var bl = blocks(st);
    if (isBlock) {
      var uid = ids[0];
      /* позиции верхнего уровня: свободные группы и блоки */
      var top = [];
      st.rows.forEach(function (r) { if (r.t === 'u' || !bl.byRow[r.id]) top.push(r.id); });
      var k = top.indexOf(uid), j = k + dir;
      if (j < 0 || j >= top.length) return st;
      if (dir < 0) return moveRows(st, [uid], { after: j - 1 >= 0 ? lastOfTop(st, bl, top[j - 1]) : null, into: null });
      return moveRows(st, [uid], { after: lastOfTop(st, bl, top[j]), into: null });
    }
    var vis = slots(st).filter(function (it) { return !(it.kind === 'g' && sel[it.id]); });
    /* позиция первой (dir<0) или последней (dir>0) выделенной группы в исходном видимом списке */
    var full = slots(st), idxs = [];
    full.forEach(function (it, i) { if (it.kind === 'g' && sel[it.id]) idxs.push(i); });
    if (!idxs.length) return st;
    /* щель, где сейчас стоит перенос: индекс в vis перед первым выделенным */
    var before = 0;
    for (var i = 0; i < idxs[0]; i++) if (!(full[i].kind === 'g' && sel[full[i].id])) before++;
    var gap = before + dir; /* щель: перед vis[gap] */
    if (gap < 0 || gap > vis.length) return st;
    /* шапка УЗО не может быть «после» щели внутри — щель перед шапкой означает вне блока */
    return moveRows(st, ids, gapAnchor(vis, gap));
  }
  function lastOfTop(st, bl, id) {
    var r = find(st, id);
    if (r.t === 'u' && bl.members[id].length) return bl.members[id][bl.members[id].length - 1].id;
    return id;
  }
  /* щель перед vis[gap] → anchor */
  function gapAnchor(vis, gap) {
    var prev = gap > 0 ? vis[gap - 1] : null;
    if (!prev) return { after: null, into: null };
    if (prev.kind === 'u') return { after: prev.id, into: prev.id };
    if (prev.kind === 'g') return { after: prev.id, into: prev.rcd || null };
    /* prev — хвост блока: после последней группы блока, вне блока */
    for (var i = gap - 2; i >= 0; i--) {
      if (vis[i].kind === 'g' && vis[i].rcd === prev.id) return { after: vis[i].id, into: null };
      if (vis[i].kind === 'u' && vis[i].id === prev.id) return { after: vis[i].id, into: null };
    }
    return { after: null, into: null };
  }

  function sameDefault(a, b) { return Math.abs(num(a, -1) - num(b, -2)) < 1e-9; }

  function setField(st, id, field, value) {
    var r = find(st, id); if (!r) return st;
    var B = st.board;
    if (r.t === 'u') {
      if (field === 'In' || field === 'idn' || field === 'poles') r[field] = +value;
      else if (field === 'phase') { r.phase = value; r.lock = true; }
      else r[field] = value;
      return normalize(st);
    }
    var old = catOf(r);
    switch (field) {
      case 'cat': {
        var nc = CAT[value] || CAT.other;
        if (r.name === old.label || !r.name) r.name = nc.label;
        else if (r.name.indexOf(old.label + ': ') === 0) r.name = nc.label + ': ' + r.name.slice(old.label.length + 2);
        if (r.pAuto || sameDefault(r.p, old.p)) r.p = nc.p;
        r.pAuto = value === 'sock' && !isKitchen(r);
        if (r.In === old.In) r.In = nc.In;
        if (r.prot !== 'rcd' && r.prot === old.prot) r.prot = nc.prot;
        r.cat = value;
        r.km = !!(nc.light && value === 'light' && B.km && r.prot !== 'rcd');
        if (nc.noCable) { r.cable = null; r.len = null; }
        break;
      }
      case 'prot': {
        if (value === 'av' || value === 'dif') {
          var wasIn = r.prot === 'rcd';
          r.prot = value;
          if (wasIn) {
            /* вынести за блок */
            var bl = blocks(st), uid = null, i0 = indexOf(st, id);
            for (var i = i0 - 1; i >= 0; i--) if (st.rows[i].t === 'u') { uid = st.rows[i].id; break; }
            var mem = uid ? bl.members[uid] : [];
            var after = mem.length ? mem[mem.length - 1].id : uid;
            if (after === id) after = mem.length > 1 ? mem[mem.length - 2].id : uid;
            r.prot = 'rcd';
            moveRows(st, [id], { after: after, into: null });
            find(st, id).prot = value;
            return normalize(st);
          }
          break;
        }
        if (value === 'rcd:new') {
          var i1 = indexOf(st, id);
          var u = mkRcd(st, { In: Math.max(40, stdUp(B.inA, RCD_IN)), phase: r.phase === 'L123' ? 'L1' : r.phase, poles: r.poles === 3 ? 4 : 2 });
          r.prot = 'rcd'; r.km = false;
          st.rows.splice(i1, 0, u);
          return normalize(st);
        }
        if (value.indexOf('rcd:') === 0) {
          var rid = value.slice(4), bl2 = blocks(st), m2 = bl2.members[rid] || [];
          var aft = m2.length ? m2[m2.length - 1].id : rid;
          if (aft === id) return st;
          return moveRows(st, [id], { after: aft, into: rid });
        }
        break;
      }
      case 'poles': {
        var np = +value === 3 ? 3 : 1;
        if (np === r.poles) break;
        if (np === 3) { r.poles = 3; r.phase = 'L123'; r.In = stdUp(Math.max(10, r.In / 1.75), STD_IN); }
        else { r.poles = 1; r.phase = 'L1'; r.In = stdUp(Math.max(16, r.In * 1.75), STD_IN); }
        r.cable = null;
        break;
      }
      case 'In': r.In = +value; break;
      case 'idn': r.idn = +value; break;
      case 'p': {
        if ((value === '' || value == null) && softOk(r)) { r.pAuto = true; break; }
        var pv = num(value, null); if (pv == null) break;
        r.p = Math.max(0, pv); r.pAuto = false; break;
      }
      case 'phase': r.phase = value; r.lock = true; break;
      case 'lock': r.lock = !!value; break;
      case 'cable': r.cable = value || null; break;
      case 'len': { var L = num(value, null); r.len = (L == null || L < 0) ? null : round(L, 1); break; }
      case 'km': r.km = !!value; break;
      case 'name': r.name = String(value).trim() || old.label; break;
      default: r[field] = value;
    }
    return normalize(st);
  }

  function setBoard(st, field, value) {
    var B = st.board;
    var wasPh = B.phases;
    if (field === 'phases' || field === 'inA' || field === 'inPoles' || field === 'railW') B[field] = +value;
    else if (field === 'area') B[field] = num(value, B[field]);
    else if (field === 'kmType') B.kmType = value || null;
    else if (field === 'xb' || field === 'olLen' || field === 'fsHide') B[field] = !!value;
    else if (/^fs(PreIn|PostIn|RcdIn|Idn|Cable)$/.test(field)) { var fv = num(value, null); B[field] = (fv != null && fv > 0) ? fv : null; }
    else if (/^fs(Pre|Post|Meter|MeterSpec|Mark)$/.test(field)) { var sv = String(value == null ? '' : value).trim(); B[field] = sv || null; }
    else if (field === 'fsReset') { ['fsPre', 'fsPreIn', 'fsMeter', 'fsMeterSpec', 'fsPost', 'fsPostIn', 'fsRcdIn', 'fsIdn', 'fsMark', 'fsCable'].forEach(function (k) { B[k] = null; }); }
    else if (field === 'kc') { var k = num(value, null); if (k != null && k > 0) { B.kc = Math.min(1, round(k, 2)); B.kcMode = 'manual'; } }
    else if (field === 'pAllowed') { var pa = num(value, null); B.pAllowed = (pa != null && pa > 0) ? round(pa, 1) : null; }
    else B[field] = value;
    if (field === 'km' && value) {
      st.rows.forEach(function (r) { if (r.t === 'g' && r.cat === 'light' && r.prot !== 'rcd') r.km = true; });
    }
    if (field === 'phases' && wasPh !== B.phases && B.phases === 3) {
      st.rows.forEach(function (r) {
        r.lock = false;
        if (r.t === 'g' && r.poles !== 3 && (r.cat === 'hob' || (r.cat === 'heat' && /проточн/i.test(r.name)))) {
          r.poles = 3; r.In = 16; r.cable = null; r.phase = 'L123';
          if (r.cat === 'heat' && r.prot === 'rcd') r.prot = 'dif';
        }
      });
      B.phaseMode = 'abc';
    }
    normalize(st);
    return st;
  }

  /* куда ставить новую строку: после выделенной (внутри блока, если она там) или в конец */
  function anchorAfter(st, afterId) {
    if (!afterId) return { after: st.rows.length ? st.rows[st.rows.length - 1].id : null, into: null, end: true };
    var r = find(st, afterId); if (!r) return { after: null, into: null };
    var bl = blocks(st);
    if (r.t === 'u') return { after: r.id, into: r.id };
    return { after: r.id, into: bl.byRow[r.id] || null };
  }

  function addGroup(st, cat, afterId) {
    var c = CAT[cat] || CAT.other;
    var g = mkGroup(st, cat, { km: !!(cat === 'light' && st.board.km) });
    g.phase = st.board.phases === 3 ? leastPhase(st) : 'L';
    if (st.board.phases === 3 && cat === 'hob') { g.poles = 3; g.In = 16; g.phase = 'L123'; }
    var a = anchorAfter(st, afterId);
    if (a.end) {
      /* в конец: вне блоков */
      st.rows.push(g);
      if (g.prot === 'rcd') g.prot = 'dif';
      normalize(st);
      return { st: st, id: g.id };
    }
    st.rows.push(g);
    if (a.into && c.prot !== 'av') { g.prot = 'rcd'; g.km = false; }
    moveRows(st, [g.id], { after: a.after, into: (a.into && c.prot !== 'av') ? a.into : null });
    return { st: st, id: g.id };
  }

  function leastPhase(st) {
    var d = derive(st);
    if (!d.tot.phases) return 'L';
    var ps = d.tot.phases.slice().sort(function (a, b) { return a.P - b.P; });
    return ps[0].ph;
  }

  function addRcd(st, afterId) {
    var B = st.board;
    var u = mkRcd(st, { In: Math.max(40, stdUp(B.inA, RCD_IN)), phase: B.phases === 3 ? leastPhase(st) : 'L' });
    st.rows.push(u);
    var a = anchorAfter(st, afterId);
    if (a.end) { normalize(st); return { st: st, id: u.id }; }
    moveRows(st, [u.id], { after: a.after, into: null });
    return { st: st, id: u.id };
  }

  /* выделенные группы — под новое УЗО, на месте первой из них */
  function wrapRcd(st, ids) {
    var gs = st.rows.filter(function (r) { return r.t === 'g' && ids.indexOf(r.id) >= 0; });
    if (!gs.length) return { st: st, id: null };
    var B = st.board;
    var any3 = gs.some(function (g) { return g.poles === 3; });
    var phs = {}; gs.forEach(function (g) { phs[g.phase] = 1; });
    var four = B.phases === 3 && (any3 || Object.keys(phs).length > 1);
    var first = indexOf(st, gs[0].id);
    var u = mkRcd(st, { In: Math.max(40, stdUp(B.inA, RCD_IN)), poles: four ? 4 : 2, phase: four ? 'L123' : (gs[0].phase || 'L1') });
    /* убрать выбранные, вставить УЗО + их на место первой */
    var take = {}; gs.forEach(function (g) { take[g.id] = 1; });
    var before = st.rows.slice(0, first).filter(function (r) { return !take[r.id]; });
    var after = st.rows.slice(first).filter(function (r) { return !take[r.id]; });
    gs.forEach(function (g) { g.prot = 'rcd'; g.km = false; });
    /* если место первой оказалось внутри чужого блока — встаём за этот блок */
    var tail = [];
    while (after.length && after[0].t === 'g' && after[0].prot === 'rcd' && before.length && (before[before.length - 1].t === 'u' || before[before.length - 1].prot === 'rcd')) tail.push(after.shift());
    st.rows = before.concat(tail, [u], gs, after);
    normalize(st);
    return { st: st, id: u.id };
  }

  function removeRows(st, ids) {
    var del = {}; ids.forEach(function (id) { del[id] = 1; });
    var bl = blocks(st);
    st.rows.forEach(function (r) {
      if (r.t === 'u' && del[r.id]) bl.members[r.id].forEach(function (g) { if (!del[g.id]) g.prot = catOf(g).prot === 'av' ? 'av' : 'dif'; });
    });
    st.rows = st.rows.filter(function (r) { return !del[r.id]; });
    return normalize(st);
  }

  function duplicate(st, ids) {
    var out = [], made = [];
    st.rows.forEach(function (r) {
      out.push(r);
      if (r.t === 'g' && ids.indexOf(r.id) >= 0) {
        var c = clone(r); c.id = newId(st, 'g'); c.key = null; out.push(c); made.push(c.id);
      }
    });
    st.rows = out;
    normalize(st);
    return { st: st, ids: made };
  }

  /* ------------------------------------------------------------------ фазы */
  /* mode 'seq' — участками подряд (порядок не меняется, соседи одной фазы садятся на гребёнку);
     mode 'power' — по мощности: крупные первыми в наименее загруженную фазу. Закреплённые не трогаем. */
  function balance(st, mode) {
    var B = st.board;
    if (B.phases !== 3) return st;
    if (mode === 'abc') { B.phaseMode = 'abc'; return normalize(st); }
    B.phaseMode = 'manual';
    normalize(st);
    st.rows.forEach(function (r) { if (r.pAuto) r.p = SOFT.def; });   /* фазы раздаём по типовой мощности, подгонка — после */
    var bl = blocks(st);
    var base = { L1: 0, L2: 0, L3: 0 };
    var lightU = [], restU = [];
    st.rows.forEach(function (r) {
      if (r.t === 'u') {
        if (r.poles === 4) return;
        var P = bl.members[r.id].reduce(function (a, g) { return a + g.p; }, 0);
        var unit = { rows: [r], p: P, light: false };
        if (r.lock) base[r.phase] += P; else restU.push(unit);
        return;
      }
      var inBlock = bl.byRow[r.id] ? find(st, bl.byRow[r.id]) : null;
      if (inBlock && inBlock.poles === 2) return; /* фаза у УЗО */
      if (r.poles === 3) { base.L1 += r.p / 3; base.L2 += r.p / 3; base.L3 += r.p / 3; return; }
      if (r.lock) { base[r.phase] = (base[r.phase] || 0) + r.p; return; }
      var u2 = { rows: [r], p: r.p, light: isLightCat(r.cat) };
      (u2.light && mode === 'seq' ? lightU : restU).push(u2);
    });
    var P = ['L1', 'L2', 'L3'];
    function setPh(unit, p) { unit.rows.forEach(function (x) { x.phase = p; }); }
    if (mode === 'power') {
      restU.slice().sort(function (a, b) { return b.p - a.p; }).forEach(function (u) {
        var best = P.slice().sort(function (a, b) { return base[a] - base[b]; })[0];
        setPh(u, best); base[best] += u.p;
      });
    } else {
      lightU.forEach(function (u, k) { var p = P[Math.min(2, Math.floor(k * 3 / Math.max(lightU.length, 1)))]; setPh(u, p); base[p] += u.p; });
      var cut = split3(restU.map(function (u) { return u.p; }), [base.L1, base.L2, base.L3]);
      restU.forEach(function (u, k) { setPh(u, k < cut[0] ? 'L1' : k < cut[1] ? 'L2' : 'L3'); });
    }
    return normalize(st);
  }

  /* ------------------------------------------------------------------ экспорт */
  root.GIPM = {
    BRANDS: BRANDS, STD_IN: STD_IN, IN_A: IN_A, RCD_IN: RCD_IN, IDN: IDN, SECTIONS: SECTIONS, CAT: CAT, CAT_ORDER: CAT_ORDER, TEMPLATES: TEMPLATES,
    DU_WARN: DU_WARN, IMB_WARN: IMB_WARN, KC_LOW: KC_LOW, KC_BAD: KC_BAD,
    KM_TYPES: KM_TYPES, BOXES: BOXES, ROUTES: ROUTES, kmAuto: kmAuto, kmOf: kmOf, SOFT: SOFT, softOk: softOk,
    FS_BRK: FS_BRK, FS_QS: FS_QS, FS_RCD: FS_RCD, FS_SEC: FS_SEC, FS_IDN: FS_IDN, FS_MARKS: FS_MARKS, fsOf: fsOf,
    clone: clone, num: num, fmt: fmt, round: round, secStr: secStr, cableStr: cableStr,
    defaultBoard: defaultBoard, tplOptions: tplOptions, generate: generate, normalize: normalize, derive: derive, blocks: blocks,
    moveRows: moveRows, nudge: nudge, slots: slots, gapAnchor: gapAnchor, setField: setField, setBoard: setBoard,
    addGroup: addGroup, addRcd: addRcd, wrapRcd: wrapRcd, removeRows: removeRows, duplicate: duplicate, balance: balance,
    split3: split3, find: find, autoCable: autoCable, autoLen: autoLen
  };
})(typeof window !== 'undefined' ? window : globalThis);
