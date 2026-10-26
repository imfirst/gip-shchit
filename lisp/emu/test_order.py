# -*- coding: utf-8 -*-
"""Порядок прорисовки монтажной схемы: корпус и DIN-рейки под аппаратами (в т.ч. если чертёж уже
содержит таблицу порядка прорисовки), надписи блоков GIPM_* поверх заливок."""
import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.setrecursionlimit(20000)
from run import make
from acadfuncs import Preview
from lispemu import lstr, DPair
import dxfio
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'out', 'order_dk.dxf')
I, A = make()
I.run('(gip:run (gip:s (gip:s (gip:s (gip:default-state "k2") "brand" "dekraft") "prot" "rcd") "phases" 3))')
mont = [h for h in A.order if not A.ents[h].deleted and A.ents[h].owner == '1F' and 'GIPGEN' in A.ents[h].xdata
        and A.dget(A.ents[h], 8) == 'GIP_Монтаж']
pos = {h: i for i, h in enumerate(A.order)}
ins = [h for h in mont if A.ents[h].typ == 'INSERT']
hat = [h for h in mont if A.ents[h].typ == 'HATCH']
first_ins = min(pos[h] for h in ins)
# рейки: заливки шириной во весь ряд
def bb(h):
    xs = [p[1] for p in A.ents[h].data if isinstance(p, list) and p and p[0] == 10]
    return (max(xs) - min(xs)) if xs else 0
wide = [h for h in hat if any(isinstance(p, DPair) and p.car == 420 and p.cdr in (16053492, 14474460) for p in A.ents[h].data)]; assert len(wide) >= 4, len(wide)
assert all(pos[h] < first_ins for h in wide), 'рейки не под аппаратами'
# повторная сборка: таблица порядка уже есть — рейки снова вниз
I.run('(gip:run (gip:load-state))')
pos = {h: i for i, h in enumerate(A.order)}
mont = [h for h in A.order if not A.ents[h].deleted and A.ents[h].owner == '1F' and A.dget(A.ents[h], 8) == 'GIP_Монтаж']
ins = [h for h in mont if A.ents[h].typ == 'INSERT']; hat = [h for h in mont if A.ents[h].typ == 'HATCH']
wide = [h for h in hat if any(isinstance(p, DPair) and p.car == 420 and p.cdr in (16053492, 14474460) for p in A.ents[h].data)]; assert len(wide) >= 4, len(wide)
assert all(pos[h] < min(pos[x] for x in ins) for h in wide), 'после пересборки рейки не под аппаратами'
# блоки шаблона: в GIPM_* надписи после всех заливок
P = dxfio.load(os.path.join(HERE, '..', '..', 'template', 'GIP_EOM_Shablon.dxf'))
cur = None; bad = []
for r in dxfio.records(dxfio.sections(P)['BLOCKS']):
    t = r[0][1]
    if t == 'BLOCK': cur = dxfio.g(r, 2); seenT = False
    elif t == 'ENDBLK': cur = None
    elif cur and cur.startswith('GIPM_'):
        if t in ('TEXT', 'MTEXT', 'ATTDEF'): seenT = True
        elif t == 'HATCH' and seenT: bad.append(cur)
assert not bad, sorted(set(bad))
sh = I.run('(mapcar \'(lambda (x) (list (gip:g x "role") (car (gip:g x "F")) (cadr (gip:g x "F")))) (gip:template-sheets))')
d = [r for r in sh if r[0] == 'plan_d'][0]
fx = d[1] + 20961.0
json.dump([[fx - 20961, d[2], fx, d[2] + 14850]], open(OUT + '.boxes.json', 'w'))
Preview(A).write(OUT)
print('ORDER OK', len(ins), 'аппаратов', OUT)
