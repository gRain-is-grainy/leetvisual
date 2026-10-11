"""The worker's entry point: run(job_json) returns the raw trace as JSON (index: Python harness)."""

import ast
import builtins
import json
import sys

import lv_adapters
import lv_args
import lv_facts
import lv_nodes
import lv_trace

# LeetCode's prelude in its order (research.md §5.10), then the deliberate superset.
MODULES = ['string', 're', 'datetime', 'collections', 'heapq', 'bisect', 'copy', 'math', 'random',
           'statistics', 'itertools', 'functools', 'operator', 'io', 'sys', 'json']
PRELUDE = '\n'.join(
    [f'from {m} import *' for m in MODULES]
    + ['from builtins import *']
    + [f'import {m}' for m in MODULES]
    + ['from lv_nodes import ListNode, TreeNode, NestedInteger',
       'from typing import *',
       'import array',
       'from sortedcontainers import SortedList, SortedDict, SortedSet']
)
PRELUDE_CODE = compile(PRELUDE, '<prelude>', 'exec')
RECURSION = sys.getrecursionlimit()


def fresh_globals():
    """A new namespace for one run, with the prelude already run into it."""
    g = {'__name__': '__main__', '__builtins__': builtins}
    exec(PRELUDE_CODE, g)
    return g


class Stop(Exception):
    """Ends a run before or without tracing, with this end record and no steps."""

    def __init__(self, end):
        super().__init__(end['kind'])
        self.end = end


def run(job_json):
    job = json.loads(job_json)
    sys.setrecursionlimit(RECURSION)  # a previous run may have changed it
    rec = lv_trace.Recorder(job['caps'])
    g = fresh_globals()
    try:
        return _run(job, rec, g)
    except Stop as s:
        return _dump(lv_trace.Recorder(job['caps']), s.end, {}, {'lists': [], 'trees': [], 'args': []}, None)
    finally:
        lv_nodes.unlink_all()
        g.clear()


def _run(job, rec, g):
    code = job['code']
    meta = job.get('meta') or {}
    inputs = job.get('inputs') or []
    try:
        compiled = compile(code, lv_trace.FILE, 'exec')
        tree = ast.parse(code)
    except SyntaxError as e:
        raise Stop({'kind': 'syntax', 'msg': e.msg or 'invalid syntax', 'line': e.lineno or 0, 'col': e.offset or 0})
    facts = lv_facts.facts(tree)
    adapter = lv_adapters.ADAPTERS.get(job['slug'])
    outputs = None

    if adapter:
        values = _values(adapter['params'], inputs)
        args, names = _built(lambda: lv_adapters.prepare(adapter, values, g))
        _exec(compiled, g)
        thunk = _safe(lambda: lv_adapters.call(adapter, g, args))
        void = False
    elif meta.get('classname'):
        params = [p['name'] for p in meta.get('params') or []][:2] or ['inputs', 'inputs']
        values = _values(params, inputs)
        calls = _built(lambda: _design_calls(meta, values, params[0]))
        args, names = [], []
        _exec(compiled, g)
        cls = _safe(lambda: _global(g, meta['classname']))
        outputs = []
        thunk = _design(cls, calls, outputs, rec)
        void = True
    else:
        name, names, types, void = _signature(tree, meta)
        values = _values(names, inputs)
        args = _built(lambda: [lv_args.build(t, v, n) for t, v, n in zip(types, values, names)])
        _exec(compiled, g)
        method = _safe(lambda: getattr(_global(g, 'Solution')(), name))
        thunk = lambda: method(*args)  # noqa: E731

    rec.roots = args
    try:
        value = rec.run(thunk)
        end = {'kind': 'return'} if void else {'kind': 'return', 'value': rec.local(value, [])}
    except lv_trace.CapStop as c:
        end = {'kind': 'cap', 'cap': c.cap}
    except BaseException as e:  # noqa: BLE001 - whatever the user's code raises ends the run
        end = _exception(e, rec.raise_line(e))
    entry = {'lists': _named(names, args, 'LNODE'), 'trees': _named(names, args, 'TNODE'),
             'args': [rec.local(a, []) for a in args]}
    return _dump(rec, end, facts, entry, outputs)


def _values(names, inputs):
    """Each named input's JSON value, in order; a missing or malformed one ends the run with `input`."""
    out = []
    for i, name in enumerate(names):
        if i >= len(inputs):
            raise Stop({'kind': 'input', 'param': name})
        out.append(_built(lambda: lv_args.parse(inputs[i], name)))
    return out


