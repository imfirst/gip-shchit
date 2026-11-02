/* ГИП · Помещения — страница панели AutoCAD: PDF дизайнера → подложка 1:1, номера и экспликация помещений */
const X = window.GIPEXTRACT, R = window.GIPROOMSLIB;
const $ = (id) => document.getElementById(id);
const host = window.chrome && window.chrome.webview;
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ROLE_COL = { wall: '#1d4ed8', window: '#1d4ed8', door: '#23935a', furn: '#4b5563', drop: '#e6c9c9' };
const MEM_KEY = 'gip-rooms-mem-v1';
function loadMem() { try { return JSON.parse(localStorage.getItem(MEM_KEY) || '{}'); } catch (e) { return {}; } }
function saveMem() { try { localStorage.setItem(MEM_KEY, JSON.stringify(S.mem)); } catch (e) { /* без памяти */ } }

const S = { name: '', doc: null, pageNo: 1, D: null, G: null, roleOf: {}, rooms: [], rot: 0, D0: null, den: null, denSrc: '', extra: [], mem: loadMem(),
  view: { ox: 0, oy: 0, k: 1 }, cal: null, assign: null, batches: null, sel: null, hot: null };

/* ------------------------------------------------------------------ служебное */
let toastT = null;
function toast(msg, ms) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, ms || 4200); }
function prog(on, frac, txt) { $('prog').hidden = !on; if (!on) return; $('progBar').style.width = Math.round((frac || 0) * 100) + '%'; $('progT').textContent = txt || ''; }
let pdfjs = null;
async function lib() {
  if (!pdfjs) {
    pdfjs = await import('./pdfjs/pdf.min.js');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('./pdfjs/pdf.worker.min.js', location.href).href;
  }
  return pdfjs;
}
const mmPt = () => R.PT_MM * (S.den || 50);
const num = (id, d) => { const v = parseFloat(String($(id).value).replace(',', '.')); return Number.isFinite(v) ? v : d; };

/* ------------------------------------------------------------------ файл */
async function openFile(file) {
  try {
    prog(true, 0.05, 'Читаю PDF…');
    const pj = await lib();
    const data = new Uint8Array(await file.arrayBuffer());
    S.doc = await pj.getDocument({ data: data }).promise;
    S.name = file.name.replace(/\.pdf$/i, '');
    $('dropT').textContent = file.name;
    const sel = $('pageSel'); sel.innerHTML = ''; S.pages = [];
    for (let i = 1; i <= S.doc.numPages; i++) {
      const pg = await S.doc.getPage(i), tc = await pg.getTextContent();
      const strs = tc.items.map((x) => x.str.replace(/\s+/g, ' ').trim()).filter(Boolean);
      const blob = strs.filter((t) => TITLE_RE.test(t)).slice(0, 8).join(' | ');
      const kind = classifyPage(blob || strs.slice(0, 6).join(' '));
      S.pages.push({ no: i, blob: blob, kind: kind });
      const label = (blob || strs.slice(0, 4).join(' ')).slice(0, 70);
      sel.insertAdjacentHTML('beforeend', '<option value="' + i + '">' + i + '. ' + esc(label || 'без текста') + (kind ? ' [' + KIND_RU[kind] + ']' : '') + '</option>');
    }
    $('pageRow').hidden = S.doc.numPages < 2;
    const furn = S.pages.filter((q) => q.kind === 'furniture')[0], first = furn ? furn.no : 1;
    sel.value = String(first);
    await loadPage(first);
    await autoExtras();
  } catch (e) { prog(false); toast('Не удалось открыть PDF: ' + (e && e.message || e), 7000); }
}
async function loadPage(no) {
  prog(true, 0.3, 'Извлекаю геометрию…');
  const pj = await lib();
  S.pageNo = no;
  S.D0 = await X.extractPage(pj, S.doc, no); S.rot = 0; S.D = S.D0;
  if (S.D.paths.length < 50) { prog(false); toast('На листе почти нет векторной геометрии. Растровые PDF не поддерживаются: напишите в чат Claude.', 9000); }
  S.G = R.buildGroups(S.D);
  S.G.groups.forEach((g) => { const m = S.mem[g.label]; if (m && R.ROLES[m]) g.role = m; S.roleOf[g.id] = g.role; });
  S.roleOf = {}; S.G.groups.forEach((g) => { S.roleOf[g.id] = g.role; });
  const ex = R.parseExplication(S.D), mk = R.findMarkers(S.D, ex), sc = R.scaleFromText(S.D);
  S.expl = ex;
  S.rooms = ex.rooms.map((r) => { const m = mk.filter((q) => q.no === r.no)[0]; return { no: r.no, name: r.name, areaD: r.areaD, h: '', area: null, ok: null, marker: m ? [m.x, m.y] : null }; });
  S.den = sc ? sc.den : null; S.denSrc = sc ? 'из подписи листа «' + sc.text + '»' : '';
  $('den').value = S.den || '';
  prog(false);
  ['scaleBox', 'layBox', 'roomBox', 'exBox', 'goBox'].forEach((id) => { $(id).hidden = false; });
  S.extra = []; renderExtra(); fillExPages();
  $('empty').hidden = true;
  renderGroups(); renderRooms(); updateScaleInfo(); rebuild(); fit();
  if (!S.rooms.length) toast('Экспликация в PDF не найдена: добавьте помещения вручную (+ Помещение).', 6000);
}

