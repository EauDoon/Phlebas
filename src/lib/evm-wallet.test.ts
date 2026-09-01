import assert from "node:assert/strict";
import test from "node:test";

import {
  ARBITRUM_SEPOLIA_HEX,
  assertConnectedWalletAuthority,
  connectTestnetWallet,
  isMissingProviderCopy,
  missingProviderCopy,
  publicTestnetSigningError,
  publicWalletConnectionError,
  retargetSettlementCopy,
  signTypedMatcherControl,
  signTypedOrderIntent,
  signTypedData,
  walletConnectBarTitle,
  walletConnectBusyTitle,
  walletConnectFailureCopy,
  walletConnectIdleTitle,
  walletConnectTitle,
  walletDisconnectLabel,
  walletOffTitle,
  walletStateWithSettlement,
  type Eip1193Provider,
} from "./evm-wallet.ts";
import { markets } from "./market-data.ts";

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
  assert.match(wrapped.error ?? "", /Settled as ZEC-USDC/);
  assert.match(wrapped.error ?? "", /Arbitrum Sepolia/);
  assert.equal(wrapped.chainId, "0x1");
  assert.equal(
    walletStateWithSettlement({ address: "0xabc", chainId: ARBITRUM_SEPOLIA_HEX, error: null }, "ZEC-USDC").error,
    null,
  );
});

test("missing provider copy names the settlement pair", () => {
  assert.equal(
    missingProviderCopy(markets["ZEC/USDC"].settlementPair),
    "No injected EVM wallet. Arbitrum Sepolia only. Settled as ZEC-USDC.",
  );
  assert.equal(
    missingProviderCopy(markets["ZEC/USDT"].settlementPair),
    "No injected EVM wallet. Arbitrum Sepolia only. Settled as ZEC-USDT.",
  );
  assert.doesNotMatch(missingProviderCopy("ZEC-USDC"), /native ZEC/);
  assert.doesNotMatch(walletConnectFailureCopy("Wallet connection failed", "ZEC-USDT"), /live funds/);
});

test("ticket sign missing-provider copy names the selected market settlement pair", () => {
  const usdc = markets["ZEC/USDC"];
  const usdt = markets["ZEC/USDT"];
  assert.equal(usdc.settlementPair, "ZEC-USDC");
  assert.equal(usdt.settlementPair, "ZEC-USDT");
  assert.equal(
    missingProviderCopy(usdc.settlementPair),
    "No injected EVM wallet. Arbitrum Sepolia only. Settled as ZEC-USDC.",
  );
  assert.equal(
    missingProviderCopy(usdt.settlementPair),
    "No injected EVM wallet. Arbitrum Sepolia only. Settled as ZEC-USDT.",
  );
  assert.doesNotMatch(missingProviderCopy(usdc.settlementPair), /native ZEC/);
});

