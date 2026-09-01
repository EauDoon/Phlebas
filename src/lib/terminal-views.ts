export const TERMINAL_VIEWS = ["trade", "settlement", "architecture"] as const;

export type TerminalView = (typeof TERMINAL_VIEWS)[number];

/** Liquidity lives on /liquidity. Bridge stays a historical deep link, not a primary tab. */
export const AUXILIARY_TERMINAL_VIEWS = ["liquidity", "bridge"] as const;

export type AuxiliaryTerminalView = (typeof AUXILIARY_TERMINAL_VIEWS)[number];

export type RenderableTerminalView = TerminalView | AuxiliaryTerminalView;

export const TERMINAL_VIEW_LABELS: Record<TerminalView, string> = {
  trade: "Trade",
  settlement: "Settlement",
  architecture: "Architecture",
};

export function isTerminalView(value: string | undefined): value is TerminalView {
  return TERMINAL_VIEWS.includes(value as TerminalView);
}

export function isRenderableTerminalView(value: string | undefined): value is RenderableTerminalView {
  return isTerminalView(value) || AUXILIARY_TERMINAL_VIEWS.includes(value as AuxiliaryTerminalView);
}

export function terminalViewIndex(id: TerminalView): number {
  return TERMINAL_VIEWS.indexOf(id);
}

export function nextTerminalView(id: TerminalView, delta: number): TerminalView {
  const count = TERMINAL_VIEWS.length;
  const index = (terminalViewIndex(id) + delta + count) % count;
  return TERMINAL_VIEWS[index];
}
