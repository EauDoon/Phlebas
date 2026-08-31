export const BLOTTER_TABS = ["orders", "fills", "inventory", "log"] as const;

export type BlotterTab = (typeof BLOTTER_TABS)[number];

export const BLOTTER_TAB_LABELS: Record<BlotterTab, string> = {
  orders: "Open orders",
  fills: "Fills",
  inventory: "Inventory",
  log: "Event log",
};

export function isBlotterTab(value: string | undefined): value is BlotterTab {
  return BLOTTER_TABS.includes(value as BlotterTab);
}

export function blotterTabIndex(id: BlotterTab): number {
  return BLOTTER_TABS.indexOf(id);
}

export function nextBlotterTab(id: BlotterTab, delta: number): BlotterTab {
  const count = BLOTTER_TABS.length;
  const index = (blotterTabIndex(id) + delta + count) % count;
  return BLOTTER_TABS[index];
}
