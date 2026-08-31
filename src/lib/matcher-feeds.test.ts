import assert from "node:assert/strict";
import test from "node:test";

import { createOrderDomain, hashOrderDomain, hashTypedOrder, type TypedOrderIntent } from "./eip712-order.ts";
import { keccak256Text } from "./keccak.ts";
import { matcherBookFeed, matcherExecutionFeed, matcherSolverQuoteFeed } from "./matcher-feeds.ts";
import { accountIdentifier, adapterIdentifier, assetIdentifier, chainIdentifier } from "./order-domain.ts";
import { createPersistentMatcher, type PersistentMatcherConfiguration, type PersistentMatcherState } from "./persistent-matcher.ts";

const domain = createOrderDomain(42161n, "0x1111111111111111111111111111111111111111");
const baseNetwork = "bip122:00040fe8ec8471911baa1db1266ea15d";
const baseAsset = `${baseNetwork}/slip44:133`;
const quoteNetwork = "eip155:42161";
const quoteAsset = `${quoteNetwork}/erc20:0xaf88d065e77c8cc2239327c5edb3a432268e5831`;
const protocol = "transparent-htlc-v1";
const configuration = {
  domain,
  atomicSwapPolicy: {
    orderDomain: domain,
    pair: {
      base: { network: baseNetwork, asset: baseAsset, environment: "mainnet", decimals: 8 },
      quote: { network: quoteNetwork, asset: quoteAsset, environment: "mainnet", decimals: 6 },
    },
    settlementProtocolVersion: protocol,
    stablecoinRefundDelaySeconds: 3_600n,
    zcashRefundSafetyDeltaSeconds: 7_200n,
    zcashRequiredConfirmations: 10,
    quoteRequiredConfirmations: 65,
  },
  solverQuotePolicy: {
    matcherDomainHash: hashOrderDomain(domain),
    baseNetwork,
    baseAsset,
    quoteNetwork,
    quoteAsset,
    settlementProtocolVersion: protocol,
    maximumCapacityBaseAtoms: 1_000n,
    maximumLifetimeSeconds: 10_000n,
  },
  maximumOrderLifetimeSeconds: 10_000n,
  limits: {
    minimumBaseAmountAtoms: 1n,
    maximumBaseAmountAtoms: 1_000n,
    maximumAcceptedOrders: 10,
    maximumOpenOrders: 10,
    maximumOpenOrdersPerAccount: 10,
    maximumSolverQuotes: 10,
    maximumRouteFills: 10,
    maximumSolverFills: 10,
  },
} satisfies PersistentMatcherConfiguration;

function order(name: string, side: 0 | 1, price: bigint, amount: bigint, sequence: bigint, expiry = 2_000n) {
  const sourceAccount = side === 0 ? `${quoteNetwork}:source-${name}` : `zcash:mainnet:t3-${name}`;
  const recipientAccount = side === 0 ? `zcash:mainnet:t3-${name}` : `${quoteNetwork}:recipient-${name}`;
  const value: TypedOrderIntent = {
    makerAccountId: accountIdentifier(sourceAccount),
    authorizedSignerId: accountIdentifier(`${quoteNetwork}:signer-${name}`),
    recipientAccountId: accountIdentifier(recipientAccount),
    baseChainId: chainIdentifier(baseNetwork),
    baseAssetId: assetIdentifier(baseAsset),
    quoteChainId: chainIdentifier(quoteNetwork),
    quoteAssetId: assetIdentifier(quoteAsset),
    side,
    baseAmountAtoms: amount,
    limitPriceTicks: price,
    nonce: sequence,
    accountEpoch: 0n,
    expiry,
    salt: keccak256Text(name),
    timeInForce: 0,
    maximumFeeBps: 30n,
    allowedVenues: 1,
    settlementAdapterId: adapterIdentifier(protocol),
  };
  const hash = hashTypedOrder(domain, value);
  return [hash, {
    sequenced: { orderHash: hash, sequence, order: value, remainingBaseAtoms: amount },
    accounts: { sourceAccount, recipientAccount },
  }] as const;
}

function state(): PersistentMatcherState {
  const initial = createPersistentMatcher(configuration);
  return {
    ...initial,
    sequence: 9n,
    lastEventAtSeconds: 1_000n,
    openOrders: Object.fromEntries([
      order("bid-one", 0, 5_000n, 100n, 1n),
      order("bid-two", 0, 5_000n, 50n, 2n),
      order("bid-high", 0, 5_100n, 25n, 3n),
      order("ask", 1, 5_200n, 30n, 4n),
      order("expired", 1, 5_150n, 99n, 5n, 999n),
    ]),
    executions: [{ sequence: 7n, takerOrderHash: keccak256Text("execution"), route: null }],
  };
}

test("publishes price-time aggregated book levels without maker accounts", () => {
  const feed = matcherBookFeed(state(), 1_000n);
  assert.deepEqual(feed.bids.map((level) => [level.priceTicks, level.baseAmountAtoms, level.orderCount]), [
    [5_100n, 25n, 1],
    [5_000n, 150n, 2],
  ]);
  assert.deepEqual(feed.asks.map((level) => level.priceTicks), [5_200n]);
  assert.equal(JSON.stringify(feed, (_key, value) => typeof value === "bigint" ? value.toString() : value).includes("sourceAccount"), false);
});

test("bounds feeds and applies stable exclusive cursors", () => {
  const value = state();
  assert.deepEqual(matcherExecutionFeed(value, 7n), []);
  assert.deepEqual(matcherSolverQuoteFeed(value, 1_000n), []);
  assert.throws(() => matcherBookFeed(value, 1_000n, 101), /Feed limit/);
  assert.throws(() => matcherExecutionFeed(value, -1n), /cursor/);
});
