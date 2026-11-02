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
# длины кабелей: приборы с планов удлиняют линии, по потолку длиннее, чем по полу
def sock_len(route):
    I.run('(setq S1 (gip:s (gip:default-state "k2") "route" "%s"))' % route)
    I.run('(setq BR (gip:board S1))')
    return float(lstr(I.run('(apply (quote +) (mapcar (quote (lambda (l) (if (= (gip:g l "cat") "sock") (gip:g l "len") 0))) (gip:g BR "lines")))')))
base = sock_len('Потолок')
for i in range(6):
    I.run('(setq oo (vla-insertblock (gip:ms) (vlax-3d-point (- %s %d.0) (+ %s 6000.0) 0.0) "ЭОМ_Розетки_GIP" 1.0 1.0 1.0 0.0))' % (fx, 3000 + 500 * i, fy))
    I.run('(gip:set-atts oo (list (cons "ИМЯ" "Розетка USB, IP20")))')
ceil_ = sock_len('Потолок'); floor_ = sock_len('Пол, потолок')
assert ceil_ > floor_ > base, (base, ceil_, floor_)
print('cable lengths', base, ceil_, floor_)
# полная сборка с блоками на планах (вывод, терморегулятор, лючок, светильники, выключатель) проходит без ошибок
for blk, nm in [("ЭОМ_Розетки_GIP", "Вывод 380/220В"), ("ЭОМ_Розетки_GIP", "Терморегулятор ТП"), ("ЭОМ_Розетки_GIP", "Лючок внутрипольный розеточный 1 роз., 16A, L+N+PE, IP44")]:
    I.run('(setq oo (vla-insertblock (gip:ms) (vlax-3d-point (- %s 12000.0) (+ %s 7000.0) 0.0) "%s" 1.0 1.0 1.0 0.0))' % (fx, fy, blk))
    I.run('(gip:set-atts oo (list (cons "ИМЯ" "%s")))' % nm)
I.out.clear() if hasattr(I.out, 'clear') else None
I.run('(gip:run (gip:default-state "k2"))')
msg = [l for l in ''.join(I.out).split('\n') if 'GIP' in l][-1]
assert 'ошибка' not in msg and 'построен' in msg, msg
print('full build with plan blocks OK')
