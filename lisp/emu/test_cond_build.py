# -*- coding: utf-8 -*-
"""Кондиционирование (GIPCOND) на шаблоне ГИП: листы ВиК, точки блоков, построение split / vrf (план, схема, спецификация).
Шаблон: переменная HEAT_TPL или ../../template/GIP_VIK_EOM_O_Shablon.dxf."""
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
    print('no template (%s) - skipped' % TPL); sys.exit(0)
os.makedirs(os.path.join(HERE, 'out'), exist_ok=True)
bi_path = os.path.join(HERE, 'out', 'bi_heat.json')
if not os.path.exists(bi_path) or os.path.getmtime(bi_path) < os.path.getmtime(TPL):
    json.dump(blockinfo.blockinfo(TPL), open(bi_path, 'w', encoding='utf-8'), ensure_ascii=False)
bi = json.load(open(bi_path, encoding='utf-8'))
bi = {k: {'attdefs': v['attdefs'], 'dyn': {n: (d[0], d[1]) for n, d in v['dyn'].items()}} for k, v in bi.items()}
A = Acad(TPL, bi)
I = Interp(); install_acad(I, A)
I.run(open(os.path.join(HERE, '..', '..', 'dist', 'GIP_SHCHIT.lsp'), encoding='utf-8').read())
tmp = tempfile.mkdtemp() + os.sep
A.vars['TEMPPREFIX'] = tmp

def esc(s): return ''.join(c if ord(c) < 127 else '~u%04X' % ord(c) for c in s.replace('\\', '\\\\').replace('"', '\\"'))

# листы ВиК
I.run('(setq SH (gip:cd-sheets))')
roles = lstr(I.run('(mapcar (quote (lambda (s) (gip:g s "role"))) SH)'))
print('sheets:', roles)
assert roles.count('"plan"') == 1 and roles.count('"scheme"') == 1 and roles.count('"spec"') == 2, roles
# листы отопления/ЭОМ не путаются с ВиК
assert lstr(I.run('(length (vl-remove-if-not (quote (lambda (s) (= (gip:g s "role") "plan"))) (gip:ht-sheets)))')) == '1'

# подложка на листе плана ВиК
D = json.load(open(os.path.join(HERE, 'fixtures', 'routes_flat_c.json'), encoding='utf-8'))
box = [float(v) for v in lstr(I.run('(gip:g (gip:cd-plan-sheet) "box")')).strip('()').split()]
xs = [v for s in D['segs'] for v in (s[0], s[2])]; ys = [v for s in D['segs'] for v in (s[1], s[3])]
dx = (box[0] + box[2]) / 2 - (min(xs) + max(xs)) / 2; dy = (box[1] + box[3]) / 2 - (min(ys) + max(ys)) / 2 + 600
for s in D['segs']:
    I.run('(entmake (list (quote (0 . "LINE")) (cons 8 (gip:layer "WALLS")) (list 10 %.2f %.2f 0.0) (list 11 %.2f %.2f 0.0)))' % (s[0] + dx, s[1] + dy, s[2] + dx, s[3] + dy))
I.run('(gip:rt-wall-layers-put (list "WALLS"))')
# окна (поиск отопления на листе ВиК) -> места блоков: внутренний — на той же стене сбоку от окна, наружный — за окном
W = I.run('(gip:ht-scan (gip:cd-plan-sheet))')
wins = [[float(v) for v in w[2:8]] for w in W]
print('windows:', len(wins))
assert len(wins) == 3
units = []
uid = 0
for w in wins:
    ax, ay, bx, by, nx, ny = w
    u = ((bx - ax), (by - ay)); L = math.hypot(*u); u = (u[0] / L, u[1] / L)
    cx, cy = (ax + bx) / 2, (ay + by) / 2
    uid += 1; units.append((uid, 'I', cx, cy, nx, ny))                         # над окном, на внутренней грани
    uid += 1; units.append((uid, 'O', cx - nx * 900, cy - ny * 900, -nx, -ny))  # снаружи
# выпуск в К1 — у щита (на стене)
sx, sy = D['shield'][0] + dx, D['shield'][1] + dy
uid += 1; units.append((uid, 'K', sx, sy, 0.0, 1.0))
I.run('(gip:cd-units-put (list %s))' % ' '.join('(list %d "%s" %.2f %.2f %.4f %.4f)' % u for u in units))
I.run('(c:GIPCONDREAD)')
reg = json.load(open(tmp + 'gip_cond_reg.txt', encoding='utf-8'))
print('registry units:', reg['units'])
assert reg['sheets'] == {'plan': 1, 'scheme': 1, 'spec': 2}, reg['sheets']
ins = [u for u in reg['units'] if u['kind'] == 'I']
assert all(u['link'] for u in ins) and len(set(u['link'] for u in ins)) == 3, 'split: у каждого свой наружный'

