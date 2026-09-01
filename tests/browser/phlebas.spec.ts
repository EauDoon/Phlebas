import { type Locator, type Page } from "@playwright/test";

import { ARBITRUM_SEPOLIA_HEX } from "../../src/lib/evm-wallet.ts";
import { DEPOSIT_TOUR } from "../../src/lib/deposit-tour.ts";
import { payoutClaimForTourStep, payoutClaimStubCopy } from "../../src/lib/payout.ts";
import { WITHDRAWAL_TOUR } from "../../src/lib/withdrawal-tour.ts";
import { expect, test } from "./fixtures";
import { LANDING_MAINNET_GATES } from "../../src/lib/landing-gates.ts";

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
    marker: "settles ZEC-USDC",
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
          await expect(page.getByRole("heading", { name: "Current system" })).toBeVisible();
          await expect(page.getByText("Wallet connection")).toBeVisible();
          await expect(page.getByText("Unavailable", { exact: true })).toBeVisible();
          await expect(page.getByText(
            "The simulation now labels settlement as ZEC-USDC and ZEC-USDT. Native labels are simulation names, not live settlement. It does not list USDT0. Shielded ZEC stays out of scope. No live funds move in this preview.",
            { exact: true },
          )).toBeVisible();
          await expect(page.getByText("USDT0 is abandoned. It is not a listed settlement asset.", { exact: true })).toBeVisible();
          await expect(page.getByText("Later listing gate")).toHaveCount(0);
          await expect(page.getByText("Deny by default", { exact: true })).toBeVisible();
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
          await expect(page.locator("#launch-gates").getByText("Not cleared", { exact: true })).toHaveCount(
            LANDING_MAINNET_GATES.length + 3,
          );
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
      await expect(page.getByText("settles ZEC-USDC", { exact: true })).toBeVisible();

      await page.goto("/", { waitUntil: "networkidle" });
      const understandPairs = page.getByRole("link", { name: "Understand native pairs" });
      await tabTo(page, understandPairs);
      await expectVisibleFocus(understandPairs);
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(/\/#pairs$/);
      await expect(page.getByText(
        "The simulation now labels settlement as ZEC-USDC and ZEC-USDT. Native labels are simulation names, not live settlement. It does not list USDT0. Shielded ZEC stays out of scope. No live funds move in this preview.",
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
      const settlementNavigation = page.getByRole("tab", { name: "Settlement" });
      await expectVisibleFocus(settlementNavigation);
      await page.keyboard.press("ArrowRight");
      const liquidityNavigation = page.getByRole("tab", { name: "Liquidity" });
      await expectVisibleFocus(liquidityNavigation);
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(/\/liquidity\?market=ZEC%2FUSDC$/);
      await expect(page.getByRole("heading", { name: "Provide liquidity" })).toBeVisible();

      const currentPool = page.getByRole("radio", { name: /ZEC \/ USDC|ZEC\/USDC/ });
      const laterPool = page.getByRole("radio", { name: /ZEC \/ USDT|ZEC\/USDT/ });
      await tabTo(page, currentPool);
      await expectVisibleFocus(currentPool);
      await page.keyboard.press("ArrowRight");
      await expectVisibleFocus(laterPool);
      await page.keyboard.press("Enter");
      await expect(laterPool).toHaveAttribute("aria-checked", "true");
      await expect(page.getByText("Later listing gate")).toHaveCount(0);
      await expect(page).toHaveURL(/\/liquidity\?market=ZEC%2FUSDT$/);

      const amount = page.getByRole("textbox", { name: "ZEC liquidity amount" });
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
  const size = page.getByRole("textbox", { name: "Order size in ZEC" });
  await size.fill("0.000000001");
  await expect(page.getByText("Value must use no more than 8 decimal places").first()).toBeVisible();
  await expect(page.getByText("Price must use 0.01 quote ticks")).toHaveCount(0);
});
test("gateway preview is not a receivable deposit", async ({ page }) => {
  await page.goto("/trade?view=bridge", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "ZEC gateway" })).toBeVisible();
  await expect(page.getByText("ZEC to pZEC")).toHaveCount(0);
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
  await page.getByRole("textbox", { name: "Order size in ZEC" }).fill("1");
  await page.getByRole("button", { name: "Review simulated buy" }).click();
  await expect(page.getByText("This preview labels native ZEC. It is not live settlement.")).toBeVisible();
  await page.getByRole("button", { name: "Confirm simulated buy" }).click();
  await expect(page.getByText(/Filled against the local ZEC\/USDC book/)).toBeVisible();
  await expect(page.getByText("Nothing was signed or submitted to a chain.")).toBeVisible();
  await expect(page.getByRole("tab", { name: "Fills" })).toBeVisible();
  await page.getByRole("tab", { name: "Fills" }).click();
  await expect(page.getByRole("table", { name: /Session fills for ZEC\/USDC/ })).toBeVisible();
});

test("price improvement cannot create a free ZEC atom", async ({ page }) => {
  await page.goto("/trade", { waitUntil: "networkidle" });
  await page.getByRole("textbox", { name: "Price in USDC" }).fill("100");
  await page.getByRole("textbox", { name: "Order size in ZEC" }).fill("0.00000001");
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
  await expect(boundary.getByRole("link", { name: "Architecture", exact: true })).toBeVisible();
  await expect(boundary.getByRole("link", { name: "Launch gates" })).toBeVisible();

  const missing = await page.goto("/this-route-is-not-part-of-the-simulation", { waitUntil: "load" });
  expect(missing?.status(), "404 status").toBe(404);
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await expect(page.getByText("Simulation only", { exact: true })).toBeVisible();
});

test("/api/status publishes incidents as architecture-demonstration", async ({ page }) => {
  const response = await page.request.get("/api/status");
  expect(response.ok(), "/api/status response").toBe(true);
  const body = await response.json() as { incidents?: string; liveFunds?: boolean; mode?: string };
  expect(body.incidents).toBe("architecture-demonstration");
  expect(body.liveFunds).toBe(false);
  expect(body.mode).toBe("simulation");
});

test("invalid demo query does not highlight incidents", async ({ page }) => {
  await page.goto("/trade?view=architecture&demo=live", { waitUntil: "networkidle" });
  await expect(page.getByRole("combobox", { name: "Gateway incident demonstration" })).toBeVisible();
  await expect(page.getByText("Status field architecture-demonstration.")).toHaveCount(0);
});

test("architecture keeps demo=incidents when the market changes", async ({ page }) => {
  await page.goto("/trade?view=architecture&demo=incidents", { waitUntil: "networkidle" });
  await expect(page.getByText("Status field architecture-demonstration.")).toBeVisible();
  const nav = page.getByRole("tablist", { name: "Primary navigation" });
  await nav.getByRole("tab", { name: "Trade" }).click();
  await page.getByRole("radio", { name: /ZEC \/ USDT|ZEC\/USDT/ }).click();
  await nav.getByRole("tab", { name: "Architecture" }).click();
  await expect(page).toHaveURL(/view=architecture/);
  await expect(page).toHaveURL(/demo=incidents/);
  await expect(page).toHaveURL(/USDT/);
  await expect(page.getByText("architecture-demonstration")).toBeVisible();
});

test("leaving Architecture for Trade drops demo=incidents and return restores it", async ({ page }) => {
  await page.goto("/trade?view=architecture&demo=incidents", { waitUntil: "networkidle" });
  await expect(page.getByText("Status field architecture-demonstration.")).toBeVisible();
  const nav = page.getByRole("tablist", { name: "Primary navigation" });
  await nav.getByRole("tab", { name: "Trade" }).click();
  await expect(page).toHaveURL(/view=trade/);
  await expect(page).not.toHaveURL(/demo=incidents/);
  await expect(page.getByRole("button", { name: "Review simulated buy" })).toBeVisible();
  await expect(page.getByText("Status field architecture-demonstration.")).toHaveCount(0);
  await nav.getByRole("tab", { name: "Architecture" }).click();
  await expect(page).toHaveURL(/view=architecture/);
  await expect(page).toHaveURL(/demo=incidents/);
  await expect(page.getByText("Status field architecture-demonstration.")).toBeVisible();
  await expect(page.getByText("Labeled demonstration, not a live outage.")).toBeVisible();
});

test("leaving Architecture for the ZEC gateway drops demo=incidents and return restores it", async ({ page }) => {
  await page.goto("/trade?view=architecture&demo=incidents", { waitUntil: "networkidle" });
  await expect(page.getByText("Status field architecture-demonstration.")).toBeVisible();
  const nav = page.getByRole("tablist", { name: "Primary navigation" });
  await nav.getByRole("tab", { name: "ZEC gateway" }).click();
  await expect(page).toHaveURL(/view=bridge/);
  await expect(page).not.toHaveURL(/demo=incidents/);
  await expect(page.getByRole("img", { name: "Placeholder QR. Not payable." })).toBeVisible();
  await nav.getByRole("tab", { name: "Architecture" }).click();
  await expect(page).toHaveURL(/view=architecture/);
  await expect(page).toHaveURL(/demo=incidents/);
  await expect(page.getByText("Status field architecture-demonstration.")).toBeVisible();
});

test("leaving Architecture for Liquidity drops demo=incidents and return restores it", async ({ page }) => {
  await page.goto("/trade?view=architecture&demo=incidents", { waitUntil: "networkidle" });
  await expect(page.getByText("Status field architecture-demonstration.")).toBeVisible();
  const nav = page.getByRole("tablist", { name: "Primary navigation" });
  await nav.getByRole("tab", { name: "Liquidity" }).click();
  await expect(page).toHaveURL(/\/liquidity/);
  await expect(page).not.toHaveURL(/demo=incidents/);
  await expect(page.getByRole("heading", { name: "Provide liquidity" })).toBeVisible();
  await nav.getByRole("tab", { name: "Architecture" }).click();
  await expect(page).toHaveURL(/view=architecture/);
  await expect(page).toHaveURL(/demo=incidents/);
  await expect(page.getByText("Status field architecture-demonstration.")).toBeVisible();
});

test("status Architecture link keeps the demonstration label", async ({ page }) => {
  await page.goto("/status", { waitUntil: "networkidle" });
  await page.getByRole("link", { name: "Architecture incident demonstrations", exact: true }).click();
  await expect(page).toHaveURL(/view=architecture/);
  await expect(page).toHaveURL(/demo=incidents/);
  await expect(page.getByText("architecture-demonstration")).toBeVisible();
  await expect(page.getByText("State demonstration").first()).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Gateway incident demonstration" })).toBeVisible();
  await expect(page.getByText("Labeled demonstration, not a live outage.")).toBeVisible();
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
  await expect(page.getByRole("img", { name: "Placeholder QR. Not payable." })).toBeVisible();
  await expect(page.getByText("Visual copy of the ZIP 321 request, not a mainnet address.")).toBeVisible();
  await page.getByRole("button", { name: "Issue testnet TEX" }).click();
  await expect(page.getByText("No receivable address is displayed.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy testnet URI" })).toHaveCount(0);
});

