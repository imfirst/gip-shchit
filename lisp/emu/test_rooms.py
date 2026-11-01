# -*- coding: utf-8 -*-
"""Проверка вставки помещений (панель «Помещения»): подложка по центру листов планов, блоки номеров, реестр."""
import os, sys, shutil, tempfile
from collections import Counter
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from run import make
from lispemu import DPair, LispError

I, A = make()
def run(expr):
    try: return I.run(expr)
    except LispError as exc:
        print("LISP ERROR:", exc, getattr(exc, "trace", None)); print("".join(I.out)[-1500:]); raise

# рамки шаблона помечены GIPGEN, как после построения альбома: импорт обязан их видеть
frames = run('(mapcar \'(lambda (x) (gip:g x "e")) (gip:plan-template-sheets))')
for en in frames: A.ents[en.h].xdata.setdefault("GIPGEN", []).append(DPair(1000, "already-generated"))
sheets = run('(gip:rm-sheets)')
assert len(sheets) >= 3, "листы планов не найдены: %r" % (sheets,)

SRC = os.environ.get("ROOMS_IN") or os.path.join(HERE, "test_rooms_in.txt")
with tempfile.TemporaryDirectory() as tmp:
    A.vars["TEMPPREFIX"] = tmp + os.sep
    src = os.path.join(tmp, "gip_rooms_in.txt")
    shutil.copy(SRC, src)
    rooms_in = [l for l in open(src, encoding="utf-8") if l.startswith("(R ")]
    ok = run('(gip:rm-import "' + src.replace("\\", "/") + '")')
    rep = open(os.path.join(tmp, "gip_rooms_out.txt"), encoding="utf-8").read().splitlines()
    print("report:", ascii(rep))
    assert rep and rep[0] == "ok", "импорт не прошёл: %r / %s" % (rep, "".join(I.out)[-1200:])

tag = [A.ents[h] for h in A.order if not A.ents[h].deleted and A.ents[h].ins is not None and "GIPROOMS" in A.ents[h].xdata]
cnt = Counter(e.ins["name"].rstrip("0123456789") for e in tag)
print(cnt)
n_sheets = len(sheets)
assert cnt["GIP_RM_W_"] == n_sheets and cnt["GIP_RM_F_"] == n_sheets, cnt
assert cnt["NUM-POM_GIP_A"] == n_sheets * len(rooms_in), cnt
reg = run('(gip:room-list)')
assert len(reg) == len(rooms_in)
print("registry[0]:", ascii(reg[0]))
assert run('(gip:room-get 6 "NAME")')
assert abs(run('(gip:room-get 1 "VOL")') - run('(gip:room-get 1 "AREA")') * 2.7) < 0.02
# повторный импорт заменяет прежний
with tempfile.TemporaryDirectory() as tmp:
    A.vars["TEMPPREFIX"] = tmp + os.sep
    src = os.path.join(tmp, "gip_rooms_in.txt"); shutil.copy(SRC, src)
    run('(gip:rm-import "' + src.replace("\\", "/") + '")')
tag2 = [A.ents[h] for h in A.order if not A.ents[h].deleted and A.ents[h].ins is not None and "GIPROOMS" in A.ents[h].xdata]
assert len(tag2) == len(tag), "повторный импорт должен заменять прежний, а не дублировать: %d vs %d" % (len(tag2), len(tag))
print("rooms import: sheets %d, NUM blocks %d - ALL OK" % (n_sheets, cnt["NUM-POM_GIP_A"]))
