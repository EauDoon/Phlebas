import { expect, PREVIEW_CHIP, test } from "./fixtures";

const routes = ["/", "/trade", "/liquidity", "/status", "/legal"] as const;

function withoutHonestNegation(copy: string) {
  return copy
    .replace(/not (?:native ZEC, shielded ZEC, or )?a trustless bridge(?: asset)?/gi, "")
    .replace(/\bnot trustless\b/gi, "")
    .replace(/\bdoes not provide shielded(?: deposits)?\b/gi, "")
    .replace(/\bNo shielded deposit or withdrawal is planned for v1\b/gi, "")
    .replace(/\bShielded ZEC stays out of scope\./gi, "")
    .replace(/\bnot a shielded market\b/gi, "")
    .replace(/\bShielded deposits, leverage, lending, and token incentives remain out of scope\./gi, "")
    .replace(/\bNative settlement target:[^.]*(?:\.|$)/gi, "")
    .replace(/\bnot the native-settlement target\b/gi, "")
    .replace(/\bnot live settlement\b/gi, "")
    .replace(/\bnot shielded\b/gi, "")
    .replace(/\bnot a trustless bridge\b/gi, "")
    .replace(/\bUSDT0 is abandoned\b/gi, "");
}

const SITE_FOOTER_SENTENCE =
  "Phlebas is not a live exchange and not an offer of financial services.";

for (const path of routes) {
  test(`${path} shows the public-preview chip, footer sentence, and no banned live claims`, async ({ page }) => {
    await page.goto(path, { waitUntil: "networkidle" });
    await expect(page.getByText(PREVIEW_CHIP, { exact: true })).toBeVisible();
    await expect(page.getByText(SITE_FOOTER_SENTENCE, { exact: true })).toBeVisible();
    const text = withoutHonestNegation(await page.locator("body").innerText());
    expect(text).not.toMatch(/\btrustless\b/i);
    expect(text).not.toMatch(/\bshielded-market\b/i);
    expect(text).not.toMatch(/native-ZEC/i);
    expect(text).not.toMatch(/wallet-signed native[- ]ZEC atomic settlement/i);
    expect(text).not.toMatch(/\bis audited\b/i);
    expect(text).not.toMatch(/\baccepts live funds\b/i);
    expect(text).not.toMatch(/pZEC is (?:native ZEC|live)/i);
    expect(text).not.toMatch(/USDT0 is (?:listed|live)/i);
  });
}
