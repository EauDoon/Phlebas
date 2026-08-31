export type RovingKey = "next" | "prev" | "home" | "end" | "select";

export function interpretRovingKey(key: string): RovingKey | null {
  if (key === "ArrowRight" || key === "ArrowDown") return "next";
  if (key === "ArrowLeft" || key === "ArrowUp") return "prev";
  if (key === "Home") return "home";
  if (key === "End") return "end";
  if (key === "Enter" || key === " ") return "select";
  return null;
}
