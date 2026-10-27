# -*- coding: utf-8 -*-
"""Прогон GIP_SHCHIT.lsp в имитаторе: построение альбома и DXF для предпросмотра."""
import sys, json, time, traceback
import os
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.setrecursionlimit(20000)
from lispemu import Interp, lstr, LispError
from acadmock import Acad
from acadfuncs import install_acad, Preview

TPL = os.path.join(HERE, '..', '..', 'template', 'GIP_EOM_Shablon.dxf')

def make(bi_path=os.path.join(HERE, 'bi_tpl.json')):
    with open(bi_path, encoding='utf-8') as f:
        bi = json.load(f)
    bi = {k: {'attdefs': v['attdefs'], 'dyn': {n: (d[0], d[1]) for n, d in v['dyn'].items()}} for k, v in bi.items()}
    A = Acad(TPL, bi)
    I = Interp()
    install_acad(I, A)
    t0 = time.time()
    I.run(open(os.path.join(HERE, '..', '..', 'dist', 'GIP_SHCHIT.lsp'), encoding='utf-8').read())
    return I, A

if __name__ == '__main__':
    expr = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(HERE, 'out', 'test')
    I, A = make()
    t0 = time.time()
    try:
        r = I.run(expr)
    except LispError as e:
        print('LISP ERROR:', e, getattr(e,'trace',None))
        print(''.join(I.out)[-3000:])
        raise SystemExit(1)
    print('time %.1fs' % (time.time() - t0))
    print(''.join(I.out)[-1500:])
    import os
    os.makedirs(os.path.dirname(out), exist_ok=True)
    pv = Preview(A, extra_paths=[x for x in [('/tmp/dxf2/src.dxf', 'A|'), ('/tmp/sos/sos.dxf', 'B|')] if os.path.exists(x[0])])
    pv.write(out + '.dxf')
    n = sum(1 for h in A.order if not A.ents[h].deleted and A.ents[h].owner == '1F')
    print('entities', n, 'written', out + '.dxf')
