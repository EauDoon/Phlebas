import { expect, test } from "./fixtures";

test("a nonempty invalid ZEC signature cannot create a connected wallet session", async ({ page }) => {
  await page.addInitScript(() => {
    const calls: string[] = [];
    Object.defineProperty(window, "__zecProofCalls", { value: calls });
    Object.defineProperty(window, "zcash", {
      value: {
        async request({ method }: { method: string }) {
          calls.push(method);
          // Public synthetic address fixture; no wallet or key is involved.
          if (method === "zcash_requestAccounts") return ["t1abLbcsgp6zvsgVRsHstzHqu34FmhjbW3r"];
          if (method === "zcash_signMessage") return "invalid-nonempty-signature";
          throw new Error(`Unexpected wallet action: ${method}`);
        },
      },
    });
  });
  await page.goto("/", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Connect wallets" });
  await dialog.getByRole("button", { name: "Connect ZEC wallet", exact: true }).click();
  await expect(dialog.getByRole("alert")).toHaveText(
    "The wallet signature does not verify for this ZEC account and challenge.",
  );
  await expect(dialog.getByRole("button", { name: "Disconnect ZEC wallet" })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Connect ZEC wallet", exact: true })).toBeEnabled();
  expect(await page.evaluate(() => (window as unknown as { __zecProofCalls: string[] }).__zecProofCalls))
    .toEqual(["zcash_requestAccounts", "zcash_signMessage"]);
});
