"""Cursor facts and Solution method signatures, read with ast before tracing (index: Raw trace, Facts)."""

import ast

SCOPES = (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda, ast.ClassDef)


def facts(tree):
    """Every function's facts, keyed by its qualified name (the same as co_qualname)."""
    out = {}
    _walk(tree, '', out)
    return out


def _walk(node, prefix, out):
    for child in ast.iter_child_nodes(node):
        if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef)):
            name = prefix + child.name
            out[name] = _scope(child)
            _walk(child, name + '.<locals>.', out)
        elif isinstance(child, ast.ClassDef):
            _walk(child, prefix + child.name + '.', out)
        elif isinstance(child, ast.Lambda):
            _walk(child, prefix + '<lambda>.<locals>.', out)
        else:
            _walk(child, prefix, out)


def _own(node):
    """A node's descendants in source order, without nested functions, lambdas and classes."""
    for child in ast.iter_child_nodes(node):
        if isinstance(child, SCOPES):
            continue
        yield child
        yield from _own(child)


def _body(fn):
    """A function body's own nodes: not its signature's annotations and defaults, not nested scopes."""
    for stmt in fn.body:
        if not isinstance(stmt, SCOPES):
            yield stmt
            yield from _own(stmt)


def _container(node):
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute) and isinstance(node.value, ast.Name) and node.value.id == 'self':
        return 'self.' + node.attr
    return None


def _int(node):
    return isinstance(node, ast.Constant) and type(node.value) is int


def _index(node):
    """`i`, `i + 1`, `i - 1` and `1 + i` -> 'i'."""
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.BinOp) and isinstance(node.op, (ast.Add, ast.Sub)):
        if isinstance(node.left, ast.Name) and _int(node.right):
            return node.left.id
        if isinstance(node.op, ast.Add) and _int(node.left) and isinstance(node.right, ast.Name):
            return node.right.id
    return None


def _is_len(node):
    return isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == 'len'


def _targets(t, value):
    if isinstance(t, ast.Name):
        yield t.id, value
    elif isinstance(t, (ast.Tuple, ast.List)):
        vals = value.elts if isinstance(value, (ast.Tuple, ast.List)) and len(value.elts) == len(t.elts) else None
        for i, e in enumerate(t.elts):
            yield from _targets(e, vals[i] if vals else None)
    elif isinstance(t, ast.Starred):
        yield from _targets(t.value, None)


def _bindings(node):
    """(name, value) for each name this node binds; value is the bound expression when it is a plain one."""
    if isinstance(node, ast.Assign):
        for t in node.targets:
            yield from _targets(t, node.value)
    elif isinstance(node, (ast.AnnAssign, ast.NamedExpr)):
        yield from _targets(node.target, node.value)
    elif isinstance(node, ast.AugAssign):
        yield from _targets(node.target, None)
    elif isinstance(node, (ast.For, ast.AsyncFor, ast.comprehension)):
        yield from _targets(node.target, None)
    elif isinstance(node, ast.withitem) and node.optional_vars is not None:
        yield from _targets(node.optional_vars, None)
    elif isinstance(node, ast.ExceptHandler) and node.name:
        yield node.name, None
    elif isinstance(node, (ast.Import, ast.ImportFrom)):
        for a in node.names:
            yield (a.asname or a.name).split('.')[0], None


def _add(lst, item):
    if item not in lst:
        lst.append(item)


def _scope(fn):
    cursors, grids, strs = [], [], []
    count, from_len = {}, set()
    a = fn.args
    for arg in a.posonlyargs + a.args + a.kwonlyargs + [x for x in (a.vararg, a.kwarg) if x]:
        count[arg.arg] = 1
    for node in _body(fn):
        for name, value in _bindings(node):
            count[name] = count.get(name, 0) + 1
            if value is not None and _is_len(value):
                from_len.add(name)
        if isinstance(node, ast.Subscript):
            c = _container(node.value)
            if c:
                _add(strs, c)
                i = _index(node.slice)
                if i:
                    _add(cursors, [c, i])
            elif isinstance(node.value, ast.Subscript):
                g = _container(node.value.value)
                r, col = _index(node.value.slice), _index(node.slice)
                if g and r and col:
                    _add(grids, [g, r, col])
        elif isinstance(node, (ast.For, ast.AsyncFor, ast.comprehension)):
            t, it = node.target, node.iter
            if (isinstance(t, ast.Tuple) and len(t.elts) == 2 and isinstance(t.elts[0], ast.Name)
                    and isinstance(it, ast.Call) and isinstance(it.func, ast.Name) and it.func.id == 'enumerate' and it.args):
                c = _container(it.args[0])
                if c:
                    _add(cursors, [c, t.elts[0].id])
    fixed = {n for n in from_len if count.get(n) == 1}
    return {
        'cursors': [x for x in cursors if x[1] not in fixed],
        'grids': [x for x in grids if x[1] not in fixed and x[2] not in fixed],
        'strs': strs,
    }


def method(tree, cls, name=None):
    """The method `name` of the module-level class `cls`, or its first public method when name is None.

    Returns (name, parameter names without self, their annotations, the return annotation), or None.
    """
    for node in tree.body:
        if isinstance(node, ast.ClassDef) and node.name == cls:
            for f in node.body:
                if isinstance(f, (ast.FunctionDef, ast.AsyncFunctionDef)) and (f.name == name if name else not f.name.startswith('_')):
                    params = (f.args.posonlyargs + f.args.args)[1:]
                    return f.name, [p.arg for p in params], [p.annotation for p in params], f.returns
    return None
