# -*- coding: utf-8 -*-
"""Проверка вставки плана и экспликации в реальный DXF-шаблон ГИП."""
import os
import sys
import tempfile
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from run import make
from lispemu import DPair, LispError

I, A = make()

def run(expr):
    try:
        return I.run(expr)
    except LispError as exc:
        print("LISP ERROR:", exc, getattr(exc, "trace", None))
        raise

# Забираем реальные точки рамок из шаблона. Имитируем альбом, где рамки уже
# помечены GIPGEN: общий сборщик альбома их исключает, но импорт плана обязан видеть.
frames = run('(mapcar \'(lambda (x) (gip:g x "e")) (gip:plan-template-sheets))')
assert len(frames) >= 3, "Не найдены динамические рамки А3-GIP-ALBOM в шаблоне"
for en in frames:
    A.ents[en.h].xdata.setdefault("GIPGEN", []).append(DPair(1000, "already-generated"))

generic = run('(gip:template-sheets)')
assert not generic, "Тест ожидал помеченные рамки, которые общий поиск альбома должен исключить"

sheet_rows = run('(mapcar \'(lambda (x) (list (gip:g x "role") (gip:g x "F"))) (gip:plan-template-sheets))')
roles = {row[0] for row in sheet_rows}
assert {"plan_p", "plan_l", "plan_d"}.issubset(roles), "Импорт не распознал все три листа планов: %r" % (roles,)
power_frame = next(row[1] for row in sheet_rows if row[0] == "plan_p")

with tempfile.TemporaryDirectory() as tmp:
    prefix = tmp + os.sep
    A.vars["TEMPPREFIX"] = prefix
    src = os.path.join(tmp, "gip_plan_in.txt")
    with open(src, "w", encoding="utf-8", newline="\n") as f:
        f.write('(GIPPLAN 1 50 6000.0 5000.0 "CI test")\n')
        f.write('(L 0 0.0 0.0 1000.0 0.0)\n')
        f.write('(R 1 "Entry")\n')
        f.write('(N 1 1000.0 1500.0)\n')

    # Автоматический режим не должен вызывать getpoint: вставляем в найденные рамки.
    result = run('(gip:plan-import "' + src.replace("\\", "/") + '" T)')
    assert result == "GIP_PLAN_1", "Импорт не завершился успешно: %r / %s" % (result, "".join(I.out)[-1500:])
    assert not os.path.exists(src), "Временный файл импорта не удалён после обработки"

tagged = [
    A.ents[h] for h in A.order
    if not A.ents[h].deleted and A.ents[h].ins is not None and "GIPPLAN" in A.ents[h].xdata
]
counts = Counter(e.ins["name"] for e in tagged)
plan_refs = [e for e in tagged if e.ins["name"] == "GIP_PLAN_1"]
exp_refs = [e for e in tagged if e.ins["name"].startswith("GIP_PLAN_EXP_")]
room_refs = [e for e in tagged if e.ins["name"] == "NUM-POM_GIP"]

assert len(plan_refs) == 3, "Подложка должна быть вставлена на силовой план, освещение и ДСУП: %r" % counts
assert len(exp_refs) == 1, "Экспликация не вставлена отдельным блоком: %r" % counts
assert len(room_refs) == 3, "Номер помещения должен быть вставлен на каждый из трёх планов: %r" % counts
assert exp_refs[0].ins["pt"][0] == power_frame[0] - 20460.5
assert exp_refs[0].ins["pt"][1] == power_frame[1] + 500.0

# Центр подложки должен находиться в габаритах целевой рамки, а не по внешней
# координате листа или в произвольной точке модели.
for e in plan_refs:
    x, y, _ = e.ins["pt"]
    assert power_frame[0] - 20960.5 < x < power_frame[0]
    assert power_frame[1] < y < power_frame[1] + 14850.0

assert any(name.startswith("GIP_PLAN_EXP_") for name in A.newblocks), "Геометрия экспликации не создана"
print("PDF plan import: 3 frames, explication and NUM-POM_GIP — ALL OK")
