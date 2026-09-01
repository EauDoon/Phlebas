import assert from "node:assert/strict";
import test from "node:test";

import trackedManifest from "../../contracts/manifests/conditional-lock.not-deployed.json" with { type: "json" };

import { hexToBytes } from "./keccak.ts";
import {
  ETHEREUM_MAINNET_USDC_ADDRESS,
  ETHEREUM_MAINNET_USDT_ADDRESS,
} from "./mainnet-assets.ts";
import { sha256Hex } from "./sha256.ts";
import {
  ERC20_APPROVE_SELECTOR,
  STABLECOIN_NETWORK_ACTION,
  createStablecoinClaimAction,
  createStablecoinClaimActionWithAuthority,
  createStablecoinRefundAction,
  createStablecoinRefundActionWithAuthority,
  planStablecoinFundingActions,
  planStablecoinFundingActionsWithAuthority,
  type StablecoinLockContext,
  type StablecoinLockDeploymentAuthority,
} from "./stablecoin-wallet-action.ts";

const PREIMAGE = `0x${"42".repeat(32)}`;
const LOCK = "0x1111111111111111111111111111111111111111" as const;
const FUNDER = "0x2222222222222222222222222222222222222222" as const;
const CLAIMANT = "0x3333333333333333333333333333333333333333" as const;
const RUNTIME = "0x600160005560016000f3";
const TERMS = {
  swapId: `0x${"10".repeat(32)}` as const,
  termsHash: `0x${"11".repeat(32)}` as const,
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
const BASE: StablecoinLockContext = {
  marketId: "ZEC/USDC",
  lock: LOCK,
  expectedTerms: TERMS,
  deploymentReceipt: {
    chainId: "0x1",
    address: LOCK,
    transactionHash: `0x${"30".repeat(32)}`,
    blockNumber: 23_999_999n,
    blockHash: `0x${"31".repeat(32)}`,
    receiptStatus: "0x1",
    runtimeBytecodeSha256: sha256Hex(hexToBytes(RUNTIME)),
  },
  observation: OBSERVATION,
};
const AUTHORITY: StablecoinLockDeploymentAuthority = {
  address: LOCK,
  transactionHash: BASE.deploymentReceipt.transactionHash as `0x${string}`,
  blockNumber: BASE.deploymentReceipt.blockNumber,
  blockHash: BASE.deploymentReceipt.blockHash as `0x${string}`,
  runtimeBytecodeSha256: BASE.deploymentReceipt.runtimeBytecodeSha256 as `0x${string}`,
  terms: TERMS,
};

const allowance = {
  chainId: "0x1" as const,
  token: TERMS.token,
  owner: FUNDER,
  spender: LOCK,
  amountAtoms: 0n,
  blockNumber: OBSERVATION.blockNumber,
  blockHash: OBSERVATION.blockHash,
};

test("stablecoin wallet review constants stay exact and non-submitting", () => {
  assert.equal(ERC20_APPROVE_SELECTOR, "095ea7b3");
  assert.equal(STABLECOIN_NETWORK_ACTION, "disabled-until-deployment-manifest");
});

test("the checked-in conditional-lock manifest is not a mainnet authority", () => {
  assert.equal(trackedManifest.deployed, false);
  assert.equal(trackedManifest.networkActionEnabled, false);
  assert.equal(trackedManifest.deployment.address, null);
  assert.equal(trackedManifest.deployment.chainId, null);
});

test("caller-provided receipt claims cannot create approval or lock calldata", () => {
  assert.throws(
    () => planStablecoinFundingActions(BASE, allowance),
    /No approved Ethereum Mainnet conditional lock deployment manifest is active/,
  );
});

test("claim and refund calldata stay unavailable without repository-approved deployment evidence", () => {
  const funded = { ...BASE, observation: { ...OBSERVATION, state: "funded" as const } };
  assert.throws(
    () => createStablecoinClaimAction(funded, CLAIMANT, PREIMAGE),
    /No approved Ethereum Mainnet conditional lock deployment manifest is active/,
  );
  assert.throws(
    () => createStablecoinRefundAction(funded, FUNDER),
    /No approved Ethereum Mainnet conditional lock deployment manifest is active/,
  );
});

test("invented verification booleans do not widen the deployment authority", () => {
  const forged = {
    ...BASE,
    deploymentReceipt: {
      ...BASE.deploymentReceipt,
      receiptVerified: true,
      constructorArgumentsVerified: true,
      runtimeBytecodeVerified: true,
    },
  } as StablecoinLockContext;
  assert.throws(
    () => planStablecoinFundingActions(forged, allowance),
    /No approved Ethereum Mainnet conditional lock deployment manifest is active/,
  );
});

test("verified engine binds USDC code, all immutables, and exact allowance", () => {
  const actions = planStablecoinFundingActionsWithAuthority(BASE, allowance, AUTHORITY);
  assert.deepEqual(actions.map((action) => action.action), ["approve-exact", "fund-lock"]);
  assert.equal(actions[0]?.version, 2);
  assert.equal(actions[0]?.chainId, "0x1");
  assert.equal(actions[0]?.to, ETHEREUM_MAINNET_USDC_ADDRESS);
  assert.equal(
    actions[0]?.data,
    `0x095ea7b3${LOCK.slice(2).padStart(64, "0")}${TERMS.amount.toString(16).padStart(64, "0")}`,
  );
  assert.equal(actions[0]?.expectedAllowanceAfter, TERMS.amount.toString());
  assert.equal(actions[0]?.swapId, TERMS.swapId);
  assert.equal(actions[0]?.secretHash, TERMS.hashlock);
  assert.equal(actions[0]?.lockRuntimeBytecodeSha256, AUTHORITY.runtimeBytecodeSha256);
  assert.equal(actions[1]?.data, "0xb60d4288");
  assert.equal(actions[1]?.to, LOCK);
  assert.equal(actions.every((action) => action.value === "0x0"), true);
  assert.equal(actions.every((action) => action.networkAction === STABLECOIN_NETWORK_ACTION), true);
});

test("verified engine enforces USDT zero-first then exact approval", () => {
  const terms = { ...TERMS, token: ETHEREUM_MAINNET_USDT_ADDRESS };
  const input = {
    ...BASE,
    marketId: "ZEC/USDT" as const,
    expectedTerms: terms,
    observation: { ...OBSERVATION, immutableTerms: terms },
  };
  const authority = { ...AUTHORITY, terms };
  const observed = { ...allowance, token: terms.token, amountAtoms: 1n };
  const actions = planStablecoinFundingActionsWithAuthority(input, observed, authority);
  assert.deepEqual(actions.map((action) => action.action), ["reset-allowance", "approve-exact", "fund-lock"]);
  assert.match(actions[0]?.data ?? "", new RegExp(`${"0".repeat(64)}$`));
  assert.equal(actions[1]?.expectedAllowanceAfter, TERMS.amount.toString());
  assert.equal(actions.some((action) => action.data.includes("f".repeat(64))), false);
  assert.equal(planStablecoinFundingActionsWithAuthority(
    input,
    { ...observed, amountAtoms: TERMS.amount },
    authority,
  ).length, 1);
});

test("verified engine binds claim and refund actor, secret, state, and time", () => {
  const fundedBeforeClaim = {
    ...BASE,
    observation: { ...OBSERVATION, state: "funded" as const, blockTimestampSeconds: TERMS.claimCutoff },
  };
  const claim = createStablecoinClaimActionWithAuthority(fundedBeforeClaim, CLAIMANT, PREIMAGE, AUTHORITY);
  assert.equal(claim.action, "claim-lock");
  assert.equal(claim.data, `0xbd66528a${PREIMAGE.slice(2)}`);
  const fundedAfterRefund = {
    ...BASE,
    observation: { ...OBSERVATION, state: "funded" as const, blockTimestampSeconds: TERMS.refundTime },
  };
  const refund = createStablecoinRefundActionWithAuthority(fundedAfterRefund, FUNDER, AUTHORITY);
  assert.equal(refund.action, "refund-lock");
  assert.equal(refund.data, "0x590e1ae3");
  assert.throws(
    () => createStablecoinClaimActionWithAuthority(fundedBeforeClaim, FUNDER, PREIMAGE, AUTHORITY),
    /not the immutable recipient/,
  );
  assert.throws(
    () => createStablecoinClaimActionWithAuthority(fundedBeforeClaim, CLAIMANT, `0x${"43".repeat(32)}`, AUTHORITY),
    /does not match/,
  );
  assert.throws(
    () => createStablecoinRefundActionWithAuthority(fundedAfterRefund, CLAIMANT, AUTHORITY),
    /not the immutable refund recipient/,
  );
  assert.throws(
    () => createStablecoinClaimActionWithAuthority(BASE, CLAIMANT, PREIMAGE, AUTHORITY),
    /observed funded/,
  );
  assert.throws(
    () => createStablecoinRefundActionWithAuthority(fundedBeforeClaim, FUNDER, AUTHORITY),
    /not been reached/,
  );
});

test("verified engine rejects receipt, code, observation, and immutable substitutions", () => {
  assert.throws(
    () => planStablecoinFundingActionsWithAuthority(
      { ...BASE, deploymentReceipt: { ...BASE.deploymentReceipt, transactionHash: `0x${"99".repeat(32)}` } },
      allowance,
      AUTHORITY,
    ),
    /does not match the repository-approved deployment manifest/,
  );
  assert.throws(
    () => planStablecoinFundingActionsWithAuthority(
      { ...BASE, observation: { ...OBSERVATION, chainId: "0x2" as "0x1" } },
      allowance,
      AUTHORITY,
    ),
    /chain ID 1/,
  );
  assert.throws(
    () => planStablecoinFundingActionsWithAuthority(
      { ...BASE, observation: { ...OBSERVATION, runtimeBytecode: "0x6002" } },
      allowance,
      AUTHORITY,
    ),
    /runtime bytecode does not match/,
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
      () => planStablecoinFundingActionsWithAuthority({
        ...BASE,
        observation: { ...OBSERVATION, immutableTerms: { ...TERMS, ...substitution } },
      }, allowance, AUTHORITY),
      /do not match all 11/,
    );
  }
  assert.throws(
    () => planStablecoinFundingActionsWithAuthority(
      { ...BASE, observation: { ...OBSERVATION, state: "funded" } },
      allowance,
      AUTHORITY,
    ),
    /observed unfunded/,
  );
  assert.throws(
    () => planStablecoinFundingActionsWithAuthority(
      { ...BASE, observation: { ...OBSERVATION, blockTimestampSeconds: TERMS.fundingCutoff + 1n } },
      allowance,
      AUTHORITY,
    ),
    /cutoff has passed/,
  );
  assert.throws(
    () => planStablecoinFundingActionsWithAuthority(
      BASE,
      { ...allowance, blockHash: `0x${"77".repeat(32)}` },
      AUTHORITY,
    ),
    /same reviewed Ethereum block/,
  );
});

