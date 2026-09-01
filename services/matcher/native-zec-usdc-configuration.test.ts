import assert from "node:assert/strict";
import test from "node:test";

import { hashOrderDomain } from "../../src/lib/eip712-order.ts";
import {
  NATIVE_ZEC_USDC_MATCHER_DEPLOYMENT,
  NATIVE_ZEC_USDC_MATCHER_MANIFEST,
  computeNativeZecUsdcMatcherConfigurationHash,
  parseNativeZecUsdcMatcherManifest,
} from "../../src/lib/native-zec-usdc-matcher-manifest.ts";
import {
  NATIVE_ZEC_USDT_MATCHER_DEPLOYMENT,
  NATIVE_ZEC_USDT_MATCHER_MANIFEST,
  computeNativeZecUsdtMatcherConfigurationHash,
  parseNativeZecUsdtMatcherManifest,
} from "../../src/lib/native-zec-usdt-matcher-manifest.ts";
import { matcherConfigurationHash } from "../../src/lib/persistent-matcher.ts";
import { adapterIdentifier } from "../../src/lib/order-domain.ts";
import {
  nativeMatcherDeploymentForRuntimeMarket,
  nativeMatcherPersistentConfigurationForMarket,
  nativeZecUsdcMatcherPersistentConfiguration,
  nativeZecUsdtMatcherPersistentConfiguration,
} from "./native-zec-usdc-configuration.ts";

type ActivationFixture = {
  deployed: boolean;
  submissionEnabled: boolean;
  evm: { verifyingContract: string | null };
  configurationHash: string | null;
};

function activatedDeployment() {
  const manifest = structuredClone(NATIVE_ZEC_USDC_MATCHER_MANIFEST) as unknown as ActivationFixture;
  const verifyingContract = `0x${"11".repeat(20)}`;
  manifest.deployed = true;
  manifest.submissionEnabled = true;
  manifest.evm.verifyingContract = verifyingContract;
  manifest.configurationHash = computeNativeZecUsdcMatcherConfigurationHash(verifyingContract);
  return parseNativeZecUsdcMatcherManifest(manifest);
}

function activatedUsdtDeployment() {
  const manifest = structuredClone(NATIVE_ZEC_USDT_MATCHER_MANIFEST) as unknown as ActivationFixture;
  const verifyingContract = `0x${"33".repeat(20)}`;
  manifest.deployed = true;
  manifest.submissionEnabled = true;
  manifest.evm.verifyingContract = verifyingContract;
  manifest.configurationHash = computeNativeZecUsdtMatcherConfigurationHash(verifyingContract);
  return parseNativeZecUsdtMatcherManifest(manifest);
}

test("leaves the matcher unconfigured for the tracked disabled manifest", () => {
  assert.equal(NATIVE_ZEC_USDC_MATCHER_DEPLOYMENT.enabled, false);
  assert.equal(nativeZecUsdcMatcherPersistentConfiguration(), null);
});

test("requires an exact runtime market and never defaults to ZEC/USDC", () => {
  assert.equal(nativeMatcherDeploymentForRuntimeMarket(undefined), null);
  assert.equal(nativeMatcherDeploymentForRuntimeMarket("ZEC/USDC"), NATIVE_ZEC_USDC_MATCHER_DEPLOYMENT);
  assert.equal(nativeMatcherDeploymentForRuntimeMarket("ZEC/USDT"), NATIVE_ZEC_USDT_MATCHER_DEPLOYMENT);
  assert.equal(nativeMatcherDeploymentForRuntimeMarket("zec/usdt"), null);
  assert.equal(nativeMatcherPersistentConfigurationForMarket("ZEC/USDC"), null);
  assert.equal(nativeMatcherPersistentConfigurationForMarket("ZEC/USDT"), null);
});

test("maps an exact enabled ZEC/USDT manifest without substituting USDC", () => {
  const deployment = activatedUsdtDeployment();
  const configuration = nativeZecUsdtMatcherPersistentConfiguration(deployment);
  assert.ok(configuration);
  assert.equal(configuration.atomicSwapPolicy.pair.quote.asset, deployment.market.quote.asset);
  assert.notEqual(configuration.atomicSwapPolicy.pair.quote.asset, NATIVE_ZEC_USDC_MATCHER_DEPLOYMENT.market.quote.asset);
  assert.equal(matcherConfigurationHash(configuration), deployment.configurationHash);
});

test("maps an exact enabled manifest into the persistent matcher configuration", () => {
  const deployment = activatedDeployment();
  const expectedMatcher = deployment.expectedMatcher;
  const configuration = nativeZecUsdcMatcherPersistentConfiguration(deployment);
  assert.ok(expectedMatcher);
  assert.ok(configuration);
  assert.equal(hashOrderDomain(configuration.domain), hashOrderDomain(expectedMatcher.orderDomain));
  assert.deepEqual(configuration.atomicSwapPolicy.pair, expectedMatcher.market);
  assert.equal(configuration.atomicSwapPolicy.pair.quote.network, `eip155:${configuration.domain.chainId}`);
  assert.equal(
    adapterIdentifier(configuration.atomicSwapPolicy.settlementProtocolVersion),
    expectedMatcher.settlementAdapterId,
  );
  assert.deepEqual(configuration.limits, {
    minimumBaseAmountAtoms: deployment.limits.minimumBaseAmountAtoms,
    maximumBaseAmountAtoms: deployment.limits.maximumBaseAmountAtoms,
    maximumAcceptedOrders: deployment.limits.maximumAcceptedOrders,
    maximumOpenOrders: deployment.limits.maximumOpenOrders,
    maximumOpenOrdersPerAccount: deployment.limits.maximumOpenOrdersPerAccount,
    maximumSolverQuotes: deployment.limits.maximumSolverQuotes,
    maximumRouteFills: deployment.limits.maximumRouteFills,
    maximumSolverFills: deployment.limits.maximumSolverFills,
  });
  assert.equal(matcherConfigurationHash(configuration), expectedMatcher.configurationHash);
});

test("fails closed when the enabled deployment no longer matches its expected identity", () => {
  const deployment = activatedDeployment();
  const mismatched = {
    ...deployment,
    settlementAdapterId: `0x${"22".repeat(32)}` as typeof deployment.settlementAdapterId,
  };
  assert.equal(nativeZecUsdcMatcherPersistentConfiguration(mismatched), null);
});
