import { ETHEREUM_MAINNET_CHAIN_HEX } from "./mainnet-assets.ts";

export type WalletSessionEventName = "accountsChanged" | "chainChanged" | "disconnect";

export type WalletSessionEventListener = (...args: unknown[]) => void;

export type Eip1193SessionProvider = Readonly<{
  on(event: WalletSessionEventName, listener: WalletSessionEventListener): void;
  removeListener(event: WalletSessionEventName, listener: WalletSessionEventListener): void;
}>;

export type ReviewedWalletSession = Readonly<{
  account: string;
  chainId: typeof ETHEREUM_MAINNET_CHAIN_HEX;
}>;

export type WalletSessionInvalidation = Readonly<{
  event: WalletSessionEventName;
  reason: "account-changed" | "chain-changed" | "provider-disconnected";
}>;

export type WalletSessionSubscription = Readonly<{
  dispose(): void;
  isValid(): boolean;
}>;

function canonicalAccount(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(value)) {
    throw new TypeError(`${label} must be a 20-byte EVM address`);
  }
  return value.toLowerCase();
}

function currentAccount(accounts: unknown): string | null {
  if (!Array.isArray(accounts) || accounts.length === 0) return null;
  try {
    const canonicalAccounts = accounts.map((account) => canonicalAccount(account, "Provider account"));
    return canonicalAccounts[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Keeps a reviewed wallet session valid only while its exact selected account
 * and Ethereum Mainnet chain remain active. This helper observes provider
 * events only; it never requests a signature or submits a transaction.
 */
export function subscribeReviewedWalletSession(
  provider: Eip1193SessionProvider,
  reviewed: ReviewedWalletSession,
  onInvalidated: (invalidation: WalletSessionInvalidation) => void,
): WalletSessionSubscription {
  const reviewedAccount = canonicalAccount(reviewed.account, "Reviewed wallet account");
  if (reviewed.chainId !== ETHEREUM_MAINNET_CHAIN_HEX) {
    throw new Error("Reviewed wallet session must use Ethereum Mainnet chain 0x1");
  }

  let valid = true;
  let observing = true;
  const registered: Array<readonly [WalletSessionEventName, WalletSessionEventListener]> = [];

  const dispose = (): void => {
    observing = false;
    for (const [event, listener] of registered.splice(0)) {
      provider.removeListener(event, listener);
    }
  };

  const invalidate = (invalidation: WalletSessionInvalidation): void => {
    if (!valid) return;
    valid = false;
    dispose();
    onInvalidated(invalidation);
  };

  const accountsChanged: WalletSessionEventListener = (accounts) => {
    if (currentAccount(accounts) !== reviewedAccount) {
      invalidate({ event: "accountsChanged", reason: "account-changed" });
    }
  };
  const chainChanged: WalletSessionEventListener = (chainId) => {
    if (chainId !== ETHEREUM_MAINNET_CHAIN_HEX) {
      invalidate({ event: "chainChanged", reason: "chain-changed" });
    }
  };
  const disconnected: WalletSessionEventListener = () => {
    invalidate({ event: "disconnect", reason: "provider-disconnected" });
  };

  const register = (event: WalletSessionEventName, listener: WalletSessionEventListener): void => {
    provider.on(event, listener);
    registered.push([event, listener]);
  };

  try {
    register("accountsChanged", accountsChanged);
    register("chainChanged", chainChanged);
    register("disconnect", disconnected);
  } catch (error) {
    dispose();
    throw error;
  }

  return Object.freeze({
    dispose,
    isValid: () => valid && observing,
  });
}
