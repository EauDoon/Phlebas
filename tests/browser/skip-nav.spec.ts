import { type Locator, type Page } from "@playwright/test";

import { expect, test } from "./fixtures";

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

function boxesOverlap(
  first: { x: number; y: number; width: number; height: number } | null,
  second: { x: number; y: number; width: number; height: number } | null,
) {
  return Boolean(
    first && second
    && first.x < second.x + second.width
    && first.x + first.width > second.x
    && first.y < second.y + second.height
    && first.y + first.height > second.y
    && first.width > 2
    && first.height > 2,
  );
}

async function expectSkipNavHidden(page: Page) {
  const nav = page.getByRole("navigation", { name: "Skip links" });
  const state = await nav.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      focusWithin: element.matches(":focus-within"),
      transform: style.transform,
      clipPath: style.clipPath,
      width: style.width,
      height: style.height,
    };
  });

  expect(state.focusWithin).toBe(false);
  const clipped = /inset\(50%\)/.test(state.clipPath);
  const translated = state.transform.includes("matrix") && state.transform !== "none"
    || state.transform.includes("translate");
  expect(clipped || translated || state.width === "1px" || state.height === "1px").toBe(true);
}

async function openFocusedSkipNav(page: Page, path: string) {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(path, { waitUntil: "networkidle" });
  const skip = page.getByRole("link", { name: "Skip to main content" });
  await page.keyboard.press("Tab");
  await expectVisibleFocus(skip);
  return { skip, nav: page.getByRole("navigation", { name: "Skip links" }) };
}

test("focused skip-nav wraps below 200px at 320px", async ({ page }) => {
  const { skip, nav } = await openFocusedSkipNav(page, "/");
  const navBox = await nav.boundingBox();
  expect(navBox?.height ?? 900).toBeLessThan(200);
  expect(navBox?.height ?? 0).toBeGreaterThanOrEqual(44);

  const links = nav.getByRole("link");
  const count = await links.count();
  expect(count).toBeGreaterThan(1);
  for (let index = 0; index < count; index += 1) {
    expect((await links.nth(index).boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  }

  expect((await skip.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
});

test("focused trade skip-nav does not cover the topbar brand at 320px", async ({ page }) => {
  const { nav } = await openFocusedSkipNav(page, "/trade");
  const brand = page.getByRole("link", { name: "Phlebas home" });
  await expect(brand).toBeVisible();
  expect(boxesOverlap(await nav.boundingBox(), await brand.boundingBox())).toBe(false);

  const skipLinks = nav.getByRole("link");
  const count = await skipLinks.count();
  const brandBox = await brand.boundingBox();
  for (let index = 0; index < count; index += 1) {
    expect(boxesOverlap(await skipLinks.nth(index).boundingBox(), brandBox)).toBe(false);
  }
});

test("skip-nav hides after skip-link activation on landing and trade", async ({ page }) => {
  for (const route of [
    { path: "/", skip: "Skip to main content", target: "#main-content" },
    { path: "/", skip: "Skip to markets", target: "#markets" },
    { path: "/trade", skip: "Skip to main content", target: "#main-content" },
    { path: "/trade", skip: "Skip to order ticket", target: "#order-ticket" },
  ] as const) {
    await page.setViewportSize({ width: 320, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(route.path, { waitUntil: "networkidle" });
    const skipLink = page.getByRole("link", { name: route.skip });
    await page.keyboard.press("Tab");
    if (route.skip !== "Skip to main content") {
      await tabTo(page, skipLink);
    }
    await expectVisibleFocus(skipLink);
    const focusedNav = await page.getByRole("navigation", { name: "Skip links" }).boundingBox();
    expect(focusedNav?.height ?? 0).toBeGreaterThanOrEqual(44);

    await page.keyboard.press("Enter");
    const target = page.locator(route.target);
    await expect(target).toBeFocused();
    await expectSkipNavHidden(page);

    const skipBox = await skipLink.boundingBox();
    const targetBox = await target.boundingBox();
    expect(boxesOverlap(skipBox, targetBox)).toBe(false);
  }
});
