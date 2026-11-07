# -*- coding: utf-8 -*-
"""Альбом «О» (отопление) в шаблон ГИП: перенос блоков отопления из готового проекта и листов альбома.

  python tools/heat_template.py ПРОЕКТ.dxf ШАБЛОН.dxf ВЫХОД.dxf

Что делается (на уровне DXF, без AutoCAD):
  1. Из проекта-источника копируются блоки отопления «О_*_GIP» (вместе с динамическими данными, вложенными
     блоками, слоями, стилями текста и мультивыносок) — если в шаблоне их ещё нет.
  2. Из библиотеки узлов источника (раздел «Трубчатые/Биметаллические/Панельные радиаторы … Схема подключения
     радиаторов») собираются именованные блоки узлов «О_Узел_<тип>_<подключение>_<сторона>_GIP»;
     состав узла (таблица под картинкой) выгружается в JSON для базы панели GIPHEAT.
  3. В шаблоне рядом с альбомом ВиК создаётся альбом О: обложки, «Общие данные», «План квартиры с сетями Т1, Т2»,
     «Схема системы Т1, Т2», «Спецификация оборудования Т1, Т2» (2 листа). Рамки и штампы — копии рамок
     самого шаблона (те же блоки А3-GIP-ALBOM), содержимое «Общих данных» — из проекта-источника.
  4. Рамки альбома О помечаются xdata GIPHEAT, чтобы инструменты ЭОМ их не трогали.
Проверка результата: уникальность меток, разрешимость всех ссылок, владельцы, $HANDSEED.
"""
import sys, os, re, json, math, collections, copy

HREF = set(list(range(320, 370)) + list(range(390, 400)) + [480, 481])
TABLE_TYPES = ('VPORT', 'LTYPE', 'LAYER', 'STYLE', 'VIEW', 'UCS', 'APPID', 'DIMSTYLE', 'BLOCK_RECORD')
NAMED_OBJ = ('MLEADERSTYLE', 'TABLESTYLE', 'MLINESTYLE', 'SCALE', 'MATERIAL', 'VISUALSTYLE', 'GROUP', 'DICTIONARYVAR')


# ---------------------------------------------------------------- чтение/запись
def load_pairs(path):
    raw = open(path, 'rb').read().decode('utf-8')
    lines = raw.split('\r\n') if '\r\n' in raw[:2000] else raw.split('\n')
    out = []
    for i in range(0, len(lines) - 1, 2):
        out.append([int(lines[i].strip()), lines[i + 1]])
    return out


def split_records(pairs):
    out = []; cur = None
    for p in pairs:
        if p[0] == 0:
            cur = [p]; out.append(cur)
        else:
            cur.append(p)
    return out


def gv(rec, code, d=None):
    for c, v in rec:
        if c == code:
            return v
    return d


def setv(rec, code, val):
    for p in rec:
        if p[0] == code:
            p[1] = val
            return True
    return False


def fnum(x):
    s = repr(float(x))
    return s


class Doc(object):
    def __init__(self, path):
        pairs = load_pairs(path)
        self.secs = collections.OrderedDict()
        i = 0
        while i < len(pairs):
            c, v = pairs[i]
            if c == 0 and v == 'SECTION':
                name = pairs[i + 1][1]; j = i + 2; body = []
                while not (pairs[j][0] == 0 and pairs[j][1] == 'ENDSEC'):
                    body.append(pairs[j]); j += 1
                self.secs[name] = body; i = j
            i += 1
        self.hdr = self.secs['HEADER']
        self.classes = split_records(self.secs['CLASSES'])
        self.tables = split_records(self.secs['TABLES'])
        self.blocks = split_records(self.secs['BLOCKS'])
        self.ents = split_records(self.secs['ENTITIES'])
        self.objs = split_records(self.secs['OBJECTS'])
        self.reindex()

    def reindex(self):
        self.H = {}
        self.where = {}
        for sec, lst in (('TABLES', self.tables), ('BLOCKS', self.blocks), ('ENTITIES', self.ents), ('OBJECTS', self.objs), ('CLASSES', self.classes)):
            for r in lst:
                h = None
                for c, v in r[1:]:
                    if c in (5, 105):
                        h = v; break
                if h:
                    self.H[h] = r; self.where[h] = sec
        # таблицы символов: тип -> {имя: запись}, заголовки таблиц
        self.tab = collections.defaultdict(dict); self.tabhead = {}
        cur = None
        for r in self.tables:
            t = r[0][1]
            if t == 'TABLE':
                cur = gv(r, 2); self.tabhead[cur] = r
            elif t == 'ENDTAB':
                cur = None
            elif cur:
                self.tab[cur][gv(r, 2)] = r
        # блоки: имя -> (BLOCK, [сущности], ENDBLK)
        self.blk = collections.OrderedDict(); cur = None
        for r in self.blocks:
            t = r[0][1]
            if t == 'BLOCK':
                cur = [r, [], None]; self.blk[gv(r, 2)] = cur
            elif t == 'ENDBLK':
                cur[2] = r; cur = None
            elif cur is not None:
                cur[1].append(r)
        self.root = self.objs[0]

    def handseed(self):
        for i, p in enumerate(self.hdr):
            if p[0] == 9 and p[1] == '$HANDSEED':
                return int(self.hdr[i + 1][1], 16)

    def set_handseed(self, n):
        for i, p in enumerate(self.hdr):
            if p[0] == 9 and p[1] == '$HANDSEED':
                self.hdr[i + 1][1] = '%X' % n

    def new_handle(self):
        if not hasattr(self, '_next'):
            mx = max(int(h, 16) for h in self.H)
            self._next = max(mx + 1, self.handseed())
        h = '%X' % self._next
        self._next += 1
        self.H[h] = None
        return h

    def ms_handle(self):
        return gv(self.tab['BLOCK_RECORD']['*Model_Space'], 5)

    def root_entry(self, key):
        r = self.root
        for i in range(len(r) - 1):
            if r[i][0] == 3 and r[i][1] == key:
                return r[i + 1][1]
        return None

    def dict_entries(self, d):
        out = collections.OrderedDict()
        for i in range(len(d) - 1):
            if d[i][0] == 3 and d[i + 1][0] in (350, 360):
                out[d[i][1]] = d[i + 1][1]
        return out

    def write(self, path):
        out = []
        def emit(recs):
            for r in recs:
                for c, v in r:
                    out.append('%3d' % c if c < 1000 else str(c)); out.append(v)
        for name, body in self.secs.items():
            out.append('  0'); out.append('SECTION'); out.append('  2'); out.append(name)
            if name == 'HEADER':
                for c, v in self.hdr:
                    out.append('%3d' % c if c < 1000 else str(c)); out.append(v)
            elif name == 'CLASSES': emit(self.classes)
            elif name == 'TABLES': emit(self.tables)
            elif name == 'BLOCKS': emit(self.blocks)
            elif name == 'ENTITIES': emit(self.ents)
            elif name == 'OBJECTS': emit(self.objs)
            else:
                for c, v in body:
                    out.append('%3d' % c if c < 1000 else str(c)); out.append(v)
            out.append('  0'); out.append('ENDSEC')
        out.append('  0'); out.append('EOF')
        data = '\r\n'.join(out) + '\r\n'
        open(path, 'wb').write(data.encode('utf-8'))


