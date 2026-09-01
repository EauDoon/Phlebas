import { sizeAtomsForQuote } from "./units.ts";

export function maxTicketSizeAtoms(options: {
  side: "buy" | "sell";
  availableZecAtoms: bigint;
  availableQuoteAtoms: bigint;
  priceTicks: bigint;
}): bigint {
  if (options.side === "sell") {
    return options.availableZecAtoms > 0n ? options.availableZecAtoms : 0n;
  }
  if (options.availableQuoteAtoms <= 0n || options.priceTicks <= 0n) {
    return 0n;
  }
  return sizeAtomsForQuote(options.availableQuoteAtoms, options.priceTicks);
}
