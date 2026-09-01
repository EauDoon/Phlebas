import type { ChartRange, Market } from "./market-data.ts";
import { markets, type MarketId } from "./market-data.ts";

export const FEED_STATUSES = ["illustrative", "loading", "empty", "stale", "unavailable"] as const;

export type FeedStatus = (typeof FEED_STATUSES)[number];

export const FEED_STATUS_LABELS: Record<FeedStatus, string> = {
  illustrative: "Illustrative",
  loading: "Loading",
  empty: "Empty",
  stale: "Stale",
  unavailable: "Unavailable",
};

export function nextFeedStatus(id: FeedStatus, delta: number): FeedStatus {
  const count = FEED_STATUSES.length;
  const index = (FEED_STATUSES.indexOf(id) + delta + count) % count;
  return FEED_STATUSES[index];
}

export type TicketGate = {
  status: Exclude<FeedStatus, "loading"> | "loading" | "empty";
  canReview: boolean;
  heading: string;
  message: string;
  asOf: string | null;
};

export function isFeedStatus(value: string | undefined): value is FeedStatus {
  return FEED_STATUSES.includes(value as FeedStatus);
}

export function ticketGateCopy(
  message: string,
  settlementPair?: Market["settlementPair"],
): string {
  if (!settlementPair) return message;
  return `${message} Settled as ${settlementPair}.`;
}

export function emptyBookGateCopy(settlementPair: Market["settlementPair"]): string {
  return ticketGateCopy(
    "No resting depth. Review is disabled until the local book has size.",
    settlementPair,
  );
}

export function loadingGateCopy(settlementPair: Market["settlementPair"]): string {
  return ticketGateCopy(
    "The ticket is waiting for a book snapshot. Retry is safe; nothing was submitted.",
    settlementPair,
  );
}

export function staleGateCopy(settlementPair: Market["settlementPair"]): string {
  return ticketGateCopy(
    "The illustrative feed is marked delayed. Stale data cannot move from preview to confirm.",
    settlementPair,
  );
}

export function unavailableGateCopy(settlementPair: Market["settlementPair"]): string {
  return ticketGateCopy(
    "Integrity checks failed. Preview-to-sign is disabled. Retry is safe; nothing was submitted.",
    settlementPair,
  );
}

export function ticketGate(
  status: FeedStatus,
  bookEmpty: boolean,
  settlementPair?: Market["settlementPair"],
): TicketGate {
  if (status === "loading") {
    return {
      status: "loading",
      canReview: false,
      heading: "Loading market data",
      message: settlementPair
        ? loadingGateCopy(settlementPair)
        : "The ticket is waiting for a book snapshot. Retry is safe; nothing was submitted.",
      asOf: null,
    };
  }

  if (status === "unavailable") {
    return {
      status: "unavailable",
      canReview: false,
      heading: "Market data unavailable",
      message: settlementPair
        ? unavailableGateCopy(settlementPair)
        : "Integrity checks failed. Preview-to-sign is disabled. Retry is safe; nothing was submitted.",
      asOf: null,
    };
  }

  if (status === "stale") {
    return {
      status: "stale",
      canReview: false,
      heading: "Market data stale",
      message: settlementPair
        ? staleGateCopy(settlementPair)
        : "The illustrative feed is marked delayed. Stale data cannot move from preview to confirm.",
      asOf: "2026-08-30T16:32:08Z",
    };
  }

  if (status === "empty" || bookEmpty) {
    return {
      status: "empty",
      canReview: false,
      heading: "Order book empty",
      message: settlementPair
        ? emptyBookGateCopy(settlementPair)
        : "No resting depth. Review is disabled until the local book has size.",
      asOf: null,
    };
  }

  return {
    status: "illustrative",
    canReview: true,
    heading: "Illustrative",
    message: "Repository fixtures. Not a live, delayed, or production feed.",
    asOf: null,
  };
}

export type FeedSurface = {
  showFixtures: boolean;
  eyebrow: string;
  statsNote: string;
  heading: string;
  message: string;
};

