import assert from "node:assert/strict";
import test from "node:test";

import type { Eip1193Provider } from "./evm-wallet.ts";
import { hashTypedOrder } from "./eip712-order.ts";
import { hashMatcherControl } from "./matcher-auth.ts";
import { evmAuthorizedSignerId } from "./matcher-auth.ts";
import { hashMatcherOrderCommand, type MatcherOrderPayload } from "./matcher-client.ts";
import {
  NATIVE_ZEC_USDC_MATCHER_DEPLOYMENT,
  computeNativeZecUsdcMatcherConfigurationHash,
  parseNativeZecUsdcMatcherManifest,
} from "./native-zec-usdc-matcher-manifest.ts";
import {
  confirmMatcherBuyOrder,
  reviewMatcherBuyOrder,
  type MatcherOrderFetch,
  type ReviewedMatcherBuyOrder,
} from "./matcher-order-workflow.ts";
import {
  MatcherOrderControlWorkflowError,
  confirmMatcherOrderControl,
  retryMatcherOrderControl,
  reviewMatcherAccountEpochAdvance,
  reviewMatcherOrderCancellation,
  type ConfirmedMatcherOrderArtifact,
  type MatcherControlFetch,
  type ReviewedMatcherOrderControl,
} from "./matcher-order-controls.ts";
import { hash160Value, p2pkhAddress } from "./zcash-address.ts";
import type { MatcherMarketDeployment } from "./matcher-market-routing.ts";

const NOW = 1_800_000_000n;
const CONTRACT = `0x${"11".repeat(20)}`;
const WALLET = "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266";
const PRIVATE_KEY = BigInt("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
const CURVE_ORDER = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const CURVE_GX = 0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n;
const RECIPIENT = p2pkhAddress(hash160Value(new TextEncoder().encode("matcher-order-controls")), "mainnet");

function mod(value: bigint, modulus: bigint): bigint {
  const remainder = value % modulus;
  return remainder < 0n ? remainder + modulus : remainder;
}

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
  return parseNativeZecUsdcMatcherManifest({
    ...source,
    deployed: true,
    submissionEnabled: true,
    evm: { ...source.evm, verifyingContract: CONTRACT },
    configurationHash: computeNativeZecUsdcMatcherConfigurationHash(CONTRACT),
  });
}

function health(active: MatcherMarketDeployment = deployment()) {
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

function account(active: MatcherMarketDeployment = deployment(), sequence = "9", epoch = "7") {
  const makerAccountId = evmAuthorizedSignerId(active.orderDomain!.chainId, WALLET);
  return {
    ok: true,
    makerAccountId,
    configurationHash: active.configurationHash,
    accountEpoch: epoch,
    sequence,
    checkpoint: {
      version: 1,
      sequence,
      recordHash: `0x${(sequence === "9" ? "33" : "55").repeat(32)}`,
      stateRoot: `0x${"44".repeat(32)}`,
      configurationHash: active.configurationHash,
    },
  };
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) freeze(nested);
  }
  return value;
}

function provider(calls: string[], control: () => ReviewedMatcherOrderControl | null): Eip1193Provider {
  return {
    async request({ method, params }) {
      calls.push(method);
      if (method === "eth_requestAccounts" || method === "eth_accounts") return [WALLET];
      if (method === "eth_chainId") return "0x1";
      if (method === "eth_signTypedData_v4") {
        const review = control();
        assert.ok(review);
        assert.deepEqual(JSON.parse(params?.[1] as string), review.controlTypedData);
        return signDigest(hashMatcherControl(review.deployment.orderDomain!, review.control));
      }
      throw new Error(`unexpected provider RPC ${method}`);
    },
  };
}

