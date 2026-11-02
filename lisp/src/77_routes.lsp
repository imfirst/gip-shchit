;;; ============================================================================
;;; Трассы на планах ЭОМ: автоматическая прорисовка кабельных линий от щита до розеток (силовые сети).
;;; Исходные данные: линии стен из подложки дизайнера (слои выбираются указанием на стену), блоки ЭОМ_Розетки_GIP, точка щита.
;;; Контуры помещений НЕ нужны: стены растеризуются в сетку, комнаты — области свободного места (двери — проёмы в стенах),
;;; цепочки розеток идут вдоль стен, магистраль — по центру проходов.
;;; Правила (по эталонным чертежам):
;;;   • всё ортогонально в системе координат стен (план может быть повёрнут);
;;;   • магистраль шириной 40 — участки, общие для двух и более помещений, ответвления и цепочки шириной 10;
;;;   • в помещение трасса входит к ближайшей розетке, дальше цепочка по стене к ближайшей и т.д.;
;;;   • линии красные, слой GIP_ТРАССЫ_СИЛ (перед перестроением стираются только они).
;;; Ядро (gip:rt-build) работает с отрезками и точками и ничего не знает о чертеже, поэтому проверяется в имитаторе.
;;; ============================================================================
(setq *gip:rt-lay-p* "GIP_ТРАССЫ_СИЛ" *gip:rt-step* 100.0 *gip:rt-touch* nil *gip:rt-td* nil *gip:rt-mode* 0 *gip:rt-dbg* nil
      *gip:rt-nx* 0 *gip:rt-ny* 0 *gip:rt-x0* 0.0 *gip:rt-y0* 0.0 *gip:rt-g* 100.0)

;; ---------------------------------------------------------------- «хеш» на символах (быстрый доступ по числовому ключу)
(defun gip:rt-sym (p k) (read (strcat p (itoa k))))
(defun gip:rt-g (p k) (eval (gip:rt-sym p k)))
(defun gip:rt-s (p k v / sm)
  (setq sm (gip:rt-sym p k))
  (if (null (eval sm)) (setq *gip:rt-touch* (cons sm *gip:rt-touch*)))
  (set sm v))
(defun gip:rt-sd (p k v / sm)
  (setq sm (gip:rt-sym p k))
  (if (null (eval sm)) (setq *gip:rt-td* (cons sm *gip:rt-td*)))
  (set sm v))
(defun gip:rt-free-d () (foreach sm *gip:rt-td* (set sm nil)) (setq *gip:rt-td* nil))
(defun gip:rt-free () (gip:rt-free-d) (foreach sm *gip:rt-touch* (set sm nil)) (setq *gip:rt-touch* nil))

;; ---------------------------------------------------------------- геометрия
;; преобладающий угол стен (по модулю 90°): гистограмма по длине отрезков, шаг 1°, пик со смежными ячейками
(defun gip:rt-angle (segs / k a l best bv v i s c d)
  (setq i 0)
  (while (< i 90) (gip:rt-s "GRT_A" i 0.0) (setq i (1+ i)))
  (foreach s segs
    (setq l (distance (list (car s) (cadr s)) (list (caddr s) (cadddr s))))
    (if (> l 50.0)
      (progn
        (setq a (angle (list (car s) (cadr s)) (list (caddr s) (cadddr s))) a (* (/ a (/ pi 2.0)) 90.0))
        (setq k (rem (fix (+ a 0.5)) 90))
        (gip:rt-s "GRT_A" k (+ l (gip:rt-g "GRT_A" k))))))
  (setq best 0 bv -1.0 i 0)
  (while (< i 90)
    (setq v (+ (gip:rt-g "GRT_A" i) (gip:rt-g "GRT_A" (rem (+ i 1) 90)) (gip:rt-g "GRT_A" (rem (+ i 89) 90))))
    (if (> v bv) (setq bv v best i))
    (setq i (1+ i)))
  ;; уточнение: средневзвешенный угол в пределах ±2° от пика
  (setq s 0.0 c 0.0 d -2)
  (while (<= d 2)
    (setq k (rem (+ best d 90) 90) v (gip:rt-g "GRT_A" k))
    (setq s (+ s (* v d)) c (+ c v) d (1+ d)))
  (* (/ pi 2.0) (/ (+ best (if (> c 0.0) (/ s c) 0.0)) 90.0)))
