"""LeetCode's node classes, a registry of every node made during a run, builders, and the iterative unlink."""

from collections import deque

REGISTRY = []
TAGS = {}
USER = []  # node classes the solution defined itself, tagged for the current run only


class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next
        REGISTRY.append(self)


class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right
        REGISTRY.append(self)


TAGS[ListNode] = 'LNODE'
TAGS[TreeNode] = 'TNODE'


class NestedInteger:
    __slots__ = ('_v',)

    def __init__(self, value=None):
        self._v = [] if value is None else value

    def isInteger(self):
        return not isinstance(self._v, list)

    def getInteger(self):
        return None if isinstance(self._v, list) else self._v

    def setInteger(self, value):
        self._v = value

    def add(self, elem):
        if not isinstance(self._v, list):
            self._v = []
        self._v.append(elem)

    def getList(self):
        return self._v if isinstance(self._v, list) else None

    def __repr__(self):
        return '[' + ', '.join(map(repr, self._v)) + ']' if isinstance(self._v, list) else repr(self._v)


def build_list(vals, cls=ListNode):
    head = tail = None
    for v in vals:
        node = cls(v)
        if tail is None:
            head = node
        else:
            tail.next = node
        tail = node
    return head


def chain(head):
    """The nodes from head along next, stopping at a node seen before."""
    out, seen = [], set()
    while head is not None and id(head) not in seen:
        seen.add(id(head))
        out.append(head)
        head = head.next
    return out


def build_tree(vals, cls=TreeNode):
    """Level order, None is a gap, and children of a gap are skipped."""
    if not vals or vals[0] is None:
        return None
    root = cls(vals[0])
    queue = deque([root])
    i = 1
    while queue and i < len(vals):
        node = queue.popleft()
        for side in ('left', 'right'):
            if i >= len(vals):
                break
            v = vals[i]
            i += 1
            if v is not None:
                child = cls(v)
                setattr(node, side, child)
                queue.append(child)
    return root


def find(root, val):
    """The first node in level order whose val equals val."""
    queue = deque([root] if root is not None else [])
    while queue:
        node = queue.popleft()
        if node.val == val:
            return node
        queue.extend(c for c in (node.left, node.right) if c is not None)
    return None


def adopt(g):
    """Tag a ListNode/TreeNode class the solution defined itself like the harness's, until release()."""
    for name, own in (('ListNode', ListNode), ('TreeNode', TreeNode)):
        cls = g.get(name)
        if isinstance(cls, type) and cls is not own:
            TAGS[cls] = TAGS[own]
            USER.append(cls)


def release():
    for cls in USER:
        TAGS.pop(cls, None)
    USER.clear()


def unlink_all(extra=()):
    """Break every link between registered nodes (and `extra` objects of the solution's own node classes), one node at a time, then forget them.

    Freeing a 2,000+ node chain through its links recurses in C and overflows the browser's stack (research.md §5.3).
    """
    for node in [*REGISTRY, *(v for v in extra if type(v) in USER)]:
        d = getattr(node, '__dict__', None)
        if not isinstance(d, dict):
            continue
        for name in ('next', 'left', 'right', 'random'):
            if name in d:
                d[name] = None
        if isinstance(d.get('neighbors'), list):
            d['neighbors'].clear()
    REGISTRY.clear()
