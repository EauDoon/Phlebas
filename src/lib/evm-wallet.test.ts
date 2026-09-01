import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  WALLET_CONNECT_ARIA_LABEL,
  assertConnectedWalletAuthority,
  connectMainnetWallet,
  isMissingProviderCopy,
  missingProviderCopy,
  publicWalletSigningError,
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
  walletSigningDisabledCopy,
  walletStateWithSettlement,
  type Eip1193Provider,
} from "./evm-wallet.ts";
import { ETHEREUM_MAINNET_CHAIN_HEX } from "./mainnet-assets.ts";
import { markets } from "./market-data.ts";

test("connects only after switching to Ethereum Mainnet", async () => {
  const calls: string[] = [];
  const provider: Eip1193Provider = {
    async request({ method }) {
      calls.push(method);
      if (method === "eth_requestAccounts") return ["0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"];
      if (method === "eth_chainId") return calls.filter((item) => item === "eth_chainId").length === 1 ? "0xa4b1" : ETHEREUM_MAINNET_CHAIN_HEX;
      if (method === "wallet_switchEthereumChain") return null;
      if (method === "eth_accounts") return ["0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"];
      throw new Error(method);
    },
  };
  const state = await connectMainnetWallet(provider);
  assert.equal(state.address, "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266");
  assert.equal(state.chainId, ETHEREUM_MAINNET_CHAIN_HEX);
  assert.equal(state.error, null);
  assert.deepEqual(calls, ["eth_requestAccounts", "eth_chainId", "wallet_switchEthereumChain", "eth_chainId", "eth_accounts"]);
});

test("blocks a wallet that remains on the wrong chain", async () => {
  const provider: Eip1193Provider = {
    async request({ method }) {
      if (method === "eth_requestAccounts") return ["0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"];
      if (method === "eth_chainId") return "0xa4b1";
      if (method === "wallet_switchEthereumChain") return null;
      throw new Error(method);
    },
  };
  const state = await connectMainnetWallet(provider);
  assert.match(state.error ?? "", /Ethereum Mainnet/);
  assert.equal(state.chainId, "0xa4b1");
  const wrapped = walletStateWithSettlement(state, markets["ZEC/USDC"].settlementPair);
  assert.match(wrapped.error ?? "", /Settled as ZEC-USDC/);
  assert.match(wrapped.error ?? "", /Ethereum Mainnet/);
  assert.equal(wrapped.chainId, "0xa4b1");
  assert.equal(
    walletStateWithSettlement({ address: "0xabc", chainId: ETHEREUM_MAINNET_CHAIN_HEX, error: null }, "ZEC-USDC").error,
    null,
  );
});

test("missing provider copy names the settlement pair", () => {
  assert.equal(
    missingProviderCopy(markets["ZEC/USDC"].settlementPair),
    "No compatible EVM wallet was found. Ethereum Mainnet only. Settled as ZEC-USDC.",
  );
  assert.equal(
    missingProviderCopy(markets["ZEC/USDT"].settlementPair),
    "No compatible EVM wallet was found. Ethereum Mainnet only. Settled as ZEC-USDT.",
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
    "No compatible EVM wallet was found. Ethereum Mainnet only. Settled as ZEC-USDC.",
  );
  assert.equal(
    missingProviderCopy(usdt.settlementPair),
    "No compatible EVM wallet was found. Ethereum Mainnet only. Settled as ZEC-USDT.",
  );
  assert.doesNotMatch(missingProviderCopy(usdc.settlementPair), /native ZEC/);
});

