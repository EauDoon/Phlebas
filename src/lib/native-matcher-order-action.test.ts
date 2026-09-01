import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  bindNativeMatcherConfirmationOutcome,
  bindNativeMatcherOrderReview,
  NATIVE_MATCHER_DISABLED_COPY,
  NATIVE_MATCHER_MARKET_MISMATCH_COPY,
  NATIVE_MATCHER_SELL_UNSUPPORTED_COPY,
  NATIVE_MATCHER_UNAVAILABLE_HEADING,
  NATIVE_MATCHER_USDT_DISABLED_COPY,
  NATIVE_MATCHER_WORKFLOW_READY_COPY,
  nativeMatcherOrderActionState,
} from "./native-matcher-order-action.ts";
import { NATIVE_ZEC_USDC_MATCHER_DEPLOYMENT } from "./native-zec-usdc-matcher-manifest.ts";
import { NATIVE_ZEC_USDT_MATCHER_DEPLOYMENT } from "./native-zec-usdt-matcher-manifest.ts";

test("tracked disabled manifest leaves the native action inert", () => {
  const state = nativeMatcherOrderActionState("ZEC/USDC", NATIVE_ZEC_USDC_MATCHER_DEPLOYMENT);

  assert.deepEqual(state, {
    kind: "manifest-disabled",
    heading: NATIVE_MATCHER_UNAVAILABLE_HEADING,
    message: NATIVE_MATCHER_DISABLED_COPY,
    sellNotice: NATIVE_MATCHER_SELL_UNSUPPORTED_COPY,
  });
  assert.match(state.message, /No wallet connection, signature, token approval, or transaction will be requested\./);
});

test("tracked USDT manifest leaves the ZEC/USDT action inert", () => {
  const state = nativeMatcherOrderActionState("ZEC/USDT", NATIVE_ZEC_USDT_MATCHER_DEPLOYMENT);

  assert.equal(state.kind, "manifest-disabled");
  assert.equal(state.heading, NATIVE_MATCHER_UNAVAILABLE_HEADING);
  assert.equal(state.message, NATIVE_MATCHER_USDT_DISABLED_COPY);
  assert.equal(state.sellNotice, NATIVE_MATCHER_SELL_UNSUPPORTED_COPY);
});

test("a deployment manifest cannot be reused for the other market", () => {
  const state = nativeMatcherOrderActionState("ZEC/USDT", NATIVE_ZEC_USDC_MATCHER_DEPLOYMENT);
  assert.equal(state.kind, "manifest-mismatch");
  assert.equal(state.message, NATIVE_MATCHER_MARKET_MISMATCH_COPY);
});

test("an exact fully enabled manifest exposes only an injected review workflow", () => {
  const enabled = {
    ...NATIVE_ZEC_USDC_MATCHER_DEPLOYMENT,
    enabled: true,
    deployed: true,
    submissionEnabled: true,
    configured: true,
    state: "enabled" as const,
    configurationHash: `0x${"11".repeat(32)}`,
    orderDomain: {},
    expectedMatcher: {},
  };
  assert.equal(nativeMatcherOrderActionState("ZEC/USDC", enabled).kind, "workflow-unavailable");
  const state = nativeMatcherOrderActionState("ZEC/USDC", enabled, true);
  assert.equal(state.kind, "workflow-ready");
  assert.equal(state.message, NATIVE_MATCHER_WORKFLOW_READY_COPY);
});

test("binds and freezes an exact review summary before confirmation", () => {
  const configurationHash = `0x${"11".repeat(32)}`;
  const deployment = {
    ...NATIVE_ZEC_USDC_MATCHER_DEPLOYMENT,
    configurationHash,
  };
  const input = {
    marketId: "ZEC/USDC" as const,
    side: "buy" as const,
    priceTicks: 650_000n,
    sizeAtoms: 100_000_000n,
    expiryUnix: 1_800_000_600n,
    zcashRecipient: "t3exact-recipient",
  };
  const review = bindNativeMatcherOrderReview(input, {
    ...input,
    requestId: `order-${"22".repeat(32)}`,
    configurationHash,
  }, deployment);
  assert.equal(Object.isFrozen(review), true);
  assert.deepEqual(review, {
    requestId: `order-${"22".repeat(32)}`,
    configurationHash,
    ...input,
  });
  assert.throws(() => bindNativeMatcherOrderReview(input, { ...review, sizeAtoms: 1n }, deployment), /exact requested order terms/);
});

