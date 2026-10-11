"""Records a run of the user's code as a diff-encoded heap trace (index: Raw trace)."""

import json
import sys
import time
import types
from collections import deque
from itertools import islice
from operator import is_

from sortedcontainers import SortedList, SortedSet

import lv_nodes

FILE = '<solution>'
ITEMS = 200
GRID_ROWS = 30
GRID_COLS = 30
LIST_NODES = 200
TREE_NODES = 127
STR_VALUE = 200
TEXT = 100
MSG = 200
KEY_EVERY = 1000


class CapStop(BaseException):
    """Raised from the trace function to end a run at a cap. User code's `except Exception` doesn't catch it."""

    def __init__(self, cap):
        super().__init__(cap)
        self.cap = cap


def hidden(v):
    return callable(v) or isinstance(v, types.ModuleType)


def is_prim(v):
    return v is None or isinstance(v, (bool, int, float, str))


def num(v):
    """None, a bool, an int or a float in Python literal syntax."""
    if v is None:
        return 'None'
    if v is True:
        return 'True'
    if v is False:
        return 'False'
    if isinstance(v, int):
        try:
            return str(int(v))
        except ValueError:  # longer than sys.get_int_max_str_digits()
            return '<int>'
    return repr(float(v))


def quote(s):
    return json.dumps(s, ensure_ascii=False)


def same(a, b):
    return len(a) == len(b) and all(map(is_, a, b))


class Frame:
    __slots__ = ('frame', 'fid', 'fn', 'names', 'cells', 'vals')

    def __init__(self, frame, fid):
        code = frame.f_code
        self.frame = frame
        self.fid = fid
        self.fn = code.co_qualname
        self.names = list(code.co_varnames) + [n for n in code.co_cellvars if n not in code.co_varnames] + list(code.co_freevars)
        self.cells = code.co_cellvars
        self.vals = {}  # name -> (object, RVal) as last sent


