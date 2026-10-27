/* ГИП · План из PDF — страница панели AutoCAD: выбор листов, сопоставление значков с блоками ГИП, просмотр, отправка в чертёж */
const P = window.GIPPLAN;
const $ = (id) => document.getElementById(id);
const host = window.chrome && window.chrome.webview;
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const BCOL = { R: '#2563eb', V: '#d33f3f', C: '#23935a', '': '#8798b6' };
const ROLE = { p: 'План для подложки', '': 'Не использовать' };
const LCLS = { flat: 'Квартира', mebel: 'Мебель', sym: 'Значки', skip: 'Не брать' };
if (host || /[?&]panel\b/.test(location.search)) $('backBtn').hidden = false;

/* ------------------------------------------------------------------ память по студиям (этот компьютер) */
const MEM_KEY = 'gip-plan-mem-v1';
function loadMem() { try { return Object.assign({ lay: {}, tpl: {}, shp: {} }, JSON.parse(localStorage.getItem(MEM_KEY) || '{}')); } catch (e) { return { lay: {}, tpl: {}, shp: {} }; } }
function saveMem() { try { localStorage.setItem(MEM_KEY, JSON.stringify(S.mem)); } catch (e) { /* без памяти */ } }
const labKey = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, ' ').trim();

const S = { name: '', doc: null, pages: [], under: null, cur: null, rooms: [], roomPageNo: null, mem: loadMem(), den: null, fills: false, hot: null, busy: false };

/* ------------------------------------------------------------------ pdf.js */
let pdfjs = null;
async function lib() {
  if (!pdfjs) {
    pdfjs = await import('./pdfjs/pdf.min.js');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('./pdfjs/pdf.worker.min.js', location.href).href;
  }
  return pdfjs;
}

let toastT = null;
function toast(msg, ms) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, ms || 3600); }
function prog(on, frac, txt) {
  $('prog').hidden = !on; if (!on) return;
  $('progBar').style.width = Math.round((frac || 0) * 100) + '%'; $('progT').textContent = txt || '';
}

/* ------------------------------------------------------------------ файл и листы */
async function titleOf(no) {
  const page = await S.doc.getPage(no), vp = page.getViewport({ scale: 1 }), tc = await page.getTextContent();
  const items = tc.items.filter((t) => t.str && t.str.trim().length > 3).map((t) => ({ s: t.str.trim(), y: t.transform[5], h: Math.hypot(t.transform[2], t.transform[3]) }));
  const plan = items.filter((t) => /план|спецификац|легенд|схем/i.test(t.s)).sort((a, b) => b.h - a.h || b.y - a.y)[0];
  const top = items.filter((t) => t.y > vp.height * 0.75).sort((a, b) => b.h - a.h)[0];
  return ((plan || top || { s: 'Лист ' + no }).s).slice(0, 80);
}
const roleOf = (t) => /план|квартир|помещ|мебел/i.test(t) ? 'p' : '';

async function openFile(file) {
  if (!file) return;
  S.busy = true;
  try {
    prog(true, 0.02, 'Открываю PDF…');
    const pj = await lib();
    S.doc = await pj.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
    S.name = file.name.replace(/\.pdf$/i, '');
    $('dropT').innerHTML = '<b>' + esc(file.name) + '</b> · листов: ' + S.doc.numPages + ' · <u>другой файл</u>';
    S.pages = [];
    for (let no = 1; no <= S.doc.numPages; no++) {
      const title = await titleOf(no);
      S.pages.push({ no, title, role: roleOf(title), D: null, A: null, mapping: {} });
    }
    const pPage = S.pages.find((p) => p.role === 'p'), lPage = S.pages.find((p) => p.role === 'l');
    S.under = (pPage || lPage || S.pages[0]).no;
    S.cur = (pPage || lPage || S.pages[0]).no;
    await analyzeAll();
    await scanRoomSchedules(pj);
  } catch (e) {
    console.error(e); toast('Не удалось открыть PDF: ' + (e && e.message || e), 6000);
  } finally { S.busy = false; prog(false); }
  renderAll(true);
}