test("ticket sign missing-provider copy follows the selected market after a switch", () => {
  const usdcNotice = missingProviderCopy(markets["ZEC/USDC"].settlementPair);
  assert.equal(isMissingProviderCopy(usdcNotice), true);
  assert.equal(
    missingProviderCopy(markets["ZEC/USDT"].settlementPair),
    "No injected EVM wallet. Arbitrum Sepolia only. Settled as ZEC-USDT.",
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
  assert.equal(usdc, "User rejected the request. Settled as ZEC-USDC.");
  assert.equal(usdt, "User rejected the request. Settled as ZEC-USDT.");
  assert.equal(retargetSettlementCopy(usdc, markets["ZEC/USDT"].settlementPair), usdt);
  assert.equal(retargetSettlementCopy(usdt, markets["ZEC/USDC"].settlementPair), usdc);
  assert.doesNotMatch(retargetSettlementCopy(usdc, markets["ZEC/USDT"].settlementPair), /native ZEC/);
});

test("public wallet errors allowlist provider outcomes without exposing diagnostics", () => {
  assert.equal(publicWalletConnectionError({ code: 4001, message: "private provider detail" }), "Wallet request was rejected.");
  assert.equal(publicWalletConnectionError({ code: -32002, message: "private provider detail" }), "A wallet request is already pending.");
  assert.equal(
    publicWalletConnectionError({ code: 4200, message: "private provider detail" }),
    "The connected wallet does not support this request.",
  );
  assert.equal(publicWalletConnectionError(new Error("private provider detail")), "Wallet connection failed.");
});

test("public signing errors expose only reviewed messages", () => {
  assert.equal(
    publicTestnetSigningError({ code: "ACTION_REJECTED", message: "private provider detail" }),
    "Wallet signature request was rejected.",
  );
  assert.equal(
    publicTestnetSigningError(new Error("Switch to Arbitrum Sepolia before signing.")),
    "Switch to Arbitrum Sepolia before signing.",
  );
  assert.equal(
    publicTestnetSigningError(new Error("Matcher rejected the signed order (503).")),
    "The Testnet matcher rejected the signed order.",
  );
  assert.equal(publicTestnetSigningError(new Error("private provider detail")), "Testnet signing failed.");
});

test("disconnect label names the settlement pair from a connected address", () => {
  const address = "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266";
  assert.equal(
    walletDisconnectLabel(address, markets["ZEC/USDC"].settlementPair),
    "Disconnect 0xf39f…2266. Settled as ZEC-USDC.",
  );
  assert.equal(
    walletDisconnectLabel(address, markets["ZEC/USDT"].settlementPair),
    "Disconnect 0xf39f…2266. Settled as ZEC-USDT.",
  );
  assert.doesNotMatch(walletDisconnectLabel(address, "ZEC-USDC"), /native ZEC/);
});

test("wallet-off title names the settlement pair", () => {
  assert.equal(
    walletOffTitle(markets["ZEC/USDC"].settlementPair),
    "Wallets are off. Optional Sepolia connect is not started. Settled as ZEC-USDC.",
  );
  assert.equal(
    walletOffTitle(markets["ZEC/USDT"].settlementPair),
    "Wallets are off. Optional Sepolia connect is not started. Settled as ZEC-USDT.",
  );
  assert.doesNotMatch(walletOffTitle("ZEC-USDC"), /simulation/i);
});

test("idle connect title names the settlement pair", () => {
  assert.equal(
    walletConnectIdleTitle(markets["ZEC/USDC"].settlementPair),
    "Connect an injected EVM wallet on Arbitrum Sepolia. Settled as ZEC-USDC.",
  );
  assert.equal(
    walletConnectIdleTitle(markets["ZEC/USDT"].settlementPair),
    "Connect an injected EVM wallet on Arbitrum Sepolia. Settled as ZEC-USDT.",
  );
  assert.doesNotMatch(walletConnectIdleTitle("ZEC-USDC"), /native ZEC/);
});

test("connecting title keeps the settlement pair", () => {
  assert.equal(
    walletConnectBusyTitle(markets["ZEC/USDC"].settlementPair),
    "Connecting an injected EVM wallet on Arbitrum Sepolia. Settled as ZEC-USDC.",
  );
  assert.equal(
    walletConnectBusyTitle(markets["ZEC/USDT"].settlementPair),
    "Connecting an injected EVM wallet on Arbitrum Sepolia. Settled as ZEC-USDT.",
  );
  assert.doesNotMatch(walletConnectBusyTitle("ZEC-USDC"), /native ZEC/);
});

test("connecting title keeps settlement after the market pair changes", () => {
  assert.equal(
    walletConnectTitle(markets["ZEC/USDC"].settlementPair, true),
    "Connecting an injected EVM wallet on Arbitrum Sepolia. Settled as ZEC-USDC.",
  );
  assert.equal(
    walletConnectTitle(markets["ZEC/USDT"].settlementPair, true),
    "Connecting an injected EVM wallet on Arbitrum Sepolia. Settled as ZEC-USDT.",
  );
  assert.equal(
    walletConnectTitle(markets["ZEC/USDT"].settlementPair, false),
    walletConnectIdleTitle(markets["ZEC/USDT"].settlementPair),
  );
  assert.doesNotMatch(walletConnectTitle("ZEC-USDT", true), /native ZEC/);
});

test("connecting bar title wins over a prior reject after the market pair changes", () => {
  const reject = walletConnectFailureCopy("User rejected the request.", markets["ZEC/USDC"].settlementPair);
  const usdt0 = markets["ZEC/USDT"].settlementPair;
  assert.equal(usdt0, "ZEC-USDT");
  assert.equal(
    walletConnectBarTitle(usdt0, { busy: true, error: reject }),
    walletConnectBusyTitle(usdt0),
  );
  assert.equal(
    walletConnectBarTitle(usdt0, { busy: true, error: reject }),
    "Connecting an injected EVM wallet on Arbitrum Sepolia. Settled as ZEC-USDT.",
  );
  assert.doesNotMatch(walletConnectBarTitle(usdt0, { busy: true, error: reject }), /User rejected/);
  assert.equal(
    walletConnectBarTitle(usdt0, { busy: false, error: retargetSettlementCopy(reject, usdt0) }),
    "User rejected the request. Settled as ZEC-USDT.",
  );
  assert.doesNotMatch(walletConnectBarTitle(usdt0, { busy: true, error: reject }), /native ZEC/);
});

test("rechecks the active chain immediately before signing", async () => {
  const provider: Eip1193Provider = {
    async request({ method }) {
      if (method === "eth_chainId") return "0x1";
      if (method === "eth_signTypedData_v4") throw new Error("must not sign");
      throw new Error(method);
    },
  };
  await assert.rejects(() => signTypedData(provider, "0xabc", {}), /Arbitrum Sepolia/);
});

test("binds matcher signing to the reviewed account and chain without a transaction RPC", async () => {
  const address = "0x7e5f4552091a69125d5dfcb7b8c2659029395bdf";
  const signature = `0x${"11".repeat(65)}`;
  const calls: string[] = [];
  const provider: Eip1193Provider = {
    async request({ method }) {
      calls.push(method);
      if (method === "eth_chainId") return "0xa4b1";
      if (method === "eth_accounts") return [address.toUpperCase().replace("0X", "0x")];
      if (method === "eth_signTypedData_v4") return signature;
      throw new Error(method);
    },
  };

  assert.equal(await assertConnectedWalletAuthority(provider, address, 42161n), address);
  calls.length = 0;
  assert.equal(await signTypedOrderIntent(provider, address, 42161n, { domain: {}, message: {} }), signature);
  assert.deepEqual(calls.slice(0, 2).sort(), ["eth_accounts", "eth_chainId"]);
  assert.equal(calls[2], "eth_signTypedData_v4");
  assert.equal(calls.includes("eth_sendTransaction"), false);
});

test("clear-signs matcher controls with EIP-712 only", async () => {
  const address = "0x7e5f4552091a69125d5dfcb7b8c2659029395bdf";
  const signature = `0x${"22".repeat(65)}`;
  const calls: Array<Readonly<{ method: string; params?: unknown[] }>> = [];
  const provider: Eip1193Provider = {
    async request(input) {
      calls.push(input);
      if (input.method === "eth_chainId") return "0xa4b1";
      if (input.method === "eth_accounts") return [address];
      if (input.method === "eth_signTypedData_v4") return signature;
      throw new Error(input.method);
    },
  };
  const typedData = { domain: { name: "Phlebas Matcher Control" }, primaryType: "CancelOrder" };

  assert.equal(await signTypedMatcherControl(provider, address, 42161n, typedData), signature);
  assert.deepEqual(calls.slice(0, 2).map((call) => call.method).sort(), ["eth_accounts", "eth_chainId"]);
  assert.deepEqual(calls[2], {
    method: "eth_signTypedData_v4",
    params: [address, JSON.stringify(typedData)],
  });
  assert.equal(calls.some((call) => call.method === "eth_sign" || call.method === "personal_sign"), false);
  assert.equal(calls.some((call) => call.method === "eth_sendTransaction"), false);
});

test("refuses stale matcher wallet state before requesting a signature", async () => {
  const calls: string[] = [];
  const provider: Eip1193Provider = {
    async request({ method }) {
      calls.push(method);
      if (method === "eth_chainId") return "0xa4b1";
      if (method === "eth_accounts") return ["0x1111111111111111111111111111111111111111"];
      if (method === "eth_signTypedData_v4") throw new Error("must not sign");
      throw new Error(method);
    },
  };
  await assert.rejects(
    () => signTypedOrderIntent(
      provider,
      "0x2222222222222222222222222222222222222222",
      42161n,
      {},
    ),
    /account changed after order review/,
  );
  assert.equal(calls.includes("eth_signTypedData_v4"), false);
});
