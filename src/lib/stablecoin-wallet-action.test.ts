import assert from "node:assert/strict";
import test from "node:test";

import trackedManifest from "../../contracts/manifests/conditional-lock.not-deployed.json" with { type: "json" };

import { hexToBytes } from "./keccak.ts";
import { ETHEREUM_MAINNET_USDC_ADDRESS } from "./mainnet-assets.ts";
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
