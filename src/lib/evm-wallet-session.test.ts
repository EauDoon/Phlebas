import assert from "node:assert/strict";
import test from "node:test";

import {
  WALLET_SESSION_EVENTS_REQUIRED_COPY,
  subscribeReviewedWalletSession,
  supportsWalletSessionEvents,
  walletSessionInvalidationCopy,
  type Eip1193SessionProvider,
  type WalletSessionEventListener,
  type WalletSessionEventName,
  type WalletSessionInvalidation,
} from "./evm-wallet-session.ts";

const REVIEWED_ACCOUNT = "0x7e5f4552091a69125d5dfcb7b8c2659029395bdf";

class EventProvider implements Eip1193SessionProvider {
  private readonly listeners = new Map<WalletSessionEventName, Set<WalletSessionEventListener>>();

  on(event: WalletSessionEventName, listener: WalletSessionEventListener): void {
    const listeners = this.listeners.get(event) ?? new Set<WalletSessionEventListener>();
    listeners.add(listener);
    this.listeners.set(event, listeners);
  }

  removeListener(event: WalletSessionEventName, listener: WalletSessionEventListener): void {
    this.listeners.get(event)?.delete(listener);
  }

  emit(event: WalletSessionEventName, ...args: unknown[]): void {
    for (const listener of [...(this.listeners.get(event) ?? [])]) listener(...args);
  }

  listenerCount(): number {
    return [...this.listeners.values()].reduce((count, listeners) => count + listeners.size, 0);
  }
}

function subscribe(provider: EventProvider, invalidations: WalletSessionInvalidation[]) {
  return subscribeReviewedWalletSession(
    provider,
    { account: REVIEWED_ACCOUNT, chainId: "0x1" },
    (invalidation) => invalidations.push(invalidation),
  );
}

test("keeps the reviewed session valid for the same mainnet account", () => {
  const provider = new EventProvider();
  const invalidations: WalletSessionInvalidation[] = [];
  const subscription = subscribe(provider, invalidations);

  provider.emit("accountsChanged", [REVIEWED_ACCOUNT.toUpperCase().replace("0X", "0x")]);
  provider.emit("chainChanged", "0x1");

  assert.equal(subscription.isValid(), true);
  assert.deepEqual(invalidations, []);
  assert.equal(provider.listenerCount(), 3);
  subscription.dispose();
});

test("invalidates once when the selected account changes", () => {
  const provider = new EventProvider();
  const invalidations: WalletSessionInvalidation[] = [];
  const subscription = subscribe(provider, invalidations);

  provider.emit("accountsChanged", ["0x1111111111111111111111111111111111111111"]);
  provider.emit("disconnect", { code: 4900, message: "provider diagnostic" });

  assert.equal(subscription.isValid(), false);
  assert.deepEqual(invalidations, [{ event: "accountsChanged", reason: "account-changed" }]);
  assert.equal(provider.listenerCount(), 0);
});

test("invalidates on an empty or malformed account event", () => {
  for (const accounts of [[], ["not-an-address"], "not-an-array"]) {
    const provider = new EventProvider();
    const invalidations: WalletSessionInvalidation[] = [];
    const subscription = subscribe(provider, invalidations);

    provider.emit("accountsChanged", accounts);

    assert.equal(subscription.isValid(), false);
    assert.deepEqual(invalidations, [{ event: "accountsChanged", reason: "account-changed" }]);
  }
});

test("requires the exact Ethereum Mainnet chain event value", () => {
  for (const chainId of ["0x01", "0xa4b1", 1, null]) {
    const provider = new EventProvider();
    const invalidations: WalletSessionInvalidation[] = [];
    const subscription = subscribe(provider, invalidations);

    provider.emit("chainChanged", chainId);

    assert.equal(subscription.isValid(), false);
    assert.deepEqual(invalidations, [{ event: "chainChanged", reason: "chain-changed" }]);
    assert.equal(provider.listenerCount(), 0);
  }
});

test("invalidates on disconnect without exposing provider diagnostics", () => {
  const provider = new EventProvider();
  const invalidations: WalletSessionInvalidation[] = [];
  const subscription = subscribe(provider, invalidations);

  provider.emit("disconnect", { code: 4900, message: "private provider detail" });

  assert.equal(subscription.isValid(), false);
  assert.deepEqual(invalidations, [{ event: "disconnect", reason: "provider-disconnected" }]);
  assert.equal("message" in invalidations[0]!, false);
});

test("dispose stops observation and prevents reuse of the reviewed session", () => {
  const provider = new EventProvider();
  const invalidations: WalletSessionInvalidation[] = [];
  const subscription = subscribe(provider, invalidations);

  subscription.dispose();
  subscription.dispose();
  provider.emit("accountsChanged", ["0x1111111111111111111111111111111111111111"]);
  provider.emit("chainChanged", "0xa4b1");
  provider.emit("disconnect");

  assert.equal(subscription.isValid(), false);
  assert.deepEqual(invalidations, []);
  assert.equal(provider.listenerCount(), 0);
});

test("rejects an invalid reviewed session before registering listeners", () => {
  const provider = new EventProvider();

  assert.throws(
    () => subscribeReviewedWalletSession(
      provider,
      { account: "not-an-address", chainId: "0x1" },
      () => undefined,
    ),
    /20-byte EVM address/,
  );
  assert.throws(
    () => subscribeReviewedWalletSession(
      provider,
      { account: REVIEWED_ACCOUNT, chainId: "0xa4b1" as "0x1" },
      () => undefined,
    ),
    /chain 0x1/,
  );
  assert.equal(provider.listenerCount(), 0);
});

test("detects event-capable providers without invoking provider accessors", () => {
  const provider = new EventProvider();
  assert.equal(supportsWalletSessionEvents(provider), true);
  assert.equal(supportsWalletSessionEvents({ request() {} }), false);
  assert.equal(supportsWalletSessionEvents(null), false);
  assert.equal(supportsWalletSessionEvents(Object.defineProperty({}, "on", {
    get() { throw new Error("provider diagnostic"); },
  })), false);
});

test("session invalidation copy is allowlisted and contains no provider diagnostics", () => {
  assert.equal(
    walletSessionInvalidationCopy({ event: "accountsChanged", reason: "account-changed" }),
    "Wallet account changed. Reconnect to review again.",
  );
  assert.equal(
    walletSessionInvalidationCopy({ event: "chainChanged", reason: "chain-changed" }),
    "Wallet left Ethereum Mainnet. Reconnect on Ethereum Mainnet.",
  );
  assert.equal(
    walletSessionInvalidationCopy({ event: "disconnect", reason: "provider-disconnected" }),
    "Wallet disconnected. Reconnect to continue.",
  );
  assert.equal(WALLET_SESSION_EVENTS_REQUIRED_COPY, "Wallet cannot monitor account and network changes.");
});
