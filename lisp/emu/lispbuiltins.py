# -*- coding: utf-8 -*-
import math, re
from lispemu import Sym, T, DPair, LispError, nl, lstr, lequal, UFunc, read_all

def L(x):
    if isinstance(x, list) and not x: return None
    return x

def aslist(x):
    if x is None: return []
    if isinstance(x, list): return x
    raise LispError('bad argument type: listp ' + lstr(x))

def isnum(x): return isinstance(x, (int, float)) and not isinstance(x, bool)

def chknum(*xs):
    for x in xs:
        if not isnum(x): raise LispError('bad argument type: numberp: ' + lstr(x))

def car(x):
    if x is None: return None
    if isinstance(x, list): return x[0]
    if isinstance(x, DPair): return x.car
    raise LispError('bad argument type: consp ' + lstr(x))

def cdr(x):
    if x is None: return None
    if isinstance(x, list): return L(x[1:])
    if isinstance(x, DPair): return x.cdr
    raise LispError('bad argument type: consp ' + lstr(x))

def cxr(path):
    def f(x):
        for c in reversed(path):
            x = car(x) if c == 'a' else cdr(x)
        return x
    return f

def l_plus(*a):
    chknum(*a)
    if not a: return 0
    r = a[0]
    for v in a[1:]: r = r + v
    return r
def l_minus(*a):
    chknum(*a)
    if not a: return 0
    if len(a) == 1: return -a[0]
    r = a[0]
    for v in a[1:]: r = r - v
    return r
def l_times(*a):
    chknum(*a)
    r = 1
    for v in a: r = r * v
    return r
def idiv(a, b):
    if b == 0: raise LispError('divide by zero')
    q = abs(a) // abs(b)
    return q if (a >= 0) == (b >= 0) else -q
def l_div(*a):
    chknum(*a)
    if len(a) == 1: return a[0]
    r = a[0]
    for v in a[1:]:
        if isinstance(r, int) and isinstance(v, int): r = idiv(r, v)
        else:
            if v == 0: raise LispError('divide by zero')
            r = r / v
    return r
def l_rem(a, b, *more):
    chknum(a, b)
    if isinstance(a, int) and isinstance(b, int):
        r = abs(a) % abs(b); return r if a >= 0 else -r
    return math.fmod(a, b)

def cmpchain(op):
    def f(*a):
        for x, y in zip(a, a[1:]):
            if isnum(x) and isnum(y): ok = op(x, y)
            elif isinstance(x, str) and isinstance(y, str): ok = op(x, y)
            else: raise LispError('bad argument type for comparison: ' + lstr(x) + ' ' + lstr(y))
            if not ok: return None
        return T
    return f

def l_eq_num(*a):
    for x, y in zip(a, a[1:]):
        if isnum(x) and isnum(y):
            if x != y: return None
        elif isinstance(x, str) and isinstance(y, str):
            if x != y: return None
        else:
            if x is not y: return None
    return T

def l_neq(a, b):
    return None if l_eq_num(a, b) else T

def l_eq(a, b):
    if isnum(a) and isnum(b): return T if a == b and type(a) == type(b) else None
    if isinstance(a, str) and isinstance(b, str): return T if a == b else None
    return T if a is b else None

def l_equal(a, b, fuzz=0.0): return T if lequal(a, b, fuzz) else None

def l_cons(a, b):
    if b is None: return [a]
    if isinstance(b, list): return [a] + b
    return DPair(a, b)

def l_list(*a): return L(list(a))
def l_append(*a):
    r = []
    for x in a: r += aslist(x)
    return L(r)
def l_length(x):
    if x is None: return 0
    return len(aslist(x))
def l_nth(n, x):
    x = aslist(x)
    return x[n] if 0 <= n < len(x) else None
def l_last(x):
    x = aslist(x); return x[-1] if x else None
def l_reverse(x): return L(list(reversed(aslist(x))))
def l_member(a, x):
    x = aslist(x)
    for i, e in enumerate(x):
        if lequal(a, e): return L(x[i:])
    return None
def l_assoc(k, x):
    for e in aslist(x):
        if e is None: continue
        if lequal(car(e), k): return e
    return None
def l_subst(new, old, x):
    out = []
    for e in aslist(x):
        out.append(new if lequal(e, old) else e)
    return L(out)
def l_vl_remove(a, x): return L([e for e in aslist(x) if not lequal(e, a)])
def l_vl_position(a, x):
    for i, e in enumerate(aslist(x)):
        if lequal(e, a): return i
    return None