test("accepts only a verified bound receipt and preserves rejected and unknown outcomes", () => {
  const review = Object.freeze({
    requestId: `order-${"22".repeat(32)}`,
    configurationHash: `0x${"11".repeat(32)}`,
    marketId: "ZEC/USDC" as const,
    side: "buy" as const,
    priceTicks: 650_000n,
    sizeAtoms: 100_000_000n,
    expiryUnix: 1_800_000_600n,
    zcashRecipient: "t3exact-recipient",
  });
  const confirmed = bindNativeMatcherConfirmationOutcome(review, {
    kind: "confirmed",
    verified: true,
    requestId: review.requestId,
    configurationHash: review.configurationHash,
    receiptSequence: 9n,
    subjectHash: `0x${"22".repeat(32)}`,
  });
  assert.equal(confirmed.kind, "confirmed");
  assert.equal(Object.isFrozen(confirmed), true);
  assert.equal(bindNativeMatcherConfirmationOutcome(review, {
    kind: "rejected",
    requestId: review.requestId,
    configurationHash: review.configurationHash,
    status: 422,
  }).kind, "rejected");
  assert.equal(bindNativeMatcherConfirmationOutcome(review, {
    kind: "receipt-unknown",
    requestId: review.requestId,
    configurationHash: review.configurationHash,
  }).kind, "receipt-unknown");
  assert.throws(() => bindNativeMatcherConfirmationOutcome(review, {
    kind: "confirmed",
    verified: false,
    requestId: review.requestId,
    configurationHash: review.configurationHash,
    receiptSequence: 9n,
    subjectHash: `0x${"22".repeat(32)}`,
  }), /acceptance requires a verified/);
  assert.throws(() => bindNativeMatcherConfirmationOutcome(review, {
    kind: "confirmed",
    verified: true,
    requestId: review.requestId,
    configurationHash: review.configurationHash,
    receiptSequence: 9n,
    subjectHash: `0x${"33".repeat(32)}`,
  }), /subject does not bind/);
});

test("disabled native copy keeps the sell-side authorization boundary explicit", () => {
  assert.equal(
    NATIVE_MATCHER_SELL_UNSUPPORTED_COPY,
    "Buy intents only. ZEC sell-side submission remains unavailable because no Zcash wallet authorization format is integrated.",
  );
  assert.doesNotMatch(NATIVE_MATCHER_DISABLED_COPY, /eth_sendTransaction|approve\(/i);
});

test("standalone disabled surface imports no provider, fetch, or signing path", async () => {
  const source = await readFile(new URL("../components/native-matcher-order-action.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(source, /getInjectedProvider|connectTestnetWallet|signTypedOrderIntent/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /eth_sendTransaction|eth_signTypedData_v4|approve\(/i);
  assert.match(source, /state\.kind !== "workflow-ready"/);
  assert.match(source, /workflow\.review\(reviewInput\)/);
  assert.match(source, /pending\.workflow\.confirm\(pending\.review\)/);
  const synchronousInvalidation = source.indexOf("contextRef.current = { marketId, deployment, workflow }");
  const visibleStateEffect = source.indexOf("useEffect(() => {");
  assert.ok(synchronousInvalidation > 0 && synchronousInvalidation < visibleStateEffect);
  assert.match(source.slice(visibleStateEffect), /setPending\(null\)[\s\S]*setOutcome\(null\)[\s\S]*setBusy\(null\)/);
  assert.doesNotMatch(source.slice(0, visibleStateEffect), /setPending\(null\)|setOutcome\(null\)|setBusy\(null\)/);
  assert.match(source, /contextRef\.current !== operationContext/);
  assert.match(source, /Order accepted by verified matcher receipt sequence/);
  assert.match(source, /Matcher receipt is unknown/);
});