async function reviewedOrder(active: MatcherMarketDeployment = deployment()): Promise<ReviewedMatcherBuyOrder> {
  const maker = evmAuthorizedSignerId(active.orderDomain!.chainId, WALLET);
  const fetcher: MatcherOrderFetch = async (path) => {
    const basePath = `/api/matcher?market=${encodeURIComponent(active.manifest.market.id)}`;
    if (String(path) === basePath) return json(health(active));
    if (String(path) === `${basePath}&account=${maker}`) return json(account(active));
    throw new Error(String(path));
  };
  const injected: Eip1193Provider = {
    async request({ method }) {
      if (method === "eth_requestAccounts" || method === "eth_accounts") return [WALLET];
      if (method === "eth_chainId") return "0x1";
      throw new Error(`unexpected provider RPC ${method}`);
    },
  };
  return reviewMatcherBuyOrder({
    deployment: active,
    provider: injected,
    fetch: fetcher,
    selectedMarket: active.manifest.market.id,
    zcashRecipient: RECIPIENT,
    priceTicks: 650_000n,
    sizeAtoms: 100_000_000n,
    occurredAt: NOW,
    expiresAt: NOW + 600n,
    nonce: 3n,
    salt: `0x${"66".repeat(32)}`,
  });
}

async function confirmedOrder(
  order: ReviewedMatcherBuyOrder,
  status: "open" | "filled" | "partially-filled" | "ioc-remainder-cancelled" | "fok-rejected" | "unfilled" = "open",
): Promise<ConfirmedMatcherOrderArtifact> {
  const orderHash = hashTypedOrder(order.deployment.orderDomain!, order.draft.order);
  const maker = order.makerAccountId;
  const routed = status === "filled" || status === "partially-filled" || status === "ioc-remainder-cancelled";
  const remainingBaseAtoms = status === "filled"
    ? 0n
    : routed
      ? order.draft.order.baseAmountAtoms / 2n
      : order.draft.order.baseAmountAtoms;
  const fetcher: MatcherOrderFetch = async (path, init) => {
    if (String(path) === "/api/matcher?market=ZEC%2FUSDC" && init?.method === "GET") return json(health(order.deployment));
    if (String(path) === `/api/matcher?market=ZEC%2FUSDC&account=${maker}`) return json(account(order.deployment));
    if (String(path) === "/api/matcher?market=ZEC%2FUSDC" && init?.method === "POST") {
      const payload = JSON.parse(init.body as string) as MatcherOrderPayload;
      return json({
        ok: true,
        replayed: false,
        receipt: {
          version: 1,
          sequence: "10",
          requestId: order.draft.requestId,
          commandHash: hashMatcherOrderCommand({
            configurationHash: order.deployment.expectedMatcher!.configurationHash,
            requestId: payload.requestId,
            occurredAtSeconds: BigInt(payload.occurredAtSeconds),
            orderHash,
            signature: payload.submission.signature,
            accounts: payload.submission.accounts,
          }),
          kind: "accept-order",
          status,
          subjectHash: orderHash,
          occurredAtSeconds: order.draft.occurredAt.toString(),
          ...(routed ? { routeKind: "order-book", swapPlanIds: [`0x${"c9".repeat(32)}`] } : { swapPlanIds: [] }),
          remainingBaseAtoms: remainingBaseAtoms.toString(),
        },
        receiptCheckpoint: {
          version: 1,
          sequence: "10",
          recordHash: `0x${"aa".repeat(32)}`,
          stateRoot: `0x${"bb".repeat(32)}`,
          configurationHash: order.deployment.configurationHash,
        },
        checkpoint: {
          version: 1,
          sequence: "10",
          recordHash: `0x${"aa".repeat(32)}`,
          stateRoot: `0x${"bb".repeat(32)}`,
          configurationHash: order.deployment.configurationHash,
        },
      }, 201);
    }
    throw new Error(String(path));
  };
  const injected: Eip1193Provider = {
    async request({ method, params }) {
      if (method === "eth_accounts") return [WALLET];
      if (method === "eth_chainId") return "0x1";
      if (method === "eth_signTypedData_v4") {
        assert.deepEqual(JSON.parse(params?.[1] as string), order.draft.typedOrderData);
        return signDigest(orderHash);
      }
      throw new Error(`unexpected provider RPC ${method}`);
    },
  };
  const result = await confirmMatcherBuyOrder({ fetch: fetcher, provider: injected, review: order });
  assert.equal(result.kind, "confirmed");
  return result as ConfirmedMatcherOrderArtifact;
}

