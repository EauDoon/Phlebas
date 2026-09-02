import { expect, PREVIEW_CHIP, test } from "./fixtures";

const ACCENT = "rgb(77, 220, 255)";
const BACKGROUND = "rgb(5, 8, 22)";
const RETIRED_GOLD = "rgb(244, 201, 93)";
const RETIRED_TEAL = "rgb(45, 212, 191)";
const RETIRED_WARM_YELLOW = "rgb(240, 193, 75)";

const routes = [
  { path: "/", name: "landing" },
  { path: "/trade?view=trade", name: "trade" },
  { path: "/trade?market=ZEC%2FUSDC&view=architecture", name: "architecture" },
  { path: "/liquidity?market=ZEC%2FUSDC", name: "liquidity" },
  { path: "/liquidity?market=ZEC%2FUSDC&mode=advanced", name: "advanced liquidity" },
  { path: "/status", name: "status" },
  { path: "/missing-theme-route", name: "404" },
] as const;

const backgroundRoutes = [
  { path: "/", name: "landing" },
  { path: "/trade?view=trade", name: "trade" },
  { path: "/liquidity?market=ZEC%2FUSDC", name: "liquidity" },
  { path: "/trade?market=ZEC%2FUSDC&view=architecture", name: "architecture" },
  { path: "/status", name: "status" },
] as const;

for (const route of routes) {
  test(`${route.name} computed accent is prismatic cyan`, async ({ page }) => {
    const response = await page.goto(route.path, { waitUntil: "networkidle" });
    if (route.name === "404") {
      expect(response?.status()).toBe(404);
    }

    const banner = page.getByText(PREVIEW_CHIP, { exact: true });
    await expect(banner).toBeVisible();
    const bannerColor = await banner.evaluate((element) => getComputedStyle(element).color);
    expect(bannerColor, `${route.name} banner accent`).toBe(ACCENT);
    expect(bannerColor.toLowerCase(), `${route.name} banner is not retired gold`).not.toBe(RETIRED_GOLD);
    expect(bannerColor.toLowerCase(), `${route.name} banner is not leftover teal`).not.toBe(RETIRED_TEAL);
    expect(bannerColor.toLowerCase(), `${route.name} banner is not retired warm yellow`).not.toBe(RETIRED_WARM_YELLOW);

    const skip = page.getByRole("link", { name: "Skip to main content" });
    await page.keyboard.press("Tab");
    await expect(skip).toBeFocused();
    const skipBackground = await skip.evaluate((element) => getComputedStyle(element).backgroundColor);
    expect(skipBackground, `${route.name} skip-link background`).toBe(ACCENT);
    expect(skipBackground.toLowerCase(), `${route.name} skip-link is not retired gold`).not.toBe(RETIRED_GOLD);
  });
}

for (const route of backgroundRoutes) {
  test(`${route.name} body background is deep prismatic navy`, async ({ page }) => {
    await page.goto(route.path, { waitUntil: "networkidle" });
    const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(background, `${route.name} body background`).toBe(BACKGROUND);
  });
}
