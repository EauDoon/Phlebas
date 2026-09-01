export const TERMINAL_MODES = ["simple", "advanced"] as const;
export type TerminalMode = (typeof TERMINAL_MODES)[number];

export const TERMINAL_MODE_STORAGE_KEY = "phlebas.terminalMode";
export const DEFAULT_TERMINAL_MODE: TerminalMode = "simple";

export function isTerminalMode(value: string | undefined): value is TerminalMode {
  return value === "simple" || value === "advanced";
}

export function parseTerminalModeQuery(value: string | undefined): TerminalMode | null {
  return isTerminalMode(value) ? value : null;
}

export function resolveTerminalMode(
  query: string | undefined,
  stored: string | null,
): TerminalMode {
  if (isTerminalMode(query)) {
    return query;
  }
  if (isTerminalMode(stored ?? undefined)) {
    return stored;
  }
  return DEFAULT_TERMINAL_MODE;
}

export function nextTerminalMode(mode: TerminalMode): TerminalMode {
  return mode === "simple" ? "advanced" : "simple";
}