/* ------------------------------------------------------------------ масштаб и калибровка */
function updateScaleInfo() {
  const el = $('scaleInfo');
  if (S.den) el.textContent = 'Масштаб 1:' + S.den + (S.denSrc ? ', ' + S.denSrc : '') + '. 1 пт PDF = ' + (R.PT_MM * S.den).toFixed(2) + ' мм.';
  else el.textContent = 'Масштаб на листе не найден. Задайте знаменатель или откалибруйте по размеру.';
  el.style.color = S.den ? '' : '#b42318';
}
$('den').addEventListener('input', () => { const v = parseFloat($('den').value); S.den = v > 0 ? v : null; S.denSrc = 'введён вручную'; updateScaleInfo(); });
$('calBtn').addEventListener('click', () => { S.cal = { pts: [] }; $('calRow').hidden = true; toast('Щёлкните по двум концам размера (привязка к вершинам линий)', 6000); });
function snap(p) {
  let best = null, bd = 8 / S.view.k;
  S.D.paths.forEach((q) => { if (!keepOrFaint(q)) return; q.pts.forEach((pt) => { const d = Math.hypot(pt[0] - p[0], pt[1] - p[1]); if (d < bd) { bd = d; best = pt; } }); });
  return best || p;
}
function keepOrFaint() { return true; }
function dimValueNear(mid, span) {
  let best = null, bd = 1e9;
  S.D.texts.forEach((t) => {
    const s = t.s.replace(/\s/g, ''); if (!/^\d{3,5}$/.test(s)) return;
    const d = Math.hypot(t.x - mid[0], t.y - mid[1]); const v = +s;
    if (d < Math.max(40, span) && d < bd) { bd = d; best = v; }
  });
  return best;
}
$('calOk').addEventListener('click', () => {
  const c = S.cal; if (!c || c.pts.length < 2) return;
  const mm = num('calMm', 0); if (!(mm > 0)) { toast('Введите размер в мм'); return; }
  const d = Math.hypot(c.pts[0][0] - c.pts[1][0], c.pts[0][1] - c.pts[1][1]);
  let den = mm / d / R.PT_MM;
  [20, 25, 30, 40, 45, 50, 60, 75, 100].forEach((s) => { if (Math.abs(s / den - 1) < 0.02) den = s; });
  S.den = Math.round(den * 100) / 100; S.denSrc = 'по калибровке (' + mm + ' мм)'; $('den').value = S.den;
  S.cal = null; $('calRow').hidden = true; updateScaleInfo(); draw(); toast('Масштаб 1:' + S.den);
});

/* ------------------------------------------------------------------ слои / группы */
function renderGroups() {
  const tb = $('groups').querySelector('tbody'); tb.innerHTML = '';
  S.G.groups.slice(0, 60).forEach((g, i) => {
    const opts = Object.keys(R.ROLES).map((k) => '<option value="' + k + '"' + (g.role === k ? ' selected' : '') + '>' + R.ROLES[k] + '</option>').join('');
    tb.insertAdjacentHTML('beforeend', '<tr data-i="' + i + '"><td class="ttl" title="' + esc(g.label) + '">' + esc(g.label) + '</td><td class="n">' + g.n + '</td><td><select>' + opts + '</select></td></tr>');
  });
  tb.querySelectorAll('tr').forEach((tr) => {
    const g = S.G.groups[+tr.dataset.i];
    tr.querySelector('select').addEventListener('change', (e) => { g.role = e.target.value; S.roleOf[g.id] = g.role; S.mem[g.label] = g.role; saveMem(); rebuild(); });
    tr.addEventListener('mouseenter', () => { S.hot = g.id; tr.classList.add('hot'); draw(); });
    tr.addEventListener('mouseleave', () => { S.hot = null; tr.classList.remove('hot'); draw(); });
  });
}
['cropWalls', 'cutLong', 'longMm'].forEach((id) => $(id).addEventListener('change', rebuild));

/* роль и фильтры → что попадёт в чертёж */
function wallsBox() {
  let b = null; S.D.paths.forEach((p) => { const r = S.roleOf[p.g]; if (r === 'wall' || r === 'window') b = R.bboxOf(p.pts, b); });
  return b;
}
function rebuild() {
  const D = S.D; if (!D) return;
  const wb = wallsBox(), pad = 300 / mmPt();
  const crop = $('cropWalls').checked && wb ? [wb[0] - pad, wb[1] - pad, wb[2] + pad, wb[3] + pad] : null;
  const longPt = $('cutLong').checked ? num('longMm', 1500) / mmPt() : 0;
  S.keep = new Array(D.paths.length);
  let nKeep = 0, bb = null;
  D.paths.forEach((p, i) => {
    let role = S.roleOf[p.g];
    if (role === 'drop') { S.keep[i] = null; return; }
    const b = R.bboxOf(p.pts);
    if (crop && (b[2] < crop[0] || b[0] > crop[2] || b[3] < crop[1] || b[1] > crop[3])) { S.keep[i] = null; return; }
    if (crop && (b[0] < crop[0] - 1 || b[2] > crop[2] + 1 || b[1] < crop[1] - 1 || b[3] > crop[3] + 1) && role === 'furn') { S.keep[i] = null; return; }
    if (longPt && role === 'furn' && !p.closed && p.pts.length === 2 && R.pathLen(p) > longPt) { S.keep[i] = null; return; }
    S.keep[i] = role; nKeep++; bb = R.bboxOf(p.pts, bb);
  });
  S.bbox = bb; S.nKeep = nKeep;
  S.batches = null;
  const w = bb ? ((bb[2] - bb[0]) * mmPt() / 1000).toFixed(1) : '—', h = bb ? ((bb[3] - bb[1]) * mmPt() / 1000).toFixed(1) : '—';
  $('sumLine').textContent = 'Останется ' + nKeep + ' из ' + D.paths.length + ' линий; размер плана ' + w + ' × ' + h + ' м' + (S.den ? '' : ' (масштаб не задан)') + '.';
  draw();
}

