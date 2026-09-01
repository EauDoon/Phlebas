import assert from "node:assert/strict";
import test from "node:test";

import type { Eip1193Provider } from "./evm-wallet.ts";
import { hashTypedOrder } from "./eip712-order.ts";
import { evmAuthorizedSignerId } from "./matcher-auth.ts";
import {
  NATIVE_ZEC_USDC_MATCHER_DEPLOYMENT,
  computeNativeZecUsdcMatcherConfigurationHash,
  parseNativeZecUsdcMatcherManifest,
} from "./native-zec-usdc-matcher-manifest.ts";
import {
  MatcherOrderWorkflowError,
  confirmMatcherBuyOrder,
  retryMatcherBuyOrder,
  reviewMatcherBuyOrder,
  type MatcherOrderFetch,
  type ReviewedMatcherBuyOrder,
  type ReviewMatcherBuyOrderInput,
} from "./matcher-order-workflow.ts";
import { hash160Value, p2shAddress } from "./zcash-address.ts";

const NOW = 1_800_000_000n;
const CONTRACT = `0x${"11".repeat(20)}`;
const WALLET = "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266";
const PRIVATE_KEY = BigInt("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
const CURVE_ORDER = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const CURVE_GX = 0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n;
const RECIPIENT = p2shAddress(hash160Value(new TextEncoder().encode("matcher-order-workflow")), "mainnet");

function mod(value: bigint, modulus: bigint): bigint {
  const remainder = value % modulus;
  return remainder < 0n ? remainder + modulus : remainder;
}

// A fixed test-only secp256k1 nonce makes an EIP-712 vector for the injected wallet.
function signDigest(digest: `0x${string}`): string {
  const r = CURVE_GX;
  let s = mod(mod(BigInt(digest), CURVE_ORDER) + (r * PRIVATE_KEY), CURVE_ORDER);
  let v = 27;
  if (s > CURVE_ORDER / 2n) {
    s = CURVE_ORDER - s;
    v = 28;
  }
  return `0x${r.toString(16).padStart(64, "0")}${s.toString(16).padStart(64, "0")}${v.toString(16)}`;
}

function deployment() {
  const source = NATIVE_ZEC_USDC_MATCHER_DEPLOYMENT.manifest;
  const manifest = {
    ...source,
    deployed: true,
    submissionEnabled: true,
    evm: { ...source.evm, verifyingContract: CONTRACT },
    configurationHash: computeNativeZecUsdcMatcherConfigurationHash(CONTRACT),
  };
  return parseNativeZecUsdcMatcherManifest(manifest);
}

function health(active = deployment()) {
  return {
    ok: true,
    matcher: "persistent-native-v1",
    configured: true,
    acceptingMutations: true,
    mode: "no-value",
    custody: false,
    configurationHash: active.configurationHash,
    market: active.market,
  };
}

function account(active = deployment(), sequence = "9") {
  const makerAccountId = evmAuthorizedSignerId(active.orderDomain!.chainId, WALLET);
  const recordHash = sequence === "9" ? `0x${"33".repeat(32)}` : `0x${"55".repeat(32)}`;
  return {
    ok: true,
    makerAccountId,
    configurationHash: active.configurationHash,
    accountEpoch: "7",
    sequence,
    checkpoint: {
      version: 1,
      sequence,
      recordHash,
      stateRoot: `0x${"44".repeat(32)}`,
      configurationHash: active.configurationHash,
    },
  };
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

function reviewInput(
  active: ReturnType<typeof deployment>,
  provider: Eip1193Provider,
  fetcher: MatcherOrderFetch,
): ReviewMatcherBuyOrderInput {
  return {
    deployment: active,
    provider,
    fetch: fetcher,
    selectedMarket: "ZEC/USDC",
    zcashRecipient: RECIPIENT,
    priceTicks: 650_000n,
    sizeAtoms: 100_000_000n,
    occurredAt: NOW,
    expiresAt: NOW + 600n,
    nonce: 3n,
    salt: `0x${"66".repeat(32)}`,
  };
}

function provider(calls: string[], review: () => ReviewedMatcherBuyOrder | null): Eip1193Provider {
  return {
    async request({ method, params }) {
      calls.push(method);
      if (method === "eth_requestAccounts" || method === "eth_accounts") return [WALLET.toUpperCase().replace("0X", "0x")];
      if (method === "eth_chainId") return "0xa4b1";
      if (method === "eth_signTypedData_v4") {
        const current = review();
        assert.ok(current);
        assert.deepEqual(JSON.parse(params?.[1] as string), current.draft.typedOrderData);
        return signDigest(hashTypedOrder(current.deployment.orderDomain!, current.draft.order));
      }
      throw new Error(`unexpected provider RPC ${method}`);
    },
  };
}

function receipt(
  review: ReviewedMatcherBuyOrder,
  occurredAtSeconds = review.draft.occurredAt,
  currentSequence = "10",
) {
  const subjectHash = hashTypedOrder(review.deployment.orderDomain!, review.draft.order);
  return {
    ok: true,
    replayed: false,
    receipt: {
      version: 1,
      sequence: "10",
      requestId: review.draft.requestId,
      kind: "accept-order",
      status: "open",
      subjectHash,
      occurredAtSeconds: occurredAtSeconds.toString(),
    },
    receiptCheckpoint: {
      version: 1,
      sequence: "10",
      recordHash: `0x${"77".repeat(32)}`,
      stateRoot: `0x${"88".repeat(32)}`,
      configurationHash: review.deployment.configurationHash,
    },
    checkpoint: {
      version: 1,
      sequence: currentSequence,
      recordHash: `0x${(currentSequence === "10" ? "77" : "99").repeat(32)}`,
      stateRoot: `0x${(currentSequence === "10" ? "88" : "aa").repeat(32)}`,
      configurationHash: review.deployment.configurationHash,
    },
  };
}

test("disabled review performs no fetch or provider call", async () => {
  const fetchCalls: string[] = [];
  const providerCalls: string[] = [];
  const fetcher: MatcherOrderFetch = async (path) => {
    fetchCalls.push(String(path));
    throw new Error("must not fetch");
  };
  const injected = provider(providerCalls, () => null);
  await assert.rejects(
    () => reviewMatcherBuyOrder(reviewInput(NATIVE_ZEC_USDC_MATCHER_DEPLOYMENT, injected, fetcher)),
    (error: unknown) => error instanceof MatcherOrderWorkflowError && error.phase === "before-sign",
  );
  assert.deepEqual(fetchCalls, []);
  assert.deepEqual(providerCalls, []);
});

test("review fetches no-store matcher state, connects the manifest wallet, and freezes the draft", async () => {
  const active = deployment();
  const fetchCalls: Array<Readonly<{ path: string; init: RequestInit | undefined }>> = [];
  const maker = evmAuthorizedSignerId(active.orderDomain!.chainId, WALLET);
  const fetcher: MatcherOrderFetch = async (path, init) => {
    fetchCalls.push({ path: String(path), init });
    if (String(path) === "/api/matcher") return json(health(active));
    if (String(path) === `/api/matcher?account=${maker}`) return json(account(active));
    throw new Error(String(path));
  };
  let reviewed: ReviewedMatcherBuyOrder | null = null;
  const providerCalls: string[] = [];
  reviewed = await reviewMatcherBuyOrder(reviewInput(active, provider(providerCalls, () => reviewed), fetcher));
  assert.equal(reviewed.makerAccountId, maker);
  assert.equal(reviewed.draft.order.accountEpoch, 7n);
  assert.equal(Object.isFrozen(reviewed), true);
  assert.deepEqual(fetchCalls.map(({ path, init }) => [path, init?.method, init?.cache]), [
    ["/api/matcher", "GET", "no-store"],
    [`/api/matcher?account=${maker}`, "GET", "no-store"],
  ]);
  assert.deepEqual(providerCalls, ["eth_requestAccounts", "eth_chainId", "eth_chainId", "eth_accounts"]);
});

test("confirmation rejects matcher-account drift before it signs or posts", async () => {
  const active = deployment();
  const maker = evmAuthorizedSignerId(active.orderDomain!.chainId, WALLET);
  let accountReads = 0;
  let postCalls = 0;
  const fetcher: MatcherOrderFetch = async (path, init) => {
    if (String(path) === "/api/matcher") return json(health(active));
    if (String(path) === `/api/matcher?account=${maker}`) {
      accountReads += 1;
      return json(account(active, accountReads === 1 ? "9" : "10"));
    }
    if (init?.method === "POST") {
      postCalls += 1;
      throw new Error("must not post");
    }
    throw new Error(String(path));
  };
  let reviewed: ReviewedMatcherBuyOrder | null = null;
  const providerCalls: string[] = [];
  const injected = provider(providerCalls, () => reviewed);
  reviewed = await reviewMatcherBuyOrder(reviewInput(active, injected, fetcher));
  await assert.rejects(
    () => confirmMatcherBuyOrder({ fetch: fetcher, provider: injected, review: reviewed! }),
    (error: unknown) => error instanceof MatcherOrderWorkflowError
      && error.phase === "before-sign"
      && /state changed/.test(error.message),
  );
  assert.equal(providerCalls.includes("eth_signTypedData_v4"), false);
  assert.equal(postCalls, 0);
});

test("confirmation signs only the reviewed EIP-712 order, posts exact bytes, and binds its receipt", async () => {
  const active = deployment();
  const maker = evmAuthorizedSignerId(active.orderDomain!.chainId, WALLET);
  const postBodies: string[] = [];
  const postHeaders: unknown[] = [];
  let reviewed: ReviewedMatcherBuyOrder | null = null;
  const fetcher: MatcherOrderFetch = async (path, init) => {
    if (String(path) === "/api/matcher" && init?.method === "GET") return json(health(active));
    if (String(path) === `/api/matcher?account=${maker}`) return json(account(active));
    if (String(path) === "/api/matcher" && init?.method === "POST") {
      postBodies.push(init.body as string);
      postHeaders.push(init.headers);
      return json(receipt(reviewed!, reviewed!.draft.occurredAt + 2n));
    }
    throw new Error(String(path));
  };
  const providerCalls: string[] = [];
  const injected = provider(providerCalls, () => reviewed);
  reviewed = await reviewMatcherBuyOrder(reviewInput(active, injected, fetcher));
  const confirmed = await confirmMatcherBuyOrder({ fetch: fetcher, provider: injected, review: reviewed });
  assert.equal(confirmed.kind, "confirmed");
  assert.equal(confirmed.receipt.receipt.subjectHash, hashTypedOrder(active.orderDomain!, reviewed.draft.order));
  assert.equal(confirmed.receipt.receipt.occurredAtSeconds, reviewed.draft.occurredAt + 2n);
  assert.equal(postBodies.length, 1);
  assert.equal(postBodies[0], confirmed.request.body);
  assert.deepEqual(postHeaders[0], confirmed.request.headers);
  assert.equal(providerCalls.filter((call) => call === "eth_signTypedData_v4").length, 1);
  assert.equal(providerCalls.some((call) => /sendTransaction|approve|estimateGas|call/.test(call)), false);
});

test("definite POST rejection and unknown signed receipt retain a safe exact retry", async () => {
  const active = deployment();
  const maker = evmAuthorizedSignerId(active.orderDomain!.chainId, WALLET);
  let reviewed: ReviewedMatcherBuyOrder | null = null;
  let postAttempt = 0;
  const postBodies: string[] = [];
  const fetcher: MatcherOrderFetch = async (path, init) => {
    if (String(path) === "/api/matcher" && init?.method === "GET") return json(health(active));
    if (String(path) === `/api/matcher?account=${maker}`) return json(account(active));
    if (String(path) === "/api/matcher" && init?.method === "POST") {
      postAttempt += 1;
      postBodies.push(init.body as string);
      if (postAttempt === 1) return json({ ok: false, reason: "matcher-rejected-order" }, 422);
      if (postAttempt === 2) throw new Error("response lost after signed POST");
      return json(receipt(reviewed!, reviewed!.draft.occurredAt, "12"));
    }
    throw new Error(String(path));
  };
  const providerCalls: string[] = [];
  const injected = provider(providerCalls, () => reviewed);
  reviewed = await reviewMatcherBuyOrder(reviewInput(active, injected, fetcher));
  const rejected = await confirmMatcherBuyOrder({ fetch: fetcher, provider: injected, review: reviewed });
  assert.equal(rejected.kind, "rejected");
  assert.equal(rejected.status, 422);

  const unknown = await retryMatcherBuyOrder(rejected, fetcher);
  assert.equal(unknown.kind, "receipt-unknown");
  await assert.rejects(
    () => retryMatcherBuyOrder({
      ...unknown,
      request: { ...unknown.request, body: `${unknown.request.body} ` },
    }, async () => {
      throw new Error("must not fetch a changed retry artifact");
    }),
    (error: unknown) => error instanceof MatcherOrderWorkflowError
      && error.phase === "before-post"
      && /changed after submission/.test(error.message),
  );
  const retried = await retryMatcherBuyOrder(unknown, fetcher);
  assert.equal(retried.kind, "confirmed");
  assert.equal(retried.receipt.receiptCheckpoint.sequence, 10n);
  assert.equal(retried.receipt.checkpoint.sequence, 12n);
  assert.equal(postBodies[0], postBodies[1]);
  assert.equal(postBodies[1], postBodies[2]);
  assert.equal(providerCalls.filter((call) => call === "eth_signTypedData_v4").length, 1);
});