test("verified engine rejects wrong assets, unsafe roles, and unsafe amounts", () => {
  const wrongToken = { ...TERMS, token: ETHEREUM_MAINNET_USDT_ADDRESS };
  assert.throws(
    () => planStablecoinFundingActionsWithAuthority({
      ...BASE,
      expectedTerms: wrongToken,
      observation: { ...OBSERVATION, immutableTerms: wrongToken },
    }, { ...allowance, token: wrongToken.token }, { ...AUTHORITY, terms: wrongToken }),
    /not the approved Ethereum Mainnet asset/,
  );
  const zeroAmount = { ...TERMS, amount: 0n };
  assert.throws(
    () => planStablecoinFundingActionsWithAuthority(
      { ...BASE, expectedTerms: zeroAmount, observation: { ...OBSERVATION, immutableTerms: zeroAmount } },
      allowance,
      { ...AUTHORITY, terms: zeroAmount },
    ),
    /positive uint256/,
  );
  const sameRole = { ...TERMS, claimRecipient: FUNDER };
  assert.throws(
    () => planStablecoinFundingActionsWithAuthority(
      { ...BASE, expectedTerms: sameRole, observation: { ...OBSERVATION, immutableTerms: sameRole } },
      allowance,
      { ...AUTHORITY, terms: sameRole },
    ),
    /roles must be distinct/,
  );
  assert.throws(
    () => planStablecoinFundingActionsWithAuthority(BASE, { ...allowance, amountAtoms: -1n }, AUTHORITY),
    /fit uint256/,
  );
  assert.throws(
    () => planStablecoinFundingActionsWithAuthority(BASE, { ...allowance, amountAtoms: 1n << 256n }, AUTHORITY),
    /fit uint256/,
  );
});
