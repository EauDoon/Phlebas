import { type Locator, type Page } from "@playwright/test";

import { expect, test } from "./fixtures";

const viewports = [320, 390, 768, 1440] as const;

const routes = [
  {
    path: "/",
    disclosure: "Simulation only",
    marker: "The custody line, drawn in public.",
  },
  {
    path: "/trade",
    disclosure: "Protocol preview",
    marker: "settles pZEC-USDC",
  },
  {
    path: "/liquidity",
    disclosure: "Protocol preview",
    marker: "Provide liquidity",
  },
] as const;

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

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    body: document.body.scrollWidth - document.body.clientWidth,
    document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));

  expect(overflow, "Page-level horizontal overflow").toEqual({ body: 0, document: 0 });
}

async function tabTo(page: Page, target: Locator, limit = 40) {
  for (let index = 0; index < limit; index += 1) {
    await page.keyboard.press("Tab");
    if (await target.evaluate((element) => element === document.activeElement)) {
      return;
    }
  }

  throw new Error(`Keyboard focus did not reach ${await target.getAttribute("aria-label") ?? await target.textContent()}`);
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

async function expectReducedMotion(page: Page) {
  const state = await page.evaluate(() => {
    const longestSeconds = (value: string) => Math.max(0, ...value.split(",").map((item) => {
      const duration = item.trim();
      const seconds = duration.endsWith("ms")
        ? Number.parseFloat(duration) / 1_000
        : Number.parseFloat(duration);
      return Number.isFinite(seconds) ? seconds : 0;
    }));
    const offenders: string[] = [];

    for (const element of document.querySelectorAll("*")) {
      for (const pseudo of [null, "::before", "::after"] as const) {
        const style = getComputedStyle(element, pseudo);
        const hasLongMotion = longestSeconds(style.animationDuration) > 0.000_01
          || longestSeconds(style.transitionDuration) > 0.000_01
          || style.animationIterationCount.split(",").some((count) => count.trim() === "infinite");
        if (hasLongMotion) {
          offenders.push(`${element.tagName.toLowerCase()}${pseudo ?? ""}`);
        }
      }
    }

    return {
      mediaMatches: matchMedia("(prefers-reduced-motion: reduce)").matches,
      offenders: offenders.slice(0, 10),
    };
  });

  expect(state.mediaMatches).toBe(true);
  expect(state.offenders, "Elements retaining motion under reduced-motion preference").toEqual([]);
}

for (const width of viewports) {
  test.describe(`${width}px viewport`, () => {
    test.use({ viewport: { width, height: 900 } });

    test("renders every public route without overflow or runtime errors", async ({ page }) => {
      const runtimeErrors = captureRuntimeErrors(page);

      for (const route of routes) {
        const response = await page.goto(route.path, { waitUntil: "networkidle" });
        expect(response?.ok(), `${route.path} response`).toBe(true);
        await expect(page.getByText(route.disclosure, { exact: true })).toBeVisible();
        await expect(page.getByText(route.marker, { exact: true })).toBeVisible();
        await expect(page.locator("[data-nextjs-dialog]"), "Next.js error overlay").toHaveCount(0);
        await expectNoHorizontalOverflow(page);

        if (route.path === "/") {
          const bannerBeforeHeader = await page.getByRole("status").first().evaluate((banner) => {
            const header = document.querySelector("header");
            return Boolean(header && (banner.compareDocumentPosition(header) & Node.DOCUMENT_POSITION_FOLLOWING));
          });
          expect(bannerBeforeHeader).toBe(true);
          await expect(page.getByRole("heading", { name: "Nothing hidden behind the preview" })).toBeVisible();
          await expect(page.getByText(
            "pZEC is not native ZEC, shielded ZEC, or a trustless bridge asset.",
            { exact: true },
          )).toBeVisible();
        }
      }

      expect(runtimeErrors).toEqual([]);
    });

    test("keeps route navigation keyboard operable", async ({ page }) => {
      const runtimeErrors = captureRuntimeErrors(page);
      await page.goto("/", { waitUntil: "networkidle" });

      const enterSimulation = page.locator("main").getByRole("link", { name: "Enter simulation" });
      await tabTo(page, enterSimulation);
      await expectVisibleFocus(enterSimulation);
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(/\/trade\?view=trade$/);
      await expect(page.getByRole("combobox", { name: "Market" })).toHaveValue("ZEC/USDC");
      await expect(page.getByText("settles pZEC-USDC", { exact: true })).toBeVisible();

      await page.goto("/", { waitUntil: "networkidle" });
      const understandPzec = page.getByRole("link", { name: "Understand pZEC" });
      await tabTo(page, understandPzec);
      await expectVisibleFocus(understandPzec);
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(/\/#pzec$/);
      await expect(page.getByText(
        "pZEC is not native ZEC, shielded ZEC, or a trustless bridge asset.",
        { exact: true },
      )).toBeVisible();

      await page.goto("/", { waitUntil: "networkidle" });
      const lpLink = page.getByRole("link", { name: "Open LP preview" });
      await tabTo(page, lpLink);
      await expectVisibleFocus(lpLink);
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(/\/liquidity$/);
      await expect(page.getByRole("heading", { name: "Provide liquidity" })).toBeVisible();

      await page.goto("/trade?view=liquidity", { waitUntil: "networkidle" });
      await expect(page.getByRole("heading", { name: "Provide liquidity" })).toBeVisible();

      await page.goto("/trade", { waitUntil: "networkidle" });
      const liquidityNavigation = page.getByRole("button", { name: "Liquidity" });
      await tabTo(page, liquidityNavigation);
      await expectVisibleFocus(liquidityNavigation);
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(/\/liquidity\?market=ZEC%2FUSDC$/);
      await expect(page.getByRole("heading", { name: "Provide liquidity" })).toBeVisible();

      const laterPool = page.getByRole("button", { name: /pZEC\/USDT0/ });
      await tabTo(page, laterPool);
      await expectVisibleFocus(laterPool);
      await page.keyboard.press("Enter");
      await expect(laterPool).toHaveAttribute("aria-pressed", "true");
      await expect(page.getByText(/Later listing gate\. This is a preview/)).toBeVisible();
      await expect(page).toHaveURL(/\/liquidity\?market=ZEC%2FUSDT$/);

      const amount = page.getByRole("textbox", { name: "pZEC liquidity amount" });
      await tabTo(page, amount);
      await expectVisibleFocus(amount);
      await page.keyboard.press("ControlOrMeta+A");
      await page.keyboard.type("0.00000002");
      await expect(amount).toHaveValue("0.00000002");
      await expect(page.getByText("0.000001", { exact: true })).toBeVisible();
      await expect(page.getByText("Integer swap out")).toBeVisible();

      expect(runtimeErrors).toEqual([]);
    });

    test("moves skip-link focus to main content", async ({ page }) => {
      const runtimeErrors = captureRuntimeErrors(page);

      for (const route of routes) {
        await page.goto(route.path, { waitUntil: "networkidle" });
        const skipLink = page.getByRole("link", { name: "Skip to main content" });
        await page.keyboard.press("Tab");
        await expectVisibleFocus(skipLink);
        await page.keyboard.press("Enter");
        await expect(page.locator("main#main-content")).toBeFocused();
      }

      expect(runtimeErrors).toEqual([]);
    });

    test("preserves content with reduced motion", async ({ page }) => {
      const runtimeErrors = captureRuntimeErrors(page);
      await page.emulateMedia({ reducedMotion: "reduce" });

      for (const route of routes) {
        await page.goto(route.path, { waitUntil: "networkidle" });
        await expect(page.getByText(route.marker, { exact: true })).toBeVisible();
        await expectReducedMotion(page);
        await expectNoHorizontalOverflow(page);
      }

      expect(runtimeErrors).toEqual([]);
    });

    test("opens and closes the responsive landing navigation by keyboard", async ({ page }) => {
      const runtimeErrors = captureRuntimeErrors(page);
      await page.goto("/", { waitUntil: "networkidle" });

      const menu = page.getByRole("button", { name: "Menu" });
      if (width <= 820) {
        await tabTo(page, menu);
        await expectVisibleFocus(menu);
        await page.keyboard.press("Enter");
        await expect(page.getByRole("dialog", { name: "Navigate Phlebas" })).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog", { name: "Navigate Phlebas" })).not.toBeVisible();
        await expect(menu).toBeFocused();
      } else {
        await expect(menu).toBeHidden();
        const enter = page.locator("header").getByRole("link", { name: "Enter simulation" });
        await tabTo(page, enter);
        await expectVisibleFocus(enter);
        await page.keyboard.press("Enter");
        await expect(page).toHaveURL(/\/trade\?view=trade$/);
      }

      expect(runtimeErrors).toEqual([]);
    });
  });
}

test("trade ticket shows parser errors instead of a tick notice", async ({ page }) => {
  await page.goto("/trade", { waitUntil: "networkidle" });
  const size = page.getByRole("textbox", { name: "Order size in pZEC" });
  await size.fill("0.000000001");
  await expect(page.getByText("Value must use no more than 8 decimal places")).toBeVisible();
  await expect(page.getByText("Price must use 0.01 quote ticks")).toHaveCount(0);
});

test("gateway preview is not a receivable deposit", async ({ page }) => {
  await page.goto("/trade?view=bridge", { waitUntil: "networkidle" });
  await expect(page.getByText("zcash:{TEX_ADDRESS}?amount=1&label=Phlebas", { exact: true })).toBeVisible();
  await expect(page.getByText("tex1", { exact: false })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Withdrawal states" })).toBeVisible();
  await page.getByRole("button", { name: "Withdrawal states" }).click();
  await expect(page.getByText("Preview withdrawal states, not Withdraw ZEC.")).toBeVisible();
  await page.getByRole("button", { name: "Next state" }).click();
  await expect(page.getByText("Screened", { exact: true })).toBeVisible();
});

test("local matcher fills a buy against the fixture ask", async ({ page }) => {
  await page.goto("/trade", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Ask 52.91" }).click();
  await page.getByRole("textbox", { name: "Order size in pZEC" }).fill("1");
  await page.getByRole("button", { name: "Review simulated buy" }).click();
  await expect(page.getByText("pZEC is a custody receipt, not native ZEC.")).toBeVisible();
  await page.getByRole("button", { name: "Confirm simulated buy" }).click();
  await expect(page.getByText(/Filled against the local ZEC\/USDC book/)).toBeVisible();
  await expect(page.getByRole("tab", { name: "Fills" })).toBeVisible();
  await page.getByRole("tab", { name: "Fills" }).click();
  await expect(page.getByRole("table", { name: /Session fills for ZEC\/USDC/ })).toBeVisible();
});

test("status and missing routes stay labeled as simulation", async ({ page }) => {
  const status = await page.goto("/status", { waitUntil: "load" });
  expect(status?.ok(), "/status response").toBe(true);
  await expect(page.getByRole("heading", { name: "Simulation status" })).toBeVisible();
  await expect(page.getByText("in-browser", { exact: true })).toBeVisible();
  await expect(page.getByText("live funds", { exact: false })).toBeVisible();

  const missing = await page.goto("/this-route-is-not-part-of-the-simulation", { waitUntil: "load" });
  expect(missing?.status(), "404 status").toBe(404);
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await expect(page.getByText("Simulation only", { exact: true })).toBeVisible();
});

test("ZIP 321 copy warns that the template is not payable", async ({ page }) => {
  await page.goto("/trade?view=bridge", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Copy URI template" }).click();
  await expect(page.getByText("Copied a non-payable template. {TEX_ADDRESS} is a placeholder, not a deposit address.")).toBeVisible();
});