function controlReceipt(
  review: ReviewedMatcherOrderControl,
  sequence = "11",
  replayed = false,
  currentSequence = sequence,
) {
  const cancellation = review.control.kind === "cancel-order";
  return {
    ok: true,
    replayed,
    receipt: {
      version: 1,
      sequence,
      requestId: review.requestId,
      kind: review.control.kind,
      status: cancellation ? "cancelled" : "epoch-advanced",
      subjectHash: cancellation ? review.control.orderHash : review.control.makerAccountId,
      occurredAtSeconds: review.occurredAt.toString(),
    },
    receiptCheckpoint: {
      version: 1,
      sequence,
      recordHash: `0x${"77".repeat(32)}`,
      stateRoot: `0x${"88".repeat(32)}`,
      configurationHash: review.deployment.configurationHash,
    },
    checkpoint: {
      version: 1,
      sequence: currentSequence,
      recordHash: `0x${(currentSequence === sequence ? "77" : "99").repeat(32)}`,
      stateRoot: `0x${(currentSequence === sequence ? "88" : "aa").repeat(32)}`,
      configurationHash: review.deployment.configurationHash,
    },
  };
}

test("forged or copied epoch artifacts perform no fetch or provider calls", async () => {
  const enabledOrder = await reviewedOrder();
  const disabledReview = freeze({ ...enabledOrder, deployment: NATIVE_ZEC_USDC_MATCHER_DEPLOYMENT });
  const confirmed = await confirmedOrder(enabledOrder);
  const artifact = freeze({ ...confirmed, review: disabledReview }) as ConfirmedMatcherOrderArtifact;
  const fetchCalls: string[] = [];
  const providerCalls: string[] = [];
  const fetcher: MatcherControlFetch = async (path) => {
    fetchCalls.push(String(path));
    throw new Error("must not fetch");
  };
  const injected = provider(providerCalls, () => null);
  await assert.rejects(
    () => reviewMatcherAccountEpochAdvance({
      artifact,
      provider: injected,
      fetch: fetcher,
      occurredAt: NOW,
    }),
    (error: unknown) => error instanceof MatcherOrderControlWorkflowError
      && error.phase === "before-sign"
      && /browser session/.test(error.message),
  );
  assert.deepEqual(fetchCalls, []);
  assert.deepEqual(providerCalls, []);
});

