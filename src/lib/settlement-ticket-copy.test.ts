import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CLAIM_REFUND_EXCLUSIVE,
  EXACT_TOKEN_EVM_LOCK_LABEL,
  PROTOCOL_FEE_ZERO,
  SETTLEMENT_MATCHER_HONESTY,
  UNSAFE_EVIDENCE_DISABLES_CLAIM,
  USDT_SETTLEMENT_DISABLED,
  ZEC_P2SH_LOCK_LABEL,
  settlementLockCopy,
  settlementPhaseCopy,
  settlementRefundPathVisible,
  settlementTicketAction,
  settlementTermsRows,
  settlementUnsafeDisablesClaim,
  type SettlementTicketSession,
} from "./settlement-ticket-copy.ts";
import { fundedSwap, sampleSwapTerms } from "./swap-test-fixtures.ts";
import { flagSwapDispute } from "./swap-state.ts";

const copyPath = join(dirname(fileURLToPath(import.meta.url)), "settlement-ticket-copy.ts");

function sessionFor(
  state: SettlementTicketSession["state"],
  scenario: SettlementTicketSession["scenario"] = "happy",
  nowSeconds = sampleSwapTerms.authorizationDeadline - 10n,
): SettlementTicketSession {
  return { state, scenario, nowSeconds };
}

test("settlement ticket copy names both locks and mutually exclusive claim/refund", () => {
  const locks = settlementLockCopy();
  assert.equal(locks.zec.label, ZEC_P2SH_LOCK_LABEL);
  assert.equal(locks.evm.label, EXACT_TOKEN_EVM_LOCK_LABEL);
  assert.match(locks.zec.label, /ZEC P2SH lock/);
  assert.match(locks.evm.label, /Exact-token EVM lock/);
  assert.equal(locks.zec.order, "first");
  assert.equal(locks.evm.order, "second");
  assert.match(locks.zec.refund, /longer refund/);
  assert.match(locks.evm.refund, /shorter refund/);
  assert.match(CLAIM_REFUND_EXCLUSIVE, /mutually exclusive/);
  assert.match(SETTLEMENT_MATCHER_HONESTY, /not trustless/);
  assert.match(SETTLEMENT_MATCHER_HONESTY, /cannot move funds/);
  assert.equal(PROTOCOL_FEE_ZERO, "Protocol fee 0");
  assert.equal(sampleSwapTerms.protocolFeeQuoteAtoms, 0n);

  const funded = sessionFor(fundedSwap());
  const rows = settlementTermsRows(funded.state);
  assert.ok(rows.some((row) => row.label === ZEC_P2SH_LOCK_LABEL && /first/.test(row.value) && /longer/.test(row.value)));
  assert.ok(rows.some((row) => row.label === EXACT_TOKEN_EVM_LOCK_LABEL && /second/.test(row.value) && /shorter/.test(row.value)));
  assert.ok(rows.some((row) => row.value === PROTOCOL_FEE_ZERO));

  const refundSession = sessionFor(fundedSwap(), "refund");
  const refundCopy = settlementPhaseCopy(refundSession);
  assert.match(refundCopy.body, /mutually exclusive/i);
  const refundAction = settlementTicketAction(refundSession);
  assert.equal(refundAction.kind, "refund");
  assert.equal(refundAction.claimDisabled, true);
  assert.equal(refundAction.refundPathVisible, true);
  assert.equal(settlementRefundPathVisible(), true);
});

test("unsafe evidence disables claim", () => {
  const disputed = flagSwapDispute(
    fundedSwap(),
    "observer-conflict",
    "Approved observers disagree on the stablecoin lock.",
  );
  const unsafe = sessionFor(disputed, "conflict");
  assert.equal(settlementUnsafeDisablesClaim(unsafe.state), true);
  assert.equal(settlementRefundPathVisible(), true);
  const action = settlementTicketAction(unsafe);
  assert.equal(action.enabled, false);
  assert.equal(action.claimDisabled, true);
  assert.equal(action.fundingDisabled, true);
  assert.equal(action.refundPathVisible, true);
  assert.equal(action.kind, "claim");
  assert.equal(action.label, "Claim disabled");
  assert.equal(action.disabledReason, UNSAFE_EVIDENCE_DISABLES_CLAIM);

  const claim = settlementTicketAction(sessionFor(fundedSwap()));
  assert.equal(claim.enabled, true);
  assert.equal(claim.claimDisabled, false);
  assert.equal(claim.kind, "claim");
  assert.equal(claim.label, "Record USDC claim");
});

test("USDT keeps its exact mainnet identity while deployment remains disabled", () => {
  assert.match(USDT_SETTLEMENT_DISABLED.reason, /0xdac17f958d2ee523a2206206994597c13d831ec7/);
  assert.match(USDT_SETTLEMENT_DISABLED.reason, /6 decimals/);
  assert.match(USDT_SETTLEMENT_DISABLED.reason, /USDT0 is abandoned/);
  assert.match(USDT_SETTLEMENT_DISABLED.reason, /matcher and per-fill ConditionalLock remain undeployed/);
  assert.match(USDT_SETTLEMENT_DISABLED.headline, /Exact Ethereum Mainnet USDT identity/);
  assert.match(USDT_SETTLEMENT_DISABLED.title, /undeployed/i);
});

test("settlement ticket copy has no operational walkthrough labels", async () => {
  const source = await readFile(copyPath, "utf8");
  assert.doesNotMatch(source, /\bsimulation\b/i);
  assert.doesNotMatch(source, /\bsimulator\b/i);
  assert.doesNotMatch(source, /\bfixture\b/i);
  assert.doesNotMatch(source, /\bno-value\b/i);
  assert.doesNotMatch(source, /\binspect\b/i);
  assert.doesNotMatch(source, /\bwalkthrough\b/i);
  assert.doesNotMatch(source, /\bpreview-only\b/i);
  assert.doesNotMatch(source, /illustrative fixture/i);
});
