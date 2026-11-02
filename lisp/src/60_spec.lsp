;;; ============================================================================
;;; Спецификация (форма ГИП): щитовое оборудование, оборудование по планам,
;;; материалы, кабельная продукция с длинами по площади квартиры
;;; ============================================================================

;; строка: (("name" . ..) ("type" . ..) ("maker" . ..) ("unit" . ..) ("qty" . ..))
(defun gip:row (name typ maker unit qty)
  (list (cons "name" name) (cons "type" typ) (cons "maker" maker) (cons "unit" unit) (cons "qty" qty)))

(defun gip:spec-board (S BRD b / is3 map order add p pp kk p2 p4 rank k bx)
  (setq is3 (= (gip:g S "phases") 3) map nil order nil)
  (defun gip:sp-add (key r)
    (if (assoc key map)
      (setq map (subst (cons key (gip:s (cdr (assoc key map)) "qty" (1+ (gip:g (cdr (assoc key map)) "qty")))) (assoc key map) map))
      (setq map (append map (list (cons key (gip:s r "qty" 1)))) order (append order (list key)))))
  (setq bx (gip:g BRD "box"))
  (gip:sp-add "box"
    (if bx
      (gip:row (strcat "Щит распределительный встраиваемый " (if (gip:starts (car bx) "UK") "UK600" "Mistral41F") ", " (itoa (cadr bx)) " "
                       (if (= (cadr bx) 1) "ряд" (if (< (cadr bx) 5) "ряда" "рядов")) ", " (itoa (* (cadr bx) (gip:g S "railW"))) " мод., "
                       (if (gip:starts (car bx) "UK") "IP30" "IP41") ", с клеммниками N/PE")
               (if (/= (caddr bx) "") (caddr bx) (car bx)) "ABB" "шт." 1)
      (gip:row (strcat "Щит распределительный встраиваемый с клеммниками N/PE, IP41, " (itoa (gip:g BRD "cap")) " мод.") "" (gip:g b "name") "шт." 1)))
  (foreach d (gip:g BRD "all")
    (setq k (gip:g d "kind"))
    (cond
      ((= k "rn") (gip:sp-add "rn" (gip:row "Реле контроля напряжения, 1-полюсное, 63А" "VIP-63" "Welrok" "шт." 1)))
      ((member k '("in" "a1" "a3"))
       (setq pp (cond ((= k "in") (if is3 (if (= (gip:g S "inPoles") 4) 4 3) 2)) ((= k "a3") 3) (T 1)))
       (setq kk (nth pp '("" "a1" "a2" "a3" "a4")))
       (gip:sp-add (strcat "a" (itoa pp) "_" (gip:pad0 (itoa (gip:g d "In")) 3))
                   (gip:row (strcat "Выключатель автоматический, " (itoa pp) "-полюсный, " (itoa (gip:g d "In")) "A, хар-ка «C»") (gip:brand-ser b kk (gip:g d "In")) (gip:g b "name") "шт." 1)))
      ((member k '("dif" "dif4"))
       (setq p2 (if (= k "dif4") 4 2))
       (gip:sp-add (strcat "d" (itoa p2) "_" (gip:pad0 (itoa (gip:g d "In")) 3) "_" (itoa (gip:gn d "idn" 30)))
                   (gip:row (strcat "Выключатель дифференциальный, " (itoa p2) "-полюсный, " (itoa (gip:g d "In")) "A, хар-ка «C», " (itoa (gip:gn d "idn" 30)) "мА, тип «A»") (gip:brand-ser b k (gip:g d "In")) (gip:g b "name") "шт." 1)))
      ((= k "rcd")
       (setq p2 (if (= (gip:g d "w") 4) 4 2))
       (gip:sp-add (strcat "r" (itoa p2) "_" (gip:pad0 (itoa (gip:g d "In")) 3) "_" (itoa (gip:gn d "idn" 30)) (gip:gn d "type" "A"))
                   (gip:row (strcat "Устройство защитного отключения, " (itoa p2) "-полюсное, " (itoa (gip:g d "In")) "A, " (itoa (gip:gn d "idn" 30)) "мА, тип «" (if (= (gip:g d "type") "AC") "AC" "A") "»")
                            (gip:gn d "model" (gip:fmt-model (gip:g b "rcd2") (gip:g d "In"))) (gip:g b "name") "шт." 1)))
      ((= k "fire")
       (setq p4 (if is3 4 2))
       (gip:sp-add (strcat "f" (itoa p4) "_" (gip:pad0 (itoa (gip:g d "In")) 3))
                   (gip:row (strcat "Устройство защитного отключения противопожарное, " (itoa p4) "-полюсное, " (itoa (gip:g d "In")) "A, 100мА, тип «AC»") (gip:fmt-model (gip:g b (if is3 "fire4" "fire2")) (gip:g d "In")) (gip:g b "name") "шт." 1)))
      ((= k "km") (gip:sp-add "km" (gip:row (strcat "Контактор модульный с катушкой упр. 230В, " (itoa (gip:gn d "kmI" 25)) "A, " (itoa (gip:gn d "kmC" (if is3 4 2))) "НО") (gip:g d "model") (gip:g b "name") "шт." 1)))
      ((= k "xb") (gip:sp-add "xb" (gip:row (strcat "Распределительный блок (кросс-модуль) " (if is3 "4П" "2П") ", 125A") "" "" "шт." 1)))))
  (gip:sp-add "nbus" (gip:row "Шина нулевая N на изоляторах" "" "" "шт." 1))
  (gip:sp-add "pebus" (gip:row "Шина защитная PE на изоляторах" "" "" "шт." 1))
  ;; порядок как в проектах ГИП
  (defun gip:sp-rank (key / c)
    (setq c (substr key 1 1))
    (cond ((= key "box") (list 0 0 0)) ((= key "rn") (list 1 0 0))
          ((and (member c '("a" "d" "r" "f")) (= (substr key 3 1) "_"))
           (list (cdr (assoc c '(("a" . 2) ("d" . 3) ("r" . 4) ("f" . 4)))) (- (atoi (substr key 2 1))) (atoi (substr key 4))))
          (T (list (gip:gn '(("km" . 5) ("xb" . 6) ("nbus" . 7) ("pebus" . 8)) key 9) 0 0))))
  (setq order (gip:msort order '(lambda (x y / a b) (setq a (gip:sp-rank x) b (gip:sp-rank y))
                                    (cond ((/= (car a) (car b)) (< (car a) (car b))) ((/= (cadr a) (cadr b)) (< (cadr a) (cadr b))) (T (< (caddr a) (caddr b)))))))
  (mapcar '(lambda (k) (cdr (assoc k map))) order))

;; значение атрибута блока по тегу (пусто, если нет)
(defun gip:blk-att (o tag / atts v)
  (setq v "" atts (vl-catch-all-apply 'vlax-invoke (list o 'GetAttributes)))
  (if (not (vl-catch-all-error-p atts))
    (foreach a atts (if (= (strcase (vlax-get a 'TagString)) tag) (setq v (vlax-get a 'TextString)))))
  v)

;; роль листа плана, на котором считается блок: розетки — «силовые сети», выключатели и светильники — «сети освещения»
(setq *gip:spec-blocks* '(("ЭОМ_Светильники_GIP" "l" "plan_l") ("ЭОМ_Выключатели_GIP" "s" "plan_l") ("ЭОМ_Розетки_GIP" "s" "plan_p")))

;; подсчёт блоков на листах планов: список (наименование вид-блока число); наименование — атрибут ИМЯ блока
;; (запасной вариант — динамическое свойство «Вид»). Условные обозначения и заготовки не считаются.
(defun gip:plan-counts (sheets / ss i e o nm v cnt r ip boxes bi c)
  (setq cnt nil boxes nil)
  (foreach sh sheets
    (if (gip:starts (gip:g sh "role") "plan_")
      (setq boxes (cons (list (- (car (gip:g sh "F")) *gip:SW*) (cadr (gip:g sh "F")) (car (gip:g sh "F")) (+ (cadr (gip:g sh "F")) *gip:SHH*) (gip:g sh "role")) boxes))))
  (if (and boxes (setq ss (ssget "_X" '((0 . "INSERT")))))
    (progn
      (setq i 0)
      (while (< i (sslength ss))
        (setq e (ssname ss i) i (1+ i) ip (cdr (assoc 10 (entget e))))
        (if (and (not (assoc -3 (entget e (list *gip:app*))))
                 (setq r (vl-some '(lambda (b) (if (and (< (car b) (car ip) (caddr b)) (< (cadr b) (cadr ip) (cadddr b))) b)) boxes)))
          (progn
            (setq o (vlax-ename->vla-object e))
            (setq nm (vl-catch-all-apply 'vlax-get (list o 'EffectiveName)))
            (if (and (= (type nm) 'STR) (setq bi (assoc nm *gip:spec-blocks*)) (= (nth 2 bi) (nth 4 r)))
              (progn
                (setq v (gip:blk-att o "ИМЯ"))
                (if (= v "")
                  (foreach p (vlax-invoke o 'GetDynamicBlockProperties)
                    (if (= (vlax-get p 'PropertyName) "Вид") (setq v (vlax-get p 'Value)))))
                (if (and (= (type v) 'STR) (/= (gip:trim v) ""))
                  (progn
                    (setq v (gip:trim v) c (assoc (list nm v) cnt))
                    (if c (setq cnt (subst (cons (car c) (1+ (cdr c))) c cnt))
                          (setq cnt (append cnt (list (cons (list nm v) 1))))))))))))))
  cnt)

(defun gip:bath-count (S / n)
  (setq n 0)
  (foreach l (gip:g S "light")
    (if (or (gip:has (gip:lower l) "сануз") (gip:has (gip:lower l) "ванн") (gip:has (gip:lower l) "душ")) (setq n (1+ n))))
  (max n 1))

(defun gip:round5 (x) (* 5 (gip:ceil (/ x 5.0))))

;; все строки спецификации: список секций (номер название строки)
(defun gip:spec-sections (S BRD sheets / nm b sec1 cnt sec2 r sw sk boxes cab cabs mats bath sv area kup pe6 pe25 d20 d16 d25 d32 c)
  (setq b *gip:b* area (gip:gn S "area" 50.0) bath (gip:bath-count S) kup (gip:g S "kup"))
  (setq sec1 (gip:spec-board S BRD b))
  ;; оборудование по планам: наименования берутся из атрибута ИМЯ блоков; порядок — светильники, выключатели, розетки
  (setq cnt (gip:plan-counts sheets) sec2 nil sw 0)
  (foreach bi (list "ЭОМ_Светильники_GIP" "ЭОМ_Выключатели_GIP" "ЭОМ_Розетки_GIP")
    (foreach c (vl-sort (vl-remove-if-not '(lambda (x) (= (car (car x)) bi)) cnt) '(lambda (a b) (< (cadr (car a)) (cadr (car b)))))
      (setq nm (cadr (car c)))
      (if (= bi "ЭОМ_Светильники_GIP")
        (setq sec2 (append sec2 (list (gip:row nm "определяется заказчиком" "определяется заказчиком" "шт." (cdr c)))))
        (progn
          (setq sec2 (append sec2 (list (gip:row nm "" "Legrand" "шт." (cdr c)))))
          ;; под каждый механизм — монтажная коробка (кроме лючков в пол и выводов)
          (if (not (or (gip:starts nm "Лючок") (gip:starts nm "Вывод"))) (setq sw (+ sw (cdr c))))))))
  (if (> sw 0) (setq sec2 (append sec2 (list (gip:row "Монтажная коробка на 1 пост для сухих перегородок, глуб. 50 мм" "" "Legrand" "шт." sw)))))
  ;; кабели и трубы по длинам линий
  (setq cabs nil d16 0 d20 0 d25 0 d32 0)
  (foreach l (vl-remove-if '(lambda (l) (or (gip:g l "reserve") (= (gip:gn l "cable" "") "") (<= (gip:gn l "len" 0) 0))) (gip:g BRD "lines"))
    (setq c (gip:repl (gip:g l "cable") "×" "х"))
    (setq cabs (gip:s cabs c (+ (gip:gn cabs c 0) (gip:g l "len"))))
    (setq sv (gip:conduit (gip:g l "cable")))
    (cond ((= sv "П16") (setq d16 (+ d16 (gip:g l "len")))) ((= sv "П20") (setq d20 (+ d20 (gip:g l "len"))))
          ((= sv "П25") (setq d25 (+ d25 (gip:g l "len")))) (T (setq d32 (+ d32 (gip:g l "len"))))))
  (setq cabs (gip:msort cabs '(lambda (a b) (< (gip:cab-key (car a)) (gip:cab-key (car b))))))
  (setq pe6 (if kup (* bath (gip:ceil (+ 1.5 (* 0.45 (sqrt area))))) 0) pe25 (if kup (* bath 15) 0))
  (setq mats nil)
  (foreach q (list (list d16 "16" "0616" "011631") (list d20 "20" "0620" "012031") (list d25 "25" "0625" "012531") (list d32 "32" "0632" "013231"))
    (if (> (car q) 0)
      (setq mats (append mats (list (gip:row (strcat "Клипса для трубки d=" (cadr q) "мм") (caddr q) "Промрукав" "шт." (gip:round5 (car q)))
                                    (gip:row (strcat "Труба гофрированная d=" (cadr q) "мм") (cadddr q) "Промрукав" "п.м." (gip:round5 (car q))))))))
  (setq mats (append mats (list (gip:row "Расходные материалы" "" "" "компл." 1))))
  (if (> (gip:gn S "floor" 0) 0) (setq mats (append mats (list (gip:row "Комплект тёплого пола" "" "" "компл." (gip:g S "floor"))))))
  (if kup (setq mats (append mats (list (gip:row "Коробка уравнивания потенциалов для бетона, 32А" "" "МПО Электромонтаж" "шт." bath)))))
  (setq cab nil)
  (foreach c cabs (setq cab (append cab (list (gip:row (strcat "Кабель силовой, " (car c) "кв.мм") (gip:gn S "mark" "ВВГнг(А)-LS") "Конкорд" "п.м." (gip:round5 (cdr c)))))))
  (if kup
    (setq cab (append cab (list (gip:row "Провод желто-зелёный, 1х6кв.мм" "ПуГВнг(А)-LS" "Конкорд" "п.м." pe6)
                                (gip:row "Провод желто-зелёный, 1х2,5кв.мм" "ПуГВнг(А)-LS" "Конкорд" "п.м." pe25)))))
  (list (list "Щитовое оборудование" sec1)
        (if sec2 (list "Оборудование" sec2))
        (list "Материалы" mats)
        (list "Кабельная продукция" cab)))

(defun gip:cab-key (s / p a b)
  ;; "3х1,5" -> 3001.5 для сортировки
  (setq p (vl-string-search "х" s))
  (if p (+ (* 1000 (atoi (substr s 1 p))) (atof (gip:repl (substr s (+ p 2)) "," "."))) 0))

;; раскладка спецификации по листам: стр.1 — секции 1–2, далее — 3–4 (как в проектах ГИП)
(setq *gip:spec-rows* 27)
(defun gip:spec-pages (secs / pages cur no)
  (setq pages nil cur nil no 0)
  (defun gip:sp-addsec (sec / rows)
    (setq no (1+ no))
    (setq rows (cons (list (cons "sec" T) (cons "pos" no) (cons "name" (car sec))) (cadr sec)))
    (foreach r rows
      (if (>= (length cur) *gip:spec-rows*) (setq pages (append pages (list cur)) cur nil))
      (setq cur (append cur (list r))))
    (if (< (length cur) *gip:spec-rows*) (setq cur (append cur (list nil)))))
  (foreach sec (vl-remove 'nil (list (nth 0 secs) (nth 1 secs))) (gip:sp-addsec sec))
  (setq pages (append pages (list cur)) cur nil)
  (foreach sec (vl-remove 'nil (list (nth 2 secs) (nth 3 secs))) (gip:sp-addsec sec))
  (if cur (setq pages (append pages (list cur))))
  pages)

;; лист спецификации с правым нижним углом рамки F
(defun gip:spec-sheet (rows F no tot / ri y fx fy)
  (setq fx (car F) fy (cadr F))
  (gip:place "frame" (+ fx -19960.1234209281) (+ fy 10782.4628509109)
    '(lambda (its) (mapcar '(lambda (it) (if (= (car it) "I") (append (gip:take it 10) (list "ЭОМ.СО") (gip:drop it 11)) it)) its)))
  (gip:place "specpage" fx fy
    '(lambda (its) (mapcar '(lambda (it / p rx ry)
                              (if (and (= (car it) "E") (= (gip:it-get it 0) "MTEXT"))
                                (progn (setq p (assoc 10 (cdr it)) rx (- (cadr p) fx) ry (- (caddr p) fy))
                                       (cond ((and (equal ry 1250.0 1.0) (equal rx -2750.0 1.0)) (gip:it-text it (gip:gn *gip:S* "stage" "Р")))
                                             ((and (equal ry 1250.0 1.0) (equal rx -2000.0 1.0)) (gip:it-text it no))
                                             ((and (equal ry 1250.0 1.0) (equal rx -1150.0 1.0)) (gip:it-text it tot))
                                             (T it)))
                                it)) its)))
  (setq ri 0)
  (repeat *gip:spec-rows*
    (gip:place "specrow" fx (+ fy 13600.0 (* ri -400.0)) nil)
    (setq ri (1+ ri)))
  (setq ri 0)
  (foreach r rows
    (setq y (+ fy 13600.0 (* ri -400.0)))
    (cond
      ((null r) nil)
      ((gip:g r "sec")
       (gip:mt "cell_secpos" (- fx 19460.5) y (itoa (gip:g r "pos")) nil)
       (gip:mt "cell_secname" (- fx 14960.5) y (gip:g r "name") nil))
      (T
       (gip:mt "cell_name" (- fx 14960.5) y (gip:g r "name") nil)   ; отступ задаёт форматирование ячейки (\\pxl1,sm0.7,ql;), без пробелов в тексте
       (if (/= (gip:gn r "type" "") "") (gip:mt (if (= (gip:g r "type") "определяется заказчиком") "cell_type7" "cell_type") (- fx 9760.5) y (gip:g r "type") nil))
       (if (/= (gip:gn r "maker" "") "") (gip:mt (if (= (gip:g r "maker") "определяется заказчиком") "cell_type7" "cell_maker") (- fx 5735.5) y (gip:g r "maker") nil))
       (if (/= (gip:gn r "unit" "") "") (gip:mt "cell_unit" (- fx 4210.5) y (gip:g r "unit") nil))
       (if (gip:g r "qty") (gip:mt "cell_qty" (- fx 3060.5) y (if (= (type (gip:g r "qty")) 'STR) (gip:g r "qty") (itoa (gip:g r "qty"))) nil))))
    (setq ri (1+ ri))))