test("cancellation review derives a frozen control only from a confirmed open order and fresh state", async () => {
  const active = deployment();
  const order = await reviewedOrder(active);
  const artifact = await confirmedOrder(order);
  const maker = order.makerAccountId;
  const fetchCalls: Array<readonly [string, string | undefined, RequestCache | undefined]> = [];
  const fetcher: MatcherControlFetch = async (path, init) => {
    fetchCalls.push([String(path), init?.method, init?.cache]);
    if (String(path) === "/api/matcher?market=ZEC%2FUSDC") return json(health(active));
    if (String(path) === `/api/matcher?market=ZEC%2FUSDC&account=${maker}`) return json(account(active, "10"));
    throw new Error(String(path));
  };
  let review: ReviewedMatcherOrderControl | null = null;
  const providerCalls: string[] = [];
  review = await reviewMatcherOrderCancellation({
    artifact,
    provider: provider(providerCalls, () => review),
    fetch: fetcher,
    occurredAt: NOW + 1n,
  });
  assert.equal(review.control.kind, "cancel-order");
  assert.equal(review.control.makerAccountId, order.makerAccountId);
  assert.equal(review.control.accountEpoch, order.draft.order.accountEpoch);
  assert.equal(review.control.nonce, order.draft.order.nonce);
  assert.equal(Object.isFrozen(review), true);
  assert.match(review.requestId, /^cancel-[0-9a-f]{64}-1800000001$/);
  assert.deepEqual(fetchCalls, [
    ["/api/matcher?market=ZEC%2FUSDC", "GET", "no-store"],
    [`/api/matcher?market=ZEC%2FUSDC&account=${maker}`, "GET", "no-store"],
  ]);
  assert.deepEqual(providerCalls, ["eth_requestAccounts", "eth_chainId", "eth_chainId", "eth_accounts"]);
  await assert.rejects(
    () => reviewMatcherOrderCancellation({
      artifact: { ...artifact },
      provider: provider([], () => null),
      fetch: async () => { throw new Error("must not fetch"); },
      occurredAt: NOW + 1n,
    }),
    (error: unknown) => error instanceof MatcherOrderControlWorkflowError && /immutable/.test(error.message),
  );
});

test("epoch review reads fresh no-store matcher health, account, and checkpoint", async () => {
  const active = deployment();
  const maker = evmAuthorizedSignerId(active.orderDomain!.chainId, WALLET);
  const calls: Array<readonly [string, string | undefined, RequestCache | undefined]> = [];
  const fetcher: MatcherControlFetch = async (path, init) => {
    calls.push([String(path), init?.method, init?.cache]);
    if (String(path) === "/api/matcher?market=ZEC%2FUSDC") return json(health(active));
    if (String(path) === `/api/matcher?market=ZEC%2FUSDC&account=${maker}`) return json(account(active, "10"));
    throw new Error(String(path));
  };
  let review: ReviewedMatcherOrderControl | null = null;
  const providerCalls: string[] = [];
  review = await reviewMatcherAccountEpochAdvance({ artifact: await confirmedOrder(await reviewedOrder(active)), provider: provider(providerCalls, () => review), fetch: fetcher, occurredAt: NOW });
  assert.equal(review.control.kind, "advance-epoch");
  assert.equal(review.control.currentEpoch, 7n);
  assert.equal(review.control.nextEpoch, 8n);
  assert.deepEqual(calls, [
    ["/api/matcher?market=ZEC%2FUSDC", "GET", "no-store"],
    [`/api/matcher?market=ZEC%2FUSDC&account=${maker}`, "GET", "no-store"],
  ]);
  assert.deepEqual(providerCalls, ["eth_requestAccounts", "eth_chainId", "eth_chainId", "eth_accounts"]);
});

test("confirmation rejects account checkpoint drift before wallet signing or POST", async () => {
  const active = deployment();
  const source = await reviewedOrder(active);
  const maker = source.makerAccountId;
  let accountReads = 0;
  let posts = 0;
  const fetcher: MatcherControlFetch = async (path, init) => {
    if (String(path) === "/api/matcher?market=ZEC%2FUSDC" && init?.method === "GET") return json(health(active));
    if (String(path) === `/api/matcher?market=ZEC%2FUSDC&account=${maker}`) {
      accountReads += 1;
      return json(account(active, accountReads === 1 ? "10" : "11"));
    }
    if (init?.method === "POST") {
      posts += 1;
      throw new Error("must not post");
    }
    throw new Error(String(path));
  };
  let review: ReviewedMatcherOrderControl | null = null;
  const providerCalls: string[] = [];
  const injected = provider(providerCalls, () => review);
  review = await reviewMatcherOrderCancellation({
    artifact: await confirmedOrder(source),
    provider: injected,
    fetch: fetcher,
    occurredAt: NOW + 1n,
  });
  await assert.rejects(
    () => confirmMatcherOrderControl({ fetch: fetcher, provider: injected, review: review! }),
    (error: unknown) => error instanceof MatcherOrderControlWorkflowError
      && error.phase === "before-sign"
      && /state changed/.test(error.message),
  );
  assert.equal(providerCalls.includes("eth_signTypedData_v4"), false);
  assert.equal(posts, 0);
});