(defun gip:rt-to-loc (p o an)
  (list (+ (* (- (car p) (car o)) (cos an)) (* (- (cadr p) (cadr o)) (sin an)))
        (- (* (- (cadr p) (cadr o)) (cos an)) (* (- (car p) (car o)) (sin an)))))
(defun gip:rt-to-glob (p o an)
  (list (+ (car o) (- (* (car p) (cos an)) (* (cadr p) (sin an))))
        (+ (cadr o) (+ (* (car p) (sin an)) (* (cadr p) (cos an))))))
;; убрать повторы и промежуточные точки на прямой
(defun gip:rt-simplify (pts / r a b c)
  (setq r nil)
  (foreach p pts (if (or (null r) (> (distance p (car r)) 1.0)) (setq r (cons p r))))
  (setq r (reverse r) pts r r nil)
  (foreach p pts
    (setq r (cons p r))
    (while (and (>= (length r) 3)
                (progn (setq c (car r) b (cadr r) a (caddr r))
                       (and (< (abs (- (* (- (car b) (car a)) (- (cadr c) (cadr a))) (* (- (cadr b) (cadr a)) (- (car c) (car a)))))
                               (* 0.0001 (+ 1.0 (distance a c) (distance a b))))
                            (> (+ (* (- (car b) (car a)) (- (car c) (car b))) (* (- (cadr b) (cadr a)) (- (cadr c) (cadr b)))) 0.0))))
      (setq r (cons c (cddr r)))))
  (reverse r))
;; привязка конца линии к розетке: последний прямой участок сдвигается на линию розетки, затем добавляется сама точка
(defun gip:rt-snap-end (pts s / n a b ax)
  (setq pts (gip:rt-simplify pts) n (length pts))
  (if (< n 2)
    (gip:rt-simplify (list (car pts) (list (car s) (cadr (car pts))) s))
    (progn
      (setq a (nth (- n 2) pts) b (last pts))
      (setq ax (if (< (abs (- (car a) (car b))) (abs (- (cadr a) (cadr b)))) 0 1))   ; 0 — вертикальный участок (x постоянен)
      (if (= ax 0)
        (if (< (abs (- (car b) (car s))) 150.0)
          (setq pts (append (reverse (cddr (reverse pts))) (list (list (car s) (cadr a)) (list (car s) (cadr b)))))
          (setq pts (append pts (list (list (car s) (cadr b))))))
        (if (< (abs (- (cadr b) (cadr s))) 150.0)
          (setq pts (append (reverse (cddr (reverse pts))) (list (list (car a) (cadr s)) (list (car b) (cadr s)))))
          (setq pts (append pts (list (list (car b) (cadr s)))))))
      (gip:rt-simplify (append pts (list s))))))
;; гарантия прямых углов: наклонный участок заменяется ломаной из двух ортогональных (продолжая направление предыдущего)
(defun gip:rt-ortho (pts / r a prev vert)
  (setq r (list (car pts)) prev nil)
  (foreach b (cdr pts)
    (setq a (car r))
    (if (and (> (abs (- (car b) (car a))) 2.0) (> (abs (- (cadr b) (cadr a))) 2.0))
      (progn
        (setq vert (if (cdr r)
                     (< (abs (- (car a) (car (cadr r)))) 2.0)
                     (> (abs (- (cadr b) (cadr a))) (abs (- (car b) (car a))))))
        (setq r (cons (if vert (list (car a) (cadr b)) (list (car b) (cadr a))) r))))
    (setq r (cons b r)))
  (gip:rt-simplify (reverse r)))
(defun gip:rt-snap-start (pts s) (reverse (gip:rt-snap-end (reverse pts) s)))

;; ---------------------------------------------------------------- сетка: стены, расстояния до стен, помещения
(defun gip:rt-cx (ix) (+ *gip:rt-x0* (* (+ ix 0.5) *gip:rt-g*)))
(defun gip:rt-cy (iy) (+ *gip:rt-y0* (* (+ iy 0.5) *gip:rt-g*)))
(defun gip:rt-ci (ix iy) (+ (* ix *gip:rt-ny*) iy))
(defun gip:rt-cpt (ci) (list (gip:rt-cx (/ ci *gip:rt-ny*)) (gip:rt-cy (rem ci *gip:rt-ny*))))
(defun gip:rt-nbrs (ci / ix iy r)
  (setq ix (/ ci *gip:rt-ny*) iy (rem ci *gip:rt-ny*) r nil)
  (if (> ix 0) (setq r (cons (- ci *gip:rt-ny*) r)))
  (if (< ix (1- *gip:rt-nx*)) (setq r (cons (+ ci *gip:rt-ny*) r)))
  (if (> iy 0) (setq r (cons (1- ci) r)))
  (if (< iy (1- *gip:rt-ny*)) (setq r (cons (1+ ci) r)))
  r)
