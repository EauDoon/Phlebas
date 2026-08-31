import { type Locator, type Page } from "@playwright/test";

import { expect, test } from "./fixtures";

const viewports = [320, 390, 768, 1440] as const;

const routes = [
  {
    path: "/",
    disclosure: "Simulation only",
    marker: "An order book for pZEC, with the custody line drawn in public.",
  },
  {
    path: "/trade",
    disclosure: "Protocol preview",
    marker: "legacy simulation: pZEC-USDC",
  },
  {
    path: "/liquidity",
    disclosure: "Protocol preview",
    marker: "Provide liquidity",
  },
  {
    path: "/legal",
    disclosure: "Simulation only",
    marker: "product copy, not legal advice",
  },
  {
    path: "/security",
    disclosure: "Simulation only",
    marker: "no production support commitment",
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
          await expect(page.getByRole("heading", { name: "Current system" })).toBeVisible();
          await expect(page.getByText("Wallet connection")).toBeVisible();
          await expect(page.getByText("Unavailable", { exact: true })).toBeVisible();
          await expect(page.getByText(
            "pZEC is not native ZEC, shielded ZEC, or a trustless bridge asset.",
            { exact: true },
          )).toBeVisible();
          await expect(page.getByLabel("Current system").getByText("No-value preview", { exact: true })).toBeVisible();
          await expect(page.getByRole("link", { name: "Open status details" })).toBeVisible();
          await expect(page.getByRole("contentinfo").getByRole("link", { name: "Legal and compliance" })).toBeVisible();
          await expect(page.getByRole("heading", { name: "Choose what to inspect." })).toBeVisible();
          await expect(page.getByRole("tab", { name: "Trader" })).toBeVisible();
          await expect(page.getByRole("tab", { name: "Withdrawal" })).toBeVisible();
          await expect(page.getByRole("heading", { name: "A working preview, bounded on purpose." })).toBeVisible();
          await expect(page.getByRole("heading", { name: "Order book preview" })).toBeVisible();
          await expect(page.getByRole("heading", { name: "Inspect the market model without connecting a wallet." })).toBeVisible();
          await expect(page.getByText("Simulation", { exact: true })).toBeVisible();
          await expect(page.getByRole("link", { name: "Open full simulation" })).toBeVisible();
          await expect(page.getByText("Not a live book.")).toBeVisible();
          await expect(page.locator("#launch-gates").getByText("Not cleared", { exact: true })).toHaveCount(6);
          await expect(page.getByRole("link", { name: "Read the launch gates" })).toBeVisible();
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
      await expect(page.getByRole("radio", { name: "ZEC / USDC" })).toHaveAttribute("aria-checked", "true");
      await expect(page.getByText("legacy simulation: pZEC-USDC", { exact: true })).toBeVisible();

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
      const traderTab = page.getByRole("tab", { name: "Trader" });
      await tabTo(page, traderTab);
      await expectVisibleFocus(traderTab);
      await page.keyboard.press("ArrowRight");
      const lpTab = page.getByRole("tab", { name: "LP" });
      await expectVisibleFocus(lpTab);
      await page.keyboard.press("Enter");
      const lpLink = page.getByRole("link", { name: "Preview liquidity" });
      await tabTo(page, lpLink);
      await expectVisibleFocus(lpLink);
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(/\/liquidity$/);
      await expect(page.getByRole("heading", { name: "Provide liquidity" })).toBeVisible();

      await page.goto("/trade?view=liquidity", { waitUntil: "networkidle" });
      await expect(page.getByRole("heading", { name: "Provide liquidity" })).toBeVisible();

      await page.goto("/trade", { waitUntil: "networkidle" });
      const tradeNavigation = page.getByRole("tab", { name: "Trade" });
      await tabTo(page, tradeNavigation);
      await expectVisibleFocus(tradeNavigation);
      await page.keyboard.press("ArrowRight");
      const liquidityNavigation = page.getByRole("tab", { name: "Liquidity" });
      await expectVisibleFocus(liquidityNavigation);
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(/\/liquidity\?market=ZEC%2FUSDC$/);
      await expect(page.getByRole("heading", { name: "Provide liquidity" })).toBeVisible();

      const laterPool = page.getByRole("radio", { name: /pZEC\/USDT0/ });
      await tabTo(page, laterPool);
      await expectVisibleFocus(laterPool);
      await page.keyboard.press("Enter");
      await expect(laterPool).toHaveAttribute("aria-checked", "true");
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
  await expect(page.getByText("Value must use no more than 8 decimal places").first()).toBeVisible();
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
  await expect(page.getByText(/Legacy simulation only\. pZEC is a custody receipt, not native ZEC/)).toBeVisible();
  await page.getByRole("button", { name: "Confirm simulated buy" }).click();
  await expect(page.getByText(/Filled against the local ZEC\/USDC book/)).toBeVisible();
  await expect(page.getByText("Nothing was signed or submitted to a chain.")).toBeVisible();
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
  const boundary = page.locator("main#main-content");
  await expect(boundary.getByRole("link", { name: "Legal and compliance" })).toBeVisible();
  await expect(boundary.getByRole("link", { name: "Security" })).toHaveCount(2);
  await expect(boundary.getByRole("link", { name: "Architecture" })).toBeVisible();
  await expect(boundary.getByRole("link", { name: "Launch gates" })).toBeVisible();

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
  await page.getByRole("radio", { name: "Stale" }).click();
  await expect(page.getByText("Market data stale", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm simulated buy" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Review simulated buy" })).toBeDisabled();
  await page.getByRole("button", { name: "Retry illustrative feed" }).click();
  await expect(page.getByRole("button", { name: "Review simulated buy" })).toBeEnabled();
  await expect(page).toHaveURL(/\/trade/);
});

test("Escape leaves review without confirming a session order", async ({ page }) => {
  await page.goto("/trade", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Review simulated buy" }).click();
  await expect(page.getByRole("button", { name: "Confirm simulated buy" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Confirm simulated buy" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Review simulated buy" })).toBeVisible();
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
  await page.getByRole("radio", { name: "ZEC / USDT" }).click();
  await expect(page.getByText("legacy simulation: pZEC-USDT0")).toBeVisible();
  await page.getByRole("radio", { name: "Empty" }).click();
  await expect(page.getByText("No resting depth. The local book is empty.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Review simulated buy" })).toBeDisabled();
  await page.getByRole("radio", { name: "Loading" }).click();
  await expect(page.getByText("Loading market data", { exact: true }).first()).toBeVisible();
});