test("confirmation signs only typed controls, posts exact bytes, and validates both control receipts", async () => {
  const active = deployment();
  const source = await reviewedOrder(active);
  const maker = source.makerAccountId;
  const fetcher = (review: () => ReviewedMatcherOrderControl): MatcherControlFetch => async (path, init) => {
    if (String(path) === "/api/matcher?market=ZEC%2FUSDC" && init?.method === "GET") return json(health(active));
    if (String(path) === `/api/matcher?market=ZEC%2FUSDC&account=${maker}`) return json(account(active, "10"));
    if (String(path) === "/api/matcher?market=ZEC%2FUSDC&action=cancel-order" && init?.method === "POST") return json(controlReceipt(review()));
    throw new Error(String(path));
  };
  let cancellation: ReviewedMatcherOrderControl | null = null;
  const cancellationCalls: string[] = [];
  const cancellationProvider = provider(cancellationCalls, () => cancellation);
  const cancellationFetcher = fetcher(() => cancellation!);
  cancellation = await reviewMatcherOrderCancellation({
    artifact: await confirmedOrder(source),
    provider: cancellationProvider,
    fetch: cancellationFetcher,
    occurredAt: NOW + 1n,
  });
  const cancelled = await confirmMatcherOrderControl({
    fetch: cancellationFetcher,
    provider: cancellationProvider,
    review: cancellation,
  });
  assert.equal(cancelled.kind, "confirmed");
  assert.equal(cancelled.receipt.receipt.status, "cancelled");
  assert.equal(cancellationCalls.filter((call) => call === "eth_signTypedData_v4").length, 1);

  let epoch: ReviewedMatcherOrderControl | null = null;
  const epochFetcher: MatcherControlFetch = async (path, init) => {
    if (String(path) === "/api/matcher?market=ZEC%2FUSDC" && init?.method === "GET") return json(health(active));
    if (String(path) === `/api/matcher?market=ZEC%2FUSDC&account=${maker}`) return json(account(active, "10"));
    if (String(path) === "/api/matcher?market=ZEC%2FUSDC&action=advance-epoch" && init?.method === "POST") return json(controlReceipt(epoch!));
    throw new Error(String(path));
  };
  const epochCalls: string[] = [];
  epoch = await reviewMatcherAccountEpochAdvance({ artifact: await confirmedOrder(await reviewedOrder(active)), provider: provider(epochCalls, () => epoch), fetch: epochFetcher, occurredAt: NOW + 2n });
  const advanced = await confirmMatcherOrderControl({ fetch: epochFetcher, provider: provider(epochCalls, () => epoch), review: epoch });
  assert.equal(advanced.kind, "confirmed");
  assert.equal(advanced.receipt.receipt.status, "epoch-advanced");
  assert.equal([...cancellationCalls, ...epochCalls].some((call) => /sendTransaction|approve|personal_sign|eth_sign$/.test(call)), false);
});

