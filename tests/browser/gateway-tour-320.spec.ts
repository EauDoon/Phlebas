import { expect, test } from "./fixtures";
import { WITHDRAWAL_TOUR, withdrawalTourById } from "../../src/lib/withdrawal-tour.ts";

test("320px gateway tour shows rejected and unresolved", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/trade?view=bridge", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Withdrawal states" }).click();

  const next = page.getByRole("button", { name: "Next state" });
  const rejected = withdrawalTourById("rejected");
  const unresolved = withdrawalTourById("unresolved");
  expect(rejected).toBeTruthy();
  expect(unresolved).toBeTruthy();
  if (!rejected || !unresolved) return;

  for (let i = 0; i < WITHDRAWAL_TOUR.length; i += 1) {
    if (await page.getByText(rejected.title, { exact: true }).isVisible()) break;
    await expect(next).toBeEnabled();
    await next.click();
  }
  await expect(page.getByText(rejected.title, { exact: true })).toBeVisible();
  await expect(page.getByText(rejected.body)).toBeVisible();
  await expect(page.getByText("tex1", { exact: false })).toHaveCount(0);
  await expect(page.getByText("Nothing is sent", { exact: false }).first()).toBeVisible();

  for (let i = 0; i < WITHDRAWAL_TOUR.length; i += 1) {
    if (await page.getByText(unresolved.title, { exact: true }).isVisible()) break;
    await expect(next).toBeEnabled();
    await next.click();
  }
  await expect(page.getByText(unresolved.title, { exact: true })).toBeVisible();
  await expect(page.getByText(unresolved.body)).toBeVisible();
  await expect(page.getByText("tex1", { exact: false })).toHaveCount(0);
  await expect(page.getByText("Nothing is sent", { exact: false }).first()).toBeVisible();
});
