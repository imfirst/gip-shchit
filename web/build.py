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
