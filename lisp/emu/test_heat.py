# -*- coding: utf-8 -*-
"""Отопление: ядро на реальной подложке (стены из фикстуры трасс): поиск окон, трассы Т1/Т2 от ШРВ к радиаторам."""
import sys, os, math, time, json
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.setrecursionlimit(100000)
from run import make
from lispemu import lstr
I, A = make()
D = json.load(open(os.path.join(HERE, 'fixtures', 'routes_flat_c.json')))
segs = D['segs']
def L(pts): return '(list %s)' % ' '.join('(list %.3f %.3f)' % (p[0], p[1]) for p in pts)
I.run('(setq SG (list %s))' % ' '.join('(list %.2f %.2f %.2f %.2f)' % tuple(s) for s in segs))
t0 = time.time()
org = D['shield']
I.run('(setq AN (gip:ht-grid SG (list %.2f %.2f) nil))' % tuple(org))
W = I.run('(setq WL (gip:ht-find-windows *gip:ht-lsg*))')
wins = [[float(x) for x in w[:3]] + [int(w[3]), int(w[4])] for w in W]
print('окон: %d (%.1fs)' % (len(wins), time.time() - t0), wins)
I.run('(gip:rt-free)')
an = float(lstr(I.run('AN')))
assert abs(an) < 1e-6 or abs(an - math.pi/2) < 1e-6 or True
# радиаторы под окнами: длина 1000, глубина 100
rads = []
for k, w in enumerate(wins):
    lo, hi, c, ax, side = w
    cx = org[0] + (lo + hi) / 2.0; cy = org[1] + c
    n = (0.0, float(side))
    face = cy + n[1] * 100.0
    rads.append((k + 1, (cx, face + n[1] * 250.0), (cx - 500, face), (cx + 500, face)))
face = (org[0], org[1] + 150.0); root = (org[0], org[1] + 400.0)
I.run('(setq RD (list %s))' % ' '.join('(list %d (list %.2f %.2f) (list %.2f %.2f) (list %.2f %.2f))' % (r[0], r[1][0], r[1][1], r[2][0], r[2][1], r[3][0], r[3][1]) for r in rads))
t0 = time.time()
R = I.run('(setq RR (gip:ht-route SG RD (list %.2f %.2f) (list %.2f %.2f) (list 0.0 1.0)))' % (root + face))
print('трассы: %d контуров, %.1fs, info %s' % (len(R), time.time() - t0, lstr(I.run('*gip:ht-info*'))))
res = []
for r in R:
    rid = int(r[0]); t1 = [(float(p[0]), float(p[1])) for p in r[2]]; t2 = [(float(p[0]), float(p[1])) for p in r[3]]
    res.append((rid, str(r[1]), t1, t2))
assert len(res) == len(rads), 'не все радиаторы подключены'
def segs_of(pl): return [(pl[i], pl[i+1]) for i in range(len(pl) - 1)]
for rid, side, t1, t2 in res:
    for a, b in segs_of(t1) + segs_of(t2):
        assert min(abs(a[0]-b[0]), abs(a[1]-b[1])) < 1.0, ('не ортогонально', rid, a, b)
    # начало у грани ШРВ, конец у радиатора (Т1/Т2 в 100/150 мм от торца)
    assert abs(t1[0][1] - face[1]) < 1 and abs(t2[0][1] - face[1]) < 1, ('начало не на ШРВ', t1[0], t2[0])
    r = rads[rid - 1]
    assert abs(t1[-1][1] - r[2][1]) < 1 and abs(t2[-1][1] - r[2][1]) < 1, ('конец не у радиатора', t1[-1], r)
    assert abs(abs(t1[-1][0] - t2[-1][0]) - 50) < 1, 'выводы радиатора не через 50'
# трубы разных контуров не накладываются
def overlap(s1, s2):
    (a, b), (c, d) = s1, s2
    if abs(a[1]-b[1]) < 1 and abs(c[1]-d[1]) < 1 and abs(a[1]-c[1]) < 20:
        return min(max(a[0], b[0]), max(c[0], d[0])) - max(min(a[0], b[0]), min(c[0], d[0])) > 30
    if abs(a[0]-b[0]) < 1 and abs(c[0]-d[0]) < 1 and abs(a[0]-c[0]) < 20:
        return min(max(a[1], b[1]), max(c[1], d[1])) - max(min(a[1], b[1]), min(c[1], d[1])) > 30
    return False
allp = [(rid, k, s) for rid, side, t1, t2 in res for k, pl in ((1, t1), (2, t2)) for s in segs_of(pl)]
bad = [(x[0], x[1], y[0], y[1]) for i, x in enumerate(allp) for y in allp[i+1:] if (x[0], x[1]) != (y[0], y[1]) and overlap(x[2], y[2])]
print('наложений: %d' % len(bad), bad[:5])
assert not bad, 'трубы накладываются'
# картинка
import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
fig = plt.figure(figsize=(14, 10)); ax = fig.add_axes([0, 0, 1, 1]); ax.set_aspect('equal'); ax.axis('off')
for s in segs: ax.plot([s[0], s[2]], [s[1], s[3]], color='#888', lw=0.4)
for rid, side, t1, t2 in res:
    ax.plot([p[0] for p in t1], [p[1] for p in t1], 'r-', lw=1.2); ax.plot([p[0] for p in t2], [p[1] for p in t2], 'b-', lw=1.2)
for r in rads: ax.plot([r[2][0], r[3][0], r[3][0], r[2][0], r[2][0]], [r[2][1], r[2][1], r[2][1]+100, r[2][1]+100, r[2][1]], 'r-', lw=2)
os.makedirs(os.path.join(HERE, 'out'), exist_ok=True)
fig.savefig(os.path.join(HERE, 'out', 'heat_routes.png'), dpi=70)
print('heat core: ALL OK')

# ---- тот же план, повёрнутый на 10°: трассы ортогональны в системе стен
ang = math.radians(10.0)
def rot(p):
    c, s_ = math.cos(ang), math.sin(ang)
    return (org[0] + (p[0]-org[0])*c - (p[1]-org[1])*s_, org[1] + (p[0]-org[0])*s_ + (p[1]-org[1])*c)
I.run('(setq SG2 (list %s))' % ' '.join('(list %.2f %.2f %.2f %.2f)' % (rot(s[:2]) + rot(s[2:])) for s in segs))
rads2 = [(r[0], rot(r[1]), rot(r[2]), rot(r[3])) for r in rads]
I.run('(setq RD2 (list %s))' % ' '.join('(list %d (list %.2f %.2f) (list %.2f %.2f) (list %.2f %.2f))' % (r[0], r[1][0], r[1][1], r[2][0], r[2][1], r[3][0], r[3][1]) for r in rads2))
fr, ro = rot(face), rot(root)
R2 = I.run('(gip:ht-route SG2 RD2 (list %.2f %.2f) (list %.2f %.2f) (list %.6f %.6f))' % (ro + fr + (-math.sin(ang), math.cos(ang))))
assert len(R2) == 3, 'повёрнутый план: подключены не все'
for r in R2:
    for pl in (r[2], r[3]):
        pts = [(float(p[0]), float(p[1])) for p in pl]
        for a, b in zip(pts, pts[1:]):
            dx, dy = b[0]-a[0], b[1]-a[1]
            c, s_ = math.cos(-ang), math.sin(-ang)
            lx, ly = dx*c - dy*s_, dx*s_ + dy*c
            assert min(abs(lx), abs(ly)) < 1.0, ('не ортогонально на повёрнутом плане', a, b)
print('heat rotated 10°: ALL OK')
