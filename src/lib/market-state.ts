import type { ChartRange, Market } from "./market-data.ts";
import { markets, type MarketId } from "./market-data.ts";

export const FEED_STATUSES = ["illustrative", "loading", "empty", "stale", "unavailable"] as const;

export type FeedStatus = (typeof FEED_STATUSES)[number];

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

export function feedSurface(status: FeedStatus): {
  showFixtures: boolean;
  heading: string;
  message: string;
} {
  if (status === "loading") {
    return {
      showFixtures: false,
      heading: "Loading market data",
      message: "Chart and 24h stats are waiting for a snapshot. Retry is safe.",
    };
  }
  if (status === "unavailable") {
    return {
      showFixtures: false,
      heading: "Market data unavailable",
      message: "Chart and 24h stats are withheld. Integrity checks failed.",
    };
  }
  if (status === "stale") {
    return {
      showFixtures: true,
      heading: "Market data stale",
      message: "Delayed illustrative series. As of 2026-08-30T16:32:08Z.",
    };
  }
  if (status === "empty") {
    return {
      showFixtures: false,
      heading: "Order book empty",
      message: "No 24h stats or chart series. The local book has no resting depth.",
    };
  }
  return {
    showFixtures: true,
    heading: "Illustrative",
    message: "Repository fixtures. Not a live, delayed, or production feed.",
  };
}

export function depthEmptyCopy(settlementPair: Market["settlementPair"]): string {
  return `No resting depth. The local book is empty. Settled as ${settlementPair}.`;
}

export function feedWithheldCopy(status: FeedStatus, settlementPair: Market["settlementPair"]): string {
  const surface = feedSurface(status);
  return `${surface.heading}. ${surface.message} Settled as ${settlementPair}.`;
}

export function orderBookCaptionCopy(marketId: MarketId): string {
  const market = markets[marketId];
  return `Local ${marketId} order book, settled as ${market.settlementPair}. Totals are cumulative ZEC depth from the best price. Click a price to copy it into the ticket.`;
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
    return `Recent ${marketId} trades withheld. Settled as ${settlementPair}. Fixture tape is not shown.`;
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
  if (hasSessionTape) return "Session + fixture";
  if (showFixtures) return "Fixture tape";
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