test("stale market data disables preview-to-sign and retries to illustrative", async ({ page }) => {
  await page.goto("/trade", { waitUntil: "networkidle" });
  await expect(page.getByLabel("Market statistics").getByText("Session last · ZEC-USDC")).toBeVisible();
  await page.getByRole("button", { name: "Review simulated buy" }).click();
  await expect(page.getByRole("button", { name: "Confirm simulated buy" })).toBeVisible();
  await page.getByRole("radio", { name: "Stale" }).click();
  await expect(page.getByText("Market data stale", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("The illustrative feed is marked delayed. Stale data cannot move from preview to confirm. Settled as ZEC-USDC.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm simulated buy" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Review simulated buy" })).toBeDisabled();
  await page.getByRole("button", { name: "Retry illustrative feed" }).click();
  await expect(page.getByRole("button", { name: "Review simulated buy" })).toBeEnabled();
  await expect(page.getByRole("img", { name: "Illustrative 4H price chart for ZEC/USDC, settled as ZEC-USDC" })).toBeVisible();
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
  await page.getByRole("textbox", { name: "Order size in ZEC" }).fill("1");
  await page.getByRole("button", { name: "Review simulated buy" }).click();
  await expect(page.getByText("CLOB cheaper for a full fill", { exact: true })).toBeVisible();
  await expect(page.getByText("Confirm submits only the local CLOB")).toBeVisible();
  await expect(page.getByText("Leaves the session")).toBeVisible();
  await expect(page.getByText("publicly linkable", { exact: false })).toBeVisible();
  await expect(page.getByText("Proposed taker 15 bps", { exact: false })).toBeVisible();
  await expect(
    page.getByText("ZEC custody and redemption, if ever offered, would depend on a gateway. This preview is not live settlement."),
  ).toBeVisible();
  await expect(page.getByText("Custody and redemption", { exact: true })).toBeVisible();
});

test("GTC remainder can be cancelled and epoch invalidation is visible", async ({ page }) => {
  await page.goto("/trade", { waitUntil: "networkidle" });
  await page.getByRole("textbox", { name: "Price in USDC" }).fill("50.00");
  await page.getByRole("textbox", { name: "Order size in ZEC" }).fill("1");
  await page.getByRole("button", { name: "Review simulated buy" }).click();
  await page.getByRole("button", { name: "Confirm simulated buy" }).click();
  await expect(page.getByRole("button", { name: "Cancel", exact: true })).toBeVisible();
  await expect(page.getByRole("table", { name: /Resting session orders on the local ZEC\/USDC book, settled as ZEC-USDC/ })).toBeVisible();
  await page.getByRole("button", { name: "Invalidate older session orders" }).click();
  await expect(page.getByText("No open session orders", { exact: false })).toBeVisible();
  await page.getByRole("tab", { name: "Inventory" }).click();
  const blotter = page.getByRole("region", { name: "Open orders, fills, inventory" });
  await expect(blotter.getByText("Account epoch")).toBeVisible();
});

test("USDT market names USDT settlement and empty feed shows no depth", async ({ page }) => {
  await page.goto("/trade", { waitUntil: "networkidle" });
  await page.getByRole("radio", { name: "ZEC / USDT" }).click();
  await expect(page.getByText("settles ZEC-USDT")).toBeVisible();
  await page.getByRole("radio", { name: "Empty" }).click();
  await expect(page.getByText("No resting depth. The local book is empty. Settled as ZEC-USDT.")).toBeVisible();
  await expect(page.getByText("No resting depth. Review is disabled until the local book has size. Settled as ZEC-USDT.")).toBeVisible();
  await expect(page.getByText("session last · ZEC-USDT")).toBeVisible();
  await expect(page.getByRole("button", { name: "Review simulated buy" })).toBeDisabled();
  await page.getByRole("radio", { name: "Loading" }).click();
  await expect(page.getByText("Loading market data", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("The ticket is waiting for a book snapshot. Retry is safe; nothing was submitted. Settled as ZEC-USDT.")).toBeVisible();
});

test("LP preview shows integer IL versus hold", async ({ page }) => {
  await page.goto("/liquidity", { waitUntil: "networkidle" });
  const stats = page.getByRole("group", { name: "Pool stats and impermanent loss versus hold" });
  await expect(stats.getByText("IL vs hold at 4x ZEC/quote")).toBeVisible();
  await expect(stats.getByText("IL vs hold at 1/4x ZEC/quote")).toBeVisible();
  await expect(page.getByText("Not a return or profit projection.")).toBeVisible();
  await page.getByRole("button", { name: "Review simulated mint" }).click();
  await expect(page.getByText("This preview labels native ZEC. It is not live settlement.")).toBeVisible();
  await expect(page.getByText("Leaves the session")).toBeVisible();
  await expect(
    page.getByText("ZEC custody and redemption, if ever offered, would depend on a gateway. This preview is not live settlement."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Confirm simulated mint" }).click();
  await expect(page.getByText(/Minted .* local LP shares\. Wallet actions stay disabled\. Settled as ZEC-USDC\./)).toBeVisible();
  await expect(stats.getByText("Session IL vs hold")).toBeVisible();
});

test("LP burn stays available after a trading pause", async ({ page }) => {
  await page.goto("/liquidity", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Review simulated mint" }).click();
  await page.getByRole("button", { name: "Confirm simulated mint" }).click();
  await expect(page.getByText(/Minted .* local LP shares/)).toBeVisible();
  await page.getByRole("button", { name: "Pause trading preview" }).click();
  await expect(page.getByText("Trading paused. LP withdrawal remains available. Settled as ZEC-USDC.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Review simulated mint" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Review simulated swap" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Burn session shares" })).toBeEnabled();
  await page.getByRole("button", { name: "Burn session shares" }).click();
  await expect(page.getByText(/Burned session shares for .* ZEC\. Local preview only\. Settled as ZEC-USDC\./)).toBeVisible();
  await page.getByRole("button", { name: "Reset pool" }).click();
  await expect(page.getByText("Local pool reserves restored. Settled as ZEC-USDC.")).toBeVisible();
});

test("LP pause notice names the newly selected pool after a pool switch", async ({ page }) => {
  await page.goto("/liquidity", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Pause trading preview" }).click();
  await expect(page.getByText("Trading paused. LP withdrawal remains available. Settled as ZEC-USDC.")).toBeVisible();
  await page.getByRole("radio", { name: /ZEC\/USDT/ }).click();
  await expect(page.getByRole("radio", { name: /ZEC\/USDT/ })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByText("Trading paused. LP withdrawal remains available. Settled as ZEC-USDT.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Review simulated mint" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Review simulated swap" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Burn session shares" })).toBeEnabled();
  await page.getByRole("button", { name: "Resume trading preview" }).click();
  await expect(page.getByText("Trading pause lifted. Mint and swap are available again. Settled as ZEC-USDT.")).toBeVisible();
});

test("LP lifted pause notice names the newly selected pool after a pool switch", async ({ page }) => {
  await page.goto("/liquidity", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Pause trading preview" }).click();
  await expect(page.getByText("Trading paused. LP withdrawal remains available. Settled as ZEC-USDC.")).toBeVisible();
  await page.getByRole("button", { name: "Resume trading preview" }).click();
  await expect(page.getByText("Trading pause lifted. Mint and swap are available again. Settled as ZEC-USDC.")).toBeVisible();
  await page.getByRole("radio", { name: /ZEC\/USDT/ }).click();
  await expect(page.getByRole("radio", { name: /ZEC\/USDT/ })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByText("Trading pause lifted. Mint and swap are available again. Settled as ZEC-USDT.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Review simulated mint" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Review simulated swap" })).toBeEnabled();
});

test("LP pause notice names ZEC-USDT on the USDT pool", async ({ page }) => {
  await page.goto("/liquidity", { waitUntil: "networkidle" });
  await page.getByRole("radio", { name: /ZEC\/USDT/ }).click();
  await expect(page.getByRole("radio", { name: /ZEC\/USDT/ })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "Pause trading preview" }).click();
  await expect(page.getByText("Trading paused. LP withdrawal remains available. Settled as ZEC-USDT.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Review simulated mint" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Review simulated swap" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Burn session shares" })).toBeEnabled();
  await page.getByRole("button", { name: "Resume trading preview" }).click();
  await expect(page.getByText("Trading pause lifted. Mint and swap are available again. Settled as ZEC-USDT.")).toBeVisible();
});

test("LP swap success notice names the settlement pair", async ({ page }) => {
  await page.goto("/liquidity", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Review simulated swap" }).click();
  await expect(page.getByRole("button", { name: "Confirm simulated swap" })).toBeVisible();
  await page.getByRole("button", { name: "Confirm simulated swap" }).click();
  await expect(page.getByText(/Simulated ZEC→USDC swap\. Output .* USDC\. Local preview only\. Settled as ZEC-USDC\./)).toBeVisible();
});

test("LP swap success notice names ZEC-USDT on the USDT pool", async ({ page }) => {
  await page.goto("/liquidity", { waitUntil: "networkidle" });
  await page.getByRole("radio", { name: /ZEC\/USDT/ }).click();
  await expect(page.getByRole("radio", { name: /ZEC\/USDT/ })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "Review simulated swap" }).click();
  await expect(page.getByRole("button", { name: "Confirm simulated swap" })).toBeVisible();
  await page.getByRole("button", { name: "Confirm simulated swap" }).click();
  await expect(page.getByText(/Simulated ZEC→USDT swap\. Output .* USDT\. Local preview only\. Settled as ZEC-USDT\./)).toBeVisible();
});

test("LP mint success notice names ZEC-USDT on the USDT pool", async ({ page }) => {
  await page.goto("/liquidity", { waitUntil: "networkidle" });
  await page.getByRole("radio", { name: /ZEC\/USDT/ }).click();
  await expect(page.getByRole("radio", { name: /ZEC\/USDT/ })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "Review simulated mint" }).click();
  await expect(page.getByRole("button", { name: "Confirm simulated mint" })).toBeVisible();
  await page.getByRole("button", { name: "Confirm simulated mint" }).click();
  await expect(page.getByText(/Minted .* local LP shares\. Wallet actions stay disabled\. Settled as ZEC-USDT\./)).toBeVisible();
});

test("LP burn success notice names ZEC-USDT on the USDT pool", async ({ page }) => {
  await page.goto("/liquidity", { waitUntil: "networkidle" });
  await page.getByRole("radio", { name: /ZEC\/USDT/ }).click();
  await expect(page.getByRole("radio", { name: /ZEC\/USDT/ })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "Review simulated mint" }).click();
  await expect(page.getByRole("button", { name: "Confirm simulated mint" })).toBeVisible();
  await page.getByRole("button", { name: "Confirm simulated mint" }).click();
  await expect(page.getByText(/Minted .* local LP shares\. Wallet actions stay disabled\. Settled as ZEC-USDT\./)).toBeVisible();
  await page.getByRole("button", { name: "Burn session shares" }).click();
  await expect(page.getByText(/Burned session shares for .* ZEC\. Local preview only\. Settled as ZEC-USDT\./)).toBeVisible();
});

test("LP reset-pool notice names ZEC-USDT on the USDT pool", async ({ page }) => {
  await page.goto("/liquidity", { waitUntil: "networkidle" });
  await page.getByRole("radio", { name: /ZEC\/USDT/ }).click();
  await expect(page.getByRole("radio", { name: /ZEC\/USDT/ })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "Review simulated mint" }).click();
  await expect(page.getByRole("button", { name: "Confirm simulated mint" })).toBeVisible();
  await page.getByRole("button", { name: "Confirm simulated mint" }).click();
  await expect(page.getByText(/Minted .* local LP shares\. Wallet actions stay disabled\. Settled as ZEC-USDT\./)).toBeVisible();
  await page.getByRole("button", { name: "Reset pool" }).click();
  await expect(page.getByText("Local pool reserves restored. Settled as ZEC-USDT.")).toBeVisible();
});

test("withdrawal tour drives a stub claim without changing tour copy", async ({ page }) => {
  await page.goto("/trade?view=bridge", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Withdrawal states" }).click();
  await expect(page.getByText("Amount, transparent destination, network fee, service fee, and net output would be reviewed before any burn.")).toBeVisible();
  const dest = "t1Zo4ZzPXJiJ8M8pYMgL4tWbdkH7c8r7abc";
  await page.getByRole("textbox", { name: "Transparent destination to inspect" }).fill(dest);
  await expect(page.getByText(payoutClaimStubCopy(payoutClaimForTourStep("requested", dest)))).toBeVisible();
  await page.getByRole("button", { name: "Next state" }).click();
  await expect(page.getByText("Screened", { exact: true })).toBeVisible();
  await expect(page.getByText(payoutClaimStubCopy(payoutClaimForTourStep("screened", dest)))).toBeVisible();
});

test("IOC cancels an unfilled remainder and FOK rejects a full miss", async ({ page }) => {
  await page.goto("/trade", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "IOC" }).click();
  await page.getByRole("textbox", { name: "Price in USDC" }).fill("50.00");
  await page.getByRole("textbox", { name: "Order size in ZEC" }).fill("1");
  await page.getByRole("button", { name: "Review simulated buy" }).click();
  await page.getByRole("button", { name: "Confirm simulated buy" }).click();
  await expect(page.getByText(/Unfilled size was cancelled/)).toBeVisible();

  await page.getByRole("button", { name: "FOK" }).click();
  await page.getByRole("textbox", { name: "Price in USDC" }).fill("52.91");
  await page.getByRole("textbox", { name: "Order size in ZEC" }).fill("100");
  await page.getByRole("button", { name: "Review simulated buy" }).click();
  await page.getByRole("button", { name: "Confirm simulated buy" }).click();
  await expect(page.getByText("Rejected. Fill-or-kill could not fill in full. Settled as ZEC-USDC.", { exact: true })).toBeVisible();
});

test("FOK reject copy names ZEC-USDT if market switches while rejected panel is open", async ({ page }) => {
  await page.goto("/trade", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "FOK" }).click();
  await page.getByRole("textbox", { name: "Price in USDC" }).fill("52.91");
  await page.getByRole("textbox", { name: "Order size in ZEC" }).fill("100");
  await page.getByRole("button", { name: "Review simulated buy" }).click();
  await expect(page.getByRole("button", { name: "Confirm simulated buy" })).toBeVisible();
  await page.getByRole("button", { name: "Confirm simulated buy" }).click();
  await expect(page.getByText("Order rejected", { exact: true })).toBeVisible();
  await expect(page.getByText("Rejected. Fill-or-kill could not fill in full. Settled as ZEC-USDC.", { exact: true })).toBeVisible();
  await page.getByRole("radio", { name: /ZEC \/ USDT|ZEC\/USDT/ }).click();
  await expect(page.getByText("Order rejected", { exact: true })).toBeVisible();
  await expect(page.getByText("Rejected. Fill-or-kill could not fill in full. Settled as ZEC-USDT.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm simulated buy" })).toHaveCount(0);
});

test("invalidate-epoch control is keyboard focusable", async ({ page }) => {
  await page.goto("/trade", { waitUntil: "networkidle" });
  const invalidate = page.getByRole("button", { name: "Invalidate older session orders" });
  await invalidate.focus();
  await expect(invalidate).toBeFocused();
});

test("liquidity previews integer IL versus hold without a return claim", async ({ page }) => {
  await page.goto("/liquidity", { waitUntil: "networkidle" });
  await expect(page.getByText("IL vs hold at 4x ZEC/quote")).toBeVisible();
  await expect(page.getByText("IL vs hold at 1/4x ZEC/quote")).toBeVisible();
  await expect(page.getByText("Not a return or profit projection.")).toBeVisible();
});

test("market orders are IOC with a visible worst price", async ({ page }) => {
  await page.goto("/trade", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Market" }).click();
  await page.getByRole("textbox", { name: "Order size in ZEC" }).fill("1");
  await page.getByRole("button", { name: "Review simulated buy" }).click();
  await expect(page.getByText("Worst acceptable price")).toBeVisible();
  await expect(page.getByText("IOC", { exact: true })).toBeVisible();
});

test("320px market buy at zero slippage does not fill beyond the signed worst price", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/trade", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Market" }).click();
  await expect(
    page.getByText("Market orders are IOC with a signed worst price. There is no unbounded market instruction. This preview is not live settlement."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "GTC" })).toHaveCount(0);
  await page.getByRole("textbox", { name: "Maximum slippage percent" }).fill("0");
  await page.getByRole("textbox", { name: "Order size in ZEC" }).fill("1");
  await page.getByRole("button", { name: "Review simulated buy" }).click();
  await expect(page.getByText("Worst acceptable price")).toBeVisible();
  await expect(page.getByText("Worst acceptable price").locator("xpath=following-sibling::dd")).toHaveText("52.84 USDC");
  await expect(page.getByText("IOC", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Confirm simulated buy" }).click();
  await expect(page.getByText("Immediate-or-cancel finished with no fills")).toBeVisible();
  await expect(page.getByRole("button", { name: "Ask 52.91" })).toBeVisible();
  await page.getByRole("tab", { name: "Fills" }).click();
  await expect(page.getByRole("tabpanel", { name: "Fills" })).toContainText("No session fills yet. Settled as ZEC-USDC.");
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
  await page.getByRole("textbox", { name: "Order size in ZEC" }).fill("1");
  await page.getByRole("textbox", { name: "Order expiry unix time" }).fill(expiry);
  await page.getByRole("button", { name: "Review simulated buy" }).click();
  await expect(page.getByRole("button", { name: "Confirm simulated buy" })).toBeVisible();
  await expect(page.getByText(expiry).first()).toBeVisible();
});

test("session event log includes expiry after confirm", async ({ page }) => {
  const expiry = String(Math.floor(Date.now() / 1000) + 3600);
  await page.goto("/trade", { waitUntil: "networkidle" });
  await page.getByRole("textbox", { name: "Order size in ZEC" }).fill("1");
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
  await expect(page.getByRole("button", { name: "Connect Arbitrum Sepolia wallet" })).toHaveAttribute(
    "title",
    "Connect an injected EVM wallet on Arbitrum Sepolia. Settled as ZEC-USDC.",
  );
  await page.getByRole("button", { name: "Connect Arbitrum Sepolia wallet" }).click();
  await expect(page.getByText("No injected EVM wallet. Arbitrum Sepolia only. Settled as ZEC-USDC.")).toBeVisible();
});

test("connect wallet without a provider names ZEC-USDT after switching market", async ({ page }) => {
  await page.goto("/trade", { waitUntil: "networkidle" });
  await page.getByRole("radio", { name: /ZEC \/ USDT|ZEC\/USDT/ }).click();
  const connect = page.getByRole("button", { name: "Connect Arbitrum Sepolia wallet" });
  await expect(connect).toHaveAttribute(
    "title",
    "Connect an injected EVM wallet on Arbitrum Sepolia. Settled as ZEC-USDT.",
  );
  await connect.click();
  await expect(
    page.getByText("No injected EVM wallet. Arbitrum Sepolia only. Settled as ZEC-USDT.", { exact: true }),
  ).toBeVisible();
});

test("missing-provider error keeps settlement after switching market", async ({ page }) => {
  await page.goto("/trade", { waitUntil: "networkidle" });
  const connect = page.getByRole("button", { name: "Connect Arbitrum Sepolia wallet" });
  await connect.click();
  await expect(
    page.getByText("No injected EVM wallet. Arbitrum Sepolia only. Settled as ZEC-USDC.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("radio", { name: /ZEC \/ USDT|ZEC\/USDT/ }).click();
  const retargeted = "No injected EVM wallet. Arbitrum Sepolia only. Settled as ZEC-USDT.";
  await expect(page.getByText(retargeted, { exact: true })).toBeVisible();
  await expect(connect).toHaveAttribute("title", retargeted);
});

test("rejected connect error keeps settlement after switching market", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "ethereum", {
      configurable: true,
      value: {
        request(args: { method: string }) {
          if (args.method === "eth_requestAccounts") {
            return Promise.reject(Object.assign(new Error("User rejected the request."), { code: 4001 }));
          }
          return Promise.reject(new Error(args.method));
        },
      },
    });
  });
  await page.goto("/trade", { waitUntil: "networkidle" });
  const connect = page.getByRole("button", { name: "Connect Arbitrum Sepolia wallet" });
  await connect.click();
  await expect(
    page.getByText("Wallet request was rejected. Settled as ZEC-USDC.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("radio", { name: /ZEC \/ USDT|ZEC\/USDT/ }).click();
  const retargeted = "Wallet request was rejected. Settled as ZEC-USDT.";
  await expect(page.getByText(retargeted, { exact: true })).toBeVisible();
  await expect(connect).toHaveAttribute("title", retargeted);
});

test("connecting wallet title keeps the settlement pair", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "ethereum", {
      configurable: true,
      value: {
        request(args: { method: string }) {
          void args;
          return new Promise(() => {});
        },
      },
    });
  });
  await page.goto("/trade", { waitUntil: "networkidle" });
  const connect = page.getByRole("button", { name: "Connect Arbitrum Sepolia wallet" });
  await connect.click();
  await expect(connect).toHaveText("Connecting");
  await expect(connect).toBeDisabled();
  await expect(connect).toHaveAttribute(
    "title",
    "Connecting an injected EVM wallet on Arbitrum Sepolia. Settled as ZEC-USDC.",
  );
});

