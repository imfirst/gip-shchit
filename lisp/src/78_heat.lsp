;;; ============================================================================
;;; ОТОПЛЕНИЕ (GIPHEAT): лучевая коллекторная система квартиры — окна, радиаторы, трассы Т1/Т2 от ШРВ,
;;; подписи, аксонометрическая схема, узлы подключения, спецификация.
;;; Оформление — как в ручных проектах ГИП (Ильменский 859):
;;;   • слой A_T1; Т1 — цвет слоя (красный), Т2 — синий (5); полилинии постоянной ширины 15;
;;;   • пара Т1/Т2 через 50 мм, пары через 100 мм; Т1 справа по ходу от коллектора;
;;;   • радиатор на плане — замкнутая полилиния ширины 20, глубина 100, на внутренней грани стены под окном;
;;;   • ШРВ — прямоугольник 150 × (100·N+112), выходы на грани со стороны помещения с шагом 50 (Т1, Т2, Т1 …);
;;;   • мультивыноски высотой 150: «Rifar Tubog Ventil\PTUB 2052x22 DV1\P(h=515мм) 1055 Вт», «Т1\P%%C16», «ШРВ\Pотопления».
;;; Ядро трассировки (gip:ht-route) работает только с отрезками и точками — проверяется в имитаторе.
;;; Всё созданное помечено xdata GIPHEAT (вид объекта), перестроение стирает только своё.
;;; ============================================================================
(setq *gip:ht-app* "GIPHEAT" *gip:ht-lay* "A_T1" *gip:ht-pitch* 100.0 *gip:ht-pair* 25.0 *gip:ht-info* nil
      *gip:ht-sys* nil *gip:ht-qfn* nil *gip:ht-row0* nil *gip:ht-in* "gip_heat_in.txt" *gip:ht-out* "gip_heat_out.txt" *gip:ht-regf* "gip_heat_reg.txt")

;; ---------------------------------------------------------------- метки
(defun gip:ht-tag (kind) (list (list -3 (list *gip:ht-app* (cons 1000 kind)))))
(defun gip:ht-kind (e / x)
  (setq x (cdr (assoc -3 (entget e (list *gip:ht-app*)))))
  (if x (cdr (assoc 1000 (cdar x)))))
(defun gip:ht-mk (data kind / e)
  (regapp *gip:ht-app*)
  (setq e (entmakex (append data (gip:ht-tag kind))))
  e)
(defun gip:ht-tag-obj (obj kind / e)
  (regapp *gip:ht-app*)
  (setq e (vlax-vla-object->ename obj))
  (entmod (append (entget e) (gip:ht-tag kind)))
  e)
;; стереть свои объекты указанных видов (kinds — список строк) в рамке box (nil — везде)
(defun gip:ht-erase (box kinds / ss i e k n p)
  (setq n 0)
  (if (setq ss (ssget "_X" (list (list -3 (list *gip:ht-app*)))))
    (progn
      (setq i 0)
      (while (< i (sslength ss))
        (setq e (ssname ss i) i (1+ i) k (gip:ht-kind e) p (cdr (assoc 10 (entget e))))
        (if (and (member k kinds) (or (null box) (null p) (gip:rt-in p box)))
          (progn (entdel e) (setq n (1+ n)))))))
  n)

