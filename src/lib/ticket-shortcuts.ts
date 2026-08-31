export type TicketShortcut =
  | "buy"
  | "sell"
  | "limit"
  | "market"
  | "gtc"
  | "ioc"
  | "fok"
  | "escape";

function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== "object") return false;
  const element = target as { tagName?: string; isContentEditable?: boolean };
  return element.tagName === "INPUT"
    || element.tagName === "SELECT"
    || element.tagName === "TEXTAREA"
    || element.isContentEditable === true;
}

export function interpretTicketKey(
  key: string,
  options: { target: EventTarget | null; dialogOpen: boolean },
): TicketShortcut | null {
  if (options.dialogOpen || isTypingTarget(options.target)) {
    return null;
  }
  if (key === "Escape") return "escape";
  const lower = key.length === 1 ? key.toLowerCase() : key;
  if (lower === "b") return "buy";
  if (lower === "s") return "sell";
  if (lower === "l") return "limit";
  if (lower === "m") return "market";
  if (lower === "g") return "gtc";
  if (lower === "i") return "ioc";
  if (lower === "f") return "fok";
  return null;
}
