;;; ============================================================================
;;; Команды, окно параметров, импорт ссылки с сайта, автообновление
;;; ============================================================================

;; ---------------------------------------------------------------- base64url + UTF-8 + JSON (ссылка конструктора)
(defun gip:b64val (c)
  (cond ((and (>= c 65) (<= c 90)) (- c 65)) ((and (>= c 97) (<= c 122)) (- c 71)) ((and (>= c 48) (<= c 57)) (+ c 4))
        ((member c '(43 45)) 62) ((member c '(47 95)) 63) (T nil)))
(defun gip:b64 (s / vals out i a b c d)
  (setq vals (vl-remove 'nil (mapcar 'gip:b64val (vl-string->list s))) out nil i 0)
  (while (< i (length vals))
    (setq a (nth i vals) b (nth (+ i 1) vals) c (nth (+ i 2) vals) d (nth (+ i 3) vals))
    (if b (setq out (cons (logand 255 (+ (lsh a 2) (lsh b -4))) out)))
    (if c (setq out (cons (logand 255 (+ (lsh b 4) (lsh c -2))) out)))
    (if d (setq out (cons (logand 255 (+ (lsh c 6) d)) out)))
    (setq i (+ i 4)))
  (reverse out))
(defun gip:utf8 (bytes / r b c)
  (setq r nil)
  (while bytes
    (setq b (car bytes) bytes (cdr bytes))
    (cond ((< b 128) (setq c b))
          ((< b 224) (setq c (+ (lsh (logand b 31) 6) (logand (car bytes) 63)) bytes (cdr bytes)))
          ((< b 240) (setq c (+ (lsh (logand b 15) 12) (lsh (logand (car bytes) 63) 6) (logand (cadr bytes) 63)) bytes (cddr bytes)))
          (T (setq c 63 bytes (cdddr bytes))))
    (setq r (cons c r)))
  (apply 'strcat (mapcar 'chr (reverse r))))

;; JSON: объект -> список пар (ключ . значение), массив -> список, true -> T, false/null -> nil
(defun gip:json (s / *p* *s*)
  (setq *s* s *p* 1)
  (gip:j-val))
