import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createOrderDomain, hashTypedOrder, type TypedOrderIntent } from "../../src/lib/eip712-order.ts";
import { bytesToHex, keccak256, keccak256Text } from "../../src/lib/keccak.ts";
import { evmAuthorizedSignerId } from "../../src/lib/matcher-auth.ts";
import { MATCHER_CONFIGURATION_HEADER } from "../../src/lib/matcher-http.ts";
import { matcherConfigurationHash, type PersistentMatcherConfiguration, type PersistentMatcherEvent } from "../../src/lib/persistent-matcher.ts";
import { adapterIdentifier, accountIdentifier, chainIdentifier, assetIdentifier, type Hex32 } from "../../src/lib/order-domain.ts";
import { hash160Value, p2pkhAddress } from "../../src/lib/zcash-address.ts";
import { VENUE_CLOB } from "../../src/lib/order-policy.ts";
import { recoverAddress } from "../../src/lib/secp256k1.ts";
import {
  computeNativeZecUsdcMatcherConfigurationHash,
  NATIVE_ZEC_USDC_MATCHER_DEPLOYMENT,
  parseNativeZecUsdcMatcherManifest,
} from "../../src/lib/native-zec-usdc-matcher-manifest.ts";
import { nativeZecUsdcMatcherPersistentConfiguration } from "./native-zec-usdc-configuration.ts";
import { serializePersistentMatcherEvent } from "./persistent-store.ts";
import { startMatcher } from "./server.ts";
import { compactSignature, publicKeyBytes, signDigestRfc6979 } from "./signed-order-e2e.rfc6979.ts";

/**
 * End-to-end evidence for the integration target: a genuinely signed USDC
 * buy-side order — real secp256k1 ECDSA over the real EIP-712 order digest,
 * against the real manifest-derived matcher configuration — accepted by the
 * persistent matcher running with its production verifier, then re-verified
 * during deterministic journal replay into a fresh process.
 *
 * The signing key exists only inside this test. No signing capability is
 * added to any production module: the browser-side signing path remains the
 * wallet's, and the matcher still cannot sign, broadcast, or move funds.
 */

const NOW = 1_800_000_000n;
const CONTRACT = `0x${"11".repeat(20)}`;

// The committed ZEC/USDC manifest identity is enabled the same way the
// client workflow tests enable it: no contract exists, so this is local
// no-value evidence against the exact production configuration builder.
function enabledDeployment() {
  const source = NATIVE_ZEC_USDC_MATCHER_DEPLOYMENT.manifest as unknown as Record<string, unknown>;
  const manifest = {
    ...source,
    deployed: true,
    submissionEnabled: true,
    evm: { ...(source.evm as Record<string, unknown>), verifyingContract: CONTRACT },
    configurationHash: computeNativeZecUsdcMatcherConfigurationHash(CONTRACT),
  };
  return parseNativeZecUsdcMatcherManifest(manifest);
}

function configurationFor(): PersistentMatcherConfiguration {
  const configuration = nativeZecUsdcMatcherPersistentConfiguration(enabledDeployment());
  assert.ok(configuration, "the enabled ZEC/USDC manifest must yield a persistent configuration");
  return configuration;
}

// --- test-only secp256k1 signing (never used in production modules) ---

// A fixed, well-known test-only scalar (Hardhat account #0's key). It holds
// nothing and authorizes nothing outside this test run.
const PRIVATE_KEY = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80n;
const publicKeyRaw = publicKeyBytes(PRIVATE_KEY);
const SIGNER_ADDRESS = ("0x" + bytesToHex(keccak256(publicKeyRaw)).slice(-40)) as `0x${string}`;
const SIGNER_ID = evmAuthorizedSignerId(1n, SIGNER_ADDRESS);

function signDigest(digest: Hex32): string {
  const signature = signDigestRfc6979(PRIVATE_KEY, Buffer.from(digest.slice(2), "hex"));
  return compactSignature(signature);
}

// --- order construction on the exact ZEC/USDC market identity ---
// Every chain, asset, and adapter identity is derived from the
// manifest-built configuration, so the order cannot drift from it.

function buyOrder(configuration: PersistentMatcherConfiguration, nonce: bigint): TypedOrderIntent {
  const pair = configuration.atomicSwapPolicy.pair;
  // The Zcash settlement account URI scheme is "zcash:mainnet:<address>".
  const zcashRecipient = `zcash:mainnet:${p2pkhAddress(hash160Value(new TextEncoder().encode(`e2e:${nonce}`)), "mainnet")}`;
  return {
    makerAccountId: SIGNER_ID,
    authorizedSignerId: SIGNER_ID,
    recipientAccountId: accountIdentifier(zcashRecipient),
    baseChainId: chainIdentifier(pair.base.network),
    baseAssetId: assetIdentifier(pair.base.asset),
    quoteChainId: chainIdentifier(pair.quote.network),
    quoteAssetId: assetIdentifier(pair.quote.asset),
    side: 0,
    baseAmountAtoms: 100_000_000n,
    limitPriceTicks: 5_291n,
    nonce,
    accountEpoch: 0n,
    expiry: NOW + 5_000n,
    salt: keccak256Text(`signed-order-e2e-${nonce}`),
    timeInForce: 0,
    maximumFeeBps: 0n,
    allowedVenues: VENUE_CLOB,
    settlementAdapterId: adapterIdentifier("transparent-htlc-v1"),
  };
}

