import type { Eip1193Provider } from "./evm-wallet.ts";
import { hashTypedOrder } from "./eip712-order.ts";
import { evmAuthorizedSignerId } from "./matcher-auth.ts";
import {
  MATCHER_API_PATH,
  assertMatcherAccountIdentity,
  assertMatcherHealthIdentity,
  assertMatcherOrderReceipt,
  buildMatcherOrderRequest,
  type MatcherOrderRequest,
  type VerifiedMatcherAccount,
  type VerifiedMatcherOrderReceipt,
} from "./matcher-client.ts";
import {
  buildMatcherBuyOrderDraft,
  type MatcherBuyOrderDraft,
  type MatcherBuyOrderDraftInput,
} from "./matcher-order-draft.ts";
import { connectMatcherWallet, type MatcherWalletConnection } from "./matcher-wallet.ts";
import type { NativeZecUsdcMatcherDeploymentState } from "./native-zec-usdc-matcher-manifest.ts";
import type { Hex32 } from "./order-domain.ts";
import { signTypedOrderIntent } from "./evm-wallet.ts";

export type MatcherOrderFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export type ReviewMatcherBuyOrderInput = Readonly<{
  fetch: MatcherOrderFetch;
  provider: Eip1193Provider;
  deployment: NativeZecUsdcMatcherDeploymentState;
  selectedMarket: string;
  zcashRecipient: string;
  priceTicks: bigint;
  sizeAtoms: bigint;
  occurredAt: bigint;
  expiresAt: bigint;
  nonce: bigint;
  salt: string;
}>;

export type ReviewedMatcherBuyOrder = Readonly<{
  deployment: NativeZecUsdcMatcherDeploymentState;
  wallet: MatcherWalletConnection;
  makerAccountId: Hex32;
  draft: MatcherBuyOrderDraft;
}>;

export type ConfirmMatcherBuyOrderInput = Readonly<{
  fetch: MatcherOrderFetch;
  provider: Eip1193Provider;
  review: ReviewedMatcherBuyOrder;
}>;

type SignedMatcherOrderPost = Readonly<{
  review: ReviewedMatcherBuyOrder;
  signature: string;
  request: MatcherOrderRequest;
}>;

export type MatcherOrderConfirmation =
  | (SignedMatcherOrderPost & Readonly<{
    kind: "confirmed";
    receipt: VerifiedMatcherOrderReceipt;
  }>)
  | (SignedMatcherOrderPost & Readonly<{
    kind: "rejected";
    status: number;
  }>)
  | (SignedMatcherOrderPost & Readonly<{
    kind: "receipt-unknown";
  }>);

export type MatcherOrderWorkflowPhase = "before-sign" | "before-post";

export class MatcherOrderWorkflowError extends Error {
  readonly phase: MatcherOrderWorkflowPhase;

  constructor(phase: MatcherOrderWorkflowPhase, message: string) {
    super(message);
    this.name = "MatcherOrderWorkflowError";
    this.phase = phase;
  }
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  }
  return value;
}

function assertEnabledDeployment(deployment: NativeZecUsdcMatcherDeploymentState): void {
  if (deployment.enabled !== true
    || deployment.deployed !== true
    || deployment.submissionEnabled !== true
    || deployment.expectedMatcher === null
    || deployment.orderDomain === null
    || deployment.configurationHash === null) {
    throw new MatcherOrderWorkflowError("before-sign", "Native matcher order review is disabled by the deployment manifest");
  }
}

function beforeSign(error: unknown): never {
  if (error instanceof MatcherOrderWorkflowError) throw error;
  const message = error instanceof Error ? error.message : "Native matcher order review failed";
  throw new MatcherOrderWorkflowError("before-sign", message);
}

async function jsonResponse(
  fetcher: MatcherOrderFetch,
  path: string,
  init: RequestInit,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetcher(path, init);
  } catch {
    throw new Error("Native matcher is unavailable");
  }
  if (!response.ok) throw new Error(`Native matcher request was rejected (${response.status})`);
  let body: string;
  try {
    body = await response.text();
  } catch {
    throw new Error("Native matcher returned an unreadable response");
  }
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new Error("Native matcher returned malformed JSON");
  }
}

