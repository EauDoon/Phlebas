import { expect, test } from "./fixtures";
import { bookSideControlCopy } from "../../src/lib/market-state.ts";

test("320px book Bid and Ask controls are labeled", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/trade", { waitUntil: "networkidle" });

  const askName = bookSideControlCopy("ask", "52.91");
  const bidName = bookSideControlCopy("bid", "52.78");
  const ask = page.getByRole("button", { name: askName, exact: true });
  const bid = page.getByRole("button", { name: bidName, exact: true });

  await expect(ask).toBeVisible();
  await expect(bid).toBeVisible();
  await expect(ask).toHaveText(askName);
  await expect(bid).toHaveText(bidName);

  const askVisible = await ask.evaluate((el) => {
    const clone = el.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("[class*='srOnly']").forEach((node) => node.remove());
    return (clone.textContent ?? "").replace(/\s+/g, " ").trim();
  });
  expect(askVisible).toContain("Ask");
  expect(askVisible).toBe(askName);

  await ask.click();
  await expect(page.getByRole("textbox", { name: "Price in USDC" })).toHaveValue("52.91");
});
