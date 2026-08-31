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

export function ticketGate(status: FeedStatus, bookEmpty: boolean): TicketGate {
  if (status === "loading") {
    return {
      status: "loading",
      canReview: false,
      heading: "Loading market data",
      message: "The ticket is waiting for a book snapshot. Retry is safe; nothing was submitted.",
      asOf: null,
    };
  }

  if (status === "unavailable") {
    return {
      status: "unavailable",
      canReview: false,
      heading: "Market data unavailable",
      message: "Integrity checks failed. Preview-to-sign is disabled. Retry is safe; nothing was submitted.",
      asOf: null,
    };
  }

  if (status === "stale") {
    return {
      status: "stale",
      canReview: false,
      heading: "Market data stale",
      message: "The illustrative feed is marked delayed. Stale data cannot move from preview to confirm.",
      asOf: "2026-08-30T16:32:08Z",
    };
  }

  if (status === "empty" || bookEmpty) {
    return {
      status: "empty",
      canReview: false,
      heading: "Order book empty",
      message: "No resting depth. Review is disabled until the local book has size.",
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
