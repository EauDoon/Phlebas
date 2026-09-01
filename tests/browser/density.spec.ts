import { type Locator, type Page } from "@playwright/test";

import { NATIVE_MATCHER_DISABLED_COPY } from "../../src/lib/native-matcher-order-action.ts";

import { expect, test } from "./fixtures";

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    body: document.body.scrollWidth - document.body.clientWidth,
    document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));

  expect(overflow, "Page-level horizontal overflow").toEqual({ body: 0, document: 0 });
}

async function expectIntersectingViewport(locator: Locator, label: string) {
  await expect(locator, label).toBeVisible();
  const hit = await locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(rect.right, vw) - Math.max(rect.left, 0);
    const height = Math.min(rect.bottom, vh) - Math.max(rect.top, 0);
    return {
      intersecting: width > 0 && height > 0,
      rect: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right },
      viewport: { vw, vh },
    };
  });
  expect(hit.intersecting, `${label} intersecting viewport ${JSON.stringify(hit)}`).toBe(true);
}

test.describe("desktop operating density", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("trade keeps chart book ticket tape blotter on one screen", async ({ page }) => {
    await page.goto("/trade?mode=advanced", { waitUntil: "networkidle" });

    const chart = page.locator("#price-chart");
    const book = page.locator("#order-book");
    const ticket = page.locator("#order-ticket");
    const tape = page.locator("#recent-trades");
    const blotter = page.locator("#session-blotter");
    const wallet = page.getByRole("button", { name: "Connect Arbitrum Sepolia wallet" });

    await expectIntersectingViewport(chart, "price chart");
    await expectIntersectingViewport(book, "order book");
    await expectIntersectingViewport(ticket, "order ticket");
    await expectIntersectingViewport(tape, "recent trades");
    await expectIntersectingViewport(blotter, "session blotter");
    await expectIntersectingViewport(wallet, "wallet connect");
    await expectIntersectingViewport(page.getByRole("button", { name: "GTC" }), "GTC");
    await expectIntersectingViewport(page.getByRole("button", { name: "IOC" }), "IOC");
    await expectIntersectingViewport(page.getByRole("button", { name: "FOK" }), "FOK");

    const layout = await page.evaluate(() => {
      const box = (id: string) => {
        const rect = document.getElementById(id)?.getBoundingClientRect();
        if (!rect) {
          throw new Error(`Missing ${id}`);
        }
        return { top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left };
      };
      return {
        chart: box("price-chart"),
        book: box("order-book"),
        ticket: box("order-ticket"),
        tape: box("recent-trades"),
        blotter: box("session-blotter"),
      };
    });

    expect(layout.book.left, "book sits right of chart").toBeGreaterThan(layout.chart.right - 2);
    expect(layout.ticket.left, "ticket sits right of book").toBeGreaterThan(layout.book.right - 2);
    expect(layout.tape.top, "tape sits under chart").toBeGreaterThan(layout.chart.bottom - 2);
    expect(layout.blotter.top, "blotter sits under tape").toBeGreaterThan(layout.tape.bottom - 2);

    await page.getByRole("button", { name: "Ask 52.91" }).click();
    await expect(page.getByRole("textbox", { name: "Price in USDC" })).toHaveValue("52.91");

    await page.getByRole("button", { name: "Review buy" }).click();
    await expect(page.getByRole("button", { name: "Complete buy" })).toBeVisible();
    await expect(page.getByRole("button", { name: "GTC" })).toBeVisible();
    await expect(page.getByRole("button", { name: "IOC" })).toBeVisible();
    await expect(page.getByRole("button", { name: "FOK" })).toBeVisible();
    await page.getByRole("button", { name: "Back" }).click();

    await page.getByRole("radio", { name: "Empty" }).click();
    await expect(page.getByText("No resting depth. The local book is empty.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Review buy" })).toBeDisabled();

    await page.getByRole("radio", { name: "Loading" }).click();
    await expect(page.getByText("Loading market data", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Review buy" })).toBeDisabled();
  });

  test("liquidity keeps solver quotes on one screen and labels historical AMM retired", async ({ page }) => {
    await page.goto("/liquidity", { waitUntil: "networkidle" });

    const quotes = page.getByRole("heading", { name: "Solver quotes" });
    const pairs = page.locator("#liquidity-pools");
    const wallet = page.getByRole("button", { name: "Connect Arbitrum Sepolia wallet" });

    await expectIntersectingViewport(quotes, "solver quotes");
    await expectIntersectingViewport(pairs, "quote pairs");
    await expectIntersectingViewport(wallet, "wallet connect");
    await expect(page.getByText("Wallet-held inventory")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Historical AMM model" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Review mint" })).toHaveCount(0);

    await page.goto("/trade?view=architecture", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "Historical AMM model" })).toBeVisible();
    await expect(page.getByText("Retired", { exact: true }).first()).toBeVisible();
    const mint = page.getByRole("button", { name: "Review mint" });
    const burn = page.getByRole("button", { name: "Burn session shares" });
    const swap = page.getByRole("button", { name: "Review swap" });
    await mint.scrollIntoViewIfNeeded();
    await expect(mint).toBeVisible();
    await expect(swap).toBeVisible();
    await expect(burn).toBeEnabled();

    await page.getByRole("radio", { name: "Loading" }).click();
    await expect(mint).toBeDisabled();
    await expect(swap).toBeDisabled();
    await expect(burn).toBeEnabled();
  });
});

test.describe("stacked viewports stay inside the page", () => {
  for (const width of [320, 390, 768, 820, 1440] as const) {
    test(`${width}px landing, trade and liquidity have no horizontal overflow`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      for (const path of ["/", "/trade", "/liquidity"] as const) {
        await page.goto(path, { waitUntil: "networkidle" });
        await expectNoHorizontalOverflow(page);
      }
    });
  }
});

for (const width of [1180, 1440] as const) {
  test(`${width}px native matcher status is unclipped and does not overlap terminal panels`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/trade?mode=advanced", { waitUntil: "networkidle" });

    const matcher = page.locator("#native-matcher-order-action");
    await expect(matcher).toBeVisible();
    await expect(matcher).toContainText(NATIVE_MATCHER_DISABLED_COPY);

    const geometry = await page.evaluate(() => {
      const ids = [
        "price-chart",
        "order-book",
        "order-ticket",
        "recent-trades",
        "native-matcher-order-action",
        "session-blotter",
      ];
      const boxes = Object.fromEntries(ids.map((id) => {
        const element = document.getElementById(id);
        if (!element) throw new Error(`Missing ${id}`);
        const rect = element.getBoundingClientRect();
        return [id, {
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          left: rect.left,
          clientHeight: element.clientHeight,
          scrollHeight: element.scrollHeight,
        }];
      }));
      return boxes;
    });

    const entries = Object.entries(geometry);
    for (let leftIndex = 0; leftIndex < entries.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < entries.length; rightIndex += 1) {
        const [leftId, left] = entries[leftIndex];
        const [rightId, right] = entries[rightIndex];
        const overlapWidth = Math.min(left.right, right.right) - Math.max(left.left, right.left);
        const overlapHeight = Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top);
        expect(
          overlapWidth > 1 && overlapHeight > 1,
          `${leftId} does not overlap ${rightId}`,
        ).toBe(false);
      }
    }

    const matcherBox = geometry["native-matcher-order-action"];
    expect(matcherBox.scrollHeight, "native matcher status fits without internal scrolling").toBeLessThanOrEqual(
      matcherBox.clientHeight + 1,
    );
  });
}
