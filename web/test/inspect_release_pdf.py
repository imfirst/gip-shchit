# Temporary diagnostic for the supplied release PDF; not part of the product test suite.
import collections
import re
import sys
import fitz

pdf = sys.argv[1]
doc = fitz.open(pdf)
print("PDF_DIAG pages=", len(doc), "file=", pdf)
for i, page in enumerate(doc, 1):
    txt = page.get_text("text") or ""
    drawings = page.get_drawings()
    layers = collections.Counter(str(d.get("layer") or "(no layer)") for d in drawings)
    scales = re.findall(r"(?<!\d)1\s*[:：]\s*\d{1,4}(?!\d)", txt)
    lines = [re.sub(r"\s+", " ", x).strip() for x in txt.splitlines() if x.strip()]
    print("PAGE", i, "size_pt=", tuple(round(v, 1) for v in page.rect[2:]), "drawings=", len(drawings),
          "text_lines=", len(lines), "scales=", scales[:8], "layers=", layers.most_common(5))
    targets = []
    for j, line in enumerate(lines):
        if re.search(r"экспликац|масштаб|1\s*[:：]\s*\d{1,4}|(?:^|\D)606(?:\D|$)|наименован.*помещ|план.*(?:мебел|квартир)", line, re.I):
            targets.extend(lines[max(0, j - 2):min(len(lines), j + 8)])
    seen = set()
    for line in targets:
        if line not in seen:
            print("  TXT", line[:240])
            seen.add(line)
    if not txt.strip():
        print("  NO_EXTRACTABLE_TEXT")
