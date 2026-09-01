import { blotterEmptyOrdersCopy } from "../../src/lib/blotter-copy.ts";
import { DEPOSIT_TOUR } from "../../src/lib/deposit-tour.ts";
import { missingProviderCopy } from "../../src/lib/evm-wallet.ts";
import { markets } from "../../src/lib/market-data.ts";
import { submitOrder } from "../../src/lib/matcher.ts";
import { NATIVE_MATCHER_DISABLED_COPY } from "../../src/lib/native-matcher-order-action.ts";
import { payoutClaimForTourStep } from "../../src/lib/payout.ts";
import { isEducationLastStep, PREVIEW_EDUCATION_STEPS } from "../../src/lib/preview-education.ts";
import { describeSubmit, seedBook, ticketRejectCopy } from "../../src/lib/session.ts";
import { simulationStatus } from "../../src/lib/status.ts";
import { parseAtomicUnits, PRICE_DECIMALS, worstPriceTicks, ZEC_DECIMALS } from "../../src/lib/units.ts";
import { unresolvedWithdrawalTourIndex, WITHDRAWAL_TOUR } from "../../src/lib/withdrawal-tour.ts";

import { expect, test } from "./fixtures";

const TRANSPARENT_SHAPE_DESTINATION = "t1Zo4ZzPXJiJ8M8pYMgL4tWbdkH7c8r7abc";

