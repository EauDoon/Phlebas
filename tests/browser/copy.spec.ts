import { expect, test } from "./fixtures";

const routes = ["/", "/trade", "/liquidity", "/status"] as const;

function withoutHonestVisibleNegation(copy: string) {
  return copy
    .replace(/not (?:native ZEC, shielded ZEC, or )?a trustless bridge asset/gi, "")
    .replace(/\bnot trustless\b/gi, "")
    .replace(/\bdoes not provide shielded(?: deposits)?\b/gi, "")
    .replace(/\bNo shielded deposit or withdrawal is planned for v1\b/gi, "")
    .replace(/\bShielded ZEC stays out of scope\./gi, "")
    .replace(/\bnot a shielded market\b/gi, "")
    .replace(/\bShielded deposits, leverage, lending, and token incentives remain out of scope\./gi, "")
    .replace(/\bNative settlement target:[^.]*(?:\.|$)/gi, "")
    .replace(/\bnot the native-settlement target\b/gi, "");
}

for (const path of routes) {
  test(`${path} shows simulation disclosure and no banned live claims`, async ({ page }) => {
    await page.goto(path, { waitUntil: "networkidle" });
    await expect(page.getByRole("status", { name: "Simulation disclosure" })).toBeVisible();
    const text = withoutHonestVisibleNegation(await page.locator("body").innerText());
    expect(text).not.toMatch(/\btrustless\b/i);
    expect(text).not.toMatch(/\bshielded\b/i);
    expect(text).not.toMatch(/native-ZEC/i);
    expect(text).not.toMatch(/wallet-signed native[- ]ZEC atomic settlement/i);
    expect(text).not.toMatch(/\bis audited\b/i);
  });
}
