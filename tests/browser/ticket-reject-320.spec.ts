import { expect, test } from "./fixtures";
import { submitOrder } from "../../src/lib/matcher.ts";
import {
  describeSubmit,
  isTicketRejectCopy,
  seedBook,
  ticketRejectCopy,
} from "../../src/lib/session.ts";

const MARKET = "ZEC/USDT" as const;

test("320px FOK miss rejected panel names ZEC-USDT", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/trade", { waitUntil: "networkidle" });
  await page.getByRole("radio", { name: /ZEC \/ USDT|ZEC\/USDT/ }).click();

  await page.getByRole("button", { name: "FOK" }).click();
  await page.getByRole("textbox", { name: "Price in USDT" }).fill("52.91");
  await page.getByRole("textbox", { name: "Order size in ZEC" }).fill("100");
  await page.getByRole("button", { name: "Review buy" }).click();
  await page.getByRole("button", { name: "Complete buy" }).click();

  const copy = describeSubmit(
    submitOrder(seedBook(MARKET), {
      id: "taker",
      side: "buy",
      tif: "FOK",
      priceTicks: 5291n,
      sizeAtoms: 100_00000000n,
    }),
    MARKET,
  );
  expect(isTicketRejectCopy(copy)).toBe(true);

  const panel = page.getByRole("alert");
  await expect(panel.getByText("Order rejected", { exact: true })).toBeVisible();
  await expect(panel.getByText(`${copy} Retry is safe; nothing was submitted.`, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Complete buy" })).toHaveCount(0);
});
test("320px past unix expiry rejected panel names ZEC-USDT", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/trade", { waitUntil: "networkidle" });
  await page.getByRole("radio", { name: /ZEC \/ USDT|ZEC\/USDT/ }).click();

  await page.getByRole("textbox", { name: "Order size in ZEC" }).fill("1");
  await page.getByRole("textbox", { name: "Order expiry unix time" }).fill("1");
  await page.getByRole("button", { name: "Review buy" }).click();

  const copy = ticketRejectCopy("Order expiry has passed", MARKET);
  expect(isTicketRejectCopy(copy)).toBe(true);

  const panel = page.getByRole("alert");
  await expect(panel.getByText("Order rejected", { exact: true })).toBeVisible();
  await expect(panel.getByText(`${copy} Retry is safe; nothing was submitted.`, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Complete buy" })).toHaveCount(0);
});