def build(mode):
    lines = ['(STATE "%s")' % esc('{"v":1}'), '(OPT "mode" "%s")' % mode, '(OPT "specclear" "%s")' % '1']
    for u in units:
        if u[1] == 'I':
            lines.append('(UNIT %d "Haier" "AS20HQJ2HRA-W" 700 190 265 "6,35" "9,52" 2.05)' % u[0])
        elif u[1] == 'O':
            lines.append('(UNIT %d "Haier" "1U20HQJ2FRA" 757 281 432 "6,35" "9,52" 2.05)' % u[0])
    if mode == 'vrf':
        o = [u for u in units if u[1] == 'O'][0][0]
        lines += ['(LINK %d %d)' % (u[0], o) for u in units if u[1] == 'I']
        lines += ['(VRFT 5.6 "6,35" "12,7")', '(VRFT 16.0 "9,52" "15,88")']
    lines += ['(SEC "")', '(ROW "%s" "%s" "%s" "%s" 3)' % tuple(map(esc, ('Сплит-система настенного типа', 'AS20HQJ2HRA-W / 1U20HQJ2FRA', 'Haier', 'компл.'))),
              '(SEC "%s")' % esc('Трубы и материалы'),
              '(PIPE "%s" "%s" "" "%s" "CU:6,35" 1.1)' % tuple(map(esc, ('Трубы медные %%C6,35 мм', '%%C6,35 (1/4")', 'п.м.'))),
              '(PIPE "%s" "%s" "" "%s" "CU:9,52" 1.1)' % tuple(map(esc, ('Трубы медные %%C9,52 мм', '%%C9,52 (3/8")', 'п.м.'))),
              '(PIPE "%s" "%s" "%s" "%s" "DR" 1.1)' % tuple(map(esc, ('Труба ПП %%C20 мм, PN 20', 'VTp.700.0020.20', 'VALTEC', 'п.м.'))),
              '(PIPE "%s" "%s" "%s" "%s" "DRE" 1)' % tuple(map(esc, ('Уголок ПП %%C20 мм', 'VTp.751.0.020', 'VALTEC', 'шт.'))),
              '(PIPE "%s" "%s" "%s" "%s" "HL" 1)' % tuple(map(esc, ('Капельная воронка с разрывом струи', 'HL138', 'HL', 'шт.')))]
    open(tmp + 'gip_cond_in.txt', 'w', encoding='ascii').write('\r\n'.join(lines) + '\r\n')
    t0 = time.time()
    I.run('(c:GIPCONDBUILD)')
    out = open(tmp + 'gip_cond_out.txt', encoding='utf-8').read()
    import re
    print(mode, 'build %.1fs:' % (time.time() - t0), re.sub(r'\\U\+([0-9A-F]{4})', lambda m: chr(int(m.group(1), 16)), out.replace('\n', ' ')))
    assert out.startswith('ok'), out
    kinds = collections.Counter()
    for h in A.order:
        e = A.ents[h]
        if e.deleted: continue
        x = e.xdata.get('GIPCOND')
        if x: kinds[str(x[0]).split('.')[-1].strip(' )"')] += 1
    print(' objects:', dict(kinds))
    return kinds

k1 = build('split')
assert k1['unit'] == 6 and k1['pipe'] == 6 and k1['drain'] >= 3 and k1['spec'] > 10 and k1['axo'] > 10, k1
reg = json.load(open(tmp + 'gip_cond_reg.txt', encoding='utf-8'))
print('len:', reg['len'])
assert reg['len']['cu']['6,35'] > 5 and reg['len']['dr'] > 2
# фреон: ортогонально, пары, начинаются у наружного блока
pl = []
for h in A.order:
    e = A.ents[h]
    if not e.deleted and e.xdata.get('GIPCOND') and 'pipe' in str(e.xdata['GIPCOND'][0]) and e.typ == "LWPOLYLINE":
        pl.append(e)
print('freon polylines:', len(pl))
SPLIT_DXF = os.path.join(HERE, 'out', 'cond_split.dxf'); Preview(A).write(SPLIT_DXF)
k1b = build('split')
assert sum(k1b.values()) == sum(k1.values()), ('повторное построение должно заменять', k1, k1b)
# VRF: одно подключение, дерево с рефнетами
k2 = build('vrf')
reg = json.load(open(tmp + 'gip_cond_reg.txt', encoding='utf-8'))
print('vrf len:', reg['len'])
assert reg['len']['ref'] >= 1, 'VRF: нет рефнетов'
assert '12,7' in reg['len']['cu'], 'VRF: газ по таблице мощностей'
# образец шаблона в листах спецификации стёрт (галочка «заменить»): чужих строк в сетке не осталось
occ = lstr(I.run('(gip:cd-spec-prep (gip:cd-specs (gip:cd-sheets)) nil)'))
print('spec occupancy after clear:', occ)
assert occ == '(0 0)', occ
bx = []
for i in range(4):
    bx.append([float(v) for v in lstr(I.run('(gip:g (nth %d SH) "box")' % i)).strip('()').split()])
json.dump(bx, open(os.path.join(HERE, 'out', 'cond_boxes.json'), 'w'))
pv = Preview(A)
pv.write(os.path.join(HERE, 'out', 'cond_build.dxf'))
# сводка проекта для панели GIPPROEKT
I.run('(c:GIPPRJREAD)')
pj = json.load(open(tmp + 'gip_prj_reg.txt', encoding='utf-8'))
print('project:', pj['cond'], pj['heat'])
assert pj['cond']['I'] == 3 and pj['cond']['built'] and pj['cond']['plan'] and pj['heat']['plan']
open(tmp + 'gip_prj_in.txt', 'w', encoding='ascii').write('(STATE "%s")\r\n' % esc('{"v":1,"prj":{"address":"г. Москва"}}'))
I.run('(c:GIPPRJSAVE)')
pj = json.load(open(tmp + 'gip_prj_reg.txt', encoding='utf-8'))
assert json.loads(pj['state'])['prj']['address'] == 'г. Москва', pj['state']
print('cond build: ALL OK')
