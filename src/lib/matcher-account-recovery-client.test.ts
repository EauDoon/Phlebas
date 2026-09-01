import assert from "node:assert/strict";
import test from "node:test";

import type { Eip1193Provider } from "./evm-wallet.ts";
import { evmAuthorizedSignerId } from "./matcher-auth.ts";
import {
  recoverMatcherAccountOrders,
  type MatcherAccountRecoveryFetch,
} from "./matcher-account-recovery-client.ts";
import { NATIVE_ZEC_USDC_MATCHER_DEPLOYMENT } from "./native-zec-usdc-matcher-manifest.ts";
import {
  NATIVE_ZEC_USDT_MATCHER_DEPLOYMENT,
  computeNativeZecUsdtMatcherConfigurationHash,
  parseNativeZecUsdtMatcherManifest,
} from "./native-zec-usdt-matcher-manifest.ts";

const NOW = 1_800_000_000n;
const CONTRACT = `0x${"11".repeat(20)}`;
const WALLET = "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266";
const RECORD_HASH = `0x${"22".repeat(32)}`;
const STATE_ROOT = `0x${"33".repeat(32)}`;

function deployment() {
  const source = NATIVE_ZEC_USDT_MATCHER_DEPLOYMENT.manifest;
  return parseNativeZecUsdtMatcherManifest({
    ...source,
    deployed: true,
    submissionEnabled: true,
    evm: { ...source.evm, verifyingContract: CONTRACT },
    configurationHash: computeNativeZecUsdtMatcherConfigurationHash(CONTRACT),
  });
}

function json(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
}

function provider(calls: string[]): Eip1193Provider {
  return {
    async request({ method, params }) {
      calls.push(method);
      if (method === "eth_requestAccounts" || method === "eth_accounts") return [WALLET];
      if (method === "eth_chainId") return "0x1";
      if (method === "eth_signTypedData_v4") {
        const typedData = JSON.parse(params?.[1] as string) as { primaryType?: unknown };
        assert.equal(typedData.primaryType, "RecoverOpenOrders");
        return `0x${"77".repeat(65)}`;
      }
      throw new Error(`unexpected provider call ${method}`);
    },
  };
}