def _built(make):
    try:
        return make()
    except lv_args.InputError as e:
        raise Stop({'kind': 'input', 'param': e.param})


def _exec(compiled, g):
    """Run the user's module body, untraced: it defines their classes and functions."""
    try:
        exec(compiled, g)
    except BaseException as e:  # noqa: BLE001
        raise Stop(_exception(e, None))


def _safe(make):
    """Look up the entry; a missing class or method ends the run as an exception with no user line."""
    try:
        return make()
    except BaseException as e:  # noqa: BLE001
        raise Stop(_exception(e, None))


def _global(g, name):
    if name not in g:
        raise NameError(f"name '{name}' is not defined")
    return g[name]


def _exception(e, line):
    """The exception end; without a recorded line, the traceback's last line in the user's code, else 0."""
    if line is None:
        line = 0
        tb = e.__traceback__
        while tb is not None:
            if tb.tb_frame.f_code.co_filename == lv_trace.FILE:
                line = tb.tb_lineno
            tb = tb.tb_next
    try:
        msg = str(e)[:lv_trace.MSG]
    except Exception:  # noqa: BLE001
        msg = ''
    return {'kind': 'exception', 'type': type(e).__name__, 'msg': msg, 'line': line}


def _signature(tree, meta):
    """(method name, parameter names, type strings, void) of a function problem's entry (spec §4.2 rules 2, 4, 5)."""
    if meta.get('name'):
        params = meta.get('params') or []
        names = [p['name'] for p in params]
        if meta.get('manual'):
            found = lv_facts.method(tree, 'Solution', meta['name'])
            if found is None or found[1] != names:
                raise Stop({'kind': 'unsupported'})
        void = (meta.get('return') or {}).get('type') == 'void'
        return meta['name'], names, [p['type'] for p in params], void
    found = lv_facts.method(tree, 'Solution')
    if found is None:
        raise Stop({'kind': 'unsupported'})
    name, names, hints, ret = found
    return name, names, [lv_args.hint_type(h) for h in hints], lv_args.is_void(ret)


def _design_calls(meta, values, param):
    """[(method name, built args)] from a design problem's two inputs, by research.md §5.10's two rules."""
    methods, calls = values
    if not isinstance(methods, list) or not isinstance(calls, list) or len(methods) != len(calls) or not methods:
        raise lv_args.InputError(param)
    ctor = [p for p in (meta.get('constructor') or {}).get('params') or [] if not p['name'].endswith('Size')]
    specs = {m['name']: m.get('params') or [] for m in meta.get('methods') or []}
    out = []
    for i, (name, args) in enumerate(zip(methods, calls)):
        if not isinstance(args, list):
            raise lv_args.InputError(param)
        if args == [None]:
            args = []
        params = ctor if i == 0 else specs.get(name, [])
        if len(params) == len(args):
            args = [lv_args.build(p['type'], a, p['name']) for p, a in zip(params, args)]
        out.append((name, args))
    return out


def _design(cls, calls, outputs, rec):
    """The thunk that replays a design problem's calls, recording each return for the output card."""
    def drive():
        obj = cls(*calls[0][1])
        outputs.append({'at': max(0, len(rec.parts) - 1), 'v': 'None'})
        for name, args in calls[1:]:
            r = getattr(obj, name)(*args)
            outputs.append({'at': max(0, len(rec.parts) - 1), 'v': rec.text(r)})
    return drive


def _named(names, args, tag):
    """The entry parameters whose value is a node of this kind, or a list holding one."""
    out = []
    for name, a in zip(names, args):
        if any(lv_nodes.TAGS.get(type(x)) == tag for x in (a if isinstance(a, list) else [a])):
            out.append(name)
    return out


def _dump(rec, end, facts, entry, outputs):
    head = json.dumps({'v': 1, 'keyEvery': lv_trace.KEY_EVERY, 'facts': facts, 'entry': entry},
                      ensure_ascii=True, separators=(',', ':'))
    tail = json.dumps({'end': end, 'outputs': outputs, 'truncated': rec.truncated},
                      ensure_ascii=True, separators=(',', ':'))
    return head[:-1] + ',"steps":[' + ','.join(rec.parts) + '],' + tail[1:]
