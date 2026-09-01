import { expect, test } from "./fixtures";
import {
  feedWithheldCopy,
  ticketGate,
  unavailableGateCopy,
} from "../../src/lib/market-state.ts";

const SETTLEMENT_PAIR = "ZEC-USDC" as const;
const USDT_SETTLEMENT_PAIR = "ZEC-USDT" as const;
const REVIEW_BUY = "Review buy";
const COMPLETE_BUY = "Complete buy";
const RETRY_FEED = "Retry illustrative feed";

test("320px ticket unavailable gate disables review and retries", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/trade?feed=unavailable", { waitUntil: "networkidle" });

  const gate = ticketGate("unavailable", false, SETTLEMENT_PAIR);
  const ticket = page.locator("#order-ticket");
  const blocked = ticket.getByRole("status", { name: "Ticket blocked" });
  await expect(page.getByRole("button", { name: REVIEW_BUY })).toBeDisabled();
  await expect(page.getByText(gate.heading, { exact: true }).first()).toBeVisible();
  await expect(page.getByText(unavailableGateCopy(SETTLEMENT_PAIR))).toBeVisible();
  await expect(page.getByText(feedWithheldCopy("unavailable", SETTLEMENT_PAIR)).first()).toBeVisible();
  await expect(page.getByRole("button", { name: COMPLETE_BUY })).toHaveCount(0);
  await expect(blocked).toBeVisible();
  await expect(blocked.getByText(gate.heading, { exact: true })).toBeVisible();
  await expect(blocked.getByText(gate.message, { exact: true })).toBeVisible();
  await expect(blocked.getByRole("button", { name: RETRY_FEED })).toBeVisible();

  await page.getByRole("button", { name: RETRY_FEED }).click();
  await expect(page.getByRole("button", { name: REVIEW_BUY })).toBeEnabled();
  await expect(page.getByRole("button", { name: COMPLETE_BUY })).toHaveCount(0);
  await expect(ticket.getByRole("status", { name: "Ticket blocked" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: RETRY_FEED })).toHaveCount(0);
});

test("320px ticket unavailable gate names ZEC-USDT after market switch", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/trade?feed=unavailable", { waitUntil: "networkidle" });
  await page.getByRole("radio", { name: /ZEC \/ USDT|ZEC\/USDT/ }).click();
  await expect(page.getByRole("button", { name: REVIEW_BUY })).toBeDisabled();
  await expect(page.getByText(unavailableGateCopy(USDT_SETTLEMENT_PAIR))).toBeVisible();
  await expect(page.getByText(feedWithheldCopy("unavailable", USDT_SETTLEMENT_PAIR)).first()).toBeVisible();
  await expect(page.getByRole("button", { name: COMPLETE_BUY })).toHaveCount(0);
  const blocked = page.locator("#order-ticket").getByRole("status", { name: "Ticket blocked" });
  await expect(blocked).toBeVisible();
  await expect(blocked.getByText(unavailableGateCopy(USDT_SETTLEMENT_PAIR), { exact: true })).toBeVisible();
  await expect(blocked.getByRole("button", { name: RETRY_FEED })).toBeVisible();
});