function assertNoRetainedSignature(value: unknown): void {
  const seen = new Set<unknown>();
  const walk = (node: unknown): void => {
    if (node === null || typeof node !== "object" || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    for (const [key, nested] of Object.entries(node as Record<string, unknown>)) {
      assert.notEqual(key.toLowerCase(), "signature");
      walk(nested);
    }
  };
  walk(value);
}

test("tracked disabled manifests perform no recovery fetch or wallet request", async () => {
  for (const deployment of [NATIVE_ZEC_USDC_MATCHER_DEPLOYMENT, NATIVE_ZEC_USDT_MATCHER_DEPLOYMENT]) {
    const fetchCalls: string[] = [];
    const providerCalls: string[] = [];
    await assert.rejects(
      recoverMatcherAccountOrders({
        deployment,
        fetch: async (path) => {
          fetchCalls.push(String(path));
          throw new Error("must not fetch");
        },
        provider: provider(providerCalls),
      }),
      /disabled by the deployment manifest/,
    );
    assert.deepEqual(fetchCalls, []);
    assert.deepEqual(providerCalls, []);
  }
});

test("recovers exact paginated ZEC/USDT orders with one scoped signature per page", async () => {
  const active = deployment();
  const makerAccountId = evmAuthorizedSignerId(active.orderDomain!.chainId, WALLET);
  const checkpoint = {
    version: 1,
    sequence: "2",
    recordHash: RECORD_HASH,
    stateRoot: STATE_ROOT,
    configurationHash: active.configurationHash,
  };
  const paths: string[] = [];
  const proofBodies: Array<Record<string, unknown>> = [];
  let challengeNumber = 0;
  const fetcher: MatcherAccountRecoveryFetch = async (path, init) => {
    paths.push(String(path));
    const body = JSON.parse(init?.body as string) as Record<string, unknown>;
    if (String(path).includes("/challenge?")) {
      challengeNumber += 1;
      return json({
        ok: true,
        makerAccountId,
        configurationHash: active.configurationHash,
        checkpoint,
        afterSequence: body.afterSequence,
        limit: 1,
        challenge: `0x${String(challengeNumber).padStart(64, "0")}`,
        issuedAtSeconds: NOW.toString(),
        expiresAtSeconds: (NOW + 60n).toString(),
      });
    }
    proofBodies.push(body);
    const first = body.afterSequence === "0";
    const acceptedSequence = first ? "1" : "2";
    return json({
      ok: true,
      makerAccountId,
      configurationHash: active.configurationHash,
      accountEpoch: "7",
      afterSequence: body.afterSequence,
      nextAfter: acceptedSequence,
      hasMore: first,
      checkpoint,
      orders: [{
        version: 1,
        orderHash: `0x${(first ? "44" : "55").repeat(32)}`,
        acceptedSequence,
        makerAccountId,
        authorizedSignerId: makerAccountId,
        accountEpoch: "7",
        nonce: first ? "8" : "9",
        currentStatus: first ? "open" : "partially-filled",
        baseAmountAtoms: "100000000",
        remainingBaseAtoms: first ? "100000000" : "50000000",
        limitPriceTicks: "650000",
        expiry: "1800000600",
      }],
    });
  };
  const providerCalls: string[] = [];
  const recovered = await recoverMatcherAccountOrders({
    deployment: active,
    fetch: fetcher,
    provider: provider(providerCalls),
    limit: 1,
    clock: () => NOW,
  });

  assert.equal(recovered.deployment.manifest.market.id, "ZEC/USDT");
  assert.equal(recovered.checkpoint.sequence, 2n);
  assert.equal(recovered.accountEpoch, 7n);
  assert.deepEqual(recovered.orders.map((order) => [order.acceptedSequence, order.currentStatus]), [
    [1n, "open"],
    [2n, "partially-filled"],
  ]);
  assert.deepEqual(paths, [
    "/api/matcher/recovery/challenge?market=ZEC%2FUSDT",
    "/api/matcher/recovery/orders?market=ZEC%2FUSDT",
    "/api/matcher/recovery/challenge?market=ZEC%2FUSDT",
    "/api/matcher/recovery/orders?market=ZEC%2FUSDT",
  ]);
  assert.equal(providerCalls.filter((method) => method === "eth_signTypedData_v4").length, 2);
  assert.equal(proofBodies.every((body) => typeof body.signature === "string" && /^0x[0-9a-f]{130}$/.test(body.signature as string)), true);
  assert.equal(proofBodies.every((body) => body.configurationHash === active.configurationHash), true);
  assert.equal("signature" in recovered, false);
  assert.equal(recovered.orders.every((order) => !("signature" in order)), true);
  assertNoRetainedSignature(recovered);
  assert.equal(JSON.stringify(recovered, (_key, value) => typeof value === "bigint" ? value.toString() : value).includes("signature"), false);
  assert.equal(Object.isFrozen(recovered), true);
  assert.equal(Object.isFrozen(recovered.orders), true);
});

test("fails closed before a second signature when the checkpoint changes between pages", async () => {
  const active = deployment();
  const makerAccountId = evmAuthorizedSignerId(active.orderDomain!.chainId, WALLET);
  let challengeNumber = 0;
  const fetcher: MatcherAccountRecoveryFetch = async (path, init) => {
    const body = JSON.parse(init?.body as string) as Record<string, unknown>;
    if (String(path).includes("/challenge?")) {
      challengeNumber += 1;
      return json({
        ok: true,
        makerAccountId,
        configurationHash: active.configurationHash,
        checkpoint: {
          version: 1,
          sequence: challengeNumber === 1 ? "1" : "2",
          recordHash: challengeNumber === 1 ? RECORD_HASH : `0x${"99".repeat(32)}`,
          stateRoot: STATE_ROOT,
          configurationHash: active.configurationHash,
        },
        afterSequence: body.afterSequence,
        limit: 1,
        challenge: `0x${String(challengeNumber).padStart(64, "0")}`,
        issuedAtSeconds: NOW.toString(),
        expiresAtSeconds: (NOW + 60n).toString(),
      });
    }
    return json({
      ok: true,
      makerAccountId,
      configurationHash: active.configurationHash,
      accountEpoch: "7",
      afterSequence: "0",
      nextAfter: "1",
      hasMore: true,
      checkpoint: {
        version: 1,
        sequence: "1",
        recordHash: RECORD_HASH,
        stateRoot: STATE_ROOT,
        configurationHash: active.configurationHash,
      },
      orders: [{
        version: 1,
        orderHash: `0x${"44".repeat(32)}`,
        acceptedSequence: "1",
        makerAccountId,
        authorizedSignerId: makerAccountId,
        accountEpoch: "7",
        nonce: "8",
        currentStatus: "open",
        baseAmountAtoms: "100",
        remainingBaseAtoms: "100",
        limitPriceTicks: "650000",
        expiry: "1800000600",
      }],
    });
  };
  const providerCalls: string[] = [];
  await assert.rejects(
    recoverMatcherAccountOrders({
      deployment: active,
      fetch: fetcher,
      provider: provider(providerCalls),
      limit: 1,
      clock: () => NOW,
    }),
    /checkpoint changed between pages/,
  );
  assert.equal(providerCalls.filter((method) => method === "eth_signTypedData_v4").length, 1);
});

test("rejects a recovery page that retains a signature and keeps paging signature-free", async () => {
  const active = deployment();
  const makerAccountId = evmAuthorizedSignerId(active.orderDomain!.chainId, WALLET);
  const checkpoint = {
    version: 1,
    sequence: "1",
    recordHash: RECORD_HASH,
    stateRoot: STATE_ROOT,
    configurationHash: active.configurationHash,
  };
  const fetcher: MatcherAccountRecoveryFetch = async (path, init) => {
    const body = JSON.parse(init?.body as string) as Record<string, unknown>;
    if (String(path).includes("/challenge?")) {
      return json({
        ok: true,
        makerAccountId,
        configurationHash: active.configurationHash,
        checkpoint,
        afterSequence: body.afterSequence,
        limit: 1,
        challenge: `0x${"01".repeat(32)}`,
        issuedAtSeconds: NOW.toString(),
        expiresAtSeconds: (NOW + 60n).toString(),
      });
    }
    return json({
      ok: true,
      makerAccountId,
      configurationHash: active.configurationHash,
      accountEpoch: "7",
      afterSequence: "0",
      nextAfter: "1",
      hasMore: false,
      checkpoint,
      signature: `0x${"77".repeat(65)}`,
      orders: [{
        version: 1,
        orderHash: `0x${"44".repeat(32)}`,
        acceptedSequence: "1",
        makerAccountId,
        authorizedSignerId: makerAccountId,
        accountEpoch: "7",
        nonce: "8",
        currentStatus: "open",
        baseAmountAtoms: "100",
        remainingBaseAtoms: "100",
        limitPriceTicks: "650000",
        expiry: "1800000600",
      }],
    });
  };
  const providerCalls: string[] = [];
  await assert.rejects(
    recoverMatcherAccountOrders({
      deployment: active,
      fetch: fetcher,
      provider: provider(providerCalls),
      limit: 1,
      clock: () => NOW,
    }),
    /missing or unsupported fields/,
  );
  assert.equal(providerCalls.filter((method) => method === "eth_signTypedData_v4").length, 1);
});

test("fails closed at the page bound without retaining the scoped signature", async () => {
  const active = deployment();
  const makerAccountId = evmAuthorizedSignerId(active.orderDomain!.chainId, WALLET);
  const checkpoint = {
    version: 1,
    sequence: "2",
    recordHash: RECORD_HASH,
    stateRoot: STATE_ROOT,
    configurationHash: active.configurationHash,
  };
  let recovered: unknown;
  const fetcher: MatcherAccountRecoveryFetch = async (path, init) => {
    const body = JSON.parse(init?.body as string) as Record<string, unknown>;
    if (String(path).includes("/challenge?")) {
      return json({
        ok: true,
        makerAccountId,
        configurationHash: active.configurationHash,
        checkpoint,
        afterSequence: body.afterSequence,
        limit: 1,
        challenge: `0x${"01".repeat(32)}`,
        issuedAtSeconds: NOW.toString(),
        expiresAtSeconds: (NOW + 60n).toString(),
      });
    }
    return json({
      ok: true,
      makerAccountId,
      configurationHash: active.configurationHash,
      accountEpoch: "7",
      afterSequence: body.afterSequence,
      nextAfter: "1",
      hasMore: true,
      checkpoint,
      orders: [{
        version: 1,
        orderHash: `0x${"44".repeat(32)}`,
        acceptedSequence: "1",
        makerAccountId,
        authorizedSignerId: makerAccountId,
        accountEpoch: "7",
        nonce: "8",
        currentStatus: "open",
        baseAmountAtoms: "100",
        remainingBaseAtoms: "100",
        limitPriceTicks: "650000",
        expiry: "1800000600",
      }],
    });
  };
  const providerCalls: string[] = [];
  await assert.rejects(
    (async () => {
      recovered = await recoverMatcherAccountOrders({
        deployment: active,
        fetch: fetcher,
        provider: provider(providerCalls),
        limit: 1,
        maximumPages: 1,
        clock: () => NOW,
      });
    })(),
    /exceeded the approved page bound/,
  );
  assert.equal(recovered, undefined);
  assert.equal(providerCalls.filter((method) => method === "eth_signTypedData_v4").length, 1);
});
