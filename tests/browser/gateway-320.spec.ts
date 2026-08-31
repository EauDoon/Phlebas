import { expect, test } from "./fixtures";
import { gatewayOffCopy, gatewayUnavailableCopy } from "../../src/lib/gateway-copy.ts";

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
  await expect(page.getByText("Stub claim: payable")).toHaveCount(0);
  await expect(page.getByRole("img", { name: "Placeholder QR. Not payable." })).toBeVisible();
});
