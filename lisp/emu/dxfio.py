import re,collections
HREF=set(list(range(320,370))+list(range(390,400))+[480,481,1005])
def load(path):
    raw=open(path,'rb').read().decode('utf-8')
    lines=raw.split('\r\n') if '\r\n' in raw else raw.split('\n')
    pairs=[]
    for i in range(0,len(lines)-1,2):
        pairs.append([int(lines[i].strip()),lines[i+1]])
    return pairs
def sections(pairs):
    secs=collections.OrderedDict(); i=0
    while i<len(pairs):
        c,v=pairs[i]
        if c==0 and v=='SECTION':
            name=pairs[i+1][1]; j=i+2; body=[]
            while not(pairs[j][0]==0 and pairs[j][1]=='ENDSEC'): body.append(pairs[j]); j+=1
            secs[name]=body; i=j
        i+=1
    return secs
def records(body):
    out=[];cur=None
    for p in body:
        if p[0]==0: cur=[p]; out.append(cur)
        else: cur.append(p)
    return out
def own(rec):
    for c,v in rec[1:]:
        if c in (5,105): return v
        if c==0: break
    return None
def owner(rec):
    ingrp=False
    for c,v in rec:
        if c==102: ingrp = v.startswith('{'); continue
        if c==330 and not ingrp: return v
    return None
def xdicts(rec):
    out=[];grp=None
    for c,v in rec:
        if c==102: grp=v if v.startswith('{') else None; continue
        if c==360 and grp=='{ACAD_XDICTIONARY': out.append(v)
    return out
def g(rec,code,d=None):
    for c,v in rec:
        if c==code: return v
    return d
def dump(recs):
    out=[]
    for r in recs:
        for c,v in r: out.append('%3d'%c if c<1000 else str(c)); out.append(v)
    return '\r\n'.join(out)+'\r\n'
