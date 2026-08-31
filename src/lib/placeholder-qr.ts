const FINDER = 7;
const QUIET = 1;

export function placeholderQrModules(payload: string, size = 21): boolean[][] {
  const grid = Array.from({ length: size }, () => Array.from({ length: size }, () => false));

  function paintFinder(originX: number, originY: number) {
    for (let y = 0; y < FINDER; y += 1) {
      for (let x = 0; x < FINDER; x += 1) {
        const edge = x === 0 || y === 0 || x === FINDER - 1 || y === FINDER - 1;
        const core = x >= 2 && x <= 4 && y >= 2 && y <= 4;
        grid[originY + y][originX + x] = edge || core;
      }
    }
  }

  paintFinder(0, 0);
  paintFinder(size - FINDER, 0);
  paintFinder(0, size - FINDER);

  const seed = payload.split("").reduce((hash, char) => Math.imul(hash ^ char.charCodeAt(0), 16777619), 2166136261);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const inTopLeft = x < FINDER + QUIET && y < FINDER + QUIET;
      const inTopRight = x >= size - FINDER - QUIET && y < FINDER + QUIET;
      const inBottomLeft = x < FINDER + QUIET && y >= size - FINDER - QUIET;
      if (inTopLeft || inTopRight || inBottomLeft) continue;
      const ch = payload.charCodeAt((x * size + y) % payload.length);
      const mixed = Math.imul(seed ^ ch, x + 3) ^ Math.imul(y + 5, 2246822519);
      grid[y][x] = ((mixed >>> 8) & 1) === 1;
    }
  }

  return grid;
}