(defun gip:j-ch () (substr *s* *p* 1))
(defun gip:j-ws () (while (member (gip:j-ch) '(" " "\t" "\n" "\r")) (setq *p* (1+ *p*))))
(defun gip:j-val (/ c)
  (gip:j-ws) (setq c (gip:j-ch))
  (cond ((= c "{") (gip:j-obj)) ((= c "[") (gip:j-arr)) ((= c "\"") (gip:j-str))
        ((= (substr *s* *p* 4) "true") (setq *p* (+ *p* 4)) T)
        ((= (substr *s* *p* 5) "false") (setq *p* (+ *p* 5)) nil)
        ((= (substr *s* *p* 4) "null") (setq *p* (+ *p* 4)) nil)
        (T (gip:j-num))))
(defun gip:j-obj (/ r k v)
  (setq *p* (1+ *p*) r nil) (gip:j-ws)
  (if (= (gip:j-ch) "}") (setq *p* (1+ *p*))
    (progn
      (while (progn (gip:j-ws) (setq k (gip:j-str)) (gip:j-ws) (setq *p* (1+ *p*)) (setq v (gip:j-val)) (setq r (cons (cons k v) r))
                    (gip:j-ws) (= (gip:j-ch) ","))
        (setq *p* (1+ *p*)))
      (setq *p* (1+ *p*))))
  (reverse r))
(defun gip:j-arr (/ r)
  (setq *p* (1+ *p*) r nil) (gip:j-ws)
  (if (= (gip:j-ch) "]") (setq *p* (1+ *p*))
    (progn
      (while (progn (setq r (cons (gip:j-val) r)) (gip:j-ws) (= (gip:j-ch) ","))
        (setq *p* (1+ *p*)))
      (setq *p* (1+ *p*))))
  (reverse r))
(defun gip:j-str (/ r c e)
  (setq *p* (1+ *p*) r "")
  (while (/= (setq c (gip:j-ch)) "\"")
    (if (= c "\\")
      (progn (setq e (substr *s* (1+ *p*) 1))
             (cond ((= e "u") (setq r (strcat r (chr (gip:hex (substr *s* (+ *p* 2) 4)))) *p* (+ *p* 6)))
                   ((= e "n") (setq r (strcat r "\n") *p* (+ *p* 2)))
                   ((= e "t") (setq r (strcat r "\t") *p* (+ *p* 2)))
                   (T (setq r (strcat r e) *p* (+ *p* 2)))))
      (setq r (strcat r c) *p* (1+ *p*))))
  (setq *p* (1+ *p*))
  r)
(defun gip:j-num (/ st n)
  (setq st *p*)
  (while (member (gip:j-ch) (quote ("-" "+" "." "0" "1" "2" "3" "4" "5" "6" "7" "8" "9" "e" "E"))) (setq *p* (1+ *p*)))
  (setq n (substr *s* st (- *p* st)))
  (if (or (vl-string-search "." n) (vl-string-search "e" n) (vl-string-search "E" n)) (atof n) (atoi n)))

;; ссылка конструктора -> состояние GIP-ЩИТ
(defun gip:state-from-link (txt / p h j S0 S k v ks)
  (setq p (vl-string-search "shchit=" txt))
  (if p
    (progn
      (setq h (substr txt (+ p 8)))
      (if (setq p (vl-string-search "&" h)) (setq h (substr h 1 p)))
      (setq j (gip:json (gip:utf8 (gip:b64 h))))
      (setq S (gip:default-state (gip:gn j "tpl" "k1")))
      (foreach k '("tpl" "phases" "inA" "inPoles" "brand" "prot" "railW" "railsMin" "kc" "floor" "ac" "heater" "light" "sockets" "order")
        (if (assoc k j) (setq S (gip:s S k (cdr (assoc k j))))))
      (foreach k '("relay" "km" "fire") (setq S (gip:s S k (if (cdr (assoc k j)) T nil))))
      (setq S (gip:s S "app" (mapcar '(lambda (x) (cons (car x) (if (cdr x) T nil))) (gip:g j "app"))))
      (setq S (gip:s S "removed" (mapcar 'car (vl-remove-if-not 'cdr (gip:g j "removed")))))
      (setq S (gip:s S "breaks" (mapcar 'car (vl-remove-if-not 'cdr (gip:g j "breaks")))))
      (setq S (gip:s S "edit" (gip:g j "edit")))
      (setq S (gip:s S "custom" (gip:g j "custom")))
      (if (= (type (gip:g S "kc")) 'INT) (setq S (gip:s S "kc" (float (gip:g S "kc")))))
      (setq S (gip:s S "area" (gip:g (gip:tpl (gip:g S "tpl")) "area")))
      S)))

;; текст из буфера обмена Windows (ссылка, скопированная кнопкой на сайте)
(defun gip:clipboard (/ html win cb txt)
  (setq txt (vl-catch-all-apply
              '(lambda ()
                 (setq html (vlax-create-object "htmlfile"))
                 (setq win (vlax-get html 'ParentWindow) cb (vlax-get win 'ClipBoardData))
                 (vlax-invoke cb 'GetData "Text"))))
  (if html (vl-catch-all-apply 'vlax-release-object (list html)))
  (if (= (type txt) 'STR) txt))
(defun gip:ask-link (/ txt)
  (setq txt (gip:clipboard))
  (if (and txt (vl-string-search "shchit=" txt))
    (progn (princ "\nGIP: ссылка на щит взята из буфера обмена.") txt)
    (getstring T "\nВставьте ссылку на щит из конструктора gipproekt.ru: ")))

;; ---------------------------------------------------------------- построение с сообщениями
(defun gip:run (S / doc r t0)
  (setq doc (vla-get-activedocument (vlax-get-acad-object)) *gip:busy* T)
  (if (not *gip:in-reactor*) (vla-startundomark doc))
  (setq r (vl-catch-all-apply 'gip:build (list S)))
  (if (not *gip:in-reactor*) (vla-endundomark doc))
  (setq *gip:busy* nil)
  (if (vl-catch-all-error-p r)
    (progn (princ (strcat "\nGIP-ЩИТ: ошибка — " (vl-catch-all-error-message r))) nil)
    (progn
      (princ (strcat "\nGIP-ЩИТ: альбом построен. Групп: " (itoa (length (gip:g r "lines")))
                     ", аппаратов: " (itoa (length (gip:g r "all"))) ", реек: " (itoa (length (gip:g r "rails")))
                     ", корпус " (itoa (gip:g r "cap")) " мод."))
      r)))

;; ---------------------------------------------------------------- окно параметров (DCL; надписи задаются из программы)
(setq *gip:dcl*
'("gip_main : dialog { label = \"GIP\"; key = \"dlg\";"
  " : row {"
  "  : boxed_column { key = \"c1\"; label = \"\"; width = 34;"
  "   : text { key = \"l_tpl\"; } : popup_list { key = \"tpl\"; }"
  "   : text { key = \"l_area\"; } : edit_box { key = \"area\"; edit_width = 8; }"
  "   : text { key = \"l_ph\"; } : popup_list { key = \"phases\"; }"
  "   : text { key = \"l_inA\"; } : popup_list { key = \"inA\"; }"
  "   : text { key = \"l_inP\"; } : popup_list { key = \"inPoles\"; }"
  "   : text { key = \"l_brand\"; } : popup_list { key = \"brand\"; }"
  "   : text { key = \"l_prot\"; } : popup_list { key = \"prot\"; }"
  "   : text { key = \"l_rail\"; } : popup_list { key = \"railW\"; }"
  "   : text { key = \"l_kc\"; } : edit_box { key = \"kc\"; edit_width = 8; }"
  "  }"
  "  : boxed_column { key = \"c2\"; label = \"\"; width = 34;"
  "   : text { key = \"l_relay\"; } : popup_list { key = \"relay\"; }"
  "   : text { key = \"l_km\"; } : popup_list { key = \"km\"; }"
  "   : text { key = \"l_fire\"; } : popup_list { key = \"fire\"; }"
  "   : text { key = \"l_fl\"; } : popup_list { key = \"floorShield\"; }"
  "   : text { key = \"l_kup\"; } : popup_list { key = \"kup\"; }"
  "   : text { key = \"l_floor\"; } : popup_list { key = \"floor\"; }"
  "   : text { key = \"l_ac\"; } : popup_list { key = \"ac\"; }"
  "   : text { key = \"l_heater\"; } : popup_list { key = \"heater\"; }"
  "  }"
  "  : boxed_column { key = \"c3\"; label = \"\"; width = 34;"
  "   : text { key = \"l_hob\"; } : popup_list { key = \"hob\"; }"
  "   : text { key = \"l_oven\"; } : popup_list { key = \"oven\"; }"
  "   : text { key = \"l_fridge\"; } : popup_list { key = \"fridge\"; }"
  "   : text { key = \"l_dw\"; } : popup_list { key = \"dw\"; }"
  "   : text { key = \"l_wash\"; } : popup_list { key = \"wash\"; }"
  "   : text { key = \"l_dry\"; } : popup_list { key = \"dry\"; }"
  "   : text { key = \"l_leak\"; } : popup_list { key = \"leak\"; }"
  "  }"
  " }"
  " : boxed_column { key = \"c4\"; label = \"\";"
  "  : text { key = \"l_light\"; } : edit_box { key = \"light\"; edit_width = 100; edit_limit = 256; }"
  "  : text { key = \"l_sock\"; } : edit_box { key = \"sockets\"; edit_width = 100; edit_limit = 256; }"
  "  : row { : text { key = \"l_board\"; } : edit_box { key = \"board\"; edit_width = 10; } : text { key = \"l_stage\"; } : popup_list { key = \"stage\"; width = 18; } }"
  " }"
  " : row { : button { key = \"b_link\"; label = \"Link...\"; } : button { key = \"b_groups\"; label = \"Groups...\"; } : spacer { width = 10; } ok_cancel; }"
  " : text { key = \"msg\"; }"
  "}"
  "gip_groups : dialog { label = \"GIP\";"
  " : list_box { key = \"lst\"; width = 110; height = 22; tabs = \"6 46 56 70 82 92\"; }"
  " : row {"
  "  : column { : text { key = \"l_gname\"; } : edit_box { key = \"gname\"; edit_width = 40; } }"
  "  : column { : text { key = \"l_gin\"; } : popup_list { key = \"gin\"; width = 10; } }"
  "  : column { : text { key = \"l_gcab\"; } : edit_box { key = \"gcab\"; edit_width = 10; } }"
  "  : column { : text { key = \"l_gp\"; } : edit_box { key = \"gp\"; edit_width = 8; } }"
  "  : column { : text { key = \"l_gph\"; } : popup_list { key = \"gph\"; width = 10; } }"
  " }"
  " : row { : button { key = \"b_apply\"; label = \"Apply\"; } : button { key = \"b_del\"; label = \"Delete\"; } : button { key = \"b_add\"; label = \"Add\"; } : button { key = \"b_restore\"; label = \"Restore\"; } : spacer { width = 10; } ok_button; }"
  "}"))

(defun gip:dcl-file (/ f fn)
  (setq fn (vl-filename-mktemp "gipsh" nil ".dcl"))
  (setq f (open fn "w"))
  (foreach l *gip:dcl* (write-line l f))
  (close f)
  fn)

(setq *gip:yesno* '("Да" "Нет"))
(setq *gip:tpl-keys* '("studio" "k1" "k2" "k3"))
(setq *gip:brand-keys* '("abb" "iek" "dekraft" "chint"))
(setq *gip:inA-list* '(16 20 25 32 40 50 63))

(defun gip:fill (key items) (start_list key) (mapcar 'add_list items) (end_list))
(defun gip:yn (key v) (gip:fill key *gip:yesno*) (set_tile key (if v "0" "1")))
(defun gip:get-yn (key) (= (get_tile key) "0"))

(defun gip:dlg-init (S / app)
  (foreach p (list '("l_tpl" . "Квартира") '("l_area" . "Площадь квартиры, м² (для длин кабелей)") '("l_ph" . "Ввод")
                   '("l_inA" . "Вводной автомат, А") '("l_inP" . "Полюсов вводного (3 фазы)") '("l_brand" . "Производитель автоматики")
                   '("l_prot" . "Защита групп 30 мА") '("l_rail" . "Ширина рейки, модулей") '("l_kc" . "Коэффициент спроса")
                   '("l_relay" . "Реле напряжения") '("l_km" . "Мастер-выключатель (контактор)") '("l_fire" . "УЗО противопожарное 100 мА")
                   '("l_fl" . "Этажный щит на схеме") '("l_kup" . "Линия КУП (уравнивание потенциалов)") '("l_floor" . "Тёплый пол, линий")
                   '("l_ac" . "Кондиционеры, шт.") '("l_heater" . "Водонагреватель") '("l_hob" . "Варочная панель") '("l_oven" . "Духовой шкаф")
                   '("l_fridge" . "Холодильник") '("l_dw" . "ПММ и измельчитель") '("l_wash" . "Стиральная машина") '("l_dry" . "Сушильная машина")
                   '("l_leak" . "Защита от протечек и слаботочный щит")
                   '("l_light" . "Освещение — помещения через запятую") '("l_sock" . "Розетки — группы через запятую")
                   '("l_board" . "Обозначение щита") '("l_stage" . "Стадия")
                   '("b_link" . "Ссылка с сайта…") '("b_groups" . "Группы…"))
    (set_tile (car p) (cdr p)))
  (gip:fill "tpl" (mapcar '(lambda (k) (gip:g (gip:tpl k) "name")) *gip:tpl-keys*))
  (gip:fill "phases" '("1 фаза, 230 В" "3 фазы, 400/230 В"))
  (gip:fill "inA" (mapcar 'itoa *gip:inA-list*))
  (gip:fill "inPoles" '("3P" "4P"))
  (gip:fill "brand" '("ABB" "IEK" "Dekraft" "CHINT"))
  (gip:fill "prot" '("Дифавтоматы на линиях" "УЗО на группы линий"))
  (gip:fill "railW" '("12" "18" "24"))
  (gip:fill "floor" '("0" "1" "2" "3" "4"))
  (gip:fill "ac" '("0" "1" "2" "3" "4"))
  (gip:fill "heater" '("Нет" "Накопительный" "Проточный"))
  (gip:fill "stage" '("Р — рабочая" "П — проект"))
  (gip:dlg-set S))

(defun gip:dlg-set (S / app)
  (set_tile "tpl" (itoa (gip:nz (gip:index (gip:g S "tpl") *gip:tpl-keys*) 0)))
  (set_tile "area" (gip:fmtz (gip:gn S "area" 50.0) 1))
  (set_tile "phases" (if (= (gip:g S "phases") 3) "1" "0"))
  (set_tile "inA" (itoa (gip:nz (gip:index (gip:g S "inA") *gip:inA-list*) 3)))
  (set_tile "inPoles" (if (= (gip:g S "inPoles") 4) "1" "0"))
  (set_tile "brand" (itoa (gip:nz (gip:index (gip:g S "brand") *gip:brand-keys*) 0)))
  (set_tile "prot" (if (= (gip:g S "prot") "rcd") "1" "0"))
  (set_tile "railW" (itoa (gip:nz (gip:index (gip:g S "railW") '(12 18 24)) 1)))
  (set_tile "kc" (gip:fmtz (gip:gn S "kc" 0.4) 2))
  (gip:yn "relay" (gip:g S "relay")) (gip:yn "km" (gip:g S "km")) (gip:yn "fire" (gip:g S "fire"))
  (gip:yn "floorShield" (gip:g S "floorShield")) (gip:yn "kup" (gip:g S "kup"))
  (set_tile "floor" (itoa (min 4 (gip:gn S "floor" 0)))) (set_tile "ac" (itoa (min 4 (gip:gn S "ac" 0))))
  (set_tile "heater" (cond ((= (gip:g S "heater") "boiler") "1") ((= (gip:g S "heater") "flow") "2") (T "0")))
  (setq app (gip:g S "app"))
  (foreach k '("hob" "oven" "fridge" "dw" "wash" "dry" "leak") (gip:yn k (gip:g app k)))
  (set_tile "light" (gip:join (gip:g S "light") ", "))
  (set_tile "sockets" (gip:join (gip:g S "sockets") ", "))
  (set_tile "board" (gip:gn S "board" "ЩР"))
  (set_tile "stage" (if (= (gip:g S "stage") "П") "1" "0")))

(defun gip:csv (s) (vl-remove "" (mapcar 'gip:trim (gip:split s ","))))

(defun gip:dlg-read (S / app v)
  (setq S (gip:s S "tpl" (nth (atoi (get_tile "tpl")) *gip:tpl-keys*)))
  (if (setq v (distof (gip:repl (get_tile "area") "," "."))) (setq S (gip:s S "area" (float v))))
  (setq S (gip:s S "phases" (if (= (get_tile "phases") "1") 3 1)))
  (setq S (gip:s S "inA" (nth (atoi (get_tile "inA")) *gip:inA-list*)))
  (setq S (gip:s S "inPoles" (if (= (get_tile "inPoles") "1") 4 3)))
  (setq S (gip:s S "brand" (nth (atoi (get_tile "brand")) *gip:brand-keys*)))
  (setq S (gip:s S "prot" (if (= (get_tile "prot") "1") "rcd" "dif")))
  (setq S (gip:s S "railW" (nth (atoi (get_tile "railW")) '(12 18 24))))
  (if (setq v (distof (gip:repl (get_tile "kc") "," "."))) (setq S (gip:s S "kc" (float v))))
  (foreach k '("relay" "km" "fire" "floorShield" "kup") (setq S (gip:s S k (gip:get-yn k))))
  (setq S (gip:s S "floor" (atoi (get_tile "floor"))) S (gip:s S "ac" (atoi (get_tile "ac"))))
  (setq S (gip:s S "heater" (nth (atoi (get_tile "heater")) '("none" "boiler" "flow"))))
  (setq app nil)
  (foreach k '("hob" "oven" "fridge" "dw" "wash" "dry" "leak") (setq app (append app (list (cons k (gip:get-yn k))))))
  (setq S (gip:s S "app" app))
  (setq S (gip:s S "light" (gip:csv (get_tile "light"))) S (gip:s S "sockets" (gip:csv (get_tile "sockets"))))
  (setq S (gip:s S "board" (gip:trim (get_tile "board"))))
  (setq S (gip:s S "stage" (if (= (get_tile "stage") "1") "П" "Р")))
  S)

;; список групп для окна «Группы»
(defun gip:grp-items (S) (gip:build-lines S))
(defun gip:grp-text (l)
  (strcat (cond ((= (gip:g l "cat") "light") "ЛО") (T "ЛС")) "\t" (gip:g l "name") "\t" (itoa (gip:g l "In")) " A\t"
          (gip:repl (gip:g l "cable") "×" "x") "\t" (gip:f1 (gip:g l "p")) " кВт\t" (gip:gn l "phase" "")))

(defun gip:groups-dlg (dcl S / lines sel res e o id nm In cab p ph)
  (setq lines (gip:grp-items S) sel 0)
  (if (new_dialog "gip_groups" dcl)
    (progn
      (foreach p (list '("l_gname" . "Наименование") '("l_gin" . "Номинал, А") '("l_gcab" . "Кабель, мм²") '("l_gp" . "Мощность, кВт")
                       '("l_gph" . "Фаза") '("b_apply" . "Применить") '("b_del" . "Удалить группу") '("b_add" . "Добавить группу")
                       '("b_restore" . "Вернуть удалённые"))
        (set_tile (car p) (cdr p)))
      (gip:fill "gin" (mapcar 'itoa *gip:std-in*))
      (gip:fill "gph" '("авто" "L1" "L2" "L3"))
      (defun gip:g-refresh () (setq lines (gip:grp-items S)) (gip:fill "lst" (mapcar 'gip:grp-text lines)) (set_tile "lst" (itoa (min sel (max 0 (1- (length lines)))))) (gip:g-show))
      (defun gip:g-show (/ l)
        (if (setq l (nth sel lines))
          (progn (set_tile "gname" (gip:g l "name")) (set_tile "gin" (itoa (gip:nz (gip:index (gip:g l "In") *gip:std-in*) 3)))
                 (set_tile "gcab" (gip:repl (gip:g l "cable") "×" "x")) (set_tile "gp" (gip:fmtz (gip:g l "p") 2))
                 (set_tile "gph" (itoa (gip:nz (gip:index (gip:g l "phase") '("auto" "L1" "L2" "L3")) 0))))))
      (defun gip:g-apply (/ l id o v cab)
        ;; в правки попадает только то, что изменено в окне
        (if (setq l (nth sel lines))
          (progn
            (setq id (gip:g l "id") o (gip:g (gip:g S "edit") id))
            (if (/= (get_tile "gname") (gip:g l "name")) (setq o (gip:s o "name" (get_tile "gname"))))
            (setq v (nth (atoi (get_tile "gin")) *gip:std-in*))
            (if (/= v (gip:g l "In")) (setq o (gip:s o "In" v)))
            (setq cab (gip:repl (gip:repl (get_tile "gcab") "x" "×") "х" "×"))
            (if (/= cab (gip:g l "cable")) (setq o (gip:s o "cable" cab)))
            (if (and (setq v (distof (gip:repl (get_tile "gp") "," "."))) (not (equal v (gip:g l "p") 1e-6))) (setq o (gip:s o "p" (float v))))
            (setq v (nth (atoi (get_tile "gph")) '("" "L1" "L2" "L3")))
            (if (and (/= v "") (/= v (gip:g l "phase"))) (setq o (gip:s o "phase" v)))
            (if o (setq S (gip:s S "edit" (gip:s (gip:g S "edit") id o))))
            (gip:g-refresh))))
      (gip:g-refresh)
      (action_tile "lst" "(setq sel (atoi $value)) (gip:g-show)")
      (action_tile "b_apply" "(gip:g-apply)")
      (action_tile "b_del" "(if (nth sel lines) (progn (setq S (gip:s S \"removed\" (append (gip:g S \"removed\") (list (gip:g (nth sel lines) \"id\"))))) (gip:g-refresh)))")
      (action_tile "b_add" (strcat "(setq S (gip:s S \"custom\" (append (gip:g S \"custom\") (list (list (cons \"id\" (strcat \"c\" (itoa (length (gip:g S \"custom\"))) \"_\" (rtos (getvar \"DATE\") 2 6))) (cons \"name\" \"" "Новая группа" "\") (cons \"prot\" \"d\") (cons \"poles\" 1) (cons \"In\" 16) (cons \"p\" 1.0)))))) (setq sel 999) (gip:g-refresh)"))
      (action_tile "b_restore" "(setq S (gip:s S \"removed\" nil)) (gip:g-refresh)")
      (start_dialog)))
  S)

(defun gip:dialog (S / dcl id res S2)
  (setq dcl (load_dialog (gip:dcl-file)))
  (setq res 2)
  (while (= res 2)
    (if (not (new_dialog "gip_main" dcl)) (progn (princ "\nGIP: не удалось открыть окно") (setq res 0))
      (progn
        (gip:dlg-init S)
        (action_tile "tpl" "(setq S (gip:dlg-read S)) (setq S2 (gip:tpl (gip:g S \"tpl\"))) (foreach k '(\"light\" \"sockets\" \"floor\" \"ac\" \"area\") (setq S (gip:s S k (gip:g S2 k)))) (gip:dlg-set S)")
        (action_tile "b_link" "(setq S (gip:dlg-read S)) (done_dialog 3)")
        (action_tile "b_groups" "(setq S (gip:dlg-read S)) (done_dialog 2)")
        (action_tile "accept" "(setq S (gip:dlg-read S)) (done_dialog 1)")
        (setq res (start_dialog))
        (cond ((= res 2) (setq S (gip:groups-dlg dcl S)))
              ((= res 3) (setq S2 (gip:state-from-link (gip:ask-link)))
                         (if S2 (setq S S2) (princ "\nGIP: в ссылке нет состава щита (#shchit=...)"))
                         (setq res 2))))))
  (unload_dialog dcl)
  (if (= res 1) S))

;; ---------------------------------------------------------------- команды
(defun c:GIPSHCHIT (/ S)
  (setq S (gip:load-state))
  (if (null S) (setq S (gip:default-state "k2")))
  (if (= (gip:g S "v") 2)
    (princ "\nGIP-ЩИТ: щит этого чертежа собран в панели «Группы щита». Кнопка ОК соберёт его заново по шаблону."))
  (if (setq S (gip:dialog S))
    (progn
      (if (= (gip:g S "v") 2)
        (setq S (gip:s (gip:s (gip:s (gip:s (gip:s S "v" 1) "rows" nil) "order" nil) "breakAt" nil) "breaks" nil)))
      (gip:run S)))
  (princ))

(defun c:GIPUPD (/ S)
  (if (setq S (gip:load-state))
    (gip:run (gip:sync-from-montage S))
    (princ "\nGIP: в чертеже ещё нет щита — запустите ГИПЩИТ"))
  (princ))

(defun c:GIPLINK (/ S txt)
  (setq txt (gip:ask-link))
  (if (setq S (gip:state-from-link txt)) (gip:run S) (princ "\nGIP: в ссылке нет состава щита (#shchit=...)"))
  (princ))

;; автообновление: после перемещения/удаления/правки атрибутов аппаратов на монтажной схеме
(setq *gip:auto-cmds* '("MOVE" "GRIP_STRETCH" "GRIP_MOVE" "STRETCH" "ERASE" "ATTEDIT" "EATTEDIT" "-ATTEDIT" "PROPERTIES" "COPY" "DELETE" "CUTCLIP" "UNDO" "U" "REDO" "MREDO"))
(defun gip:on-cmd-ended (r args / S)
  (if (and *gip:auto* (not *gip:busy*) (member (strcase (car args)) *gip:auto-cmds*)
           (not (member (strcase (car args)) '("UNDO" "U" "REDO" "MREDO"))))
    (if (and (setq S (gip:load-state)) (gip:montage-changed))
      (progn (princ "\nGIP-ЩИТ: монтажная схема изменена — пересчитываю однолинейку и спецификацию…")
             (setq *gip:in-reactor* T)
             (gip:run (gip:sync-from-montage S))
             (setq *gip:in-reactor* nil)))))
(defun c:GIPAUTO ()
  (setq *gip:auto* (not *gip:auto*))
  (if (and *gip:auto* (null *gip:reactor*))
    (setq *gip:reactor* (vlr-command-reactor nil '((:vlr-commandEnded . gip:on-cmd-ended)))))
  (princ (if *gip:auto* "\nGIP-ЩИТ: автообновление включено — двигайте аппараты по рейкам, схема пересчитается сама."
           "\nGIP-ЩИТ: автообновление выключено — после правок запускайте ГИПОБН."))
  (princ))

(defun c:GIPPANELRU () (vla-sendcommand (vla-get-activedocument (vlax-get-acad-object)) "_GIPPANEL ") (princ))

(defun gip:on-load ()
  (setq *gip:protos* nil *gip:ms* nil)
  (if (and (getvar "LISPSYS") (= (getvar "LISPSYS") 0))
    (alert "GIP-SHCHIT: set LISPSYS = 1 and restart AutoCAD (Unicode AutoLISP is required)."))
  (setq *gip:panel-raw* nil)
  (foreach c (list (cons "ГИПЩИТ" 'c:GIPSHCHIT) (cons "ГИПОБН" 'c:GIPUPD) (cons "ГИПССЫЛКА" 'c:GIPLINK) (cons "ГИПАВТО" 'c:GIPAUTO) (cons "ГИППАНЕЛЬ" 'c:GIPPANELRU) (cons "ГИППЛАН" 'c:GIPPLAN))
    (vl-catch-all-apply 'vlax-add-cmd (list (car c) (cdr c))))
  (setq *gip:auto* T)
  (if (null *gip:reactor*) (setq *gip:reactor* (vlr-command-reactor nil '((:vlr-commandEnded . gip:on-cmd-ended)))))
  (princ "\nGIP-ЩИТ загружен. Команды: ГИПЩИТ (GIPSHCHIT) — параметры и построение альбома; ГИПОБН (GIPUPD) — пересчёт по монтажной схеме;")
  (princ "\n  ГИПССЫЛКА (GIPLINK) — щит по ссылке из конструктора на сайте; ГИПАВТО (GIPAUTO) — автообновление вкл/выкл (сейчас вкл).")
  (princ "\n  ГИППАНЕЛЬ (GIPPANEL) — панель «Группы щита» рядом с чертежом (нужен плагин GIP.bundle).")
  (princ))