async function analyzePage(pg) {
  if (!pg.D) pg.D = await P.extractPage(pdfjs, S.doc, pg.no);
  pg.A = P.analyze(pg.D, { layers: S.mem.lay });
  if (S.den == null) S.den = pg.A.scaleDen;
  /* сопоставления: запомненные для этой студии, иначе по подписи легенды */
  pg.A.templates.forEach((t) => { if (!pg.mapping[t.id]) pg.mapping[t.id] = S.mem.tpl[labKey(t.label)] || Object.assign({}, t.map); });
  pg.A.shapes.forEach((g) => { if (!pg.mapping[g.key]) pg.mapping[g.key] = S.mem.shp[g.sig] || { b: '', v: 0, n: 1 }; });
}
async function analyzeAll() {
  const need = S.pages.filter((p) => p.no === S.under);
  for (let i = 0; i < need.length; i++) {
    prog(true, (i + 0.3) / need.length, 'Разбираю лист ' + need[i].no + ' из ' + S.doc.numPages + '…');
    await new Promise((r) => setTimeout(r, 0));
    await analyzePage(need[i]);
  }
  prog(false);
}


function parseRoomLines(value) {
  const out = [], seen = new Set();
  String(value || '').split(/\r?\n/).forEach((line) => {
    const m = /^\s*(\d{1,2})\s*[;|,\t]\s*(.+?)\s*$/.exec(line);
    if (!m) return;
    const no = +m[1], name = m[2].trim();
    if (no < 1 || no > 99 || !name || seen.has(no)) return;
    seen.add(no); out.push({ no, name });
  });
  return out.sort((a, b) => a.no - b.no);
}
async function scanRoomSchedules(pj) {
  let best = { no: null, rooms: [], score: 0, title: '' };
  for (const pg of S.pages) {
    let D;
    try { D = pg.D || await P.extractTextPage(pj, S.doc, pg.no); } catch (e) { continue; }
    const r = P.extractRooms(D);
    if (r && r.rooms && r.rooms.length && (r.rooms.length > best.rooms.length || (r.rooms.length === best.rooms.length && r.score > best.score)))
      best = { no: pg.no, rooms: r.rooms, score: r.score, title: r.title || '' };
  }
  S.rooms = best.rooms;
  S.roomPageNo = best.no;
  $('roomsText').value = S.rooms.map((r) => r.no + '; ' + r.name).join('\n');
  $('roomInfo').textContent = S.rooms.length
    ? 'Найдено помещений: ' + S.rooms.length + ' на листе ' + S.roomPageNo + '. Проверьте распознанные названия и номера.'
    : 'Автоматическая экспликация не найдена. Введите строки вручную в формате «1; Прихожая». Сканированные PDF автоматически не распознаются.';
}

/* ------------------------------------------------------------------ отрисовка панели */
function renderAll(fit) {
  const has = !!S.doc;
  ['pagesBox', 'roomBox', 'layBox', 'goBox'].forEach((id) => { $(id).hidden = !has; });
  $('symBox').hidden = true;
  $('tabs').hidden = true;
  $('empty').hidden = has;
  if (!has) return;
  renderPages(); renderLayers(); renderSum();
  $('den').value = S.den || 50;
  view.page = null; drawView(fit);
}

function renderPages() {
  const tb = $('pages').tBodies[0];
  tb.innerHTML = S.pages.map((p) => '<tr><td class="ttl" title="' + esc(p.title) + '"><b>' + p.no + '</b> ' + esc(p.title) + '</td><td><select data-role="' + p.no + '">' +
    Object.keys(ROLE).map((k) => '<option value="' + k + '"' + (p.role === k ? ' selected' : '') + '>' + ROLE[k] + '</option>').join('') + '</select></td>' +
    '<td><input type="radio" name="under" value="' + p.no + '"' + (S.under === p.no ? ' checked' : '') + ' aria-label="Подложка с листа ' + p.no + '"></td></tr>').join('');
}

