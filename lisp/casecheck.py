import re,glob,collections,sys
import os
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from build_lsp import tokens
for f in sorted(glob.glob(os.path.join(HERE, 'src', '*.lsp'))):
    src=open(f,encoding='utf-8').read()
    toks=[t for t in tokens(src) if t[0] not in (1,2,8)]
    # split top-level forms
    depth=0; cur=[]; forms=[]
    for t in toks:
        if t[0]==4: depth+=1
        if depth>0: cur.append(t)
        if t[0]==5:
            depth-=1
            if depth==0: forms.append(cur); cur=[]
    for fm in forms:
        syms=collections.defaultdict(set)
        for t in fm:
            if t[0]==7: syms[t[1].upper()].add(t[1])
        name=fm[2][1] if len(fm)>2 else '?'
        bad={k:v for k,v in syms.items() if len(v)>1}
        if bad: print(f.split('/')[-1], name, bad)
