# -*- coding: utf-8 -*-
"""Мини-интерпретатор AutoLISP (подмножество) для проверки GIP-ЩИТ вне AutoCAD.
Динамическая область видимости, списки как Python-list, точечные пары как DPair, nil = None."""
import math, re, sys

class LispError(Exception):
    pass

class Sym(object):
    __slots__ = ('name',)
    _tab = {}
    def __new__(cls, name):
        name = name.upper()
        s = cls._tab.get(name)
        if s is None:
            s = object.__new__(cls); s.name = name; cls._tab[name] = s
        return s
    def __repr__(self): return self.name

T = Sym('T')
QUOTE = Sym('QUOTE')

class DPair(object):
    __slots__ = ('car', 'cdr')
    def __init__(self, a, d): self.car = a; self.cdr = d
    def __repr__(self): return '(%s . %s)' % (lstr(self.car), lstr(self.cdr))
    def __eq__(self, o): return isinstance(o, DPair) and lequal(self.car, o.car) and lequal(self.cdr, o.cdr)
    def __hash__(self): return id(self)

def nl(x):
    """нормализация пустого списка в nil"""
    if isinstance(x, list) and not x: return None
    return x

# ---------------------------------------------------------------- reader
TOK = re.compile(r'''\s*(?:(;\|.*?\|;)|(;[^\n]*)|("(?:\\.|[^"\\])*")|(\()|(\))|(')|([^\s()'";]+))''', re.S)

def unescape(s):
    out = []; i = 0
    while i < len(s):
        c = s[i]
        if c == '\\' and i + 1 < len(s):
            n = s[i + 1]
            if n == 'n': out.append('\n'); i += 2; continue
            if n == 'r': out.append('\r'); i += 2; continue
            if n == 't': out.append('\t'); i += 2; continue
            if n == 'e': out.append('\x1b'); i += 2; continue
            if n in '01234567' and i + 3 < len(s) + 1 and re.match(r'[0-7]{3}', s[i + 1:i + 4]):
                out.append(chr(int(s[i + 1:i + 4], 8))); i += 4; continue
            out.append(n); i += 2; continue
        out.append(c); i += 1
    return ''.join(out)

NUMRE = re.compile(r'^[-+]?(\d+\.?\d*([eE][-+]?\d+)?|\.\d+([eE][-+]?\d+)?)$')

def atom(tok):
    if NUMRE.match(tok):
        if re.match(r'^[-+]?\d+$', tok):
            return int(tok)
        return float(tok)
    if tok.upper() == 'NIL': return None
    return Sym(tok)

def read_all(src):
    pos = 0; stack = [[]]; quotes = [[]]
    toks = []
    for m in TOK.finditer(src):
        if m.group(1) or m.group(2): continue
        if m.group(3) is not None: toks.append(('s', unescape(m.group(3)[1:-1])))
        elif m.group(4): toks.append(('(', None))
        elif m.group(5): toks.append((')', None))
        elif m.group(6): toks.append(("'", None))
        elif m.group(7) is not None: toks.append(('a', m.group(7)))
    i = 0
    def parse():
        nonlocal i
        kind, v = toks[i]; i += 1
        if kind == 's': return v
        if kind == 'a': return atom(v)
        if kind == "'": return [QUOTE, parse()]
        if kind == '(':
            lst = []
            while True:
                if i >= len(toks): raise LispError('unbalanced (')
                k2, v2 = toks[i]
                if k2 == ')': i += 1; break
                if k2 == 'a' and v2 == '.':
                    i += 1; tail = parse()
                    if toks[i][0] != ')': raise LispError('bad dotted pair')
                    i += 1
                    if tail is None: return nl(lst)
                    if isinstance(tail, list): return lst + tail
                    if len(lst) != 1: raise LispError('dotted list with >1 car unsupported')
                    return DPair(lst[0], tail)
                lst.append(parse())
            return nl(lst)
        raise LispError('unexpected )')
    out = []
    while i < len(toks): out.append(parse())
    return out

# ---------------------------------------------------------------- printing
def lstr(x, princ=False):
    if x is None: return 'nil'
    if x is True: return 'T'
    if isinstance(x, Sym): return x.name
    if isinstance(x, str):
        if princ: return x
        return '"' + x.replace('\\', '\\\\').replace('"', '\\"').replace('\n', '\\n') + '"'
    if isinstance(x, bool): return 'T' if x else 'nil'
    if isinstance(x, int): return str(x)
    if isinstance(x, float): return rtos_auto(x)
    if isinstance(x, list): return '(' + ' '.join(lstr(e, princ) for e in x) + ')'
    if isinstance(x, DPair): return '(' + lstr(x.car, princ) + ' . ' + lstr(x.cdr, princ) + ')'
    return '<%s>' % (x.__class__.__name__,)

def rtos_auto(x):
    s = '%.6g' % x
    if '.' not in s and 'e' not in s: s += '.0'
    return s

def lequal(a, b, fuzz=0.0):
    if isinstance(a, (int, float)) and isinstance(b, (int, float)) and not isinstance(a, bool) and not isinstance(b, bool):
        return abs(a - b) <= fuzz
    if isinstance(a, list) and isinstance(b, list):
        return len(a) == len(b) and all(lequal(x, y, fuzz) for x, y in zip(a, b))
    if isinstance(a, DPair) and isinstance(b, DPair):
        return lequal(a.car, b.car, fuzz) and lequal(a.cdr, b.cdr, fuzz)
    if hasattr(a, 'lisp_equal'): return a.lisp_equal(b)
    return a is b or a == b

