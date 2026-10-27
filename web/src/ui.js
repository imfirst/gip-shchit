/* ГИП · Группы щита — интерфейс таблицы */
(function () {
  'use strict';
  var M = window.GIPM;
  var LS_STATE = 'gip-groups-state-v2', LS_TPL = 'gip-groups-templates-v1', LS_UI = 'gip-groups-ui-v1';
  function lsGet(k) { try { var s = window.localStorage.getItem(k); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
  function lsSet(k, v) { try { window.localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* хранилище недоступно */ } }

  var $ = function (id) { return document.getElementById(id); };
  var tbody = $('tbody'), thead = $('thead'), wrap = $('wrap'), dropLine = $('dropLine'), tipEl = $('tip');
  var state = null, D = null;
  var undoS = [], redoS = [];
  var sel = new Set(), selAnchor = null;
  var uiS = lsGet(LS_UI) || {};
  if (uiS.fx == null) uiS.fx = false;
  var tplForm = null;
  var rowCache = new Map();
  var prevNum = {};
  var host = (window.chrome && window.chrome.webview) ? window.chrome.webview : null;
  if (host) { var pb = document.getElementById('planBtn'); if (pb) pb.hidden = false; }

  var I = {
    grip: '<svg viewBox="0 0 12 16" aria-hidden="true"><g fill="currentColor"><circle cx="3" cy="3" r="1.4"/><circle cx="9" cy="3" r="1.4"/><circle cx="3" cy="8" r="1.4"/><circle cx="9" cy="8" r="1.4"/><circle cx="3" cy="13" r="1.4"/><circle cx="9" cy="13" r="1.4"/></g></svg>',
    undo: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5.5 4H10a4 4 0 0 1 0 8H6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M7.5 1.5 4.5 4l3 2.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    redo: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10.5 4H6a4 4 0 0 0 0 8h4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M8.5 1.5 11.5 4l-3 2.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    plus: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
    trash: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    copy: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M3.5 10.5h-.5a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h6.5a1 1 0 0 1 1 1v.5" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
    chev: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M4 2.5 7.5 6 4 9.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    lock: '<svg viewBox="0 0 14 14" aria-hidden="true"><rect x="2.5" y="6" width="9" height="6.5" rx="1.3" fill="currentColor"/><path d="M4.5 6V4.5a2.5 2.5 0 0 1 5 0V6" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
    up: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 13V3.5M4 7.5l4-4 4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    down: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v9.5M4 8.5l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    x: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    rcd: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2.5" y="2.5" width="11" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M5.5 6h5M5.5 10h5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>'
  };

  /* подсказка к «авто»-мощности розеток комнат */
  function pAutoTip() {
    var S = M.SOFT;
    return 'Розетки комнат — обычно компьютер и зарядки. ' + (state.board.phases === 3
      ? 'Мощность подобрана от ' + fmt(S.min) + ' до ' + fmt(S.max) + ' кВт, чтобы выровнять фазы.'
      : 'Принято ' + fmt(S.def) + ' кВт (при трёх фазах подбирается от ' + fmt(S.min) + ' до ' + fmt(S.max) + ' кВт под ровные фазы).') +
      ' Впишите своё значение — закрепится; сотрите — снова авто';
  }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function opt(v, label, cur, dis) { return '<option value="' + esc(v) + '"' + (String(v) === String(cur) ? ' selected' : '') + (dis ? ' disabled' : '') + '>' + esc(label) + '</option>'; }
  var fmt = M.fmt;
  function serCls(ser) { return ser === 'ЛО' ? 's-lo' : ser === 'ЛАО' ? 's-lao' : 's-ls'; }
  function phLabel(p) { return p === 'L123' ? 'L1–L3' : p; }

  /* ================================================================ состояние, отмена */
  function initState() {
    var s = lsGet(LS_STATE);
    if (s && s.v === 2 && s.board && Array.isArray(s.rows)) {
      try { return M.normalize(s); } catch (e) { /* испорчено — собираем пример */ }
    }
    var o = M.tplOptions('k3');
    return M.generate(o);
  }

  function commit(fn, opts) {
    opts = opts || {};
    var before = JSON.stringify(state);
    var work = M.clone(state);
    var ret = fn(work);
    var next = (ret && ret.st) ? ret.st : (ret && ret.rows) ? ret : work;
    var after = JSON.stringify(next);
    if (after === before) { return ret; }
    undoS.push(before); if (undoS.length > 300) undoS.shift();
    redoS = [];
    state = next;
    render(opts);
    bridgeSend();
    return ret;
  }
  function doUndo() {
    if (!undoS.length) return;
    redoS.push(JSON.stringify(state)); state = JSON.parse(undoS.pop());
    render({ flip: true }); bridgeSend(); toast('Отменено');
  }
  function doRedo() {
    if (!redoS.length) return;
    undoS.push(JSON.stringify(state)); state = JSON.parse(redoS.pop());
    render({ flip: true }); bridgeSend(); toast('Возвращено');
  }

  /* ================================================================ отрисовка */
  function render(opts) {
    opts = opts || {};
    D = M.derive(state);
    if (D.tot.kcAuto && state.board.kc !== D.tot.kc) state.board.kc = D.tot.kc; /* в чертёж уходит действующий Kс */
    var ids = {}; state.rows.forEach(function (r) { ids[r.id] = 1; });
    sel.forEach(function (id) { if (!ids[id]) sel.delete(id); });
    syncTop(); syncBoard(); renderSum(); renderBar(); renderTable(opts);
    lsSet(LS_STATE, state);
  }

  function syncTop() {
    var B = state.board, t = M.TEMPLATES[B.tpl];
    $('sub').textContent = [B.name || 'ЩР', t ? t.name : 'свой набор', (B.phases === 3 ? '3 фазы' : '1 фаза') + ', ' + (B.inType === 'qs' ? 'рубильник ' : 'автомат ') + B.inA + ' А', (M.BRANDS[B.brand] || {}).name].join(' · ');
    $('undo').disabled = !undoS.length; $('redo').disabled = !redoS.length;
  }

  /* ---------------------------------------------------------------- параметры щита (строятся один раз) */
  function buildBoard() {
    var b = $('board');
    var brands = Object.keys(M.BRANDS).map(function (k) { return opt(k, M.BRANDS[k].name, ''); }).join('');
    b.innerHTML =
      '<div class="fld"><label for="b-name">Щит</label><input id="b-name" class="w-s" data-b="name" autocomplete="off"></div>' +
      '<div class="fld"><span class="lbl">Ввод</span><div class="seg" id="b-phases" role="group" aria-label="Число фаз"><button type="button" data-v="1">1 фаза</button><button type="button" data-v="3">3 фазы</button></div></div>' +
      '<div class="fld"><label for="b-inType">Вводной аппарат</label><select id="b-inType" data-b="inType"><option value="qf">Автоматический выключатель</option><option value="qs">Рубильник (выключатель нагрузки)</option></select><small class="hint">Рубильник сам по себе не защищает от КЗ и перегрузки: проверьте наличие защиты выше по цепи.</small></div>' +
      '<div class="fld"><label for="b-inA">Номинал вводного, А</label><select id="b-inA" data-b="inA">' + M.IN_A.map(function (v) { return opt(v, v + ' А', ''); }).join('') + '</select></div>' +
      '<div class="fld" id="b-inPolesF"><span class="lbl">Полюса</span><div class="seg" id="b-inPoles" role="group" aria-label="Полюса вводного"><button type="button" data-v="3">3P</button><button type="button" data-v="4">4P</button></div></div>' +
      '<div class="fld"><label for="b-brand">Производитель</label><select id="b-brand" data-b="brand">' + brands + '</select></div>' +
      '<div class="fld"><label for="b-area">Площадь, м²</label><input id="b-area" class="w-s" data-b="area" inputmode="decimal" autocomplete="off"></div>' +
      '<div class="fld"><label for="b-pAllowed">Выделено по ТУ, кВт</label><input id="b-pAllowed" class="w-m" data-b="pAllowed" inputmode="decimal" autocomplete="off"></div>' +
      '<div class="fld"><label for="b-kc">Kс</label><div class="kcbox"><input id="b-kc" class="w-s" data-b="kc" inputmode="decimal" autocomplete="off"><button type="button" class="kcmode" id="b-kcMode" data-tip="Авто: наибольший Kс, при котором щит укладывается в выделенную мощность и вводной автомат">авто</button></div></div>' +
      '<div class="fld"><label for="b-mark">Марка кабеля</label><input id="b-mark" class="w-l" data-b="mark" autocomplete="off"></div>' +
      '<div class="fld"><label for="b-railW">Ряд корпуса</label><select id="b-railW" data-b="railW" data-tip="12 модулей — ABB UK600, 18 модулей — ABB Mistral41F">' + [12, 18].map(function (v) { return opt(v, v + ' мод.', ''); }).join('') + '</select></div>' +
      '<div class="fld" id="b-kmF"><label for="b-kmType">Контактор КМ</label><select id="b-kmType" data-b="kmType"></select></div>' +
      '<div class="fld"><label for="b-route">Прокладка кабелей</label><select id="b-route" data-b="route" data-tip="Вид блока на листе «Схема подвода кабеля к выключателям и розеткам»">' + M.ROUTES.map(function (v) { return opt(v, v, ''); }).join('') + '</select></div>' +
      '<div class="fld grow"><span class="lbl">Общие аппараты и схема</span><div class="checks">' +
        '<label class="chk"><input type="checkbox" id="b-relay" data-b="relay">Реле напряжения</label>' +
        '<label class="chk"><input type="checkbox" id="b-km" data-b="km">Мастер-выключатель</label>' +
        '<label class="chk"><input type="checkbox" id="b-fire" data-b="fire">УЗО 100 мА</label>' +
        '<label class="chk" data-tip="Без кросс-модуля провода идут от вводного (реле, УЗО 100 мА) прямо на гребёнки, N — на шину"><input type="checkbox" id="b-xb" data-b="xb">Кросс-модуль</label>' +
        '<label class="chk" data-tip="Писать длины кабелей групп на однолинейной схеме"><input type="checkbox" id="b-olLen" data-b="olLen">Длины кабелей на схеме</label>' +
      '</div></div>';
    function onB(e) {
      var el = e.target, f = el.getAttribute('data-b'); if (!f) return;
      var v = el.type === 'checkbox' ? el.checked : el.value;
      if (f === 'name' || f === 'mark') v = String(v).trim() || (f === 'name' ? 'ЩР' : 'ВВГнг(А)-LS');
      if (f === 'fsShow') { f = 'fsHide'; v = !v; }
      commit(function (st) { return M.setBoard(st, f, v); });
    }
    function onKey(e) { if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.target.blur(); }
    b.addEventListener('change', onB); b.addEventListener('keydown', onKey);
    buildFs(onB, onKey);
    $('b-kcMode').addEventListener('click', function () {
      var auto = state.board.kcMode !== 'manual';
      commit(function (st) { st.board.kcMode = auto ? 'manual' : 'auto'; if (auto) st.board.kc = D.tot.kc; return st; });
      toast(auto ? 'Kс задаётся вручную' : 'Kс подбирается под выделенную мощность и вводной автомат');
    });
    $('b-phases').addEventListener('click', function (e) {
      var bt = e.target.closest('button'); if (!bt) return;
      var v = +bt.getAttribute('data-v');
      if (v === state.board.phases) return;
      commit(function (st) { return M.setBoard(st, 'phases', v); }, { flip: true });
      toast(v === 3 ? 'Три фазы: группы распределены участками подряд' : 'Одна фаза: трёхфазные группы стали однофазными', true);
    });
    $('b-inPoles').addEventListener('click', function (e) {
      var bt = e.target.closest('button'); if (!bt) return;
      var v = +bt.getAttribute('data-v');
      commit(function (st) { return M.setBoard(st, 'inPoles', v); });
    });
  }
  /* ---------------------------------------------------------------- этажный щит (свёрнутый блок) */
  function buildFs(onB, onKey) {
    var fb = $('fsBody');
    var marks = M.FS_MARKS.map(function (m) { return '<option value="' + esc(m) + '">'; }).join('');
    fb.innerHTML =
      '<div class="fld"><span class="lbl">На схеме</span><div class="checks"><label class="chk"><input type="checkbox" id="b-fsShow" data-b="fsShow">Рисовать этажный щит</label></div></div>' +
      '<div class="fld"><label for="b-fsPre">Перед счётчиком</label><div class="pair"><select id="b-fsPre" data-b="fsPre">' + opt('qs', 'Рубильник QS', '') + opt('qf', 'Автомат QF', '') + '</select><select id="b-fsPreIn" data-b="fsPreIn" aria-label="Номинал перед счётчиком"></select></div></div>' +
      '<div class="fld"><label for="b-fsMeter">Счётчик</label><div class="pair"><input id="b-fsMeter" class="w-xl" data-b="fsMeter" list="fsMeters" autocomplete="off"><input id="b-fsMeterSpec" class="w-ml" data-b="fsMeterSpec" aria-label="Параметры счётчика" autocomplete="off"></div>' +
        '<datalist id="fsMeters"><option value="Меркурий 236 ART"><option value="Меркурий 234 ARTM"><option value="Меркурий 204 ARTMX2-02"><option value="Меркурий 201.8"><option value="Нева МТ 314"><option value="Энергомера CE308"></datalist></div>' +
      '<div class="fld"><label for="b-fsPost">После счётчика</label><div class="pair"><select id="b-fsPost" data-b="fsPost"></select><select id="b-fsPostIn" data-b="fsPostIn" aria-label="Номинал автомата"></select>' +
        '<select id="b-fsRcdIn" data-b="fsRcdIn" aria-label="Номинал УЗО"></select><select id="b-fsIdn" data-b="fsIdn" aria-label="Ток утечки"></select></div></div>' +
      '<div class="fld"><label for="b-fsMark">Вводной кабель</label><div class="pair"><input id="b-fsMark" class="w-l" data-b="fsMark" list="fsMarks" autocomplete="off"><datalist id="fsMarks">' + marks + '</datalist>' +
        '<select id="b-fsCable" data-b="fsCable" aria-label="Сечение вводного кабеля"></select></div></div>' +
      '<div class="fld"><span class="lbl">&nbsp;</span><button type="button" class="btn" id="b-fsReset" data-tip="Вернуть все значения этажного щита к подобранным автоматически">Всё авто</button></div>';
    fb.addEventListener('change', onB); fb.addEventListener('keydown', onKey);
    $('b-fsReset').addEventListener('click', function () { commit(function (st) { return M.setBoard(st, 'fsReset', true); }); toast('Этажный щит: все значения подбираются автоматически'); });
    var box = $('fsBox');
    if (uiS.fsOpen) box.open = true;
    box.addEventListener('toggle', function () { uiS.fsOpen = box.open; lsSet(LS_UI, uiS); });
  }
  function syncFs() {
    var B = state.board, f = D.fs, a = f.auto, act = document.activeElement, is3 = B.phases === 3;
    function sel(id, html, val) { var el = $(id); if (el.__h !== html) { el.innerHTML = html; el.__h = html; } if (el !== act) el.value = val; el.classList.toggle('auto', val === ''); }
    function inp(id, val, ph) { var el = $(id); if (el !== act) el.value = val || ''; el.placeholder = ph; el.classList.toggle('auto', !val); }
    function nums(list, unit, cur) { return list.map(function (v) { return opt(v, v + unit, cur); }).join(''); }
    $('b-fsShow').checked = f.show;
    sel('b-fsPre', opt('qs', 'Рубильник QS', '') + opt('qf', 'Автомат QF', ''), f.pre);
    sel('b-fsPreIn', opt('', 'авто · ' + a.preIn + ' А', '') + nums(f.pre === 'qs' ? M.FS_QS : M.FS_BRK, ' А', ''), B.fsPreIn ? String(B.fsPreIn) : '');
    inp('b-fsMeter', B.fsMeter, f.meterAuto[0]); inp('b-fsMeterSpec', B.fsMeterSpec, f.meterAuto[1]);
    var PN = { av: 'Автомат', dif: 'Дифавтомат', avrcd: 'Автомат + УЗО' };
    sel('b-fsPost', opt('', 'авто · ' + PN[a.post].toLowerCase(), '') + ['av', 'dif', 'avrcd'].map(function (k) { return opt(k, PN[k], ''); }).join(''), B.fsPost || '');
    sel('b-fsPostIn', opt('', 'авто · ' + a.postIn + ' А', '') + nums(M.FS_BRK, ' А', ''), B.fsPostIn ? String(B.fsPostIn) : '');
    sel('b-fsRcdIn', opt('', 'УЗО авто · ' + a.rcdIn + ' А', '') + nums(M.FS_RCD, ' А', ''), B.fsRcdIn ? String(B.fsRcdIn) : '');
    $('b-fsRcdIn').hidden = f.post !== 'avrcd';
    sel('b-fsIdn', opt('', 'авто · ' + a.idn + ' мА', '') + nums(M.FS_IDN, ' мА', ''), B.fsIdn ? String(B.fsIdn) : '');
    $('b-fsIdn').hidden = f.post === 'av';
    inp('b-fsMark', B.fsMark, a.mark);
    var cores = is3 ? 5 : 3;
    sel('b-fsCable', opt('', 'авто · ' + cores + '×' + M.secStr(a.sec), '') + M.FS_SEC.map(function (v) { return opt(v, cores + '×' + M.secStr(v), ''); }).join(''), B.fsCable ? String(B.fsCable) : '');
    var nSet = ['fsPre', 'fsPreIn', 'fsMeter', 'fsMeterSpec', 'fsPost', 'fsPostIn', 'fsRcdIn', 'fsIdn', 'fsMark', 'fsCable'].filter(function (k) { return B[k] != null && B[k] !== ''; }).length;
    var post = f.post === 'dif' ? 'QFD ' + f.postIn + ' А/' + f.idn + ' мА' : f.post === 'avrcd' ? 'QF ' + f.postIn + ' А + QD ' + f.rcdIn + ' А/' + f.idn + ' мА' : 'QF ' + f.postIn + ' А';
    $('fsSum').innerHTML = f.show
      ? esc((f.pre === 'qs' ? 'QS ' : 'QF ') + f.preIn + ' А → ' + f.meter + ' → ' + post + ' → ' + f.cable) + (nSet ? ' · <b>изменено: ' + nSet + '</b>' : '')
      : 'не рисуется';
    $('fsBody').classList.toggle('off', !f.show);
  }
  function syncBoard() {
    var B = state.board, act = document.activeElement;
    function setv(id, v) { var el = $(id); if (el && el !== act) el.value = v; }
    setv('b-name', B.name); setv('b-inType', B.inType || 'qf'); setv('b-inA', B.inA); setv('b-brand', B.brand); setv('b-area', fmt(B.area));
    setv('b-kc', fmt(D.tot.kc, 2)); setv('b-mark', B.mark); setv('b-railW', B.railW);
    setv('b-pAllowed', B.pAllowed != null ? fmt(B.pAllowed) : '');
    $('b-pAllowed').placeholder = 'по вводному ≈' + fmt(D.tot.PbyIn, 1);
    var km = $('b-kcMode'); km.setAttribute('aria-pressed', String(D.tot.kcAuto));
    $('b-kc').classList.toggle('kc-auto', D.tot.kcAuto);
    $('b-kc').classList.toggle('kc-low', D.tot.kcLevel === 'low'); $('b-kc').classList.toggle('kc-bad', D.tot.kcLevel === 'bad');
    ['relay', 'km', 'fire', 'xb', 'olLen'].forEach(function (k) { $('b-' + k).checked = !!B[k]; });
    var kmSel = $('b-kmType'), auto = M.kmAuto(B), fx = D.fixed.filter(function (f) { return f.id === 'km'; })[0];
    var kmHtml = opt('', 'авто · ' + auto, B.kmType || '') + M.KM_TYPES.filter(function (t) { return B.phases === 3 ? t.c === 4 : true; }).map(function (t) { return opt(t.k, t.k + ' · ' + t.I + ' А, ' + t.c + ' НО', B.kmType || ''); }).join('');
    if (kmSel.__h !== kmHtml) { kmSel.innerHTML = kmHtml; kmSel.__h = kmHtml; }
    if (kmSel !== act) kmSel.value = B.kmType || '';
    $('b-kmF').hidden = !B.km;
    setv('b-route', B.route);
    [].forEach.call($('b-phases').children, function (bt) { bt.setAttribute('aria-pressed', String(+bt.getAttribute('data-v') === B.phases)); });
    [].forEach.call($('b-inPoles').children, function (bt) { bt.setAttribute('aria-pressed', String(+bt.getAttribute('data-v') === (B.inPoles === 4 ? 4 : 3))); });
    $('b-inPolesF').hidden = B.phases !== 3;
    syncFs();
  }

  /* ---------------------------------------------------------------- сборка по шаблону */
  var APP = [['hob', 'Варочная панель'], ['oven', 'Духовой шкаф'], ['fridge', 'Холодильник'], ['dw', 'ПММ'], ['wash', 'Стиральная машина'], ['dry', 'Сушильная машина'], ['leak', 'Протечки и слаботочка']];
  function myTpls() { var a = lsGet(LS_TPL); return Array.isArray(a) ? a : []; }
  function resetTplForm(key) {
    var o = M.tplOptions(key || state.board.tpl || 'k2');
    if (!key) { o.phases = state.board.phases; o.inA = state.board.inA; o.area = state.board.area; o.mode = state.board.mode || 'dif'; }
    tplForm = o;
  }
  function buildTpl() {
    var t = $('tpl');
    var objs = Object.keys(M.TEMPLATES).map(function (k) { return opt(k, M.TEMPLATES[k].name, ''); }).join('');
    t.innerHTML =
      '<div class="tpl-row">' +
        '<div class="fld"><label for="t-tpl">Объект</label><select id="t-tpl">' + objs + '</select></div>' +
        '<div class="fld"><label for="t-area">Площадь, м²</label><input id="t-area" class="w-s" inputmode="decimal" autocomplete="off"></div>' +
        '<div class="fld"><span class="lbl">Ввод</span><div class="seg" id="t-phases"><button type="button" data-v="1">1 фаза</button><button type="button" data-v="3">3 фазы</button></div></div>' +
        '<div class="fld"><label for="t-inA">Вводной, А</label><select id="t-inA">' + M.IN_A.map(function (v) { return opt(v, v + ' А', ''); }).join('') + '</select></div>' +
        '<div class="fld"><span class="lbl">Защита розеток и техники</span><div class="seg" id="t-mode"><button type="button" data-v="dif">Дифавтоматы</button><button type="button" data-v="rcd">УЗО на несколько групп</button></div></div>' +
      '</div>' +
      '<div class="tpl-row">' +
        '<div class="fld grow"><span class="lbl">Техника — отдельной линией</span><div class="checks" id="t-app">' +
          APP.map(function (a) { return '<label class="chk"><input type="checkbox" data-app="' + a[0] + '">' + a[1] + '</label>'; }).join('') +
        '</div></div>' +
      '</div>' +
      '<div class="tpl-row">' +
        '<div class="fld"><span class="lbl">Тёплый пол, линий</span><div class="stepper" data-step="floor"><button type="button" data-d="-1" aria-label="Меньше">−</button><output id="t-floor"></output><button type="button" data-d="1" aria-label="Больше">+</button></div></div>' +
        '<div class="fld"><span class="lbl">Кондиционеры</span><div class="stepper" data-step="ac"><button type="button" data-d="-1" aria-label="Меньше">−</button><output id="t-ac"></output><button type="button" data-d="1" aria-label="Больше">+</button></div></div>' +
        '<div class="fld"><label for="t-heater">Водонагреватель</label><select id="t-heater">' + opt('none', 'Нет', '') + opt('boiler', 'Накопительный', '') + opt('flow', 'Проточный', '') + '</select></div>' +
        '<div class="fld grow"></div>' +
        '<button class="btn primary" type="button" id="t-build">Собрать щит</button>' +
        '<button class="btn" type="button" id="t-close">Закрыть</button>' +
      '</div>' +
      '<div class="tpl-row" style="border-top:1px solid var(--line);padding-top:12px">' +
        '<div class="fld"><label for="t-myname">Мои шаблоны</label><input id="t-myname" class="w-l" placeholder="Название, например «Коттедж 120 м²»" autocomplete="off" style="width:260px"></div>' +
        '<button class="btn" type="button" id="t-save">Сохранить текущий щит как шаблон</button>' +
        '<div class="mytpl" id="t-my"></div>' +
      '</div>';
    $('t-tpl').addEventListener('change', function (e) { resetTplForm(e.target.value); syncTpl(); });
    $('t-area').addEventListener('change', function (e) { tplForm.area = M.num(e.target.value, tplForm.area); syncTpl(); });
    $('t-inA').addEventListener('change', function (e) { tplForm.inA = +e.target.value; });
    $('t-heater').addEventListener('change', function (e) { tplForm.heater = e.target.value; });
    $('t-phases').addEventListener('click', function (e) { var bt = e.target.closest('button'); if (!bt) return; tplForm.phases = +bt.getAttribute('data-v'); tplForm.inA = tplForm.phases === 3 ? 25 : 40; syncTpl(); });
    $('t-mode').addEventListener('click', function (e) { var bt = e.target.closest('button'); if (!bt) return; tplForm.mode = bt.getAttribute('data-v'); syncTpl(); });
    $('t-app').addEventListener('change', function (e) { var k = e.target.getAttribute('data-app'); if (k) tplForm.app[k] = e.target.checked; });
    t.addEventListener('click', function (e) {
      var st = e.target.closest('.stepper button'); if (!st) return;
      var k = st.parentNode.getAttribute('data-step'), d = +st.getAttribute('data-d');
      tplForm[k] = Math.max(0, Math.min(6, (tplForm[k] | 0) + d)); syncTpl();
    });
    $('t-build').addEventListener('click', function () {
      var o = M.clone(tplForm), name = (M.TEMPLATES[o.tpl] || {}).name;
      commit(function (st) {
        var ns = M.generate(o, st.board);
        return ns;
      }, { flip: false });
      sel.clear(); applySel(); renderBar();
      toast('Собран щит «' + name + '»: ' + D.tot.groups + ' групп', true);
    });
    $('t-close').addEventListener('click', function () { toggleTpl(false); });
    $('t-save').addEventListener('click', function () {
      var nm = $('t-myname').value.trim();
      if (!nm) { $('t-myname').focus(); toast('Впишите название шаблона'); return; }
      var a = myTpls().filter(function (x) { return x.name !== nm; });
      a.push({ name: nm, state: M.clone(state) });
      lsSet(LS_TPL, a); $('t-myname').value = ''; syncTpl();
      toast('Шаблон «' + nm + '» сохранён в этом браузере');
    });
    $('t-my').addEventListener('click', function (e) {
      var bt = e.target.closest('button'); if (!bt) return;
      var i = +bt.getAttribute('data-i'), a = myTpls(), t1 = a[i]; if (!t1) return;
      if (bt.getAttribute('data-a') === 'del') { a.splice(i, 1); lsSet(LS_TPL, a); syncTpl(); toast('Шаблон «' + t1.name + '» удалён'); return; }
      commit(function () { return M.normalize(M.clone(t1.state)); });
      sel.clear(); applySel(); renderBar();
      toast('Собран щит по шаблону «' + t1.name + '»', true);
    });
  }
  function syncTpl() {
    var f = tplForm;
    $('t-tpl').value = f.tpl; if (document.activeElement !== $('t-area')) $('t-area').value = fmt(f.area);
    $('t-inA').value = f.inA; $('t-heater').value = f.heater;
    [].forEach.call($('t-phases').children, function (bt) { bt.setAttribute('aria-pressed', String(+bt.getAttribute('data-v') === f.phases)); });
    [].forEach.call($('t-mode').children, function (bt) { bt.setAttribute('aria-pressed', String(bt.getAttribute('data-v') === f.mode)); });
    [].forEach.call($('t-app').querySelectorAll('input'), function (el) { el.checked = !!f.app[el.getAttribute('data-app')]; });
    $('t-floor').textContent = f.floor; $('t-ac').textContent = f.ac;
    var a = myTpls();
    $('t-my').innerHTML = a.length ? a.map(function (x, i) {
      return '<span class="t">' + esc(x.name) + '<button type="button" data-i="' + i + '" data-a="use">Собрать</button><button type="button" data-i="' + i + '" data-a="del" aria-label="Удалить шаблон ' + esc(x.name) + '">×</button></span>';
    }).join('') : '<span class="muted" style="font-size:12.5px">Сохранённых пока нет — соберите щит под свой объект и сохраните его здесь.</span>';
  }
  function toggleTpl(on) {
    var t = $('tpl'), b = $('tplBtn');
    if (on == null) on = t.hidden;
    if (on) { resetTplForm(); syncTpl(); }
    t.hidden = !on; b.setAttribute('aria-expanded', String(on));
  }

  /* ---------------------------------------------------------------- сводка */
  function renderSum() {
    var T = D.tot, B = state.board, is3 = D.is3;
    var load = Math.min(100, T.Ir / Math.max(B.inA, 1) * 100), over = T.Ir > B.inA;
    var h = '';
    var pillK = T.kcLevel === 'bad' ? '<span class="pill bad">Kс критично мал</span>' : T.kcLevel === 'low' ? '<span class="pill warn">низкий Kс</span>' : '';
    h += '<div class="card"><h3>Нагрузка ' + (over ? '<span class="pill bad">больше вводного</span>' : (pillK || '<span class="pill ok">в пределах ввода</span>')) + '</h3>' +
      '<div class="big">' + fmt(T.Ir, 1) + ' <small>А из ' + B.inA + ' А' + (is3 ? ' · макс. фаза' : '') + '</small></div>' +
      '<div class="meter' + (over ? ' over' : '') + '"><i style="width:' + load.toFixed(1) + '%"></i></div>' +
      '<div class="kv"><span>Pуст <b>' + fmt(T.P, 1) + '</b> кВт</span><span>Kс <b class="kcv-' + T.kcLevel + '">' + fmt(T.kc, 2) + '</b>' + (T.kcAuto ? ' авто' : '') + '</span><span>Pр <b>' + fmt(T.Pr, 1) + '</b> из ' + fmt(T.Pcap, 1) + ' кВт</span><span>cos φ <b>' + fmt(T.cos, 2) + '</b></span></div></div>';
    if (is3) {
      var mx = Math.max.apply(null, T.phases.map(function (p) { return p.P; })) || 1;
      var imbCls = T.imb > M.IMB_WARN ? 'warn' : 'ok';
      h += '<div class="card"><h3>Фазы ' + (B.phaseMode === 'abc' ? '<span class="pill ok" data-tip="Фазы идут по порядку L1 L2 L3 — трёхфазная гребёнка">ABC</span>' : '') + '<span class="pill ' + imbCls + '">перекос ' + fmt(T.imb, 0) + ' %</span></h3><div class="phases">' +
        T.phases.map(function (p, i) {
          return '<div class="ph-row"><span><span class="phd ph-' + p.ph + '"></span></span><div class="pbar"><i style="width:' + (p.P / mx * 100).toFixed(1) + '%;background:var(--ph' + (i + 1) + ')"></i></div><b>' + fmt(p.P, 1) + ' кВт · ' + fmt(p.Ir, 0) + ' А</b></div>';
        }).join('') +
        '</div><div class="acts"><div class="menu-wrap"><button class="btn" type="button" id="balBtn" aria-haspopup="true" aria-expanded="false">Распределить фазы</button>' +
        '<div class="menu" id="balMenu" hidden>' +
          '<button type="button" data-bal="abc">ABC подряд <small>как раздаёт трёхфазная гребёнка; фазы пересчитываются при перестановке</small></button>' +
          '<button type="button" data-bal="seq">Участками AAA BBB CCC <small>порядок не меняется, однофазные гребёнки</small></button>' +
          '<button type="button" data-bal="power">По мощности <small>ровнее, фазы вперемешку</small></button>' +
          '<button type="button" data-bal="unlock">Открепить все фазы <small>сброс ручных фаз</small></button>' +
        '</div></div></div></div>';
    } else {
      h += '<div class="card"><h3>Фазы</h3><div class="big">1 фаза <small>230 В</small></div><div class="kv"><span>Все группы на фазе L. Для трёх фаз переключите ввод выше.</span></div></div>';
    }
    var c = T.counts, sr = T.ser;
    h += '<div class="card"><h3>Группы</h3><div class="big">' + T.groups + ' <small>' + plural(T.groups, 'группа', 'группы', 'групп') + '</small></div>' +
      '<div class="kv"><span><span class="chip s-lo">ЛО</span> <b>' + sr['ЛО'] + '</b></span><span><span class="chip s-ls">ЛС</span> <b>' + sr['ЛС'] + '</b></span>' + (sr['ЛАО'] ? '<span><span class="chip s-lao">ЛАО</span> <b>' + sr['ЛАО'] + '</b></span>' : '') + '</div>' +
      '<div class="kv"><span>автоматов <b>' + (c.av + c.rcd) + '</b></span><span>дифавтоматов <b>' + c.dif + '</b></span><span>УЗО <b>' + c.u + '</b></span></div></div>';
    var used = T.modules, cap = T.cap;
    h += '<div class="card"><h3>Корпус ' + (T.box ? '<span class="pill ok">ABB ' + esc(T.box.n) + '</span>' : '<span class="pill warn">нет готового</span>') + '</h3><div class="big">' + used + ' <small>мод. из ' + cap + ' · ' + T.rails + ' ' + plural(T.rails, 'ряд', 'ряда', 'рядов') + ' по ' + B.railW + '</small></div>' +
      '<div class="meter' + (used > cap ? ' over' : '') + '"><i style="width:' + Math.min(100, used / Math.max(cap, 1) * 100).toFixed(1) + '%"></i></div>' +
      '<div class="kv"><span>свободно <b>' + Math.max(0, cap - used) + '</b> мод.' + (T.box && T.box.art ? ' · ' + esc(T.box.art) : '') + '</span></div></div>';
    var W = [];
    T.warn.forEach(function (t) { W.push({ t: t }); });
    D.rows.forEach(function (v) { v.warn.forEach(function (w) { W.push({ id: v.id, ref: v.t === 'u' ? v.ref : v.num, t: w.t }); }); });
    h += '<div class="card"><h3>Проверки ' + (W.length ? '<span class="pill warn">' + W.length + ' ' + plural(W.length, 'замечание', 'замечания', 'замечаний') + '</span>' : '<span class="pill ok">без замечаний</span>') + '</h3>' +
      (W.length ? '<ul class="warnlist">' + W.map(function (w) {
        return '<li>' + (w.id ? '<button type="button" data-jump="' + esc(w.id) + '"><span class="gref">' + esc(w.ref) + '</span>' + esc(w.t) + '</button>' : '<span style="color:var(--warn)">' + esc(w.t) + '</span>') + '</li>';
      }).join('') + '</ul>' : '<div class="kv"><span>Номиналы, кабели по току (ПУЭ 1.3.6), потери напряжения до ' + M.DU_WARN + ' %, УЗО по нагрузке.</span></div>') + '</div>';
    $('sum').innerHTML = h;
  }
  function plural(n, a, b, c) { n = Math.abs(n) % 100; var k = n % 10; if (n > 10 && n < 20) return c; if (k > 1 && k < 5) return b; if (k === 1) return a; return c; }

  /* ---------------------------------------------------------------- панель действий */
  function buildBar() {
    var cats = M.CAT_ORDER.map(function (k) { var c = M.CAT[k]; return '<button type="button" data-add="' + k + '">' + esc(c.label) + ' <small>' + c.ser + '</small></button>'; }).join('');
    $('bar').innerHTML =
      '<div class="menu-wrap"><button class="btn primary" type="button" id="addBtn" aria-haspopup="true" aria-expanded="false">' + I.plus + 'Группа</button><div class="menu" id="addMenu" hidden><div class="mh">Добавить после выделенной</div>' + cats + '</div></div>' +
      '<button class="btn" type="button" id="addRcd">' + I.rcd + 'УЗО</button>' +
      '<div class="seltools" id="seltools" hidden>' +
        '<span class="count" id="selCount"></span>' +
        '<button class="btn" type="button" id="sWrap" title="Объединить выделенные группы под новым УЗО">Под одно УЗО</button>' +
        '<button class="btn icon" type="button" id="sUp" title="Сдвинуть влево по щиту (Alt+↑)" aria-label="Сдвинуть вверх">' + I.up + '</button>' +
        '<button class="btn icon" type="button" id="sDown" title="Сдвинуть вправо по щиту (Alt+↓)" aria-label="Сдвинуть вниз">' + I.down + '</button>' +
        '<button class="btn icon" type="button" id="sDup" title="Дублировать (Ctrl+D)" aria-label="Дублировать">' + I.copy + '</button>' +
        '<button class="btn icon danger" type="button" id="sDel" title="Удалить (Del)" aria-label="Удалить">' + I.trash + '</button>' +
        '<button class="btn ghost" type="button" id="sClear">Снять выделение</button>' +
      '</div>' +
      '<span class="hint">Порядок строк — порядок аппаратов в щите слева направо. Тащите за <span class="kbd">⠿</span>, номера ЛО/ЛС пересчитаются сами.</span>';
    $('addBtn').addEventListener('click', function () { toggleMenu('addMenu', 'addBtn'); });
    $('addMenu').addEventListener('click', function (e) {
      var bt = e.target.closest('[data-add]'); if (!bt) return;
      closeMenus();
      var cat = bt.getAttribute('data-add');
      var r = commit(function (st) { return M.addGroup(st, cat, lastSelected()); });
      if (r && r.id) { sel.clear(); sel.add(r.id); selAnchor = r.id; applySel(); renderBar(); landRows([r.id]); focusCell(r.id, 'name', true); }
    });
    $('addRcd').addEventListener('click', function () {
      var r = commit(function (st) { return M.addRcd(st, lastSelected()); });
      if (r && r.id) { sel.clear(); sel.add(r.id); applySel(); renderBar(); landRows([r.id]); toast('Новое УЗО: перетащите под него группы или нажмите «+ Группа под это УЗО»'); }
    });
    $('sWrap').addEventListener('click', wrapSelected);
    $('sUp').addEventListener('click', function () { nudgeSel(-1); });
    $('sDown').addEventListener('click', function () { nudgeSel(1); });
    $('sDup').addEventListener('click', dupSelected);
    $('sDel').addEventListener('click', delSelected);
    $('sClear').addEventListener('click', function () { sel.clear(); applySel(); renderBar(); });
  }
  function renderBar() {
    var n = sel.size;
    $('seltools').hidden = !n;
    $('bar').classList.toggle('has-sel', !!n);
    if (n) {
      var g = selGroups().length, u = n - g;
      $('selCount').textContent = 'Выбрано: ' + (g ? g + ' ' + plural(g, 'группа', 'группы', 'групп') : '') + (g && u ? ' + ' : '') + (u ? u + ' УЗО' : '');
      $('sWrap').disabled = !g; $('sDup').disabled = !g;
    }
  }
  function lastSelected() {
    var last = null; D.rows.forEach(function (v) { if (sel.has(v.id)) last = v.id; }); return last;
  }
  function selGroups() { return D.rows.filter(function (v) { return v.t === 'g' && sel.has(v.id); }).map(function (v) { return v.id; }); }
  function selAll() { return D.rows.filter(function (v) { return sel.has(v.id); }).map(function (v) { return v.id; }); }
  function wrapSelected() {
    var ids = selGroups(); if (!ids.length) return;
    var r = commit(function (st) { return M.wrapRcd(st, ids); }, { flip: true });
    if (r && r.id) { sel.clear(); sel.add(r.id); applySel(); renderBar(); landRows([r.id].concat(ids)); toast(ids.length + ' ' + plural(ids.length, 'группа', 'группы', 'групп') + ' под новым УЗО ' + D.byId[r.id].ref, true); }
  }
  function nudgeSel(dir) {
    var g = selGroups(), all = selAll(), ids;
    if (g.length) ids = g; else if (all.length === 1) ids = all; else return;
    commit(function (st) { return M.nudge(st, ids, dir); }, { flip: true });
    landRows(ids);
  }
  function dupSelected() {
    var ids = selGroups(); if (!ids.length) return;
    var r = commit(function (st) { return M.duplicate(st, ids); }, { flip: true });
    if (r && r.ids) { sel.clear(); r.ids.forEach(function (id) { sel.add(id); }); applySel(); renderBar(); landRows(r.ids); toast('Добавлено копий: ' + r.ids.length, true); }
  }
  function delSelected() {
    var ids = selAll(); if (!ids.length) return;
    var names = ids.map(function (id) { var v = D.byId[id]; return v.t === 'u' ? 'УЗО ' + v.ref : v.num + ' ' + v.name; });
    commit(function (st) { return M.removeRows(st, ids); }, { flip: true });
    sel.clear(); applySel(); renderBar();
    toast('Удалено: ' + (names.length > 2 ? names.length + ' строк' : names.join(', ')) + '. Номера пересчитаны', true);
  }

  /* ---------------------------------------------------------------- меню */
  function toggleMenu(mid, bid) {
    var m = $(mid), b = $(bid), open = m.hidden;
    closeMenus();
    if (open) { m.hidden = false; b.setAttribute('aria-expanded', 'true'); var f = m.querySelector('button'); if (f) f.focus(); }
  }
  function closeMenus() {
    ['addMenu', 'balMenu'].forEach(function (id) { var m = $(id); if (m) m.hidden = true; });
    ['addBtn', 'balBtn'].forEach(function (id) { var b = $(id); if (b) b.setAttribute('aria-expanded', 'false'); });
  }
  document.addEventListener('click', function (e) {
    if (!e.target.closest('.menu-wrap')) closeMenus();
  });
  $('sum').addEventListener('click', function (e) {
    var bb = e.target.closest('#balBtn'); if (bb) { toggleMenu('balMenu', 'balBtn'); return; }
    var bal = e.target.closest('[data-bal]');
    if (bal) {
      var mode = bal.getAttribute('data-bal'); closeMenus();
      if (mode === 'unlock') { commit(function (st) { st.rows.forEach(function (r) { r.lock = false; }); return st; }); toast('Ручные фазы откреплены', true); return; }
      var before = D.tot.imb;
      commit(function (st) { return M.balance(st, mode); });
      toast('Фазы распределены ' + ({ abc: 'ABC подряд', seq: 'участками', power: 'по мощности' })[mode] + ': перекос ' + fmt(before, 0) + ' → ' + fmt(D.tot.imb, 0) + ' %', true);
      return;
    }
    var j = e.target.closest('[data-jump]');
    if (j) jumpTo(j.getAttribute('data-jump'));
  });

  /* ---------------------------------------------------------------- таблица */
  function cols() {
    var c = ['h', 'ref', 'num', 'cat', 'name', 'prot', 'in', 'p', 'ir'];
    if (D.is3) c.push('ph');
    c.push('cab', 'len', 'du');
    if (state.board.km) c.push('km');
    c.push('act');
    return c;
  }
  var HEAD = { h: '', ref: 'Поз.', num: 'Группа', cat: 'Назначение', name: 'Наименование', prot: 'Защита', 'in': 'Ном., А', p: 'P, кВт', ir: 'Iр, А', ph: 'Фаза', cab: 'Кабель', len: 'L, м', du: 'ΔU, %', km: 'КМ', act: '' };
  var HEAD_TIP = { ref: 'Позиционное обозначение на схеме', num: 'Номер группы на планах: ЛО — освещение, ЛАО — аварийное, ЛС — всё остальное', ir: 'Расчётный ток группы', len: 'Пусто — оценка по площади квартиры', du: 'Потери напряжения ΔU = P·L/(C·S), медь: C = 12,8 (230 В), 77 (400 В)', km: 'Через мастер-выключатель (контактор)' };
  var COLW = { h: 32, ref: 58, num: 68, cat: 142, prot: 172, p: 64, ir: 58, ph: 82, cab: 112, len: 58, du: 56, km: 36, act: 82 };
  function renderHead(C) {
    var w = {}; for (var k in COLW) w[k] = COLW[k];
    w['in'] = D.is3 ? 102 : 68;
    var minW = 230; C.forEach(function (k) { if (w[k]) minW += w[k]; });
    var cg = '<colgroup>' + C.map(function (k) { return '<col' + (w[k] ? ' style="width:' + w[k] + 'px"' : '') + '>'; }).join('') + '</colgroup>';
    var h = '<tr>' + C.map(function (k) {
      var n = (k === 'p' || k === 'ir' || k === 'len' || k === 'du') ? ' num' : '';
      return '<th class="c-' + k + n + '"' + (HEAD_TIP[k] ? ' data-tip="' + esc(HEAD_TIP[k]) + '"' : '') + '>' + esc(HEAD[k]) + '</th>';
    }).join('') + '</tr>';
    if (thead.__h !== h + cg) {
      var g = $('grid'), old = g.querySelector('colgroup'); if (old) old.remove();
      g.insertAdjacentHTML('afterbegin', cg);
      thead.innerHTML = h; thead.__h = h + cg;
      g.style.minWidth = minW + 'px';
    }
  }
  function protSelect(v) {
    var cur = v.prot === 'rcd' ? 'rcd:' + v.rcd : v.prot;
    var o = opt('av', 'Автомат', cur) + opt('dif', 'Дифавтомат', cur);
    D.rows.forEach(function (u) {
      if (u.t !== 'u') return;
      o += opt('rcd:' + u.id, 'Под УЗО ' + u.ref + (D.is3 && u.poles === 2 ? ' · ' + u.phase : ''), cur, v.poles === 3 && u.poles === 2);
    });
    o += opt('rcd:new', 'Под новое УЗО', cur);
    var h = '<select class="cell" id="c-' + v.id + '-prot" data-f="prot" aria-label="Защита">' + o + '</select>';
    if (v.prot === 'dif') h = '<div class="duo">' + h + '<select class="cell xs" id="c-' + v.id + '-idn" data-f="idn" aria-label="Ток утечки, мА" data-tip="Ток утечки, мА">' + M.IDN.map(function (x) { return opt(x, x, v.idn); }).join('') + '</select></div>';
    else h = '<div class="duo">' + h + '</div>';
    return h;
  }
  function planMark() { return String(state.board.mark || '').replace(/\((А|A)\)/g, ''); }
  function groupRow(v, C) {
    var cells = {};
    var noCab = M.CAT[v.cat] && M.CAT[v.cat].noCable;
    var wf = {}; v.warn.forEach(function (w) { wf[w.f] = 1; });
    cells.h = '<td class="c-h"><button type="button" class="handle" aria-label="Перетащить ' + esc(v.num) + '">' + I.grip + '</button></td>';
    cells.ref = '<td class="c-ref" data-tip="' + esc(v.model) + '">' + esc(v.ref) + '</td>';
    var plan = v.num + (v.cableEff ? ' · ' + planMark() + ' ' + v.cableEff : '');
    cells.num = '<td class="c-num" data-tip="На плане: ' + esc(plan) + '"><span class="chip ' + serCls(v.ser) + '">' + esc(v.num) + '</span></td>';
    cells.cat = '<td class="c-cat td-pad"><select class="cell" id="c-' + v.id + '-cat" data-f="cat" aria-label="Назначение">' + M.CAT_ORDER.map(function (k) { return opt(k, M.CAT[k].label, v.cat); }).join('') + '</select></td>';
    cells.name = '<td class="c-name td-pad"><input class="cell" id="c-' + v.id + '-name" data-f="name" value="' + esc(v.name) + '" aria-label="Наименование" autocomplete="off"></td>';
    cells.prot = '<td class="c-prot">' + protSelect(v) + '</td>';
    var inSel = '<select class="cell" id="c-' + v.id + '-In" data-f="In" aria-label="Номинал, А">' + M.STD_IN.map(function (x) { return opt(x, x, v.In); }).join('') + '</select>';
    cells['in'] = '<td class="c-in' + (wf.In ? ' w-cell' : '') + '"' + (wf.In ? ' data-tip="' + esc(v.warn.filter(function (w) { return w.f === 'In'; }).map(function (w) { return w.t; }).join('\n')) + '"' : '') + '><div class="duo">' +
      (D.is3 ? '<select class="cell xs" id="c-' + v.id + '-poles" data-f="poles" aria-label="Полюса">' + opt(1, '1P', v.poles) + opt(3, '3P', v.poles) + '</select>' : '') + inSel + '</div></td>';
    cells.p = noCab ? '<td class="c-p num"><span class="muted" style="padding:0 8px">—</span></td>' :
      '<td class="c-p td-pad"' + (v.pAuto ? ' data-tip="' + esc(pAutoTip()) + '"' : '') + '><input class="cell num' + (v.pAuto ? ' auto' : '') + '" id="c-' + v.id + '-p" data-f="p" value="' + esc(fmt(v.p)) + '" inputmode="decimal" aria-label="Мощность, кВт" autocomplete="off"></td>';
    cells.ir = '<td class="c-ir num">' + (noCab ? '<span class="muted">—</span>' : fmt(v.Ir, 1)) + '</td>';
    if (D.is3) {
      if (v.poles === 3) cells.ph = '<td class="c-ph"><span class="phtxt"><span class="phd ph-L123"></span>L1–L3</span></td>';
      else if (v.rcd && D.byId[v.rcd].poles === 2) cells.ph = '<td class="c-ph" data-tip="Фаза задаётся у УЗО ' + esc(D.byId[v.rcd].ref) + '"><span class="phtxt"><span class="phd ph-' + v.phase + '"></span>' + v.phase + '</span></td>';
      else cells.ph = '<td class="c-ph"><div class="phcell"><span class="phd ph-' + v.phase + '"></span><select class="cell" id="c-' + v.id + '-phase" data-f="phase" aria-label="Фаза">' + ['L1', 'L2', 'L3'].map(function (p) { return opt(p, p, v.phase); }).join('') + '</select>' +
        (v.lock ? '<button type="button" class="lockb" data-act="unlock" data-tip="Фаза задана вручную — «Распределить фазы» её не меняет. Щёлкните, чтобы открепить" aria-label="Открепить фазу">' + I.lock + '</button>' : '') + '</div></td>';
    }
    if (noCab) {
      cells.cab = '<td class="c-cab"><span class="phtxt">—</span></td>';
      cells.len = '<td class="c-len num"><span class="muted" style="padding:0 8px">—</span></td>';
      cells.du = '<td class="c-du num"><span class="muted">—</span></td>';
    } else {
      var cores = v.poles === 3 ? 5 : 3;
      var co = opt('', 'авто · ' + v.cableAuto, v.cable || '') + M.SECTIONS.map(function (S) { var s = M.cableStr(cores, S); return opt(s, s, v.cable || ''); }).join('');
      if (v.cable && co.indexOf('value="' + esc(v.cable) + '"') < 0) co += opt(v.cable, v.cable, v.cable);
      var cTip = wf.cable ? v.warn.filter(function (w) { return w.f === 'cable'; })[0].t : (state.board.mark + ' ' + v.cableEff + (v.Iz ? ' · Iдоп ' + fmt(v.Iz) + ' А' : ''));
      cells.cab = '<td class="c-cab td-pad' + (wf.cable ? ' w-cell' : '') + '" data-tip="' + esc(cTip) + '"><select class="cell' + (v.cable ? '' : ' auto') + '" id="c-' + v.id + '-cable" data-f="cable" aria-label="Кабель">' + co + '</select></td>';
      cells.len = '<td class="c-len td-pad"' + (v.len == null ? ' data-tip="Оценка по площади ' + esc(fmt(state.board.area)) + ' м². Впишите свою длину"' : '') + '><input class="cell num' + (v.len == null ? ' auto' : '') + '" id="c-' + v.id + '-len" data-f="len" value="' + (v.len != null ? esc(fmt(v.len)) : '') + '" placeholder="' + v.lenAuto + '" inputmode="decimal" aria-label="Длина кабеля, м" autocomplete="off"></td>';
      cells.du = '<td class="c-du num' + (wf.dU ? ' w-cell' : '') + '"' + (wf.dU ? ' data-tip="' + esc(v.warn.filter(function (w) { return w.f === 'dU'; })[0].t) + '"' : '') + '>' + fmt(v.dU, 1) + '</td>';
    }
    if (state.board.km) cells.km = '<td class="c-km">' + (v.prot === 'rcd' ? '' : '<input type="checkbox" id="c-' + v.id + '-km" data-f="km"' + (v.km ? ' checked' : '') + ' aria-label="Через мастер-выключатель" style="width:15px;height:15px;accent-color:var(--accent)">') + '</td>';
    cells.act = '<td class="c-act"><div class="acts-row">' +
      (v.warn.length ? '<button type="button" class="wbadge" data-act="warn" data-tip="' + esc(v.warn.map(function (w) { return w.t; }).join('\n')) + '" aria-label="Замечания: ' + v.warn.length + '">!' + (v.warn.length > 1 ? v.warn.length : '') + '</button>' : '') +
      '<button type="button" class="ib" data-act="dup" data-tip="Дублировать" aria-label="Дублировать">' + I.copy + '</button>' +
      '<button type="button" class="ib del" data-act="del" data-tip="Удалить" aria-label="Удалить">' + I.trash + '</button></div></td>';
    return '<tr class="r-g' + (v.rcd ? ' in-blk' : '') + '" data-key="' + v.id + '" data-id="' + v.id + '" data-kind="g">' + C.map(function (k) { return cells[k]; }).join('') + '</tr>';
  }
  function rcdRow(v, C) {
    var cells = {};
    var wf = {}; v.warn.forEach(function (w) { wf[w.f] = 1; });
    var n = v.members.length;
    cells.h = '<td class="c-h"><button type="button" class="handle" aria-label="Перетащить УЗО ' + esc(v.ref) + ' вместе с группами">' + I.grip + '</button></td>';
    cells.ref = '<td class="c-ref" data-tip="' + esc(v.model) + '">' + esc(v.ref) + '</td>';
    cells.num = '<td class="c-num"><span class="chip s-u">УЗО</span></td>';
    cells.cat = '<td class="c-cat td-pad">' + (D.is3 ? '<select class="cell" id="c-' + v.id + '-poles" data-f="poles" aria-label="Полюса УЗО">' + opt(2, '2P · однофазное', v.poles) + opt(4, '4P · трёхфазное', v.poles) + '</select>' : '<span class="u-model">2P</span>') + '</td>';
    cells.name = '<td class="c-name"><span class="u-model"><b>' + esc(v.model) + '</b> · ' + n + ' ' + plural(n, 'группа', 'группы', 'групп') + '</span></td>';
    cells.prot = '<td class="c-prot"><div class="duo"><select class="cell sm" id="c-' + v.id + '-type" data-f="type" aria-label="Тип УЗО">' + opt('A', 'тип A', v.type) + opt('AC', 'тип AC', v.type) + '</select>' +
      '<select class="cell sm" id="c-' + v.id + '-idn" data-f="idn" aria-label="Ток утечки">' + [10, 30, 100, 300].map(function (x) { return opt(x, x + ' мА', v.idn); }).join('') + '</select></div></td>';
    cells['in'] = '<td class="c-in' + (wf.In ? ' w-cell' : '') + '"' + (wf.In ? ' data-tip="' + esc(v.warn.filter(function (w) { return w.f === 'In'; }).map(function (w) { return w.t; }).join('\n')) + '"' : '') + '><div class="duo"><select class="cell" id="c-' + v.id + '-In" data-f="In" aria-label="Номинал УЗО">' + M.RCD_IN.map(function (x) { return opt(x, x, v.In); }).join('') + '</select></div></td>';
    cells.p = '<td class="c-p num" style="padding:0 8px">' + fmt(v.sumP, 1) + '</td>';
    cells.ir = '<td class="c-ir num' + (wf.In ? ' w-cell' : '') + '">' + fmt(v.sumIr, 1) + '</td>';
    if (D.is3) {
      if (v.poles === 4) cells.ph = '<td class="c-ph"><span class="phtxt"><span class="phd ph-L123"></span>L1–L3</span></td>';
      else cells.ph = '<td class="c-ph"><div class="phcell"><span class="phd ph-' + v.phase + '"></span><select class="cell" id="c-' + v.id + '-phase" data-f="phase" aria-label="Фаза УЗО">' + ['L1', 'L2', 'L3'].map(function (p) { return opt(p, p, v.phase); }).join('') + '</select>' +
        (v.lock ? '<button type="button" class="lockb" data-act="unlock" data-tip="Фаза задана вручную. Щёлкните, чтобы открепить" aria-label="Открепить фазу">' + I.lock + '</button>' : '') + '</div></td>';
    }
    cells.cab = '<td class="c-cab"></td>'; cells.len = '<td class="c-len"></td>'; cells.du = '<td class="c-du"></td>';
    if (state.board.km) cells.km = '<td class="c-km"></td>';
    cells.act = '<td class="c-act"><div class="acts-row">' +
      (v.warn.length ? '<button type="button" class="wbadge" data-act="warn" data-tip="' + esc(v.warn.map(function (w) { return w.t; }).join('\n')) + '" aria-label="Замечания">!' + (v.warn.length > 1 ? v.warn.length : '') + '</button>' : '') +
      '<button type="button" class="ib del" data-act="del" data-tip="Удалить УЗО — группы останутся, станут дифавтоматами" aria-label="Удалить УЗО">' + I.trash + '</button></div></td>';
    return '<tr class="r-u" data-key="' + v.id + '" data-id="' + v.id + '" data-kind="u">' + C.map(function (k) { return cells[k]; }).join('') + '</tr>';
  }
  function endRow(v, C) {
    return '<tr class="r-end" data-key="e-' + v.id + '" data-id="' + v.id + '" data-kind="end"><td class="c-h"></td><td colspan="' + (C.length - 1) + '"><div class="endtxt"><span>Конец блока ' + esc(v.ref) + '</span>' +
      '<button type="button" class="lnk" data-act="add-in">+ Группа под это УЗО</button></div></td></tr>';
  }
  function fixedRows(C) {
    var F = D.fixed, out = [];
    var brief = F.map(function (f) { return f.ref; });
    var sum = F[0].model + ' · ' + (brief.length > 1 ? brief.slice(1).join(', ') : '');
    out.push({ key: 'sec-fx', html: '<tr class="r-sec" data-key="sec-fx"><td colspan="' + C.length + '"><button type="button" class="sec-btn" data-act="fx" aria-expanded="' + (uiS.fx ? 'true' : 'false') + '">' + I.chev + '<b>Ввод и общие аппараты</b><span>' + esc(F[0].ref + ' ' + sum) + '</span></button></td></tr>' });
    if (uiS.fx) F.forEach(function (f) {
      out.push({ key: 'f-' + f.id, html: '<tr class="r-fx" data-key="f-' + f.id + '"><td class="c-h"></td><td class="c-ref">' + esc(f.ref) + '</td><td class="c-num"></td><td class="c-fx" colspan="2"><b>' + esc(f.name) + '</b></td><td class="c-fx">' + esc(f.model) + '</td><td class="c-fx">' + (f.In ? f.In + ' А' : '') + '</td><td class="c-fx" colspan="' + (C.length - 7) + '">' + f.w + ' мод.</td></tr>' });
    });
    out.push({ key: 'sec-g', html: '<tr class="r-sec" data-key="sec-g"><td colspan="' + C.length + '"><div class="sec-btn" style="cursor:default"><b>Групповые линии</b><span>по порядку слева направо, как в щите</span></div></td></tr>' });
    return out;
  }

  function renderTable(opts) {
    var C = cols();
    renderHead(C);
    var want = fixedRows(C);
    D.rows.forEach(function (v, i) {
      if (v.t === 'u') {
        want.push({ key: v.id, html: rcdRow(v, C) });
        if (!v.members.length) want.push({ key: 'e-' + v.id, html: endRow(v, C) });
      } else {
        want.push({ key: v.id, html: groupRow(v, C) });
        var nx = D.rows[i + 1];
        if (v.rcd && !(nx && nx.t === 'g' && nx.rcd === v.rcd)) want.push({ key: 'e-' + v.rcd, html: endRow(D.byId[v.rcd], C) });
      }
    });
    if (!D.rows.length) want.push({ key: 'empty', html: '<tr class="r-empty" data-key="empty"><td colspan="' + C.length + '">Групп пока нет. Добавьте кнопкой «Группа» или соберите щит по шаблону.</td></tr>' });

    /* FLIP: запомнить положение строк */
    var first = null;
    if (opts.flip && !reduceMotion()) {
      first = {};
      tbody.querySelectorAll('tr[data-key]').forEach(function (tr) { first[tr.getAttribute('data-key')] = tr.getBoundingClientRect().top; });
    }
    var act = document.activeElement, actId = act && act.id && tbody.contains(act) ? act.id : null;
    var selStart = null, selEnd = null;
    if (actId && act.tagName === 'INPUT') { try { selStart = act.selectionStart; selEnd = act.selectionEnd; } catch (e) { /* */ } }
    var keep = new Map();
    want.forEach(function (w) {
      var c = rowCache.get(w.key), el;
      if (c && c.html === w.html) el = c.el;
      else {
        var tmp = document.createElement('tbody'); tmp.innerHTML = w.html; el = tmp.firstChild;
      }
      keep.set(w.key, { html: w.html, el: el });
    });
    var i = 0;
    keep.forEach(function (c) {
      var at = tbody.children[i];
      if (at !== c.el) tbody.insertBefore(c.el, at || null);
      i++;
    });
    while (tbody.children.length > keep.size) tbody.removeChild(tbody.lastChild);
    rowCache = keep;
    if (actId && document.activeElement !== $(actId)) {
      var ne = $(actId);
      if (ne) { ne.focus({ preventScroll: true }); if (selStart != null) { try { ne.setSelectionRange(selStart, selEnd); } catch (e) { /* */ } } }
    }
    applySel();
    /* смена номеров — подсветить */
    var nums = {};
    D.rows.forEach(function (v) { if (v.t === 'g') { nums[v.id] = v.num; if (prevNum[v.id] && prevNum[v.id] !== v.num) { var tr = rowEl(v.id); var ch = tr && tr.querySelector('.chip'); if (ch) { ch.classList.remove('changed'); void ch.offsetWidth; ch.classList.add('changed'); } } } });
    prevNum = nums;
    if (first) {
      tbody.querySelectorAll('tr[data-key]').forEach(function (tr) {
        var k = tr.getAttribute('data-key'); if (first[k] == null) return;
        var dy = first[k] - tr.getBoundingClientRect().top;
        if (Math.abs(dy) < 1) return;
        tr.style.transition = 'none'; tr.style.transform = 'translateY(' + dy + 'px)';
        requestAnimationFrame(function () { requestAnimationFrame(function () { tr.style.transition = 'transform .22s cubic-bezier(.2,.7,.2,1)'; tr.style.transform = ''; }); });
        tr.addEventListener('transitionend', function te() { tr.style.transition = ''; tr.removeEventListener('transitionend', te); });
      });
    }
  }
  function reduceMotion() { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } }
  function rowEl(key) { var c = rowCache.get(key); return c ? c.el : null; }
  function applySel() {
    rowCache.forEach(function (c, k) { if (c.el.getAttribute('data-kind') === 'g' || c.el.getAttribute('data-kind') === 'u') c.el.classList.toggle('sel', sel.has(k)); });
  }
  function landRows(ids) {
    setTimeout(function () {
      ids.forEach(function (id) { var el = rowEl(id); if (!el) return; el.classList.remove('landed'); void el.offsetWidth; el.classList.add('landed'); });
    }, 30);
  }
  function scrollRowIntoView(id) {
    var el = rowEl(id); if (!el) return;
    var wr = wrap.getBoundingClientRect(), r = el.getBoundingClientRect();
    var head = 30;
    if (r.top < wr.top + head) wrap.scrollTop -= (wr.top + head - r.top) + 20;
    else if (r.bottom > wr.bottom) wrap.scrollTop += (r.bottom - wr.bottom) + 20;
    var top = wrap.getBoundingClientRect().top;
    if (top < 0 || top > window.innerHeight - 100) wrap.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
  function focusCell(id, f, selectAll) {
    scrollRowIntoView(id);
    var el = $('c-' + id + '-' + f);
    if (el) { el.focus({ preventScroll: true }); if (selectAll && el.select) el.select(); }
  }
  function jumpTo(id) {
    sel.clear(); sel.add(id); selAnchor = id; applySel(); renderBar();
    scrollRowIntoView(id); landRows([id]);
  }

  /* ---------------------------------------------------------------- правки в ячейках */
  tbody.addEventListener('change', function (e) {
    var el = e.target, f = el.getAttribute('data-f'); if (!f) return;
    var tr = el.closest('tr[data-id]'); if (!tr) return;
    var id = tr.getAttribute('data-id');
    var v = el.type === 'checkbox' ? el.checked : el.value;
    var before = D.byId[id];
    var structural = f === 'prot' || f === 'poles' || f === 'cat';
    commit(function (st) { return M.setField(st, id, f, v); }, { flip: structural });
    var after = D.byId[id];
    if (!after || !before) return;
    if (f === 'prot') {
      if (after.rcd && after.rcd !== before.rcd) toast(after.num + ' теперь под УЗО ' + D.byId[after.rcd].ref, true);
      else if (!after.rcd && before.rcd) toast(after.num + ' вынесена из-под УЗО — ' + (after.prot === 'dif' ? 'дифавтомат' : 'автомат'), true);
      landRows([id]);
    }
    if (f === 'cat' && before.num !== after.num) toast('Новое назначение: ' + before.num + ' → ' + after.num + '. Остальные номера пересчитаны', true);
    if (f === 'poles') landRows([id]);
  });
  tbody.addEventListener('keydown', function (e) {
    var el = e.target;
    if (el.tagName !== 'INPUT' || el.type === 'checkbox') return;
    if (e.key === 'Enter' || (e.key === 'ArrowDown' && e.altKey === false && e.ctrlKey) || (e.key === 'ArrowUp' && e.ctrlKey)) {
      e.preventDefault();
      var tr = el.closest('tr[data-id]'), id = tr.getAttribute('data-id'), f = el.getAttribute('data-f');
      var dir = (e.key === 'ArrowUp' || (e.key === 'Enter' && e.shiftKey)) ? -1 : 1;
      var gs = D.rows.filter(function (v) { return v.t === 'g'; }), k = -1;
      gs.forEach(function (v, i) { if (v.id === id) k = i; });
      el.blur();
      var nx = gs[k + dir];
      if (nx) focusCell(nx.id, f, true);
    } else if (e.key === 'Escape') {
      el.value = el.defaultValue; el.blur();
    }
  });
  tbody.addEventListener('focusin', function (e) {
    var el = e.target; if (el.tagName === 'INPUT' && el.type !== 'checkbox' && el.select) setTimeout(function () { if (document.activeElement === el) { try { el.select(); } catch (er) { /* */ } } }, 0);
  });
  tbody.addEventListener('click', function (e) {
    var bt = e.target.closest('[data-act]');
    var tr = e.target.closest('tr[data-key]');
    if (bt) {
      var act = bt.getAttribute('data-act');
      var id = tr && tr.getAttribute('data-id');
      if (act === 'fx') { uiS.fx = !uiS.fx; lsSet(LS_UI, uiS); renderTable({}); return; }
      if (act === 'dup') { var r = commit(function (st) { return M.duplicate(st, [id]); }, { flip: true }); if (r && r.ids) { sel.clear(); sel.add(r.ids[0]); applySel(); renderBar(); landRows(r.ids); focusCell(r.ids[0], 'name', true); } return; }
      if (act === 'del') {
        var v = D.byId[id], name = v.t === 'u' ? 'УЗО ' + v.ref : v.num + ' ' + v.name;
        commit(function (st) { return M.removeRows(st, [id]); }, { flip: true });
        toast('Удалено: ' + name + (v.t === 'u' ? '. Группы остались дифавтоматами' : '. Номера пересчитаны'), true);
        return;
      }
      if (act === 'unlock') { commit(function (st) { return M.setField(st, id, 'lock', false); }); return; }
      if (act === 'add-in') {
        var u = D.byId[id], last = u.members.length ? u.members[u.members.length - 1] : u.id;
        var r2 = commit(function (st) { return M.addGroup(st, 'sock', last); });
        if (r2 && r2.id) { sel.clear(); sel.add(r2.id); applySel(); renderBar(); landRows([r2.id]); focusCell(r2.id, 'name', true); }
        return;
      }
      if (act === 'warn') { sel.clear(); sel.add(id); applySel(); renderBar(); showTip(bt, true); return; }
      return;
    }
    if (!tr) return;
    var kind = tr.getAttribute('data-kind');
    if (kind !== 'g' && kind !== 'u') return;
    var hit = e.target.closest('.handle, td.c-ref, td.c-num');
    if (hit && e.detail > 0) return; /* мышью — уже обработано при нажатии */
    if (!hit && e.target.closest('input,select,button,label')) return;
    clickSelect(tr.getAttribute('data-id'), e);
  });
  function clickSelect(id, e) {
    if (e.shiftKey && selAnchor) {
      var order = D.rows.map(function (v) { return v.id; });
      var a = order.indexOf(selAnchor), b = order.indexOf(id);
      if (a < 0) a = b;
      if (!(e.ctrlKey || e.metaKey)) sel.clear();
      for (var i = Math.min(a, b); i <= Math.max(a, b); i++) sel.add(order[i]);
    } else if (e.ctrlKey || e.metaKey) {
      if (sel.has(id)) sel.delete(id); else sel.add(id);
      selAnchor = id;
    } else {
      if (sel.size === 1 && sel.has(id)) sel.clear(); else { sel.clear(); sel.add(id); }
      selAnchor = id;
    }
    applySel(); renderBar();
  }

  /* ================================================================ перетаскивание */
  var drag = null, ghost = null, raf = 0;
  tbody.addEventListener('pointerdown', function (e) {
    var h = e.target.closest('.handle, td.c-ref, td.c-num'); if (!h) return;
    var tr = h.closest('tr[data-id]'); if (!tr) return;
    var id = tr.getAttribute('data-id'), kind = tr.getAttribute('data-kind');
    if (kind !== 'g' && kind !== 'u') return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    var ctrl = e.ctrlKey || e.metaKey, was = sel.has(id), size = sel.size;
    if (e.shiftKey && selAnchor) clickSelect(id, e);
    else if (kind === 'g') {
      if (ctrl) { if (!was) sel.add(id); }
      else if (!was) { sel.clear(); sel.add(id); }
      selAnchor = id;
      applySel(); renderBar();
    }
    drag = { id: id, kind: kind, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, started: false, h: h, pid: e.pointerId, was: was, size: size, ctrl: ctrl, shift: e.shiftKey };
    try { h.setPointerCapture(e.pointerId); } catch (er) { /* */ }
    h.addEventListener('pointermove', onMove);
    h.addEventListener('pointerup', onUp);
    h.addEventListener('pointercancel', onCancel);
    h.addEventListener('lostpointercapture', onLost);
  });
  function dragIds() {
    if (drag.kind === 'u') return [drag.id];
    return selGroups();
  }
  function beginDrag() {
    drag.started = true;
    drag.ids = dragIds();
    document.documentElement.classList.add('dragging-on');
    hideTip();
    var dim = {};
    if (drag.kind === 'u') { dim[drag.id] = 1; dim['e-' + drag.id] = 1; D.byId[drag.id].members.forEach(function (m) { dim[m] = 1; }); }
    else drag.ids.forEach(function (i) { dim[i] = 1; });
    drag.dim = dim;
    rowCache.forEach(function (c, k) { if (dim[k]) c.el.classList.add('ghosted'); });
    /* бывшая «хвостовая» строка блока, из которого уходят все группы, остаётся видимой */
    ghost = document.createElement('div'); ghost.className = 'drag-ghost';
    if (drag.kind === 'u') {
      var u = D.byId[drag.id];
      ghost.innerHTML = '<span class="chip s-u">УЗО</span><span>' + esc(u.ref) + ' · ' + esc(u.model) + '</span><span class="more">+ ' + u.members.length + ' гр.</span>';
    } else {
      var v = D.byId[drag.ids[0]];
      ghost.innerHTML = '<span class="chip ' + serCls(v.ser) + '">' + esc(v.num) + '</span><span>' + esc(v.name) + '</span>' + (drag.ids.length > 1 ? '<span class="more">и ещё ' + (drag.ids.length - 1) + '</span>' : '');
    }
    document.body.appendChild(ghost);
    computeSlots();
    loop();
  }
  function computeSlots() {
    var full = M.slots(state);
    var dim = drag.dim, U = drag.kind === 'u' ? drag.id : null;
    var vis = full.filter(function (it) {
      if (U) { if ((it.kind === 'u' || it.kind === 'end') && it.id === U) return false; if (it.kind === 'g' && it.rcd === U) return false; return true; }
      return !(it.kind === 'g' && dim[it.id]);
    });
    var wr = wrap.getBoundingClientRect(), st = wrap.scrollTop;
    function elOf(it) { return rowEl(it.kind === 'end' ? 'e-' + it.id : it.id); }
    var any3 = !U && drag.ids.some(function (id) { return D.byId[id].poles === 3; });
    var slots = [];
    var catCell = thead.querySelector('.c-cat');
    var insideX = catCell ? catCell.offsetLeft : 160;
    for (var k = 0; k <= vis.length; k++) {
      var y;
      if (k < vis.length) { var el = elOf(vis[k]); if (!el) continue; y = el.getBoundingClientRect().top; }
      else { var le = vis.length ? elOf(vis[vis.length - 1]) : rowEl('sec-g'); if (!le) continue; y = le.getBoundingClientRect().bottom; }
      var a = M.gapAnchor(vis, k), ok = true;
      if (a.into) {
        if (U) ok = false;
        else if (any3 && D.byId[a.into].poles === 2) ok = false;
      }
      slots.push({ y: y - wr.top + st, a: a, ok: ok, into: a.into });
    }
    drag.slots = slots; drag.insideX = insideX;
  }
  function onMove(e) {
    if (!drag) return;
    drag.x = e.clientX; drag.y = e.clientY;
    if (!drag.started) {
      if (Math.abs(e.clientX - drag.x0) + Math.abs(e.clientY - drag.y0) < 5) return;
      beginDrag();
    }
    place();
  }
  function place() {
    ghost.style.left = Math.min(drag.x + 16, window.innerWidth - 200) + 'px';
    ghost.style.top = (drag.y + 12) + 'px';
    var wr = wrap.getBoundingClientRect();
    var yc = drag.y - wr.top + wrap.scrollTop;
    var best = null;
    drag.slots.forEach(function (s) { if (!s.ok) return; var d = Math.abs(s.y - yc); if (!best || d < best.d - 0.5) best = { s: s, d: d }; });
    drag.target = best ? best.s : null;
    if (!drag.target) { dropLine.hidden = true; return; }
    var s = drag.target;
    dropLine.hidden = false;
    dropLine.style.top = (s.y - 1) + 'px';
    var left = s.into ? drag.insideX : 0;
    dropLine.style.left = left + 'px';
    dropLine.style.width = Math.max(120, $('grid').offsetWidth - left) + 'px';
    dropLine.className = 'drop-line' + (s.into ? ' inside' : '');
    dropLine.innerHTML = s.into ? '<span class="dl-tag" style="left:12px">под УЗО ' + esc(D.byId[s.into].ref) + '</span>' : '';
  }
  function loop() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(function step() {
      if (!drag || !drag.started) return;
      var wr = wrap.getBoundingClientRect(), y = drag.y, sp = 0;
      var top = Math.max(wr.top, 0) + 36, bot = Math.min(wr.bottom, window.innerHeight) - 30;
      if (y < top) sp = -Math.min(18, (top - y) / 2 + 2);
      else if (y > bot) sp = Math.min(18, (y - bot) / 2 + 2);
      if (sp) {
        var before = wrap.scrollTop; wrap.scrollTop += sp;
        if (wrap.scrollTop === before) window.scrollBy(0, sp);
        place();
      }
      raf = requestAnimationFrame(step);
    });
  }
  function endDrag() {
    cancelAnimationFrame(raf);
    if (drag && drag.h) {
      drag.h.removeEventListener('pointermove', onMove); drag.h.removeEventListener('pointerup', onUp);
      drag.h.removeEventListener('pointercancel', onCancel); drag.h.removeEventListener('lostpointercapture', onLost);
      try { drag.h.releasePointerCapture(drag.pid); } catch (e) { /* */ }
    }
    document.documentElement.classList.remove('dragging-on');
    rowCache.forEach(function (c) { c.el.classList.remove('ghosted'); });
    dropLine.hidden = true;
    if (ghost) { ghost.remove(); ghost = null; }
  }
  function onUp(e) {
    if (!drag) return;
    var d = drag;
    if (!d.started) {
      endDrag(); drag = null;
      if (d.shift) return;
      if (d.kind === 'u') { clickSelect(d.id, { ctrlKey: d.ctrl, metaKey: false, shiftKey: false }); return; }
      if (d.ctrl) { if (d.was) sel.delete(d.id); }
      else if (d.was) { if (d.size === 1) sel.clear(); else { sel.clear(); sel.add(d.id); } }
      applySel(); renderBar();
      return;
    }
    var t = d.target, ids = d.ids;
    endDrag(); drag = null;
    if (!t) return;
    var before = {}; ids.forEach(function (id) { var v = D.byId[id]; before[id] = { rcd: v.rcd, num: v.num, prot: v.prot }; });
    var changed = false, oldJson = JSON.stringify(state.rows);
    commit(function (st) { return M.moveRows(st, ids, t.a); }, { flip: true });
    changed = JSON.stringify(state.rows) !== oldJson;
    if (!changed) return;
    landRows(d.kind === 'u' ? [d.id].concat(D.byId[d.id].members) : ids);
    if (d.kind === 'g') {
      var a0 = D.byId[ids[0]], b0 = before[ids[0]];
      var what = ids.length > 1 ? ids.length + ' ' + plural(ids.length, 'группа', 'группы', 'групп') : a0.num;
      if (a0.rcd && a0.rcd !== b0.rcd) toast(what + ' — под УЗО ' + D.byId[a0.rcd].ref + '. Номера пересчитаны', true);
      else if (!a0.rcd && b0.rcd) toast(what + ' — вынесены из-под УЗО, ' + (a0.prot === 'dif' ? 'дифавтомат' : 'автомат') + '. Номера пересчитаны', true);
      else toast((b0.num !== a0.num ? b0.num + ' → ' + a0.num : 'Порядок изменён') + '. Номера пересчитаны', true);
    } else toast('УЗО ' + D.byId[d.id].ref + ' перенесено вместе с группами', true);
  }
  function onCancel() { endDrag(); drag = null; }
  function onLost() { if (drag && drag.started) { /* отпускание вне окна */ } }

  /* ================================================================ подсказки */
  var tipFor = null;
  function showTip(el, force) {
    var t = el.getAttribute('data-tip'); if (!t) return;
    if (drag && drag.started) return;
    tipEl.textContent = t; tipEl.hidden = false; tipFor = el;
    tipEl.style.whiteSpace = 'pre-line';
    var r = el.getBoundingClientRect(), w = tipEl.offsetWidth, h = tipEl.offsetHeight;
    var x = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2));
    var y = r.bottom + 6; if (y + h > window.innerHeight - 8) y = r.top - h - 6;
    tipEl.style.left = x + 'px'; tipEl.style.top = y + 'px';
    if (force) { clearTimeout(showTip.t); showTip.t = setTimeout(hideTip, 4000); }
  }
  function hideTip() { tipEl.hidden = true; tipFor = null; }
  var tipTimer = 0;
  document.addEventListener('pointerover', function (e) {
    var el = e.target.closest && e.target.closest('[data-tip]');
    if (el === tipFor) return;
    clearTimeout(tipTimer);
    if (!el) { hideTip(); return; }
    tipTimer = setTimeout(function () { showTip(el); }, el.classList.contains('wbadge') ? 0 : 450);
  });
  document.addEventListener('pointerdown', function () { clearTimeout(tipTimer); });
  window.addEventListener('scroll', hideTip, true);

  /* ================================================================ сообщения */
  var toastT = 0;
  function toast(msg, withUndo) {
    var t = $('toast');
    $('toastTxt').textContent = msg;
    $('toastBtn').hidden = !withUndo;
    t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(function () { t.hidden = true; }, withUndo ? 6000 : 3200);
  }
  $('toastBtn').addEventListener('click', function () { $('toast').hidden = true; doUndo(); });

  /* ================================================================ клавиатура */
  document.addEventListener('keydown', function (e) {
    var tag = e.target.tagName, inField = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';
    var mod = e.ctrlKey || e.metaKey;
    if (e.key === 'Escape') {
      if (drag && drag.started) { onCancel(); return; }
      closeMenus(); hideTip();
      if (!inField && sel.size) { sel.clear(); applySel(); renderBar(); }
      return;
    }
    if (mod && !inField && (e.key === 'z' || e.key === 'Z' || e.key === 'я' || e.key === 'Я')) { e.preventDefault(); if (e.shiftKey) doRedo(); else doUndo(); return; }
    if (mod && !inField && (e.key === 'y' || e.key === 'Y' || e.key === 'н' || e.key === 'Н')) { e.preventDefault(); doRedo(); return; }
    if (inField) return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && sel.size) { e.preventDefault(); delSelected(); return; }
    if (mod && (e.key === 'd' || e.key === 'D' || e.key === 'в' || e.key === 'В') && sel.size) { e.preventDefault(); dupSelected(); return; }
    if (mod && (e.key === 'a' || e.key === 'A' || e.key === 'ф' || e.key === 'Ф')) { e.preventDefault(); sel.clear(); D.rows.forEach(function (v) { if (v.t === 'g') sel.add(v.id); }); applySel(); renderBar(); return; }
    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && sel.size) { e.preventDefault(); nudgeSel(e.key === 'ArrowUp' ? -1 : 1); return; }
  });

  /* ================================================================ связь с AutoCAD (панель WebView2 в плагине GIP.bundle)
     страница -> AutoCAD: строка «тип\nJSON» (ready, apply); AutoCAD -> страница: объект {type: load|unlinked|linked, state, doc, origin} */
  var bridgeT = 0;
  var hostS = { linked: false, doc: '', auto: uiS.auto !== false, dirty: false, waiting: !!host };
  function hostPost(type, payload) { if (!host) return; try { host.postMessage(type + '\n' + (payload || '')); } catch (e) { /* */ } }
  function pushNow() { clearTimeout(bridgeT); hostPost('apply', JSON.stringify(state)); hostS.dirty = false; syncHost(); }
  function bridgeSend() {
    if (!host || !hostS.linked) return;
    if (hostS.auto) { clearTimeout(bridgeT); bridgeT = setTimeout(pushNow, 150); }
    else { hostS.dirty = true; syncHost(); }
  }
  function syncHost() {
    if (!host) return;
    var L = $('link');
    L.classList.toggle('on', hostS.linked);
    L.title = hostS.linked ? 'Таблица связана с чертежом ' + hostS.doc : 'В этом чертеже щита ещё нет';
    $('linkTxt').textContent = hostS.waiting ? 'Чтение чертежа…' : (hostS.linked ? 'Чертёж: ' : 'Нет щита: ') + (hostS.doc || 'без имени');
    $('autoWrap').hidden = !hostS.linked;
    $('autoChk').checked = hostS.auto;
    $('pushBtn').hidden = !hostS.linked || (hostS.auto && !hostS.dirty);
    $('pushBtn').classList.toggle('primary', hostS.dirty);
    $('hostBar').hidden = hostS.linked || hostS.waiting;
    $('hostBarTxt').textContent = 'В чертеже «' + (hostS.doc || 'без имени') + '» щита ещё нет. Таблица ниже — последняя, с которой вы работали; соберите нужную и постройте альбом. Нужен чертёж из шаблона ГИП.';
  }
  if (host) {
    host.addEventListener('message', function (ev) {
      var m = ev.data;
      if (typeof m === 'string') { try { m = JSON.parse(m); } catch (e) { return; } }
      if (!m || !m.type) return;
      if (m.type === 'load' && m.state && Array.isArray(m.state.rows)) {
        var ns;
        try { ns = M.normalize(m.state); } catch (e) { toast('Не удалось прочитать щит из чертежа'); return; }
        if (m.origin === 'activate') { undoS = []; redoS = []; sel.clear(); }
        else if (JSON.stringify(ns) !== JSON.stringify(state)) { undoS.push(JSON.stringify(state)); redoS = []; }
        var wasLinked = hostS.linked;
        state = ns; hostS.linked = true; hostS.waiting = false; hostS.doc = m.doc || ''; hostS.dirty = false;
        render({ flip: m.origin === 'drawing' }); syncHost();
        if (m.origin === 'drawing' && wasLinked) toast('Таблица обновлена по чертежу', true);
      } else if (m.type === 'linked') {
        hostS.linked = true; hostS.waiting = false; if (m.doc) hostS.doc = m.doc; syncHost(); toast('Альбом построен, таблица связана с чертежом');
      } else if (m.type === 'unlinked') {
        hostS.linked = false; hostS.waiting = false; hostS.doc = m.doc || ''; hostS.dirty = false; syncHost();
      }
    });
    $('autoChk').addEventListener('change', function (e) {
      hostS.auto = e.target.checked; uiS.auto = hostS.auto; lsSet(LS_UI, uiS);
      if (hostS.auto && hostS.dirty) pushNow(); else syncHost();
    });
    $('pushBtn').addEventListener('click', pushNow);
    $('buildHere').addEventListener('click', function () { pushNow(); toast('Строю альбом в чертеже…'); });
  }

  /* ================================================================ старт */
  $('undo').innerHTML = I.undo; $('redo').innerHTML = I.redo;
  $('undo').addEventListener('click', doUndo); $('redo').addEventListener('click', doRedo);
  $('tplBtn').addEventListener('click', function () { toggleTpl(); });
  state = initState();
  buildBoard(); buildBar(); resetTplForm(); buildTpl();
  render({});
  if (host) { syncHost(); hostPost('ready', ''); }
  window.GIP = {
    get state() { return state; }, get derived() { return D; }, commit: commit, M: M,
    select: function (ids) { sel.clear(); ids.forEach(function (i) { sel.add(i); }); applySel(); renderBar(); }
  };
})();
