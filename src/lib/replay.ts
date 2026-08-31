import { cancelOrder, submitOrder, type Book, type OrderSide, type TimeInForce } from "./matcher.ts";
import type { MarketId } from "./market-data.ts";
import {
  applySubmit,
  releaseRestingOrder,
  seedBook,
  seedPaperAccount,
  wouldSelfTrade,
  type PaperAccount,
} from "./session.ts";

export type LoggedSubmit = {
  kind: "submit";
  marketId: MarketId;
  id: string;
  side: OrderSide;
  tif: TimeInForce;
  priceTicks: bigint;
  sizeAtoms: bigint;
  expiryUnix?: bigint;
};

export type LoggedCancel = {
  kind: "cancel";
  marketId: MarketId;
  orderId: string;
};

export type LoggedReset = {
  kind: "reset";
};

export type SessionLogEvent = LoggedSubmit | LoggedCancel | LoggedReset;

export function emptySession(): {
  books: Record<MarketId, Book>;
  accounts: Record<MarketId, PaperAccount>;
} {
  return {
    books: {
      "ZEC/USDC": seedBook("ZEC/USDC"),
      "ZEC/USDT": seedBook("ZEC/USDT"),
    },
    accounts: {
      "ZEC/USDC": seedPaperAccount(),
      "ZEC/USDT": seedPaperAccount(),
    },
  };
}

export function replayLog(events: readonly SessionLogEvent[]): {
  books: Record<MarketId, Book>;
  accounts: Record<MarketId, PaperAccount>;
} {
  let state = emptySession();

  for (const event of events) {
    if (event.kind === "reset") {
      state = emptySession();
      continue;
    }

    if (event.kind === "cancel") {
      const book = state.books[event.marketId];
      const resting = [...book.bids, ...book.asks].find((order) => order.id === event.orderId);
      if (!resting) {
        continue;
      }
      state = {
        books: { ...state.books, [event.marketId]: cancelOrder(book, event.orderId) },
        accounts: {
          ...state.accounts,
          [event.marketId]: releaseRestingOrder(state.accounts[event.marketId], resting),
        },
      };
      continue;
    }

    const book = state.books[event.marketId];
    const result = submitOrder(book, event);
    if (wouldSelfTrade(result.fills)) {
      continue;
    }
    const applied = applySubmit(state.accounts[event.marketId], event, result);
    if (applied.blockedReason) {
      continue;
    }
    state = {
      books: { ...state.books, [event.marketId]: result.book },
      accounts: { ...state.accounts, [event.marketId]: applied.account },
    };
  }

  return state;
}

export function snapshotKey(state: ReturnType<typeof replayLog>): string {
  const markets: MarketId[] = ["ZEC/USDC", "ZEC/USDT"];
  return markets.map((marketId) => {
    const book = state.books[marketId];
    const account = state.accounts[marketId];
    const rest = [...book.bids, ...book.asks]
      .map((order) => `${order.id}:${order.side}:${order.priceTicks}:${order.remainingAtoms}`)
      .join(",");
    return `${marketId}|${book.lastTicks}|${rest}|${account.pzecAtoms}|${account.quoteAtoms}|${account.reservedPzecAtoms}|${account.reservedQuoteAtoms}`;
  }).join(";");
}
