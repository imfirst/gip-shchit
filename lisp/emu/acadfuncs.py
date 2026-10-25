# -*- coding: utf-8 -*-
"""Привязка имитации AutoCAD к интерпретатору + запись DXF для предпросмотра."""
import math, collections, sys, io, os
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from dxfio import load, sections, records, own, g as gv
from lispemu import Sym, T, DPair, LispError, lstr, read_all
from lispbuiltins import L, aslist
from acadmock import Acad, Ename, PickSet, Vla, DynProp, Ent, ctype, is_pt

class VPt(object):
    lisp_type = 'VARIANT'
    def __init__(self, xyz): self.xyz = list(xyz)

def install_acad(I, A):
    g = I.g
    def num_list(p):
        if isinstance(p, VPt): return p.xyz
        return [float(v) for v in aslist(p)]
    def vla_obj(x):
        if isinstance(x, Vla): return x
        raise LispError('bad argument type: VLA-OBJECT ' + lstr(x))
    def ent_of(x):
        if isinstance(x, Vla) and isinstance(x.ref, Ename): return A.ents[x.ref.h]
        if isinstance(x, Ename): return A.ents[x.h]
        raise LispError('not an entity object: ' + lstr(x))

    # ---------------- vlax-get / put / invoke
    def vget(obj, prop):
        p = prop.name if isinstance(prop, Sym) else str(prop)
        p = p.upper()
        if isinstance(obj, DynProp):
            if p == 'PROPERTYNAME': return obj.name
            if p == 'VALUE': return obj.value
            if p == 'ALLOWEDVALUES': return L(list(obj.allowed))
            if p == 'READONLY': return 0
            raise LispError('DynProp: no property ' + p)
        obj = vla_obj(obj)
        if obj.kind == 'APP':
            if p == 'ACTIVEDOCUMENT': return Vla('DOC')
        if obj.kind == 'DOC':
            if p == 'MODELSPACE': return Vla('MS')
            if p == 'NAME': return A.vars['DWGNAME']
            if p == 'FULLNAME': return A.vars['DWGPREFIX'] + A.vars['DWGNAME']
        if obj.kind == 'ATTR':
            e = A.ents[obj.ref.h]
            if p == 'TAGSTRING': return A.dget(e, 2)
            if p == 'TEXTSTRING': return A.dget(e, 1) or ''
            if p == 'INVISIBLE': return -1 if (A.dget(e, 70) or 0) & 1 else 0
        if obj.kind in ('INSERT', 'ENT'):
            e = ent_of(obj)
            if p == 'HANDLE': return e.h
            if p == 'OBJECTNAME': return {'INSERT': 'AcDbBlockReference', 'MTEXT': 'AcDbMText', 'TEXT': 'AcDbText', 'ACAD_TABLE': 'AcDbTable', 'LWPOLYLINE': 'AcDbPolyline'}.get(e.typ, 'AcDb' + e.typ.title())
            if p == 'LAYER': return A.dget(e, 8)
            if e.typ == 'INSERT':
                if p == 'INSERTIONPOINT': return L(list(e.ins['pt'] if e.ins else [x for x in e.data if isinstance(x, list) and x[0] == 10][0][1:]))
                if p == 'NAME': return e.ins['name'] if e.ins else A.dget(e, 2)
                if p == 'EFFECTIVENAME':
                    if e.ins: return e.ins['name']
                    n = A.dget(e, 2); return A.basename.get(n) or n
                if p == 'ISDYNAMICBLOCK': return -1 if (e.ins and e.ins['dyn']) else 0
                if p == 'HASATTRIBUTES': return -1 if e.attribs else 0
                if p == 'XSCALEFACTOR': return e.ins['sx'] if e.ins else (A.dget(e, 41) or 1.0)
            if e.typ == 'ACAD_TABLE':
                if p == 'ROWS': return e.table['rows']
                if p == 'COLUMNS': return e.table['cols']
            if e.typ in ('MTEXT', 'TEXT') and p == 'TEXTSTRING': return A.dget(e, 1)
        raise LispError('vlax-get: unsupported %s on %s' % (p, getattr(obj, 'kind', obj)))

    def vput(obj, prop, val):
        p = prop.name if isinstance(prop, Sym) else str(prop)
        p = p.upper()
        if isinstance(obj, DynProp):
            if p == 'VALUE':
                if obj.allowed and isinstance(val, str) and val not in obj.allowed:
                    raise LispError('Automation Error. Invalid value %r for %s (allowed: %s)' % (val, obj.name, obj.allowed))
                obj.value = val; return val
            raise LispError('DynProp put ' + p)
        obj = vla_obj(obj)
        if obj.kind == 'ATTR':
            e = A.ents[obj.ref.h]
            if p == 'TEXTSTRING':
                e.data = [x for x in e.data if not (isinstance(x, DPair) and x.car == 1)] + [DPair(1, val)]; return val
        if obj.kind in ('INSERT', 'ENT'):
            e = ent_of(obj)
            if p == 'LAYER':
                if val.upper() not in A.tables['LAYER']: raise LispError('Key not found (layer %s)' % val)
                A.set_layer(e, val)
                for a in e.attribs: A.set_layer(A.ents[a.h], val)
                return val
            if p == 'INSERTIONPOINT' and e.ins: e.ins['pt'] = num_list(val)[:3]; return val
            if p == 'COLOR':
                e.data = [x for x in e.data if not (isinstance(x, DPair) and x.car == 62)] + [DPair(62, int(val))]; return val
            if p == 'LINETYPESCALE':
                e.data = [x for x in e.data if not (isinstance(x, DPair) and x.car == 48)] + [DPair(48, float(val))]; return val
            if p == 'TRUECOLOR': return val
        raise LispError('vlax-put: unsupported %s' % p)

    def vinvoke(obj, meth, *args):
        m = meth.name.upper() if isinstance(meth, Sym) else str(meth).upper()
        if isinstance(obj, Vla) and obj.kind == 'MS' and m == 'INSERTBLOCK':
            pt, name, sx, sy, sz, rot = args
            return A.insert_block(num_list(pt), name, sx, sy, sz, rot)
        e = ent_of(obj)
        if m == 'GETDYNAMICBLOCKPROPERTIES':
            if not e.ins: return None
            return L(list(e.ins['dyn'].values()))
        if m == 'GETATTRIBUTES':
            return L([Vla('ATTR', a) for a in e.attribs])
        if m == 'DELETE':
            A.entdel(Ename(e.h, A)); return None
        if e.typ == 'ACAD_TABLE':
            t = e.table
            if m == 'SETTEXT':
                r, c, s = args; t['set'][(r, c)] = s; return None
            if m == 'GETTEXT':
                r, c = args
                if (r, c) in t['set']: return t['set'][(r, c)]
                return ''
            if m == 'INSERTROWS':
                r, h, n = args; t['rows'] += n; A.log.append(('insertrows', r, n)); return None
            if m == 'DELETEROWS':
                r, n = args; t['rows'] -= n; A.log.append(('deleterows', r, n)); return None
        raise LispError('vlax-invoke: unsupported ' + m)

    def obj2ename(o):
        if isinstance(o, Vla) and isinstance(o.ref, Ename): return o.ref
        raise LispError('vlax-vla-object->ename: bad object')
    def ename2obj(en):
        e = A.ents[en.h]
        if e.typ == 'ATTRIB': return Vla('ATTR', en)
        return Vla('INSERT' if e.typ == 'INSERT' else 'ENT', en)

    DLG = {'tiles': {}, 'lists': {}, 'actions': {}, 'cur': None}
    I.DLG = DLG
    def dlg_set(k, v):
        if not isinstance(v, str): raise LispError('set_tile: value must be string, got ' + lstr(v))
        DLG['tiles'][k] = v; return v
    def dlg_action(k, a):
        if not isinstance(a, str): raise LispError('action_tile: action must be string')
        read_all(a)  # синтаксис
        DLG['actions'][k] = a; return T
    def dlg_start(k, *a): DLG['cur'] = k; DLG['lists'][k] = []; return k
    def dlg_add(v):
        if not isinstance(v, str): raise LispError('add_list: string expected, got ' + lstr(v))
        DLG['lists'][DLG['cur']].append(v); return v
    def ssl(ss): return len(ss.items) if ss else 0
    def ssn(ss, i):
        return ss.items[i] if ss and 0 <= i < len(ss.items) else None
    def ssadd(en=None, ss=None):
        if ss is None: ss = PickSet([])
        if en is not None and en not in ss.items: ss.items.append(en)
        return ss

    def getvar(n): return A.vars.get(n.upper())
    def setvar(n, v): A.vars[n.upper()] = v; return v

    def entnext(en=None):
        if en is None:
            for h in A.order:
                e = A.ents[h]
                if not e.deleted and e.owner == '1F': return Ename(h, A)
            return None
        e = A.ents[en.h]
        if e.typ == 'INSERT' and e.attribs:
            return e.attribs[0]
        if e.typ == 'ATTRIB':
            par = A.ents[e.owner]
            idx = [a.h for a in par.attribs].index(e.h)
            if idx + 1 < len(par.attribs): return par.attribs[idx + 1]
            return None
        i = A.order.index(en.h)
        for h in A.order[i + 1:]:
            x = A.ents[h]
            if not x.deleted and x.owner == '1F': return Ename(h, A)
        return None

    # файлы
    def l_open(path, mode, enc=None):
        try:
            return open(path, mode[0].lower() + ('' if 'b' in mode else ''), encoding='utf-8')
        except OSError:
            return None
    def l_close(f): f.close(); return None
    def write_line(s, f=None):
        if f is None: I.out.append(s + '\n')
        else: f.write(s + '\n')
        return s
    def read_line(f=None):
        s = f.readline()
        if s == '': return None
        return s.rstrip('\n').rstrip('\r')
    def findfile(n):
        return n if os.path.exists(n) else None

    d = {
        'ENTMAKE': lambda l: (A.entmake(l) and l), 'ENTMAKEX': lambda l: A.entmake(l), 'ENTGET': lambda e, apps=None: A.entget(e, apps),
        'ENTMOD': A.entmod, 'ENTDEL': A.entdel, 'HANDENT': A.handent, 'ENTLAST': A.entlast, 'ENTNEXT': entnext,
        'ENTUPD': lambda e: e,
        'SSGET': A.ssget, 'SSLENGTH': ssl, 'SSNAME': ssn, 'SSADD': ssadd,
        'TBLSEARCH': A.tblsearch, 'REGAPP': A.regapp, 'NAMEDOBJDICT': lambda: Ename(A.nod, A),
        'DICTSEARCH': A.dictsearch, 'DICTADD': A.dictadd, 'DICTREMOVE': A.dictremove,
        'GETVAR': getvar, 'SETVAR': setvar,
        'VLAX-GET-ACAD-OBJECT': lambda: Vla('APP'), 'VLA-GET-ACTIVEDOCUMENT': lambda app: Vla('DOC'),
        'VLA-GET-MODELSPACE': lambda doc: Vla('MS'),
        'VLAX-3D-POINT': lambda x, y=None, z=0.0: VPt(aslist(x)[:3] if y is None else [x, y, z]),
        'VLAX-GET': vget, 'VLAX-PUT': vput, 'VLAX-INVOKE': vinvoke,
        'VLAX-GET-PROPERTY': vget, 'VLAX-PUT-PROPERTY': vput, 'VLAX-INVOKE-METHOD': vinvoke,
        'VLA-INSERTBLOCK': lambda ms, pt, n, sx, sy, sz, r: vinvoke(ms, Sym('InsertBlock'), pt, n, sx, sy, sz, r),
        'VLA-DELETE': lambda o: vinvoke(o, Sym('Delete')),
        'VLA-GET-PROPERTYNAME': lambda p: vget(p, 'PropertyName'),
        'VLA-GET-TAGSTRING': lambda a: vget(a, 'TagString'), 'VLA-PUT-TEXTSTRING': lambda a, v: vput(a, 'TextString', v),
        'VLA-GET-TEXTSTRING': lambda a: vget(a, 'TextString'),
        'VLA-GET-HANDLE': lambda o: vget(o, 'Handle'), 'VLA-PUT-LAYER': lambda o, v: vput(o, 'Layer', v),
        'VLAX-VLA-OBJECT->ENAME': obj2ename, 'VLAX-ENAME->VLA-OBJECT': ename2obj,
        'VLAX-PROPERTY-AVAILABLE-P': lambda o, p, w=None: T,
        'VLA-STARTUNDOMARK': lambda d: None, 'VLA-ENDUNDOMARK': lambda d: None, 'VLA-REGEN': lambda d, m: None,
        'VLAX-RELEASE-OBJECT': lambda o: None, 'VLAX-ERASED-P': lambda o: T if A.ents[obj2ename(o).h].deleted else None,
        'VLR-COMMAND-REACTOR': lambda data, cbs: Vla('REACTOR'), 'VLR-REMOVE': lambda r: None,
        'VLR-REACTORS': lambda *a: None, 'VLR-DATA': lambda r: None, 'VLR-OBJECT-REACTOR': lambda *a: Vla('REACTOR'),
        'VLR-EDITOR-REACTOR': lambda *a: Vla('REACTOR'), 'VLR-DOCMANAGER-REACTOR': lambda *a: Vla('REACTOR'),
        'OPEN': l_open, 'CLOSE': l_close, 'WRITE-LINE': write_line, 'READ-LINE': read_line, 'FINDFILE': findfile,
        'VL-FILENAME-DIRECTORY': lambda p: os.path.dirname(p), 'VL-FILE-DELETE': lambda p: T,
        'STARTAPP': lambda *a: None, 'COMMAND': lambda *a: (_ for _ in ()).throw(LispError('COMMAND called in emulator: ' + lstr(list(a)))),
        'VL-CMDF': lambda *a: (_ for _ in ()).throw(LispError('VL-CMDF in emulator')),
        'REDRAW': lambda *a: None, 'GRTEXT': lambda *a: None,
        'LOAD_DIALOG': lambda f: 1, 'UNLOAD_DIALOG': lambda i: None, 'NEW_DIALOG': lambda n, i, *a: T,
        'START_DIALOG': lambda: DLG.get('result', 1), 'DONE_DIALOG': lambda *a: None, 'SET_TILE': dlg_set, 'GET_TILE': lambda k: DLG['tiles'].get(k, ''),
        'ACTION_TILE': dlg_action, 'MODE_TILE': lambda k, m: None, 'START_LIST': dlg_start, 'ADD_LIST': dlg_add,
        'END_LIST': lambda: None, 'TERM_DIALOG': lambda: None,
        'VL-FILENAME-MKTEMP': lambda *a: __import__('tempfile').gettempdir() + '/gip_test.dcl', 'VLAX-ADD-CMD': lambda n, f, *a: n,
    }
    for k, v in d.items(): g[k] = v

