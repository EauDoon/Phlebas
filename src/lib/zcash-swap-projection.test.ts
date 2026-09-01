import { strict as assert } from "node:assert";
import { test } from "node:test";

import { bytesToHex, hexToBytes } from "./keccak.ts";
import { ETHEREUM_MAINNET_USDT_ASSET } from "./mainnet-assets.ts";
import { sampleSwapTerms } from "./swap-test-fixtures.ts";
import { buildHtlcRedeemScript } from "./zcash-htlc.ts";
import { projectZcashSwapTerms } from "./zcash-swap-projection.ts";
import { decodeTransparentAddress, hash160 } from "./zcash-transparent.ts";

function exactTerms(overrides: Partial<typeof sampleSwapTerms> = {}) {
  const values = { ...sampleSwapTerms, ...overrides };
  const redeemScript = buildHtlcRedeemScript({
    digest: hexToBytes(values.secretHash),
    claimPkh: hexToBytes(values.zcashClaimPubKeyHash),
    refundPkh: hexToBytes(values.zcashRefundPubKeyHash),
    lock: { type: "timestamp", value: Number(values.zecRefundTime) },
  });
  return {
    ...values,
    zcashLockScriptHash: `0x${bytesToHex(hash160(redeemScript))}` as typeof sampleSwapTerms.zcashLockScriptHash,
  };
}

test("projects exact Mainnet swap terms into one immutable Zcash HTLC", () => {
  const projection = projectZcashSwapTerms(exactTerms());
  assert.equal(projection.network, "mainnet");
  assert.equal(projection.amountZatoshis, sampleSwapTerms.zecAmountZatoshis.toString());
  assert.equal(projection.refundTimeSeconds, sampleSwapTerms.zecRefundTime.toString());
  assert.equal(decodeTransparentAddress(projection.lockAddress).type, "p2sh");
  assert.equal(decodeTransparentAddress(projection.claimAddress).type, "p2pkh");
  assert.equal(decodeTransparentAddress(projection.refundAddress).type, "p2pkh");
  assert.equal(Object.isFrozen(projection), true);
});

test("supports only exact Ethereum Mainnet USDC and USDT quotes", () => {
  assert.equal(projectZcashSwapTerms(exactTerms()).quoteAsset.endsWith("a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"), true);
  assert.equal(projectZcashSwapTerms(exactTerms({ quoteAsset: ETHEREUM_MAINNET_USDT_ASSET })).quoteAsset, ETHEREUM_MAINNET_USDT_ASSET);
  assert.throws(
    () => projectZcashSwapTerms(exactTerms({ quoteAsset: "eip155:1/erc20:0x1111111111111111111111111111111111111111" })),
    /exact Ethereum Mainnet USDC or USDT/,
  );
});

test("rejects a script hash or CLTV value not committed by the signed terms", () => {
  assert.throws(() => projectZcashSwapTerms(sampleSwapTerms), /signed lock script hash/);
  const valid = exactTerms();
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
  const baseline = projectZcashSwapTerms(exactTerms());
  for (const changed of [
    exactTerms({ secretHash: `0x${"12".repeat(32)}` }),
    exactTerms({ zcashClaimPubKeyHash: `0x${"13".repeat(20)}` }),
    exactTerms({ zcashRefundPubKeyHash: `0x${"14".repeat(20)}` }),
    exactTerms({ zecRefundTime: sampleSwapTerms.zecRefundTime + 1n }),
  ]) {
    const projection = projectZcashSwapTerms(changed);
    assert.notEqual(projection.termsHash, baseline.termsHash);
    assert.notEqual(projection.redeemScriptHex, baseline.redeemScriptHex);
    assert.notEqual(projection.lockScriptHash, baseline.lockScriptHash);
  }
});
