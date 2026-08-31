import { expect, test } from "./fixtures";

test("320px incident demo stays architecture-demonstration", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/trade?view=architecture&demo=incidents", { waitUntil: "networkidle" });

  const select = page.getByRole("combobox", { name: "Gateway incident demonstration" });
  await expect(select).toBeVisible();
  await select.selectOption("observer-disagreement");

  const demo = page.getByRole("region", { name: "Blocked, review, reorg, and maintenance copy" });
  await expect(demo.getByRole("strong")).toHaveText("Observers disagree.");
  await expect(demo.getByText("Minting is paused until observers agree.")).toBeVisible();
  await expect(page.getByText("architecture-demonstration")).toBeVisible();
  await expect(page.getByText("not a live outage")).toBeVisible();
});
