;;; ============================================================================
;;; Построение объектов: прототипы из рабочих файлов ГИП, сдвиг, правка текста,
;;; вставка динамических блоков по имени с видимостью и атрибутами
;;; ============================================================================
(setq *gip:app* "GIPGEN")          ; метка созданных объектов (xdata)
(setq *gip:dev-app* "GIPDEV")      ; метка аппаратов монтажной схемы (id аппарата)

(defun gip:protos ()
  (if (null *gip:protos*) (setq *gip:protos* (gip:deep-u *gip:protos-raw*)))
  *gip:protos*)
(defun gip:proto (name / p)
  (if (setq p (assoc name (gip:protos))) (cdr p) (progn (princ (strcat "\nGIP: нет прототипа " name)) nil)))

;; ---------------------------------------------------------------- сдвиг
(defun gip:shift-pt (p dx dy) (append (list (car p) (+ (cadr p) dx) (+ (caddr p) dy)) (cdddr p)))

(defun gip:shift-data (data dx dy / typ out firstH edge c)
  (setq typ (cdr (assoc 0 data)) out nil firstH T edge nil)
  (foreach p data
    (setq c (car p))
    (cond
      ((= typ "HATCH")
       (cond ((and (= c 10) (listp (cdr p)) firstH) (setq firstH nil out (cons p out)))
             ((and (= c 10) (listp (cdr p))) (setq out (cons (gip:shift-pt p dx dy) out)))
             ((= c 72) (setq edge (cdr p) out (cons p out)))
             ((and (= c 11) (listp (cdr p)) (= edge 1)) (setq out (cons (gip:shift-pt p dx dy) out)))
             (T (setq out (cons p out)))))
      ((and (= c 10) (listp (cdr p)) (member typ '("LINE" "LWPOLYLINE" "CIRCLE" "ARC" "ELLIPSE" "TEXT" "MTEXT" "SOLID" "POINT")))
       (setq out (cons (gip:shift-pt p dx dy) out)))
      ((and (= c 11) (listp (cdr p)) (member typ '("LINE" "TEXT" "SOLID")))
       (setq out (cons (gip:shift-pt p dx dy) out)))
      ((and (member c '(12 13)) (listp (cdr p)) (= typ "SOLID"))
       (setq out (cons (gip:shift-pt p dx dy) out)))
      (T (setq out (cons p out)))))
  (reverse out))

(defun gip:shift-item (it dx dy)
  (if (= (car it) "E")
    (cons "E" (gip:shift-data (cdr it) dx dy))
    (append (list (nth 0 it) (nth 1 it) (+ (nth 2 it) dx) (+ (nth 3 it) dy)) (gip:drop it 4))))

;; ---------------------------------------------------------------- правка данных
(defun gip:dset (data c v / p)
  (if (setq p (assoc c data)) (subst (cons c v) p data) (append data (list (cons c v)))))
(defun gip:dget (data c) (cdr (assoc c data)))
(defun gip:it-set (it c v) (cons "E" (gip:dset (cdr it) c v)))
(defun gip:it-get (it c) (gip:dget (cdr it) c))
(defun gip:it-type (it) (if (= (car it) "E") (gip:it-get it 0) "INSERT"))

;; экранирование текста MTEXT
(defun gip:mt-esc (s)
  (gip:repl (gip:repl (gip:repl (gip:repl s "\\" "\\\\") "{" "\\{") "}" "\\}") "\n" "\\P"))

;; содержимое MTEXT: префикс форматирования до последней ';' + текст + закрывающие скобки
(defun gip:mt-wrap (full text / i n pre post c)
  (setq n (strlen full) post "")
  (while (and (> n 0) (= (substr full n 1) "}")) (setq post (strcat post "}") n (1- n)))
  (setq pre "" i n)
  (while (> i 0)
    (if (and (= pre "") (= (substr full i 1) ";")) (setq pre (substr full 1 i)))
    (setq i (1- i)))
  (strcat pre (gip:mt-esc text) post))

(defun gip:it-text (it text / data typ full val chunks)
  (setq data (cdr it) typ (cdr (assoc 0 data)))
  (if (/= typ "MTEXT")
    (gip:it-set it 1 text)
    (progn
      (setq full "")
      (foreach p data (if (= (car p) 3) (setq full (strcat full (cdr p)))))
      (setq full (strcat full (gip:dget data 1)))
      (setq val (gip:mt-wrap full text))
      (gip:mt-set it val))))

;; записать готовое содержимое MTEXT (длинное — кусками по 250 в код 3)
(defun gip:mt-set (it val / data before after chunks seen)
  (setq data (vl-remove-if '(lambda (p) (= (car p) 3)) (cdr it)))
  (setq chunks nil)
  (while (> (strlen val) 250) (setq chunks (append chunks (list (cons 3 (substr val 1 250)))) val (substr val 251)))
  (setq before nil after nil seen nil)
  (foreach p data
    (cond ((= (car p) 1) (setq seen T))
          (seen (setq after (append after (list p))))
          (T (setq before (append before (list p))))))
  (cons "E" (append before chunks (list (cons 1 val)) after)))

(defun gip:it-line (it x1 y1 x2 y2 / d)
  (setq d (gip:dset (cdr it) 10 (list x1 y1 0.0)))
  (setq d (subst (list 10 x1 y1 0.0) (assoc 10 d) d))
  (setq d (subst (list 11 x2 y2 0.0) (assoc 11 d) d))
  (cons "E" d))

;; вершины полилинии: pts — плоский список x y x y ...
(defun gip:it-poly (it pts / data head tail mid n firstSeen k)
  (setq data (cdr it) head nil tail nil firstSeen nil)
  (foreach p data
    (cond ((member (car p) '(10 40 41 42 91))
           (setq firstSeen T))
          ((not firstSeen) (setq head (append head (list p))))
          (T (setq tail (append tail (list p))))))
  (setq mid nil k 0)
  (while (< k (length pts)) (setq mid (append mid (list (list 10 (nth k pts) (nth (1+ k) pts)))) k (+ k 2)))
  (setq head (subst (cons 90 (/ (length pts) 2)) (assoc 90 head) head))
  (cons "E" (append head mid tail)))

;; атрибуты вставки: в элементе "I" — список (тег . значение)
(defun gip:it-att (it tag val / atts)
  (if (= (car it) "I")
    (progn
      (setq atts (nth 12 it))
      (setq atts (if (assoc tag atts)
                   (mapcar '(lambda (a) (if (= (car a) tag) (cons tag val) a)) atts)
                   (append atts (list (cons tag val)))))
      (append (gip:take it 12) (list atts)))
    it))
(defun gip:it-atts (it pairs) (foreach p pairs (setq it (gip:it-att it (car p) (cdr p)))) it)

;; ---------------------------------------------------------------- создание
(defun gip:tag-list (tag) (list (list -3 (list *gip:app* (cons 1000 tag)))))

(defun gip:mk (data tag / e)
  (setq e (entmakex (append data (gip:tag-list tag))))
  (if (null e) (princ (strcat "\nGIP: не создан объект " (vl-princ-to-string (cdr (assoc 0 data))))))
  e)

(defun gip:ms ()
  (if (null *gip:ms*) (setq *gip:ms* (vla-get-modelspace (vla-get-activedocument (vlax-get-acad-object)))))
  *gip:ms*)

(defun gip:layer (name)
  (if (not (tblsearch "LAYER" name))
    (entmakex (list '(0 . "LAYER") '(100 . "AcDbSymbolTableRecord") '(100 . "AcDbLayerTableRecord") (cons 2 name) '(70 . 0) '(62 . 7) '(6 . "Continuous"))))
  name)

(defun gip:set-dyn (obj name val / props r)
  (setq props (vl-catch-all-apply 'vlax-invoke (list obj 'GetDynamicBlockProperties)))
  (if (not (vl-catch-all-error-p props))
    (foreach p props
      (if (= (strcase (vlax-get p 'PropertyName)) (strcase name))
        (progn
          (setq r (vl-catch-all-apply 'vlax-put (list p 'Value val)))
          (if (vl-catch-all-error-p r) (princ (strcat "\nGIP: свойство " name " = " (vl-princ-to-string val) ": " (vl-catch-all-error-message r)))))))))

(defun gip:set-atts (obj pairs / atts)
  (setq atts (vl-catch-all-apply 'vlax-invoke (list obj 'GetAttributes)))
  (if (not (vl-catch-all-error-p atts))
    (foreach a atts
      (foreach p pairs
        (if (= (strcase (vlax-get a 'TagString)) (strcase (car p)))
          (vlax-put a 'TextString (cdr p)))))))

(defun gip:visprop (name)
  (cond ((member name '("ЭОМ_Розетки_GIP" "ЭОМ_Щиты_GIP" "ЭОМ_Светильники_GIP" "ЭОМ_Выключатели_GIP" "ЭОМ_Схема подвода кабеля_GIP")) "Вид")
        ((= name "А3-GIP-ALBOM") "Раздел ПД")
        ((= name "NUM-POM_GIP") "Visibility1")
        ((= name "Выключатель скрытой установки") "тип")
        (T "Visibility")))

;; видимость: свойство, в списке значений которого есть нужное состояние (имя параметра не важно)
(defun gip:set-vis (obj name val / props done av r)
  (setq props (vl-catch-all-apply 'vlax-invoke (list obj 'GetDynamicBlockProperties)) done nil)
  (if (not (vl-catch-all-error-p props))
    (foreach p props
      (if (not done)
        (progn
          (setq av (vl-catch-all-apply 'vlax-get (list p 'AllowedValues)))
          (if (and (listp av) (member val av))
            (progn (setq r (vl-catch-all-apply 'vlax-put (list p 'Value val)) done T)
                   (if (vl-catch-all-error-p r) (princ (strcat "\nGIP: " name ": видимость «" val "» — " (vl-catch-all-error-message r))))))))))
  (if (not done) (gip:set-dyn obj (gip:visprop name) val)))

;; вставка: ("I" имя x y sx sy rot° слой цвет масштаб_типа_линий видимость (свойства) (атрибуты))
(defun gip:ins (it tag / obj e ed name)
  (setq name (nth 1 it))
  (if (not (tblsearch "BLOCK" name))
    (progn (princ (strcat "\nGIP: в чертеже нет блока «" name "» — откройте шаблон ГИП")) nil)
    (progn
      (setq obj (vla-insertblock (gip:ms) (vlax-3d-point (nth 2 it) (nth 3 it) 0.0) name (nth 4 it) (nth 5 it) (abs (nth 5 it)) (* (nth 6 it) (/ pi 180.0))))
      (gip:layer (nth 7 it))
      (foreach p (nth 11 it) (gip:set-dyn obj (car p) (cdr p)))
      (if (nth 10 it) (gip:set-vis obj name (nth 10 it)))
      (if (nth 12 it) (gip:set-atts obj (nth 12 it)))
      ;; слой, цвет, масштаб типа линий и метка — одной правкой
      (setq e (vlax-vla-object->ename obj) ed (entget e))
      (setq ed (gip:dset ed 8 (nth 7 it)))
      (if (nth 8 it) (setq ed (gip:dset ed 62 (nth 8 it))))
      (if (nth 9 it) (setq ed (gip:dset ed 48 (nth 9 it))))
      (entmod (append ed (gip:tag-list tag)))
      obj)))

(defun gip:emit (items tag / r)
  (setq r nil)
  (foreach it items
    (setq r (cons (if (= (car it) "E") (gip:mk (cdr it) tag) (gip:ins it tag)) r)))
  (reverse r))

;; place: прототип, сдвиг, правка (функция от списка элементов), создание
(defun gip:place (name dx dy fn / items)
  (setq items (mapcar '(lambda (it) (gip:shift-item it dx dy)) (gip:proto name)))
  (if fn (setq items (apply fn (list items))))
  (gip:emit items *gip:tag*))

;; MTEXT по прототипу с текстом и правками (o: ("w" . ширина) ("h" . высота) ("att" . привязка))
(defun gip:mt (proto x y text o / it)
  (gip:place proto x y
    (list 'lambda '(its / it)
      (list 'setq 'it '(car its))
      (if text (list 'setq 'it (list 'gip:it-text 'it text)))
      (if (assoc "w" o) (list 'setq 'it (list 'gip:it-set 'it 41 (float (cdr (assoc "w" o))))))
      (if (assoc "h" o) (list 'setq 'it (list 'gip:it-set 'it 40 (float (cdr (assoc "h" o))))))
      (if (assoc "att" o) (list 'setq 'it (list 'gip:it-set 'it 71 (cdr (assoc "att" o)))))
      '(cons it (cdr its)))))

(defun gip:W (x1 y1 x2 y2)
  (gip:place "wire" 0.0 0.0 (list 'lambda '(its) (list 'list (list 'gip:it-line '(car its) x1 y1 x2 y2)))))
(defun gip:PL (pts proto)
  (gip:place (if proto proto "wire0") 0.0 0.0 (list 'lambda '(its) (list 'list (list 'gip:it-poly '(car its) (list 'quote pts))))))
(defun gip:dot (x y big) (gip:place (if big "dot43" "dot41") x y nil))
