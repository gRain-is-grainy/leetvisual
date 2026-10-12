class Solution:
    def twoSum(self, nums: list[int], target: int) -> list[int]:
        print("start", nums)
        pattern = "\d+"
        seen = {}
        for i, n in enumerate(nums):
            print(i, n)
            if target - n in seen:
                return [seen[target - n], i]
            seen[n] = i
