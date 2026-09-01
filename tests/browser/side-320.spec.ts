import { expect, test } from "./fixtures";
import { sideControlCopy } from "../../src/lib/order.ts";

test("320px Buy and Sell selection is labeled in text", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/trade", { waitUntil: "networkidle" });

  const side = page.getByRole("group", { name: "Order side" });
  const selectedBuy = side.getByRole("button", { name: sideControlCopy("buy", true), exact: true });
  const unselectedSell = side.getByRole("button", { name: sideControlCopy("sell", false), exact: true });

  await expect(selectedBuy).toBeVisible();
  await expect(selectedBuy).toHaveAttribute("aria-pressed", "true");
  await expect(unselectedSell).toBeVisible();
  await expect(unselectedSell).toHaveAttribute("aria-pressed", "false");
  await expect(side.getByRole("button", { name: sideControlCopy("buy", false), exact: true })).toHaveCount(0);

  await unselectedSell.click();

  const selectedSell = side.getByRole("button", { name: sideControlCopy("sell", true), exact: true });
  const unselectedBuy = side.getByRole("button", { name: sideControlCopy("buy", false), exact: true });

  await expect(selectedSell).toBeVisible();
  await expect(selectedSell).toHaveAttribute("aria-pressed", "true");
  await expect(unselectedBuy).toBeVisible();
  await expect(unselectedBuy).toHaveAttribute("aria-pressed", "false");
});
