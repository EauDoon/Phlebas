import { expect, test } from "./fixtures";
import { payoutClaimForTourStep, payoutClaimStubCopy } from "../../src/lib/payout.ts";

test("320px historical custody tour stays non-payable", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/trade?view=bridge", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Historical ZEC state tour" })).toBeVisible();
  await expect(page.getByText("ZEC to pZEC")).toHaveCount(0);
  await expect(page.getByText(/without generating addresses, receiving assets, or handing off to a wallet/)).toBeVisible();
  await expect(page.getByText("No address is generated, copied, or accepted by this application.")).toBeVisible();
  await expect(page.getByText("textest", { exact: false })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Issue testnet TEX" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Copy.*URI/ })).toHaveCount(0);
  await expect(page.getByText(payoutClaimStubCopy(payoutClaimForTourStep("payable", "t1Zo4ZzPXJiJ8M8pYMgL4tWbdkH7c8r7abc")))).toHaveCount(0);
  await expect(page.getByRole("img", { name: "Placeholder QR. Not payable." })).toBeVisible();
});