function healthPath(): typeof MATCHER_API_PATH {
  return MATCHER_API_PATH;
}

function accountPath(makerAccountId: string): string {
  return `${MATCHER_API_PATH}?account=${encodeURIComponent(makerAccountId)}`;
}

async function reviewedMatcherState(
  fetcher: MatcherOrderFetch,
  deployment: NativeZecUsdcMatcherDeploymentState,
  makerAccountId: Hex32,
): Promise<Readonly<{ health: unknown; account: VerifiedMatcherAccount }>> {
  const expectedMatcher = deployment.expectedMatcher;
  if (expectedMatcher === null) {
    throw new MatcherOrderWorkflowError("before-sign", "Native matcher order review is disabled by the deployment manifest");
  }
  const health = await jsonResponse(fetcher, healthPath(), { method: "GET", cache: "no-store" });
  assertMatcherHealthIdentity(health, expectedMatcher);
  const accountValue = await jsonResponse(fetcher, accountPath(makerAccountId), { method: "GET", cache: "no-store" });
  const account = assertMatcherAccountIdentity(accountValue, expectedMatcher, makerAccountId);
  return deepFreeze({ health, account });
}

function sameCheckpoint(
  left: VerifiedMatcherAccount["checkpoint"],
  right: MatcherBuyOrderDraft["accountCheckpoint"],
): boolean {
  return left.version === right.version
    && left.sequence === right.sequence
    && left.recordHash === right.recordHash
    && left.stateRoot === right.stateRoot
    && left.configurationHash === right.configurationHash;
}

function assertNoReviewDrift(
  review: ReviewedMatcherBuyOrder,
  fresh: Readonly<{ health: unknown; account: VerifiedMatcherAccount }>,
): void {
  const deployment = review.deployment;
  const expectedMatcher = deployment.expectedMatcher;
  if (expectedMatcher === null || deployment.orderDomain === null) {
    throw new Error("Native matcher order review is disabled by the deployment manifest");
  }
  const expectedMaker = evmAuthorizedSignerId(deployment.orderDomain.chainId, review.wallet.address);
  const expectedRequestId = `order-${hashTypedOrder(deployment.orderDomain, review.draft.order).slice(2)}`;
  if (review.makerAccountId !== expectedMaker
    || review.draft.order.makerAccountId !== expectedMaker
    || review.draft.order.authorizedSignerId !== expectedMaker
    || review.draft.requestId !== expectedRequestId
    || review.draft.healthConfigurationHash !== expectedMatcher.configurationHash
    || fresh.account.makerAccountId !== expectedMaker
    || fresh.account.accountEpoch !== review.draft.order.accountEpoch
    || !sameCheckpoint(fresh.account.checkpoint, review.draft.accountCheckpoint)) {
    throw new Error("Matcher state changed after order review");
  }
}

function signedPost(
  review: ReviewedMatcherBuyOrder,
  signature: string,
  health: unknown,
): SignedMatcherOrderPost {
  const expectedMatcher = review.deployment.expectedMatcher;
  if (expectedMatcher === null) throw new Error("Native matcher order review is disabled by the deployment manifest");
  const request = buildMatcherOrderRequest({
    matcherHealth: health,
    expectedMatcher,
    requestId: review.draft.requestId,
    occurredAtSeconds: review.draft.occurredAt,
    order: review.draft.order,
    signature,
    accounts: review.draft.accounts,
  });
  return deepFreeze({ review, signature, request });
}

