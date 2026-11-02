# -*- coding: utf-8 -*-
# подсчёт блоков на планах для спецификации (по атрибуту ИМЯ) и публикация названий помещений для панели
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.setrecursionlimit(20000)
from run import make
from lispemu import lstr
I, A = make()
I.run('(gip:run (gip:default-state "k2"))')
F = I.run('(cdr (assoc "F" (car (vl-remove-if-not (quote (lambda (s) (= (gip:g s "role") "plan_p"))) (gip:template-sheets)))))')
fx, fy = lstr(F).strip('()').split()[0:2]
I.run('(setq o (vla-insertblock (gip:ms) (vlax-3d-point (- %s 10000.0) (+ %s 5000.0) 0.0) "ЭОМ_Розетки_GIP" 1.0 1.0 1.0 0.0))' % (fx, fy))
I.run('(gip:set-atts o (list (cons "ИМЯ" "Розетка USB, IP20")))')
r = lstr(I.run('(gip:plan-counts (gip:template-sheets))'))
assert 'Розетка USB, IP20' in r and '. 1' in r, r
# выключатель на плане силовых не считается (его лист — освещение)
I.run('(setq o2 (vla-insertblock (gip:ms) (vlax-3d-point (- %s 9000.0) (+ %s 5000.0) 0.0) "ЭОМ_Выключатели_GIP" 1.0 1.0 1.0 0.0))' % (fx, fy))
I.run('(gip:set-atts o2 (list (cons "ИМЯ" "Выключатель 2 клавишный, 1п, 16А")))')
r = lstr(I.run('(gip:plan-counts (gip:template-sheets))'))
assert 'Выключатель' not in r, r
I.run('(gip:room-put (list (list 1 "Прихожая" 5.0 5.0 2700.0 13.5 0.0 0.0)))')
j = lstr(I.run('(gip:dict-get "GIPROOMSJSON")'))
assert 'u041F' in j.upper().replace('U041F', 'u041F') or 'u041f' in j, j
# листы спецификации: переполнение оборудования с планов остаётся на втором листе, третьего нет
def rows(n): return ' '.join('(list (cons "name" "r%d"))' % i for i in range(n))
def pages(n2):
    r = I.run('(length (gip:spec-pages (list (list "Щит" (list %s)) (list "Обор" (list %s)) (list "Мат" (list %s)) (list "Каб" (list %s)))))' % (rows(8), rows(n2), rows(6), rows(5)))
    return int(lstr(r))
assert pages(5) == 2, pages(5)
assert pages(25) == 2, pages(25)   # оборудование переполнило первый лист: хвост наверху второго, материалы ниже
I.run('(setq tr (gip:plan-counts (gip:template-sheets)))')
print('spec counts + rooms publish: ALL OK')
