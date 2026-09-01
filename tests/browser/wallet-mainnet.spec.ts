import {
  walletConnectBusyTitle,
  walletConnectFailureCopy,
  walletConnectIdleTitle,
  walletDisconnectLabel,
} from "../../src/lib/evm-wallet.ts";
import { walletSessionInvalidationCopy } from "../../src/lib/evm-wallet-session.ts";
import { ETHEREUM_MAINNET_CHAIN_HEX } from "../../src/lib/mainnet-assets.ts";
import { expect, test } from "./fixtures";

const METAMASK_UUID = "d9a04b1d-f5e2-40db-8f8a-9b4469c7471f";
const RABBY_UUID = "350670db-19fa-4704-a166-e52e178b59d2";
const RABBY_ACCOUNT = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const SETTLEMENT_PAIR = "ZEC-USDC" as const;
const CONNECT_WALLET = "Connect Ethereum Mainnet wallet";
const SIGNING_METHODS = [
  "eth_sendTransaction",
  "eth_sign",
  "eth_signTypedData",
  "eth_signTypedData_v4",
  "personal_sign",
  "wallet_sendCalls",
] as const;

function expectNoSigning(methods: readonly string[]) {
  for (const method of SIGNING_METHODS) {
    expect(methods, `wallet must not ${method}`).not.toContain(method);
  }
}

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
  await expect(page.getByText("Ethereum Mainnet", { exact: true })).toBeVisible();

  await providerSelect.selectOption(RABBY_UUID);
  const connect = page.getByRole("button", { name: CONNECT_WALLET });
  await expect(connect).toHaveText("Connect wallet");
  await expect(connect).toHaveAttribute("title", walletConnectIdleTitle(SETTLEMENT_PAIR));
  await connect.click();
  const disconnectLabel = walletDisconnectLabel(RABBY_ACCOUNT, SETTLEMENT_PAIR);
  await expect(page.getByRole("button", { name: disconnectLabel })).toBeVisible();
  await expect(page.getByRole("button", { name: "Disconnect 0xbbbb…bbbb. Settled as ZEC-USDC." })).toBeVisible();
  await expect(page.getByText("Ethereum Mainnet", { exact: true })).toBeVisible();

  async function emit(event: "accountsChanged" | "chainChanged" | "disconnect", payload?: unknown) {
    await page.evaluate(({ eventName, eventPayload }) => {
      const harness = (window as unknown as {
        __phlebasWalletHarness: { emit(rdns: string, event: string, payload?: unknown): void };
      }).__phlebasWalletHarness;
      harness.emit("io.rabby", eventName, eventPayload);
    }, { eventName: event, eventPayload: payload });
  }

  const accountChanged = walletConnectFailureCopy(
    walletSessionInvalidationCopy({ event: "accountsChanged", reason: "account-changed" }),
    SETTLEMENT_PAIR,
  );
  await emit("accountsChanged", ["0x1111111111111111111111111111111111111111"]);
  await expect(connect).toBeVisible();
  await expect(connect).toHaveText("Connect wallet");
  await expect(page.getByRole("status", { name: "Wallet connection rejection" })).toHaveText(
    "Wallet account changed. Reconnect to review again. Settled as ZEC-USDC.",
  );
  await expect(page.getByRole("status", { name: "Wallet connection rejection" })).toHaveText(accountChanged);
  await expect(connect).toHaveAttribute("title", accountChanged);

  await connect.click();
  await expect(page.getByRole("button", { name: "Disconnect 0xbbbb…bbbb. Settled as ZEC-USDC." })).toBeVisible();
  const leftMainnet = walletConnectFailureCopy(
    walletSessionInvalidationCopy({ event: "chainChanged", reason: "chain-changed" }),
    SETTLEMENT_PAIR,
  );
  await emit("chainChanged", "0xa4b1");
  await expect(page.getByRole("status", { name: "Wallet connection rejection" })).toHaveText(
    "Wallet left Ethereum Mainnet. Reconnect on Ethereum Mainnet. Settled as ZEC-USDC.",
  );
  await expect(page.getByRole("status", { name: "Wallet connection rejection" })).toHaveText(leftMainnet);
  await expect(connect).toHaveAttribute("title", leftMainnet);

  await connect.click();
  await expect(page.getByRole("button", { name: "Disconnect 0xbbbb…bbbb. Settled as ZEC-USDC." })).toBeVisible();
  const disconnected = walletConnectFailureCopy(
    walletSessionInvalidationCopy({ event: "disconnect", reason: "provider-disconnected" }),
    SETTLEMENT_PAIR,
  );
  await emit("disconnect", { code: 4900, message: "private provider detail" });
  await expect(page.getByRole("status", { name: "Wallet connection rejection" })).toHaveText(
    "Wallet disconnected. Reconnect to continue. Settled as ZEC-USDC.",
  );
  await expect(page.getByRole("status", { name: "Wallet connection rejection" })).toHaveText(disconnected);
  await expect(page.getByText("private provider detail")).toHaveCount(0);

  const calls = await page.evaluate(() => (
    (window as unknown as { __phlebasWalletHarness: { calls: Record<string, string[]> } })
      .__phlebasWalletHarness.calls
  ));
  expect(calls["io.metamask"]).toEqual([]);
  expect(calls["io.rabby"]).not.toContain("eth_sendTransaction");
  expectNoSigning(calls["io.rabby"] ?? []);

  await connect.click();
  const disconnect = page.getByRole("button", { name: "Disconnect 0xbbbb…bbbb. Settled as ZEC-USDC." });
  await expect(disconnect).toBeVisible();
  await expect.poll(() => page.evaluate(() => (
    (window as unknown as {
      __phlebasWalletHarness: { listenerCount(rdns: string): number };
    }).__phlebasWalletHarness.listenerCount("io.rabby")
  ))).toBe(3);
  await page
    .getByRole("navigation", { name: "Primary navigation" })
    .getByRole("link", { name: "Docs" })
    .click();
  await expect(page).toHaveURL(/view=architecture/);
  await page
    .getByRole("navigation", { name: "Settlement and launch" })
    .getByRole("link", { name: "How settlement works" })
    .click();
  await expect(page).toHaveURL(/view=settlement/);
  await expect.poll(() => page.evaluate(() => (
    (window as unknown as {
      __phlebasWalletHarness: { listenerCount(rdns: string): number };
    }).__phlebasWalletHarness.listenerCount("io.rabby")
  ))).toBe(0);
  await page
    .getByRole("navigation", { name: "Primary navigation" })
    .getByRole("link", { name: "Terminal" })
    .click();
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
  const connect = page.getByRole("button", { name: CONNECT_WALLET });
  await expect(connect).toHaveText("Connect wallet");
  await connect.click();
  await expect(connect).toHaveText("Connecting");
  await expect(connect).toBeDisabled();
  await expect(connect).toHaveAttribute("title", walletConnectBusyTitle(SETTLEMENT_PAIR));

  await page
    .getByRole("navigation", { name: "Primary navigation" })
    .getByRole("link", { name: "Docs" })
    .click();
  await expect(page).toHaveURL(/view=architecture/);
  await page
    .getByRole("navigation", { name: "Settlement and launch" })
    .getByRole("link", { name: "How settlement works" })
    .click();
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

  await page
    .getByRole("navigation", { name: "Primary navigation" })
    .getByRole("link", { name: "Terminal" })
    .click();
  await expect(page).toHaveURL(/view=trade/);
  await expect(connect).toBeVisible();
  await expect(connect).toHaveText("Connect wallet");
  await expect(connect).toBeEnabled();
  await expect(page.getByRole("button", { name: /Disconnect/ })).toHaveCount(0);
  expect(await page.evaluate(() => (
    (window as unknown as {
      __phlebasPendingWalletHarness: { listenerCount(): number };
    }).__phlebasPendingWalletHarness.listenerCount()
  ))).toBe(0);
  const pendingMethods = await page.evaluate(() => (
    (window as unknown as { __phlebasPendingWalletHarness: { methods: string[] } })
      .__phlebasPendingWalletHarness.methods
  ));
  expectNoSigning(pendingMethods);
});

