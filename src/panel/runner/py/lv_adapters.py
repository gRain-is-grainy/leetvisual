"""The adapter table for the free study-list `manual` problems (spec §4.2, research.md §5.10).

Entries are data; each family is one small function that builds the user's arguments and any globals the
problem's code expects (a `Node` class, an API stub) from the test case's values.
"""

import lv_nodes
from lv_args import InputError


class GraphNode:
    def __init__(self, val=0, neighbors=None):
        self.val = val
        self.neighbors = neighbors if neighbors is not None else []
        lv_nodes.REGISTRY.append(self)


class RandomNode:
    def __init__(self, x, next=None, random=None):
        self.val = int(x)
        self.next = next
        self.random = random
        lv_nodes.REGISTRY.append(self)


class NextNode:
    def __init__(self, val=0, left=None, right=None, next=None):
        self.val = val
        self.left = left
        self.right = right
        self.next = next
        lv_nodes.REGISTRY.append(self)


# The user's code calls each of these `Node`, as LeetCode's snippets do.
for _cls in (GraphNode, RandomNode, NextNode):
    _cls.__name__ = _cls.__qualname__ = 'Node'
lv_nodes.TAGS[RandomNode] = 'LNODE'  # its random links are not drawn
lv_nodes.TAGS[NextNode] = 'TNODE'    # its next links are not drawn

ADAPTERS = {
    'linked-list-cycle': {'family': 'cycle', 'method': 'hasCycle', 'params': ['head', 'pos']},
    'linked-list-cycle-ii': {'family': 'cycle', 'method': 'detectCycle', 'params': ['head', 'pos']},
    'intersection-of-two-linked-lists': {'family': 'intersection', 'method': 'getIntersectionNode',
                                         'params': ['intersectVal', 'listA', 'listB', 'skipA', 'skipB']},
    'lowest-common-ancestor-of-a-binary-search-tree': {'family': 'by_value', 'method': 'lowestCommonAncestor',
                                                       'params': ['root', 'p', 'q'], 'nodes': ['p', 'q']},
    'lowest-common-ancestor-of-a-binary-tree': {'family': 'by_value', 'method': 'lowestCommonAncestor',
                                                'params': ['root', 'p', 'q'], 'nodes': ['p', 'q']},
    'all-nodes-distance-k-in-binary-tree': {'family': 'by_value', 'method': 'distanceK',
                                            'params': ['root', 'target', 'k'], 'nodes': ['target']},
    'clone-graph': {'family': 'graph', 'method': 'cloneGraph', 'params': ['edges']},
    'copy-list-with-random-pointer': {'family': 'random', 'method': 'copyRandomList', 'params': ['head']},
    'populating-next-right-pointers-in-each-node-ii': {'family': 'next_tree', 'method': 'connect', 'params': ['root']},
    'first-bad-version': {'family': 'api', 'method': 'firstBadVersion', 'params': ['n', 'bad'], 'api': 'isBadVersion'},
    'guess-number-higher-or-lower': {'family': 'api', 'method': 'guessNumber', 'params': ['n', 'pick'], 'api': 'guess'},
    'serialize-and-deserialize-binary-tree': {'family': 'codec', 'method': None, 'params': ['root']},
}


def _list(v, param):
    if not isinstance(v, list):
        raise InputError(param)
    return v


def _int(v, param):
    if type(v) is not int:
        raise InputError(param)
    return v


def cycle(e, v, g):
    head = lv_nodes.build_list(_list(v[0], 'head'))
    pos = _int(v[1], 'pos')
    nodes = lv_nodes.chain(head)
    if 0 <= pos < len(nodes):
        nodes[-1].next = nodes[pos]
    return [head], ['head']


def intersection(e, v, g):
    val = _int(v[0], 'intersectVal')
    a, b = _list(v[1], 'listA'), _list(v[2], 'listB')
    skip_a, skip_b = _int(v[3], 'skipA'), _int(v[4], 'skipB')
    head_a = lv_nodes.build_list(a)
    if val == 0:
        return [head_a, lv_nodes.build_list(b)], ['headA', 'headB']
    if not 0 <= skip_a < len(a):
        raise InputError('skipA')
    if not 0 <= skip_b < len(b):
        raise InputError('skipB')
    join = lv_nodes.chain(head_a)[skip_a]
    head_b = lv_nodes.build_list(b[:skip_b])
    if head_b is None:
        head_b = join
    else:
        lv_nodes.chain(head_b)[-1].next = join
    return [head_a, head_b], ['headA', 'headB']


def by_value(e, v, g):
    root = lv_nodes.build_tree(_list(v[0], 'root'))
    args = [root]
    for name, x in zip(e['params'][1:], v[1:]):
        args.append(lv_nodes.find(root, x) if name in e['nodes'] else x)
    return args, e['params']


def graph(e, v, g):
    g['Node'] = GraphNode
    adj = _list(v[0], 'edges')
    nodes = [GraphNode(i + 1) for i in range(len(adj))]
    for node, near in zip(nodes, adj):
        near = _list(near, 'edges')
        if not all(type(j) is int and 1 <= j <= len(nodes) for j in near):
            raise InputError('edges')
        node.neighbors = [nodes[j - 1] for j in near]
    return [nodes[0] if nodes else None], ['node']


def random(e, v, g):
    g['Node'] = RandomNode
    pairs = _list(v[0], 'head')
    for p in pairs:
        if len(_list(p, 'head')) != 2 or type(p[0]) is not int or not (p[1] is None or type(p[1]) is int and 0 <= p[1] < len(pairs)):
            raise InputError('head')
    nodes = [RandomNode(p[0]) for p in pairs]
    for i, (node, pair) in enumerate(zip(nodes, pairs)):
        node.next = nodes[i + 1] if i + 1 < len(nodes) else None
        node.random = nodes[pair[1]] if pair[1] is not None else None
    return [nodes[0] if nodes else None], ['head']


def next_tree(e, v, g):
    g['Node'] = NextNode
    return [lv_nodes.build_tree(_list(v[0], 'root'), NextNode)], ['root']


def api(e, v, g):
    n, secret = _int(v[0], e['params'][0]), _int(v[1], e['params'][1])
    if e['api'] == 'isBadVersion':
        g['isBadVersion'] = lambda version: version >= secret
    else:
        g['guess'] = lambda num: 0 if num == secret else (-1 if num > secret else 1)
    return [n], ['n']


def codec(e, v, g):
    return [lv_nodes.build_tree(_list(v[0], 'root'))], ['root']


FAMILIES = {'cycle': cycle, 'intersection': intersection, 'by_value': by_value, 'graph': graph,
            'random': random, 'next_tree': next_tree, 'api': api, 'codec': codec}


def prepare(e, values, g):
    """Build the arguments (and any globals) for adapter entry e; returns (args, the user's parameter names)."""
    return FAMILIES[e['family']](e, values, g)


def call(e, g, args):
    """The thunk the tracer runs, once the user's module has defined its classes."""
    if e['family'] == 'codec':
        codec = g['Codec']

        def drive():  # LeetCode's driver: ser = Codec(); deser = Codec(); deser.deserialize(ser.serialize(root))
            ser, deser = codec(), codec()
            return deser.deserialize(ser.serialize(args[0]))
        return drive
    method = getattr(g['Solution'](), e['method'])
    return lambda: method(*args)
