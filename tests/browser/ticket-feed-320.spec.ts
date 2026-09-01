import { expect, test } from "./fixtures";
import { emptyBookGateCopy, loadingGateCopy, staleGateCopy } from "../../src/lib/market-state.ts";

const SETTLEMENT_PAIR = "ZEC-USDC" as const;

test("320px ticket loading gate disables review and retries", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/trade?feed=loading", { waitUntil: "networkidle" });
  await expect(page.getByRole("button", { name: "Review simulated buy" })).toBeDisabled();
  await expect(page.getByRole("status", { name: "Ticket blocked" }).getByText("Loading market data", { exact: true })).toBeVisible();
  await expect(page.getByText(loadingGateCopy(SETTLEMENT_PAIR))).toBeVisible();
  await page.getByRole("button", { name: "Retry illustrative feed" }).click();
  await expect(page.getByRole("button", { name: "Review simulated buy" })).toBeEnabled();
});

test("320px ticket stale gate disables review and retries", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/trade?feed=stale", { waitUntil: "networkidle" });
  await expect(page.getByRole("button", { name: "Review simulated buy" })).toBeDisabled();
  await expect(page.getByText(staleGateCopy(SETTLEMENT_PAIR))).toBeVisible();
  await page.getByRole("button", { name: "Retry illustrative feed" }).click();
  await expect(page.getByRole("button", { name: "Review simulated buy" })).toBeEnabled();
});

test("320px ticket empty book gate disables review", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/trade?feed=empty", { waitUntil: "networkidle" });
  await expect(page.getByRole("button", { name: "Review simulated buy" })).toBeDisabled();
  await expect(page.getByText(emptyBookGateCopy(SETTLEMENT_PAIR))).toBeVisible();
  await page.getByRole("button", { name: "Retry illustrative feed" }).click();
  await expect(page.getByRole("button", { name: "Review simulated buy" })).toBeEnabled();
});
