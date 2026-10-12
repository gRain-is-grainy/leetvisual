class Solution:
    def twoSum(self, nums: list[int], target: int) -> list[int]:
        seen = {}
        for i in range(1, len(nums) + 1):
            if target - nums[i] in seen:
                return [seen[target - nums[i]], i]
            seen[nums[i]] = i
