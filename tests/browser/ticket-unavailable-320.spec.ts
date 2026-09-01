import { expect, test } from "./fixtures";
import {
  feedWithheldCopy,
  ticketGate,
  unavailableGateCopy,
} from "../../src/lib/market-state.ts";

const SETTLEMENT_PAIR = "ZEC-USDC" as const;

test("320px ticket unavailable gate disables review and retries", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/trade?feed=unavailable", { waitUntil: "networkidle" });

  const gate = ticketGate("unavailable", false, SETTLEMENT_PAIR);
  await expect(page.getByRole("button", { name: "Review buy" })).toBeDisabled();
  await expect(page.getByText(gate.heading, { exact: true }).first()).toBeVisible();
  await expect(page.getByText(unavailableGateCopy(SETTLEMENT_PAIR))).toBeVisible();
  await expect(page.getByText(feedWithheldCopy("unavailable", SETTLEMENT_PAIR)).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Complete buy" })).toHaveCount(0);

  await page.getByRole("button", { name: "Retry illustrative feed" }).click();
  await expect(page.getByRole("button", { name: "Review buy" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Complete buy" })).toHaveCount(0);
});
test("320px ticket unavailable gate names ZEC-USDT after market switch", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/trade?feed=unavailable", { waitUntil: "networkidle" });
  await page.getByRole("radio", { name: /ZEC \/ USDT|ZEC\/USDT/ }).click();
  await expect(page.getByRole("button", { name: "Review buy" })).toBeDisabled();
  await expect(page.getByText(unavailableGateCopy("ZEC-USDT"))).toBeVisible();
  await expect(page.getByText(feedWithheldCopy("unavailable", "ZEC-USDT")).first()).toBeVisible();
});
