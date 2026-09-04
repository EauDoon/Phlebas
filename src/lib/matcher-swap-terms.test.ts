import assert from "node:assert/strict";
import test from "node:test";

import {
  type AtomicSwapParty,
  type AtomicSwapPolicy,
} from "./atomic-swap-plan.ts";
import { createOrderDomain, hashTypedOrder, type TypedOrderIntent } from "./eip712-order.ts";
import { bytesToHex, keccak256Text } from "./keccak.ts";
import {
  accountIdentifier,
  adapterIdentifier,
  assetIdentifier,
  chainIdentifier,
  type Hex32,
} from "./order-domain.ts";
import {
  ETHEREUM_MAINNET_NETWORK,
  ETHEREUM_MAINNET_USDC_ASSET,
  ETHEREUM_MAINNET_USDT_ASSET,
  NATIVE_ZEC_ASSET,
  ZCASH_MAINNET_NETWORK,
} from "./mainnet-assets.ts";
import {
  hashSwapFinalityPolicy,
  hashSwapObserverPolicy,
  hashSwapTimingPolicy,
} from "./swap-policy.ts";
import { materializeMatcherSwapTerms } from "./matcher-swap-terms.ts";
import { hashSwapMarketPolicy, hashSwapTerms, swapIdForTerms } from "./swap-domain.ts";
import { decodeZcashTransparentAccount, hash160Value, p2pkhAddress, p2shAddress } from "./zcash-address.ts";
import { projectZcashSwapTerms } from "./zcash-swap-projection.ts";
import { createSwapState } from "./swap-state.ts";

// Synthetic accounts and context below are unsigned test data, not release evidence.
const orderDomain = createOrderDomain(1n, "0x1111111111111111111111111111111111111111");
const policy: AtomicSwapPolicy = {
  orderDomain,
  pair: {
    base: {
      network: ZCASH_MAINNET_NETWORK,
      asset: NATIVE_ZEC_ASSET,
      environment: "mainnet",
      decimals: 8,
    },
    quote: {
      network: ETHEREUM_MAINNET_NETWORK,
      asset: ETHEREUM_MAINNET_USDC_ASSET,
      environment: "mainnet",
      decimals: 6,
    },
  },
  settlementProtocolVersion: "transparent-htlc-v1",
  stablecoinRefundDelaySeconds: 3_600n,
  zcashRefundSafetyDeltaSeconds: 7_200n,
  zcashRequiredConfirmations: 10,
  quoteRequiredConfirmations: 20,
};

const timingPolicy = {
  minimumFundingWindowSeconds: 100n,
  minimumClaimWindowSeconds: 100n,
  minimumSafetyWindowSeconds: 500n,
};
const marketPolicy = {
  version: 1 as const,
  markets: [{
    zecChain: ZCASH_MAINNET_NETWORK,
    zecAsset: NATIVE_ZEC_ASSET,
    quoteChain: ETHEREUM_MAINNET_NETWORK,
    quoteAsset: ETHEREUM_MAINNET_USDC_ASSET,
  }],
};
const evidencePolicies = {
  observer: {
    version: 1 as const,
    sourceIds: [keccak256Text("observer-a"), keccak256Text("observer-b")].sort() as Hex32[],
    requiredSourceCount: 2n,
    maxObservationDelaySeconds: 600n,
  },
  zecFinality: {
    version: 1 as const,
    chain: ZCASH_MAINNET_NETWORK,
    minimumConfirmations: 10n,
    minimumAgeSeconds: 60n,
  },
  evmFinality: {
    version: 1 as const,
    chain: ETHEREUM_MAINNET_NETWORK,
    minimumConfirmations: 20n,
    minimumAgeSeconds: 30n,
  },
};

