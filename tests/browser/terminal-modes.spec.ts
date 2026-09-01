import { type Page } from "@playwright/test";

import { submitOrder } from "../../src/lib/matcher.ts";
import { describeSubmit, seedBook } from "../../src/lib/session.ts";
import { TERMINAL_MODE_STORAGE_KEY } from "../../src/lib/terminal-mode.ts";
import { parseAtomicUnits, PRICE_DECIMALS, worstPriceTicks, ZEC_DECIMALS } from "../../src/lib/units.ts";
import { inspectTransparentDestination } from "../../src/lib/zcash-address.ts";

import { expect, OPEN_TERMINAL_CTA, PREVIEW_CHIP, test } from "./fixtures";

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
      sizeAtoms: parseAtomicUnits("1", ZEC_DECIMALS),
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

async function expectHonestPreview(page: Page) {
  await expect(page.getByText(PREVIEW_CHIP, { exact: true })).toBeVisible();
  const text = await page.locator("body").innerText();
  expect(text).not.toMatch(/\baccepts live funds\b/i);
  expect(text).not.toMatch(/\bhas live funds\b/i);
}

test("simple market review confirm uses matcher IOC copy", async ({ page }) => {
  const copy = expectedMarketBuyCopy();
  await page.goto("/trade?mode=simple", { waitUntil: "networkidle" });
  await expectHonestPreview(page);
  await expect(page.getByRole("radio", { name: "Simple" })).toHaveAttribute("aria-checked", "true");
  await expect(page.locator("#order-book")).toBeHidden();

  await page.getByRole("textbox", { name: "Order size in ZEC" }).fill("1");
  await page.getByRole("button", { name: "Review buy" }).click();
  await page.getByRole("button", { name: "Complete buy" }).click();
  await expect(page.getByText(copy)).toBeVisible();
});

test("advanced book click fills price and shows GTC IOC FOK", async ({ page }) => {
  await page.goto("/trade?mode=advanced", { waitUntil: "networkidle" });
  await expectHonestPreview(page);
  await expect(page.getByRole("radio", { name: "Advanced" })).toHaveAttribute("aria-checked", "true");
  await expect(page.locator("#order-book")).toBeVisible();

  await page.getByRole("button", { name: "Ask 52.91" }).click();
  await expect(page.getByRole("textbox", { name: "Price in USDC" })).toHaveValue("52.91");
  await expect(page.getByRole("button", { name: "GTC" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "IOC" })).toBeVisible();
  await expect(page.getByRole("button", { name: "FOK" })).toBeVisible();

  await page.getByRole("button", { name: "Review buy" }).click();
  await expect(page.getByRole("button", { name: "Complete buy" })).toBeVisible();
});

test("advanced click persists and simple query overrides", async ({ page }) => {
  await page.goto("/trade?mode=simple", { waitUntil: "networkidle" });
  await expectHonestPreview(page);
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

test("terminal mode radios support roving focus and arrow navigation", async ({ page }) => {
  await page.goto("/trade?mode=simple", { waitUntil: "networkidle" });
  const simple = page.getByRole("radio", { name: "Simple" });
  const advanced = page.getByRole("radio", { name: "Advanced" });

  await expect(simple).toHaveAttribute("tabindex", "0");
  await expect(advanced).toHaveAttribute("tabindex", "-1");
  await simple.focus();
  await simple.press("End");
  await expect(advanced).toBeFocused();
  await expect(advanced).toHaveAttribute("aria-checked", "true");
  await expect(advanced).toHaveAttribute("tabindex", "0");

  await advanced.press("Home");
  await expect(simple).toBeFocused();
  await expect(simple).toHaveAttribute("aria-checked", "true");

  await simple.press("ArrowRight");
  await expect(advanced).toBeFocused();
  await expect(advanced).toHaveAttribute("aria-checked", "true");
});

test("primary CTAs on landing trade and liquidity change visible state", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await expectHonestPreview(page);
  await page.locator("main").getByRole("link", { name: OPEN_TERMINAL_CTA }).first().click();
  await expect(page).toHaveURL(/\/trade/);
  await expect(page.getByRole("heading", { name: "Order entry" })).toBeVisible();

  await page.goto("/trade?mode=simple", { waitUntil: "networkidle" });
  await expect(page.getByRole("button", { name: "Complete buy" })).toHaveCount(0);
  await page.getByRole("button", { name: "Review buy" }).click();
  await expect(page.getByRole("button", { name: "Complete buy" })).toBeVisible();

  await page.goto("/trade?mode=advanced", { waitUntil: "networkidle" });
  await expect(page.getByRole("button", { name: "Complete buy" })).toHaveCount(0);
  await page.getByRole("button", { name: "Review buy" }).click();
  await expect(page.getByRole("button", { name: "Complete buy" })).toBeVisible();

  await page.goto("/trade?view=architecture", { waitUntil: "networkidle" });
  await expectHonestPreview(page);
  await expect(page.getByRole("button", { name: "Complete mint" })).toHaveCount(0);
  await page.getByRole("button", { name: "Review mint" }).click();
  await expect(page.getByRole("button", { name: "Complete mint" })).toBeVisible();
});

test("ZEC TEX reject shielded destination and sends nothing", async ({ page }) => {
  const posts: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST") {
      posts.push(request.url());
    }
  });

  await page.goto("/trade?view=bridge", { waitUntil: "networkidle" });
  await expectHonestPreview(page);
  const inspection = inspectTransparentDestination("zs1notreal");
  expect(inspection.class).toBe("shielded");
  await page.getByRole("textbox", { name: "Transparent destination to inspect" }).fill("zs1notreal");
  await expect(page.getByText(inspection.message)).toBeVisible();
  expect(posts).toEqual([]);
});

test("EVM connect without provider names the rejection and has no seed field", async ({ page }) => {
  await page.goto("/trade?mode=simple", { waitUntil: "networkidle" });
  await expectHonestPreview(page);
  const connect = page.getByRole("button", { name: "Connect Arbitrum Sepolia wallet" });
  await expect(connect).toBeDisabled();
  await expect(connect).toHaveAttribute(
    "title",
    "Wallets are off. Optional Sepolia connect is not started. Settled as ZEC-USDC.",
  );
  await expect(page.getByText(/seed phrase|spending key|spend key|viewing key/i)).toHaveCount(0);
  await expect(page.locator("input[type=password]")).toHaveCount(0);
});

for (const width of viewports) {
  test(`${width}px has no horizontal overflow on landing and trade`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });

    await page.goto("/", { waitUntil: "networkidle" });
    await expectHonestPreview(page);
    await expectNoHorizontalOverflow(page);

    await page.goto("/trade?mode=simple", { waitUntil: "networkidle" });
    await expectNoHorizontalOverflow(page);

    await page.goto("/trade?mode=advanced", { waitUntil: "networkidle" });
    await expectNoHorizontalOverflow(page);
  });
}
