export const TERMINAL_VIEWS = ["trade", "liquidity", "bridge", "architecture"] as const;

export type TerminalView = (typeof TERMINAL_VIEWS)[number];

export const TERMINAL_VIEW_LABELS: Record<TerminalView, string> = {
  trade: "Trade",
  liquidity: "Liquidity",
  bridge: "ZEC gateway",
  architecture: "Architecture",
};

export function isTerminalView(value: string | undefined): value is TerminalView {
  return TERMINAL_VIEWS.includes(value as TerminalView);
}

export function terminalViewIndex(id: TerminalView): number {
  return TERMINAL_VIEWS.indexOf(id);
}

export function nextTerminalView(id: TerminalView, delta: number): TerminalView {
  const count = TERMINAL_VIEWS.length;
  const index = (terminalViewIndex(id) + delta + count) % count;
  return TERMINAL_VIEWS[index];
}
