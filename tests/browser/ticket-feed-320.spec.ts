import { type Page } from "@playwright/test";

import { expect, test } from "./fixtures";
import {
  emptyBookGateCopy,
  loadingGateCopy,
  staleGateCopy,
  ticketGate,
  type FeedStatus,
} from "../../src/lib/market-state.ts";

const SETTLEMENT_PAIR = "ZEC-USDC" as const;
const USDT_SETTLEMENT_PAIR = "ZEC-USDT" as const;
const REVIEW_BUY = "Review buy";
const COMPLETE_BUY = "Complete buy";
const RETRY_FEED = "Retry illustrative feed";

async function expectBlockedTicket(
  page: Page,
  status: Exclude<FeedStatus, "illustrative">,
  settlementPair: typeof SETTLEMENT_PAIR | typeof USDT_SETTLEMENT_PAIR,
) {
  const gate = ticketGate(status, status === "empty", settlementPair);
  const ticket = page.locator("#order-ticket");
  const blocked = ticket.getByRole("status", { name: "Ticket blocked" });
  const expectedMessage = `${gate.message}${gate.asOf ? ` As of ${gate.asOf}.` : ""}`;

  await expect(page.getByRole("button", { name: REVIEW_BUY })).toBeDisabled();
  await expect(page.getByRole("button", { name: COMPLETE_BUY })).toHaveCount(0);
  await expect(blocked).toBeVisible();
  await expect(blocked.getByText(gate.heading, { exact: true })).toBeVisible();
  await expect(blocked.getByText(expectedMessage, { exact: true })).toBeVisible();
  await expect(blocked.getByRole("button", { name: RETRY_FEED })).toBeVisible();
}

async function expectRetryClearsGate(page: Page) {
  await page.getByRole("button", { name: RETRY_FEED }).click();
  await expect(page.getByRole("button", { name: REVIEW_BUY })).toBeEnabled();
  await expect(page.getByRole("button", { name: COMPLETE_BUY })).toHaveCount(0);
  await expect(page.locator("#order-ticket").getByRole("status", { name: "Ticket blocked" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: RETRY_FEED })).toHaveCount(0);
}

test("320px ticket loading gate disables review and retries", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/trade?feed=loading", { waitUntil: "networkidle" });
  await expect(page.getByRole("button", { name: REVIEW_BUY })).toBeDisabled();
  await expect(page.getByText("Loading market data", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(loadingGateCopy(SETTLEMENT_PAIR))).toBeVisible();
  await expectBlockedTicket(page, "loading", SETTLEMENT_PAIR);
  await expectRetryClearsGate(page);
});

test("320px ticket stale gate disables review and retries", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/trade?feed=stale", { waitUntil: "networkidle" });
  await expect(page.getByRole("button", { name: REVIEW_BUY })).toBeDisabled();
  await expect(page.getByText(staleGateCopy(SETTLEMENT_PAIR))).toBeVisible();
  await expectBlockedTicket(page, "stale", SETTLEMENT_PAIR);
  await expectRetryClearsGate(page);
});

test("320px ticket empty book gate disables review", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/trade?feed=empty", { waitUntil: "networkidle" });
  await expect(page.getByRole("button", { name: REVIEW_BUY })).toBeDisabled();
  await expect(page.getByText(emptyBookGateCopy(SETTLEMENT_PAIR))).toBeVisible();
  await expectBlockedTicket(page, "empty", SETTLEMENT_PAIR);
  await expectRetryClearsGate(page);
});

test("320px ticket loading stale and empty gates name ZEC-USDT after market switch", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });

  await page.goto("/trade?feed=loading", { waitUntil: "networkidle" });
  await page.getByRole("radio", { name: "ZEC / USDT" }).click();
  await expect(page.getByRole("button", { name: REVIEW_BUY })).toBeDisabled();
  await expect(page.getByText(loadingGateCopy(USDT_SETTLEMENT_PAIR))).toBeVisible();
  await expectBlockedTicket(page, "loading", USDT_SETTLEMENT_PAIR);

  await page.goto("/trade?feed=stale", { waitUntil: "networkidle" });
  await page.getByRole("radio", { name: "ZEC / USDT" }).click();
  await expect(page.getByRole("button", { name: REVIEW_BUY })).toBeDisabled();
  await expect(page.getByText(staleGateCopy(USDT_SETTLEMENT_PAIR))).toBeVisible();
  await expectBlockedTicket(page, "stale", USDT_SETTLEMENT_PAIR);

  await page.goto("/trade?feed=empty", { waitUntil: "networkidle" });
  await page.getByRole("radio", { name: "ZEC / USDT" }).click();
  await expect(page.getByRole("button", { name: REVIEW_BUY })).toBeDisabled();
  await expect(page.getByText(emptyBookGateCopy(USDT_SETTLEMENT_PAIR))).toBeVisible();
  await expectBlockedTicket(page, "empty", USDT_SETTLEMENT_PAIR);
});