# ---------------------------------------------------------------- копирование между чертежами
class Copier(object):
    def __init__(self, src, dst, log):
        self.src = src; self.dst = dst; self.map = {}; self.log = log
        self.anon = collections.Counter()
        for n in dst.blk:
            m = re.match(r'\*([A-Z])(\d+)$', n)
            if m: self.anon[m.group(1)] = max(self.anon[m.group(1)], int(m.group(2)))

    # ---- символьные таблицы по имени
    def table_name(self, typ, name):
        if name is None or name == '':
            return name
        if name in self.dst.tab[typ]:
            return name
        if self.src is self.dst:
            return name
        r = self.src.tab[typ].get(name)
        if r is None:
            self.log.append('нет %s %s в источнике' % (typ, name)); return name
        self.copy_table_entry(typ, r)
        return name

    def copy_table_entry(self, typ, r):
        h = gv(r, 5); nh = self.dst.new_handle(); self.map[h] = nh
        head = self.dst.tabhead[typ]
        nr = []
        for c, v in r:
            if c == 5: v = nh
            elif c == 330: v = gv(head, 5)
            elif c == 6 and typ == 'LAYER': v = self.table_name('LTYPE', v)
            elif c in (390, 347, 348) and typ == 'LAYER':
                l0 = self.dst.tab['LAYER']['0']; v = gv(l0, c, '0')
                if v == '0': continue
            elif c in HREF: v = self.ensure(v) or '0'
            nr.append([c, v])
        nr = strip_groups(nr, ('{ACAD_XDICTIONARY', '{ACAD_REACTORS'))
        # вставка перед ENDTAB своей таблицы
        idx = self.dst.tables.index(head)
        j = idx + 1
        while self.dst.tables[j][0][1] != 'ENDTAB': j += 1
        self.dst.tables.insert(j, nr)
        self.dst.tab[typ][gv(nr, 2)] = nr
        self.dst.H[nh] = nr
        cnt = gv(head, 70)
        if cnt is not None: setv(head, 70, '%6d' % (int(cnt) + 1))
        return nh

    # ---- ссылка по метке: таблицы/стили по имени, блоки — копирование
    def ensure(self, h):
        if h in (None, '', '0'):
            return '0'
        if h in self.map:
            return self.map[h]
        r = self.src.H.get(h)
        if r is None:
            return None
        t = r[0][1]
        if self.src is self.dst and t not in ('DICTIONARY', 'XRECORD') and self.src.where.get(h) != 'OBJECTS':
            return h
        if t in TABLE_TYPES and t != 'BLOCK_RECORD':
            nm = gv(r, 2)
            if nm in self.dst.tab[t]:
                nh = gv(self.dst.tab[t][nm], 5); self.map[h] = nh; return nh
            return self.copy_table_entry(t, r)
        if t == 'BLOCK_RECORD':
            nm = gv(r, 2)
            return self.ensure_block(nm)
        if t in NAMED_OBJ:
            return self.ensure_named_obj(h, r)
        return None

    def ensure_named_obj(self, h, r):
        own = owner_of(r)
        od = self.src.H.get(own)
        key = None
        for k, v in self.src.dict_entries(od).items():
            if v == h: key = k
        rootkey = None
        for k, v in self.src.dict_entries(self.src.root).items():
            if v == own: rootkey = k
        if rootkey is None or key is None:
            return None
        dd = self.dst.H.get(self.dst.root_entry(rootkey))
        if dd is None:
            return None
        ents = self.dst.dict_entries(dd)
        if key in ents:
            self.map[h] = ents[key]; return ents[key]
        if self.src is self.dst:
            return h
        nh = self.copy_objects([h], gv(dd, 5))[h]
        dd.extend([[3, key], [350, nh]])
        return nh

    # ---- объекты (словари расширения, граф динамического блока)
    def closure(self, roots, inside=None):
        """метки объектов раздела OBJECTS, достижимые от roots по ссылкам владения и ссылкам графа"""
        seen = []; st = list(roots); s = set()
        while st:
            h = st.pop()
            if h in s or h in ('0', None) or h in self.map: continue
            if self.src.where.get(h) != 'OBJECTS': continue
            r = self.src.H[h]
            if r[0][1] in NAMED_OBJ: continue
            s.add(h); seen.append(h)
            for c, v in r:
                if (c in HREF and c != 330) and v != '0':
                    st.append(v)
        return seen

    def copy_objects(self, roots, owner_new):
        hs = self.closure(roots)
        for h in hs:
            self.map[h] = self.dst.new_handle()
        res = {}
        for h in hs:
            r = self.src.H[h]
            own = owner_of(r)
            nr = self.translate(r, self.map[own] if own in self.map else owner_new)
            self.dst.objs.append(nr); self.dst.H[gv(nr, 5)] = nr
            res[h] = gv(nr, 5)
        for h in roots:
            res[h] = self.map[h]
        return res

    # ---- блоки
    def fresh_anon(self, nm):
        k = nm[1]
        self.anon[k] += 1
        n = '*%s%d' % (k, self.anon[k])
        while n in self.dst.blk:
            self.anon[k] += 1; n = '*%s%d' % (k, self.anon[k])
        return n

    def ensure_block(self, nm, newname=None):
        if nm is None:
            return '0'
        if newname is None and not nm.startswith('*') and nm in self.dst.blk:
            return gv(self.dst.tab['BLOCK_RECORD'][nm], 5)
        if self.src is self.dst and newname is None:
            return gv(self.dst.tab['BLOCK_RECORD'][nm], 5)
        key = ('blk', nm, newname)
        if key in self.map:
            return self.map[key]
        br = self.src.tab['BLOCK_RECORD'][nm]
        b, ents, eb = self.src.blk[nm]
        name2 = newname or (self.fresh_anon(nm) if nm.startswith('*') else nm)
        nbr = self.dst.new_handle()
        self.map[key] = nbr
        if newname is None: self.map[gv(br, 5)] = nbr
        self.copy_block_body(br, b, ents, eb, name2, nbr, None)
        return nbr

    def copy_block_body(self, br, b, ents, eb, name2, nbr, base):
        # метки всех записей блока (кроме пропускаемых типов — на них не должно остаться ссылок)
        for r in [b, eb] + ents:
            if r[0][1] in SKIP_TYPES: continue
            h = gv(r, 5)
            if h and h not in self.map: self.map[h] = self.dst.new_handle()
        # BLOCK_RECORD
        nb = []
        for c, v in br:
            if c == 5: v = nbr
            elif c == 330: v = gv(self.dst.tabhead['BLOCK_RECORD'], 5)
            elif c == 2: v = name2
            elif c == 340: v = '0'
            elif c == 331: continue
            elif c in HREF: v = self.ensure(v) or '0'
            elif c == 1005: v = self.ensure(v) or '0'
            nb.append([c, v])
        xd = xdict_of(br)
        nb = strip_groups(nb, ('{ACAD_REACTORS', '{BLKREFS'))
        if xd:
            m = self.copy_objects([xd], nbr)
            replace_xdict(nb, m[xd])
        head = self.dst.tabhead['BLOCK_RECORD']
        idx = self.dst.tables.index(head)
        j = idx + 1
        while self.dst.tables[j][0][1] != 'ENDTAB': j += 1
        self.dst.tables.insert(j, nb); self.dst.tab['BLOCK_RECORD'][name2] = nb; self.dst.H[nbr] = nb
        cnt = gv(head, 70)
        if cnt is not None: setv(head, 70, '%6d' % (int(cnt) + 1))
        # BLOCK
        nb2 = self.translate(b, nbr)
        setv(nb2, 2, name2); setv(nb2, 3, name2)
        if base is not None:
            setv(nb2, 10, fnum(base[0])); setv(nb2, 20, fnum(base[1]))
            if not name2.startswith('*'): setv(nb2, 70, '     0')
        out = [nb2]
        own_of = {}
        for r in ents:
            t = r[0][1]
            if t in ('ATTRIB', 'SEQEND', 'VERTEX'):
                pass
        cur_ins = None
        for r in ents:
            t = r[0][1]
            if t in ('ATTRIB', 'VERTEX') and cur_ins:
                out.append(self.translate_ent(r, self.map[gv(cur_ins, 5)]))
            elif t == 'SEQEND' and cur_ins:
                out.append(self.translate_ent(r, self.map[gv(cur_ins, 5)])); cur_ins = None
            else:
                nr = self.translate_ent(r, nbr)
                if nr is None: continue
                out.append(nr)
                if t in ('INSERT', 'POLYLINE') and gv(r, 66) and int(gv(r, 66)) == 1: cur_ins = r
        out.append(self.translate(eb, nbr))
        self.dst.blocks.extend(out)
        for r in out:
            h = gv(r, 5)
            if h: self.dst.H[h] = r
        self.dst.blk[name2] = [out[0], out[1:-1], out[-1]]

    # ---- перевод записи
    def translate(self, r, owner):
        nr = []; first330 = True; grp = None
        for c, v in r:
            if c == 102:
                grp = v if v.startswith('{') else None
                nr.append([c, v]); continue
            if c in (5, 105):
                v = self.map.get(v) or self.dst.new_handle()
            elif c == 330 and grp is None and first330:
                first330 = False; v = owner
            elif c == 8:
                v = self.table_name('LAYER', v)
            elif c in HREF or c == 1005:
                nv = self.map.get(v)
                if nv is None:
                    nv = self.ensure(v)
                if nv is None:
                    nv = '0'
                v = nv
            nr.append([c, v])
        nr = strip_groups(nr, ('{ACAD_REACTORS',))
        xd = xdict_of(r)
        if xd and xd not in self.map:
            m = self.copy_objects([xd], gv(nr, 5))
            replace_xdict(nr, m[xd])
        elif xd:
            replace_xdict(nr, self.map[xd])
        return nr

    def translate_ent(self, r, owner):
        t = r[0][1]
        if t in SKIP_TYPES or t.startswith('TVS_'):
            return None
        nr = self.translate(r, owner)
        if t in ('TEXT', 'MTEXT', 'ATTRIB', 'ATTDEF'):
            st = gv(nr, 7)
            if st: self.table_name('STYLE', st)
        lt = gv(nr, 6)
        if lt and t not in ('MTEXT',): self.table_name('LTYPE', lt)
        if t == 'INSERT':
            nm = gv(nr, 2)
            if self.src is not self.dst or nm.startswith('*') and False:
                brh = self.ensure_block(nm)
                setv(nr, 2, gv(self.dst.H[brh], 2))
        if t == 'HATCH':
            nr = fix_hatch(nr)
        return nr