# ---------------------------------------------------------------- interpreter
class UFunc(object):
    def __init__(self, name, params, locs, body):
        self.name = name; self.params = params; self.locs = locs; self.body = body
    def __repr__(self): return '<USUBR %s>' % self.name

class Interp(object):
    def __init__(self):
        self.g = {}
        self.out = []
        self.depth = 0
        self.stack = []
        from lispbuiltins import install
        install(self)

    # binding helpers (динамическая область видимости)
    def get(self, s):
        if s is T: return T
        return self.g.get(s.name)
    def set(self, s, v):
        self.g[s.name] = v

    def call(self, f, args):
        if callable(f) and not isinstance(f, UFunc):
            return f(*args)
        if isinstance(f, UFunc):
            if len(args) != len(f.params):
                raise LispError('%s: bad number of args %d/%d' % (f.name, len(args), len(f.params)))
            saved = []
            for p in f.params + f.locs:
                saved.append((p.name, self.g.get(p.name, KeyError)))
            for p in f.locs: self.g[p.name] = None
            for p, a in zip(f.params, args): self.g[p.name] = a
            self.depth += 1
            if self.depth > 400: raise LispError('stack overflow in ' + f.name)
            self.stack.append(f.name)
            try:
                r = None
                for e in f.body: r = self.eval(e)
                self.stack.pop()
                return r
            except LispError as ex:
                if not getattr(ex, 'trace', None): ex.trace = list(self.stack)
                self.stack.pop()
                raise
            finally:
                self.depth -= 1
                for n, v in saved:
                    if v is KeyError: self.g.pop(n, None)
                    else: self.g[n] = v
        if isinstance(f, list) and f and f[0] is Sym('LAMBDA'):
            return self.call(self.make_lambda(f), args)
        if isinstance(f, Sym):
            return self.call(self.fval(f), args)
        raise LispError('bad function: ' + lstr(f))

    def fval(self, s):
        v = self.g.get(s.name)
        if v is None: raise LispError('no function definition: ' + s.name)
        return v

    def make_lambda(self, form):
        params, locs = self.parse_args(form[1])
        return UFunc('LAMBDA', params, locs, form[2:])

    def parse_args(self, al):
        params = []; locs = []; cur = params
        for a in (al or []):
            if a is Sym('/'): cur = locs; continue
            cur.append(a)
        return params, locs

    def eval(self, x):
        if isinstance(x, Sym):
            if x is T: return T
            return self.g.get(x.name)
        if not isinstance(x, list):
            return x
        h = x[0]
        if isinstance(h, Sym):
            n = h.name
            sf = SPECIAL.get(n)
            if sf: return sf(self, x)
            f = self.g.get(n)
            if f is None: raise LispError('no function definition: ' + n)
        elif isinstance(h, list) and h and h[0] is Sym('LAMBDA'):
            f = self.make_lambda(h)
        else:
            f = self.eval(h)
        args = [self.eval(a) for a in x[1:]]
        return self.call(f, args)

    def run(self, src):
        r = None
        for form in read_all(src): r = self.eval(form)
        return r

def truthy(v): return v is not None

def sf_quote(I, x): return x[1]
def sf_setq(I, x):
    v = None
    for i in range(1, len(x), 2):
        v = I.eval(x[i + 1]); I.set(x[i], v)
    return v
def sf_if(I, x):
    if truthy(I.eval(x[1])): return I.eval(x[2])
    return I.eval(x[3]) if len(x) > 3 else None
def sf_cond(I, x):
    for cl in x[1:]:
        v = I.eval(cl[0])
        if truthy(v):
            for e in cl[1:]: v = I.eval(e)
            return v
    return None
def sf_while(I, x):
    r = None
    n = 0
    while truthy(I.eval(x[1])):
        for e in x[2:]: r = I.eval(e)
        n += 1
        if n > 2000000: raise LispError('infinite while?')
    return r
def sf_repeat(I, x):
    n = I.eval(x[1]); r = None
    for _ in range(int(n)):
        for e in x[2:]: r = I.eval(e)
    return r
def sf_foreach(I, x):
    var = x[1]; lst = I.eval(x[2]); r = None
    old = I.g.get(var.name, KeyError)
    try:
        for it in (lst or []):
            I.g[var.name] = it
            for e in x[3:]: r = I.eval(e)
    finally:
        if old is KeyError: I.g.pop(var.name, None)
        else: I.g[var.name] = old
    return r
def sf_progn(I, x):
    r = None
    for e in x[1:]: r = I.eval(e)
    return r
def sf_defun(I, x):
    name = x[1]; params, locs = I.parse_args(x[2])
    body = x[3:]
    # пропускаем строку-описание? (в AutoLISP её нет) — оставляем как есть
    f = UFunc(name.name, params, locs, body)
    I.g[name.name] = f
    return name
def sf_lambda(I, x): return I.make_lambda(x)
def sf_function(I, x):
    v = x[1]
    if isinstance(v, list) and v and v[0] is Sym('LAMBDA'): return I.make_lambda(v)
    return v
def sf_and(I, x):
    for e in x[1:]:
        if not truthy(I.eval(e)): return None
    return T
def sf_or(I, x):
    for e in x[1:]:
        if truthy(I.eval(e)): return T
    return None

SPECIAL = {'QUOTE': sf_quote, 'SETQ': sf_setq, 'IF': sf_if, 'COND': sf_cond, 'WHILE': sf_while,
           'REPEAT': sf_repeat, 'FOREACH': sf_foreach, 'PROGN': sf_progn, 'DEFUN': sf_defun,
           'DEFUN-Q': sf_defun, 'LAMBDA': sf_lambda, 'FUNCTION': sf_function, 'AND': sf_and, 'OR': sf_or}
