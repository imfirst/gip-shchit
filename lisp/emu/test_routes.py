# -*- coding: utf-8 -*-
"""Трассы силовых: ядро gip:rt-build на синтетической квартире (коридор + две комнаты), в т.ч. повёрнутой на 10 градусов."""
import sys, os, math, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.setrecursionlimit(50000)
from run import make
from lispemu import lstr
I, A = make()

def rot(p, a, o=(0, 0)):
    c, s = math.cos(a), math.sin(a)
    return (o[0] + p[0]*c - p[1]*s, o[1] + p[0]*s + p[1]*c)
def lp(pts): return '(list ' + ' '.join('(list %.3f %.3f)' % p for p in pts) + ')'

def case(angle):
    o = (100000.0, 50000.0)
    R = lambda pts: [rot(p, angle, o) for p in pts]
    corridor = [(0,0),(6000,0),(6000,1500),(0,1500)]
    roomA = [(0,1500),(3000,1500),(3000,5000),(0,5000)]      # над коридором слева
    roomB = [(3000,1500),(6000,1500),(6000,5000),(3000,5000)] # над коридором справа
    socks = [(0,3000),(0,4500),(1500,5000),(3000,3500),(3000,4800)]   # A: на левой/верхней стене
    socks += [(6000,2000),(6000,4000),(4500,5000)]                     # B
    socks += [(3000,0),]                                               # в коридоре
    shield = (200, 700)
    polys = [R(corridor), R(roomA), R(roomB)]
    t0 = time.time()
    I.run('(setq P %s S %s H %s)' % ('(list ' + ' '.join(lp(p) for p in polys) + ')', lp(R(socks)), '(list %.3f %.3f)' % R([shield])[0]))
    I.run('(setq RES (gip:rt-build P S H))')
    n = int(lstr(I.run('(length RES)')))
    info = lstr(I.run('*gip:rt-info*'))
    dt = time.time() - t0
    res = I.run('RES')
    return n, info, dt, res, R(socks), o

for ang in (0.0, math.radians(10.0)):
    n, info, dt, res, socks, o = case(ang)
    print('angle %.1f: lines %d info %s (%.1fs)' % (math.degrees(ang), n, info, dt))
    assert n >= 4, n
    # все розетки — вершины каких-то линий
    def segd(s, a, b):
        dx, dy = b[0]-a[0], b[1]-a[1]; l2 = dx*dx + dy*dy
        u = 0 if l2 == 0 else max(0, min(1, ((s[0]-a[0])*dx + (s[1]-a[1])*dy) / l2))
        return math.hypot(s[0]-a[0]-u*dx, s[1]-a[1]-u*dy)
    segs = [(l[i], l[i+1]) for l in res for i in range(1, len(l)-1)]
    for s in socks:
        assert min(segd(s, a, b) for a, b in segs) < 1.0, ('розетка не подключена', s)
    # ортогональность в базисе плана и наличие магистрали
    widths = sorted(set(int(l[0]) for l in res))
    print('widths', widths)
    assert 40 in widths and 10 in widths, widths
    for l in res:
        for a, b in zip(l[1:], l[2:]):
            d = math.degrees(math.atan2(b[1]-a[1], b[0]-a[0])) - math.degrees(ang)
            assert abs((d + 45) % 90 - 45) < 0.5, ('не ортогонально', a, b, d)
    assert dt < 60
print('routes power: ALL OK')

# ---- драйвер на чертеже: контуры на слое GIP_ПОМ_КОНТУР, розетки на листе силовых, повторный запуск стирает прежние линии
I2, A2 = make()
I2.run('(gip:run (gip:default-state "k2"))')
F = I2.run('(cdr (assoc "F" (car (vl-remove-if-not (quote (lambda (s) (= (gip:g s "role") "plan_p"))) (gip:template-sheets)))))')
fx, fy = [float(v) for v in lstr(F).strip('()').split()[0:2]]
SW = float(lstr(I2.run('*gip:SW*'))); SHH = float(lstr(I2.run('*gip:SHH*')))
bx, by = fx - SW + 5000.0, fy + 3000.0
def make_poly(pts):
    I2.run('(entmake (append (list (quote (0 . "LWPOLYLINE")) (quote (100 . "AcDbEntity")) (cons 8 (gip:layer "GIP_ПОМ_КОНТУР")) (quote (100 . "AcDbPolyline")) (cons 90 %d) (quote (70 . 1))) (list %s)))'
           % (len(pts), ' '.join('(list 10 %.2f %.2f)' % (bx+p[0], by+p[1]) for p in pts)))
for pts in ([(0,0),(6000,0),(6000,1500),(0,1500)], [(0,1500),(3000,1500),(3000,5000),(0,5000)], [(3000,1500),(6000,1500),(6000,5000),(3000,5000)]):
    make_poly(pts)
for p in [(0,3000),(0,4500),(1500,5000),(3000,3500),(3000,4800),(6000,2000),(6000,4000),(4500,5000),(3000,0)]:
    I2.run('(vla-insertblock (gip:ms) (vlax-3d-point %.2f %.2f 0.0) "ЭОМ_Розетки_GIP" 1.0 1.0 1.0 0.0)' % (bx+p[0], by+p[1]))
def count_routes():
    return int(lstr(I2.run('(if (setq ss (ssget "_X" (list (cons 0 "LWPOLYLINE") (cons 8 *gip:rt-lay-p*)))) (sslength ss) 0)')))
n1 = int(lstr(I2.run('(gip:routes-power (car (vl-remove-if-not (quote (lambda (s) (= (gip:g s "role") "plan_p"))) (gip:template-sheets))) (list %.2f %.2f))' % (bx+200, by+700))))
assert n1 >= 4 and count_routes() == n1, (n1, count_routes())
n2 = int(lstr(I2.run('(gip:routes-power (car (vl-remove-if-not (quote (lambda (s) (= (gip:g s "role") "plan_p"))) (gip:template-sheets))) (list %.2f %.2f))' % (bx+200, by+700))))
assert n2 == n1 and count_routes() == n2, ('повторный запуск должен заменять линии', n1, n2, count_routes())
print('routes on drawing: ALL OK (%d lines)' % n1)