async function postSignedMatcherOrder(signed: SignedMatcherOrderPost, fetcher: MatcherOrderFetch): Promise<MatcherOrderConfirmation> {
  let response: Response;
  try {
    response = await fetcher(signed.request.path, {
      method: signed.request.method,
      cache: "no-store",
      headers: signed.request.headers,
      body: signed.request.body,
    });
  } catch {
    return deepFreeze({ kind: "receipt-unknown", ...signed });
  }
  if (!response.ok) {
    if (response.status >= 400 && response.status < 500) {
      return deepFreeze({ kind: "rejected", status: response.status, ...signed });
    }
    return deepFreeze({ kind: "receipt-unknown", ...signed });
  }

  let body: unknown;
  try {
    body = JSON.parse(await response.text()) as unknown;
  } catch {
    return deepFreeze({ kind: "receipt-unknown", ...signed });
  }

  const expectedMatcher = signed.review.deployment.expectedMatcher;
  const domain = signed.review.deployment.orderDomain;
  if (expectedMatcher === null || domain === null) return deepFreeze({ kind: "receipt-unknown", ...signed });
  try {
    const receipt = assertMatcherOrderReceipt(body, {
      expectedMatcher,
      requestId: signed.request.requestId,
      subjectHash: hashTypedOrder(domain, signed.review.draft.order),
      occurredAtSeconds: signed.review.draft.occurredAt,
    });
    return deepFreeze({ kind: "confirmed", receipt, ...signed });
  } catch {
    return deepFreeze({ kind: "receipt-unknown", ...signed });
  }
}

/**
 * Connects the exact manifest wallet and produces an immutable local review.
 * It does not sign, submit, or invoke transaction RPCs.
 */
export async function reviewMatcherBuyOrder(input: ReviewMatcherBuyOrderInput): Promise<ReviewedMatcherBuyOrder> {
  assertEnabledDeployment(input.deployment);
  try {
    const health = await jsonResponse(input.fetch, healthPath(), { method: "GET", cache: "no-store" });
    const wallet = await connectMatcherWallet(input.provider, input.deployment);
    const makerAccountId = evmAuthorizedSignerId(input.deployment.orderDomain!.chainId, wallet.address);
    const account = await jsonResponse(input.fetch, accountPath(makerAccountId), { method: "GET", cache: "no-store" });
    const draftInput: MatcherBuyOrderDraftInput = {
      deployment: input.deployment,
      selectedMarket: input.selectedMarket,
      connectedEvmWallet: wallet.address,
      zcashRecipient: input.zcashRecipient,
      matcherHealth: health,
      matcherAccount: account,
      priceTicks: input.priceTicks,
      sizeAtoms: input.sizeAtoms,
      occurredAt: input.occurredAt,
      expiresAt: input.expiresAt,
      nonce: input.nonce,
      salt: input.salt,
    };
    return deepFreeze({ deployment: input.deployment, wallet, makerAccountId, draft: buildMatcherBuyOrderDraft(draftInput) });
  } catch (error) {
    beforeSign(error);
  }
}

/**
 * Revalidates reviewed state, signs only the reviewed typed order, then posts
 * the exact signed request. Rejections and uncertain receipts retain retry bytes.
 */
export async function confirmMatcherBuyOrder(input: ConfirmMatcherBuyOrderInput): Promise<MatcherOrderConfirmation> {
  assertEnabledDeployment(input.review.deployment);
  let fresh: Readonly<{ health: unknown; account: VerifiedMatcherAccount }>;
  try {
    fresh = await reviewedMatcherState(input.fetch, input.review.deployment, input.review.makerAccountId);
    assertNoReviewDrift(input.review, fresh);
  } catch (error) {
    beforeSign(error);
  }

  let signature: string;
  try {
    signature = await signTypedOrderIntent(
      input.provider,
      input.review.wallet.address,
      input.review.deployment.orderDomain!.chainId,
      input.review.draft.typedOrderData,
    );
  } catch (error) {
    beforeSign(error);
  }

  let signed: SignedMatcherOrderPost;
  try {
    signed = signedPost(input.review, signature!, fresh!.health);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Signed matcher order could not be prepared";
    throw new MatcherOrderWorkflowError("before-post", message);
  }
  return postSignedMatcherOrder(signed, input.fetch);
}

/** Reposts only the immutable signed bytes and idempotency key from a prior outcome. */
export async function retryMatcherBuyOrder(
  confirmation: Exclude<MatcherOrderConfirmation, { kind: "confirmed" }>,
  fetcher: MatcherOrderFetch,
): Promise<MatcherOrderConfirmation> {
  return postSignedMatcherOrder({
    review: confirmation.review,
    signature: confirmation.signature,
    request: confirmation.request,
  }, fetcher);
}
