import assert from "node:assert/strict";
import test from "node:test";

import manifest from "../../infra/matcher/native-zec-usdc.json" with { type: "json" };
import {
  NATIVE_USDC_ASSET,
  NATIVE_ZEC_USDC_ADAPTER_ID,
  NATIVE_ZEC_USDC_MATCHER_DEPLOYMENT,
  NATIVE_ZEC_USDC_MATCHER_MANIFEST,
  computeNativeZecUsdcMatcherConfigurationHash,
  parseNativeZecUsdcMatcherManifest,
} from "./native-zec-usdc-matcher-manifest.ts";
import { hashOrderDomain } from "./eip712-order.ts";
import { matcherConfigurationHash, type PersistentMatcherConfiguration } from "./persistent-matcher.ts";

type MutableManifest = {
  $schema: string;
  schemaVersion: string;
  manifestType: string;
  deployed: boolean;
  submissionEnabled: boolean;
  orderDomain: { name: string; version: string };
  evm: { network: string; chainId: number; verifyingContract: string | null };
  market: {
    id: string;
    settlementPair: string;
    base: { network: string; asset: string; environment: string; decimals: number };
    quote: { network: string; asset: string; environment: string; decimals: number };
  };
  configurationHash: string | null;
  settlement: {
    protocolVersion: string;
    adapterId: string;
    stablecoinRefundDelaySeconds: string;
    zcashRefundSafetyDeltaSeconds: string;
    zcashRequiredConfirmations: number;
    quoteRequiredConfirmations: number;
  };
  limits: {
    minimumBaseAmountAtoms: string;
    maximumBaseAmountAtoms: string;
    maximumAcceptedOrders: number;
    maximumOpenOrders: number;
    maximumOpenOrdersPerAccount: number;
    maximumSolverQuotes: number;
    maximumRouteFills: number;
    maximumSolverFills: number;
    maximumOrderLifetimeSeconds: string;
    maximumSolverLifetimeSeconds: string;
    maximumSolverCapacityBaseAtoms: string;
    maximumSolverFeeBps: string;
    maximumSolverSlippageBps: string;
  };
};

function copyManifest(): MutableManifest {
  const value = NATIVE_ZEC_USDC_MATCHER_MANIFEST;
  return {
    ...value,
    orderDomain: { ...value.orderDomain },
    evm: { ...value.evm },
    market: {
      ...value.market,
      base: { ...value.market.base },
      quote: { ...value.market.quote },
    },
    settlement: { ...value.settlement },
    limits: { ...value.limits },
  };
}

test("the tracked native ZEC/USDC deployment is disabled and client-safe by default", () => {
  assert.equal(manifest.schemaVersion, "1.0.0");
  assert.equal(manifest.manifestType, "native-zec-usdc-matcher-deployment");
  assert.equal(manifest.deployed, false);
  assert.equal(manifest.submissionEnabled, false);
  assert.equal(NATIVE_ZEC_USDC_MATCHER_DEPLOYMENT.deployed, false);
  assert.equal(NATIVE_ZEC_USDC_MATCHER_DEPLOYMENT.submissionEnabled, false);
  assert.equal(NATIVE_ZEC_USDC_MATCHER_DEPLOYMENT.enabled, false);
  assert.equal(NATIVE_ZEC_USDC_MATCHER_DEPLOYMENT.configured, false);
  assert.equal(NATIVE_ZEC_USDC_MATCHER_DEPLOYMENT.orderDomain, null);
  assert.equal(NATIVE_ZEC_USDC_MATCHER_DEPLOYMENT.configurationHash, null);
  assert.equal(NATIVE_ZEC_USDC_MATCHER_DEPLOYMENT.expectedMatcher, null);
  assert.equal(NATIVE_ZEC_USDC_MATCHER_DEPLOYMENT.market.quote.asset, NATIVE_USDC_ASSET);
  assert.equal(NATIVE_ZEC_USDC_MATCHER_DEPLOYMENT.settlementAdapterId, NATIVE_ZEC_USDC_ADAPTER_ID);
});

