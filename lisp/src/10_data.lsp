;;; ============================================================================
;;; Справочники: производители, шаблоны квартир, сечения
;;; ============================================================================
(setq *gip:brands*
  (list
    (list "abb" '("name" . "ABB") '("c" . 14295834)
      '("a1" . "S201 C{I}") '("a2" . "S202 C{I}") '("a3" . "S203 C{I}") '("a4" . "S204 C{I}")
      '("dif" . "DS201 C{I} A30") '("dif4" . "DS203NC C{I} A30")
      '("rcd2" . "F202 A-{I}/0,03") '("rcd4" . "F204 A-{I}/0,03")
      '("fire2" . "F202 AC-{I}/0,1") '("fire4" . "F204 AC-{I}/0,1")
      '("km2" . "ESB 25-20") '("km4" . "ESB 25-40"))
    (list "iek" '("name" . "IEK") '("c" . 15906304)
      '("a1" . "ВА47-29 1Р C{I}") '("a2" . "ВА47-29 2Р C{I}") '("a3" . "ВА47-29 3Р C{I}") '("a4" . "ВА47-29 4Р C{I}")
      '("dif" . "АВДТ32 C{I} 30мА") '("dif4" . "АВДТ34 C{I} 30мА")
      '("rcd2" . "ВД1-63 2Р {I}А 30мА") '("rcd4" . "ВД1-63 4Р {I}А 30мА")
      '("fire2" . "ВД1-63 2Р {I}А 100мА") '("fire4" . "ВД1-63 4Р {I}А 100мА")
      '("km2" . "КМ63-20М 25А") '("km4" . "КМ63-40М 25А"))
    (list "dekraft" '("name" . "Dekraft") '("c" . 3120727)
      '("a1" . "ВА-101 1P C{I}") '("a2" . "ВА-101 2P C{I}") '("a3" . "ВА-101 3P C{I}") '("a4" . "ВА-101 4P C{I}")
      '("dif" . "ДИФ-103 1P+N C{I} 30мА") '("dif4" . "ДИФ-103 3P+N C{I} 30мА")
      '("rcd2" . "УЗО-03 2P {I}А 30мА") '("rcd4" . "УЗО-03 4P {I}А 30мА")
      '("fire2" . "УЗО-03 2P {I}А 100мА") '("fire4" . "УЗО-03 4P {I}А 100мА")
      '("km2" . "КМ-103 25А 2НО") '("km4" . "КМ-103 25А 4НО"))
    (list "chint" '("name" . "CHINT") '("c" . 2060241)
      '("a1" . "NXB-63 1P C{I}") '("a2" . "NXB-63 2P C{I}") '("a3" . "NXB-63 3P C{I}") '("a4" . "NXB-63 4P C{I}")
      '("dif" . "NB2LE C{I} 30мА") '("dif4" . "NB2LE 4P C{I} 30мА")
      '("rcd2" . "NXL-63 2P {I}A 30мА") '("rcd4" . "NXL-63 4P {I}A 30мА")
      '("fire2" . "NXL-63 2P {I}A 100мА") '("fire4" . "NXL-63 4P {I}A 100мА")
      '("km2" . "NCH8-25/20") '("km4" . "NCH8-25/40"))))

(setq *gip:templates*
  (list
    (list "studio" '("name" . "Студия") '("area" . 30.0)
      (cons "light" (list "Прихожая" "Кухня-гостиная" "Санузел"))
      (cons "sockets" (list "Розетки кухни" "Розетки гостиной зоны" "Розетки санузла")) '("floor" . 1) '("ac" . 1))
    (list "k1" '("name" . "1-комнатная") '("area" . 40.0)
      (cons "light" (list "Прихожая" "Кухня" "Комната" "Санузел"))
      (cons "sockets" (list "Розетки кухни" "Розетки комнаты" "Розетки прихожей" "Розетки санузла")) '("floor" . 1) '("ac" . 1))
    (list "k2" '("name" . "2-комнатная") '("area" . 60.0)
      (cons "light" (list "Прихожая" "Кухня" "Гостиная" "Спальня" "Санузел"))
      (cons "sockets" (list "Розетки кухни" "Розетки гостиной" "Розетки спальни" "Розетки прихожей" "Розетки санузла")) '("floor" . 1) '("ac" . 2))
    (list "k3" '("name" . "3-комнатная") '("area" . 80.0)
      (cons "light" (list "Прихожая" "Кухня" "Гостиная" "Спальня" "Детская" "Санузел 1" "Санузел 2"))
      (cons "sockets" (list "Розетки кухни" "Розетки гостиной" "Розетки спальни" "Розетки детской" "Розетки прихожей" "Розетки санузла 1" "Розетки санузла 2")) '("floor" . 2) '("ac" . 3))))