def make_install(I):
    def F(f, args): return I.call(f, list(args))
    def mapcar(f, *lists):
        ls = [aslist(l) for l in lists]
        n = min(len(l) for l in ls) if ls else 0
        return L([F(f, [l[i] for l in ls]) for i in range(n)])
    def apply_(f, args): return F(f, aslist(args))
    def remove_if(f, x): return L([e for e in aslist(x) if F(f, [e]) is None])
    def remove_if_not(f, x): return L([e for e in aslist(x) if F(f, [e]) is not None])
    def some(f, *lists):
        ls = [aslist(l) for l in lists]
        n = min(len(l) for l in ls)
        for i in range(n):
            r = F(f, [l[i] for l in ls])
            if r is not None: return r
        return None
    def every(f, *lists):
        ls = [aslist(l) for l in lists]
        n = min(len(l) for l in ls)
        for i in range(n):
            if F(f, [l[i] for l in ls]) is None: return None
        return T
    def member_if(f, x):
        x = aslist(x)
        for i, e in enumerate(x):
            if F(f, [e]) is not None: return L(x[i:])
        return None
    def vl_sort(x, f):
        import functools
        x = aslist(x)
        def cmp(a, b):
            if F(f, [a, b]) is not None: return -1
            if F(f, [b, a]) is not None: return 1
            return 0
        return L(sorted(x, key=functools.cmp_to_key(cmp)))
    def vl_sort_i(x, f):
        import functools
        x = aslist(x)
        idx = list(range(len(x)))
        def cmp(i, j):
            if F(f, [x[i], x[j]]) is not None: return -1
            if F(f, [x[j], x[i]]) is not None: return 1
            return 0
        return L(sorted(idx, key=functools.cmp_to_key(cmp)))
    def catch_all(f, args=None):
        try:
            return F(f, aslist(args))
        except LispError as e:
            return CatchErr(str(e))
        except ZeroDivisionError as e:
            return CatchErr('divide by zero')
    def l_eval(x): return I.eval(x)
    def l_set(s, v): I.set(s, v); return v
    def boundp(s): return T if I.g.get(s.name) is not None else None
    def l_read(s):
        if s is None or s == '': return None
        r = read_all(s)
        return r[0] if r else None
    def princ(x=None, f=None):
        if f is not None and hasattr(f, 'write'): f.write(lstr(x, True)); return x
        I.out.append(lstr(x, True)); return x
    def prin1(x=None, f=None):
        if f is not None and hasattr(f, 'write'): f.write(lstr(x)); return x
        I.out.append(lstr(x)); return x
    def terpri(): I.out.append('\n'); return None
    def prompt(s): I.out.append(s); return None
    def alert(s): I.out.append('[ALERT] ' + s + '\n'); return None
    def l_exit(): raise LispError('quit / exit abort')
    def vl_exit_with_error(m): raise LispError(m)
    d = {
        'MAPCAR': mapcar, 'APPLY': apply_, 'VL-REMOVE-IF': remove_if, 'VL-REMOVE-IF-NOT': remove_if_not,
        'VL-SOME': some, 'VL-EVERY': every, 'VL-MEMBER-IF': member_if, 'VL-SORT': vl_sort, 'VL-SORT-I': vl_sort_i,
        'VL-CATCH-ALL-APPLY': catch_all, 'EVAL': l_eval, 'SET': l_set, 'BOUNDP': boundp, 'READ': l_read,
        'PRINC': princ, 'PRIN1': prin1, 'PRINT': prin1, 'TERPRI': terpri, 'PROMPT': prompt, 'ALERT': alert,
        'EXIT': l_exit, 'QUIT': l_exit, 'VL-EXIT-WITH-ERROR': vl_exit_with_error,
    }
    return d

class CatchErr(object):
    def __init__(self, m): self.msg = m
    def __repr__(self): return '<catch-all-apply-error %s>' % self.msg

def l_type(x):
    if x is None: return None
    if isinstance(x, bool): return Sym('SYM')
    if isinstance(x, int): return Sym('INT')
    if isinstance(x, float): return Sym('REAL')
    if isinstance(x, str): return Sym('STR')
    if isinstance(x, (list, DPair)): return Sym('LIST')
    if isinstance(x, Sym): return Sym('SYM')
    if isinstance(x, UFunc): return Sym('USUBR')
    if callable(x): return Sym('SUBR')
    return Sym(getattr(x, 'lisp_type', 'VLA-OBJECT'))

def l_substr(s, start, n=None):
    i = start - 1
    if i < 0: raise LispError('substr bad start')
    return s[i:] if n is None else s[i:i + n]

def l_strcase(s, lower=None): return s.lower() if lower is not None else s.upper()

def l_search(pat, s, start=0):
    i = s.find(pat, start)
    return None if i < 0 else i

