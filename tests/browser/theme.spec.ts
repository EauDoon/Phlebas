import { expect, test } from "./fixtures";

const TEAL = "rgb(45, 212, 191)";

const routes = [
  { path: "/", name: "landing" },
  { path: "/trade", name: "trade" },
  { path: "/liquidity", name: "liquidity" },
  { path: "/status", name: "status" },
  { path: "/missing-theme-route", name: "404" },
] as const;

for (const route of routes) {
  test(`${route.name} computed accent is teal`, async ({ page }) => {
    const response = await page.goto(route.path, { waitUntil: "networkidle" });
    if (route.name === "404") {
      expect(response?.status()).toBe(404);
    }

    const banner = page.getByRole("status", { name: "Simulation disclosure" }).locator("strong");
    await expect(banner).toBeVisible();
    expect(await banner.evaluate((element) => getComputedStyle(element).color), `${route.name} banner accent`).toBe(TEAL);

    const skip = page.getByRole("link", { name: "Skip to main content" });
    await page.keyboard.press("Tab");
    await expect(skip).toBeFocused();
    expect(
      await skip.evaluate((element) => getComputedStyle(element).backgroundColor),
      `${route.name} skip-link background`,
    ).toBe(TEAL);
  });
}
