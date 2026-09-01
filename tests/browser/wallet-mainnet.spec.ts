import { ETHEREUM_MAINNET_CHAIN_HEX } from "../../src/lib/mainnet-assets.ts";
import { expect, test } from "./fixtures";

const METAMASK_UUID = "d9a04b1d-f5e2-40db-8f8a-9b4469c7471f";
const RABBY_UUID = "350670db-19fa-4704-a166-e52e178b59d2";
test("selects an EIP-6963 wallet and clears the reviewed session on provider drift", async ({ page }) => {
  await page.addInitScript((chainId) => {
    type Listener = (...args: unknown[]) => void;
    type WalletHarness = Readonly<{
      emit(rdns: string, event: string, payload?: unknown): void;
      calls: Record<string, string[]>;
      listenerCount(rdns: string): number;
    }>;

    const calls: Record<string, string[]> = { "io.metamask": [], "io.rabby": [] };
    const listeners = new Map<string, Map<string, Set<Listener>>>();
    const accounts: Record<string, string> = {
      "io.metamask": "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "io.rabby": "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    };

    function provider(rdns: string) {
      const walletListeners = new Map<string, Set<Listener>>();
      listeners.set(rdns, walletListeners);
      return {
        request({ method }: { method: string }) {
          calls[rdns]!.push(method);
          if (method === "eth_requestAccounts" || method === "eth_accounts") {
            return Promise.resolve([accounts[rdns]]);
          }
          if (method === "eth_chainId") return Promise.resolve(chainId);
          if (method === "wallet_switchEthereumChain") return Promise.resolve(null);
          return Promise.reject(new Error(method));
        },
        on(event: string, listener: Listener) {
          const eventListeners = walletListeners.get(event) ?? new Set<Listener>();
          eventListeners.add(listener);
          walletListeners.set(event, eventListeners);
        },
        removeListener(event: string, listener: Listener) {
          walletListeners.get(event)?.delete(listener);
        },
      };
    }

    const entries = [
      {
        info: {
          uuid: "350670db-19fa-4704-a166-e52e178b59d2",
          name: "Rabby Wallet",
          icon: "data:image/png;base64,AA==",
          rdns: "io.rabby",
        },
        provider: provider("io.rabby"),
      },
      {
        info: {
          uuid: "d9a04b1d-f5e2-40db-8f8a-9b4469c7471f",
          name: "MetaMask",
          icon: "data:image/png;base64,AA==",
          rdns: "io.metamask",
        },
        provider: provider("io.metamask"),
      },
    ];

    window.addEventListener("eip6963:requestProvider", () => {
      for (const entry of entries) {
        window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: entry }));
      }
    });

    const harness: WalletHarness = {
      calls,
      emit(rdns, event, payload) {
        for (const listener of [...(listeners.get(rdns)?.get(event) ?? [])]) listener(payload);
      },
      listenerCount(rdns) {
        return [...(listeners.get(rdns)?.values() ?? [])].reduce((total, entries) => total + entries.size, 0);
      },
    };
    Object.defineProperty(window, "__phlebasWalletHarness", { value: harness });
  }, ETHEREUM_MAINNET_CHAIN_HEX);

  await page.goto("/trade", { waitUntil: "networkidle" });
  const providerSelect = page.getByRole("combobox", { name: "EVM wallet provider" });
  await expect(providerSelect).toBeVisible();
  await expect(providerSelect).toHaveValue(METAMASK_UUID);
  await expect(providerSelect.locator("option")).toHaveText([
    "MetaMask (io.metamask)",
    "Rabby Wallet (io.rabby)",
  ]);

  await providerSelect.selectOption(RABBY_UUID);
  const connect = page.getByRole("button", { name: "Connect Ethereum Mainnet wallet" });
  await connect.click();
  await expect(page.getByRole("button", { name: "Disconnect 0xbbbb…bbbb. Settled as ZEC-USDC." })).toBeVisible();

  async function emit(event: "accountsChanged" | "chainChanged" | "disconnect", payload?: unknown) {
    await page.evaluate(({ eventName, eventPayload }) => {
      const harness = (window as unknown as {
        __phlebasWalletHarness: { emit(rdns: string, event: string, payload?: unknown): void };
      }).__phlebasWalletHarness;
      harness.emit("io.rabby", eventName, eventPayload);
    }, { eventName: event, eventPayload: payload });
  }

  await emit("accountsChanged", ["0x1111111111111111111111111111111111111111"]);
  await expect(connect).toBeVisible();
  await expect(page.getByRole("status", { name: "Wallet connection rejection" })).toHaveText(
    "Wallet account changed. Reconnect to review again. Settled as ZEC-USDC.",
  );

  await connect.click();
  await expect(page.getByRole("button", { name: "Disconnect 0xbbbb…bbbb. Settled as ZEC-USDC." })).toBeVisible();
  await emit("chainChanged", "0xa4b1");
  await expect(page.getByRole("status", { name: "Wallet connection rejection" })).toHaveText(
    "Wallet left Ethereum Mainnet. Reconnect on Ethereum Mainnet. Settled as ZEC-USDC.",
  );

  await connect.click();
  await expect(page.getByRole("button", { name: "Disconnect 0xbbbb…bbbb. Settled as ZEC-USDC." })).toBeVisible();
  await emit("disconnect", { code: 4900, message: "private provider detail" });
  await expect(page.getByRole("status", { name: "Wallet connection rejection" })).toHaveText(
    "Wallet disconnected. Reconnect to continue. Settled as ZEC-USDC.",
  );

  const calls = await page.evaluate(() => (
    (window as unknown as { __phlebasWalletHarness: { calls: Record<string, string[]> } })
      .__phlebasWalletHarness.calls
  ));
  expect(calls["io.metamask"]).toEqual([]);
  expect(calls["io.rabby"]).not.toContain("eth_sendTransaction");

  await connect.click();
  const disconnect = page.getByRole("button", { name: "Disconnect 0xbbbb…bbbb. Settled as ZEC-USDC." });
  await expect(disconnect).toBeVisible();
  await expect.poll(() => page.evaluate(() => (
    (window as unknown as {
      __phlebasWalletHarness: { listenerCount(rdns: string): number };
    }).__phlebasWalletHarness.listenerCount("io.rabby")
  ))).toBe(3);
  await page.getByRole("tab", { name: "Settlement" }).click();
  await expect(page).toHaveURL(/view=settlement/);
  await expect.poll(() => page.evaluate(() => (
    (window as unknown as {
      __phlebasWalletHarness: { listenerCount(rdns: string): number };
    }).__phlebasWalletHarness.listenerCount("io.rabby")
  ))).toBe(0);
  await page.getByRole("tab", { name: "Trade" }).click();
  await expect(page).toHaveURL(/view=trade/);
  await expect(connect).toBeVisible();
  await expect(disconnect).toHaveCount(0);
});

