;;; ============================================================================
;;; КОНДИЦИОНИРОВАНИЕ (GIPCOND): внутренние и наружные блоки, фреонные трассы Х1/Х2, дренаж Д1 в К1,
;;; подписи, аксонометрическая схема, спецификация. Оформление — как в ручных проектах ГИП (Ильменский 859, лист «КВ»):
;;;   • слой «кондиционирование»; жидкостная труба — красная (1), газовая — цвет слоя (синий); ширина 15; пара через 50 мм;
;;;   • блоки на плане — замкнутые полилинии ширины 20 (габарит из базы: ширина × глубина);
;;;   • дренаж — зелёный (3), ширина 15, в стояк К1 (окружность R25), уклон 0,01 — текст на слое A_B1;
;;;   • выноски высотой 150: «Внутренний блок \PHaier AS20HQJ2HRA-W», «Наружный блок \PHaier 1U20HQJ2FRA»,
;;;     «ф6,35\Pф9,52\Pопуск», «Дренаж\Pф20», «В систему К1 \Pс разрывом струи \PHL138H с "сухим" \Pзатвором».
;;; Схемы систем: split — у каждого внутреннего блока свой наружный; multi — несколько внутренних на один наружный
;;; (своя пара от каждого); vrf — дерево с рефнетами, диаметры участков по суммарной мощности ниже по потоку.
;;; Трассировка — ядро отопления (gip:ht-route) с другими параметрами. Всё созданное помечено xdata GIPCOND.
;;; ============================================================================
(setq *gip:cd-app* "GIPCOND" *gip:cd-lay* "кондиционирование" *gip:cd-dlay* "A_B1"
      *gip:cd-in* "gip_cond_in.txt" *gip:cd-out* "gip_cond_out.txt" *gip:cd-regf* "gip_cond_reg.txt"
      *gip:cd-len* nil *gip:cd-an* 0.0)

;; выполнить fn с рисованием/метками отопления, перенацеленными на кондиционирование
(defun gip:cd-with (fn args / sa sl sp sh ss sq sr r)
  (setq sa *gip:ht-app* sl *gip:ht-lay* sp *gip:ht-pair* sh *gip:ht-pitch* ss *gip:ht-sys* sq *gip:ht-qfn* sr *gip:ht-row0*)
  (setq *gip:ht-app* *gip:cd-app* *gip:ht-lay* *gip:cd-lay*)
  (setq r (vl-catch-all-apply fn args))
  (setq *gip:ht-app* sa *gip:ht-lay* sl *gip:ht-pair* sp *gip:ht-pitch* sh *gip:ht-sys* ss *gip:ht-qfn* sq *gip:ht-row0* sr)
  r)

;; ---------------------------------------------------------------- листы альбома ВиК
;; рамки А3-GIP-ALBOM/BOOK с названием в штампе; помеченные GIPHEAT (альбом О) пропускаются.
(defun gip:cd-frames (/ ss tss i e o nm F res j te tp ttl best sc dx dy book x)
  (setq res nil ss (ssget "_X" '((0 . "INSERT"))) tss (ssget "_X" '((0 . "MTEXT,TEXT"))))
  (if ss
    (progn
      (setq i 0)
      (while (< i (sslength ss))
        (setq e (ssname ss i) i (1+ i) o (vlax-ename->vla-object e) nm (vl-catch-all-apply 'vlax-get (list o 'EffectiveName)))
        (if (and (= (type nm) 'STR) (member nm '("А3-GIP-ALBOM" "А3-GIP-BOOK")))
          (progn
            (setq F (cdr (assoc 10 (entget e))) book (= nm "А3-GIP-BOOK") ttl "" best nil j 0
                  x (cdr (assoc -3 (entget e (list "GIPHEAT")))))
            (if (and tss (null x))
              (progn
                (while (< j (sslength tss))
                  (setq te (ssname tss j) j (1+ j) tp (cdr (assoc 10 (entget te))) dx (- (car tp) (car F)) dy (- (cadr tp) (cadr F)))
                  (if (and (> dx -8750.0) (< dx -3750.0) (> dy -1875.0) (< dy 3125.0))
                    (progn (setq sc (+ (* (+ dx 6250.0) (+ dx 6250.0)) (* (- dy 625.0) (- dy 625.0))))
                           (if (or (null best) (< sc best)) (setq best sc ttl (gip:mt-plain (entget te)))))))
                (setq res (cons (list (cons "F" (list (car F) (cadr F))) (cons "title" ttl) (cons "e" e) (cons "low" (gip:lower ttl))
                                      (cons "box" (if book (list (- (car F) 14850.0) (cadr F) (car F) (+ (cadr F) 20960.0))
                                                      (list (- (car F) *gip:SW*) (cadr F) (car F) (+ (cadr F) *gip:SHH*)))))
                                res)))))))))
  res)
