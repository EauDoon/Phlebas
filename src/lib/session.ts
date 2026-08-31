import { books, markets, type MarketId } from "./market-data.ts";
import {
  emptyBook,
  submitOrder,
  type Book,
  type Fill,
  type OrderSide,
  type RestingOrder,
  type SubmitResult,
  type TimeInForce,
} from "./matcher.ts";
import {
  PZEC_DECIMALS,
  PRICE_DECIMALS,
  formatAtomicUnits,
  meetsMinimumQuoteSettlement,
  parseAtomicUnits,
  quoteAtomsForFill,
  quoteAtomsForFills,
} from "./units.ts";

export const SESSION_PZEC_ATOMS = 100_00000000n;
export const SESSION_QUOTE_ATOMS = 10_000_000000n;
export const USER_ORDER_PREFIX = "user-";

export type PaperAccount = {
  pzecAtoms: bigint;
  quoteAtoms: bigint;
  reservedPzecAtoms: bigint;
  reservedQuoteAtoms: bigint;
};

export type UserFill = Fill & {
  id: string;
  marketId: MarketId;
  takerId: string;
  time: string;
};

export function seedPaperAccount(): PaperAccount {
  return {
    pzecAtoms: SESSION_PZEC_ATOMS,
    quoteAtoms: SESSION_QUOTE_ATOMS,
    reservedPzecAtoms: 0n,
    reservedQuoteAtoms: 0n,
  };
}

export function availablePzec(account: PaperAccount): bigint {
  return account.pzecAtoms - account.reservedPzecAtoms;
}

export function availableQuote(account: PaperAccount): bigint {
  return account.quoteAtoms - account.reservedQuoteAtoms;
}

export function seedBook(marketId: MarketId): Book {
  const lastTicks = parseAtomicUnits(markets[marketId].last.toFixed(PRICE_DECIMALS), PRICE_DECIMALS);
  let book = emptyBook(lastTicks);
  const fixture = books[marketId];

  fixture.asks.forEach((level, index) => {
    book = submitOrder(book, {
      id: `venue-ask-${marketId}-${index}`,
      side: "sell",
      tif: "GTC",
      priceTicks: parseAtomicUnits(level.price.toFixed(PRICE_DECIMALS), PRICE_DECIMALS),
      sizeAtoms: parseAtomicUnits(level.size.toFixed(2), PZEC_DECIMALS),
    }).book;
  });
  fixture.bids.forEach((level, index) => {
    book = submitOrder(book, {
      id: `venue-bid-${marketId}-${index}`,
      side: "buy",
      tif: "GTC",
      priceTicks: parseAtomicUnits(level.price.toFixed(PRICE_DECIMALS), PRICE_DECIMALS),
      sizeAtoms: parseAtomicUnits(level.size.toFixed(2), PZEC_DECIMALS),
    }).book;
  });

  return book;
}

export function collateralRequired(side: OrderSide, sizeAtoms: bigint, priceTicks: bigint): bigint {
  return side === "buy" ? quoteAtomsForFill(sizeAtoms, priceTicks, "up") : sizeAtoms;
}

export function canCover(account: PaperAccount, side: OrderSide, sizeAtoms: bigint, priceTicks: bigint): boolean {
  if (!meetsMinimumQuoteSettlement(sizeAtoms, priceTicks)) {
    return false;
  }
  const required = collateralRequired(side, sizeAtoms, priceTicks);
  return side === "buy" ? availableQuote(account) >= required : availablePzec(account) >= required;
}

export function wouldSelfTrade(fills: readonly Fill[]): boolean {
  return fills.some((fill) => fill.makerId.startsWith(USER_ORDER_PREFIX));
}

export function applyUserFills(
  account: PaperAccount,
  side: OrderSide,
  fills: readonly Fill[],
): PaperAccount {
  const filledAtoms = fills.reduce((total, fill) => total + fill.sizeAtoms, 0n);
  const quoteAtoms = quoteAtomsForFills(fills, side === "buy" ? "up" : "down");
  const next = { ...account };
  if (side === "buy") {
    next.pzecAtoms += filledAtoms;
    next.quoteAtoms -= quoteAtoms;
  } else {
    next.pzecAtoms -= filledAtoms;
    next.quoteAtoms += quoteAtoms;
  }
  return next;
}

