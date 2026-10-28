/* ГИП · План из PDF дизайнера: разбор векторного PDF (pdf.js), легенда, поиск значков по образцу,
   подложка (квартира + мебель) и данные для вставки блоков ГИП в AutoCAD. Без ИИ — только геометрия.
   Работает в браузере (панель AutoCAD) и в Node (проверки). */
(function (root) {
  'use strict';

  /* ------------------------------------------------------------------ блоки ГИП и их «Вид» */
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
  var BLOCK_NAME = { R: 'Розетки', V: 'Выключатели', C: 'Светильники' };
  /* какой стороной блок ГИП (при повороте 0) обращён к стене: розетка — +x, выключатель и вывод — −y */
  function wallAxis(b, vi) { return b === 'V' || (b === 'R' && vi === 2) ? -90 : 0; }

  /* назначение по подписи легенды: { b: R|V|C|'', v: индекс вида, n: гнёзд } */
  function guessType(label) {
    var s = String(label || '').toLowerCase().replace(/ё/g, 'е');
    var n = /тройн|3\s*-?\s*х?\s*мест|три\b/.test(s) ? 3 : /двойн|2\s*-?\s*х?\s*мест|сдвоен/.test(s) ? 2 : 1;
    if (/домофон|интернет|rj|tv|тв\b|телев|телефон|слаботоч|ethernet|lan\b/.test(s)) return { b: '', v: 0, n: 1 };
    if (/датчик\s+(т[её]пл|пола)|терморег|регулятор\s*тп|\bтп\b/.test(s)) return { b: 'R', v: 4, n: 1 };
    if (/вывод|электровывод/.test(s)) return { b: 'R', v: 2, n: 1 };
    if (/usb/.test(s)) return { b: 'R', v: 3, n: 1 };
    if (/лючок|напольн.*розет/.test(s)) return { b: 'R', v: n > 1 ? 6 : 5, n: 1 };
    if (/розетк/.test(s)) {
      if (/380|3ф|трехфаз|трёхфаз/.test(s)) return { b: 'R', v: 1, n: 1 };
      return { b: 'R', v: /влаго|ip\s*4|ip44/.test(s) ? 7 : 0, n: n };
    }
    if (/диммер|светорег/.test(s)) return { b: 'V', v: 5, n: 1 };
    if (/датчик\s+движ|движени/.test(s)) return { b: 'V', v: 6, n: 1 };
    if (/выключ|переключ|проходн|мастер|клавиш/.test(s)) {
      var two = /двух|2\s*-?\s*х?\s*клав/.test(s), three = /тр[её]х|3\s*-?\s*х?\s*клав/.test(s);
      if (/проходн|переключ/.test(s)) return { b: 'V', v: two ? 4 : 3, n: 1 };
      return { b: 'V', v: three ? 2 : two ? 1 : 0, n: 1 };
    }
    if (/светильн|люстр|бра\b|спот|трек|подсвет|лент/.test(s)) {
      if (/трек/.test(s)) return { b: 'C', v: 6, n: 1 };
      if (/бра|настен/.test(s)) return { b: 'C', v: 5, n: 1 };
      if (/встраив|спот|точеч/.test(s)) return { b: 'C', v: 3, n: 1 };
      if (/подвес|люстр/.test(s)) return { b: 'C', v: 1, n: 1 };
      return { b: 'C', v: 0, n: 1 };
    }
    return { b: '', v: 0, n: 1 };
  }

  /* слои дизайнера: квартира (flat) | мебель (mebel) | значки (sym) | не брать (skip) */
  function guessLayer(name) {
    if (name == null) return 'flat';
    var s = String(name).toLowerCase();
    if (/размер|dim|текст|text|подпис|надпис|потол|(^|[\s_])пол([\s_]|ы|$)|полы|плинтус|ось|axis|осевые|hatch|штрих|ном\.?\s*пера__1\b/.test(s)) return 'skip';
    if (/розет|выкл|свет|освещ|элект|electr|elektr|ламп|датчик|power|light|socket|switch|тепл/.test(s)) return 'sym';
    if (/мебел|mebel|furn|сантех|kitchen|кухн|оборуд/.test(s)) return 'mebel';
    return 'flat';
  }

  /* ------------------------------------------------------------------ извлечение из PDF (pdf.js) */
  function mul(a, b) { return [a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3], a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3], a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5]]; }
  function tp(m, x, y) { return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; }
  function colOf(c) {
    if (typeof c === 'string' && c[0] === '#') { var v = parseInt(c.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; }
    if (c && c.length >= 3) return [c[0], c[1], c[2]].map(function (x) { return x <= 1 ? x * 255 : x; });
    return [0, 0, 0];
  }
  async function extractPage(pdfjs, doc, pno) {
    var page = await doc.getPage(pno);
    var vp = page.getViewport({ scale: 1 });
    var oc = null; try { oc = await doc.getOptionalContentConfig(); } catch (e) { oc = null; }
    function ocName(id) { try { var g = oc && oc.getGroup(id); return g ? g.name : null; } catch (e) { return null; } }
    var ol = await page.getOperatorList();
    var OPS = pdfjs.OPS;
    var PMOVE = OPS.moveTo == null ? 13 : OPS.moveTo;
    var PLINE = OPS.lineTo == null ? 14 : OPS.lineTo;
    var PCURVE = OPS.curveTo == null ? 15 : OPS.curveTo;
    var PCURVE2 = OPS.curveTo2 == null ? 16 : OPS.curveTo2;
    var PCURVE3 = OPS.curveTo3 == null ? 17 : OPS.curveTo3;
    var PCLOSE = OPS.closePath == null ? 18 : OPS.closePath;
    var PRECT = OPS.rectangle == null ? 19 : OPS.rectangle;
    var ctm = [1, 0, 0, 1, 0, 0], st = [], ocs = [], fill = [0, 0, 0], lw = 1;
    var paths = [], layers = {}, pending = [];
    var STROKE = {}, FILL = {};
    [OPS.stroke, OPS.closeStroke].forEach(function (k) { STROKE[k] = 1; });
    [OPS.fill, OPS.eoFill].forEach(function (k) { FILL[k] = 1; });
    [OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke].forEach(function (k) { STROKE[k] = 1; FILL[k] = 1; });
    function curLayer() { for (var i = ocs.length - 1; i >= 0; i--) if (ocs[i]) return ocs[i]; return null; }
    function addCurve(cur, p0, c1, c2, p3) {
      for (var t = 1; t <= 6; t++) {
        var u = t / 6, v = 1 - u;
        cur.push([
          v * v * v * p0[0] + 3 * v * v * u * c1[0] + 3 * v * u * u * c2[0] + u * u * u * p3[0],
          v * v * v * p0[1] + 3 * v * v * u * c1[1] + 3 * v * u * u * c2[1] + u * u * u * p3[1]
        ]);
      }
    }
    function closePts(pts) {
      if (!pts || pts.length < 2) return pts || [];
      var out = pts.slice();
      if (Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) > 1e-3) out.push(out[0].slice());
      return out;
    }
    function flushPending(paintOp) {
      var doStroke = !!STROKE[paintOp], doFill = !!FILL[paintOp];
      if (!doStroke && !doFill) { pending = []; return; }
      var fillKind = Math.min(fill[0], fill[1], fill[2]) > 230 ? 'w' : 'd';
      var closeStroke = paintOp === OPS.closeStroke || paintOp === OPS.closeFillStroke || paintOp === OPS.closeEOFillStroke;
      pending.forEach(function (p) {
        if (doStroke) paths.push({ pts: closeStroke ? closePts(p.pts) : p.pts, L: p.L, f: '', w: lw });
        // PDF fills implicitly close open subpaths; preserve that for the optional wall-fill output.
        if (doFill) paths.push({ pts: closePts(p.pts), L: p.L, f: fillKind, w: 0 });
      });
      pending = [];
    }
    function addSubpaths(subs) {
      var layer = curLayer();
      layers[layer == null ? '' : layer] = (layers[layer == null ? '' : layer] || 0) + subs.length;
      subs.forEach(function (pts) { if (pts && pts.length > 1) pending.push({ pts: pts, L: layer }); });
    }
    function decodeConstructPath(verbs, args) {
      if (!verbs || !args) return;
      var subs = [], cur = null, k = 0, pos = 0;
      function flushCur(close) {
        if (cur && cur.length > 1) {
          var last = cur[cur.length - 1], first = cur[0];
          if (close && Math.hypot(first[0] - last[0], first[1] - last[1]) > 1e-3) cur.push(first.slice());
          subs.push(cur);
        }
        cur = null;
      }
      while (k < verbs.length) {
        var op = verbs[k++];
        if (op === PMOVE) {
          flushCur(false);
          cur = [tp(ctm, args[pos], args[pos + 1])]; pos += 2;
        } else if (op === PLINE) {
          if (!cur) cur = [];
          cur.push(tp(ctm, args[pos], args[pos + 1])); pos += 2;
        } else if (op === PCURVE) {
          var p0 = cur && cur.length ? cur[cur.length - 1] : tp(ctm, 0, 0);
          var c1 = tp(ctm, args[pos], args[pos + 1]);
          var c2 = tp(ctm, args[pos + 2], args[pos + 3]);
          var p3 = tp(ctm, args[pos + 4], args[pos + 5]);
          if (!cur) cur = [p0];
          addCurve(cur, p0, c1, c2, p3); pos += 6;
        } else if (op === PCURVE2) {
          var q0 = cur && cur.length ? cur[cur.length - 1] : tp(ctm, 0, 0);
          var q2 = tp(ctm, args[pos], args[pos + 1]);
          var q3 = tp(ctm, args[pos + 2], args[pos + 3]);
          if (!cur) cur = [q0];
          addCurve(cur, q0, q0, q2, q3); pos += 4;
        } else if (op === PCURVE3) {
          var r0 = cur && cur.length ? cur[cur.length - 1] : tp(ctm, 0, 0);
          var r1 = tp(ctm, args[pos], args[pos + 1]);
          var r3 = tp(ctm, args[pos + 2], args[pos + 3]);
          if (!cur) cur = [r0];
          addCurve(cur, r0, r1, r3, r3); pos += 4;
        } else if (op === PCLOSE) {
          flushCur(true);
        } else if (op === PRECT) {
          flushCur(false);
          var x = args[pos], y = args[pos + 1], w = args[pos + 2], h = args[pos + 3];
          subs.push([tp(ctm, x, y), tp(ctm, x + w, y), tp(ctm, x + w, y + h),
                     tp(ctm, x, y + h), tp(ctm, x, y)]);
          pos += 4;
        } else {
          // Unknown path command: stop this path instead of interpreting coordinates with a wrong offset.
          break;
        }
      }
      flushCur(false);
      addSubpaths(subs);
    }
    for (var i = 0; i < ol.fnArray.length; i++) {
      var fn = ol.fnArray[i], a = ol.argsArray[i];
      if (fn === OPS.save) st.push([ctm, fill, lw]);
      else if (fn === OPS.restore) { if (st.length) { var s0 = st.pop(); ctm = s0[0]; fill = s0[1]; lw = s0[2]; } }
      else if (fn === OPS.transform) ctm = mul(a, ctm);
      else if (fn === OPS.paintFormXObjectBegin) { st.push([ctm, fill, lw]); if (a && a[0]) ctm = mul(a[0], ctm); }
      else if (fn === OPS.paintFormXObjectEnd) { if (st.length) { var s1 = st.pop(); ctm = s1[0]; fill = s1[1]; lw = s1[2]; } }
      else if (fn === OPS.beginMarkedContentProps) ocs.push(a && a[0] === 'OC' && a[1] && a[1].id ? ocName(a[1].id) : null);
      else if (fn === OPS.beginMarkedContent) ocs.push(null);
      else if (fn === OPS.endMarkedContent) ocs.pop();
      else if (fn === OPS.setFillRGBColor) fill = colOf(a[0] !== undefined && a.length === 1 ? a[0] : a);
      else if (fn === OPS.setFillGray) fill = colOf([a[0], a[0], a[0]]);
      else if (fn === OPS.setLineWidth) lw = a[0];
      else if (fn === OPS.constructPath) {
        // Current PDF.js supplies [path verbs, path operands, bounds]. Painting is a later OPS.stroke/fill.
        if (a && (Array.isArray(a[0]) || ArrayBuffer.isView(a[0]))) decodeConstructPath(a[0], a[1]);
      } else if (STROKE[fn] || FILL[fn]) flushPending(fn);
      else if (fn === OPS.endPath) pending = [];
    }
    var tc = await page.getTextContent(), texts = [];
    tc.items.forEach(function (t) { if (t.str && t.str.trim()) texts.push({ s: t.str, x: t.transform[4], y: t.transform[5], h: Math.hypot(t.transform[2], t.transform[3]) || 8, w: t.width || 0 }); });
    return { no: pno, w: vp.width, h: vp.height, paths: paths, texts: texts, layers: layers };
  }

  /* ------------------------------------------------------------------ геометрия */
  var dist = function (a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); };
  function segsOf(paths, filt) {
    var out = [];
    paths.forEach(function (p, pi) {
      if (filt && !filt(p)) return;
      for (var i = 1; i < p.pts.length; i++) { var a = p.pts[i - 1], b = p.pts[i]; if (dist(a, b) > 1e-3) out.push({ a: a, b: b, f: p.f, L: p.L, pi: pi }); }
    });
    return out;
  }

  async function extractTextPage(pdfjs, doc, pno) {
    var page = await doc.getPage(pno), vp = page.getViewport({ scale: 1 }), tc = await page.getTextContent(), texts = [];
    tc.items.forEach(function (t) {
      if (!t.str || !t.str.trim()) return;
      texts.push({ s: t.str.trim(), x: +t.transform[4] || 0, y: +t.transform[5] || 0,
        h: Math.hypot(t.transform[2], t.transform[3]) || 8, w: +t.width || 0 });
    });
    return { no: pno, w: vp.width, h: vp.height, texts: texts };
  }
  function cleanRoomText(s) {
    return String(s == null ? '' : s).replace(/\\P/gi, ' ').replace(/\\[A-Za-z]+[^;]*;/g, ' ')
      .replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();
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
  /* Разбор строк, где PDF.js отдал номер и название отдельными текстовыми ячейками. */
  function extractRoomsByRows(D) {
    var rows = mergeTextRows(D && D.texts || []);
    var titles = rows.filter(function (r) { return /экспликац.{0,45}помещ|помещ.{0,45}экспликац/i.test(r.s); });
    var titleY = titles.length ? Math.max.apply(null, titles.map(function (r) { return r.y; })) : null;
    var rooms = [], seen = {};
    rows.forEach(function (r) {
      var m = /^\s*(?:№\s*)?(\d{1,2})\s*[.)\-:;]?\s+(.+?)\s*$/.exec(cleanRoomText(r.s));
      if (!m) return;
      var no = +m[1], name = m[2].replace(/\s+\d+(?:[,.]\d+)?\s*(?:м\s*[²2]|кв\.?\s*м|м2|m2)(?:\b.*)?$/i, '').trim();
      name = name.replace(/[|;,:-]+\s*$/, '').trim();
      if (no < 1 || no > 99 || !name || name.length > 40 || ROOM_STOP.test(name) || !/[a-zа-яё]/i.test(name)) return;
      if (titleY != null) {
        if (r.y >= titleY || titleY - r.y > Math.max(260, Math.min((D.h || 800) * 0.6, r.h * 100))) return;
      } else if (!roomWordHit(name.toLowerCase().replace(/ё/g, 'е'))) return;
      if (seen[no]) return;
      seen[no] = true; rooms.push({ no: no, name: name, y: r.y, x: r.x });
    });
    rooms.sort(function (a, b) { return a.no - b.no; });
    if (!rooms.length) return { rooms: [], box: null, score: 0, title: titles.length ? titles[0].s : '' };
    var relevant = rows.filter(function (r) {
      return titles.some(function (t) { return Math.abs(t.y - r.y) <= Math.max(2, t.h * 0.45); }) ||
        rooms.some(function (room) { return Math.abs(room.y - r.y) <= Math.max(2, r.h * 0.65); });
    });
    var xs = relevant.map(function (r) { return r.x; }).concat(rooms.map(function (r) { return r.x; }));
    var ys = rooms.map(function (r) { return r.y; });
    return { rooms: rooms.map(function (r) { return { no: r.no, name: r.name }; }),
      box: [Math.min.apply(null, xs), Math.min.apply(null, ys),
        Math.max.apply(null, relevant.map(function (r) { return r.x + r.w; })),
        Math.max.apply(null, relevant.map(function (r) { return r.y + r.h; }))],
      score: rooms.length * 100 + (titleY == null ? 0 : 25), title: titles.length ? titles[0].s : '' };
  }
  /* Заголовок, явные номера слева и вариант с контурами вместо цифр. */
  function extractRooms(D) {
    var a = extractRoomsByTitle(D);
    var b = extractRoomsByNames(D);
    var c = extractRoomsByRows(D);
    if (b.score > a.score) a = b;
    if (c.score > a.score) a = c;
    return a;
  }

  function extractRoomsByTitle(D) {
    var base = (D && D.texts || []).map(function (t) {
      return { s: cleanRoomText(t.s), x: +t.x || 0, y: +t.y || 0, h: +t.h || 8, w: +t.w || 0 };
    }).filter(function (t) { return t.s; });
    /* Заголовки и ячейки таблицы иногда состоят из нескольких соседних объектов PDF.
       Слитые варианты нужны для поиска заголовков, но не должны дублировать строки помещений. */
    var ts = base, combined = base.slice();
    mergeTextRuns(base).forEach(function (r) {
      if (!combined.some(function (t) { return t.s === r.s && Math.abs(t.x - r.x) < 1 && Math.abs(t.y - r.y) < 1; })) combined.push(r);
    });
    var titles = combined.filter(function (t) { return /экспликац.{0,45}помещ|помещ.{0,45}экспликац/i.test(t.s); });
    var best = { rooms: [], box: null, score: 0, title: '' };
    titles.forEach(function (title) {
      var noHeads = combined.filter(function (t) {
        return /^(?:№(?:\s*(?:п\s*[/.]?\s*п|помещения))?|п\s*[/.]?\s*п|номер помещения|номер)$/i.test(t.s) &&
          title.y > t.y && title.y - t.y < Math.max(320, title.h * 30);
      });
      var nameHeads = combined.filter(function (t) {
        // Common schedules use both "Наименование помещения" and "Название помещения".
        return /(?:наименован|назван).{0,25}помещ/i.test(t.s) && title.y > t.y && title.y - t.y < Math.max(320, title.h * 30);
      });
      var headers = [];
      noHeads.forEach(function (nh) { nameHeads.forEach(function (hh) {
        var tol = Math.max(3, Math.min(nh.h, hh.h) * 0.7);
        if (hh.x <= nh.x || Math.abs(nh.y - hh.y) > tol) return;
        headers.push({ no: nh, name: hh, y: (nh.y + hh.y) / 2,
          gap: title.y - (nh.y + hh.y) / 2 + Math.abs(hh.x - nh.x) * 0.04 });
      }); });
      headers.sort(function (a, b) { return a.gap - b.gap; });
      function fallbackRows() {
        // Some Archicad schedules use outlined room numbers (not PDF text) and a
        // column called "Название помещения". Recover names by row order.
        nameHeads.forEach(function (hh) {
          var rowMax2 = Math.max(180, Math.min((D.h || 800) * 0.60, hh.h * 100));
          var rowTexts = ts.filter(function (t) {
            var dy = hh.y - t.y;
            return dy > Math.max(1, t.h * 0.12) && dy < rowMax2 &&
              t.x >= hh.x - Math.max(12, hh.h * 1.5) &&
              t.x <= hh.x + hh.w + Math.max(15, hh.h * 2) &&
              /[a-zа-яё]/i.test(t.s) &&
              !/наименован|назван|итого|экспликац|примечан|площадь/i.test(t.s);
          }).sort(function (a, b) { return b.y - a.y || a.x - b.x; });
          var groups = [];
          rowTexts.forEach(function (t) {
            var g = null, tol = Math.max(3.5, t.h * 0.65);
            for (var gi = 0; gi < groups.length; gi++) {
              if (Math.abs(groups[gi].y - t.y) <= tol) { g = groups[gi]; break; }
            }
            if (!g) { g = { y: t.y, h: t.h, items: [] }; groups.push(g); }
            g.items.push(t);
          });
          groups.sort(function (a, b) { return b.y - a.y; });
          var rows2 = groups.map(function (g, idx) {
            var name = g.items.sort(function (a, b) { return a.x - b.x; })
              .map(function (t) { return t.s; }).join(' ').replace(/\s+/g, ' ').trim();
            return { no: idx + 1, name: name, x: Math.min.apply(null, g.items.map(function (t) { return t.x; })),
                     y: g.y, endX: Math.max.apply(null, g.items.map(function (t) { return t.x + t.w; })) };
          }).filter(function (r) {
            return r.name &&
              !/^\d+([,.]\d+)?$/.test(r.name) &&
              !/^\d[\d\s,.]*\s*(?:м2|м²|кв\.?\s*м)\s*$/i.test(r.name);
          });
          if (!rows2.length) return;
          var xs2 = [title.x, title.x + title.w, hh.x - 45, hh.x + hh.w + 20]
            .concat(rows2.map(function (r) { return r.x; }))
            .concat(rows2.map(function (r) { return r.endX; }));
          var ys2 = [title.y, hh.y].concat(rows2.map(function (r) { return r.y; }));
          var box2 = [Math.min.apply(null, xs2) - 5, Math.min.apply(null, ys2) - 8,
            Math.max.apply(null, xs2) + 5, Math.max(title.y + title.h, hh.y + hh.h) + 8];
          var score2 = rows2.length * 100 - (title.y - hh.y);
          if (score2 > best.score) best = {
            rooms: rows2.map(function (r) { return { no: r.no, name: r.name }; }),
            box: box2, score: score2, title: title.s
          };
        });
      }
      if (!headers.length) { fallbackRows(); return; }
      var H = headers[0], rows = [], rowMax = Math.max(180, Math.min((D.h || 800) * 0.60, H.no.h * 100));
      var nums = ts.filter(function (t) {
        var n = roomNumber(t.s);
        return n != null && t.y < H.y - Math.max(1, t.h * 0.12) &&
          H.y - t.y < rowMax && t.x >= H.no.x - Math.max(8, H.no.h) &&
          t.x <= H.no.x + Math.max(H.no.w + 12, 32);
      });
      nums.forEach(function (n) {
        var tol = Math.max(3.5, n.h * 0.7);
        var names = ts.filter(function (t) {
          return !/^\d{1,2}\s*\.?$/.test(t.s) && t.x >= H.name.x - Math.max(4, t.h * 0.35) &&
            t.y < H.y && H.y - t.y < rowMax && Math.abs(t.y - n.y) <= tol &&
            /[a-zа-яё]/i.test(t.s) && !/наименован|итого|экспликац|примечан/i.test(t.s);
        }).sort(function (a, b) { return a.x - b.x; });
        if (!names.length || rows.some(function (r) { return r.no === roomNumber(n.s); })) return;
        var name = names.map(function (t) { return t.s; }).join(' ')
          .replace(/\s+\d+(?:[,.]\d+)?\s*(?:м2|м²|кв\.?м).*$/i, '').trim();
        if (!name) return;
        rows.push({ no: roomNumber(n.s), name: name, x: n.x, y: n.y,
          endX: Math.max.apply(null, names.map(function (t) { return t.x + t.w; })) });
      });
      rows.sort(function (a, b) { return b.y - a.y || a.no - b.no; });
      if (!rows.length) { fallbackRows(); return; }
      var xs = [title.x, title.x + title.w, H.no.x, H.name.x].concat(rows.map(function (r) { return r.x; }));
      var ys = [title.y, H.y].concat(rows.map(function (r) { return r.y; }));
      var box = [Math.min.apply(null, xs) - 5, Math.min.apply(null, ys) - 8,
        Math.max.apply(null, [title.x + title.w, H.name.x + H.name.w].concat(rows.map(function (r) { return r.endX; }))) + 5,
        Math.max.apply(null, [title.y + title.h, H.y + H.no.h]) + 8];
      var score = rows.length * 100 - headers[0].gap;
      if (score > best.score) best = { rooms: rows.map(function (r) { return { no: r.no, name: r.name }; }), box: box, score: score, title: title.s };
    });
    return best;
  }
  function findRoomMarkers(A, rooms) {
    if (!A || !A.page || !A.crop || !rooms || !rooms.length) return [];
    var wanted = {};
    rooms.forEach(function (r) { var n = +r.no; if (n >= 1 && n <= 15) wanted[n] = true; });
    var schedule = extractRooms(A.page), crop = A.crop, center = [(crop[0] + crop[2]) / 2, (crop[1] + crop[3]) / 2], candidates = [];
    (A.page.texts || []).forEach(function (t) {
      var n = roomNumber(t.s);
      if (n == null || !wanted[n]) return;
      var x = (+t.x || 0) + Math.max(0, +t.w || 0) / 2, y = (+t.y || 0) + (+t.h || 8) * 0.45;
      if (!inside([x, y], crop)) return;
      if (schedule.box && x >= schedule.box[0] - 5 && x <= schedule.box[2] + 5 && y >= schedule.box[1] - 5 && y <= schedule.box[3] + 5) return;
      candidates.push({ no: n, x: x, y: y, d: dist([x, y], center) });
    });
    candidates.sort(function (a, b) { return a.d - b.d; });
    var seen = {};
    return candidates.filter(function (p) { if (seen[p.no]) return false; seen[p.no] = true; return true; })
      .sort(function (a, b) { return a.no - b.no; }).map(function (p) { return { no: p.no, x: p.x, y: p.y }; });
  }

  /* Ручные номера помещений имеют приоритет над автопоиском и привязаны к конкретному листу PDF. */
  function mergeRoomMarkers(automatic, manual, rooms, pageNo) {
    var wanted = {};
    (rooms || []).forEach(function (r) { var n = +r.no; if (n >= 1 && n <= 15) wanted[n] = true; });
    var byNo = {};
    (automatic || []).forEach(function (m) {
      var n = +m.no;
      if (wanted[n] && isFinite(+m.x) && isFinite(+m.y)) byNo[n] = { no: n, x: +m.x, y: +m.y };
    });
    (manual || []).forEach(function (m) {
      var n = +m.no;
      if (m.pageNo != null && pageNo != null && +m.pageNo !== +pageNo) return;
      if (wanted[n] && isFinite(+m.x) && isFinite(+m.y)) byNo[n] = { no: n, x: +m.x, y: +m.y };
    });
    return Object.keys(byNo).map(function (n) { return byNo[n]; }).sort(function (a, b) { return a.no - b.no; });
  }

  function bboxPts(pts) { var b = [1e9, 1e9, -1e9, -1e9]; pts.forEach(function (p) { if (p[0] < b[0]) b[0] = p[0]; if (p[1] < b[1]) b[1] = p[1]; if (p[0] > b[2]) b[2] = p[0]; if (p[1] > b[3]) b[3] = p[1]; }); return b; }
  function boxOverlap(a, b) { return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1]; }
  function boxDistance(a, b) {
    var dx = Math.max(b[0] - a[2], a[0] - b[2], 0);
    var dy = Math.max(b[1] - a[3], a[1] - b[3], 0);
    return Math.hypot(dx, dy);
  }
  function clipSegment(a, b, box) {
    var dx = b[0] - a[0], dy = b[1] - a[1], t0 = 0, t1 = 1;
    var p = [-dx, dx, -dy, dy], q = [a[0] - box[0], box[2] - a[0], a[1] - box[1], box[3] - a[1]];
    for (var i = 0; i < 4; i++) {
      if (Math.abs(p[i]) < 1e-12) { if (q[i] < 0) return null; }
      else {
        var t = q[i] / p[i];
        if (p[i] < 0) { if (t > t1) return null; if (t > t0) t0 = t; }
        else { if (t < t0) return null; if (t < t1) t1 = t; }
      }
    }
    return [[a[0] + t0 * dx, a[1] + t0 * dy], [a[0] + t1 * dx, a[1] + t1 * dy]];
  }
  function clipPolyline(pts, box) {
    var out = [], cur = null;
    function flush() { if (cur && cur.length > 1) out.push(cur); cur = null; }
    for (var i = 1; i < pts.length; i++) {
      var seg = clipSegment(pts[i - 1], pts[i], box);
      if (!seg) { flush(); continue; }
      if (!cur || dist(cur[cur.length - 1], seg[0]) > 1e-3) { flush(); cur = [seg[0]]; }
      if (dist(cur[cur.length - 1], seg[1]) > 1e-3) cur.push(seg[1]);
      if (dist(seg[1], pts[i]) > 1e-3) flush();
    }
    flush();
    return out;
  }
  function clipPolygon(points, box) {
    var poly = (points || []).map(function (p) { return [p[0], p[1]]; });
    if (poly.length > 1 && dist(poly[0], poly[poly.length - 1]) < 1e-3) poly.pop();
    var edges = [
      { inside: function (p) { return p[0] >= box[0]; }, meet: function (a, b) { var t = (box[0] - a[0]) / (b[0] - a[0]); return [box[0], a[1] + t * (b[1] - a[1])]; } },
      { inside: function (p) { return p[0] <= box[2]; }, meet: function (a, b) { var t = (box[2] - a[0]) / (b[0] - a[0]); return [box[2], a[1] + t * (b[1] - a[1])]; } },
      { inside: function (p) { return p[1] >= box[1]; }, meet: function (a, b) { var t = (box[1] - a[1]) / (b[1] - a[1]); return [a[0] + t * (b[0] - a[0]), box[1]]; } },
      { inside: function (p) { return p[1] <= box[3]; }, meet: function (a, b) { var t = (box[3] - a[1]) / (b[1] - a[1]); return [a[0] + t * (b[0] - a[0]), box[3]]; } }
    ];
    edges.forEach(function (edge) {
      if (!poly.length) return;
      var input = poly, output = [], prev = input[input.length - 1], prevIn = edge.inside(prev);
      input.forEach(function (cur) {
        var curIn = edge.inside(cur);
        if (curIn) {
          if (!prevIn) output.push(edge.meet(prev, cur));
          output.push(cur);
        } else if (prevIn) output.push(edge.meet(prev, cur));
        prev = cur; prevIn = curIn;
      });
      poly = output;
    });
    return poly.filter(function (p, i, all) { return !i || dist(p, all[i - 1]) > 1e-3; });
  }
  function mergeTextRuns(texts) {
    var items = (texts || []).map(function (t) {
      return { s: String(t.s || '').trim(), x: +t.x || 0, y: +t.y || 0, h: +t.h || 8, w: +t.w || 0 };
    }).filter(function (t) { return t.s; }).sort(function (a, b) { return b.y - a.y || a.x - b.x; });
    var rows = [];
    items.forEach(function (t) {
      var row = null, tol = Math.max(1.5, t.h * 0.45);
      for (var i = 0; i < rows.length; i++) {
        if (Math.abs(rows[i].y - t.y) <= Math.max(tol, rows[i].h * 0.45)) { row = rows[i]; break; }
      }
      if (!row) { row = { y: t.y, h: t.h, items: [] }; rows.push(row); }
      row.items.push(t); row.h = Math.max(row.h, t.h);
      row.y = (row.y * (row.items.length - 1) + t.y) / row.items.length;
    });
    var out = [];
    rows.forEach(function (row) {
      row.items.sort(function (a, b) { return a.x - b.x; });
      var cur = null;
      row.items.forEach(function (t) {
        if (!cur) { cur = { s: t.s, x: t.x, y: t.y, h: t.h, w: t.w }; return; }
        var gap = t.x - (cur.x + cur.w), lim = Math.max(4, Math.min(cur.h, t.h) * 1.4);
        if (gap <= lim && gap >= -Math.max(2, t.h * 0.25)) {
          cur.s += ' ' + t.s; cur.w = Math.max(cur.x + cur.w, t.x + t.w) - cur.x; cur.h = Math.max(cur.h, t.h);
        } else { out.push(cur); cur = { s: t.s, x: t.x, y: t.y, h: t.h, w: t.w }; }
      });
      if (cur) out.push(cur);
    });
    return out;
  }
  function mergeTextRows(texts) {
    var items = (texts || []).map(function (t) {
      return { s: String(t.s || '').trim(), x: +t.x || 0, y: +t.y || 0, h: +t.h || 8, w: +t.w || 0 };
    }).filter(function (t) { return t.s; }).sort(function (a, b) { return b.y - a.y || a.x - b.x; });
    var rows = [];
    items.forEach(function (t) {
      var row = null;
      for (var i = 0; i < rows.length; i++) {
        if (Math.abs(rows[i].y - t.y) <= Math.max(2, Math.min(rows[i].h, t.h) * 0.65)) { row = rows[i]; break; }
      }
      if (!row) { row = { y: t.y, h: t.h, items: [] }; rows.push(row); }
      row.items.push(t); row.h = Math.max(row.h, t.h);
      row.y = (row.y * (row.items.length - 1) + t.y) / row.items.length;
    });
    return rows.map(function (r) {
      r.items.sort(function (a, b) { return a.x - b.x; });
      var x0 = r.items[0].x, x1 = x0, pieces = [];
      r.items.forEach(function (t) { pieces.push(t.s); x1 = Math.max(x1, t.x + t.w); });
      return { s: pieces.join(' ').replace(/\s+/g, ' ').trim(), x: x0, y: r.y, h: r.h, w: x1 - x0 };
    });
  }
  function inferScaleDen(texts, box) {
    var items = (texts || []).map(function (t) {
      return { s: String(t.s || '').replace(/：/g, ':').trim(), x: +t.x || 0, y: +t.y || 0, h: +t.h || 8, w: +t.w || 0 };
    }).filter(function (t) { return t.s; });
    var candidates = [];
    function add(s, x, y, w, h, direct) {
      var re = /(?:^|[^\d])1\s*:\s*(\d{1,4})(?:[^\d]|$)/g, m;
      while ((m = re.exec(String(s || '').replace(/\s+/g, ' ')))) {
        var den = +m[1];
        if (den < 5 || den > 1000) continue;
        candidates.push({ den: den, s: s, x: x, y: y, w: w || 0, h: h || 8, direct: !!direct });
      }
    }
    items.forEach(function (t) { add(t.s, t.x, t.y, t.w, t.h, true); });
    mergeTextRuns(items).forEach(function (t) { add(t.s, t.x, t.y, t.w, t.h, false); });
    if (!candidates.length) return { den: null, source: 'default', text: '' };
    candidates.sort(function (a, b) {
      var da = box ? boxDistance([a.x, a.y - a.h, a.x + a.w, a.y + a.h], box) : 0;
      var db = box ? boxDistance([b.x, b.y - b.h, b.x + b.w, b.y + b.h], box) : 0;
      return da - db || (a.direct === b.direct ? 0 : a.direct ? -1 : 1);
    });
    return { den: candidates[0].den, source: 'text', text: candidates[0].s };
  }
  function planCrop(D, lclass, corePts) {
    var paths = D.paths || [], core = corePts || [], coreBox = core.length ? bboxPts(core) : null, pts = core.slice(), bb;
    if (coreBox) {
      var span = Math.max(coreBox[2] - coreBox[0], coreBox[3] - coreBox[1], 1);
      var margin = Math.max(span * 0.06, 25);
      var search = [coreBox[0] - margin, coreBox[1] - margin, coreBox[2] + margin, coreBox[3] + margin];
      paths.forEach(function (p) {
        if (!p.pts || p.pts.length < 2 || lclass(p.L) !== 'flat' || p.f === 'w') return;
        /* Сравниваем не полный bbox пути (в PDF одной кривой может быть вся стена),
           а видимые отрезки около плана. Иначе длинная полилиния целиком пропадает из crop. */
        var near = p.f === 'd' ? clipPolygon(p.pts, search) : [].concat.apply([], clipPolyline(p.pts, search));
        if (near.length) pts.push.apply(pts, near);
      });
      bb = pts.length ? bboxPts(pts) : coreBox;
    } else {
      var flat = paths.filter(function (p) {
        if (!p.pts || p.pts.length < 2 || p.f === 'w' || lclass(p.L) !== 'flat') return false;
        var pb = bboxPts(p.pts), w = pb[2] - pb[0], h = pb[3] - pb[1];
        return (!D.w || w < D.w * 0.9) && (!D.h || h < D.h * 0.9);
      });
      var all = [];
      flat.forEach(function (p) { all.push.apply(all, p.pts); });
      bb = all.length ? bboxPts(all) : [0, 0, D.w || 1, D.h || 1];
    }
    var pad = Math.max(Math.max(bb[2] - bb[0], bb[3] - bb[1]) * 0.035 + 5, 8);
    return [bb[0] - pad, bb[1] - pad, bb[2] + pad, bb[3] + pad];
  }
  function grid(segs, cell) {
    var H = new Map();
    function key(x, y) { return Math.round(x / cell) + ',' + Math.round(y / cell); }
    segs.forEach(function (s) { [s.a, s.b].forEach(function (p) { var k = key(p[0], p[1]), a = H.get(k); if (a) a.push(s); else H.set(k, [s]); }); });
    return {
      near: function (pt, tol, cb) {
        var r = Math.ceil(tol / cell), cx = Math.round(pt[0] / cell), cy = Math.round(pt[1] / cell);
        for (var i = cx - r; i <= cx + r; i++) for (var j = cy - r; j <= cy + r; j++) { var a = H.get(i + ',' + j); if (a) for (var k = 0; k < a.length; k++) if (cb(a[k]) === true) return true; }
        return false;
      }
    };
  }

  /* ------------------------------------------------------------------ легенда: таблицы со значками и подписями */
  function findLegends(D) {
    var segs = segsOf(D.paths, function (p) { return p.f !== 'w'; });
    var hor = segs.filter(function (s) { return Math.abs(s.a[1] - s.b[1]) < 0.3 && Math.abs(s.a[0] - s.b[0]) > 40; });
    var groups = {};
    hor.forEach(function (s) {
      var x0 = Math.min(s.a[0], s.b[0]), x1 = Math.max(s.a[0], s.b[0]);
      var k = Math.round(x0) + ':' + Math.round(x1);
      (groups[k] = groups[k] || { x0: x0, x1: x1, ys: [] }).ys.push(s.a[1]);
    });
    var out = [];
    Object.keys(groups).forEach(function (k) {
      var g = groups[k];
      var ys = g.ys.slice().sort(function (a, b) { return b - a; }).filter(function (y, i, arr) { return i === 0 || arr[i - 1] - y > 0.8; });
      if (ys.length < 3) return;
      /* линии столбцов: вертикали, оба конца которых лежат на линиях строк */
      var onRow = function (y) { return ys.some(function (yy) { return Math.abs(yy - y) < 1.2; }); };
      var vx = segs.filter(function (s) { return Math.abs(s.a[0] - s.b[0]) < 0.3 && s.a[0] > g.x0 - 1 && s.a[0] < g.x1 + 1 && Math.abs(s.a[1] - s.b[1]) > 5 && onRow(s.a[1]) && onRow(s.b[1]); })
        .map(function (s) { return s.a[0]; }).sort(function (a, b) { return a - b; })
        .filter(function (x, i, arr) { return i === 0 || x - arr[i - 1] > 1; });
      var cols = [g.x0].concat(vx.filter(function (x) { return x > g.x0 + 2 && x < g.x1 - 2; })).concat([g.x1]);
      var rows = [];
      for (var r = 0; r + 1 < ys.length; r++) {
        var y1 = ys[r], y0 = ys[r + 1];
        if (y1 - y0 < 6 || y1 - y0 > 60) continue;
        var cells = [];
        for (var c = 0; c + 1 < cols.length; c++) {
          var cx0 = cols[c], cx1 = cols[c + 1];
          var inner = segs.filter(function (s) {
            return s.a[0] > cx0 + 0.4 && s.b[0] > cx0 + 0.4 && s.a[0] < cx1 - 0.4 && s.b[0] < cx1 - 0.4 && s.a[1] > y0 + 0.4 && s.b[1] > y0 + 0.4 && s.a[1] < y1 - 0.4 && s.b[1] < y1 - 0.4;
          });
          var tx = D.texts.filter(function (t) { var tyc = t.y + t.h * 0.3; return t.x >= cx0 - 1 && t.x < cx1 && tyc > y0 && tyc < y1; });
          cells.push({ x0: cx0, x1: cx1, segs: inner, text: tx.map(function (t) { return t.s; }).join(' ').trim() });
        }
        var sym = cells.filter(function (c) { return c.segs.length >= 2 && !/[A-Za-zА-Яа-я]{3,}/.test(c.text); }).sort(function (a, b) { return b.segs.length - a.segs.length; })[0];
        if (!sym) continue;
        var label = cells.filter(function (c) { return c !== sym; }).map(function (c) { return c.text; })
          .filter(function (t) { return t && !/^[IVXХ\d.\s№]+$/.test(t); }).join(' ').trim();
        if (!/[А-Яа-яA-Za-z]{3,}/.test(label)) continue;
        rows.push({ label: label, segs: sym.segs, box: [sym.x0, y0, sym.x1, y1] });
      }
      if (rows.length >= 2) out.push({ box: [g.x0, ys[ys.length - 1], g.x1, ys[0]], rows: rows });
    });
    return out;
  }

  /* шаблоны значков из строк легенды (несколько значков в одной ячейке — по разрыву по x) */
  function templatesOf(legends) {
    var T = [];
    legends.forEach(function (lg, li) {
      lg.rows.forEach(function (row, ri) {
        var sg = row.segs.slice();
        if (!sg.length) return;
        var xs = sg.map(function (s) { return [Math.min(s.a[0], s.b[0]), Math.max(s.a[0], s.b[0])]; }).sort(function (a, b) { return a[0] - b[0]; });
        var cuts = [], reach = xs[0][1];
        xs.slice(1).forEach(function (q) { if (q[0] > reach + 1.5) cuts.push((reach + q[0]) / 2); reach = Math.max(reach, q[1]); });
        var bounds = [-1e9].concat(cuts).concat([1e9]);
        for (var k = 0; k + 1 < bounds.length; k++) {
          var part = sg.filter(function (s) { var m = (s.a[0] + s.b[0]) / 2; return m >= bounds[k] && m < bounds[k + 1]; });
          if (!part.length) continue;
          var pts = []; part.forEach(function (s) { pts.push(s.a, s.b); });
          var bb = bboxPts(pts), cx = (bb[0] + bb[2]) / 2, cy = (bb[1] + bb[3]) / 2;
          var tsegs = [];
          part.forEach(function (s) {
            var a = [s.a[0] - cx, s.a[1] - cy], b = [s.b[0] - cx, s.b[1] - cy];
            if (!tsegs.some(function (q) { return q.f === s.f && ((dist(q.a, a) < 0.05 && dist(q.b, b) < 0.05) || (dist(q.a, b) < 0.05 && dist(q.b, a) < 0.05)); })) tsegs.push({ a: a, b: b, f: s.f });
          });
          /* «розетка, влагостойкая р.» при двух значках в ячейке: подпись делится по запятым */
          var lab = row.label, parts = row.label.split(/\s*[,;]\s*/).filter(Boolean);
          if (bounds.length > 2) {
            if (parts.length === bounds.length - 1) { lab = parts[k]; if (k && !/[а-яё]{5,}\s+[а-яё]{3,}/i.test(lab) && !/розетк|выключ|светил|переключ/i.test(lab)) lab = parts[0] + ' ' + lab; }
            else lab = row.label + ' (' + (k + 1) + ')';
          }
          var gt = guessType(lab);
          T.push({ id: 'L' + li + '_' + ri + (bounds.length > 2 ? '_' + (k + 1) : ''), label: lab, segs: tsegs,
                   size: Math.hypot(bb[2] - bb[0], bb[3] - bb[1]), layers: uniq(part.map(function (s) { return s.L; })), map: gt });
        }
      });
    });
    return T;
  }
  function uniq(a) { var o = []; a.forEach(function (x) { if (o.indexOf(x) < 0) o.push(x); }); return o; }

  /* ------------------------------------------------------------------ поиск значков по образцу */
  /* T — шаблоны; segs — отрезки плана. Подобие (масштаб, поворот, зеркало). Каждый отрезок плана достаётся
     только одному значку — самому полному (двойная розетка не распадается на две одинарные). */
  function matchAll(T, segs, opt) {
    opt = opt || {};
    var kMin = opt.kMin || 0.15, kMax = opt.kMax || 1.3, need = opt.need || 0.9;
    var G = grid(segs, 1.0);
    function hasSeg(a, b, tol, f) {
      var found = null;
      G.near(a, tol, function (s) {
        if (s.f !== f) return;
        if ((dist(s.a, a) < tol && dist(s.b, b) < tol) || (dist(s.b, a) < tol && dist(s.a, b) < tol)) { found = s; return true; }
      });
      return found;
    }
    var hits = [];
    T.forEach(function (t, ti) {
      if (!t.segs.length) return;
      var ref = t.segs.reduce(function (m, s) { return dist(s.a, s.b) > dist(m.a, m.b) ? s : m; }, t.segs[0]);
      var rl = dist(ref.a, ref.b), ra = Math.atan2(ref.b[1] - ref.a[1], ref.b[0] - ref.a[0]);
      segs.forEach(function (s) {
        if (s.f !== ref.f) return;
        var k = dist(s.a, s.b) / rl;
        if (k < kMin || k > kMax) return;
        [[s.a, s.b], [s.b, s.a]].forEach(function (pr) {
          var s0 = pr[0], s1 = pr[1], sa = Math.atan2(s1[1] - s0[1], s1[0] - s0[0]);
          [1, -1].forEach(function (mir) {
            var th = sa - ra * mir, c = Math.cos(th) * k, si = Math.sin(th) * k;
            var r0x = ref.a[0], r0y = ref.a[1] * mir;
            var tx = s0[0] - (c * r0x - si * r0y), ty = s0[1] - (si * r0x + c * r0y);
            var T2 = function (p) { var x = p[0], y = p[1] * mir; return [c * x - si * y + tx, si * x + c * y + ty]; };
            var tol = Math.max(0.25, 0.06 * t.size * k), used = [], miss = 0, lim = t.segs.length * (1 - need);
            for (var q = 0; q < t.segs.length; q++) {
              var u = hasSeg(T2(t.segs[q].a), T2(t.segs[q].b), tol, t.segs[q].f);
              if (u) used.push(u); else if (++miss > lim) return;
            }
            var own = used.filter(function (u2) { return u2.f !== 'w'; });
            hits.push({ ok: used.length, score: used.length - 3 * (t.segs.length - used.length), ti: ti, c: T2([0, 0]), size: t.size * k, k: k, rot: ((th * 180 / Math.PI) % 360 + 360) % 360, mir: mir, own: own });
          });
        });
      });
    });
    hits.sort(function (a, b) { return b.score - a.score || b.size - a.size; });   /* неполное совпадение штрафуется: значок с лишними деталями не перебивает точный */
    var taken = new Set(), acc = [];
    hits.forEach(function (h) {
      var dup = 0; h.own.forEach(function (s) { if (taken.has(s)) dup++; });
      if (dup > 0.3 * h.own.length) return;
      h.own.forEach(function (s) { taken.add(s); });
      acc.push(h);
    });
    return { hits: acc, taken: taken };
  }

  /* оставшиеся значки без легенды (светильники и пр.): связные мелкие фигуры, сгруппированные по форме */
  function leftoverShapes(segs, taken, maxSize, minSize) {
    var paths = {};
    segs.forEach(function (s) { if (!taken.has(s) && s.f !== 'w') (paths[s.pi] = paths[s.pi] || []).push(s); });
    var items = [];
    Object.keys(paths).forEach(function (pi) {
      var sg = paths[pi], pts = []; sg.forEach(function (s) { pts.push(s.a, s.b); });
      var bb = bboxPts(pts);
      if (Math.max(bb[2] - bb[0], bb[3] - bb[1]) <= maxSize) items.push({ sg: sg, bb: bb });
    });
    /* объединение касающихся путей */
    var par = items.map(function (_, i) { return i; });
    function f(i) { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; }
    var G = grid([].concat.apply([], items.map(function (it, i) { return it.sg.map(function (s) { return { a: s.a, b: s.b, it: i }; }); })), 1.0);
    items.forEach(function (it, i) {
      it.sg.forEach(function (s) { [s.a, s.b].forEach(function (p) { G.near(p, 0.4, function (q) { if (dist(q.a, p) < 0.4 || dist(q.b, p) < 0.4) { var x = f(i), y = f(q.it); if (x !== y) par[x] = y; } }); }); });
    });
    var comps = {};
    items.forEach(function (it, i) { var r = f(i); (comps[r] = comps[r] || []).push(it); });
    var groups = {};
    Object.keys(comps).forEach(function (r) {
      var sg = [].concat.apply([], comps[r].map(function (it) { return it.sg; }));
      var pts = []; sg.forEach(function (s) { pts.push(s.a, s.b); });
      var bb = bboxPts(pts), size = Math.hypot(bb[2] - bb[0], bb[3] - bb[1]);
      if (size > maxSize * 1.42 || size < minSize) return;
      var lens = sg.map(function (s) { return Math.round(dist(s.a, s.b) / 0.4); }).sort(function (a, b) { return a - b; });
      var key = sg.length + '|' + Math.round(size / 0.8) + '|' + lens.join(',') + '|' + sg.filter(function (s) { return s.f === 'd'; }).length;
      var g = groups[key] = groups[key] || { key: key, items: [], segs: sg, size: size };
      g.items.push({ c: [(bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2], size: size });
    });
    return Object.keys(groups).map(function (k) { return groups[k]; }).sort(function (a, b) { return b.items.length - a.items.length || b.size - a.size; });
  }

  /* ------------------------------------------------------------------ разбор страницы целиком */
  function analyze(D, opt) {
    opt = opt || {};
    var cls = opt.layers || {};
    var lclass = function (L) { var k = L == null ? '' : L; return cls[k] || guessLayer(L); };
    var legends = findLegends(D);
    var T = templatesOf(legends);
    var inLeg = function (p) { return legends.some(function (lg) { return p[0] > lg.box[0] - 2 && p[0] < lg.box[2] + 2 && p[1] > lg.box[1] - 2 && p[1] < lg.box[3] + 2; }); };
    var symSegs = segsOf(D.paths, function (p) { return lclass(p.L) === 'sym' && !inLeg(p.pts[0]); });
    var M = matchAll(T, symSegs);
    var ks = M.hits.map(function (h) { return h.k; }).sort(function (a, b) { return a - b; });
    var kMed = ks.length ? ks[ks.length >> 1] : null;
    /* все значки одного масштаба: отбросить находки другого масштаба (случайные совпадения) */
    var hits = kMed ? M.hits.filter(function (h) { return Math.abs(h.k / kMed - 1) < 0.12; }) : M.hits;
    var maxT = T.reduce(function (m, t) { return Math.max(m, t.size); }, 0) * (kMed || 0.7);
    var shapes = leftoverShapes(symSegs, M.taken, Math.max(maxT, 12) * 0.75, Math.max(maxT, 12) * 0.12);
    /* фигура без легенды как образец: найти все её копии (в том числе слипшиеся с соседними значками) */
    shapes = shapes.filter(function (g) { return g.segs.length >= 3; }).slice(0, 24);
    var taken2 = new Set(M.taken);
    shapes.forEach(function (g) {
      var pts = []; g.segs.forEach(function (s) { pts.push(s.a, s.b); });
      var b2 = bboxPts(pts), cx = (b2[0] + b2[2]) / 2, cy = (b2[1] + b2[3]) / 2;
      var tpl = { segs: g.segs.map(function (s2) { return { a: [s2.a[0] - cx, s2.a[1] - cy], b: [s2.b[0] - cx, s2.b[1] - cy], f: s2.f }; }), size: g.size };
      var free = symSegs.filter(function (s2) { return !taken2.has(s2); });
      var R = matchAll([tpl], free, { kMin: 0.97, kMax: 1.03, need: 0.9 });
      if (R.hits.length >= g.items.length) {
        g.items = R.hits.map(function (h) { return { c: h.c, size: h.size, rot: h.rot }; });
        R.taken.forEach(function (s2) { taken2.add(s2); });
      }
      g.tpl = tpl;
      g.sig = g.segs.length + ':' + Math.round(g.size / 0.8);
    });
    shapes.sort(function (a, b) { return b.items.length - a.items.length || b.size - a.size; });
    /* Масштаб ищем в подписи, в том числе если PDF.js разделил «1:45» на несколько текстовых фрагментов. */
    var pts = [];
    D.paths.forEach(function (p) { if (lclass(p.L) === 'mebel') pts.push.apply(pts, p.pts); });
    hits.forEach(function (h) { pts.push(h.c); });
    var coreBox = pts.length ? bboxPts(pts) : null;
    var scale = inferScaleDen(D.texts, coreBox);
    /* Геометрия ближайших стен входит в область импорта; линии режутся по границам, а не теряются целиком. */
    var crop = planCrop(D, lclass, pts);
    var bb = coreBox || [crop[0], crop[1], crop[2], crop[3]];
    legends.forEach(function (lg) { if (lg.box[0] > bb[2] && lg.box[0] < crop[2]) crop[2] = Math.max(bb[2] + 8, Math.min(crop[2], lg.box[0] - 2)); });
    return { page: D, legends: legends, templates: T, hits: hits, kMed: kMed, shapes: shapes,
      scaleDen: scale.den, scaleSource: scale.source, scaleText: scale.text, crop: crop, lclass: lclass };
  }

  /* подсчёт по типам */
  function counts(A) {
    var c = {};
    A.hits.forEach(function (h) { var t = A.templates[h.ti]; c[t.id] = (c[t.id] || 0) + 1; });
    return c;
  }

  /* ------------------------------------------------------------------ подложка и вставки для AutoCAD */
  function inside(p, b) { return p[0] >= b[0] && p[0] <= b[2] && p[1] >= b[1] && p[1] <= b[3]; }
  function inPoly(p, pts) {
    var ins = false;
    for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      var a = pts[i], b = pts[j];
      if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1] + 1e-12) + a[0]) ins = !ins;
    }
    return ins;
  }
  /* направление на ближайшую стену (градусы): по краям залитых стен, иначе по линиям квартиры.
     Нормаль к краю стены, к осям — точно (стены почти всегда прямые). */
  function wallDir(c, W, maxD) {
    var best = null;
    W.g.near(c, maxD, function (s) {
      var dx = s.b[0] - s.a[0], dy = s.b[1] - s.a[1], L2 = dx * dx + dy * dy; if (L2 < 0.25) return;
      var t = Math.max(0, Math.min(1, ((c[0] - s.a[0]) * dx + (c[1] - s.a[1]) * dy) / L2)), q = [s.a[0] + t * dx, s.a[1] + t * dy], d = dist(c, q);
      if (d < maxD && (!best || d < best.d - 1e-6)) best = { d: d, q: q, s: s };
    });
    if (!best) return null;
    var s = best.s, L = dist(s.a, s.b), n = [-(s.b[1] - s.a[1]) / L, (s.b[0] - s.a[0]) / L];
    var side = (best.q[0] - c[0]) * n[0] + (best.q[1] - c[1]) * n[1];
    if (Math.abs(side) < 0.3 && s.poly) {
      /* значок на краю стены: нормаль внутрь заливки стены */
      var m = [(s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2];
      side = inPoly([m[0] + n[0] * 0.6, m[1] + n[1] * 0.6], s.poly) ? 1 : -1;
    }
    if (side < 0) n = [-n[0], -n[1]];
    var ang = Math.atan2(n[1], n[0]) * 180 / Math.PI, sn = Math.round(ang / 90) * 90;
    return Math.abs(ang - sn) < 4 ? sn : ang;
  }
  function wallIndex(A) {
    var D = A.page, polys = [], segs = [];
    D.paths.forEach(function (p) {
      if (p.f === 'd' && p.pts.length >= 4 && A.lclass(p.L) === 'flat') {
        polys.push(p.pts);
        for (var i = 1; i < p.pts.length; i++) segs.push({ a: p.pts[i - 1], b: p.pts[i], poly: p.pts });
      }
    });
    if (polys.length < 3) segs = segsOf(D.paths, function (p) { return A.lclass(p.L) === 'flat' && p.f !== 'w'; });
    return { g: grid(segs, 2.0), n: polys.length };
  }
  function f1(v) { return (Math.round(v * 10) / 10).toFixed(1).replace(/\.0$/, '.0'); }
  function lispStr(s) { return '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[^\x20-\x7e]/g, function (ch) { return '\\U+' + ('0000' + ch.charCodeAt(0).toString(16).toUpperCase()).slice(-4); }) + '"'; }

  /* plan — { underlay: A (страница для подложки), pages: [{A, sheet: 'p'|'l'}], mapping: {templateId|shapeKey: {b, v, n}} }
     Возвращает текст для LISP и сводку. Координаты — мм от левого нижнего угла подложки. */
  function buildOutput(plan) {
    var U = plan.underlay, D = U.page, den = Number(plan.scaleDen || U.scaleDen);
    if (!isFinite(den) || den <= 0) throw new Error('Не удалось определить масштаб PDF. Укажите знаменатель масштаба перед вставкой.');
    var s = 25.4 / 72 * den;
    var crop = plan.crop || U.crop, ox = crop[0], oy = crop[1];
    var X = function (p) { return [(p[0] - ox) * s, (p[1] - oy) * s]; };
    var lines = [];
    var nUL = 0;
    function emitPath(tag, kind, pts) {
      if (pts.length < 2) return;
      var maxPoints = 40, stepPoints = maxPoints - 1;
      if (tag === 'F') {
        /* Контуры заливки должны замыкаться одной записью; очень сложную заливку пропускаем,
           но её отдельный обводящий контур ниже всё равно сохраняется. */
        if (pts.length < 3 || pts.length > maxPoints) return;
        lines.push('(F ' + kind + ' ' + pts.map(function (q) { return f1(q[0]) + ' ' + f1(q[1]); }).join(' ') + ')');
        nUL++; return;
      }
      for (var i = 0; i < pts.length; i += (i ? stepPoints : maxPoints)) {
        var part = pts.slice(Math.max(0, i - (i ? 1 : 0)), Math.min(pts.length, i + maxPoints));
        if (part.length < 2) continue;
        lines.push('(' + tag + ' ' + kind + ' ' + part.map(function (q) { return f1(q[0]) + ' ' + f1(q[1]); }).join(' ') + ')');
        nUL++;
      }
    }
    D.paths.forEach(function (p) {
      var k = U.lclass(p.L);
      if ((k !== 'flat' && k !== 'mebel') || !p.pts || p.pts.length < 2 || p.f === 'w') return;
      var kind = k === 'mebel' ? 1 : 0;
      if (p.f === 'd') {
        if (!plan.fills) return;
        var poly = clipPolygon(p.pts, crop);
        if (poly.length < 3) return;
        emitPath('F', kind, poly.map(X));
        return;
      }
      var closed = p.pts.length > 2 && dist(p.pts[0], p.pts[p.pts.length - 1]) < 0.01;
      if (closed && p.pts.every(function (q) { return inside(q, crop); })) {
        emitPath(p.pts.length <= 40 ? 'C' : 'L', kind, p.pts.slice(0, -1).map(X));
        return;
      }
      /* Ключевое исправление: пересекающую crop стену не отбрасываем целиком, а обрезаем по границе. */
      clipPolyline(p.pts, crop).forEach(function (chunk) { emitPath('L', kind, chunk.map(X)); });
    });
    var W = (crop[2] - crop[0]) * s, H = (crop[3] - crop[1]) * s;
    var syms = [], summary = {}, rooms = (plan.rooms || []).filter(function (r) { return +r.no >= 1 && +r.no <= 99 && String(r.name || '').trim(); }), markers = plan.markers || [];
    if (plan.includeSymbols !== false) (plan.pages || []).forEach(function (pg) {
      var A = pg.A, Dp = A.page;
      var W = wallIndex(A);
      /* страницы могут быть сдвинуты относительно друг друга: совмещение по рамке плана (обычно совпадает) */
      var dx = pg.dx || 0, dy = pg.dy || 0;
      /* с какой стороны значка дизайнера стена (в осях легенды): голосование по значкам у стен, по каждому типу */
      var R = Math.PI / 180, votes = {}, allv = {};
      A.hits.forEach(function (h) {
        var wd = wallDir(h.c, W, 25); if (wd == null) return;
        var th = h.rot * R, x = Math.cos(wd * R), y = Math.sin(wd * R);
        var x1 = x * Math.cos(-th) - y * Math.sin(-th), y1 = x * Math.sin(-th) + y * Math.cos(-th);
        if (h.mir === -1) y1 = -y1;
        var a = ((Math.round(Math.atan2(y1, x1) / R / 90) * 90) % 360 + 360) % 360;
        var key = h.ti; (votes[key] = votes[key] || {})[a] = (votes[key][a] || 0) + 1; allv[a] = (allv[a] || 0) + 1;
      });
      function mode(o) { var b = null; Object.keys(o || {}).forEach(function (k) { if (b == null || o[k] > o[b]) b = k; }); return b == null ? null : +b; }
      var gmode = mode(allv);
      function place(m, c, h) {
        if (!m || !m.b) return;
        var rot = 0;
        if (m.b !== 'C' && h) {
          /* свой тип — только при уверенном большинстве (≥3 голосов, ≥70 %), иначе общее для всех значков листа */
          var vt = votes[h.ti] || {}, tot = 0; Object.keys(vt).forEach(function (k) { tot += vt[k]; });
          var wt = mode(vt);
          if (wt == null || tot < 3 || vt[wt] < 0.7 * tot) wt = gmode;
          var wdir;
          if (wt != null) {
            var x = Math.cos(wt * R), y = Math.sin(wt * R) * h.mir, th = h.rot * R;
            wdir = Math.atan2(x * Math.sin(th) + y * Math.cos(th), x * Math.cos(th) - y * Math.sin(th)) / R;
          } else wdir = wallDir(c, W, 25);
          if (wdir == null) wdir = h.rot;
          var sn = Math.round(wdir / 90) * 90; if (Math.abs(wdir - sn) < 4) wdir = sn;
          rot = wdir - wallAxis(m.b, m.v);
        } else if (m.b !== 'C') { var wd2 = wallDir(c, W, 25); rot = wd2 == null ? 0 : wd2 - wallAxis(m.b, m.v); }
        var n = Math.max(1, m.n || 1), step = 160, rr = rot * Math.PI / 180;
        var tx = -Math.sin(rr), ty = Math.cos(rr);   /* вдоль стены */
        var P = X([c[0] + dx, c[1] + dy]);
        for (var i = 0; i < n; i++) {
          var off = (i - (n - 1) / 2) * step;
          syms.push('(S ' + lispStr(pg.sheet) + ' ' + lispStr(m.b) + ' ' + m.v + ' ' + f1(P[0] + tx * off) + ' ' + f1(P[1] + ty * off) + ' ' + f1(((rot % 360) + 360) % 360) + ')');
        }
        var key = m.b + m.v; summary[key] = (summary[key] || 0) + n;
      }
      var mp = pg.mapping || plan.mapping || {};
      A.hits.forEach(function (h) { var t = A.templates[h.ti]; place(mp[t.id] || t.map, h.c, h); });
      A.shapes.forEach(function (g) { var m = mp[g.key]; if (m && m.b) g.items.forEach(function (it) { place(m, it.c, null); }); });
    });
    var head = '(GIPPLAN 1 ' + den + ' ' + f1(W) + ' ' + f1(H) + ' ' + lispStr(plan.name || 'plan') + ')';
    var roomLines = rooms.map(function (r) { return '(R ' + (+r.no) + ' ' + lispStr(String(r.name).trim()) + ')'; });
    var markerLines = markers.filter(function (m) { return +m.no >= 1 && +m.no <= 15; }).map(function (m) { var p = X([m.x, m.y]); return '(N ' + (+m.no) + ' ' + f1(p[0]) + ' ' + f1(p[1]) + ')'; });
    return { text: [head].concat(lines, roomLines, markerLines, syms).join('\n') + '\n', nUnderlay: nUL, nSym: syms.length, nRooms: roomLines.length, nRoomMarkers: markerLines.length, summary: summary, W: W, H: H };
  }

  var API = { VIS: VIS, BLOCK_NAME: BLOCK_NAME, guessType: guessType, guessLayer: guessLayer, extractPage: extractPage, extractTextPage: extractTextPage,
              extractRooms: extractRooms, extractRoomsByNames: extractRoomsByNames,
              findRoomMarkers: findRoomMarkers, mergeRoomMarkers: mergeRoomMarkers, findLegends: findLegends,
              templatesOf: templatesOf, matchAll: matchAll, leftoverShapes: leftoverShapes, analyze: analyze, counts: counts, buildOutput: buildOutput,
              segsOf: segsOf, bboxPts: bboxPts, clipPolyline: clipPolyline, clipPolygon: clipPolygon,
              inferScaleDen: inferScaleDen, planCrop: planCrop, mergeTextRows: mergeTextRows, mergeTextRuns: mergeTextRuns,
              lispStr: lispStr, wallIndex: wallIndex, wallDir: wallDir };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.GIPPLAN = API;
})(typeof window !== 'undefined' ? window : globalThis);