(setq *gip:std-in* '(2 6 10 16 20 25 32 40 50 63 80 100))
(setq *gip:cable1* '((6 . "3×1,5") (10 . "3×1,5") (16 . "3×2,5") (20 . "3×2,5") (25 . "3×4") (32 . "3×6") (40 . "3×10") (50 . "3×10") (63 . "3×16")))
(setq *gip:cable3* '((10 . "5×1,5") (16 . "5×2,5") (20 . "5×2,5") (25 . "5×4") (32 . "5×6") (40 . "5×10") (50 . "5×10") (63 . "5×16")))

;; модульные контакторы: тип (ток-контакты), ток, число НО-контактов, ширина в модулях (ABB ESB)
(setq *gip:km-types* '(("20-20" 20 2 1) ("25-20" 25 2 1) ("25-40" 25 4 2) ("40-20" 40 2 3) ("40-40" 40 4 3) ("63-20" 63 2 3) ("63-40" 63 4 3)))
(setq *gip:km-model* '(("abb" . "ESB{K}N") ("iek" . "КМ63-{C}0М {I}А") ("dekraft" . "КМ-103 {I}А {C}НО") ("chint" . "NCH8-{I}/{C}0")))
;; прокладка кабелей — вид блока «ЭОМ_Схема подвода кабеля_GIP»
(setq *gip:routes* '("Потолок" "Пол, потолок" "Кабель-канал"))
;; корпуса ABB: ряд 12 модулей — UK600 (IP30), ряд 18 — Mistral41F (IP41); (имя рядов артикул)
(setq *gip:boxes* '((12 ("UK610" 1 "") ("UK620" 2 "") ("UK630" 3 "") ("UK640" 4 "") ("UK650" 5 ""))
                    (18 ("Mistral41F 18M" 1 "1SLM004102A1104") ("Mistral41F 36M" 2 "1SLM004102A1106")
                        ("Mistral41F 54M" 3 "1SLM004102A1109") ("Mistral41F 72M" 4 "1SLM004102A1110"))))

;; контактор по площади квартиры и числу фаз (3 фазы — 4 контакта), если не выбран вручную
(defun gip:km-auto (s / a)
  (setq a (gip:gn s "area" 60.0))
  (if (= (gip:g s "phases") 3)
    (cond ((<= a 70) "25-40") ((<= a 100) "40-40") (T "63-40"))
    (cond ((<= a 40) "20-20") ((<= a 70) "25-20") (T "40-20"))))
(defun gip:km-of (s / k r)
  (setq k (gip:g s "kmType"))
  (if (not (and (= (type k) 'STR) (setq r (assoc k *gip:km-types*)))) (setq r (assoc (gip:km-auto s) *gip:km-types*)))
  r)
(defun gip:km-model (s r / tpl)
  (setq tpl (gip:gn *gip:km-model* (gip:gn s "brand" "abb") (cdr (car *gip:km-model*))))
  (gip:repl (gip:repl (gip:repl tpl "{K}" (car r)) "{I}" (itoa (cadr r))) "{C}" (itoa (caddr r))))

;; корпус: наименьший с запасом 20 %, иначе наименьший, куда всё помещается (рейки — не меньше, чем на схеме)
(defun gip:pick-box (W used nrows / lst ok fit)
  (setq lst (cdr (assoc W *gip:boxes*)) ok nil fit nil)
  (foreach b lst
    (if (and (null ok) (>= (cadr b) nrows) (>= (* (cadr b) W) (* used 1.2))) (setq ok b))
    (if (and (null fit) (>= (cadr b) nrows) (>= (* (cadr b) W) used)) (setq fit b)))
  (if ok ok fit))

(defun gip:brand (key) (cdr (assoc key *gip:brands*)))
(defun gip:tpl (key) (cdr (assoc key *gip:templates*)))

(defun gip:cable-for (In poles light / v)
  (if light
    (if (= poles 3) "5×1,5" "3×1,5")
    (if (setq v (cdr (assoc In (if (= poles 3) *gip:cable3* *gip:cable1*)))) v "по расчёту")))

(defun gip:fmt-model (tpl In) (gip:repl tpl "{I}" (itoa In)))

;; Состояние по умолчанию (как в конструкторе на сайте, ABB по умолчанию)
(defun gip:default-state (tplkey / t1)
  (setq t1 (gip:tpl tplkey))
  (list (cons "v" 1) (cons "tpl" tplkey) (cons "phases" (if (= tplkey "k3") 3 1)) (cons "inA" (if (= tplkey "k3") 25 40))
        (cons "inPoles" 3) (cons "brand" "abb") (cons "prot" "dif") (cons "relay" T) (cons "km" T) (cons "fire" nil)
        (cons "railW" 18) (cons "railsMin" 0) (cons "kc" 0.4)
        (cons "light" (gip:g t1 "light")) (cons "sockets" (gip:g t1 "sockets"))
        (cons "floor" (gip:g t1 "floor")) (cons "ac" (gip:g t1 "ac")) (cons "heater" "boiler")
        (cons "app" (list '("hob" . T) '("oven" . T) '("fridge" . T) '("dw" . T) '("wash" . T) '("dry" . nil) '("leak" . T)))
        (cons "custom" nil) (cons "removed" nil) (cons "edit" nil) (cons "order" nil) (cons "breaks" nil)
        (cons "area" (gip:g t1 "area")) (cons "kup" T) (cons "board" "ЩР") (cons "stage" "Р") (cons "floorShield" T)
        (cons "xb" nil) (cons "olLen" nil) (cons "route" "Потолок") (cons "kmType" nil)))
