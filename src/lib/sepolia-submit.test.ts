import assert from "node:assert/strict";
import test from "node:test";

import { typedOrderFromTicket } from "./ticket-order.ts";
import { planTestnetSubmit, sepoliaSubmitEnabled, sendSettlement, walletConnectEnabled } from "./sepolia-submit.ts";
import { ARBITRUM_SEPOLIA_HEX, type Eip1193Provider } from "./evm-wallet.ts";

const MAKER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const SIG = `0x${"11".repeat(65)}`;
const SETTLEMENT = "0x2222222222222222222222222222222222222222";

function sample(side: "buy" | "sell") {
  return typedOrderFromTicket({
    maker: MAKER,
    side,
    quote: "USDC",
    sizeAtoms: 100_000_000n,
    priceTicks: 5291n,
    nonce: 1n,
    accountEpoch: 0n,
    tif: "GTC",
  });
}

test("submit defaults to sign-only", () => {
  assert.equal(sepoliaSubmitEnabled({}), false);
  assert.equal(walletConnectEnabled({}), false);
  assert.equal(walletConnectEnabled({ NEXT_PUBLIC_PHLEBAS_SEPOLIA_SUBMIT: "1" }), false);
  const plan = planTestnetSubmit({
    flag: false,
    settlement: SETTLEMENT,
    counterpart: { order: sample("sell"), signature: SIG },
    taker: sample("buy"),
    takerSignature: SIG,
    fillAtoms: 1n,
  });
  assert.equal(plan.action, "sign-only");
});

test("flag without a counterpart or deployed settlement sequences only", () => {
  const noPeer = planTestnetSubmit({
    flag: true,
    settlement: SETTLEMENT,
    counterpart: null,
    taker: sample("buy"),
    takerSignature: SIG,
    fillAtoms: 1n,
  });
  assert.equal(noPeer.action, "sequence");
  const undeployed = planTestnetSubmit({
    flag: true,
    settlement: null,
    counterpart: { order: sample("sell"), signature: SIG },
    taker: sample("buy"),
    takerSignature: SIG,
    fillAtoms: 1n,
  });
  assert.equal(undeployed.action, "sequence");
  const malformed = planTestnetSubmit({
    flag: true,
    settlement: "not-an-address",
    counterpart: { order: sample("sell"), signature: SIG },
    taker: sample("buy"),
    takerSignature: SIG,
    fillAtoms: 1n,
  });
  assert.equal(malformed.action, "sequence");
});

test("flag plus counterpart plus settlement encodes a Sepolia settle plan", () => {
  const plan = planTestnetSubmit({
    flag: true,
    settlement: SETTLEMENT,
    counterpart: { order: sample("sell"), signature: SIG },
    taker: sample("buy"),
    takerSignature: SIG,
    fillAtoms: 1n,
  });
  assert.equal(plan.action, "settle");
  if (plan.action !== "settle") return;
  assert.equal(plan.to, SETTLEMENT);
  assert.match(plan.calldata, /^0x[0-9a-f]+$/);
});

test("sendSettlement refuses a non-Sepolia chain", async () => {
  const provider: Eip1193Provider = {
    async request({ method }) {
      if (method === "eth_chainId") return "0x1";
      throw new Error(method);
    },
  };
  await assert.rejects(
    sendSettlement(provider, MAKER, {
      action: "settle",
      reason: "test",
      to: SETTLEMENT,
      calldata: "0x",
    }),
    /Sepolia only/,
  );
});

test("sendSettlement posts eth_sendTransaction on Sepolia", async () => {
  const calls: string[] = [];
  const provider: Eip1193Provider = {
    async request({ method }) {
      calls.push(method);
      if (method === "eth_chainId") return ARBITRUM_SEPOLIA_HEX;
      if (method === "eth_sendTransaction") return "0xabc";
      throw new Error(method);
    },
  };
  const hash = await sendSettlement(provider, MAKER, {
    action: "settle",
    reason: "test",
    to: SETTLEMENT,
    calldata: "0x1234",
  });
  assert.equal(hash, "0xabc");
  assert.deepEqual(calls, ["eth_chainId", "eth_sendTransaction"]);
});
