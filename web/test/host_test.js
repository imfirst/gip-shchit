// Проверка обмена страницы с панелью AutoCAD (имитация WebView2)
const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1000, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => {
    const ls = []; window.__sent = [];
    window.chrome = { webview: {
      postMessage: (m) => window.__sent.push(m),
      addEventListener: (t, f) => ls.push(f),
      __emit: (data) => ls.forEach(f => f({ data })) } };
  });
  await p.goto('file://' + require('path').resolve(__dirname, '../../dist/panel.html')); await p.waitForTimeout(300);
  const sent = async () => p.evaluate(() => window.__sent.map(s => s.split('\n')[0]));
  console.log('1 ready:', await sent(), await p.textContent('#linkTxt'));
  await p.evaluate(() => chrome.webview.__emit({ type: 'unlinked', doc: 'Новый.dwg' }));
  console.log('2 unlinked bar visible:', await p.isVisible('#hostBar'), await p.textContent('#linkTxt'));
  await p.click('#buildHere'); await p.waitForTimeout(50);
  console.log('3 build sent:', await sent());
  await p.evaluate(() => chrome.webview.__emit({ type: 'linked', doc: 'Новый.dwg' }));
  console.log('4 linked:', await p.textContent('#linkTxt'), 'bar hidden:', !(await p.isVisible('#hostBar')));
  const id = await p.evaluate(() => GIP.derived.rows.find(r => r.t === 'g').id);
  await p.fill(`#c-${id}-p`, '0,6'); await p.press(`#c-${id}-p`, 'Enter'); await p.waitForTimeout(300);
  const last = await p.evaluate(() => window.__sent[window.__sent.length - 1]);
  console.log('5 edit -> apply:', (await sent()).length, last.split('\n')[0], JSON.parse(last.split('\n')[1]).rows.find(r => r.t === 'g').p);
  const st = JSON.parse(fs.readFileSync(require('path').resolve(__dirname, '../../lisp/emu/out/panel/k3_after_montage.json'), 'utf8'));
  const n0 = (await sent()).length;
  await p.evaluate((s) => chrome.webview.__emit({ type: 'load', origin: 'drawing', doc: 'Новый.dwg', state: s }), st);
  await p.waitForTimeout(400);
  console.log('6 load from drawing: groups', await p.evaluate(() => GIP.derived.tot.groups), 'echo sent:', (await sent()).length - n0, 'undo enabled:', !(await p.isDisabled('#undo')), 'toast:', await p.textContent('#toastTxt'));
  await p.uncheck('#autoChk');
  const id2 = await p.evaluate(() => GIP.derived.rows.find(r => r.t === 'g').id);
  const n1 = (await sent()).length;
  await p.selectOption(`#c-${id2}-In`, '16'); await p.waitForTimeout(300);
  console.log('7 manual: sent', (await sent()).length - n1, 'push visible', await p.isVisible('#pushBtn'));
  await p.click('#pushBtn'); await p.waitForTimeout(50);
  console.log('   after push sent', (await sent()).length - n1, 'push visible', await p.isVisible('#pushBtn'));
  await p.keyboard.press('Escape');
  await p.evaluate(() => document.activeElement.blur());
  await p.keyboard.press('Control+z'); await p.waitForTimeout(100);
  console.log('   undo with manual mode -> push primary', await p.evaluate(() => document.getElementById('pushBtn').classList.contains('primary')));
  await p.evaluate((s) => chrome.webview.__emit({ type: 'load', origin: 'activate', doc: 'Другой.dwg', state: s }), st);
  await p.waitForTimeout(200);
  console.log('8 activate: undo disabled', await p.isDisabled('#undo'), await p.textContent('#linkTxt'));
  await p.screenshot({ path: require('path').resolve(__dirname, '../out') + '/11_panel.png' });
  console.log('errors', errs); await b.close();
})();
