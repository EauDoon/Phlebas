import type { Eip1193Provider } from "./evm-wallet.ts";
import { signTypedMatcherControl } from "./evm-wallet.ts";
import { hashTypedOrder } from "./eip712-order.ts";
import {
  evmAuthorizedSignerId,
  hashMatcherControl,
  typedMatcherControlData,
} from "./matcher-auth.ts";
import {
  assertMatcherAccountIdentity,
  assertMatcherControlReceipt,
  assertMatcherHealthIdentity,
  buildMatcherAccountEpochAdvanceRequest,
  buildMatcherOrderCancellationRequest,
  createMatcherAccountEpochAdvanceControl,
  createMatcherOrderCancellationControl,
  type MatcherAccountEpochAdvanceControl,
  type MatcherControlRequest,
  type MatcherOrderCancellationControl,
  type VerifiedMatcherAccount,
  type VerifiedMatcherControlReceipt,
} from "./matcher-client.ts";
import { matcherApiPathForMarket, type MatcherMarketDeployment } from "./matcher-market-routing.ts";
import {
  assertConfirmedMatcherOrderArtifact,
  type ConfirmedMatcherOrderArtifact,
  type ReviewedMatcherBuyOrder,
} from "./matcher-order-workflow.ts";
import { connectMatcherWallet, type MatcherWalletConnection } from "./matcher-wallet.ts";
import { UINT64_MAX, type Hex32 } from "./order-domain.ts";

export type MatcherControlFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export type { ConfirmedMatcherOrderArtifact } from "./matcher-order-workflow.ts";

type UserMatcherControl = MatcherOrderCancellationControl | MatcherAccountEpochAdvanceControl;

type MatcherControlReviewBase<TControl extends UserMatcherControl> = Readonly<{
  deployment: MatcherMarketDeployment;
  wallet: MatcherWalletConnection;
  makerAccountId: Hex32;
  accountCheckpoint: VerifiedMatcherAccount["checkpoint"];
  control: TControl;
  controlTypedData: unknown;
  requestId: string;
  occurredAt: bigint;
}>;

export type ReviewedMatcherOrderCancellation = MatcherControlReviewBase<MatcherOrderCancellationControl>;
export type ReviewedMatcherAccountEpochAdvance = MatcherControlReviewBase<MatcherAccountEpochAdvanceControl>;
export type ReviewedMatcherOrderControl = ReviewedMatcherOrderCancellation | ReviewedMatcherAccountEpochAdvance;

export type ReviewMatcherOrderCancellationInput = Readonly<{
  fetch: MatcherControlFetch;
  provider: Eip1193Provider;
  artifact: ConfirmedMatcherOrderArtifact;
  occurredAt: bigint;
}>;

export type ReviewMatcherAccountEpochAdvanceInput = Readonly<{
  fetch: MatcherControlFetch;
  provider: Eip1193Provider;
  artifact: ConfirmedMatcherOrderArtifact;
  occurredAt: bigint;
}>;

export type ConfirmMatcherOrderControlInput = Readonly<{
  fetch: MatcherControlFetch;
  provider: Eip1193Provider;
  review: ReviewedMatcherOrderControl;
}>;

type SignedMatcherOrderControlPost = Readonly<{
  review: ReviewedMatcherOrderControl;
  signature: string;
  request: MatcherControlRequest;
}>;

export type MatcherOrderControlConfirmation =
  | (SignedMatcherOrderControlPost & Readonly<{
    kind: "confirmed";
    receipt: VerifiedMatcherControlReceipt;
  }>)
  | (SignedMatcherOrderControlPost & Readonly<{
    kind: "rejected";
    status: number;
  }>)
  | (SignedMatcherOrderControlPost & Readonly<{
    kind: "receipt-unknown";
  }>);

export type MatcherOrderControlWorkflowPhase = "before-sign" | "before-post";

export class MatcherOrderControlWorkflowError extends Error {
  readonly phase: MatcherOrderControlWorkflowPhase;