# ======================================================================= предпросмотр
class Preview(object):
    """Собирает DXF только для просмотрщика: блоки шаблона (+ блоки рабочего файла с префиксом), объекты модели."""
    def __init__(self, A, extra_paths=()):
        self.A = A
        self.blocks = collections.OrderedDict()   # name -> list of records (включая BLOCK/ENDBLK)
        self.attdefs = {}
        self.repmap = {}   # (base, vis) -> rep name
        self.load_blocks(A.S, '')
        for p, pre in extra_paths:
            P = load(p); S = sections(P)
            self.load_blocks(S, pre)

    def load_blocks(self, S, pre):
        T = records(S['TABLES']); B = records(S['BLOCKS']); O = records(S['OBJECTS']); E = records(S['ENTITIES'])
        OH = {own(r): r for r in O}
        recname = {}; base = {}
        for r in T:
            if r[0][1] == 'BLOCK_RECORD':
                recname[own(r)] = gv(r, 2)
        for r in T:
            if r[0][1] == 'BLOCK_RECORD':
                for i, (c, v) in enumerate(r):
                    if c == 1001 and v == 'AcDbBlockRepBTag':
                        for c2, v2 in r[i + 1:i + 5]:
                            if c2 == 1005: base[gv(r, 2)] = recname.get(v2)
        def ren(n):
            if not pre: return n
            return pre + n if n.startswith('*') else n
        cur = None; buf = []
        for r in B:
            if r[0][1] == 'BLOCK':
                cur = gv(r, 2); buf = [r]; continue
            if r[0][1] == 'ENDBLK':
                buf.append(r)
                nn = ren(cur)
                if nn not in self.blocks:
                    out = []
                    for rr in buf:
                        rr2 = [[c, (ren(v) if (c == 2 and rr[0][1] in ('BLOCK', 'INSERT')) or (c == 3 and rr[0][1] == 'BLOCK') else v)] for c, v in rr]
                        out.append(rr2)
                    self.blocks[nn] = out
                    self.attdefs[nn] = [rr for rr in out if rr[0][1] == 'ATTDEF']
                cur = None; buf = []; continue
            if cur is not None: buf.append(r)
        # видимость по вставкам
        def vis_of(r):
            res = None
            def walk(h, d=0):
                nonlocal res
                o = OH.get(h)
                if not o or d > 5: return
                if o[0][1] == 'XRECORD' and any(c == 1071 and v.strip() == '135625452' for c, v in o):
                    res = gv(o, 1)
                for c, v in o:
                    if c in (350, 360): walk(v, d + 1)
            for c, v in r:
                if c == 360: walk(v)
            return res
        for r in E:
            if r[0][1] == 'INSERT':
                n = gv(r, 2)
                if n in base and base[n]:
                    vis = vis_of(r)
                    k = (base[n], vis)
                    if k not in self.repmap: self.repmap[k] = ren(n)
        # вложенные в блоки вставки тоже
        for bn, recs in list(self.blocks.items()):
            pass

    def ent_records(self):
        A = self.A; out = []
        for h in A.order:
            e = A.ents[h]
            if e.deleted or e.owner != '1F' or e.typ in ('ATTRIB', 'SEQEND'): continue
            if e.typ in ('XRECORD', 'DICTIONARY'): continue
            if e.ins is not None:
                out += self.insert_records(e)
                continue
            if e.raw is not None:
                rec = [list(p) for p in e.raw]
                out.append(rec)
                if e.typ == 'INSERT' and e.attribs:
                    for a in e.attribs:
                        ae = A.ents[a.h]
                        if ae.raw is not None and ae.data == A.rec2data(ae.raw):
                            out.append([list(p) for p in ae.raw])
                        else:
                            out.append(self.data2rec('ATTRIB', ae.data, ae.raw))
                    out.append([[0, 'SEQEND'], [8, '0']])
                continue
            out.append(self.data2rec(e.typ, e.data))
        return out

    def data2rec(self, typ, data, raw=None):
        rec = [[0, typ]]
        for p in data:
            if isinstance(p, DPair):
                v = p.cdr
                # entmake: углы TEXT/ATTRIB/ARC в радианах, в DXF — градусы
                if typ in ('TEXT', 'ATTDEF', 'ATTRIB', 'ARC') and p.car in (50, 51) and isinstance(v, (int, float)): v = float(v) * 180 / math.pi
                if isinstance(v, Ename): v = v.h
                elif isinstance(v, float): v = repr(v)
                elif v is None: v = ''
                rec.append([p.car, str(v)])
            elif isinstance(p, list):
                c = p[0]
                rec.append([c, repr(float(p[1]))]); rec.append([c + 10, repr(float(p[2]))])
                if len(p) > 3: rec.append([c + 20, repr(float(p[3]))])
        if raw is not None and typ == 'ATTRIB':
            # сохранить позицию из исходника, если в data её нет
            pass
        return rec

    def insert_records(self, e):
        A = self.A; ins = e.ins
        vis = None
        for nm, dp in ins['dyn'].items():
            if dp.allowed and isinstance(dp.value, str) and dp.value in dp.allowed: vis = dp.value
        rep = self.repmap.get((ins['name'], vis)) or ins['name']
        lay = A.dget(e, 8) or '0'
        sx = ins['sx']; sy = ins['sy']; rot = ins['rot']
        x, y = ins['pt'][0], ins['pt'][1]
        rec = [[0, 'INSERT'], [8, lay]]
        col = A.dget(e, 62)
        if col is not None: rec.append([62, str(col)])
        rec += [[2, rep], [10, repr(x)], [20, repr(y)], [30, '0.0'], [41, repr(sx)], [42, repr(sy)], [43, repr(sx)], [50, repr(rot * 180 / math.pi)]]
        out = [rec]
        defs = self.attdefs.get(rep, [])
        vals = {}
        for a in e.attribs:
            ae = A.ents[a.h]; vals[A.dget(ae, 2)] = A.dget(ae, 1) or ''
        bb = [r for r in self.blocks.get(rep, [[]])[0:1]]
        bx = by = 0.0
        if bb and bb[0]:
            bx = float(gv(bb[0], 10, '0')); by = float(gv(bb[0], 20, '0'))
        c, s = math.cos(rot), math.sin(rot)
        def tp(px, py):
            px = (px - bx) * sx; py = (py - by) * sy
            return x + px * c - py * s, y + px * s + py * c
        if defs:
            rec.insert(2, [66, '1'])
            for d in defs:
                tag = gv(d, 2)
                ar = [[0, 'ATTRIB'], [8, gv(d, 8, '0')]]
                p10 = tp(float(gv(d, 10, '0')), float(gv(d, 20, '0')))
                ar += [[10, repr(p10[0])], [20, repr(p10[1])], [40, repr(float(gv(d, 40, '1')) * sy)], [1, vals.get(tag, gv(d, 1, ''))]]
                ar += [[50, repr(float(gv(d, 50, '0')) + rot * 180 / math.pi)], [41, gv(d, 41, '1')], [7, gv(d, 7, 'Standard')]]
                if gv(d, 72): ar.append([72, gv(d, 72)])
                if gv(d, 11):
                    p11 = tp(float(gv(d, 11)), float(gv(d, 21)))
                    ar += [[11, repr(p11[0])], [21, repr(p11[1])]]
                ar += [[2, tag], [70, gv(d, 70, '0')]]
                if gv(d, 74): ar.append([74, gv(d, 74)])
                if gv(d, 62): ar.append([62, gv(d, 62)])
                out.append(ar)
            out.append([[0, 'SEQEND'], [8, lay]])
        return out

    def write(self, path):
        A = self.A
        L2 = []
        def pr(rec):
            for c, v in rec:
                L2.append('%3d' % c if c < 1000 else str(c)); L2.append(str(v))
        L2 += ['  0', 'SECTION', '  2', 'TABLES']
        L2 += ['  0', 'TABLE', '  2', 'LAYER']
        for k, r in A.tables['LAYER'].items(): pr(r)
        L2 += ['  0', 'ENDTAB', '  0', 'ENDSEC']
        L2 += ['  0', 'SECTION', '  2', 'BLOCKS']
        for n, recs in self.blocks.items():
            for r in recs: pr(r)
        L2 += ['  0', 'ENDSEC', '  0', 'SECTION', '  2', 'ENTITIES']
        for r in self.ent_records(): pr(r)
        L2 += ['  0', 'ENDSEC', '  0', 'EOF']
        open(path, 'w', encoding='utf-8', newline='').write('\r\n'.join(L2) + '\r\n')
