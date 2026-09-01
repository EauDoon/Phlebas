import assert from "node:assert/strict";
import test from "node:test";

import {
  ETHEREUM_MAINNET_USDC_ADDRESS,
  ETHEREUM_MAINNET_USDT_ADDRESS,
} from "./mainnet-assets.ts";
import { hexToBytes } from "./keccak.ts";
import { sha256Hex } from "./sha256.ts";
import {
  ERC20_APPROVE_SELECTOR,
  STABLECOIN_NETWORK_ACTION,
  createStablecoinClaimAction,
  createStablecoinRefundAction,
  planStablecoinFundingActions,
  type StablecoinLockContext,
} from "./stablecoin-wallet-action.ts";

const PREIMAGE = `0x${"42".repeat(32)}`;
const LOCK = "0x1111111111111111111111111111111111111111";
const FUNDER = "0x2222222222222222222222222222222222222222";
const CLAIMANT = "0x3333333333333333333333333333333333333333";
const RUNTIME = "0x600160005560016000f3";
const RUNTIME_HASH = sha256Hex(hexToBytes(RUNTIME));
const TERMS = {
  swapId: `0x${"10".repeat(32)}`,
  termsHash: `0x${"11".repeat(32)}`,
  token: ETHEREUM_MAINNET_USDC_ADDRESS,
  funder: FUNDER,
  claimRecipient: CLAIMANT,
  refundRecipient: FUNDER,
  amount: 52_910_000n,
  hashlock: sha256Hex(Uint8Array.from(Buffer.from(PREIMAGE.slice(2), "hex"))),
  fundingCutoff: 1_800_000_100n,
  claimCutoff: 1_800_000_200n,
  refundTime: 1_800_000_202n,
};
const OBSERVATION = {
  chainId: "0x1" as const,
  lock: LOCK,
  runtimeBytecode: RUNTIME,
  immutableTerms: TERMS,
  state: "unfunded" as const,
  blockNumber: 24_000_000n,
  blockHash: `0x${"20".repeat(32)}`,
  blockTimestampSeconds: 1_800_000_000n,
};
const DEPLOYMENT_RECEIPT = {
  chainId: "0x1" as const,
  address: LOCK,
  transactionHash: `0x${"30".repeat(32)}`,
  blockNumber: 23_999_999n,
  blockHash: `0x${"31".repeat(32)}`,
  receiptStatus: "0x1" as const,
  runtimeBytecodeSha256: RUNTIME_HASH,
  receiptVerified: true as const,
  constructorArgumentsVerified: true as const,
  runtimeBytecodeVerified: true as const,
};
const BASE: StablecoinLockContext = {
  marketId: "ZEC/USDC",
  lock: LOCK,
  expectedTerms: TERMS,
  deploymentReceipt: DEPLOYMENT_RECEIPT,
  observation: OBSERVATION,
};

function allowance(amountAtoms: bigint, overrides: Record<string, unknown> = {}) {
  return {
    chainId: "0x1" as const,
    token: TERMS.token,
    owner: FUNDER,
    spender: LOCK,
    amountAtoms,
    blockNumber: OBSERVATION.blockNumber,
    blockHash: OBSERVATION.blockHash,
    ...overrides,
  };
}

test("USDC review binds code, all immutables, and the exact fill amount before funding", () => {
  assert.equal(ERC20_APPROVE_SELECTOR, "095ea7b3");
  const actions = planStablecoinFundingActions(BASE, allowance(0n));
  assert.deepEqual(actions.map((action) => action.action), ["approve-exact", "fund-lock"]);
  assert.equal(actions[0]?.version, 2);
  assert.equal(actions[0]?.chainId, "0x1");
  assert.equal(actions[0]?.to, ETHEREUM_MAINNET_USDC_ADDRESS);
  assert.equal(actions[0]?.data, `0x095ea7b3${LOCK.slice(2).padStart(64, "0")}${TERMS.amount.toString(16).padStart(64, "0")}`);
  assert.equal(actions[0]?.expectedAllowanceAfter, TERMS.amount.toString());
  assert.equal(actions[0]?.swapId, TERMS.swapId);
  assert.equal(actions[0]?.secretHash, TERMS.hashlock);
  assert.equal(actions[0]?.lockRuntimeBytecodeSha256, RUNTIME_HASH);
  assert.equal(actions[0]?.observationBlockHash, OBSERVATION.blockHash);
  assert.equal(actions[1]?.data, "0xb60d4288");
  assert.equal(actions[1]?.to, LOCK);
  assert.equal(actions.every((action) => action.value === "0x0"), true);
  assert.equal(actions.every((action) => action.networkAction === STABLECOIN_NETWORK_ACTION), true);
});

test("USDT review resets a nonzero allowance before exact approval", () => {
  const terms = { ...TERMS, token: ETHEREUM_MAINNET_USDT_ADDRESS };
  const input = {
    ...BASE,
    marketId: "ZEC/USDT" as const,
    expectedTerms: terms,
    observation: { ...OBSERVATION, immutableTerms: terms },
  };
  const actions = planStablecoinFundingActions(input, allowance(1n, { token: terms.token }));
  assert.deepEqual(actions.map((action) => action.action), ["reset-allowance", "approve-exact", "fund-lock"]);
  assert.match(actions[0]?.data ?? "", new RegExp(`${"0".repeat(64)}$`));
  assert.equal(actions[1]?.expectedAllowanceAfter, TERMS.amount.toString());
  assert.equal(actions.some((action) => action.data.includes("f".repeat(64))), false);
  assert.equal(planStablecoinFundingActions(input, allowance(TERMS.amount, { token: terms.token })).length, 1);
});