export function feedSurface(status: FeedStatus): FeedSurface {
  const gate = ticketGate(status, status === "empty");
  if (status === "illustrative") {
    return {
      showFixtures: true,
      eyebrow: "Illustrative market data",
      statsNote: "24h figures are repository fixtures. Not a live, delayed, or production feed.",
      heading: gate.heading,
      message: gate.message,
    };
  }
  if (status === "stale") {
    return {
      showFixtures: true,
      eyebrow: gate.heading,
      statsNote: `24h figures stay fixture labels while market data is stale as of ${gate.asOf}.`,
      heading: gate.heading,
      message: gate.message,
    };
  }
  return {
    showFixtures: false,
    eyebrow: gate.heading,
    statsNote: `24h figures stay withheld. ${gate.message}`,
    heading: gate.heading,
    message: gate.message,
  };
}

export function feedSurfaceCopy(status: FeedStatus): { eyebrow: string; statsNote: string } {
  const surface = feedSurface(status);
  return { eyebrow: surface.eyebrow, statsNote: surface.statsNote };
}

export function depthEmptyCopy(settlementPair: Market["settlementPair"]): string {
  return `No resting depth. The local book is empty. Settled as ${settlementPair}.`;
}

export function feedWithheldCopy(status: FeedStatus, settlementPair: Market["settlementPair"]): string {
  const copy = {
    loading: "Loading market data. Chart and 24h stats are waiting for a snapshot. Retry is safe.",
    empty: "Order book empty. No 24h stats or chart series. The local book has no resting depth.",
    stale: "Market data stale. Delayed illustrative series. As of 2026-08-30T16:32:08Z.",
    unavailable: "Market data unavailable. Chart and 24h stats are withheld. Integrity checks failed.",
    illustrative: "Illustrative. Repository fixtures are visible.",
  } satisfies Record<FeedStatus, string>;
  return `${copy[status]} Settled as ${settlementPair}.`;
}

export function orderBookCaptionCopy(marketId: MarketId): string {
  const market = markets[marketId];
  return `Local ${marketId} order book, settled as ${market.settlementPair}. Totals are cumulative ZEC depth from the best price. Click a price to copy it into the ticket.`;
}

export function bookSideControlCopy(side: "bid" | "ask", priceLabel: string): string {
  return side === "ask" ? `Ask ${priceLabel}` : `Bid ${priceLabel}`;
}

export function tapeSideCopy(side: "buy" | "sell"): string {
  return side === "buy" ? "Buy" : "Sell";
}

export function depthSessionLastCopy(
  settlementPair: Market["settlementPair"],
  spreadLabel: string | null,
): string {
  return spreadLabel
    ? `session last · ${settlementPair} · spread ${spreadLabel}`
    : `session last · ${settlementPair}`;
}

export function tapeCaptionCopy(marketId: MarketId, withheld: boolean): string {
  const settlementPair = markets[marketId].settlementPair;
  if (withheld) {
    return `Recent ${marketId} trades withheld. Settled as ${settlementPair}. Public tape is not shown.`;
  }
  return `Recent ${marketId} trades settled as ${settlementPair}. Session fills appear first.`;
}

export function sessionLastStatLabel(
  settlementPair: Market["settlementPair"],
  showFixtures: boolean,
): string {
  return showFixtures ? `Session last · ${settlementPair}` : "Session last";
}

export function tapeMiniLabel(
  hasSessionTape: boolean,
  showFixtures: boolean,
  settlementPair: Market["settlementPair"],
): string {
  if (hasSessionTape) return "Session + public tape";
  if (showFixtures) return "Public tape";
  return `Withheld · ${settlementPair}`;
}

export function chartRangeTabLabel(
  range: ChartRange,
  settlementPair: Market["settlementPair"],
): string {
  return `${range} · ${settlementPair}`;
}

export function chartPanelHeadingCopy(marketId: MarketId): string {
  return `${marketId} · ${markets[marketId].settlementPair}`;
}

export function chartPanelEyebrowCopy(settlementPair: Market["settlementPair"]): string {
  return `Illustrative market data · ${settlementPair}`;
}

export function priceChartLabelCopy(marketId: MarketId, range: ChartRange): string {
  return `Illustrative ${range} price chart for ${marketId}, settled as ${markets[marketId].settlementPair}`;
}
