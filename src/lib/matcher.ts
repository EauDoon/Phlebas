export type OrderSide = "buy" | "sell";
export type TimeInForce = "GTC" | "IOC" | "FOK";

export type RestingOrder = {
  id: string;
  side: OrderSide;
  priceTicks: bigint;
  remainingAtoms: bigint;
  seq: number;
};

export type Fill = {
  makerId: string;
  takerSide: OrderSide;
  priceTicks: bigint;
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
): { fills: Fill[]; remainingAtoms: bigint } {
  const resting = side === "buy" ? book.asks : book.bids;
  const fills: Fill[] = [];
  let remaining = sizeAtoms;

  while (remaining > 0n && resting.length > 0) {
    const maker = resting[0];
    if (!pricesCross(side, limitTicks, maker.priceTicks)) break;
    const traded = remaining < maker.remainingAtoms ? remaining : maker.remainingAtoms;
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

  return { fills, remainingAtoms: remaining };
}

export function emptyBook(lastTicks: bigint): Book {
  return { bids: [], asks: [], seq: 0, lastTicks };
}

export function submitOrder(
  book: Book,
  order: {
    id: string;
    side: OrderSide;
    tif: TimeInForce;
    priceTicks: bigint;
    sizeAtoms: bigint;
  },
): SubmitResult {
  if (order.sizeAtoms <= 0n || order.priceTicks <= 0n) {
    return { book, fills: [], remainingAtoms: order.sizeAtoms, status: "rejected", reason: "Size and price must be positive" };
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

  next.seq += 1;
  const rest: RestingOrder = {
    id: order.id,
    side: order.side,
    priceTicks: order.priceTicks,
    remainingAtoms: matched.remainingAtoms,
    seq: next.seq,
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