(defun gip:cd-x1 (t1) (or (gip:has t1 "х1") (gip:has t1 "x1") (gip:has t1 " кв")))
;; роли: plan — «План … Х1 …» (или «… сетями КВ»), scheme — «Схема … Х1 …», spec — «Спецификация …» в той же колонке, что и план
(defun gip:cd-sheets (/ fr pl sch res t1)
  (setq fr (gip:cd-frames) pl nil sch nil res nil)
  (foreach s fr
    (setq t1 (gip:g s "low"))
    (cond ((and (gip:has t1 "план") (gip:cd-x1 t1) (or (null pl) (> (cadr (gip:g s "F")) (cadr (gip:g pl "F"))))) (setq pl s))
          ((and (gip:has t1 "схем") (gip:cd-x1 t1) (or (null sch) (> (cadr (gip:g s "F")) (cadr (gip:g sch "F"))))) (setq sch s))))
  (if pl (setq res (cons (gip:s pl "role" "plan") res)))
  (if sch (setq res (cons (gip:s sch "role" "scheme") res)))
  (if pl
    (foreach s fr
      (if (and (gip:has (gip:g s "low") "спецификац") (< (abs (- (car (gip:g s "F")) (car (gip:g pl "F")))) 50.0))
        (setq res (cons (gip:s s "role" "spec") res)))))
  (vl-sort res '(lambda (a b) (> (cadr (gip:g a "F")) (cadr (gip:g b "F"))))))
(defun gip:cd-sheet (sheets role) (vl-some '(lambda (s) (if (= (gip:g s "role") role) s)) sheets))
(defun gip:cd-specs (sheets) (vl-remove-if-not '(lambda (s) (= (gip:g s "role") "spec")) sheets))

;; ---------------------------------------------------------------- точки: (id вид px py nx ny)
;; вид: "I" — внутренний блок (точка на грани стены, нормаль в помещение); "O" — наружный блок (середина задней грани,
;; нормаль от стены); "R" — подключение к магистрали VRF (стояк); "K" — выпуск дренажа в К1.
(defun gip:cd-units () (gip:ht-get "GIPCONDU"))
(defun gip:cd-units-put (l) (gip:ht-put "GIPCONDU" l))
(defun gip:cd-of (kind) (vl-remove-if-not '(lambda (u) (= (cadr u) kind)) (gip:cd-units)))
(defun gip:cd-p (u) (list (nth 2 u) (nth 3 u)))
(defun gip:cd-n (u) (list (nth 4 u) (nth 5 u)))
(defun gip:cd-next-id (/ l) (setq l (gip:cd-units)) (1+ (apply 'max (cons 0 (mapcar 'car l)))))
;; ближайшая грань стены в радиусе rmax: (точка нормаль-к-p)
(defun gip:cd-near-wall (p segs rmax / best bd a b ab t1 q d nn)
  (setq best nil bd rmax)
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

;; ---------------------------------------------------------------- связи внутренних блоков с наружными
;; split: каждому внутреннему — ближайший свободный наружный; multi/vrf: все — к одному (ближайшему к центру тяжести).
(defun gip:cd-auto-links (mode / ins outs res free best bd d c)
  (setq ins (gip:cd-of "I") outs (append (gip:cd-of "O") (gip:cd-of "R")) res nil)
  (if outs
    (if (= mode "split")
      (progn
        (setq free outs)
        (foreach u ins
          (setq best nil bd 1.0e99)
          (foreach o (if free free outs)
            (setq d (distance (gip:cd-p u) (gip:cd-p o)))
            (if (< d bd) (setq bd d best o)))
          (setq free (vl-remove best free) res (cons (cons (car u) (car best)) res))))
      (progn
        (setq c (list 0.0 0.0))
        (foreach u ins (setq c (gip:ht-add c (gip:ht-mul (gip:cd-p u) (/ 1.0 (length ins))))))
        (setq best nil bd 1.0e99)
        (foreach o outs (setq d (distance c (gip:cd-p o))) (if (< d bd) (setq bd d best o)))
        (foreach u ins (setq res (cons (cons (car u) (car best)) res))))))
  (reverse res))

;; ---------------------------------------------------------------- геометрия блоков
;; прямоугольник W×D от середины задней грани p по нормали n
(defun gip:cd-rect (p n W D / u)
  (setq u (gip:ht-left n))
  (list (gip:ht-add p (gip:ht-mul u (* -0.5 W))) (gip:ht-add p (gip:ht-mul u (* 0.5 W)))
        (gip:ht-add (gip:ht-add p (gip:ht-mul u (* 0.5 W))) (gip:ht-mul n D))
        (gip:ht-add (gip:ht-add p (gip:ht-mul u (* -0.5 W))) (gip:ht-mul n D))))

;; ---------------------------------------------------------------- данные от панели (gip_cond_in.txt)
;;   (STATE "json") (OPT "mode" "split|multi|vrf")
;;   (UNIT id "марка" "модель" W D H "жидк" "газ" мощность_кВт)    — габариты и диаметры (строки «6,35»)
;;   (LINK внутр наруж) (VRFT до_кВт "жидк" "газ")                 — подбор диаметров VRF по мощности ниже по потоку
;;   (SEC …) (ROW …) (PIPE "наим" "тип" "изгот" "ед" "ключ" коэф)  — ключи CU:6,35 INS:6,35 DR DRE DRT REF HL N
(defun gip:cd-read-in (/ s r)
  (setq s *gip:ht-in* *gip:ht-in* *gip:cd-in* r (gip:ht-read-in) *gip:ht-in* s)
  r)
(defun gip:cd-num (s) (if (numberp s) (float s) (atof (gip:repl s "," "."))))

;; ---------------------------------------------------------------- прорежение совпадающих трасс (дерево)
;; Контуры дерева (VRF, дренаж) строятся «лучами» от корня с нулевым шагом — общие участки совпадают.
;; Каждый следующий контур рисуется только от точки, где он отходит от уже нарисованных (рефнет / тройник).
(setq *gip:cd-st* 25.0)
(defun gip:cd-key (p o)
  (+ (* (fix (+ 5000.5 (/ (- (car p) (car o)) 10.0))) 10007) (fix (+ 5000.5 (/ (- (cadr p) (cadr o)) 10.0)))))
;; точки по длине через шаг: ((s p) …)
(defun gip:cd-samp (pts / res s a b l n i)
  (setq res (list (list 0.0 (car pts))) s 0.0)
  (while (cdr pts)
    (setq a (car pts) b (cadr pts) l (distance a b) n (max 1 (fix (/ l *gip:cd-st*))) i 1)
    (while (<= i n)
      (setq res (cons (list (+ s (* l (/ (float i) n))) (gip:ht-add a (gip:ht-mul (gip:ht-sub b a) (/ (float i) n)))) res) i (1+ i)))
    (setq s (+ s l) pts (cdr pts)))
  (reverse res))
;; часть ломаной от длины s0 до конца
(defun gip:cd-cut (pts s0 / res s a b l)
  (setq res nil s 0.0)
  (while (cdr pts)
    (setq a (car pts) b (cadr pts) l (distance a b))
    (cond ((null res)
           (if (>= (+ s l) s0)
             (setq res (list b (gip:ht-add a (gip:ht-mul (gip:ht-sub b a) (if (> l 1e-9) (/ (- s0 s) l) 0.0)))))))
          (T (setq res (cons b res))))
    (setq s (+ s l) pts (cdr pts)))
  (gip:rt-simplify (reverse res)))
;; lines: ((id pts) …) в порядке рисования; o — опорная точка ключей. Результат: ((id cutpts branchpt|nil) …);
;; нагрузка: в *gip:cd-load* для каждой точки выборки — список id контуров (для подбора диаметров)
(defun gip:cd-dedupe (lines o / res smp fpos k bp prev cov)
  (setq res nil)
  (foreach ln lines
    (setq smp (gip:cd-samp (cadr ln)) fpos nil prev nil)
    (foreach sp smp
      (setq k (gip:cd-key (cadr sp) o) cov (gip:rt-g "GCDK" k))
      (if (and (null fpos) (null cov)) (setq fpos (if prev prev sp)))
      (gip:rt-s "GCDK" k (cons (car ln) cov))
      (setq prev sp))
    (cond ((null fpos) nil)                                         ;; целиком по чужой трассе
          ((< (car fpos) 1.0) (setq res (cons (list (car ln) (cadr ln) nil) res)))
          (T (setq bp (cadr fpos) res (cons (list (car ln) (gip:cd-cut (cadr ln) (car fpos)) bp) res)))))
  (reverse res))
;; длины ломаных по диаметрам (VRF): участок выборки -> мощность контуров через него -> диаметр
(defun gip:cd-tree-len (lines o caps tbl outd / acc smp k ids cap d prev pr l)
  (setq acc nil)
  (foreach ln lines
    (setq smp (gip:cd-samp (cadr ln)) prev nil)
    (foreach sp smp
      (if prev
        (progn
          (setq k (gip:cd-key (cadr sp) o))
          ;; участок считается один раз — при первом проходящем контуре
          (if (null (gip:rt-g "GCDY" k))
            (progn
              (gip:rt-s "GCDY" k 1)
              (setq ids (gip:rt-g "GCDK" k) cap 0.0)
              (foreach i ids (setq cap (+ cap (gip:nz (cdr (assoc i caps)) 0.0))))
              (setq d (if (and outd (car outd) (= (length ids) (length lines))) outd (gip:cd-vrf-d cap tbl))
                    l (- (car sp) (car prev)))
              (foreach x (list (car d) (cadr d))
                (setq pr (assoc x acc))
                (setq acc (if pr (subst (cons x (+ (cdr pr) l)) pr acc) (cons (cons x l) acc))))))))
      (setq prev sp)))
  acc)
(defun gip:cd-vrf-d (cap tbl / r)
  (setq r (vl-some '(lambda (x) (if (<= cap (+ (car x) 1e-6)) (cdr x))) tbl))
  (if r r (cdr (last tbl))))

;; проход наружной стены: от точки p (за стеной) по направлению dir — самая дальняя грань стены в пределах 900 мм
(defun gip:cd-through (p dir segs / best a b d e den t1 t2 q)
  (setq best nil q (gip:ht-add p (gip:ht-mul dir 900.0)))
  (foreach s segs
    (setq a (list (car s) (cadr s)) b (list (caddr s) (cadddr s)) d (gip:ht-sub q p) e (gip:ht-sub b a)
          den (- (* (car d) (cadr e)) (* (cadr d) (car e))))
    (if (> (abs den) 1e-9)
      (progn
        (setq t1 (/ (- (* (- (car a) (car p)) (cadr e)) (* (- (cadr a) (cadr p)) (car e))) den)
              t2 (/ (- (* (- (car a) (car p)) (cadr d)) (* (- (cadr a) (cadr p)) (car d))) den))
        (if (and (> t1 0.0) (<= t1 1.0) (>= t2 0.0) (<= t2 1.0) (or (null best) (> t1 best))) (setq best t1)))))
  (if best (gip:ht-add p (gip:ht-mul (gip:ht-sub q p) best))))
;; ломаная с добавленным в начало участком от плоскости задней грани блока (точка c, нормаль dir)
(defun gip:cd-stub (pts c dir / s0)
  (setq s0 (car pts))
  (gip:rt-simplify (cons (gip:ht-sub s0 (gip:ht-mul dir (gip:ht-dot (gip:ht-sub s0 c) dir))) pts)))

;; ---------------------------------------------------------------- стили
(defun gip:cd-leader (p0 p1 txt col kind / ml r)
  (setq r (vl-catch-all-apply 'vlax-invoke (list (gip:ms) 'AddMLeader (list (car p0) (cadr p0) 0.0 (car p1) (cadr p1) 0.0) 0)))
  (if (and (not (vl-catch-all-error-p r)) r)
    (progn
      (setq ml (if (listp r) (car r) r))
      (vl-catch-all-apply 'vla-put-textstring (list ml txt))
      (vl-catch-all-apply 'vla-put-layer (list ml (gip:layer *gip:ht-lay*)))
      (vl-catch-all-apply 'vla-put-textstylename (list ml (gip:ht-style)))
      (vl-catch-all-apply 'vla-put-textheight (list ml 150.0))
      (vl-catch-all-apply 'vla-put-arrowheadsize (list ml 40.0))
      (vl-catch-all-apply 'vla-put-landinggap (list ml 6.0))
      (vl-catch-all-apply 'vla-put-dogleglength (list ml 134.0))
      (if col (vl-catch-all-apply 'vla-put-color (list ml col)))
      (gip:ht-tag-obj ml kind))
    (gip:ht-leader p0 p1 txt col nil kind)))
(defun gip:cd-circle (c r col kind)
  (gip:layer *gip:cd-lay*)
  (gip:ht-mk (list '(0 . "CIRCLE") '(100 . "AcDbEntity") (cons 8 *gip:cd-lay*) (cons 62 (if col col 256)) '(100 . "AcDbCircle")
                   (list 10 (car c) (cadr c) 0.0) (cons 40 (float r))) kind))
(defun gip:cd-text (p txt h ang col lay kind)
  (gip:layer lay)
  (gip:ht-mk (list '(0 . "TEXT") '(100 . "AcDbEntity") (cons 8 lay) (cons 62 (if col col 256)) '(100 . "AcDbText")
                   (list 10 (car p) (cadr p) 0.0) (cons 40 (float h)) (cons 1 txt) (cons 50 ang) (cons 7 (gip:ht-style)) '(100 . "AcDbText")) kind))
;; уклон: стрелка вдоль участка a->b (вниз по течению) и «0,01» рядом
(defun gip:cd-slope (a b kind / u n m p0 p1 d)
  (setq u (gip:ht-unit (gip:ht-sub b a)) n (gip:ht-left u) m (gip:ht-mul (gip:ht-add a b) 0.5)
        p0 (gip:ht-add m (gip:ht-add (gip:ht-mul n 120.0) (gip:ht-mul u -200.0))) p1 (gip:ht-add p0 (gip:ht-mul u 413.0)))
  (gip:layer *gip:cd-dlay*)
  (setq d (list '(0 . "LWPOLYLINE") '(100 . "AcDbEntity") (cons 8 *gip:cd-dlay*) '(62 . 3) '(100 . "AcDbPolyline") '(90 . 3) '(70 . 0)
                (list 10 (car p0) (cadr p0)) '(40 . 0.0) '(41 . 0.0)
                (list 10 (car (gip:ht-add p0 (gip:ht-mul u 264.0))) (cadr (gip:ht-add p0 (gip:ht-mul u 264.0)))) '(40 . 60.0) '(41 . 0.0)
                (list 10 (car p1) (cadr p1))))
  (gip:ht-mk d kind)
  (gip:cd-text (gip:ht-add p0 (gip:ht-add (gip:ht-mul n 80.0) (gip:ht-mul u 0.0))) "0,01" 150.0 0.0 3 *gip:cd-dlay* kind))

;; ---------------------------------------------------------------- построение
(defun gip:cd-build (data / sheets plan sch specs box segs mode units ins outs ks links info caps tbl res r rr o u it w g
                     id lines lg lq cut ln tot txt mid lens drl dre drt nref nmiss i p q root face rdir pend side
                     ends ea eb dd dr gl grp k dk kres freon drains pts n a b lst ok msg seen xs best bd d pen)
  (setq sheets (gip:cd-sheets) plan (gip:cd-sheet sheets "plan") sch (gip:cd-sheet sheets "scheme") specs (gip:cd-specs sheets))
  (setq mode (gip:ht-opt data "mode" "split") ins (gip:cd-of "I") outs (append (gip:cd-of "O") (gip:cd-of "R")) ks (gip:cd-of "K"))
  (cond
    ((null plan) (gip:cd-report nil "нет листа «План квартиры с сетями Х1, Х2, Д1» (альбом ВиК). Откройте шаблон ГИП.") nil)
    ((null ins) (gip:cd-report nil "не указаны внутренние блоки (кнопка «Внутренние блоки» на панели).") nil)
    ((null outs) (gip:cd-report nil "не указан наружный блок или точка подключения к магистрали VRF.") nil)
    (T
     (regapp *gip:cd-app*)
     (setq box (gip:g plan "box") segs (gip:ht-wall-segs box))
     ;; данные блоков от панели: id -> (марка модель W D H жидк газ мощн)
     (setq info nil)
     (foreach it (gip:ht-items data "UNIT") (setq info (cons (cons (nth 1 it) (cddr it)) info)))
     (defun gip:cd-inf (id k d / x) (setq x (cdr (assoc id info))) (if (and x (nth k x)) (nth k x) d))
     (setq links (mapcar '(lambda (it) (cons (nth 1 it) (nth 2 it))) (gip:ht-items data "LINK")))
     (foreach x (gip:cd-auto-links mode) (if (null (assoc (car x) links)) (setq links (cons x links))))
     (setq tbl (mapcar '(lambda (it) (list (float (nth 1 it)) (nth 2 it) (nth 3 it))) (gip:ht-items data "VRFT")))
     (if (null tbl) (setq tbl '((5.6 "6,35" "12,7") (16.0 "9,52" "15,88") (22.4 "9,52" "19,05") (33.0 "9,52" "22,2") (999.0 "12,7" "28,58"))))
     (setq caps (mapcar '(lambda (u) (cons (car u) (gip:cd-num (gip:cd-inf (car u) 7 2.5)))) ins))
     ;; стереть прежнее
     (gip:ht-erase box '("unit" "pipe" "drain" "lbl" "k1"))
     (if sch (gip:ht-erase (gip:g sch "box") '("axo" "lbl")))
     (foreach s specs (gip:ht-erase (gip:g s "box") '("spec")))
     (gip:layer *gip:cd-lay*)
     ;; блоки
     (foreach u ins
       (gip:ht-pline (gip:cd-rect (gip:cd-p u) (gip:cd-n u) (float (gip:cd-inf (car u) 2 800.0)) (float (gip:cd-inf (car u) 3 200.0))) 20.0 1 T "unit"))
     (foreach u (gip:cd-of "O")
       (gip:ht-pline (gip:cd-rect (gip:cd-p u) (gip:cd-n u) (float (gip:cd-inf (car u) 2 800.0)) (float (gip:cd-inf (car u) 3 300.0))) 20.0 1 T "unit"))
     (foreach u (gip:cd-of "R") (gip:cd-circle (gip:cd-p u) 50.0 1 "unit"))
     ;; ---- фреон
     (setq freon nil lens nil nmiss 0 nref 0 *gip:cd-an* (if segs (gip:rt-angle segs) 0.0))
     (foreach o outs
       (setq grp (vl-remove-if-not '(lambda (u) (= (cdr (assoc (car u) links)) (car o))) ins))
       (if grp
         (progn
           (setq face (gip:cd-p o) rdir (gip:ht-mul (gip:cd-n o) (if (= (cadr o) "O") -1.0 1.0)) root face pen nil)
           ;; наружный блок: трубы проходят стену прямо за блоком — трасса начинается у внутренней грани стены
           (if (and (= (cadr o) "O") segs (setq pen (gip:cd-through (gip:cd-p o) rdir segs)))
             (setq face pen root (gip:ht-add pen (gip:ht-mul rdir 300.0))))
           (setq rr nil)
           (foreach u grp
             (setq p (gip:cd-p u) n (gip:cd-n u) w (float (gip:cd-inf (car u) 2 800.0)) dd (float (gip:cd-inf (car u) 3 200.0))
                   a (gip:ht-add (gip:ht-add p (gip:ht-mul (gip:ht-left n) (* -0.5 w))) (gip:ht-mul n dd))
                   b (gip:ht-add (gip:ht-add p (gip:ht-mul (gip:ht-left n) (* 0.5 w))) (gip:ht-mul n dd)))
             (setq rr (cons (list (car u) (gip:ht-add p (gip:ht-mul n (+ dd 300.0))) a b) rr)))
           (setq rr (reverse rr))
           (setq *gip:ht-pair* 25.0 *gip:ht-pitch* (if (= mode "vrf") 0.0 100.0))
           (setq res (if segs (gip:ht-route segs rr root face rdir) nil))
           (setq nmiss (+ nmiss (- (length grp) (length res))))
           ;; проход стены: от задней грани наружного блока до начала трассы
           (if pen
             (setq res (mapcar '(lambda (r) (list (car r) (cadr r) (gip:cd-stub (nth 2 r) (gip:cd-p o) rdir) (gip:cd-stub (nth 3 r) (gip:cd-p o) rdir)
                                                  (+ (nth 4 r) (distance (gip:cd-p o) pen)) (+ (nth 5 r) (distance (gip:cd-p o) pen)))) res)))
           (if (= mode "vrf")
             ;; дерево: рисуем отходящие части; рефнеты в точках отхода
             (progn
               (setq lq (gip:cd-dedupe (mapcar '(lambda (r) (list (car r) (nth 2 r))) res) face))
               (setq xs (gip:cd-tree-len (mapcar '(lambda (r) (list (car r) (nth 2 r))) res) face caps tbl
                                         (if (gip:cd-inf (car o) 5 nil) (list (gip:cd-inf (car o) 5 nil) (gip:cd-inf (car o) 6 nil)) nil)))
               (gip:rt-free)
               (setq lg (gip:cd-dedupe (mapcar '(lambda (r) (list (car r) (nth 3 r))) res) face))
               (gip:rt-free)
               (foreach x lq (gip:ht-pline (cadr x) 15.0 1 nil "pipe")
                 (if (caddr x) (progn (setq nref (1+ nref)) (gip:cd-circle (caddr x) 40.0 1 "pipe"))))
               (foreach x lg (gip:ht-pline (cadr x) 15.0 nil nil "pipe"))
               (foreach x xs (setq lens (gip:cd-acc lens (car x) (/ (cdr x) 1000.0)))))
             (foreach r res
               (gip:ht-pline (nth 2 r) 15.0 1 nil "pipe")
               (gip:ht-pline (nth 3 r) 15.0 nil nil "pipe")
               (setq lens (gip:cd-acc lens (gip:cd-inf (car r) 5 "6,35") (/ (nth 4 r) 1000.0))
                     lens (gip:cd-acc lens (gip:cd-inf (car r) 6 "9,52") (/ (nth 5 r) 1000.0)))))
           ;; опуски к внутренним блокам (по 1,5 м на трубу) и к наружному (1 м)
           (foreach r res
             (setq lens (gip:cd-acc lens (gip:cd-inf (car r) 5 "6,35") 1.5) lens (gip:cd-acc lens (gip:cd-inf (car r) 6 "9,52") 1.5))
             (setq freon (cons (list (car r) (cadr r) (nth 2 r) (nth 3 r) (car o)) freon)))
           (if res (setq lens (gip:cd-acc lens (gip:cd-inf (car (car res)) 5 "6,35") 1.0) lens (gip:cd-acc lens (gip:cd-inf (car (car res)) 6 "9,52") 1.0))))))
     ;; ---- дренаж: к ближайшему выпуску К1, со свободного конца блока
     (setq drains nil drl 0.0 dre 0 drt 0)
     (foreach kp ks
       (setq grp nil)
       (foreach u ins
         (setq best nil bd 1.0e99)
         (foreach k2 ks (setq d (distance (gip:cd-p u) (gip:cd-p k2))) (if (< d bd) (setq bd d best k2)))
         (if (= (car best) (car kp)) (setq grp (cons u grp))))
       (setq grp (reverse grp))
       (if grp
         (progn
           (setq rr nil)
           (foreach u grp
             (setq p (gip:cd-p u) n (gip:cd-n u) w (float (gip:cd-inf (car u) 2 800.0)) dd (float (gip:cd-inf (car u) 3 200.0))
                   a (gip:ht-add (gip:ht-add p (gip:ht-mul (gip:ht-left n) (* -0.5 w))) (gip:ht-mul n dd))
                   b (gip:ht-add (gip:ht-add p (gip:ht-mul (gip:ht-left n) (* 0.5 w))) (gip:ht-mul n dd))
                   side (cadr (assoc (car u) freon)))
             ;; дренаж — с противоположного фреону конца
             (setq ea (if (= side "A") b a) eb (gip:ht-add ea (gip:ht-mul (gip:ht-unit (gip:ht-sub (if (= side "A") a b) ea)) 300.0)))
             (setq rr (cons (list (car u) (gip:ht-add p (gip:ht-mul n (+ dd 300.0))) ea eb) rr)))
           (setq rr (reverse rr) *gip:ht-pair* 0.0 *gip:ht-pitch* 0.0)
           (setq root (gip:ht-add (gip:cd-p kp) (gip:ht-mul (gip:cd-n kp) 150.0)))
           (setq res (if segs (gip:ht-route segs rr root (gip:cd-p kp) (gip:cd-n kp)) nil))
           (setq nmiss (+ nmiss (- (length grp) (length res))))
           (setq lq (gip:cd-dedupe (mapcar '(lambda (r) (list (car r) (nth 2 r))) res) (gip:cd-p kp)))
           (gip:rt-free)
           (foreach x lq
             (setq pts (gip:rt-simplify (cadr x)))
             (if (> (length pts) 1)
               (progn
                 (gip:ht-pline pts 15.0 3 nil "drain")
                 (setq drl (+ drl (/ (gip:ht-plen pts) 1000.0) 0.5) dre (+ dre (max 0 (- (length pts) 2)) 1))
                 (if (caddr x) (setq drt (1+ drt)))
                 ;; уклон на самом длинном участке
                 (setq i 0 best nil bd 0.0)
                 (while (< i (1- (length pts)))
                   (if (> (distance (nth i pts) (nth (1+ i) pts)) bd) (setq bd (distance (nth i pts) (nth (1+ i) pts)) best i))
                   (setq i (1+ i)))
                 (if (and best (> bd 700.0)) (gip:cd-slope (nth (1+ best) pts) (nth best pts) "drain"))
                 (setq drains (cons (list (car x) pts (car kp)) drains)))))
           ;; стояк К1
           (gip:cd-circle (gip:cd-p kp) 25.0 3 "k1")
           (gip:cd-leader (gip:cd-p kp) (gip:ht-add (gip:cd-p kp) (gip:ht-add (gip:ht-mul (gip:cd-n kp) 900.0) (gip:ht-mul (gip:ht-left (gip:cd-n kp)) 500.0)))
                          "В систему К1 \\Pс разрывом струи \\PHL138H с \"сухим\" \\Pзатвором" 3 "k1"))))
     ;; ---- подписи плана
     (gip:cd-labels ins (gip:cd-of "O") freon drains info)
     ;; ---- длины для спецификации и панели
     (setq *gip:cd-len* (list (cons "CU" lens) (cons "DR" drl) (cons "DRE" dre) (cons "DRT" drt) (cons "REF" nref)
                              (cons "HL" (length (vl-remove-if-not '(lambda (k2) (vl-some '(lambda (d2) (= (caddr d2) (car k2))) drains)) ks)))
                              (cons "N" (length ins))))
     (gip:ht-put "GIPCONDLEN" *gip:cd-len*)
     ;; ---- схема и спецификация
     (if sch (gip:cd-axo sch ins outs freon drains info))
     (setq *gip:ht-sys* "Кондиционирование" *gip:ht-qfn* 'gip:cd-qty
           *gip:ht-row0* (gip:cd-spec-prep specs (= (gip:ht-opt data "specclear" "0") "1")))
     (setq data (vl-remove-if '(lambda (it) (and (= (vl-symbol-name (car it)) "PIPE") (equal (gip:cd-qty (nth 5 it) (float (nth 6 it))) 0))) data))
     (if specs (gip:ht-spec specs data 0.0 0.0))
     (setq tot 0.0)
     (foreach x lens (setq tot (+ tot (cdr x))))
     (setq ok (= nmiss 0)
           msg (strcat "кондиционирование: внутренних блоков " (itoa (length ins)) ", наружных/подключений " (itoa (length outs))
                       (if (> nmiss 0) (strcat "; НЕ проложено трасс: " (itoa nmiss) " (проверьте стены и точки)") "")
                       "; медь " (rtos tot 2 1) " м, дренаж " (rtos drl 2 1) " м"
                       (if (> nref 0) (strcat ", рефнетов " (itoa nref)) "") "."))
     (gip:cd-report ok msg)
     T)))
(defun gip:cd-acc (al k v / p) (setq p (assoc k al)) (if p (subst (cons k (+ (cdr p) v)) p al) (cons (cons k v) al)))
;; листы спецификации ВиК: чужие (не GIPCOND) записи в теле таблицы. clear — стереть их (образец шаблона),
;; иначе кондиционирование дописывается после последней занятой строки каждого листа. Результат — занятые строки по листам.
(defun gip:cd-spec-prep (specs clear / res F ss i e ed p ry occ n)
  (setq res nil)
  (foreach sh specs
    (setq F (gip:g sh "F") occ 0)
    (if (setq ss (ssget "_X" '((0 . "MTEXT,TEXT"))))
      (progn
        (setq i 0)
        (while (< i (sslength ss))
          (setq e (ssname ss i) i (1+ i) ed (entget e (list *gip:cd-app*)) p (cdr (assoc 10 ed)))
          (if (and (null (assoc -3 ed)) (> (car p) (- (car F) 20000.0)) (< (car p) (- (car F) 1000.0)))
            (progn
              (setq ry (- (cadr p) (cadr F)))
              (if (and (> ry 3300.0) (< ry 13850.0))
                (if clear
                  (entdel e)
                  (progn (setq n (1+ (fix (/ (+ (- 13600.0 ry) 200.0) 400.0)))) (if (> n occ) (setq occ n))))))))))
    (setq res (append res (list (if (> occ 0) (min 26 (1+ occ)) 0)))))
  res)
;; количество для строки спецификации по ключу
(defun gip:cd-qty (key k / l x)
  (setq l *gip:cd-len*)
  (cond
    ((or (gip:starts key "CU:") (gip:starts key "INS:"))
     (setq x (cdr (assoc (substr key (+ 2 (vl-string-search ":" key))) (cdr (assoc "CU" l)))))
     (if x (float (* 5 (gip:ht-ceil (/ (* x k) 5.0)))) 0))
    ((= key "DR") (float (* 1 (gip:ht-ceil (* (gip:nz (cdr (assoc "DR" l)) 0.0) k)))))
    ((member key '("DRE" "DRT" "REF" "HL" "N")) (fix (* (gip:nz (cdr (assoc key l)) 0) k)))
    (T 0)))

;; ---------------------------------------------------------------- подписи плана
(defun gip:cd-labels (ins outs freon drains info / u p n w dd x c p0 p1 r e d a b)
  (foreach u ins
    (setq x (cdr (assoc (car u) info)) p (gip:cd-p u) n (gip:cd-n u) dd (float (if x (nth 3 x) 200.0)))
    (setq c (gip:ht-add p (gip:ht-mul n (* 0.5 dd))) p1 (gip:ht-add c (gip:ht-add (gip:ht-mul n 1200.0) (gip:ht-mul (gip:ht-left n) 700.0))))
    (gip:cd-leader c p1 (strcat "Внутренний блок \\P" (if x (strcat (car x) " " (cadr x)) "")) 1 "lbl"))
  (foreach u outs
    (setq x (cdr (assoc (car u) info)) p (gip:cd-p u) n (gip:cd-n u) dd (float (if x (nth 3 x) 300.0)))
    (setq c (gip:ht-add p (gip:ht-mul n (* 0.5 dd))) p1 (gip:ht-add c (gip:ht-add (gip:ht-mul n (+ 600.0 dd)) (gip:ht-mul (gip:ht-left n) 600.0))))
    (gip:cd-leader c p1 (strcat "Наружный блок \\P" (if x (strcat (car x) " " (cadr x)) "")) 1 "lbl"))
  ;; опуск фреона к каждому внутреннему блоку: кружки на концах пары и подпись диаметров
  (foreach r freon
    (setq a (last (nth 2 r)) e (last (nth 3 r)) x (cdr (assoc (car r) info)))
    (gip:cd-circle a 20.0 1 "lbl") (gip:cd-circle e 20.0 nil "lbl")
    (setq d (gip:ht-unit (gip:ht-sub a (nth (max 0 (- (length (nth 2 r)) 2)) (nth 2 r)))))
    (gip:cd-leader a (gip:ht-add a (gip:ht-add (gip:ht-mul (gip:ht-left d) 700.0) (gip:ht-mul d -400.0)))
                   (strcat "ф" (if x (nth 5 x) "6,35") "\\Pф" (if x (nth 6 x) "9,52") "\\Pопуск") nil "lbl"))
  (foreach r drains
    (setq a (car (cadr r)) b (cadr (cadr r)) d (gip:ht-unit (gip:ht-sub b a)))
    (gip:cd-leader (gip:ht-add a (gip:ht-mul d (min 300.0 (* 0.5 (distance a b))))) (gip:ht-add a (gip:ht-add (gip:ht-mul (gip:ht-left d) 500.0) (gip:ht-mul d 500.0)))
                   "Дренаж\\Pф20" 3 "lbl")))

;; ---------------------------------------------------------------- аксонометрическая схема (фронтальная изометрия)
;; трубы под потолком (z 2600), опуск к внутреннему блоку (низ 2050), к наружному — на его высоту; дренаж 1950 -> К1 (400)
(defun gip:cd-axo (sh ins outs freon drains info / F o an lst all bx rg W H s dx dy x u p n a b z h pts e c top L D pr)
  (setq F (gip:g sh "F") an *gip:cd-an* o (gip:cd-p (car ins)))
  (defun gip:cd-l3 (p z / q) (setq q (gip:rt-to-loc p o an)) (list (car q) (cadr q) z))
  (defun gip:cd-prj (q) (list (+ (car q) (* 0.70710678 (cadr q))) (+ (caddr q) (* 0.70710678 (cadr q)))))
  (setq lst nil)
  ;; коробка блока: прямоугольник плана на высотах z0..z1
  (defun gip:cd-box (rect z0 z1 col) (list "box" (mapcar '(lambda (p) (gip:cd-l3 p z0)) rect) z1 col))
  (foreach u ins
    (setq x (cdr (assoc (car u) info)) L (float (if x (nth 2 x) 800.0)) D (float (if x (nth 3 x) 200.0)) h (float (if x (nth 4 x) 300.0)))
    (setq lst (cons (append (gip:cd-box (gip:cd-rect (gip:cd-p u) (gip:cd-n u) L D) 2050.0 (+ 2050.0 h) 1) (list (if x (strcat (car x) " " (cadr x)) ""))) lst)))
  (foreach u outs
    (setq x (cdr (assoc (car u) info)))
    (if (= (cadr u) "O")
      (progn (setq L (float (if x (nth 2 x) 800.0)) D (float (if x (nth 3 x) 300.0)) h (float (if x (nth 4 x) 550.0)))
             (setq lst (cons (append (gip:cd-box (gip:cd-rect (gip:cd-p u) (gip:cd-n u) L D) 0.0 h 1) (list (if x (strcat (car x) " " (cadr x)) ""))) lst)))
      (setq lst (cons (list "pipe" (list (gip:cd-l3 (gip:cd-p u) 2600.0) (gip:cd-l3 (gip:cd-p u) 3400.0)) 1 "К магистрали") lst))))
  (foreach r freon
    (setq e (assoc (nth 4 r) (mapcar '(lambda (u) (cons (car u) u)) outs)) x (cdr (assoc (nth 4 r) info))
          z (if (and e (= (cadr (cdr e)) "O")) (* 0.5 (float (if x (nth 4 x) 550.0))) 2600.0))
    (foreach pr (list (list (nth 2 r) 1) (list (nth 3 r) nil))
      (setq pts (mapcar '(lambda (p) (gip:cd-l3 p 2600.0)) (car pr)))
      (setq pts (append (list (list (car (car pts)) (cadr (car pts)) z)) pts (list (list (car (last pts)) (cadr (last pts)) 2200.0))))
      (setq lst (cons (list "pipe" pts (cadr pr) nil) lst))))
  ;; дренаж: ломаная идёт от К1 (или от тройника) к блоку; у К1 — опуск к воронке, у блока — подъём к патрубку
  (foreach r drains
    (setq pts (mapcar '(lambda (p) (gip:cd-l3 p 1950.0)) (cadr r)))
    (if (< (distance (car (cadr r)) (gip:cd-p (assoc (caddr r) (gip:cd-of "K")))) 400.0)
      (setq pts (cons (list (car (car pts)) (cadr (car pts)) 400.0) pts)))
    (setq lst (cons (list "pipe" (append pts (list (list (car (last pts)) (cadr (last pts)) 2050.0))) 3 nil) lst)))
  ;; вписать в левую часть листа схемы
  (setq all nil)
  (foreach e lst
    (foreach q (cadr e) (setq all (cons (gip:cd-prj q) all)))
    (if (= (car e) "box") (foreach q (cadr e) (setq all (cons (gip:cd-prj (list (car q) (cadr q) (caddr e))) all)))))
  (if all
    (progn
      (setq bx (list (apply 'min (mapcar 'car all)) (apply 'min (mapcar 'cadr all)) (apply 'max (mapcar 'car all)) (apply 'max (mapcar 'cadr all))))
      (setq rg (list (- (car F) 19300.0) (+ (cadr F) 4000.0) (- (car F) 11300.0) (+ (cadr F) 13000.0))
            W (- (caddr rg) (car rg)) H (- (cadddr rg) (cadr rg)))
      (setq s (min 1.0 (/ W (max 1.0 (- (caddr bx) (car bx)))) (/ H (max 1.0 (- (cadddr bx) (cadr bx))))))
      (setq dx (- (/ (+ (car rg) (caddr rg)) 2.0) (* s (/ (+ (car bx) (caddr bx)) 2.0)))
            dy (- (/ (+ (cadr rg) (cadddr rg)) 2.0) (* s (/ (+ (cadr bx) (cadddr bx)) 2.0))))
      (defun gip:cd-tr (q / p) (setq p (gip:cd-prj q)) (list (+ dx (* s (car p))) (+ dy (* s (cadr p)))))
      (setq *gip:cd-nl* 0)
      ;; подписи лесенкой, чтобы не налезали друг на друга
      (defun gip:cd-lbl-at (p0 txt / k) (setq k *gip:cd-nl* *gip:cd-nl* (1+ *gip:cd-nl*))
        (gip:cd-leader p0 (gip:ht-add p0 (list (+ 500.0 (* 250.0 (rem k 2))) (+ 700.0 (* 420.0 (rem k 4))))) txt 1 "lbl"))
      (foreach e lst
        (cond
          ((= (car e) "pipe")
           (gip:ht-pline (mapcar 'gip:cd-tr (cadr e)) 15.0 (caddr e) nil "axo")
           (if (cadddr e) (gip:cd-lbl-at (gip:cd-tr (last (cadr e))) (cadddr e))))
          ((= (car e) "box")
           (setq pts (cadr e) z (caddr e))
           (defun gip:cd-up (q) (list (car q) (cadr q) z))
           (gip:ht-pline (mapcar 'gip:cd-tr pts) 20.0 (cadddr e) T "axo")
           (gip:ht-pline (mapcar '(lambda (q) (gip:cd-tr (gip:cd-up q))) pts) 20.0 (cadddr e) T "axo")
           (foreach q pts (gip:ht-pline (list (gip:cd-tr q) (gip:cd-tr (gip:cd-up q))) 20.0 (cadddr e) nil "axo"))
           (setq top (gip:cd-tr (gip:cd-up (nth 2 pts))))
           (if (and (nth 4 e) (/= (nth 4 e) "")) (gip:cd-lbl-at top (nth 4 e))))))
      ;; заголовок
      (gip:ht-mtext (list (/ (+ (car rg) (caddr rg)) 2.0) (+ (cadddr rg) 450.0)) "\\pxqc;Схема систем Х1, Х2, Д1" 150.0 6000.0 5 nil "0" "axo")))
  T)

;; ---------------------------------------------------------------- отчёт и реестр для панели
(defun gip:cd-report (ok msg / f p)
  (setq p (strcat (getvar "TEMPPREFIX") *gip:cd-out*))
  (if (setq f (open p "w"))
    (progn (write-line (if ok "ok" "error") f) (write-line (gip:plan-ascii msg) f) (close f)))
  (princ (strcat "\nГИП: " msg)))
(defun gip:cd-write-reg (/ f p sheets st len links mode)
  (setq p (strcat (getvar "TEMPPREFIX") *gip:cd-regf*) sheets (gip:cd-sheets))
  (setq mode (gip:nz (gip:dict-get "GIPCONDMODE") "split") links (gip:cd-auto-links mode))
  (if (setq f (open p "w"))
    (progn
      (write-string "{\"type\":\"cond-registry\",\"sheets\":{" f)
      (write-string (strcat "\"plan\":" (if (gip:cd-sheet sheets "plan") "1" "0") ",\"scheme\":" (if (gip:cd-sheet sheets "scheme") "1" "0")
                            ",\"spec\":" (itoa (length (gip:cd-specs sheets))) "}") f)
      (write-string ",\"rooms\":[" f)
      (setq st T)
      (foreach r (gip:room-list)
        (if (not st) (write-string "," f)) (setq st nil)
        (write-string (strcat "{\"no\":" (itoa (nth 0 r)) ",\"name\":" (gip:js-str (gip:u (nth 1 r))) ",\"area\":" (gip:js-num (nth 2 r))
                              ",\"h\":" (gip:js-num (nth 4 r)) "}") f))
      (write-string "],\"units\":[" f)
      (setq st T)
      (foreach u (gip:cd-units)
        (if (not st) (write-string "," f)) (setq st nil)
        (write-string (strcat "{\"id\":" (itoa (car u)) ",\"kind\":" (gip:js-str (cadr u)) ",\"x\":" (gip:js-num (gip:ht-r10 (nth 2 u))) ",\"y\":" (gip:js-num (gip:ht-r10 (nth 3 u)))
                              ",\"room\":" (itoa (gip:cd-room-at (gip:cd-p u)))
                              ",\"link\":" (if (assoc (car u) links) (itoa (cdr (assoc (car u) links))) "null") "}") f))
      (setq len (gip:ht-get "GIPCONDLEN"))
      (write-string (strcat "],\"len\":" (if len (strcat "{\"dr\":" (gip:js-num (gip:nz (cdr (assoc "DR" len)) 0.0)) ",\"ref\":" (itoa (gip:nz (cdr (assoc "REF" len)) 0))
                                                           ",\"cu\":{" (gip:join (mapcar '(lambda (x) (strcat (gip:js-str (car x)) ":" (gip:js-num (gip:ht-r10 (cdr x))))) (cdr (assoc "CU" len))) ",") "}}")
                                            "null")
                            ",\"state\":" (gip:js-str (gip:nz (gip:dict-get "GIPCONDSTATE") "")) "}") f)
      (close f))))
;; номер помещения по ближайшему номеру GIPROOMS на листе плана (в пределах 6 м)
(defun gip:cd-room-at (p / best bd d sh)
  (setq best 0 bd 6000.0 sh (gip:cd-sheet (gip:cd-sheets) "plan"))
  (if sh
    (foreach m (gip:ht-markers (gip:g sh "box"))
      (setq d (distance p (cdr m)))
      (if (< d bd) (setq bd d best (car m)))))
  best)

;; ---------------------------------------------------------------- команды (панель GIPCOND вызывает их по имени)
(defun gip:cd-plan-sheet () (gip:cd-sheet (gip:cd-sheets) "plan"))
(defun c:GIPCONDREAD () (gip:cd-write-reg) (princ))
;; указать точки одного вида (Enter — закончить)
(defun gip:cd-pick (kind msg rmax / sh segs p nw l n q c cnt)
  (setq sh (gip:cd-plan-sheet) cnt 0)
  (if (null sh)
    (gip:cd-report nil "нет листа «План квартиры с сетями Х1, Х2, Д1».")
    (progn
      (setq segs (gip:ht-wall-segs (gip:g sh "box")))
      (while (setq p (getpoint msg))
        (setq p (gip:ht-p2 p) nw (if segs (gip:cd-near-wall p segs rmax) nil))
        (cond
          ((and (= kind "I") (null nw)) (princ "\nГИП: рядом нет стены (ближе 800 мм) — укажите точку у стены."))
          ((and (= kind "O") (null nw)) (princ "\nГИП: рядом нет наружной стены (ближе 3 м)."))
          (T
           (cond
             ((= kind "I") (setq q (car nw) n (cadr nw)))                                    ;; на грани стены, в помещение
             ((= kind "O") (setq n (cadr nw) q (if (< (distance p (car nw)) 150.0) (gip:ht-add (car nw) (gip:ht-mul n 150.0)) p)))
             (T (setq q p n (if nw (cadr nw) (list 0.0 1.0)))))
           (setq l (gip:cd-units) cnt (1+ cnt))
           (gip:cd-units-put (append l (list (list (gip:cd-next-id) kind (car q) (cadr q) (car n) (cadr n)))))
           (gip:cd-mark q kind))))
      (gip:cd-report T (strcat "добавлено точек: " (itoa cnt) "."))))
  (gip:cd-write-reg)
  (princ))
;; временная отметка указанной точки (стирается при построении вместе с прочим)
(defun gip:cd-mark (p kind / sa sl)
  (setq sa *gip:ht-app* sl *gip:ht-lay* *gip:ht-app* *gip:cd-app* *gip:ht-lay* *gip:cd-lay*)
  (gip:cd-circle p 60.0 (cond ((= kind "I") 1) ((= kind "K") 3) (T 5)) "unit")
  (setq *gip:ht-app* sa *gip:ht-lay* sl))
(defun c:GIPCONDIN () (gip:cd-pick "I" "\nМесто внутреннего блока (у стены, середина блока; Enter — закончить): " 800.0))
(defun c:GIPCONDOUT () (gip:cd-pick "O" "\nМесто наружного блока (снаружи у фасада; Enter — закончить): " 3000.0))
(defun c:GIPCONDRISER () (gip:cd-pick "R" "\nТочка подключения к магистрали VRF (стояк; Enter — закончить): " 800.0))
(defun c:GIPCONDK1 () (gip:cd-pick "K" "\nВыпуск дренажа в К1 (капельная воронка у стояка; Enter — закончить): " 800.0))
(defun c:GIPCONDDEL (/ p l best bd d)
  (if (setq p (getpoint "\nУкажите точку для удаления: "))
    (progn
      (setq l (gip:cd-units) best nil bd 1500.0)
      (foreach u l (setq d (distance (gip:ht-p2 p) (gip:cd-p u))) (if (< d bd) (setq bd d best u)))
      (if best (progn (gip:cd-units-put (vl-remove best l)) (gip:cd-report T (strcat "точка " (itoa (car best)) " удалена.")))
               (gip:cd-report nil "рядом нет указанных точек."))))
  (gip:cd-write-reg)
  (princ))
(defun c:GIPCONDCLEAR () (gip:cd-units-put nil) (gip:cd-report T "все точки кондиционирования удалены.") (gip:cd-write-reg) (princ))
(defun c:GIPCONDBUILD (/ data st r)
  (setq data (gip:cd-read-in))
  (if (setq st (car (gip:ht-items data "STATE"))) (gip:dict-put "GIPCONDSTATE" (cadr st)))
  (gip:dict-put "GIPCONDMODE" (gip:ht-opt data "mode" "split"))
  (setq r (gip:cd-with 'gip:cd-build (list data)))
  (if (vl-catch-all-error-p r) (gip:cd-report nil (strcat "ошибка построения: " (vl-catch-all-error-message r))))
  (gip:rt-free)
  (gip:cd-write-reg)
  (princ))

;; ---------------------------------------------------------------- стены «чужой» подложки (не из GIPROOMS)
;; указать линии стен (можно внутри блока подложки) — их слои запоминаются для трасс ЭОМ, отопления и кондиционирования
(defun c:GIPWALLS (/ q lay layers)
  (setq layers nil)
  (while (setq q (nentsel (if layers "\nЕщё линия стены другого слоя или Enter: " "\nУкажите линию стены подложки (Enter — готово): ")))
    (setq lay (cdr (assoc 8 (entget (car q)))))
    (if (and lay (not (member lay layers))) (progn (setq layers (cons lay layers)) (princ (strcat "\nГИП: слой стен «" lay "»")))))
  (if layers
    (progn (gip:rt-wall-layers-put layers) (gip:cd-report T (strcat "слои стен запомнены: " (gip:join (reverse layers) ", ") ".")))
    (gip:cd-report nil (strcat "слои стен не изменены" (if (gip:rt-wall-layers) (strcat " (" (gip:join (gip:rt-wall-layers) ", ") ")") "") ".")))
  (gip:cd-write-reg)
  (gip:ht-write-reg)
  (princ))
