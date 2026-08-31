import { type Locator, type Page } from "@playwright/test";

import { expect, test } from "./fixtures";

const viewports = [320, 390, 768, 1440] as const;

const routes = [
  {
    path: "/",
    disclosure: "Simulation only",
    marker: "Native ZEC, wallet controlled.",
  },
  {
    path: "/trade",
    disclosure: "Protocol preview",
    marker: "legacy simulation: pZEC-USDC",
  },
  {
    path: "/trade?view=settlement&market=ZEC/USDC",
    disclosure: "No-value walkthrough",
    marker: "Native ZEC atomic swap",
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

async function runNativeFixtureActions(page: Page, labels: readonly string[]) {
  for (const label of labels) {
    const action = page.getByRole("button", { name: label, exact: true });
    await expect(action).toBeEnabled();
    await action.click();
  }
}

const fundedNativeFixtureActions = [
  "Accept exact fixture terms",
  "Prepare fixture ZEC lock",
  "Record fixture ZEC funding",
  "Confirm fixture ZEC evidence",
  "Prepare fixture USDC lock",
  "Record fixture USDC funding",
  "Confirm fixture USDC evidence",
] as const;

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
            "The pZEC pool and gateway screens remain only as a clearly labeled legacy simulation while the native flow is built.",
            { exact: true },
          )).toBeVisible();
          await expect(page.getByText("Deny by default", { exact: true })).toBeVisible();
        }
      }

      expect(runtimeErrors).toEqual([]);
    });

    test("keeps route navigation keyboard operable", async ({ page }) => {
      const runtimeErrors = captureRuntimeErrors(page);
      await page.goto("/", { waitUntil: "networkidle" });

      const settlementWalkthrough = page.locator("main").getByRole("link", { name: "Walk through settlement" }).first();
      await tabTo(page, settlementWalkthrough);
      await expectVisibleFocus(settlementWalkthrough);
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(/\/trade\?view=settlement&market=ZEC(?:%2F|\/)USDC$/);
      await expect(page.getByRole("heading", { name: "Native ZEC atomic swap" })).toBeVisible();

      await page.goto("/", { waitUntil: "networkidle" });
      const legacySimulation = page.getByRole("link", { name: "Open legacy pZEC simulation" }).first();
      await tabTo(page, legacySimulation);
      await expectVisibleFocus(legacySimulation);
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(/\/trade\?view=trade$/);
      await expect(page.getByRole("combobox", { name: "Selected market" })).toHaveValue("ZEC/USDC");
      await expect(page.getByText("legacy simulation: pZEC-USDC", { exact: true })).toBeVisible();

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

test("native settlement happy path reaches a no-value settled state", async ({ page }) => {
  const serviceRequests: string[] = [];
  page.on("request", (request) => {
    if (/gateway|matcher|observer|\/rpc|wallet/i.test(request.url())) serviceRequests.push(request.url());
  });

  await page.goto("/trade?view=settlement&market=ZEC/USDC", { waitUntil: "networkidle" });
  await expect(page.getByText(
    "No-value native settlement walkthrough. It prepares no transaction, connects no wallet, and moves no asset.",
    { exact: true },
  )).toBeVisible();
  await expect(page.getByRole("button", { name: /connect.*wallet/i })).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: /pZEC/i })).toHaveCount(0);
  await expect(page.getByText("No pZEC. The trade, liquidity, and gateway screens remain legacy simulations.")).toBeVisible();

  await runNativeFixtureActions(page, [
    ...fundedNativeFixtureActions,
    "Record fixture USDC claim",
    "Confirm fixture USDC claim",
    "Record fixture ZEC claim",
    "Confirm fixture ZEC claim",
  ]);

  await expect(page.getByRole("heading", { name: "Fixture settled" })).toBeVisible();
  await expect(page.getByText("Fixture journey complete. No asset moved.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Fixture settled" })).toBeDisabled();
  await expect(page.getByRole("table", { name: "Current deterministic native swap fixture evidence" })).toContainText("settled");
  expect(serviceRequests).toEqual([]);
});