function renderTabs() {
  const pgs = S.pages.filter((p) => p.role);
  if (!pgs.some((p) => p.no === S.cur)) S.cur = pgs.length ? pgs[0].no : S.under;
  $('tabs').innerHTML = pgs.map((p) => '<button type="button" data-tab="' + p.no + '" aria-pressed="' + (p.no === S.cur) + '">' + (p.role === 'p' ? 'Розетки' : 'Освещение') + ' · л.' + p.no + '</button>').join('');
  $('tabs').hidden = pgs.length < 2;
}

function iconSvg(segs) {
  if (!segs || !segs.length) return '';
  let b = [1e9, 1e9, -1e9, -1e9];
  segs.forEach((s) => [s.a, s.b].forEach((p) => { b = [Math.min(b[0], p[0]), Math.min(b[1], p[1]), Math.max(b[2], p[0]), Math.max(b[3], p[1])]; }));
  const w = Math.max(b[2] - b[0], b[3] - b[1], 1), pad = w * 0.12;
  const d = segs.map((s) => 'M' + (s.a[0] - b[0]).toFixed(2) + ' ' + (b[3] - s.a[1]).toFixed(2) + 'L' + (s.b[0] - b[0]).toFixed(2) + ' ' + (b[3] - s.b[1]).toFixed(2)).join('');
  return '<svg viewBox="' + (-pad - (w - (b[2] - b[0])) / 2).toFixed(2) + ' ' + (-pad - (w - (b[3] - b[1])) / 2).toFixed(2) + ' ' + (w + 2 * pad).toFixed(2) + ' ' + (w + 2 * pad).toFixed(2) + '" aria-hidden="true"><path d="' + d + '" fill="none" stroke="currentColor" stroke-width="' + (w / 28).toFixed(3) + '" stroke-linecap="round"/></svg>';
}
function mapSelect(m, key) {
  const cur = m && m.b ? m.b + ':' + m.v : '';
  let h = '<select data-map="' + esc(key) + '" class="' + (cur ? '' : 'off') + '" aria-label="Блок ГИП"><option value="">Не ставить</option>';
  [['R', 'Розетки'], ['V', 'Выключатели'], ['C', 'Светильники']].forEach(([b, nm]) => {
    h += '<optgroup label="' + nm + ' ГИП">' + P.VIS[b].map((v, i) => '<option value="' + b + ':' + i + '"' + (cur === b + ':' + i ? ' selected' : '') + '>' + esc(v) + '</option>').join('') + '</optgroup>';
  });
  h += '</select>';
  if (m && m.b === 'R' && [0, 1, 7].includes(m.v)) h += '<select class="gang" data-gang="' + esc(key) + '" aria-label="Сколько гнёзд">' + [1, 2, 3, 4].map((n) => '<option value="' + n + '"' + ((m.n || 1) === n ? ' selected' : '') + '>×' + n + '</option>').join('') + '</select>';
  return h;
}
function curPage() { return S.pages.find((p) => p.no === S.cur); }
function renderSyms() {
  const pg = curPage();
  if (!pg || !pg.A) { $('syms').innerHTML = ''; $('shapes').innerHTML = ''; $('symHint').textContent = 'Отметьте лист с розетками или освещением'; return; }
  const A = pg.A, cnt = P.counts(A);
  $('symHint').textContent = A.templates.length
    ? 'Легенда дизайнера: ' + A.templates.length + ' значков, найдено на плане ' + A.hits.length + '. Масштаб значков ' + (A.kMed ? (A.kMed * 100).toFixed(0) + ' % от легенды' : '—') + '.'
    : 'Легенды на этом листе не нашлось — сопоставьте фигуры ниже.';
  $('syms').innerHTML = A.templates.map((t) => '<div class="sym" data-hot="t:' + esc(t.id) + '"><div class="ic">' + iconSvg(t.segs) + '</div><div class="lb" title="' + esc(t.label) + '">' + esc(t.label) + '</div>' +
    '<div class="n">' + (cnt[t.id] || 0) + ' <small>шт</small></div><div class="map">' + mapSelect(pg.mapping[t.id], t.id) + '</div></div>').join('');
  $('shapes').innerHTML = A.shapes.map((g, i) => '<div class="sym" data-hot="s:' + esc(g.key) + '"><div class="ic">' + iconSvg(g.segs) + '</div><div class="lb">Фигура ' + (i + 1) + '</div>' +
    '<div class="n">' + g.items.length + ' <small>шт</small></div><div class="map">' + mapSelect(pg.mapping[g.key], g.key) + '</div></div>').join('');
  $('shapesN').textContent = A.shapes.length ? '· ' + A.shapes.length + ' фигур' : '· нет';
  $('shapesWrap').hidden = !A.shapes.length;
  if (!A.templates.length && A.shapes.length) $('shapesWrap').open = true;
}