function zcashRecipientFor(configuration: PersistentMatcherConfiguration, nonce: bigint): string {
  void configuration;
  return `zcash:mainnet:${p2pkhAddress(hash160Value(new TextEncoder().encode(`e2e:${nonce}`)), "mainnet")}`;
}

function sourceAccountFor(configuration: PersistentMatcherConfiguration, nonce: bigint): string {
  void nonce;
  const quoteNetwork = configuration.atomicSwapPolicy.pair.quote.network;
  return `${quoteNetwork}:${SIGNER_ADDRESS}`;
}

function acceptOrderEvent(configuration: PersistentMatcherConfiguration, requestId: string, nonce: bigint): Extract<PersistentMatcherEvent, { kind: "accept-order" }> {
  const order = buyOrder(configuration, nonce);
  const digest = hashTypedOrder(configuration.domain, order);
  const signature = signDigest(digest);
  return {
    version: 1,
    requestId,
    occurredAtSeconds: NOW,
    kind: "accept-order",
    submission: {
      order,
      signature,
      accounts: {
        sourceAccount: sourceAccountFor(configuration, nonce),
        recipientAccount: zcashRecipientFor(configuration, nonce),
      },
    },
  };
}

function payload(configuration: PersistentMatcherConfiguration, value: PersistentMatcherEvent): unknown {
  return serializePersistentMatcherEvent(configuration, value).payload;
}

function mutationHeaders(configuration: PersistentMatcherConfiguration, requestId: string): Record<string, string> {
  return {
    "content-type": "application/json",
    "idempotency-key": requestId,
    [MATCHER_CONFIGURATION_HEADER]: matcherConfigurationHash(configuration),
  };
}

async function listen(server: Server): Promise<string> {
  await once(server, "listening");
  const address = server.address();
  assert.ok(address !== null && typeof address === "object");
  return `http://127.0.0.1:${address.port}`;
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => server.close((error?: Error) => (error ? reject(error) : resolve())));
}

async function json(response: Response): Promise<unknown> {
  return (await response.json()) as unknown;
}

test("accepts a genuinely signed USDC buy-side order and replays it through a fresh process", async () => {
  const configuration = configurationFor();
  assert.equal(configuration.domain.chainId, 1n);
  const directory = await mkdtemp(join(tmpdir(), "phlebas-signed-order-e2e-"));
  let server = startMatcher({
    host: "127.0.0.1",
    port: 0,
    dataDirectory: directory,
    configuration,
    clockSeconds: () => NOW,
  });
  let origin = await listen(server);
  try {
    // The default verifier is the production EVM EOA verifier; no stub is injected.
    const accepted = await fetch(`${origin}/v1/orders`, {
      method: "POST",
      headers: mutationHeaders(configuration, `order-${"ab".repeat(32)}`),
      body: JSON.stringify(payload(configuration, acceptOrderEvent(configuration, `order-${"ab".repeat(32)}`, 1n))),
    });
    assert.equal(accepted.status, 201);
    const acceptedBody = await json(accepted) as { replayed: boolean; receiptCheckpoint: { sequence: string } };
    assert.equal(acceptedBody.replayed, false);
    assert.equal(acceptedBody.receiptCheckpoint.sequence, "2");

    const health = await json(await fetch(`${origin}/health`)) as { sequence: string; stateRoot: string };
    assert.equal(health.sequence, "2");
    const stateRoot = health.stateRoot;

    // A tampered signature must fail closed before persistence: the real
    // verifier recovers the wrong signer and the journal stays unchanged.
    const event = acceptOrderEvent(configuration, `order-${"cd".repeat(32)}`, 2n);
    const tamperedSignature = ("0x" + event.submission.signature.slice(2, 66) + "ee" + event.submission.signature.slice(68)) as Hex32;
    const rejected = await fetch(`${origin}/v1/orders`, {
      method: "POST",
      headers: mutationHeaders(configuration, `order-${"cd".repeat(32)}`),
      body: JSON.stringify(payload(configuration, { ...event, submission: { ...event.submission, signature: tamperedSignature } })),
    });
    assert.equal(rejected.status, 400);
    const afterRejection = await json(await fetch(`${origin}/health`)) as { sequence: string };
    assert.equal(afterRejection.sequence, "2");

    const book = await json(await fetch(`${origin}/v1/market/book`)) as { book: { bids: unknown[] } };
    assert.equal(book.book.bids.length, 1);

    await close(server);

    // Deterministic replay into a fresh process re-verifies the journaled
    // signature with the production verifier and reproduces the state root.
    server = startMatcher({
      host: "127.0.0.1",
      port: 0,
      dataDirectory: directory,
      configuration,
      clockSeconds: () => NOW,
    });
    origin = await listen(server);
    const replayed = await json(await fetch(`${origin}/health`)) as { sequence: string; stateRoot: string };
    assert.equal(replayed.sequence, "2");
    assert.equal(replayed.stateRoot, stateRoot);
    const account = await json(await fetch(`${origin}/v1/accounts/${SIGNER_ID}`)) as { ok: boolean; accountEpoch: string };
    assert.equal(account.ok, true);
    assert.equal(account.accountEpoch, "0");
  } finally {
    if (server.listening) await close(server);
    await rm(directory, { recursive: true, force: true });
  }
});
