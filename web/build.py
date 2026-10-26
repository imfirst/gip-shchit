import os
HERE = os.path.dirname(os.path.abspath(__file__))
S = os.path.join(HERE, 'src')
DIST = os.path.join(HERE, '..', 'dist')
OUT = os.path.join(HERE, 'out')
page = open(S + '/page.html', encoding='utf-8').read()
page = page.replace('/*CSS*/', open(S + '/style.css', encoding='utf-8').read())
page = page.replace('/*MODEL*/', open(S + '/model.js', encoding='utf-8').read())
page = page.replace('/*UI*/', open(S + '/ui.js', encoding='utf-8').read())
os.makedirs(DIST, exist_ok=True); os.makedirs(OUT, exist_ok=True)
open(os.path.join(DIST, 'gip_gruppy_shchita.html'), 'w', encoding='utf-8').write(page)
# локальная копия с обёрткой документа — для проверки в браузере
full = '<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>' + page + '</body></html>'
open(os.path.join(OUT, 'preview.html'), 'w', encoding='utf-8').write(full)
# панель AutoCAD: без внешних шрифтов (работает без интернета)
import re
panel = re.sub(r'<link rel="(preconnect|stylesheet)"[^>]*>\n?', '', page)
assert 'googleapis' not in panel
full_panel = '<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>' + panel + '</body></html>'
open(os.path.join(DIST, 'panel.html'), 'w', encoding='utf-8').write(full_panel)
print('ok', len(page), len(full_panel))
# страница «План из PDF» (в панели AutoCAD рядом с panel.html) и pdf.js (legacy, Apache-2.0)
import shutil, subprocess
PL = os.path.join(S, 'plan')
plan = open(os.path.join(PL, 'plan.html'), encoding='utf-8').read()
plan = plan.replace('/*CSS*/', open(os.path.join(S, 'style.css'), encoding='utf-8').read()).replace('/*PLANCSS*/', open(os.path.join(PL, 'plan.css'), encoding='utf-8').read())
plan = plan.replace('/*PLAN*/', open(os.path.join(PL, 'pdfplan.js'), encoding='utf-8').read()).replace('/*PLANUI*/', open(os.path.join(PL, 'plan-ui.js'), encoding='utf-8').read())
assert 'googleapis' not in plan
open(os.path.join(DIST, 'plan.html'), 'w', encoding='utf-8').write('<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>' + plan + '</body></html>')
# pdf.js хранится в dist/pdfjs; обновить из npm-пакета pdfjs-dist можно, задав PDFJS_DIR
PJ = os.environ.get('PDFJS_DIR')
if PJ:
    os.makedirs(os.path.join(DIST, 'pdfjs'), exist_ok=True)
    for f in ('legacy/build/pdf.min.mjs', 'legacy/build/pdf.worker.min.mjs', 'LICENSE'):
        shutil.copy(os.path.join(PJ, f), os.path.join(DIST, 'pdfjs', os.path.basename(f).replace('.mjs', '.js')))
print('plan', len(plan))
