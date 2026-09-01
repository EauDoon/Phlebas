import { submitOrder } from "../../src/lib/matcher.ts";
import { describeSubmit, seedBook } from "../../src/lib/session.ts";
import { parseAtomicUnits, PZEC_DECIMALS, PRICE_DECIMALS, worstPriceTicks } from "../../src/lib/units.ts";

import { expect, test } from "./fixtures";

async function expectNoHorizontalOverflow(page: {
  evaluate: (fn: () => { body: number; document: number }) => Promise<{ body: number; document: number }>;
}) {
  const overflow = await page.evaluate(() => ({
    body: document.body.scrollWidth - document.body.clientWidth,
    document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  expect(overflow).toEqual({ body: 0, document: 0 });
}

test("simple mode shows a Uniswap-style market ticket without the book", async ({ page }) => {
  await page.goto("/trade?mode=simple", { waitUntil: "networkidle" });

  await expect(page.getByText("Token in", { exact: true })).toBeVisible();
  await expect(page.getByText("Token out", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Switch" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Max" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Review simulated buy" })).toBeVisible();

  await expect(page.getByRole("heading", { name: "Order book" })).toHaveCount(0);
  await expect(page.locator("#order-book")).toHaveCount(0);
  await expect(page.getByLabel("Asks")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "GTC" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Limit" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "FOK" })).toHaveCount(0);
  await expect(page.getByText("G/I/F time in force")).toHaveCount(0);
  await expect(page.locator("#order-ticket").getByRole("button", { name: /Connect/ })).toHaveCount(0);
  await expect(page.getByText(/seed phrase|spending key|spend key|viewing key/i)).toHaveCount(0);
});

test("Max fills a positive size and Switch flips side", async ({ page }) => {
  await page.goto("/trade?mode=simple", { waitUntil: "networkidle" });

  const size = page.getByRole("textbox", { name: "Order size in pZEC" });
  await expect(page.getByLabel("Token in")).toContainText("USDC");
  await expect(page.getByLabel("Token out")).toContainText("pZEC");

  await page.getByRole("button", { name: "Max" }).click();
  const buySize = Number(await size.inputValue());
  expect(buySize).toBeGreaterThan(0);

  await page.getByRole("button", { name: "Switch" }).click();
  await expect(page.getByRole("button", { name: "Review simulated sell" })).toBeVisible();
  await expect(page.getByLabel("Token in")).toContainText("pZEC");
  await expect(page.getByLabel("Token out")).toContainText("USDC");

  await page.getByRole("button", { name: "Max" }).click();
  await expect(size).toHaveValue("100");
});

test("simple Review confirm completes an IOC market fill", async ({ page }) => {
  const book = seedBook("ZEC/USDC");
  const slippageHundredths = parseAtomicUnits("0.50", PRICE_DECIMALS, { allowZero: true });
  const market = submitOrder(book, {
    id: "user-preview",
    side: "buy",
    tif: "IOC",
    priceTicks: worstPriceTicks(book.lastTicks, "buy", slippageHundredths),
    sizeAtoms: parseAtomicUnits("1", PZEC_DECIMALS),
  });

  await page.goto("/trade?mode=simple", { waitUntil: "networkidle" });
  await page.getByRole("textbox", { name: "Order size in pZEC" }).fill("1");
  await page.getByRole("button", { name: "Review simulated buy" }).click();
  await expect(page.getByRole("button", { name: "Confirm simulated buy" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Back" })).toBeVisible();
  await page.getByRole("button", { name: "Confirm simulated buy" }).click();
  await expect(page.getByText(describeSubmit(market, "ZEC/USDC"))).toBeVisible();
});

test("simple Review is disabled when the feed gate blocks it", async ({ page }) => {
  await page.goto("/trade?mode=simple&feed=stale", { waitUntil: "networkidle" });
  const review = page.getByRole("button", { name: "Review simulated buy" });
  await expect(review).toBeDisabled();
  await review.click({ force: true });
  await expect(page.getByRole("button", { name: "Confirm simulated buy" })).toHaveCount(0);
});

test("simple mode at 375px has 44px primary buttons and no overflow", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/trade?mode=simple", { waitUntil: "networkidle" });
  await expectNoHorizontalOverflow(page);

  const review = page.getByRole("button", { name: "Review simulated buy" });
  const max = page.getByRole("button", { name: "Max" });
  const swap = page.getByRole("button", { name: "Switch" });
  await expect(review).toBeVisible();
  expect((await review.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  expect((await max.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  expect((await swap.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);

  await review.click();
  const confirm = page.getByRole("button", { name: "Confirm simulated buy" });
  const back = page.getByRole("button", { name: "Back" });
  await expect(confirm).toBeVisible();
  expect((await confirm.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  expect((await back.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  await expectNoHorizontalOverflow(page);
});
