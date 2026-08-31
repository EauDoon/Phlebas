import { expect, test } from "./fixtures";
import { lpFeedBlockCopy } from "../../src/lib/lp.ts";
import { loadingGateCopy, staleGateCopy } from "../../src/lib/market-state.ts";

const SETTLEMENT_PAIR = "ZEC-USDC" as const;

test("320px LP loading feed disables mint and retries", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/liquidity?feed=loading", { waitUntil: "networkidle" });
  await expect(page.getByRole("button", { name: "Review simulated mint" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Review simulated swap" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Burn session shares" })).toBeEnabled();
  await expect(page.getByText("Loading market data", { exact: true })).toBeVisible();
  await expect(page.getByText(loadingGateCopy(SETTLEMENT_PAIR))).toBeVisible();
  await expect(page.getByText(lpFeedBlockCopy())).toBeVisible();
  await page.getByRole("button", { name: "Retry illustrative feed" }).click();
  await expect(page.getByRole("button", { name: "Review simulated mint" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Review simulated swap" })).toBeEnabled();
});

test("320px LP stale feed disables mint and retries", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/liquidity?feed=stale", { waitUntil: "networkidle" });
  await expect(page.getByRole("button", { name: "Review simulated mint" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Review simulated swap" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Burn session shares" })).toBeEnabled();
  await expect(page.getByText("Market data stale", { exact: true })).toBeVisible();
  await expect(page.getByText(staleGateCopy(SETTLEMENT_PAIR))).toBeVisible();
  await expect(page.getByText(lpFeedBlockCopy())).toBeVisible();
  await page.getByRole("button", { name: "Retry illustrative feed" }).click();
  await expect(page.getByRole("button", { name: "Review simulated mint" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Review simulated swap" })).toBeEnabled();
});
