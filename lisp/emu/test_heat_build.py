# -*- coding: utf-8 -*-
"""Отопление на шаблоне с альбомом О: листы, поиск окон, ШРВ, построение (план, схема, узлы, спецификация).
Шаблон: переменная HEAT_TPL или ../../template/GIP_VIK_EOM_O_Shablon.dxf (собирается tools/heat_template.py)."""
import sys, os, json, math, time, tempfile, collections
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.setrecursionlimit(100000)
from lispemu import Interp, lstr
from acadmock import Acad
from acadfuncs import install_acad, Preview
import blockinfo

TPL = os.environ.get('HEAT_TPL') or os.path.join(HERE, '..', '..', 'template', 'GIP_VIK_EOM_O_Shablon.dxf')
if not os.path.exists(TPL):
    print('нет шаблона с альбомом О (%s) — тест пропущен' % TPL); sys.exit(0)
os.makedirs(os.path.join(HERE, 'out'), exist_ok=True)
bi_path = os.path.join(HERE, 'out', 'bi_heat.json')
if not os.path.exists(bi_path) or os.path.getmtime(bi_path) < os.path.getmtime(TPL):
    json.dump(blockinfo.blockinfo(TPL), open(bi_path, 'w'), ensure_ascii=False)
bi = json.load(open(bi_path, encoding='utf-8'))
bi = {k: {'attdefs': v['attdefs'], 'dyn': {n: (d[0], d[1]) for n, d in v['dyn'].items()}} for k, v in bi.items()}
A = Acad(TPL, bi)
I = Interp(); install_acad(I, A)
I.run(open(os.path.join(HERE, '..', '..', 'dist', 'GIP_SHCHIT.lsp'), encoding='utf-8').read())
tmp = tempfile.mkdtemp() + os.sep
A.vars['TEMPPREFIX'] = tmp

# листы альбома О
sh = I.run('(setq SH (gip:ht-sheets))')
roles = collections.Counter(str(dict((str(p[0]), p[1]) for p in s if hasattr(p, '__len__') or True).get('role', '')) for s in [])
R = [lstr(I.run('(gip:g (nth %d SH) "role")' % i)).strip('"') for i in range(len(sh))]
print('листы О:', R)
assert R.count('plan') == 1 and R.count('scheme') == 1 and R.count('spec') == 2 and R.count('od') == 1, R
# ЭОМ не должен видеть листы О
eom = lstr(I.run('(mapcar (quote (lambda (s) (gip:g s "title"))) (gip:template-sheets))'))
assert 'Т1' not in eom, 'альбом О попал в листы ЭОМ: ' + eom

# подложка: стены из фикстуры на листе плана, слой WALLS
D = json.load(open(os.path.join(HERE, 'fixtures', 'routes_flat_c.json')))
box = [float(v) for v in lstr(I.run('(gip:g (gip:ht-plan-sheet) "box")')).strip('()').split()]
xs = [v for s in D['segs'] for v in (s[0], s[2])]; ys = [v for s in D['segs'] for v in (s[1], s[3])]
dx = (box[0] + box[2]) / 2 - (min(xs) + max(xs)) / 2; dy = (box[1] + box[3]) / 2 - (min(ys) + max(ys)) / 2 + 600
for s in D['segs']:
    I.run('(entmake (list (quote (0 . "LINE")) (cons 8 (gip:layer "WALLS")) (list 10 %.2f %.2f 0.0) (list 11 %.2f %.2f 0.0)))' % (s[0] + dx, s[1] + dy, s[2] + dx, s[3] + dy))