test("native settlement refund path stays early, then recovers both fixture legs", async ({ page }) => {
  await page.goto("/trade?view=settlement&market=ZEC/USDC", { waitUntil: "networkidle" });
  await page.getByRole("combobox", { name: "Fixture scenario" }).selectOption("refund");
  await runNativeFixtureActions(page, fundedNativeFixtureActions);

  await expect(page.getByText("Both fixture locks are funded. Neither leg is settled, and refund remains early.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Record fixture USDC refund" })).toHaveCount(0);
  await page.getByRole("button", { name: "Advance fixture to USDC refund deadline" }).click();
  await expect(page.getByRole("button", { name: "Record fixture USDC refund" })).toBeEnabled();

  await runNativeFixtureActions(page, [
    "Record fixture USDC refund",
    "Confirm fixture USDC refund",
    "Advance fixture to ZEC refund deadline",
    "Record fixture ZEC refund",
    "Confirm fixture ZEC refund",
  ]);
  await expect(page.getByRole("heading", { name: "Fixture refunded" })).toBeVisible();
  await expect(page.getByText("Fixture refund complete. No transaction was submitted.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Fixture refunded" })).toBeDisabled();
});

for (const unsafe of [
  ["stale", "Approved observer watermark is stale."],
  ["conflict", "Approved observers disagree on the stablecoin lock."],
  ["reorganization", "The fixture EVM claim left the canonical chain."],
  ["contract-mismatch", "Observed contract identity differs from the signed fixture terms."],
] as const) {
  test(`native settlement ${unsafe[0]} evidence disables funding and claim`, async ({ page }) => {
    await page.goto("/trade?view=settlement&market=ZEC/USDC", { waitUntil: "networkidle" });
    await page.getByRole("combobox", { name: "Fixture scenario" }).selectOption(unsafe[0]);
    await expect(page.getByRole("heading", { name: "Disputed fixture evidence" })).toBeFocused();
    await expect(page.getByRole("alert").filter({ hasText: unsafe[1] })).toBeVisible();
    const disabled = page.getByRole("button", { name: "Fixture action disabled" });
    await expect(disabled).toBeDisabled();
    await expect(disabled).toHaveAttribute("aria-describedby", "native-swap-action-disabled");
    await expect(page.getByText("Evidence is unsafe or conflicting. Funding and claim controls remain disabled.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Reset fixture" })).toBeEnabled();
  });
}

test("native settlement announces progress, moves focus, and resets safely by keyboard", async ({ page }) => {
  await page.goto("/trade?view=settlement&market=ZEC/USDC", { waitUntil: "networkidle" });
  const action = page.getByRole("button", { name: "Accept exact fixture terms" });
  await action.focus();
  await expectVisibleFocus(action);
  await page.keyboard.press("Enter");

  const phaseHeading = page.getByRole("heading", { name: "Terms accepted" });
  await expect(phaseHeading).toBeFocused();
  await expect(page.locator('li[aria-current="step"]')).toContainText("ZEC lock");
  await expect(page.getByTestId("native-swap-live")).toHaveText(
    "Exact fixture terms accepted. ZEC lock preparation is now available.",
  );

  await page.getByRole("combobox", { name: "Fixture scenario" }).selectOption("stale");
  await page.getByRole("button", { name: "Reset fixture" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Matched fixture" })).toBeFocused();
  await expect(page.getByRole("button", { name: "Accept exact fixture terms" })).toBeEnabled();
});

test("native settlement keeps USDT disabled until one exact asset identity is approved", async ({ page }) => {
  await page.goto("/trade?view=settlement&market=ZEC/USDT", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "USDT identity unresolved" })).toBeVisible();
  await expect(page.getByText("USDT is not USDT0.", { exact: true })).toBeVisible();
  await expect(page.getByText(
    "USDT and USDT0 are not interchangeable. No exact network and token contract has been approved for this walkthrough.",
    { exact: true },
  )).toBeVisible();
  const disabled = page.getByRole("button", { name: "Fixture action disabled" });
  await expect(disabled).toBeDisabled();
  await expect(disabled).toHaveAttribute("aria-describedby", "native-swap-disabled-reason");
  await expect(page.getByRole("button", { name: /connect.*wallet/i })).toHaveCount(0);

  await page.getByRole("combobox", { name: "Selected native settlement market" }).selectOption("ZEC/USDC");
  await expect(page.getByRole("heading", { name: "Matched fixture" })).toBeVisible();
  await expect(page).toHaveURL(/\/trade\?market=ZEC%2FUSDC&view=settlement$/);
});

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
  await page.getByRole("button", { name: "Issue testnet TEX" }).click();
  await expect(page.getByText("Local gateway unavailable. No receivable address is displayed.")).toBeVisible();
  await expect(page.getByText("tex1", { exact: false })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Withdrawal states" })).toBeVisible();
  await page.getByRole("button", { name: "Withdrawal states" }).click();
  await expect(page.getByText("Preview withdrawal states, not Withdraw ZEC.")).toBeVisible();
  await page.getByRole("button", { name: "Next state" }).click();
  await expect(page.getByText("Screened", { exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "Transparent destination to inspect" }).fill("zs1notreal");
  await expect(page.getByText("Shielded and unified addresses are out of scope.")).toBeVisible();
  await page.getByRole("textbox", { name: "Transparent destination to inspect" }).fill("t1Zo4ZzPXJiJ8M8pYMgL4tWbdkH7c8r7abc");
  await expect(page.getByText("Payout stub would accept this destination shape. Nothing is sent.")).toBeVisible();
});

