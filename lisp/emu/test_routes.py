# -*- coding: utf-8 -*-
"""Трассы силовых: ядро gip:rt-build на реальной подложке (стены дизайнера из присланного DXF, 101 розетка, щит), в т.ч. план, повёрнутый на 10°."""
import sys, os, math, time, json
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.setrecursionlimit(100000)
from run import make
from lispemu import lstr
I, A = make()
D = json.load(open(os.path.join(HERE, 'fixtures', 'routes_flat_c.json')))

def case(angle):
    o = D['shield']
    def rot(p):
        c, s = math.cos(angle), math.sin(angle)
        return (o[0] + (p[0]-o[0])*c - (p[1]-o[1])*s, o[1] + (p[0]-o[0])*s + (p[1]-o[1])*c)
    segs = [rot(s[:2]) + rot(s[2:]) for s in D['segs']]
    socks = [rot(p) for p in D['socks']]
    I.run('(setq SG (list %s) SK (list %s))' % (' '.join('(list %.2f %.2f %.2f %.2f)' % s for s in segs), ' '.join('(list %.2f %.2f)' % p for p in socks)))
    t0 = time.time()
    I.run('(setq RES (gip:rt-build SG SK (list %.2f %.2f)))' % rot(o))
    return I.run('RES'), socks, lstr(I.run('*gip:rt-info*')), time.time() - t0

def segd(s, a, b):
    dx, dy = b[0]-a[0], b[1]-a[1]; l2 = dx*dx + dy*dy
    u = 0 if l2 == 0 else max(0, min(1, ((s[0]-a[0])*dx + (s[1]-a[1])*dy) / l2))
    return math.hypot(s[0]-a[0]-u*dx, s[1]-a[1]-u*dy)

for ang in (0.0, math.radians(10.0)):
    res, socks, info, dt = case(ang)
    print('angle %.0f: lines %d info %s (%.0fs)' % (math.degrees(ang), len(res), info, dt))
    lines = [[(float(p[0]), float(p[1])) for p in l[1:]] for l in res]
    widths = sorted(set(int(l[0]) for l in res))
    assert widths == [10, 40], widths
    assert info.split()[1] == '0', 'не достигнуто розеток: ' + info
    segs = [(l[i], l[i+1]) for l in lines for i in range(len(l)-1)]
    # каждая розетка лежит на линии
    for s in socks:
        assert min(segd(s, a, b) for a, b in segs) < 1.0, ('розетка не подключена', s)
    # ортогонально в базисе плана (допуск 1°)
    for a, b in segs:
        # в системе координат плана: наклон допустим только в пределах 2.5 мм (смещение розетки)
        c, s_ = math.cos(-ang), math.sin(-ang)
        dx, dy = b[0]-a[0], b[1]-a[1]
        lx, ly = dx*c - dy*s_, dx*s_ + dy*c
        assert min(abs(lx), abs(ly)) < 2.5, ('не ортогонально', a, b, lx, ly)
print('routes power: ALL OK')

# ---- драйвер на чертеже: стены (LINE на слое), розетки на листе силовых, повторный запуск стирает прежние линии
I2, A2 = make()
I2.run('(gip:run (gip:default-state "k2"))')
sh = '(car (vl-remove-if-not (quote (lambda (s) (= (gip:g s "role") "plan_p"))) (gip:template-sheets)))'
F = I2.run('(cdr (assoc "F" %s))' % sh)
fx, fy = [float(v) for v in lstr(F).strip('()').split()[0:2]]
SW = float(lstr(I2.run('*gip:SW*')))
bx, by = fx - SW + 2000.0 - min(min(s[0], s[2]) for s in D['segs']), fy + 1500.0 - min(min(s[1], s[3]) for s in D['segs'])
for s in D['segs']:
    I2.run('(entmake (list (quote (0 . "LINE")) (cons 8 (gip:layer "WALLS")) (list 10 %.2f %.2f 0.0) (list 11 %.2f %.2f 0.0)))' % (s[0]+bx, s[1]+by, s[2]+bx, s[3]+by))
for p in D['socks']:
    I2.run('(vla-insertblock (gip:ms) (vlax-3d-point %.2f %.2f 0.0) "ЭОМ_Розетки_GIP" 1.0 1.0 1.0 0.0)' % (p[0]+bx, p[1]+by))
def count_routes():
    return int(lstr(I2.run('(if (setq ss (ssget "_X" (list (cons 0 "LWPOLYLINE") (cons 8 *gip:rt-lay-p*)))) (sslength ss) 0)')))
call = '(gip:routes-power %s (list %.2f %.2f) (list "WALLS"))' % (sh, D['shield'][0]+bx, D['shield'][1]+by)
n1 = int(lstr(I2.run(call)))
assert n1 >= 10 and count_routes() == n1, (n1, count_routes())
n2 = int(lstr(I2.run(call)))
assert n2 == n1 and count_routes() == n2, ('повторный запуск должен заменять линии', n1, n2, count_routes())
print('routes on drawing: ALL OK (%d lines)' % n1)