const ACCEPTED_AT = 1_800_000_000n;
const context: Parameters<typeof materializeMatcherSwapTerms>[1] = {
  feeRecipient: "0x7777777777777777777777777777777777777777",
  evmEscrowContract: "0x6666666666666666666666666666666666666666",
  secretHash: "0x425ed4e4a36b30ea21b90e21c712c649e8214c29b7eaf68089d1039c6e55384c" as Hex32,
  authorizationDeadline: ACCEPTED_AT + 100n,
  zecFundBy: ACCEPTED_AT + 200n,
  evmFundBy: ACCEPTED_AT + 300n,
  evmClaimSafetyCutoff: ACCEPTED_AT + 400n,
  timeoutPolicyId: hashSwapTimingPolicy(timingPolicy),
  marketPolicyId: hashSwapMarketPolicy(marketPolicy),
  observerPolicyId: hashSwapObserverPolicy(evidencePolicies.observer),
  zecFinalityPolicyId: hashSwapFinalityPolicy(evidencePolicies.zecFinality),
  evmFinalityPolicyId: hashSwapFinalityPolicy(evidencePolicies.evmFinality),
};

function zcashAccount(name: string): string {
  const hash = hash160Value(new TextEncoder().encode(`matcher-terms:${name}`));
  return `zcash:mainnet:${p2pkhAddress(hash, "mainnet")}`;
}

function evmAccount(value: string): string {
  return `eip155:1:0x${value.repeat(40)}`;
}

function party(name: string, side: 0 | 1, maximumFeeBps = 30n): AtomicSwapParty {
  const sourceAccount = side === 0 ? evmAccount("1") : zcashAccount(`${name}:source`);
  const recipientAccount = side === 0 ? zcashAccount(`${name}:recipient`) : evmAccount("2");
  const order: TypedOrderIntent = {
    makerAccountId: accountIdentifier(sourceAccount),
    authorizedSignerId: accountIdentifier(`signer:${name}`),
    recipientAccountId: accountIdentifier(recipientAccount),
    baseChainId: chainIdentifier(ZCASH_MAINNET_NETWORK),
    baseAssetId: assetIdentifier(NATIVE_ZEC_ASSET),
    quoteChainId: chainIdentifier(ETHEREUM_MAINNET_NETWORK),
    quoteAssetId: assetIdentifier(ETHEREUM_MAINNET_USDC_ASSET),
    side,
    baseAmountAtoms: 100_000_001n,
    limitPriceTicks: side === 0 ? 5_100n : 4_900n,
    nonce: 1n,
    accountEpoch: 0n,
    expiry: 2_000_000_000n,
    salt: keccak256Text(`salt:${name}`),
    timeInForce: 0,
    maximumFeeBps,
    allowedVenues: 3,
    settlementAdapterId: adapterIdentifier(policy.settlementProtocolVersion),
  };
  return {
    orderHash: hashTypedOrder(orderDomain, order),
    order,
    accounts: { sourceAccount, recipientAccount },
  };
}

function input(overrides: Partial<Parameters<typeof materializeMatcherSwapTerms>[0]> = {}) {
  return {
    venue: "order-book" as const,
    fillIndex: 0,
    taker: party("buyer", 0),
    counterparty: party("seller", 1),
    acceptedAtSeconds: ACCEPTED_AT,
    executionPriceTicks: 5_000n,
    baseAmountAtoms: 100_000_000n,
    feeBps: 0n,
    policy,
    ...overrides,
  };
}

