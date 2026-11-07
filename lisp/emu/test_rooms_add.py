# -*- coding: utf-8 -*-
"""Помещения без PDF (GIPROOMADD): точка -> номер, название, высота -> блок номера и реестр; контур — готовая полилиния."""
import sys, os, tempfile
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.setrecursionlimit(100000)
from run import make
from lispemu import lstr
I, A = make()
tmp = tempfile.mkdtemp() + os.sep
A.vars['TEMPPREFIX'] = tmp
# контур 4 × 3 м
I.run('(setq PL (entmakex (list (quote (0 . "LWPOLYLINE")) (quote (100 . "AcDbEntity")) (quote (8 . "0")) (quote (100 . "AcDbPolyline")) (quote (90 . 4)) (quote (70 . 1)) (list 10 0.0 0.0) (list 10 4000.0 0.0) (list 10 4000.0 3000.0) (list 10 0.0 3000.0))))')
# ответы пользователя: комната 1 с готовым контуром, комната 2 без контура
I.run('''(setq *Q* (list (list 2000.0 1500.0 0.0) "Pick" (list 6000.0 1500.0 0.0) nil nil)
               *QI* (list nil 7) *QS* (list "Гостиная" "Спальня") *QR* (list nil 2800.0))''')
I.run('(defun getpoint (a / x) (setq x (car *Q*) *Q* (cdr *Q*)) x)')
I.run('(defun getint (a / x) (setq x (car *QI*) *QI* (cdr *QI*)) x)')
I.run('(defun getstring (f a / x) (setq x (car *QS*) *QS* (cdr *QS*)) x)')
I.run('(defun getreal (a / x) (setq x (car *QR*) *QR* (cdr *QR*)) x)')
I.run('(defun initget (a) nil)')
I.run('(defun entsel (a) (list PL (list 0.0 0.0 0.0)))')
I.run('(c:GIPROOMADD)')
print(open(tmp + 'gip_rooms_out.txt', encoding='utf-8').read())
rooms = lstr(I.run('(gip:room-list)'))
print(rooms)
r = I.run('(gip:room-list)')
assert len(r) == 2, rooms
assert int(r[0][0]) == 1 and abs(float(r[0][2]) - 12.0) < 0.01 and abs(float(r[0][4]) - 2700) < 1, rooms
assert int(r[1][0]) == 7 and float(r[1][2]) == 0.0 and abs(float(r[1][4]) - 2800) < 1, rooms
n = lstr(I.run('(length (gip:rm-num-refs))'))
assert n == '2', n
# контур на слое контуров, замкнут
ed = lstr(I.run('(list (cdr (assoc 8 (entget PL))) (cdr (assoc 70 (entget PL))))'))
assert 'GIP_' in ed and ed.endswith(' 1)'), ed
assert '"rooms"' in open(tmp + 'gip_rooms_reg.txt', encoding='utf-8').read()
print('rooms add: ALL OK')