/* ------------------------------------------------------------------ помещения */
function renderRooms() {
  const tb = $('rooms').querySelector('tbody'); tb.innerHTML = '';
  S.rooms.forEach((r, i) => {
    const diff = r.area != null && r.areaD ? Math.abs(r.area / r.areaD - 1) : 0;
    const a = r.fit ? '<span class="' + r.fit + '" title="' + esc(r.fitInfo || '') + '">' + (r.area != null ? r.area.toFixed(1) : '—') + '</span>' : (r.area == null ? '' : r.area.toFixed(1));
    tb.insertAdjacentHTML('beforeend', '<tr data-i="' + i + '" class="' + (S.assign === i ? 'sel' : '') + '"><td><span class="pin" title="Указать номер на плане">' + (r.marker ? '◉' : '○') + '</span> <input class="no" value="' + r.no + '" style="width:34px"></td>' +
      '<td><input class="nm" value="' + esc(r.name) + '"></td><td><input class="hh" value="' + esc(r.h) + '" placeholder="' + esc($('hDef').value) + '"></td><td class="n">' + a + '</td><td class="n">' + (r.areaD != null ? Number(r.areaD).toFixed(1) : '') + '</td><td><button class="x" title="Удалить">×</button></td></tr>');
  });
  tb.querySelectorAll('tr').forEach((tr) => {
    const r = S.rooms[+tr.dataset.i];
    tr.querySelector('.no').addEventListener('change', (e) => { r.no = parseInt(e.target.value, 10) || r.no; draw(); });
    tr.querySelector('.nm').addEventListener('change', (e) => { r.name = e.target.value; });
    tr.querySelector('.hh').addEventListener('change', (e) => { r.h = e.target.value; });
    tr.querySelector('.x').addEventListener('click', () => { S.rooms.splice(+tr.dataset.i, 1); renderRooms(); draw(); });
    tr.querySelector('.pin').addEventListener('click', () => { S.assign = S.assign === +tr.dataset.i ? null : +tr.dataset.i; renderRooms(); if (S.assign != null) toast('Щёлкните на плане, где должен стоять номер ' + r.no, 5000); });
  });
}
$('addRoom').addEventListener('click', () => { const n = S.rooms.reduce((m, r) => Math.max(m, r.no), 0) + 1; S.rooms.push({ no: n, name: 'Помещение ' + n, areaD: null, h: '', area: null, marker: null }); renderRooms(); });
$('hDef').addEventListener('change', renderRooms);
/* Автоподбор контуров: перебираем «ширину замыкания» проёмов и набор барьеров (стены/окна, плюс двери),
   выбираем вариант, у которого площадь ближе всего к цифре дизайнера. Нет цифры — самый «тугой» контур без утечки. */
function autoFit() {
  if (!S.den) { toast('Сначала задайте масштаб'); return; }
  const wb = wallsBox(); if (!wb) { toast('Нет линий с ролью «Стена»'); return; }
  const mk = S.rooms.filter((r) => r.marker).map((r) => ({ no: r.no, x: r.marker[0], y: r.marker[1] }));
  if (!mk.length) { toast('Нет номеров на плане'); return; }
  const k2 = Math.pow(mmPt() / 1000, 2), best = {};
  const sets = [(p) => { const r = S.roleOf[p.g]; return r === 'wall' || r === 'window'; }, (p) => { const r = S.roleOf[p.g]; return r === 'wall' || r === 'window' || r === 'door'; }];
  const bridges = R.bridgePt(S.D.paths.filter((p) => S.roleOf[p.g] === 'wall' && !(p.fc && !p.sc)), mmPt());   /* перемычки в проёмах стен */
  toast('Ищу контуры…', 20000);
  setTimeout(() => {
    sets.forEach((barrier, si) => [150, 300, 450, 600, 800, 1000, 1300, 1600].forEach((cm) => {
      const res = R.roomsByRaster(S.D, { mmPerPt: mmPt(), closeMm: cm, pxPerM: 40, bbox: [wb[0] - 10, wb[1] - 10, wb[2] + 10, wb[3] + 10], barrier: barrier, extraLines: bridges, markers: mk });
      res.forEach((x) => {
        if (!x.poly || x.poly.length < 3 || x.leaked) return;
        const area = Math.abs(R.polyArea(x.poly.concat([x.poly[0]]))) * k2;   /* замкнутый контур */ if (!(area > 0.3)) return;
        const r = S.rooms.filter((q) => q.no === x.no)[0]; if (!r) return;
        const d = r.areaD ? Math.abs(area / r.areaD - 1) : null, score = d != null ? d : 1 + cm / 10000 + si * 0.001;
        if (!best[x.no] || score < best[x.no].score) best[x.no] = { score: score, area: area, poly: x.poly, d: d, cm: cm };
      });
    }));
    let ok = 0, warn = 0, bad = 0;
    S.rooms.forEach((r) => {
      const b = best[r.no];
      if (!b) { r.area = null; r.poly = null; r.fit = 'bad'; r.fitInfo = 'контур не найден (утечка через проёмы)'; bad++; return; }
      r.area = b.area; r.poly = b.poly; r.ok = true;
      if (b.d == null) { r.fit = 'warn'; r.fitInfo = 'у дизайнера нет площади: сверить нечем (замыкание ' + b.cm + ' мм)'; warn++; }
      else if (b.d <= 0.03) { r.fit = 'ok'; r.fitInfo = 'расхождение с дизайнером ' + (b.d * 100).toFixed(1) + '%'; ok++; }
      else if (b.d <= 0.08) { r.fit = 'warn'; r.fitInfo = 'расхождение с дизайнером ' + (b.d * 100).toFixed(1) + '% — проверьте контур'; warn++; }
      else { r.fit = 'bad'; r.fitInfo = 'расхождение с дизайнером ' + (b.d * 100).toFixed(1) + '% — обведите вручную в AutoCAD'; bad++; }
    });
    S.batches = null; renderRooms(); draw();
    toast('Контуры: совпали ' + ok + ', проверить ' + warn + ', вручную ' + bad + '. Красные не передаются: их можно обвести в AutoCAD кнопкой «Обвести помещение».', 12000);
  }, 30);
}
$('estBtn').addEventListener('click', autoFit);

