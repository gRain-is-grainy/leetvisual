class Solution:
    def climbStairs(self, n: int) -> int:
        sys.setrecursionlimit(100000)

        @cache
        def ways(k):
            if k <= 1:
                return 1
            return ways(k - 1) + ways(k - 2)

        return ways(n + 5000)
