import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  NATIVE_MATCHER_DISABLED_COPY,
  NATIVE_MATCHER_SELL_UNSUPPORTED_COPY,
  NATIVE_MATCHER_UNAVAILABLE_HEADING,
  NATIVE_MATCHER_UNSUPPORTED_MARKET_COPY,
  nativeMatcherOrderActionState,
} from "./native-matcher-order-action.ts";
import { NATIVE_ZEC_USDC_MATCHER_DEPLOYMENT } from "./native-zec-usdc-matcher-manifest.ts";

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

test("ZEC/USDT is explicitly unavailable without a matcher manifest", () => {
  const state = nativeMatcherOrderActionState("ZEC/USDT", NATIVE_ZEC_USDC_MATCHER_DEPLOYMENT);

  assert.equal(state.kind, "unsupported-market");
  assert.equal(state.heading, NATIVE_MATCHER_UNAVAILABLE_HEADING);
  assert.equal(state.message, NATIVE_MATCHER_UNSUPPORTED_MARKET_COPY);
  assert.equal(state.sellNotice, NATIVE_MATCHER_SELL_UNSUPPORTED_COPY);
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
});
