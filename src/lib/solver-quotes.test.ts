import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

import type { MatcherSignatureVerifier } from "./matcher-auth.ts";
import { keccak256Text } from "./keccak.ts";
import { accountIdentifier } from "./order-domain.ts";
import {
  acceptSolverQuote,
  activeSolverLevels,
  assertSolverQuote,
  consumeSolverCapacity,
  hashSolverQuote,
  SOLVER_QUOTE_RISKS,
  SOLVER_QUOTE_SIGNED_FIELDS,
  solverQuoteAsOrder,
  solverQuoteFieldCopy,
  solverQuoteInventoryCopy,
  solverQuoteRiskEntries,
  type SolverQuote,
  type SolverQuotePolicy,
} from "./solver-quotes.ts";

const policy: SolverQuotePolicy = {
  matcherDomainHash: keccak256Text("matcher-domain"),
  baseNetwork: "bip122:00040fe8ec8471911baa1db1266ea15d",
  baseAsset: "bip122:00040fe8ec8471911baa1db1266ea15d/slip44:133",
  quoteNetwork: "eip155:42161",
  quoteAsset: "eip155:42161/erc20:0xaf88d065e77c8cc2239327c5edb3a432268e5831",
  settlementProtocolVersion: "transparent-htlc-v1",
  maximumCapacityBaseAtoms: 1_000_000_000n,
  maximumLifetimeSeconds: 3_600n,
};
const sourceAccount = "zcash:mainnet:t3-solver";
const recipientAccount = "eip155:42161:0x1111111111111111111111111111111111111111";
const signerId = accountIdentifier("eip155:42161:0x2222222222222222222222222222222222222222");

function quote(overrides: Partial<SolverQuote> = {}): SolverQuote {
  return {
    version: 1,
    matcherDomainHash: policy.matcherDomainHash,
    solverAccountId: accountIdentifier(sourceAccount),
    authorizedSignerId: signerId,
    recipientAccountId: accountIdentifier(recipientAccount),
    sourceAccount,
    recipientAccount,
    baseNetwork: policy.baseNetwork,
    baseAsset: policy.baseAsset,
    quoteNetwork: policy.quoteNetwork,
    quoteAsset: policy.quoteAsset,
    side: 1,
    capacityBaseAtoms: 300_000_000n,
    minimumFillBaseAtoms: 10_000_000n,
    pricePolicy: {
      kind: "curve",
      levels: [
        { cumulativeBaseAtoms: 100_000_000n, priceTicks: 5_000n },
        { cumulativeBaseAtoms: 300_000_000n, priceTicks: 5_050n },
      ],
    },
    maximumSlippageBps: 100n,
    feeBps: 10n,
    accountEpoch: 0n,
    nonce: 1n,
    expirySeconds: 10_600n,
    settlementProtocolVersion: policy.settlementProtocolVersion,
    ...overrides,
  };
}

const verifier: MatcherSignatureVerifier = {
  verify(digest, signature, authorizedSignerId) {
    assert.match(digest, /^0x[0-9a-f]{64}$/);
    assert.equal(signature, "signed-fixture");
    assert.equal(authorizedSignerId, signerId);
  },
};

test("authenticates a quote that binds exact networks, assets, recipients, curve, fee, and expiry", () => {
  const value = quote();
  const accepted = acceptSolverQuote(value, "signed-fixture", 7n, 10_000n, policy, verifier);
  assert.equal(accepted.quoteHash, hashSolverQuote(value));
  assert.equal(accepted.remainingCapacityBaseAtoms, value.capacityBaseAtoms);
  assert.equal(activeSolverLevels(accepted, 10_000n).length, 2);
  const order = solverQuoteAsOrder(accepted, 5_000n);
  assert.equal(order.makerAccountId, value.solverAccountId);
  assert.equal(order.recipientAccountId, value.recipientAccountId);
  assert.equal(order.accountEpoch, value.accountEpoch);
  assert.equal(order.allowedVenues, 2);
});

test("tracks wallet-advertised capacity without creating a platform balance", () => {
  const accepted = acceptSolverQuote(quote(), "signed-fixture", 7n, 10_000n, policy, verifier);
  const partlyConsumed = consumeSolverCapacity(accepted, 150_000_000n);
  assert.equal(partlyConsumed.remainingCapacityBaseAtoms, 150_000_000n);
  assert.deepEqual(activeSolverLevels(partlyConsumed, 10_000n).map((level) => level.availableBaseAtoms), [150_000_000n]);
  assert.throws(() => consumeSolverCapacity(partlyConsumed, 150_000_001n), /allowed integer range/);
  assert.deepEqual(activeSolverLevels(partlyConsumed, accepted.quote.expirySeconds), []);
  assert.equal("balance" in partlyConsumed, false);
});

test("copies nested curve terms before publishing accepted capacity", () => {
  const mutable = quote() as unknown as { pricePolicy: { kind: "curve"; levels: { cumulativeBaseAtoms: bigint; priceTicks: bigint }[] } };
  const accepted = acceptSolverQuote(mutable as unknown as SolverQuote, "signed-fixture", 7n, 10_000n, policy, verifier);
  mutable.pricePolicy.levels[0]!.priceTicks = 9_999n;
  assert.equal(accepted.quote.pricePolicy.kind, "curve");
  assert.equal(accepted.quote.pricePolicy.levels[0]?.priceTicks, 5_000n);
  assert.equal(Object.isFrozen(accepted.quote.pricePolicy.levels[0]), true);
});