class Recorder:
    def __init__(self, caps):
        self.caps = caps
        self.ids = {}       # id(object) -> encoder id
        self.pins = []      # every encoded object, alive for the whole run so id() is never reused
        self.memo = {}      # encoder id -> (depth, signature or None, entry, kids)
        self.sent = {}      # encoder id -> the entry the trace holds for it
        self.frames = []    # user frames on the stack, outermost first
        self.parts = []     # one JSON text per recorded step
        self.size = 0
        self.truncated = False
        self.roots = []     # the entry call's arguments, walked every step
        self.raised = {}    # id(exception) -> (index, line) of its first exception step
        self.excs = []      # those exceptions, kept alive
        self.fid = 0
        self.t0 = 0.0
        self.stop = None    # the cap that ended the run, even if user code swallowed the CapStop

    # --- running -------------------------------------------------------------------------------

    def run(self, thunk):
        self.t0 = time.perf_counter()
        sys.settrace(self._global)
        try:
            out = thunk()
        except CapStop:
            raise
        except BaseException:
            if self.stop:
                raise CapStop(self.stop) from None
            raise
        finally:
            sys.settrace(None)
        if self.stop:
            raise CapStop(self.stop)
        return out

    def _global(self, frame, ev, arg):
        if frame.f_code.co_filename != FILE:
            return None
        self.on(frame, 'call', arg)
        return self._local

    def _local(self, frame, ev, arg):
        if ev != 'call':
            self.on(frame, ev, arg)
        return self._local

    def raise_line(self, e):
        """Drop the steps after `e` was first raised (its unwinding); return that step's line, or None."""
        hit = self.raised.get(id(e))
        if hit is None:
            return None
        del self.parts[hit[0] + 1:]
        return hit[1]

    # --- one step ------------------------------------------------------------------------------

    def on(self, frame, ev, arg):
        if len(self.parts) >= self.caps['steps']:
            self.stop = 'steps'
            raise CapStop('steps')
        if time.perf_counter() - self.t0 > self.caps['ms'] / 1000:
            self.stop = 'time'
            raise CapStop('time')
        line = frame.f_lineno or 0
        f = None if ev == 'call' else self.find(frame)
        push = f is None
        if push:
            self.fid += 1
            f = Frame(frame, self.fid)
            self.frames.append(f)
        rec = {'line': line, 'ev': ev, 'depth': len(self.frames)}
        fd = []
        d = self.delta(f, self.read(f))
        if d and not push:
            fd.append(d)
        for g in self.frames:
            if g is not f and g.cells:
                d = self.delta(g, self.read(g, g.cells), g.cells)
                if d:
                    fd.append(d)
        extra = []
        if ev == 'return':
            rec['pop'] = 1
            rec['ret'] = self.local(arg, extra)
        elif ev == 'exception':
            e = arg[1]
            rec['exc'] = [type(e).__name__, self.msg(e)]
            if id(e) not in self.raised:
                self.raised[id(e)] = (len(self.parts), line)
                self.excs.append(e)
        seen = self.walk(self.root_list() + extra)
        if len(self.parts) % KEY_EVERY == 0:
            rec['k'] = 1
            rec['stack'] = [self.frame_json(g) for g in self.frames]
            rec['heap'] = {str(i): e for i, (_, e) in seen.items()}
            self.sent = {i: e for i, (_, e) in seen.items()}
        else:
            if push:
                rec['push'] = self.frame_json(f)
            if fd:
                rec['fd'] = fd
            dh = {}
            for i, (_, e) in seen.items():
                if self.sent.get(i) != e:
                    dh[str(i)] = e
                    self.sent[i] = e
            if dh:
                rec['dh'] = dh
        text = json.dumps(rec, ensure_ascii=True, separators=(',', ':'))
        if self.size + len(text) + 1 > self.caps['bytes']:
            self.stop = 'size'
            raise CapStop('size')
        self.parts.append(text)
        self.size += len(text) + 1
        if ev == 'return':
            self.frames.pop()

    def find(self, frame):
        """The stack entry for frame, dropping any frames above it; None when it is not on the stack."""
        for i in range(len(self.frames) - 1, -1, -1):
            if self.frames[i].frame is frame:
                del self.frames[i + 1:]
                return self.frames[i]
        return None

    def read(self, f, names=None):
        """The frame's bound locals (or only `names`), without callables and modules, in f_locals order."""
        loc = f.frame.f_locals
        items = loc.items() if names is None else ((n, loc[n]) for n in names if n in loc)
        return {k: v for k, v in items if not hidden(v)}

    def delta(self, f, cur, only=None):
        """Bring f.vals up to date with cur; return the frame delta, or None when nothing changed."""
        put, gone = {}, []
        for k, v in cur.items():
            old = f.vals.get(k)
            if old is not None and old[0] is v:
                continue
            rv = self.local(v, [])
            f.vals[k] = (v, rv)
            if old is None or old[1] != rv:
                put[k] = rv
        for k in [n for n in (f.vals if only is None else only) if n in f.vals and n not in cur]:
            del f.vals[k]
            gone.append(k)
        if not put and not gone:
            return None
        d = {'fid': f.fid}
        if put:
            d['set'] = put
        if gone:
            d['del'] = gone
        return d

    def frame_json(self, f):
        return {'fid': f.fid, 'fn': f.fn, 'names': f.names, 'locals': {k: rv for k, (_, rv) in f.vals.items()}}

    def root_list(self):
        roots = [(v, 0) for f in self.frames for v, _ in f.vals.values() if not is_prim(v)]
        roots.extend((v, 0) for v in self.roots if not is_prim(v))
        return roots

    def msg(self, e):
        try:
            return str(e)[:MSG]
        except Exception:
            return ''

    # --- the heap ------------------------------------------------------------------------------

    def pin(self, v):
        i = self.ids.get(id(v))
        if i is None:
            i = self.ids[id(v)] = len(self.pins) + 1
            self.pins.append(v)
        return i

    def ref(self, v, depth, kids):
        kids.append((v, depth))
        return ['R', self.pin(v)]

    def local(self, v, kids):
        """The RVal of a local, a return value or a root: objects are depth-0 references."""
        if isinstance(v, str):
            return self.value_str(v)
        if is_prim(v):
            return num(v)
        return self.ref(v, 0, kids)

    def value_str(self, s):
        if len(s) > STR_VALUE:
            self.truncated = True
            s = s[:STR_VALUE]
        return quote(s)

    def item_str(self, s):
        if len(s) > TEXT:
            self.truncated = True
            s = s[:TEXT - 1] + '…'
        return quote(s)

    def walk(self, roots):
        """Visit everything reachable from roots, breadth first: encoder id -> (depth, entry)."""
        seen = {}
        q = deque(roots)
        nodes = {'LNODE': 0, 'TNODE': 0}
        while q:
            v, depth = q.popleft()
            i = self.pin(v)
            was = seen.get(i)
            if was is not None and was[0] <= depth:
                continue
            tag = lv_nodes.TAGS.get(type(v))
            if tag and was is None:
                nodes[tag] += 1
                if nodes[tag] > (LIST_NODES if tag == 'LNODE' else TREE_NODES):
                    self.truncated = True
                    continue
            entry, kids = self.visit(v, i, depth)
            seen[i] = (depth, entry)
            q.extend(kids)
        return seen

    def visit(self, v, i, depth):
        """The object's entry, re-encoded only when its shallow contents changed."""
        m = self.memo.get(i)
        sig = self.sig(v)
        if m is not None and m[0] == depth and m[1] is not None and sig is not None and same(m[1], sig):
            return m[2], m[3]
        entry, kids, deep = self.encode(v, depth)
        self.memo[i] = (depth, None if deep else sig, entry, kids)
        return entry, kids

    def sig(self, v):
        """The objects an entry is made of, compared by identity; None when it can't be compared that way."""
        tag = lv_nodes.TAGS.get(type(v))
        if tag == 'LNODE':
            return [v.val, v.next]
        if tag == 'TNODE':
            return [v.val, v.left, v.right]
        # Trailing bools are identity-safe overflow markers: growing past a cap must invalidate the entry.
        if isinstance(v, list):
            sig = v[:ITEMS]
            wide = bool(sig) and all(isinstance(x, list) for x in sig) and any(len(x) > GRID_COLS for x in sig[:GRID_ROWS])
            sig.append(len(v) > ITEMS)
            sig.append(wide)
            return sig
        if isinstance(v, dict):
            return [x for kv in islice(v.items(), ITEMS) for x in kv] + [len(v) > ITEMS]
        if isinstance(v, (tuple, set, frozenset, deque, SortedList, SortedSet)):
            return list(islice(v, ITEMS)) + [len(v) > ITEMS]
        d = getattr(v, '__dict__', None)
        if isinstance(d, dict):
            return [x for kv in islice(d.items(), ITEMS) for x in kv] + [len(d) > ITEMS]
        return None

    def encode(self, v, depth):
        """(entry, kids, deep): kids are the referenced objects to visit; deep means it holds inline text of objects."""
        kids = []
        deep = False

        def item(x, row):
            nonlocal deep
            if isinstance(x, str):
                return self.item_str(x)
            if is_prim(x):
                return num(x)
            if type(x) in lv_nodes.TAGS:
                return self.ref(x, depth, kids)
            if row and isinstance(x, list) and depth <= 1:
                return self.ref(x, depth + 1, kids)
            deep = True
            return self.text(x)

        def field(x):
            nonlocal deep
            if isinstance(x, str):
                return self.value_str(x)
            if is_prim(x):
                return num(x)
            if type(x) in lv_nodes.TAGS:
                return self.ref(x, depth, kids)
            if depth == 0:
                return self.ref(x, 1, kids)
            deep = True
            return self.text(x)

        tag = lv_nodes.TAGS.get(type(v))
        if tag == 'LNODE':
            return ['LNODE', item(v.val, False), item(v.next, False)], kids, deep
        if tag == 'TNODE':
            return ['TNODE', item(v.val, False), item(v.left, False), item(v.right, False)], kids, deep
        if isinstance(v, (list, SortedList)):
            items = list(islice(v, ITEMS))
            row = isinstance(v, list)
            if row and items and all(isinstance(x, list) for x in items):
                if any(len(x) > GRID_COLS for x in items[:GRID_ROWS]):
                    self.truncated = True
                items = items[:GRID_ROWS]
            entry = ['LIST', *[item(x, row) for x in items]]
        elif isinstance(v, tuple):
            items = v[:ITEMS]
            entry = ['TUPLE', *[item(x, False) for x in items]]
        elif isinstance(v, dict):
            items = list(islice(v.items(), ITEMS))
            entry = ['DICT', *[[item(k, False), item(x, False)] for k, x in items]]
        elif isinstance(v, (set, frozenset, SortedSet)):
            items = list(islice(v, ITEMS))
            entry = ['SET', *[item(x, False) for x in items]]
        elif isinstance(v, deque):
            items = list(islice(v, ITEMS))
            entry = ['DEQUE', *[item(x, False) for x in items]]
        else:
            d = getattr(v, '__dict__', None)
            if not isinstance(d, dict):
                return ['OBJ', type(v).__name__, [], self.cut(self.repr_text(v))], kids, True
            fields = [[k, field(x)] for k, x in islice(d.items(), ITEMS) if not hidden(x)]
            if len(d) > ITEMS:
                self.truncated = True
            return ['OBJ', type(v).__name__, fields], kids, deep
        if len(v) > len(items):
            self.truncated = True
        return entry, kids, deep

    # --- inline text ---------------------------------------------------------------------------

    def cut(self, t):
        if len(t) > TEXT:
            self.truncated = True
            t = t[:TEXT - 1] + '…'
        return t

    def text(self, v):
        """A value's inline text: one level of items, deeper ones abbreviated, cut at TEXT characters."""
        return self.cut(self._text(v, True))

    def _text(self, v, top):
        if isinstance(v, str):
            return quote(v[:TEXT])
        if is_prim(v):
            return num(v)
        tag = lv_nodes.TAGS.get(type(v))
        if tag:
            return ('ListNode(' if tag == 'LNODE' else 'TreeNode(') + self._text(v.val, False) + ')'
        if isinstance(v, dict):
            a, b, items = '{', '}', v.items()
        elif isinstance(v, (list, SortedList)):
            a, b, items = '[', ']', v
        elif isinstance(v, tuple):
            a, b, items = '(', ')', v
        elif isinstance(v, (set, frozenset, SortedSet)):
            a, b, items = '{', '}', v
        elif isinstance(v, deque):
            a, b, items = 'deque([', '])', v
        else:
            return self._obj_text(v, top)
        if not len(v):
            return 'set()' if a == '{' and not isinstance(v, dict) else a + b
        if not top:
            return a + '…' + b
        parts, size = [], 0
        for x in items:
            p = self._text(x[0], False) + ': ' + self._text(x[1], False) if a == '{' and isinstance(v, dict) else self._text(x, False)
            parts.append(p)
            size += len(p) + 2
            if size > TEXT:
                break
        if isinstance(v, tuple) and len(v) == 1:
            return '(' + parts[0] + ',)'
        return a + ', '.join(parts) + b

    def _obj_text(self, v, top):
        d = getattr(v, '__dict__', None)
        if not isinstance(d, dict):
            return self.repr_text(v)
        name = type(v).__name__
        fields = [(k, x) for k, x in d.items() if not hidden(x)]
        if not top:
            return name + ('(…)' if fields else '()')
        parts = [k + '=' + self._text(x, False) for k, x in fields[:4]]
        if len(fields) > 4:
            parts.append('…')
        return name + '(' + ', '.join(parts) + ')'

    def repr_text(self, v):
        try:
            r = repr(v)
        except Exception:
            r = '<'
        return '<' + type(v).__name__ + '>' if r.startswith('<') else r
