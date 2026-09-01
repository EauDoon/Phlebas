import {
  meetsMinimumQuoteSettlement,
  minimumSizeAtomsForQuoteSettlement,
} from "./units.ts";

export type OrderSide = "buy" | "sell";
export type TimeInForce = "GTC" | "IOC" | "FOK";

export type RestingOrder = {
  id: string;
  side: OrderSide;
  priceTicks: bigint;
  remainingAtoms: bigint;
  seq: number;
  expiryUnix?: bigint;
};

export type Fill = {
  makerId: string;
  takerSide: OrderSide;
  priceTicks: bigint;
  /** 8-decimal ZEC atoms. Named sizeAtoms because the matcher is pair-agnostic. */
  sizeAtoms: bigint;
};

export type Book = {
  bids: RestingOrder[];
  asks: RestingOrder[];
  seq: number;
  lastTicks: bigint;
};

export type SubmitResult = {
  book: Book;
  fills: Fill[];
  remainingAtoms: bigint;
  status: "open" | "filled" | "cancelled" | "rejected";
  reason?: string;
};

function cloneBook(book: Book): Book {
  return {
    bids: book.bids.map((order) => ({ ...order })),
    asks: book.asks.map((order) => ({ ...order })),
    seq: book.seq,
    lastTicks: book.lastTicks,
  };
}

function sortBids(orders: RestingOrder[]) {
  orders.sort((left, right) => {
    if (left.priceTicks === right.priceTicks) return left.seq - right.seq;
    return left.priceTicks > right.priceTicks ? -1 : 1;
  });
}

function sortAsks(orders: RestingOrder[]) {
  orders.sort((left, right) => {
    if (left.priceTicks === right.priceTicks) return left.seq - right.seq;
    return left.priceTicks < right.priceTicks ? -1 : 1;
  });
}

function pricesCross(side: OrderSide, takerTicks: bigint, makerTicks: bigint): boolean {
  return side === "buy" ? takerTicks >= makerTicks : takerTicks <= makerTicks;
}

function matchAgainst(
  book: Book,
  side: OrderSide,
  limitTicks: bigint,
  sizeAtoms: bigint,
): { fills: Fill[]; remainingAtoms: bigint; blockedByDust: boolean } {
  const resting = side === "buy" ? book.asks : book.bids;
  const fills: Fill[] = [];
  let remaining = sizeAtoms;
  let blockedByDust = false;

  while (remaining > 0n && resting.length > 0) {
    const maker = resting[0];
    if (!pricesCross(side, limitTicks, maker.priceTicks)) break;
    let traded = remaining < maker.remainingAtoms ? remaining : maker.remainingAtoms;
    const minimumSettlementSize = minimumSizeAtomsForQuoteSettlement(maker.priceTicks);
    if (traded < minimumSettlementSize) {
      blockedByDust = true;
      break;
    }
    if (traded < maker.remainingAtoms) {
      if (maker.remainingAtoms - traded < minimumSettlementSize) {
        traded = maker.remainingAtoms - minimumSettlementSize;
      }
    }
    if (traded < minimumSettlementSize) {
      blockedByDust = true;
      break;
    }
    fills.push({
      makerId: maker.id,
      takerSide: side,
      priceTicks: maker.priceTicks,
      sizeAtoms: traded,
    });
    remaining -= traded;
    maker.remainingAtoms -= traded;
    book.lastTicks = maker.priceTicks;
    if (maker.remainingAtoms === 0n) resting.shift();
  }

  return { fills, remainingAtoms: remaining, blockedByDust };
}

export function emptyBook(lastTicks: bigint): Book {
  return { bids: [], asks: [], seq: 0, lastTicks };
}

export function orderExpired(expiryUnix: bigint | undefined, nowUnix: bigint | undefined): boolean {
  return (expiryUnix ?? 0n) > 0n && nowUnix !== undefined && nowUnix > (expiryUnix ?? 0n);
}

export function expireRestingOrders(book: Book, nowUnix: bigint): { book: Book; expired: RestingOrder[] } {
  const expired: RestingOrder[] = [];
  const next = cloneBook(book);
  const keep = (order: RestingOrder) => {
    if (orderExpired(order.expiryUnix, nowUnix)) {
      expired.push(order);
      return false;
    }
    return true;
  };
  next.bids = next.bids.filter(keep);
  next.asks = next.asks.filter(keep);
  return { book: next, expired };
}