async function expectNoHorizontalOverflow(page: { evaluate: (fn: () => { body: number; document: number }) => Promise<{ body: number; document: number }> }) {
  const overflow = await page.evaluate(() => ({
    body: document.body.scrollWidth - document.body.clientWidth,
    document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  expect(overflow).toEqual({ body: 0, document: 0 });
}

test("education last step stays inside 320px with 44px Continue and Back", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/trade?education=1", { waitUntil: "networkidle" });
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Continue" })).toBeVisible();

  for (let step = 0; !isEducationLastStep(step); step += 1) {
    await expect(dialog.getByRole("heading", { name: PREVIEW_EDUCATION_STEPS[step].title })).toBeVisible();
    await dialog.getByRole("button", { name: "Continue" }).click();
  }

  const last = PREVIEW_EDUCATION_STEPS[PREVIEW_EDUCATION_STEPS.length - 1];
  await expect(dialog.getByRole("heading", { name: last.title })).toBeVisible();
  const continueButton = dialog.getByRole("button", { name: "Continue" });
  const back = dialog.getByRole("button", { name: "Back" });
  await expect(continueButton).toBeVisible();
  await expect(back).toBeEnabled();
  const dialogBox = await dialog.boundingBox();
  expect(dialogBox, "education dialog bounding box").toBeTruthy();
  expect(dialogBox?.width ?? 0).toBeLessThanOrEqual(320);
  expect((await continueButton.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  expect((await back.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  await expectNoHorizontalOverflow(page);
  await continueButton.click();
  await expect(dialog).toHaveCount(0);
});

test("deposit tour walks Eligibility through Complete without a receivable address", async ({ page }) => {
  await page.goto("/trade?view=bridge", { waitUntil: "networkidle" });
  const next = page.getByRole("button", { name: "Next state" });
  for (const [index, step] of DEPOSIT_TOUR.entries()) {
    await expect(page.getByRole("heading", { name: step.title, exact: true })).toBeVisible();
    await expect(page.getByText(step.body)).toBeVisible();
    await expect(page.getByText("tex1", { exact: false })).toHaveCount(0);
    if (step.id === "address-request") {
      await expect(page.getByRole("img", { name: "Placeholder QR. Not payable." })).toHaveCount(0);
    }
    if (index < DEPOSIT_TOUR.length - 1) {
      await next.click();
    }
  }
  await expect(next).toBeDisabled();
});

test("withdrawal tour reaches unresolved and sends nothing", async ({ page }) => {
  await page.goto("/trade?view=bridge", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Withdrawal states" }).click();
  await page.getByRole("textbox", { name: "Transparent destination to inspect" }).fill(TRANSPARENT_SHAPE_DESTINATION);
  const unresolvedAt = unresolvedWithdrawalTourIndex();
  expect(unresolvedAt).toBeGreaterThanOrEqual(0);
  const next = page.getByRole("button", { name: "Next state" });
  for (let index = 0; index < unresolvedAt; index += 1) {
    await next.click();
  }
  const unresolved = WITHDRAWAL_TOUR[unresolvedAt];
  const claim = payoutClaimForTourStep(unresolved.id, TRANSPARENT_SHAPE_DESTINATION);
  await expect(page.getByText(unresolved.title, { exact: true })).toBeVisible();
  await expect(page.getByText(unresolved.body)).toBeVisible();
  await expect(page.getByText(`Stub claim: ${claim.state}. Nothing is sent.`)).toBeVisible();
  expect(claim.state).toEqual("unresolved");
});

test("wallet connect without a provider names the rejection while the native matcher stays disabled", async ({ page }) => {
  await page.goto("/trade", { waitUntil: "networkidle" });
  const nativeMatcher = page.locator("#native-matcher-order-action");
  await expect(nativeMatcher).toContainText(NATIVE_MATCHER_DISABLED_COPY);
  await expect(nativeMatcher).toHaveAttribute("data-native-matcher-state", "manifest-disabled");
  await page.getByRole("button", { name: "Connect Arbitrum Sepolia wallet" }).click();
  await expect(page.getByRole("status", { name: "Wallet connection rejection" })).toHaveText(
    missingProviderCopy(markets["ZEC/USDC"].settlementPair),
  );
  await expect(page.getByText(/seed phrase|spending key|spend key|viewing key/i)).toHaveCount(0);
  await expect(page.locator("input[type=password]")).toHaveCount(0);
  await expect(nativeMatcher).toContainText(NATIVE_MATCHER_DISABLED_COPY);
});

test("status, missing route, and render-failure retry change visible state", async ({ page }) => {
  const status = simulationStatus();
  await page.goto("/status", { waitUntil: "networkidle" });
  const ledger = page.getByRole("list", { name: "Simulation status ledger" });
  await expect(ledger).toBeVisible();
  await expect(ledger).toContainText(status.mode);
  await page.locator("#main-content").getByRole("link", { name: "Architecture", exact: true }).click();
  await expect(page).toHaveURL(/view=architecture/);
  await expect(page.getByRole("heading", { name: "Three separated trust zones" })).toBeVisible();

  await page.goto("/not-a-route", { waitUntil: "networkidle" });
  const missing = page.getByLabel("Missing-route copy");
  await expect(missing).toBeVisible();
  await expect(missing).toContainText("That route is not part of the Phlebas public preview.");
  await page.getByRole("link", { name: "Open the trading terminal" }).click();
  await expect(page).toHaveURL(/\/trade/);
  await expect(page.getByRole("heading", { name: "Order entry" })).toBeVisible();

  await page.goto("/trade?error=1", { waitUntil: "networkidle" });
  const retryCopy = page.getByLabel("Retry copy");
  await expect(page.getByRole("heading", { name: "The page failed to render" })).toBeVisible();
  await expect(retryCopy).toContainText("Nothing was submitted to a chain, matcher, or custody system.");
  await retryCopy.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByRole("heading", { name: "Order entry" })).toBeVisible();
  await expect(page).not.toHaveURL(/error=1/);
});

test("GTC remainder can be cancelled, IOC cancels remainder, and FOK rejects a miss", async ({ page }) => {
  const book = seedBook("ZEC/USDC");
  const rest = submitOrder(book, {
    id: "user-preview",
    side: "buy",
    tif: "GTC",
    priceTicks: parseAtomicUnits("50.00", PRICE_DECIMALS),
    sizeAtoms: parseAtomicUnits("1", ZEC_DECIMALS),
  });
  const ioc = submitOrder(book, {
    id: "user-preview",
    side: "buy",
    tif: "IOC",
    priceTicks: parseAtomicUnits("50.00", PRICE_DECIMALS),
    sizeAtoms: parseAtomicUnits("1", ZEC_DECIMALS),
  });
  const fok = submitOrder(book, {
    id: "user-preview",
    side: "buy",
    tif: "FOK",
    priceTicks: parseAtomicUnits("52.91", PRICE_DECIMALS),
    sizeAtoms: parseAtomicUnits("100", ZEC_DECIMALS),
  });

  await page.goto("/trade", { waitUntil: "networkidle" });
  await page.getByRole("textbox", { name: "Price in USDC" }).fill("50.00");
  await page.getByRole("textbox", { name: "Order size in ZEC" }).fill("1");
  await page.getByRole("button", { name: "Review buy" }).click();
  await page.getByRole("button", { name: "Complete buy" }).click();
  await expect(page.getByText(describeSubmit(rest, "ZEC/USDC"))).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByText(blotterEmptyOrdersCopy(markets["ZEC/USDC"].settlementPair))).toBeVisible();

  await page.getByRole("button", { name: "IOC" }).click();
  await page.getByRole("textbox", { name: "Price in USDC" }).fill("50.00");
  await page.getByRole("textbox", { name: "Order size in ZEC" }).fill("1");
  await page.getByRole("button", { name: "Review buy" }).click();
  await page.getByRole("button", { name: "Complete buy" }).click();
  await expect(page.getByText(describeSubmit(ioc, "ZEC/USDC"))).toBeVisible();

  await page.getByRole("button", { name: "FOK" }).click();
  await page.getByRole("textbox", { name: "Price in USDC" }).fill("52.91");
  await page.getByRole("textbox", { name: "Order size in ZEC" }).fill("100");
  await page.getByRole("button", { name: "Review buy" }).click();
  await page.getByRole("button", { name: "Complete buy" }).click();
  await expect(page.getByText(describeSubmit(fok, "ZEC/USDC"), { exact: true })).toBeVisible();
  await expect(page.getByText(ticketRejectCopy("Fill-or-kill could not fill in full", "ZEC/USDC"), { exact: true })).toBeVisible();
});

test("market IOC confirm fills against the fixture book", async ({ page }) => {
  const book = seedBook("ZEC/USDC");
  const slippageHundredths = parseAtomicUnits("0.50", PRICE_DECIMALS, { allowZero: true });
  const market = submitOrder(book, {
    id: "user-preview",
    side: "buy",
    tif: "IOC",
    priceTicks: worstPriceTicks(book.lastTicks, "buy", slippageHundredths),
    sizeAtoms: parseAtomicUnits("1", ZEC_DECIMALS),
  });

  await page.goto("/trade", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Market" }).click();
  await page.getByRole("textbox", { name: "Order size in ZEC" }).fill("1");
  await page.getByRole("button", { name: "Review buy" }).click();
  await expect(page.getByText("Worst price", { exact: true })).toBeVisible();
  await expect(page.getByText("IOC", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Complete buy" }).click();
  await expect(page.getByText(describeSubmit(market, "ZEC/USDC"))).toBeVisible();
});
