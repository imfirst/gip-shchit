# -*- coding: utf-8 -*-
"""Импорт плана из PDF (файл панели) на эмуляторе: подложка-блок на листах планов и блоки ГИП."""
import sys, os, json, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.setrecursionlimit(20000)
from run import make
from acadfuncs import Preview
from lispemu import LispError
HERE = os.path.dirname(os.path.abspath(__file__))
P = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'out', 'plan') + os.sep
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(HERE, 'out', 'plan_import.dxf')
I, A = make()
A.vars['TEMPPREFIX'] = P
t0 = time.time()
try:
    I.run('(c:GIPPLANIMPORT)')
except LispError as e:
    print('LISP ERROR', e, getattr(e, 'trace', None)); raise
out = ''.join(I.out)
print('%.1fs' % (time.time() - t0), [l for l in out.split('\n') if 'ГИП' in l or 'GIP' in l][-3:])
nb = getattr(A, 'newblocks', {})
print('blocks', {k: len(v) for k, v in nb.items()})
ins = [A.ents[h] for h in A.order if A.ents[h].ins is not None and not A.ents[h].deleted and 'GIPPLAN' in A.ents[h].xdata]
import collections
print('inserts', collections.Counter((e.ins['name'], A.dget(e, 8)) for e in ins))
# повторный импорт заменяет прежний
I.run('(c:GIPPLANIMPORT)')
ins2 = [A.ents[h] for h in A.order if A.ents[h].ins is not None and not A.ents[h].deleted and 'GIPPLAN' in A.ents[h].xdata]
print('after reimport', len(ins), '->', len(ins2))
sh = I.run('(mapcar \'(lambda (x) (list (gip:g x "role") (car (gip:g x "F")) (cadr (gip:g x "F")))) (gip:template-sheets))')
boxes = [[r[1] - 20961, r[2], r[1], r[2] + 14850] for r in sh if r[0] in ('plan_p', 'plan_l')]
json.dump(boxes, open(OUT + '.boxes.json', 'w'))
Preview(A).write(OUT)
print('written', OUT)
