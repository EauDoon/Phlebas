import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    body: document.body.scrollWidth - document.body.clientWidth,
    document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  expect(overflow).toEqual({ body: 0, document: 0 });
}

test("simple trade uses document scrolling instead of a clipped nested venue", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/trade?mode=simple", { waitUntil: "networkidle" });

  const venue = page.getByTestId("simple-venue");
  await expect(page.getByRole("region", { name: "Exchange mode" })).toBeVisible();
  expect(await venue.evaluate((element) => getComputedStyle(element).overflowY)).toBe("visible");

  const venueBox = await venue.boundingBox();
  const footerBox = await page.locator("footer").last().boundingBox();
  expect(venueBox).not.toBeNull();
  expect(footerBox).not.toBeNull();
  expect(footerBox!.y).toBeGreaterThanOrEqual(venueBox!.y + venueBox!.height - 1);

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole("button", { name: "Review buy" }).scrollIntoViewIfNeeded();
  expect(await venue.evaluate((element) => element.scrollTop)).toBe(0);
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
});

for (const width of [900, 1180]) {
  test(`tablet simple trade keeps the page scrollable without sticky overlap at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/trade?mode=simple", { waitUntil: "networkidle" });

    const venue = page.getByTestId("simple-venue");
    const main = page.locator("main");
    const marketBar = page.locator("main").locator("section").first();
    expect(await venue.evaluate((element) => getComputedStyle(element).overflowY)).toBe("visible");
    expect(await main.evaluate((element) => getComputedStyle(element).overflowY)).toBe("visible");
    expect(await marketBar.evaluate((element) => getComputedStyle(element).position)).not.toBe("sticky");

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    await expect(page.locator("footer").last()).toBeInViewport();
    await expectNoHorizontalOverflow(page);
  });
}

test("mobile header and page-local mode controls do not collide", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/trade?mode=simple", { waitUntil: "networkidle" });

  const brand = page.getByRole("link", { name: "Phlebas home" });
  const network = page.locator('[aria-label="Ethereum Mainnet"]');
  const connect = page.getByRole("button", { name: "Connect Ethereum Mainnet wallet" });
  const brandBox = await brand.boundingBox();
  const networkBox = await network.boundingBox();
  const connectBox = await connect.boundingBox();
  expect(brandBox).not.toBeNull();
  expect(networkBox).not.toBeNull();
  expect(connectBox).not.toBeNull();
  expect(brandBox!.x + brandBox!.width).toBeLessThan(networkBox!.x);
  expect(networkBox!.x + networkBox!.width).toBeLessThan(connectBox!.x);

  const mode = page.getByRole("region", { name: "Exchange mode" });
  await expect(mode.getByRole("radio", { name: "Simple" })).toHaveAttribute("aria-checked", "true");
  await expect(mode.getByRole("radio", { name: "Advanced" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("liquidity mode changes from a focused stack to an advanced split view", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/liquidity?market=ZEC%2FUSDC&mode=simple", { waitUntil: "networkidle" });

  const quote = page.getByRole("region", { name: "Solver quotes" });
  const risk = page.getByRole("complementary", { name: "Named quote risks" });
  const simpleQuoteBox = await quote.boundingBox();
  const simpleRiskBox = await risk.boundingBox();
  expect(simpleQuoteBox).not.toBeNull();
  expect(simpleRiskBox).not.toBeNull();
  expect(simpleRiskBox!.y).toBeGreaterThanOrEqual(simpleQuoteBox!.y + simpleQuoteBox!.height - 1);
  await expect(page.getByRole("button", { name: "Wallet actions stay disabled" })).toHaveCount(0);
  await expect(quote.locator('[role="note"]')).toContainText("Wallet actions stay disabled");

  await page.getByRole("radio", { name: "Advanced" }).click();
  await expect(page).toHaveURL(/mode=advanced/);
  const advancedQuoteBox = await quote.boundingBox();
  const advancedRiskBox = await risk.boundingBox();
  expect(advancedQuoteBox).not.toBeNull();
  expect(advancedRiskBox).not.toBeNull();
  expect(advancedRiskBox!.x).toBeGreaterThan(advancedQuoteBox!.x);
});

test("brand marks use the eye asset and primary actions keep exclusive emphasis", async ({ page }) => {
  await page.goto("/trade?mode=simple", { waitUntil: "networkidle" });

  const marks = page.locator('img[src*="phlebas-cyclops-eye"]');
  await expect(marks).toHaveCount(2);
  await expect(marks.first()).toBeVisible();

  const connectBackground = await page.getByRole("button", { name: "Connect Ethereum Mainnet wallet" })
    .evaluate((element) => getComputedStyle(element).backgroundImage);
  const reviewBackground = await page.getByRole("button", { name: "Review buy" })
    .evaluate((element) => getComputedStyle(element).backgroundImage);
  expect(connectBackground).toBe("none");
  expect(reviewBackground).toContain("linear-gradient");
});

test("landing mobile menu exposes state and restores focus after Escape", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/", { waitUntil: "networkidle" });

  const menu = page.getByRole("button", { name: "Menu", exact: true });
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await menu.click();
  await expect(menu).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await expect(menu).toBeFocused();
});
