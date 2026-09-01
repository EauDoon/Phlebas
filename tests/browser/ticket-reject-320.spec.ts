import { expect, test } from "./fixtures";
import { submitOrder } from "../../src/lib/matcher.ts";
import {
  describeSubmit,
  isTicketRejectCopy,
  seedBook,
  ticketRejectCopy,
} from "../../src/lib/session.ts";

const MARKET = "ZEC/USDT" as const;
const REVIEW_BUY = "Review buy";
const COMPLETE_BUY = "Complete buy";

test("320px FOK miss rejected panel names ZEC-USDT", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/trade", { waitUntil: "networkidle" });
  await page.getByRole("radio", { name: /ZEC \/ USDT|ZEC\/USDT/ }).click();

  await page.getByRole("button", { name: "FOK" }).click();
  await page.getByRole("textbox", { name: "Price in USDT" }).fill("52.91");
  await page.getByRole("textbox", { name: "Order size in ZEC" }).fill("100");
  await page.getByRole("button", { name: REVIEW_BUY }).click();
  await page.getByRole("button", { name: COMPLETE_BUY }).click();

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
  await expect(page.getByRole("button", { name: COMPLETE_BUY })).toHaveCount(0);
  await expect(page.getByRole("button", { name: REVIEW_BUY })).toBeEnabled();
});

test("320px past unix expiry rejected panel names ZEC-USDT", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/trade", { waitUntil: "networkidle" });
  await page.getByRole("radio", { name: /ZEC \/ USDT|ZEC\/USDT/ }).click();

  await page.getByRole("textbox", { name: "Order size in ZEC" }).fill("1");
  await page.getByRole("textbox", { name: "Order expiry unix time" }).fill("1");
  await page.getByRole("button", { name: REVIEW_BUY }).click();

  const copy = ticketRejectCopy("Order expiry has passed", MARKET);
  expect(isTicketRejectCopy(copy)).toBe(true);

  const panel = page.getByRole("alert");
  await expect(panel.getByText("Order rejected", { exact: true })).toBeVisible();
  await expect(panel.getByText(`${copy} Retry is safe; nothing was submitted.`, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: COMPLETE_BUY })).toHaveCount(0);
  await expect(page.getByRole("button", { name: REVIEW_BUY })).toBeEnabled();
});

test("320px FOK reject panel retargets settlement after market switch", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/trade", { waitUntil: "networkidle" });

  await page.getByRole("button", { name: "FOK" }).click();
  await page.getByRole("textbox", { name: "Price in USDC" }).fill("52.91");
  await page.getByRole("textbox", { name: "Order size in ZEC" }).fill("100");
  await page.getByRole("button", { name: REVIEW_BUY }).click();
  await expect(page.getByRole("button", { name: COMPLETE_BUY })).toBeVisible();
  await page.getByRole("button", { name: COMPLETE_BUY }).click();

  const usdcCopy = describeSubmit(
    submitOrder(seedBook("ZEC/USDC"), {
      id: "taker",
      side: "buy",
      tif: "FOK",
      priceTicks: 5291n,
      sizeAtoms: 100_00000000n,
    }),
    "ZEC/USDC",
  );
  expect(isTicketRejectCopy(usdcCopy)).toBe(true);

  const panel = page.getByRole("alert");
  await expect(panel.getByText("Order rejected", { exact: true })).toBeVisible();
  await expect(panel.getByText(`${usdcCopy} Retry is safe; nothing was submitted.`, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: COMPLETE_BUY })).toHaveCount(0);

  await page.getByRole("radio", { name: /ZEC \/ USDT|ZEC\/USDT/ }).click();
  const usdtCopy = ticketRejectCopy("Fill-or-kill could not fill in full", MARKET);
  expect(isTicketRejectCopy(usdtCopy)).toBe(true);
  await expect(panel.getByText("Order rejected", { exact: true })).toBeVisible();
  await expect(panel.getByText(`${usdtCopy} Retry is safe; nothing was submitted.`, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: COMPLETE_BUY })).toHaveCount(0);
  await expect(page.getByRole("button", { name: REVIEW_BUY })).toBeEnabled();
});

test("320px expiry reject panel retargets settlement after market switch", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/trade", { waitUntil: "networkidle" });

  await page.getByRole("textbox", { name: "Order size in ZEC" }).fill("1");
  await page.getByRole("textbox", { name: "Order expiry unix time" }).fill("1");
  await page.getByRole("button", { name: REVIEW_BUY }).click();

  const usdcCopy = ticketRejectCopy("Order expiry has passed", "ZEC/USDC");
  expect(isTicketRejectCopy(usdcCopy)).toBe(true);
  const panel = page.getByRole("alert");
  await expect(panel.getByText("Order rejected", { exact: true })).toBeVisible();
  await expect(panel.getByText(`${usdcCopy} Retry is safe; nothing was submitted.`, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: COMPLETE_BUY })).toHaveCount(0);

  await page.getByRole("radio", { name: /ZEC \/ USDT|ZEC\/USDT/ }).click();
  const usdtCopy = ticketRejectCopy("Order expiry has passed", MARKET);
  expect(isTicketRejectCopy(usdtCopy)).toBe(true);
  await expect(panel.getByText("Order rejected", { exact: true })).toBeVisible();
  await expect(panel.getByText(`${usdtCopy} Retry is safe; nothing was submitted.`, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: COMPLETE_BUY })).toHaveCount(0);
  await expect(page.getByRole("button", { name: REVIEW_BUY })).toBeEnabled();
});