test("rejects expired, excessive, misbound, and cross-asset quotes", () => {
  assert.throws(() => assertSolverQuote(quote({ expirySeconds: 10_000n }), policy, 10_000n), /expiry/);
  assert.throws(() => assertSolverQuote(quote({ capacityBaseAtoms: 1_000_000_001n }), policy, 10_000n), /capacity/i);
  assert.throws(() => assertSolverQuote(quote({ sourceAccount: "zcash:mainnet:t3-attacker" }), policy, 10_000n), /source account/);
  assert.throws(() => assertSolverQuote(quote({ quoteAsset: "eip155:42161/erc20:0x3333333333333333333333333333333333333333" }), policy, 10_000n), /exact asset pair/);
  assert.throws(() => assertSolverQuote(quote({ feeBps: 31n }), policy, 10_000n), /fee/i);
  assert.throws(() => assertSolverQuote(quote({ matcherDomainHash: keccak256Text("other-matcher") }), policy, 10_000n), /matcher domain/);
  assert.throws(() => assertSolverQuote(quote({ accountEpoch: 1n }), policy, 10_000n, 0n), /epoch/);
});

test("rejects non-monotonic curves and slippage beyond the signed bound", () => {
  assert.throws(() => assertSolverQuote(quote({
    pricePolicy: {
      kind: "curve",
      levels: [
        { cumulativeBaseAtoms: 200_000_000n, priceTicks: 5_100n },
        { cumulativeBaseAtoms: 300_000_000n, priceTicks: 5_000n },
      ],
    },
  }), policy, 10_000n), /must not decrease/);
  assert.throws(() => assertSolverQuote(quote({
    maximumSlippageBps: 10n,
    pricePolicy: {
      kind: "curve",
      levels: [
        { cumulativeBaseAtoms: 100_000_000n, priceTicks: 5_000n },
        { cumulativeBaseAtoms: 300_000_000n, priceTicks: 5_050n },
      ],
    },
  }), policy, 10_000n), /maximum slippage/);
  assert.throws(() => assertSolverQuote(quote({
    pricePolicy: { kind: "fixed", priceTicks: 5_000n },
    capacityBaseAtoms: 0n,
  }), policy, 10_000n), /capacity/i);
});

test("quote hashes change on recipient, asset, price, capacity, or protocol changes", () => {
  const baseline = quote();
  for (const changed of [
    quote({ matcherDomainHash: keccak256Text("other-matcher") }),
    quote({ recipientAccount: "eip155:42161:0x3333333333333333333333333333333333333333", recipientAccountId: accountIdentifier("eip155:42161:0x3333333333333333333333333333333333333333") }),
    quote({ capacityBaseAtoms: 400_000_000n, pricePolicy: { kind: "fixed", priceTicks: 5_000n } }),
    quote({ pricePolicy: { kind: "fixed", priceTicks: 5_001n } }),
    quote({ settlementProtocolVersion: "transparent-htlc-v2" }),
    quote({ accountEpoch: 1n }),
  ]) {
    assert.notEqual(hashSolverQuote(baseline), hashSolverQuote(changed));
  }
});

test("signed quote copy exposes pair, limits, capacity, fee, expiry, and recipients", () => {
  assert.deepEqual([...SOLVER_QUOTE_SIGNED_FIELDS], [
    "pair",
    "limits",
    "capacity",
    "fee",
    "expiry",
    "recipients",
  ]);
  for (const pair of ["ZEC/USDC", "ZEC/USDT"] as const) {
    const fields = solverQuoteFieldCopy(pair);
    for (const key of SOLVER_QUOTE_SIGNED_FIELDS) {
      assert.equal(typeof fields[key], "string");
      assert.ok(fields[key].trim().length > 0, `${key} must be present`);
    }
    assert.equal(fields.pair, pair);
    assert.match(fields.capacity, /provider wallet/);
    assert.match(fields.recipients, pair === "ZEC/USDT" ? /USDT/ : /USDC/);
    assert.doesNotMatch(fields.recipients, /USDT0/);
  }
  assert.match(solverQuoteInventoryCopy(), /provider wallet/);
  assert.match(solverQuoteInventoryCopy(), /does not hold a custodial ZEC balance/);
});

test("risks array includes inventory, stablecoin, contract, toxic flow, and public linkability", () => {
  const named = [
    "inventory",
    "stablecoin",
    "contract",
    "toxic flow",
    "public linkability",
  ] as const;
  for (const risk of named) {
    assert.ok(SOLVER_QUOTE_RISKS.includes(risk), `${risk} must be named`);
  }
  const entries = solverQuoteRiskEntries();
  assert.equal(entries.length, named.length);
  assert.deepEqual(entries.map((entry) => entry.risk), [...named]);
  for (const entry of entries) {
    assert.ok(entry.copy.trim().length > 0);
  }
});

test("live solver-quote module has no APY or TVL-as-deposit strings", async () => {
  const source = await readFile(fileURLToPath(new URL("./solver-quotes.ts", import.meta.url)), "utf8");
  assert.doesNotMatch(source, /\bAPY\b/i);
  assert.doesNotMatch(source, /\bEarn\b/);
  assert.doesNotMatch(source, /TVL-as-deposit/i);
  assert.doesNotMatch(source, /TVL as deposit/i);
  assert.doesNotMatch(source, /\bTVL\b/);
  assert.doesNotMatch(source, /return projection/i);
  assert.doesNotMatch(source, /LP token/i);
});