test("a non-mainnet wallet stays disconnected on Ethereum Mainnet", async ({ page }) => {
  await page.addInitScript((mainnetChainId) => {
    const methods: string[] = [];
    const switchParams: unknown[] = [];
    const provider = {
      request({ method, params }: { method: string; params?: unknown }) {
        methods.push(method);
        if (method === "wallet_switchEthereumChain") {
          switchParams.push(params);
          return Promise.resolve(null);
        }
        if (method === "eth_requestAccounts" || method === "eth_accounts") {
          return Promise.resolve(["0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"]);
        }
        if (method === "eth_chainId") return Promise.resolve("0xa4b1");
        return Promise.reject(new Error(method));
      },
      on() {},
      removeListener() {},
    };
    Object.defineProperty(window, "ethereum", { configurable: true, value: provider });
    Object.defineProperty(window, "__phlebasWrongChainHarness", {
      value: { methods, switchParams, mainnetChainId },
    });
  }, ETHEREUM_MAINNET_CHAIN_HEX);

  await page.goto("/trade", { waitUntil: "networkidle" });
  const connect = page.getByRole("button", { name: CONNECT_WALLET });
  await expect(page.getByText("Ethereum Mainnet", { exact: true })).toBeVisible();
  await connect.click();
  const blocked = walletConnectFailureCopy(
    "Switch to Ethereum Mainnet. Other chains are blocked.",
    SETTLEMENT_PAIR,
  );
  await expect(page.getByRole("status", { name: "Wallet connection rejection" })).toHaveText(blocked);
  await expect(connect).toHaveText("Connect wallet");
  await expect(page.getByRole("button", { name: /Disconnect/ })).toHaveCount(0);
  await expect(connect).toHaveAttribute("title", blocked);

  const harness = await page.evaluate(() => (
    (window as unknown as {
      __phlebasWrongChainHarness: {
        methods: string[];
        switchParams: unknown[];
        mainnetChainId: string;
      };
    }).__phlebasWrongChainHarness
  ));
  expect(harness.methods).toContain("wallet_switchEthereumChain");
  expect(harness.switchParams).toEqual([[{ chainId: harness.mainnetChainId }]]);
  expect(harness.mainnetChainId).toBe("0x1");
  expectNoSigning(harness.methods);
});
