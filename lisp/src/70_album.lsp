;;; ============================================================================
;;; Альбом: поиск листов шаблона, построение, нумерация, ведомость, хранение состояния,
;;; обновление по монтажной схеме
;;; ============================================================================
(setq *gip:SW* 20960.5 *gip:SHH* 14850.0)
(setq *gip:dO* '(-19960.1234209281 10782.4628509109))  ; начало шапки схемы относительно точки рамки F

(defun gip:F->O (F) (list (+ (car F) (car *gip:dO*)) (+ (cadr F) (cadr *gip:dO*))))

;; листы шаблона: рамки А3-GIP-ALBOM без метки GIPGEN и их названия из штампа
(defun gip:template-sheets (/ ss i e o ip nm res ttl tss j te tp)
  (setq res nil)
  (if (setq ss (ssget "_X" '((0 . "INSERT"))))
    (progn
      (setq i 0)
      (while (< i (sslength ss))
        (setq e (ssname ss i) i (1+ i))
        (setq o (vlax-ename->vla-object e))
        (setq nm (vl-catch-all-apply 'vlax-get (list o 'EffectiveName)))
        (if (and (= nm "А3-GIP-ALBOM") (not (assoc -3 (entget e (list *gip:app*)))))
          (setq res (cons (list (cdr (assoc 10 (entget e))) e) res))))))
  ;; названия
  (setq tss (ssget "_X" '((0 . "MTEXT"))))
  (mapcar '(lambda (fr / F ttl no tot j te tp)
             (setq F (car fr) ttl "" no nil tot nil j 0)
             (if tss
               (while (< j (sslength tss))
                 (setq te (ssname tss j) j (1+ j))
                 (if (not (assoc -3 (entget te (list *gip:app*))))
                   (progn
                     (setq tp (cdr (assoc 10 (entget te))))
                     (cond ((and (equal (- (car tp) (car F)) -6250.0 3.0) (equal (- (cadr tp) (cadr F)) 625.0 3.0)) (setq ttl (gip:mt-plain (entget te))))
                           ((and (equal (- (car tp) (car F)) -2000.0 3.0) (equal (- (cadr tp) (cadr F)) 1250.0 3.0)) (setq no te))
                           ((and (equal (- (car tp) (car F)) -1150.0 3.0) (equal (- (cadr tp) (cadr F)) 1250.0 3.0)) (setq tot te)))))))
             (list (cons "F" F) (cons "title" ttl) (cons "no" no) (cons "tot" tot) (cons "role" (gip:sheet-role ttl))))
          res))

(defun gip:mt-plain (ed / s)
  (setq s "")
  (foreach p ed (if (= (car p) 3) (setq s (strcat s (cdr p)))))
  (setq s (strcat s (cdr (assoc 1 ed))))
  (gip:mt-strip s))
(defun gip:mt-strip (s / r i c n)
  ;; убрать коды форматирования MTEXT
  (setq r "" i 1 n (strlen s))
  (while (<= i n)
    (setq c (substr s i 1))
    (cond ((and (= c "\\") (< i n) (member (substr s (1+ i) 1) '("P")))
           (setq r (strcat r " ") i (+ i 2)))
          ((and (= c "\\") (< i n) (member (strcase (substr s (1+ i) 1)) '("A" "C" "F" "H" "Q" "T" "W" "P")))
           (while (and (<= i n) (/= (substr s i 1) ";")) (setq i (1+ i))) (setq i (1+ i)))
          ((and (= c "\\") (< i n) (member (strcase (substr s (1+ i) 1)) '("L" "O" "K")))
           (setq i (+ i 2)))
          ((member c '("{" "}")) (setq i (1+ i)))
          (T (setq r (strcat r c) i (1+ i)))))
  (gip:trim r))

(defun gip:sheet-role (ttl / t1)
  (setq t1 (gip:lower ttl))
  (cond ((gip:has t1 "общие данные") "od")
        ((gip:has t1 "однолинейн") "ol")
        ((gip:has t1 "фрагмент") "frag")
        ((gip:has t1 "подвода") "cable")
        ((gip:has t1 "условные") "legend")
        ((gip:has t1 "силовыми") "plan_p")
        ((gip:has t1 "освещения") "plan_l")
        ((gip:has t1 "дсуп") "plan_d")
        ((gip:has t1 "монтажн") "mont")
        ((gip:has t1 "спецификац") "spec")
        (T "other")))

(defun gip:sheet-by-role (sheets role) (vl-some '(lambda (s) (if (= (gip:g s "role") role) s)) sheets))

;; удалить всё, что построено раньше
(defun gip:clear (/ ss i n)
  (setq n 0)
  (if (setq ss (ssget "_X" (list (list -3 (list *gip:app*)))))
    (progn (setq i 0) (while (< i (sslength ss)) (entdel (ssname ss i)) (setq i (1+ i) n (1+ n)))))
  n)

;; ---------------------------------------------------------------- состояние в чертеже
(defun gip:dict-get (key / d x s)
  (if (setq d (dictsearch (namedobjdict) key))
    (progn (setq s "") (foreach p d (if (= (car p) 1) (setq s (strcat s (cdr p))))) s)))
(defun gip:dict-put (key s / x l)
  (dictremove (namedobjdict) key)
  (setq l (list '(0 . "XRECORD") '(100 . "AcDbXrecord")))
  (while (> (strlen s) 200) (setq l (append l (list (cons 1 (substr s 1 200)))) s (substr s 201)))
  (setq l (append l (list (cons 1 s))))
  (setq x (entmakex l))
  (dictadd (namedobjdict) key x))
(defun gip:save-state (S) (gip:dict-put "GIPSHCHIT" (vl-prin1-to-string S)))
(defun gip:load-state (/ s) (if (setq s (gip:dict-get "GIPSHCHIT")) (read s)))
(defun gip:save-geo (g) (gip:dict-put "GIPSHCHIT_GEO" (vl-prin1-to-string g)))
(defun gip:load-geo (/ s) (if (setq s (gip:dict-get "GIPSHCHIT_GEO")) (read s)))

;; ---------------------------------------------------------------- построение альбома
(defun gip:build (S / BRD sheets od dsup F0 pages k n nOL Fm box secs spages p Fp total roles num tblist m ol-titles)
  (setq *gip:S* S *gip:b* (gip:brand (gip:g S "brand")) *gip:tag* "gip")
  (if (not (and (tblsearch "BLOCK" "А3-GIP-ALBOM") (tblsearch "BLOCK" "аппарат управления и защиты в РЩ") (tblsearch "BLOCK" "GIPM_ab_a1")))
    (progn
      (alert "GIP-ЩИТ: в этом чертеже нет блоков шаблона ГИП.\nОткройте файл GIP_EOM_Shablon (DXF/DWG из комплекта) и запустите команду в нём.")
      (exit)))
  (regapp *gip:app*) (regapp *gip:dev-app*)
  (gip:clear)
  (setq BRD (gip:board S))
  (setq sheets (gip:template-sheets))
  (setq od (gip:sheet-by-role sheets "od") dsup (gip:sheet-by-role sheets "plan_d"))
  ;; опорные точки
  (setq F0 (if od (list (car (gip:g od "F")) (- (cadr (gip:g od "F")) *gip:SHH*)) (list 0.0 0.0)))
  (setq Fm (if dsup (list (+ (car (gip:g dsup "F")) *gip:SW*) (cadr (gip:g dsup "F"))) (list (+ (car F0) (* 4 *gip:SW*)) (cadr F0))))
  ;; однолинейная схема
  (setq pages (gip:ol-pages BRD (gip:g S "kup")) n (length pages) k 0 ol-titles nil)
  (foreach sc pages
    (setq *gip:tag* (strcat "ol" (itoa (1+ k))))
    (setq ol-titles (append ol-titles (list (gip:ol-sheet S BRD sc k n (+ (car F0) (car *gip:dO*) (* k *gip:SW*)) (+ (cadr F0) (cadr *gip:dO*))))))
    (setq k (1+ k)))
  (setq nOL n)
  ;; монтажная схема
  (setq *gip:tag* "mont")
  (gip:place "mont" (car Fm) (cadr Fm)
    '(lambda (its) (mapcar '(lambda (it / t1 p rx ry)
                              (if (= (car it) "E")
                                (progn
                                  (setq t1 (gip:it-get it 1))
                                  (if (and (= (gip:it-get it 0) "MTEXT") (setq p (assoc 10 (cdr it))))
                                    (setq rx (- (cadr p) (car Fm)) ry (- (caddr p) (cadr Fm))))
                                  (cond ((and t1 (gip:has t1 "Компоновка щита")) (gip:it-text it (strcat "Монтажная схема щита " (gip:gn S "board" "ЩР"))))
                                        ((and rx (equal ry 1250.0 1.0) (equal rx -2000.0 1.0)) (gip:it-text it (itoa (+ 8 nOL))))
                                        ((and rx (equal ry 1250.0 1.0) (equal rx -2750.0 1.0)) (gip:it-text it (gip:gn S "stage" "Р")))
                                        ((and rx (equal ry 1250.0 1.0) (equal rx -1150.0 1.0)) (gip:it-text it ""))
                                        ((and rx (equal ry 625.0 1.0) (equal rx -6250.0 1.0)) (gip:it-text it (strcat "Монтажная схема щита " (gip:gn S "board" "ЩР"))))
                                        (T it)))
                                it)) its)))
  (gip:montage S BRD Fm)
  ;; спецификация
  (setq secs (gip:spec-sections S BRD sheets) spages (gip:spec-pages secs) p 0)
  (foreach rows spages
    (setq *gip:tag* (strcat "spec" (itoa (1+ p))))
    (setq Fp (cond (dsup (if (< p 2) (list (car (gip:g dsup "F")) (- (cadr (gip:g dsup "F")) (* (1+ p) *gip:SHH*)))
                             (list (+ (car (gip:g dsup "F")) (* (1- p) *gip:SW*)) (- (cadr (gip:g dsup "F")) (* 2 *gip:SHH*)))))
                   (T (list (+ (car F0) (* p *gip:SW*)) (- (cadr F0) (* 3 *gip:SHH*))))))
    (gip:spec-sheet rows Fp (itoa (1+ p)) (if (= p 0) (itoa (max 2 (length spages))) ""))
    (setq p (1+ p)))
  ;; нумерация листов шаблона и ведомость
  (gip:number-sheets sheets nOL ol-titles S)
  (gip:save-state S)
  (gip:panel-save S BRD)
  (gip:save-geo (list (cons "mgeo" *gip:mgeo*) (cons "snap" (gip:montage-snapshot))))
  (setq *gip:board* BRD)
  BRD)

;; номера статических листов: ОД — 1, однолинейная 2..n+1, далее фрагмент, схема подвода, условные, планы, монтажная
(defun gip:number-sheets (sheets nOL ol-titles S / order no total list1 e k sh)
  (setq order '("frag" "cable" "legend" "plan_p" "plan_l" "plan_d") no (+ 2 nOL) list1 nil)
  (setq list1 (list (list "1" "Общие данные")))
  (setq k 0)
  (foreach t1 ol-titles (setq list1 (append list1 (list (list (itoa (+ 2 k)) t1))) k (1+ k)))
  (foreach r order
    (if (setq sh (gip:sheet-by-role sheets r))
      (progn
        (if (setq e (gip:g sh "no")) (gip:set-mtext e (itoa no)))
        (setq list1 (append list1 (list (list (itoa no) (gip:g sh "title")))))
        (setq no (1+ no)))))
  (setq list1 (append list1 (list (list (itoa no) (strcat "Монтажная схема щита " (gip:gn S "board" "ЩР"))))))
  (setq total no)
  (if (and (setq sh (gip:sheet-by-role sheets "od")) (setq e (gip:g sh "tot"))) (gip:set-mtext e (itoa total)))
  (if (and sh (setq e (gip:g sh "no"))) (gip:set-mtext e "1"))
  (gip:fill-vedomost list1)
  list1)

(defun gip:set-mtext (e txt / ed full)
  (setq ed (entget e))
  (setq full "")
  (foreach p ed (if (= (car p) 3) (setq full (strcat full (cdr p)))))
  (setq full (strcat full (cdr (assoc 1 ed))))
  (setq ed (vl-remove-if '(lambda (p) (= (car p) 3)) ed))
  (entmod (subst (cons 1 (gip:mt-wrap full txt)) (assoc 1 ed) ed)))

;; ведомость рабочих чертежей (таблица AutoCAD на листе ОД)
(defun gip:fill-vedomost (rows / ss i e o tb nrow need r h)
  (setq tb nil)
  (if (setq ss (ssget "_X" '((0 . "ACAD_TABLE"))))
    (progn (setq i 0)
      (while (< i (sslength ss))
        (setq e (ssname ss i) i (1+ i) o (vlax-ename->vla-object e))
        (if (and (null tb) (= (gip:mt-strip (vlax-invoke o 'GetText 0 0)) "Лист")) (setq tb o)))))
  (if tb
    (progn
      (setq nrow (vlax-get tb 'Rows) need (1+ (length rows)))
      (setq h (vl-catch-all-apply 'vlax-invoke (list tb 'GetRowHeight 1)))
      (if (vl-catch-all-error-p h) (setq h 800.0))
      (if (< nrow need) (vlax-invoke tb 'InsertRows (1- nrow) h (- need nrow)))
      (if (> nrow need) (vlax-invoke tb 'DeleteRows need (- nrow need)))
      (setq r 1)
      (foreach rw rows
        (vlax-invoke tb 'SetText r 0 (car rw))
        (vlax-invoke tb 'SetText r 1 (cadr rw))
        (setq r (1+ r))))))

;; ---------------------------------------------------------------- монтажная схема -> состояние
(defun gip:montage-devs (/ ss i e ed id ip o atts in res)
  (setq res nil)
  (if (setq ss (ssget "_X" (list '(0 . "INSERT") (list -3 (list *gip:dev-app*)))))
    (progn (setq i 0)
      (while (< i (sslength ss))
        (setq e (ssname ss i) i (1+ i) ed (entget e (list *gip:dev-app*)))
        (setq id (cdr (assoc 1000 (cdr (assoc *gip:dev-app* (cdr (assoc -3 ed)))))))
        (setq ip (cdr (assoc 10 ed)))
        (setq in nil o (vlax-ename->vla-object e))
        (foreach a (vlax-invoke o 'GetAttributes)
          (if (= (vlax-get a 'TagString) "НОМИНАЛ") (setq in (vlax-get a 'TextString))))
        (setq res (cons (list id (car ip) (cadr ip) in) res)))))
  res)
(defun gip:montage-snapshot () (gip:montage-devs))

;; число из надписи номинала: "C16", " C16 230/400В ~", "NXB-63  C16", "40A"
(defun gip:parse-in (s / i n c r cand)
  (if s
    (progn
      (setq n (strlen s) i 1 cand nil)
      (while (and (<= i n) (null cand))
        (setq c (substr s i 1))
        (if (and (member c '("C" "С")) (< i n) (wcmatch (substr s (1+ i) 1) "#"))
          (progn (setq r "" i (1+ i))
                 (while (and (<= i n) (wcmatch (substr s i 1) "#")) (setq r (strcat r (substr s i 1)) i (1+ i)))
                 (setq cand (atoi r)))
          (setq i (1+ i))))
      (if (null cand)
        (progn (setq i 1)
          (while (and (<= i n) (null cand))
            (if (wcmatch (substr s i 1) "#")
              (progn (setq r "")
                     (while (and (<= i n) (wcmatch (substr s i 1) "#")) (setq r (strcat r (substr s i 1)) i (1+ i)))
                     (if (and (<= i n) (member (substr s i 1) '("A" "А"))) (setq cand (atoi r))))
              (setq i (1+ i))))))
      cand)))

;; пересчитать порядок аппаратов по их положению на монтажной схеме
(defun gip:sync-from-montage (S / geo mg mo x0 railC devs items R rails sorted order breaks prev ri bydev removed edit d dv id In l lid old)
  (setq geo (gip:load-geo) mg (gip:g geo "mgeo"))
  (if (and mg (setq devs (gip:montage-devs)))
    (progn
      (setq mo (gip:g mg "mo") railC (gip:g mg "railC") x0 (gip:g mg "x0") R (length railC))
      ;; в координаты pt
      (setq items (mapcar '(lambda (dv / x y best bi k)
                             (setq x (/ (- (cadr dv) (car mo)) (caddr mo)) y (/ (- (cadr mo) (caddr dv)) (caddr mo)))
                             (setq best nil bi 0 k 0)
                             (foreach c railC
                               (if (or (null best) (< (abs (- (+ y 112.0) c)) best)) (setq best (abs (- (+ y 112.0) c)) bi k))
                               (setq k (1+ k)))
                             ;; ниже последней рейки — новая рейка
                             (if (and railC (> (+ y 112.0) (+ (last railC) 260.0))) (setq bi (+ (1- R) (fix (/ (- (+ y 112.0) (last railC)) 330.0)))))
                             (list (car dv) bi x (nth 3 dv))) devs))
      (setq sorted (gip:msort items '(lambda (a b) (if (/= (cadr a) (cadr b)) (< (cadr a) (cadr b)) (< (caddr a) (caddr b))))))
      (setq order (mapcar 'car sorted) breaks nil prev -1)
      (foreach it sorted (if (and (/= (cadr it) prev) (>= prev 0)) (setq breaks (cons (car it) breaks))) (setq prev (cadr it)))
      (setq S (gip:s S "order" order) S (gip:s S "breaks" (reverse breaks)))
      (setq S (gip:s S "railsMin" (max (gip:gn S "railsMin" 0) (1+ (apply 'max (mapcar 'cadr sorted))))))
      (if (= (gip:g S "v") 2)
        (progn
          ;; режим таблицы: разрывы реек — по позиции, порядок и состав строк — по монтажной схеме
          (setq prev -1 ri 0 breaks nil)
          (foreach it sorted (if (and (/= (cadr it) prev) (>= prev 0)) (setq breaks (cons ri breaks))) (setq prev (cadr it) ri (1+ ri)))
          (setq S (gip:s S "breaks" nil) S (gip:s S "breakAt" (reverse breaks)))
          (setq S (gip:s S "rows" (gip:rows-from-montage S sorted)))
          (setq devs nil)))
      ;; удалённые с монтажной схемы групповые аппараты -> убрать линии; изменённые номиналы -> правки
      (setq removed (gip:g S "removed") edit (gip:g S "edit"))
      (foreach d (if devs (gip:g (gip:board S) "all"))
        (setq id (gip:g d "id"))
        (if (gip:starts id "L:")
          (progn
            (setq lid (substr id 3) dv (assoc id items))
            (if (null dv)
              (if (not (member lid removed)) (setq removed (append removed (list lid))))
              (if (and (setq In (gip:parse-in (nth 3 dv))) (/= In (gip:g d "In")))
                (setq old (gip:g edit lid) edit (gip:s edit lid (gip:s old "In" In))))))))
      (setq S (gip:s S "removed" removed) S (gip:s S "edit" edit))))
  S)

(defun gip:montage-changed (/ geo snap now)
  (setq geo (gip:load-geo) snap (gip:g geo "snap") now (gip:montage-devs))
  (not (equal (gip:msort snap '(lambda (a b) (< (car a) (car b)))) (gip:msort now '(lambda (a b) (< (car a) (car b)))) 0.5)))
