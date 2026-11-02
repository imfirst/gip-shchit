/* ГИП · Помещения: извлечение векторной геометрии и текста из PDF (pdf.js 6.x).
   Результат: { w, h, paths: [{ pts, closed, sc, fc, w, dash, L }], texts: [{ s, x, y, h, w, rot }] }
   Координаты — пункты PDF, Y вверх (как в AutoCAD). sc/fc — цвет обводки/заливки '#rrggbb' (fc = null, если заливки нет). */
(function (root) {
  'use strict';
  function mul(a, b) { return [a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3], a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3], a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5]]; }
  function tp(m, x, y) { return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; }
  function hex2(v) { v = Math.max(0, Math.min(255, Math.round(v))); return (v < 16 ? '0' : '') + v.toString(16); }
  function rgbHex(r, g, b) { return '#' + hex2(r) + hex2(g) + hex2(b); }
  function colorOf(a) {
    if (Array.isArray(a) && a.length && typeof a[0] === 'string') a = a[0];          /* pdf.js 6: ["#rrggbb"] */
    if (typeof a === 'string') return a.length === 7 ? a.toLowerCase() : '#000000';
    if (a && a.length >= 3) return rgbHex(a[0], a[1], a[2]);
    return '#000000';
  }
  function bez(out, p0, c1, c2, p3) {
    for (var t = 1; t <= 8; t++) {
      var u = t / 8, v = 1 - u;
      out.push([v * v * v * p0[0] + 3 * v * v * u * c1[0] + 3 * v * u * u * c2[0] + u * u * u * p3[0],
                v * v * v * p0[1] + 3 * v * v * u * c1[1] + 3 * v * u * u * c2[1] + u * u * u * p3[1]]);
    }
  }

  async function extractPage(pdfjs, doc, pno) {
    var page = await doc.getPage(pno);
    var vp = page.getViewport({ scale: 1 });
    var oc = null; try { oc = await doc.getOptionalContentConfig(); } catch (e) { oc = null; }
    function ocName(id) { try { var g = oc && oc.getGroup(id); return g ? g.name : null; } catch (e) { return null; } }
    var ol = await page.getOperatorList();
    var O = pdfjs.OPS;
    var ctm = [1, 0, 0, 1, 0, 0], st = [], ocs = [];
    var sc = '#000000', fc = '#000000', lw = 1, dash = false, fa = 1, sa = 1;
    var paths = [];
    var layers = {};
    function curLayer() { for (var i = ocs.length - 1; i >= 0; i--) if (ocs[i]) return ocs[i]; return null; }
    function scaleOf() { return Math.sqrt(Math.abs(ctm[0] * ctm[3] - ctm[1] * ctm[2])) || 1; }
    function emit(d, op) {
      var stroke = op === O.stroke || op === O.closeStroke || op === O.fillStroke || op === O.eoFillStroke || op === O.closeFillStroke || op === O.closeEOFillStroke;
      var fill = op === O.fill || op === O.eoFill || op === O.fillStroke || op === O.eoFillStroke || op === O.closeFillStroke || op === O.closeEOFillStroke;
      if (!stroke && !fill) return;
      var L = curLayer(), w = lw * scaleOf();
      var subs = [], cur = null;
      function flush(closed) {
        if (cur && cur.length > 1) subs.push({ pts: cur, closed: closed });
        cur = null;
      }
      for (var i = 0; i < d.length;) {
        var c = d[i];
        if (c === 0) { flush(false); cur = [tp(ctm, d[i + 1], d[i + 2])]; i += 3; }
        else if (c === 1) { if (!cur) cur = []; cur.push(tp(ctm, d[i + 1], d[i + 2])); i += 3; }
        else if (c === 2) {
          var p0 = cur && cur.length ? cur[cur.length - 1] : tp(ctm, d[i + 1], d[i + 2]);
          if (!cur) cur = [p0];
          bez(cur, p0, tp(ctm, d[i + 1], d[i + 2]), tp(ctm, d[i + 3], d[i + 4]), tp(ctm, d[i + 5], d[i + 6])); i += 7;
        } else if (c === 3) {
          var q0 = cur && cur.length ? cur[cur.length - 1] : tp(ctm, d[i + 1], d[i + 2]);
          if (!cur) cur = [q0];
          var qc = tp(ctm, d[i + 1], d[i + 2]), q3 = tp(ctm, d[i + 3], d[i + 4]);
          bez(cur, q0, [q0[0] + 2 / 3 * (qc[0] - q0[0]), q0[1] + 2 / 3 * (qc[1] - q0[1])], [q3[0] + 2 / 3 * (qc[0] - q3[0]), q3[1] + 2 / 3 * (qc[1] - q3[1])], q3); i += 5;
        } else if (c === 4) {
          if (cur && cur.length > 1) { cur.push(cur[0].slice()); }
          flush(true); i += 1;
        } else { break; }
      }
      flush(false);
      subs.forEach(function (s) {
        var a = s.pts[0], b = s.pts[s.pts.length - 1];
        var closed = s.closed || Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-3;
        layers[L == null ? '' : L] = (layers[L == null ? '' : L] || 0) + 1;
        paths.push({ pts: s.pts, closed: closed, sc: stroke ? sc : null, fc: fill ? fc : null, fa: fill ? fa : 0, w: stroke ? w : 0, dash: dash, L: L });
      });
    }
    for (var i = 0; i < ol.fnArray.length; i++) {
      var fn = ol.fnArray[i], a = ol.argsArray[i];
      if (fn === O.save) st.push([ctm, sc, fc, lw, dash, fa, sa]);
      else if (fn === O.restore) { if (st.length) { var s0 = st.pop(); ctm = s0[0]; sc = s0[1]; fc = s0[2]; lw = s0[3]; dash = s0[4]; fa = s0[5]; sa = s0[6]; } }
      else if (fn === O.transform) ctm = mul(a, ctm);
      else if (fn === O.paintFormXObjectBegin) { st.push([ctm, sc, fc, lw, dash, fa, sa]); if (a && a[0]) ctm = mul(a[0], ctm); }
      else if (fn === O.paintFormXObjectEnd) { if (st.length) { var s1 = st.pop(); ctm = s1[0]; sc = s1[1]; fc = s1[2]; lw = s1[3]; dash = s1[4]; fa = s1[5]; sa = s1[6]; } }
      else if (fn === O.beginMarkedContentProps) ocs.push(a && a[0] === 'OC' && a[1] && a[1].id ? ocName(a[1].id) : null);
      else if (fn === O.beginMarkedContent) ocs.push(null);
      else if (fn === O.endMarkedContent) ocs.pop();
      else if (fn === O.setStrokeRGBColor) sc = colorOf(a);
      else if (fn === O.setFillRGBColor) fc = colorOf(a);
      else if (fn === O.setStrokeGray) sc = typeof a[0] === 'string' ? colorOf(a) : rgbHex(a[0], a[0], a[0]);
      else if (fn === O.setFillGray) fc = typeof a[0] === 'string' ? colorOf(a) : rgbHex(a[0], a[0], a[0]);
      else if (fn === O.setLineWidth) lw = a[0];
      else if (fn === O.setGState) { (a[0] || []).forEach(function (kv) { if (kv[0] === 'ca') fa = +kv[1]; else if (kv[0] === 'CA') sa = +kv[1]; }); }
      else if (fn === O.setDash) dash = !!(a[0] && a[0].length);
      else if (fn === O.constructPath) {
        /* pdf.js 5+/6: [операция рисования, [данные пути], границы] */
        if (a && typeof a[0] === 'number' && a[1] && a[1][0]) emit(a[1][0], a[0]);
      }
    }
    var tc = await page.getTextContent(), texts = [];
    tc.items.forEach(function (t) {
      if (!t.str || !t.str.trim()) return;
      var m = t.transform, h = Math.hypot(m[2], m[3]) || 8;
      texts.push({ s: t.str, x: m[4], y: m[5], h: h, w: t.width || 0, rot: Math.round(Math.atan2(m[1], m[0]) * 180 / Math.PI) });
    });
    return { no: pno, w: vp.width, h: vp.height, paths: paths, texts: texts, layers: layers };
  }
  var API = { extractPage: extractPage };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.GIPEXTRACT = API;
})(typeof window !== 'undefined' ? window : globalThis);
