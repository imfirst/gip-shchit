"""Порядок прорисовки в блоках монтажной схемы GIPM_* шаблона: надписи (TEXT/MTEXT/ATTDEF) — поверх заливок.
В блоках DEKraft надписи шли раньше заливок и закрывались ими. Меняет template/GIP_EOM_Shablon.dxf на месте;
повторный запуск ничего не меняет (надписи уже в конце)."""
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
TEXTS = {b'TEXT', b'MTEXT', b'ATTDEF'}


def main(path):
    raw = open(path, 'rb').read()
    nl = b'\r\n' if b'\r\n' in raw[:4000] else b'\n'
    L = raw.split(nl)
    out = []; i = 0; moved = 0; blocks = 0
    in_blocks = False
    while i < len(L) - 1:
        c, v = L[i].strip(), L[i + 1]
        if c == b'2' and out and out[-2].strip() == b'0' and out[-1] == b'SECTION':
            in_blocks = (v == b'BLOCKS')
        if in_blocks and c == b'0' and v == b'BLOCK':
            # заголовок блока до первой сущности
            j = i + 2; name = None
            while L[j].strip() != b'0':
                if L[j].strip() == b'2' and name is None: name = L[j + 1]
                j += 2
            head = L[i:j]
            # сущности до ENDBLK
            recs = []; k = j
            while not (L[k].strip() == b'0' and L[k + 1] == b'ENDBLK'):
                m = k + 2
                while L[m].strip() != b'0': m += 2
                recs.append(L[k:m]); k = m
            out += head
            if name and name.startswith(b'GIPM_'):
                txt = [r for r in recs if r[1] in TEXTS]; oth = [r for r in recs if r[1] not in TEXTS]
                new = oth + txt
                if new != recs: moved += 1
                recs = new; blocks += 1
            for r in recs: out += r
            i = k; continue
        out += [L[i], L[i + 1]]; i += 2
    out += L[i:]
    open(path, 'wb').write(nl.join(out))
    print('блоков GIPM_*:', blocks, 'переупорядочено:', moved)


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '..', 'template', 'GIP_EOM_Shablon.dxf'))
