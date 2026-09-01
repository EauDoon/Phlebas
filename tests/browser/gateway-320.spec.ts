import { expect, test } from "./fixtures";
import { gatewayOffCopy, gatewayUnavailableCopy } from "../../src/lib/gateway-copy.ts";
import { payoutClaimForTourStep, payoutClaimStubCopy } from "../../src/lib/payout.ts";

test("320px gateway empty error and retry stay non-receivable", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/trade?view=bridge", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "ZEC gateway" })).toBeVisible();
  await expect(page.getByText("ZEC to pZEC")).toHaveCount(0);
  await expect(page.getByText(gatewayOffCopy())).toBeVisible();
  await expect(page.getByText("tex1", { exact: false })).toHaveCount(0);

  const issue = page.getByRole("button", { name: "Issue testnet TEX" });
  await issue.click();
  await expect(page.getByText(gatewayUnavailableCopy())).toBeVisible();
  await expect(page.getByText("tex1", { exact: false })).toHaveCount(0);

  await issue.click();
  await expect(page.getByText(gatewayUnavailableCopy())).toBeVisible();
  await expect(page.getByText("tex1", { exact: false })).toHaveCount(0);
  await expect(page.getByText(payoutClaimStubCopy(payoutClaimForTourStep("payable", "t1Zo4ZzPXJiJ8M8pYMgL4tWbdkH7c8r7abc")))).toHaveCount(0);
  await expect(page.getByRole("img", { name: "Placeholder QR. Not payable." })).toBeVisible();
});