test("claim and refund reviews bind the immutable actor, secret, state, and time", () => {
  const fundedBeforeClaim = {
    ...BASE,
    observation: { ...OBSERVATION, state: "funded" as const, blockTimestampSeconds: TERMS.claimCutoff },
  };
  const claim = createStablecoinClaimAction(fundedBeforeClaim, CLAIMANT, PREIMAGE);
  assert.equal(claim.action, "claim-lock");
  assert.equal(claim.data, `0xbd66528a${PREIMAGE.slice(2)}`);
  assert.equal(claim.expectedLockState, "funded");
  const fundedAfterRefund = {
    ...BASE,
    observation: { ...OBSERVATION, state: "funded" as const, blockTimestampSeconds: TERMS.refundTime },
  };
  const refund = createStablecoinRefundAction(fundedAfterRefund, FUNDER);
  assert.equal(refund.action, "refund-lock");
  assert.equal(refund.data, "0x590e1ae3");
  assert.throws(() => createStablecoinClaimAction(fundedBeforeClaim, FUNDER, PREIMAGE), /not the immutable recipient/);
  assert.throws(() => createStablecoinClaimAction(fundedBeforeClaim, CLAIMANT, `0x${"43".repeat(32)}`), /does not match/);
  assert.throws(() => createStablecoinRefundAction(fundedAfterRefund, CLAIMANT), /not the immutable refund recipient/);
  assert.throws(() => createStablecoinClaimAction(BASE, CLAIMANT, PREIMAGE), /observed funded/);
  assert.throws(() => createStablecoinRefundAction(fundedBeforeClaim, FUNDER), /not been reached/);
});

test("review planning rejects code, chain, address, state, and every immutable substitution", () => {
  assert.throws(
    () => planStablecoinFundingActions({ ...BASE, observation: { ...OBSERVATION, chainId: "0x2" as "0x1" } }, allowance(0n)),
    /chain ID 1/,
  );
  assert.throws(
    () => planStablecoinFundingActions({ ...BASE, observation: { ...OBSERVATION, lock: CLAIMANT } }, allowance(0n)),
    /address does not match/,
  );
  assert.throws(
    () => planStablecoinFundingActions({ ...BASE, observation: { ...OBSERVATION, runtimeBytecode: "0x6002" } }, allowance(0n)),
    /runtime bytecode does not match/,
  );
  assert.throws(
    () => planStablecoinFundingActions({
      ...BASE,
      deploymentReceipt: { ...DEPLOYMENT_RECEIPT, receiptVerified: false as true },
    }, allowance(0n)),
    /verified successful Ethereum Mainnet deployment receipt/,
  );
  const substitutions = [
    { swapId: `0x${"99".repeat(32)}` },
    { termsHash: `0x${"99".repeat(32)}` },
    { token: ETHEREUM_MAINNET_USDT_ADDRESS },
    { funder: "0x4444444444444444444444444444444444444444", refundRecipient: "0x4444444444444444444444444444444444444444" },
    { claimRecipient: "0x4444444444444444444444444444444444444444" },
    { amount: TERMS.amount + 1n },
    { hashlock: `0x${"99".repeat(32)}` },
    { fundingCutoff: TERMS.fundingCutoff - 1n },
    { claimCutoff: TERMS.claimCutoff - 1n },
    { refundTime: TERMS.refundTime + 1n },
  ];
  for (const substitution of substitutions) {
    assert.throws(
      () => planStablecoinFundingActions({
        ...BASE,
        observation: { ...OBSERVATION, immutableTerms: { ...TERMS, ...substitution } },
      }, allowance(0n)),
      /do not match all 11/,
    );
  }
  assert.throws(
    () => planStablecoinFundingActions({ ...BASE, observation: { ...OBSERVATION, state: "funded" } }, allowance(0n)),
    /observed unfunded/,
  );
  assert.throws(
    () => planStablecoinFundingActions({ ...BASE, observation: { ...OBSERVATION, blockTimestampSeconds: TERMS.fundingCutoff + 1n } }, allowance(0n)),
    /cutoff has passed/,
  );
  assert.throws(
    () => planStablecoinFundingActions(BASE, allowance(0n, { blockHash: `0x${"77".repeat(32)}` })),
    /same reviewed Ethereum block/,
  );
});

test("review planning rejects wrong market assets, unsafe roles, and unsafe amounts", () => {
  const wrongToken = { ...TERMS, token: ETHEREUM_MAINNET_USDT_ADDRESS };
  assert.throws(
    () => planStablecoinFundingActions({
      ...BASE,
      expectedTerms: wrongToken,
      observation: { ...OBSERVATION, immutableTerms: wrongToken },
    }, allowance(0n, { token: wrongToken.token })),
    /not the approved Ethereum Mainnet asset/,
  );
  const zeroAmount = { ...TERMS, amount: 0n };
  assert.throws(
    () => planStablecoinFundingActions({ ...BASE, expectedTerms: zeroAmount, observation: { ...OBSERVATION, immutableTerms: zeroAmount } }, allowance(0n)),
    /positive uint256/,
  );
  const sameRole = { ...TERMS, claimRecipient: FUNDER };
  assert.throws(
    () => planStablecoinFundingActions({ ...BASE, expectedTerms: sameRole, observation: { ...OBSERVATION, immutableTerms: sameRole } }, allowance(0n)),
    /roles must be distinct/,
  );
  assert.throws(() => planStablecoinFundingActions(BASE, allowance(-1n)), /fit uint256/);
  assert.throws(() => planStablecoinFundingActions(BASE, allowance(1n << 256n)), /fit uint256/);
});