test("ticket sign missing-provider copy follows the selected market after a switch", () => {
  const usdcNotice = missingProviderCopy(markets["ZEC/USDC"].settlementPair);
  assert.equal(isMissingProviderCopy(usdcNotice), true);
  assert.equal(
    missingProviderCopy(markets["ZEC/USDT"].settlementPair),
    "No compatible EVM wallet was found. Ethereum Mainnet only. Settled as ZEC-USDT.",
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
    retargetSettlementCopy("No compatible EVM wallet was found. Ethereum Mainnet only.", markets["ZEC/USDT"].settlementPair),
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
    publicWalletSigningError({ code: "ACTION_REJECTED", message: "private provider detail" }),
    "Wallet signature request was rejected.",
  );
  assert.equal(
    publicWalletSigningError(new Error("Switch to Ethereum Mainnet before signing.")),
    "Switch to Ethereum Mainnet before signing.",
  );
  assert.equal(
    publicWalletSigningError(new Error("Matcher rejected the signed order (503).")),
    "The matcher rejected the signed order.",
  );
  assert.equal(publicWalletSigningError(new Error("private provider detail")), "Wallet signing failed.");
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

test("idle connect title names the settlement pair", () => {
  assert.equal(WALLET_CONNECT_ARIA_LABEL, "Connect Ethereum Mainnet wallet");
  assert.equal(
    walletConnectIdleTitle(markets["ZEC/USDC"].settlementPair),
    "Connect MetaMask or Rabby on Ethereum Mainnet. Settled as ZEC-USDC.",
  );
  assert.equal(
    walletConnectIdleTitle(markets["ZEC/USDT"].settlementPair),
    "Connect MetaMask or Rabby on Ethereum Mainnet. Settled as ZEC-USDT.",
  );
});

test("connecting title keeps the settlement pair", () => {
  assert.equal(
    walletConnectBusyTitle(markets["ZEC/USDC"].settlementPair),
    "Connecting an EVM wallet on Ethereum Mainnet. Settled as ZEC-USDC.",
  );
  assert.equal(
    walletConnectBusyTitle(markets["ZEC/USDT"].settlementPair),
    "Connecting an EVM wallet on Ethereum Mainnet. Settled as ZEC-USDT.",
  );
  assert.doesNotMatch(walletConnectBusyTitle("ZEC-USDC"), /native ZEC/);
});

test("connecting title keeps settlement after the market pair changes", () => {
  assert.equal(
    walletConnectTitle(markets["ZEC/USDC"].settlementPair, true),
    "Connecting an EVM wallet on Ethereum Mainnet. Settled as ZEC-USDC.",
  );
  assert.equal(
    walletConnectTitle(markets["ZEC/USDT"].settlementPair, true),
    "Connecting an EVM wallet on Ethereum Mainnet. Settled as ZEC-USDT.",
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
    "Connecting an EVM wallet on Ethereum Mainnet. Settled as ZEC-USDT.",
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
      if (method === "eth_chainId") return "0xa4b1";
      if (method === "eth_signTypedData_v4") throw new Error("must not sign");
      throw new Error(method);
    },
  };
  await assert.rejects(() => signTypedData(provider, "0xabc", {}), /Ethereum Mainnet/);
});

test("binds matcher signing to the reviewed account and chain without a transaction RPC", async () => {
  const address = "0x7e5f4552091a69125d5dfcb7b8c2659029395bdf";
  const signature = `0x${"11".repeat(65)}`;
  const calls: string[] = [];
  const provider: Eip1193Provider = {
    async request({ method }) {
      calls.push(method);
      if (method === "eth_chainId") return "0x1";
      if (method === "eth_accounts") return [address.toUpperCase().replace("0X", "0x")];
      if (method === "eth_signTypedData_v4") return signature;
      throw new Error(method);
    },
  };

  assert.equal(await assertConnectedWalletAuthority(provider, address, 1n), address);
  calls.length = 0;
  assert.equal(await signTypedOrderIntent(provider, address, 1n, { domain: {}, message: {} }), signature);
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
      if (input.method === "eth_chainId") return "0x1";
      if (input.method === "eth_accounts") return [address];
      if (input.method === "eth_signTypedData_v4") return signature;
      throw new Error(input.method);
    },
  };
  const typedData = { domain: { name: "Phlebas Matcher Control" }, primaryType: "CancelOrder" };

  assert.equal(await signTypedMatcherControl(provider, address, 1n, typedData), signature);
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
      if (method === "eth_chainId") return "0x1";
      if (method === "eth_accounts") return ["0x1111111111111111111111111111111111111111"];
      if (method === "eth_signTypedData_v4") throw new Error("must not sign");
      throw new Error(method);
    },
  };
  await assert.rejects(
    () => signTypedOrderIntent(
      provider,
      "0x2222222222222222222222222222222222222222",
      1n,
      {},
    ),
    /account changed after order review/,
  );
  assert.equal(calls.includes("eth_signTypedData_v4"), false);
});

test("wallet signing disabled copy never asks for a seed, spend key, or Sepolia submit path", () => {
  const copy = walletSigningDisabledCopy();
  assert.match(copy, /undeployed/);
  assert.match(copy, /signing and broadcast remain disabled/i);
  assert.doesNotMatch(copy, /seed|spend(?:ing)? key|viewing key/i);
  assert.doesNotMatch(copy, /\blive funds\b/i);
  assert.doesNotMatch(copy, /sepolia|arbitrum|submit/i);
});

test("public wallet copy has no Sepolia submit path", () => {
  const copies = [
    WALLET_CONNECT_ARIA_LABEL,
    walletSigningDisabledCopy(),
    missingProviderCopy("ZEC-USDC"),
    missingProviderCopy("ZEC-USDT"),
    walletConnectIdleTitle("ZEC-USDC"),
    walletConnectIdleTitle("ZEC-USDT"),
    walletConnectBusyTitle("ZEC-USDC"),
    walletConnectFailureCopy("Wallet connection failed", "ZEC-USDT"),
    walletDisconnectLabel("0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266", "ZEC-USDC"),
    publicWalletConnectionError(new Error("private provider detail")),
    publicWalletSigningError(new Error("private provider detail")),
  ];
  for (const copy of copies) {
    assert.doesNotMatch(copy, /sepolia|arbitrum|walletOffTitle|walletConnectEnabled|NEXT_PUBLIC_PHLEBAS_SEPOLIA_SUBMIT/i);
  }
});

test("wallet helpers never request a broadcast or name a Sepolia submit path", async () => {
  const source = await readFile(new URL("./evm-wallet.ts", import.meta.url), "utf8");
  assert.match(source, /WALLET_CONNECT_ARIA_LABEL = "Connect Ethereum Mainnet wallet"/);
  assert.match(source, /Ethereum Mainnet signing and broadcast remain disabled/);
  assert.doesNotMatch(source, /eth_sendTransaction|sepolia|arbitrum|walletOffTitle|walletConnectEnabled/i);
});
