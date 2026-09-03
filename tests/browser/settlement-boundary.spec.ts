import { expect, test } from "./fixtures";

test("refund deadlines never stand in for observed or confirmed recovery", async ({ page }) => {
  await page.goto("/trade?view=settlement&market=ZEC/USDC");
  await page.getByRole("combobox", { name: "Evidence case" }).selectOption("refund");
  const recovery = page.getByRole("region", { name: "Later-deadline ZEC refund" });
  const usdc = recovery.locator("dl > div").filter({ has: page.getByText("USDC refund", { exact: true }) });
  const zec = recovery.locator("dl > div").filter({ has: page.getByText("ZEC refund", { exact: true }) });
  await expect(usdc).toContainText("No confirmed funding");
  await expect(recovery).toContainText("Deadline eligibility does not prove an unspent lock or a confirmed refund.");

  for (const name of [
    "Accept exact terms", "Prepare ZEC P2SH lock", "Record ZEC funding", "Confirm ZEC evidence",
    "Prepare Exact-token EVM lock", "Record USDC funding", "Confirm USDC evidence",
  ]) await page.getByRole("button", { name, exact: true }).click();

  await expect(usdc).toContainText("Locked — deadline not reached");
  await page.getByRole("button", { name: "Advance to USDC refund deadline", exact: true }).click();
  await expect(usdc).toContainText("Deadline eligible — refund unconfirmed");
  await expect(zec).toContainText("Locked — deadline not reached");
  await page.getByRole("button", { name: "Record USDC refund", exact: true }).click();
  await expect(usdc).toContainText("Refund observed — confirmation pending");
  await page.getByRole("button", { name: "Confirm USDC refund", exact: true }).click();
  await expect(usdc).toContainText("Refund confirmed in preview");
  await expect(zec).toContainText("Locked — deadline not reached");
  await page.getByRole("button", { name: "Advance to ZEC refund deadline", exact: true }).click();
  await expect(zec).toContainText("Deadline eligible — refund unconfirmed");
  await page.getByRole("button", { name: "Record ZEC refund", exact: true }).click();
  await expect(zec).toContainText("Refund observed — confirmation pending");
  await page.getByRole("button", { name: "Confirm ZEC refund", exact: true }).click();
  await expect(zec).toContainText("Refund confirmed in preview");
  await expect(page.getByRole("button", { name: "Refunded", exact: true })).toBeDisabled();
});

test("unsafe settlement evidence leaves recovery visible without claiming refund authority", async ({ page }) => {
  await page.goto("/trade?view=settlement&market=ZEC/USDC");
  for (const scenario of ["stale", "conflict", "reorganization", "contract-mismatch"]) {
    await page.getByRole("combobox", { name: "Evidence case" }).selectOption(scenario);
    const recovery = page.getByRole("region", { name: "Later-deadline ZEC refund" });
    await expect(recovery.getByText("Disputed — recovery evidence required", { exact: false })).toHaveCount(2);
    await expect(page.getByRole("button", { name: "Claim disabled", exact: true })).toBeDisabled();
    await expect(page.getByRole("alert").filter({ hasText: "Unsafe evidence" })).toContainText("Reset restarts this synthetic example; it cannot resolve a chain dispute.");
  }
});

test("USDT settlement shows its exact token and network while wallet actions stay disabled on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/trade?view=settlement&market=ZEC/USDT");
  await expect(page.getByText("Ethereum Mainnet · chain ID 1", { exact: true })).toBeVisible();
  await expect(page.getByText("USDT token · 6 decimals", { exact: true })).toBeVisible();
  await expect(page.getByText("0xdac17f958d2ee523a2206206994597c13d831ec7", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Claim disabled", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: /connect.*wallet|sign|broadcast/i })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
});