test("connecting wallet title keeps settlement after switching market", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "ethereum", {
      configurable: true,
      value: {
        request(args: { method: string }) {
          void args;
          return new Promise(() => {});
        },
      },
    });
  });
  await page.goto("/trade", { waitUntil: "networkidle" });
  const connect = page.getByRole("button", { name: "Connect Arbitrum Sepolia wallet" });
  await connect.click();
  await expect(connect).toHaveText("Connecting");
  await expect(connect).toHaveAttribute(
    "title",
    "Connecting an injected EVM wallet on Arbitrum Sepolia. Settled as ZEC-USDC.",
  );
  await page.getByRole("radio", { name: /ZEC \/ USDT|ZEC\/USDT/ }).click();
  await expect(connect).toHaveText("Connecting");
  await expect(connect).toBeDisabled();
  await expect(connect).toHaveAttribute(
    "title",
    "Connecting an injected EVM wallet on Arbitrum Sepolia. Settled as ZEC-USDT.",
  );
});

test("connecting wallet title after rejected connect hang keeps settlement", async ({ page }) => {
  await page.addInitScript(() => {
    let rejectNext = true;
    Object.defineProperty(window, "ethereum", {
      configurable: true,
      value: {
        request(args: { method: string }) {
          if (args.method === "eth_requestAccounts") {
            if (rejectNext) {
              rejectNext = false;
              return Promise.reject(Object.assign(new Error("User rejected the request."), { code: 4001 }));
            }
            return new Promise(() => {});
          }
          return Promise.reject(new Error(args.method));
        },
      },
    });
  });
  await page.goto("/trade", { waitUntil: "networkidle" });
  const connect = page.getByRole("button", { name: "Connect Arbitrum Sepolia wallet" });
  await connect.click();
  const rejectUsdc = "Wallet request was rejected. Settled as ZEC-USDC.";
  await expect(page.getByText(rejectUsdc, { exact: true })).toBeVisible();
  await connect.click();
  await expect(connect).toHaveText("Connecting");
  await expect(connect).toHaveAttribute(
    "title",
    "Connecting an injected EVM wallet on Arbitrum Sepolia. Settled as ZEC-USDC.",
  );
  await expect(page.getByText(rejectUsdc, { exact: true })).toBeVisible();
  await page.getByRole("radio", { name: /ZEC \/ USDT|ZEC\/USDT/ }).click();
  await expect(connect).toHaveText("Connecting");
  await expect(connect).toBeDisabled();
  await expect(connect).toHaveAttribute(
    "title",
    "Connecting an injected EVM wallet on Arbitrum Sepolia. Settled as ZEC-USDT.",
  );
  await expect(
    page.getByText("Wallet request was rejected. Settled as ZEC-USDT.", { exact: true }),
  ).toBeVisible();
});

test("idle Connect wallet title keeps settlement after switching market", async ({ page }) => {
  await page.goto("/trade", { waitUntil: "networkidle" });
  const connect = page.getByRole("button", { name: "Connect Arbitrum Sepolia wallet" });
  await expect(connect).toHaveText("Connect wallet");
  await expect(connect).toHaveAttribute(
    "title",
    "Connect an injected EVM wallet on Arbitrum Sepolia. Settled as ZEC-USDC.",
  );
  await page.getByRole("radio", { name: /ZEC \/ USDT|ZEC\/USDT/ }).click();
  await expect(connect).toHaveText("Connect wallet");
  await expect(connect).toHaveAttribute(
    "title",
    "Connect an injected EVM wallet on Arbitrum Sepolia. Settled as ZEC-USDT.",
  );
});

test("ticket signing stays disabled while the settlement contract is undeployed", async ({ page }) => {
  await page.addInitScript((chainId) => {
    Object.defineProperty(window, "ethereum", {
      configurable: true,
      value: {
        request(args: { method: string }) {
          if (args.method === "eth_requestAccounts") {
            return Promise.resolve(["0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"]);
          }
          if (args.method === "eth_chainId") {
            return Promise.resolve(chainId);
          }
          return Promise.reject(new Error(args.method));
        },
      },
    });
  }, ARBITRUM_SEPOLIA_HEX);
  await page.goto("/trade", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Connect Arbitrum Sepolia wallet" }).click();
  await expect(page.getByRole("button", { name: "Disconnect 0xf39f…2266. Settled as ZEC-USDC." })).toBeVisible();
  await page.getByRole("textbox", { name: "Order size in ZEC" }).fill("1");
  await page.getByRole("button", { name: "Review simulated buy" }).click();
  await expect(page.getByRole("button", { name: "Confirm simulated buy" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Sign.*testnet/ })).toHaveCount(0);
  await expect(page.getByText("Session digest", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();
  await page.getByRole("radio", { name: /ZEC \/ USDT|ZEC\/USDT/ }).click();
  await page.getByRole("textbox", { name: "Order size in ZEC" }).fill("1");
  await page.getByRole("button", { name: "Review simulated buy" }).click();
  await expect(page.getByRole("button", { name: /Sign.*testnet/ })).toHaveCount(0);
  await expect(page.getByText("Session digest", { exact: true })).toBeVisible();
});

test("market switching cannot enable undeployed testnet signing", async ({ page }) => {
  await page.addInitScript((chainId) => {
    Object.defineProperty(window, "ethereum", {
      configurable: true,
      value: {
        request(args: { method: string }) {
          if (args.method === "eth_requestAccounts") {
            return Promise.resolve(["0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"]);
          }
          if (args.method === "eth_chainId") {
            return Promise.resolve(chainId);
          }
          return Promise.reject(new Error(args.method));
        },
      },
    });
  }, ARBITRUM_SEPOLIA_HEX);
  await page.goto("/trade", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Connect Arbitrum Sepolia wallet" }).click();
  await expect(page.getByRole("button", { name: "Disconnect 0xf39f…2266. Settled as ZEC-USDC." })).toBeVisible();
  await page.getByRole("textbox", { name: "Order size in ZEC" }).fill("1");
  await page.getByRole("button", { name: "Review simulated buy" }).click();
  await expect(page.getByRole("button", { name: "Confirm simulated buy" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Sign.*testnet/ })).toHaveCount(0);
  await page.getByRole("radio", { name: /ZEC \/ USDT|ZEC\/USDT/ }).click();
  await expect(page.getByRole("button", { name: "Confirm simulated buy" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Sign.*testnet/ })).toHaveCount(0);
});

test("wallet disconnect accessible name keeps settlement after switching market", async ({ page }) => {
  await page.addInitScript((chainId) => {
    Object.defineProperty(window, "ethereum", {
      configurable: true,
      value: {
        request(args: { method: string }) {
          if (args.method === "eth_requestAccounts") {
            return Promise.resolve(["0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"]);
          }
          if (args.method === "eth_chainId") {
            return Promise.resolve(chainId);
          }
          return Promise.reject(new Error(args.method));
        },
      },
    });
  }, ARBITRUM_SEPOLIA_HEX);
  await page.goto("/trade", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Connect Arbitrum Sepolia wallet" }).click();
  const connectedUsdc = page.getByRole("button", { name: "Disconnect 0xf39f…2266. Settled as ZEC-USDC." });
  await expect(connectedUsdc).toHaveText("0xf39f…2266");
  await expect(connectedUsdc).toHaveAttribute(
    "aria-label",
    "Disconnect 0xf39f…2266. Settled as ZEC-USDC.",
  );
  await page.getByRole("radio", { name: /ZEC \/ USDT|ZEC\/USDT/ }).click();
  const connectedUsdt = page.getByRole("button", { name: "Disconnect 0xf39f…2266. Settled as ZEC-USDT." });
  await expect(connectedUsdt).toHaveText("0xf39f…2266");
  await expect(connectedUsdt).toHaveAttribute(
    "aria-label",
    "Disconnect 0xf39f…2266. Settled as ZEC-USDT.",
  );
  await connectedUsdt.click();
  const connect = page.getByRole("button", { name: "Connect Arbitrum Sepolia wallet" });
  await expect(connect).toHaveText("Connect wallet");
  await expect(connect).toBeEnabled();
});

test("first-session education can be completed by keyboard", async ({ page }) => {
  await page.goto("/trade?education=1", { waitUntil: "networkidle" });
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "This is a no-value simulation." })).toBeFocused();
  await dialog.getByRole("button", { name: "Continue" }).click();
  await expect(dialog.getByRole("heading", { name: "Pairs are native ZEC against USDC and USDT." })).toBeVisible();
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
  for (let index = 2; index < DEPOSIT_TOUR.length; index += 1) {
    await page.getByRole("button", { name: "Next state" }).click();
  }
  await expect(page.getByText("No native ZEC was received and nothing was minted.")).toBeVisible();
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
  await expect(page.getByText("Do not send ZEC, USDC, USDT, or any other asset")).toBeVisible();
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
      "This is a no-value simulation. It is not a live exchange and not a shielded market.",
      { exact: true },
    )).toBeVisible();
  } finally {
    await context.close();
  }
});

test("past unix expiry rejects before review and names the rejected panel", async ({ page }) => {
  await page.goto("/trade", { waitUntil: "networkidle" });
  await page.getByRole("textbox", { name: "Order size in ZEC" }).fill("1");
  await page.getByRole("textbox", { name: "Order expiry unix time" }).fill("1");
  await page.getByRole("button", { name: "Review simulated buy" }).click();
  await expect(page.getByText("Order rejected", { exact: true })).toBeVisible();
  await expect(page.getByText("Rejected. Order expiry has passed. Settled as ZEC-USDC.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm simulated buy" })).toHaveCount(0);
});

test("ticket reject copy names ZEC-USDT if market switches while rejected panel is open", async ({ page }) => {
  await page.goto("/trade", { waitUntil: "networkidle" });
  await page.getByRole("textbox", { name: "Order size in ZEC" }).fill("1");
  await page.getByRole("textbox", { name: "Order expiry unix time" }).fill("1");
  await page.getByRole("button", { name: "Review simulated buy" }).click();
  await expect(page.getByText("Order rejected", { exact: true })).toBeVisible();
  await expect(page.getByText("Rejected. Order expiry has passed. Settled as ZEC-USDC.", { exact: true })).toBeVisible();
  await page.getByRole("radio", { name: /ZEC \/ USDT|ZEC\/USDT/ }).click();
  await expect(page.getByText("Order rejected", { exact: true })).toBeVisible();
  await expect(page.getByText("Rejected. Order expiry has passed. Settled as ZEC-USDT.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm simulated buy" })).toHaveCount(0);
});

test("confirmed ticket writes expiry onto the blotter event log", async ({ page }) => {
  await page.goto("/trade", { waitUntil: "networkidle" });
  await page.getByRole("textbox", { name: "Order size in ZEC" }).fill("1");
  await page.getByRole("textbox", { name: "Order expiry unix time" }).fill("4102444800");
  await page.getByRole("button", { name: "Review simulated buy" }).click();
  await page.getByRole("button", { name: "Confirm simulated buy" }).click();
  await page.getByRole("tab", { name: "Event log" }).click();
  await expect(page.getByRole("tabpanel", { name: "Event log" })).toContainText("expiry 4102444800");
  await expect(page.getByRole("tabpanel", { name: "Event log" })).toContainText("Settled as ZEC-USDC.");
});

