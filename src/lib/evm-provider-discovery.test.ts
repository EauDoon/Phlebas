import assert from "node:assert/strict";
import test from "node:test";

import type { Eip1193Provider } from "./evm-wallet.ts";
import {
  EIP6963_ANNOUNCE_EVENT,
  EIP6963_REQUEST_EVENT,
  discoverEip6963Providers,
  selectEip6963Provider,
  type Eip6963ProviderDetail,
} from "./evm-provider-discovery.ts";

function provider(label: string): Eip1193Provider {
  return { async request() { return label; } };
}

function announce(target: EventTarget, detail: unknown): void {
  const event = new Event(EIP6963_ANNOUNCE_EVENT) as Event & { detail?: unknown };
  Object.defineProperty(event, "detail", { configurable: false, enumerable: true, value: detail });
  target.dispatchEvent(event);
}

function detail(overrides: Partial<Eip6963ProviderDetail["info"]> = {}): Eip6963ProviderDetail {
  return {
    info: {
      uuid: "350670db-19fa-4704-a166-e52e178b59d2",
      name: "Rabby Wallet",
      icon: "data:image/png;base64,AA==",
      rdns: "io.rabby",
      ...overrides,
    },
    provider: provider("rabby"),
  };
}

test("discovers, validates, deduplicates, and sorts EIP-6963 wallets", async () => {
  const target = new EventTarget();
  target.addEventListener(EIP6963_REQUEST_EVENT, () => {
    announce(target, detail());
    announce(target, detail());
    announce(target, detail({
      uuid: "d9a04b1d-f5e2-40db-8f8a-9b4469c7471f",
      name: "MetaMask",
      rdns: "io.metamask",
    }));
    announce(target, detail({ uuid: "not-a-uuid", rdns: "injected" }));
  });

  const providers = await discoverEip6963Providers(target, 0);
  assert.equal(providers.length, 2);
  assert.deepEqual(providers.map((entry) => entry.info.rdns), ["io.metamask", "io.rabby"]);
  assert.equal(Object.isFrozen(providers), true);
  assert.equal(Object.isFrozen(providers[0]?.info), true);
  assert.equal(selectEip6963Provider(providers, "IO.RABBY")?.info.name, "Rabby Wallet");
  assert.equal(selectEip6963Provider(providers, "com.example.missing"), null);
});

test("discovery is server-safe and rejects unsafe wait or wallet identifiers", async () => {
  assert.deepEqual(await discoverEip6963Providers(null), []);
  await assert.rejects(() => discoverEip6963Providers(new EventTarget(), -1), /integer from 0 to 1000/);
  assert.throws(() => selectEip6963Provider([], "not rdns"), /RDNS is invalid/);
});
