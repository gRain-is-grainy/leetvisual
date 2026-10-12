class Solution:
    def numIslands(self, grid: list[list[str]]) -> int:
        rows, cols = len(grid), len(grid[0])
        count = 0
        for r in range(rows):
            for c in range(cols):
                if grid[r][c] != "1":
                    continue
                count += 1
                grid[r][c] = "0"
                q = deque([(r, c)])
                while q:
                    cr, cc = q.popleft()
                    for nr, nc in ((cr + 1, cc), (cr - 1, cc), (cr, cc + 1), (cr, cc - 1)):
                        if 0 <= nr < rows and 0 <= nc < cols and grid[nr][nc] == "1":
                            grid[nr][nc] = "0"
                            q.append((nr, nc))
        return count