test("a pending wallet connection cannot survive leaving the wallet surface", async ({ page }) => {
  await page.addInitScript((chainId) => {
    type Listener = (...args: unknown[]) => void;
    let resolveFirstAccounts: ((accounts: string[]) => void) | null = null;
    let accountRequests = 0;
    const methods: string[] = [];
    const listeners = new Map<string, Set<Listener>>();
    const account = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const provider = {
      request({ method }: { method: string }) {
        methods.push(method);
        if (method === "eth_requestAccounts") {
          accountRequests += 1;
          if (accountRequests === 1) {
            return new Promise<string[]>((resolve) => {
              resolveFirstAccounts = resolve;
            });
          }
          return Promise.resolve([account]);
        }
        if (method === "eth_accounts") return Promise.resolve([account]);
        if (method === "eth_chainId") return Promise.resolve(chainId);
        if (method === "wallet_switchEthereumChain") return Promise.resolve(null);
        return Promise.reject(new Error(method));
      },
      on(event: string, listener: Listener) {
        const eventListeners = listeners.get(event) ?? new Set<Listener>();
        eventListeners.add(listener);
        listeners.set(event, eventListeners);
      },
      removeListener(event: string, listener: Listener) {
        listeners.get(event)?.delete(listener);
      },
    };
    Object.defineProperty(window, "ethereum", { configurable: true, value: provider });
    Object.defineProperty(window, "__phlebasPendingWalletHarness", {
      value: {
        resolveFirstAccounts() {
          resolveFirstAccounts?.([account]);
          resolveFirstAccounts = null;
        },
        methods,
        listenerCount() {
          return [...listeners.values()].reduce((total, entries) => total + entries.size, 0);
        },
      },
    });
  }, ETHEREUM_MAINNET_CHAIN_HEX);

  await page.goto("/trade", { waitUntil: "networkidle" });
  const connect = page.getByRole("button", { name: "Connect Ethereum Mainnet wallet" });
  await connect.click();
  await expect(connect).toHaveText("Connecting");

  await page.getByRole("tab", { name: "Settlement" }).click();
  await expect(page).toHaveURL(/view=settlement/);
  await expect(connect).toHaveCount(0);
  await page.evaluate(() => {
    (window as unknown as {
      __phlebasPendingWalletHarness: { resolveFirstAccounts(): void };
    }).__phlebasPendingWalletHarness.resolveFirstAccounts();
  });
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));

  await page.getByRole("tab", { name: "Trade" }).click();
  await expect(page).toHaveURL(/view=trade/);
  await expect(connect).toBeVisible();
  await expect(page.getByRole("button", { name: /Disconnect/ })).toHaveCount(0);
  expect(await page.evaluate(() => (
    (window as unknown as {
      __phlebasPendingWalletHarness: { listenerCount(): number };
    }).__phlebasPendingWalletHarness.listenerCount()
  ))).toBe(0);
});
