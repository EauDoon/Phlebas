import assert from "node:assert/strict";
import test from "node:test";

import type { Eip1193Provider } from "./evm-wallet.ts";
import {
  ARBITRUM_ONE_HEX,
  connectMatcherWallet,
  publicMatcherWalletError,
} from "./matcher-wallet.ts";
import {
  NATIVE_ZEC_USDC_MATCHER_DEPLOYMENT,
  computeNativeZecUsdcMatcherConfigurationHash,
  parseNativeZecUsdcMatcherManifest,
} from "./native-zec-usdc-matcher-manifest.ts";

const ADDRESS = "0x7e5f4552091a69125d5dfcb7b8c2659029395bdf";

function enabledDeployment() {
  const source = NATIVE_ZEC_USDC_MATCHER_DEPLOYMENT.manifest;
  const verifyingContract = "0x1111111111111111111111111111111111111111";
  const manifest = {
    ...source,
    deployed: true,
    submissionEnabled: true,
    evm: { ...source.evm, verifyingContract },
    configurationHash: computeNativeZecUsdcMatcherConfigurationHash(verifyingContract),
  };
  return parseNativeZecUsdcMatcherManifest(manifest);
}

test("refuses wallet access while the native matcher deployment is disabled", async () => {
  const calls: string[] = [];
  const provider: Eip1193Provider = {
    async request({ method }) {
      calls.push(method);
      throw new Error("must not call provider");
    },
  };
  await assert.rejects(
    () => connectMatcherWallet(provider, NATIVE_ZEC_USDC_MATCHER_DEPLOYMENT),
    /disabled by the deployment manifest/,
  );
  assert.deepEqual(calls, []);
});

test("switches to Arbitrum One and rechecks the active account without transaction RPC", async () => {
  const calls: string[] = [];
  const provider: Eip1193Provider = {
    async request({ method }) {
      calls.push(method);
      if (method === "eth_requestAccounts" || method === "eth_accounts") return [ADDRESS.toUpperCase().replace("0X", "0x")];
      if (method === "eth_chainId") {
        return calls.filter((value) => value === "eth_chainId").length === 1 ? "0x1" : ARBITRUM_ONE_HEX;
      }
      if (method === "wallet_switchEthereumChain") return null;
      throw new Error(method);
    },
  };

  assert.deepEqual(await connectMatcherWallet(provider, enabledDeployment()), {
    address: ADDRESS,
    chainId: ARBITRUM_ONE_HEX,
  });
  assert.deepEqual(calls, [
    "eth_requestAccounts",
    "eth_chainId",
    "wallet_switchEthereumChain",
    "eth_chainId",
    "eth_accounts",
  ]);
  assert.equal(calls.includes("eth_sendTransaction"), false);
});

test("does not add a chain after a switch rejection", async () => {
  const calls: string[] = [];
  const provider: Eip1193Provider = {
    async request({ method }) {
      calls.push(method);
      if (method === "eth_requestAccounts") return [ADDRESS];
      if (method === "eth_chainId") return "0x1";
      if (method === "wallet_switchEthereumChain") throw Object.assign(new Error("rejected"), { code: 4001 });
      throw new Error(method);
    },
  };

  await assert.rejects(() => connectMatcherWallet(provider, enabledDeployment()), /rejected/);
  assert.equal(calls.includes("wallet_addEthereumChain"), false);
});

test("fails when the account changes during connection", async () => {
  const provider: Eip1193Provider = {
    async request({ method }) {
      if (method === "eth_requestAccounts") return [ADDRESS];
      if (method === "eth_chainId") return "0xA4B1";
      if (method === "eth_accounts") return ["0x1111111111111111111111111111111111111111"];
      throw new Error(method);
    },
  };
  await assert.rejects(
    () => connectMatcherWallet(provider, enabledDeployment()),
    /account changed while connecting/,
  );
});

test("sanitizes matcher wallet errors", () => {
  assert.equal(publicMatcherWalletError({ code: 4001, message: "private" }), "Wallet request was rejected.");
  assert.equal(
    publicMatcherWalletError(new Error("private provider detail")),
    "Native matcher wallet connection failed.",
  );
});