test("local matcher fills a buy against the fixture ask", async ({ page }) => {
  await page.goto("/trade", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Ask 52.91" }).click();
  await page.getByRole("textbox", { name: "Order size in pZEC" }).fill("1");
  await page.getByRole("button", { name: "Review simulated buy" }).click();
  await expect(page.getByText("Legacy simulation only. pZEC is not the target asset.")).toBeVisible();
  await page.getByRole("button", { name: "Confirm simulated buy" }).click();
  await expect(page.getByText(/Filled against the local ZEC\/USDC book/)).toBeVisible();
  await expect(page.getByRole("tab", { name: "Fills" })).toBeVisible();
  await page.getByRole("tab", { name: "Fills" }).click();
  await expect(page.getByRole("table", { name: /Session fills for ZEC\/USDC/ })).toBeVisible();
});

test("price improvement cannot create a free pZEC atom", async ({ page }) => {
  await page.goto("/trade", { waitUntil: "networkidle" });
  await page.getByRole("textbox", { name: "Price in USDC" }).fill("100");
  await page.getByRole("textbox", { name: "Order size in pZEC" }).fill("0.00000001");
  await page.getByRole("button", { name: "Review simulated buy" }).click();
  await page.getByRole("button", { name: "Confirm simulated buy" }).click();
  await expect(page.getByText(/Dust-blocked crossed remainder was cancelled/)).toBeVisible();

  await page.getByRole("tab", { name: "Inventory" }).click();
  const blotter = page.getByRole("region", { name: "Open orders, fills, inventory" });
  await expect(blotter.getByText("100", { exact: true })).toBeVisible();
  await expect(blotter.getByText("10000.00", { exact: true })).toBeVisible();
});

test("status and missing routes stay labeled as simulation", async ({ page }) => {
  const status = await page.goto("/status", { waitUntil: "load" });
  expect(status?.ok(), "/status response").toBe(true);
  await expect(page.getByRole("heading", { name: "Simulation status" })).toBeVisible();
  await expect(page.getByText("in-browser", { exact: true })).toBeVisible();
  await expect(page.getByText("live funds", { exact: false })).toBeVisible();
  await expect(page.getByText("deny-default", { exact: true })).toBeVisible();
  await expect(page.getByText("unset", { exact: true })).toBeVisible();

  const missing = await page.goto("/this-route-is-not-part-of-the-simulation", { waitUntil: "load" });
  expect(missing?.status(), "404 status").toBe(404);
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await expect(page.getByText("Simulation only", { exact: true })).toBeVisible();
});

test("public operator APIs stay unavailable without a loopback operator URL", async ({ page }) => {
  const gateway = await page.request.post("/api/deposit-intent");
  expect(gateway.status()).toBe(503);
  expect((await gateway.json()).reason).toBe("gateway-unavailable");
  const matcher = await page.request.get("/api/matcher");
  expect(matcher.status()).toBe(503);
  expect((await matcher.json()).reason).toBe("matcher-unavailable");
  const matcherPost = await page.request.post("/api/matcher", { data: {} });
  expect(matcherPost.status()).toBe(503);
  expect((await matcherPost.json()).reason).toBe("matcher-unavailable");
});

test("ZIP 321 copy stays disabled without a gateway", async ({ page }) => {
  await page.goto("/trade?view=bridge", { waitUntil: "networkidle" });
  await expect(page.getByRole("button", { name: "Copy testnet URI" })).toHaveCount(0);
  await page.getByRole("button", { name: "Issue testnet TEX" }).click();
  await expect(page.getByText("No receivable address is displayed.")).toBeVisible();
});

test("stale market data disables preview-to-sign and retries to illustrative", async ({ page }) => {
  await page.goto("/trade", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Review simulated buy" }).click();
  await expect(page.getByRole("button", { name: "Confirm simulated buy" })).toBeVisible();
  await page.getByRole("combobox", { name: "Market data state" }).selectOption("stale");
  await expect(page.getByText("Market data stale", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm simulated buy" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Review simulated buy" })).toBeDisabled();
  await page.getByRole("button", { name: "Retry illustrative feed" }).click();
  await expect(page.getByRole("button", { name: "Review simulated buy" })).toBeEnabled();
  await expect(page).toHaveURL(/\/trade/);
});

test("review names the cheaper venue before confirm", async ({ page }) => {
  await page.goto("/trade", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Ask 52.91" }).click();
  await page.getByRole("textbox", { name: "Order size in pZEC" }).fill("1");
  await page.getByRole("button", { name: "Review simulated buy" }).click();
  await expect(page.getByText("CLOB cheaper for a full fill", { exact: true })).toBeVisible();
  await expect(page.getByText("Confirm submits only the local CLOB")).toBeVisible();
  await expect(page.getByText("Leaves the session")).toBeVisible();
  await expect(page.getByText("publicly linkable", { exact: false })).toBeVisible();
  await expect(page.getByText("Proposed taker 15 bps", { exact: false })).toBeVisible();
});

test("GTC remainder can be cancelled and epoch invalidation is visible", async ({ page }) => {
  await page.goto("/trade", { waitUntil: "networkidle" });
  await page.getByRole("textbox", { name: "Price in USDC" }).fill("50.00");
  await page.getByRole("textbox", { name: "Order size in pZEC" }).fill("1");
  await page.getByRole("button", { name: "Review simulated buy" }).click();
  await page.getByRole("button", { name: "Confirm simulated buy" }).click();
  await expect(page.getByRole("button", { name: "Cancel", exact: true })).toBeVisible();
  await expect(page.getByRole("table", { name: /Resting session orders on the local ZEC\/USDC book, settled as pZEC-USDC/ })).toBeVisible();
  await page.getByRole("button", { name: "Invalidate older session orders" }).click();
  await expect(page.getByText("No open session orders", { exact: false })).toBeVisible();
  await page.getByRole("tab", { name: "Inventory" }).click();
  const blotter = page.getByRole("region", { name: "Open orders, fills, inventory" });
  await expect(blotter.getByText("Account epoch")).toBeVisible();
});

test("USDT market names USDT0 settlement and empty feed shows no depth", async ({ page }) => {
  await page.goto("/trade", { waitUntil: "networkidle" });
  await page.getByRole("combobox", { name: "Selected market" }).selectOption("ZEC/USDT");
  await expect(page.getByText("legacy simulation: pZEC-USDT0")).toBeVisible();
  await page.getByRole("combobox", { name: "Market data state" }).selectOption("empty");
  await expect(page.getByText("No resting depth. The local book is empty.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Review simulated buy" })).toBeDisabled();
  await page.getByRole("combobox", { name: "Market data state" }).selectOption("loading");
  await expect(page.getByText("Loading market data", { exact: true })).toBeVisible();
});

test("LP preview shows integer IL versus hold", async ({ page }) => {
  await page.goto("/liquidity", { waitUntil: "networkidle" });
  const stats = page.getByRole("group", { name: "Pool stats and impermanent loss versus hold" });
  await expect(stats.getByText("IL vs hold at 4x pZEC/quote")).toBeVisible();
  await expect(stats.getByText("IL vs hold at 1/4x pZEC/quote")).toBeVisible();
  await expect(page.getByText("Not a return or profit projection.")).toBeVisible();
  await page.getByRole("button", { name: "Review simulated mint" }).click();
  await expect(page.getByText("Leaves the session")).toBeVisible();
  await page.getByRole("button", { name: "Confirm simulated mint" }).click();
  await expect(page.getByText(/Minted .* local LP shares/)).toBeVisible();
  await expect(stats.getByText("Session IL vs hold")).toBeVisible();
});

test("LP burn stays available after a trading pause", async ({ page }) => {
  await page.goto("/liquidity", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Review simulated mint" }).click();
  await page.getByRole("button", { name: "Confirm simulated mint" }).click();
  await expect(page.getByText(/Minted .* local LP shares/)).toBeVisible();
  await page.getByRole("button", { name: "Pause trading preview" }).click();
  await expect(page.getByRole("button", { name: "Review simulated mint" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Review simulated swap" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Burn session shares" })).toBeEnabled();
  await page.getByRole("button", { name: "Burn session shares" }).click();
  await expect(page.getByText(/Burned session shares/)).toBeVisible();
});

test("withdrawal tour drives a stub claim without changing tour copy", async ({ page }) => {
  await page.goto("/trade?view=bridge", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Withdrawal states" }).click();
  await expect(page.getByText("Amount, transparent destination, network fee, service fee, and net output would be reviewed before any burn.")).toBeVisible();
  await page.getByRole("textbox", { name: "Transparent destination to inspect" }).fill("t1Zo4ZzPXJiJ8M8pYMgL4tWbdkH7c8r7abc");
  await expect(page.getByText("Stub claim: requested. Nothing is sent.")).toBeVisible();
  await page.getByRole("button", { name: "Next state" }).click();
  await expect(page.getByText("Screened", { exact: true })).toBeVisible();
  await expect(page.getByText("Stub claim: screened. Nothing is sent.")).toBeVisible();
});

test("IOC cancels an unfilled remainder and FOK rejects a full miss", async ({ page }) => {
  await page.goto("/trade", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "IOC" }).click();
  await page.getByRole("textbox", { name: "Price in USDC" }).fill("50.00");
  await page.getByRole("textbox", { name: "Order size in pZEC" }).fill("1");
  await page.getByRole("button", { name: "Review simulated buy" }).click();
  await page.getByRole("button", { name: "Confirm simulated buy" }).click();
  await expect(page.getByText(/Unfilled size was cancelled/)).toBeVisible();

  await page.getByRole("button", { name: "FOK" }).click();
  await page.getByRole("textbox", { name: "Price in USDC" }).fill("52.91");
  await page.getByRole("textbox", { name: "Order size in pZEC" }).fill("100");
  await page.getByRole("button", { name: "Review simulated buy" }).click();
  await page.getByRole("button", { name: "Confirm simulated buy" }).click();
  await expect(page.getByText("Rejected. Fill-or-kill could not fill in full", { exact: true })).toBeVisible();
});

test("invalidate-epoch control is keyboard focusable", async ({ page }) => {
  await page.goto("/trade", { waitUntil: "networkidle" });
  const invalidate = page.getByRole("button", { name: "Invalidate older session orders" });
  await invalidate.focus();
  await expect(invalidate).toBeFocused();
});

test("liquidity previews integer IL versus hold without a return claim", async ({ page }) => {
  await page.goto("/liquidity", { waitUntil: "networkidle" });
  await expect(page.getByText("IL vs hold at 4x pZEC/quote")).toBeVisible();
  await expect(page.getByText("IL vs hold at 1/4x pZEC/quote")).toBeVisible();
  await expect(page.getByText("Not a return or profit projection.")).toBeVisible();
});

test("market orders are IOC with a visible worst price", async ({ page }) => {
  await page.goto("/trade", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Market" }).click();
  await page.getByRole("textbox", { name: "Order size in pZEC" }).fill("1");
  await page.getByRole("button", { name: "Review simulated buy" }).click();
  await expect(page.getByText("Worst acceptable price")).toBeVisible();
  await expect(page.getByText("IOC", { exact: true })).toBeVisible();
});

test("invalid expiry stays on the ticket and does not open review", async ({ page }) => {
  await page.goto("/trade", { waitUntil: "networkidle" });
  await page.getByRole("textbox", { name: "Order expiry unix time" }).fill("1.5");
  await page.getByRole("button", { name: "Review simulated buy" }).click();
  await expect(page.getByText("Expiry must be a whole unix time, or 0 for none.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm simulated buy" })).toHaveCount(0);
});

test("order expiry unix time appears on review", async ({ page }) => {
  await page.goto("/trade", { waitUntil: "networkidle" });
  await expect(page.getByRole("textbox", { name: "Order expiry unix time" })).toHaveValue("0");
  await page.getByRole("textbox", { name: "Order size in pZEC" }).fill("1");
  await page.getByRole("textbox", { name: "Order expiry unix time" }).fill("1700000000");
  await page.getByRole("button", { name: "Review simulated buy" }).click();
  await expect(page.getByText("1700000000").first()).toBeVisible();
});

test("architecture view keeps Vercel off the matcher", async ({ page }) => {
  await page.goto("/trade?view=architecture", { waitUntil: "networkidle" });
  await expect(page.getByText("Loopback gateway and matcher never hosted on Vercel")).toBeVisible();
  await expect(page.getByText(/matcher can censor or delay orders, so it is not trustless/)).toBeVisible();
});

test("connect wallet without a provider shows a visible rejection", async ({ page }) => {
  await page.goto("/trade", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Connect Arbitrum Sepolia wallet" }).click();
  await expect(page.getByText("No injected EVM wallet. Arbitrum Sepolia only.")).toBeVisible();
});

test("past unix expiry rejects before review and names the rejected panel", async ({ page }) => {
  await page.goto("/trade", { waitUntil: "networkidle" });
  await page.getByRole("textbox", { name: "Order size in pZEC" }).fill("1");
  await page.getByRole("textbox", { name: "Order expiry unix time" }).fill("1");
  await page.getByRole("button", { name: "Review simulated buy" }).click();
  await expect(page.getByText("Order rejected", { exact: true })).toBeVisible();
  await expect(page.getByText("Order expiry has passed").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm simulated buy" })).toHaveCount(0);
});

test("confirmed ticket writes expiry onto the blotter event log", async ({ page }) => {
  await page.goto("/trade", { waitUntil: "networkidle" });
  await page.getByRole("textbox", { name: "Order size in pZEC" }).fill("1");
  await page.getByRole("textbox", { name: "Order expiry unix time" }).fill("4102444800");
  await page.getByRole("button", { name: "Review simulated buy" }).click();
  await page.getByRole("button", { name: "Confirm simulated buy" }).click();
  await page.getByRole("tab", { name: "Event log" }).click();
  await expect(page.getByRole("tabpanel")).toContainText("expiry 4102444800");
});

test("status, legal, and security pages cross-link", async ({ page }) => {
  await page.goto("/status", { waitUntil: "networkidle" });
  await expect(page.getByRole("main").getByRole("link", { name: "Legal" })).toBeVisible();
  await page.goto("/legal", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Legal and compliance" })).toBeVisible();
  await expect(page.getByText("not a live exchange")).toBeVisible();
  await page.goto("/security", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Security" })).toBeVisible();
  await expect(page.getByText("no production support commitment")).toBeVisible();
});

test("blotter tabs expose a selected tabpanel", async ({ page }) => {
  await page.goto("/trade", { waitUntil: "networkidle" });
  await expect(page.getByRole("tab", { name: "Open orders" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel")).toContainText("No open session orders");
  await page.getByRole("tab", { name: "Inventory" }).click();
  await expect(page.getByRole("tabpanel")).toContainText("Account epoch");
});
