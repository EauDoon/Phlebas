import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

mkdirSync("test-results/design-audit-2", { recursive: true });
const browser = await chromium.launch();
const routes = [
  { path: "/", name: "landing" },
  { path: "/trade?mode=simple", name: "trade-simple" },
  { path: "/trade?mode=advanced", name: "trade-advanced" },
  { path: "/liquidity", name: "liquidity" },
  { path: "/status", name: "status" },
  { path: "/zcash", name: "zcash" },
  { path: "/security", name: "security" },
  { path: "/legal", name: "legal" },
];
const widths = [390, 768, 1560];
for (const width of widths) {
  const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  for (const route of routes) {
    try {
      await page.goto(`http://localhost:3123${route.path}`, { waitUntil: "networkidle", timeout: 30000 });
      await page.waitForTimeout(400);
      for (let i = 0; i < 3; i += 1) {
        try {
          await page.getByRole("button", { name: "Continue" }).click({ timeout: 1200 });
          await page.waitForTimeout(150);
        } catch {
          break;
        }
      }
      await page.screenshot({ path: `test-results/design-audit-2/${route.name}-${width}.png`, fullPage: true });
      console.log(`ok ${route.name} ${width}`);
    } catch (error) {
      console.log(`FAIL ${route.name} ${width}: ${error.message.split("\n")[0]}`);
    }
  }
  await context.close();
}
await browser.close();
