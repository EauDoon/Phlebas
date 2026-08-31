import { quoteConstantProductAmountIn, quoteConstantProductSwapAtoms } from "./amm.ts";
import { levelsFromBook, submitOrder, type Book, type OrderSide } from "./matcher.ts";
import { QUOTE_COST_DIVISOR, quoteAtomsForFill } from "./units.ts";

export type VenueQuote = {
  venue: "clob" | "amm";
  filledAtoms: bigint;
  quoteAtoms: bigint;
  complete: boolean;
};

export type SplitQuote = {
  venue: "split";
  clobFilledAtoms: bigint;
  ammFilledAtoms: bigint;
  clobQuoteAtoms: bigint;
  ammQuoteAtoms: bigint;
  filledAtoms: bigint;
  quoteAtoms: bigint;
  complete: boolean;
};

export type RouteComparison = {
  clob: VenueQuote;
  amm: VenueQuote;
  split: SplitQuote;
  better: "clob" | "amm" | "split" | "tie" | "none";
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
  const quoted = quoteAmmLeg(side, sizeAtoms, reservePzecAtoms, reserveQuoteAtoms);
  if (!quoted) {
    return { venue: "amm", filledAtoms: 0n, quoteAtoms: 0n, complete: false };
  }
  return {
    venue: "amm",
    filledAtoms: sizeAtoms,
    quoteAtoms: quoted.quoteAtoms,
    complete: true,
  };
}

export function quoteSplitRoute(options: {
  book: Book;
  side: OrderSide;
  sizeAtoms: bigint;
  limitTicks: bigint;
  reservePzecAtoms: bigint;
  reserveQuoteAtoms: bigint;
}): SplitQuote {
  const resting = levelsFromBook(options.book, options.side === "buy" ? "sell" : "buy");
  let remaining = options.sizeAtoms;
  let clobFilledAtoms = 0n;
  let clobQuoteAtoms = 0n;

  for (const level of resting) {
    if (remaining === 0n) break;
    if (options.side === "buy" && level.priceTicks > options.limitTicks) break;
    if (options.side === "sell" && level.priceTicks < options.limitTicks) break;

    const take = remaining < level.sizeAtoms ? remaining : level.sizeAtoms;
    const clobCost = quoteAtomsForFill(take, level.priceTicks);
    const ammLeg = quoteAmmLeg(options.side, take, options.reservePzecAtoms, options.reserveQuoteAtoms);
    const clobBetter = !ammLeg
      || (options.side === "buy" ? clobCost <= ammLeg.quoteAtoms : clobCost >= ammLeg.quoteAtoms);

    if (!clobBetter) break;

    clobFilledAtoms += take;
    clobQuoteAtoms += clobCost;
    remaining -= take;
  }

  let ammFilledAtoms = 0n;
  let ammQuoteAtoms = 0n;
  if (remaining > 0n) {
    const ammLeg = quoteAmmLeg(options.side, remaining, options.reservePzecAtoms, options.reserveQuoteAtoms);
    if (ammLeg && ammWithinLimit(options.side, remaining, ammLeg.quoteAtoms, options.limitTicks)) {
      ammFilledAtoms = remaining;
      ammQuoteAtoms = ammLeg.quoteAtoms;
      remaining = 0n;
    }
  }

  return {
    venue: "split",
    clobFilledAtoms,
    ammFilledAtoms,
    clobQuoteAtoms,
    ammQuoteAtoms,
    filledAtoms: clobFilledAtoms + ammFilledAtoms,
    quoteAtoms: clobQuoteAtoms + ammQuoteAtoms,
    complete: remaining === 0n,
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
  const amm = quoteAmm(options.side, options.sizeAtoms, options.reservePzecAtoms, options.reserveQuoteAtoms);
  const split = quoteSplitRoute(options);
  if (amm.complete && !ammWithinLimit(options.side, options.sizeAtoms, amm.quoteAtoms, options.limitTicks)) {
    amm.complete = false;
  }

  return { clob, amm, split, better: pickBetter(options.side, clob, amm, split) };
}

function quoteAmmLeg(
  side: OrderSide,
  sizeAtoms: bigint,
  reservePzecAtoms: bigint,
  reserveQuoteAtoms: bigint,
): { quoteAtoms: bigint } | null {
  if (sizeAtoms <= 0n) {
    return { quoteAtoms: 0n };
  }
  try {
    if (side === "buy") {
      return {
        quoteAtoms: quoteConstantProductAmountIn(sizeAtoms, reserveQuoteAtoms, reservePzecAtoms),
      };
    }
    return {
      quoteAtoms: quoteConstantProductSwapAtoms(sizeAtoms, reservePzecAtoms, reserveQuoteAtoms).amountOut,
    };
  } catch {
    return null;
  }
}

function ammWithinLimit(
  side: OrderSide,
  sizeAtoms: bigint,
  quoteAtoms: bigint,
  limitTicks: bigint,
): boolean {
  if (sizeAtoms <= 0n) {
    return true;
  }
  if (side === "buy") {
    const ticks = (quoteAtoms * QUOTE_COST_DIVISOR + sizeAtoms - 1n) / sizeAtoms;
    return ticks <= limitTicks;
  }
  const ticks = (quoteAtoms * QUOTE_COST_DIVISOR) / sizeAtoms;
  return ticks >= limitTicks;
}

function pickBetter(
  side: OrderSide,
  clob: VenueQuote,
  amm: VenueQuote,
  split: SplitQuote,
): RouteComparison["better"] {
  const candidates: Array<{ name: "clob" | "amm" | "split"; filled: bigint; quote: bigint; complete: boolean }> = [
    { name: "clob", filled: clob.filledAtoms, quote: clob.quoteAtoms, complete: clob.complete },
    { name: "amm", filled: amm.filledAtoms, quote: amm.quoteAtoms, complete: amm.complete },
  ];
  const splitIsMixed = split.clobFilledAtoms > 0n && split.ammFilledAtoms > 0n;
  if (splitIsMixed) {
    candidates.push({
      name: "split",
      filled: split.filledAtoms,
      quote: split.quoteAtoms,
      complete: split.complete,
    });
  }

  const complete = candidates.filter((candidate) => candidate.complete && candidate.filled > 0n);
  const pool = complete.length > 0 ? complete : candidates.filter((candidate) => candidate.filled > 0n);
  if (pool.length === 0) {
    return "none";
  }

  let best = pool[0];
  for (const candidate of pool.slice(1)) {
    if (side === "buy" ? candidate.quote < best.quote : candidate.quote > best.quote) {
      best = candidate;
    }
  }

  const tied = pool.filter((candidate) => candidate.quote === best.quote && candidate.complete === best.complete);
  if (tied.length > 1 && complete.length > 0) {
    return "tie";
  }
  return best.name;
}
