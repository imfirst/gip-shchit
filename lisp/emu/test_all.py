# -*- coding: utf-8 -*-
import sys, json, os, time
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
sys.setrecursionlimit(20000)
from run import make
from lispemu import LispError, lstr
from acadfuncs import Preview

OUT = __import__('os').path.join(__import__('os').path.dirname(__import__('os').path.abspath(__file__)), 'out')
def preview(A, name):
    pv = Preview(A, extra_paths=[x for x in [('/tmp/dxf2/src.dxf', 'A|'), ('/tmp/sos/sos.dxf', 'B|')] if __import__('os').path.exists(x[0])])
    pv.write(os.path.join(OUT, name + '.dxf'))

def run(I, expr):
    try:
        return I.run(expr)
    except LispError as e:
        print('  LISP ERROR:', e, getattr(e, 'trace', None))
        return 'ERR'

cases = [
  ('k3_abb', '(gip:default-state "k3")'),
  ('k1_chint_rcd', '(gip:s (gip:s (gip:s (gip:default-state "k1") "brand" "chint") "prot" "rcd") "fire" T)'),
  ('studio_iek', '(gip:s (gip:s (gip:s (gip:default-state "studio") "brand" "iek") "relay" nil) "km" nil)'),
  ('k2_dk_3f', '(gip:s (gip:s (gip:s (gip:s (gip:default-state "k2") "brand" "dekraft") "prot" "rcd") "phases" 3) "heater" "flow")'),
]
only = sys.argv[1:]
for name, st in cases:
    if only and name not in only: continue
    I, A = make()
    t0 = time.time()
    r = run(I, '(gip:run %s)' % st)
    out = ''.join(I.out)
    msg = [l for l in out.split('\n') if 'GIP' in l][-1:]
    print(name, '%.1fs' % (time.time() - t0), msg, 'warn:', [l for l in out.split('\n') if 'GIP:' in l][:5])
    preview(A, name)

if not only or 'link' in only:
    I, A = make()
    link = open(__import__('os').path.join(__import__('os').path.dirname(__import__('os').path.abspath(__file__)), 'link1.txt')).read().strip()
    r = run(I, '(setq SL (gip:state-from-link "%s"))' % link)
    print('link state:', lstr(r)[:600])
    r = run(I, '(gip:run SL)')
    print('link build', ''.join(I.out).split('\n')[-1])
    preview(A, 'link1')

if not only or 'sync' in only:
    I, A = make()
    run(I, '(gip:run (gip:default-state "k2"))')
    # перенести аппарат: первый групповой с рейки 2 в конец рейки 1 (сдвиг по модели)
    devs = [A.ents[h] for h in A.order if A.ents[h].ins and 'GIPDEV' in A.ents[h].xdata and not A.ents[h].deleted]
    ids = [(e.xdata['GIPDEV'][0].cdr, e.ins['pt'][0], e.ins['pt'][1]) for e in devs]
    ys = sorted(set(round(y) for _, _, y in ids), reverse=True)
    print('rails y', ys[:5], 'devices', len(ids))
    # берём аппарат с нижней рейки и ставим справа на верхнюю
    low = [d for d in ids if round(d[2]) == ys[-1]]
    top = [d for d in ids if round(d[2]) == ys[0]]
    mv = low[0]
    e = [x for x in devs if x.xdata['GIPDEV'][0].cdr == mv[0]][0]
    e.ins['pt'] = [max(t[1] for t in top) + 1000.0, ys[0], 0.0]
    print('moved', mv[0])
    # удалить один аппарат
    dl = low[-1]
    ed = [x for x in devs if x.xdata['GIPDEV'][0].cdr == dl[0]][0]
    A.entdel(type('E', (), {'h': ed.h})())
    print('deleted', dl[0])
    r = run(I, '(gip:montage-changed)')
    print('changed?', lstr(r))
    r = run(I, '(setq S2 (gip:sync-from-montage (gip:load-state)))')
    print('order', lstr(I.run('(gip:g S2 "order")'))[:300])
    print('breaks', lstr(I.run('(gip:g S2 "breaks")')), 'removed', lstr(I.run('(gip:g S2 "removed")')), 'railsMin', lstr(I.run('(gip:g S2 "railsMin")')))
    r = run(I, '(gip:run S2)')
    print('sync build', ''.join(I.out).split('\n')[-1])
    preview(A, 'k2_sync')