;; ---------------------------------------------------------------- векторная мелочь
(defun gip:ht-add (a b) (list (+ (car a) (car b)) (+ (cadr a) (cadr b))))
(defun gip:ht-sub (a b) (list (- (car a) (car b)) (- (cadr a) (cadr b))))
(defun gip:ht-mul (a k) (list (* (car a) k) (* (cadr a) k)))
(defun gip:ht-dot (a b) (+ (* (car a) (car b)) (* (cadr a) (cadr b))))
(defun gip:ht-len (a) (sqrt (gip:ht-dot a a)))
(defun gip:ht-unit (a / l) (setq l (gip:ht-len a)) (if (> l 1e-9) (gip:ht-mul a (/ 1.0 l)) (list 1.0 0.0)))
(defun gip:ht-left (a) (list (- (cadr a)) (car a)))
(defun gip:ht-p2 (p) (list (car p) (cadr p)))
(defun gip:ht-plen (pts / s) (setq s 0.0) (while (cdr pts) (setq s (+ s (distance (car pts) (cadr pts))) pts (cdr pts))) s)
;; направление клетки: 0 +x, 1 +y, 2 -x, 3 -y
(defun gip:ht-dvec (d) (nth d '((1.0 0.0) (0.0 1.0) (-1.0 0.0) (0.0 -1.0))))
(defun gip:ht-dir (a b / dx dy)
  (setq dx (- (car b) (car a)) dy (- (cadr b) (cadr a)))
  (if (> (abs dx) (abs dy)) (if (> dx 0) 0 2) (if (> dy 0) 1 3)))
(defun gip:ht-r10 (x) (/ (fix (+ (* x 10.0) (if (minusp x) -0.5 0.5))) 10.0))

;; ---------------------------------------------------------------- сетка (как в трассах ЭОМ)
;; segs — стены в координатах чертежа; org — начало местной системы; возвращает угол стен; заполняет GRT_K/GRT_Q/GRT_R
(defun gip:ht-grid (segs org pts / an lsg xmin ymin xmax ymax g nx ny walls)
  (setq an (gip:rt-angle segs))
  (setq lsg (mapcar '(lambda (s) (append (gip:rt-to-loc (list (car s) (cadr s)) org an) (gip:rt-to-loc (list (caddr s) (cadddr s)) org an))) segs))
  (setq xmin 0.0 ymin 0.0 xmax 0.0 ymax 0.0)
  (foreach s lsg
    (setq xmin (min xmin (car s) (caddr s)) ymin (min ymin (cadr s) (cadddr s)) xmax (max xmax (car s) (caddr s)) ymax (max ymax (cadr s) (cadddr s))))
  (foreach p pts (setq p (gip:rt-to-loc p org an) xmin (min xmin (car p)) ymin (min ymin (cadr p)) xmax (max xmax (car p)) ymax (max ymax (cadr p))))
  (setq g *gip:rt-step*)
  (while (> (* (+ 7 (fix (/ (- xmax xmin) g))) (+ 7 (fix (/ (- ymax ymin) g)))) 16000) (setq g (+ g 25.0)))
  (setq nx (+ 7 (fix (/ (- xmax xmin) g))) ny (+ 7 (fix (/ (- ymax ymin) g)))
        *gip:rt-g* g *gip:rt-x0* (- xmin (* 3 g)) *gip:rt-y0* (- ymin (* 3 g)) *gip:rt-nx* nx *gip:rt-ny* ny *gip:rt-mode* 0)
  (setq walls nil)
  (foreach s lsg (setq walls (append (gip:rt-mark-seg s) walls)))
  (gip:rt-dist-field walls)
  (setq *gip:ht-nrooms* (gip:rt-rooms) *gip:ht-lsg* lsg)
  an)
;; помещения сетки, касающиеся края — «улица»
(defun gip:ht-outside-regions (/ r ix iy ci v)
  (setq r nil ix 0)
  (while (< ix *gip:rt-nx*)
    (foreach iy (list 0 (1- *gip:rt-ny*))
      (setq ci (gip:rt-ci ix iy) v (gip:rt-g "GRT_R" ci))
      (if (and v (not (member v r))) (setq r (cons v r))))
    (setq ix (1+ ix)))
  (setq iy 0)
  (while (< iy *gip:rt-ny*)
    (foreach ix (list 0 (1- *gip:rt-nx*))
      (setq ci (gip:rt-ci ix iy) v (gip:rt-g "GRT_R" ci))
      (if (and v (not (member v r))) (setq r (cons v r))))
    (setq iy (1+ iy)))
  r)
;; помещение сетки в местной точке (nil — стена/вне)
(defun gip:ht-region (p / c) (if (setq c (gip:rt-goal-cell p)) (gip:rt-g "GRT_R" c)))

;; ---------------------------------------------------------------- окна
;; Окно в подложке — три и больше параллельных линий одной длины поперёк толщины стены (рама, стекло, подоконник).
;; Ищется в местной системе стен; сторона помещения — та, что не «улица». Результат в местной системе:
;; (lo hi c ax side) — ax 0: окно вдоль x на высоте c (грань со стороны помещения), side +1/-1 — помещение со стороны +y/-y.
(defun gip:ht-win-items (lsg / hs vs l dx dy)
  (setq hs nil vs nil)
  (foreach s lsg
    (setq dx (abs (- (caddr s) (car s))) dy (abs (- (cadddr s) (cadr s))) l (sqrt (+ (* dx dx) (* dy dy))))
    (if (and (>= l 450.0) (<= l 4800.0))
      (cond ((< dy (* 0.02 l)) (setq hs (cons (list (/ (+ (cadr s) (cadddr s)) 2.0) (min (car s) (caddr s)) (max (car s) (caddr s))) hs)))
            ((< dx (* 0.02 l)) (setq vs (cons (list (/ (+ (car s) (caddr s)) 2.0) (min (cadr s) (cadddr s)) (max (cadr s) (cadddr s))) vs))))))
  (list (vl-sort hs '(lambda (a b) (< (car a) (car b)))) (vl-sort vs '(lambda (a b) (< (car a) (car b))))))
(defun gip:ht-ov (a b) (- (min (caddr a) (caddr b)) (max (cadr a) (cadr b))))
(defun gip:ht-win-axis (items ax / s grp cs best lo hi res c0 c1 ok full)
  (setq res nil)
  (foreach s items
    (setq grp nil)
    (foreach t2 items
      (if (and (<= (abs (- (car t2) (car s))) 450.0)
               (>= (gip:ht-ov s t2) (* 0.6 (min (- (caddr s) (cadr s)) (- (caddr t2) (cadr t2))))))
        (setq grp (cons t2 grp))))
    (setq best s)
    (foreach t2 grp (if (> (- (caddr t2) (cadr t2)) (- (caddr best) (cadr best))) (setq best t2)))
    (setq lo (cadr best) hi (caddr best))
    ;; уровни линий (через 15 мм и больше), перекрывающие проём почти целиком: рама, стекло, подоконник
    (setq cs nil)
    (foreach t2 grp (if (not (vl-some '(lambda (c) (< (abs (- c (car t2))) 15.0)) cs)) (setq cs (cons (car t2) cs))))
    (setq full (vl-remove-if-not '(lambda (c) (>= (gip:ht-cover grp c lo hi) (* 0.82 (- hi lo)))) cs))
    (if (>= (length full) 3)
      (progn
        (setq c0 (apply 'min full) c1 (apply 'max full) ok T)
        (foreach r res
          (if (and (< (abs (- (/ (+ c0 c1) 2.0) (/ (+ (nth 2 r) (nth 3 r)) 2.0))) 450.0) (> (- (min hi (cadr r)) (max lo (car r))) (* 0.5 (- hi lo))))
            (setq ok nil)))
        (if ok (setq res (cons (list lo hi c0 c1 ax) res))))))
  res)
;; длина объединения отрезков уровня c внутри [lo, hi]
(defun gip:ht-cover (grp c lo hi / iv tot cur a b)
  (setq iv nil)
  (foreach t2 grp
    (if (< (abs (- (car t2) c)) 15.0)
      (progn (setq a (max lo (cadr t2)) b (min hi (caddr t2)))
             (if (> b a) (setq iv (cons (list a b) iv))))))
  (setq iv (vl-sort iv '(lambda (x y) (< (car x) (car y)))) tot 0.0 cur nil)
  (foreach x iv
    (cond ((null cur) (setq cur x))
          ((<= (car x) (cadr cur)) (setq cur (list (car cur) (max (cadr cur) (cadr x)))))
          (T (setq tot (+ tot (- (cadr cur) (car cur))) cur x))))
  (if cur (setq tot (+ tot (- (cadr cur) (car cur)))))
  tot)
;; окна: список (lo hi cface ax side) в местной системе
(defun gip:ht-find-windows (lsg / it cands out ax mid c0 c1 pa pb ra rb side face)
  (setq it (gip:ht-win-items lsg) cands (append (gip:ht-win-axis (car it) 0) (gip:ht-win-axis (cadr it) 1)) out nil)
  (setq *gip:ht-outside* (gip:ht-outside-regions))
  (foreach w cands
    (setq ax (nth 4 w) mid (/ (+ (car w) (cadr w)) 2.0) c0 (nth 2 w) c1 (nth 3 w))
    (setq pa (if (= ax 0) (list mid (- c0 550.0)) (list (- c0 550.0) mid))
          pb (if (= ax 0) (list mid (+ c1 550.0)) (list (+ c1 550.0) mid)))
    (setq ra (gip:ht-region pa) rb (gip:ht-region pb) side nil)
    (cond ((and ra (not (member ra *gip:ht-outside*)) (or (null rb) (member rb *gip:ht-outside*))) (setq side -1))
          ((and rb (not (member rb *gip:ht-outside*)) (or (null ra) (member ra *gip:ht-outside*))) (setq side 1)))
    (if side
      (progn
        (setq face (if (= side 1) c1 c0))
        (setq out (cons (list (car w) (cadr w) face ax side (if (= side 1) rb ra)) out)))))
  (reverse out))
;; окно (местное) -> (a b n) в координатах чертежа: a,b — концы по грани стены, n — нормаль внутрь помещения
(defun gip:ht-win-glob (w org an / a b n)
  (if (= (nth 3 w) 0)
    (setq a (list (car w) (nth 2 w)) b (list (cadr w) (nth 2 w)) n (list 0.0 (float (nth 4 w))))
    (setq a (list (nth 2 w) (car w)) b (list (nth 2 w) (cadr w)) n (list (float (nth 4 w)) 0.0)))
  (list (gip:rt-to-glob a org an) (gip:rt-to-glob b org an)
        (gip:ht-sub (gip:rt-to-glob n '(0.0 0.0) an) (gip:rt-to-glob '(0.0 0.0) '(0.0 0.0) an))))

;; ---------------------------------------------------------------- трассы
;; rads: ((id goal endA endB) …) — точки в координатах чертежа: goal — точка перед радиатором в помещении,
;; endA/endB — концы радиатора на грани со стороны помещения. root — точка перед ШРВ, face — середина грани ШРВ,
;; rdir — направление от ШРВ в помещение (единичный вектор).
;; Результат: ((id side t1pts t2pts len1 len2) …), side "Л"/"П" — с какой стороны (если смотреть из помещения) подключён радиатор.
(defun gip:ht-route (segs rads root face rdir / ends conn1 conn2 ea eb e0 pts an org lr r0 gl nleft tc hit cells srcs i res ord din ch lst c p q d side r
                     path offs o1 o2 n k pts1 pts2 e0 e1 ea eb ends conn1 conn2 out outl t1 t2 nr rid face-l rd)
  (setq org (gip:ht-p2 root))
  (setq an (gip:ht-grid segs org (append (list face) (apply 'append (mapcar '(lambda (r) (list (cadr r) (caddr r) (cadddr r))) rads)))))
  (setq rd (gip:ht-sub (gip:rt-to-loc (gip:ht-add org rdir) org an) '(0.0 0.0)))
  (setq din (gip:ht-dir '(0.0 0.0) rd) face-l (gip:rt-to-loc face org an))
  (setq r0 (gip:rt-goal-cell '(0.0 0.0)) res nil *gip:ht-info* nil)
  (if r0
    (progn
      ;; цели: клетки перед обоими концами радиатора (выводы у ближнего к трассе торца)
      (setq lr nil)
      (foreach r rads
        (setq ea (caddr r) eb (cadddr r) d (gip:ht-unit (gip:ht-sub eb ea))
              q (gip:ht-unit (gip:ht-sub (cadr r) (gip:ht-mul (gip:ht-add ea eb) 0.5))))
        (foreach gp (list (gip:ht-add ea (gip:ht-add (gip:ht-mul d 125.0) (gip:ht-mul q 300.0)))
                          (gip:ht-add eb (gip:ht-add (gip:ht-mul d -125.0) (gip:ht-mul q 300.0))))
          (setq gl (gip:rt-goal-cell (gip:rt-to-loc gp org an)))
          (if gl
            (progn (gip:rt-s "GRT_T" gl 1) (gip:rt-s "GHT_G" gl (cons (car r) (gip:rt-g "GHT_G" gl)))
                   (gip:rt-s "GHT_GC" (car r) (cons gl (gip:rt-g "GHT_GC" (car r))))))))
      ;; дерево от коллектора: каждый раз ближайший ещё не подключённый радиатор от всей сети
      (gip:rt-s "GRT_N" r0 1) (setq srcs (list r0) *gip:ht-net* (list r0))
      (setq nleft (length (vl-remove-if-not '(lambda (r) (gip:rt-g "GHT_GC" (car r))) rads)))
      (while (and (> nleft 0) (setq hit (if (gip:rt-g "GRT_T" r0) (* r0 4) (gip:rt-dij srcs))))
        (setq cells (if (= hit (* r0 4)) (list r0) (gip:rt-path-cells hit)) tc (last cells))
        (foreach rid (gip:rt-g "GHT_G" tc)
          (if (null (assoc rid lr))
            (progn (setq lr (cons (cons rid tc) lr) nleft (1- nleft))
                   (foreach gc (gip:rt-g "GHT_GC" rid) (set (gip:rt-sym "GRT_T" gc) nil)))))
        (set (gip:rt-sym "GRT_T" tc) nil)
        (setq i 1)
        (while (< i (length cells))
          (if (null (gip:rt-g "GRT_N" (nth i cells)))
            (progn (gip:rt-s "GRT_N" (nth i cells) 1) (gip:rt-s "GRT_PAR" (nth i cells) (nth (1- i) cells))
                   (setq srcs (cons (nth i cells) srcs) *gip:ht-net* (cons (nth i cells) *gip:ht-net*))))
          (setq i (1+ i)))
        (gip:rt-free-d))
      ;; в клетке остаются только подключённые здесь радиаторы
      (foreach x lr (gip:rt-s "GHT_H" (cdr x) (cons (car x) (gip:rt-g "GHT_H" (cdr x)))))
      ;; дети клеток дерева
      (foreach c *gip:ht-net* (if (setq p (gip:rt-g "GRT_PAR" c)) (gip:rt-s "GHT_C" p (cons c (gip:rt-g "GHT_C" p)))))
      (setq *gip:ht-rc* (mapcar '(lambda (r) (cons (car r) (gip:rt-to-loc (gip:ht-mul (gip:ht-add (caddr r) (cadddr r)) 0.5) org an))) rads))
      ;; порядок контуров обходом в глубину: справа налево по ходу от коллектора
      (setq ord (gip:ht-dfs r0 din))
      ;; нагрузка рёбер: для каждой клетки — контуры, проходящие через неё (ребро «родитель -> клетка»)
      (foreach x lr
        (setq c (cdr x))
        (if (gip:rt-g "GRT_N" c)
          (while c (gip:rt-s "GHT_E" c (cons (car x) (gip:rt-g "GHT_E" c))) (setq c (gip:rt-g "GRT_PAR" c)))))
      ;; выходы коллектора: по порядку контуров, вдоль грани; Т1 справа от Т2
      (setq nleft (length ord) nr (gip:ht-left (gip:ht-dvec din)))
      (foreach x lr
        (setq c (cdr x) rid (car x))
        (if (and (gip:rt-g "GRT_N" c) (member rid ord))
          (progn
            (setq path nil)
            (while c (setq path (cons c path) c (gip:rt-g "GRT_PAR" c)))
            (setq k (vl-position rid ord) o1 (* (- k (/ (- nleft 1) 2.0)) *gip:ht-pitch*))
            ;; смещения по рёбрам
            (setq offs nil i 1)
            (while (< i (length path))
              (setq lst (vl-sort (gip:rt-g "GHT_E" (nth i path)) '(lambda (a b) (< (vl-position a ord) (vl-position b ord)))))
              (setq n (length lst) offs (cons (* (- (vl-position rid lst) (/ (- n 1) 2.0)) *gip:ht-pitch*) offs) i (1+ i)))
            (setq offs (reverse offs) pts (mapcar 'gip:rt-cpt path))
            (if (< (length pts) 2) (setq pts (list (car pts) (car pts)) offs (list 0.0)))
            (setq pts1 (gip:ht-offset pts (mapcar '(lambda (o) (- o *gip:ht-pair*)) offs))
                  pts2 (gip:ht-offset pts (mapcar '(lambda (o) (+ o *gip:ht-pair*)) offs)))
            (if *gip:rt-dbg* (setq *gip:ht-dbgl* (cons (list rid path offs pts1 pts2) *gip:ht-dbgl*)))
            ;; выходы коллектора
            (setq out (gip:ht-add face-l (gip:ht-mul nr (- o1 *gip:ht-pair*))) outl (gip:ht-add face-l (gip:ht-mul nr (+ o1 *gip:ht-pair*))))
            (setq q (gip:ht-attach (reverse pts1) (reverse pts2) out outl rd))
            (setq pts1 (reverse (car q)) pts2 (reverse (cadr q)))
            ;; конец: ближний к трассе конец радиатора; выводы в 100 и 150 мм от торца
            (setq r (assoc rid rads)
                  ea (gip:rt-to-loc (caddr r) org an) eb (gip:rt-to-loc (cadddr r) org an)
                  e0 (last pts1))
            (if (<= (distance e0 ea) (distance e0 eb)) (setq ends (list ea eb) side 0) (setq ends (list eb ea) side 1))
            (setq d (gip:ht-unit (gip:ht-sub (cadr ends) (car ends)))
                  conn1 (gip:ht-add (car ends) (gip:ht-mul d 100.0)) conn2 (gip:ht-add (car ends) (gip:ht-mul d 150.0)))
            (setq q (gip:ht-attach pts1 pts2 conn1 conn2 (gip:ht-left d)))
            (if (< (gip:ht-dot (gip:ht-sub (last pts1) (car ends)) (gip:ht-left d)) 0.0)
              (setq q (gip:ht-attach pts1 pts2 conn1 conn2 (gip:ht-mul (gip:ht-left d) -1.0))))
            (setq pts1 (gip:rt-ortho (car q)) pts2 (gip:rt-ortho (cadr q)))
            (setq t1 (mapcar '(lambda (p) (gip:rt-to-glob p org an)) pts1) t2 (mapcar '(lambda (p) (gip:rt-to-glob p org an)) pts2))
            (setq res (cons (list rid (if (= side 0) "A" "B") t1 t2 (gip:ht-plen t1) (gip:ht-plen t2)) res)))))
      (setq *gip:ht-info* (list (length res) (- (length rads) (length res))))))
  (if (not *gip:rt-dbg*) (gip:rt-free))
  (reverse res))
;; Присоединение пары труб к двум выводам на грани (радиатора или ШРВ). p1, p2 — ломаные, концы в конце списков;
;; c1, c2 — выводы; nrm — нормаль грани в сторону труб. Трубы распределяются по выводам без перехлёста:
;;  • подход вдоль грани — ближняя к грани труба поворачивает к первому по ходу выводу;
;;  • подход поперёк грани — по порядку, со ступенькой (отстающая труба — ниже).
(defun gip:ht-attach (p1 p2 c1 c2 nrm / u st a b dv sg cf cs pin pout tl h1 h2 sa sb ca cb dl res)
  (setq u (gip:ht-left nrm) a (last p1) b (last p2))
  (defun gip:ht-st (p) (list (gip:ht-dot (gip:ht-sub p c1) u) (gip:ht-dot (gip:ht-sub p c1) nrm)))
  (defun gip:ht-pt (s1 t1) (gip:ht-add c1 (gip:ht-add (gip:ht-mul u s1) (gip:ht-mul nrm t1))))
  (setq dv (if (cdr p1) (gip:ht-unit (gip:ht-sub a (nth (- (length p1) 2) p1))) nrm))
  (if (< (abs (gip:ht-dot dv nrm)) 0.5)
    (progn
      ;; вдоль грани
      (setq sg (if (>= (gip:ht-dot dv u) 0.0) 1.0 -1.0))
      (if (<= (* sg (car (gip:ht-st c1))) (* sg (car (gip:ht-st c2)))) (setq cf c1 cs c2) (setq cf c2 cs c1))
      (if (<= (cadr (gip:ht-st a)) (cadr (gip:ht-st b))) (setq pin 1) (setq pin 2))
      (setq res (list (gip:ht-leg-a p1 (if (= pin 1) cf cs)) (gip:ht-leg-a p2 (if (= pin 1) cs cf)))))
    (progn
      ;; поперёк грани
      (setq sa (car (gip:ht-st a)) sb (car (gip:ht-st b)))
      (if (<= (car (gip:ht-st c1)) (car (gip:ht-st c2))) (setq ca c1 cb c2) (setq ca c2 cb c1))
      (if (<= sa sb) (setq res (list ca cb)) (setq res (list cb ca)))
      (setq dl (- (car (gip:ht-st (car res))) sa) tl (min (cadr (gip:ht-st a)) (cadr (gip:ht-st b))))
      (setq h1 (min 150.0 (* 0.45 tl)) h2 (min 200.0 (* 0.65 tl)))
      ;; отстающая (сзади по сдвигу) — ниже
      (if (or (and (> dl 0.0) (<= sa sb)) (and (< dl 0.0) (> sa sb)))
        (setq res (list (gip:ht-leg-b p1 (car res) h1) (gip:ht-leg-b p2 (cadr res) h2)))
        (setq res (list (gip:ht-leg-b p1 (car res) h2) (gip:ht-leg-b p2 (cadr res) h1))))))
  (list (gip:rt-simplify (car res)) (gip:rt-simplify (cadr res))))
;; вдоль грани: последний участок продлевается/укорачивается до вывода, затем к выводу
(defun gip:ht-leg-a (p c / l q)
  (setq l (last p) q (gip:ht-pt (car (gip:ht-st c)) (cadr (gip:ht-st l))))
  (append (reverse (cdr (reverse p))) (list q c)))
;; поперёк грани: спуск до уровня h, сдвиг вдоль грани, к выводу
(defun gip:ht-leg-b (p c h / l s0)
  (setq l (last p) s0 (car (gip:ht-st l)))
  (if (< (abs (- s0 (car (gip:ht-st c)))) 1.0)
    (append (reverse (cdr (reverse p))) (list (gip:ht-pt (car (gip:ht-st c)) (cadr (gip:ht-st l))) c))
    (append p (list (gip:ht-pt s0 h) (gip:ht-pt (car (gip:ht-st c)) h) c))))
;; сторона подключения: смотрим на радиатор из помещения (против нормали n): конец слева -> «Л»
(defun gip:ht-side (ea eb ec n / mid)
  (setq mid (gip:ht-mul (gip:ht-add ea eb) 0.5))
  (if (> (gip:ht-dot (gip:ht-sub ec mid) (list (cadr n) (- (car n)))) 0.0) "Л" "П"))
;; обход дерева: дети справа, прямо, слева; радиаторы в клетке — как «прямо»
(defun gip:ht-dfs (c din / res here st turn kids d p)
  (setq res nil st (list (list c din)))
  (while st
    (setq c (car (car st)) din (cadr (car st)) st (cdr st))
    (if (= (type c) 'LIST)
      (setq res (append res c))
      (progn
        (setq here (reverse (gip:rt-g "GHT_H" c)) kids nil)
        ;; радиаторы, заканчивающиеся в клетке: слева или справа по ходу — как поворот в ту сторону, но ближе прямого
        (foreach rid here
          (setq p (cdr (assoc rid *gip:ht-rc*)))
          (setq kids (cons (list (if (and p (> (gip:ht-dot (gip:ht-sub p (gip:rt-cpt c)) (gip:ht-left (gip:ht-dvec din))) 0.0)) 2.5 1) (list rid) nil) kids)))
        (setq here nil)
        (foreach k (gip:rt-g "GHT_C" c)
          (setq d (gip:ht-dir (gip:rt-cpt c) (gip:rt-cpt k)) turn (rem (+ (- d din) 4) 4))
          (setq kids (cons (list (cond ((= turn 3) 0) ((= turn 0) 2) (T 3)) k d) kids)))
        (if here (setq kids (cons (list 1 here nil) kids)))
        (setq kids (vl-sort kids '(lambda (a b) (< (car a) (car b)))))
        ;; в стек в обратном порядке (первым обрабатывается правый)
        (foreach kd (reverse kids)
          (setq st (cons (if (= (type (cadr kd)) 'LIST) (list (cadr kd) nil) (list (cadr kd) (caddr kd))) st))))))
  res)
;; смещённая ломаная: pts — центры клеток, offs — смещения рёбер (влево по ходу)
(defun gip:ht-offset (pts offs / r i a b c d0 d1 n0 n1 o0 o1)
  (setq d0 (gip:ht-dvec (gip:ht-dir (car pts) (cadr pts))) o0 (car offs))
  (setq r (list (gip:ht-add (car pts) (gip:ht-mul (gip:ht-left d0) o0))) i 1)
  (while (< i (1- (length pts)))
    (setq b (nth i pts) c (nth (1+ i) pts)
          d1 (gip:ht-dvec (gip:ht-dir b c)) o1 (nth i offs) n0 (gip:ht-left d0) n1 (gip:ht-left d1))
    (cond
      ((equal d0 d1 1e-9)
       (if (/= o0 o1)
         (setq r (cons (gip:ht-add b (gip:ht-mul n1 o1)) (cons (gip:ht-add b (gip:ht-mul n0 o0)) r)))))
      (T (setq r (cons (gip:ht-add b (gip:ht-add (gip:ht-mul n0 o0) (gip:ht-mul n1 o1))) r))))
    (setq d0 d1 o0 o1 i (1+ i)))
  (setq r (cons (gip:ht-add (last pts) (gip:ht-mul (gip:ht-left d0) o0)) r))
  (gip:rt-simplify (reverse r)))

;; ============================================================================ чертёж
;; ---------------------------------------------------------------- листы альбома О
;; рамки А3-GIP-ALBOM/BOOK; роль по названию в штампе: «План … Т1, Т2» -> plan, «Схема … Т1» -> scheme, «Спецификация … Т1» -> spec;
;; «Общие данные» альбома О — рамка с меткой GIPHEAT «O:od» или ближайшая над листом плана в той же колонке.
(defun gip:ht-sheets (/ ss tss i e o nm F res j te tp ttl best sc dx dy role book t1 x od pl)
  (setq res nil ss (ssget "_X" '((0 . "INSERT"))) tss (ssget "_X" '((0 . "MTEXT,TEXT"))))
  (if ss
    (progn
      (setq i 0)
      (while (< i (sslength ss))
        (setq e (ssname ss i) i (1+ i) o (vlax-ename->vla-object e) nm (vl-catch-all-apply 'vlax-get (list o 'EffectiveName)))
        (if (and (= (type nm) 'STR) (member nm '("А3-GIP-ALBOM" "А3-GIP-BOOK")))
          (progn
            (setq F (cdr (assoc 10 (entget e))) book (= nm "А3-GIP-BOOK") ttl "" best nil j 0)
            (if tss
              (while (< j (sslength tss))
                (setq te (ssname tss j) j (1+ j) tp (cdr (assoc 10 (entget te))) dx (- (car tp) (car F)) dy (- (cadr tp) (cadr F)))
                (if (and (> dx -8750.0) (< dx -3750.0) (> dy -1875.0) (< dy 3125.0))
                  (progn (setq sc (+ (* (+ dx 6250.0) (+ dx 6250.0)) (* (- dy 625.0) (- dy 625.0))))
                         (if (or (null best) (< sc best)) (setq best sc ttl (gip:mt-plain (entget te))))))))
            (setq t1 (gip:lower ttl) x (cdr (assoc -3 (entget e (list *gip:ht-app*)))))
            (setq role (cond ((and (gip:has t1 "т1") (gip:has t1 "план")) "plan")
                             ((and (gip:has t1 "т1") (gip:has t1 "схем")) "scheme")
                             ((and (gip:has t1 "т1") (gip:has t1 "спецификац")) "spec")
                             ((and x (= (cdr (assoc 1000 (cdar x))) "O:od")) "od")
                             ((gip:has t1 "общие данные") "od?")
                             (T nil)))
            (if role
              (setq res (cons (list (cons "F" (list (car F) (cadr F))) (cons "role" role) (cons "title" ttl) (cons "e" e)
                                    (cons "box" (if book (list (- (car F) 14850.0) (cadr F) (car F) (+ (cadr F) 20960.0))
                                                    (list (- (car F) *gip:SW*) (cadr F) (car F) (+ (cadr F) *gip:SHH*)))))
                              res))))))))
  ;; «Общие данные»: помеченные, иначе ближайшие над планом в той же колонке
  (setq pl (vl-some '(lambda (s) (if (= (gip:g s "role") "plan") s)) res))
  (setq od (vl-some '(lambda (s) (if (= (gip:g s "role") "od") s)) res))
  (if (and (null od) pl)
    (foreach s res
      (if (and (= (gip:g s "role") "od?") (< (abs (- (car (gip:g s "F")) (car (gip:g pl "F")))) 50.0) (> (cadr (gip:g s "F")) (cadr (gip:g pl "F")))
               (or (null od) (< (cadr (gip:g s "F")) (cadr (gip:g od "F")))))
        (setq od s))))
  (setq res (vl-remove-if '(lambda (s) (= (gip:g s "role") "od?")) res))
  (if (and od (/= (gip:g od "role") "od")) (setq res (cons (gip:s od "role" "od") res)))
  (vl-sort res '(lambda (a b) (> (cadr (gip:g a "F")) (cadr (gip:g b "F"))))))
(defun gip:ht-sheet (sheets role) (vl-some '(lambda (s) (if (= (gip:g s "role") role) s)) sheets))

;; ---------------------------------------------------------------- стены листа плана
;; подложка GIPROOMS (блоки GIP_RM_W*: стены и окна) — целиком; иначе — слои стен, указанные для трасс ЭОМ (GIPRTWALL)
(defun gip:ht-wall-segs (box / ss i e ed ip nm r xf be f layers)
  (setq r nil)
  (if (setq ss (ssget "_X" '((0 . "INSERT"))))
    (progn
      (setq i 0)
      (while (< i (sslength ss))
        (setq e (ssname ss i) i (1+ i) ed (entget e) ip (cdr (assoc 10 ed)) nm (cdr (assoc 2 ed)))
        (if (and (wcmatch (strcase nm) "GIP_RM_W*") (gip:rt-in ip box))
          (progn
            (setq xf (list (car ip) (cadr ip) (if (assoc 41 ed) (cdr (assoc 41 ed)) 1.0) (cos (gip:nz (cdr (assoc 50 ed)) 0.0)) (sin (gip:nz (cdr (assoc 50 ed)) 0.0))))
            (if (setq be (cdr (assoc -2 (tblsearch "BLOCK" nm))))
              (while be (setq f (entget be) r (append (gip:rt-ent-segs f xf) r) be (entnext be)))))))))
  (if (and (null r) (setq layers (gip:rt-wall-layers)))
    (setq r (gip:rt-wall-segs box layers)))
  r)

;; ---------------------------------------------------------------- хранение в чертеже
(defun gip:ht-get (key / s) (if (setq s (gip:dict-get key)) (read s)))
(defun gip:ht-put (key v) (gip:dict-put key (vl-prin1-to-string v)))
;; окна: (id помещение ax ay bx by nx ny ручное)
(defun gip:ht-windows () (gip:ht-get "GIPHEATW"))

;; ---------------------------------------------------------------- помещения листа: номер -> точка
(defun gip:ht-markers (box / r e obj ip no)
  (setq r nil)
  (foreach e (gip:rm-num-refs)
    (setq ip (cdr (assoc 10 (entget e))))
    (if (gip:rt-in ip box)
      (progn (setq obj (vlax-ename->vla-object e) no (gip:rm-num obj))
             (if (> no 0) (setq r (cons (cons no (list (car ip) (cadr ip))) r))))))
  r)
;; помещение региона сетки: по номерам на листе (местная система org/an)
(defun gip:ht-room-of (rg marks org an / no)
  (setq no 0)
  (foreach m marks (if (and rg (= (gip:ht-region (gip:rt-to-loc (cdr m) org an)) rg)) (setq no (car m))))
  no)

;; ---------------------------------------------------------------- поиск окон на листе плана
(defun gip:ht-scan (sh / box segs org an wl marks res id w g old man)
  (setq box (gip:g sh "box") segs (gip:ht-wall-segs box))
  (if (null segs)
    (progn (princ "\nГИП: на листе плана Т1, Т2 нет стен подложки (GIPROOMS) и не заданы слои стен.") nil)
    (progn
      (setq org (list (/ (+ (car box) (caddr box)) 2.0) (/ (+ (cadr box) (cadddr box)) 2.0)))
      (setq an (gip:ht-grid segs org nil) marks (gip:ht-markers box))
      (setq wl (gip:ht-find-windows *gip:ht-lsg*) res nil id 0)
      (foreach w wl
        (setq g (gip:ht-win-glob w org an) id (1+ id))
        (setq res (cons (list id (gip:ht-room-of (nth 5 w) marks org an) (car (car g)) (cadr (car g)) (car (cadr g)) (cadr (cadr g)) (car (caddr g)) (cadr (caddr g)) 0) res)))
      ;; окна, указанные вручную, сохраняются (номер помещения — заново)
      (setq man (vl-remove-if-not '(lambda (w) (= (nth 8 w) 1)) (gip:ht-windows)))
      (foreach w man
        (setq id (1+ id))
        (setq res (cons (append (list id (gip:ht-room-of (gip:ht-region (gip:rt-to-loc (gip:ht-add (list (/ (+ (nth 2 w) (nth 4 w)) 2.0) (/ (+ (nth 3 w) (nth 5 w)) 2.0)) (gip:ht-mul (list (nth 6 w) (nth 7 w)) 600.0)) org an)) marks org an))
                                (cddr w)) res)))
      (gip:rt-free)
      (setq res (reverse res))
      (gip:ht-put "GIPHEATW" res)
      res)))

;; ---------------------------------------------------------------- рисование
(defun gip:ht-pline (pts w col closed kind / d)
  (gip:layer *gip:ht-lay*)
  (setq d (append (list '(0 . "LWPOLYLINE") '(100 . "AcDbEntity") (cons 8 *gip:ht-lay*))
                  (if col (list (cons 62 col)) nil)
                  (list '(100 . "AcDbPolyline") (cons 90 (length pts)) (cons 70 (if closed 1 0)) (cons 43 (float w)))
                  (mapcar '(lambda (p) (list 10 (car p) (cadr p))) pts)))
  (gip:ht-mk d kind))
(defun gip:ht-line (a b col kind)
  (gip:ht-mk (list '(0 . "LINE") '(100 . "AcDbEntity") (cons 8 *gip:ht-lay*) (cons 62 (if col col 256)) '(100 . "AcDbLine")
                   (list 10 (car a) (cadr a) 0.0) (list 11 (car b) (cadr b) 0.0)) kind))
(defun gip:ht-style () (if (tblsearch "STYLE" "ls_200") "ls_200" "STANDARD"))
(defun gip:ht-mtext (p txt h w att col lay kind)
  (gip:ht-mk (list '(0 . "MTEXT") '(100 . "AcDbEntity") (cons 8 lay) (cons 62 (if col col 256)) '(100 . "AcDbMText")
                   (list 10 (car p) (cadr p) 0.0) (cons 40 (float h)) (cons 41 (float w)) (cons 71 att) (cons 72 5) (cons 1 txt) (cons 7 (gip:ht-style)))
             kind))
;; мультивыноска как в проектах ГИП: стрелка в p0, полка у p1 (вправо или влево от p0), текст над полкой
(defun gip:ht-leader (p0 p1 txt col small kind / ml e r dir)
  (setq r (vl-catch-all-apply 'vlax-invoke (list (gip:ms) 'AddMLeader (list (car p0) (cadr p0) 0.0 (car p1) (cadr p1) 0.0) 0)))
  (if (and (not (vl-catch-all-error-p r)) r)
    (progn
      (setq ml (if (listp r) (car r) r))
      (vl-catch-all-apply 'vla-put-textstring (list ml txt))
      (vl-catch-all-apply 'vla-put-layer (list ml (gip:layer *gip:ht-lay*)))
      (vl-catch-all-apply 'vla-put-textstylename (list ml (gip:ht-style)))
      (vl-catch-all-apply 'vla-put-textheight (list ml 150.0))
      (vl-catch-all-apply 'vla-put-arrowheadsize (list ml (if small 4.0 15.0)))
      (vl-catch-all-apply 'vla-put-landinggap (list ml (if small 20.0 75.0)))
      (vl-catch-all-apply 'vla-put-dogleglength (list ml (if small 8.0 23.4)))
      (if col (vl-catch-all-apply 'vla-put-color (list ml col)))
      (gip:ht-tag-obj ml kind))
    ;; запасной вариант (нет мультивыносок): линия-выноска, полка и текст
    (progn
      (setq dir (if (>= (car p1) (car p0)) 1.0 -1.0))
      (gip:ht-pline (list p0 p1 (list (+ (car p1) (* dir (max 900.0 (* 95.0 (gip:ht-maxline txt))))) (cadr p1))) 0.0 col nil kind)
      (gip:ht-mtext (list (+ (car p1) (if (> dir 0) 75.0 (- (* 95.0 (gip:ht-maxline txt))))) (+ (cadr p1) 75.0)) txt 150.0 (max 900.0 (* 95.0 (gip:ht-maxline txt))) 7 col *gip:ht-lay* kind))))
(defun gip:ht-maxline (txt / m) (setq m 0) (foreach l (gip:split txt "\\P") (setq m (max m (strlen l)))) m)

;; ---------------------------------------------------------------- геометрия радиатора и ШРВ
;; радиатор у окна w (id room ax ay bx by nx ny): длина L, глубина D (в помещение от грани стены)
(defun gip:ht-rad-geom (w L D / a b n c u)
  (setq a (list (nth 2 w) (nth 3 w)) b (list (nth 4 w) (nth 5 w)) n (list (nth 6 w) (nth 7 w))
        c (gip:ht-mul (gip:ht-add a b) 0.5) u (gip:ht-unit (gip:ht-sub b a)))
  (list (cons "c" c) (cons "u" u) (cons "n" n)
        (cons "a" (gip:ht-add c (gip:ht-add (gip:ht-mul u (* -0.5 L)) (gip:ht-mul n D))))
        (cons "b" (gip:ht-add c (gip:ht-add (gip:ht-mul u (* 0.5 L)) (gip:ht-mul n D))))
        (cons "w0" (gip:ht-add c (gip:ht-mul u (* -0.5 L)))) (cons "w1" (gip:ht-add c (gip:ht-mul u (* 0.5 L))))
        (cons "goal" (gip:ht-add c (gip:ht-mul n (+ D 300.0))))))
;; ШРВ: (px py nx ny) — точка на грани стены и нормаль внутрь помещения
(defun gip:ht-shrv () (gip:ht-get "GIPHEATSHRV"))
(defun gip:ht-shrv-geom (s n / p nn u lc)
  (setq p (list (car s) (cadr s)) nn (list (caddr s) (cadddr s)) u (gip:ht-left nn) lc (+ (* 100.0 n) 112.0))
  (list (cons "p" p) (cons "n" nn) (cons "u" u) (cons "lc" lc)
        (cons "face" (gip:ht-add p (gip:ht-mul nn 150.0))) (cons "root" (gip:ht-add p (gip:ht-mul nn 400.0)))
        (cons "rect" (list (gip:ht-add p (gip:ht-mul u (* -0.5 lc))) (gip:ht-add p (gip:ht-mul u (* 0.5 lc)))
                           (gip:ht-add (gip:ht-add p (gip:ht-mul u (* 0.5 lc))) (gip:ht-mul nn 150.0))
                           (gip:ht-add (gip:ht-add p (gip:ht-mul u (* -0.5 lc))) (gip:ht-mul nn 150.0))))))
;; ближайшая к точке грань стены: (точка-на-грани нормаль-к-точке) или nil; нормаль перпендикулярна стене
(defun gip:ht-near-wall (p segs / best bd a b ab t1 q d nn)
  (setq best nil bd 800.0)
  (foreach s segs
    (setq a (list (car s) (cadr s)) b (list (caddr s) (cadddr s)) ab (gip:ht-sub b a))
    (if (> (gip:ht-len ab) 100.0)
      (progn
        (setq t1 (max 0.0 (min 1.0 (/ (gip:ht-dot (gip:ht-sub p a) ab) (gip:ht-dot ab ab)))) q (gip:ht-add a (gip:ht-mul ab t1)) d (distance p q))
        (if (< d bd)
          (progn (setq nn (gip:ht-left (gip:ht-unit ab)))
                 (if (< (gip:ht-dot (gip:ht-sub p q) nn) 0.0) (setq nn (gip:ht-mul nn -1.0)))
                 (setq bd d best (list q nn)))))))
  best)

;; ---------------------------------------------------------------- данные от панели (gip_heat_in.txt)
;; по форме на строке; строки панели — ASCII с ~uXXXX:
;;   (STATE "json")                                   состояние панели (хранится в чертеже как есть)
;;   (RAD id окно L D H Q "вид" "подкл" "надпись" "узел")   прибор у окна; вид TUB/BIM/PAN/RECT/CONV; подкл НС/БС/НП/БВ
;;   (SEC "раздел") (ROW "наим" "тип" "изгот" "ед" кол) (PIPE "наим" "тип" "изгот" "ед" "T|T1|T2|TAPE1|TAPE2" коэф)
;;   (SHRV "блок схемы ШРВ" выходов) (OPT "ключ" значение)
(defun gip:ht-read-in (/ p f l it res)
  (setq p (strcat (getvar "TEMPPREFIX") *gip:ht-in*) res nil)
  (if (setq f (open p "r"))
    (progn
      (while (setq l (read-line f))
        (if (and (> (strlen l) 2) (= (substr l 1 1) "("))
          (progn (setq it (vl-catch-all-apply 'read (list l)))
                 (if (and (not (vl-catch-all-error-p it)) (listp it)) (setq res (cons (gip:ht-dec it) res))))))
      (close f)))
  (reverse res))
(defun gip:ht-dec (x)
  (cond ((= (type x) 'STR) (gip:rm-dec x))
        ((and (listp x) x) (mapcar 'gip:ht-dec x))
        (T x)))
(defun gip:ht-items (data key) (vl-remove-if-not '(lambda (it) (= (vl-symbol-name (car it)) key)) data))
(defun gip:ht-opt (data key def / it)
  (setq it (vl-some '(lambda (i) (if (and (= (vl-symbol-name (car i)) "OPT") (= (cadr i) key)) i)) data))
  (if it (caddr it) def))

;; ---------------------------------------------------------------- отчёт и реестр для панели
(defun gip:ht-report (ok msg / f p)
  (setq p (strcat (getvar "TEMPPREFIX") *gip:ht-out*))
  (if (setq f (open p "w"))
    (progn (write-line (if ok "ok" "error") f) (write-line (gip:plan-ascii msg) f) (close f)))
  (princ (strcat "\nГИП: " msg)))
(defun gip:ht-write-reg (/ f p sheets w r st len)
  (setq p (strcat (getvar "TEMPPREFIX") *gip:ht-regf*) sheets (gip:ht-sheets))
  (if (setq f (open p "w"))
    (progn
      (princ "{\"type\":\"heat-registry\",\"sheets\":{" f)
      (princ (strcat "\"plan\":" (if (gip:ht-sheet sheets "plan") "1" "0") ",\"scheme\":" (if (gip:ht-sheet sheets "scheme") "1" "0")
                            ",\"spec\":" (itoa (length (vl-remove-if-not '(lambda (s) (= (gip:g s "role") "spec")) sheets)))
                            ",\"od\":" (if (gip:ht-sheet sheets "od") "1" "0") "}") f)
      (princ ",\"rooms\":[" f)
      (setq st T)
      (foreach r (gip:room-list)
        (if (not st) (princ "," f)) (setq st nil)
        (princ (strcat "{\"no\":" (itoa (nth 0 r)) ",\"name\":" (gip:js-str (gip:u (nth 1 r))) ",\"area\":" (gip:js-num (nth 2 r))
                              ",\"h\":" (gip:js-num (nth 4 r)) ",\"perim\":" (gip:js-num (gip:rm-perim-get (nth 0 r))) "}") f))
      (princ "],\"windows\":[" f)
      (setq st T)
      (foreach w (gip:ht-windows)
        (if (not st) (princ "," f)) (setq st nil)
        (princ (strcat "{\"id\":" (itoa (car w)) ",\"room\":" (itoa (cadr w))
                              ",\"w\":" (gip:js-num (gip:ht-r10 (distance (list (nth 2 w) (nth 3 w)) (list (nth 4 w) (nth 5 w)))))
                              ",\"manual\":" (itoa (nth 8 w)) "}") f))
      (setq len (gip:ht-get "GIPHEATLEN"))
      (princ (strcat "],\"shrv\":" (if (gip:ht-shrv) "1" "0")
                            ",\"len\":" (if len (strcat "{\"t1\":" (gip:js-num (car len)) ",\"t2\":" (gip:js-num (cadr len)) ",\"n\":" (gip:js-num (caddr len)) "}") "null")
                            ",\"rads\":" (gip:nz (gip:dict-get "GIPHEATRJ") "[]")
                            ",\"state\":" (gip:js-str (gip:nz (gip:dict-get "GIPHEATSTATE") "")) "}") f)
      (close f))))

;; ---------------------------------------------------------------- построение
(defun gip:ht-build (data / sheets plan sch specs box segs sh n rads radi w g res r wl nodes cnt t1 t2 msg q sid lbl k
                      geo shg rects nrad hit i id)
  (setq sheets (gip:ht-sheets) plan (gip:ht-sheet sheets "plan") sch (gip:ht-sheet sheets "scheme")
        specs (vl-remove-if-not '(lambda (s) (= (gip:g s "role") "spec")) sheets))
  (cond
    ((null plan) (gip:ht-report nil "нет листа «План … с сетями Т1, Т2» (альбом О). Откройте шаблон ГИП с альбомом О.") nil)
    ((null (gip:ht-shrv)) (gip:ht-report nil "не указан ШРВ отопления (кнопка «ШРВ» на панели).") nil)
    (T
     (regapp *gip:ht-app*)
     (setq box (gip:g plan "box") segs (gip:ht-wall-segs box) wl (gip:ht-windows))
     (setq radi (gip:ht-items data "RAD"))
     ;; приборы: окно + размеры
     (setq rads nil geo nil)
     (foreach it radi
       (setq w (assoc (nth 2 it) wl))
       (if w
         (progn (setq g (gip:ht-rad-geom w (float (nth 3 it)) (float (nth 4 it))))
                (setq geo (cons (cons (nth 1 it) (list g it w)) geo))
                (setq rads (cons (list (nth 1 it) (gip:g g "goal") (gip:g g "a") (gip:g g "b")) rads)))))
     (setq rads (reverse rads) geo (reverse geo) nrad (length rads))
     (setq shg (gip:ht-shrv-geom (gip:ht-shrv) (max 2 nrad)))
     ;; стереть прежнее
     (gip:ht-erase box '("pipe" "rad" "shrv" "lbl"))
     (if sch (gip:ht-erase (gip:g sch "box") '("axo" "node" "shs" "lbl")))
     (foreach s specs (gip:ht-erase (gip:g s "box") '("spec")))
     ;; ШРВ и приборы
     (gip:ht-pline (gip:g shg "rect") 20.0 nil T "shrv")
     (foreach x geo
       (setq g (cadr x))
       (gip:ht-pline (list (gip:g g "w0") (gip:g g "w1") (gip:g g "b") (gip:g g "a")) 20.0 nil T "rad"))
     ;; трассы
     (setq res (if (and segs rads) (gip:ht-route segs rads (gip:g shg "root") (gip:g shg "face") (gip:g shg "n")) nil))
     (setq t1 0.0 t2 0.0 *gip:ht-res* res)
     (foreach r res
       (gip:ht-pline (nth 2 r) 15.0 nil nil "pipe")
       (gip:ht-pline (nth 3 r) 15.0 5 nil "pipe")
       (setq t1 (+ t1 (nth 4 r)) t2 (+ t2 (nth 5 r))))
     ;; длины, м: по плану + подъёмы к прибору и коллектору (по 0,5 м на трубу)
     (setq t1 (+ (/ t1 1000.0) (* 0.5 (length res))) t2 (+ (/ t2 1000.0) (* 0.5 (length res))))
     (gip:ht-put "GIPHEATLEN" (list (gip:ht-r10 t1) (gip:ht-r10 t2) (length res)))
     ;; надписи на плане
     (gip:ht-labels geo res shg)
     ;; схема, узлы, спецификация
     (if sch (gip:ht-axo sch geo res shg data))
     (if specs (gip:ht-spec specs data t1 t2))
     ;; данные о приборах для панели: сторона подключения
     (gip:dict-put "GIPHEATRJ"
       (strcat "[" (gip:join (mapcar '(lambda (r) (strcat "{\"id\":" (gip:js-num (car r)) ",\"side\":" (gip:js-str (gip:ht-res-side r geo))
                                                       ",\"t1\":" (gip:js-num (gip:ht-r10 (/ (nth 4 r) 1000.0))) "}")) res) ",") "]"))
     (setq msg (strcat "отопление: приборов " (itoa nrad) ", подключено " (itoa (length res))
                       (if (< (length res) nrad) (strcat ", НЕ подключено " (itoa (- nrad (length res))) " (проверьте стены и ШРВ)") "")
                       "; трубы Т1 " (rtos t1 2 1) " м, Т2 " (rtos t2 2 1) " м."))
     (gip:ht-report (= (length res) nrad) msg)
     T)))
;; сторона подключения прибора (Л/П), если смотреть на него из помещения
(defun gip:ht-res-side (r geo / x g)
  (setq x (assoc (car r) geo) g (cadr x))
  (gip:ht-side (gip:g g "a") (gip:g g "b") (if (= (cadr r) "A") (gip:g g "a") (gip:g g "b")) (gip:g g "n")))

;; ---------------------------------------------------------------- надписи плана
(defun gip:ht-labels (geo res shg / g it p0 p1 n u txt r seg best bl i k a b m nrm ofs pipes done hits hit dmax)
  ;; приборы: выноска с угла прибора наружу (за стену), полка в сторону от окна
  (foreach x geo
    (setq g (cadr x) it (caddr x) n (gip:g g "n") u (gip:g g "u"))
    (setq p0 (gip:g g "w1") p1 (gip:ht-add (gip:g g "w1") (gip:ht-add (gip:ht-mul n -1000.0) (gip:ht-mul u 600.0))))
    (setq txt (nth 9 it))
    (if (and txt (/= txt "")) (gip:ht-leader p0 p1 txt nil nil "lbl")))
  ;; ШРВ
  (setq p0 (car (gip:g shg "rect")) p1 (gip:ht-add p0 (gip:ht-add (gip:ht-mul (gip:g shg "n") -700.0) (gip:ht-mul (gip:g shg "u") -500.0))))
  (gip:ht-leader p0 p1 "ШРВ\\Pотопления" nil nil "lbl")
  ;; трубы: «Т1\P%%C16» / «Т2\P%%C16». Основной пучок (самый длинный участок) — столбик подписей сбоку, стрелки к каждой трубе
  ;; со сдвигом вдоль пучка через 400 мм (как в ручных проектах); трубы вне пучка — по одной подписи на самом длинном участке.
  (setq pipes nil)
  (foreach r res (setq pipes (append pipes (list (list (nth 2 r) "Т1\\P%%C16" nil) (list (nth 3 r) "Т2\\P%%C16" 5)))))
  (setq best nil bl 0.0)
  (foreach pr pipes
    (setq seg (car pr) i 0)
    (while (< i (1- (length seg)))
      (if (> (distance (nth i seg) (nth (1+ i) seg)) bl) (setq bl (distance (nth i seg) (nth (1+ i) seg)) best (list (nth i seg) (nth (1+ i) seg))))
      (setq i (1+ i))))
  (setq done nil)
  (if (and best (> bl 1200.0))
    (progn
      (setq a (car best) b (cadr best) u (gip:ht-unit (gip:ht-sub b a)) nrm (gip:ht-left u) m (gip:ht-mul (gip:ht-add a b) 0.5) hits nil)
      ;; трубы, проходящие через сечение пучка в точке m (участок параллелен пучку и накрывает m)
      (foreach pr pipes
        (setq seg (car pr) i 0 hit nil)
        (while (and (null hit) (< i (1- (length seg))))
          (setq p0 (nth i seg) p1 (nth (1+ i) seg))
          (if (and (< (abs (gip:ht-dot (gip:ht-unit (gip:ht-sub p1 p0)) nrm)) 0.01)
                   (< (abs (gip:ht-dot (gip:ht-sub p0 m) nrm)) (+ 150.0 (* 100.0 (length res))))
                   (<= (min (gip:ht-dot (gip:ht-sub p0 m) u) (gip:ht-dot (gip:ht-sub p1 m) u)) (- (* 400.0 (length pipes))))
                   (>= (max (gip:ht-dot (gip:ht-sub p0 m) u) (gip:ht-dot (gip:ht-sub p1 m) u)) 0.0))
            (setq hit (gip:ht-dot (gip:ht-sub p0 m) nrm)))
          (setq i (1+ i)))
        (if hit (setq hits (cons (list hit (car pr) (cadr pr) (caddr pr)) hits))))
      (if hits
        (progn
          (setq hits (vl-sort hits '(lambda (x y) (> (car x) (car y)))) dmax (car (car hits)) k 0)
          (foreach h hits
            (setq p0 (gip:ht-add m (gip:ht-add (gip:ht-mul nrm (car h)) (gip:ht-mul u (* k -400.0))))
                  p1 (gip:ht-add m (gip:ht-add (gip:ht-mul nrm (+ dmax 450.0)) (gip:ht-mul u (- 200.0 (* k 400.0))))))
            (gip:ht-leader p0 p1 (caddr h) (cadddr h) T "lbl")
            (setq done (cons (cadr h) done) k (1+ k)))))))
  (foreach pr pipes
    (if (not (member (car pr) done))
      (progn
        (setq best nil bl 0.0 i 0 seg (car pr))
        (while (< i (1- (length seg)))
          (if (> (distance (nth i seg) (nth (1+ i) seg)) bl) (setq bl (distance (nth i seg) (nth (1+ i) seg)) best i))
          (setq i (1+ i)))
        (if (and best (> bl 600.0))
          (progn
            (setq a (nth best seg) b (nth (1+ best) seg) u (gip:ht-unit (gip:ht-sub b a)) nrm (gip:ht-left u)
                  p0 (gip:ht-add a (gip:ht-mul u (* 0.5 bl)))
                  p1 (gip:ht-add p0 (gip:ht-add (gip:ht-mul nrm 350.0) (gip:ht-mul u 250.0))))
            (gip:ht-leader p0 p1 (cadr pr) (caddr pr) T "lbl")))))))

;; ---------------------------------------------------------------- аксонометрическая схема (фронтальная изометрия, оси Y под 45°)
(defun gip:ht-axo (sh geo res shg data / nm F an o pr3 lst pts all bx s dx dy rg W H k it g z0 hgt rect top nodes x y sc nd obj tgt p lc u n c i radtop)
  (setq F (gip:g sh "F") o (gip:g shg "p") u (gip:g shg "u")
        an (rem (+ (angle '(0.0 0.0) u) (* 4.0 pi)) (/ pi 2.0)) k 1.0)
  (defun gip:ht-l3 (p z / q) (setq q (gip:rt-to-loc p o an)) (list (car q) (cadr q) z))
  (defun gip:ht-prj (q) (list (+ (car q) (* k 0.70710678 (cadr q))) (+ (caddr q) (* k 0.70710678 (cadr q)))))
  ;; ломаные в 3D
  (setq lst nil)
  (foreach r res
    (setq it (caddr (assoc (car r) geo)))
    (foreach pr (list (list (nth 2 r) nil) (list (nth 3 r) 5))
      (setq pts (mapcar '(lambda (p) (gip:ht-l3 p 0.0)) (car pr)))
      ;; подъём к ШРВ (выходы на высоте 300) и к прибору (низ прибора 100)
      (setq pts (append (list (list (car (car pts)) (cadr (car pts)) 300.0)) pts (list (list (car (last pts)) (cadr (last pts)) 100.0))))
      (setq lst (cons (list "pipe" pts (cadr pr)) lst))))
  (foreach x geo
    (setq g (cadr x) it (caddr x) hgt (float (nth 5 it)))
    (setq lst (cons (list "rad" (list (gip:ht-l3 (gip:g g "a") 100.0) (gip:ht-l3 (gip:g g "b") 100.0) (gip:ht-l3 (gip:g g "b") (+ 100.0 hgt)) (gip:ht-l3 (gip:g g "a") (+ 100.0 hgt))) nil (car x) it) lst)))
  ;; ШРВ — коробка 150 × lc × 600
  (setq lc (gip:g shg "lc") n (gip:g shg "n") c (gip:g shg "p"))
  (setq rect (list (gip:ht-add c (gip:ht-mul u (* -0.5 lc))) (gip:ht-add c (gip:ht-mul u (* 0.5 lc)))))
  (setq lst (cons (list "box" (list (gip:ht-l3 (car rect) 0.0) (gip:ht-l3 (cadr rect) 0.0)
                                     (gip:ht-l3 (gip:ht-add (cadr rect) (gip:ht-mul n 150.0)) 0.0) (gip:ht-l3 (gip:ht-add (car rect) (gip:ht-mul n 150.0)) 0.0)) nil) lst))
  ;; проекция и вписывание в поле листа (слева от узлов)
  (setq all nil)
  (foreach e lst
    (foreach q (cadr e) (setq all (cons (gip:ht-prj q) all)))
    (if (= (car e) "box") (foreach q (cadr e) (setq all (cons (gip:ht-prj (list (car q) (cadr q) 600.0)) all)))))
  (if all
    (progn
      (setq bx (list (apply 'min (mapcar 'car all)) (apply 'min (mapcar 'cadr all)) (apply 'max (mapcar 'car all)) (apply 'max (mapcar 'cadr all))))
      (setq rg (list (- (car F) 19300.0) (+ (cadr F) 4200.0) (- (car F) 10200.0) (+ (cadr F) 13000.0))
            W (- (caddr rg) (car rg)) H (- (cadddr rg) (cadr rg)))
      (setq s (min 1.0 (/ W (max 1.0 (- (caddr bx) (car bx)))) (/ H (max 1.0 (- (cadddr bx) (cadr bx))))))
      (setq dx (- (/ (+ (car rg) (caddr rg)) 2.0) (* s (/ (+ (car bx) (caddr bx)) 2.0)))
            dy (- (/ (+ (cadr rg) (cadddr rg)) 2.0) (* s (/ (+ (cadr bx) (cadddr bx)) 2.0))))
      (defun gip:ht-tr (q / p) (setq p (gip:ht-prj q)) (list (+ dx (* s (car p))) (+ dy (* s (cadr p)))))
      (foreach e lst
        (cond
          ((= (car e) "pipe") (gip:ht-pline (mapcar 'gip:ht-tr (cadr e)) 15.0 (caddr e) nil "axo"))
          ((= (car e) "rad")
           (gip:ht-pline (mapcar 'gip:ht-tr (cadr e)) 20.0 nil T "axo")
           (setq radtop (gip:ht-tr (nth 2 (cadr e))))
           (if (and (nth 4 e) (nth 9 (nth 4 e)) (/= (nth 9 (nth 4 e)) ""))
             (gip:ht-leader radtop (gip:ht-add radtop (list 500.0 600.0)) (nth 9 (nth 4 e)) nil nil "lbl")))
          ((= (car e) "box")
           (setq pts (cadr e))
           (gip:ht-pline (list (gip:ht-tr (nth 0 pts)) (gip:ht-tr (nth 1 pts)) (gip:ht-tr (list (car (nth 1 pts)) (cadr (nth 1 pts)) 600.0))
                               (gip:ht-tr (list (car (nth 0 pts)) (cadr (nth 0 pts)) 600.0))) 20.0 nil T "axo")
           (gip:ht-pline (list (gip:ht-tr (list (car (nth 0 pts)) (cadr (nth 0 pts)) 600.0)) (gip:ht-tr (list (car (nth 3 pts)) (cadr (nth 3 pts)) 600.0))
                               (gip:ht-tr (list (car (nth 2 pts)) (cadr (nth 2 pts)) 600.0)) (gip:ht-tr (list (car (nth 1 pts)) (cadr (nth 1 pts)) 600.0))) 20.0 nil nil "axo")
           (gip:ht-pline (list (gip:ht-tr (list (car (nth 2 pts)) (cadr (nth 2 pts)) 600.0)) (gip:ht-tr (nth 2 pts)) (gip:ht-tr (nth 1 pts))) 20.0 nil nil "axo"))))))
  ;; узлы подключения приборов (разные) — справа
  (setq nodes nil)
  ;; имя блока узла: префикс от панели + сторона подключения (Л/П, как определилось трассой); нет такого — «П»
  (foreach r res
    (setq nd (nth 10 (caddr (assoc (car r) geo))))
    (if (and nd (/= nd ""))
      (progn
        (setq nm (strcat nd (gip:ht-res-side r geo) "_GIP"))
        (if (not (tblsearch "BLOCK" nm)) (setq nm (strcat nd "П_GIP")))
        (if (not (member nm nodes)) (setq nodes (append nodes (list nm)))))))
  (setq sc (if (> (length nodes) 2) (/ 10200.0 (* 5452.0 (length nodes))) 1.0) y (+ (cadr F) 13900.0) i 0)
  (foreach nd nodes
    (setq y (- y (* sc 5452.0)))
    (if (tblsearch "BLOCK" nd)
      (progn (setq obj (vla-insertblock (gip:ms) (vlax-3d-point (- (car F) (* sc 11200.0) 300.0) y 0.0) nd sc sc sc 0.0))
             (gip:ht-tag-obj obj "node"))
      (princ (strcat "\nГИП: в чертеже нет блока узла «" nd "» — откройте шаблон ГИП с альбомом О."))))
  ;; принципиальная схема ШРВ
  (setq it (car (gip:ht-items data "SHRV")))
  (if (and it (tblsearch "BLOCK" (cadr it)))
    (progn
      (setq obj (vla-insertblock (gip:ms) (vlax-3d-point (- (car F) 18500.0) (+ (cadr F) 600.0) 0.0) (cadr it) 1.0 1.0 1.0 0.0))
      (gip:ht-tag-obj obj "shs")
      (gip:ht-mtext (list (- (car F) 18500.0) (+ (cadr F) 3900.0)) "\\pxqc;Принципиальная схема\\Pколлекторов отопления" 150.0 2600.0 7 nil "0" "shs")))
  T)

;; ---------------------------------------------------------------- спецификация (форма ГИП, по 27 строк на лист)
(defun gip:ht-num (x) (if (= (type x) 'STR) x (gip:repl (rtos x 2 (if (equal x (fix x) 1e-9) 0 1)) "." ",")))
(defun gip:ht-ceil (x) (if (> x (fix x)) (1+ (fix x)) (fix x)))
;; строк в сетке листа спецификации: сетка — вставка на слое FORMAT, первая строка на F+13600, шаг 400;
;; низ сетки по габариту вставки; не удалось — 19 (меньшая из сеток шаблона ГИП)
(defun gip:ht-spec-cap (sh / F ss i e o mn mx r cap)
  (setq F (gip:g sh "F") cap nil)
  (if (setq ss (ssget "_X" '((0 . "INSERT") (8 . "FORMAT"))))
    (progn
      (setq i 0)
      (while (< i (sslength ss))
        (setq e (ssname ss i) i (1+ i))
        (if (gip:rt-in (cdr (assoc 10 (entget e))) (gip:g sh "box"))
          (progn
            (setq o (vlax-ename->vla-object e) r (vl-catch-all-apply 'vla-getboundingbox (list o 'mn 'mx)))
            (if (and (not (vl-catch-all-error-p r)) mn)
              (setq cap (fix (/ (+ (- 13800.0 (- (cadr (vlax-safearray->list mn)) (cadr F))) 50.0) 400.0)))))))))
  (if (and cap (>= cap 5) (<= cap 30)) cap 19))
(defun gip:ht-spec (specs data t1 t2 / rows sec pos fpos q k it pages cur y F ri lay caps)
  (setq rows (list (list "sys" (if *gip:ht-sys* *gip:ht-sys* "О"))) pos 0 fpos nil)
  (foreach it data
    (cond
      ((= (vl-symbol-name (car it)) "SEC")
       (if (> pos 0) (setq rows (append rows (list nil))))
       (setq pos (1+ pos))
       (if (= (cadr it) "") (setq fpos pos) (setq rows (append rows (list (list "sec" pos (cadr it)))) fpos nil)))
      ((member (vl-symbol-name (car it)) '("ROW" "PIPE"))
       (setq q (nth 5 it))
       (if (= (vl-symbol-name (car it)) "PIPE")
         (setq k (float (nth 6 it))
               q (cond ((= q "T") (float (* 5 (gip:ht-ceil (/ (* (+ t1 t2) k) 5.0)))))
                       ((= q "T1") (float (gip:ht-ceil (* t1 k))))
                       ((= q "T2") (float (gip:ht-ceil (* t2 k))))
                       ((= q "TAPE1") (max 1 (gip:ht-ceil (/ (* t1 k) 25.0))))
                       ((= q "TAPE2") (max 1 (gip:ht-ceil (/ (* t2 k) 25.0))))
                       (*gip:ht-qfn* (apply *gip:ht-qfn* (list q k)))
                       (T 0))
           q (if (= (type q) 'REAL) (strcat (gip:ht-num q) (if (equal q (fix q) 1e-9) ",0" "")) q)))
       (setq rows (append rows (list (list "row" fpos (nth 1 it) (nth 2 it) (nth 3 it) (nth 4 it) q))) fpos nil))))
  ;; листы
  ;; *gip:ht-row0* — занятые строки в начале каждого листа (ручные записи), по листам; nil — листы пустые
  (setq pages nil cur nil caps (mapcar 'gip:ht-spec-cap specs))
  (foreach r rows
    (if (>= (length cur) (- (gip:nz (nth (length pages) caps) 19) (gip:nz (nth (length pages) *gip:ht-row0*) 0))) (setq pages (append pages (list cur)) cur nil))
    (setq cur (append cur (list r))))
  (if cur (setq pages (append pages (list cur))))
  (if (> (length pages) (length specs))
    (princ (strcat "\nГИП: спецификация занимает " (itoa (length pages)) " листа, в альбоме О листов спецификации " (itoa (length specs)) " — добавьте лист.")))
  (setq lay (gip:layer "TEXT"))
  (foreach pg pages
    (if specs
      (progn
        (setq F (gip:g (car specs) "F") specs (cdr specs) ri (gip:nz (nth (vl-position pg pages) *gip:ht-row0*) 0))
        (foreach r pg
          (setq y (+ (cadr F) 13600.0 (* ri -400.0)))
          (cond
            ((null r) nil)
            ((= (car r) "sys") (gip:ht-mtext (list (- (car F) 15960.0) y) (strcat "\\pxi1,qc;" (cadr r)) 150.0 6000.0 5 nil lay "spec"))
            ((= (car r) "sec")
             (gip:ht-mtext (list (- (car F) 19460.0) y) (strcat "\\pxqc;" (itoa (cadr r))) 150.0 1000.0 5 nil lay "spec")
             (gip:ht-mtext (list (- (car F) 15960.0) y) (strcat "\\pxl1,sm0.7,ql;{\\C256;" (caddr r) "}") 150.0 6000.0 5 nil lay "spec"))
            (T
             (if (cadr r) (gip:ht-mtext (list (- (car F) 19460.0) y) (strcat "\\pxqc;" (itoa (cadr r))) 150.0 1000.0 5 nil lay "spec"))
             (gip:ht-mtext (list (- (car F) 15960.0) y) (strcat "\\pxl1,sm0.7,ql;" (nth 2 r)) 150.0 6000.0 5 nil lay "spec")
             (if (/= (nth 3 r) "") (gip:ht-mtext (list (- (car F) 11210.0) y) (strcat "\\pxqc;" (nth 3 r)) 150.0 3500.0 5 nil lay "spec"))
             (if (/= (nth 4 r) "") (gip:ht-mtext (list (- (car F) 6635.0) y) (strcat "\\pxqc;{\\C256;" (nth 4 r) "}") 150.0 1950.0 5 nil lay "spec"))
             (if (/= (nth 5 r) "") (gip:ht-mtext (list (- (car F) 5110.0) y) (strcat "\\pxsm0.75,qc;{\\C256;" (nth 5 r) "}") 150.0 1100.0 5 nil lay "spec"))
             (if (nth 6 r) (gip:ht-mtext (list (- (car F) 3960.0) y) (strcat "\\pxsm0.75,qc;{\\C256;" (gip:ht-num (nth 6 r)) "}") 150.0 1200.0 5 nil lay "spec"))))
          (setq ri (1+ ri))))))
  (length pages))

;; ---------------------------------------------------------------- команды (панель GIPHEAT вызывает их по имени)
(defun gip:ht-plan-sheet (/ s) (gip:ht-sheet (gip:ht-sheets) "plan"))
(defun c:GIPHEATREAD () (gip:ht-write-reg) (princ))
(defun c:GIPHEATSCAN (/ sh w r)
  (setq sh (gip:ht-plan-sheet))
  (if (null sh)
    (gip:ht-report nil "нет листа «План … с сетями Т1, Т2» (альбом О).")
    (progn
      (setq r (vl-catch-all-apply 'gip:ht-scan (list sh)))
      (cond ((vl-catch-all-error-p r) (gip:ht-report nil (strcat "ошибка поиска окон: " (vl-catch-all-error-message r))))
            ((null r) (gip:ht-report nil "окна не найдены: нет стен подложки на листе плана Т1, Т2 (сначала «Помещения» — разложить подложку по листам)."))
            (T (gip:ht-report T (strcat "найдено окон: " (itoa (length r)) "."))))))
  (gip:ht-write-reg)
  (princ))
(defun c:GIPHEATSHRV (/ sh p segs nw)
  (setq sh (gip:ht-plan-sheet))
  (if (null sh)
    (gip:ht-report nil "нет листа плана Т1, Т2.")
    (if (setq p (getpoint "\nУкажите место ШРВ отопления (у стены, со стороны помещения): "))
      (progn
        (setq segs (gip:ht-wall-segs (gip:g sh "box")) nw (gip:ht-near-wall (list (car p) (cadr p)) segs))
        (if nw
          (progn (gip:ht-put "GIPHEATSHRV" (list (car (car nw)) (cadr (car nw)) (car (cadr nw)) (cadr (cadr nw))))
                 (gip:ht-report T "ШРВ отопления указан."))
          (gip:ht-report nil "рядом с точкой нет стены (ближе 800 мм). Укажите точку у стены.")))))
  (gip:ht-write-reg)
  (princ))
;; окно вручную: два края проёма по грани стены и точка в помещении
(defun c:GIPHEATWIN (/ a b c n u wl id)
  (if (and (setq a (getpoint "\nКрай окна (по внутренней грани стены): "))
           (setq b (getpoint a "\nДругой край окна: "))
           (setq c (getpoint "\nТочка внутри помещения: ")))
    (progn
      (setq a (gip:ht-p2 a) b (gip:ht-p2 b) u (gip:ht-unit (gip:ht-sub b a)) n (gip:ht-left u))
      (if (< (gip:ht-dot (gip:ht-sub (gip:ht-p2 c) a) n) 0.0) (setq n (gip:ht-mul n -1.0)))
      (setq wl (gip:ht-windows) id (1+ (apply 'max (cons 0 (mapcar 'car wl)))))
      (gip:ht-put "GIPHEATW" (append wl (list (list id 0 (car a) (cadr a) (car b) (cadr b) (car n) (cadr n) 1))))
      (gip:ht-report T "окно добавлено; нажмите «Найти окна», чтобы привязать его к помещению.")))
  (gip:ht-write-reg)
  (princ))
(defun c:GIPHEATWINDEL (/ p wl best bd d)
  (if (setq p (getpoint "\nУкажите окно для удаления: "))
    (progn
      (setq wl (gip:ht-windows) best nil bd 1500.0)
      (foreach w wl
        (setq d (distance (gip:ht-p2 p) (list (/ (+ (nth 2 w) (nth 4 w)) 2.0) (/ (+ (nth 3 w) (nth 5 w)) 2.0))))
        (if (< d bd) (setq bd d best w)))
      (if best (progn (gip:ht-put "GIPHEATW" (vl-remove best wl)) (gip:ht-report T (strcat "окно " (itoa (car best)) " удалено.")))
               (gip:ht-report nil "рядом нет окна."))))
  (gip:ht-write-reg)
  (princ))
(defun c:GIPHEATBUILD (/ data st r)
  (setq data (gip:ht-read-in))
  (if (setq st (car (gip:ht-items data "STATE"))) (gip:dict-put "GIPHEATSTATE" (cadr st)))
  (setq r (vl-catch-all-apply 'gip:ht-build (list data)))
  (if (vl-catch-all-error-p r) (gip:ht-report nil (strcat "ошибка построения: " (vl-catch-all-error-message r))))
  (gip:ht-write-reg)
  (princ))