def l_strsubst(new, pat, s, start=0):
    i = s.find(pat, start)
    if i < 0: return s
    return s[:i] + new + s[i + len(pat):]

def trimset(chars, s, side):
    if side == 'b': return s.strip(chars)
    if side == 'l': return s.lstrip(chars)
    return s.rstrip(chars)

def l_itoa(n):
    if not isinstance(n, int): raise LispError('bad argument type: fixnump ' + lstr(n))
    return str(n)

def l_atoi(s):
    m = re.match(r'\s*[-+]?\d+', s)
    return int(m.group(0)) if m else 0

def l_atof(s):
    m = re.match(r'\s*[-+]?(\d+\.?\d*([eE][-+]?\d+)?|\.\d+)', s)
    return float(m.group(0)) if m else 0.0

def l_distof(s, mode=None):
    try: return float(s.replace(',', '.')) if re.match(r'^\s*[-+]?(\d+\.?\d*|\.\d+)\s*$', s.replace(',', '.')) and ',' not in s else None
    except Exception: return None

def l_rtos(x, mode=2, prec=4):
    chknum(x)
    s = ('%.' + str(prec) + 'f') % x
    # DIMZIN по умолчанию 8 в шаблонах ГИП? в AutoCAD rtos учитывает DIMZIN; считаем, что хвостовые нули не режутся
    return s

def l_ascii(s): return ord(s[0]) if s else 0
def l_chr(n): return chr(n)

def l_fix(x): chknum(x); return int(math.trunc(x))
def l_float(x): chknum(x); return float(x)
def l_abs(x): chknum(x); return abs(x)
def l_min(*a):
    chknum(*a); r = min(a)
    return float(r) if any(isinstance(v, float) for v in a) else r
def l_max(*a):
    chknum(*a); r = max(a)
    return float(r) if any(isinstance(v, float) for v in a) else r
def l_expt(a, b):
    chknum(a, b)
    if isinstance(a, int) and isinstance(b, int) and b >= 0: return a ** b
    return float(a) ** b

def l_atan(y, x=None):
    if x is None: return math.atan(y)
    return math.atan2(y, x)

def l_polar(p, a, d):
    p = aslist(p)
    r = [p[0] + d * math.cos(a), p[1] + d * math.sin(a)]
    if len(p) > 2: r.append(p[2])
    return r
def l_distance(a, b):
    a = aslist(a); b = aslist(b)
    return math.sqrt(sum((x - y) ** 2 for x, y in zip(a, b)))
def l_angle(a, b):
    a = aslist(a); b = aslist(b)
    ang = math.atan2(b[1] - a[1], b[0] - a[0])
    return ang if ang >= 0 else ang + 2 * math.pi

def wcmatch(s, pat):
    for alt in split_alts(pat):
        neg = False
        if alt.startswith('~'): neg = True; alt = alt[1:]
        rx = ''
        i = 0
        while i < len(alt):
            c = alt[i]
            if c == '*': rx += '.*'
            elif c == '?': rx += '.'
            elif c == '#': rx += r'\d'
            elif c == '@': rx += r'[^\W\d_]'
            elif c == '.': rx += r'[^\w]'
            elif c == '`' and i + 1 < len(alt): i += 1; rx += re.escape(alt[i])
            elif c == '[':
                j = alt.index(']', i + 1); body = alt[i + 1:j]
                if body.startswith('~'): rx += '[^' + re.escape(body[1:]) + ']'
                else: rx += '[' + body.replace('\\', '\\\\') + ']'
                i = j
            else: rx += re.escape(c)
            i += 1
        ok = re.match('^' + rx + '$', s, re.S | re.I) is not None
        if ok != neg: return T
    return None

def split_alts(p):
    out = []; cur = ''; i = 0
    while i < len(p):
        if p[i] == '`' and i + 1 < len(p): cur += p[i:i + 2]; i += 2; continue
        if p[i] == ',': out.append(cur); cur = ''; i += 1; continue
        cur += p[i]; i += 1
    out.append(cur); return out

def l_logand(*a):
    r = -1
    for v in a: r &= v
    return r
def l_logior(*a):
    r = 0
    for v in a: r |= v
    return r
def l_lsh(a, n): return (a << n) if n >= 0 else (a >> -n)

def l_vl_list_star(*a):
    if len(a) == 1: return a[0]
    last = a[-1]
    if last is None or isinstance(last, list): return L(list(a[:-1]) + aslist(last))
    if len(a) == 2: return DPair(a[0], last)
    raise LispError('vl-list* improper unsupported')

