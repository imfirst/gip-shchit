/* ГИП · Отопление — панель AutoCAD (GIPHEAT): реестр из чертежа, расчёт и подбор, команды построения */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var host = window.chrome && window.chrome.webview;
  var escH = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var dec = function (s) { return String(s || '').replace(/\\U\+([0-9A-Fa-f]{4})/g, function (m, h) { return String.fromCharCode(parseInt(h, 16)); }); };
  var MEM = 'gip-heat-v1';
  var S = { reg: { rooms: [], windows: [], sheets: {}, shrv: 0, len: null, rads: [] }, st: { v: 1, params: {}, rooms: {}, rads: {} }, res: null };
  try { var m = JSON.parse(localStorage.getItem(MEM) || 'null'); if (m && m.params) S.st.params = m.params; } catch (e) { /* без памяти */ }

  var toastT = null;
  function toast(msg, ms) { var t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(function () { t.hidden = true; }, ms || 5000); }
  function save() { try { localStorage.setItem(MEM, JSON.stringify({ params: S.st.params })); } catch (e) { /* без памяти */ } }

  // ---- параметры
  var PKEYS = ['tsup', 'tret', 'tin', 'q', 'reserve', 'corner', 'series', 'maxH', 'cols', 'lenMax', 'conn', 'conv', 'pipe', 'collector'];
  function fillSelects() {
    $('p_series').innerHTML = HEAT_DB.series.map(function (s) { return '<option value="' + s.id + '">' + escH(s.name) + '</option>'; }).join('');
    $('p_conn').innerHTML = HEAT_DB.conns.map(function (c) { return '<option value="' + c[0] + '">' + escH(c[1]) + '</option>'; }).join('');
    var vm = HEAT_DB.series.filter(function (s) { return s.id === 'varmann_ntherm'; })[0];
    $('p_conv').innerHTML = vm.models.map(function (m) { return '<option value="' + m.code + '">Ntherm ' + m.W + '×' + m.H + '</option>'; }).join('');
    $('p_pipe').innerHTML = HEAT_DB.pipes.map(function (p) { return '<option value="' + p.id + '">' + escH(p.name) + '</option>'; }).join('');
    $('p_collector').innerHTML = HEAT_DB.collectors.map(function (c) { return '<option value="' + c.id + '">' + escH(c.name) + '</option>'; }).join('');
  }
  function showParams() {
    var p = HEAT.params(S.st);
    PKEYS.forEach(function (k) { var el = $('p_' + k); if (el) el.value = p[k]; });
  }
  function readParams() {
    PKEYS.forEach(function (k) {
      var el = $('p_' + k); if (!el) return;
      var v = el.value, n = parseFloat(String(v).replace(',', '.'));
      S.st.params[k] = (el.tagName === 'SELECT' && isNaN(+v)) ? v : (isFinite(n) ? n : v);
    });
    save();
  }

  // ---- таблицы
  function render() {
    S.res = HEAT.compute(S.reg, S.st);
    var r = S.res;
    // листы
    var sh = S.reg.sheets || {};
    $('sheetInfo').textContent = sh.plan ? ('Альбом О: план ' + (sh.plan ? '✓' : '—') + ', схема ' + (sh.scheme ? '✓' : '—') + ', спецификация ' + (sh.spec || 0) + ' л., общие данные ' + (sh.od ? '✓' : '—') + '. Окон найдено: ' + (S.reg.windows || []).length + '.')
      : 'Нет листа «План … с сетями Т1, Т2» — откройте шаблон ГИП с альбомом О.';
    $('shrvInfo').textContent = S.reg.shrv ? 'указан' : 'не указан';
    $('shrvInfo').className = 'pl-hint ' + (S.reg.shrv ? 'ok' : 'bad');
    // помещения
    $('rooms').tBodies[0].innerHTML = r.rooms.map(function (x) {
      var ww = (S.reg.windows || []).filter(function (w) { return w.room === x.no; }).map(function (w) { return w.id + ' (' + w.w + ')'; }).join(', ');
      return '<tr data-no="' + x.no + '"><td>' + x.no + '</td><td class="ttl" title="' + escH(x.name) + '">' + escH(x.name) + '</td><td class="n">' + (+x.area || 0).toFixed(1) + '</td><td class="n">' + (x.h || '') +
        '</td><td><input type="checkbox" data-k="heat"' + (x.heated ? ' checked' : '') + '></td><td><input type="checkbox" data-k="corner"' + (x.corner ? ' checked' : '') + '></td><td class="n">' + (x.heated ? x.Q : '—') +
        '</td><td><input class="w-xs" data-k="qman" value="' + escH(x.qman) + '"></td><td class="ttl">' + escH(ww || '—') + '</td></tr>';
    }).join('') || '<tr><td colspan="9" class="pl-hint">Нет реестра помещений: сначала панель «Помещения» (GIPROOMS).</td></tr>';
    // приборы
    var off = Object.keys(S.st.rads).filter(function (k) { return S.st.rads[k].off; });
    $('rads').tBodies[0].innerHTML = r.rads.map(function (x) {
      var s = HEAT.seriesById(x.series);
      var mo = s.models.map(function (m) { return '<option value="' + m.code + '"' + (m.code === x.model ? ' selected' : '') + '>' + m.code + (m.H ? ' (h ' + m.H + ')' : '') + (m.approx ? ' ≈' : '') + '</option>'; }).join('');
      var so = HEAT_DB.series.map(function (z) { return '<option value="' + z.id + '"' + (z.id === x.series ? ' selected' : '') + '>' + escH(z.name) + '</option>'; }).join('');
      var co = x.kind === 'CONV' ? '<td>—</td>' : '<td><select data-k="conn">' + HEAT_DB.conns.map(function (c) { return '<option value="' + c[0] + '"' + (c[0] === x.conn ? ' selected' : '') + '>' + c[0] + '</option>'; }).join('') + '</select></td>';
      return '<tr data-win="' + x.win + '"' + (x.warn ? ' class="warn"' : '') + ' title="' + escH(x.warn || '') + '"><td>' + x.win + '</td><td class="ttl">' + escH(x.roomName) + '</td><td><select data-k="series">' + so + '</select></td><td><select data-k="model">' + mo + '</select></td>' +
        '<td><input class="w-xs" data-k="N" value="' + x.N + '"></td><td class="n">' + x.L + '</td><td class="n">' + x.Qneed + ' / <b>' + x.Q + '</b></td>' + co +
        '<td><button class="x" type="button" data-k="off" title="Без прибора у этого окна">×</button></td></tr>';
    }).join('') + off.map(function (w) { return '<tr data-win="' + w + '" class="off"><td>' + w + '</td><td colspan="7" class="pl-hint">прибор не ставится</td><td><button class="x" type="button" data-k="on" title="Вернуть прибор">↺</button></td></tr>'; }).join('');
    // спецификация
    var pos = 0, rows = [];
    r.spec.forEach(function (x, i) {
      if (x[0] === 'SEC') { pos++; if (x[1]) rows.push('<tr class="sec"><td>' + pos + '</td><td colspan="5">' + escH(x[1]) + '</td></tr>'); else rows.push('<tr class="sec"><td>' + pos + '</td><td colspan="5"></td></tr>'); }
      else {
        var q = x[0] === 'PIPE' ? (S.reg.len ? pipeQty(x) : 'по трассам') : x[5];
        rows.push('<tr><td></td><td>' + escH(x[1]) + '</td><td>' + escH(x[2]) + '</td><td>' + escH(x[3]) + '</td><td>' + escH(x[4]) + '</td><td class="n">' + escH(q) + '</td></tr>');
      }
    });
    $('spec').tBodies[0].innerHTML = rows.join('');
    $('warns').innerHTML = r.warn.map(function (w) { return '<div>⚠ ' + escH(w) + '</div>'; }).join('');
    if (S.reg.len) $('buildInfo').textContent = 'Построено: контуров ' + S.reg.len.n + ', Т1 ' + S.reg.len.t1 + ' м, Т2 ' + S.reg.len.t2 + ' м.';
  }
  function pipeQty(x) {
    var t1 = S.reg.len.t1, t2 = S.reg.len.t2, k = +x[6];
    if (x[5] === 'T') return (Math.ceil((t1 + t2) * k / 5) * 5).toFixed(1);
    if (x[5] === 'T1') return Math.ceil(t1 * k).toFixed(1);
    if (x[5] === 'T2') return Math.ceil(t2 * k).toFixed(1);
    return Math.max(1, Math.ceil((x[5] === 'TAPE1' ? t1 : t2) * k / 25));
  }

  // ---- правка таблиц
  $('rooms').addEventListener('change', function (e) {
    var tr = e.target.closest('tr'); if (!tr) return;
    var no = tr.dataset.no, k = e.target.dataset.k, o = S.st.rooms[no] || (S.st.rooms[no] = {});
    if (k === 'heat' || k === 'corner') o[k] = e.target.checked;
    if (k === 'qman') o.qman = parseFloat(String(e.target.value).replace(',', '.')) || '';
    render();
  });
  $('rads').addEventListener('change', function (e) {
    var tr = e.target.closest('tr'); if (!tr) return;
    var w = tr.dataset.win, k = e.target.dataset.k, o = S.st.rads[w] || (S.st.rads[w] = {});
    if (k === 'series') { o.series = e.target.value; delete o.model; delete o.N; }
    else if (k === 'model') { o.model = e.target.value; delete o.N; }
    else if (k === 'N') { var n = parseInt(e.target.value, 10); if (n > 0) o.N = n; else delete o.N; }
    else if (k === 'conn') o.conn = e.target.value;
    render();
  });
  $('rads').addEventListener('click', function (e) {
    var k = e.target.dataset && e.target.dataset.k; if (k !== 'off' && k !== 'on') return;
    var w = e.target.closest('tr').dataset.win, o = S.st.rads[w] || (S.st.rads[w] = {});
    o.off = k === 'off'; render();
  });
  PKEYS.forEach(function (k) { var el = $('p_' + k); if (el) el.addEventListener('change', function () { readParams(); render(); }); });

  // ---- связь с AutoCAD
  function cmd(c) { if (!host) { toast('Связь с AutoCAD недоступна: откройте панель командой GIPHEAT.', 6000); return; } host.postMessage('cmd\n' + c); toast('Выполняется в AutoCAD: ' + c, 3000); }
  $('readBtn').onclick = function () { cmd('GIPHEATREAD'); };
  $('scanBtn').onclick = function () { cmd('GIPHEATSCAN'); };
  $('winBtn').onclick = function () { cmd('GIPHEATWIN'); };
  $('winDelBtn').onclick = function () { cmd('GIPHEATWINDEL'); };
  $('shrvBtn').onclick = function () { cmd('GIPHEATSHRV'); };
  $('wallsBtn').onclick = function () { cmd('GIPWALLS'); };
  $('buildBtn').onclick = function () {
    readParams(); render();
    if (!S.reg.shrv) { toast('Сначала укажите ШРВ отопления.', 6000); return; }
    if (!S.res.rads.length) { toast('Нет приборов: найдите окна и отметьте отапливаемые помещения.', 6000); return; }
    if (!host) { toast('Связь с AutoCAD недоступна.', 5000); return; }
    host.postMessage('heat\n' + HEAT.inFile(S.res, S.st));
    toast('Строю отопление в AutoCAD…', 4000);
  };
  if (host) {
    host.addEventListener('message', function (ev) {
      var d = ev.data; if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { return; } }
      if (!d) return;
      if (d.type === 'heat-result') toast((d.ok ? 'Готово: ' : 'Ошибка: ') + dec(d.msg), 9000);
      if (d.type === 'heat-registry') {
        S.reg = d;
        if (d.state) { try { var st = JSON.parse(d.state); if (st && st.v) { S.st = st; S.st.rooms = S.st.rooms || {}; S.st.rads = S.st.rads || {}; showParams(); } } catch (e) { /* старое состояние */ } }
        render();
      }
    });
    host.postMessage('ready\n');
  }
  fillSelects(); showParams(); render();
  window.GIPHEATUI = { S: S, render: render };
})();
