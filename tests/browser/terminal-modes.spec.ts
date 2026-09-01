import { type Page } from "@playwright/test";

import { missingProviderCopy } from "../../src/lib/evm-wallet.ts";
import { markets } from "../../src/lib/market-data.ts";
import { submitOrder } from "../../src/lib/matcher.ts";
import { describeSubmit, seedBook } from "../../src/lib/session.ts";
import { TERMINAL_MODE_STORAGE_KEY } from "../../src/lib/terminal-mode.ts";
import { parseAtomicUnits, PZEC_DECIMALS, PRICE_DECIMALS, worstPriceTicks } from "../../src/lib/units.ts";
import { inspectTransparentDestination } from "../../src/lib/zcash-address.ts";

import { expect, test } from "./fixtures";

const viewports = [375, 768, 1280] as const;

function expectedMarketBuyCopy() {
  const book = seedBook("ZEC/USDC");
  const slippageHundredths = parseAtomicUnits("0.50", PRICE_DECIMALS, { allowZero: true });
  return describeSubmit(
    submitOrder(book, {
      id: "user-preview",
      side: "buy",
      tif: "IOC",
      priceTicks: worstPriceTicks(book.lastTicks, "buy", slippageHundredths),
      sizeAtoms: parseAtomicUnits("1", PZEC_DECIMALS),
    }),
    "ZEC/USDC",
  );
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    body: document.body.scrollWidth - document.body.clientWidth,
    document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  expect(overflow, "Page-level horizontal overflow").toEqual({ body: 0, document: 0 });
}

async function expectHonestSimulation(page: Page) {
  await expect(page.getByRole("status", { name: "Simulation disclosure" })).toBeVisible();
  const text = await page.locator("body").innerText();
  expect(text).not.toMatch(/\baccepts live funds\b/i);
  expect(text).not.toMatch(/\bhas live funds\b/i);
}

test("simple market review confirm uses matcher IOC copy", async ({ page }) => {
  const copy = expectedMarketBuyCopy();
  await page.goto("/trade?mode=simple", { waitUntil: "networkidle" });
  await expectHonestSimulation(page);
  await expect(page.getByRole("radio", { name: "Simple" })).toHaveAttribute("aria-checked", "true");
  await expect(page.locator("#order-book")).toBeHidden();

  await page.getByRole("button", { name: "Review simulated buy" }).click();
  await page.getByRole("button", { name: "Confirm simulated buy" }).click();
  await expect(page.locator("#order-ticket").getByText(copy)).toBeVisible();
});

test("advanced book click fills price and shows GTC IOC FOK", async ({ page }) => {
  await page.goto("/trade?mode=advanced", { waitUntil: "networkidle" });
  await expectHonestSimulation(page);
  await expect(page.getByRole("radio", { name: "Advanced" })).toHaveAttribute("aria-checked", "true");
  await expect(page.locator("#order-book")).toBeVisible();

  await page.getByRole("button", { name: "Ask 52.91" }).click();
  await expect(page.getByRole("textbox", { name: "Price in USDC" })).toHaveValue("52.91");
  await expect(page.getByRole("button", { name: "GTC" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "IOC" })).toBeVisible();
  await expect(page.getByRole("button", { name: "FOK" })).toBeVisible();

  await page.getByRole("button", { name: "Review simulated buy" }).click();
  await expect(page.getByRole("button", { name: "Confirm simulated buy" })).toBeVisible();
});

test("advanced click persists and simple query overrides", async ({ page }) => {
  await page.goto("/trade?mode=simple", { waitUntil: "networkidle" });
  await expectHonestSimulation(page);
  await page.getByRole("radio", { name: "Advanced" }).click();
  await expect(page.getByRole("radio", { name: "Advanced" })).toHaveAttribute("aria-checked", "true");
  await expect.poll(() => page.evaluate(
    (key) => window.localStorage.getItem(key),
    TERMINAL_MODE_STORAGE_KEY,
  )).toBe("advanced");

  await page.goto("/trade", { waitUntil: "networkidle" });
  await expect(page.getByRole("radio", { name: "Advanced" })).toHaveAttribute("aria-checked", "true");
  await expect(page.locator("#order-book")).toBeVisible();

  await page.goto("/trade?mode=simple", { waitUntil: "networkidle" });
  await expect(page.getByRole("radio", { name: "Simple" })).toHaveAttribute("aria-checked", "true");
  await expect(page.locator("#order-book")).toBeHidden();
});

test("primary CTAs on landing trade and liquidity change visible state", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await expectHonestSimulation(page);
  await page.locator("main").getByRole("link", { name: "Enter simulation" }).click();
  await expect(page).toHaveURL(/\/trade/);
  await expect(page.getByRole("heading", { name: "Order entry" })).toBeVisible();

  await page.goto("/trade?mode=simple", { waitUntil: "networkidle" });
  await expect(page.getByRole("button", { name: "Confirm simulated buy" })).toHaveCount(0);
  await page.getByRole("button", { name: "Review simulated buy" }).click();
  await expect(page.getByRole("button", { name: "Confirm simulated buy" })).toBeVisible();

  await page.goto("/trade?mode=advanced", { waitUntil: "networkidle" });
  await expect(page.getByRole("button", { name: "Confirm simulated buy" })).toHaveCount(0);
  await page.getByRole("button", { name: "Review simulated buy" }).click();
  await expect(page.getByRole("button", { name: "Confirm simulated buy" })).toBeVisible();

  await page.goto("/liquidity", { waitUntil: "networkidle" });
  await expectHonestSimulation(page);
  await expect(page.getByRole("button", { name: "Confirm simulated mint" })).toHaveCount(0);
  await page.getByRole("button", { name: "Review simulated mint" }).click();
  await expect(page.getByRole("button", { name: "Confirm simulated mint" })).toBeVisible();
});

test("ZEC TEX reject shielded destination and sends nothing", async ({ page }) => {
  const posts: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST") {
      posts.push(request.url());
    }
  });

  await page.goto("/trade?view=bridge", { waitUntil: "networkidle" });
  await expectHonestSimulation(page);
  const inspection = inspectTransparentDestination("zs1notreal");
  expect(inspection.class).toBe("shielded");
  await page.getByRole("textbox", { name: "Transparent destination to inspect" }).fill("zs1notreal");
  await expect(page.getByText(inspection.message)).toBeVisible();
  expect(posts).toEqual([]);
});

test("EVM connect without provider names the rejection and has no seed field", async ({ page }) => {
  await page.goto("/trade?mode=simple", { waitUntil: "networkidle" });
  await expectHonestSimulation(page);
  await page.getByRole("button", { name: "Connect Arbitrum Sepolia wallet" }).click();
  await expect(page.getByRole("status", { name: "Wallet connection rejection" })).toHaveText(
    missingProviderCopy(markets["ZEC/USDC"].settlementPair),
  );
  await expect(page.getByText(/seed phrase|spending key|spend key|viewing key/i)).toHaveCount(0);
  await expect(page.locator("input[type=password]")).toHaveCount(0);
});

for (const width of viewports) {
  test(`${width}px has no horizontal overflow on landing and trade`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });

    await page.goto("/", { waitUntil: "networkidle" });
    await expectHonestSimulation(page);
    await expectNoHorizontalOverflow(page);

    await page.goto("/trade?mode=simple", { waitUntil: "networkidle" });
    await expectNoHorizontalOverflow(page);

    await page.goto("/trade?mode=advanced", { waitUntil: "networkidle" });
    await expectNoHorizontalOverflow(page);
  });
}