SKIP_TYPES = ('DIMENSION', 'ACAD_TABLE', 'OLE2FRAME', 'IMAGE', 'WIPEOUT', 'REGION', '3DSOLID', 'SURFACE', 'ACAD_PROXY_ENTITY', 'TVS_PIPE', 'TVS_TAP', 'TVS_WYE')


def owner_of(r):
    grp = None
    for c, v in r:
        if c == 102: grp = v if v.startswith('{') else None; continue
        if c == 330 and grp is None: return v
    return None


def xdict_of(r):
    grp = None
    for c, v in r:
        if c == 102: grp = v; continue
        if c == 360 and grp == '{ACAD_XDICTIONARY': return v
    return None


def replace_xdict(r, nh):
    grp = None
    for p in r:
        if p[0] == 102: grp = p[1]; continue
        if p[0] == 360 and grp == '{ACAD_XDICTIONARY': p[1] = nh; return


def strip_groups(r, names):
    out = []; skip = False
    for c, v in r:
        if c == 102 and v in names:
            skip = True; continue
        if skip:
            if c == 102 and v == '}': skip = False
            continue
        out.append([c, v])
    return out


def fix_hatch(r):
    """ассоциативность штриховки не переносится: ссылки на контуры убираются"""
    out = []; i = 0
    while i < len(r):
        c, v = r[i]
        if c == 71: v = '     0'
        if c == 97:
            n = int(v); out.append([97, '        0']); i += 1
            k = 0
            while k < n and i < len(r) and r[i][0] == 330: i += 1; k += 1
            continue
        out.append([c, v]); i += 1
    return out