/* ------------------------------------------------------------------ просмотр */
const cv = $('cv'); let ctx = cv.getContext('2d');
function resize() { const r = cv.getBoundingClientRect(); cv.width = Math.max(100, Math.round(r.width * devicePixelRatio)); cv.height = Math.max(100, Math.round(r.height * devicePixelRatio)); draw(); }
window.addEventListener('resize', resize);
function fit() {
  if (!S.D) return; resize();
  let b = (S.bbox || [0, 0, S.D.w, S.D.h]).slice(); const ex = S.expl && S.expl.box;
  if ($('txtMode').value === 'expl' && ex && S.bbox) { b = [Math.min(b[0], ex[0]), Math.min(b[1], ex[1] - 10), Math.max(b[2], ex[2] + 220), Math.max(b[3], ex[3] + 60)]; }   /* чтобы экспликация дизайнера была в кадре */
  const W = cv.width, H = cv.height, pad = 30 * devicePixelRatio;
  const k = Math.min((W - 2 * pad) / (b[2] - b[0]), (H - 2 * pad) / (b[3] - b[1]));
  S.view = { k: k, ox: pad - b[0] * k + ((W - 2 * pad) - (b[2] - b[0]) * k) / 2, oy: H - pad + b[1] * k - ((H - 2 * pad) - (b[3] - b[1]) * k) / 2 };
  draw();
}
$('fit').addEventListener('click', fit);
$('txtMode').addEventListener('change', () => fit());
const toScr = (p) => [p[0] * S.view.k + S.view.ox, S.view.oy - p[1] * S.view.k];
const toPdf = (x, y) => [(x - S.view.ox) / S.view.k, (S.view.oy - y) / S.view.k];
function makeBatches() {
  const B = { wall: new Path2D(), furn: new Path2D(), door: new Path2D(), drop: new Path2D() };
  S.D.paths.forEach((p, i) => {
    const role = S.keep[i], tgt = role === 'window' ? 'wall' : (role || 'drop');
    if (!p.sc && !role) return;
    const P2 = B[tgt]; p.pts.forEach((q, j) => { j ? P2.lineTo(q[0], q[1]) : P2.moveTo(q[0], q[1]); });
  });
  S.batches = B;
}
function draw() {
  if (!S.D) return; if (!S.keep) return;
  if (!S.batches) makeBatches();
  const W = cv.width, H = cv.height, v = S.view, dpr = devicePixelRatio;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W, H); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
  ctx.setTransform(v.k, 0, 0, -v.k, v.ox, v.oy);
  const lw = (px) => px * dpr / v.k;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = ROLE_COL.drop; ctx.lineWidth = lw(0.6); ctx.stroke(S.batches.drop);
  ctx.strokeStyle = ROLE_COL.furn; ctx.lineWidth = lw(0.8); ctx.stroke(S.batches.furn);
  ctx.strokeStyle = ROLE_COL.door; ctx.lineWidth = lw(0.9); ctx.stroke(S.batches.door);
  ctx.strokeStyle = ROLE_COL.wall; ctx.lineWidth = lw(1.5); ctx.stroke(S.batches.wall);
  if (S.hot) {
    ctx.strokeStyle = '#e11d48'; ctx.lineWidth = lw(2); ctx.beginPath();
    S.D.paths.forEach((p) => { if (p.g === S.hot) p.pts.forEach((q, j) => { j ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }); });
    ctx.stroke();
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  /* цифры размеров (для калибровки) и номера помещений */
  ctx.fillStyle = '#9ca3af'; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
  S.D.texts.forEach((t) => {
    if (!/^\d[\d\s]{2,5}$/.test(t.s.trim()) || t.rot) return;
    const p = toScr([t.x + t.w / 2, t.y + t.h / 3]); if (t.h * v.k < 4) return;
    ctx.font = Math.max(8, t.h * v.k) + 'px sans-serif'; ctx.fillText(t.s.trim(), p[0], p[1]);
  });
  S.rooms.forEach((r) => {
    if (!r.poly || r.poly.length < 3) return;
    ctx.beginPath(); r.poly.forEach((q, j) => { const p = toScr(q); j ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); }); ctx.closePath();
    const col = r.fit === 'ok' ? '34,197,94' : (r.fit === 'warn' ? '245,158,11' : '220,38,38');
    ctx.fillStyle = 'rgba(' + col + ',0.18)'; ctx.fill(); ctx.strokeStyle = 'rgba(' + col + ',0.9)'; ctx.lineWidth = 1.5 * dpr; ctx.stroke();
  });
  const tm = $('txtMode').value;
  if (tm !== 'none') {
    const bx = S.expl && S.expl.box;
    ctx.fillStyle = '#0f766e'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    S.D.texts.forEach((t) => {
      if (tm === 'expl' && !(bx && t.x >= bx[0] - 4 && t.x <= bx[2] + 260 && t.y >= bx[1] - 4 && t.y <= bx[3] + 60)) return;
      const p = toScr([t.x, t.y]), px = Math.max(7 * dpr, t.h * v.k); if (t.h * v.k < 2.5 * dpr && tm === 'all') return;
      ctx.font = px + 'px sans-serif';
      if (t.rot) { ctx.save(); ctx.translate(p[0], p[1]); ctx.rotate(-t.rot * Math.PI / 180); ctx.fillText(t.s, 0, 0); ctx.restore(); } else ctx.fillText(t.s, p[0], p[1]);
    });
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  }
  S.rooms.forEach((r, i) => {
    if (!r.marker) return; const p = toScr(r.marker), rad = 11 * dpr;
    ctx.beginPath(); ctx.arc(p[0], p[1], rad, 0, 7); ctx.fillStyle = S.assign === i ? '#fde68a' : '#fff'; ctx.fill();
    ctx.lineWidth = 2 * dpr; ctx.strokeStyle = '#e11d48'; ctx.stroke();
    ctx.fillStyle = '#e11d48'; ctx.font = 'bold ' + 12 * dpr + 'px sans-serif'; ctx.fillText(String(r.no), p[0], p[1] + dpr);
  });
  if (S.cal) S.cal.pts.forEach((q) => { const p = toScr(q); ctx.beginPath(); ctx.arc(p[0], p[1], 5 * dpr, 0, 7); ctx.fillStyle = '#e11d48'; ctx.fill(); });
  if (S.cal && S.cal.pts.length === 2) { const a = toScr(S.cal.pts[0]), b = toScr(S.cal.pts[1]); ctx.strokeStyle = '#e11d48'; ctx.lineWidth = 2 * dpr; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
}
let drag = null, moved = 0;
cv.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, ox: S.view.ox, oy: S.view.oy }; moved = 0; cv.setPointerCapture(e.pointerId); cv.classList.add('drag'); });
cv.addEventListener('pointermove', (e) => { if (!drag) return; const dx = (e.clientX - drag.x) * devicePixelRatio, dy = (e.clientY - drag.y) * devicePixelRatio; moved = Math.max(moved, Math.abs(dx) + Math.abs(dy)); S.view.ox = drag.ox + dx; S.view.oy = drag.oy + dy; draw(); });
cv.addEventListener('pointerup', (e) => {
  cv.classList.remove('drag'); const was = drag; drag = null; if (!was || moved > 6) return;
  const r = cv.getBoundingClientRect(), p = toPdf((e.clientX - r.left) * devicePixelRatio, (e.clientY - r.top) * devicePixelRatio);
  if (S.cal) {
    S.cal.pts.push(snap(p));
    if (S.cal.pts.length === 2) {
      const a = S.cal.pts[0], b = S.cal.pts[1], val = dimValueNear([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], Math.hypot(a[0] - b[0], a[1] - b[1]));
      $('calRow').hidden = false; $('calMm').value = val || ''; $('calMm').focus();
    }
    draw(); return;
  }
  if (S.assign != null) { S.rooms[S.assign].marker = p; S.assign = null; renderRooms(); draw(); }
});
cv.addEventListener('wheel', (e) => {
  e.preventDefault(); const r = cv.getBoundingClientRect(), x = (e.clientX - r.left) * devicePixelRatio, y = (e.clientY - r.top) * devicePixelRatio, f = e.deltaY < 0 ? 1.2 : 1 / 1.2;
  S.view.ox = x - (x - S.view.ox) * f; S.view.oy = y - (y - S.view.oy) * f; S.view.k *= f; draw();
}, { passive: false });

