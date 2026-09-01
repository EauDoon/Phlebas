import { expect, test } from "./fixtures";
import { emptyShareCopy, lpFeedBlockCopy, lpRiskCopy } from "../../src/lib/lp.ts";

test("320px LP empty shares and toxic-flow risk copy", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/trade?view=architecture", { waitUntil: "networkidle" });
  await expect(page.getByText(emptyShareCopy("ZEC/USDC"))).toBeVisible();
  await expect(page.getByText(lpRiskCopy())).toBeVisible();
  await page.getByRole("radiogroup", { name: "Selected market" }).getByRole("radio", { name: /ZEC \/ USDT/ }).click();
  await expect(page.getByText(emptyShareCopy("ZEC/USDT"))).toBeVisible();
  await page.getByRole("button", { name: "Burn session shares" }).click();
  await expect(page.getByText(emptyShareCopy("ZEC/USDT")).first()).toBeVisible();
});
test("320px LP unavailable feed disables mint and retries", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/trade?view=architecture&feed=unavailable", { waitUntil: "networkidle" });
  await expect(page.getByRole("button", { name: "Review mint" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Review swap" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Burn session shares" })).toBeEnabled();
  await expect(page.getByText(lpFeedBlockCopy())).toBeVisible();
  await page.getByRole("button", { name: "Retry illustrative feed" }).click();
  await expect(page.getByRole("button", { name: "Review mint" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Review swap" })).toBeEnabled();
});
