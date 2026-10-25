# -*- coding: utf-8 -*-
"""Сведения о блоках шаблона для имитатора: атрибуты и динамические свойства."""
import sys, json, collections
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from dxfio import load, sections, records, own, xdicts, g as gv

def blockinfo(path):
    P = load(path); S = sections(P)
    T = records(S['TABLES']); B = records(S['BLOCKS']); O = records(S['OBJECTS'])
    OH = {own(r): r for r in O}
    brec = {gv(r, 2): r for r in T if r[0][1] == 'BLOCK_RECORD'}
    info = collections.OrderedDict()
    cur = None
    for r in B:
        if r[0][1] == 'BLOCK': cur = gv(r, 2); info.setdefault(cur, {'attdefs': [], 'dyn': {}}); continue
        if r[0][1] == 'ENDBLK': cur = None; continue
        if cur and r[0][1] == 'ATTDEF':
            info[cur]['attdefs'].append({'tag': gv(r, 2), 'def': gv(r, 1, ''), 'flags': int(gv(r, 70, '0'))})
    for name, r in brec.items():
        if name.startswith('*') : continue
        acc = {}
        def walk(h, d=0):
            o = OH.get(h)
            if not o or h in acc or d > 4: return
            acc[h] = o
            for c, v in o:
                if c in (350, 360): walk(v, d + 1)
        for x in xdicts(r): walk(x)
        dyn = collections.OrderedDict()
        for h, o in acc.items():
            t = o[0][1]
            if t == 'BLOCKVISIBILITYPARAMETER':
                nm = gv(o, 301); states = [v for c, v in o if c == 303]
                dyn[nm] = (states[0] if states else '', states)
            elif t == 'BLOCKFLIPPARAMETER':
                dyn[gv(o, 305)] = (0, [])
            elif t == 'BLOCKLOOKUPPARAMETER':
                dyn[gv(o, 303)] = ('', [])
            elif t in ('BLOCKLINEARPARAMETER', 'BLOCKROTATIONPARAMETER'):
                dyn[gv(o, 305)] = (0.0, [])
            elif t == 'BLOCKPOINTPARAMETER':
                n = gv(o, 303); dyn[n + ' X'] = (0.0, []); dyn[n + ' Y'] = (0.0, [])
        if name in info: info[name]['dyn'] = dyn
    return info

if __name__ == '__main__':
    i = blockinfo(sys.argv[1])
    json.dump(i, open(sys.argv[2], 'w'), ensure_ascii=False, indent=1)
    for k, v in i.items():
        if not k.startswith('*') and (v['dyn'] or v['attdefs']):
            print(k, [a['tag'] for a in v['attdefs']], list(v['dyn'].keys()))
