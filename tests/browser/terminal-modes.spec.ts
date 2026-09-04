import { type Page } from "@playwright/test";

import { missingProviderCopy } from "../../src/lib/evm-wallet.ts";
import { markets } from "../../src/lib/market-data.ts";
import { submitOrder } from "../../src/lib/matcher.ts";
import { describeSubmit, seedBook } from "../../src/lib/session.ts";
import { TERMINAL_MODE_STORAGE_KEY } from "../../src/lib/terminal-mode.ts";
import { parseAtomicUnits, PRICE_DECIMALS, worstPriceTicks, ZEC_DECIMALS } from "../../src/lib/units.ts";
import { inspectTransparentDestination } from "../../src/lib/zcash-address.ts";

import {
  expect,
  LANDING_HERO_HEADING,
  OPEN_TERMINAL_CTA,
  PREVIEW_CHIP,
  test,
} from "./fixtures";

const viewports = [320, 375, 390, 768, 900, 1280, 1440] as const;

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
  await expect(page.getByText(copy, { exact: true })).toBeVisible();
  await expect(page.locator("#recent-trades")).toHaveCount(0);
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

test("TWAP splits a reviewed order into scheduled slices", async ({ page }) => {
  await page.goto("/trade?mode=advanced", { waitUntil: "networkidle" });
  await expectHonestPreview(page);

  await page.getByRole("button", { name: "TWAP" }).click();
  await expect(page.getByRole("button", { name: "TWAP" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("TWAP slice count")).toBeVisible();
  await expect(page.getByLabel("TWAP duration")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Price in USDC" })).toBeDisabled();

  await page.getByLabel("TWAP slice count").selectOption("4");
  await page.getByLabel("TWAP duration").selectOption("300");
  await page.getByRole("button", { name: "Review buy" }).click();
  await expect(page.getByText("4 slices over 5 minutes")).toBeVisible();

  await page.getByRole("button", { name: "Complete buy" }).click();
  await expect(page.getByText(/TWAP started\. 4 slices over 5 minutes/)).toBeVisible();
  await expect(page.getByText("TWAP running. 1 of 4 slices executed.")).toBeVisible({ timeout: 10_000 });
});

test("a running TWAP can be cancelled and stops executing", async ({ page }) => {
  await page.goto("/trade?mode=advanced", { waitUntil: "networkidle" });
  await expectHonestPreview(page);

  await page.getByRole("button", { name: "TWAP" }).click();
  await page.getByLabel("TWAP slice count").selectOption("4");
  await page.getByLabel("TWAP duration").selectOption("300");
  await page.getByRole("button", { name: "Review buy" }).click();
  await page.getByRole("button", { name: "Complete buy" }).click();
  await expect(page.getByText("TWAP running. 1 of 4 slices executed.")).toBeVisible({ timeout: 10_000 });

  const stop = page.getByRole("button", { name: "Stop TWAP job on ZEC/USDC" });
  await expect(stop).toBeVisible();
  expect((await stop.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  await stop.click();

  await expect(page.getByText(
    "TWAP cancelled after 1 of 4 slices. Remaining slices will not execute.",
  )).toBeVisible();
  await expect(page.getByRole("button", { name: "Stop TWAP job on ZEC/USDC" })).toHaveCount(0);
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

test("order review resets when the selected market or mode changes", async ({ page }) => {
  await page.goto("/trade?mode=advanced", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Review buy" }).click();
  await expect(page.getByRole("button", { name: "Complete buy" })).toBeVisible();

  await page.getByRole("radio", { name: "ZEC / USDT" }).click();
  await expect(page.getByRole("button", { name: "Complete buy" })).toHaveCount(0);
  await page.getByRole("button", { name: "Review buy" }).click();
  await expect(page.getByRole("button", { name: "Complete buy" })).toBeVisible();

  await page.getByRole("radio", { name: "Simple" }).click();
  await expect(page.getByRole("button", { name: "Complete buy" })).toHaveCount(0);
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
  await page.getByRole("region", { name: LANDING_HERO_HEADING })
    .getByRole("link", { name: OPEN_TERMINAL_CTA })
    .click();
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
  await page.getByRole("textbox", { name: "Transparent destination to check" }).fill("zs1notreal");
  await expect(page.getByText(inspection.message)).toBeVisible();
  expect(posts).toEqual([]);
});

test("EVM connect without provider names the rejection and has no seed field", async ({ page }) => {
  await page.goto("/trade?mode=simple", { waitUntil: "networkidle" });
  await expectHonestPreview(page);
  await page.getByRole("button", { name: "Connect Ethereum Mainnet wallet" }).click();
  await expect(page.getByRole("status", { name: "Wallet connection rejection" })).toHaveText(
    missingProviderCopy(markets["ZEC/USDC"].settlementPair),
  );
  await expect(page.getByText(/seed phrase|spending key|spend key|viewing key/i)).toHaveCount(0);
  await expect(page.locator("input[type=password]")).toHaveCount(0);
});

test("landing Connect keeps ZEC unavailable and offers injected Ethereum wallets", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Connect", exact: true }).click();

  const dialog = page.getByRole("dialog", { name: "Connect wallets" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Close wallet dialog" })).toBeFocused();
  await expect(dialog.getByRole("heading", { name: "Transparent ZEC wallet" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "ZEC connector unavailable" })).toBeDisabled();
  const connect = dialog.getByRole("button", { name: "Connect Ethereum Mainnet wallet" });
  await expect(connect).toBeVisible();
  await dialog.getByLabel("Settlement market").selectOption("ZEC-USDT");
  await expect(connect).toHaveAttribute("title", /ZEC-USDT/);
  await expect(dialog.getByText(/reconnect after navigation/)).toBeVisible();
  await expect(dialog.locator("input[type=password]")).toHaveCount(0);
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("hidden");

  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Connect", exact: true })).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
});

test("simple rejects slippage precision finer than one basis point", async ({ page }) => {
  await page.goto("/trade?mode=simple", { waitUntil: "networkidle" });
  await page.getByRole("textbox", { name: "Maximum slippage percent" }).fill("0.501");
  await expect(page.getByRole("alert").filter({ hasText: "no more than 2 decimal places" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Review buy" })).toBeDisabled();
});

test("simple blocks review when the requested IOC size is only partially fillable", async ({ page }) => {
  await page.goto("/trade?mode=simple", { waitUntil: "networkidle" });
  await page.getByRole("textbox", { name: "Order size in ZEC" }).fill("120");
  await expect(page.getByText(/requested size is only partially fillable/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Review buy" })).toBeDisabled();
});

test("landing USDT market action opens the USDT settlement route", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await page.getByRole("list", { name: "Two markets" }).getByRole("link", { name: "Read settlement" }).click();
  await expect(page).toHaveURL(/view=settlement&market=ZEC%2FUSDT/);
  await expect(page.getByRole("heading", { name: "USDT settlement undeployed" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Selected settlement market" })).toHaveValue("ZEC/USDT");
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
