import { type Locator } from "@playwright/test";

import { expect, test } from "./fixtures";
import {
  tapeCaptionCopy,
  tapeMiniLabel,
  tapeSideCopy,
} from "../../src/lib/market-state.ts";

async function visibleTextWithoutSrOnly(target: Locator): Promise<string> {
  return target.evaluate((el) => {
    const clone = el.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("[class*='srOnly']").forEach((node) => node.remove());
    return (clone.textContent ?? "").replace(/\s+/g, " ").trim();
  });
}

test("320px tape Buy and Sell are visible side labels", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/trade", { waitUntil: "networkidle" });

  const tape = page.getByRole("region", { name: "Recent trades" });
  await expect(tape.getByRole("heading", { name: "Recent trades" })).toBeVisible();
  await expect(tape.getByText(tapeMiniLabel(false, true, "ZEC-USDC"), { exact: true })).toBeVisible();

  const table = tape.getByRole("table", { name: tapeCaptionCopy("ZEC/USDC", false) });
  await expect(table).toBeVisible();

  const buyLabel = tapeSideCopy("buy");
  const sellLabel = tapeSideCopy("sell");

  await expect(table.getByText(buyLabel).first()).toBeVisible();
  await expect(table.getByText(sellLabel).first()).toBeVisible();

  const tapeVisible = await visibleTextWithoutSrOnly(table);
  expect(tapeVisible).toContain(buyLabel);
  expect(tapeVisible).toContain(sellLabel);

  const buyRow = table.getByRole("rowheader", { name: buyLabel }).first();
  await expect(buyRow).toBeVisible();
  expect(await visibleTextWithoutSrOnly(buyRow)).toContain(buyLabel);

  const sellRow = table.getByRole("rowheader", { name: sellLabel }).first();
  await expect(sellRow).toBeVisible();
  expect(await visibleTextWithoutSrOnly(sellRow)).toContain(sellLabel);
});