  constructor(phase: MatcherOrderControlWorkflowPhase, message: string) {
    super(message);
    this.name = "MatcherOrderControlWorkflowError";
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

function isDeepFrozen(value: unknown, visited = new WeakSet<object>()): boolean {
  if (value === null || typeof value !== "object") return true;
  if (!Object.isFrozen(value) || visited.has(value)) return Object.isFrozen(value);
  visited.add(value);
  return Object.values(value).every((nested) => isDeepFrozen(nested, visited));
}

function assertEnabledDeployment(deployment: MatcherMarketDeployment): void {
  if (deployment.enabled !== true
    || deployment.state !== "enabled"
    || deployment.configured !== true
    || deployment.deployed !== true
    || deployment.submissionEnabled !== true
    || deployment.expectedMatcher === null
    || deployment.orderDomain === null
    || deployment.configurationHash === null) {
    throw new MatcherOrderControlWorkflowError("before-sign", "Native matcher order control is disabled by the deployment manifest");
  }
}

function beforeSign(error: unknown): never {
  if (error instanceof MatcherOrderControlWorkflowError) throw error;
  const message = error instanceof Error ? error.message : "Native matcher order control review failed";
  throw new MatcherOrderControlWorkflowError("before-sign", message);
}

function beforePost(error: unknown): never {
  if (error instanceof MatcherOrderControlWorkflowError) throw error;
  const message = error instanceof Error ? error.message : "Signed matcher control could not be prepared";
  throw new MatcherOrderControlWorkflowError("before-post", message);
}

function assertOccurredAt(value: bigint): bigint {
  if (typeof value !== "bigint" || value < 0n || value > UINT64_MAX) {
    throw new RangeError("Matcher control event time must be a uint64 bigint");
  }
  return value;
}

function controlRequestId(
  deployment: MatcherMarketDeployment,
  control: UserMatcherControl,
  occurredAt: bigint,
): string {
  const prefix = control.kind === "cancel-order" ? "cancel" : "epoch";
  if (deployment.orderDomain === null) throw new Error("Matcher control has no approved signing domain");
  return `${prefix}-${hashMatcherControl(deployment.orderDomain, control).slice(2)}-${assertOccurredAt(occurredAt).toString()}`;
}

function sameCheckpoint(
  left: VerifiedMatcherAccount["checkpoint"],
  right: VerifiedMatcherAccount["checkpoint"],
): boolean {
  return left.version === right.version
    && left.sequence === right.sequence
    && left.recordHash === right.recordHash
    && left.stateRoot === right.stateRoot
    && left.configurationHash === right.configurationHash;
}

function healthPath(deployment: MatcherMarketDeployment): string {
  return matcherApiPathForMarket(deployment.manifest.market.id);
}

function accountPath(deployment: MatcherMarketDeployment, makerAccountId: Hex32): string {
  return `${healthPath(deployment)}&account=${encodeURIComponent(makerAccountId)}`;
}

async function jsonResponse(
  fetcher: MatcherControlFetch,
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

async function reviewedMatcherState(
  fetcher: MatcherControlFetch,
  deployment: MatcherMarketDeployment,
  makerAccountId: Hex32,
): Promise<Readonly<{ health: unknown; account: VerifiedMatcherAccount }>> {
  const expectedMatcher = deployment.expectedMatcher;
  if (expectedMatcher === null) {
    throw new MatcherOrderControlWorkflowError("before-sign", "Native matcher order control is disabled by the deployment manifest");
  }
  const health = await jsonResponse(fetcher, healthPath(deployment), { method: "GET", cache: "no-store" });
  assertMatcherHealthIdentity(health, expectedMatcher);
  const accountValue = await jsonResponse(fetcher, accountPath(deployment, makerAccountId), { method: "GET", cache: "no-store" });
  const account = assertMatcherAccountIdentity(accountValue, expectedMatcher, makerAccountId);
  return deepFreeze({ health, account });
}

function orderArtifactReview(
  artifact: ConfirmedMatcherOrderArtifact,
  requireCancellable: boolean,
): ReviewedMatcherBuyOrder {
  if (!isDeepFrozen(artifact)) throw new Error("Prior matcher order artifact must be immutable");
  const confirmed = assertConfirmedMatcherOrderArtifact(artifact);
  const review = confirmed.review;
  assertEnabledDeployment(review.deployment);
  const expectedMatcher = review.deployment.expectedMatcher!;
  const domain = review.deployment.orderDomain!;
  const makerAccountId = evmAuthorizedSignerId(domain.chainId, review.wallet.address);
  const orderHash = hashTypedOrder(domain, review.draft.order);
  const requestId = `order-${orderHash.slice(2)}`;
  if (review.makerAccountId !== makerAccountId
    || review.draft.order.side !== 0
    || review.draft.order.makerAccountId !== makerAccountId
    || review.draft.order.authorizedSignerId !== makerAccountId
    || review.draft.order.accountEpoch < 0n
    || review.draft.requestId !== requestId
    || review.draft.healthConfigurationHash !== expectedMatcher.configurationHash) {
    throw new Error("Prior matcher order artifact does not bind an approved native buy order");
  }
  const status = confirmed.receipt.receipt.status;
  if (confirmed.receipt.receipt.kind !== "accept-order"
    || confirmed.receipt.receipt.requestId !== requestId
    || !["open", "filled", "partially-filled", "ioc-remainder-cancelled", "fok-rejected", "unfilled"].includes(status)
    || confirmed.receipt.receipt.subjectHash !== orderHash
    || confirmed.receipt.receiptCheckpoint.configurationHash !== expectedMatcher.configurationHash) {
    throw new Error("Confirmed matcher order artifact does not bind the reviewed order");
  }
  if (requireCancellable && status !== "open" && status !== "partially-filled") {
    throw new Error("Confirmed matcher order is not cancellable");
  }
  return review;
}

function assertReviewIntegrity(review: ReviewedMatcherOrderControl): void {
  if (!isDeepFrozen(review)) throw new Error("Matcher control review must be immutable");
  assertEnabledDeployment(review.deployment);
  const expectedMatcher = review.deployment.expectedMatcher!;
  const domain = review.deployment.orderDomain!;
  const makerAccountId = evmAuthorizedSignerId(domain.chainId, review.wallet.address);
  if (review.makerAccountId !== makerAccountId
    || review.control.makerAccountId !== makerAccountId
    || review.control.authorizedSignerId !== makerAccountId
    || review.accountCheckpoint.configurationHash !== expectedMatcher.configurationHash
    || review.requestId !== controlRequestId(review.deployment, review.control, review.occurredAt)) {
    throw new Error("Matcher control review does not bind the approved wallet and matcher state");
  }
  const expectedTypedData = typedMatcherControlData(domain, review.control);
  if (canonicalJson(review.controlTypedData) !== canonicalJson(expectedTypedData)) {
    throw new Error("Matcher control review typed data changed after review");
  }
}

function assertNoReviewDrift(
  review: ReviewedMatcherOrderControl,
  fresh: Readonly<{ health: unknown; account: VerifiedMatcherAccount }>,
): void {
  assertReviewIntegrity(review);
  if (fresh.account.makerAccountId !== review.makerAccountId
    || fresh.account.accountEpoch !== (review.control.kind === "cancel-order"
      ? review.control.accountEpoch
      : review.control.currentEpoch)
    || !sameCheckpoint(fresh.account.checkpoint, review.accountCheckpoint)) {
    throw new Error("Matcher state changed after control review");
  }
}

async function assertControlWallet(
  provider: Eip1193Provider,
  review: ReviewedMatcherOrderControl,
): Promise<void> {
  const wallet = await connectMatcherWallet(provider, review.deployment);
  const domain = review.deployment.orderDomain!;
  const makerAccountId = evmAuthorizedSignerId(domain.chainId, wallet.address);
  if (wallet.address !== review.wallet.address
    || makerAccountId !== review.makerAccountId
    || makerAccountId !== review.control.makerAccountId
    || makerAccountId !== review.control.authorizedSignerId) {
    throw new Error("Connected wallet does not match the reviewed matcher control");
  }
}

function signedPost(
  review: ReviewedMatcherOrderControl,
  signature: string,
  health: unknown,
): SignedMatcherOrderControlPost {
  const expectedMatcher = review.deployment.expectedMatcher;
  if (expectedMatcher === null) throw new Error("Native matcher order control is disabled by the deployment manifest");
  const request = review.control.kind === "cancel-order"
    ? buildMatcherOrderCancellationRequest({
      matcherHealth: health,
      expectedMatcher,
      requestId: review.requestId,
      occurredAtSeconds: review.occurredAt,
      control: review.control,
      signature,
    })
    : buildMatcherAccountEpochAdvanceRequest({
      matcherHealth: health,
      expectedMatcher,
      requestId: review.requestId,
      occurredAtSeconds: review.occurredAt,
      control: review.control,
      signature,
    });
  return deepFreeze({ review, signature, request });
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "number") {
    return JSON.stringify(value);
  }
  if (typeof value === "bigint") return `"${value.toString()}n"`;
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value !== "object") throw new TypeError("Matcher control retry artifact is not serializable");
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
}

async function postSignedMatcherControl(
  signed: SignedMatcherOrderControlPost,
  fetcher: MatcherControlFetch,
): Promise<MatcherOrderControlConfirmation> {
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
  if (expectedMatcher === null) return deepFreeze({ kind: "receipt-unknown", ...signed });
  try {
    const receipt = assertMatcherControlReceipt(body, {
      expectedMatcher,
      requestId: signed.request.requestId,
      control: signed.review.control,
    });
    return deepFreeze({ kind: "confirmed", receipt, ...signed });
  } catch {
    return deepFreeze({ kind: "receipt-unknown", ...signed });
  }
}

/** Builds a frozen cancellation review from a confirmed order and fresh matcher state. */
export async function reviewMatcherOrderCancellation(
  input: ReviewMatcherOrderCancellationInput,
): Promise<ReviewedMatcherOrderCancellation> {
  try {
    const review = orderArtifactReview(input.artifact, true);
    const deployment = review.deployment;
    const expectedMatcher = deployment.expectedMatcher;
    if (expectedMatcher === null) {
      throw new MatcherOrderControlWorkflowError("before-sign", "Native matcher order control is disabled by the deployment manifest");
    }
    const health = await jsonResponse(input.fetch, healthPath(deployment), { method: "GET", cache: "no-store" });
    assertMatcherHealthIdentity(health, expectedMatcher);
    const wallet = await connectMatcherWallet(input.provider, deployment);
    const makerAccountId = evmAuthorizedSignerId(deployment.orderDomain!.chainId, wallet.address);
    if (makerAccountId !== review.makerAccountId || wallet.address !== review.wallet.address) {
      throw new Error("Connected wallet does not match the confirmed matcher order artifact");
    }
    const accountValue = await jsonResponse(input.fetch, accountPath(deployment, makerAccountId), { method: "GET", cache: "no-store" });
    const account = assertMatcherAccountIdentity(accountValue, expectedMatcher, makerAccountId);
    if (account.accountEpoch !== review.draft.order.accountEpoch) {
      throw new Error("Confirmed matcher order is no longer in the active account epoch");
    }
    const control = createMatcherOrderCancellationControl({
      orderHash: hashTypedOrder(deployment.orderDomain!, review.draft.order),
      makerAccountId,
      accountEpoch: review.draft.order.accountEpoch,
      nonce: review.draft.order.nonce,
      authorizedSignerId: review.draft.order.authorizedSignerId,
    });
    const occurredAt = assertOccurredAt(input.occurredAt);
    return deepFreeze({
      deployment,
      wallet,
      makerAccountId,
      accountCheckpoint: account.checkpoint,
      control,
      controlTypedData: typedMatcherControlData(deployment.orderDomain!, control),
      requestId: controlRequestId(deployment, control, occurredAt),
      occurredAt,
    });
  } catch (error) {
    beforeSign(error);
  }
}

/** Fetches fresh matcher state and builds a frozen single-step epoch invalidation review. */
export async function reviewMatcherAccountEpochAdvance(
  input: ReviewMatcherAccountEpochAdvanceInput,
): Promise<ReviewedMatcherAccountEpochAdvance> {
  try {
    const prior = orderArtifactReview(input.artifact, false);
    const deployment = prior.deployment;
    const expectedMatcher = deployment.expectedMatcher;
    if (expectedMatcher === null) {
      throw new MatcherOrderControlWorkflowError("before-sign", "Native matcher order control is disabled by the deployment manifest");
    }
    const health = await jsonResponse(input.fetch, healthPath(deployment), { method: "GET", cache: "no-store" });
    assertMatcherHealthIdentity(health, expectedMatcher);
    const wallet = await connectMatcherWallet(input.provider, deployment);
    const makerAccountId = evmAuthorizedSignerId(deployment.orderDomain!.chainId, wallet.address);
    if (makerAccountId !== prior.makerAccountId || wallet.address !== prior.wallet.address) {
      throw new Error("Connected wallet does not match the confirmed matcher order artifact");
    }
    const accountValue = await jsonResponse(input.fetch, accountPath(deployment, makerAccountId), { method: "GET", cache: "no-store" });
    const account = assertMatcherAccountIdentity(accountValue, expectedMatcher, makerAccountId);
    const control = createMatcherAccountEpochAdvanceControl({
      makerAccountId,
      currentEpoch: account.accountEpoch,
      nextEpoch: account.accountEpoch + 1n,
      authorizedSignerId: makerAccountId,
    });
    const occurredAt = assertOccurredAt(input.occurredAt);
    return deepFreeze({
      deployment,
      wallet,
      makerAccountId,
      accountCheckpoint: account.checkpoint,
      control,
      controlTypedData: typedMatcherControlData(deployment.orderDomain!, control),
      requestId: controlRequestId(deployment, control, occurredAt),
      occurredAt,
    });
  } catch (error) {
    beforeSign(error);
  }
}

/** Revalidates matcher and wallet state, signs typed control data, then posts exact bytes. */
export async function confirmMatcherOrderControl(
  input: ConfirmMatcherOrderControlInput,
): Promise<MatcherOrderControlConfirmation> {
  assertEnabledDeployment(input.review.deployment);
  let fresh: Readonly<{ health: unknown; account: VerifiedMatcherAccount }>;
  try {
    fresh = await reviewedMatcherState(input.fetch, input.review.deployment, input.review.makerAccountId);
    assertNoReviewDrift(input.review, fresh);
    await assertControlWallet(input.provider, input.review);
  } catch (error) {
    beforeSign(error);
  }
  let signature: string;
  try {
    signature = await signTypedMatcherControl(
      input.provider,
      input.review.wallet.address,
      input.review.deployment.orderDomain!.chainId,
      input.review.controlTypedData,
    );
  } catch (error) {
    beforeSign(error);
  }
  let signed: SignedMatcherOrderControlPost;
  try {
    signed = signedPost(input.review, signature!, fresh!.health);
  } catch (error) {
    beforePost(error);
  }
  return postSignedMatcherControl(signed!, input.fetch);
}

/** Revalidates matcher identity, then reposts only previously signed immutable bytes. */
export async function retryMatcherOrderControl(
  confirmation: Exclude<MatcherOrderControlConfirmation, { kind: "confirmed" }>,
  fetcher: MatcherControlFetch,
): Promise<MatcherOrderControlConfirmation> {
  let signed: SignedMatcherOrderControlPost;
  try {
    assertEnabledDeployment(confirmation.review.deployment);
    const expectedMatcher = confirmation.review.deployment.expectedMatcher;
    if (expectedMatcher === null) throw new Error("Native matcher order control is disabled by the deployment manifest");
    const health = await jsonResponse(fetcher, healthPath(confirmation.review.deployment), { method: "GET", cache: "no-store" });
    assertMatcherHealthIdentity(health, expectedMatcher);
    signed = signedPost(confirmation.review, confirmation.signature, health);
    if (canonicalJson(signed.request) !== canonicalJson(confirmation.request)) {
      throw new Error("Signed matcher control retry artifact changed after submission");
    }
  } catch (error) {
    beforePost(error);
  }
  return postSignedMatcherControl(signed!, fetcher);
}
