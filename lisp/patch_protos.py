"""Правки оформления прототипов по образцу ГИП (бета 2). Меняет gip_protos.lsp на месте; повторный запуск ничего не делает.

Что меняется (по исправленному образцу GIP_EOM_Shablon001.dxf):
- надписи этажного щита (floor3/floor1): шрифт ls_200 (курсивный ISOCPEUR), ширина 1, без наклона;
  «ЩР этажный» высотой 86.7; надпись QS сдвинута к рубильнику;
- надписи контактора (km3/km1: KM, ESB, тип): слой «Шапка щита», ls_100, высота 100, без наклона; KM чуть сдвинута;
- КУП: надпись Is_150 высотой 75, рамка шире;
- фазы над группами (m_phase): ls_100, высота 100;
- розетка в обозначении группы (c_roz, c_roz44): поворот 180°;
- ^I в многострочном тексте (так DXF записывает табуляцию) — настоящая табуляция.
"""
import os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, 'emu'))
sys.path.insert(0, os.path.join(HERE, '..', 'emu'))
import lispemu
from lispemu import DPair

MARK = ';;; beta2-style'


def lnum(x):
    if abs(x) < 1e-9: x = 0.0
    s = ('%.9f' % x).rstrip('0')
    if s.endswith('.'): s += '0'
    return '0.0' if s == '-0.0' else s


def lstr(s):
    out = []
    for ch in s:
        o = ord(ch)
        if ch == '\\': out.append('\\\\')
        elif ch == '"': out.append('\\"')
        elif ch == '\t': out.append('\\t')
        elif o > 126 or o < 32: out.append('\\\\U+%04X' % o)
        else: out.append(ch)
    return '"' + ''.join(out) + '"'


def u(s):
    """русский текст -> как в файле прототипов (\\U+XXXX)"""
    return ''.join('\\U+%04X' % ord(c) if ord(c) > 126 else c for c in s)


def val(v):
    if isinstance(v, str): return lstr(v)
    if isinstance(v, bool): return 'T' if v else 'nil'
    if isinstance(v, int): return str(v)
    if isinstance(v, float): return lnum(v)
    raise ValueError(repr(v))


def e_line(pairs):
    parts = []
    for p in pairs:
        if isinstance(p, DPair): parts.append('(%d . %s)' % (p.car, val(p.cdr)))
        else: parts.append('(%d %s)' % (p[0], ' '.join(lnum(float(x)) for x in p[1:])))
    return '  ("E" . (' + ' '.join(parts) + '))'


def get(pairs, c):
    for p in pairs:
        if isinstance(p, DPair) and p.car == c: return p.cdr
    return None


def setp(pairs, c, v, after=None):
    for i, p in enumerate(pairs):
        if isinstance(p, DPair) and p.car == c:
            if v is None: return pairs[:i] + pairs[i + 1:]
            return pairs[:i] + [DPair(c, v)] + pairs[i + 1:]
    if v is None: return pairs
    # новый код — после указанного (или в конец)
    if after is not None:
        for i, p in enumerate(pairs):
            if isinstance(p, DPair) and p.car == after: return pairs[:i + 1] + [DPair(c, v)] + pairs[i + 1:]
    return pairs + [DPair(c, v)]


def move(pairs, dx, dy, codes=(10, 11)):
    return [([p[0], p[1] + dx, p[2] + dy] + list(p[3:])) if isinstance(p, list) and p[0] in codes else p for p in pairs]


def italic(pairs, style, h=None):
    """курсивный шрифт ГИП: ширина 1, без наклона"""
    pairs = setp(pairs, 7, style)
    pairs = setp(pairs, 41, None)
    pairs = setp(pairs, 51, None)
    if h is not None: pairs = setp(pairs, 40, h)
    return pairs


def text_of(pairs):
    t = get(pairs, 1)
    return re.sub(r'\\U\+([0-9A-F]{4})', lambda m: chr(int(m.group(1), 16)), t) if isinstance(t, str) else None


def patch_floor(name, pairs):
    if get(pairs, 0) != 'TEXT': return pairs
    t = text_of(pairs)
    if t == 'ВВГнгLS 5x6' or t == 'ВВГнгLS 3x16': return pairs     # марка кабеля — уже ls_200 без наклона
    pairs = italic(pairs, 'ls_200', 86.714788073 if t == 'ЩР этажный' else None)
    if t and t.startswith('QS '): pairs = move(pairs, 178.3, 68.4)
    return pairs


def patch_km(name, pairs):
    if get(pairs, 0) != 'TEXT': return pairs
    t = text_of(pairs)
    if t not in ('KM', 'ESB', '63-40N'): return pairs
    pairs = setp(pairs, 8, u('Шапка щита'))
    pairs = setp(italic(pairs, 'ls_100', 100.0), 41, 0.9, after=40)   # ширина 0.9 — как в образце
    if t == 'KM': pairs = move(pairs, 8.74, -13.38)
    return pairs


def patch_kup(name, pairs):
    typ = get(pairs, 0)
    if typ == 'TEXT' and text_of(pairs) == 'КУП':
        pairs = italic(pairs, 'Is_150', 75.0)
        return move(pairs, -34.2, 1.28)
    if typ == 'LWPOLYLINE':
        xs = [p[1] for p in pairs if isinstance(p, list) and p[0] == 10]
        c = (min(xs) + max(xs)) / 2.0; half = 116.95
        return [([10, (c - half if p[1] < c else c + half)] + list(p[2:])) if isinstance(p, list) and p[0] == 10 else p for p in pairs]
    return pairs


def patch_phase(name, pairs):
    if get(pairs, 0) != 'MTEXT': return pairs
    return setp(setp(pairs, 7, 'ls_100'), 40, 100.0)


E_PATCH = {'floor3': patch_floor, 'floor1': patch_floor, 'km3': patch_km, 'km1': patch_km, 'kup': patch_kup, 'm_phase': patch_phase}
ROT180 = {'c_roz', 'c_roz44'}


def main(path):
    lines = open(path, encoding='utf-8').read().split('\n')
    if any(l.startswith(MARK) for l in lines[:3]):
        print('уже исправлено:', path); return
    out = []; cur = None; n = 0
    for l in lines:
        m = re.match(r'^ \("([^"]+)"\s*$', l)
        if m: cur = m.group(1)
        if l.startswith('  ("E"'):
            item = lispemu.read_all(l)[0]
            pairs = list(item[1:])
            new = pairs
            # ^I в тексте (DXF-запись табуляции) -> табуляция
            new = [DPair(p.car, p.cdr.replace('^I', '\t')) if isinstance(p, DPair) and isinstance(p.cdr, str) and p.car in (1, 3) and '^I' in p.cdr else p for p in new]
            if cur in E_PATCH: new = E_PATCH[cur](cur, new)
            if new != pairs:
                l = e_line(new); n += 1
        elif l.startswith('  ("I"') and cur in ROT180:
            l2 = re.sub(r'^(  \("I" "[^"]*" \S+ \S+ \S+ \S+ )89\.498740917 ', r'\g<1>180.0 ', l)
            if l2 != l: l = l2; n += 1
        out.append(l)
    out.insert(1, MARK + ' (правки оформления по образцу ГИП, build/patch_protos.py)')
    open(path, 'w', encoding='utf-8').write('\n'.join(out))
    print('исправлено объектов:', n)


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'data', 'gip_protos.lsp'))
