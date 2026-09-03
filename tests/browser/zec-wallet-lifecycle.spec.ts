import { expect, test } from "./fixtures";

test("a pending ZEC connection cannot survive closing and reopening the wallet dialog", async ({ page }) => {
  await page.addInitScript(() => {
    const account = "t1abLbcsgp6zvsgVRsHstzHqu34FmhjbW3r";
    const accountResolvers: Array<(accounts: string[]) => void> = [];
    const signResolvers: Array<(signature: string) => void> = [];
    const messages: string[] = [];
    let accountRequestCount = 0;
    Object.defineProperty(window, "__zecLifecycleHarness", {
      value: {
        messages,
        accountRequestCount: () => accountRequestCount,
        resolveAccounts(index: number) {
          accountResolvers[index]?.([account]);
        },
        resolveSign(index: number) {
          signResolvers[index]?.("invalid-nonempty-signature");
        },
      },
    });
    Object.defineProperty(window, "zcash", {
      configurable: true,
      value: {
        async request({ method, params }: { method: string; params?: { message?: string } }) {
          if (method === "zcash_requestAccounts") {
            accountRequestCount += 1;
            if (accountResolvers.length === 0) {
              return new Promise<string[]>((resolve) => accountResolvers.push(resolve));
            }
            return [account];
          }
          if (method === "zcash_accounts") return [account];
          if (method === "zcash_signMessage") {
            messages.push(params?.message ?? "");
            return new Promise<string>((resolve) => signResolvers.push(resolve));
          }
          throw new Error(`Unexpected wallet action: ${method}`);
        },
      },
    });
  });

  await page.goto("/", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Connect wallets" });
  await dialog.getByRole("button", { name: "Connect ZEC wallet", exact: true }).click();
  await expect.poll(() => page.evaluate(() => (
    (window as unknown as { __zecLifecycleHarness: { accountRequestCount(): number } }).__zecLifecycleHarness.accountRequestCount()
  ))).toBe(1);

  await dialog.getByRole("button", { name: "Close wallet dialog", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await dialog.getByRole("button", { name: "Connect ZEC wallet", exact: true }).click();
  await expect.poll(() => page.evaluate(() => (
    (window as unknown as { __zecLifecycleHarness: { messages: string[] } }).__zecLifecycleHarness.messages.length
  ))).toBe(1);

  await page.evaluate(() => {
    (window as unknown as { __zecLifecycleHarness: { resolveAccounts(index: number): void } }).__zecLifecycleHarness.resolveAccounts(0);
  });
  await expect.poll(() => page.evaluate(() => (
    (window as unknown as { __zecLifecycleHarness: { messages: string[] } }).__zecLifecycleHarness.messages.length
  ))).toBe(1);
  await expect(dialog.getByRole("button", { name: "Connecting…", exact: true })).toBeVisible();

  await page.evaluate(() => {
    (window as unknown as { __zecLifecycleHarness: { resolveSign(index: number): void } }).__zecLifecycleHarness.resolveSign(0);
  });
  await expect(dialog.getByRole("alert")).toHaveText(
    "The wallet signature does not verify for this ZEC account and challenge.",
  );
  await expect(dialog.getByRole("button", { name: "Disconnect ZEC wallet" })).toHaveCount(0);
});

test("a stale ZEC proof result cannot clear a newer connection attempt", async ({ page }) => {
  await page.addInitScript(() => {
    const account = "t1abLbcsgp6zvsgVRsHstzHqu34FmhjbW3r";
    const signResolvers: Array<(signature: string) => void> = [];
    const messages: string[] = [];
    Object.defineProperty(window, "__zecLifecycleHarness", {
      value: {
        messages,
        resolveSign(index: number) {
          signResolvers[index]?.("invalid-nonempty-signature");
        },
      },
    });
    Object.defineProperty(window, "zcash", {
      configurable: true,
      value: {
        async request({ method, params }: { method: string; params?: { message?: string } }) {
          if (method === "zcash_requestAccounts" || method === "zcash_accounts") return [account];
          if (method === "zcash_signMessage") {
            messages.push(params?.message ?? "");
            return new Promise<string>((resolve) => signResolvers.push(resolve));
          }
          throw new Error(`Unexpected wallet action: ${method}`);
        },
      },
    });
  });

  await page.goto("/", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Connect wallets" });
  await dialog.getByRole("button", { name: "Connect ZEC wallet", exact: true }).click();
  await expect.poll(() => page.evaluate(() => (
    (window as unknown as { __zecLifecycleHarness: { messages: string[] } }).__zecLifecycleHarness.messages.length
  ))).toBe(1);

  await dialog.getByRole("button", { name: "Close wallet dialog", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await dialog.getByRole("button", { name: "Connect ZEC wallet", exact: true }).click();
  await expect.poll(() => page.evaluate(() => (
    (window as unknown as { __zecLifecycleHarness: { messages: string[] } }).__zecLifecycleHarness.messages.length
  ))).toBe(2);

  await page.evaluate(() => {
    (window as unknown as { __zecLifecycleHarness: { resolveSign(index: number): void } }).__zecLifecycleHarness.resolveSign(0);
  });
  await expect(dialog.getByRole("button", { name: "Connecting…", exact: true })).toBeVisible();

  await page.evaluate(() => {
    (window as unknown as { __zecLifecycleHarness: { resolveSign(index: number): void } }).__zecLifecycleHarness.resolveSign(1);
  });
  await expect(dialog.getByRole("alert")).toHaveText(
    "The wallet signature does not verify for this ZEC account and challenge.",
  );
});

test("ZEC connection challenges are printable per-attempt nonces", async ({ page }) => {
  await page.addInitScript(() => {
    const account = "t1abLbcsgp6zvsgVRsHstzHqu34FmhjbW3r";
    const messages: string[] = [];
    Object.defineProperty(window, "__zecChallengeHarness", { value: { messages } });
    Object.defineProperty(window, "zcash", {
      configurable: true,
      value: {
        async request({ method, params }: { method: string; params?: { message?: string } }) {
          if (method === "zcash_requestAccounts") return [account];
          if (method === "zcash_signMessage") {
            messages.push(params?.message ?? "");
            return "invalid-nonempty-signature";
          }
          throw new Error(`Unexpected wallet action: ${method}`);
        },
      },
    });
  });

  await page.goto("/", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Connect wallets" });
  const connect = dialog.getByRole("button", { name: "Connect ZEC wallet", exact: true });
  await connect.click();
  await expect(dialog.getByRole("alert")).toHaveText(
    "The wallet signature does not verify for this ZEC account and challenge.",
  );
  await connect.click();
  await expect.poll(() => page.evaluate(() => (
    (window as unknown as { __zecChallengeHarness: { messages: string[] } }).__zecChallengeHarness.messages.length
  ))).toBe(2);
  await expect(dialog.getByRole("alert")).toHaveText(
    "The wallet signature does not verify for this ZEC account and challenge.",
  );

  const messages = await page.evaluate(() => (
    (window as unknown as { __zecChallengeHarness: { messages: string[] } }).__zecChallengeHarness.messages
  ));
  expect(messages).toHaveLength(2);
  expect(messages[0]).toMatch(/^phlebas-connect-challenge:[0-9a-f]{32}$/);
  expect(messages[1]).toMatch(/^phlebas-connect-challenge:[0-9a-f]{32}$/);
  expect(messages[0]).not.toBe(messages[1]);
});