I.run('(gip:rt-wall-layers-put (list "WALLS"))')
t0 = time.time()
I.run('(c:GIPHEATSCAN)')
out = open(tmp + 'gip_heat_out.txt', encoding='utf-8').read()
reg = json.load(open(tmp + 'gip_heat_reg.txt', encoding='utf-8'))
print('поиск окон: %.1fs' % (time.time() - t0), out.split('\n')[0], 'окон', len(reg['windows']), [w['w'] for w in reg['windows']])
assert len(reg['windows']) == 3, reg['windows']
assert reg['sheets'] == {'plan': 1, 'scheme': 1, 'spec': 2, 'od': 1}, reg['sheets']
# ШРВ у щита (как бы указан щелчком)
sx, sy = D['shield'][0] + dx, D['shield'][1] + dy
I.run('(gip:ht-put "GIPHEATSHRV" (list %.2f %.2f 0.0 1.0))' % (sx, sy))

# данные от панели
def esc(s): return ''.join(c if ord(c) < 127 else '~u%04X' % ord(c) for c in s.replace('\\', '\\\\').replace('"', '\\"'))
nodes = json.load(open(os.path.join(HERE, '..', '..', 'web', 'src', 'heat', 'nodes.json'), encoding='utf-8'))
nb = nodes[0]['block']
lines = ['(STATE "%s")' % esc('{"v":1}')]
for k, w in enumerate(reg['windows']):
    lines.append('(RAD %d %d 1018.0 100.0 515 1055 "TUB" "%s" "%s" "%s")' % (k + 1, w['id'], esc('НС'), esc('Rifar Tubog Ventil\\PTUB 2052x22 DV1\\P(h=515мм) 1055 Вт'), esc('О_Узел_TUB_НС_')))
lines += ['(SEC "")', '(ROW "%s" "%s" "%s" "%s" 3)' % tuple(map(esc, ('Rifar Tubog 2052, высотой 515 мм, длиной 1018 мм, 22 с.', 'TUB 2052х22 DV1', 'Rifar', 'шт.'))),
          '(SEC "%s")' % esc('Арматура и фитинги'), '(ROW "%s" "%s" "%s" "%s" 3)' % tuple(map(esc, ('Термостат "Uni LH"', '1011465', 'Oventrop', 'шт.'))),
          '(SEC "%s")' % esc('Трубы и теплоизоляция'), '(PIPE "%s" "%s" "%s" "%s" "T" 1.1)' % tuple(map(esc, ('Труба Rautitan Stabil 16,2х2,6 мм', '130121-100', 'Rehau', 'м'))),
          '(PIPE "%s" "%s" "%s" "%s" "T1" 1.1)' % tuple(map(esc, ('Для трубы 16,2х2,6 мм, S=9мм, красная', 'EFXT018092SUPRK', 'Energoflex', 'м'))),
          '(SHRV "%s" 3)' % esc('О_ШРВ ОТ_Без сервопр_GIP')]
open(tmp + 'gip_heat_in.txt', 'w', encoding='ascii').write('\r\n'.join(lines) + '\r\n')
t0 = time.time()
I.run('(c:GIPHEATBUILD)')
out = open(tmp + 'gip_heat_out.txt', encoding='utf-8').read()
print('построение: %.1fs' % (time.time() - t0), out.replace('\n', ' '))
assert out.startswith('ok'), out
kinds = collections.Counter()
for h in A.order:
    e = A.ents[h]
    if e.deleted: continue
    x = e.xdata.get('GIPHEAT')
    if x: kinds[str(x[0]).split('.')[-1].strip(' )"')] += 1
print('объекты GIPHEAT:', dict(kinds))
n1 = sum(kinds.values())
reg = json.load(open(tmp + 'gip_heat_reg.txt', encoding='utf-8'))
print('длины:', reg['len'], 'приборы:', reg['rads'])
assert reg['len']['n'] == 3 and reg['len']['t1'] > 5
# повторное построение заменяет, а не добавляет
I.run('(c:GIPHEATBUILD)')
k2 = collections.Counter()
for h in A.order:
    e = A.ents[h]
    if not e.deleted and e.xdata.get('GIPHEAT'): k2['x'] += 1
assert k2['x'] == n1, ('повторное построение должно заменять объекты', n1, k2['x'])
# DXF для просмотра
pv = Preview(A)
pv.write(os.path.join(HERE, 'out', 'heat_build.dxf'))
print('heat build: ALL OK')