test("LP preview shows integer IL versus hold", async ({ page }) => {
  await page.goto("/liquidity", { waitUntil: "networkidle" });
  const stats = page.getByRole("group", { name: "Pool stats and impermanent loss versus hold" });
  await expect(stats.getByText("IL vs hold at 4x pZEC/quote")).toBeVisible();
  await expect(stats.getByText("IL vs hold at 1/4x pZEC/quote")).toBeVisible();
  await expect(page.getByText("Not a return or profit projection.")).toBeVisible();
  await page.getByRole("button", { name: "Review simulated mint" }).click();
  await expect(page.getByText("pZEC is a custody receipt, not native ZEC.")).toBeVisible();
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
  await expect(page.getByText("Expiry must be a whole unix time, or 0 for none.").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm simulated buy" })).toHaveCount(0);
});

test("order expiry unix time appears on review", async ({ page }) => {
  const expiry = String(Math.floor(Date.now() / 1000) + 3600);
  await page.goto("/trade", { waitUntil: "networkidle" });
  await expect(page.getByRole("textbox", { name: "Order expiry unix time" })).toHaveValue("0");
  await page.getByRole("textbox", { name: "Order size in pZEC" }).fill("1");
  await page.getByRole("textbox", { name: "Order expiry unix time" }).fill(expiry);
  await page.getByRole("button", { name: "Review simulated buy" }).click();
  await expect(page.getByRole("button", { name: "Confirm simulated buy" })).toBeVisible();
  await expect(page.getByText(expiry).first()).toBeVisible();
});

test("session event log includes expiry after confirm", async ({ page }) => {
  const expiry = String(Math.floor(Date.now() / 1000) + 3600);
  await page.goto("/trade", { waitUntil: "networkidle" });
  await page.getByRole("textbox", { name: "Order size in pZEC" }).fill("1");
  await page.getByRole("textbox", { name: "Order expiry unix time" }).fill(expiry);
  await page.getByRole("button", { name: "Review simulated buy" }).click();
  await page.getByRole("button", { name: "Confirm simulated buy" }).click();
  await page.getByRole("tab", { name: "Event log" }).click();
  await expect(page.getByText(`buy GTC user-1 expiry ${expiry}`)).toBeVisible();
});

test("architecture view keeps Vercel off the matcher", async ({ page }) => {
  await page.goto("/trade?view=architecture", { waitUntil: "networkidle" });
  await expect(page.getByText("Loopback gateway and matcher never hosted on Vercel")).toBeVisible();
  await expect(page.getByText(/The matcher is not trustless/)).toBeVisible();
});

test("connect wallet without a provider shows a visible rejection", async ({ page }) => {
  await page.goto("/trade", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Connect Arbitrum Sepolia wallet" }).click();
  await expect(page.getByText("No injected EVM wallet. Arbitrum Sepolia only.")).toBeVisible();
});

test("first-session education can be completed by keyboard", async ({ page }) => {
  await page.goto("/trade?education=1", { waitUntil: "networkidle" });
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "This is a no-value simulation." })).toBeFocused();
  await dialog.getByRole("button", { name: "Continue" }).click();
  await expect(dialog.getByRole("heading", { name: "pZEC would depend on custody." })).toBeVisible();
  await dialog.getByRole("button", { name: "Continue" }).click();
  await expect(dialog.getByRole("heading", { name: "Preview actions stay in this browser." })).toBeVisible();
  await dialog.getByRole("button", { name: "Enter simulation" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Review simulated buy" })).toBeVisible();
});

test("ticket G I F shortcuts set time in force", async ({ page }) => {
  await page.goto("/trade", { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Order entry" }).click();
  await expect(page.getByRole("button", { name: "GTC" })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("i");
  await expect(page.getByRole("button", { name: "IOC" })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("f");
  await expect(page.getByRole("button", { name: "FOK" })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("g");
  await expect(page.getByRole("button", { name: "GTC" })).toHaveAttribute("aria-pressed", "true");
});

test("first-session education dismisses on Escape", async ({ page }) => {
  await page.goto("/trade?education=1", { waitUntil: "networkidle" });
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "This is a no-value simulation." })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Review simulated buy" })).toBeVisible();
});

test("landing Markets control points at the terminal preview", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/", { waitUntil: "networkidle" });
  await page.locator("header").getByRole("link", { name: "Markets" }).click();
  await expect(page).toHaveURL(/#terminal-preview$/);
  await expect(page.locator("#terminal-preview")).toBeInViewport();
});

test("education dialog stays inside a 320px viewport", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/trade?education=1", { waitUntil: "networkidle" });
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Continue" })).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box, "education dialog bounding box").toBeTruthy();
  expect(box?.width ?? 0).toBeLessThanOrEqual(320);
  const continueBox = await dialog.getByRole("button", { name: "Continue" }).boundingBox();
  expect(continueBox?.height ?? 0).toBeGreaterThanOrEqual(44);
  const overflow = await page.evaluate(() => ({
    body: document.body.scrollWidth - document.body.clientWidth,
    document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  expect(overflow).toEqual({ body: 0, document: 0 });
});

test("country-blocked demonstration hides trading controls", async ({ page }) => {
  await page.goto("/trade?access=blocked", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Phlebas is not available in this location." })).toBeVisible();
  await expect(page.getByText("State demonstration")).toBeVisible();
  await expect(page.getByRole("button", { name: "Review simulated buy" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Read the architecture" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Return home" })).toBeVisible();
});

test("country-blocked demonstration hides liquidity controls", async ({ page }) => {
  await page.goto("/liquidity?access=blocked", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Phlebas is not available in this location." })).toBeVisible();
  await expect(page.getByText("State demonstration")).toBeVisible();
  await expect(page.getByRole("button", { name: "Review simulated mint" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Review simulated swap" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Read the architecture" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Return home" })).toBeVisible();
});

test("deposit tour never shows a receivable address", async ({ page }) => {
  await page.goto("/trade?view=bridge", { waitUntil: "networkidle" });
  await expect(page.getByText("Preview deposit states, not Deposit ZEC.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Eligibility", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Next state" }).click();
  await expect(page.getByText("No address generated in simulation.")).toBeVisible();
  await expect(page.getByText("tex1", { exact: false })).toHaveCount(0);
  await page.getByRole("button", { name: "Next state" }).click();
  await page.getByRole("button", { name: "Next state" }).click();
  await page.getByRole("button", { name: "Next state" }).click();
  await page.getByRole("button", { name: "Next state" }).click();
  await page.getByRole("button", { name: "Next state" }).click();
  await expect(page.getByText("State demonstration complete. No native ZEC was received and no pZEC was minted.")).toBeVisible();
});

test("unavailable feed retry returns to illustrative", async ({ page }) => {
  await page.goto("/trade?feed=unavailable", { waitUntil: "networkidle" });
  await expect(page.getByText("Market data unavailable", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Review simulated buy" })).toBeDisabled();
  await page.getByRole("button", { name: "Retry illustrative feed" }).click();
  await expect(page.getByRole("button", { name: "Review simulated buy" })).toBeEnabled();
});

test("architecture incident demonstrations stay labeled", async ({ page }) => {
  await page.goto("/trade?view=architecture", { waitUntil: "networkidle" });
  await page.getByLabel("Gateway incident demonstration").selectOption("unplanned-maintenance");
  const demo = page.getByRole("region", { name: "Blocked, review, reorg, and maintenance copy" });
  await expect(demo.getByRole("strong")).toHaveText("This service is temporarily unavailable.");
  await expect(demo.getByText("These screens are labeled demonstrations.")).toBeVisible();
});

test("legal and security pages stay simulation-only", async ({ page }) => {
  await page.goto("/legal", { waitUntil: "load" });
  await expect(page.getByRole("heading", { name: "Legal and compliance" })).toBeVisible();
  await expect(page.getByText("No licensed entity is operating this interface.")).toBeVisible();
  await page.goto("/security", { waitUntil: "load" });
  await expect(page.getByRole("heading", { name: "Security" })).toBeVisible();
  await expect(page.getByText("Do not send ZEC, pZEC, USDC, USDT0, or any other asset")).toBeVisible();
});

test("landing without JavaScript still shows four journey descriptions", async ({ browser, serverUrl }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL: serverUrl });
  const page = await context.newPage();
  try {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Choose what to inspect." })).toBeVisible();
    await expect(page.getByRole("link", { name: /Preview trading/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Preview liquidity/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Preview deposit states/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Preview withdrawal states/ })).toBeVisible();
    const journeyCard = page.getByRole("list", { name: "Preview journeys" }).getByRole("listitem").first();
    await expect(journeyCard).toBeVisible();
    expect((await journeyCard.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    const journeyAction = page.getByRole("link", { name: /Preview trading/ });
    await expect(journeyAction).toBeVisible();
    expect((await journeyAction.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    await expect(page.getByText(
      "pZEC is not native ZEC, shielded ZEC, or a trustless bridge asset.",
      { exact: true },
    )).toBeVisible();
  } finally {
    await context.close();
  }
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

test("blotter tabs expose a selected tabpanel", async ({ page }) => {
  await page.goto("/trade", { waitUntil: "networkidle" });
  await expect(page.getByRole("tab", { name: "Open orders" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel")).toContainText("No open session orders");
  await page.getByRole("tab", { name: "Inventory" }).click();
  await expect(page.getByRole("tabpanel")).toContainText("Account epoch");
});

test("landing skip links follow on-page order", async ({ page }) => {
  const skipOrder = [
    { label: "Skip to main content", href: "#main-content" },
    { label: "Skip to markets", href: "#markets" },
    { label: "Skip to evidence", href: "#exists-today" },
    { label: "Skip to pZEC", href: "#pzec" },
    { label: "Skip to terminal preview", href: "#terminal-preview" },
    { label: "Skip to journeys", href: "#journeys" },
    { label: "Skip to launch gates", href: "#launch-gates" },
  ] as const;

  await page.goto("/", { waitUntil: "networkidle" });
  for (const skip of skipOrder) {
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: skip.label })).toBeFocused();
  }

  for (const skip of skipOrder.slice(1)) {
    await page.goto("/", { waitUntil: "networkidle" });
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
    const skipLink = page.getByRole("link", { name: skip.label });
    await tabTo(page, skipLink);
    await page.keyboard.press("Enter");
    await expect(page.locator(skip.href)).toBeFocused();
    await expect(page.locator(skip.href)).toBeInViewport();
  }
});

test("landing Menu Markets opens the terminal preview at 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Menu" }).click();
  await expect(page.getByRole("dialog", { name: "Navigate Phlebas" })).toBeVisible();
  await page.getByRole("dialog").getByRole("link", { name: "Markets" }).click();
  await expect(page.getByRole("dialog", { name: "Navigate Phlebas" })).not.toBeVisible();
  await expect(page).toHaveURL(/#terminal-preview$/);
  await expect(page.locator("#terminal-preview")).toBeInViewport();
  const overflow = await page.evaluate(() => ({
    body: document.body.scrollWidth - document.body.clientWidth,
    document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  expect(overflow).toEqual({ body: 0, document: 0 });
});

test("architecture incident select stays inside 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/trade?view=architecture", { waitUntil: "networkidle" });
  const select = page.getByLabel("Gateway incident demonstration");
  await expect(select).toBeVisible();
  const box = await select.boundingBox();
  expect(box, "incident select bounding box").toBeTruthy();
  expect(box?.width ?? 0).toBeLessThanOrEqual(320);
  await select.selectOption("country-blocked");
  const overflow = await page.evaluate(() => ({
    body: document.body.scrollWidth - document.body.clientWidth,
    document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  expect(overflow).toEqual({ body: 0, document: 0 });
});

test("blotter arrows move focus and Enter selects", async ({ page }) => {
  await page.goto("/trade", { waitUntil: "networkidle" });
  const orders = page.getByRole("tab", { name: "Open orders" });
  const fills = page.getByRole("tab", { name: "Fills" });
  await orders.focus();
  await expect(orders).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(fills).toBeFocused();
  await expect(orders).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Enter");
  await expect(fills).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel")).toContainText("No session fills yet");
  await page.keyboard.press(" ");
  await expect(fills).toHaveAttribute("aria-selected", "true");
});

test("chart and 24h stats name stale and unavailable feeds", async ({ page }) => {
  await page.goto("/trade", { waitUntil: "networkidle" });
  await expect(page.getByText("Illustrative market data", { exact: true })).toBeVisible();
  await expect(page.getByText("24h figures are repository fixtures. Not a live, delayed, or production feed.")).toBeVisible();
  await page.getByRole("radio", { name: "Stale" }).click();
  await expect(page.getByText("Market data stale", { exact: true })).toHaveCount(2);
  await expect(page.getByText("24h figures stay fixture labels while market data is stale as of 2026-08-30T16:32:08Z.")).toBeVisible();
  await expect(page.getByRole("img", { name: /Delayed illustrative/ })).toBeVisible();
  await page.getByRole("radio", { name: "Unavailable" }).click();
  await expect(page.getByText("Market data unavailable", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("24h figures stay withheld.")).toBeVisible();
  await expect(page.getByRole("img", { name: /price chart/ })).toHaveCount(0);
});

test("LP mint and swap wait on the same feed gate as the ticket", async ({ page }) => {
  await page.goto("/liquidity?feed=stale", { waitUntil: "networkidle" });
  await expect(page.getByText("Market data stale", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Review simulated mint" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Review simulated swap" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Burn session shares" })).toBeEnabled();
  await page.getByRole("button", { name: "Retry illustrative feed" }).click();
  await expect(page.getByRole("button", { name: "Review simulated mint" })).toBeEnabled();
});

test("gateway shows a non-payable placeholder QR and honest clipboard failure", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: () => Promise.reject(new Error("denied")),
      },
    });
  });
  await page.goto("/trade?view=bridge", { waitUntil: "networkidle" });
  await expect(page.getByRole("img", { name: "Not a payable QR. Placeholder ZIP 321 only." })).toBeVisible();
  await expect(page.getByText("Not payable. No receivable address is encoded.")).toBeVisible();
  await page.getByRole("button", { name: "Copy placeholder URI" }).click();
  await expect(page.getByText("Clipboard copy failed. The URI was not copied. Nothing was sent.")).toBeVisible();
  await expect(page.getByText("tex1", { exact: false })).toHaveCount(0);
});

test("clipboard unavailable stays honest without writeText", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });
  });
  await page.goto("/trade?view=bridge", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Copy placeholder URI" }).click();
  await expect(page.getByText("Clipboard is unavailable. The URI was not copied.")).toBeVisible();
});

test("G I F do not change time in force while review is open", async ({ page }) => {
  await page.goto("/trade", { waitUntil: "networkidle" });
  await expect(page.getByRole("button", { name: "GTC" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Review simulated buy" }).click();
  await expect(page.getByRole("button", { name: "Confirm simulated buy" })).toBeVisible();
  await page.keyboard.press("i");
  await expect(page.getByRole("button", { name: "Confirm simulated buy" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Confirm simulated buy" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "GTC" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "IOC" })).toHaveAttribute("aria-pressed", "false");
});

test("education dialog on liquidity ignores G I F and stays open", async ({ page }) => {
  await page.goto("/liquidity?education=1", { waitUntil: "networkidle" });
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("i");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue" })).toBeVisible();
});

test("status names architecture incident demonstrations", async ({ page }) => {
  await page.goto("/status", { waitUntil: "networkidle" });
  await expect(page.getByText("labeled incident demonstrations", { exact: false })).toBeVisible();
  await expect(page.getByText("not an incident feed", { exact: false })).toBeVisible();
  await expect(page.getByRole("contentinfo").getByRole("link", { name: "Launch gates" })).toBeVisible();
});

test("terminal skip links reach the ticket and blotter", async ({ page }) => {
  await page.goto("/trade", { waitUntil: "networkidle" });
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
  await page.keyboard.press("Tab");
  const skipTicket = page.getByRole("link", { name: "Skip to order ticket" });
  await expect(skipTicket).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#order-ticket")).toBeFocused();
});

test("placeholder QR stays inside 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/trade?view=bridge", { waitUntil: "networkidle" });
  const qr = page.getByRole("img", { name: "Not a payable QR. Placeholder ZIP 321 only." });
  await expect(qr).toBeVisible();
  const box = await qr.boundingBox();
  expect(box?.width ?? 0).toBeLessThanOrEqual(320);
  const overflow = await page.evaluate(() => ({
    body: document.body.scrollWidth - document.body.clientWidth,
    document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  expect(overflow).toEqual({ body: 0, document: 0 });
});

test("LP empty-share copy is visible before a mint", async ({ page }) => {
  await page.goto("/liquidity", { waitUntil: "networkidle" });
  await expect(page.getByText("No session LP shares. Burn stays available when shares exist. Mint is a local preview.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Burn session shares" })).toBeEnabled();
});

test("incident select is a 44px target at 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/trade?view=architecture", { waitUntil: "networkidle" });
  const select = page.getByLabel("Gateway incident demonstration");
  await select.focus();
  await expect(select).toBeFocused();
  const box = await select.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  await page.keyboard.press("ArrowDown");
  await expect(select).toBeFocused();
});

test("chart range arrows select the next radio", async ({ page }) => {
  await page.goto("/trade", { waitUntil: "networkidle" });
  const fourHour = page.getByRole("radio", { name: "4H" });
  await expect(fourHour).toHaveAttribute("aria-checked", "true");
  await fourHour.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("radio", { name: "1D" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("radio", { name: "1D" })).toBeFocused();
  await page.keyboard.press("Home");
  await expect(page.getByRole("radio", { name: "1H" })).toHaveAttribute("aria-checked", "true");
});

test("terminal skip links reach the price chart after the ticket", async ({ page }) => {
  await page.goto("/trade", { waitUntil: "networkidle" });
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  const skipChart = page.getByRole("link", { name: "Skip to price chart" });
  await expect(skipChart).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#price-chart")).toBeFocused();
});

test("invalid size shows a field error and keeps review closed", async ({ page }) => {
  await page.goto("/trade", { waitUntil: "networkidle" });
  await page.getByRole("textbox", { name: "Order size in pZEC" }).fill("abc");
  await expect(page.getByText("Value must use plain decimal notation").first()).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Order size in pZEC" })).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByRole("button", { name: "Review simulated buy" })).toBeVisible();
  await page.getByRole("button", { name: "Review simulated buy" }).click();
  await expect(page.getByRole("button", { name: "Confirm simulated buy" })).toHaveCount(0);
});

test("USDT review repeats the later listing gate", async ({ page }) => {
  await page.goto("/trade", { waitUntil: "networkidle" });
  await page.getByRole("radio", { name: "ZEC / USDT" }).click();
  await page.getByRole("textbox", { name: "Order size in pZEC" }).fill("1");
  await page.getByRole("button", { name: "Review simulated buy" }).click();
  await expect(page.getByRole("button", { name: "Confirm simulated buy" })).toBeVisible();
  await expect(page.getByText("Later listing gate. This is a preview. Listing stays blocked until issuer, legal, and security gates pass.")).toHaveCount(2);
});

test("LP pool arrows move to the later listing pair", async ({ page }) => {
  await page.goto("/liquidity", { waitUntil: "networkidle" });
  const usdc = page.getByRole("radio", { name: /pZEC\/USDC/ });
  await expect(usdc).toHaveAttribute("aria-checked", "true");
  await usdc.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("radio", { name: /pZEC\/USDT0/ })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByText(/Later listing gate\. This is a preview/)).toBeVisible();
});

test("document metadata names a no-value simulation", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.locator('meta[property="og:description"]')).toHaveAttribute(
    "content",
    "No-value simulation and non-custodial protocol plan for native transparent ZEC against USDC and USDT. Legacy pZEC surfaces are simulation only. Not an exchange or an offer of financial services.",
  );
  await expect(page.locator('meta[name="twitter:description"]')).toHaveAttribute(
    "content",
    "No-value simulation and non-custodial protocol plan for native transparent ZEC against USDC and USDT. Legacy pZEC surfaces are simulation only. Not an exchange or an offer of financial services.",
  );
});

test("terminal view arrows move focus and Enter selects", async ({ page }) => {
  await page.goto("/trade", { waitUntil: "networkidle" });
  const trade = page.getByRole("tab", { name: "Trade" });
  const liquidity = page.getByRole("tab", { name: "Liquidity" });
  await trade.focus();
  await expect(trade).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowRight");
  await expect(liquidity).toBeFocused();
  await expect(trade).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("End");
  await expect(page.getByRole("tab", { name: "Architecture" })).toBeFocused();
  await expect(trade).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Home");
  await expect(trade).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await expect(liquidity).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "Provide liquidity" })).toBeVisible();
});

test("invalid LP amount shows a field error and keeps review closed", async ({ page }) => {
  await page.goto("/liquidity", { waitUntil: "networkidle" });
  const amount = page.getByRole("textbox", { name: "pZEC liquidity amount" });
  await amount.fill("abc");
  await expect(page.getByText("Enter a positive plain decimal with no more than 8 places.").first()).toBeVisible();
  await expect(amount).toHaveAttribute("aria-invalid", "true");
  await expect(amount).toHaveAttribute("aria-errormessage", /.+/);
  await page.getByRole("button", { name: "Review simulated mint" }).click();
  await expect(page.getByRole("button", { name: "Confirm simulated mint" })).toHaveCount(0);
});

test("24h volume and LP TVL values are labeled as fixtures", async ({ page }) => {
  await page.goto("/trade", { waitUntil: "networkidle" });
  await expect(page.getByText("Fixture $1.84M", { exact: true })).toBeVisible();
  await page.goto("/liquidity", { waitUntil: "networkidle" });
  await expect(page.getByText("Fixture $842,410", { exact: true })).toBeVisible();
  await expect(page.getByText("Fixture $311,820", { exact: true })).toBeVisible();
});

test("ticket keyboard is a named 44px region", async ({ page }) => {
  await page.goto("/trade", { waitUntil: "networkidle" });
  const region = page.getByRole("region", { name: "Ticket keyboard" });
  await expect(region).toBeVisible();
  await expect(region).toContainText("G/I/F time in force");
  const box = await region.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
});

test("withdrawal tour demonstrates unresolved without inventing a payout", async ({ page }) => {
  await page.goto("/trade?view=bridge", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Withdrawal states" }).click();
  await page.getByRole("textbox", { name: "Transparent destination to inspect" }).fill("t1Zo4ZzPXJiJ8M8pYMgL4tWbdkH7c8r7abc");
  const next = page.getByRole("button", { name: "Next state" });
  for (let index = 0; index < 9; index += 1) {
    await next.click();
  }
  await expect(page.getByText("Unresolved", { exact: true })).toBeVisible();
  await expect(page.getByText("This demonstration does not invent a payout. No native ZEC was sent.")).toBeVisible();
  await expect(page.getByText("Stub claim: unresolved. Nothing is sent.")).toBeVisible();
});

test("ticket side type and time in force arrows move focus and Enter selects", async ({ page }) => {
  await page.goto("/trade", { waitUntil: "networkidle" });
  const buy = page.getByRole("button", { name: "Buy", exact: true });
  const sell = page.getByRole("button", { name: "Sell", exact: true });
  await buy.focus();
  await expect(buy).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("ArrowRight");
  await expect(sell).toBeFocused();
  await expect(buy).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Enter");
  await expect(sell).toHaveAttribute("aria-pressed", "true");

  const limit = page.getByRole("button", { name: "Limit" });
  await limit.focus();
  await page.keyboard.press("End");
  await expect(page.getByRole("button", { name: "Market" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Market" })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Home");
  await page.keyboard.press("Enter");
  await expect(limit).toHaveAttribute("aria-pressed", "true");

  const gtc = page.getByRole("button", { name: "GTC" });
  await gtc.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("button", { name: "IOC" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "IOC" })).toHaveAttribute("aria-pressed", "true");
});

test("size percent shortcuts are 44px on desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/trade", { waitUntil: "networkidle" });
  const percent = page.getByRole("button", { name: "25%" });
  await expect(percent).toBeVisible();
  const box = await percent.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
});

test("gateway journey arrows move focus and Enter selects withdrawal", async ({ page }) => {
  await page.goto("/trade?view=bridge", { waitUntil: "networkidle" });
  const deposit = page.getByRole("button", { name: "Deposit preview" });
  const withdrawal = page.getByRole("button", { name: "Withdrawal states" });
  await deposit.focus();
  await expect(deposit).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("ArrowRight");
  await expect(withdrawal).toBeFocused();
  await expect(deposit).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Enter");
  await expect(withdrawal).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Preview withdrawal states, not Withdraw ZEC.")).toBeVisible();
});

test("landing terminal preview names depth figures as fixtures", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.getByText("Fixture 52.84 USDC", { exact: true })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Fixture price USDC" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Fixture size pZEC" })).toBeVisible();
  await expect(page.getByText("Not a live book.")).toBeVisible();
});

test("status skip link reaches the ledger", async ({ page }) => {
  await page.goto("/status", { waitUntil: "networkidle" });
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
  await page.keyboard.press("Tab");
  const skipLedger = page.getByRole("link", { name: "Skip to status ledger" });
  await expect(skipLedger).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#status-ledger")).toBeFocused();
});

test("market arrows move focus and Enter selects USDT", async ({ page }) => {
  await page.goto("/trade", { waitUntil: "networkidle" });
  const usdc = page.getByRole("radio", { name: "ZEC / USDC" });
  const usdt = page.getByRole("radio", { name: "ZEC / USDT" });
  await usdc.focus();
  await expect(usdc).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("ArrowRight");
  await expect(usdt).toBeFocused();
  await expect(usdc).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("Enter");
  await expect(usdt).toHaveAttribute("aria-checked", "true");
  await expect(page.getByText("legacy simulation: pZEC-USDT0")).toBeVisible();
});

test("feed-state arrows move focus and Enter selects loading", async ({ page }) => {
  await page.goto("/trade", { waitUntil: "networkidle" });
  const illustrative = page.getByRole("radio", { name: "Illustrative" });
  const loading = page.getByRole("radio", { name: "Loading" });
  await illustrative.focus();
  await expect(illustrative).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("ArrowRight");
  await expect(loading).toBeFocused();
  await expect(illustrative).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("End");
  await expect(page.getByRole("radio", { name: "Unavailable" })).toBeFocused();
  await page.keyboard.press("Home");
  await expect(illustrative).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await expect(loading).toHaveAttribute("aria-checked", "true");
  await expect(page.getByText("Loading market data", { exact: true }).first()).toBeVisible();
});

test("review Back and ticket primary stay 44px on desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/trade", { waitUntil: "networkidle" });
  const review = page.getByRole("button", { name: "Review simulated buy" });
  const reviewBox = await review.boundingBox();
  expect(reviewBox?.height ?? 0).toBeGreaterThanOrEqual(44);
  await review.click();
  const back = page.getByRole("button", { name: "Back" });
  await expect(back).toBeVisible();
  const backBox = await back.boundingBox();
  expect(backBox?.height ?? 0).toBeGreaterThanOrEqual(44);
  const confirm = page.getByRole("button", { name: "Confirm simulated buy" });
  const confirmBox = await confirm.boundingBox();
  expect(confirmBox?.height ?? 0).toBeGreaterThanOrEqual(44);
});

test("LP mint swap and burn tour buttons are 44px on desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/liquidity", { waitUntil: "networkidle" });
  for (const name of ["Review simulated mint", "Burn session shares", "Review simulated swap"]) {
    const button = page.getByRole("button", { name });
    await expect(button).toBeVisible();
    const box = await button.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
});

test("legal and security skip links reach the articles", async ({ page }) => {
  await page.goto("/legal", { waitUntil: "networkidle" });
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
  await page.keyboard.press("Tab");
  const skipLegal = page.getByRole("link", { name: "Skip to legal article" });
  await expect(skipLegal).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#legal-article")).toBeFocused();

  await page.goto("/security", { waitUntil: "networkidle" });
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  const skipSecurity = page.getByRole("link", { name: "Skip to security article" });
  await expect(skipSecurity).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#security-article")).toBeFocused();
});

test("incident demonstration keeps selected copy in a named region", async ({ page }) => {
  await page.goto("/trade?view=architecture", { waitUntil: "networkidle" });
  const region = page.getByRole("region", { name: "Selected incident demonstration" });
  await expect(region).toBeVisible();
  await expect(region).toContainText("Phlebas is not available in this location.");
  await page.getByLabel("Gateway incident demonstration").selectOption("planned-maintenance");
  await expect(region).toContainText("Gateway maintenance is scheduled.");
  await expect(page.getByText("They do not imply a live account, incident, or outage.")).toBeVisible();
});

test("market feed connect chart range and ticket side stay 44px on desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/trade", { waitUntil: "networkidle" });
  const targets = [
    page.getByRole("radio", { name: "ZEC / USDC" }),
    page.getByRole("radio", { name: "Illustrative" }),
    page.getByRole("button", { name: "Connect Arbitrum Sepolia wallet" }),
    page.getByRole("radio", { name: "4H" }),
    page.getByRole("button", { name: "Buy", exact: true }),
  ];
  for (const target of targets) {
    await expect(target).toBeVisible();
    const box = await target.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
});

test("404 skip link reaches the missing-route copy", async ({ page }) => {
  await page.goto("/this-route-is-not-part-of-the-simulation", { waitUntil: "networkidle" });
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
  await page.keyboard.press("Tab");
  const skipMissing = page.getByRole("link", { name: "Skip to missing-route copy" });
  await expect(skipMissing).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#missing-route")).toBeFocused();
});

test("architecture skip link reaches the incident demonstration", async ({ page }) => {
  await page.goto("/trade?view=architecture", { waitUntil: "networkidle" });
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to architecture layers" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to honesty bar" })).toBeFocused();
  await page.keyboard.press("Tab");
  const skipIncident = page.getByRole("link", { name: "Skip to incident demonstration" });
  await expect(skipIncident).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#incident-demonstration")).toBeFocused();
});

test("order-type view and blotter tabs stay 44px on desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/trade", { waitUntil: "networkidle" });
  const targets = [
    page.getByRole("button", { name: "Limit" }),
    page.getByRole("tab", { name: "Trade" }),
    page.getByRole("tab", { name: "Open orders" }),
  ];
  for (const target of targets) {
    await expect(target).toBeVisible();
    const box = await target.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
});

test("liquidity skip link reaches pool tabs", async ({ page }) => {
  await page.goto("/liquidity", { waitUntil: "networkidle" });
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
  await page.keyboard.press("Tab");
  const skipPools = page.getByRole("link", { name: "Skip to pool tabs" });
  await expect(skipPools).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#liquidity-pools")).toBeFocused();
});

test("bridge skip link reaches the destination inspector", async ({ page }) => {
  await page.goto("/trade?view=bridge", { waitUntil: "networkidle" });
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
  await page.keyboard.press("Tab");
  const skipInspector = page.getByRole("link", { name: "Skip to destination inspector" });
  await expect(skipInspector).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#destination-inspector")).toBeFocused();
  await expect(page.getByRole("textbox", { name: "Transparent destination to inspect" })).toBeVisible();
});

test("error skip link reaches the retry copy", async ({ page }) => {
  await page.goto("/trade?error=1", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "The simulation failed to render" })).toBeVisible();
  await expect(page.getByText("Nothing was submitted to a chain, matcher, or custody system.")).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
  await page.keyboard.press("Tab");
  const skipRetry = page.getByRole("link", { name: "Skip to retry copy" });
  await expect(skipRetry).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#retry-copy")).toBeFocused();
});