function renderLayers() {
  const seen = {};
  S.pages.forEach((p) => { if (p.D) Object.keys(p.D.layers).forEach((k) => { seen[k] = (seen[k] || 0) + p.D.layers[k]; }); });
  $('layers').tBodies[0].innerHTML = Object.keys(seen).sort((a, b) => seen[b] - seen[a]).map((k) => {
    const cls = S.mem.lay[k] || P.guessLayer(k === '' ? null : k);
    return '<tr><td class="ttl" title="' + esc(k || 'без слоя') + '">' + esc(k || 'без слоя') + '</td><td class="n">' + seen[k] + '</td><td><select data-layer="' + esc(k) + '">' +
      Object.keys(LCLS).map((c) => '<option value="' + c + '"' + (c === cls ? ' selected' : '') + '>' + LCLS[c] + '</option>').join('') + '</select></td></tr>';
  }).join('');
}

function placedCounts() {
  const c = { R: 0, V: 0, C: 0 };
  S.pages.forEach((pg) => {
    if (!pg.role || !pg.A) return;
    pg.A.hits.forEach((h) => { const m = pg.mapping[pg.A.templates[h.ti].id]; if (m && m.b) c[m.b] += m.n || 1; });
    pg.A.shapes.forEach((g) => { const m = pg.mapping[g.key]; if (m && m.b) c[m.b] += g.items.length; });
  });
  return c;
}
function renderSum() {
  const up = S.pages.find((p) => p.no === S.under), markers = up && up.A ? P.findRoomMarkers(up.A, S.rooms) : [];
  $('sum').innerHTML = 'Подложка: <b>' + (up ? 'лист ' + up.no : 'не выбран') + '</b>; помещений в экспликации: <b>' + S.rooms.length + '</b>; найдено номеров на плане: <b>' + markers.length + '</b>.';
  $('go').hidden = !host; $('save').classList.toggle('primary', !host);
  $('goHint').textContent = host
    ? 'Подложка вставляется одним блоком на листы силовых сетей, освещения и ДСУП; экспликация — на силовом плане. Перенос значков электрики дизайнера отключён. Размеры и выноски на общих слоях нужно проверить и при необходимости удалить вручную.'
    : 'Откройте эту страницу в панели AutoCAD (ГИППАНЕЛЬ → «План из PDF»), чтобы вставить сразу. Или сохраните файл и выполните в AutoCAD команду ГИППЛАН.';
}