export function reserveRemainder(
  account: PaperAccount,
  side: OrderSide,
  remainingAtoms: bigint,
  priceTicks: bigint,
): PaperAccount {
  if (remainingAtoms <= 0n) {
    return account;
  }
  if (side === "buy") {
    return {
      ...account,
      reservedQuoteAtoms: account.reservedQuoteAtoms + quoteAtomsForFill(remainingAtoms, priceTicks, "up"),
    };
  }
  return { ...account, reservedPzecAtoms: account.reservedPzecAtoms + remainingAtoms };
}

export function releaseRestingOrder(account: PaperAccount, order: RestingOrder): PaperAccount {
  if (order.side === "buy") {
    return {
      ...account,
      reservedQuoteAtoms: account.reservedQuoteAtoms - quoteAtomsForFill(order.remainingAtoms, order.priceTicks, "up"),
    };
  }
  return { ...account, reservedPzecAtoms: account.reservedPzecAtoms - order.remainingAtoms };
}

export function applySubmit(
  account: PaperAccount,
  order: { side: OrderSide; sizeAtoms: bigint; priceTicks: bigint; tif: TimeInForce },
  result: SubmitResult,
): { account: PaperAccount; blockedReason?: string } {
  if (!meetsMinimumQuoteSettlement(order.sizeAtoms, order.priceTicks)) {
    return { account, blockedReason: "Order notional must settle to at least one quote atom." };
  }
  if (result.status === "rejected") {
    return { account };
  }

  const fillQuoteAtoms = quoteAtomsForFills(result.fills, order.side === "buy" ? "up" : "down");
  if (result.fills.length > 0 && fillQuoteAtoms === 0n) {
    return { account, blockedReason: "Executed notional must settle to at least one quote atom." };
  }
  const filledPzecAtoms = result.fills.reduce((total, fill) => total + fill.sizeAtoms, 0n);
  const restingPzecAtoms = result.status === "open" ? result.remainingAtoms : 0n;
  const restingQuoteAtoms = order.side === "buy" && restingPzecAtoms > 0n
    ? quoteAtomsForFill(restingPzecAtoms, order.priceTicks, "up")
    : 0n;
  const required = order.side === "buy"
    ? fillQuoteAtoms + restingQuoteAtoms
    : filledPzecAtoms + restingPzecAtoms;
  const available = order.side === "buy" ? availableQuote(account) : availablePzec(account);
  if (available < required) {
    return {
      account,
      blockedReason: order.side === "buy"
        ? "Session quote inventory is insufficient."
        : "Session pZEC inventory is insufficient.",
    };
  }

  let next = applyUserFills(account, order.side, result.fills);
  if (result.status === "open") {
    next = reserveRemainder(next, order.side, result.remainingAtoms, order.priceTicks);
  }
  return { account: next };
}

export function formatFillTime(date = new Date()): string {
  return date.toISOString().slice(11, 19);
}

export function describeSubmit(result: SubmitResult, marketId: MarketId): string {
  const fillSummary = result.fills.length === 0
    ? "no fills"
    : result.fills
      .map((fill) => `${formatAtomicUnits(fill.sizeAtoms, PZEC_DECIMALS)} pZEC at ${formatAtomicUnits(fill.priceTicks, PRICE_DECIMALS, 2)}`)
      .join("; ");

  if (result.status === "rejected") {
    return result.reason ?? "Order rejected.";
  }
  if (result.status === "filled") {
    return `Filled against the local ${marketId} book: ${fillSummary}.`;
  }
  if (result.status === "cancelled") {
    const prefix = result.reason ?? "Immediate-or-cancel finished";
    return `${prefix} with ${fillSummary}. Unfilled size was cancelled.`;
  }
  return `Resting on the local ${marketId} book with ${formatAtomicUnits(result.remainingAtoms, PZEC_DECIMALS)} pZEC remaining. Fills: ${fillSummary}.`;
}

export function userOrders(book: Book): RestingOrder[] {
  return [...book.bids, ...book.asks].filter((order) => order.id.startsWith(USER_ORDER_PREFIX));
}

export function markToMarketQuote(account: PaperAccount, lastTicks: bigint): bigint {
  return account.quoteAtoms + quoteAtomsForFill(account.pzecAtoms, lastTicks, "down");
}

export function startingMarkQuote(lastTicks: bigint): bigint {
  return SESSION_QUOTE_ATOMS + quoteAtomsForFill(SESSION_PZEC_ATOMS, lastTicks, "down");
}