# ---------------------------------------------------------------- геометрия: сдвиг простых объектов
MOVE_PT = {
    'LINE': (10, 11), 'LWPOLYLINE': (10,), 'TEXT': (10, 11), 'MTEXT': (10,), 'INSERT': (10,), 'ATTRIB': (10, 11),
    'CIRCLE': (10,), 'ARC': (10,), 'SOLID': (10, 11, 12, 13), 'POINT': (10,), 'SEQEND': (), 'ELLIPSE': (10,),
    'SPLINE': (10, 11),
}


def move_rec(r, dx, dy):
    t = r[0][1]
    codes = MOVE_PT.get(t)
    if codes is None:
        return False
    for p in r:
        if p[0] in codes: p[1] = fnum(float(p[1]) + dx)
        elif p[0] - 10 in codes and 20 <= p[0] <= 23: p[1] = fnum(float(p[1]) + dy)
    return True


def ref_pt(r):
    x = gv(r, 10); y = gv(r, 20)
    if x is None or y is None: return None
    return float(x), float(y)


# ---------------------------------------------------------------- построение альбома
class Builder(object):
    def __init__(self, src, dst):
        self.src = src; self.dst = dst; self.log = []
        self.cp = Copier(src, dst, self.log)
        self.self_cp = Copier(dst, dst, self.log)
        self.ms = dst.ms_handle()

    # ---- новые простые объекты
    def add_ent(self, rec):
        h = self.dst.new_handle()
        r = [[0, rec[0]], [5, h], [330, self.ms], [100, 'AcDbEntity']] + rec[1]
        self.dst.ents.append(r); self.dst.H[h] = r
        return r

    def layer(self, name, color=7):
        if name not in self.dst.tab['LAYER']:
            l0 = self.dst.tab['LAYER']['0']
            rec = [[0, 'LAYER'], [5, 'X'], [330, gv(self.dst.tabhead['LAYER'], 5)], [100, 'AcDbSymbolTableRecord'], [100, 'AcDbLayerTableRecord'],
                   [2, name], [70, '     0'], [62, '%6d' % color], [6, 'Continuous'], [370, '    -3'], [390, gv(l0, 390, '0')]]
            if gv(l0, 347): rec.append([347, gv(l0, 347)])
            self.cp.copy_table_entry('LAYER', rec)
        return name

    def mtext(self, x, y, txt, h=150.0, w=3000.0, att=1, lay='TEXT', style='ls_200', color=None):
        d = [[8, lay]] + ([[62, '%6d' % color]] if color is not None else []) + [[100, 'AcDbMText'], [10, fnum(x)], [20, fnum(y)], [30, '0.0'],
             [40, fnum(h)], [41, fnum(w)], [46, '0.0'], [71, '%6d' % att], [72, '     5']]
        # длинный текст режется на куски по 250 символов (код 3), остаток — код 1
        while len(txt) > 250:
            d.append([3, txt[:250]]); txt = txt[250:]
        d += [[1, txt], [7, style], [73, '     1'], [44, '1.0']]
        return self.add_ent(('MTEXT', d))

    def line(self, x1, y1, x2, y2, lay='0', color=None, w=0.0):
        d = [[8, lay]] + ([[62, '%6d' % color]] if color is not None else []) + [[100, 'AcDbPolyline'], [90, '        2'], [70, '     0'], [43, fnum(w)],
             [10, fnum(x1)], [20, fnum(y1)], [10, fnum(x2)], [20, fnum(y2)]]
        return self.add_ent(('LWPOLYLINE', d))

    def poly(self, pts, lay='0', color=None, w=0.0, closed=False):
        d = [[8, lay]] + ([[62, '%6d' % color]] if color is not None else []) + [[100, 'AcDbPolyline'], [90, '%9d' % len(pts)], [70, '     1' if closed else '     0'], [43, fnum(w)]]
        for x, y in pts: d += [[10, fnum(x)], [20, fnum(y)]]
        return self.add_ent(('LWPOLYLINE', d))

    def text(self, x, y, txt, h=165.0, lay='0', color=None, style='ls_200', just=1):
        d = [[8, lay]] + ([[62, '%6d' % color]] if color is not None else []) + [[100, 'AcDbText'], [10, fnum(x)], [20, fnum(y)], [30, '0.0'], [40, fnum(h)], [1, txt], [7, style],
             [72, '%6d' % just], [11, fnum(x)], [21, fnum(y)], [31, '0.0'], [100, 'AcDbText']]
        return self.add_ent(('TEXT', d))

    # ---- копия объектов модели внутри шаблона со сдвигом
    def dup(self, recs, dx, dy, tag=None):
        out = []
        groups = []; cur = None
        for r in recs:
            t = r[0][1]
            if t in ('ATTRIB', 'VERTEX') and cur is not None: cur.append(r); continue
            if t == 'SEQEND' and cur is not None: cur.append(r); cur = None; continue
            g = [r]; groups.append(g)
            if t in ('INSERT', 'POLYLINE') and gv(r, 66) and int(gv(r, 66)) == 1: cur = g
        for g in groups:
            if g[0][0][1] not in MOVE_PT:
                self.log.append('пропущен %s' % g[0][0][1]); continue
            head = self.self_cp.translate(g[0], self.ms)
            nh = gv(head, 5)
            move_rec(head, dx, dy)
            if tag and head[0][1] == 'INSERT':
                head.extend([[1001, 'GIPHEAT'], [1000, tag]])
                if 'GIPHEAT' not in self.dst.tab['APPID']:
                    self.cp.copy_table_entry('APPID', [[0, 'APPID'], [5, 'X'], [330, '0'], [100, 'AcDbSymbolTableRecord'], [100, 'AcDbRegAppTableRecord'], [2, 'GIPHEAT'], [70, '     0']])
            self.dst.ents.append(head); self.dst.H[nh] = head; out.append(head)
            for sub in g[1:]:
                s2 = self.self_cp.translate(sub, nh)
                move_rec(s2, dx, dy)
                self.dst.ents.append(s2); self.dst.H[gv(s2, 5)] = s2
        return out

    def copy_from_src(self, recs, dx, dy):
        """объекты модели проекта-источника -> шаблон (простые типы), со сдвигом"""
        out = []
        for r in recs:
            t = r[0][1]
            if t not in ('LWPOLYLINE', 'LINE', 'MTEXT', 'TEXT', 'CIRCLE', 'ARC'):
                continue
            nr = self.cp.translate_ent(r, self.ms)
            if nr is None: continue
            move_rec(nr, dx, dy)
            self.dst.ents.append(nr); self.dst.H[gv(nr, 5)] = nr; out.append(nr)
        return out


