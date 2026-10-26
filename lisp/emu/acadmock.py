# -*- coding: utf-8 -*-
"""Имитация AutoCAD для интерпретатора: база объектов из DXF-шаблона, entmake/entget/entmod/ssget,
словари, xdata, ActiveX (InsertBlock, динамические свойства, атрибуты, таблицы)."""
import math, re, collections, sys
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from dxfio import load, sections, records, own, owner, xdicts, g as gv
from lispemu import Sym, T, DPair, LispError, nl, lstr
from lispbuiltins import L, aslist, wcmatch, CatchErr

PT_CODES = set(list(range(10, 19)) + list(range(110, 113)) + [210] + list(range(1010, 1014)))
def is_pt(c): return c in PT_CODES
def ctype(c):
    """тип значения для группового кода"""
    if c in (5, 105): return 'h'
    if 320 <= c <= 369 or 390 <= c <= 399 or 480 <= c <= 481 or c == 1005: return 'e'
    if (10 <= c <= 59) or (110 <= c <= 149) or (210 <= c <= 239) or (460 <= c <= 469) or (1010 <= c <= 1059): return 'r'
    if (60 <= c <= 99) or (160 <= c <= 179) or (170 <= c <= 179) or (270 <= c <= 289) or (370 <= c <= 389) or (400 <= c <= 409) or (420 <= c <= 429) or (440 <= c <= 459) or (1060 <= c <= 1071) or (280 <= c <= 299): return 'i'
    return 's'

class Ename(object):
    lisp_type = 'ENAME'
    __slots__ = ('h', 'db')
    def __init__(self, h, db): self.h = h; self.db = db
    def __repr__(self): return '<Entity name: %s>' % self.h
    def lisp_equal(self, o): return isinstance(o, Ename) and o.h == self.h
    def __eq__(self, o): return isinstance(o, Ename) and o.h == self.h
    def __hash__(self): return hash(self.h)

class PickSet(object):
    lisp_type = 'PICKSET'
    def __init__(self, items): self.items = list(items)

class Ent(object):
    """объект базы: тип, данные в формате entget (без -1), xdata, флаги"""
    def __init__(self, h, typ, data, owner='1F'):
        self.h = h; self.typ = typ; self.data = data; self.owner = owner
        self.xdata = collections.OrderedDict()  # app -> list of DPair/point lists
        self.deleted = False
        self.raw = None       # исходная DXF-запись (для неизменённых объектов шаблона)
        self.ins = None       # данные вставки, созданной через InsertBlock
        self.attribs = []     # Ename атрибутов
        self.table = None     # данные ACAD_TABLE
        self.dict = None      # для DICTIONARY: OrderedDict name->handle

class DynProp(object):
    lisp_type = 'VLA-OBJECT'
    def __init__(self, ins, name, value, allowed=None):
        self.ins = ins; self.name = name; self.value = value; self.allowed = allowed or []

class Vla(object):
    lisp_type = 'VLA-OBJECT'
    def __init__(self, kind, ref=None): self.kind = kind; self.ref = ref
    def lisp_equal(self, o): return isinstance(o, Vla) and o.kind == self.kind and o.ref == self.ref
    def __repr__(self): return '#<VLA-OBJECT %s %s>' % (self.kind, getattr(self.ref, 'h', ''))

def to_val(c, v, db):
    t = ctype(c)
    if t == 'r':
        try: return float(v)
        except ValueError: return 0.0
    if t == 'i':
        try: return int(v)
        except ValueError: return 0
    if t == 'e':
        return Ename(v, db) if v and v != '0' else None
    return v