/* ------------------------------------------------------------------ просмотр */
const cv = $('cv'), ctx = cv.getContext('2d');
const view = { page: null, k: 1, x: 0, y: 0, cache: null };
function pagePaths(pg) {
  if (view.cache && view.cache.no === pg.no && view.cache.A === pg.A) return view.cache;
  const P2 = { flat: new Path2D(), mebel: new Path2D(), sym: new Path2D(), skip: new Path2D() };
  pg.D.paths.forEach((p) => {
    if (p.f === 'w') return;
    const k = pg.A.lclass(p.L), path = P2[k] || P2.skip;
    path.moveTo(p.pts[0][0], p.pts[0][1]);
    for (let i = 1; i < p.pts.length; i++) path.lineTo(p.pts[i][0], p.pts[i][1]);
  });
  view.cache = { no: pg.no, A: pg.A, P2 };
  return view.cache;
}
function fitView(pg) {
  const r = cv.getBoundingClientRect(), c = pg.A.crop;
  const k = Math.min(r.width / (c[2] - c[0]), r.height / (c[3] - c[1])) * 0.96;
  view.k = k; view.x = (r.width - (c[2] - c[0]) * k) / 2 - c[0] * k; view.y = (r.height - (c[3] - c[1]) * k) / 2 + c[3] * k;
}
function drawView(fit) {
  const pg = curPage() || S.pages.find((p) => p.no === S.under);
  const r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  cv.width = Math.max(1, Math.round(r.width * dpr)); cv.height = Math.max(1, Math.round(r.height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, r.width, r.height);
  if (!pg || !pg.A) return;
  if (fit || view.page !== pg.no) { fitView(pg); view.page = pg.no; }
  $('vTitle').textContent = 'Лист ' + pg.no + ' · ' + pg.title;
  const C = pagePaths(pg);
  ctx.save(); ctx.setTransform(dpr * view.k, 0, 0, -dpr * view.k, dpr * view.x, dpr * view.y);
  const lw = 1 / view.k;
  [['skip', '#e6e9ef', 0.6], ['mebel', '#b9c2d0', 0.7], ['flat', '#5d6878', 0.8], ['sym', '#111827', 0.9]].forEach(([k, col, w]) => { ctx.strokeStyle = col; ctx.lineWidth = lw * w; ctx.stroke(C.P2[k]); });
  /* найденные значки */
  const A = pg.A;
  function mark(c, size, m, hot) {
    const b = m && m.b ? m.b : '';
    ctx.beginPath(); ctx.arc(c[0], c[1], Math.max(size * 0.62, 4 / view.k), 0, Math.PI * 2);
    ctx.setLineDash(b ? [] : [3 / view.k, 3 / view.k]);
    ctx.strokeStyle = BCOL[b]; ctx.lineWidth = lw * (hot ? 3.2 : 1.6); ctx.stroke();
    if (hot) { ctx.fillStyle = BCOL[b] + '33'; ctx.fill(); }
  }
  A.hits.forEach((h) => { const t = A.templates[h.ti]; mark(h.c, h.size, pg.mapping[t.id], S.hot === 't:' + t.id); });
  A.shapes.forEach((g) => g.items.forEach((it) => mark(it.c, it.size, pg.mapping[g.key], S.hot === 's:' + g.key)));
  ctx.setLineDash([]);
  ctx.restore();
}
let drag = null;
cv.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }; cv.setPointerCapture(e.pointerId); cv.classList.add('drag'); });
cv.addEventListener('pointermove', (e) => { if (!drag) return; view.x = drag.vx + e.clientX - drag.x; view.y = drag.vy + e.clientY - drag.y; drawView(); });
cv.addEventListener('pointerup', () => { drag = null; cv.classList.remove('drag'); });
cv.addEventListener('wheel', (e) => {
  e.preventDefault();
  const r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top, f = Math.exp(-e.deltaY * 0.0015);
  view.x = mx - (mx - view.x) * f; view.y = my - (my - view.y) * f; view.k *= f; drawView();
}, { passive: false });
$('fit').addEventListener('click', () => drawView(true));
window.addEventListener('resize', () => drawView(false));

/* ------------------------------------------------------------------ события */
const drop = $('drop');
['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', (e) => { const f = e.dataTransfer.files[0]; if (f) openFile(f); });
$('file').addEventListener('change', (e) => openFile(e.target.files[0]));

