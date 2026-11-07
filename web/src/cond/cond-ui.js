/* ГИП · Кондиционирование — панель AutoCAD (GIPCOND): точки блоков из чертежа, подбор, команды построения */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var host = window.chrome && window.chrome.webview;
  var escH = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var dec = function (s) { return String(s || '').replace(/\\U\+([0-9A-Fa-f]{4})/g, function (m, h) { return String.fromCharCode(parseInt(h, 16)); }); };
  var MEM = 'gip-cond-v1';
  var S = { reg: { rooms: [], units: [], sheets: {}, len: null }, st: { v: 1, params: {}, units: {} }, res: null };
  try { var m = JSON.parse(localStorage.getItem(MEM) || 'null'); if (m && m.params) S.st.params = m.params; } catch (e) { /* без памяти */ }
  var toastT = null;
  function toast(msg, ms) { var t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(function () { t.hidden = true; }, ms || 5000); }
  function save() { try { localStorage.setItem(MEM, JSON.stringify({ params: S.st.params })); } catch (e) { /* без памяти */ } }

  var PKEYS = ['brand', 'type', 'q'];
  function fillSelects() { $('p_brand').innerHTML = COND.DB.brands.map(function (b) { return '<option value="' + b.id + '">' + escH(b.name) + '</option>'; }).join(''); }
  function showParams() { var p = COND.params(S.st); PKEYS.forEach(function (k) { $('p_' + k).value = p[k]; }); }
  function readParams() {
    PKEYS.forEach(function (k) { var v = $('p_' + k).value, n = parseFloat(String(v).replace(',', '.')); S.st.params[k] = k === 'q' ? (isFinite(n) ? n : 100) : v; });
    save();
  }
  function su(id) { return (S.st.units[id] = S.st.units[id] || {}); }

  function render() {
    S.res = COND.compute(S.reg, S.st);
    var r = S.res, sh = S.reg.sheets || {};
    $('modeInfo').textContent = { split: 'Сплит-системы: у каждого внутреннего блока свой наружный.', multi: 'Мульти-сплит: несколько внутренних блоков на один наружный, отдельная пара труб к каждому.',
      vrf: 'VRF: дерево фреонопроводов с рефнетами, диаметры по мощности ниже по потоку. Наружный блок или точка подключения к магистрали.' }[r.mode];
    $('sheetInfo').textContent = sh.plan ? ('Альбом ВиК: план ✓, схема ' + (sh.scheme ? '✓' : '—') + ', спецификация ' + (sh.spec || 0) + ' л.')
      : 'Нет листа «План квартиры с сетями Х1, Х2, Д1» — откройте шаблон ГИП.';
    var cnt = { I: 0, O: 0, R: 0, K: 0 }; (S.reg.units || []).forEach(function (u) { cnt[u.kind] = (cnt[u.kind] || 0) + 1; });
    $('ptInfo').textContent = 'Указано: внутренних ' + cnt.I + ', наружных ' + cnt.O + (cnt.R ? ', подключений VRF ' + cnt.R : '') + ', выпусков К1 ' + cnt.K + '.';
    var models = COND.indoorModels(r.brand.id, r.p.type); if (!models.length) models = COND.indoorModels(r.brand.id);
    var outIds = r.O.map(function (o) { return o.id; });
    $('ins').tBodies[0].innerHTML = r.I.map(function (x) {
      var mo = models.map(function (m) { return '<option value="' + m.model + '"' + (x.m && m.model === x.m.model ? ' selected' : '') + '>' + m.model + (m.src === 'approx' ? ' ≈' : '') + '</option>'; }).join('');
      var lo = outIds.map(function (id) { return '<option value="' + id + '"' + (id === x.link ? ' selected' : '') + '>№ ' + id + '</option>'; }).join('');
      var bad = x.load != null && x.m && x.m.q < x.load;
      return '<tr data-id="' + x.id + '"' + (bad ? ' class="warn"' : '') + '><td>' + x.id + '</td><td class="ttl" title="' + escH(x.roomName) + '">' + escH(x.roomName || (x.room ? 'пом. ' + x.room : '—')) +
        '</td><td class="n">' + (x.area ? (+x.area).toFixed(1) : '') + '</td><td><input class="w-xs" data-k="load" value="' + escH(x.load == null ? '' : x.load) + '"></td><td><select data-k="model">' + mo + '</select></td><td class="n">' + (x.m ? x.m.q : '') +
        '</td><td><select data-k="link">' + lo + '</select></td><td><input type="checkbox" data-k="pump"' + (x.pump ? ' checked' : '') + '></td></tr>';
    }).join('') || '<tr><td colspan="8" class="pl-hint">Нет внутренних блоков: «Внутренние блоки» → щёлкнуть у стен на плане.</td></tr>';
    var omods = COND.outdoorModels(r.brand.id);
    $('outs').tBodies[0].innerHTML = r.O.map(function (o) {
      var mo = o.kind === 'R' ? '<span class="pl-hint">магистраль</span>' : '<select data-k="model">' + omods.map(function (m) { return '<option value="' + m.model + '"' + (o.m && m.model === o.m.model ? ' selected' : '') + '>' + m.model + (m.src === 'approx' ? ' ≈' : '') + '</option>'; }).join('') + '</select>';
      return '<tr data-id="' + o.id + '"><td>' + o.id + '</td><td>' + (o.kind === 'R' ? 'VRF' : 'наружный') + '</td><td>' + mo + '</td><td class="n">' + (o.m ? o.m.q : '') + '</td><td class="n">' + o.sum + '</td><td>' + o.linked.join(', ') + '</td></tr>';
    }).join('') || '<tr><td colspan="6" class="pl-hint">Нет наружных блоков.</td></tr>';
    var pos = 0;
    $('spec').tBodies[0].innerHTML = r.spec.map(function (x) {
      if (x.sec != null) return x.sec ? '<tr class="sec"><td>' + (++pos) + '</td><td colspan="5">' + escH(x.sec) + '</td></tr>' : '';
      if (x.key && /^(CU|INS):/.test(x.key) && S.reg.len && S.reg.len.cu && S.reg.len.cu[x.key.split(':')[1]] == null) return '';
      var q = x.key ? (x.key === 'REF' ? (S.reg.len ? S.reg.len.ref : '…') : (x.key.indexOf('CU:') === 0 || x.key.indexOf('INS:') === 0) && S.reg.len && S.reg.len.cu ? (S.reg.len.cu[x.key.split(':')[1]] != null ? Math.ceil(S.reg.len.cu[x.key.split(':')[1]] * x.k / 5) * 5 : '—') : 'по трассе') : x.qty;
      return '<tr><td></td><td>' + escH(x.name.replace(/%%C/g, 'Ø')) + '</td><td>' + escH(String(x.type).replace(/%%C/g, 'Ø')) + '</td><td>' + escH(x.maker) + '</td><td>' + escH(x.unit) + '</td><td class="n">' + q + '</td></tr>';
    }).join('');
    $('warns').innerHTML = r.warn.map(function (w) { return '<div>⚠ ' + escH(w) + '</div>'; }).join('');
  }
  $('ins').addEventListener('change', function (ev) {
    var el = ev.target, tr = el.closest('tr'); if (!tr || !el.dataset.k) return;
    var u = su(+tr.dataset.id), k = el.dataset.k;
    u[k] = k === 'pump' ? el.checked : (k === 'link' ? +el.value : el.value);
    if (k === 'load') delete u.model;
    render();
  });
  $('outs').addEventListener('change', function (ev) {
    var el = ev.target, tr = el.closest('tr'); if (!tr || !el.dataset.k) return;
    su(+tr.dataset.id)[el.dataset.k] = el.value; render();
  });
  PKEYS.forEach(function (k) { $('p_' + k).addEventListener('change', function () { readParams(); if (k !== 'q') Object.keys(S.st.units).forEach(function (id) { delete S.st.units[id].model; delete S.st.units[id].link; }); render(); }); });

  function cmd(c) { if (!host) { toast('Связь с AutoCAD недоступна: откройте панель командой GIPCOND или GIPPROEKT.', 6000); return; } host.postMessage('cmd\n' + c); toast('Выполняется в AutoCAD: ' + c, 3000); }
  $('readBtn').onclick = function () { cmd('GIPCONDREAD'); };
  $('inBtn').onclick = function () { cmd('GIPCONDIN'); };
  $('outBtn').onclick = function () { cmd('GIPCONDOUT'); };
  $('riserBtn').onclick = function () { cmd('GIPCONDRISER'); };
  $('k1Btn').onclick = function () { cmd('GIPCONDK1'); };
  $('delBtn').onclick = function () { cmd('GIPCONDDEL'); };
  $('wallsBtn').onclick = function () { cmd('GIPWALLS'); };
  $('clearBtn').onclick = function () { if (window.confirm('Удалить все точки блоков и выпусков?')) cmd('GIPCONDCLEAR'); };
  $('buildBtn').onclick = function () {
    readParams(); render();
    if (!S.res.I.length) { toast('Сначала укажите внутренние блоки.', 6000); return; }
    if (!S.res.O.length) { toast('Укажите наружный блок (или подключение к магистрали VRF).', 6000); return; }
    if (!host) { toast('Связь с AutoCAD недоступна.', 5000); return; }
    S.st.specclear = $('p_specclear').checked;
    host.postMessage('build\n' + COND.inFile(S.res, S.st));
    toast('Строю кондиционирование в AutoCAD…', 4000);
  };
  if (host) {
    host.addEventListener('message', function (ev) {
      var d = ev.data; if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { return; } }
      if (!d) return;
      if (d.type === 'cond-result') toast((d.ok ? 'Готово: ' : 'Ошибка: ') + dec(d.msg), 9000);
      if (d.type === 'cond-registry') {
        S.reg = d;
        if (d.state) { try { var st = JSON.parse(d.state); if (st && st.v) { S.st = st; S.st.params = S.st.params || {}; S.st.units = S.st.units || {}; showParams(); $('p_specclear').checked = st.specclear !== false; } } catch (e) { /* старое состояние */ } }
        render();
      }
    });
    host.postMessage('ready\n');
  }
  fillSelects(); showParams(); render();
  window.GIPCONDUI = { S: S, render: render };
})();
