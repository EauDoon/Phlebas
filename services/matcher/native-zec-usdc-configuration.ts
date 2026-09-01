import { hashOrderDomain } from "../../src/lib/eip712-order.ts";
import {
  NATIVE_ZEC_USDC_MATCHER_DEPLOYMENT,
  type NativeZecUsdcMatcherDeploymentState,
} from "../../src/lib/native-zec-usdc-matcher-manifest.ts";
import {
  matcherConfigurationHash,
  type PersistentMatcherConfiguration,
} from "../../src/lib/persistent-matcher.ts";
import { adapterIdentifier } from "../../src/lib/order-domain.ts";

function sameMarket(
  left: NativeZecUsdcMatcherDeploymentState["market"],
  right: NativeZecUsdcMatcherDeploymentState["market"],
): boolean {
  return left.base.network === right.base.network
    && left.base.asset === right.base.asset
    && left.base.environment === right.base.environment
    && left.base.decimals === right.base.decimals
    && left.quote.network === right.quote.network
    && left.quote.asset === right.quote.asset
    && left.quote.environment === right.quote.environment
    && left.quote.decimals === right.quote.decimals;
}

/**
 * Returns the persistent matcher configuration only for an exact, enabled
 * native ZEC/USDC deployment manifest. Any incomplete or inconsistent state
 * leaves the service unconfigured.
 */
export function nativeZecUsdcMatcherPersistentConfiguration(
  deployment: NativeZecUsdcMatcherDeploymentState = NATIVE_ZEC_USDC_MATCHER_DEPLOYMENT,
): PersistentMatcherConfiguration | null {
  try {
    const expectedMatcher = deployment.expectedMatcher;
    const orderDomain = deployment.orderDomain;
    const manifest = deployment.manifest;
    if (!deployment.enabled
      || !deployment.deployed
      || !deployment.submissionEnabled
      || !manifest.deployed
      || !manifest.submissionEnabled
      || !expectedMatcher
      || !orderDomain
      || !deployment.configurationHash
      || manifest.configurationHash !== deployment.configurationHash
      || expectedMatcher.configurationHash !== deployment.configurationHash
      || hashOrderDomain(expectedMatcher.orderDomain) !== hashOrderDomain(orderDomain)
      || !sameMarket(expectedMatcher.market, deployment.market)
      || expectedMatcher.settlementAdapterId !== deployment.settlementAdapterId) {
      return null;
    }
    const configuration: PersistentMatcherConfiguration = {
      domain: orderDomain,
      atomicSwapPolicy: {
        orderDomain,
        pair: deployment.market,
        settlementProtocolVersion: deployment.settlementProtocolVersion,
        stablecoinRefundDelaySeconds: BigInt(manifest.settlement.stablecoinRefundDelaySeconds),
        zcashRefundSafetyDeltaSeconds: BigInt(manifest.settlement.zcashRefundSafetyDeltaSeconds),
        zcashRequiredConfirmations: manifest.settlement.zcashRequiredConfirmations,
        quoteRequiredConfirmations: manifest.settlement.quoteRequiredConfirmations,
      },
      solverQuotePolicy: {
        matcherDomainHash: hashOrderDomain(orderDomain),
        baseNetwork: deployment.market.base.network,
        baseAsset: deployment.market.base.asset,
        quoteNetwork: deployment.market.quote.network,
        quoteAsset: deployment.market.quote.asset,
        settlementProtocolVersion: deployment.settlementProtocolVersion,
        maximumCapacityBaseAtoms: deployment.limits.maximumSolverCapacityBaseAtoms,
        maximumLifetimeSeconds: deployment.limits.maximumSolverLifetimeSeconds,
        maximumFeeBps: deployment.limits.maximumSolverFeeBps,
        maximumSlippageBps: deployment.limits.maximumSolverSlippageBps,
      },
      maximumOrderLifetimeSeconds: deployment.limits.maximumOrderLifetimeSeconds,
      limits: {
        minimumBaseAmountAtoms: deployment.limits.minimumBaseAmountAtoms,
        maximumBaseAmountAtoms: deployment.limits.maximumBaseAmountAtoms,
        maximumAcceptedOrders: deployment.limits.maximumAcceptedOrders,
        maximumOpenOrders: deployment.limits.maximumOpenOrders,
        maximumOpenOrdersPerAccount: deployment.limits.maximumOpenOrdersPerAccount,
        maximumSolverQuotes: deployment.limits.maximumSolverQuotes,
        maximumRouteFills: deployment.limits.maximumRouteFills,
        maximumSolverFills: deployment.limits.maximumSolverFills,
      },
    };
    if (configuration.atomicSwapPolicy.pair.quote.network !== `eip155:${configuration.domain.chainId}`
      || adapterIdentifier(configuration.atomicSwapPolicy.settlementProtocolVersion) !== expectedMatcher.settlementAdapterId
      || matcherConfigurationHash(configuration) !== expectedMatcher.configurationHash) {
      return null;
    }
    return configuration;
  } catch {
    return null;
  }
}
