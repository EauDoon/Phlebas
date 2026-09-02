import type { TimeInForce } from "./matcher.ts";

export const TICKET_SIDES = ["buy", "sell"] as const;
export type TicketSide = (typeof TICKET_SIDES)[number];

export const TICKET_ORDER_TYPES = ["limit", "market", "twap"] as const;
export type TicketOrderType = (typeof TICKET_ORDER_TYPES)[number];

export const TICKET_TIFS = ["GTC", "IOC", "FOK"] as const satisfies readonly TimeInForce[];
export type TicketTif = (typeof TICKET_TIFS)[number];

function nextIn<T extends string>(ids: readonly T[], id: T, delta: number): T {
  const count = ids.length;
  const index = (ids.indexOf(id) + delta + count) % count;
  return ids[index];
}

export function nextTicketSide(id: TicketSide, delta: number): TicketSide {
  return nextIn(TICKET_SIDES, id, delta);
}

export function nextTicketOrderType(id: TicketOrderType, delta: number): TicketOrderType {
  return nextIn(TICKET_ORDER_TYPES, id, delta);
}

export function nextTicketTif(id: TicketTif, delta: number): TicketTif {
  return nextIn(TICKET_TIFS, id, delta);
}