test("rejections and uncertain receipts preserve exact signed retry bytes after identity checks", async () => {
  const active = deployment();
  const source = await reviewedOrder(active);
  const maker = source.makerAccountId;
  const bodies: string[] = [];
  const idempotencyKeys: Array<string | null> = [];
  const postPaths: string[] = [];
  let postAttempt = 0;
  const fetcher: MatcherControlFetch = async (path, init) => {
    if (String(path) === "/api/matcher?market=ZEC%2FUSDC" && init?.method === "GET") return json(health(active));
    if (String(path) === `/api/matcher?market=ZEC%2FUSDC&account=${maker}`) return json(account(active, "10"));
    if (String(path) === "/api/matcher?market=ZEC%2FUSDC&action=cancel-order" && init?.method === "POST") {
      postAttempt += 1;
      postPaths.push(String(path));
      bodies.push(String(init.body));
      idempotencyKeys.push(new Headers(init.headers).get("idempotency-key"));
      if (postAttempt === 1) return json({ ok: false, reason: "matcher-rejected-control" }, 422);
      if (postAttempt === 2) throw new Error("lost response");
      return json(controlReceipt(review!, "11", true, "12"));
    }
    throw new Error(String(path));
  };
  let review: ReviewedMatcherOrderControl | null = null;
  const calls: string[] = [];
  const injected = provider(calls, () => review);
  review = await reviewMatcherOrderCancellation({
    artifact: await confirmedOrder(source),
    provider: injected,
    fetch: fetcher,
    occurredAt: NOW + 1n,
  });
  const rejected = await confirmMatcherOrderControl({ fetch: fetcher, provider: injected, review });
  assert.equal(rejected.kind, "rejected");
  assert.equal(rejected.status, 422);
  const unknown = await retryMatcherOrderControl(rejected, fetcher);
  assert.equal(unknown.kind, "receipt-unknown");
  const confirmed = await retryMatcherOrderControl(unknown, fetcher);
  assert.equal(confirmed.kind, "confirmed");
  assert.equal(confirmed.receipt.replayed, true);
  assert.equal(confirmed.receipt.receiptCheckpoint.sequence, 11n);
  assert.equal(confirmed.receipt.checkpoint.sequence, 12n);
  assert.deepEqual(postPaths, [
    "/api/matcher?market=ZEC%2FUSDC&action=cancel-order",
    "/api/matcher?market=ZEC%2FUSDC&action=cancel-order",
    "/api/matcher?market=ZEC%2FUSDC&action=cancel-order",
  ]);
  assert.deepEqual(bodies, [bodies[0], bodies[0], bodies[0]]);
  assert.deepEqual(idempotencyKeys, [review.requestId, review.requestId, review.requestId]);
  assert.equal(calls.filter((call) => call === "eth_signTypedData_v4").length, 1);
  await assert.rejects(
    () => retryMatcherOrderControl({ ...unknown, request: { ...unknown.request, body: `${unknown.request.body} ` } }, fetcher),
    (error: unknown) => error instanceof MatcherOrderControlWorkflowError
      && error.phase === "before-post"
      && /changed after submission/.test(error.message),
  );
});

test("only confirmed open or partially-filled GTC orders can enter cancellation review", async () => {
  const source = await reviewedOrder();
  for (const status of ["filled"] as const) {
    const artifact = await confirmedOrder(source, status);
    const fetchCalls: string[] = [];
    const providerCalls: string[] = [];
    await assert.rejects(
      () => reviewMatcherOrderCancellation({
        artifact,
        fetch: async (path) => {
          fetchCalls.push(String(path));
          throw new Error("must not fetch");
        },
        provider: provider(providerCalls, () => null),
        occurredAt: NOW,
      }),
      (error: unknown) => error instanceof MatcherOrderControlWorkflowError && /not cancellable/.test(error.message),
      status,
    );
    assert.deepEqual(fetchCalls, [], status);
    assert.deepEqual(providerCalls, [], status);
  }

  const partiallyFilled = await confirmedOrder(source, "partially-filled");
  const maker = source.makerAccountId;
  let review: ReviewedMatcherOrderControl | null = null;
  review = await reviewMatcherOrderCancellation({
    artifact: partiallyFilled,
    fetch: async (path) => String(path) === "/api/matcher?market=ZEC%2FUSDC"
      ? json(health(source.deployment))
      : json(account(source.deployment, "10")),
    provider: provider([], () => review),
    occurredAt: NOW,
  });
  assert.equal(review.control.kind, "cancel-order");
  assert.equal(review.makerAccountId, maker);
});
