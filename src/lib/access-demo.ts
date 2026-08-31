export const ACCESS_DEMOS = ["open", "blocked"] as const;

export type AccessDemo = (typeof ACCESS_DEMOS)[number];

export function isAccessDemo(value: string | undefined): value is AccessDemo {
  return ACCESS_DEMOS.includes(value as AccessDemo);
}

export function parseAccessDemo(value: string | undefined): AccessDemo {
  return isAccessDemo(value) ? value : "open";
}

export const COUNTRY_BLOCKED_COPY = {
  label: "State demonstration",
  title: "Phlebas is not available in this location.",
  body: "This preview is limited to approved locations. Trading, liquidity, deposit, and withdrawal controls are unavailable.",
  architecture: "Read the architecture",
  home: "Return home",
} as const;
