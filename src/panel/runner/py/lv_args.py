"""Turns LeetCode's input text into Python arguments, by metaData type string or by type hint."""

import ast
import json

import lv_nodes

HINTS = {'int': 'integer', 'float': 'double', 'bool': 'boolean', 'str': 'string',
         'ListNode': 'ListNode', 'TreeNode': 'TreeNode', 'NestedInteger': 'NestedInteger'}


class InputError(Exception):
    def __init__(self, param):
        super().__init__(param)
        self.param = param


def parse(text, param):
    """One input's JSON text, with \\r removed. Integers of any size stay exact."""
    try:
        return json.loads(text.replace('\r', ''))
    except ValueError:
        raise InputError(param) from None


def shape(type_str):
    """'integer[][]' and 'list<list<integer>>' -> ('integer', 2)."""
    t = type_str.strip()
    depth = 0
    while True:
        if t.endswith('[]'):
            t = t[:-2].strip()
        elif t.lower().startswith('list<') and t.endswith('>'):
            t = t[5:-1].strip()
        else:
            return t, depth
        depth += 1


def build(type_str, value, param):
    """A value of the given metaData type built from its JSON value; any other type passes the value through."""
    if not type_str:
        return value
    base, depth = shape(type_str)
    return _build(base, depth, value, param)


def _build(base, depth, v, param):
    if depth:
        if not isinstance(v, list):
            raise InputError(param)
        return [_build(base, depth - 1, x, param) for x in v]
    if base in ('integer', 'long'):
        ok = type(v) is int
    elif base == 'double':
        ok = type(v) in (int, float)
        v = float(v) if ok else v
    elif base == 'boolean':
        ok = type(v) is bool
    elif base in ('string', 'character'):
        ok = type(v) is str
    elif base in ('ListNode', 'TreeNode'):
        if v is None:
            return None
        if not isinstance(v, list):
            raise InputError(param)
        return lv_nodes.build_list(v) if base == 'ListNode' else lv_nodes.build_tree(v)
    elif base == 'NestedInteger':
        return _nested(v, param)
    else:
        return v
    if not ok:
        raise InputError(param)
    return v


def _nested(v, param):
    if type(v) is int:
        return lv_nodes.NestedInteger(v)
    if not isinstance(v, list):
        raise InputError(param)
    n = lv_nodes.NestedInteger()
    for x in v:
        n.add(_nested(x, param))
    return n


def _is_none(node):
    return isinstance(node, ast.Constant) and node.value is None


def hint_type(node):
    """A parameter annotation's AST -> a metaData type string, or None when it names nothing we build."""
    if node is None:
        return None
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        try:
            return hint_type(ast.parse(node.value, mode='eval').body)
        except SyntaxError:
            return None
    if isinstance(node, ast.Name):
        return HINTS.get(node.id)
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.BitOr):
        if _is_none(node.right):
            return hint_type(node.left)
        if _is_none(node.left):
            return hint_type(node.right)
        return None
    if isinstance(node, ast.Subscript):
        head = node.value
        name = head.id if isinstance(head, ast.Name) else head.attr if isinstance(head, ast.Attribute) else None
        if name == 'Optional':
            return hint_type(node.slice)
        if name in ('List', 'list'):
            inner = hint_type(node.slice)
            return inner + '[]' if inner else None
    return None


def is_void(node):
    """A return annotation of None."""
    return _is_none(node)