$('pages').addEventListener('change', async (e) => {
  const el = e.target;
  if (el.dataset.role) { const pg = S.pages.find((p) => p.no === +el.dataset.role); pg.role = el.value; if (pg.role) S.cur = pg.no; }
  if (el.name === 'under') S.under = +el.value;
  await analyzeAll(); renderAll(true);
});
$('tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (!b) return; S.cur = +b.dataset.tab; S.hot = null; renderTabs(); renderSyms(); drawView(true); });
function onMap(e) {
  const el = e.target, pg = curPage(); if (!pg) return;
  if (el.dataset.map != null) {
    const key = el.dataset.map, v = el.value, old = pg.mapping[key] || {};
    const m = v ? { b: v.split(':')[0], v: +v.split(':')[1], n: old.n || 1 } : { b: '', v: 0, n: 1 };
    if (m.b !== 'R') m.n = 1;
    pg.mapping[key] = m; remember(pg, key, m);
  } else if (el.dataset.gang != null) {
    const key = el.dataset.gang; pg.mapping[key] = Object.assign({}, pg.mapping[key], { n: +el.value }); remember(pg, key, pg.mapping[key]);
  } else return;
  renderSyms(); renderSum(); drawView();
}
function remember(pg, key, m) {
  const t = pg.A.templates.find((x) => x.id === key);
  if (t) S.mem.tpl[labKey(t.label)] = m;
  const g = pg.A.shapes.find((x) => x.key === key);
  if (g) S.mem.shp[g.sig] = m;
  saveMem();
}
$('syms').addEventListener('change', onMap); $('shapes').addEventListener('change', onMap);
function onHot(e) { const r = e.target.closest('[data-hot]'); const h = r ? r.dataset.hot : null; if (h === S.hot) return; S.hot = h; document.querySelectorAll('.sym').forEach((x) => x.classList.toggle('hot', x.dataset.hot === h)); drawView(); }
$('syms').addEventListener('pointerover', onHot); $('shapes').addEventListener('pointerover', onHot);
$('symBox').addEventListener('pointerleave', () => { S.hot = null; document.querySelectorAll('.sym.hot').forEach((x) => x.classList.remove('hot')); drawView(); });
$('layers').addEventListener('change', async (e) => {
  const el = e.target; if (el.dataset.layer == null) return;
  S.mem.lay[el.dataset.layer] = el.value; saveMem();
  S.pages.forEach((p) => { p.A = null; });
  await analyzeAll(); view.cache = null; renderAll(true);
});
$('roomsText').addEventListener('input', () => { S.rooms = parseRoomLines($('roomsText').value); $('roomInfo').textContent = 'В экспликации: ' + S.rooms.length + ' строк. Формат: номер; наименование. Повторные номера пропускаются.'; renderSum(); });
$('den').addEventListener('change', (e) => { const v = parseInt(e.target.value, 10); if (v > 0 && v < 1000) S.den = v; e.target.value = S.den; });
$('fills').addEventListener('change', (e) => { S.fills = e.target.checked; });

/* совмещение листов по мебели (у дизайнера листы обычно совпадают, но на всякий случай) */
function offsetTo(pg, U) {
  function bb(A) { const pts = []; A.page.paths.forEach((p) => { if (A.lclass(p.L) === 'mebel') pts.push(...p.pts); }); return pts.length ? P.bboxPts(pts) : null; }
  const a = bb(U), b = bb(pg.A);
  if (!a || !b) return [0, 0];
  const sw = (b[2] - b[0]) / Math.max(a[2] - a[0], 1e-6), sh = (b[3] - b[1]) / Math.max(a[3] - a[1], 1e-6);
  if (Math.abs(sw - 1) > 0.02 || Math.abs(sh - 1) > 0.02) return [0, 0];
  return [a[0] - b[0], a[1] - b[1]];
}
function build() {
  const U = S.pages.find((p) => p.no === S.under);
  if (!U || !U.A) { toast('Выберите лист для подложки'); return null; }
  const markers = P.findRoomMarkers(U.A, S.rooms);
  return P.buildOutput({ underlay: U.A, pages: [], includeSymbols: false, rooms: S.rooms, markers: markers, scaleDen: S.den || U.A.scaleDen, fills: S.fills, name: S.name });
}
$('go').addEventListener('click', () => {
  const out = build(); if (!out) return;
  host.postMessage('plan\n' + out.text);
  toast('Отправлено в AutoCAD: подложка, экспликация и ' + out.nRoomMarkers + ' номеров помещений. Смотрите листы планов.', 6000);
});
$('save').addEventListener('click', () => {
  const out = build(); if (!out) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([out.text], { type: 'text/plain' }));
  a.download = 'gip_plan_in.txt'; document.body.appendChild(a); a.click(); a.remove();
  toast('Файл сохранён: подложка, экспликация и номера помещений. В AutoCAD: ГИППЛАН.', 6000);
});
window.GIPPLANUI = { S, openFile, build, drawView };
renderAll(true);