test("status, legal, and security pages cross-link", async ({ page }) => {
  await page.goto("/status", { waitUntil: "networkidle" });
  await expect(page.getByRole("main").getByRole("link", { name: "Legal", exact: true })).toBeVisible();
  await page.goto("/legal", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Legal and compliance" })).toBeVisible();
  await expect(page.getByRole("main").getByText("not a live exchange")).toBeVisible();
  await page.goto("/security", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Security" })).toBeVisible();
  await expect(page.getByText("no production support commitment")).toBeVisible();
});


test("blotter tabs expose a selected tabpanel", async ({ page }) => {
  await page.goto("/trade", { waitUntil: "networkidle" });
  await expect(page.getByRole("tab", { name: "Open orders" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel", { name: "Open orders" })).toContainText("No open session orders. Settled as ZEC-USDC.");
  await page.getByRole("radio", { name: /ZEC \/ USDT|ZEC\/USDT/ }).click();
  await expect(page.getByRole("tabpanel", { name: "Open orders" })).toContainText("Settled as ZEC-USDT");
  await page.getByRole("tab", { name: "Inventory" }).click();
  await expect(page.getByRole("tabpanel", { name: "Inventory" })).toContainText("Account epoch");
});

test("blotter event log empty copy names the settlement pair", async ({ page }) => {
  await page.goto("/trade", { waitUntil: "networkidle" });
  await page.getByRole("tab", { name: "Event log" }).click();
  await expect(page.getByRole("tabpanel", { name: "Event log" })).toContainText(
    "No session events yet. Settled as ZEC-USDC.",
  );
  await page.getByRole("radio", { name: /ZEC \/ USDT|ZEC\/USDT/ }).click();
  await expect(page.getByRole("tabpanel", { name: "Event log" })).toContainText("Settled as ZEC-USDT");
  await expect(page.getByRole("tabpanel", { name: "Event log" })).toContainText(
    "Replaying this log reconstructs the book and balances.",
  );
});

test("landing journey tabs select LP without a page reload", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.getByRole("tab", { name: "Trader" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("link", { name: "Preview trading" })).toBeVisible();
  await page.getByRole("tab", { name: "Withdrawal" }).click();
  await expect(page.getByRole("tab", { name: "Withdrawal" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("link", { name: "Preview withdrawal states" })).toBeVisible();
  await page.getByRole("link", { name: "Preview withdrawal states" }).click();
  await expect(page).toHaveURL(/view=bridge/);
  await expect(page.getByRole("button", { name: "Withdrawal states" })).toHaveAttribute("aria-pressed", "true");
});

test("unavailable feed withholds chart stats and LP mint", async ({ page }) => {
  await page.goto("/trade?feed=unavailable", { waitUntil: "networkidle" });
  await expect(page.getByText("Market data unavailable", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Chart and 24h stats are withheld. Integrity checks failed.").first()).toBeVisible();
  await expect(page.getByRole("region", { name: "Selected market summary" })).toContainText("settles ZEC-USDC");
  await expect(page.getByText("Integrity checks failed. Preview-to-sign is disabled. Retry is safe; nothing was submitted. Settled as ZEC-USDC.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Review simulated buy" })).toBeDisabled();
  await expect(page.getByRole("img", { name: /price chart/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Retry illustrative feed" }).click();
  await expect(page.getByRole("img", { name: "Illustrative 4H price chart for ZEC/USDC, settled as ZEC-USDC" })).toBeVisible();
  await page.getByRole("radio", { name: "1H · ZEC-USDC" }).click();
  await expect(page.getByRole("img", { name: "Illustrative 1H price chart for ZEC/USDC, settled as ZEC-USDC" })).toBeVisible();
  await page.getByRole("radio", { name: "1D · ZEC-USDC" }).click();
  await expect(page.getByRole("img", { name: "Illustrative 1D price chart for ZEC/USDC, settled as ZEC-USDC" })).toBeVisible();
  await page.goto("/liquidity?feed=unavailable", { waitUntil: "networkidle" });
  await expect(page.getByRole("button", { name: "Review simulated mint" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Review simulated swap" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Burn session shares" })).toBeEnabled();
  await expect(page.getByText("Integrity checks failed. Preview-to-sign is disabled. Retry is safe; nothing was submitted. Settled as ZEC-USDC.")).toBeVisible();
});

test("unavailable ZEC/USDT withholds chart copy naming ZEC-USDT before retry", async ({ page }) => {
  await page.goto("/trade", { waitUntil: "networkidle" });
  await page.getByRole("radio", { name: /ZEC \/ USDT|ZEC\/USDT/ }).click();
  await page.getByRole("radio", { name: "Unavailable" }).click();
  await expect(
    page.getByText("Market data unavailable. Chart and 24h stats are withheld. Integrity checks failed. Settled as ZEC-USDT.").first(),
  ).toBeVisible();
  await expect(page.getByRole("img", { name: /price chart/ })).toHaveCount(0);
});

test("chart withheld copy names ZEC-USDT if market switches while unavailable", async ({ page }) => {
  await page.goto("/trade", { waitUntil: "networkidle" });
  await page.getByRole("radio", { name: "Unavailable" }).click();
  await expect(
    page.getByText("Market data unavailable. Chart and 24h stats are withheld. Integrity checks failed. Settled as ZEC-USDC.").first(),
  ).toBeVisible();
  await expect(page.getByRole("img", { name: /price chart/ })).toHaveCount(0);
  await page.getByRole("radio", { name: /ZEC \/ USDT|ZEC\/USDT/ }).click();
  await expect(
    page.getByText("Market data unavailable. Chart and 24h stats are withheld. Integrity checks failed. Settled as ZEC-USDT.").first(),
  ).toBeVisible();
  await expect(page.getByRole("img", { name: /price chart/ })).toHaveCount(0);
});

test("chart 1H and 1D img labels return on ZEC/USDT after fixtures", async ({ page }) => {
  await page.goto("/trade", { waitUntil: "networkidle" });
  await page.getByRole("radio", { name: /ZEC \/ USDT|ZEC\/USDT/ }).click();
  await expect(page.getByRole("img", { name: "Illustrative 4H price chart for ZEC/USDT, settled as ZEC-USDT" })).toBeVisible();
  await page.getByRole("radio", { name: "Unavailable" }).click();
  await expect(page.getByRole("img", { name: /price chart/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Retry illustrative feed" }).click();
  await expect(page.getByRole("img", { name: "Illustrative 4H price chart for ZEC/USDT, settled as ZEC-USDT" })).toBeVisible();
  await page.getByRole("radio", { name: "1H · ZEC-USDT" }).click();
  await expect(page.getByRole("img", { name: "Illustrative 1H price chart for ZEC/USDT, settled as ZEC-USDT" })).toBeVisible();
  await page.getByRole("radio", { name: "1D · ZEC-USDT" }).click();
  await expect(page.getByRole("img", { name: "Illustrative 1D price chart for ZEC/USDT, settled as ZEC-USDT" })).toBeVisible();
});

test("blotter arrow keys move to the next tabpanel", async ({ page }) => {
  await page.goto("/trade", { waitUntil: "networkidle" });
  await page.getByRole("tab", { name: "Open orders" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Fills" })).toBeFocused();
  await expect(page.getByRole("tabpanel", { name: "Open orders" })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("tabpanel", { name: "Fills" })).toContainText("No session fills yet. Settled as ZEC-USDC.");
});

test("first-session education can be completed by keyboard with education copy", async ({ page }) => {
  await page.goto("/trade?education=1", { waitUntil: "networkidle" });
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "This is a no-value simulation." })).toBeFocused();
  await expect(dialog.getByText("Education, not consent.")).toBeVisible();
  await dialog.getByRole("button", { name: "Continue" }).click();
  await expect(dialog.getByRole("heading", { name: "Pairs are native ZEC against USDC and USDT." })).toBeVisible();
  await dialog.getByRole("button", { name: "Continue" }).click();
  await expect(dialog.getByRole("heading", { name: "Preview actions stay in this browser." })).toBeVisible();
  await dialog.getByRole("button", { name: "Enter simulation" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Review simulated buy" })).toBeVisible();
});

test("first-session education dismisses on Escape from liquidity", async ({ page }) => {
  await page.goto("/liquidity?education=1", { waitUntil: "networkidle" });
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "This is a no-value simulation." })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Provide liquidity" })).toBeVisible();
});

test("country-blocked demonstration hides trading and liquidity controls", async ({ page }) => {
  await page.goto("/trade?access=blocked", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Phlebas is not available in this location." })).toBeVisible();
  await expect(page.getByText("State demonstration")).toBeVisible();
  await expect(page.getByRole("button", { name: "Review simulated buy" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Read the architecture" })).toBeVisible();
  await page.goto("/liquidity?access=blocked", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Phlebas is not available in this location." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Review simulated mint" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Return home" })).toBeVisible();
});

test("chart range uses a radiogroup and unavailable tape names the feed", async ({ page }) => {
  await page.goto("/trade", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "ZEC/USDC · ZEC-USDC" })).toBeVisible();
  await expect(page.getByText("Illustrative market data · ZEC-USDC")).toBeVisible();
  await expect(page.getByRole("img", { name: "Illustrative 4H price chart for ZEC/USDC, settled as ZEC-USDC" })).toBeVisible();
  await expect(page.getByRole("radiogroup", { name: "Chart range" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "4H · ZEC-USDC" })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("radio", { name: "1H · ZEC-USDC" }).click();
  await expect(page.getByRole("img", { name: "Illustrative 1H price chart for ZEC/USDC, settled as ZEC-USDC" })).toBeVisible();
  await page.getByRole("radio", { name: "1D · ZEC-USDC" }).click();
  await expect(page.getByRole("radio", { name: "1D · ZEC-USDC" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("img", { name: "Illustrative 1D price chart for ZEC/USDC, settled as ZEC-USDC" })).toBeVisible();
  await page.getByRole("radio", { name: /ZEC \/ USDT|ZEC\/USDT/ }).click();
  await expect(page.getByRole("radio", { name: "1D · ZEC-USDT" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("heading", { name: "ZEC/USDT · ZEC-USDT" })).toBeVisible();
  await page.goto("/trade?feed=unavailable", { waitUntil: "networkidle" });
  await expect(page.getByLabel("Asks")).toContainText("Market data unavailable");
  await expect(page.getByLabel("Asks")).toContainText("Settled as ZEC-USDC");
  await expect(page.getByRole("heading", { name: "Recent trades" })).toBeVisible();
  await expect(page.getByRole("table", { name: /trades withheld.*Settled as ZEC-USDC/ })).toBeVisible();
  await expect(page.getByText("Withheld · ZEC-USDC")).toBeVisible();
  await expect(page.getByText("Chart and 24h stats are withheld. Integrity checks failed. Settled as ZEC-USDC.").first()).toBeVisible();
});

test("ticket G I F shortcuts ignore review until Escape", async ({ page }) => {
  await page.goto("/trade", { waitUntil: "networkidle" });
  await page.getByRole("textbox", { name: "Order size in ZEC" }).fill("1");
  await page.getByRole("button", { name: "Review simulated buy" }).click();
  await expect(page.getByRole("button", { name: "Confirm simulated buy" })).toBeVisible();
  await page.keyboard.press("i");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Confirm simulated buy" })).toHaveCount(0);
  await page.getByRole("heading", { name: "Order entry" }).click();
  await expect(page.getByRole("button", { name: "GTC" })).toHaveAttribute("aria-pressed", "true");
});

test("LP empty-share copy names the selected pool", async ({ page }) => {
  await page.goto("/liquidity", { waitUntil: "networkidle" });
  await expect(page.getByText("No session LP shares in ZEC/USDC.")).toBeVisible();
  await page.getByRole("radio", { name: /ZEC\/USDT/ }).click();
  await expect(page.getByText("No session LP shares in ZEC/USDT.")).toBeVisible();
  await page.getByRole("button", { name: "Burn session shares" }).click();
  await expect(page.getByText("No session LP shares in ZEC/USDT. Burn stays idle until a local mint.").first()).toBeVisible();
});

test("LP empty-share copy clears after a mint", async ({ page }) => {
  await page.goto("/liquidity", { waitUntil: "networkidle" });
  await expect(page.getByText("No session LP shares in ZEC/USDC.")).toBeVisible();
  await page.getByRole("button", { name: "Review simulated mint" }).click();
  await page.getByRole("button", { name: "Confirm simulated mint" }).click();
  await expect(page.getByText(/Minted .* local LP shares/)).toBeVisible();
  await expect(page.getByText("No session LP shares in ZEC/USDC.")).toHaveCount(0);
});

test("ticket G I F shortcuts set time in force and ignore an open dialog", async ({ page }) => {
  await page.goto("/trade", { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Order entry" }).click();
  await expect(page.getByRole("button", { name: "GTC" })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("i");
  await expect(page.getByRole("button", { name: "IOC" })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("f");
  await expect(page.getByRole("button", { name: "FOK" })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("g");
  await expect(page.getByRole("button", { name: "GTC" })).toHaveAttribute("aria-pressed", "true");

  await page.goto("/trade?education=1", { waitUntil: "networkidle" });
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("i");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("heading", { name: "Order entry" }).click();
  await expect(page.getByRole("button", { name: "GTC" })).toHaveAttribute("aria-pressed", "true");
});

test("deposit tour walks Eligibility through Complete without a receivable address", async ({ page }) => {
  await page.goto("/trade?view=bridge", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Eligibility", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Next state" }).click();
  await expect(page.getByRole("heading", { name: "Address request", exact: true })).toBeVisible();
  await expect(page.getByText("No address generated in simulation.")).toBeVisible();
  await expect(page.getByRole("img", { name: "Placeholder QR. Not payable." })).toHaveCount(0);
  await expect(page.getByText("tex1", { exact: false })).toHaveCount(0);
  const next = page.getByRole("button", { name: "Next state" });
  for (let i = 0; i < 20; i += 1) {
    if (await page.getByRole("heading", { name: "Complete", exact: true }).isVisible()) break;
    await expect(next).toBeEnabled();
    await next.click();
  }
  await expect(page.getByRole("heading", { name: "Complete", exact: true })).toBeVisible();
  await expect(page.getByText("No native ZEC was received and nothing was minted.")).toBeVisible();
});

test("architecture incident demonstrations stay labeled copy", async ({ page }) => {
  await page.goto("/trade?view=architecture", { waitUntil: "networkidle" });
  const select = page.getByRole("combobox", { name: "Gateway incident demonstration" });
  await expect(select).toBeVisible();
  await select.selectOption({ label: "Deposit credit is paused for review." });
  await expect(page.getByText("The observed transaction has not been approved for minting.")).toBeVisible();
  await expect(page.getByText("pZEC minting")).toHaveCount(0);
  await select.selectOption({ label: "Gateway incident controls are active." });
  await expect(page.getByText("These screens are labeled demonstrations.")).toBeVisible();
  await expect(page.getByText("A previously credited Zcash deposit changed after a chain reorganization.")).toBeVisible();
});

test("education dialog and incident select keep 44px targets at 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/trade?education=1", { waitUntil: "networkidle" });
  const dialog = page.getByRole("dialog");
  const box = await dialog.boundingBox();
  expect(box, "education dialog bounding box").toBeTruthy();
  expect(box?.width ?? 0).toBeLessThanOrEqual(320);
  const continueBox = await dialog.getByRole("button", { name: "Continue" }).boundingBox();
  expect(continueBox?.height ?? 0).toBeGreaterThanOrEqual(44);
  await page.keyboard.press("Escape");
  await page.goto("/trade?view=architecture", { waitUntil: "networkidle" });
  const incident = page.getByRole("combobox", { name: "Gateway incident demonstration" });
  await incident.focus();
  await expect(incident).toBeFocused();
  const incidentBox = await incident.boundingBox();
  expect(incidentBox?.height ?? 0).toBeGreaterThanOrEqual(44);
  const overflow = await page.evaluate(() => ({
    body: document.body.scrollWidth - document.body.clientWidth,
    document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  expect(overflow).toEqual({ body: 0, document: 0 });
});

test("landing Liquidity nav selects LP and arrows move focus only", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/", { waitUntil: "networkidle" });
  await page.locator("header").getByRole("link", { name: "Liquidity" }).click();
  await expect(page).toHaveURL(/#journeys$/);
  await expect(page.getByRole("tab", { name: "LP" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("link", { name: "Preview liquidity" })).toBeVisible();
  await page.getByRole("tab", { name: "LP" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Deposit" })).toBeFocused();
  await expect(page.getByRole("tab", { name: "LP" })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("tab", { name: "Deposit" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("link", { name: "Preview deposit states" })).toBeVisible();
});

test("landing skip links follow on-page order", async ({ page }) => {
  const skipOrder = [
    { label: "Skip to main content", href: "#main-content" },
    { label: "Skip to markets", href: "#markets" },
    { label: "Skip to evidence", href: "#exists-today" },
    { label: "Skip to native pairs", href: "#pairs" },
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
  await expect(page.getByText("Illustrative market data · ZEC-USDC", { exact: true })).toBeVisible();
  await expect(page.getByText("24h figures are repository fixtures. Not a live, delayed, or production feed.")).toBeVisible();
  await page.getByRole("radio", { name: "Stale" }).click();
  await expect(page.getByText("Market data stale", { exact: true })).toHaveCount(1);
  await expect(page.getByText("24h figures stay fixture labels while market data is stale as of 2026-08-30T16:32:08Z.")).toBeVisible();
  await expect(page.getByRole("img", { name: /Delayed Illustrative/ })).toBeVisible();
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
  await expect(page.getByRole("img", { name: "Placeholder QR. Not payable." })).toBeVisible();
  await expect(page.getByText("Placeholder QR. Not payable. Visual copy of the ZIP 321 request, not a mainnet address.")).toBeVisible();
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
  const qr = page.getByRole("img", { name: "Placeholder QR. Not payable." });
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
  await expect(page.getByText("No session LP shares in ZEC/USDC. Burn stays idle until a local mint.")).toBeVisible();
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
  await page.getByRole("textbox", { name: "Order size in ZEC" }).fill("abc");
  await expect(page.getByText("Value must use plain decimal notation").first()).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Order size in ZEC" })).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByRole("button", { name: "Review simulated buy" })).toBeVisible();
  await page.getByRole("button", { name: "Review simulated buy" }).click();
  await expect(page.getByRole("button", { name: "Confirm simulated buy" })).toHaveCount(0);
});

test("USDT review does not repeat a later listing gate", async ({ page }) => {
  await page.goto("/trade", { waitUntil: "networkidle" });
  await page.getByRole("radio", { name: "ZEC / USDT" }).click();
  await page.getByRole("textbox", { name: "Order size in ZEC" }).fill("1");
  await page.getByRole("button", { name: "Review simulated buy" }).click();
  await expect(page.getByRole("button", { name: "Confirm simulated buy" })).toBeVisible();
  await expect(page.getByText("Later listing gate")).toHaveCount(0);
  await expect(page.getByText("settles ZEC-USDT")).toBeVisible();
});

test("LP pool arrows move to the USDT pair", async ({ page }) => {
  await page.goto("/liquidity", { waitUntil: "networkidle" });
  const usdc = page.getByRole("radio", { name: /ZEC \/ USDC|ZEC\/USDC/ });
  await expect(usdc).toHaveAttribute("aria-checked", "true");
  await usdc.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("radio", { name: /ZEC \/ USDT|ZEC\/USDT/ })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByText("Later listing gate")).toHaveCount(0);
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
  const settlement = page.getByRole("tab", { name: "Settlement" });
  const liquidity = page.getByRole("tab", { name: "Liquidity" });
  await trade.focus();
  await expect(trade).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowRight");
  await expect(settlement).toBeFocused();
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
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await expect(liquidity).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "Provide liquidity" })).toBeVisible();
});

test("invalid LP amount shows a field error and keeps review closed", async ({ page }) => {
  await page.goto("/liquidity", { waitUntil: "networkidle" });
  const amount = page.getByRole("textbox", { name: "ZEC liquidity amount" });
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
  const unresolvedIndex = WITHDRAWAL_TOUR.findIndex((step) => step.id === "unresolved");
  for (let index = 0; index < unresolvedIndex; index += 1) {
    await next.click();
  }
  await expect(page.getByText("Unresolved", { exact: true })).toBeVisible();
  await expect(page.getByText(WITHDRAWAL_TOUR[unresolvedIndex].body)).toBeVisible();
  await expect(page.getByText("Stub claim: unresolved. Nothing is sent.")).toBeVisible();
});

test("ticket side type and time in force arrows move focus and Enter selects", async ({ page }) => {
  await page.goto("/trade", { waitUntil: "networkidle" });
  const side = page.getByRole("group", { name: "Order side" });
  const buy = side.getByRole("button", { name: /^Buy/ });
  const sell = side.getByRole("button", { name: /^Sell/ });
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
  await expect(page.getByRole("columnheader", { name: "Fixture size ZEC" })).toBeVisible();
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
  await expect(page.getByText("settles ZEC-USDT")).toBeVisible();
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
    page.getByRole("group", { name: "Order side" }).getByRole("button", { name: /^Buy/ }),
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
  await page.getByRole("textbox", { name: "Order size in ZEC" }).fill("1");
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
  await page.getByRole("textbox", { name: "Order size in ZEC" }).fill("1");
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
  await page.getByRole("textbox", { name: "Order size in ZEC" }).fill("1");
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

  await page.getByRole("textbox", { name: "Order size in ZEC" }).fill("abc");
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
  const settlement = page.getByText("settles ZEC-USDT").first();
  await expect(settlement).toBeVisible();

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
  const pzec = page.getByRole("link", { name: "Understand native pairs" });
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
  const market = page.getByRole("list", { name: "Focused markets" }).getByRole("link", { name: /Inspect settlement|Inspect listing gate/ }).first();
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

test("trade skip links and incident skip stay 44px on desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/trade", { waitUntil: "networkidle" });
  const tradeSkips = [
    "Skip to order ticket",
    "Skip to price chart",
    "Skip to order book",
    "Skip to blotter",
    "Skip to recent trades",
  ];
  await page.keyboard.press("Tab");
  for (const label of tradeSkips) {
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: label });
    await expect(skip).toBeFocused();
    expect((await skip.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  }

  await page.goto("/trade?view=architecture", { waitUntil: "networkidle" });
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  const skipIncident = page.getByRole("link", { name: "Skip to incident demonstration" });
  await expect(skipIncident).toBeFocused();
  expect((await skipIncident.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
});

test("status legal and security skips stay 44px and skip targets keep scroll-margin", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/status", { waitUntil: "networkidle" });
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  const skipLedger = page.getByRole("link", { name: "Skip to status ledger" });
  await expect(skipLedger).toBeFocused();
  expect((await skipLedger.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  await page.keyboard.press("Enter");
  const ledger = page.locator("#status-ledger");
  await expect(ledger).toBeFocused();
  expect(await ledger.evaluate((element) => getComputedStyle(element).scrollMarginTop)).toBe("12px");

  await page.goto("/legal", { waitUntil: "networkidle" });
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  const skipLegal = page.getByRole("link", { name: "Skip to legal article" });
  await expect(skipLegal).toBeFocused();
  expect((await skipLegal.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  await page.keyboard.press("Enter");
  const legal = page.locator("#legal-article");
  await expect(legal).toBeFocused();
  expect(await legal.evaluate((element) => getComputedStyle(element).scrollMarginTop)).toBe("12px");

  await page.goto("/security", { waitUntil: "networkidle" });
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  const skipSecurity = page.getByRole("link", { name: "Skip to security article" });
  await expect(skipSecurity).toBeFocused();
  expect((await skipSecurity.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  await page.keyboard.press("Enter");
  const security = page.locator("#security-article");
  await expect(security).toBeFocused();
  expect(await security.evaluate((element) => getComputedStyle(element).scrollMarginTop)).toBe("12px");
});

test("trade and landing skip targets keep scroll-margin and landing skip links keep a focus ring", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/trade", { waitUntil: "networkidle" });
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  const skipTicket = page.getByRole("link", { name: "Skip to order ticket" });
  await expect(skipTicket).toBeFocused();
  await page.keyboard.press("Enter");
  const ticket = page.locator("#order-ticket");
  await expect(ticket).toBeFocused();
  expect(await ticket.evaluate((element) => getComputedStyle(element).scrollMarginTop)).toBe("12px");

  await page.goto("/", { waitUntil: "networkidle" });
  await page.keyboard.press("Tab");
  const skipMain = page.getByRole("link", { name: "Skip to main content" });
  await expectVisibleFocus(skipMain);
  await page.keyboard.press("Tab");
  const skipMarkets = page.getByRole("link", { name: "Skip to markets" });
  await expectVisibleFocus(skipMarkets);
  await page.keyboard.press("Enter");
  const markets = page.locator("#markets");
  await expect(markets).toBeFocused();
  expect(await markets.evaluate((element) => getComputedStyle(element).scrollMarginTop)).toBe("12px");
});

test("terminal skip-link focus ring skip-nav inset and remaining landing skip-margins", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/trade", { waitUntil: "networkidle" });
  await page.keyboard.press("Tab");
  const skipTrade = page.getByRole("link", { name: "Skip to main content" });
  await expectVisibleFocus(skipTrade);
  const tradeBox = await skipTrade.boundingBox();
  expect(tradeBox?.x ?? 0).toBeGreaterThanOrEqual(12);
  expect(tradeBox?.y ?? 0).toBeGreaterThanOrEqual(12);

  await page.goto("/", { waitUntil: "networkidle" });
  await page.keyboard.press("Tab");
  const skipLanding = page.getByRole("link", { name: "Skip to main content" });
  await expectVisibleFocus(skipLanding);
  const landingBox = await skipLanding.boundingBox();
  expect(landingBox?.x ?? 0).toBeGreaterThanOrEqual(12);
  expect(landingBox?.y ?? 0).toBeGreaterThanOrEqual(12);

  for (const skip of [
    { label: "Skip to native pairs", id: "#pairs" },
    { label: "Skip to journeys", id: "#journeys" },
    { label: "Skip to launch gates", id: "#launch-gates" },
  ] as const) {
    await page.goto("/", { waitUntil: "networkidle" });
    await page.keyboard.press("Tab");
    await tabTo(page, page.getByRole("link", { name: skip.label }));
    await page.keyboard.press("Enter");
    const target = page.locator(skip.id);
    await expect(target).toBeFocused();
    expect(await target.evaluate((element) => getComputedStyle(element).scrollMarginTop)).toBe("12px");
  }
});

test("reduced-motion keeps skip-nav in place and skip-nav stacks above the banner", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/", { waitUntil: "networkidle" });
  const skip = page.getByRole("link", { name: "Skip to main content" });
  await expect(skip).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Skip links" });
  expect(await nav.evaluate((element) => getComputedStyle(element).transform)).toBe("none");
  const box = await skip.boundingBox();
  expect(box?.y ?? -1).toBeGreaterThanOrEqual(0);
  expect(box?.y ?? 900).toBeLessThan(80);

  const stacking = await page.evaluate(() => {
    const skipNav = document.querySelector('nav[aria-label="Skip links"]');
    const banner = document.querySelector('[aria-label="Simulation disclosure"]');
    const root = skipNav?.parentElement;
    return {
      navZ: Number.parseInt(skipNav ? getComputedStyle(skipNav).zIndex : "0", 10),
      bannerZ: Number.parseInt(banner ? getComputedStyle(banner).zIndex : "0", 10) || 0,
      clipMargin: root ? getComputedStyle(root).overflowClipMargin : "",
    };
  });
  expect(stacking.navZ).toBeGreaterThan(stacking.bannerZ);
  expect(stacking.clipMargin).toMatch(/8px/);

  await page.keyboard.press("Tab");
  await expectVisibleFocus(skip);
  const focused = await skip.boundingBox();
  expect(focused?.x ?? 0).toBeGreaterThanOrEqual(0);
  expect(focused?.y ?? 0).toBeGreaterThanOrEqual(0);
});

test("terminal banner stays below skip-nav and 320px skip-nav does not cover the brand", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/trade", { waitUntil: "networkidle" });
  const tradeStacking = await page.evaluate(() => {
    const skipNav = document.querySelector('nav[aria-label="Skip links"]');
    const banner = document.querySelector('[aria-label="Simulation disclosure"]');
    return {
      navZ: Number.parseInt(skipNav ? getComputedStyle(skipNav).zIndex : "0", 10),
      bannerZ: Number.parseInt(banner ? getComputedStyle(banner).zIndex : "0", 10) || 0,
    };
  });
  expect(tradeStacking.navZ).toBeGreaterThan(tradeStacking.bannerZ);

  await page.setViewportSize({ width: 320, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/", { waitUntil: "networkidle" });
  const brand = page.getByRole("link", { name: "Phlebas home" });
  const skip = page.getByRole("link", { name: "Skip to main content" });
  await expect(brand).toBeVisible();
  const brandBox = await brand.boundingBox();
  const skipBox = await skip.boundingBox();
  const overlaps = Boolean(
    skipBox && brandBox
    && skipBox.x < brandBox.x + brandBox.width
    && skipBox.x + skipBox.width > brandBox.x
    && skipBox.y < brandBox.y + brandBox.height
    && skipBox.y + skipBox.height > brandBox.y
    && skipBox.width > 2
    && skipBox.height > 2,
  );
  expect(overlaps).toBe(false);

  await page.keyboard.press("Tab");
  await expectVisibleFocus(skip);
  const focused = await skip.boundingBox();
  expect(focused?.x ?? -1).toBeGreaterThanOrEqual(0);
  expect(focused?.y ?? -1).toBeGreaterThanOrEqual(0);
  expect((focused?.x ?? 0) + (focused?.width ?? 0)).toBeLessThanOrEqual(320);
  expect((focused?.y ?? 0) + (focused?.height ?? 0)).toBeLessThanOrEqual(900);
});

test("focused skip-nav does not cover banner copy and restores 44px skip links at 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/", { waitUntil: "networkidle" });
  const brand = page.getByRole("link", { name: "Phlebas home" });
  await expect(brand).toBeVisible();
  expect((await brand.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);

  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to main content" });
  await expectVisibleFocus(skip);
  expect((await skip.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);

  const navBox = await page.getByRole("navigation", { name: "Skip links" }).boundingBox();
  const bannerBox = await page.getByRole("status", { name: "Simulation disclosure" }).boundingBox();
  expect((navBox?.y ?? 0) + (navBox?.height ?? 0)).toBeLessThanOrEqual((bannerBox?.y ?? 0) + 1);
});

test("focused skip-nav wraps at 320px, leaves the terminal brand clear, and hides after skip", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/", { waitUntil: "networkidle" });

  await page.keyboard.press("Tab");
  const landingSkip = page.getByRole("link", { name: "Skip to main content" });
  await expectVisibleFocus(landingSkip);
  expect((await landingSkip.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);

  const landingNav = page.getByRole("navigation", { name: "Skip links" });
  const landingLayout = await landingNav.evaluate((element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return {
      direction: style.flexDirection,
      wrap: style.flexWrap,
      height: rect.height,
    };
  });
  expect(landingLayout.direction).toBe("row");
  expect(landingLayout.wrap).toBe("wrap");
  expect(landingLayout.height).toBeLessThan(280);

  await page.keyboard.press("Enter");
  await expect(page.locator("main#main-content")).toBeFocused();
  const landingHidden = await landingNav.evaluate((element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return {
      clip: style.clipPath,
      width: rect.width,
      height: rect.height,
      focusWithin: element.matches(":focus-within"),
    };
  });
  expect(landingHidden.focusWithin).toBe(false);
  expect(landingHidden.clip).toMatch(/inset\(50%\)/);
  expect(landingHidden.width).toBeLessThan(8);
  expect(landingHidden.height).toBeLessThan(8);

  await page.goto("/trade", { waitUntil: "networkidle" });
  await page.keyboard.press("Tab");
  const tradeSkip = page.getByRole("link", { name: "Skip to main content" });
  await expectVisibleFocus(tradeSkip);

  const tradeNav = page.getByRole("navigation", { name: "Skip links" });
  const tradeNavBox = await tradeNav.boundingBox();
  const brandBox = await page.getByRole("link", { name: "Phlebas home" }).boundingBox();
  expect(tradeNavBox?.height ?? 900).toBeLessThan(280);
  expect((tradeNavBox?.y ?? 0) + (tradeNavBox?.height ?? 0)).toBeLessThanOrEqual((brandBox?.y ?? 0) + 1);

  await page.keyboard.press("Enter");
  await expect(page.locator("main#main-content")).toBeFocused();
  const tradeHidden = await tradeNav.evaluate((element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return {
      clip: style.clipPath,
      width: rect.width,
      height: rect.height,
      focusWithin: element.matches(":focus-within"),
    };
  });
  expect(tradeHidden.focusWithin).toBe(false);
  expect(tradeHidden.clip).toMatch(/inset\(50%\)/);
  expect(tradeHidden.width).toBeLessThan(8);
  expect(tradeHidden.height).toBeLessThan(8);
});

test("skip-link focus-visible wrap stays 44px and the 320px skip-nav does not clip the ring", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/", { waitUntil: "networkidle" });
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to main content" });
  await expectVisibleFocus(skip);

  const skipStyle = await skip.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      outlineWidth: style.outlineWidth,
      outlineStyle: style.outlineStyle,
      outlineOffset: style.outlineOffset,
      minHeight: style.minHeight,
      whiteSpace: style.whiteSpace,
    };
  });
  expect(skipStyle.outlineWidth).toBe("2px");
  expect(skipStyle.outlineStyle).toBe("solid");
  expect(skipStyle.outlineOffset).toBe("2px");
  expect(Number.parseFloat(skipStyle.minHeight)).toBeGreaterThanOrEqual(44);
  expect(skipStyle.whiteSpace).toBe("normal");

  const nav = page.getByRole("navigation", { name: "Skip links" });
  const navBox = await nav.boundingBox();
  expect(navBox?.x ?? -1).toBeGreaterThanOrEqual(0);
  expect((navBox?.x ?? 0) + (navBox?.width ?? 0)).toBeLessThanOrEqual(320);

  await tabTo(page, page.getByRole("link", { name: "Skip to terminal preview" }));
  const longSkip = page.getByRole("link", { name: "Skip to terminal preview" });
  await expectVisibleFocus(longSkip);
  expect((await longSkip.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);

  const ring = await longSkip.evaluate((element) => {
    const style = getComputedStyle(element);
    const parent = element.parentElement;
    const parentRect = parent?.getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    const extent = (Number.parseFloat(style.outlineWidth) || 0) + (Number.parseFloat(style.outlineOffset) || 0);
    return {
      left: rect.left - extent,
      right: rect.right + extent,
      parentLeft: parentRect?.left ?? 0,
      parentRight: parentRect?.right ?? 0,
    };
  });
  expect(ring.left).toBeGreaterThanOrEqual(ring.parentLeft - 0.5);
  expect(ring.right).toBeLessThanOrEqual(ring.parentRight + 0.5);

  await page.goto("/trade", { waitUntil: "networkidle" });
  await page.keyboard.press("Tab");
  const tradeSkip = page.getByRole("link", { name: "Skip to main content" });
  await expectVisibleFocus(tradeSkip);
  const tradeNavBox = await page.getByRole("navigation", { name: "Skip links" }).boundingBox();
  expect(tradeNavBox?.x ?? -1).toBeGreaterThanOrEqual(0);
  expect((tradeNavBox?.x ?? 0) + (tradeNavBox?.width ?? 0)).toBeLessThanOrEqual(320);
  expect((await tradeSkip.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
});

test("skip-nav keeps wrapped line-height, 390px two-up ring, gutter, and header clearance", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/", { waitUntil: "networkidle" });
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to main content" });
  await expectVisibleFocus(skip);

  const skipStyle = await skip.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      lineHeight: Number.parseFloat(style.lineHeight),
      fontSize: Number.parseFloat(style.fontSize),
      minHeight: Number.parseFloat(style.minHeight),
      minWidth: Number.parseFloat(style.minWidth),
      outlineColor: style.outlineColor,
    };
  });
  expect(skipStyle.lineHeight).toBeGreaterThanOrEqual(skipStyle.fontSize * 1.25);
  expect(skipStyle.minHeight).toBeGreaterThanOrEqual(44);
  expect(skipStyle.minWidth).toBeGreaterThanOrEqual(44);
  expect(skipStyle.outlineColor).toBe("rgb(21, 20, 13)");

  const nav = page.getByRole("navigation", { name: "Skip links" });
  expect(await nav.evaluate((element) => getComputedStyle(element).scrollbarGutter)).toBe("stable");
  expect(await nav.evaluate((element) => getComputedStyle(element).overflowY)).toBe("auto");

  await tabTo(page, page.getByRole("link", { name: "Skip to terminal preview" }));
  const longSkip = page.getByRole("link", { name: "Skip to terminal preview" });
  await expectVisibleFocus(longSkip);
  expect((await longSkip.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);

  const verticalRing = await longSkip.evaluate((element) => {
    const style = getComputedStyle(element);
    const parent = element.parentElement;
    const parentRect = parent?.getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    const extent = (Number.parseFloat(style.outlineWidth) || 0) + (Number.parseFloat(style.outlineOffset) || 0);
    return {
      top: rect.top - extent,
      bottom: rect.bottom + extent,
      parentTop: parentRect?.top ?? 0,
      parentBottom: parentRect?.bottom ?? 0,
    };
  });
  expect(verticalRing.top).toBeGreaterThanOrEqual(verticalRing.parentTop - 0.5);
  expect(verticalRing.bottom).toBeLessThanOrEqual(verticalRing.parentBottom + 0.5);

  const navBox = await nav.boundingBox();
  const headerBox = await page.locator("header").boundingBox();
  expect((navBox?.y ?? 0) + (navBox?.height ?? 0)).toBeLessThanOrEqual((headerBox?.y ?? 0) + 1);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/", { waitUntil: "networkidle" });
  await page.keyboard.press("Tab");
  const skip390 = page.getByRole("link", { name: "Skip to main content" });
  await expectVisibleFocus(skip390);
  const layout390 = await nav.evaluate((element) => {
    const style = getComputedStyle(element);
    const links = [...element.querySelectorAll("a")].slice(0, 2).map((link) => link.getBoundingClientRect());
    return {
      wrap: style.flexWrap,
      direction: style.flexDirection,
      overflowY: style.overflowY,
      firstTop: links[0]?.top ?? 0,
      secondTop: links[1]?.top ?? 0,
      firstRight: links[0]?.right ?? 0,
      secondLeft: links[1]?.left ?? 0,
    };
  });
  expect(layout390.direction).toBe("row");
  expect(layout390.wrap).toBe("wrap");
  expect(layout390.overflowY).toBe("auto");
  expect(Math.abs(layout390.firstTop - layout390.secondTop)).toBeLessThan(2);
  expect(layout390.secondLeft).toBeGreaterThan(layout390.firstRight);

  const ring390 = await skip390.evaluate((element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    const extent = (Number.parseFloat(style.outlineWidth) || 0) + (Number.parseFloat(style.outlineOffset) || 0);
    return {
      left: rect.left - extent,
      right: rect.right + extent,
      top: rect.top - extent,
      bottom: rect.bottom + extent,
      color: style.outlineColor,
    };
  });
  expect(ring390.color).toBe("rgb(21, 20, 13)");
  expect(ring390.left).toBeGreaterThanOrEqual(-0.5);
  expect(ring390.top).toBeGreaterThanOrEqual(-0.5);
  expect(ring390.right).toBeLessThanOrEqual(390.5);
  expect(ring390.bottom).toBeLessThanOrEqual(844.5);
  expect((await skip390.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);

  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/", { waitUntil: "networkidle" });
  await page.keyboard.press("Tab");
  const motionSkip = page.getByRole("link", { name: "Skip to main content" });
  await expectVisibleFocus(motionSkip);
  const motionNav = page.getByRole("navigation", { name: "Skip links" });
  expect(await motionNav.evaluate((element) => getComputedStyle(element).overflowY)).toBe("auto");
  const motionRing = await motionSkip.evaluate((element) => {
    const style = getComputedStyle(element);
    const parent = element.parentElement;
    const parentRect = parent?.getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    const extent = (Number.parseFloat(style.outlineWidth) || 0) + (Number.parseFloat(style.outlineOffset) || 0);
    return {
      left: rect.left - extent,
      right: rect.right + extent,
      top: rect.top - extent,
      bottom: rect.bottom + extent,
      parentLeft: parentRect?.left ?? 0,
      parentRight: parentRect?.right ?? 0,
      parentTop: parentRect?.top ?? 0,
      parentBottom: parentRect?.bottom ?? 0,
    };
  });
  expect(motionRing.left).toBeGreaterThanOrEqual(motionRing.parentLeft - 0.5);
  expect(motionRing.right).toBeLessThanOrEqual(motionRing.parentRight + 0.5);
  expect(motionRing.top).toBeGreaterThanOrEqual(motionRing.parentTop - 0.5);
  expect(motionRing.bottom).toBeLessThanOrEqual(motionRing.parentBottom + 0.5);
});

test("skip-nav two-up at 768 and 390 keeps 44px links, wrap, gutter, and Menu clear", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/", { waitUntil: "networkidle" });
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to main content" });
  await expectVisibleFocus(skip);

  const nav = page.getByRole("navigation", { name: "Skip links" });
  const layout768 = await nav.evaluate((element) => {
    const style = getComputedStyle(element);
    const links = [...element.querySelectorAll("a")];
    const first = links[0]?.getBoundingClientRect();
    const second = links[1]?.getBoundingClientRect();
    return {
      wrap: style.flexWrap,
      direction: style.flexDirection,
      alignItems: style.alignItems,
      columnGap: style.columnGap,
      overflowWrap: links[0] ? getComputedStyle(links[0]).overflowWrap : "",
      minWidth: links[0] ? Number.parseFloat(getComputedStyle(links[0]).minWidth) : 0,
      firstHeight: first?.height ?? 0,
      secondHeight: second?.height ?? 0,
      firstTop: first?.top ?? 0,
      secondTop: second?.top ?? 0,
      firstRight: first?.right ?? 0,
      secondLeft: second?.left ?? 0,
      secondRight: second?.right ?? 0,
      navRight: element.getBoundingClientRect().right,
    };
  });
  expect(layout768.direction).toBe("row");
  expect(layout768.wrap).toBe("wrap");
  expect(layout768.alignItems).toBe("stretch");
  expect(layout768.columnGap).toBe("8px");
  expect(layout768.overflowWrap).toMatch(/anywhere|break-word/);
  expect(layout768.minWidth).toBeGreaterThanOrEqual(44);
  expect(layout768.firstHeight).toBeGreaterThanOrEqual(44);
  expect(layout768.secondHeight).toBeGreaterThanOrEqual(44);
  expect(Math.abs(layout768.firstHeight - layout768.secondHeight)).toBeLessThan(1);
  expect(Math.abs(layout768.firstTop - layout768.secondTop)).toBeLessThan(2);
  expect(layout768.secondLeft).toBeGreaterThan(layout768.firstRight);
  expect(layout768.secondRight).toBeLessThanOrEqual(layout768.navRight + 0.5);

  const ring768 = await skip.evaluate((element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    const extent = (Number.parseFloat(style.outlineWidth) || 0) + (Number.parseFloat(style.outlineOffset) || 0);
    return {
      left: rect.left - extent,
      right: rect.right + extent,
      top: rect.top - extent,
      bottom: rect.bottom + extent,
    };
  });
  expect(ring768.left).toBeGreaterThanOrEqual(-0.5);
  expect(ring768.top).toBeGreaterThanOrEqual(-0.5);
  expect(ring768.right).toBeLessThanOrEqual(768.5);
  expect(ring768.bottom).toBeLessThanOrEqual(1024.5);

  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/", { waitUntil: "networkidle" });
  await page.keyboard.press("Tab");
  await expectVisibleFocus(skip);
  const navBox = await nav.boundingBox();
  const menuBox = await page.getByRole("button", { name: "Menu" }).boundingBox();
  expect((navBox?.y ?? 0) + (navBox?.height ?? 0)).toBeLessThanOrEqual((menuBox?.y ?? 0) + 1);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/trade", { waitUntil: "networkidle" });
  await page.keyboard.press("Tab");
  const tradeSkip = page.getByRole("link", { name: "Skip to main content" });
  await expectVisibleFocus(tradeSkip);
  const tradeNav = page.getByRole("navigation", { name: "Skip links" });
  const tradeLayout = await tradeNav.evaluate((element) => {
    const links = [...element.querySelectorAll("a")].slice(0, 2).map((link) => link.getBoundingClientRect());
    const style = getComputedStyle(element);
    return {
      wrap: style.flexWrap,
      direction: style.flexDirection,
      firstTop: links[0]?.top ?? 0,
      secondTop: links[1]?.top ?? 0,
      firstRight: links[0]?.right ?? 0,
      secondLeft: links[1]?.left ?? 0,
      firstHeight: links[0]?.height ?? 0,
      secondHeight: links[1]?.height ?? 0,
    };
  });
  expect(tradeLayout.direction).toBe("row");
  expect(tradeLayout.wrap).toBe("wrap");
  expect(Math.abs(tradeLayout.firstTop - tradeLayout.secondTop)).toBeLessThan(2);
  expect(tradeLayout.secondLeft).toBeGreaterThan(tradeLayout.firstRight);
  expect(tradeLayout.firstHeight).toBeGreaterThanOrEqual(44);
  expect(tradeLayout.secondHeight).toBeGreaterThanOrEqual(44);
  expect(Math.abs(tradeLayout.firstHeight - tradeLayout.secondHeight)).toBeLessThan(1);

  const tradeRing = await tradeSkip.evaluate((element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    const extent = (Number.parseFloat(style.outlineWidth) || 0) + (Number.parseFloat(style.outlineOffset) || 0);
    return {
      left: rect.left - extent,
      right: rect.right + extent,
      top: rect.top - extent,
      bottom: rect.bottom + extent,
      color: style.outlineColor,
    };
  });
  expect(tradeRing.color).toBe("rgb(21, 20, 13)");
  expect(tradeRing.left).toBeGreaterThanOrEqual(-0.5);
  expect(tradeRing.top).toBeGreaterThanOrEqual(-0.5);
  expect(tradeRing.right).toBeLessThanOrEqual(390.5);
  expect(tradeRing.bottom).toBeLessThanOrEqual(844.5);
});

test("skip-nav row-gap leftover 768 brand legal two-up and banner stacking", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/", { waitUntil: "networkidle" });
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to main content" });
  await expectVisibleFocus(skip);

  const nav = page.getByRole("navigation", { name: "Skip links" });
  const landingLayout = await nav.evaluate((element) => {
    const style = getComputedStyle(element);
    const links = [...element.querySelectorAll("a")];
    const first = links[0]?.getBoundingClientRect();
    const third = links[2]?.getBoundingClientRect();
    const last = links[links.length - 1]?.getBoundingClientRect();
    const banner = document.querySelector('[aria-label="Simulation disclosure"]');
    return {
      rowGap: style.rowGap,
      navZ: Number.parseInt(style.zIndex, 10) || 0,
      bannerZ: Number.parseInt(banner ? getComputedStyle(banner).zIndex : "0", 10) || 0,
      padding: links[0] ? getComputedStyle(links[0]).paddingTop : "",
      minWidth: links[0] ? Number.parseFloat(getComputedStyle(links[0]).minWidth) : 0,
      firstBottom: first?.bottom ?? 0,
      thirdTop: third?.top ?? 0,
      lastWidth: last?.width ?? 0,
      lastHeight: last?.height ?? 0,
    };
  });
  expect(landingLayout.rowGap).toBe("8px");
  expect(landingLayout.navZ).toBeGreaterThan(landingLayout.bannerZ);
  expect(landingLayout.padding).toBe("8px");
  expect(landingLayout.minWidth).toBeGreaterThanOrEqual(44);
  expect(landingLayout.lastWidth).toBeGreaterThanOrEqual(44);
  expect(landingLayout.lastHeight).toBeGreaterThanOrEqual(44);
  expect(landingLayout.firstBottom + 4).toBeLessThanOrEqual(landingLayout.thirdTop - 4 + 0.5);

  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto("/", { waitUntil: "networkidle" });
  await page.keyboard.press("Tab");
  await expectVisibleFocus(skip);
  const navBox = await nav.boundingBox();
  const brandBox = await page.getByRole("link", { name: "Phlebas home" }).boundingBox();
  expect((navBox?.y ?? 0) + (navBox?.height ?? 0)).toBeLessThanOrEqual((brandBox?.y ?? 0) + 1);

  await page.goto("/trade", { waitUntil: "networkidle" });
  await page.keyboard.press("Tab");
  const tradeSkip = page.getByRole("link", { name: "Skip to main content" });
  await expectVisibleFocus(tradeSkip);
  const tradeNav = page.getByRole("navigation", { name: "Skip links" });
  const trade768 = await tradeNav.evaluate((element) => {
    const links = [...element.querySelectorAll("a")].slice(0, 2).map((link) => link.getBoundingClientRect());
    const style = getComputedStyle(element);
    const first = links[0];
    return {
      wrap: style.flexWrap,
      direction: style.flexDirection,
      firstTop: links[0]?.top ?? 0,
      secondTop: links[1]?.top ?? 0,
      firstRight: links[0]?.right ?? 0,
      secondLeft: links[1]?.left ?? 0,
      firstHeight: links[0]?.height ?? 0,
      secondHeight: links[1]?.height ?? 0,
      ringLeft: (first?.left ?? 0) - 4,
      ringRight: (first?.right ?? 0) + 4,
      ringTop: (first?.top ?? 0) - 4,
      ringBottom: (first?.bottom ?? 0) + 4,
    };
  });
  expect(trade768.direction).toBe("row");
  expect(trade768.wrap).toBe("wrap");
  expect(Math.abs(trade768.firstTop - trade768.secondTop)).toBeLessThan(2);
  expect(trade768.secondLeft).toBeGreaterThan(trade768.firstRight);
  expect(trade768.firstHeight).toBeGreaterThanOrEqual(44);
  expect(trade768.secondHeight).toBeGreaterThanOrEqual(44);
  expect(trade768.ringLeft).toBeGreaterThanOrEqual(-0.5);
  expect(trade768.ringTop).toBeGreaterThanOrEqual(-0.5);
  expect(trade768.ringRight).toBeLessThanOrEqual(768.5);
  expect(trade768.ringBottom).toBeLessThanOrEqual(1024.5);

  for (const path of ["/legal", "/security"] as const) {
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto(path, { waitUntil: "networkidle" });
    await page.keyboard.press("Tab");
    const frameSkip = page.getByRole("link", { name: "Skip to main content" });
    await expectVisibleFocus(frameSkip);
    const frameNav = page.getByRole("navigation", { name: "Skip links" });
    const frameLayout = await frameNav.evaluate((element) => {
      const links = [...element.querySelectorAll("a")].map((link) => link.getBoundingClientRect());
      const style = getComputedStyle(element);
      return {
        wrap: style.flexWrap,
        direction: style.flexDirection,
        count: links.length,
        firstTop: links[0]?.top ?? 0,
        secondTop: links[1]?.top ?? 0,
        firstRight: links[0]?.right ?? 0,
        secondLeft: links[1]?.left ?? 0,
        firstWidth: links[0]?.width ?? 0,
        secondWidth: links[1]?.width ?? 0,
        firstHeight: links[0]?.height ?? 0,
        secondHeight: links[1]?.height ?? 0,
      };
    });
    expect(frameLayout.count).toBe(2);
    expect(frameLayout.direction).toBe("row");
    expect(frameLayout.wrap).toBe("wrap");
    expect(Math.abs(frameLayout.firstTop - frameLayout.secondTop)).toBeLessThan(2);
    expect(frameLayout.secondLeft).toBeGreaterThan(frameLayout.firstRight);
    expect(frameLayout.firstWidth).toBeGreaterThanOrEqual(44);
    expect(frameLayout.secondWidth).toBeGreaterThanOrEqual(44);
    expect(frameLayout.firstHeight).toBeGreaterThanOrEqual(44);
    expect(frameLayout.secondHeight).toBeGreaterThanOrEqual(44);
  }
});

test("skip-nav column-gap status liquidity leftover 768 Menu and security wrap", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/", { waitUntil: "networkidle" });
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to main content" });
  await expectVisibleFocus(skip);

  const nav = page.getByRole("navigation", { name: "Skip links" });
  const landingLayout = await nav.evaluate((element) => {
    const style = getComputedStyle(element);
    const links = [...element.querySelectorAll("a")];
    const first = links[0]?.getBoundingClientRect();
    const second = links[1]?.getBoundingClientRect();
    return {
      columnGap: style.columnGap,
      minHeight: links[0] ? Number.parseFloat(getComputedStyle(links[0]).minHeight) : 0,
      padding: links[0] ? getComputedStyle(links[0]).paddingTop : "",
      firstRight: first?.right ?? 0,
      secondLeft: second?.left ?? 0,
      firstHeight: first?.height ?? 0,
    };
  });
  expect(landingLayout.columnGap).toBe("8px");
  expect(landingLayout.minHeight).toBeGreaterThanOrEqual(44);
  expect(landingLayout.padding).toBe("8px");
  expect(landingLayout.firstHeight).toBeGreaterThanOrEqual(44);
  expect(landingLayout.firstRight + 4).toBeLessThanOrEqual(landingLayout.secondLeft - 4 + 0.5);

  const navBox = await nav.boundingBox();
  const headerBox = await page.locator("header").boundingBox();
  expect((navBox?.y ?? 0) + (navBox?.height ?? 0)).toBeLessThanOrEqual((headerBox?.y ?? 0) + 1);

  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto("/", { waitUntil: "networkidle" });
  await page.keyboard.press("Tab");
  await expectVisibleFocus(skip);
  const nav768 = await nav.boundingBox();
  const menuBox = await page.getByRole("button", { name: "Menu" }).boundingBox();
  expect((nav768?.y ?? 0) + (nav768?.height ?? 0)).toBeLessThanOrEqual((menuBox?.y ?? 0) + 1);

  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/status", { waitUntil: "networkidle" });
  await page.keyboard.press("Tab");
  const statusSkip = page.getByRole("link", { name: "Skip to main content" });
  await expectVisibleFocus(statusSkip);
  const statusNav = page.getByRole("navigation", { name: "Skip links" });
  const statusLayout = await statusNav.evaluate((element) => {
    const links = [...element.querySelectorAll("a")].map((link) => link.getBoundingClientRect());
    const style = getComputedStyle(element);
    return {
      wrap: style.flexWrap,
      direction: style.flexDirection,
      count: links.length,
      firstTop: links[0]?.top ?? 0,
      secondTop: links[1]?.top ?? 0,
      firstRight: links[0]?.right ?? 0,
      secondLeft: links[1]?.left ?? 0,
      firstHeight: links[0]?.height ?? 0,
      secondHeight: links[1]?.height ?? 0,
    };
  });
  expect(statusLayout.count).toBe(2);
  expect(statusLayout.direction).toBe("row");
  expect(statusLayout.wrap).toBe("wrap");
  expect(Math.abs(statusLayout.firstTop - statusLayout.secondTop)).toBeLessThan(2);
  expect(statusLayout.secondLeft).toBeGreaterThan(statusLayout.firstRight);
  expect(statusLayout.firstHeight).toBeGreaterThanOrEqual(44);
  expect(statusLayout.secondHeight).toBeGreaterThanOrEqual(44);

  await page.goto("/liquidity", { waitUntil: "networkidle" });
  await page.keyboard.press("Tab");
  const lpSkip = page.getByRole("link", { name: "Skip to main content" });
  await expectVisibleFocus(lpSkip);
  const lpNav = page.getByRole("navigation", { name: "Skip links" });
  const lpLayout = await lpNav.evaluate((element) => {
    const links = [...element.querySelectorAll("a")];
    const last = links[links.length - 1]?.getBoundingClientRect();
    return {
      count: links.length,
      lastWidth: last?.width ?? 0,
      lastHeight: last?.height ?? 0,
    };
  });
  expect(lpLayout.count).toBe(3);
  expect(lpLayout.lastWidth).toBeGreaterThanOrEqual(44);
  expect(lpLayout.lastHeight).toBeGreaterThanOrEqual(44);

  await page.goto("/security", { waitUntil: "networkidle" });
  await page.keyboard.press("Tab");
  await tabTo(page, page.getByRole("link", { name: "Skip to security article" }));
  const securitySkip = page.getByRole("link", { name: "Skip to security article" });
  await expectVisibleFocus(securitySkip);
  const wrap = await securitySkip.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      overflowWrap: style.overflowWrap,
      wordBreak: style.wordBreak,
      scrollOverflow: element.scrollWidth - element.clientWidth,
      minWidth: Number.parseFloat(style.minWidth),
      minHeight: Number.parseFloat(style.minHeight),
    };
  });
  expect(wrap.overflowWrap).toMatch(/anywhere|break-word/);
  expect(["break-word", "normal"]).toContain(wrap.wordBreak);
  expect(wrap.scrollOverflow).toBeLessThanOrEqual(1);
  expect(wrap.minWidth).toBeGreaterThanOrEqual(44);
  expect(wrap.minHeight).toBeGreaterThanOrEqual(44);
});

test("skip-nav 404 loading bridge leftover architecture 320 and status 768", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/", { waitUntil: "networkidle" });
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to main content" });
  await expectVisibleFocus(skip);
  const nav = page.getByRole("navigation", { name: "Skip links" });
  const gutterLayout = await nav.evaluate((element) => {
    const links = [...element.querySelectorAll("a")].slice(0, 2).map((link) => {
      const rect = link.getBoundingClientRect();
      const style = getComputedStyle(link);
      return {
        width: rect.width,
        height: rect.height,
        minWidth: Number.parseFloat(style.minWidth),
        scrollOverflow: link.scrollWidth - link.clientWidth,
      };
    });
    return {
      scrollbarGutter: getComputedStyle(element).scrollbarGutter,
      first: links[0],
      second: links[1],
    };
  });
  expect(gutterLayout.scrollbarGutter).toBe("stable");
  expect(gutterLayout.first?.minWidth ?? 0).toBeGreaterThanOrEqual(44);
  expect(gutterLayout.first?.width ?? 0).toBeGreaterThanOrEqual(44);
  expect(gutterLayout.second?.width ?? 0).toBeGreaterThanOrEqual(44);
  expect(gutterLayout.first?.height ?? 0).toBeGreaterThanOrEqual(44);
  expect(gutterLayout.first?.scrollOverflow ?? 1).toBeLessThanOrEqual(1);
  expect(gutterLayout.second?.scrollOverflow ?? 1).toBeLessThanOrEqual(1);

  async function expectTwoUp(path: string, leftover?: { count: number }) {
    await page.goto(path, { waitUntil: "networkidle" });
    await page.keyboard.press("Tab");
    const pathSkip = page.getByRole("link", { name: "Skip to main content" });
    await expectVisibleFocus(pathSkip);
    const pathNav = page.getByRole("navigation", { name: "Skip links" });
    const layout = await pathNav.evaluate((element) => {
      const links = [...element.querySelectorAll("a")].map((link) => link.getBoundingClientRect());
      const style = getComputedStyle(element);
      const first = links[0];
      return {
        wrap: style.flexWrap,
        direction: style.flexDirection,
        count: links.length,
        firstTop: first?.top ?? 0,
        secondTop: links[1]?.top ?? 0,
        firstRight: first?.right ?? 0,
        secondLeft: links[1]?.left ?? 0,
        firstWidth: first?.width ?? 0,
        secondWidth: links[1]?.width ?? 0,
        lastWidth: links[links.length - 1]?.width ?? 0,
        lastHeight: links[links.length - 1]?.height ?? 0,
        ringLeft: (first?.left ?? 0) - 4,
        ringRight: (first?.right ?? 0) + 4,
        ringTop: (first?.top ?? 0) - 4,
        ringBottom: (first?.bottom ?? 0) + 4,
      };
    });
    expect(layout.direction).toBe("row");
    expect(layout.wrap).toBe("wrap");
    expect(layout.firstWidth).toBeGreaterThanOrEqual(44);
    expect(layout.secondWidth).toBeGreaterThanOrEqual(44);
    expect(Math.abs(layout.firstTop - layout.secondTop)).toBeLessThan(2);
    expect(layout.secondLeft).toBeGreaterThan(layout.firstRight);
    expect(layout.ringLeft).toBeGreaterThanOrEqual(-0.5);
    expect(layout.ringTop).toBeGreaterThanOrEqual(-0.5);
    expect(layout.ringRight).toBeLessThanOrEqual(320.5);
    expect(layout.ringBottom).toBeLessThanOrEqual(900.5);
    if (leftover) {
      expect(layout.count).toBe(leftover.count);
      expect(layout.lastWidth).toBeGreaterThanOrEqual(44);
      expect(layout.lastHeight).toBeGreaterThanOrEqual(44);
    }
  }

  await expectTwoUp("/this-route-is-not-part-of-the-simulation");
  await expectTwoUp("/trade?loading=1");
  await expectTwoUp("/trade?view=bridge", { count: 3 });
  await expectTwoUp("/trade?view=architecture");

  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto("/status", { waitUntil: "networkidle" });
  await page.keyboard.press("Tab");
  const statusSkip = page.getByRole("link", { name: "Skip to main content" });
  await expectVisibleFocus(statusSkip);
  const statusNav = page.getByRole("navigation", { name: "Skip links" });
  const status768 = await statusNav.evaluate((element) => {
    const links = [...element.querySelectorAll("a")].map((link) => link.getBoundingClientRect());
    const style = getComputedStyle(element);
    const first = links[0];
    return {
      wrap: style.flexWrap,
      direction: style.flexDirection,
      firstTop: first?.top ?? 0,
      secondTop: links[1]?.top ?? 0,
      firstRight: first?.right ?? 0,
      secondLeft: links[1]?.left ?? 0,
      firstHeight: first?.height ?? 0,
      secondHeight: links[1]?.height ?? 0,
      ringLeft: (first?.left ?? 0) - 4,
      ringRight: (first?.right ?? 0) + 4,
      ringTop: (first?.top ?? 0) - 4,
      ringBottom: (first?.bottom ?? 0) + 4,
    };
  });
  expect(status768.direction).toBe("row");
  expect(status768.wrap).toBe("wrap");
  expect(Math.abs(status768.firstTop - status768.secondTop)).toBeLessThan(2);
  expect(status768.secondLeft).toBeGreaterThan(status768.firstRight);
  expect(status768.firstHeight).toBeGreaterThanOrEqual(44);
  expect(status768.secondHeight).toBeGreaterThanOrEqual(44);
  expect(status768.ringLeft).toBeGreaterThanOrEqual(-0.5);
  expect(status768.ringTop).toBeGreaterThanOrEqual(-0.5);
  expect(status768.ringRight).toBeLessThanOrEqual(768.5);
  expect(status768.ringBottom).toBeLessThanOrEqual(1024.5);
});

test("skip-nav error country-block architecture leftover and 768 loading 404 bridge", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });

  async function expectTwoUp(path: string, viewportWidth: number, viewportHeight: number) {
    await page.setViewportSize({ width: viewportWidth, height: viewportHeight });
    await page.goto(path, { waitUntil: "networkidle" });
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to main content" });
    await expectVisibleFocus(skip);
    const nav = page.getByRole("navigation", { name: "Skip links" });
    const layout = await nav.evaluate((element) => {
      const links = [...element.querySelectorAll("a")].map((link) => link.getBoundingClientRect());
      const style = getComputedStyle(element);
      const first = links[0];
      return {
        wrap: style.flexWrap,
        direction: style.flexDirection,
        minWidth: Number.parseFloat(getComputedStyle(element.querySelector("a") ?? element).minWidth),
        count: links.length,
        firstTop: first?.top ?? 0,
        secondTop: links[1]?.top ?? 0,
        firstRight: first?.right ?? 0,
        secondLeft: links[1]?.left ?? 0,
        widths: links.map((link) => link.width),
        heights: links.map((link) => link.height),
        ringLeft: (first?.left ?? 0) - 4,
        ringRight: (first?.right ?? 0) + 4,
        ringTop: (first?.top ?? 0) - 4,
        ringBottom: (first?.bottom ?? 0) + 4,
      };
    });
    expect(layout.direction).toBe("row");
    expect(layout.wrap).toBe("wrap");
    expect(layout.minWidth).toBeGreaterThanOrEqual(44);
    expect(layout.count).toBeGreaterThanOrEqual(2);
    expect(Math.abs(layout.firstTop - layout.secondTop)).toBeLessThan(2);
    expect(layout.secondLeft).toBeGreaterThan(layout.firstRight);
    for (const width of layout.widths) {
      expect(width).toBeGreaterThanOrEqual(44);
    }
    for (const height of layout.heights) {
      expect(height).toBeGreaterThanOrEqual(44);
    }
    expect(layout.ringLeft).toBeGreaterThanOrEqual(-0.5);
    expect(layout.ringTop).toBeGreaterThanOrEqual(-0.5);
    expect(layout.ringRight).toBeLessThanOrEqual(viewportWidth + 0.5);
    expect(layout.ringBottom).toBeLessThanOrEqual(viewportHeight + 0.5);
    return layout;
  }

  const errorLayout = await expectTwoUp("/trade?error=1", 320, 900);
  expect(errorLayout.count).toBe(2);

  const blockedLayout = await expectTwoUp("/trade?access=blocked", 320, 900);
  expect(blockedLayout.count).toBe(2);

  const architecture390 = await expectTwoUp("/trade?view=architecture", 390, 844);
  expect(architecture390.count).toBe(4);
  expect(architecture390.widths[architecture390.widths.length - 1] ?? 0).toBeGreaterThanOrEqual(44);

  await expectTwoUp("/trade?loading=1", 768, 1024);
  await expectTwoUp("/this-route-is-not-part-of-the-simulation", 768, 1024);
  const bridge768 = await expectTwoUp("/trade?view=bridge", 768, 1024);
  expect(bridge768.count).toBe(3);
  expect(bridge768.widths[bridge768.widths.length - 1] ?? 0).toBeGreaterThanOrEqual(44);
});

test("skip-nav 768 liquidity country-block architecture error legal leftover and 320 overflow", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });

  async function expectTwoUp(path: string, viewportWidth: number, viewportHeight: number) {
    await page.setViewportSize({ width: viewportWidth, height: viewportHeight });
    await page.goto(path, { waitUntil: "networkidle" });
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to main content" });
    await expectVisibleFocus(skip);
    const nav = page.getByRole("navigation", { name: "Skip links" });
    const layout = await nav.evaluate((element, width) => {
      const links = [...element.querySelectorAll("a")].map((link) => link.getBoundingClientRect());
      const style = getComputedStyle(element);
      const navRect = element.getBoundingClientRect();
      const first = links[0];
      return {
        wrap: style.flexWrap,
        direction: style.flexDirection,
        count: links.length,
        firstTop: first?.top ?? 0,
        secondTop: links[1]?.top ?? 0,
        firstRight: first?.right ?? 0,
        secondLeft: links[1]?.left ?? 0,
        lastWidth: links[links.length - 1]?.width ?? 0,
        lastHeight: links[links.length - 1]?.height ?? 0,
        widths: links.map((link) => link.width),
        navRight: navRect.right,
        ringRight: (first?.right ?? 0) + 4,
        ringLeft: (first?.left ?? 0) - 4,
        ringTop: (first?.top ?? 0) - 4,
        ringBottom: (first?.bottom ?? 0) + 4,
        viewportWidth: width,
      };
    }, viewportWidth);
    expect(layout.direction).toBe("row");
    expect(layout.wrap).toBe("wrap");
    expect(layout.count).toBeGreaterThanOrEqual(2);
    expect(Math.abs(layout.firstTop - layout.secondTop)).toBeLessThan(2);
    expect(layout.secondLeft).toBeGreaterThan(layout.firstRight);
    for (const width of layout.widths) {
      expect(width).toBeGreaterThanOrEqual(44);
    }
    expect(layout.navRight).toBeLessThanOrEqual(viewportWidth + 0.5);
    expect(layout.ringLeft).toBeGreaterThanOrEqual(-0.5);
    expect(layout.ringTop).toBeGreaterThanOrEqual(-0.5);
    expect(layout.ringRight).toBeLessThanOrEqual(viewportWidth + 0.5);
    expect(layout.ringBottom).toBeLessThanOrEqual(viewportHeight + 0.5);
    return layout;
  }

  await expectTwoUp("/liquidity", 768, 1024);
  await expectTwoUp("/trade?access=blocked", 768, 1024);
  await expectTwoUp("/trade?view=architecture", 768, 1024);
  await expectTwoUp("/trade?error=1", 768, 1024);

  const legal390 = await expectTwoUp("/legal", 390, 844);
  expect(legal390.count).toBe(2);
  expect(legal390.lastWidth).toBeGreaterThanOrEqual(44);
  expect(legal390.lastHeight).toBeGreaterThanOrEqual(44);

  const overflow320 = await expectTwoUp("/", 320, 900);
  expect(overflow320.navRight).toBeLessThanOrEqual(320.5);
  expect(overflow320.ringRight).toBeLessThanOrEqual(320.5);
});

test("skip-nav leftover 44px education clearance and overflow-y ring padding", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });

  async function leftover(path: string, width: number, height: number, count: number) {
    await page.setViewportSize({ width, height });
    await page.goto(path, { waitUntil: "networkidle" });
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to main content" });
    await expectVisibleFocus(skip);
    const nav = page.getByRole("navigation", { name: "Skip links" });
    const layout = await nav.evaluate((element) => {
      const links = [...element.querySelectorAll("a")];
      const last = links[links.length - 1]?.getBoundingClientRect();
      const first = links[0];
      const style = first ? getComputedStyle(first) : null;
      const parent = first?.parentElement;
      const parentRect = parent?.getBoundingClientRect();
      const rect = first?.getBoundingClientRect();
      const extent = style
        ? (Number.parseFloat(style.outlineWidth) || 0) + (Number.parseFloat(style.outlineOffset) || 0)
        : 0;
      return {
        count: links.length,
        lastWidth: last?.width ?? 0,
        lastHeight: last?.height ?? 0,
        padding: parent ? getComputedStyle(parent).paddingTop : "",
        ringTop: (rect?.top ?? 0) - extent,
        ringBottom: (rect?.bottom ?? 0) + extent,
        parentTop: parentRect?.top ?? 0,
        parentBottom: parentRect?.bottom ?? 0,
      };
    });
    expect(layout.count).toBe(count);
    expect(layout.lastWidth).toBeGreaterThanOrEqual(44);
    expect(layout.lastHeight).toBeGreaterThanOrEqual(44);
    expect(layout.padding).toBe("8px");
    expect(layout.ringTop).toBeGreaterThanOrEqual(layout.parentTop - 0.5);
    expect(layout.ringBottom).toBeLessThanOrEqual(layout.parentBottom + 0.5);
  }

  await leftover("/security", 390, 844, 2);
  await leftover("/status", 390, 844, 2);
  await leftover("/liquidity", 768, 1024, 3);
  await leftover("/trade?view=bridge", 390, 844, 3);

  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/trade?education=1", { waitUntil: "networkidle" });
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const dialogBox = await dialog.boundingBox();
  const skipNav = page.getByRole("navigation", { name: "Skip links" });
  const skipBox = await skipNav.boundingBox();
  const marginTop = await dialog.evaluate((element) => getComputedStyle(element).marginTop);
  expect(Number.parseFloat(marginTop)).toBeGreaterThanOrEqual(200);
  const overlaps = Boolean(
    skipBox && dialogBox
    && skipBox.width > 8
    && skipBox.height > 8
    && skipBox.x < dialogBox.x + dialogBox.width
    && skipBox.x + skipBox.width > dialogBox.x
    && skipBox.y < dialogBox.y + dialogBox.height
    && skipBox.y + skipBox.height > dialogBox.y,
  );
  expect(overlaps).toBe(false);
});

test("education Continue stays in 320px and leftover skip links stay 44px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/trade?education=1", { waitUntil: "networkidle" });
  const continueButton = page.getByRole("dialog").getByRole("button", { name: "Continue" });
  await expect(continueButton).toBeVisible();
  const continueBox = await continueButton.boundingBox();
  expect(continueBox?.height ?? 0).toBeGreaterThanOrEqual(44);
  expect(continueBox?.y ?? -1).toBeGreaterThanOrEqual(0);
  expect((continueBox?.y ?? 0) + (continueBox?.height ?? 0)).toBeLessThanOrEqual(900);
  expect((continueBox?.x ?? 0) + (continueBox?.width ?? 0)).toBeLessThanOrEqual(320);
  const dialogStyle = await page.getByRole("dialog").evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      maxHeight: style.maxHeight,
      overflowY: style.overflowY,
      boxSizing: style.boxSizing,
    };
  });
  expect(dialogStyle.overflowY).toBe("auto");
  expect(dialogStyle.boxSizing).toBe("border-box");
  expect(Number.parseFloat(dialogStyle.maxHeight)).toBeGreaterThan(0);

  async function leftover(path: string, width: number, height: number, count: number) {
    await page.setViewportSize({ width, height });
    await page.goto(path, { waitUntil: "networkidle" });
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to main content" });
    await expectVisibleFocus(skip);
    const nav = page.getByRole("navigation", { name: "Skip links" });
    const layout = await nav.evaluate((element) => {
      const links = [...element.querySelectorAll("a")];
      const last = links[links.length - 1]?.getBoundingClientRect();
      const first = links[0]?.getBoundingClientRect();
      return {
        count: links.length,
        lastWidth: last?.width ?? 0,
        lastHeight: last?.height ?? 0,
        firstWidth: first?.width ?? 0,
        firstHeight: first?.height ?? 0,
        padding: getComputedStyle(element).paddingTop,
      };
    });
    expect(layout.count).toBe(count);
    expect(layout.lastWidth).toBeGreaterThanOrEqual(44);
    expect(layout.lastHeight).toBeGreaterThanOrEqual(44);
    expect(layout.firstWidth).toBeGreaterThanOrEqual(44);
    expect(layout.firstHeight).toBeGreaterThanOrEqual(44);
    expect(layout.padding).toBe("8px");
  }

  await leftover("/security", 768, 1024, 2);
  await leftover("/status", 768, 1024, 2);
  await leftover("/trade?access=blocked", 390, 844, 2);
  await leftover("/this-route-is-not-part-of-the-simulation", 390, 844, 2);
  await leftover("/trade?loading=1", 390, 844, 2);

  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/", { waitUntil: "networkidle" });
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to main content" });
  await expectVisibleFocus(skip);
  const twoUp = await page.getByRole("navigation", { name: "Skip links" }).evaluate((element) => {
    const links = [...element.querySelectorAll("a")].slice(0, 2).map((link) => link.getBoundingClientRect());
    return {
      firstWidth: links[0]?.width ?? 0,
      secondWidth: links[1]?.width ?? 0,
      padding: getComputedStyle(element).paddingTop,
      gutter: getComputedStyle(element).scrollbarGutter,
    };
  });
  expect(twoUp.padding).toBe("8px");
  expect(twoUp.gutter).toBe("stable");
  expect(twoUp.firstWidth).toBeGreaterThanOrEqual(44);
  expect(twoUp.secondWidth).toBeGreaterThanOrEqual(44);
});

test("education Back Enter simulation heading ring leftover 768 and skip-nav ring at 768", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/trade?education=1", { waitUntil: "networkidle" });
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Continue" }).click();
  const back = dialog.getByRole("button", { name: "Back" });
  await expect(back).toBeVisible();
  const backBox = await back.boundingBox();
  expect(backBox?.height ?? 0).toBeGreaterThanOrEqual(44);
  expect(backBox?.y ?? -1).toBeGreaterThanOrEqual(0);
  expect((backBox?.y ?? 0) + (backBox?.height ?? 0)).toBeLessThanOrEqual(900);

  const headingRing = await dialog.getByRole("heading").evaluate((element) => {
    const style = getComputedStyle(element);
    const parent = element.closest("dialog");
    const parentRect = parent?.getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    const extent = (Number.parseFloat(style.outlineWidth) || 0) + (Number.parseFloat(style.outlineOffset) || 0);
    return {
      top: rect.top - extent,
      parentTop: parentRect?.top ?? 0,
      outlineWidth: style.outlineWidth,
      scrollPaddingTop: parent ? getComputedStyle(parent).scrollPaddingTop : "",
      scrollMarginTop: style.scrollMarginTop,
    };
  });
  expect(headingRing.scrollPaddingTop).toBe("8px");
  expect(headingRing.scrollMarginTop).toBe("8px");
  expect(headingRing.top).toBeGreaterThanOrEqual(headingRing.parentTop - 0.5);

  await dialog.getByRole("button", { name: "Continue" }).click();
  const enter = dialog.getByRole("button", { name: "Enter simulation" });
  await expect(enter).toBeVisible();
  const enterBox = await enter.boundingBox();
  expect(enterBox?.height ?? 0).toBeGreaterThanOrEqual(44);
  expect(enterBox?.width ?? 0).toBeGreaterThanOrEqual(44);
  expect(enterBox?.y ?? -1).toBeGreaterThanOrEqual(0);
  expect((enterBox?.y ?? 0) + (enterBox?.height ?? 0)).toBeLessThanOrEqual(900);

  async function leftover(path: string, width: number, height: number, count: number) {
    await page.setViewportSize({ width, height });
    await page.goto(path, { waitUntil: "networkidle" });
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to main content" });
    await expectVisibleFocus(skip);
    const nav = page.getByRole("navigation", { name: "Skip links" });
    const layout = await nav.evaluate((element) => {
      const links = [...element.querySelectorAll("a")];
      const last = links[links.length - 1]?.getBoundingClientRect();
      const first = links[0];
      const style = first ? getComputedStyle(first) : null;
      const parentRect = element.getBoundingClientRect();
      const rect = first?.getBoundingClientRect();
      const extent = style
        ? (Number.parseFloat(style.outlineWidth) || 0) + (Number.parseFloat(style.outlineOffset) || 0)
        : 0;
      return {
        count: links.length,
        lastWidth: last?.width ?? 0,
        lastHeight: last?.height ?? 0,
        padding: getComputedStyle(element).paddingTop,
        ringTop: (rect?.top ?? 0) - extent,
        ringBottom: (rect?.bottom ?? 0) + extent,
        parentTop: parentRect.top,
        parentBottom: parentRect.bottom,
      };
    });
    expect(layout.count).toBe(count);
    expect(layout.lastWidth).toBeGreaterThanOrEqual(44);
    expect(layout.lastHeight).toBeGreaterThanOrEqual(44);
    expect(layout.padding).toBe("8px");
    expect(layout.ringTop).toBeGreaterThanOrEqual(layout.parentTop - 0.5);
    expect(layout.ringBottom).toBeLessThanOrEqual(layout.parentBottom + 0.5);
  }

  await leftover("/legal", 768, 1024, 2);
  await leftover("/trade?view=architecture", 768, 1024, 4);
  await leftover("/trade?error=1", 390, 844, 2);
  await leftover("/", 768, 1024, 7);
});

test("education disabled Back sticky copy Continue ring leftover 390 768 and skip-nav ring at 390", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/trade?education=1", { waitUntil: "networkidle" });
  const dialog = page.getByRole("dialog");
  const back = dialog.getByRole("button", { name: "Back" });
  await expect(back).toBeDisabled();
  expect((await back.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  expect((await back.boundingBox())?.width ?? 0).toBeGreaterThanOrEqual(44);

  const copy = dialog.getByRole("region", { name: "Education copy" });
  const copyBox = await copy.boundingBox();
  const tourTop = await back.evaluate((element) => element.parentElement?.getBoundingClientRect().top ?? 0);
  const copyBottomContent = (copyBox?.y ?? 0) + (copyBox?.height ?? 0) - 8;
  expect(copyBottomContent).toBeLessThanOrEqual(tourTop + 1);

  const continueButton = dialog.getByRole("button", { name: "Continue" });
  await tabTo(page, continueButton);
  await expect(continueButton).toBeFocused();
  const continueRing = await continueButton.evaluate((element) => {
    const style = getComputedStyle(element);
    const parent = element.closest("dialog");
    const parentRect = parent?.getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    const extent = (Number.parseFloat(style.outlineWidth) || 0) + (Number.parseFloat(style.outlineOffset) || 0);
    return {
      outlineWidth: style.outlineWidth,
      outlineOffset: style.outlineOffset,
      top: rect.top - extent,
      bottom: rect.bottom + extent,
      parentTop: parentRect?.top ?? 0,
      parentBottom: parentRect?.bottom ?? 0,
    };
  });
  expect(Number.parseFloat(continueRing.outlineWidth)).toBeGreaterThanOrEqual(2);
  expect(Number.parseFloat(continueRing.outlineOffset)).toBeGreaterThanOrEqual(0);
  expect(continueRing.top).toBeGreaterThanOrEqual(continueRing.parentTop - 0.5);
  expect(continueRing.bottom).toBeLessThanOrEqual(continueRing.parentBottom + 0.5);

  async function leftover(path: string, width: number, height: number, count: number) {
    await page.setViewportSize({ width, height });
    await page.goto(path, { waitUntil: "networkidle" });
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to main content" });
    await expectVisibleFocus(skip);
    const nav = page.getByRole("navigation", { name: "Skip links" });
    const layout = await nav.evaluate((element) => {
      const links = [...element.querySelectorAll("a")];
      const last = links[links.length - 1]?.getBoundingClientRect();
      const first = links[0];
      const style = first ? getComputedStyle(first) : null;
      const parentRect = element.getBoundingClientRect();
      const rect = first?.getBoundingClientRect();
      const extent = style
        ? (Number.parseFloat(style.outlineWidth) || 0) + (Number.parseFloat(style.outlineOffset) || 0)
        : 0;
      return {
        count: links.length,
        lastWidth: last?.width ?? 0,
        lastHeight: last?.height ?? 0,
        padding: getComputedStyle(element).paddingTop,
        ringTop: (rect?.top ?? 0) - extent,
        ringBottom: (rect?.bottom ?? 0) + extent,
        parentTop: parentRect.top,
        parentBottom: parentRect.bottom,
      };
    });
    expect(layout.count).toBe(count);
    expect(layout.lastWidth).toBeGreaterThanOrEqual(44);
    expect(layout.lastHeight).toBeGreaterThanOrEqual(44);
    expect(layout.padding).toBe("8px");
    expect(layout.ringTop).toBeGreaterThanOrEqual(layout.parentTop - 0.5);
    expect(layout.ringBottom).toBeLessThanOrEqual(layout.parentBottom + 0.5);
  }

  await leftover("/liquidity", 390, 844, 3);
  await leftover("/trade?view=bridge", 768, 1024, 3);
  await leftover("/trade?access=blocked", 768, 1024, 2);
  await leftover("/", 390, 844, 7);
});

test("education Enter simulation stays in 320px Continue ring is #f4c95d leftover 320 768", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/trade?education=1", { waitUntil: "networkidle" });
  const dialog = page.getByRole("dialog");
  const continueButton = dialog.getByRole("button", { name: "Continue" });
  const continueBox = await continueButton.boundingBox();
  expect(continueBox?.y ?? -1).toBeGreaterThanOrEqual(0);
  expect((continueBox?.y ?? 0) + (continueBox?.height ?? 0)).toBeLessThanOrEqual(900);

  await tabTo(page, continueButton);
  await expect(continueButton).toBeFocused();
  await expect.poll(async () => {
    return continueButton.evaluate((element) => getComputedStyle(element).outlineColor);
  }).toBe("rgb(244, 201, 93)");

  await continueButton.click();
  await continueButton.click();
  const enter = dialog.getByRole("button", { name: "Enter simulation" });
  await expect(enter).toBeVisible();
  const enterBox = await enter.boundingBox();
  expect(enterBox?.height ?? 0).toBeGreaterThanOrEqual(44);
  expect(enterBox?.y ?? -1).toBeGreaterThanOrEqual(0);
  expect((enterBox?.y ?? 0) + (enterBox?.height ?? 0)).toBeLessThanOrEqual(900);
  expect((enterBox?.x ?? 0) + (enterBox?.width ?? 0)).toBeLessThanOrEqual(320);

  async function leftover(path: string, width: number, height: number, count: number) {
    await page.setViewportSize({ width, height });
    await page.goto(path, { waitUntil: "networkidle" });
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to main content" });
    await expectVisibleFocus(skip);
    const nav = page.getByRole("navigation", { name: "Skip links" });
    const layout = await nav.evaluate((element) => {
      const links = [...element.querySelectorAll("a")];
      const last = links[links.length - 1]?.getBoundingClientRect();
      return {
        count: links.length,
        lastWidth: last?.width ?? 0,
        lastHeight: last?.height ?? 0,
      };
    });
    expect(layout.count).toBe(count);
    expect(layout.lastWidth).toBeGreaterThanOrEqual(44);
    expect(layout.lastHeight).toBeGreaterThanOrEqual(44);
  }

  await leftover("/status", 320, 900, 2);
  await leftover("/security", 320, 900, 2);
  await leftover("/trade?loading=1", 768, 1024, 2);
  await leftover("/this-route-is-not-part-of-the-simulation", 768, 1024, 2);
});

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

test("native settlement skip link transfers focus to the walkthrough", async ({ page }) => {
  await page.goto("/trade?view=settlement&market=ZEC/USDC", { waitUntil: "networkidle" });
  const skip = page.getByRole("link", { name: "Skip to native settlement walkthrough" });
  await tabTo(page, skip);
  await expectVisibleFocus(skip);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Native ZEC atomic swap" })).toBeFocused();
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
});

for (const unsafe of [
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
  });
}

test("native settlement keeps USDT disabled until one exact asset identity is approved", async ({ page }) => {
  await page.goto("/trade?view=settlement&market=ZEC/USDT", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "USDT identity unresolved" })).toBeVisible();
  await expect(page.getByText("USDT is not USDT0.", { exact: true })).toBeVisible();
  const disabled = page.getByRole("button", { name: "Fixture action disabled" });
  await expect(disabled).toBeDisabled();
  await expect(disabled).toHaveAttribute("aria-describedby", "native-swap-disabled-reason");
  await expect(page.getByRole("button", { name: /connect.*wallet/i })).toHaveCount(0);
});
