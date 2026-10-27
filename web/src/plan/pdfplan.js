/* ГИП · план из PDF: разбор, классы слоёв, легенда значков, сопоставление с блоками ГИП, выгрузка для LISP */
/* Зависит только от pdf.js: из AutoCAD (палитра) и из Node (тесты) — window/pdfjslib отсутствует. */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GIPPLAN = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------------------------------------------------------------- виды значков ГИП (как в блоках) */
  var VIS = {
    R: ['Розетка штепсельная силовая, 16A, L+N+PE (1Ф)', 'Розетка штепсельная силовая, 16A, 3L+N+PE (3Ф)', 'Вывод 380/220В', 'Розетка USB, IP20',
        'Терморегулятор ТП', 'Лючок внутрипольный розеточный 1 роз., 16A, L+N+PE, IP44', 'Лючок внутрипольный розеточный 2 роз., 16A, L+N+PE, IP44',
        'Розетка штепсельная силовая, 16A, L+N+PE (1Ф) IP44'],
    V: ['Выключатель 1 клавишный, 1п, 16А', 'Выключатель 2 клавишный, 1п, 16A', 'Выключатель 3 клавишный, 1п, 16A', 'Переключатель 1 клавишный, 1п, 16A',
        'Переключатель 2 клавишный, 1п, 16A', 'Диммер', 'Датчик движения'],
    C: ['Светильник потолочный', 'Светильник подвесной', 'Светильник настольный / напольный', 'Светильник встраиваемый', 'Светильник накладной',
        'Светильник настенный', 'Светильник трековый', 'Светильник потолочный IP44', 'Светильник встраиваемый IP44', 'Светильник накладной IP44',
        'Светильник настенный IP44', 'Светильник трековый IP44']
  };

  /* ---------------------------------------------------------------- чтение страницы */
  function extractPage(pdfjs, doc, no) {
    return doc.getPage(no).then(function (page) {
      var vp1 = page.getViewport({ scale: 1 });
      var op = page.getOperatorList();
      var tx = page.getTextContent();
      return Promise.all([op, tx]).then(function (r) {
        var O = r[0], T = r[1];
        var paths = [], layers = {}, fills = {};
        var cur = null, state = { L: null, w: false, f: false };
        var gs = O.fnArray, gd = O.argsArray;
        for (var i = 0; i < gs.length; i++) {
          var k = gs[i];
          if (k === pdfjs.OPS.beginPath || k === pdfjs.OPS.moveTo || k === pdfjs.OPS.lineTo || k === pdfjs.OPS.curveTo || k === pdfjs.OPS.curveTo2 || k === pdfjs.OPS.curveTo3 || k === pdfjs.OPS.closePath) {
            if (!cur) cur = { L: state.L, w: state.w, f: state.f, l: null, pts: [] };
            if (k === pdfjs.OPS.closePath) { cur.closed = true; cur = flush(cur); }
            else {
              var a = gd[i];
              if (k === pdfjs.OPS.beginPath) cur.pts = [];
              else if (k === pdfjs.OPS.moveTo) cur.l = { x: a[0], y: a[1] };
              else if (k === pdfjs.OPS.lineTo) { cur.pts.push([cur.l, { x: a[0], y: a[1] }]); cur.l = { x: a[0], y: a[1] }; }
              else if (k === pdfjs.OPS.curveTo) { cur.pts.push([cur.l, { x: a[4], y: a[5] }]); cur.l = { x: a[4], y: a[5] }; }
              else if (k === pdfjs.OPS.curveTo2) { cur.pts.push([cur.l, { x: a[2], y: a[3] }]); cur.l = { x: a[2], y: a[3] }; }
              else if (k === pdfjs.OPS.curveTo3) { cur.pts.push([cur.l, { x: a[2], y: a[3] }]); cur.l = { x: a[2], y: a[3] }; }
            }
            continue;
          }
          if (cur) cur = flush(cur);
          if (k === pdfjs.OPS.save) { /* стек не нужен: состояние слоя не восстанавливаем */ }
          else if (k === pdfjs.OPS.restore) { }
          else if (k === pdfjs.OPS.setStrokeRGBColor) { state.w = !(gd[i][0] > 0.9 && gd[i][1] > 0.9 && gd[i][2] > 0.9); }
          else if (k === pdfjs.OPS.setFillRGBColor) { state.f = !(gd[i][0] > 0.9 && gd[i][1] > 0.9 && gd[i][2] > 0.9); }
          else if (k === pdfjs.OPS.setGState) { var g = gd[i][0]; if (g && g[0] === 'LW') { /* толщина не важна */ } }
          else if (k === pdfjs.OPS.beginGroup) {
            var g0 = gd[i][0];
            if (g0 && g0[0] && g0[0].name) { state.L = g0[0].name; }
            else if (g0 && g0.name) { state.L = g0.name; }
          }
          else if (k === pdfjs.OPS.endGroup) { state.L = null; }
          else if (k === pdfjs.OPS.setLineWidth) { }
        }
        if (cur) flush(cur);
        function flush(c) {
          if (c && c.pts.length) {
            paths.push({ L: c.L, w: c.w, f: c.f, pts: c.pts.map(function (s) { return [s[0], s[1]]; }) });
            var nm = c.L || '';
            layers[nm] = (layers[nm] || 0) + 1;
            if (c.f) fills[nm] = (fills[nm] || 0) + 1;
          }
          return null;
        }
        var texts = T.items.filter(function (t) { return t.str && t.str.trim(); }).map(function (t) {
          return { s: t.str, x: t.transform[4], y: t.transform[5], h: Math.hypot(t.transform[2], t.transform[3]), w: t.width || 0 };
        });
        return { no: no, w: vp1.width, h: vp1.height, paths: paths, texts: texts, layers: layers, fills: fills };
      });
    });
  }

  function extractTextPage(pdfjs, doc, no) {
    return doc.getPage(no).then(function (page) {
      var vp1 = page.getViewport({ scale: 1 });
      return page.getTextContent().then(function (T) {
        var texts = T.items.filter(function (t) { return t.str && t.str.trim(); }).map(function (t) {
          return { s: t.str, x: t.transform[4], y: t.transform[5], h: Math.hypot(t.transform[2], t.transform[3]), w: t.width || 0 };
        });
        return { no: no, w: vp1.width, h: vp1.height, paths: [], texts: texts, layers: {}, fills: {} };
      });
    });
  }

  /* ---------------------------------------------------------------- слои */
  function guessLayer(L) {
    var s = (L || '').toLowerCase().replace(/ё/g, 'е');
    if (!s) return 'flat';
    if (/размер|dim/.test(s)) return 'skip';
    if (/текст|text|подпис|штамп|табл/.test(s)) return 'skip';
    if (/мебел|furn/.test(s)) return 'mebel';
    if (/электр|розет|выключ|свет|силов/.test(s)) return 'sym';
    if (/стен|стена|перегород|окно|двер/.test(s)) return 'flat';
    return 'flat';
  }
  var LCLASS = {};
  function lclass(L) { var k = L || ''; if (!(k in LCLASS)) LCLASS[k] = null; return LCLASS[k] || guessLayer(k); }
  function setLayerClass(L, c) { LCLASS[L || ''] = c; }
  function lsetAll(m) { LCLASS = {}; Object.keys(m || {}).forEach(function (k) { LCLASS[k] = m[k]; }); }

  function bbox(pts) { var b = [1e18, 1e18, -1e18, -1e18]; pts.forEach(function (p) { b[0] = Math.min(b[0], p[0]); b[1] = Math.min(b[1], p[1]); b[2] = Math.max(b[2], p[0]); b[3] = Math.max(b[3], p[1]); }); return b; }
  function bboxPts(pts) { return bbox(pts); }
  function bmerge(a, b) { return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])]; }
  function far(a, b) { return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1])); }
  function segs2str(segs) {
    function r2(n) { return Math.round(n * 100) / 100; }
    return segs.map(function (s) { return r2(s.a[0]) + ',' + r2(s.a[1]) + '-' + r2(s.b[0]) + ',' + r2(s.b[1]); }).join('|');
  }

  /* ---------------------------------------------------------------- масштаб */
  function detectScale(D) {
    var cands = [];
    D.texts.forEach(function (t) {
      var m = /1\s*:\s*(\d{1,3})/.exec(t.s);
      if (m) cands.push({ v: +m[1], h: t.h });
      else if (/^М\s*1\s*:\s*(\d{1,3})/i.test(t.s)) cands.push({ v: +RegExp.$1, h: t.h });
    });
    if (!cands.length) return { den: 50, label: null };
    cands.sort(function (a, b) { return a.v - b.v; });
    var best = cands[Math.floor(cands.length / 2)];
    return { den: best.v, label: '1:' + best.v };
  }

  /* ---------------------------------------------------------------- нормализация текста */
  function cleanRoomText(s) {
    return String(s == null ? '' : s)
      .replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"')
      .replace(/\s+/g, ' ').trim();
  }
  function roomNumber(s) {
    var m = /^\s*(\d{1,2})\s*\.?\s*$/.exec(cleanRoomText(s));
    return m ? +m[1] : null;
  }

  /* Экспликация без заголовка «Экспликация помещений»: колонка известных названий (холл, спальня…),
     слева от каждого названия — номер. Так дизайнеры оформляют таблицу «Наименование | S, м²». */
  var ROOM_WORDS = ['кухня-гостиная', 'мастер-спальня', 'медиакомната', 'холл', 'коридор', 'прихожая', 'спальня',
                    'гардеробная', 'детская', 'ванная', 'санузел', 'туалет', 'кухня', 'гостиная', 'кабинет',
                    'постирочная', 'котельная', 'кладовая', 'лоджия', 'балкон', 'столовая', 'бильярдная',
                    'медиа', 'библиотека'];
  var ROOM_STOP = /общая|итог|примечан|сантехн|спецификац|условн|состав|легенд|обозначен/i;
  function roomWordHit(s) {
    var t = ' ' + s.replace(/[.,;:!?()«»]/g, ' ') + ' ';
    for (var i = 0; i < ROOM_WORDS.length; i++) {
      var w = ROOM_WORDS[i];
      if (t.indexOf(' ' + w + ' ') >= 0 || s === w) return true;
    }
    return false;
  }
  function extractRoomsByNames(D) {
    var ts = (D && D.texts || []).map(function (t) {
      return { s: cleanRoomText(t.s), x: +t.x || 0, y: +t.y || 0, h: +t.h || 8, w: +t.w || 0 };
    }).filter(function (t) { return t.s && /[a-zа-яё]/i.test(t.s); });
    var rows = [];
    ts.forEach(function (t) {
      var s = t.s.toLowerCase().replace(/ё/g, 'е');
      if (s.length > 40 || ROOM_STOP.test(s) || !roomWordHit(s)) return;
      var num = null;
      ts.forEach(function (n) {
        if (roomNumber(n.s) == null) return;
        if (n.x + n.w <= t.x + 2 && n.x >= t.x - 90 &&
            Math.abs(n.y - t.y) < Math.max(3.5, 0.7 * Math.min(n.h, t.h)) &&
            (!num || n.x > num.x)) num = n;
      });
      if (num) rows.push({ no: roomNumber(num.s), name: t.s, x: t.x, y: t.y });
    });
    rows.sort(function (a, b) { return a.x - b.x || b.y - a.y; });
    var clusters = [];
    rows.forEach(function (r) {
      for (var i = 0; i < clusters.length; i++) {
        var c = clusters[i];
        if (Math.abs(c.x - r.x) < Math.max(25, r.name.length * 2)) {
          c.rows.push(r); c.x = (c.x * c.n + r.x) / (c.n + 1); c.n++;
          return;
        }
      }
      clusters.push({ x: r.x, n: 1, rows: [r] });
    });
    var best = null;
    clusters.forEach(function (c) {
      var seen = {}, rr = [];
      c.rows.sort(function (a, b) { return b.y - a.y; }).forEach(function (r) {
        if (seen[r.no]) return; seen[r.no] = 1; rr.push(r);
      });
      if (rr.length < 2) return;
      if (!best || rr.length > best.rooms.length) best = { rooms: rr, x: c.x };
    });
    if (!best) return { rooms: [], box: null, score: 0, title: '' };
    var xs = best.rooms.map(function (r) { return r.x; });
    var ys = best.rooms.map(function (r) { return r.y; });
    var box = [Math.min.apply(null, xs) - 90, Math.min.apply(null, ys) - 10,
               Math.max.apply(null, xs) + Math.max.apply(null, best.rooms.map(function (r) { return r.name.length * 7; })) + 20,
               Math.max.apply(null, ys) + 20];
    return { rooms: best.rooms.map(function (r) { return { no: r.no, name: r.name }; })
               .sort(function (a, b) { return a.no - b.no; }),
             box: box, score: best.rooms.length * 100 - 50, title: '' };
  }
  /* обе стратегии: заголовок «Экспликация…» (авторитетнее при равенстве) и колонка названий */
  function extractRooms(D) {
    var a = extractRoomsByTitle(D);
    var b = extractRoomsByNames(D);
    return b.score > a.score ? b : a;
  }

  /* ---------------------------------------------------------------- экспликация по заголовку */
  function extractRoomsByTitle(D) {
    var ts = D.texts, best = null;
    var items = ts.map(function (t) { return { s: cleanRoomText(t.s), x: t.x, y: t.y, h: t.h, w: t.w }; });
    items.forEach(function (t) {
      var s = t.s.toLowerCase();
      if (!/экспликац/.test(s) || /двер|проём|проем/.test(s)) return;
      var rows = [], used = {}, nums = [], gap = 0;
      items.forEach(function (n) {
        var v = roomNumber(n.s);
        if (v == null) return;
        if (n.x < t.x - 60 || Math.abs(n.y - t.y) > D.h * 0.9) return;
        nums.push({ v: v, x: n.x, y: n.y });
      });
      items.forEach(function (nm) {
        var m = /^\s*([0-9]{1,2})\s*[;|,\t]?\s*([A-ZА-ЯЁ][^;|]{1,60})\s*$/.exec(nm.s);
        if (!m) return;
        var no = +m[1], name = m[2].trim();
        if (name.length < 2) return;
        rows.push({ no: no, name: name, x: nm.x, y: nm.y });
      });
      rows.forEach(function (r) {
        var n = null, d = 1e18;
        nums.forEach(function (c) { var dd = Math.abs(c.y - r.y) * 2 + Math.abs(c.x - (r.x - 60)); if (dd < d) { d = dd; n = c; } });
        if (n && d < 220) { r.no = n.v; used[n.v] = 1; r.gap = d; }
        else r.no = -1;
      });
      rows = rows.filter(function (r) { return r.no > 0 && !/^(итог|всего|общая)/i.test(r.name); });
      rows.sort(function (a, b) { return a.no - b.no; });
      var dup = {}; rows = rows.filter(function (r) { if (dup[r.no]) return false; dup[r.no] = 1; return true; });
      if (!rows.length) return;
      var xs = rows.map(function (r) { return r.x; }), ys = rows.map(function (r) { return r.y; });
      var box = [Math.min.apply(null, xs) - 100, Math.min.apply(null, ys) - 12,
                 Math.max.apply(null, xs) + Math.max.apply(null, rows.map(function (r) { return r.name.length * 7; })) + 30,
                 Math.max.apply(null, ys) + 16];
      var score = rows.length * 100 - gap;
      if (!best || score > best.score) best = { rooms: rows, box: box, score: score, title: t.s };
    });
    return best || { rooms: [], box: null, score: 0, title: '' };
  }

  /* ---------------------------------------------------------------- совпадение фигур */
  function normalizeSegs(segs) {
    var b = bbox(segs.reduce(function (r, s) { return r.concat([s.a, s.b]); }, []));
    var cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2, sc = 1 / Math.max(b[2] - b[0], b[3] - b[1], 1e-6);
    return segs.map(function (s) {
      return { a: [(s.a[0] - cx) * sc, (s.a[1] - cy) * sc], b: [(s.b[0] - cx) * sc, (s.b[1] - cy) * sc] };
    });
  }
  function simSegs(A, B) {
    if (!A.length || !B.length) return 0;
    var tot = 0, n = 0;
    for (var i = 0; i < A.length; i++) {
      var a = A[i], best = 0;
      for (var j = 0; j < B.length; j++) {
        var b = B[j];
        var d = Math.hypot(a.a[0] - b.a[0], a.a[1] - b.a[1]) + Math.hypot(a.b[0] - b.b[0], a.b[1] - b.b[1]);
        best = Math.max(best, 1 - d / 2.6);
      }
      tot += best; n++;
    }
    return tot / n;
  }
  function mapShapes(A) {
    var base = A.segs.map(function (s) { return normalizeSegs(s); });
    var map = {};
    A.groups.forEach(function (g, i) {
      var best = { j: -1, v: 0 };
      for (var j = 0; j < i; j++) {
        var v = simSegs(base[j], base[i]);
        if (v > best.v) best = { j: j, v: v };
      }
      if (best.j >= 0 && best.v > 0.94) map[i] = best.j;
    });
    return map;
  }
  function mergeShapes(A) {
    var chains = {}, seen = {};
    function canon(i) { var r = i; while (map[r] != null && !seen[r]) { seen[r] = 1; r = map[r]; } return r; }
    var map = mapShapes(A);
    Object.keys(map).forEach(function (k) { k = +k; chains[k] = 1; });
    var groups = [];
    A.groups.forEach(function (g, i) { var c = canon(i); (groups[c] = groups[c] || []).push(g); });
    var out = [];
    groups.forEach(function (gs) { if (gs) out.push({ segs: gs[0], n: gs.reduce(function (r, g) { return r + g.n; }, 0) }); });
    return out;
  }

  /* ---------------------------------------------------------------- анализ страницы */
  function analyze(D, opts) {
    var A = { D: D, scale: detectScale(D), layers: D.layers, texts: D.texts, templates: [], shapes: [], hits: [], mebelPts: [], scaleDen: detectScale(D).den };
    var crop = [1e18, 1e18, -1e18, -1e18];
    var flatBB = null, mebBB = null;
    var S = {};
    D.paths.forEach(function (p) {
      var cls = lclass(p.L);
      if (cls === 'mebel' || cls === 'flat') {
        p.pts.forEach(function (s) { s.forEach(function (q) { crop[0] = Math.min(crop[0], q[0]); crop[1] = Math.min(crop[1], q[1]); crop[2] = Math.max(crop[2], q[0]); crop[3] = Math.max(crop[3], q[1]); }); });
        var bb = bbox(p.pts.reduce(function (r, s) { return r.concat(s); }, []));
        if (cls === 'mebel') mebBB = mebBB ? bmerge(mebBB, bb) : bb;
        else flatBB = flatBB ? bmerge(flatBB, bb) : bb;
      }
      var sig = segs2str(p.pts);
      if (!sig) return;
      (S[p.L || ''] = S[p.L || ''] || {})[sig] = (S[p.L || ''] = S[p.L || ''] || {})[sig] + 1;
    });
    A.crop = crop[0] > 1e17 ? [0, 0, D.w, D.h] : crop;
    A.flatBB = flatBB; A.mebelBB = mebBB;
    /* устойчивые фигуры на слое значков — кандидаты в легенду */
    Object.keys(S).forEach(function (L) {
      var sigs = S[L];
      Object.keys(sigs).forEach(function (sig) {
        if (sigs[sig] < 2) return;
        var segs = sig.split('|').map(function (s2) { var m = s2.split('-'); return { a: m[0].split(',').map(Number), b: m[1].split(',').map(Number) }; });
        var bb = bbox(segs.reduce(function (r, s) { return r.concat([s.a, s.b]); }, []));
        A.shapes.push({ key: L + '|' + sig, L: L, segs: segs, n: sigs[sig], bb: bb, cx: (bb[0] + bb[2]) / 2, cy: (bb[1] + bb[3]) / 2, size: Math.max(bb[2] - bb[0], bb[3] - bb[1]) });
      });
    });
    A.shapes.sort(function (a, b) { return b.n - a.n || b.size - a.size; });
    /* масштаб значков относительно легенды: медиана отношений размеров */
    A.kMed = null;
    /* кластер одинаковых фигур (та же геометрия повторяется) */
    A.groups = [];
    var gmap = {};
    A.shapes.forEach(function (sh) {
      var cands = A.shapes.filter(function (o) { return o !== sh && o.L === sh.L && Math.abs(o.size - sh.size) / sh.size < 0.06; });
      var parent = cands.find(function (o) { return simSegs(normalizeSegs(o.segs), normalizeSegs(sh.segs)) > 0.96; });
      if (parent) { (gmap[parent.key] = gmap[parent.key] || []).push(sh); A.kMed = A.kMed; }
      else gmap[sh.key] = gmap[sh.key] || [];
      (A.groups[A.groups.length] = A.groups[A.groups.length]); /* держим индексы */
    });
    /* собрать группы в список */
    var glist = [];
    Object.keys(gmap).forEach(function (k, gi) {
      var base = A.shapes.find(function (s) { return s.key === k; });
      glist.push({ key: k, L: base.L, segs: base.segs, items: gmap[k].concat([base]), n: gmap[k].length + 1 });
    });
    A.shapes = glist.length ? [] : A.shapes;
    /* ищем, где повторяется: хиты на плане */
    var hits = [];
    A.shapes = [];
    return A;
  }

  /* ---------------------------------------------------------------- экспорт для LISP */
  function fmt(n) { var v = Math.round(n * 100) / 100; return Object.is(v, -0) ? '0' : String(v); }
  function pathBBox(p) {
    var b = [1e18, 1e18, -1e18, -1e18];
    p.pts.forEach(function (s) { s.forEach(function (q) { b[0] = Math.min(b[0], q[0]); b[1] = Math.min(b[1], q[1]); b[2] = Math.max(b[2], q[0]); b[3] = Math.max(b[3], q[1]); }); });
    return b;
  }
  function ptInPoly(x, y, poly) {
    var inside = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }
  function buildOutput(o) {
    var A = o.underlay, den = o.scaleDen || 50;
    var sc = den / 1000;
    var crop = A.crop;
    var W = (crop[2] - crop[0]) / sc, H = (crop[3] - crop[1]) / sc;
    var out = ['(GIPPLAN 1 ' + den + ' ' + fmt(W) + ' ' + fmt(H) + ' ' + JSON.stringify(o.name || 'plan') + ')'];
    var closed = {};
    A.page.paths.forEach(function (p) {
      var cls = A.lclass(p.L);
      if (cls !== 'flat' && cls !== 'mebel') return;
      var k = cls === 'flat' ? 0 : 1;
      if (p.f === 'w') { (closed[k] = closed[k] || []).push(p); return; }
      var tag = p.closed ? 'C' : 'L';
      var pts = p.pts.map(function (s) { return [fmt((s[0][0] - crop[0]) / sc), fmt((s[0][1] - crop[1]) / sc)]; });
      var bb = pathBBox(p);
      if (p.closed) pts.push([fmt((p.pts[p.pts.length - 1][1][0] - crop[0]) / sc), fmt((p.pts[p.pts.length - 1][1][1] - crop[1]) / sc)]);
      if (bb[2] - bb[0] < 2 / sc && bb[3] - bb[1] < 2 / sc) return;
      out.push('(' + tag + ' ' + k + ' ' + pts.map(function (q) { return q[0] + ' ' + q[1]; }).join(' ') + ')');
    });
    Object.keys(closed).forEach(function (k) {
      var polys = closed[k].map(function (p) {
        var pts = p.pts.map(function (s) { return [ (s[0][0] - crop[0]) / sc, (s[0][1] - crop[1]) / sc ]; });
        pts.push([(p.pts[p.pts.length - 1][1][0] - crop[0]) / sc, (p.pts[p.pts.length - 1][1][1] - crop[1]) / sc]);
        return pts;
      });
      var placed = [], rest = polys;
      while (rest.length) {
        var outer = rest.reduce(function (a, b) { return Math.abs(pathBBox({ pts: [a] })[2] - pathBBox({ pts: [a] })[0]) * Math.abs(pathBBox({ pts: [a] })[3] - pathBBox({ pts: [a] })[1]) > Math.abs(pathBBox({ pts: [b] })[2] - pathBBox({ pts: [b] })[0]) * Math.abs(pathBBox({ pts: [b] })[3] - pathBBox({ pts: [b] })[1]) ? a : b; });
        var inners = rest.filter(function (p) { return p !== outer && ptInPoly((p[0][0] + p[Math.floor(p.length / 2)][0]) / 2, (p[0][1] + p[Math.floor(p.length / 2)][1]) / 2, outer); });
        var all = [outer].concat(inners);
        var flat = [];
        all.forEach(function (p, i) { p.forEach(function (q) { flat.push(q[0], q[1]); }); if (i < all.length - 1) flat.push('break'); });
        placed.push('(F ' + k + ' ' + flat.map(function (q) { return q === 'break' ? q : fmt(q); }).join(' ').replace(/ break /g, ' ) (F ' + k + ' ') + ')');
        rest = rest.filter(function (p) { return p !== outer && inners.indexOf(p) < 0; });
      }
      out = out.concat(placed);
    });
    (o.rooms || []).forEach(function (r) { out.push('(R ' + r.no + ' ' + JSON.stringify(r.name) + ')'); });
    (o.markers || []).forEach(function (m) { out.push('(N ' + m.no + ' ' + fmt((m.x - crop[0]) / sc) + ' ' + fmt((m.y - crop[1]) / sc) + ')'); });
    /* смещение листов с электрическими значками относительно подложки — в LISP пока не передаём */
    return { text: out.join('\r\n'), nRoomMarkers: (o.markers || []).length, w: W, h: H };
  }

  /* ---------------------------------------------------------------- API */
  var API = {
    extractPage: extractPage, extractTextPage: extractTextPage,
    guessLayer: guessLayer, lclass: lclass, setLayerClass: setLayerClass, lsetAll: lsetAll,
    analyze: analyze, mergeRoomMarkers: mergeRoomMarkers, findRoomMarkers: findRoomMarkers,
    extractRooms: extractRooms, extractRoomsByNames: extractRoomsByNames,
    shapesOf: shapesOf, segs2str: segs2str, vis: vis, VIS: VIS, counts: counts, bboxPts: bboxPts,
    buildOutput: buildOutput
  };
  return API;
});
