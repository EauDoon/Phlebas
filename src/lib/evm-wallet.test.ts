import assert from "node:assert/strict";
import test from "node:test";

import { markets } from "./market-data.ts";
import {
  ARBITRUM_SEPOLIA_HEX,
  connectTestnetWallet,
  missingProviderCopy,
  walletConnectFailureCopy,
  walletStateWithSettlement,
  type Eip1193Provider,
} from "./evm-wallet.ts";

test("connects only after switching to Arbitrum Sepolia", async () => {
  const calls: string[] = [];
  const provider: Eip1193Provider = {
    async request({ method }) {
      calls.push(method);
      if (method === "eth_requestAccounts") return ["0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"];
      if (method === "eth_chainId") return calls.filter((item) => item === "eth_chainId").length === 1 ? "0x1" : ARBITRUM_SEPOLIA_HEX;
      if (method === "wallet_switchEthereumChain") return null;
      throw new Error(method);
    },
  };
  const state = await connectTestnetWallet(provider);
  assert.equal(state.address, "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266");
  assert.equal(state.chainId, ARBITRUM_SEPOLIA_HEX);
  assert.equal(state.error, null);
  assert.deepEqual(calls, ["eth_requestAccounts", "eth_chainId", "wallet_switchEthereumChain", "eth_chainId"]);
});

test("blocks a wallet that remains on the wrong chain", async () => {
  const provider: Eip1193Provider = {
    async request({ method }) {
      if (method === "eth_requestAccounts") return ["0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"];
      if (method === "eth_chainId") return "0x1";
      if (method === "wallet_switchEthereumChain") throw new Error("reject");
      if (method === "wallet_addEthereumChain") return null;
      throw new Error(method);
    },
  };
  const state = await connectTestnetWallet(provider);
  assert.match(state.error ?? "", /Arbitrum Sepolia/);
  assert.equal(state.chainId, "0x1");
  const wrapped = walletStateWithSettlement(state, markets["ZEC/USDC"].settlementPair);
  assert.match(wrapped.error ?? "", /Settled as pZEC-USDC/);
  assert.match(wrapped.error ?? "", /Arbitrum Sepolia/);
  assert.equal(wrapped.chainId, "0x1");
  assert.equal(
    walletStateWithSettlement({ address: "0xabc", chainId: ARBITRUM_SEPOLIA_HEX, error: null }, "pZEC-USDC").error,
    null,
  );
});

test("missing provider copy names the settlement pair", () => {
  assert.equal(
    missingProviderCopy(markets["ZEC/USDC"].settlementPair),
    "No injected EVM wallet. Arbitrum Sepolia only. Settled as pZEC-USDC.",
  );
  assert.equal(
    missingProviderCopy(markets["ZEC/USDT"].settlementPair),
    "No injected EVM wallet. Arbitrum Sepolia only. Settled as pZEC-USDT0.",
  );
  assert.doesNotMatch(missingProviderCopy("pZEC-USDC"), /native ZEC/);
  assert.doesNotMatch(walletConnectFailureCopy("Wallet connection failed", "pZEC-USDT0"), /live funds/);
});