;; отметить клетки, через которые проходит отрезок стены; возвращает список новых клеток
(defun gip:rt-mark-seg (s / ax ay bx by l n i t1 ix iy ci r)
  (setq ax (car s) ay (cadr s) bx (caddr s) by (cadddr s) l (distance (list ax ay) (list bx by)) r nil)
  (setq n (max 1 (fix (/ l (/ *gip:rt-g* 3.0)))) i 0)
  (while (<= i n)
    (setq t1 (/ (float i) n) ix (fix (/ (- (+ ax (* t1 (- bx ax))) *gip:rt-x0*) *gip:rt-g*)) iy (fix (/ (- (+ ay (* t1 (- by ay))) *gip:rt-y0*) *gip:rt-g*)))
    (if (and (>= ix 0) (< ix *gip:rt-nx*) (>= iy 0) (< iy *gip:rt-ny*))
      (progn (setq ci (gip:rt-ci ix iy))
             (if (null (gip:rt-g "GRT_K" ci)) (progn (gip:rt-s "GRT_K" ci 1) (setq r (cons ci r))))))
    (setq i (1+ i)))
  r)
;; расстояние от стены в клетках (1…6): «GRT_Q»; дальше — отсутствует (больше 6)
(defun gip:rt-dist-field (walls / cur nxt lvl)
  (setq cur walls lvl 1)
  (while (and cur (<= lvl 6))
    (setq nxt nil)
    (foreach c cur
      (foreach nb (gip:rt-nbrs c)
        (if (and (null (gip:rt-g "GRT_K" nb)) (null (gip:rt-g "GRT_Q" nb)))
          (progn (gip:rt-s "GRT_Q" nb lvl) (setq nxt (cons nb nxt))))))
    (setq cur nxt lvl (1+ lvl))))
(defun gip:rt-core-p (ci) (and (null (gip:rt-g "GRT_K" ci)) (or (null (gip:rt-g "GRT_Q" ci)) (>= (gip:rt-g "GRT_Q" ci) 5))))
;; помещения: связные области «ядра» (далеко от стен, двери и узкие места разрывают область), остальное — по ближайшему ядру
(defun gip:rt-rooms (/ ix iy ci n stack cur seeds nxt c nb)
  (setq n 0 seeds nil ix 0)
  (while (< ix *gip:rt-nx*)
    (setq iy 0)
    (while (< iy *gip:rt-ny*)
      (setq ci (gip:rt-ci ix iy))
      (if (and (gip:rt-core-p ci) (null (gip:rt-g "GRT_R" ci)))
        (progn
          (setq n (1+ n) stack (list ci))
          (gip:rt-s "GRT_R" ci n)
          (while stack
            (setq cur (car stack) stack (cdr stack) seeds (cons cur seeds))
            (foreach nb (gip:rt-nbrs cur)
              (if (and (gip:rt-core-p nb) (null (gip:rt-g "GRT_R" nb)))
                (progn (gip:rt-s "GRT_R" nb n) (setq stack (cons nb stack))))))))
      (setq iy (1+ iy)))
    (setq ix (1+ ix)))
  ;; рост областей на остальные свободные клетки
  (setq cur seeds)
  (while cur
    (setq nxt nil)
    (foreach c cur
      (foreach nb (gip:rt-nbrs c)
        (if (and (null (gip:rt-g "GRT_K" nb)) (null (gip:rt-g "GRT_R" nb)))
          (progn (gip:rt-s "GRT_R" nb (gip:rt-g "GRT_R" c)) (setq nxt (cons nb nxt))))))
    (setq cur nxt))
  n)
;; ближайшая свободная клетка к точке (в окрестности 9x9)
(defun gip:rt-goal-cell (p / ix iy dx dy ci best bd d)
  (setq best nil bd 1.0e99 ix (fix (/ (- (car p) *gip:rt-x0*) *gip:rt-g*)) iy (fix (/ (- (cadr p) *gip:rt-y0*) *gip:rt-g*)) dx -4)
  (while (<= dx 4)
    (setq dy -4)
    (while (<= dy 4)
      (if (and (>= (+ ix dx) 0) (< (+ ix dx) *gip:rt-nx*) (>= (+ iy dy) 0) (< (+ iy dy) *gip:rt-ny*))
        (progn
          (setq ci (gip:rt-ci (+ ix dx) (+ iy dy)))
          (if (gip:rt-g "GRT_R" ci)
            (progn (setq d (distance p (gip:rt-cpt ci)))
                   (if (< d bd) (setq bd d best ci))))))
      (setq dy (1+ dy)))
    (setq dx (1+ dx)))
  best)