class Acad(object):
    def __init__(self, tpl_path, blockinfo):
        self.blockinfo = blockinfo  # name -> {'attdefs':[...], 'dyn':{propname:(default, allowed)}}
        P = load(tpl_path); S = sections(P)
        self.S = S
        self.ents = collections.OrderedDict()
        self.order = []
        self.seed = int([v for c, v in S['HEADER'] if False] or ['0'][0], 16) if False else 0
        mx = 0
        for sec in ('TABLES', 'BLOCKS', 'ENTITIES', 'OBJECTS'):
            for r in records(S.get(sec, [])):
                h = own(r)
                if h: mx = max(mx, int(h, 16))
        self.seed = mx + 1
        # таблицы
        self.tables = collections.defaultdict(dict)
        for r in records(S['TABLES']):
            t = r[0][1]
            if t in ('LAYER', 'STYLE', 'LTYPE', 'APPID', 'BLOCK_RECORD', 'DIMSTYLE'):
                self.tables[t][gv(r, 2).upper()] = r
        # динамические представления: *U -> имя определения
        self.basename = {}
        rn = {own(r): gv(r, 2) for r in records(S['TABLES']) if r[0][1] == 'BLOCK_RECORD'}
        for r in records(S['TABLES']):
            if r[0][1] == 'BLOCK_RECORD':
                for i, (c, v) in enumerate(r):
                    if c == 1001 and v == 'AcDbBlockRepBTag':
                        for c2, v2 in r[i + 1:i + 5]:
                            if c2 == 1005: self.basename[gv(r, 2)] = rn.get(v2)
        # объекты модели шаблона
        E = records(S['ENTITIES'])
        i = 0
        cur_ins = None
        for r in E:
            t = r[0][1]
            h = own(r)
            data = self.rec2data(r)
            e = Ent(h, t, data, owner(r) or '1F')
            e.raw = r
            e.xdata = self.rec_xdata(r)
            self.ents[h] = e; self.order.append(h)
            if t == 'INSERT':
                cur_ins = e if int(gv(r, 66, '0') or 0) == 1 else None
            elif t == 'ATTRIB' and cur_ins is not None:
                cur_ins.attribs.append(Ename(h, self))
            elif t == 'SEQEND':
                cur_ins = None
            if t == 'ACAD_TABLE':
                e.table = self.parse_table(r)
        # словари
        self.nod = self.new_handle()
        nod = Ent(self.nod, 'DICTIONARY', [DPair(0, 'DICTIONARY')], '0'); nod.dict = collections.OrderedDict()
        self.ents[self.nod] = nod
        self.vars = {'CMDECHO': 1, 'OSMODE': 0, 'CLAYER': '0', 'DWGPREFIX': '/tmp/', 'DWGNAME': 'test.dwg', 'LISPSYS': 1,
                     'CTAB': 'Model', 'TILEMODE': 1, 'DIMZIN': 8, 'INSUNITS': 4, 'DATE': 2461338.5}
        self.log = []

    def new_handle(self):
        h = '%X' % self.seed; self.seed += 1; return h

    # ---------- конвертация DXF <-> entget
    def rec2data(self, r):
        out = []; i = 0; n = len(r)
        while i < n:
            c, v = r[i]
            if c == 102:
                # пропускаем группы {ACAD_REACTORS ...} {ACAD_XDICTIONARY ...}
                if v.startswith('{'):
                    j = i + 1
                    while j < n and not (r[j][0] == 102 and r[j][1] == '}'): j += 1
                    i = j + 1; continue
            if c >= 1000: break
            if c in (5,):
                i += 1; continue
            if is_pt(c):
                x = float(v); y = 0.0; z = 0.0; j = i + 1
                if j < n and r[j][0] == c + 10: y = float(r[j][1]); j += 1
                if j < n and r[j][0] == c + 20: z = float(r[j][1]); j += 1
                out.append([c, x, y, z]); i = j; continue
            out.append(DPair(c, to_val(c, v, self)))
            i += 1
        return out

    def rec_xdata(self, r):
        xd = collections.OrderedDict(); app = None
        i = 0; n = len(r)
        while i < n:
            c, v = r[i]
            if c == 1001: app = v; xd[app] = []; i += 1; continue
            if app is not None and c >= 1000:
                if c in (1010, 1011, 1012, 1013):
                    x = float(v); y = float(r[i + 1][1]); z = float(r[i + 2][1]) if i + 2 < n and r[i + 2][0] == c + 20 else 0.0
                    xd[app].append([c, x, y, z]); i += 3; continue
                xd[app].append(DPair(c, to_val(c, v, self) if c != 1005 else v)); i += 1; continue
            i += 1
        return xd

    def parse_table(self, r):
        # упрощённо: ячейки — значения кода 1 и 302 по порядку
        cells = [v for c, v in r if c in (1, 302)]
        return {'rows': int(gv(r, 91, '0')), 'cols': int(gv(r, 92, '0')), 'cells': cells, 'set': {}}

    # ---------- функции AutoLISP
    def ename(self, h): return Ename(h, self)

    def entget(self, en, apps=None):
        if en is None: return None
        e = self.ents.get(en.h)
        if e is None or e.deleted: return None
        lst = [DPair(-1, en), DPair(0, e.typ), DPair(330, Ename(e.owner, self)), DPair(5, e.h)] + list(e.data)
        if e.ins is not None:
            lst = [p for p in lst if not (isinstance(p, DPair) and p.car in (2,))]
            lst.insert(2, DPair(2, e.ins['name']))
            lst = [p for p in lst if not (isinstance(p, list) and p[0] == 10)] + [[10] + list(e.ins['pt'])]
        if apps:
            xs = []
            for a in aslist(apps):
                for app, vals in e.xdata.items():
                    if wcmatch(app, a):
                        xs.append(L([app] + vals))
            if xs: lst.append(L([-3] + xs))
        return L(lst)

    def entmake(self, lst, x=True):
        lst = aslist(lst)
        typ = None; data = []; xd = collections.OrderedDict(); owner_h = '1F'
        for p in lst:
            if isinstance(p, DPair):
                if p.car == 0: typ = p.cdr; continue
                if p.car in (-1, 5): continue
                if p.car == 330 and p.cdr is not None: owner_h = p.cdr.h; continue
                data.append(p)
            elif isinstance(p, list):
                if p[0] == -3:
                    for app in p[1:]:
                        app = aslist(app)
                        if app[0].upper() not in self.tables['APPID']:
                            raise LispError('entmake: xdata app not registered ' + app[0])
                        xd[app[0]] = list(app[1:])
                    continue
                data.append(p)
        if typ is None: raise LispError('entmake: no entity type')
        if typ in ('LAYER', 'STYLE', 'LTYPE', 'APPID'):
            nm = [p.cdr for p in data if isinstance(p, DPair) and p.car == 2][0]
            self.tables[typ][nm.upper()] = [[0, typ], [2, nm], [62, str([p.cdr for p in data if isinstance(p, DPair) and p.car == 62][0] if any(isinstance(p, DPair) and p.car == 62 for p in data) else 7)]]
            return Ename(self.new_handle(), self)
        if typ == 'BLOCK':
            nm = [p.cdr for p in data if isinstance(p, DPair) and p.car == 2][0]
            self._newblk = {'name': nm, 'ents': []}
            return L([DPair(0, 'BLOCK'), DPair(2, nm)])
        if typ == 'ENDBLK':
            nb = getattr(self, '_newblk', None)
            if nb is None: raise LispError('entmake ENDBLK without BLOCK')
            if not hasattr(self, 'newblocks'): self.newblocks = collections.OrderedDict()
            self.newblocks[nb['name']] = nb['ents']
            self.blockinfo[nb['name']] = {'attdefs': [], 'dyn': {}}
            if hasattr(self, '_bu'): del self._bu
            self._newblk = None
            return nb['name']
        self.check_ent(typ, data)
        if getattr(self, '_newblk', None) is not None and typ not in ('XRECORD', 'DICTIONARY'):
            self._newblk['ents'].append((typ, data))
            return L([DPair(0, typ)])
        h = self.new_handle()
        e = Ent(h, typ, data, owner_h if typ in ('XRECORD', 'DICTIONARY') else '1F')
        e.xdata = xd
        if typ == 'DICTIONARY': e.dict = collections.OrderedDict()
        self.ents[h] = e; self.order.append(h)
        if typ == 'XRECORD' or typ == 'DICTIONARY':
            e.owner = '0'
        return Ename(h, self)

    def check_ent(self, typ, data):
        codes = [p.car if isinstance(p, DPair) else p[0] for p in data]
        def need(*cs):
            for c in cs:
                if c not in codes: raise LispError('entmake %s: missing group %d' % (typ, c))
        if typ == 'LINE': need(10, 11)
        elif typ == 'LWPOLYLINE':
            need(90, 10)
            if 100 not in codes: raise LispError('entmake LWPOLYLINE needs 100 markers')
            n = [p.cdr for p in data if isinstance(p, DPair) and p.car == 90][0]
            if codes.count(10) != n: raise LispError('LWPOLYLINE vertex count mismatch %d/%d' % (codes.count(10), n))
        elif typ == 'MTEXT': need(10, 1)
        elif typ == 'TEXT': need(10, 40, 1)
        elif typ == 'HATCH':
            need(10, 2, 70, 71, 91, 92, 93, 75, 76, 98)
            # структура контура: 92 -> (72 73 93 точки) | рёбра
        elif typ == 'CIRCLE': need(10, 40)
        elif typ == 'ARC': need(10, 40, 50, 51)
        elif typ == 'INSERT': need(2, 10)
        for p in data:
            if isinstance(p, list):
                for v in p[1:]:
                    if not isinstance(v, (int, float)) or isinstance(v, bool) or math.isnan(v):
                        raise LispError('bad point in %s: %s' % (typ, lstr(p)))
            elif isinstance(p, DPair):
                c = p.car; v = p.cdr
                t = ctype(c) if c >= 0 else 's'
                if t == 'r' and not isinstance(v, (int, float)): raise LispError('%s: code %d needs real, got %s' % (typ, c, lstr(v)))
                if t == 'i' and not isinstance(v, int): raise LispError('%s: code %d needs int, got %s' % (typ, c, lstr(v)))
                if t == 's' and c not in (100, 102) and not isinstance(v, str) and v is not None and c > 0 and not (300 <= c <= 309 and isinstance(v, str)):
                    if c in (1, 2, 3, 6, 7, 8) and not isinstance(v, str):
                        raise LispError('%s: code %d needs string, got %s' % (typ, c, lstr(v)))

    def entmod(self, lst):
        lst = aslist(lst)
        en = [p.cdr for p in lst if isinstance(p, DPair) and p.car == -1]
        if not en: raise LispError('entmod: no -1')
        e = self.ents.get(en[0].h)
        if e is None or e.deleted: return None
        data = []; xd = None
        for p in lst:
            if isinstance(p, DPair):
                if p.car in (-1, 0, 5, 330): continue
                if p.car == 2 and e.ins is not None: e.ins['name'] = p.cdr; continue
                data.append(p)
            elif isinstance(p, list):
                if p[0] == -3:
                    xd = collections.OrderedDict()
                    for app in p[1:]:
                        app = aslist(app)
                        if app[0].upper() not in self.tables['APPID']: raise LispError('entmod: app not registered ' + app[0])
                        xd[app[0]] = list(app[1:])
                    continue
                if p[0] == 10 and e.ins is not None: e.ins['pt'] = list(p[1:4]) + [0.0] * (3 - len(p[1:4])); continue
                data.append(p)
        if e.ins is None: self.check_ent(e.typ, data)
        e.data = data; e.raw = None
        if xd is not None:
            for app, vals in xd.items():
                if vals: e.xdata[app] = vals
                else: e.xdata.pop(app, None)
        return L(lst)

    def entdel(self, en):
        e = self.ents.get(en.h)
        if e is None: return None
        e.deleted = not e.deleted
        for a in e.attribs: self.ents[a.h].deleted = e.deleted
        return en

    def handent(self, h):
        e = self.ents.get(h.upper())
        return Ename(e.h, self) if e and not e.deleted else None

    def entlast(self):
        for h in reversed(self.order):
            e = self.ents[h]
            if not e.deleted and e.owner == '1F' and e.typ not in ('ATTRIB', 'SEQEND'): return Ename(h, self)
        return None

    def ssget(self, mode=None, *args):
        flt = None
        if mode is None: raise LispError('interactive ssget not supported')
        m = mode.upper().lstrip('_')
        if m == 'X':
            flt = args[0] if args else None
            cand = [h for h in self.order if not self.ents[h].deleted and self.ents[h].owner == '1F' and self.ents[h].typ not in ('ATTRIB', 'SEQEND', 'VERTEX')]
        else:
            raise LispError('ssget mode not supported: ' + mode)
        res = [Ename(h, self) for h in cand if self.match(self.ents[h], flt)]
        return PickSet(res) if res else None

    def match(self, e, flt):
        for p in aslist(flt):
            if isinstance(p, list) and p[0] == -3:
                for app in p[1:]:
                    if not any(wcmatch(a, aslist(app)[0]) for a in e.xdata): return False
                continue
            c = p.car; v = p.cdr
            if c == 0:
                if not wcmatch(e.typ, v): return False
            elif c == 8:
                lay = self.dget(e, 8)
                if lay is None or not wcmatch(lay, v): return False
            elif c == 2:
                nm = e.ins['name'] if e.ins else self.dget(e, 2)
                if nm is None or not wcmatch(nm, v): return False
            else:
                if self.dget(e, c) != v: return False
        return True

    def dget(self, e, c):
        for p in e.data:
            if isinstance(p, DPair) and p.car == c: return p.cdr
        return None

    def tblsearch(self, t, name, nxt=None):
        t = t.upper()
        if t == 'BLOCK':
            if name.upper() in self.blockinfo_upper(): return L([DPair(0, 'BLOCK'), DPair(2, name)])
            return None
        r = self.tables.get(t, {}).get(name.upper())
        if r is None: return None
        return L([DPair(0, t), DPair(2, gv(r, 2))])

    def blockinfo_upper(self):
        if not hasattr(self, '_bu'): self._bu = {k.upper(): k for k in self.blockinfo}
        return self._bu

    def regapp(self, name):
        if name.upper() in self.tables['APPID']: return None
        self.tables['APPID'][name.upper()] = [[0, 'APPID'], [2, name]]
        return name

    def add_layer(self, name):
        self.tables['LAYER'][name.upper()] = [[0, 'LAYER'], [2, name], [62, '7']]

    # словари
    def dictsearch(self, d, key):
        de = self.ents.get(d.h)
        if de is None or de.dict is None: return None
        h = de.dict.get(key.upper())
        if h is None: return None
        return self.entget(Ename(h, self))

    def dictadd(self, d, key, en):
        de = self.ents.get(d.h)
        if key.upper() in de.dict: return None
        de.dict[key.upper()] = en.h
        self.ents[en.h].owner = d.h
        return en

    def dictremove(self, d, key):
        de = self.ents.get(d.h)
        h = de.dict.pop(key.upper(), None)
        if h is None: return None
        self.ents[h].deleted = True
        return Ename(h, self)

    # ---------- вставка блока (ActiveX)
    def insert_block(self, pt, name, sx, sy, sz, rot):
        bu = self.blockinfo_upper()
        if name.upper() not in bu: raise LispError('InsertBlock: block not found: ' + name)
        real = bu[name.upper()]
        info = self.blockinfo[real]
        h = self.new_handle()
        data = [DPair(100, 'AcDbEntity'), DPair(8, '0'), DPair(100, 'AcDbBlockReference')]
        data += [DPair(41, float(sx)), DPair(42, float(sy)), DPair(43, float(sz)), DPair(50, float(rot) * 180 / math.pi)]
        e = Ent(h, 'INSERT', data)
        e.ins = {'name': real, 'pt': list(pt)[:3] + [0.0] * (3 - len(list(pt)[:3])), 'dyn': collections.OrderedDict(), 'rot': float(rot), 'sx': float(sx), 'sy': float(sy)}
        for pname, (dv, allowed) in info.get('dyn', {}).items():
            e.ins['dyn'][pname] = DynProp(e, pname, dv, allowed)
        self.ents[h] = e; self.order.append(h)
        for ad in info.get('attdefs', []):
            ah = self.new_handle()
            a = Ent(ah, 'ATTRIB', [DPair(2, ad['tag']), DPair(1, ad.get('def', '')), DPair(70, ad.get('flags', 0))], h)
            a.owner = h
            self.ents[ah] = a; self.order.append(ah)
            e.attribs.append(Ename(ah, self))
        if e.attribs: e.data.append(DPair(66, 1))
        return Vla('INSERT', Ename(h, self))

    def set_layer(self, e, lay):
        e.data = [p for p in e.data if not (isinstance(p, DPair) and p.car == 8)]
        e.data.insert(1, DPair(8, lay))