test("materializes exact Mainnet terms and derives the Zcash lock from wallet accounts", () => {
  const terms = materializeMatcherSwapTerms(input(), context);
  const buyer = input().taker;
  const seller = input().counterparty;

  assert.equal(terms.zecOrderHash, seller.orderHash);
  assert.equal(terms.stablecoinOrderHash, buyer.orderHash);
  assert.equal(terms.zecSellerId, seller.order.makerAccountId);
  assert.equal(terms.stablecoinSellerId, buyer.order.makerAccountId);
  assert.equal(terms.zecAmountZatoshis, 100_000_000n);
  assert.equal(terms.quoteAmountAtoms, 50_000_000n);
  assert.equal(terms.protocolFeeQuoteAtoms, 0n);
  assert.equal(terms.maximumFeeBps, 30n);
  assert.equal(terms.evmFunder, `0x${"1".repeat(40)}`);
  assert.equal(terms.evmClaimRecipient, `0x${"2".repeat(40)}`);
  assert.equal(terms.evmRefundRecipient, `0x${"1".repeat(40)}`);
  assert.equal(terms.authorizationDeadline, ACCEPTED_AT + 100n);
  assert.equal(terms.evmRefundTime, ACCEPTED_AT + 3_600n);
  assert.equal(terms.zecRefundTime, ACCEPTED_AT + 10_800n);
  assert.equal(Object.isFrozen(terms), true);
  assert.deepEqual(terms, materializeMatcherSwapTerms(input(), context));
  const state = createSwapState(terms, timingPolicy, evidencePolicies, marketPolicy);
  assert.deepEqual(state.authorizations, {});
  assert.equal(state.zec.phase, "unfunded");
  assert.equal(state.evm.phase, "unfunded");

  const projection = projectZcashSwapTerms(terms);
  assert.equal(projection.swapId, swapIdForTerms(terms));
  assert.equal(projection.termsHash, hashSwapTerms(terms));
  assert.equal(projection.amountZatoshis, "100000000");
  assert.equal(projection.refundTimeSeconds, terms.zecRefundTime.toString());
  assert.equal(projection.lockScriptHash, terms.zcashLockScriptHash);

  const claimAccount = decodeZcashTransparentAccount(buyer.accounts.recipientAccount);
  const refundAccount = decodeZcashTransparentAccount(seller.accounts.sourceAccount);
  assert.equal(terms.zcashClaimPubKeyHash, `0x${bytesToHex(claimAccount.payload)}`);
  assert.equal(terms.zcashRefundPubKeyHash, `0x${bytesToHex(refundAccount.payload)}`);
  const serialized = JSON.stringify(terms, (_key, value) => typeof value === "bigint" ? value.toString() : value);
  assert.equal(serialized.includes("signature"), false);
  assert.equal(serialized.includes("transactionBytes"), false);
});

test("maps side roles and order hashes independent of taker direction", () => {
  const buyer = party("reversed-buyer", 0);
  const seller = party("reversed-seller", 1);
  const terms = materializeMatcherSwapTerms(input({ taker: seller, counterparty: buyer }), context);

  assert.equal(terms.zecOrderHash, seller.orderHash);
  assert.equal(terms.stablecoinOrderHash, buyer.orderHash);
  assert.equal(terms.zecSellerId, seller.order.makerAccountId);
  assert.equal(terms.stablecoinSellerId, buyer.order.makerAccountId);
  assert.equal(terms.evmFunder, `0x${"1".repeat(40)}`);
  assert.equal(terms.evmClaimRecipient, `0x${"2".repeat(40)}`);
});

test("rejects solver plans before they can enter canonical terms", () => {
  assert.throws(
    () => materializeMatcherSwapTerms(input({ venue: "solver" }), context),
    /order-book fills only/,
  );
});

test("rejects both maker-side rounding variants instead of changing the plan quote", () => {
  const buyer = party("rounded-buyer", 0);
  const seller = party("rounded-seller", 1);
  const common = {
    executionPriceTicks: 5_001n,
    baseAmountAtoms: 100_000_001n,
  };
  assert.throws(
    () => materializeMatcherSwapTerms(input({ ...common, taker: buyer, counterparty: seller }), context),
    /exact integer settlement/,
  );
  assert.throws(
    () => materializeMatcherSwapTerms(input({ ...common, taker: seller, counterparty: buyer }), context),
    /exact integer settlement/,
  );
});

test("rejects a P2SH Zcash refund source because canonical terms require a pubkey hash", () => {
  const buyer = party("p2sh-buyer", 0);
  const seller = party("p2sh-seller", 1);
  const sourceAccount = `zcash:mainnet:${p2shAddress(hash160Value(new TextEncoder().encode("p2sh-source")), "mainnet")}`;
  const order = {
    ...seller.order,
    makerAccountId: accountIdentifier(sourceAccount),
  };
  const p2shSeller: AtomicSwapParty = {
    ...seller,
    order,
    orderHash: hashTypedOrder(orderDomain, order),
    accounts: { ...seller.accounts, sourceAccount },
  };
  assert.throws(
    () => materializeMatcherSwapTerms(input({ taker: buyer, counterparty: p2shSeller }), context),
    /P2PKH account/,
  );
});