/* ------------------------------------------------------------------ файл, вставка, команды */
/* ------------------------------------------------------------------ листы электрики */
const ANNOT_RE = /размер|выноск|аннот|текст|штамп|рамк|ос[ьи]\b|оси\b|сетк|надпис|отметк|высотн|табл|легенд|помещен|площад|зон/;
const BASE_RE = /стен|констр|перегор|колонн|мебел|двер|окн|архитект|подложк|проем|сантех|кухн/;
function fillExPages() { /* список листов строится в диалоге */ }
function exWallBox(e) {
  let b = null; e.D.paths.forEach((p) => { const g = e.G.groups.filter((x) => x.id === p.g)[0]; if (g && g.role === 'wall') b = R.bboxOf(p.pts, b); });
  return b;
}
/* совмещение листа электрики с подложкой: по габаритам стен; масштаб — со своего листа, если указан */
function alignExtra(e) {
  const wb = wallsBox(), wb2 = exWallBox(e), k = mmPt(), b = S.bbox;
  if (wb && wb2 && b) return { origin: [wb2[0], wb2[1]], shift: [(wb[0] - b[0]) * k, (wb[1] - b[1]) * k], how: 'совмещён по стенам' };
  return { origin: [b ? b[0] : 0, b ? b[1] : 0], shift: [0, 0], how: 'стены не найдены, положение как на основном листе' };
}
const TITLE_RE = /план|схем|розет|выключ|освещ|светил|мебел|тепл|подогр|расстанов|размещ/i;
const KIND_RU = { furniture: 'мебель', sockets: 'розетки', light: 'освещение', floor: 'тёплый пол' };
/* По названию листа: мебель / розетки / освещение со связями выключатель—светильник / тёплый пол.
   «Привязки», «группы включения», размеры и маркировка не подходят: нужен лист с линиями от выключателей до светильников. */