test("an environment variable cannot promote the parsed disabled state", () => {
  const names = [
    "PHLEBAS_MATCHER_SUBMISSION_ENABLED",
    "NEXT_PUBLIC_PHLEBAS_MATCHER_SUBMISSION_ENABLED",
    "PHLEBAS_MATCHER_DEPLOYED",
  ];
  const prior = names.map((name) => [name, process.env[name]] as const);
  try {
    for (const name of names) process.env[name] = "1";
    const state = parseNativeZecUsdcMatcherManifest(manifest);
    assert.equal(state.enabled, false);
    assert.equal(state.submissionEnabled, false);
  } finally {
    for (const [name, value] of prior) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test("partial deployment identity is rejected even when flags remain disabled", () => {
  const withContract = copyManifest();
  withContract.evm.verifyingContract = `0x${"11".repeat(20)}`;
  assert.throws(() => parseNativeZecUsdcMatcherManifest(withContract), /committed together/);

  const withHash = copyManifest();
  withHash.configurationHash = `0x${"11".repeat(32)}`;
  assert.throws(() => parseNativeZecUsdcMatcherManifest(withHash), /committed together/);
});

test("zero, missing, and malformed fields fail closed", () => {
  const zeroAdapter = copyManifest();
  zeroAdapter.settlement.adapterId = `0x${"00".repeat(32)}`;
  assert.throws(() => parseNativeZecUsdcMatcherManifest(zeroAdapter), /adapter ID cannot be zero/);

  const zeroLimit = copyManifest();
  zeroLimit.limits.minimumBaseAmountAtoms = "0";
  assert.throws(() => parseNativeZecUsdcMatcherManifest(zeroLimit), /Minimum base amount/);

  const missingLimit = copyManifest();
  delete (missingLimit.limits as Record<string, unknown>).maximumOpenOrders;
  assert.throws(() => parseNativeZecUsdcMatcherManifest(missingLimit), /missing or unsupported fields/);

  const uppercaseAdapter = copyManifest();
  uppercaseAdapter.settlement.adapterId = NATIVE_ZEC_USDC_ADAPTER_ID.toUpperCase();
  assert.throws(() => parseNativeZecUsdcMatcherManifest(uppercaseAdapter), /exactly 32 bytes|canonical lowercase/);
});

test("cross-chain, USDT, and mismatched order-domain identities are rejected", () => {
  const wrongChain = copyManifest();
  wrongChain.evm.network = "eip155:421614";
  wrongChain.evm.chainId = 421614;
  assert.throws(() => parseNativeZecUsdcMatcherManifest(wrongChain), /EVM network/);

  const usdt = copyManifest();
  usdt.market.quote.asset = "eip155:42161/erc20:0x1111111111111111111111111111111111111111";
  assert.throws(() => parseNativeZecUsdcMatcherManifest(usdt), /quote asset identifier/);

  const wrongDomain = copyManifest();
  wrongDomain.orderDomain.version = "2";
  assert.throws(() => parseNativeZecUsdcMatcherManifest(wrongDomain), /order domain version/);
});

test("only a complete exact identity with a matching configuration hash can enable submission", () => {
  const verifyingContract = `0x${"11".repeat(20)}`;
  const active = copyManifest();
  active.deployed = true;
  active.submissionEnabled = true;
  active.evm.verifyingContract = verifyingContract;
  active.configurationHash = computeNativeZecUsdcMatcherConfigurationHash(verifyingContract);
  const parsed = parseNativeZecUsdcMatcherManifest(active);
  assert.equal(parsed.enabled, true);
  assert.equal(parsed.configured, true);
  assert.equal(parsed.expectedMatcher?.configurationHash, active.configurationHash);
  assert.equal(parsed.expectedMatcher?.orderDomain.verifyingContract, verifyingContract);
  const exactConfiguration: PersistentMatcherConfiguration = {
    domain: parsed.orderDomain!,
    atomicSwapPolicy: {
      orderDomain: parsed.orderDomain!,
      pair: parsed.market,
      settlementProtocolVersion: parsed.settlementProtocolVersion,
      stablecoinRefundDelaySeconds: BigInt(parsed.manifest.settlement.stablecoinRefundDelaySeconds),
      zcashRefundSafetyDeltaSeconds: BigInt(parsed.manifest.settlement.zcashRefundSafetyDeltaSeconds),
      zcashRequiredConfirmations: parsed.manifest.settlement.zcashRequiredConfirmations,
      quoteRequiredConfirmations: parsed.manifest.settlement.quoteRequiredConfirmations,
    },
    solverQuotePolicy: {
      matcherDomainHash: hashOrderDomain(parsed.orderDomain!),
      baseNetwork: parsed.market.base.network,
      baseAsset: parsed.market.base.asset,
      quoteNetwork: parsed.market.quote.network,
      quoteAsset: parsed.market.quote.asset,
      settlementProtocolVersion: parsed.settlementProtocolVersion,
      maximumCapacityBaseAtoms: parsed.limits.maximumSolverCapacityBaseAtoms,
      maximumLifetimeSeconds: parsed.limits.maximumSolverLifetimeSeconds,
      maximumFeeBps: parsed.limits.maximumSolverFeeBps,
      maximumSlippageBps: parsed.limits.maximumSolverSlippageBps,
    },
    maximumOrderLifetimeSeconds: parsed.limits.maximumOrderLifetimeSeconds,
    limits: {
      minimumBaseAmountAtoms: parsed.limits.minimumBaseAmountAtoms,
      maximumBaseAmountAtoms: parsed.limits.maximumBaseAmountAtoms,
      maximumAcceptedOrders: parsed.limits.maximumAcceptedOrders,
      maximumOpenOrders: parsed.limits.maximumOpenOrders,
      maximumOpenOrdersPerAccount: parsed.limits.maximumOpenOrdersPerAccount,
      maximumSolverQuotes: parsed.limits.maximumSolverQuotes,
      maximumRouteFills: parsed.limits.maximumRouteFills,
      maximumSolverFills: parsed.limits.maximumSolverFills,
    },
  };
  assert.equal(matcherConfigurationHash(exactConfiguration), active.configurationHash);

  const changedLimit = copyManifest();
  changedLimit.deployed = true;
  changedLimit.submissionEnabled = true;
  changedLimit.evm.verifyingContract = verifyingContract;
  changedLimit.configurationHash = active.configurationHash;
  changedLimit.limits.maximumOrderLifetimeSeconds = "10001";
  assert.throws(() => parseNativeZecUsdcMatcherManifest(changedLimit), /configuration hash/);

  const forgedHash = copyManifest();
  forgedHash.deployed = true;
  forgedHash.submissionEnabled = true;
  forgedHash.evm.verifyingContract = verifyingContract;
  forgedHash.configurationHash = `0x${"12".repeat(32)}`;
  assert.throws(() => parseNativeZecUsdcMatcherManifest(forgedHash), /configuration hash/);
});
