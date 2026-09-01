import { strict as assert } from "node:assert";
import { test } from "node:test";

import { ETHEREUM_MAINNET_USDT_ASSET } from "./mainnet-assets.ts";
import { canonicalMainnetSwapTerms, sampleSwapTerms } from "./swap-test-fixtures.ts";
import { projectZcashSwapTerms } from "./zcash-swap-projection.ts";
import { decodeTransparentAddress } from "./zcash-transparent.ts";

test("projects exact Mainnet swap terms into one immutable Zcash HTLC", () => {
  const projection = projectZcashSwapTerms(canonicalMainnetSwapTerms());
  assert.equal(projection.network, "mainnet");
  assert.equal(projection.amountZatoshis, sampleSwapTerms.zecAmountZatoshis.toString());
  assert.equal(projection.refundTimeSeconds, sampleSwapTerms.zecRefundTime.toString());
  assert.equal(decodeTransparentAddress(projection.lockAddress).type, "p2sh");
  assert.equal(decodeTransparentAddress(projection.claimAddress).type, "p2pkh");
  assert.equal(decodeTransparentAddress(projection.refundAddress).type, "p2pkh");
  assert.equal(Object.isFrozen(projection), true);
});

test("supports only exact Ethereum Mainnet USDC and USDT quotes", () => {
  assert.equal(projectZcashSwapTerms(canonicalMainnetSwapTerms()).quoteAsset.endsWith("a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"), true);
  assert.equal(projectZcashSwapTerms(canonicalMainnetSwapTerms({ quoteAsset: ETHEREUM_MAINNET_USDT_ASSET })).quoteAsset, ETHEREUM_MAINNET_USDT_ASSET);
  assert.throws(
    () => projectZcashSwapTerms(canonicalMainnetSwapTerms({ quoteAsset: "eip155:1/erc20:0x1111111111111111111111111111111111111111" })),
    /exact Ethereum Mainnet USDC or USDT/,
  );
});

test("rejects a script hash or CLTV value not committed by the signed terms", () => {
  assert.throws(() => projectZcashSwapTerms(sampleSwapTerms), /signed lock script hash/);
  const valid = canonicalMainnetSwapTerms();
  assert.throws(
    () => projectZcashSwapTerms({ ...valid, zecRefundTime: 499_999_999n }),
    /timestamp-style uint32/,
  );
  assert.throws(
    () => projectZcashSwapTerms({ ...valid, zecRefundTime: 4_294_967_296n }),
    /timestamp-style uint32/,
  );
});

test("binds every Zcash effecting field to a distinct projection", () => {
  const baseline = projectZcashSwapTerms(canonicalMainnetSwapTerms());
  for (const changed of [
    canonicalMainnetSwapTerms({ secretHash: `0x${"12".repeat(32)}` }),
    canonicalMainnetSwapTerms({ zcashClaimPubKeyHash: `0x${"13".repeat(20)}` }),
    canonicalMainnetSwapTerms({ zcashRefundPubKeyHash: `0x${"14".repeat(20)}` }),
    canonicalMainnetSwapTerms({ zecRefundTime: sampleSwapTerms.zecRefundTime + 1n }),
  ]) {
    const projection = projectZcashSwapTerms(changed);
    assert.notEqual(projection.termsHash, baseline.termsHash);
    assert.notEqual(projection.redeemScriptHex, baseline.redeemScriptHex);
    assert.notEqual(projection.lockScriptHash, baseline.lockScriptHash);
  }
});
