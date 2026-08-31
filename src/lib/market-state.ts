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