;; клетка щита: щит стоит на торце стены, поэтому среди соседних свободных клеток берётся из помещения с наибольшим числом розеток
(defun gip:rt-shield-cell (todo / ix iy dx dy ci best bs bd d n tr)
  (setq best nil bs -1 bd 1.0e99 ix (fix (/ (- 0.0 *gip:rt-x0*) *gip:rt-g*)) iy (fix (/ (- 0.0 *gip:rt-y0*) *gip:rt-g*)) dx -4)
  (while (<= dx 4)
    (setq dy -4)
    (while (<= dy 4)
      (if (and (>= (+ ix dx) 0) (< (+ ix dx) *gip:rt-nx*) (>= (+ iy dy) 0) (< (+ iy dy) *gip:rt-ny*))
        (progn
          (setq ci (gip:rt-ci (+ ix dx) (+ iy dy)))
          (if (gip:rt-g "GRT_R" ci)
            (progn
              (setq d (distance '(0.0 0.0) (gip:rt-cpt ci)) tr (assoc (gip:rt-g "GRT_R" ci) todo) n (if tr (length (cdr tr)) 0))
              (if (or (> n bs) (and (= n bs) (< d bd))) (setq bs n bd d best ci))))))
      (setq dy (1+ dy)))
    (setq dx (1+ dx)))
  best)

;; ---------------------------------------------------------------- поиск пути
;; Дейкстра с поправкой на повороты и переходы между помещениями; состояние = клетка*4 + направление.
;; Режим 0 (магистраль): прижиматься к стенам дороже; режим 1 (цепочка розеток): держаться стены.
;; Возвращает состояние-цель (клетка из GRT_T) или nil; предки хранятся в GRT_P.
(defun gip:rt-dij (srcs / c pend d s ci nd nix niy nci ri add nc old items hit r0 ds ix iy q wl)
  (gip:rt-free-d)
  (setq pend 0)
  (foreach cl srcs
    (setq d 0)
    (while (< d 4)
      (setq s (+ (* cl 4) d))
      (gip:rt-sd "GRT_D" s 0) (gip:rt-sd "GRT_P" s -1)
      (gip:rt-sd "GRT_B" 0 (cons s (gip:rt-g "GRT_B" 0)))
      (setq pend (1+ pend) d (1+ d))))
  (setq c 0 hit nil)
  (while (and (> pend 0) (null hit))
    (setq items (gip:rt-g "GRT_B" c))
    (set (gip:rt-sym "GRT_B" c) nil)
    (foreach s items
      (setq pend (1- pend))
      (if (and (null hit) (= (gip:rt-g "GRT_D" s) c))
        (progn
          (setq ci (/ s 4) d (rem s 4))
          (if (gip:rt-g "GRT_T" ci)
            (setq hit s)
            (progn
              (setq ix (/ ci *gip:rt-ny*) iy (rem ci *gip:rt-ny*) r0 (if (gip:rt-g "GRT_R" ci) (gip:rt-g "GRT_R" ci) 0) nd 0)
              (while (< nd 4)
                (if (/= nd (rem (+ d 2) 4))
                  (progn
                    (setq nix (+ ix (cond ((= nd 0) 1) ((= nd 2) -1) (T 0)))
                          niy (+ iy (cond ((= nd 1) 1) ((= nd 3) -1) (T 0))))
                    (if (and (>= nix 0) (< nix *gip:rt-nx*) (>= niy 0) (< niy *gip:rt-ny*))
                      (progn
                        (setq nci (gip:rt-ci nix niy) ri (gip:rt-g "GRT_R" nci) wl (gip:rt-g "GRT_K" nci))
                        (if (or ri wl)
                          (progn
                            (setq q (gip:rt-g "GRT_Q" nci))
                            (setq add (+ 10 (if (/= nd d) 25 0) (if wl 400 (if (/= ri r0) 250 0))
                                         (if (gip:rt-g "GRT_T" nci) 0
                                           (if (= *gip:rt-mode* 0)
                                             (if (and q (<= q 2)) 8 (if (and q (= q 3)) 4 0))
                                             (if (and q (<= q 2)) 0 6))))
                                  nc (+ c add) ds (+ (* nci 4) nd) old (gip:rt-g "GRT_D" ds))
                            (if (or (null old) (< nc old))
                              (progn
                                (gip:rt-sd "GRT_D" ds nc) (gip:rt-sd "GRT_P" ds s)
                                (gip:rt-sd "GRT_B" nc (cons ds (gip:rt-g "GRT_B" nc)))
                                (setq pend (1+ pend))))))))))
                (setq nd (1+ nd))))))))
    (setq c (1+ c)))
  hit)
(defun gip:rt-path-cells (s / r)
  (setq r nil)
  (while (and s (>= s 0))
    (setq r (cons (/ s 4) r) s (gip:rt-g "GRT_P" s)))
  r)

;; ---------------------------------------------------------------- линии
;; Цепочка розеток помещения: от розетки entry к ближайшей по пути вдоль стен и т.д. rem — розетки (точка . клетка) без entry
(defun gip:rt-chain (entry rm1 / res cur hit cells tc nxt pts)
  (setq res (list (car entry)) cur entry *gip:rt-mode* 1)
  (while rm1
    ;; ближайшая розетка совсем рядом (в пределах 4 клеток): прямое ортогональное соединение
    (setq nxt nil)
    (foreach r rm1 (if (and (< (distance (car r) (car cur)) (* 4.0 *gip:rt-g*)) (or (null nxt) (< (distance (car r) (car cur)) (distance (car nxt) (car cur))))) (setq nxt r)))
    (if nxt
      (progn
        (setq pts (if (< (abs (- (car (car nxt)) (car (car cur)))) (abs (- (cadr (car nxt)) (cadr (car cur)))))
                    (list (list (car (car cur)) (cadr (car nxt))) (car nxt))
                    (list (list (car (car nxt)) (cadr (car cur))) (car nxt))))
        (setq res (append res pts) cur nxt rm1 (vl-remove nxt rm1))))
    (if (null nxt) (progn
    (foreach r rm1 (gip:rt-s "GRT_T" (cdr r) 1))
    (setq hit (gip:rt-dij (list (cdr cur))))
    (foreach r rm1 (set (gip:rt-sym "GRT_T" (cdr r)) nil))
    (if (null hit)
      (setq rm1 nil)
      (progn
        (setq cells (gip:rt-path-cells hit) tc (last cells))
        (setq nxt (vl-remove-if-not '(lambda (r) (= (cdr r) tc)) rm1))
        (setq pts (mapcar 'gip:rt-cpt cells))
        (setq pts (gip:rt-snap-start pts (car cur)))
        (setq pts (gip:rt-snap-end pts (car (car nxt))))
        (setq res (append res (cdr pts)))
        (foreach r (cdr nxt) (setq res (append res (list (car r)))))
        (setq cur (last nxt))
        (setq rm1 (vl-remove-if '(lambda (r) (= (cdr r) tc)) rm1)))))))
  (setq *gip:rt-mode* 0)
  (gip:rt-ortho res))
;; Полилинии одного подключения: путь клеток (от сети до розетки) режется на участки по нагрузке (магистраль 40 / ответвление 10)
(defun gip:rt-seg-lines (cells startp sockp / i wid u run runs res pts n)
  (setq i 1 run (list (car cells)) wid nil runs nil)
  (while (< i (length cells))
    (setq u (if (>= (gip:rt-g "GRT_U" (nth i cells)) 2) 40 10))
    (if (and wid (/= u wid))
      (progn (setq runs (cons (cons wid (reverse run)) runs) run (list (nth (1- i) cells)))))
    (setq wid u run (cons (nth i cells) run) i (1+ i)))
  (if (null wid) (setq wid 10))
  (setq runs (reverse (cons (cons wid (reverse run)) runs)) res nil n (length runs) i 0)
  (foreach rn runs
    (setq pts (mapcar 'gip:rt-cpt (cdr rn)))
    (if (and (= i 0) startp) (setq pts (gip:rt-snap-start pts startp)))
    (if (= i (1- n)) (setq pts (gip:rt-snap-end pts sockp)) (setq pts (gip:rt-simplify pts)))
    (if (> (length pts) 1) (setq res (cons (cons (car rn) (gip:rt-ortho pts)) res)))
    (setq i (1+ i)))
  (reverse res))

;; ---------------------------------------------------------------- ядро: силовые сети
;; segs — отрезки стен ((x1 y1 x2 y2) …), socks — розетки (x y), shield — щит; всё в координатах чертежа.
;; Результат: список (ширина . точки) в координатах чертежа; *gip:rt-info* = (помещений-подключено розеток-не-достигнуто комнат-всего)
(defun gip:rt-build (segs socks shield / an ls lsg xmin ymin xmax ymax g nx ny ix iy walls todo t1 srcs cells hit tc sg segs2 cl res nR
                     sh0 lost k i rooms entry ent rm1 sp p gcl rid)
  (setq *gip:rt-info* nil an (gip:rt-angle segs))
  (setq lsg (mapcar '(lambda (s) (append (gip:rt-to-loc (list (car s) (cadr s)) shield an) (gip:rt-to-loc (list (caddr s) (cadddr s)) shield an))) segs)
        ls (mapcar '(lambda (p) (gip:rt-to-loc p shield an)) socks))
  (setq xmin 0.0 ymin 0.0 xmax 0.0 ymax 0.0)
  (foreach s lsg
    (setq xmin (min xmin (car s) (caddr s)) ymin (min ymin (cadr s) (cadddr s)) xmax (max xmax (car s) (caddr s)) ymax (max ymax (cadr s) (cadddr s))))
  (setq g *gip:rt-step*)
  (while (> (* (+ 5 (fix (/ (- xmax xmin) g))) (+ 5 (fix (/ (- ymax ymin) g)))) 16000) (setq g (+ g 25.0)))
  (setq nx (+ 5 (fix (/ (- xmax xmin) g))) ny (+ 5 (fix (/ (- ymax ymin) g)))
        *gip:rt-g* g *gip:rt-x0* (- xmin (* 2 g)) *gip:rt-y0* (- ymin (* 2 g)) *gip:rt-nx* nx *gip:rt-ny* ny *gip:rt-mode* 0)
  (setq walls nil)
  (foreach s lsg (setq walls (append (gip:rt-mark-seg s) walls)))
  (gip:rt-dist-field walls)
  (setq rooms (gip:rt-rooms))
  ;; розетки: (точка . клетка), по помещениям
  (setq todo nil lost 0)
  (foreach p ls
    (setq gcl (gip:rt-goal-cell p))
    (if gcl
      (progn (setq rid (gip:rt-g "GRT_R" gcl) t1 (assoc rid todo))
             (if t1 (setq todo (subst (append t1 (list (cons p gcl))) t1 todo))
                    (setq todo (append todo (list (list rid (cons p gcl)))))))
      (setq lost (1+ lost))))
  (setq sh0 (gip:rt-shield-cell todo) segs2 nil res nil)
  (if (and sh0 todo)
    (progn
      (setq srcs (list sh0))
      (gip:rt-s "GRT_N" sh0 1)
      (foreach tr todo (foreach r (cdr tr) (gip:rt-s "GRT_T" (cdr r) 1)))
      (setq nR (length todo))
      (while (and (> nR 0) (setq hit (gip:rt-dij srcs)))
        (setq cells (gip:rt-path-cells hit) tc (last cells))
        ;; помещение найденной цели: все его цели убрать, остальное — в цепочку
        (setq t1 (vl-some '(lambda (tr) (if (vl-some '(lambda (r) (= (cdr r) tc)) (cdr tr)) tr)) todo))
        (foreach r (cdr t1) (set (gip:rt-sym "GRT_T" (cdr r)) nil))
        (setq i 1)
        (while (< i (length cells))
          (if (null (gip:rt-g "GRT_N" (nth i cells)))
            (progn (gip:rt-s "GRT_N" (nth i cells) 1) (gip:rt-s "GRT_PAR" (nth i cells) (nth (1- i) cells))
                   (setq srcs (cons (nth i cells) srcs))))
          (setq i (1+ i)))
        (setq entry (vl-some '(lambda (r) (if (= (cdr r) tc) r)) (cdr t1)))
        (setq segs2 (append segs2 (list (list (car t1) entry cells))) nR (1- nR))
        (gip:rt-free-d))
      (setq lost (+ lost (apply '+ (mapcar '(lambda (tr) (length (cdr tr))) (vl-remove-if '(lambda (tr) (assoc (car tr) segs2)) todo)))))
      (foreach sg segs2
        (setq cl (last (nth 2 sg)))
        (while cl
          (gip:rt-s "GRT_U" cl (1+ (if (gip:rt-g "GRT_U" cl) (gip:rt-g "GRT_U" cl) 0)))
          (setq cl (gip:rt-g "GRT_PAR" cl))))
      (foreach sg segs2
        (setq entry (nth 1 sg) rm1 (vl-remove entry (cdr (assoc (car sg) todo))))
        (setq res (append res (gip:rt-seg-lines (nth 2 sg) (if (= (car (nth 2 sg)) sh0) '(0.0 0.0)) (car entry))))
        (if rm1
          (setq res (append res (list (cons 10 (gip:rt-chain entry rm1))))))))
    (setq lost (+ lost (apply '+ (mapcar '(lambda (tr) (length (cdr tr))) todo)))))
  (if (not *gip:rt-dbg*) (gip:rt-free))
  (setq *gip:rt-info* (list (length segs2) lost rooms))
  (mapcar '(lambda (l) (cons (car l) (mapcar '(lambda (p) (gip:rt-to-glob p shield an)) (cdr l)))) res))

;; ---------------------------------------------------------------- чертёж: сбор данных, рисование
(defun gip:rt-box (sh) (list (- (car (gip:g sh "F")) *gip:SW*) (cadr (gip:g sh "F")) (car (gip:g sh "F")) (+ (cadr (gip:g sh "F")) *gip:SHH*)))
(defun gip:rt-in (p b) (and (< (car b) (car p) (caddr b)) (< (cadr b) (cadr p) (cadddr b))))
;; точки вставки блоков заданного имени внутри рамки листа
(defun gip:rt-blocks (box blk / ss i e r nm ip)
  (setq r nil)
  (if (setq ss (ssget "_X" '((0 . "INSERT"))))
    (progn
      (setq i 0)
      (while (< i (sslength ss))
        (setq e (ssname ss i) i (1+ i) ip (cdr (assoc 10 (entget e))))
        (if (and (not (assoc -3 (entget e (list *gip:app*)))) (gip:rt-in ip box))
          (progn
            (setq nm (vl-catch-all-apply 'vlax-get (list (vlax-ename->vla-object e) 'EffectiveName)))
            (if (and (= (type nm) 'STR) (= nm blk)) (setq r (cons (list (car ip) (cadr ip)) r))))))))
  (reverse r))
;; отрезки стен одного объекта чертежа: полилиния / отрезок (координаты в системе мира уже преобразованы вызывающим)
(defun gip:rt-xf (p xf)
  (list (+ (car xf) (- (* (caddr xf) (cadddr xf) (car p)) (* (caddr xf) (nth 4 xf) (cadr p))))
        (+ (cadr xf) (+ (* (caddr xf) (nth 4 xf) (car p)) (* (caddr xf) (cadddr xf) (cadr p))))))
(defun gip:rt-ent-segs (ed xf / ty pts r cl)
  (setq ty (cdr (assoc 0 ed)) r nil)
  (cond
    ((= ty "LINE") (setq r (list (append (gip:rt-xf (cdr (assoc 10 ed)) xf) (gip:rt-xf (cdr (assoc 11 ed)) xf)))))
    ((= ty "LWPOLYLINE")
     (setq pts nil cl (= (logand (cdr (assoc 70 ed)) 1) 1))
     (foreach p ed (if (= (car p) 10) (setq pts (cons (gip:rt-xf (cdr p) xf) pts))))
     (setq pts (reverse pts))
     (if (and cl pts) (setq pts (append pts (list (car pts)))))
     (while (cdr pts) (setq r (cons (append (car pts) (cadr pts)) r) pts (cdr pts)))))
  r)
;; стены в рамке листа: объекты заданных слоёв, в том числе внутри блоков подложки (с преобразованием вставки)
(defun gip:rt-wall-segs (box layers / ss i e ed ip sx rot nm be r f xf ty)
  (setq r nil)
  (foreach ty '("INSERT" "LINE" "LWPOLYLINE")
    (if (setq ss (ssget "_X" (list (cons 0 ty))))
      (progn
        (setq i 0)
        (while (< i (sslength ss))
          (setq e (ssname ss i) i (1+ i) ed (entget e))
          (cond
            ((= ty "INSERT")
             (setq ip (cdr (assoc 10 ed)))
             (if (and (gip:rt-in ip box) (not (assoc -3 (entget e (list *gip:app*)))))
               (progn
                 (setq nm (cdr (assoc 2 ed)) sx (if (assoc 41 ed) (cdr (assoc 41 ed)) 1.0) rot (if (assoc 50 ed) (cdr (assoc 50 ed)) 0.0))
                 (setq xf (list (car ip) (cadr ip) sx (cos rot) (sin rot)))
                 (if (setq be (cdr (assoc -2 (tblsearch "BLOCK" nm))))
                   (while be
                     (setq f (entget be))
                     (if (member (cdr (assoc 8 f)) layers) (setq r (append (gip:rt-ent-segs f xf) r)))
                     (setq be (entnext be)))))))
            ((and (member (cdr (assoc 8 ed)) layers) (gip:rt-in (cdr (assoc 10 ed)) box))
             (setq r (append (gip:rt-ent-segs ed (list 0.0 0.0 1.0 1.0 0.0)) r))))))))
  r)
(defun gip:rt-erase (box lay / ss i e)
  (if (setq ss (ssget "_X" (list '(0 . "LWPOLYLINE") (cons 8 lay))))
    (progn
      (setq i 0)
      (while (< i (sslength ss))
        (setq e (ssname ss i) i (1+ i))
        (if (gip:rt-in (cdr (assoc 10 (entget e))) box) (entdel e))))))
(defun gip:rt-draw (res lay col / n)
  (gip:layer lay)
  (setq n 0)
  (foreach l res
    (entmake (append (list '(0 . "LWPOLYLINE") '(100 . "AcDbEntity") (cons 8 lay) (cons 62 col) '(100 . "AcDbPolyline")
                           (cons 90 (length (cdr l))) '(70 . 0) (cons 43 (float (car l))))
                     (mapcar '(lambda (p) (list 10 (car p) (cadr p))) (cdr l))))
    (setq n (1+ n)))
  n)
;; слои стен, запомненные в чертеже
(defun gip:rt-wall-layers (/ s) (if (setq s (gip:dict-get "GIPRTWALL")) (read s)))
(defun gip:rt-wall-layers-put (l) (gip:dict-put "GIPRTWALL" (vl-prin1-to-string l)))
;; силовые: розетки листа -> трассы от щита (точка shield в координатах чертежа)
(defun gip:routes-power (sh shield layers / box segs socks res n)
  (setq box (gip:rt-box sh) segs (gip:rt-wall-segs box layers) socks (gip:rt-blocks box "ЭОМ_Розетки_GIP"))
  (cond
    ((null segs) (princ "\nГИП: на листе не найдены линии стен выбранных слоёв. Трассы не построены.") nil)
    ((null socks) (princ "\nГИП: на листе нет розеток ЭОМ_Розетки_GIP.") nil)
    (T
     (gip:rt-erase box *gip:rt-lay-p*)
     (setq res (gip:rt-build segs socks shield))
     (setq n (gip:rt-draw res *gip:rt-lay-p* 1))
     (princ (strcat "\nГИП: силовые трассы: линий " (itoa n) ", помещений подключено " (itoa (car *gip:rt-info*))
                    (if (> (cadr *gip:rt-info*) 0) (strcat ", НЕ достигнуто розеток: " (itoa (cadr *gip:rt-info*))) "") "."))
     n)))
(defun c:GIPTRASSY (/ p sh layers q lay)
  (setq p (getpoint "\nУкажите положение электрощита на плане: "))
  (if p
    (progn
      (setq sh (vl-some '(lambda (s) (if (and (gip:starts (gip:g s "role") "plan_") (gip:rt-in p (gip:rt-box s))) s)) (gip:template-sheets)))
      (cond
        ((null sh) (princ "\nГИП: точка вне листа плана."))
        ((/= (gip:g sh "role") "plan_p") (princ "\nГИП: для этого листа трассы пока не поддерживаются."))
        (T
         ;; слои стен: указывайте линии стен подложки (можно несколько), Enter — готово; без указаний — слои прошлого раза
         (setq layers nil)
         (while (setq q (nentsel (if layers "\nУкажите ещё стену другого слоя или Enter: " "\nУкажите линию стены подложки (Enter — слои прошлого раза): ")))
           (setq lay (cdr (assoc 8 (entget (car q)))))
           (if (and lay (not (member lay layers))) (setq layers (cons lay layers))))
         (if layers (gip:rt-wall-layers-put layers) (setq layers (gip:rt-wall-layers)))
         (if layers
           (gip:routes-power sh (list (car p) (cadr p)) layers)
           (princ "\nГИП: слои стен не заданы."))))))
  (princ))
