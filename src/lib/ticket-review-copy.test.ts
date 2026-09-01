import assert from "node:assert/strict";
import test from "node:test";

import { publicLinkabilityCopy } from "./review-copy.ts";
import {
  TICKET_REVIEW_COMPLETE,
  ticketCompleteActionCopy,
  ticketIdleNoticeCopy,
  ticketReviewActionCopy,
  ticketReviewCompleteCopy,
  ticketReviewFeeCopy,
  ticketReviewNetworksCopy,
  ticketReviewNoticeCopy,
  ticketRetryFeedCopy,
  ticketReviewRefundCopy,
  ticketReviewRows,
  ticketReviewSettlementCopy,
} from "./ticket-review-copy.ts";

const BANNED_LABEL = /simulation|simulator|fixture|no-value|inspect|walkthrough|preview-only|illustrative fixture/i;

test("review copy states zero fee, completion sentence, and settlement pair", () => {
  const usdc = ticketReviewRows({
    side: "buy",
    sizeLabel: "1 ZEC",
    priceLabel: "52.91 USDC",
    settlementPair: "ZEC-USDC",
  });
  const usdt = ticketReviewRows({
    side: "sell",
    sizeLabel: "2 ZEC",
    priceLabel: "52.79 USDT",
    settlementPair: "ZEC-USDT",
  });

  assert.equal(ticketReviewCompleteCopy(), "Nothing was signed or submitted.");
  assert.equal(ticketReviewCompleteCopy(), TICKET_REVIEW_COMPLETE);
  assert.equal(ticketReviewFeeCopy(), "Zero protocol fee");
  assert.equal(ticketReviewSettlementCopy("ZEC-USDC"), "ZEC-USDC");
  assert.equal(ticketReviewSettlementCopy("ZEC-USDT"), "ZEC-USDT");
  assert.equal(usdc.find((row) => row.label === "Fee")?.value, ticketReviewFeeCopy());
  assert.equal(usdc.find((row) => row.label === "Settlement pair")?.value, "ZEC-USDC");
  assert.equal(usdt.find((row) => row.label === "Settlement pair")?.value, "ZEC-USDT");
  assert.notEqual(
    usdc.find((row) => row.label === "Settlement pair")?.value,
    usdt.find((row) => row.label === "Settlement pair")?.value,
  );
  assert.doesNotMatch(ticketReviewFeeCopy(), /5|15|bps/i);
  assert.doesNotMatch(usdc.map((row) => row.value).join("\n"), /5\s*\/\s*15|15 bps|5 bps/i);
});

test("review rows name networks, refund, and transparent ZEC linkability", () => {
  const rows = ticketReviewRows({
    side: "buy",
    sizeLabel: "1 ZEC",
    priceLabel: "52.91 USDC",
    settlementPair: "ZEC-USDC",
  });
  assert.equal(rows.find((row) => row.label === "Side")?.value, "Buy");
  assert.equal(rows.find((row) => row.label === "Size")?.value, "1 ZEC");
  assert.equal(rows.find((row) => row.label === "Price")?.value, "52.91 USDC");
  assert.equal(rows.find((row) => row.label === "Networks")?.value, ticketReviewNetworksCopy());
  assert.match(ticketReviewNetworksCopy(), /Zcash/);
  assert.match(ticketReviewNetworksCopy(), /EVM/);
  assert.equal(rows.find((row) => row.label === "Refund")?.value, ticketReviewRefundCopy());
  assert.match(ticketReviewRefundCopy(), /refund/i);
  assert.equal(rows.find((row) => row.label === "Public linkability")?.value, publicLinkabilityCopy("fill"));
  assert.match(publicLinkabilityCopy("fill"), /publicly linkable/);
});

test("review labels stay venue copy without operational or banned claims", () => {
  const shipped = [
    ticketReviewCompleteCopy(),
    ticketReviewFeeCopy(),
    ticketReviewNetworksCopy(),
    ticketReviewRefundCopy(),
    ticketReviewNoticeCopy(),
    ticketReviewActionCopy("buy"),
    ticketReviewActionCopy("sell"),
    ticketCompleteActionCopy("buy"),
    ticketCompleteActionCopy("sell"),
    ticketRetryFeedCopy(),
    ticketIdleNoticeCopy(),
    ...ticketReviewRows({
      side: "buy",
      sizeLabel: "1 ZEC",
      priceLabel: "52.91 USDC",
      settlementPair: "ZEC-USDC",
    }).flatMap((row) => [row.label, row.value]),
  ].join("\n");

  assert.equal(ticketReviewActionCopy("buy"), "Review buy");
  assert.equal(ticketCompleteActionCopy("sell"), "Complete sell");
  assert.match(ticketReviewNoticeCopy(), /It is not live settlement/);
  assert.doesNotMatch(shipped, BANNED_LABEL);
  assert.doesNotMatch(shipped, /\btrustless\b/i);
  assert.doesNotMatch(shipped, /\baudited\b/i);
  assert.doesNotMatch(shipped, /\blive exchange\b/i);
  assert.doesNotMatch(shipped, /\bpayable\b/i);
  assert.doesNotMatch(shipped, /\bshielded market\b/i);
  assert.doesNotMatch(shipped, /order-?(id|identifier)/i);
});
