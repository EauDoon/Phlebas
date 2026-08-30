import { quoteConstantProductAmountIn, quoteConstantProductSwapAtoms } from "./amm.ts";
import { submitOrder, type Book, type OrderSide } from "./matcher.ts";
import { quoteAtomsForFill } from "./units.ts";

export type VenueQuote = {
  venue: "clob" | "amm";
  filledAtoms: bigint;
  quoteAtoms: bigint;
  complete: boolean;
};

export type RouteComparison = {
  clob: VenueQuote;
  amm: VenueQuote;
  better: "clob" | "amm" | "tie" | "none";
};

export function quoteClob(
  book: Book,
  side: OrderSide,
  sizeAtoms: bigint,
  limitTicks: bigint,
): VenueQuote {
  const result = submitOrder(book, {
    id: "router-preview",
    side,
    tif: "IOC",
    priceTicks: limitTicks,
    sizeAtoms,
  });
  const quoteAtoms = result.fills.reduce(
    (sum, fill) => sum + quoteAtomsForFill(fill.sizeAtoms, fill.priceTicks),
    0n,
  );
  return {
    venue: "clob",
    filledAtoms: sizeAtoms - result.remainingAtoms,
    quoteAtoms,
    complete: result.remainingAtoms === 0n,
  };
}

export function quoteAmm(
  side: OrderSide,
  sizeAtoms: bigint,
  reservePzecAtoms: bigint,
  reserveQuoteAtoms: bigint,
): VenueQuote {
  if (side === "buy") {
    const quoteAtoms = quoteConstantProductAmountIn(sizeAtoms, reserveQuoteAtoms, reservePzecAtoms);
    return {
      venue: "amm",
      filledAtoms: sizeAtoms,
      quoteAtoms,
      complete: true,
    };
  }

  const swap = quoteConstantProductSwapAtoms(sizeAtoms, reservePzecAtoms, reserveQuoteAtoms);
  return {
    venue: "amm",
    filledAtoms: sizeAtoms,
    quoteAtoms: swap.amountOut,
    complete: true,
  };
}

export function compareVenues(options: {
  book: Book;
  side: OrderSide;
  sizeAtoms: bigint;
  limitTicks: bigint;
  reservePzecAtoms: bigint;
  reserveQuoteAtoms: bigint;
}): RouteComparison {
  const clob = quoteClob(options.book, options.side, options.sizeAtoms, options.limitTicks);
  let amm: VenueQuote;
  try {
    amm = quoteAmm(options.side, options.sizeAtoms, options.reservePzecAtoms, options.reserveQuoteAtoms);
  } catch {
    amm = { venue: "amm", filledAtoms: 0n, quoteAtoms: 0n, complete: false };
  }

  return { clob, amm, better: pickBetter(options.side, clob, amm) };
}

function pickBetter(side: OrderSide, clob: VenueQuote, amm: VenueQuote): RouteComparison["better"] {
  if (!clob.complete && !amm.complete) {
    return "none";
  }
  if (clob.complete && !amm.complete) {
    return "clob";
  }
  if (amm.complete && !clob.complete) {
    return "amm";
  }
  if (clob.quoteAtoms === amm.quoteAtoms) {
    return "tie";
  }
  if (side === "buy") {
    return clob.quoteAtoms < amm.quoteAtoms ? "clob" : "amm";
  }
  return clob.quoteAtoms > amm.quoteAtoms ? "clob" : "amm";
}
