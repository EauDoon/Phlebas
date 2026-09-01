import {
  assertSettlementAccountRoles,
  assertSettlementAccounts,
} from "./atomic-swap-plan.ts";
import {
  hashTypedOrder,
  typedOrderData,
  type TypedOrderIntent,
} from "./eip712-order.ts";
import { evmAuthorizedSignerId } from "./matcher-auth.ts";
import {
  assertMatcherAccountIdentity,
  assertMatcherHealthIdentity,
  type VerifiedMatcherAccount,
} from "./matcher-client.ts";
import {
  NATIVE_ZEC_USDC_MARKET_ID,
  NATIVE_ZEC_USDC_SETTLEMENT_PAIR,
  type NativeZecUsdcMatcherDeploymentState,
} from "./native-zec-usdc-matcher-manifest.ts";
import { accountIdentifier, normalizeAddress, normalizeHex32, type Hex32 } from "./order-domain.ts";
import { assertOrderPolicy, VENUE_CLOB } from "./order-policy.ts";
import { assertZcashTransparentAccount, canonicalZcashTransparentAccount } from "./zcash-address.ts";

export type MatcherBuyOrderDraftInput = Readonly<{
  deployment: NativeZecUsdcMatcherDeploymentState;
  selectedMarket: string;
  connectedEvmWallet: string;
  zcashRecipient: string;
  matcherHealth: unknown;
  matcherAccount: unknown;
  priceTicks: bigint;
  sizeAtoms: bigint;
  occurredAt: bigint;
  expiresAt: bigint;
  nonce: bigint;
  salt: string;
}>;

export type MatcherBuyOrderDraft = Readonly<{
  healthConfigurationHash: Hex32;
  accountCheckpoint: VerifiedMatcherAccount["checkpoint"];
  order: TypedOrderIntent;
  accounts: Readonly<{
    sourceAccount: string;
    recipientAccount: string;
  }>;
  requestId: string;
  occurredAt: bigint;
  typedOrderData: ReturnType<typeof typedOrderData>;
}>;

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  }
  return value;
}

function enabledExpectedMatcher(deployment: NativeZecUsdcMatcherDeploymentState) {
  if (deployment.enabled !== true
    || deployment.state !== "enabled"
    || deployment.deployed !== true
    || deployment.submissionEnabled !== true
    || deployment.expectedMatcher === null
    || deployment.orderDomain === null
    || deployment.configurationHash === null) {
    throw new Error("Native ZEC/USDC matcher deployment is not enabled");
  }

  const expected = deployment.expectedMatcher;
  if (expected.configurationHash !== deployment.configurationHash
    || expected.orderDomain.chainId !== deployment.orderDomain.chainId
    || expected.orderDomain.verifyingContract !== deployment.orderDomain.verifyingContract
    || expected.settlementAdapterId !== deployment.settlementAdapterId
    || expected.market.base.network !== deployment.market.base.network
    || expected.market.base.asset !== deployment.market.base.asset
    || expected.market.base.environment !== deployment.market.base.environment
    || expected.market.base.decimals !== deployment.market.base.decimals
    || expected.market.quote.network !== deployment.market.quote.network
    || expected.market.quote.asset !== deployment.market.quote.asset
    || expected.market.quote.environment !== deployment.market.quote.environment
    || expected.market.quote.decimals !== deployment.market.quote.decimals) {
    throw new Error("Native ZEC/USDC matcher deployment identity is inconsistent");
  }
  return expected;
}

function assertSelectedNativeMarket(
  deployment: NativeZecUsdcMatcherDeploymentState,
  selectedMarket: string,
): void {
  if (selectedMarket !== NATIVE_ZEC_USDC_MARKET_ID
    || deployment.manifest.market.id !== NATIVE_ZEC_USDC_MARKET_ID
    || deployment.manifest.market.settlementPair !== NATIVE_ZEC_USDC_SETTLEMENT_PAIR) {
    throw new Error("Only the exact ZEC/USDC market can create a matcher buy-order draft");
  }
}

function assertBaseAmountWithinManifestLimits(
  sizeAtoms: bigint,
  deployment: NativeZecUsdcMatcherDeploymentState,
): void {
  if (typeof sizeAtoms !== "bigint"
    || sizeAtoms < deployment.limits.minimumBaseAmountAtoms
    || sizeAtoms > deployment.limits.maximumBaseAmountAtoms) {
    throw new RangeError("Buy order size is outside the native matcher manifest limits");
  }
}

/**
 * Builds a local review snapshot only. It neither signs nor submits an order.
 */
export function buildMatcherBuyOrderDraft(input: MatcherBuyOrderDraftInput): MatcherBuyOrderDraft {
  const deployment = input.deployment;
  const expectedMatcher = enabledExpectedMatcher(deployment);
  assertSelectedNativeMarket(deployment, input.selectedMarket);

  const health = assertMatcherHealthIdentity(input.matcherHealth, expectedMatcher);
  const domain = deployment.orderDomain!;
  const wallet = normalizeAddress(input.connectedEvmWallet, "Connected EVM wallet");
  const quoteNetwork = deployment.market.quote.network;
  if (quoteNetwork !== `eip155:${domain.chainId}`) {
    throw new Error("Native ZEC/USDC quote network does not match the signing domain");
  }

  const sourceAccount = `${quoteNetwork}:${wallet}`;
  const recipientAccount = canonicalZcashTransparentAccount("mainnet", input.zcashRecipient);
  assertZcashTransparentAccount(recipientAccount, "mainnet", "Buy-order Zcash recipient");
  const makerAccountId = evmAuthorizedSignerId(domain.chainId, wallet);
  const account = assertMatcherAccountIdentity(input.matcherAccount, expectedMatcher, makerAccountId);
  assertBaseAmountWithinManifestLimits(input.sizeAtoms, deployment);

  const order: TypedOrderIntent = {
    makerAccountId,
    authorizedSignerId: makerAccountId,
    baseChainId: deployment.orderPair.baseChainId,
    baseAssetId: deployment.orderPair.baseAssetId,
    quoteChainId: deployment.orderPair.quoteChainId,
    quoteAssetId: deployment.orderPair.quoteAssetId,
    side: 0,
    baseAmountAtoms: input.sizeAtoms,
    limitPriceTicks: input.priceTicks,
    nonce: input.nonce,
    accountEpoch: account.accountEpoch,
    expiry: input.expiresAt,
    salt: normalizeHex32(input.salt, "Buy order salt"),
    recipientAccountId: accountIdentifier(recipientAccount),
    timeInForce: 0,
    maximumFeeBps: 0n,
    allowedVenues: VENUE_CLOB,
    settlementAdapterId: deployment.settlementAdapterId,
  };
  const accounts = { sourceAccount, recipientAccount };
  assertSettlementAccounts(order, accounts);
  assertSettlementAccountRoles(order.side, accounts, deployment.market, "Buy order");

  assertOrderPolicy(order, {
    nowSeconds: input.occurredAt,
    activeAccountEpoch: account.accountEpoch,
    pair: deployment.orderPair,
    settlementAdapterId: deployment.settlementAdapterId,
    maximumLifetimeSeconds: deployment.limits.maximumOrderLifetimeSeconds,
    requireClob: true,
  });

  const requestId = `order-${hashTypedOrder(domain, order).slice(2)}`;
  return deepFreeze({
    healthConfigurationHash: health.configurationHash,
    accountCheckpoint: account.checkpoint,
    order,
    accounts,
    requestId,
    occurredAt: input.occurredAt,
    typedOrderData: typedOrderData(domain, order),
  });
}