test("GTC and order book price rows stay 44px on desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/trade", { waitUntil: "networkidle" });
  const gtc = page.getByRole("button", { name: "GTC" });
  const ask = page.getByRole("button", { name: "Ask 52.91" });
  await expect(gtc).toBeVisible();
  await expect(ask).toBeVisible();
  const gtcBox = await gtc.boundingBox();
  const askBox = await ask.boundingBox();
  expect(gtcBox?.height ?? 0).toBeGreaterThanOrEqual(44);
  expect(askBox?.height ?? 0).toBeGreaterThanOrEqual(44);
});

test("Reset session Cancel Retry illustrative and tape rows stay 44px on desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/trade", { waitUntil: "networkidle" });
  const reset = page.getByRole("button", { name: "Reset session" });
  const tape = page.getByRole("table", { name: /Recent ZEC\/USDC trades/ }).locator("tbody tr").first();
  await expect(reset).toBeVisible();
  await expect(tape).toBeVisible();
  expect((await reset.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  expect((await tape.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);

  await page.getByRole("textbox", { name: "Price in USDC" }).fill("50.00");
  await page.getByRole("textbox", { name: "Order size in pZEC" }).fill("1");
  await page.getByRole("button", { name: "Review simulated buy" }).click();
  await page.getByRole("button", { name: "Confirm simulated buy" }).click();
  const cancel = page.getByRole("button", { name: "Cancel", exact: true });
  await expect(cancel).toBeVisible();
  expect((await cancel.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);

  await page.getByRole("radio", { name: "Stale" }).click();
  const retry = page.getByRole("button", { name: "Retry illustrative feed" });
  await expect(retry).toBeVisible();
  expect((await retry.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
});

test("terminal skip link reaches recent trades", async ({ page }) => {
  await page.goto("/trade", { waitUntil: "networkidle" });
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  const skipTape = page.getByRole("link", { name: "Skip to recent trades" });
  await expect(skipTape).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#recent-trades")).toBeFocused();
});

test("mid-price fills and inventory rows stay 44px on desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/trade", { waitUntil: "networkidle" });
  const mid = page.getByRole("cell", { name: /session last/ });
  await expect(mid).toBeVisible();
  expect((await mid.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);

  await page.getByRole("button", { name: "Ask 52.91" }).click();
  await page.getByRole("textbox", { name: "Order size in pZEC" }).fill("1");
  await page.getByRole("button", { name: "Review simulated buy" }).click();
  await page.getByRole("button", { name: "Confirm simulated buy" }).click();
  await page.getByRole("tab", { name: "Fills" }).click();
  const fillRow = page.getByRole("table", { name: /Session fills for ZEC\/USDC/ }).locator("tbody tr").first();
  await expect(fillRow).toBeVisible();
  expect((await fillRow.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);

  await page.getByRole("tab", { name: "Inventory" }).click();
  const inventoryRow = page.getByRole("tabpanel").locator("dl > div").first();
  await expect(inventoryRow).toBeVisible();
  expect((await inventoryRow.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
});

test("loading skip link reaches the withheld-price notice", async ({ page }) => {
  await page.goto("/trade?loading=1", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Loading the simulation" })).toBeVisible();
  await expect(page.getByText("No market data is live.")).toBeVisible();
  await expect(page.getByText("No prices, balances, or depth are shown while this route loads.")).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
  await page.keyboard.press("Tab");
  const skipNotice = page.getByRole("link", { name: "Skip to withheld-price notice" });
  await expect(skipNotice).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#withheld-price")).toBeFocused();
});

test("event-log LP stats and chart empty stay 44px on desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/trade", { waitUntil: "networkidle" });
  await page.getByRole("textbox", { name: "Price in USDC" }).fill("50.00");
  await page.getByRole("textbox", { name: "Order size in pZEC" }).fill("1");
  await page.getByRole("button", { name: "Review simulated buy" }).click();
  await page.getByRole("button", { name: "Confirm simulated buy" }).click();
  await page.getByRole("tab", { name: "Event log" }).click();
  const logRow = page.getByRole("table", { name: /Append-only session event log/ }).locator("tbody tr").first();
  await expect(logRow).toBeVisible();
  expect((await logRow.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);

  await page.getByRole("radio", { name: "Empty" }).click();
  const chartEmpty = page.getByRole("status", { name: "Chart empty state" });
  await expect(chartEmpty).toBeVisible();
  expect((await chartEmpty.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);

  await page.goto("/liquidity", { waitUntil: "networkidle" });
  const stats = page.getByRole("group", { name: "Pool stats and impermanent loss versus hold" });
  await expect(stats).toBeVisible();
  const statsRow = stats.locator(":scope > div").first();
  expect((await statsRow.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
});

test("liquidity skip link reaches pool stats", async ({ page }) => {
  await page.goto("/liquidity", { waitUntil: "networkidle" });
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  const skipStats = page.getByRole("link", { name: "Skip to pool stats" });
  await expect(skipStats).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#pool-stats")).toBeFocused();
});

test("ticket notice wallet rejection and simulation banner stay 44px on desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/trade", { waitUntil: "networkidle" });
  const banner = page.getByRole("status", { name: "Simulation disclosure" });
  await expect(banner).toBeVisible();
  expect((await banner.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);

  await page.getByRole("textbox", { name: "Order size in pZEC" }).fill("abc");
  const notice = page.getByRole("alert").filter({ hasText: "Value must use plain decimal notation" });
  await expect(notice).toBeVisible();
  expect((await notice.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);

  await page.getByRole("button", { name: "Connect Arbitrum Sepolia wallet" }).click();
  const rejection = page.getByRole("status", { name: "Wallet connection rejection" });
  await expect(rejection).toBeVisible();
  expect((await rejection.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);

  await page.goto("/", { waitUntil: "networkidle" });
  const landingBanner = page.getByRole("status", { name: "Simulation disclosure" });
  await expect(landingBanner).toBeVisible();
  expect((await landingBanner.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
});

test("ticket blocked gate country-block and education copy stay 44px on desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/trade", { waitUntil: "networkidle" });
  await page.getByRole("radio", { name: "Stale" }).click();
  const blocked = page.getByRole("status", { name: "Ticket blocked" });
  await expect(blocked).toBeVisible();
  expect((await blocked.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);

  await page.getByRole("radio", { name: "ZEC / USDT" }).click();
  const gate = page.getByText("Later listing gate. This is a preview. Listing stays blocked until issuer, legal, and security gates pass.").first();
  await expect(gate).toBeVisible();
  expect((await gate.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);

  await page.goto("/trade?access=blocked", { waitUntil: "networkidle" });
  const country = page.getByText("This preview is limited to approved locations. Trading, liquidity, deposit, and withdrawal controls are unavailable.");
  await expect(country).toBeVisible();
  expect((await country.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);

  await page.goto("/trade?education=1", { waitUntil: "networkidle" });
  const education = page.getByRole("region", { name: "Education copy" });
  await expect(education).toBeVisible();
  expect((await education.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
});

test("country-block skip link reaches the notice", async ({ page }) => {
  await page.goto("/trade?access=blocked", { waitUntil: "networkidle" });
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
  await page.keyboard.press("Tab");
  const skipBlock = page.getByRole("link", { name: "Skip to country-block notice" });
  await expect(skipBlock).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#country-block")).toBeFocused();
});

test("honesty bar incident copy and review custody stay 44px on desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/trade?view=architecture", { waitUntil: "networkidle" });
  const honesty = page.getByRole("region", { name: "Architecture honesty bar" });
  await expect(honesty).toBeVisible();
  expect((await honesty.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  const incident = page.getByRole("region", { name: "Selected incident demonstration" });
  await expect(incident).toBeVisible();
  expect((await incident.locator("p").boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);

  await page.goto("/trade", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Review simulated buy" }).click();
  const custody = page.getByLabel("Review custody notice");
  await expect(custody).toBeVisible();
  expect((await custody.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
});

test("architecture skip link reaches the honesty bar", async ({ page }) => {
  await page.goto("/trade?view=architecture", { waitUntil: "networkidle" });
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to architecture layers" })).toBeFocused();
  await page.keyboard.press("Tab");
  const skipHonesty = page.getByRole("link", { name: "Skip to honesty bar" });
  await expect(skipHonesty).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#honesty-bar")).toBeFocused();
});

test("privacy callouts evidence rows and layer cards stay 44px on desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/trade?view=bridge", { waitUntil: "networkidle" });
  const callout = page.locator("#privacy-callouts").getByText("Public linkability", { exact: true }).locator("xpath=ancestor::div[1]");
  await expect(callout).toBeVisible();
  expect((await callout.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);

  await page.goto("/", { waitUntil: "networkidle" });
  const evidence = page.getByRole("list", { name: "What exists today" }).getByRole("listitem").first();
  await expect(evidence).toBeVisible();
  expect((await evidence.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);

  await page.goto("/trade?view=architecture", { waitUntil: "networkidle" });
  const card = page.getByRole("region", { name: "Architecture layers" }).locator("article").first();
  await expect(card).toBeVisible();
  expect((await card.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
});

test("bridge skip link reaches privacy callouts", async ({ page }) => {
  await page.goto("/trade?view=bridge", { waitUntil: "networkidle" });
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to destination inspector" })).toBeFocused();
  await page.keyboard.press("Tab");
  const skipPrivacy = page.getByRole("link", { name: "Skip to privacy callouts" });
  await expect(skipPrivacy).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#privacy-callouts")).toBeFocused();
});

test("architecture skip link reaches the layer cards", async ({ page }) => {
  await page.goto("/trade?view=architecture", { waitUntil: "networkidle" });
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
  await page.keyboard.press("Tab");
  const skipLayers = page.getByRole("link", { name: "Skip to architecture layers" });
  await expect(skipLayers).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#architecture-layers")).toBeFocused();
});

test("status legal and security ledger rows stay 44px on desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/status", { waitUntil: "networkidle" });
  const statusRow = page.locator("#status-ledger > div").first();
  await expect(statusRow).toBeVisible();
  expect((await statusRow.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);

  await page.goto("/legal", { waitUntil: "networkidle" });
  const legalRow = page.locator("#legal-article dl > div").first();
  await expect(legalRow).toBeVisible();
  expect((await legalRow.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);

  await page.goto("/security", { waitUntil: "networkidle" });
  const securityRow = page.locator("#security-article dl > div").first();
  await expect(securityRow).toBeVisible();
  expect((await securityRow.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);

  await page.goto("/", { waitUntil: "networkidle" });
  const market = page.getByRole("list", { name: "Focused markets" }).getByRole("listitem").first();
  await expect(market).toBeVisible();
  expect((await market.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  const gate = page.getByRole("list", { name: "Mainnet launch gates" }).getByRole("listitem").first();
  await expect(gate).toBeVisible();
  expect((await gate.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
});

test("landing mobile menu links stay 44px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Menu" }).click();
  const dialog = page.getByRole("dialog", { name: "Navigate Phlebas" });
  await expect(dialog).toBeVisible();
  const markets = dialog.getByRole("link", { name: "Markets" });
  await expect(markets).toBeVisible();
  expect((await markets.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  const enter = dialog.getByRole("link", { name: "Enter simulation" });
  await expect(enter).toBeVisible();
  expect((await enter.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
});

test("landing nav footer pZEC flow and current-system ledger stay 44px on desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/", { waitUntil: "networkidle" });
  const nav = page.getByRole("navigation", { name: "Landing navigation" }).getByRole("link", { name: "Markets" });
  await expect(nav).toBeVisible();
  expect((await nav.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  const footer = page.getByRole("navigation", { name: "Footer" }).getByRole("link", { name: "Status" });
  await expect(footer).toBeVisible();
  expect((await footer.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  const flow = page.getByRole("list", { name: "Proposed ZEC to market flow" }).getByRole("listitem").first();
  await expect(flow).toBeVisible();
  expect((await flow.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  const ledger = page.getByRole("list", { name: "Current system" }).getByRole("listitem").first();
  await expect(ledger).toBeVisible();
  expect((await ledger.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
});

test("simulation-frame and terminal footer links stay 44px on desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/status", { waitUntil: "networkidle" });
  const statusFooter = page.getByRole("navigation", { name: "Footer" }).getByRole("link", { name: "Status" });
  await expect(statusFooter).toBeVisible();
  expect((await statusFooter.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);

  await page.goto("/trade", { waitUntil: "networkidle" });
  const tradeFooter = page.getByRole("navigation", { name: "Footer" }).getByRole("link", { name: "Status" });
  await expect(tradeFooter).toBeVisible();
  expect((await tradeFooter.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
});

test("status legal and security ledgers are named lists", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/status", { waitUntil: "networkidle" });
  const status = page.getByRole("list", { name: "Simulation status ledger" }).getByRole("listitem").first();
  await expect(status).toBeVisible();
  expect((await status.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);

  await page.goto("/legal", { waitUntil: "networkidle" });
  const legal = page.getByRole("list", { name: "Legal and compliance ledger" }).getByRole("listitem").first();
  await expect(legal).toBeVisible();
  expect((await legal.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);

  await page.goto("/security", { waitUntil: "networkidle" });
  const security = page.getByRole("list", { name: "Security ledger" }).getByRole("listitem").first();
  await expect(security).toBeVisible();
  expect((await security.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
});

test("landing header CTA journey tabs pZEC source and simulation-frame nav stay 44px on desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/", { waitUntil: "networkidle" });
  const headerCta = page.locator("header").getByRole("link", { name: "Enter simulation" });
  await expect(headerCta).toBeVisible();
  expect((await headerCta.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  const tab = page.getByRole("tab", { name: "Trader" });
  await expect(tab).toBeVisible();
  expect((await tab.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  const source = page.getByRole("link", { name: "Read the ZIP 320 TEX address specification" });
  await expect(source).toBeVisible();
  expect((await source.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);

  await page.goto("/status", { waitUntil: "networkidle" });
  const nav = page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "Trade" });
  await expect(nav).toBeVisible();
  expect((await nav.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
});

test("landing hero CTAs Open status details launch gates and brand home stay 44px on desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/", { waitUntil: "networkidle" });
  const heroCta = page.locator("main").getByRole("link", { name: "Enter simulation" });
  await expect(heroCta).toBeVisible();
  expect((await heroCta.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  const pzec = page.getByRole("link", { name: "Understand pZEC" });
  await expect(pzec).toBeVisible();
  expect((await pzec.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  const statusDetails = page.getByRole("link", { name: "Open status details" });
  await expect(statusDetails).toBeVisible();
  expect((await statusDetails.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  const gates = page.getByRole("link", { name: /Read the launch gates/ });
  await expect(gates).toBeVisible();
  expect((await gates.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);

  await page.goto("/status", { waitUntil: "networkidle" });
  const statusBrand = page.getByRole("link", { name: "Phlebas home" });
  await expect(statusBrand).toBeVisible();
  expect((await statusBrand.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);

  await page.goto("/trade", { waitUntil: "networkidle" });
  const tradeBrand = page.getByRole("link", { name: "Phlebas home" });
  await expect(tradeBrand).toBeVisible();
  expect((await tradeBrand.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
});

test("landing market preview journey actions and header brand stay 44px on desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/", { waitUntil: "networkidle" });
  const market = page.getByRole("list", { name: "Focused markets" }).getByRole("link", { name: /Preview market/ }).first();
  await expect(market).toBeVisible();
  expect((await market.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  const journey = page.getByRole("tabpanel").getByRole("link", { name: /Preview trading/ });
  await expect(journey).toBeVisible();
  expect((await journey.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  const brand = page.locator("header").getByRole("link", { name: "Phlebas home" });
  await expect(brand).toBeVisible();
  expect((await brand.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
});

test("status legal and security in-page links stay 44px on desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/status", { waitUntil: "networkidle" });
  const statusLink = page.getByRole("main").getByRole("link", { name: "Legal and compliance" });
  await expect(statusLink).toBeVisible();
  expect((await statusLink.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);

  await page.goto("/legal", { waitUntil: "networkidle" });
  const legalLink = page.getByRole("main").getByRole("link", { name: "Architecture" });
  await expect(legalLink).toBeVisible();
  expect((await legalLink.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);

  await page.goto("/security", { waitUntil: "networkidle" });
  const securityLink = page.getByRole("main").getByRole("link", { name: "Status" });
  await expect(securityLink).toBeVisible();
  expect((await securityLink.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
});

test("landing skip links Menu and Close stay 44px", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/", { waitUntil: "networkidle" });
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to main content" });
  await expect(skip).toBeFocused();
  expect((await skip.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);

  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/", { waitUntil: "networkidle" });
  const menu = page.getByRole("button", { name: "Menu" });
  await expect(menu).toBeVisible();
  expect((await menu.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  await menu.click();
  const close = page.getByRole("button", { name: "Close menu" });
  await expect(close).toBeVisible();
  expect((await close.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
});

test("terminal skip education Continue and error Retry stay 44px on desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/trade", { waitUntil: "networkidle" });
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to main content" });
  await expect(skip).toBeFocused();
  expect((await skip.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);

  await page.goto("/trade?education=1", { waitUntil: "networkidle" });
  const cont = page.getByRole("button", { name: "Continue" });
  await expect(cont).toBeVisible();
  expect((await cont.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);

  await page.goto("/trade?error=1", { waitUntil: "networkidle" });
  const retry = page.getByRole("button", { name: "Retry" });
  await expect(retry).toBeVisible();
  expect((await retry.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
});

test("404 skip loading skip education Back and Enter simulation stay 44px on desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/this-route-is-not-part-of-the-simulation", { waitUntil: "networkidle" });
  await page.keyboard.press("Tab");
  const skipMissing = page.getByRole("link", { name: "Skip to missing-route copy" });
  await page.keyboard.press("Tab");
  await expect(skipMissing).toBeFocused();
  expect((await skipMissing.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  await page.keyboard.press("Enter");
  const missing = page.getByLabel("Missing-route copy");
  await expect(missing).toBeVisible();
  expect((await missing.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);

  await page.goto("/trade?loading=1", { waitUntil: "networkidle" });
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  const skipLoading = page.getByRole("link", { name: "Skip to withheld-price notice" });
  await expect(skipLoading).toBeFocused();
  expect((await skipLoading.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  await page.keyboard.press("Enter");
  const notice = page.getByLabel("Withheld-price notice");
  await expect(notice).toBeVisible();
  expect((await notice.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);

  await page.goto("/trade?education=1", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Continue" }).click();
  const back = page.getByRole("button", { name: "Back" });
  await expect(back).toBeEnabled();
  expect((await back.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  await page.getByRole("button", { name: "Continue" }).click();
  const enter = page.getByRole("dialog").getByRole("button", { name: "Enter simulation" });
  await expect(enter).toBeVisible();
  expect((await enter.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
});

test("tour buttons retry copy and country-block skip stay 44px on desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/trade?view=bridge", { waitUntil: "networkidle" });
  const next = page.getByRole("button", { name: "Next state" });
  await expect(next).toBeVisible();
  expect((await next.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  await page.getByRole("button", { name: "Withdrawal states" }).click();
  await expect(page.getByText("Preview withdrawal states, not Withdraw ZEC.")).toBeVisible();
  const previous = page.getByRole("button", { name: "Previous state" });
  await expect(previous).toBeVisible();
  expect((await previous.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);

  await page.goto("/trade?error=1", { waitUntil: "networkidle" });
  const retryCopy = page.getByLabel("Retry copy");
  await expect(retryCopy).toBeVisible();
  expect((await retryCopy.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);

  await page.goto("/trade?access=blocked", { waitUntil: "networkidle" });
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  const skipBlock = page.getByRole("link", { name: "Skip to country-block notice" });
  await expect(skipBlock).toBeFocused();
  expect((await skipBlock.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
});

test("architecture liquidity and bridge skip links stay 44px on desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/trade?view=architecture", { waitUntil: "networkidle" });
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  const skipLayers = page.getByRole("link", { name: "Skip to architecture layers" });
  await expect(skipLayers).toBeFocused();
  expect((await skipLayers.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  await page.keyboard.press("Tab");
  const skipHonesty = page.getByRole("link", { name: "Skip to honesty bar" });
  await expect(skipHonesty).toBeFocused();
  expect((await skipHonesty.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);

  await page.goto("/liquidity", { waitUntil: "networkidle" });
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  const skipPools = page.getByRole("link", { name: "Skip to pool tabs" });
  await expect(skipPools).toBeFocused();
  expect((await skipPools.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  await page.keyboard.press("Tab");
  const skipStats = page.getByRole("link", { name: "Skip to pool stats" });
  await expect(skipStats).toBeFocused();
  expect((await skipStats.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);

  await page.goto("/trade?view=bridge", { waitUntil: "networkidle" });
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  const skipInspector = page.getByRole("link", { name: "Skip to destination inspector" });
  await expect(skipInspector).toBeFocused();
  expect((await skipInspector.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  await page.keyboard.press("Tab");
  const skipPrivacy = page.getByRole("link", { name: "Skip to privacy callouts" });
  await expect(skipPrivacy).toBeFocused();
  expect((await skipPrivacy.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
});
