import { expect, test } from "./fixtures";
import { sideControlCopy } from "../../src/lib/order.ts";

test("320px ticket B and S shortcuts set Buy and Sell", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/trade", { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Order entry" }).click();

  const side = page.getByRole("group", { name: "Order side" });
  await expect(side.getByRole("button", { name: sideControlCopy("buy", true), exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(side.getByRole("button", { name: sideControlCopy("sell", false), exact: true })).toHaveAttribute("aria-pressed", "false");

  await page.keyboard.press("s");
  await expect(side.getByRole("button", { name: sideControlCopy("sell", true), exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(side.getByRole("button", { name: sideControlCopy("buy", false), exact: true })).toHaveAttribute("aria-pressed", "false");

  await page.keyboard.press("b");
  await expect(side.getByRole("button", { name: sideControlCopy("buy", true), exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(side.getByRole("button", { name: sideControlCopy("sell", false), exact: true })).toHaveAttribute("aria-pressed", "false");

  await page.goto("/trade?education=1", { waitUntil: "networkidle" });
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("s");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("heading", { name: "Order entry" }).click();
  await expect(side.getByRole("button", { name: sideControlCopy("buy", true), exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("s");
  await expect(side.getByRole("button", { name: sideControlCopy("sell", true), exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("b");
  await expect(side.getByRole("button", { name: sideControlCopy("buy", true), exact: true })).toHaveAttribute("aria-pressed", "true");
});
