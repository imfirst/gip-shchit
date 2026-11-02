/* ГИП · Помещения: разбор плана дизайнера (после extract.js).
   — группы геометрии (слои PDF или стиль линий) и их назначение: стена / окно / дверь / мебель / убрать;
   — экспликация по строкам текста (№, название, площадь дизайнера); маркеры номеров на плане;
   — масштаб (из подписи «1:50» или по двум точкам); контуры помещений и площади (растр + заливка от маркера);
   — файл обмена для LISP (GIPROOMSAPPLY). Работает в браузере и в Node (без растровой части). */
(function (root) {
  'use strict';
  var PT_MM = 25.4 / 72; /* 1 pt PDF = 0.3528 мм на бумаге */

  /* ------------------------------------------------------------------ группы геометрии */
  var ROLES = { wall: 'Стена', window: 'Окно', door: 'Дверь', furn: 'Мебель', drop: 'Убрать' };
  function guessRoleByName(name) {
    var s = String(name || '').toLowerCase().replace(/ё/g, 'е');
    if (/размер|выноск|обозначен|текст|аннот|штамп|рамк|ос[ьи]\b|оси\b|сетк|электр|освещ|свет|розет|выключ|слаботоч|вентил|отоплен|радиатор|подложк|зон|площад|помещен|надпис|высотн|отметк|разрез|узел|вид\b|спец|табл|легенд/.test(s)) return 'drop';
    if (/окн/.test(s)) return 'window';
    if (/двер|проем/.test(s)) return 'door';
    if (/стен|констр|перегор|колонн|несущ|архитект|пол\b.*стен/.test(s)) return 'wall';
    return 'furn';
  }
  function pathLen(p) { var L = 0; for (var i = 1; i < p.pts.length; i++) L += Math.hypot(p.pts[i][0] - p.pts[i - 1][0], p.pts[i][1] - p.pts[i - 1][1]); return L; }
  function bboxOf(pts, b) {
    b = b || [1e9, 1e9, -1e9, -1e9];
    pts.forEach(function (p) { if (p[0] < b[0]) b[0] = p[0]; if (p[1] < b[1]) b[1] = p[1]; if (p[0] > b[2]) b[2] = p[0]; if (p[1] > b[3]) b[3] = p[1]; });
    return b;
  }
  function polyArea(pts) { var a = 0; for (var i = 1; i < pts.length; i++) a += pts[i - 1][0] * pts[i][1] - pts[i][0] * pts[i - 1][1]; return a / 2; }

  function groupKey(D, p, useLayers) {
    if (useLayers) return 'L:' + (p.L || '(без слоя)');
    var fa = p.fc ? Math.round((p.fa == null ? 1 : p.fa) * 100) : 0;
    var chrom = p.sc && rgbInt(p.sc) != null ? ':c' + p.sc : '';      /* цветные линии (электрика) — отдельной группой */
    return (p.fc && !p.sc ? 'F' + fa + ':' + p.fc : 'S:' + (Math.round(p.w * 100) / 100) + chrom) + (p.dash ? ':dash' : '');
  }
  /* Группы: если в PDF есть слои дизайнера — по слоям, иначе по стилю (толщина/заливка). */
  function buildGroups(D) {
    var names = {}; D.paths.forEach(function (p) { names[p.L || ''] = 1; });
    var useLayers = Object.keys(names).length > 1;
    var G = {}, order = [];
    D.paths.forEach(function (p, i) {
      var k = groupKey(D, p, useLayers);
      var g = G[k]; if (!g) { g = G[k] = { id: k, label: '', n: 0, len: 0, fills: 0, strokes: 0, idx: [], role: 'furn' }; order.push(g); }
      g.n++; g.idx.push(i); g.len += pathLen(p); if (p.fc) g.fills++; if (p.sc) g.strokes++;
      p.g = k;
    });
    order.forEach(function (g) {
      var a = D.paths[g.idx[0]];
      if (useLayers) { g.label = g.id.slice(2); g.role = guessRoleByName(g.label); }
      else {
        var kind = g.id.charAt(0) === 'F' ? 'заливка ' + Math.round((a.fa == null ? 1 : a.fa) * 100) + '%' : 'линия ' + (Math.round(a.w * 100) / 100) + ' пт' + (/:c#/.test(g.id) ? ', цвет ' + a.sc : '') + (a.dash ? ', штрих' : '');
        g.label = kind; g.role = 'furn';
      }
    });
    if (!useLayers) styleRoles(D, order);
    order.sort(function (a, b) { return b.len - a.len; });
    return { groups: order, useLayers: useLayers };
  }
  /* Без слоёв: самая толстая заметная линия — стены (кроме рамки листа), тонкие штрихи/пунктир — убрать, заливки — убрать. */
  function styleRoles(D, groups) {
    var strokes = groups.filter(function (g) { return g.id.charAt(0) === 'S' && !/dash/.test(g.id); });
    var mids = strokes.filter(function (g) { var w = parseFloat(g.id.slice(2)); return w >= 0.2 && g.len > 500 && !/:c#/.test(g.id); }).sort(function (a, b) { return parseFloat(a.id.slice(2)) - parseFloat(b.id.slice(2)); });
    groups.forEach(function (g) {
      var w = g.id.charAt(0) === 'S' ? parseFloat(g.id.slice(2)) : 0;
      if (g.id.charAt(0) === 'F') g.role = 'drop';
      else if (/dash/.test(g.id)) g.role = 'drop';
      else if (w < 0.06) g.role = 'drop';
    });
    if (mids.length) { mids[0].role = 'wall'; }
    if (mids.length > 1 && parseFloat(mids[mids.length - 1].id.slice(2)) >= 0.4) mids[mids.length - 1].role = 'drop'; /* рамка листа */
  }

  /* ------------------------------------------------------------------ экспликация */
  function numTok(t) { return /^\d{1,2}$/.test(t.s.trim()) ? +t.s.trim() : null; }
  function areaOf(s) {
    var m = /^(\d{1,3}(?:[.,]\d{1,2}))\s*(?:м\s*[²2]|кв\.?\s*м|m2)?$/i.exec(s.trim());
    return m ? parseFloat(m[1].replace(',', '.')) : null;
  }
  /* Строки таблицы: колонка «номеров» (одинаковый x, шаг по y постоянный, номера 1,2,3…), справа в той же строке — название и площадь. */
  function parseExplication(D) {
    var T = D.texts.filter(function (t) { return t.rot === 0 || t.rot == null; });
    var nums = T.filter(function (t) { return numTok(t) != null; });
    var cols = [];
    nums.forEach(function (t) {
      var c = cols.filter(function (c) { return Math.abs(c.x - t.x) < Math.max(3, t.h * 0.5); })[0];
      if (!c) cols.push(c = { x: t.x, items: [] });
      c.items.push(t);
    });
    var best = null;
    cols.forEach(function (c) {
      var its = c.items.slice().sort(function (a, b) { return b.y - a.y; });
      /* серии последовательных номеров с постоянным шагом строки */
      var i = 0;
      while (i < its.length) {
        var run = [its[i]], j = i + 1;
        while (j < its.length) {
          var prev = run[run.length - 1], cur = its[j];
          var dy = prev.y - cur.y;
          if (numTok(cur) === numTok(prev) + 1 && dy > prev.h * 0.8 && dy < prev.h * 4 && (run.length < 2 || Math.abs(dy - (run[0].y - run[1].y)) < prev.h * 0.6)) { run.push(cur); j++; }
          else break;
        }
        if (run.length >= 3) { var sc = run.length; if (!best || sc > best.run.length) best = { run: run, col: c }; }
        i = Math.max(j, i + 1);
      }
    });
    if (!best) return { rooms: [], box: null };
    var rooms = [], used = [];
    var xMax = 1e9;
    /* следующая колонка (экспликация в две-три колонки): ограничиваем справа */
    cols.forEach(function (c) { if (c !== best.col && c.x > best.col.x + 30 && c.items.some(function (t) { return best.run.some(function (r) { return Math.abs(r.y - t.y) < r.h * 0.4; }); })) xMax = Math.min(xMax, c.x - 1); });
    best.run.forEach(function (r) {
      var row = T.filter(function (t) { return t !== r && Math.abs(t.y - r.y) < r.h * 0.45 && t.x > r.x + 2 && t.x < xMax; }).sort(function (a, b) { return a.x - b.x; });
      var area = null, nameParts = [];
      row.forEach(function (t) {
        var a = areaOf(t.s);
        if (a != null && nameParts.length) { area = a; return; }
        nameParts.push(t.s.trim());
        used.push(t);
      });
      var name = nameParts.join(' ').replace(/\s+/g, ' ').trim();
      rooms.push({ no: numTok(r), name: name, areaD: area, tok: r });
      used.push(r);
    });
    var box = bboxOf(rooms.map(function (r) { return [r.tok.x, r.tok.y]; }));
    return { rooms: rooms.filter(function (r) { return r.name; }), box: [box[0] - 5, box[1] - 5, (xMax < 1e8 ? xMax : box[0] + 400), box[3] + 20], tokens: used };
  }
  /* Номера на плане: текст «N» вне таблицы экспликации */
  function findMarkers(D, expl) {
    var skip = new Set(expl.tokens || []);
    var inTable = function (t) { var b = expl.box; return b && t.x >= b[0] - 2 && t.x <= b[2] + 200 && t.y >= b[1] - 2 && t.y <= b[3] + 2; };
    var byNo = {};
    D.texts.forEach(function (t) {
      var n = numTok(t); if (n == null || skip.has(t) || inTable(t)) return;
      (byNo[n] = byNo[n] || []).push({ no: n, x: t.x + (t.w || 0) / 2, y: t.y + t.h * 0.33, h: t.h });
    });
    var rooms = {}; (expl.rooms || []).forEach(function (r) { rooms[r.no] = 1; });
    var out = [];
    Object.keys(byNo).forEach(function (k) { if (rooms[k]) out.push(byNo[k].sort(function (a, b) { return b.h - a.h; })[0]); });
    return out;
  }
  function scaleFromText(D) {
    var hit = null;
    D.texts.forEach(function (t) { var m = /(?:^|[^0-9])1\s*[:：]\s*(\d{2,3})\s*$/.exec(t.s.trim()); if (m && !hit) hit = { den: +m[1], text: t.s.trim() }; });
    return hit;
  }

  /* ------------------------------------------------------------------ контуры помещений (растр) */
  /* Стены (роль wall и window) → барьер; заливка от маркера номера; барьер расширяется на closeMm, чтобы закрыть дверные проёмы,
     затем область возвращается на ту же величину (не заходя в стены). Площадь — по пикселям. */
  function roomsByRaster(D, opt) {
    var mmPt = opt.mmPerPt, closeMm = opt.closeMm || 1000, pxPerM = opt.pxPerM || 40;
    var pxPerPt = pxPerM * mmPt / 1000; /* пикселей на пункт PDF */
    var bb = opt.bbox; var W = Math.ceil((bb[2] - bb[0]) * pxPerPt) + 4, H = Math.ceil((bb[3] - bb[1]) * pxPerPt) + 4;
    var cv = (typeof OffscreenCanvas !== 'undefined') ? new OffscreenCanvas(W, H) : (function () { var c = document.createElement('canvas'); c.width = W; c.height = H; return c; })();
    var ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#000'; ctx.strokeStyle = '#000'; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    function X(p) { return (p[0] - bb[0]) * pxPerPt + 2; } function Y(p) { return (bb[3] - p[1]) * pxPerPt + 2; }
    D.paths.forEach(function (p) {
      if (!opt.barrier(p)) return;
      ctx.beginPath(); p.pts.forEach(function (q, i) { if (i) ctx.lineTo(X(q), Y(q)); else ctx.moveTo(X(q), Y(q)); });
      if (p.fc && p.closed) ctx.fill();
      if (p.sc) { ctx.lineWidth = Math.max(1.5, p.w * pxPerPt); ctx.stroke(); }
    });
    (opt.extraLines || []).forEach(function (l) { ctx.beginPath(); ctx.moveTo(X(l[0]), Y(l[0])); ctx.lineTo(X(l[1]), Y(l[1])); ctx.lineWidth = 3; ctx.stroke(); });
    var img = ctx.getImageData(0, 0, W, H).data, N = W * H;
    var wall = new Uint8Array(N); for (var i = 0; i < N; i++) wall[i] = img[i * 4] < 128 ? 1 : 0;
    var r = Math.max(1, Math.round(closeMm / 1000 * pxPerM / 2));
    /* расширение барьера на r (квадратное, разделимое) */
    function dilate(src, rr) {
      var tmp = new Uint8Array(N), out = new Uint8Array(N), x, y, k, v;
      for (y = 0; y < H; y++) { var run = 0; for (x = 0; x < W; x++) { /* горизонталь */
        v = 0; for (k = Math.max(0, x - rr); k <= Math.min(W - 1, x + rr); k++) if (src[y * W + k]) { v = 1; break; } tmp[y * W + x] = v; } }
      for (x = 0; x < W; x++) for (y = 0; y < H; y++) { v = 0; for (k = Math.max(0, y - rr); k <= Math.min(H - 1, y + rr); k++) if (tmp[k * W + x]) { v = 1; break; } out[y * W + x] = v; }
      return out;
    }
    var barrier = dilate(wall, r);
    var res = [];
    var taken = new Uint8Array(N);
    opt.markers.forEach(function (m) {
      var sx = Math.round(X([m.x, m.y])), sy = Math.round(Y([m.x, m.y]));
      var reg = new Uint8Array(N), q = [], cnt = 0, qi = 0, leaked = false;
      if (sx < 0 || sy < 0 || sx >= W || sy >= H || barrier[sy * W + sx]) { /* маркер на барьере — ищем ближайшую свободную */
        var found = false; for (var d = 1; d < 40 && !found; d++) for (var dx = -d; dx <= d && !found; dx++) for (var dy = -d; dy <= d && !found; dy++) { var nx = sx + dx, ny = sy + dy; if (nx >= 0 && ny >= 0 && nx < W && ny < H && !barrier[ny * W + nx]) { sx = nx; sy = ny; found = true; } }
        if (!found) { res.push({ no: m.no, ok: false }); return; }
      }
      q.push(sy * W + sx); reg[sy * W + sx] = 1;
      while (qi < q.length) {
        var c = q[qi++], cx = c % W, cy = (c - cx) / W; cnt++;
        if (cx === 0 || cy === 0 || cx === W - 1 || cy === H - 1) leaked = true;
        var nb = [c - 1, c + 1, c - W, c + W];
        for (var j = 0; j < 4; j++) { var n = nb[j]; if (n < 0 || n >= N) continue; if (j < 2 && Math.abs(((n % W) - cx)) !== 1) continue; if (!reg[n] && !barrier[n]) { reg[n] = 1; q.push(n); } }
      }
      /* вернуть область на r пикселей (не в стены) */
      var grown = dilate(reg, r), area = 0, g2 = new Uint8Array(N);
      for (var k2 = 0; k2 < N; k2++) if (grown[k2] && !wall[k2] && !taken[k2]) { g2[k2] = 1; area++; }
      for (var k3 = 0; k3 < N; k3++) if (g2[k3]) taken[k3] = 1;
      var sqm = area / (pxPerM * pxPerM);
      res.push({ no: m.no, ok: !leaked, leaked: leaked, area: sqm, poly: tracePoly(g2, W, H, function (px, py) { return [(px - 2) / pxPerPt + bb[0], bb[3] - (py - 2) / pxPerPt]; }) });
    });
    return res;
  }
  /* внешний контур области: границы пикселей → петли → самая большая → упрощение */
  function tracePoly(mask, W, H, toPdf) {
    var next = {}, starts = [];
    function filled(x, y) { return x >= 0 && y >= 0 && x < W && y < H && mask[y * W + x] === 1; }
    function key(x, y) { return y * (W + 1) + x; }
    function add(x0, y0, x1, y1) { var k = key(x0, y0); (next[k] = next[k] || []).push([x1, y1]); starts.push(k); }
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      if (!mask[y * W + x]) continue;
      if (!filled(x, y - 1)) add(x, y, x + 1, y);
      if (!filled(x + 1, y)) add(x + 1, y, x + 1, y + 1);
      if (!filled(x, y + 1)) add(x + 1, y + 1, x, y + 1);
      if (!filled(x - 1, y)) add(x, y + 1, x, y);
    }
    var best = null, seen = {};
    starts.forEach(function (k0) {
      if (seen[k0]) return;
      var loop = [], k = k0, guard = 0;
      while (next[k] && next[k].length && guard++ < 2000000) {
        var e = next[k].pop(); seen[k] = 1;
        var xx = k % (W + 1), yy = (k - xx) / (W + 1);
        loop.push([xx, yy]);
        k = key(e[0], e[1]);
        if (k === k0) break;
      }
      if (loop.length > 3 && (!best || loop.length > best.length)) best = loop;
    });
    if (!best) return [];
    var h = best.length >> 1, a = rdp(best.slice(0, h + 1), 1.2), b = rdp(best.slice(h).concat([best[0]]), 1.2);
    var simp = a.slice(0, -1).concat(b.slice(0, -1));
    return simp.map(function (p) { return toPdf(p[0], p[1]); });
  }
  function rdp(pts, eps) {
    if (pts.length < 3) return pts;
    var a = pts[0], b = pts[pts.length - 1], dmax = 0, idx = 0, dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
    for (var i = 1; i < pts.length - 1; i++) { var d = Math.abs(dy * (pts[i][0] - a[0]) - dx * (pts[i][1] - a[1])) / L; if (d > dmax) { dmax = d; idx = i; } }
    if (dmax > eps) { var l = rdp(pts.slice(0, idx + 1), eps), r = rdp(pts.slice(idx), eps); return l.slice(0, -1).concat(r); }
    return [a, b];
  }


  /* Перемычки в дверных проёмах: концевые рёбра стен (короткие), которые смотрят друг на друга через проём 450-1500 мм.
     Две линии (по обеим сторонам проёма) замыкают контур помещения для BOUNDARY. Координаты в мм (X,Y уже в системе вывода). */
  function bridgeLines(segs) {
    var caps = [], out = [];
    segs.forEach(function (s, i) {
      var dx = s[2] - s[0], dy = s[3] - s[1], L = Math.sqrt(dx * dx + dy * dy);
      if (L >= 40 && L <= 700) caps.push({ i: i, a: [s[0], s[1]], b: [s[2], s[3]], L: L, ux: dx / L, uy: dy / L, mx: (s[0] + s[2]) / 2, my: (s[1] + s[3]) / 2 });
    });
    var cand = [];
    for (var i = 0; i < caps.length; i++) for (var j = i + 1; j < caps.length; j++) {
      var p = caps[i], q = caps[j];
      if (Math.abs(p.ux * q.uy - p.uy * q.ux) > 0.03) continue;           /* параллельны */
      if (Math.abs(p.L - q.L) > 0.3 * Math.max(p.L, q.L)) continue;        /* одинаковая толщина стены */
      var vx = q.mx - p.mx, vy = q.my - p.my, d = Math.sqrt(vx * vx + vy * vy);
      if (d < 450 || d > 1500) continue;
      if (Math.abs(vx * p.ux + vy * p.uy) > 40) continue;                  /* торцы напротив друг друга */
      cand.push({ p: p, q: q, d: d });
    }
    cand.sort(function (u, v) { return u.d - v.d; });
    function crosses(x1, y1, x2, y2, s) {                                   /* пересекает ли отрезок стену (не в концах) */
      function o(ax, ay, bx, by, cx, cy) { return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax); }
      var d1 = o(x1, y1, x2, y2, s[0], s[1]), d2 = o(x1, y1, x2, y2, s[2], s[3]), d3 = o(s[0], s[1], s[2], s[3], x1, y1), d4 = o(s[0], s[1], s[2], s[3], x2, y2);
      return d1 * d2 < -1e-6 && d3 * d4 < -1e-6;
    }
    var taken = {};
    cand.forEach(function (c) {
      var p = c.p, q = c.q;
      if (taken[p.i] || taken[q.i]) return;
      for (var k = 0; k < segs.length; k++) if (crosses(p.mx, p.my, q.mx, q.my, segs[k])) return;   /* в проёме должно быть пусто */
      taken[p.i] = taken[q.i] = 1;
      var same = (Math.pow(p.a[0] - q.a[0], 2) + Math.pow(p.a[1] - q.a[1], 2)) <= (Math.pow(p.a[0] - q.b[0], 2) + Math.pow(p.a[1] - q.b[1], 2));
      out.push([p.a[0], p.a[1], (same ? q.a : q.b)[0], (same ? q.a : q.b)[1]]);
      out.push([p.b[0], p.b[1], (same ? q.b : q.a)[0], (same ? q.b : q.a)[1]]);
    });
    return out;
  }

  /* ------------------------------------------------------------------ вывод для LISP */
  /* Строка для LISP: всё не-ASCII (и «~») как ~uXXXX — AutoLISP-читалка такие последовательности не трогает, декодирует gip:rm-dec */
  function lispStr(s) { return '"' + String(s).replace(/\\/g, '/').replace(/"/g, "'").replace(/[^\x20-\x7d]/g, function (ch) { return '~u' + ('0000' + ch.charCodeAt(0).toString(16).toUpperCase()).slice(-4); }) + '"'; }
  /* '#rrggbb' -> целое RGB для AutoCAD (420); null — ч/б/серый (рисуется обычным цветом) */
  function rgbInt(hex) {
    var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || ''); if (!m) return null;
    var r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16);
    if (Math.max(r, g, b) - Math.min(r, g, b) < 28) return null;
    return r * 65536 + g * 256 + b;
  }
  function f1(v) { return (Math.round(v * 10) / 10).toString(); }
  /* P: { name, mmPerPt, origin:[x,y] (pt), keepRole(path)->'wall'|'window'|'door'|'furn'|null, rooms:[{no,name,areaD,area,h,marker:[x,y],poly}], hDefault, crop:[x0,y0,x1,y1] } */
  function buildOutput(D, P) {
    var k = P.mmPerPt, ox = P.origin[0], oy = P.origin[1], lines = [], nL = 0;
    function X(p) { return (p[0] - ox) * k; } function Y(p) { return (p[1] - oy) * k; }
    function xy(pts) { return pts.map(function (p) { return f1(X(p)) + ' ' + f1(Y(p)); }).join(' '); }
    lines.push('(GIPROOMS 1 ' + lispStr(P.name || '') + ' ' + f1(P.hDefault || 0) + ' ' + f1(P.W || 0) + ' ' + f1(P.H || 0) + ')');
    P.rooms.forEach(function (r) {
      var mk = r.marker ? f1(X(r.marker)) + ' ' + f1(Y(r.marker)) : '0 0';
      lines.push('(R ' + r.no + ' ' + lispStr(r.name) + ' ' + (r.area == null ? 0 : (Math.round(r.area * 100) / 100)) + ' ' + (r.areaD == null ? 0 : r.areaD) + ' ' + f1(r.h || P.hDefault || 0) + ' ' + mk + ')');
      if (r.poly && r.poly.length > 2) lines.push('(P ' + r.no + ' ' + xy(r.poly) + ')');
    });
    var kcode = { wall: 0, window: 0, door: 1, furn: 1 }, wsegs = [];
    D.paths.forEach(function (p, pi) {
      var role = P.keepRole(p, pi); if (!role) return;
      if (p.pts.length < 2) return;
      /* заливки (hatch/solid) в подложку не попадают: крупные заливки стен и техники убираем, мелкие (розетки) оставляем контуром */
      var fillOnly = p.fc && !p.sc;
      if (fillOnly) {
        var bb = bboxOf(p.pts);
        if (Math.max(bb[2] - bb[0], bb[3] - bb[1]) * k > 300) return;
      }
      var tag = p.closed || fillOnly ? 'C' : 'L';
      lines.push('(' + tag + ' ' + kcode[role] + ' ' + xy(p.pts) + ')'); nL++;
      if (role === 'wall' && !fillOnly) for (var si = 1; si < p.pts.length + (p.closed ? 1 : 0); si++) {
        var A = p.pts[si - 1], B = p.pts[si % p.pts.length];
        wsegs.push([X(A), Y(A), X(B), Y(B)]);
      }
    });
    /* листы электрики (розетки, свет, тёплый пол): каждый — отдельный блок; координаты совмещены с подложкой */
    (P.extras || []).forEach(function (ex, ei) {
      lines.push('(EH ' + ei + ' ' + lispStr(ex.title) + ')');
      var k2 = ex.mmPerPt, o2 = ex.origin, sh = ex.shift, lim = [-1500, -1500, (P.W || 0) + 1500, (P.H || 0) + 1500];
      function X2(p) { return (p[0] - o2[0]) * k2 + sh[0]; } function Y2(p) { return (p[1] - o2[1]) * k2 + sh[1]; }
      ex.D.paths.forEach(function (p, pi) {
        if (!ex.keep[p.g] || p.pts.length < 2) return;
        var q = p.pts.map(function (a) { return [X2(a), Y2(a)]; }), bb = bboxOf(q);
        if (bb[0] < lim[0] || bb[1] < lim[1] || bb[2] > lim[2] || bb[3] > lim[3]) return;
        var xy2 = q.map(function (a) { return f1(a[0]) + ' ' + f1(a[1]); }).join(' '), size = Math.max(bb[2] - bb[0], bb[3] - bb[1]);
        /* цвета электрики сохраняем как у дизайнера; чёрное/серое/белое — обычным цветом. Заливки: цветные любого размера, ч/б только мелкие (розетки) */
        if (p.fc && q.length > 2 && (p.fa == null || p.fa > 0.05)) {
          var fcol = rgbInt(p.fc);
          if (fcol != null) { lines.push('(FK ' + (10 + ei) + ' ' + fcol + ' ' + xy2 + ')'); nL++; }
          else if (size <= 300) { lines.push('(F ' + (10 + ei) + ' ' + xy2 + ')'); nL++; }
        }
        if (p.sc) {
          var scol = rgbInt(p.sc), tg = p.closed ? 'C' : 'L';
          lines.push(scol != null ? '(' + tg + 'K ' + (10 + ei) + ' ' + scol + ' ' + xy2 + ')' : '(' + tg + ' ' + (10 + ei) + ' ' + xy2 + ')'); nL++;
        }
      });
    });
    var bl = bridgeLines(wsegs);
    bl.forEach(function (b) { lines.push('(J ' + f1(b[0]) + ' ' + f1(b[1]) + ' ' + f1(b[2]) + ' ' + f1(b[3]) + ')'); });
    return { text: lines.join('\n') + '\n', nGeom: nL, nBridge: bl.length / 2 };
  }

  var API = { ROLES: ROLES, buildGroups: buildGroups, guessRoleByName: guessRoleByName, parseExplication: parseExplication, findMarkers: findMarkers,
    scaleFromText: scaleFromText, rgbInt: rgbInt, roomsByRaster: roomsByRaster, buildOutput: buildOutput, bboxOf: bboxOf, pathLen: pathLen, polyArea: polyArea, PT_MM: PT_MM, lispStr: lispStr };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.GIPROOMSLIB = API;
})(typeof window !== 'undefined' ? window : globalThis);
