import { expect, test } from "./fixtures";
import { payoutClaimForTourStep, payoutClaimStubCopy } from "../../src/lib/payout.ts";
import { WITHDRAWAL_TOUR, withdrawalTourById } from "../../src/lib/withdrawal-tour.ts";

const DEST = "t1Zo4ZzPXJiJ8M8pYMgL4tWbdkH7c8r7abc";

test("320px historical custody tour shows rejected and unresolved", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/trade?view=bridge", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Historical withdrawal states" }).click();

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

test("320px historical custody tour shows refunded tZEC restore", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/trade?view=bridge", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Historical withdrawal states" }).click();

  const next = page.getByRole("button", { name: "Next state" });
  const refunded = withdrawalTourById("refunded");
  expect(refunded).toBeTruthy();
  if (!refunded) return;

  for (let i = 0; i < WITHDRAWAL_TOUR.length; i += 1) {
    if (await page.getByText(refunded.title, { exact: true }).isVisible()) break;
    await expect(next).toBeEnabled();
    await next.click();
  }
  await expect(page.getByText(refunded.title, { exact: true })).toBeVisible();
  await expect(page.getByText(refunded.body)).toBeVisible();
  await page.getByRole("textbox", { name: "Transparent destination to inspect" }).fill(DEST);
  await expect(page.getByText(payoutClaimStubCopy(payoutClaimForTourStep("refunded", DEST)))).toBeVisible();
  await expect(page.getByText("tex1", { exact: false })).toHaveCount(0);
  await expect(page.getByText("Nothing is sent", { exact: false }).first()).toBeVisible();
});

test("320px historical custody tour shows expired evidence", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/trade?view=bridge", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Historical withdrawal states" }).click();

  const next = page.getByRole("button", { name: "Next state" });
  const expired = withdrawalTourById("expired");
  expect(expired).toBeTruthy();
  if (!expired) return;

  for (let i = 0; i < WITHDRAWAL_TOUR.length; i += 1) {
    if (await page.getByText(expired.title, { exact: true }).isVisible()) break;
    await expect(next).toBeEnabled();
    await next.click();
  }
  await expect(page.getByText(expired.title, { exact: true })).toBeVisible();
  await expect(page.getByText(expired.body)).toBeVisible();
  await expect(page.getByText("tex1", { exact: false })).toHaveCount(0);
  await expect(page.getByText("Nothing is sent", { exact: false }).first()).toBeVisible();
});

test("320px historical custody tour shows unresolved recovery", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/trade?view=bridge", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Historical withdrawal states" }).click();

  const next = page.getByRole("button", { name: "Next state" });
  const observed = withdrawalTourById("unresolved-observed");
  const restored = withdrawalTourById("input-restored");
  expect(observed).toBeTruthy();
  expect(restored).toBeTruthy();
  if (!observed || !restored) return;

  for (const step of [observed, restored]) {
    for (let i = 0; i < WITHDRAWAL_TOUR.length; i += 1) {
      if (await page.getByText(step.title, { exact: true }).isVisible()) break;
      await expect(next).toBeEnabled();
      await next.click();
    }
    await expect(page.getByText(step.title, { exact: true })).toBeVisible();
    await expect(page.getByText(step.body)).toBeVisible();
    await expect(page.getByText("tex1", { exact: false })).toHaveCount(0);
    await expect(page.getByText("Nothing is sent", { exact: false }).first()).toBeVisible();
  }
});

test("320px historical custody tour shows confirmed walker stub claim", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/trade?view=bridge", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Historical withdrawal states" }).click();

  const next = page.getByRole("button", { name: "Next state" });
  const confirmed = withdrawalTourById("confirmed");
  expect(confirmed).toBeTruthy();
  if (!confirmed) return;

  for (let i = 0; i < WITHDRAWAL_TOUR.length; i += 1) {
    if (await page.getByText(confirmed.title, { exact: true }).isVisible()) break;
    await expect(next).toBeEnabled();
    await next.click();
  }
  await expect(page.getByText(confirmed.title, { exact: true })).toBeVisible();
  await expect(page.getByText(confirmed.body)).toBeVisible();
  await page.getByRole("textbox", { name: "Transparent destination to inspect" }).fill(DEST);
  await expect(page.getByText(payoutClaimStubCopy(payoutClaimForTourStep("confirmed", DEST)))).toBeVisible();
  await expect(page.getByText("tex1", { exact: false })).toHaveCount(0);
  await expect(page.getByText("Nothing is sent", { exact: false }).first()).toBeVisible();
});
