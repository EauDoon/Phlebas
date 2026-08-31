import { expect, test } from "./fixtures";
import { DEPOSIT_TOUR, depositTourById } from "../../src/lib/deposit-tour.ts";

test("320px deposit tour shows rejected stale and unavailable", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/trade?view=bridge", { waitUntil: "networkidle" });

  const next = page.getByRole("button", { name: "Next state" });
  const unavailable = depositTourById("unavailable");
  const rejected = depositTourById("rejected");
  const stale = depositTourById("stale");
  expect(unavailable).toBeTruthy();
  expect(rejected).toBeTruthy();
  expect(stale).toBeTruthy();
  if (!unavailable || !rejected || !stale) return;

  for (const step of [unavailable, rejected, stale]) {
    for (let i = 0; i < DEPOSIT_TOUR.length; i += 1) {
      if (await page.getByRole("heading", { name: step.title, exact: true }).isVisible()) break;
      await expect(next).toBeEnabled();
      await next.click();
    }
    await expect(page.getByRole("heading", { name: step.title, exact: true })).toBeVisible();
    await expect(page.getByText(step.body)).toBeVisible();
    await expect(page.getByText("tex1", { exact: false })).toHaveCount(0);
    await expect(page.getByText(/nothing (was|is) minted/i).first()).toBeVisible();
  }
});
