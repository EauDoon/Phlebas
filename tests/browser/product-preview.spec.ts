import { type Locator, type Page } from "@playwright/test";

import {
  expect,
  LANDING_HERO_HEADING,
  OPEN_TERMINAL_CTA,
  ORDER_COMPLETE_COPY,
  PREVIEW_CHIP,
  test,
} from "./fixtures";

const viewports = [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
] as const;

const chipRoutes = ["/", "/trade", "/trade?view=settlement", "/liquidity", "/status", "/legal"] as const;

function captureRuntimeErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(`console: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => errors.push(`page: ${error.message}`));
  return errors;
}

async function expectVisibleFocus(target: Locator) {
  await expect(target).toBeFocused();
  const style = await target.evaluate((element) => {
    const computed = getComputedStyle(element);
    const parentComputed = element.parentElement ? getComputedStyle(element.parentElement) : null;
    const rect = element.getBoundingClientRect();
    return {
      focusIndicator:
        (computed.outlineStyle !== "none" && Number.parseFloat(computed.outlineWidth) >= 2)
        || (parentComputed?.boxShadow !== "none"),
      visible: rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0,
    };
  });
  expect(style.visible).toBe(true);
  expect(style.focusIndicator).toBe(true);
}

async function expectNoGoldAccent(page: Page) {
  const accent = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--accent").trim().toLowerCase(),
  );
  expect(accent).not.toBe("#f4c95d");
}

async function expectPreviewChip(page: Page) {
  await expect(page.getByText(PREVIEW_CHIP, { exact: true })).toBeVisible();
}

async function previewAnOrder(page: Page) {
  const buy = page.getByRole("button", { name: /^Buy$/ });
  if (await buy.count()) {
    await buy.click();
  }
  const size = page.getByRole("textbox", { name: /Order size in ZEC|size/i }).first();
  await size.fill("1");
  await page.getByRole("button", { name: /^Review buy$/ }).click();
  await page.getByRole("button", { name: /^Complete buy$/ }).click();
  await expect(page.getByText(/Nothing was signed or submitted/)).toBeVisible();
}

for (const viewport of viewports) {
  test.describe(`${viewport.width}px visitor path`, () => {
    test.use({ viewport });

    test("walks landing, terminal, order preview, settlement, and solver quotes", async ({ page }) => {
      const runtimeErrors = captureRuntimeErrors(page);
      await page.emulateMedia({ reducedMotion: "reduce" });

      await page.goto("/", { waitUntil: "networkidle" });
      await expectNoGoldAccent(page);
      await expectPreviewChip(page);
      await expect(page.getByRole("heading", { name: LANDING_HERO_HEADING })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Current system" })).toBeVisible();
      expect(await page.locator("main > section").count()).toBeGreaterThanOrEqual(4);
      await expect(page.getByRole("tab", { name: "Deposit" })).toHaveCount(0);
      await expect(page.getByRole("tab", { name: "Withdrawal" })).toHaveCount(0);
      await expect(page.getByRole("link", { name: /featured deposit|Preview deposit|Preview withdrawal/i })).toHaveCount(0);

      const skip = page.getByRole("link", { name: "Skip to main content" });
      await page.keyboard.press("Tab");
      await expectVisibleFocus(skip);
      await page.keyboard.press("Enter");
      await expect(page.locator("#main-content")).toBeFocused();

      await page.getByRole("link", { name: OPEN_TERMINAL_CTA }).first().click();
      await expect(page).toHaveURL(/\/trade/);
      await expectPreviewChip(page);
      await expectNoGoldAccent(page);
      await previewAnOrder(page);

      await page.goto("/trade?view=settlement", { waitUntil: "networkidle" });
      await expectPreviewChip(page);
      await expect(page.getByRole("heading", { name: /fill ticket|matched fill|settlement/i }).first()).toBeVisible();

      await page.goto("/liquidity", { waitUntil: "networkidle" });
      await expectPreviewChip(page);
      await expect(page.getByText(/solver quote/i).first()).toBeVisible();
      await expect(page.getByText(/risk/i).first()).toBeVisible();

      for (const path of chipRoutes) {
        await page.goto(path, { waitUntil: "networkidle" });
        await expectPreviewChip(page);
        await expectNoGoldAccent(page);
      }

      expect(runtimeErrors).toEqual([]);
    });
  });
}
