# -*- coding: utf-8 -*-
"""Сборка GIP_SHCHIT.lsp: исходники UTF-8 -> ASCII-файл (русские строки как \\U+XXXX, вынесены в глобальные константы),
проверка необъявленных локальных переменных."""
import re, sys, os, json, glob, collections
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, 'emu'))
from lispemu import read_all, Sym

SRC = os.path.join(HERE, 'src')
OUT = os.path.join(HERE, '..', 'dist', 'GIP_SHCHIT.lsp')

TOK = re.compile(r'''(;\|.*?\|;)|(;[^\n]*)|("(?:\\.|[^"\\])*")|(\()|(\))|(')|([^\s()'";]+)|(\s+)''', re.S)

def tokens(src):
    out = []
    for m in TOK.finditer(src):
        k = m.lastindex
        out.append([k, m.group(0), m.start(), m.end()])
    return out

def esc_str(tok):
    """строковый литерал -> ASCII с \\U+XXXX"""
    body = tok[1:-1]; r = []
    for ch in body:
        o = ord(ch)
        if o > 126: r.append('\\\\U+%04X' % o)
        else: r.append(ch)
    return '"' + ''.join(r) + '"'

def nonascii(s): return any(ord(c) > 126 for c in s)

def transform(src, hoist, cache, fname):
    toks = tokens(src)
    # индексы значащих токенов
    sig = [i for i, t in enumerate(toks) if t[0] not in (1, 2, 8)]
    # парные скобки
    match = {}; st = []
    for i in sig:
        if toks[i][0] == 4: st.append(i)
        elif toks[i][0] == 5:
            j = st.pop(); match[j] = i
    pos_in_sig = {i: k for k, i in enumerate(sig)}
    def datum_end(i):
        if toks[i][0] == 4: return match[i]
        return i
    quoted = {}   # start token index of quote -> end token index of datum
    k = 0
    while k < len(sig):
        i = sig[k]
        if toks[i][0] == 6:
            j = sig[k + 1]; e = datum_end(j); quoted[i] = e
            k = pos_in_sig[e] + 1; continue
        if toks[i][0] == 4 and k + 1 < len(sig) and toks[sig[k + 1]][0] == 7 and toks[sig[k + 1]][1].lower() == 'quote':
            e = match[i]; quoted[i] = e
            k = pos_in_sig[e] + 1; continue
        k += 1
    out = []; i = 0
    while i < len(toks):
        t = toks[i]
        if i in quoted:
            e = quoted[i]
            seg = toks[i:e + 1]
            if any(s[0] == 3 and nonascii(s[1]) for s in seg):
                text = ''.join(esc_str(s[1]) if s[0] == 3 else s[1] for s in seg)
                if t[0] == 4:   # (quote X)
                    text = "'" + text[text.lower().index('quote') + 5:].strip()[:-1].strip()
                key = ('Q', text)
                if key not in cache:
                    name = '$Q%d' % (len(cache) + 1); cache[key] = name
                    hoist.append('(setq %s (gip:deep-u %s))' % (name, text))
                out.append(cache[key])
            else:
                out.append(''.join(s[1] for s in seg))
            i = e + 1; continue
        if t[0] == 3 and nonascii(t[1]):
            key = ('S', t[1])
            if key not in cache:
                name = '$S%d' % (len(cache) + 1); cache[key] = name
                hoist.append('(setq %s (gip:u %s))' % (name, esc_str(t[1])))
            out.append(cache[key]); i += 1; continue
        if t[0] == 7 and nonascii(t[1]):
            raise SystemExit('non-ASCII symbol in %s: %s' % (fname, t[1]))
        out.append(t[1]); i += 1
    return ''.join(out)

# ---------------------------------------------------------------- проверка переменных
SPECIAL = {'SETQ'}
def lint(forms, fname, known_globals):
    warns = []
    def walk(x, bound, fn):
        if isinstance(x, list) and x:
            h = x[0]
            if isinstance(h, Sym):
                if h.name == 'SETQ':
                    for k in range(1, len(x), 2):
                        v = x[k]
                        if isinstance(v, Sym) and v.name not in bound and not v.name.startswith('*') and not v.name.startswith('$') and v.name not in known_globals:
                            warns.append('%s: %s sets undeclared %s' % (fname, fn, v.name))
                        if k + 1 < len(x): walk(x[k + 1], bound, fn)
                    return
                if h.name == 'FOREACH':
                    nb = bound | {x[1].name}
                    for e in x[2:]: walk(e, nb, fn)
                    return
                if h.name in ('DEFUN',):
                    al = x[2] or []
                    nb = set(a.name for a in al if isinstance(a, Sym) and a.name != '/')
                    for e in x[3:]: walk(e, nb, x[1].name)
                    return
                if h.name == 'LAMBDA':
                    al = x[1] or []
                    nb = bound | set(a.name for a in al if isinstance(a, Sym) and a.name != '/')
                    for e in x[2:]: walk(e, nb, fn)
                    return
                if h.name == 'QUOTE':
                    v = x[1]
                    if isinstance(v, list) and v and v[0] is Sym('LAMBDA'): walk(v, bound, fn)
                    return
            for e in x: walk(e, bound, fn)
    for f in forms: walk(f, set(), '<top>')
    return warns

