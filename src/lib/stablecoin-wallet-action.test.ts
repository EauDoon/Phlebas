import assert from "node:assert/strict";
import test from "node:test";

import {
  ETHEREUM_MAINNET_USDC_ADDRESS,
  ETHEREUM_MAINNET_USDT_ADDRESS,
} from "./mainnet-assets.ts";
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
const BASE: StablecoinLockContext = {
  marketId: "ZEC/USDC",
  token: ETHEREUM_MAINNET_USDC_ADDRESS,
  lock: "0x1111111111111111111111111111111111111111",
  funder: "0x2222222222222222222222222222222222222222",
  claimRecipient: "0x3333333333333333333333333333333333333333",
  amountAtoms: 52_910_000n,
  termsHash: `0x${"11".repeat(32)}`,
  secretHash: sha256Hex(Uint8Array.from(Buffer.from(PREIMAGE.slice(2), "hex"))),
};

test("USDC review approves only the exact fill amount before funding", () => {
  assert.equal(ERC20_APPROVE_SELECTOR, "095ea7b3");
  const actions = planStablecoinFundingActions(BASE, 0n);
  assert.deepEqual(actions.map((action) => action.action), ["approve-exact", "fund-lock"]);
  assert.equal(actions[0]?.chainId, "0x1");
  assert.equal(actions[0]?.to, ETHEREUM_MAINNET_USDC_ADDRESS);
  assert.equal(actions[0]?.data, `0x095ea7b3${BASE.lock.slice(2).padStart(64, "0")}${BASE.amountAtoms.toString(16).padStart(64, "0")}`);
  assert.equal(actions[0]?.expectedAllowanceAfter, BASE.amountAtoms.toString());
  assert.equal(actions[1]?.data, "0xb60d4288");
  assert.equal(actions[1]?.to, BASE.lock);
  assert.equal(actions.every((action) => action.value === "0x0"), true);
  assert.equal(actions.every((action) => action.networkAction === STABLECOIN_NETWORK_ACTION), true);
});

test("USDT review resets a nonzero allowance before exact approval", () => {
  const input = { ...BASE, marketId: "ZEC/USDT" as const, token: ETHEREUM_MAINNET_USDT_ADDRESS };
  const actions = planStablecoinFundingActions(input, 1n);
  assert.deepEqual(actions.map((action) => action.action), ["reset-allowance", "approve-exact", "fund-lock"]);
  assert.match(actions[0]?.data ?? "", new RegExp(`${"0".repeat(64)}$`));
  assert.equal(actions[1]?.expectedAllowanceAfter, BASE.amountAtoms.toString());
  assert.equal(actions.some((action) => action.data.includes("f".repeat(64))), false);
  assert.equal(planStablecoinFundingActions(input, BASE.amountAtoms).length, 1);
});

test("claim and refund reviews bind the immutable actor and secret", () => {
  const claim = createStablecoinClaimAction(BASE, BASE.claimRecipient, PREIMAGE);
  assert.equal(claim.action, "claim-lock");
  assert.equal(claim.data, `0xbd66528a${PREIMAGE.slice(2)}`);
  assert.equal(claim.expectedLockState, "funded");
  const refund = createStablecoinRefundAction(BASE, BASE.funder);
  assert.equal(refund.action, "refund-lock");
  assert.equal(refund.data, "0x590e1ae3");
  assert.throws(() => createStablecoinClaimAction(BASE, BASE.funder, PREIMAGE), /not the immutable recipient/);
  assert.throws(() => createStablecoinClaimAction(BASE, BASE.claimRecipient, `0x${"43".repeat(32)}`), /does not match/);
  assert.throws(() => createStablecoinRefundAction(BASE, BASE.claimRecipient), /not the immutable funder/);
});

test("review planning rejects substituted chains, tokens, roles, and unsafe amounts", () => {
  assert.throws(
    () => planStablecoinFundingActions({ ...BASE, token: ETHEREUM_MAINNET_USDT_ADDRESS }, 0n),
    /not the approved Ethereum Mainnet asset/,
  );
  assert.throws(() => planStablecoinFundingActions({ ...BASE, amountAtoms: 0n }, 0n), /positive uint256/);
  assert.throws(() => planStablecoinFundingActions({ ...BASE, claimRecipient: BASE.funder }, 0n), /roles must be distinct/);
  assert.throws(() => planStablecoinFundingActions(BASE, -1n), /fit uint256/);
  assert.throws(() => planStablecoinFundingActions(BASE, 1n << 256n), /fit uint256/);
});