export function submitOrder(
  book: Book,
  order: {
    id: string;
    side: OrderSide;
    tif: TimeInForce;
    priceTicks: bigint;
    sizeAtoms: bigint;
    expiryUnix?: bigint;
    nowUnix?: bigint;
  },
): SubmitResult {
  if (orderExpired(order.expiryUnix, order.nowUnix)) {
    return { book, fills: [], remainingAtoms: order.sizeAtoms, status: "rejected", reason: "Order expiry has passed" };
  }
  if (order.sizeAtoms <= 0n || order.priceTicks <= 0n) {
    return { book, fills: [], remainingAtoms: order.sizeAtoms, status: "rejected", reason: "Size and price must be positive" };
  }
  if (!meetsMinimumQuoteSettlement(order.sizeAtoms, order.priceTicks)) {
    return {
      book,
      fills: [],
      remainingAtoms: order.sizeAtoms,
      status: "rejected",
      reason: "Order notional must settle to at least one quote atom",
    };
  }

  const next = cloneBook(book);
  const preview = matchAgainst(cloneBook(book), order.side, order.priceTicks, order.sizeAtoms);
  if (order.tif === "FOK" && preview.remainingAtoms > 0n) {
    return { book, fills: [], remainingAtoms: order.sizeAtoms, status: "rejected", reason: "Fill-or-kill could not fill in full" };
  }

  const matched = matchAgainst(next, order.side, order.priceTicks, order.sizeAtoms);
  if (matched.remainingAtoms === 0n) {
    return { book: next, fills: matched.fills, remainingAtoms: 0n, status: "filled" };
  }
  if (order.tif === "IOC") {
    return { book: next, fills: matched.fills, remainingAtoms: matched.remainingAtoms, status: "cancelled" };
  }
  if (matched.blockedByDust) {
    return {
      book: next,
      fills: matched.fills,
      remainingAtoms: matched.remainingAtoms,
      status: "cancelled",
      reason: "Dust-blocked crossed remainder was cancelled",
    };
  }
  if (!meetsMinimumQuoteSettlement(matched.remainingAtoms, order.priceTicks)) {
    return {
      book: next,
      fills: matched.fills,
      remainingAtoms: matched.remainingAtoms,
      status: "cancelled",
      reason: "Unsettleable remainder was cancelled",
    };
  }

  next.seq += 1;
  const rest: RestingOrder = {
    id: order.id,
    side: order.side,
    priceTicks: order.priceTicks,
    remainingAtoms: matched.remainingAtoms,
    seq: next.seq,
    ...((order.expiryUnix ?? 0n) > 0n ? { expiryUnix: order.expiryUnix } : {}),
  };
  if (order.side === "buy") {
    next.bids.push(rest);
    sortBids(next.bids);
  } else {
    next.asks.push(rest);
    sortAsks(next.asks);
  }
  return { book: next, fills: matched.fills, remainingAtoms: matched.remainingAtoms, status: "open" };
}

export function cancelOrder(book: Book, orderId: string): Book {
  const next = cloneBook(book);
  next.bids = next.bids.filter((order) => order.id !== orderId);
  next.asks = next.asks.filter((order) => order.id !== orderId);
  return next;
}

export function levelsFromBook(book: Book, side: OrderSide): Array<{ priceTicks: bigint; sizeAtoms: bigint; totalAtoms: bigint }> {
  const grouped = new Map<string, bigint>();
  const orders = side === "buy" ? book.bids : book.asks;
  for (const order of orders) {
    const key = order.priceTicks.toString();
    grouped.set(key, (grouped.get(key) ?? 0n) + order.remainingAtoms);
  }
  const prices = [...grouped.keys()].map((key) => BigInt(key));
  prices.sort((left, right) => side === "buy" ? (left > right ? -1 : 1) : (left < right ? -1 : 1));
  let total = 0n;
  return prices.map((priceTicks) => {
    const sizeAtoms = grouped.get(priceTicks.toString()) ?? 0n;
    total += sizeAtoms;
    return { priceTicks, sizeAtoms, totalAtoms: total };
  });
}