def in_box(p, b):
    return p is not None and b[0] <= p[0] <= b[2] and b[1] <= p[1] <= b[3]


SW, SH = 20960.5, 14850.0


def mt_plain(r):
    s = ''.join(v for c, v in r if c == 3) + (gv(r, 1) or '')
    s = re.sub(r'\\[pP][^;]*;', ' ', s) if False else s
    s = re.sub(r'\\P', ' ', s)
    s = re.sub(r'\\[ACFHQTWpfLlOoKk][^;\\]*;?', '', s)
    s = s.replace('{', '').replace('}', '')
    return s.strip()


def build(src_path, dst_path, out_path, nodes_json):
    print('чтение', src_path); src = Doc(src_path)
    print('чтение', dst_path); dst = Doc(dst_path)
    B = Builder(src, dst)
    seed0 = dst.handseed()

    # 1. классы для объектов динамических блоков и мультивыносок
    have = set(gv(r, 1) for r in dst.classes)
    for r in src.classes:
        if gv(r, 1) not in have:
            dst.classes.append([list(p) for p in r]); have.add(gv(r, 1))

    # 2. блоки отопления
    names = [n for n in src.blk if n.startswith('О_') and n.endswith('_GIP')]
    for n in names:
        B.cp.ensure_block(n)
    print('блоков О_*: %d' % len(names))

    # 3. узлы подключения радиаторов
    nodes = make_nodes(B, src)
    json.dump(nodes, open(nodes_json, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('узлов: %d' % len(nodes))

    # 4. альбом О
    make_album(B, src, dst)

    # $HANDSEED
    mx = max(int(h, 16) for h in dst.H if h and dst.H[h] is not None)
    dst.set_handseed(max(mx + 1, dst._next))
    dst.write(out_path)
    print('записано', out_path, 'новых меток: %d' % (dst._next - seed0))
    for l in sorted(set(B.log))[:40]: print('  ', l)
    return B


# ---------------------------------------------------------------- узлы
KINDS = [('Трубчатые радиаторы', 'TUB'), ('Биметаллические радиаторы', 'BIM'), ('Панельные радиаторы', 'PAN'), ('Трубчатые радиаторы (прямоугольные трубки)', 'RECT')]
CONNS = [('Нижнее подключение из стены', 'НС'), ('Боковое подключение из стены', 'БС'), ('Нижнее подключение из пола', 'НП'), ('Боковое подключение вдоль стены', 'БВ')]
SIDES = {'Левое': 'Л', 'Правое': 'П', 'Диагональное слева': 'ДЛ', 'Диагональное справа': 'ДП'}


def make_nodes(B, src):
    texts = []
    for r in src.ents:
        if r[0][1] == 'MTEXT':
            p = ref_pt(r)
            if p and p[0] > 1000000: texts.append((p, mt_plain(r), float(gv(r, 40, 0)), r))
    heads = sorted([t for t in texts if abs(t[2] - 7000) < 1], key=lambda t: -t[0][1])
    secs = sorted([t for t in texts if abs(t[2] - 2000) < 1], key=lambda t: -t[0][1])
    labels = [t for t in texts if abs(t[2] - 1000) < 1 or abs(t[2] - 800) < 1]
    tables = [r for r in src.ents if r[0][1] == 'ACAD_TABLE' and ref_pt(r) and ref_pt(r)[0] > 1000000]
    ms_ents = [r for r in src.ents if ref_pt(r) and ref_pt(r)[0] > 1000000]
    nodes = []
    for s in secs:
        kind = None
        for h in heads:
            if h[0][1] > s[0][1]:
                if kind is None or h[0][1] < kind[0][1]: kind = h
        kcode = dict(KINDS).get(kind[1].replace('  ', ' '), 'X')
        ccode = dict(CONNS).get(s[1], 'X')
        sy = s[0][1]
        for lb in labels:
            if not (sy - 4500 < lb[0][1] < sy - 3000): continue
            side = SIDES.get(lb[1].replace('\\P', ' ').strip(), None)
            if side is None:
                side = SIDES.get(re.sub(r'\s+', ' ', lb[1]).strip())
            if side is None: continue
            cx = lb[0][0]
            # таблица состава под картинкой
            tb = [t for t in tables if abs(ref_pt(t)[0] - (cx - 2725)) < 600 and sy - 12000 < ref_pt(t)[1] < sy - 6000]
            ty = ref_pt(tb[0])[1] if tb else sy - 9680
            box = (cx - 5600, ty + 30, cx + 5600, lb[0][1] - 350)
            sel = []
            for r in ms_ents:
                p = ref_pt(r)
                t = r[0][1]
                if t in ('ACAD_TABLE', 'DIMENSION'): continue
                if t == 'MULTILEADER':
                    p = mleader_pt(r)
                if in_box(p, box):
                    if t == 'MTEXT' and float(gv(r, 40, 0)) >= 300: continue
                    sel.append(r)
            # точка вставки: середина низа радиатора (*U-вставка радиатора) — иначе центр рамки
            items = table_items(src, tb[0]) if tb else []
            name = 'О_Узел_%s_%s_%s_GIP' % (kcode, ccode, side)
            base = node_base(src, sel, cx, box)
            make_named_block(B, src, name, sel, base)
            nodes.append({'block': name, 'kind': kcode, 'conn': ccode, 'side': side, 'items': items,
                          'w': round(box[2] - box[0]), 'h': round(box[3] - box[1]), 'base': [round(base[0] - box[0]), round(base[1] - box[1])]})
    return nodes


def mleader_pt(r):
    for i, (c, v) in enumerate(r):
        if c == 10:
            return float(v), float(r[i + 1][1])
    return None


def node_base(src, sel, cx, box):
    # левый нижний угол области узла — проще всего для раскладки на листе
    return (box[0], box[1])


def table_items(src, tb):
    nm = gv(tb, 2)
    cells = []
    for e in src.blk[nm][1]:
        if e[0][1] == 'MTEXT':
            cells.append((-round(float(gv(e, 20))), round(float(gv(e, 10))), mt_plain(e)))
    rows = collections.OrderedDict()
    for y, x, t in sorted(cells):
        rows.setdefault(y, []).append(t)
    out = []
    for y, r in rows.items():
        if len(r) >= 3 and r[0].strip().isdigit():
            out.append({'no': int(r[0]), 'name': r[1].strip(), 'code': r[2].strip()})
    return out


def make_named_block(B, src, name, sel, base):
    dst = B.dst; cp = B.cp
    if name in dst.blk:
        return
    nbr = dst.new_handle()
    fake_br = [[0, 'BLOCK_RECORD'], [5, 'NEWBR'], [330, '0'], [100, 'AcDbSymbolTableRecord'], [100, 'AcDbBlockTableRecord'], [2, name], [340, '0'], [70, '     0'], [280, '     1'], [281, '     0']]
    b = [[0, 'BLOCK'], [5, 'NEWB'], [330, '0'], [100, 'AcDbEntity'], [8, '0'], [100, 'AcDbBlockBegin'], [2, name], [70, '     0'], [10, '0.0'], [20, '0.0'], [30, '0.0'], [3, name], [1, '']]
    eb = [[0, 'ENDBLK'], [5, 'NEWE'], [330, '0'], [100, 'AcDbEntity'], [8, '0'], [100, 'AcDbBlockEnd']]
    cp.map['NEWB'] = dst.new_handle(); cp.map['NEWE'] = dst.new_handle()
    # вставки с атрибутами: подтянуть ATTRIB/SEQEND
    full = []
    idx = {id(r): i for i, r in enumerate(src.ents)}
    for r in sel:
        full.append(r)
        if r[0][1] == 'INSERT' and gv(r, 66) and int(gv(r, 66)) == 1:
            i = idx[id(r)] + 1
            while src.ents[i][0][1] in ('ATTRIB',):
                full.append(src.ents[i]); i += 1
            full.append(src.ents[i])
    cp.copy_block_body(fake_br, b, full, eb, name, nbr, base)
    del cp.map['NEWB']; del cp.map['NEWE']


# ---------------------------------------------------------------- альбом О
def make_album(B, src, dst):
    # рамки шаблона
    frames = find_frames(dst)
    def frame_at(x, y):
        for f in frames:
            if abs(f[0] - x) < 5 and abs(f[1] - y) < 5: return f
        return None
    titles = {}
    for r in dst.ents:
        if r[0][1] == 'MTEXT':
            p = ref_pt(r)
            for f in frames:
                if abs(p[0] - f[0] + 6250) < 5 and abs(p[1] - f[1] - 625) < 5:
                    titles[(round(f[0]), round(f[1]))] = mt_plain(r)
    vik = sorted([f for f in frames if abs(f[0] - 59870.1) < 5], key=lambda f: -f[1])
    by = {titles.get((round(f[0]), round(f[1])), ''): f for f in vik}
    def pick(prefix):
        for k, f in by.items():
            if k.lower().startswith(prefix.lower()): return f
        raise SystemExit('нет листа ВиК «%s»' % prefix)
    srcs = [('od', pick('Общие данные (начало)')), ('plan', pick('План квартиры с сетями Х1')), ('scheme', pick('Схема сетей')),
            ('spec1', [f for f in vik if 'Спецификац' in titles.get((round(f[0]), round(f[1])), '')][0]),
            ('spec2', [f for f in vik if 'Спецификац' in titles.get((round(f[0]), round(f[1])), '')][1])]
    X0 = 59870.11657005741
    OX = X0 + 75000.0
    ys = [156593.7020255515 - k * SH for k in range(5)]
    ttl = {'od': 'Общие данные', 'plan': 'План квартиры с сетями Т1, Т2', 'scheme': 'Схема системы Т1, Т2',
           'spec1': 'Спецификация оборудования\\PТ1, Т2', 'spec2': 'Спецификация оборудования\\PТ1, Т2'}
    head = {'od': 'Общие данные', 'plan': 'План квартиры с сетями Т1, Т2', 'scheme': 'Схема системы Т1, Т2',
            'spec1': 'Спецификация оборудования Т1, Т2', 'spec2': 'Спецификация оборудования Т1, Т2'}
    nos = {'od': ('1', '3'), 'plan': ('2', None), 'scheme': ('3', None), 'spec1': ('1', '2'), 'spec2': ('2', None)}
    ents = list(dst.ents)
    newF = {}
    for k, (role, f) in enumerate(srcs):
        F = (f[0], f[1]); NF = (OX, ys[k]); dx = NF[0] - F[0]; dy = NF[1] - F[1]
        box = (F[0] - SW - 10, F[1] - 10, F[0] + 10, F[1] + SH + 10)
        sel = []
        for r in ents:
            t = r[0][1]
            if t in ('ATTRIB', 'SEQEND', 'VERTEX'): continue
            p = ref_pt(r)
            if not in_box(p, box): continue
            if gv(r, 5) == f[2]:
                sel.append(r); continue
            rx, ry = p[0] - F[0], p[1] - F[1]
            stamp = rx > -11000 and ry < 3150
            margin = rx < -19900
            hdr = role.startswith('spec') and ((ry > 13700 and t == 'MTEXT') or t in ('LINE', 'LWPOLYLINE') or (t == 'MTEXT' and ry < 1000) or (t == 'INSERT' and gv(r, 8) == 'FORMAT'))
            ramka = gv(r, 8) == 'Ramka' and ry > 13500 and t in ('TEXT', 'MTEXT')
            if stamp or margin or hdr or ramka:
                if t == 'INSERT' and gv(r, 2) and gv(r, 2).startswith('*U') and gv(r, 5) != f[2] and is_frame(dst, r):
                    continue
                sel.append(r)
        # вставки с атрибутами
        full = []
        idx = {id(r): i for i, r in enumerate(dst.ents)}
        for r in sel:
            full.append(r)
            if r[0][1] == 'INSERT' and gv(r, 66) and int(gv(r, 66)) == 1:
                i = idx[id(r)] + 1
                while dst.ents[i][0][1] == 'ATTRIB': full.append(dst.ents[i]); i += 1
                full.append(dst.ents[i])
        made = B.dup(full, dx, dy, tag=None)
        for r in made:
            if r[0][1] == 'INSERT' and abs(float(gv(r, 10)) - NF[0]) < 1 and abs(float(gv(r, 20)) - NF[1]) < 1 and is_frame(dst, r):
                r.extend([[1001, 'GIPHEAT'], [1000, 'O:' + role]]) if gv(r, 1001) is None else None
                ensure_appid(B, 'GIPHEAT')
            p = ref_pt(r); rx, ry = p[0] - NF[0], p[1] - NF[1]
            if r[0][1] == 'MTEXT' and abs(rx + 6250) < 5 and abs(ry - 625) < 5:
                set_mtext(r, '\\pxqc;' + ttl[role])
            elif r[0][1] == 'MTEXT' and abs(ry - 1250) < 5 and abs(rx + 2000) < 500 and rx > -2400:
                set_mtext(r, '\\pxqc;' + nos[role][0])
            elif r[0][1] == 'MTEXT' and abs(ry - 1250) < 5 and rx > -1300:
                set_mtext(r, '\\pxqc;' + (nos[role][1] or ''))
            elif gv(r, 8) == 'Ramka' and ry > 13500 and r[0][1] == 'TEXT':
                setv(r, 1, head[role])
            elif gv(r, 8) == 'Ramka' and ry > 13500 and r[0][1] == 'MTEXT':
                set_mtext(r, head[role])
        newF[role] = NF
    # обложки
    cov = []
    for r in ents:
        t = r[0][1]
        if t in ('ATTRIB', 'SEQEND', 'VERTEX', 'ACAD_TABLE', 'IMAGE'): continue
        p = ref_pt(r)
        if in_box(p, (25000, 168000, 62000, 200000)): cov.append(r)
    full = []
    idx = {id(r): i for i, r in enumerate(dst.ents)}
    for r in cov:
        full.append(r)
        if r[0][1] == 'INSERT' and gv(r, 66) and int(gv(r, 66)) == 1:
            i = idx[id(r)] + 1
            while dst.ents[i][0][1] == 'ATTRIB': full.append(dst.ents[i]); i += 1
            full.append(dst.ents[i])
    for r in B.dup(full, 75000.0, 0.0):
        if r[0][1] in ('MTEXT', 'TEXT'):
            s = (gv(r, 1) or '')
            if 'Вентиляция и кондиционирование' in ''.join(v for c, v in r if c in (1, 3)):
                for p in r:
                    if p[0] in (1, 3): p[1] = p[1].replace('Вентиляция и кондиционирование', 'Отопление')
            if mt_plain(r) == 'ВиК' or s.strip() == 'ВиК':
                for p in r:
                    if p[0] == 1: p[1] = p[1].replace('ВиК', 'О')
    # содержимое «Общих данных» из проекта-источника
    sF = find_title_frame(src, 'Общие данные', near_x=93721.0)
    NF = newF['od']
    sb = (sF[0] - SW + 300, sF[1] + 3150, sF[0] - 300, sF[1] + SH - 300)
    srcsel = []
    for r in src.ents:
        p = ref_pt(r)
        if in_box(p, sb) and r[0][1] in ('LWPOLYLINE', 'MTEXT', 'TEXT') and gv(r, 8) != 'FORMAT':
            if r[0][1] == 'TEXT' and (gv(r, 1) or '').startswith('Ведомость'): continue
            srcsel.append(r)
    # подпись-росчерк и примечание у штампа — тоже
    sb2 = (sF[0] - SW + 300, sF[1] + 200, sF[0] - 10000, sF[1] + 3150)
    for r in src.ents:
        p = ref_pt(r)
        if in_box(p, sb2) and r[0][1] in ('LWPOLYLINE', 'MTEXT'): srcsel.append(r)
    B.copy_from_src(srcsel, NF[0] - sF[0], NF[1] - sF[1])
    # таблицы-ведомости вместо ACAD_TABLE источника: сетка и тексты
    vedomost(B, NF)
    print('альбом О: листы', {k: (round(v[0]), round(v[1])) for k, v in newF.items()})


def ensure_appid(B, name):
    if name not in B.dst.tab['APPID']:
        B.cp.copy_table_entry('APPID', [[0, 'APPID'], [5, 'X'], [330, '0'], [100, 'AcDbSymbolTableRecord'], [100, 'AcDbRegAppTableRecord'], [2, name], [70, '     0']])


def set_mtext(r, txt):
    out = []; done = False
    for p in r:
        if p[0] == 3: continue
        if p[0] == 1 and not done: p = [1, txt]; done = True
        out.append(p)
    r[:] = out


def vedomost(B, F):
    x0 = F[0] - 19354.9; y0 = F[1] + 13600.2
    cols = [x0, x0 + 1500, x0 + 7750, x0 + 9250]
    rows = [('Лист', 'Наименование', 'Примечание'), ('1', 'Общие данные', ''), ('2', 'План квартиры с сетями Т1, Т2', ''), ('3', 'Схема системы Т1, Т2', '')]
    B.layer('TEXT', 250)
    ys = [y0, y0 - 800] + [y0 - 800 - 400 * k for k in range(1, len(rows))]
    for y in ys: B.line(cols[0], y, cols[-1], y)
    for x in cols: B.line(x, ys[0], x, ys[-1])
    for i, rw in enumerate(rows):
        yt = (ys[i] + ys[i + 1]) / 2.0 + 75.0
        for j, txt in enumerate(rw):
            if not txt: continue
            if i == 0 or j == 0:
                B.mtext((cols[j] + cols[j + 1]) / 2.0 - (cols[j + 1] - cols[j]) / 2.0, yt, '\\pxqc;' + txt, w=cols[j + 1] - cols[j], att=4)
            else:
                B.mtext(cols[j] + 100, yt, '\\pxi1,ql;' + txt, w=cols[j + 1] - cols[j] - 200, att=4)
    # ссылочные и прилагаемые документы
    y1 = F[1] + 8600.2
    rows2 = [('Обозначение', 'Наименование', 'Примечание'), ('', '{\\LСсылочные документы:}', ''), ('СП 131.13330.2018', 'Строительная климатология', ''),
             ('СП 60.13330.2020', 'Отопление, вентиляция и кондиционирование воздуха', ''), ('СП 73.13330.2016', 'Внутренние санитарно-технические системы зданий', ''),
             ('', '{\\LПрилагаемые документы:}', ''), ('', 'Спецификация оборудования Т1, Т2', '')]
    cols2 = [x0, x0 + 2500, x0 + 7750, x0 + 9250]
    ys2 = [y1, y1 - 800] + [y1 - 800 - 400 * k for k in range(1, len(rows2))]
    for y in ys2: B.line(cols2[0], y, cols2[-1], y)
    for x in cols2: B.line(x, ys2[0], x, ys2[-1])
    for i, rw in enumerate(rows2):
        yt = (ys2[i] + ys2[i + 1]) / 2.0 + 75.0
        for j, txt in enumerate(rw):
            if not txt: continue
            if i == 0:
                B.mtext(cols2[j], yt, '\\pxqc;' + txt, w=cols2[j + 1] - cols2[j], att=4)
            else:
                B.mtext(cols2[j] + 100, yt, '\\pxi1,ql;' + txt, w=cols2[j + 1] - cols2[j] - 200, att=4)


def find_frames(d):
    br_by_h = {gv(r, 5): n for n, r in d.tab['BLOCK_RECORD'].items()}
    eff = {}
    for n, r in d.tab['BLOCK_RECORD'].items():
        tag = None
        for i, (c, v) in enumerate(r):
            if c == 1001 and v == 'AcDbBlockRepBTag':
                for c2, v2 in r[i + 1:i + 4]:
                    if c2 == 1005: tag = v2
        eff[n] = br_by_h.get(tag, n) if tag else n
    d._eff = eff
    out = []
    for r in d.ents:
        if r[0][1] == 'INSERT':
            n = gv(r, 2)
            if eff.get(n, n) in ('А3-GIP-ALBOM', 'А3-GIP-BOOK'):
                out.append((float(gv(r, 10)), float(gv(r, 20)), gv(r, 5), eff.get(n, n)))
    return out


def is_frame(d, r):
    if not hasattr(d, '_eff'): find_frames(d)
    n = gv(r, 2)
    return d._eff.get(n, n) in ('А3-GIP-ALBOM', 'А3-GIP-BOOK')


def find_title_frame(d, title, near_x):
    fr = find_frames(d)
    best = None
    for r in d.ents:
        if r[0][1] == 'MTEXT':
            p = ref_pt(r)
            for f in fr:
                if abs(p[0] - f[0] + 6250) < 5 and abs(p[1] - f[1] - 625) < 5 and mt_plain(r) == title and abs(f[0] - near_x) < 50:
                    if best is None or f[1] > best[1]: best = f
    return best


# ---------------------------------------------------------------- проверка
def validate(path, base=None):
    d = Doc(path)
    hs = collections.Counter()
    for lst in (d.tables, d.blocks, d.ents, d.objs):
        for r in lst:
            for c, v in r[1:]:
                if c in (5, 105):
                    hs[v] += 1; break
    dup = [h for h, n in hs.items() if n > 1]
    bad = []
    for lst, nm in ((d.tables, 'T'), (d.blocks, 'B'), (d.ents, 'E'), (d.objs, 'O')):
        for r in lst:
            grp = None
            for c, v in r:
                if c == 102: grp = v; continue
                if (c in HREF or c == 1005) and v not in ('0', '') and v not in hs:
                    bad.append((nm, r[0][1], gv(r, 5), c, v, grp))
    mx = max(int(h, 16) for h in hs)
    ok = not dup and d.handseed() > mx
    print('проверка: меток %d, повторов %d, битых ссылок %d, HANDSEED %X > max %X: %s' % (len(hs), len(dup), len(bad), d.handseed(), mx, d.handseed() > mx))
    for b in bad[:15]: print('   битая ссылка', b)
    ms = d.ms_handle()
    wrong = [r for r in d.ents if gv(r, 330) not in (ms,) and r[0][1] not in ('ATTRIB', 'SEQEND', 'VERTEX') and gv(r, 330) != gv(d.tab['BLOCK_RECORD']['*Paper_Space'], 5)]
    print('   объектов модели с чужим владельцем: %d' % len(wrong))
    if base:
        # те же замечания, что уже были в исходном шаблоне, — не наши
        b0 = validate_sets(base)
        bad = [b for b in bad if (b[1], b[2], b[3], b[4]) not in b0[0]]
        wrong = [w for w in wrong if gv(w, 5) not in b0[1]]
        print('   новых замечаний относительно исходного шаблона: ссылок %d, владельцев %d' % (len(bad), len(wrong)))
    return ok and not bad and not wrong


def validate_sets(path):
    d = Doc(path)
    hs = set(d.H)
    bad = set()
    for lst in (d.tables, d.blocks, d.ents, d.objs):
        for r in lst:
            for c, v in r:
                if (c in HREF or c == 1005) and v not in ('0', '') and v not in hs:
                    bad.add((r[0][1], gv(r, 5), c, v))
    ms = d.ms_handle()
    wrong = set(gv(r, 5) for r in d.ents if gv(r, 330) != ms and r[0][1] not in ('ATTRIB', 'SEQEND', 'VERTEX'))
    return bad, wrong


if __name__ == '__main__':
    src, dst, out = sys.argv[1:4]
    nj = sys.argv[4] if len(sys.argv) > 4 else os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'web', 'src', 'heat', 'nodes.json')
    build(src, dst, out, nj)
    if not validate(out, dst):
        raise SystemExit('проверка не пройдена')
