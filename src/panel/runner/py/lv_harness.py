"""The worker's entry point. This task: the prelude every run starts from."""

import builtins

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


def fresh_globals():
    """A new namespace for one run, with the prelude already run into it."""
    g = {'__name__': '__main__', '__builtins__': builtins}
    exec(PRELUDE_CODE, g)
    return g
