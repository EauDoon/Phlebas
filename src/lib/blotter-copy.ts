import type { Market } from "./market-data.ts";

export function blotterEmptyOrdersCopy(settlementPair: Market["settlementPair"]): string {
  return `No open session orders. Settled as ${settlementPair}. Venue fixture levels remain on the book.`;
}

export function blotterEmptyFillsCopy(settlementPair: Market["settlementPair"]): string {
  return `No session fills yet. Settled as ${settlementPair}. Submitting a simulated order can trade against the fixture book.`;
}

export function blotterEmptyLogCopy(settlementPair: Market["settlementPair"]): string {
  return `No session events yet. Settled as ${settlementPair}. Replaying this log reconstructs the book and balances.`;
}