def main():
    files = sorted(glob.glob(SRC + '/*.lsp'))
    hoist = []; cache = {}; parts = []
    for f in files:
        src = open(f, encoding='utf-8').read()
        h0 = len(hoist)
        body = transform(src, hoist, cache, os.path.basename(f))
        if os.path.basename(f).startswith('00') and len(hoist) > h0:
            raise SystemExit('00_util must not contain Russian strings')
        parts.append((os.path.basename(f), body))
    data = [open(os.path.join(HERE, 'data', 'gip_protos.lsp'), encoding='utf-8').read(), open(os.path.join(HERE, 'data', 'gip_mdata.lsp'), encoding='utf-8').read()]
    head = ';;; GIP-ЩИТ для AutoCAD 2021–2024 (gipproekt.ru). Строки в коде — ASCII (\\U+XXXX), русский только в комментариях.\n'
    out = [head]
    out.append(parts[0][1])
    out.append('\n;;; ---- строковые константы\n' + '\n'.join(hoist) + '\n')
    for name, body in parts[1:]: out.append(body)
    out += data
    out.append('\n(gip:on-load)\n(princ)\n')
    text = ''.join(out)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    open(OUT, 'w', encoding='utf-8', newline='\r\n').write(text)
    # проверка: вне комментариев только ASCII
    code = ''.join(t[1] for t in tokens(text) if t[0] not in (1, 2))
    bad = [c for c in code if ord(c) > 126]
    print('written', OUT, len(text), 'bytes; hoisted', len(hoist), '; non-ascii outside comments:', len(bad))
    # lint
    known = set()
    forms = read_all(text)
    for f in forms:
        if isinstance(f, list) and f and f[0] is Sym('SETQ'):
            for k in range(1, len(f), 2): known.add(f[k].name)
    for w in lint(forms, 'GIP_SHCHIT', known): print('LINT', w)
    # параметры/локальные, совпадающие с функциями AutoLISP
    from lispemu import Interp, SPECIAL as SF
    I = Interp()
    builtin = set(k for k, v in I.g.items() if callable(v)) | set(SF.keys()) | {'COND', 'LAST', 'FIRST', 'TYPE', 'LIST', 'LENGTH', 'MIN', 'MAX', 'ANGLE', 'DISTANCE', 'REM', 'ABS', 'FIX', 'FLOAT', 'NTH', 'APPEND', 'REVERSE', 'MEMBER', 'ASSOC', 'SUBST', 'STRCAT', 'SUBSTR', 'STRLEN', 'ITOA', 'ATOI', 'ATOF', 'READ', 'EVAL', 'SET', 'POLAR', 'INTERS', 'TRANS', 'OPEN', 'CLOSE', 'COMMAND', 'ENTGET', 'ENTMAKE', 'ENTMOD', 'ENTDEL', 'SSGET', 'GETVAR', 'SETVAR', 'PRINC', 'PRINT', 'ALERT', 'EXP', 'LOG', 'SIN', 'COS', 'ATAN', 'SQRT', 'EXPT', 'GCD', 'BOOLE', 'LOGAND', 'LOGIOR', 'LSH', 'ASCII', 'CHR', 'NOT', 'NULL', 'AND', 'OR', 'IF', 'WHILE', 'REPEAT', 'FOREACH', 'PROGN', 'QUOTE', 'FUNCTION', 'LAMBDA', 'DEFUN', 'SETQ', 'APPLY', 'MAPCAR', 'ATOM', 'LISTP', 'NUMBERP', 'ZEROP', 'MINUSP', 'BOUNDP', 'EQ', 'EQUAL', 'WCMATCH', 'STRCASE', 'RTOS', 'DISTOF', 'ANGTOS', 'ANGTOF', 'GETSTRING', 'GETINT', 'GETREAL', 'GETPOINT', 'INITGET', 'TERPRI', 'PROMPT', 'GRREAD', 'REDRAW', 'TBLSEARCH', 'TBLNEXT', 'HANDENT', 'NAMEDOBJDICT', 'DICTSEARCH', 'DICTADD', 'REGAPP', 'XDROOM', 'XDSIZE', 'TEXTBOX', 'OSNAP', 'FINDFILE', 'LOAD', 'GC', 'QUIT', 'EXIT', 'VER', 'CVUNIT', 'MEM', 'ACAD_STRLSORT', 'ENTNEXT', 'ENTLAST', 'ENTSEL', 'NENTSEL', 'SSNAME', 'SSLENGTH', 'SSADD', 'SSDEL', 'SSMEMB', 'GETENV', 'SETENV', 'STARTAPP', 'TEXTSCR', 'GRAPHSCR', 'MENUCMD', 'MENUGROUP', 'VPORTS', 'TABLET', 'GRDRAW', 'GRVECS', 'GRTEXT', 'GRCLEAR', 'POLAR', 'ANGLE', 'CAR', 'CDR', 'CONS', 'CADR', 'CADDR', 'CDDR'}
    def chk(x):
        if isinstance(x, list) and x:
            if x[0] is Sym('DEFUN') or x[0] is Sym('LAMBDA'):
                al = x[2] if x[0] is Sym('DEFUN') else x[1]
                for a in (al or []):
                    if isinstance(a, Sym) and a.name in builtin and a.name != '/':
                        print('SHADOW', x[1] if x[0] is Sym('DEFUN') else 'lambda', a.name)
            for e in x: chk(e)
    for f in forms: chk(f)

if __name__ == '__main__':
    main()
