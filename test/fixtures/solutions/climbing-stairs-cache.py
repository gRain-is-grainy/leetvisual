class Solution:
    def climbStairs(self, n: int) -> int:
        @cache
        def ways(k):
            if k <= 1:
                return 1
            return ways(k - 1) + ways(k - 2)

        return ways(n)
