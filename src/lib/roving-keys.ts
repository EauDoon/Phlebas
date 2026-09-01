export type RovingKey = "next" | "prev" | "home" | "end" | "select";

export function interpretRovingKey(key: string): RovingKey | null {
  if (key === "ArrowRight" || key === "ArrowDown") return "next";
  if (key === "ArrowLeft" || key === "ArrowUp") return "prev";
  if (key === "Home") return "home";
  if (key === "End") return "end";
  if (key === "Enter" || key === " ") return "select";
  return null;
}

function wrapIndex(index: number, count: number): number {
  return ((index % count) + count) % count;
}

/** Move focus across a roving tablist. Select leaves the current tab in place. */
export function applyRovingAction<T>(
  ids: readonly T[],
  current: T,
  action: RovingKey,
): T {
  const count = ids.length;
  if (count === 0) {
    throw new RangeError("Roving tab list is empty");
  }
  if (action === "home") return ids[0];
  if (action === "end") return ids[count - 1];
  if (action === "select") return current;

  const index = ids.indexOf(current);
  if (index < 0) {
    throw new RangeError("Roving tab is not in the list");
  }
  return ids[wrapIndex(index + (action === "next" ? 1 : -1), count)];
}

export function applyRovingKey<T>(
  ids: readonly T[],
  current: T,
  key: string,
): { action: RovingKey; id: T } | null {
  const action = interpretRovingKey(key);
  if (!action) return null;
  return { action, id: applyRovingAction(ids, current, action) };
}
