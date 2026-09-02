import type { Market } from "./market-data.ts";
import { publicLinkabilityCopy } from "./review-copy.ts";
import type { TicketSide } from "./ticket-groups.ts";

export const TICKET_REVIEW_COMPLETE = "Nothing was signed or submitted.";

export type TicketReviewRow = {
  label: string;
  value: string;
};

export function ticketReviewCompleteCopy(): string {
  return TICKET_REVIEW_COMPLETE;
}

export function ticketReviewFeeCopy(): string {
  return "Zero protocol fee";
}

export function ticketReviewNetworksCopy(): string {
  return "Zcash and EVM";
}

export function ticketReviewRefundCopy(): string {
  return "Signed deadlines make refunds eligible: quote first, then ZEC. Wallets must claim refunds.";
}

export function ticketReviewSettlementCopy(settlementPair: Market["settlementPair"]): string {
  return settlementPair;
}

export function ticketReviewNoticeCopy(): string {
  return "This ticket labels native ZEC. It is not live settlement.";
}

export function ticketReviewActionCopy(side: TicketSide): string {
  return `Review ${side}`;
}

export function ticketCompleteActionCopy(side: TicketSide): string {
  return `Complete ${side}`;
}

export function ticketRetryFeedCopy(): string {
  return "Retry illustrative feed";
}

export function ticketIdleNoticeCopy(): string {
  return "Session inventory is not a wallet.";
}

export function ticketReviewRows(input: {
  side: TicketSide;
  sizeLabel: string;
  priceLabel: string;
  settlementPair: Market["settlementPair"];
}): TicketReviewRow[] {
  return [
    { label: "Side", value: input.side === "buy" ? "Buy" : "Sell" },
    { label: "Size", value: input.sizeLabel },
    { label: "Price", value: input.priceLabel },
    { label: "Settlement pair", value: ticketReviewSettlementCopy(input.settlementPair) },
    { label: "Networks", value: ticketReviewNetworksCopy() },
    { label: "Fee", value: ticketReviewFeeCopy() },
    { label: "Refund", value: ticketReviewRefundCopy() },
    { label: "Public linkability", value: publicLinkabilityCopy("fill") },
  ];
}
