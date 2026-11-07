/* ГИП · Проект — единая панель (GIPPROEKT): данные проекта, сводка по системам, проверка комплекта */
var PROEKT = (function () {
  'use strict';
  var FIELDS = ['address', 'flat', 'floor', 'code', 'stage', 'client', 'author', 'checker'];
  var SYS = ['eom', 'heat', 'cond', 'vk'];
  // состояние систем по реестру чертежа: off / part / ok и текст
  function cards(reg, st) {
    var r = reg || {}, s = (st && st.sys) || {}, res = [];
    var rm = r.rooms || { n: 0 };
    res.push({ id: 'rooms', tab: 'rooms', name: 'Помещения', on: true, lvl: rm.n ? 'ok' : 'off',
      txt: rm.n ? ('помещений ' + rm.n + ', площадь ' + rm.area + ' м²') : 'нет реестра помещений: PDF дизайнера или обводка вручную' });
    if (s.eom !== false) { var e = r.eom || {}; res.push({ id: 'eom', tab: 'panel', name: 'ЭОМ (щит, планы)', on: true, lvl: e.panel ? 'ok' : (e.sheets ? 'part' : 'off'), txt: e.panel ? 'группы щита заполнены, листов ЭОМ ' + e.sheets : 'группы щита не заполнены' }); }
    if (s.heat !== false) { var h = r.heat || {}; res.push({ id: 'heat', tab: 'heat', name: 'Отопление', on: true, lvl: h.built ? 'ok' : (h.windows || h.shrv ? 'part' : 'off'),
      txt: !h.plan ? 'нет листов альбома О в чертеже' : h.built ? ('приборов ' + h.rads + ', Т1 ' + h.t1 + ' м') : ('окон ' + h.windows + ', ШРВ ' + (h.shrv ? 'указан' : 'не указан')) }); }
    if (s.cond !== false) { var c = r.cond || {}; res.push({ id: 'cond', tab: 'cond', name: 'Кондиционирование', on: true, lvl: c.built ? 'ok' : (c.I ? 'part' : 'off'),
      txt: !c.plan ? 'нет листа «План … Х1, Х2, Д1»' : ('внутренних ' + (c.I || 0) + ', наружных ' + ((c.O || 0) + (c.R || 0)) + ', выпусков К1 ' + (c.K || 0) + (c.built ? ' — построено' : '')) }); }
    if (s.vk) res.push({ id: 'vk', tab: null, name: 'ВК', on: true, lvl: 'off', txt: 'автоматизация в разработке — пока вручную' });
    return res;
  }
  // проверка комплекта: crit — нельзя выпускать, chk — проверить инженеру, info — к сведению
  function audit(reg, st) {
    var r = reg || {}, s = (st && st.sys) || {}, p = (st && st.prj) || {}, a = [];
    if (!p.address) a.push(['crit', 'Не заполнен адрес объекта.']);
    if (!p.code) a.push(['chk', 'Не заполнен шифр проекта.']);
    if (!(r.rooms && r.rooms.n)) a.push(['crit', 'Нет реестра помещений — площади и нагрузки не посчитаны.']);
    if (s.heat !== false) {
      var h = r.heat || {};
      if (!h.plan) a.push(['crit', 'Отопление: в чертеже нет листов альбома О (шаблон GIP_VIK_EOM_O).']);
      else if (!h.built) a.push(['chk', 'Отопление ещё не построено.']);
      if (h.plan && !h.windows) a.push(['chk', 'Отопление: окна не найдены — «Найти окна» или «+ окно».']);
      if (h.plan && !h.shrv) a.push(['chk', 'Отопление: не указан ШРВ.']);
    }
    if (s.cond !== false) {
      var c = r.cond || {};
      if (!c.plan) a.push(['crit', 'Кондиционирование: нет листа «План квартиры с сетями Х1, Х2, Д1».']);
      else if (!c.I) a.push(['chk', 'Кондиционирование: не указаны внутренние блоки.']);
      else if (!c.built) a.push(['chk', 'Кондиционирование ещё не построено.']);
      if (c.I && !(c.O || c.R)) a.push(['crit', 'Кондиционирование: нет наружного блока / подключения к магистрали.']);
      if (c.I && !c.K) a.push(['chk', 'Кондиционирование: не указан выпуск дренажа в К1.']);
    }
    if (s.eom !== false && !(r.eom && r.eom.panel)) a.push(['chk', 'ЭОМ: группы щита не заполнены (панель «Группы щита»).']);
    if (!(r.walls && r.walls.length) && !(r.rooms && r.rooms.n)) a.push(['info', 'Для плана не из «Помещений» укажите стены подложки (кнопка «Стены» на панелях систем).']);
    if (s.vk) a.push(['info', 'ВК пока проектируется вручную.']);
    if (!a.filter(function (x) { return x[0] !== 'info'; }).length) a.push(['info', 'Замечаний нет. Перед выпуском проверьте листы глазами.']);
    return a;
  }
  function esc(s) { return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[^\x20-\x7e]/g, function (c) { return '~u' + ('000' + c.charCodeAt(0).toString(16).toUpperCase()).slice(-4); }); }
  function inFile(st) { return '(STATE "' + esc(JSON.stringify(st)) + '")\r\n'; }
  return { FIELDS: FIELDS, SYS: SYS, cards: cards, audit: audit, inFile: inFile };
})();
if (typeof module !== 'undefined') module.exports = PROEKT;
if (typeof document !== 'undefined') (function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var host = window.chrome && window.chrome.webview;
  var escH = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var dec = function (s) { return String(s || '').replace(/\\U\+([0-9A-Fa-f]{4})/g, function (m, h) { return String.fromCharCode(parseInt(h, 16)); }); };
  var S = { reg: {}, st: { v: 1, prj: {}, sys: {} } };
  var toastT = null;
  function toast(msg, ms) { var t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(function () { t.hidden = true; }, ms || 5000); }
  function readForm() { PROEKT.FIELDS.forEach(function (k) { S.st.prj[k] = $('f_' + k).value.trim(); }); PROEKT.SYS.forEach(function (k) { S.st.sys[k] = $('s_' + k).checked; }); }
  function showForm() { PROEKT.FIELDS.forEach(function (k) { $('f_' + k).value = S.st.prj[k] || (k === 'stage' ? 'Р' : ''); }); PROEKT.SYS.forEach(function (k) { if (S.st.sys[k] != null) $('s_' + k).checked = !!S.st.sys[k]; }); }
  function render() {
    var html = PROEKT.cards(S.reg, S.st).map(function (c, i) {
      return '<div class="pj-card"><h3><span class="pj-dot ' + c.lvl + '"></span>' + (i + 1) + '. ' + escH(c.name) + '</h3><div class="st">' + escH(c.txt) + '</div>' +
        (c.tab ? '<div><button class="btn" type="button" data-tab="' + c.tab + '">Открыть</button></div>' : '') + '</div>';
    }).join('');
    if (html !== S.cardsHtml) { $('cards').innerHTML = html; S.cardsHtml = html; }   // не пересоздавать кнопки зря (щелчок после правки поля)
    $('audit').innerHTML = PROEKT.audit(S.reg, S.st).map(function (x) { return '<div class="' + x[0] + '">' + ({ crit: '⛔ ', chk: '⚠ ', info: 'ℹ ' }[x[0]]) + escH(x[1]) + '</div>'; }).join('');
  }
  $('cards').addEventListener('click', function (ev) { var b = ev.target.closest('[data-tab]'); if (!b) return; if (host) host.postMessage('tab\n' + b.dataset.tab); else toast('Откройте панель командой GIPPROEKT.'); });
  document.querySelectorAll('input,select').forEach(function (el) { el.addEventListener('change', function () { readForm(); render(); }); });
  $('readBtn').onclick = function () { if (host) host.postMessage('cmd\nGIPPRJREAD'); };
  $('saveBtn').onclick = function () { readForm(); render(); if (!host) { toast('Связь с AutoCAD недоступна.'); return; } host.postMessage('build\n' + PROEKT.inFile(S.st)); toast('Сохраняю…', 3000); };
  if (host) {
    host.addEventListener('message', function (ev) {
      var d = ev.data; if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { return; } }
      if (!d) return;
      if (d.type === 'project-result') toast((d.ok ? 'Готово: ' : 'Ошибка: ') + dec(d.msg), 6000);
      if (d.type === 'project-registry') {
        S.reg = d;
        if (d.state) { try { var st = JSON.parse(d.state); if (st && st.v) { S.st = st; S.st.prj = S.st.prj || {}; S.st.sys = S.st.sys || {}; showForm(); } } catch (e) { /* старое */ } }
        render();
      }
    });
    host.postMessage('ready\n');
  }
  showForm(); render();
  window.GIPPROEKTUI = { S: S, render: render };
})();
