import { expect, test } from "./fixtures";
import { emptyShareCopy, lpFeedBlockCopy, lpRiskCopy } from "../../src/lib/lp.ts";

test("320px LP empty shares and toxic-flow risk copy", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/liquidity", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Burn session shares" }).click();
  await expect(page.getByText(emptyShareCopy("ZEC/USDC"))).toBeVisible();
  await expect(page.getByText(lpRiskCopy())).toBeVisible();
  await page.getByRole("radio", { name: "ZEC/USDT" }).click();
  await page.getByRole("button", { name: "Burn session shares" }).click();
  await expect(page.getByText(emptyShareCopy("ZEC/USDT"))).toBeVisible();
});

test("320px LP unavailable feed disables mint and retries", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/liquidity?feed=unavailable", { waitUntil: "networkidle" });
  await expect(page.getByRole("button", { name: "Review simulated mint" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Review simulated swap" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Burn session shares" })).toBeEnabled();
  await expect(page.getByText(lpFeedBlockCopy())).toBeVisible();
  await page.getByRole("button", { name: "Retry illustrative feed" }).click();
  await expect(page.getByRole("button", { name: "Review simulated mint" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Review simulated swap" })).toBeEnabled();
});
