;;; ============================================================================
;;; GIP-ЩИТ для AutoCAD 2021–2024 — проектирование квартирного щита ГИП
;;; Общие функции: строки, списки, числа, декодирование \U+XXXX
;;; ============================================================================
(vl-load-com)

;; Декодирование строк вида "\U+041F\U+0440..." (все русские строки в файле записаны так,
;; чтобы файл оставался ASCII и одинаково читался при любой кодировке).
(defun gip:hex (s / n i c v)
  (setq n 0 i 1)
  (while (<= i (strlen s))
    (setq c (ascii (strcase (substr s i 1))))
    (setq v (if (<= c 57) (- c 48) (- c 55)))
    (setq n (+ (* n 16) v) i (1+ i)))
  n)

(defun gip:u (s / r i n p)
  (if (and (= (type s) 'STR) (vl-string-search "\\U+" s))
    (progn
      (setq r "" i 0 n (strlen s))
      (while (setq p (vl-string-search "\\U+" s i))
        (setq r (strcat r (substr s (1+ i) (- p i)) (chr (gip:hex (substr s (+ p 4) 4))))
              i (+ p 7)))
      (strcat r (substr s (1+ i))))
    s))

(defun gip:deep-u (x)
  (cond ((= (type x) 'STR) (gip:u x))
        ((and (listp x) x (vl-consp x) (not (listp (cdr x))))
         (cons (gip:deep-u (car x)) (gip:deep-u (cdr x))))
        ((listp x) (mapcar 'gip:deep-u x))
        (T x)))

;; ---------------------------------------------------------------- ассоц. списки
(defun gip:g (a k) (cdr (assoc k a)))
(defun gip:s (a k v / p)
  (if (setq p (assoc k a))
    (subst (cons k v) p a)
    (append a (list (cons k v)))))
(defun gip:gn (a k d / v) (if (setq v (gip:g a k)) v d))
(defun gip:nz (v d) (if v v d))

;; ---------------------------------------------------------------- строки
(defun gip:split (s sep / r p n)
  (setq r nil n (strlen sep))
  (while (setq p (vl-string-search sep s))
    (setq r (cons (substr s 1 p) r) s (substr s (+ p n 1))))
  (reverse (cons s r)))

(defun gip:join (l sep / r)
  (setq r "")
  (foreach x l (setq r (if (= r "") x (strcat r sep x))))
  r)

(defun gip:repl (s old new / r p n)
  (setq r "" n (strlen old))
  (while (setq p (vl-string-search old s))
    (setq r (strcat r (substr s 1 p) new) s (substr s (+ p n 1))))
  (strcat r s))

(defun gip:trim (s) (vl-string-trim " \t\n\r" s))
(defun gip:lower (s) (strcase s T))
(defun gip:has (s p) (if (vl-string-search p s) T nil))
(defun gip:starts (s p) (and (>= (strlen s) (strlen p)) (= (substr s 1 (strlen p)) p)))
(defun gip:ends (s p) (and (>= (strlen s) (strlen p)) (= (substr s (1+ (- (strlen s) (strlen p)))) p)))

;; перенос по словам (как dxWrap)
(defun gip:wrap (txt mx / out cur w)
  (setq out nil cur "")
  (foreach w (gip:split txt " ")
    (if (<= (strlen (gip:trim (strcat cur " " w))) mx)
      (setq cur (gip:trim (strcat cur " " w)))
      (progn (if (/= cur "") (setq out (cons cur out))) (setq cur w))))
  (if (/= cur "") (setq out (cons cur out)))
  (reverse out))

(defun gip:take (l n / r)
  (setq r nil)
  (while (and l (> n 0)) (setq r (cons (car l) r) l (cdr l) n (1- n)))
  (reverse r))
(defun gip:drop (l n) (while (and l (> n 0)) (setq l (cdr l) n (1- n))) l)

;; ---------------------------------------------------------------- числа
(defun gip:round (x) (if (minusp x) (- (fix (+ (- x) 0.5))) (fix (+ x 0.5))))
(defun gip:pad0 (s n) (while (< (strlen s) n) (setq s (strcat "0" s))) s)

;; x с d знаками после запятой, десятичный разделитель — запятая
(defun gip:fmt (x d / k n neg ip fp)
  (setq k (expt 10 d) n (gip:round (* x k)) neg (minusp n) n (abs n))
  (setq ip (/ n k) fp (rem n k))
  (strcat (if (and neg (> n 0)) "-" "") (itoa ip) (if (> d 0) (strcat "," (gip:pad0 (itoa fp) d)) "")))
(defun gip:f1 (x) (gip:fmt x 1))
;; без хвостовых нулей
(defun gip:fmtz (x d / s)
  (setq s (gip:fmt x d))
  (if (vl-string-search "," s)
    (progn (setq s (vl-string-right-trim "0" s)) (if (gip:ends s ",") (setq s (substr s 1 (1- (strlen s)))))))
  s)
;; число в строку с точкой (для служебных целей)
(defun gip:num (x) (if (= (type x) 'INT) (itoa x) (gip:repl (gip:fmtz x 6) "," ".")))
(defun gip:ceil (x / f) (setq f (fix x)) (if (> x f) (1+ f) f))

;; ---------------------------------------------------------------- сортировка (устойчивая, без потерь)
(defun gip:msort (l f / a b n h)
  (if (or (null l) (null (cdr l)))
    l
    (progn
      (setq n (/ (length l) 2) a (gip:take l n) b (gip:drop l n))
      (gip:merge (gip:msort a f) (gip:msort b f) f))))
(defun gip:merge (a b f / r)
  (setq r nil)
  (while (and a b)
    (if (apply f (list (car b) (car a)))
      (setq r (cons (car b) r) b (cdr b))
      (setq r (cons (car a) r) a (cdr a))))
  (append (reverse r) a b))

(defun gip:index (x l / i r)
  (setq i 0 r nil)
  (while (and l (not r)) (if (equal (car l) x) (setq r i)) (setq i (1+ i) l (cdr l)))
  r)
(defun gip:sum (l) (if l (apply '+ l) 0))
(defun gip:filter (f l) (vl-remove-if-not f l))
(defun gip:range (n / r) (setq r nil) (while (> n 0) (setq n (1- n) r (cons n r))) r)
