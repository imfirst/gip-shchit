;;; ============================================================================
;;; План из PDF дизайнера: подложка (квартира + мебель) одним блоком на листах планов
;;; и блоки ГИП (розетки, выключатели, светильники) на местах значков дизайнера.
;;; Данные готовит панель «План из PDF» (файл TEMPPREFIX\gip_plan_in.txt, по строке на объект):
;;;   (GIPPLAN 1 масштаб ширина высота "имя")
;;;   (L k x y x y ...) — полилиния, (C k ...) — замкнутая, (F k ...) — заливка; k: 0 квартира, 1 мебель
;;;   (S "p"|"l" "R"|"V"|"C" вид x y поворот°) — блок ГИП на силовом плане (p) или плане освещения (l)
;;; Координаты — мм от левого нижнего угла подложки. Всё созданное помечено xdata GIPPLAN
;;; (альбом при перестройке это не трогает; повторный импорт заменяет прежний).
;;; ============================================================================
(setq *gip:plan-app* "GIPPLAN" *gip:plan-file* "gip_plan_in.txt")
(setq *gip:plan-blocks* '(("R" "ЭОМ_Розетки_GIP" "розетки силовые") ("V" "ЭОМ_Выключатели_GIP" "выключатели") ("C" "ЭОМ_Светильники_GIP" "светильники")))
(setq *gip:plan-vis* (list
  (cons "R" (list "Розетка штепсельная силовая, 16A, L+N+PE (1Ф)" "Розетка штепсельная силовая, 16A, 3L+N+PE (3Ф)" "Вывод 380/220В" "Розетка USB, IP20"
                  "Терморегулятор ТП" "Лючок внутрипольный розеточный 1 роз., 16A, L+N+PE, IP44" "Лючок внутрипольный розеточный 2 роз., 16A, L+N+PE, IP44"
                  "Розетка штепсельная силовая, 16A, L+N+PE (1Ф) IP44"))
  (cons "V" (list "Выключатель 1 клавишный, 1п, 16А" "Выключатель 2 клавишный, 1п, 16A" "Выключатель 3 клавишный, 1п, 16A" "Переключатель 1 клавишный, 1п, 16A"
                  "Переключатель 2 клавишный, 1п, 16A" "Диммер" "Датчик движения"))
  (cons "C" (list "Светильник потолочный" "Светильник подвесной" "Светильник настольный / напольный" "Светильник встраиваемый" "Светильник накладной"
                  "Светильник настенный" "Светильник трековый" "Светильник потолочный IP44" "Светильник встраиваемый IP44" "Светильник накладной IP44"
                  "Светильник настенный IP44" "Светильник трековый IP44"))))
;; центр плана на листе относительно точки рамки (как в проектах ГИП: над штампом, левее)
(setq *gip:plan-at* '(-9140.0 8390.0))

(defun gip:plan-tag () (list (list -3 (list *gip:plan-app* (cons 1000 "plan")))))

;; удалить прежний импорт
(defun gip:plan-clear (/ ss i n)
  (setq n 0)
  (if (setq ss (ssget "_X" (list (list -3 (list *gip:plan-app*)))))
    (progn (setq i 0) (while (< i (sslength ss)) (entdel (ssname ss i)) (setq i (1+ i) n (1+ n)))))
  n)

;; свободное имя блока подложки
(defun gip:plan-blkname (/ i nm)
  (setq i 1)
  (while (tblsearch "BLOCK" (setq nm (strcat "GIP_PLAN_" (itoa i)))) (setq i (1+ i)))
  nm)

;; список чисел -> точки 10
(defun gip:plan-pts (nums / r)
  (setq r nil)
  (while (cdr nums) (setq r (cons (list 10 (float (car nums)) (float (cadr nums))) r) nums (cddr nums)))
  (reverse r))

(defun gip:plan-ent (it / k pts col)
  (setq k (cadr it) pts (gip:plan-pts (cddr it)) col (if (= k 1) 8 7))
  (cond
    ((< (length pts) 2) nil)
    ((eq (car it) 'F)
     (entmake (append (list '(0 . "HATCH") '(100 . "AcDbEntity") '(8 . "0") (cons 62 col) '(100 . "AcDbHatch") '(10 0.0 0.0 0.0) '(210 0.0 0.0 1.0)
                            '(2 . "SOLID") '(70 . 1) '(71 . 0) '(91 . 1) '(92 . 7) '(72 . 1) '(73 . 1) (cons 93 (length pts)))
                      (apply 'append (mapcar '(lambda (p) (list (list 10 (cadr p) (caddr p) 0.0) '(42 . 0.0))) pts))
                      (list '(97 . 0) '(75 . 0) '(76 . 1) '(47 . 1.0) '(98 . 1) (list 10 (cadr (car pts)) (caddr (car pts)) 0.0)
                            '(450 . 0) '(451 . 0) '(460 . 0.0) '(461 . 0.0) '(452 . 0) '(462 . 0.0) '(453 . 0) '(470 . "")))))
    (T
     (entmake (append (list '(0 . "LWPOLYLINE") '(100 . "AcDbEntity") '(8 . "0") (cons 62 col) '(100 . "AcDbPolyline")
                            (cons 90 (length pts)) (cons 70 (if (eq (car it) 'C) 1 0)))
                      pts)))))

;; листы планов шаблона ГИП: силовой (p), освещения (l), ДСУП (d)
(defun gip:plan-sheets (/ sh r)
  (setq r nil)
  (foreach sh (gip:template-sheets)
    (cond ((= (gip:g sh "role") "plan_p") (setq r (cons (cons "p" (gip:g sh "F")) r)))
          ((= (gip:g sh "role") "plan_l") (setq r (cons (cons "l" (gip:g sh "F")) r)))
          ((= (gip:g sh "role") "plan_d") (setq r (cons (cons "d" (gip:g sh "F")) r)))))
  r)

;; вставка с меткой GIPPLAN
(defun gip:plan-insert (name x y rot lay / obj e)
  (setq obj (vla-insertblock (gip:ms) (vlax-3d-point x y 0.0) name 1.0 1.0 1.0 (* rot (/ pi 180.0))))
  (vla-put-layer obj (gip:layer lay))
  (setq e (vlax-vla-object->ename obj))
  (entmod (append (entget e) (gip:plan-tag)))
  obj)

(defun gip:plan-import (fn / f l it head blk W H nU syms sheets org pt sh obj bl n0 nS sd)
  (if (not (and fn (findfile fn) (setq f (open fn "r"))))
    (progn (princ "\nGIP: нет файла плана из PDF") nil)
    (progn
      (regapp *gip:plan-app*)
      (setq head (read (read-line f)))
      (if (not (and (listp head) (eq (car head) 'GIPPLAN)))
        (progn (close f) (princ "\nGIP: файл плана не распознан") nil)
        (progn
          (setq W (nth 3 head) H (nth 4 head) nU 0 syms nil)
          (princ "\nGIP: подложка плана...")
          (setq blk (gip:plan-blkname))
          (entmake (list '(0 . "BLOCK") (cons 2 blk) '(70 . 0) '(10 0.0 0.0 0.0)))
          (while (setq l (read-line f))
            (if (/= l "")
              (progn
                (setq it (read l))
                (cond ((member (car it) '(L C F)) (if (gip:plan-ent it) (setq nU (1+ nU))))
                      ((eq (car it) 'S) (setq syms (cons it syms)))))))
          (close f)
          (entmake '((0 . "ENDBLK")))
          (setq n0 (gip:plan-clear))
          (setq sheets (gip:plan-sheets) nS 0)
          (if (null sheets)
            ;; не шаблон ГИП: одна точка вставки, силовой план и план освещения рядом
            (if (setq pt (getpoint "\nГИП: точка левого нижнего угла плана: "))
              (setq sheets (list (cons "p" (list (+ (car pt) (- (car *gip:plan-at*)) (/ W 2.0)) (- (cadr pt) (cadr *gip:plan-at*) (- (/ H 2.0)))))
                                 (cons "l" (list (+ (car pt) (- (car *gip:plan-at*)) (/ W 2.0) W 2000.0) (- (cadr pt) (cadr *gip:plan-at*) (- (/ H 2.0)))))))))
          (foreach sh sheets
            ;; левый нижний угол подложки: центр плана в точке *gip:plan-at* от рамки
            (setq org (list (- (+ (car (cdr sh)) (car *gip:plan-at*)) (/ W 2.0)) (- (+ (cadr (cdr sh)) (cadr *gip:plan-at*)) (/ H 2.0))))
            (gip:plan-insert blk (car org) (cadr org) 0.0 "GIP_Подложка")
            (foreach s syms
              (if (= (nth 1 s) (car sh))
                (progn
                  (setq bl (assoc (nth 2 s) *gip:plan-blocks*))
                  (if (and bl (tblsearch "BLOCK" (cadr bl)))
                    (progn
                      (setq obj (gip:plan-insert (cadr bl) (+ (car org) (nth 4 s)) (+ (cadr org) (nth 5 s)) (nth 6 s) (caddr bl)))
                      (if (setq sd (nth (nth 3 s) (cdr (assoc (nth 2 s) *gip:plan-vis*)))) (gip:set-vis obj (cadr bl) sd))
                      (setq nS (1+ nS))))))))
          (princ (strcat "\nГИП: план из PDF — подложка «" blk "» (" (itoa nU) " объектов) на " (itoa (length sheets)) " лист(ах), блоков ГИП: " (itoa nS)
                         (if (> n0 0) (strcat ", прежний импорт заменён") "") "."))
          blk)))))

;; из панели: файл во временной папке
(defun c:GIPPLANIMPORT () (gip:plan-import (strcat (getvar "TEMPPREFIX") *gip:plan-file*)) (princ))
;; вручную: выбрать файл, сохранённый панелью
(defun c:GIPPLAN (/ fn)
  (if (setq fn (getfiled "План из PDF (файл из панели «План из PDF»)" (getvar "TEMPPREFIX") "txt" 0)) (gip:plan-import fn))
  (princ))
