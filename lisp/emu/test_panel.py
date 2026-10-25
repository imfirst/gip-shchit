# -*- coding: utf-8 -*-
"""Проверка построения альбома по таблице из панели (режим v2) и обратной связи монтажка -> таблица."""
import sys, json, os, time
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
sys.setrecursionlimit(20000)
from run import make
from lispemu import LispError, lstr
from acadfuncs import Preview

P = __import__('os').path.join(__import__('os').path.dirname(__import__('os').path.abspath(__file__)), 'out', 'panel') + '/'
OUT = __import__('os').path.join(__import__('os').path.dirname(__import__('os').path.abspath(__file__)), 'out')

def run(I, expr):
    try:
        return I.run(expr)
    except LispError as e:
        print('  LISP ERROR:', e, getattr(e, 'trace', None))
        return 'ERR'

def preview(A, name):
    pv = Preview(A, extra_paths=[x for x in [('/tmp/dxf2/src.dxf', 'A|'), ('/tmp/sos/sos.dxf', 'B|')] if __import__('os').path.exists(x[0])])
    pv.write(os.path.join(OUT, name + '.dxf'))

def apply(I, A, name):
    st = json.load(open(P + name + '.json', encoding='utf-8'))
    txt = json.dumps(st, ensure_ascii=True, separators=(',', ':'))
    open(P + 'gip_panel_in.json', 'w', encoding='ascii').write(txt)
    A.vars['TEMPPREFIX'] = P
    I.out.clear() if hasattr(I.out, 'clear') else None
    t0 = time.time()
    run(I, '(c:GIPPANELAPPLY)')
    out = ''.join(I.out)
    msg = [l for l in out.split('\n') if 'GIP' in l]
    print(name, '%.1fs' % (time.time() - t0), msg[-2:])
    saved = run(I, '(gip:dict-get "GIPPANEL")')
    print('  GIPPANEL == input:', saved == txt)
    return txt

only = sys.argv[1:]
for name in ['k3_rcd', 'k2_dif', 'empty']:
    if only and name not in only: continue
    I, A = make()
    apply(I, A, name)
    brd = run(I, '(mapcar \'(lambda (d) (strcat (gip:gn d "ref" "?") " " (gip:g d "kind") " " (gip:gn d "feed" "") " " (if (gip:g d "line") (gip:gn (gip:g d "line") "num" "") ""))) (gip:g *gip:board* "all"))')
    print('  devices:', lstr(brd)[:900])
    preview(A, 'panel_' + name)
    sh = run(I, '(mapcar \'(lambda (x) (list (gip:g x "role") (car (gip:g x "F")) (cadr (gip:g x "F")))) (gip:template-sheets))')
    F = {r[0]: (r[1], r[2]) for r in sh}
    SW, SHH = 20960.5, 14850.0
    od, ds = F['od'], F['plan_d']
    bx = []
    for k in range(2): bx.append([od[0] + k * SW - 20961, od[1] - SHH, od[0] + k * SW, od[1] - SHH + 14850])
    bx.append([ds[0] + SW - 20961, ds[1], ds[0] + SW, ds[1] + 14850])
    for k in range(2): bx.append([ds[0] - 20961, ds[1] - (k + 1) * SHH, ds[0], ds[1] - (k + 1) * SHH + 14850])
    json.dump(bx, open(P + 'boxes_' + name + '.json', 'w'))
    if name == 'k3_rcd':
        # монтажка: переставить первый групповой аппарат в конец последней рейки и удалить один автомат
        devs = [A.ents[h] for h in A.order if A.ents[h].ins and 'GIPDEV' in A.ents[h].xdata and not A.ents[h].deleted]
        ids = [(e.xdata['GIPDEV'][0].cdr, e.ins['pt'][0], e.ins['pt'][1], e) for e in devs]
        ys = sorted(set(round(y) for _, _, y, _ in ids), reverse=True)
        grp = [d for d in ids if d[0].startswith('L:')]
        top = sorted([d for d in ids if round(d[2]) == ys[0]], key=lambda d: d[1])
        mv = sorted(grp, key=lambda d: (-round(d[2]), d[1]))[0]
        last = [d for d in ids if round(d[2]) == ys[-1]]
        mv[3].ins['pt'] = [max(t[1] for t in last) + 600.0, ys[-1], 0.0]
        dl = [d for d in grp if d[0] != mv[0]][3]
        dl[3].deleted = True
        before = json.loads(run(I, '(gip:dict-get "GIPPANEL")'))
        run(I, '(c:GIPUPD)')
        after_txt = run(I, '(gip:dict-get "GIPPANEL")')
        after = json.loads(after_txt)
        bids = [r['id'] for r in before['rows']]; aids = [r['id'] for r in after['rows']]
        print('  montage moved', mv[0], 'deleted', dl[0])
        print('  rows before', len(bids), 'after', len(aids), 'moved row now at', aids.index(mv[0][2:]) if mv[0][2:] in aids else None, 'of', len(aids))
        print('  deleted row gone:', dl[0][2:] not in aids, ' ascii only:', all(ord(c) < 127 for c in after_txt))
        json.dump(after, open(P + 'k3_after_montage.json', 'w'), ensure_ascii=False)
        preview(A, 'panel_k3_after')

if not only or 'v1' in only:
    I, A = make()
    run(I, '(gip:run (gip:default-state "k2"))')
    t = run(I, '(gip:dict-get "GIPPANEL")')
    j = json.loads(t)
    print('v1 export rows', len(j['rows']), 'board', {k: j['board'][k] for k in ('name', 'phases', 'inA', 'brand', 'kc', 'kcMode')})
    print('  ', [r.get('cat') + '/' + r.get('prot', 'u') for r in j['rows']][:12])
    json.dump(j, open(P + 'v1_export.json', 'w'), ensure_ascii=False)