test("requires every settlement context field and never invents the secret or escrow", () => {
  const missingSecret = { ...context } as Record<string, unknown>;
  delete missingSecret.secretHash;
  assert.throws(
    () => materializeMatcherSwapTerms(input(), missingSecret as Parameters<typeof materializeMatcherSwapTerms>[1]),
    /context requires secretHash/,
  );

  assert.throws(
    () => materializeMatcherSwapTerms(input(), {
      ...context,
      evmEscrowContract: "0x0000000000000000000000000000000000000000",
    }),
    /cannot be zero/,
  );
  assert.throws(
    () => materializeMatcherSwapTerms(input(), {
      ...context,
      secretHash: `0x${"00".repeat(32)}` as Hex32,
    }),
    /cannot be zero/,
  );
});

test("uses the lower signed fee cap and rejects non-canonical deadline order", () => {
  const buyer = party("fee-buyer", 0, 29n);
  const seller = party("fee-seller", 1, 30n);
  assert.equal(materializeMatcherSwapTerms(input({ taker: buyer, counterparty: seller }), context).maximumFeeBps, 29n);
  assert.equal(materializeMatcherSwapTerms(input({ taker: party("zero-fee-buyer", 0, 0n), counterparty: seller }), context).maximumFeeBps, 0n);
  assert.throws(
    () => materializeMatcherSwapTerms(input(), {
      ...context,
      evmClaimSafetyCutoff: ACCEPTED_AT + 3_600n,
    }),
    /deadlines must be strictly increasing/,
  );
});

test("accepts exact native Mainnet USDT with the same canonical adapter", () => {
  const usdtPolicy: AtomicSwapPolicy = {
    ...policy,
    pair: { ...policy.pair, quote: { ...policy.pair.quote, asset: ETHEREUM_MAINNET_USDT_ASSET } },
  };
  const buyer = party("usdt-buyer", 0);
  const seller = party("usdt-seller", 1);
  const usdtInput = input({
    taker: {
      ...buyer,
      order: { ...buyer.order, quoteAssetId: assetIdentifier(ETHEREUM_MAINNET_USDT_ASSET) },
      orderHash: hashTypedOrder(orderDomain, { ...buyer.order, quoteAssetId: assetIdentifier(ETHEREUM_MAINNET_USDT_ASSET) }),
    },
    counterparty: {
      ...seller,
      order: { ...seller.order, quoteAssetId: assetIdentifier(ETHEREUM_MAINNET_USDT_ASSET) },
      orderHash: hashTypedOrder(orderDomain, { ...seller.order, quoteAssetId: assetIdentifier(ETHEREUM_MAINNET_USDT_ASSET) }),
    },
    policy: usdtPolicy,
  });
  const usdtMarketPolicy = {
    ...marketPolicy, markets: [{ ...marketPolicy.markets[0], quoteAsset: ETHEREUM_MAINNET_USDT_ASSET }],
  };
  const terms = materializeMatcherSwapTerms(usdtInput, { ...context, marketPolicyId: hashSwapMarketPolicy(usdtMarketPolicy) });
  assert.equal(terms.quoteAsset, ETHEREUM_MAINNET_USDT_ASSET);
  assert.deepEqual(createSwapState(terms, timingPolicy, evidencePolicies, usdtMarketPolicy).authorizations, {});
});

test("rejects a substituted asset, environment, precision, or wallet account", () => {
  const original = input();
  for (const quote of [
    { ...policy.pair.quote, asset: `eip155:1/erc20:0x${"44".repeat(20)}` },
    { ...policy.pair.quote, decimals: 18 },
    { ...policy.pair.quote, environment: "testnet" as const },
  ]) {
    const rebind = (party: AtomicSwapParty): AtomicSwapParty => {
      const order = { ...party.order, quoteAssetId: assetIdentifier(quote.asset) };
      return { ...party, order, orderHash: hashTypedOrder(orderDomain, order) };
    };
    assert.throws(() => materializeMatcherSwapTerms({
      ...original,
      taker: rebind(original.taker), counterparty: rebind(original.counterparty),
      policy: { ...policy, pair: { ...policy.pair, quote } },
    }, context));
  }
  assert.throws(() => materializeMatcherSwapTerms({
    ...original, taker: {
      ...original.taker, accounts: { ...original.taker.accounts, recipientAccount: zcashAccount("substitution") },
    },
  }, context), /recipient account does not match/);
});