function classifyPage(blob) {
  const t = String(blob || '').toLowerCase().replace(/ё/g, 'е');
  if (/тепл\S*\s*пол|подогрев/.test(t)) return 'floor';
  if (/розет/.test(t) && !/освещ|светил/.test(t) && !/привяз|координат/.test(t)) return 'sockets';
  if (/освещ|светильник|выключател/.test(t) && !/привяз|групп|вклю|координат|размер|маркиров|спецификац|потолк/.test(t)) return 'light';
  if (/мебел/.test(t) && !/привяз|электр|размер/.test(t)) return 'furniture';
  if (/мебел/.test(t)) return 'furniture';
  return null;
}
function lightScore(blob) { const t = String(blob || '').toLowerCase(); return (/выключател/.test(t) ? 2 : 0) + (/светильник/.test(t) ? 1 : 0) + (/освещ/.test(t) ? 1 : 0); }
async function autoExtras() {
  const want = [['sockets', 'Розетки'], ['light', 'Освещение']];
  for (const [k, title] of want) {
    let c = S.pages.filter((q) => q.kind === k && q.no !== S.pageNo);
    if (k === 'light') c = c.sort((a, b) => lightScore(b.blob) - lightScore(a.blob));
    if (c[0]) await addExtraPage(c[0].no, title);
  }
  if (S.extra.length) toast('Листы электрики выбраны по названиям: ' + S.extra.map((e) => e.title).join(', ') + '. Проверьте и уберите лишнее.', 8000);
}
function defaultKeep(G, dropBase) {
  const keep = {};
  G.groups.forEach((g) => {
    let k = true;
    if (G.useLayers) { const l = g.label.toLowerCase().replace(/ё/g, 'е'); if (ANNOT_RE.test(l)) k = false; else if (dropBase && BASE_RE.test(l)) k = false; }
    else {
      if (/dash/.test(g.id) || (g.role === 'drop' && g.id.charAt(0) !== 'F')) k = false;
      if (/:c#/.test(g.id)) k = true;                                            /* цветные линии — электрика */
      if (g.id.charAt(0) === 'F') k = R.rgbInt(g.id.split(':')[1]) != null;      /* заливки: только цветные (электрика) */
      if (g.role === 'wall' && dropBase) k = false;
    }
    keep[g.id] = k;
  });
  return keep;
}
const exCache = {};
async function pageData(no) {
  if (!exCache[no] || exCache[no].doc !== S.doc) { const pj = await lib(), D = await X.extractPage(pj, S.doc, no); exCache[no] = { doc: S.doc, D: D, G: R.buildGroups(D) }; }
  return exCache[no];
}
async function addExtraPage(no, kind) {
  if (!S.doc || !S.D) { toast('Сначала откройте PDF'); return; }
  try {
    prog(true, 0.4, 'Извлекаю лист ' + no + '…');
    const d = await pageData(no);
    /* масштаб листов электрики по умолчанию такой же, как у подложки (можно изменить) */
    S.extra.push({ page: no, kind: kind, title: kind + ' (лист ' + no + ')', D0: d.D, D: rotateD(d.D, S.rot), G: d.G, den: null, keep: defaultKeep(d.G, true) });
    prog(false); renderExtra();
  } catch (err) { prog(false); toast('Не удалось прочитать лист: ' + (err && err.message || err), 6000); }
}

/* ------------------------------------------------------------------ диалог выбора листа и слоёв */
const DLG = { kind: '', edit: -1, no: 0, d: null, keep: {} };
const KIND_KEY = { 'Розетки': 'sockets', 'Освещение': 'light', 'Тёплый пол': 'floor' };
function openPicker(kind, edit) {
  if (!S.doc || !S.D) { toast('Сначала откройте PDF'); return; }
  DLG.kind = kind; DLG.edit = edit == null ? -1 : edit;
  $('exDlgT').textContent = (DLG.edit >= 0 ? 'Изменить: ' : 'Добавить: ') + kind;
  const sel = $('dlgPage'); sel.innerHTML = $('pageSel').innerHTML;
  let no = DLG.edit >= 0 ? S.extra[DLG.edit].page : 0;
  if (!no) {
    let c = S.pages.filter((q) => q.kind === KIND_KEY[kind] && q.no !== S.pageNo);
    if (KIND_KEY[kind] === 'light') c = c.sort((a, b) => lightScore(b.blob) - lightScore(a.blob));
    no = c[0] ? c[0].no : (S.pages.filter((q) => q.no !== S.pageNo)[0] || S.pages[0]).no;
  }
  sel.value = String(no);
  $('exDlg').hidden = false;
  loadDlg(no);
}
async function loadDlg(no) {
  $('dlgInfo').textContent = 'Читаю лист…';
  const d = await pageData(no); DLG.no = no; DLG.d = d;
  const ed = DLG.edit >= 0 && S.extra[DLG.edit].page === no ? S.extra[DLG.edit] : null;
  DLG.keep = ed ? Object.assign({}, ed.keep) : defaultKeep(d.G, $('dlgBase').checked);
  $('dlgInfo').textContent = d.D.paths.length + ' линий' + (d.G.useLayers ? ', слои PDF' : ', слоёв нет — группы по стилю линий');
  renderDlg();
}
function renderDlg() {
  const d = DLG.d, tb = $('dlgGroups').querySelector('tbody');
  tb.innerHTML = d.G.groups.slice(0, 80).map((g) => '<tr><td><label class="chk"><input type="checkbox" data-g="' + esc(g.id) + '"' + (DLG.keep[g.id] ? ' checked' : '') + '>' + esc(g.label) + '</label></td><td>' + g.n + '</td></tr>').join('');
  tb.querySelectorAll('input[data-g]').forEach((c) => c.addEventListener('change', () => { DLG.keep[c.getAttribute('data-g')] = c.checked; drawDlg(); }));
  drawDlg();
}
function drawDlg() {
  const c = $('dlgCv'), x = c.getContext('2d'), d = DLG.d; if (!d) return;
  const r = c.getBoundingClientRect(); c.width = Math.max(200, Math.round(r.width)); c.height = Math.max(150, Math.round(r.height));
  x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
  let b = null; d.D.paths.forEach((p) => { b = R.bboxOf(p.pts, b); }); if (!b) return;
  const k = Math.min((c.width - 10) / (b[2] - b[0] || 1), (c.height - 10) / (b[3] - b[1] || 1)), X0 = 5 - b[0] * k, Y0 = c.height - 5 + b[1] * k;
  const pass = (keepFlag) => d.D.paths.forEach((p) => {
    if (!!DLG.keep[p.g] !== keepFlag) return;
    const col = keepFlag ? (p.sc || p.fc || '#000') : '#e3e6ea';
    x.beginPath(); p.pts.forEach((q, j) => { const px = q[0] * k + X0, py = Y0 - q[1] * k; j ? x.lineTo(px, py) : x.moveTo(px, py); });
    if (p.fc && !p.sc) { x.fillStyle = keepFlag ? p.fc : '#eef0f2'; x.fill(); } else { x.strokeStyle = col; x.lineWidth = 1; x.stroke(); }
  });
  pass(false); pass(true);
}
$('dlgPage').addEventListener('change', () => loadDlg(+$('dlgPage').value));
$('dlgBase').addEventListener('change', () => { if (DLG.d) { DLG.keep = defaultKeep(DLG.d.G, $('dlgBase').checked); renderDlg(); } });
$('dlgCancel').addEventListener('click', () => { $('exDlg').hidden = true; });
$('dlgOk').addEventListener('click', () => {
  if (!DLG.d) return;
  const e = { page: DLG.no, kind: DLG.kind, title: DLG.kind + ' (лист ' + DLG.no + ')', D0: DLG.d.D, D: rotateD(DLG.d.D, S.rot), G: DLG.d.G, den: null, keep: DLG.keep };
  if (DLG.edit >= 0) { e.den = S.extra[DLG.edit].den; S.extra[DLG.edit] = e; } else S.extra.push(e);
  $('exDlg').hidden = true; renderExtra();
});
document.querySelectorAll('[data-exkind]').forEach((b) => b.addEventListener('click', () => openPicker(b.getAttribute('data-exkind'))));
function renderExtra() {
  const box = $('exList'); box.innerHTML = '';
  S.extra.forEach((e, i) => {
    const al = alignExtra(e);
    const d = document.createElement('details'); d.className = 'ex-item';
    const rows = e.G.groups.slice(0, 40).map((g) => '<tr><td><label class="chk"><input type="checkbox" data-g="' + esc(g.id) + '"' + (e.keep[g.id] ? ' checked' : '') + '>' + esc(g.label) + '</label></td><td>' + g.n + '</td></tr>').join('');
    d.innerHTML = '<summary><b>' + esc(e.title) + '</b> · масштаб 1:<input class="w-s" data-den="' + i + '" inputmode="numeric" placeholder="' + (S.den || '') + '" value="' + (e.den || '') + '" title="Пусто — как у подложки"> · ' + esc(al.how) + ' <button class="btn" type="button" data-edit="' + i + '">Изменить</button> <button class="btn" type="button" data-del="' + i + '">Убрать</button></summary>' +
      '<table class="pl-t"><thead><tr><th>Что оставить в блоке</th><th>Линий</th></tr></thead><tbody>' + rows + '</tbody></table>';
    d.querySelector('input[data-den]').addEventListener('click', (ev) => ev.stopPropagation());
    d.querySelector('input[data-den]').addEventListener('change', (ev) => { e.den = parseInt(ev.target.value, 10) || null; });
    d.querySelectorAll('input[data-g]').forEach((c) => c.addEventListener('change', () => { e.keep[c.getAttribute('data-g')] = c.checked; }));
    d.querySelector('button[data-edit]').addEventListener('click', (ev) => { ev.preventDefault(); openPicker(e.kind, i); });
    d.querySelector('button[data-del]').addEventListener('click', (ev) => { ev.preventDefault(); S.extra.splice(i, 1); renderExtra(); });
    box.appendChild(d);
  });
}

/* ------------------------------------------------------------------ поворот листа на 90° по часовой */
function rotStep(p) { return [p[1], -p[0]]; }                     /* по часовой, Y вверх */
function rotateD(D0, n) {
  n = ((n % 4) + 4) % 4; if (!n) return D0;
  const f = (p) => { let q = p; for (let i = 0; i < n; i++) q = rotStep(q); return q; };
  const D = Object.assign({}, D0);
  D.paths = D0.paths.map((p) => Object.assign({}, p, { pts: p.pts.map(f) }));
  D.texts = D0.texts.map((t) => { const q = f([t.x, t.y]); let r = (t.rot || 0) - 90 * n; r = ((r + 540) % 360) - 180; return Object.assign({}, t, { x: q[0], y: q[1], rot: r }); });
  if (n % 2) { D.w = D0.h; D.h = D0.w; }
  return D;
}
function rotateView() {
  if (!S.D0) return;
  S.rot = (S.rot + 1) % 4; S.D = rotateD(S.D0, S.rot);
  S.cal = null; $('calRow').hidden = true; S.assign = null; S.hot = null;
  if (S.rooms.length) S.rooms.forEach((r) => { if (r.marker) r.marker = rotStep(r.marker); if (r.poly) r.poly = r.poly.map(rotStep); });
  else {
    const ex = R.parseExplication(S.D), mk = R.findMarkers(S.D, ex);
    S.rooms = ex.rooms.map((r) => { const m = mk.filter((q) => q.no === r.no)[0]; return { no: r.no, name: r.name, areaD: r.areaD, h: '', area: null, ok: null, marker: m ? [m.x, m.y] : null }; });
  }
  S.expl = R.parseExplication(S.D);
  if (!S.den) { const sc = R.scaleFromText(S.D); if (sc) { S.den = sc.den; $('den').value = S.den; } }
  S.extra.forEach((e) => { e.D = rotateD(e.D0, S.rot); });
  renderRooms(); rebuild(); fit();
  toast('Лист повёрнут: ' + (S.rot * 90) + '° по часовой', 2500);
}
$('rotBtn').addEventListener('click', rotateView);

function build() {
  if (!S.D || !S.bbox) { toast('Откройте PDF'); return null; }
  if (!S.den) { toast('Задайте масштаб или откалибруйте по размеру', 6000); $('den').focus(); return null; }
  if (!S.rooms.length) { toast('Нет помещений'); return null; }
  const nos = {}; for (const r of S.rooms) { if (nos[r.no]) { toast('Повторяется номер ' + r.no, 6000); return null; } nos[r.no] = 1; if (!r.marker) { toast('У помещения ' + r.no + ' не указано место номера на плане', 6000); return null; } }
  const hd = num('hDef', 2700), b = S.bbox, k = mmPt();
  const rooms = S.rooms.map((r) => ({ no: r.no, name: r.name, areaD: r.areaD, area: r.poly && r.fit && r.fit !== 'bad' ? r.area : null, poly: r.poly && r.fit && r.fit !== 'bad' ? r.poly : null, h: parseFloat(r.h) || hd, marker: r.marker }));
  const extras = S.extra.map((e) => { const al = alignExtra(e); return { title: e.title, D: e.D, keep: e.keep, mmPerPt: (e.den || S.den) * R.PT_MM, origin: al.origin, shift: al.shift }; });
  const out = R.buildOutput(S.D, { name: S.name, mmPerPt: k, origin: [b[0], b[1]], hDefault: hd, rooms: rooms, extras: extras, keepRole: (p, i) => S.keep[i] || null, W: (b[2] - b[0]) * k, H: (b[3] - b[1]) * k });
  return out;
}
function send(type, text) {
  if (!host || typeof host.postMessage !== 'function') { toast('Связь с AutoCAD недоступна: откройте панель из AutoCAD (команда GIPROOMS) или сохраните файл.', 7000); return false; }
  const size = 32 * 1024;
  if (text.length <= size) { host.postMessage(type + '\n' + text); return true; }
  const n = Math.ceil(text.length / size); host.postMessage(type + '-start\n' + n);
  for (let i = 0; i < n; i++) host.postMessage(type + '-chunk\n' + i + '\n' + text.slice(i * size, (i + 1) * size));
  return true;
}
$('go').addEventListener('click', () => { const o = build(); if (o && send('rooms', o.text)) toast('Передаю в AutoCAD (заготовка над альбомом): ' + o.nGeom + ' линий, ' + S.rooms.length + ' помещений' + (S.extra.length ? ', листов электрики ' + S.extra.length : '') + '…', 5000); });
$('save').addEventListener('click', () => {
  const o = build(); if (!o) return;
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([o.text], { type: 'text/plain' })); a.download = 'gip_rooms_in.txt'; a.click();
});
const cmd = (c) => () => { if (host) { host.postMessage('cmd\n' + c); toast('Команда ' + c + ' отправлена в AutoCAD', 3000); } else toast('Связь с AutoCAD недоступна', 5000); };
$('syncBtn').addEventListener('click', cmd('GIPROOMSYNC'));
$('distBtn').addEventListener('click', cmd('GIPROOMSDIST'));
$('areaBtn').addEventListener('click', cmd('GIPROOMSAREA'));
$('traceBtn').addEventListener('click', cmd('GIPROOMSTRACE'));
$('readBtn').addEventListener('click', cmd('GIPROOMSREAD'));
if (host && host.addEventListener) {
  host.addEventListener('message', (e) => {
    const d = e && e.data; if (!d) return;
    const dec = (s) => String(s || '').replace(/\\U\+([0-9A-Fa-f]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
    if (d.type === 'rooms-result') toast((d.ok ? 'Готово: ' : 'Ошибка: ') + dec(d.msg), 9000);
    if (d.type === 'registry' && Array.isArray(d.rooms)) {
      S.rooms = d.rooms.map((r) => ({ no: r.no, name: dec(r.name), h: String(r.h || ''), area: r.area || null, areaD: null, ok: true, marker: null }));
      ['roomBox', 'goBox'].forEach((id) => { $(id).hidden = false; }); renderRooms(); toast('Реестр помещений прочитан из чертежа: ' + S.rooms.length, 5000);
    }
  });
  host.postMessage('ready\n');
}

/* ------------------------------------------------------------------ вход файла */
const drop = $('drop'), fileIn = $('file');
drop.addEventListener('click', (e) => { if (e.target !== fileIn) { e.preventDefault(); fileIn.click(); } });
fileIn.addEventListener('change', () => { if (fileIn.files[0]) openFile(fileIn.files[0]); });
['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', (e) => { const f = e.dataTransfer.files[0]; if (f) openFile(f); });
$('pageSel').addEventListener('change', () => loadPage(+$('pageSel').value));
window.GIPROOMSUI = { S: S, openFile: openFile, build: build, rebuild: rebuild, renderExtra: renderExtra };