def install(I):
    g = I.g
    base = {
        '+': l_plus, '-': l_minus, '*': l_times, '/': l_div, 'REM': l_rem, '1+': lambda x: l_plus(x, 1), '1-': lambda x: l_minus(x, 1),
        '=': l_eq_num, '/=': l_neq, '<': cmpchain(lambda a, b: a < b), '>': cmpchain(lambda a, b: a > b),
        '<=': cmpchain(lambda a, b: a <= b), '>=': cmpchain(lambda a, b: a >= b),
        'EQ': l_eq, 'EQUAL': l_equal, 'NOT': lambda x: T if x is None else None, 'NULL': lambda x: T if x is None else None,
        'ZEROP': lambda x: T if x == 0 else None, 'MINUSP': lambda x: T if x < 0 else None,
        'NUMBERP': lambda x: T if isnum(x) else None, 'LISTP': lambda x: T if (x is None or isinstance(x, (list, DPair))) else None,
        'ATOM': lambda x: None if isinstance(x, (list, DPair)) else T, 'VL-CONSP': lambda x: T if isinstance(x, (list, DPair)) else None,
        'VL-SYMBOLP': lambda x: T if isinstance(x, Sym) else None, 'VL-SYMBOL-NAME': lambda s: s.name,
        'VL-STRINGP': lambda x: T if isinstance(x, str) else None,
        'CAR': car, 'CDR': cdr, 'CONS': l_cons, 'LIST': l_list, 'APPEND': l_append, 'LENGTH': l_length, 'NTH': l_nth,
        'LAST': l_last, 'REVERSE': l_reverse, 'MEMBER': l_member, 'ASSOC': l_assoc, 'SUBST': l_subst, 'VL-REMOVE': l_vl_remove,
        'VL-POSITION': l_vl_position, 'VL-LIST*': l_vl_list_star, 'VL-LIST-LENGTH': l_length,
        'TYPE': l_type, 'STRCAT': lambda *a: ''.join(a), 'STRLEN': lambda *a: sum(len(x) for x in a), 'SUBSTR': l_substr,
        'STRCASE': l_strcase, 'VL-STRING-SEARCH': l_search, 'VL-STRING-SUBST': l_strsubst,
        'VL-STRING-TRIM': lambda c, s: trimset(c, s, 'b'), 'VL-STRING-LEFT-TRIM': lambda c, s: trimset(c, s, 'l'),
        'VL-STRING-RIGHT-TRIM': lambda c, s: trimset(c, s, 'r'),
        'VL-STRING->LIST': lambda s: L([ord(c) for c in s]), 'VL-LIST->STRING': lambda l: ''.join(chr(c) for c in aslist(l)),
        'VL-STRING-TRANSLATE': lambda src, dst, s: ''.join(dst[src.index(c)] if c in src else c for c in s),
        'VL-PRIN1-TO-STRING': lambda x: lstr(x), 'VL-PRINC-TO-STRING': lambda x: lstr(x, True),
        'ITOA': l_itoa, 'ATOI': l_atoi, 'ATOF': l_atof, 'RTOS': l_rtos, 'DISTOF': l_distof, 'ASCII': l_ascii, 'CHR': l_chr,
        'FIX': l_fix, 'FLOAT': l_float, 'ABS': l_abs, 'MIN': l_min, 'MAX': l_max, 'EXPT': l_expt, 'SQRT': lambda x: math.sqrt(x),
        'SIN': math.sin, 'COS': math.cos, 'ATAN': l_atan, 'EXP': math.exp, 'LOG': math.log,
        'POLAR': l_polar, 'DISTANCE': l_distance, 'ANGLE': l_angle, 'WCMATCH': wcmatch,
        'LOGAND': l_logand, 'LOGIOR': l_logior, 'LSH': l_lsh, 'GC': lambda: None, 'VL-LOAD-COM': lambda: None,
        'VL-CATCH-ALL-ERROR-P': lambda x: T if x.__class__.__name__ == 'CatchErr' else None,
        'VL-CATCH-ALL-ERROR-MESSAGE': lambda x: x.msg,
        'VL-STRING-POSITION': lambda ch, s, start=0, rev=None: (lambda i: None if i < 0 else i)((s.rfind(chr(ch)) if rev is not None else s.find(chr(ch), start))),
    }
    for path in ['aa', 'ad', 'da', 'dd', 'aaa', 'aad', 'ada', 'add', 'daa', 'dad', 'dda', 'ddd', 'addd', 'dddd', 'aadd', 'adda']:
        base['C' + path.upper() + 'R'] = cxr(path)
    base.update(make_install(I))
    for k, v in base.items(): g[k] = v
    g['PI'] = math.pi
