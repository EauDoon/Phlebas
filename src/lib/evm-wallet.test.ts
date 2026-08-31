import assert from "node:assert/strict";
import test from "node:test";

import { markets } from "./market-data.ts";
import {
  ARBITRUM_SEPOLIA_HEX,
  connectTestnetWallet,
  isMissingProviderCopy,
  missingProviderCopy,
  retargetSettlementCopy,
  walletConnectFailureCopy,
  walletConnectBarTitle,
  walletConnectBusyTitle,
  walletConnectIdleTitle,
  walletConnectTitle,
  walletDisconnectLabel,
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

test("ticket sign missing-provider copy names the selected market settlement pair", () => {
  const usdc = markets["ZEC/USDC"];
  const usdt = markets["ZEC/USDT"];
  assert.equal(usdc.settlementPair, "pZEC-USDC");
  assert.equal(usdt.settlementPair, "pZEC-USDT0");
  assert.equal(
    missingProviderCopy(usdc.settlementPair),
    "No injected EVM wallet. Arbitrum Sepolia only. Settled as pZEC-USDC.",
  );
  assert.equal(
    missingProviderCopy(usdt.settlementPair),
    "No injected EVM wallet. Arbitrum Sepolia only. Settled as pZEC-USDT0.",
  );
  assert.doesNotMatch(missingProviderCopy(usdc.settlementPair), /native ZEC/);
});

test("ticket sign missing-provider copy follows the selected market after a switch", () => {
  const usdcNotice = missingProviderCopy(markets["ZEC/USDC"].settlementPair);
  assert.equal(isMissingProviderCopy(usdcNotice), true);
  assert.equal(
    missingProviderCopy(markets["ZEC/USDT"].settlementPair),
    "No injected EVM wallet. Arbitrum Sepolia only. Settled as pZEC-USDT0.",
  );
  assert.equal(
    isMissingProviderCopy(missingProviderCopy(markets["ZEC/USDT"].settlementPair)),
    true,
  );
  assert.doesNotMatch(missingProviderCopy(markets["ZEC/USDT"].settlementPair), /native ZEC/);
});

test("missing provider copy keeps settlement after the market pair changes", () => {
  const usdc = missingProviderCopy(markets["ZEC/USDC"].settlementPair);
  const usdt = missingProviderCopy(markets["ZEC/USDT"].settlementPair);
  assert.equal(retargetSettlementCopy(usdc, markets["ZEC/USDT"].settlementPair), usdt);
  assert.equal(retargetSettlementCopy(usdt, markets["ZEC/USDC"].settlementPair), usdc);
  assert.equal(
    retargetSettlementCopy("No injected EVM wallet. Arbitrum Sepolia only.", markets["ZEC/USDT"].settlementPair),
    usdt,
  );
  assert.doesNotMatch(retargetSettlementCopy(usdc, markets["ZEC/USDT"].settlementPair), /native ZEC/);
});

test("wallet connect-failure copy keeps settlement after the market pair changes", () => {
  const usdc = walletConnectFailureCopy("User rejected the request.", markets["ZEC/USDC"].settlementPair);
  const usdt = walletConnectFailureCopy("User rejected the request.", markets["ZEC/USDT"].settlementPair);
  assert.equal(usdc, "User rejected the request. Settled as pZEC-USDC.");
  assert.equal(usdt, "User rejected the request. Settled as pZEC-USDT0.");
  assert.equal(retargetSettlementCopy(usdc, markets["ZEC/USDT"].settlementPair), usdt);
  assert.equal(retargetSettlementCopy(usdt, markets["ZEC/USDC"].settlementPair), usdc);
  assert.doesNotMatch(retargetSettlementCopy(usdc, markets["ZEC/USDT"].settlementPair), /native ZEC/);
});

test("disconnect label names the settlement pair from a connected address", () => {
  const address = "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266";
  assert.equal(
    walletDisconnectLabel(address, markets["ZEC/USDC"].settlementPair),
    "Disconnect 0xf39f…2266. Settled as pZEC-USDC.",
  );
  assert.equal(
    walletDisconnectLabel(address, markets["ZEC/USDT"].settlementPair),
    "Disconnect 0xf39f…2266. Settled as pZEC-USDT0.",
  );
  assert.doesNotMatch(walletDisconnectLabel(address, "pZEC-USDC"), /native ZEC/);
});

test("idle connect title names the settlement pair", () => {
  assert.equal(
    walletConnectIdleTitle(markets["ZEC/USDC"].settlementPair),
    "Connect an injected EVM wallet on Arbitrum Sepolia. Settled as pZEC-USDC.",
  );
  assert.equal(
    walletConnectIdleTitle(markets["ZEC/USDT"].settlementPair),
    "Connect an injected EVM wallet on Arbitrum Sepolia. Settled as pZEC-USDT0.",
  );
  assert.doesNotMatch(walletConnectIdleTitle("pZEC-USDC"), /native ZEC/);
});

test("connecting title keeps the settlement pair", () => {
  assert.equal(
    walletConnectBusyTitle(markets["ZEC/USDC"].settlementPair),
    "Connecting an injected EVM wallet on Arbitrum Sepolia. Settled as pZEC-USDC.",
  );
  assert.equal(
    walletConnectBusyTitle(markets["ZEC/USDT"].settlementPair),
    "Connecting an injected EVM wallet on Arbitrum Sepolia. Settled as pZEC-USDT0.",
  );
  assert.doesNotMatch(walletConnectBusyTitle("pZEC-USDC"), /native ZEC/);
});

test("connecting title keeps settlement after the market pair changes", () => {
  assert.equal(
    walletConnectTitle(markets["ZEC/USDC"].settlementPair, true),
    "Connecting an injected EVM wallet on Arbitrum Sepolia. Settled as pZEC-USDC.",
  );
  assert.equal(
    walletConnectTitle(markets["ZEC/USDT"].settlementPair, true),
    "Connecting an injected EVM wallet on Arbitrum Sepolia. Settled as pZEC-USDT0.",
  );
  assert.equal(
    walletConnectTitle(markets["ZEC/USDT"].settlementPair, false),
    walletConnectIdleTitle(markets["ZEC/USDT"].settlementPair),
  );
  assert.doesNotMatch(walletConnectTitle("pZEC-USDT0", true), /native ZEC/);
});

test("connecting bar title wins over a prior reject after the market pair changes", () => {
  const reject = walletConnectFailureCopy("User rejected the request.", markets["ZEC/USDC"].settlementPair);
  const usdt0 = markets["ZEC/USDT"].settlementPair;
  assert.equal(usdt0, "pZEC-USDT0");
  assert.equal(
    walletConnectBarTitle(usdt0, { busy: true, error: reject }),
    walletConnectBusyTitle(usdt0),
  );
  assert.equal(
    walletConnectBarTitle(usdt0, { busy: true, error: reject }),
    "Connecting an injected EVM wallet on Arbitrum Sepolia. Settled as pZEC-USDT0.",
  );
  assert.doesNotMatch(walletConnectBarTitle(usdt0, { busy: true, error: reject }), /User rejected/);
  assert.equal(
    walletConnectBarTitle(usdt0, { busy: false, error: retargetSettlementCopy(reject, usdt0) }),
    "User rejected the request. Settled as pZEC-USDT0.",
  );
  assert.doesNotMatch(walletConnectBarTitle(usdt0, { busy: true, error: reject }), /native ZEC/);
});
