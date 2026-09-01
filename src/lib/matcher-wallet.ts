import type { Eip1193Provider } from "./evm-wallet.ts";
import {
  type NativeZecUsdcMatcherDeploymentState,
} from "./native-zec-usdc-matcher-manifest.ts";
import {
  ETHEREUM_MAINNET_CHAIN_HEX,
  ETHEREUM_MAINNET_CHAIN_ID,
} from "./mainnet-assets.ts";

export type MatcherWalletConnection = Readonly<{
  address: string;
  chainId: typeof ETHEREUM_MAINNET_CHAIN_HEX;
}>;

function providerErrorCode(error: unknown): unknown {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  return (error as { code?: unknown }).code;
}

function canonicalAddress(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(value)) {
    throw new TypeError(`${label} must be a 20-byte EVM address`);
  }
  return value.toLowerCase();
}

function canonicalChainId(value: unknown): string {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]+$/.test(value)) {
    throw new TypeError("Wallet chain ID must be hexadecimal");
  }
  return `0x${BigInt(value).toString(16)}`;
}

function assertEnabledMatcher(deployment: NativeZecUsdcMatcherDeploymentState): void {
  if (!deployment.enabled || deployment.expectedMatcher === null || deployment.orderDomain === null) {
    throw new Error("Native matcher wallet connection is disabled by the deployment manifest");
  }
  if (deployment.orderDomain.chainId !== ETHEREUM_MAINNET_CHAIN_ID
    || deployment.expectedMatcher.orderDomain.chainId !== ETHEREUM_MAINNET_CHAIN_ID) {
    throw new Error("Native matcher wallet network does not match the approved deployment manifest");
  }
}

async function activeAccount(provider: Eip1193Provider, method: "eth_requestAccounts" | "eth_accounts"): Promise<string> {
  const accounts = await provider.request({ method });
  if (!Array.isArray(accounts) || accounts.length === 0) {
    throw new Error("The wallet did not return an account");
  }
  return canonicalAddress(accounts[0], "Wallet account");
}

async function switchToEthereumMainnet(provider: Eip1193Provider): Promise<void> {
  await provider.request({
    method: "wallet_switchEthereumChain",
    params: [{ chainId: ETHEREUM_MAINNET_CHAIN_HEX }],
  });
}

export async function connectMatcherWallet(
  provider: Eip1193Provider,
  deployment: NativeZecUsdcMatcherDeploymentState,
): Promise<MatcherWalletConnection> {
  assertEnabledMatcher(deployment);
  const requestedAccount = await activeAccount(provider, "eth_requestAccounts");
  const initialChainId = canonicalChainId(await provider.request({ method: "eth_chainId" }));
  if (initialChainId !== ETHEREUM_MAINNET_CHAIN_HEX) await switchToEthereumMainnet(provider);

  const chainId = canonicalChainId(await provider.request({ method: "eth_chainId" }));
  if (chainId !== ETHEREUM_MAINNET_CHAIN_HEX) {
    throw new Error("Switch to Ethereum Mainnet before reviewing a native matcher order");
  }
  const currentAccount = await activeAccount(provider, "eth_accounts");
  if (currentAccount !== requestedAccount) {
    throw new Error("Wallet account changed while connecting to the native matcher");
  }
  return Object.freeze({ address: currentAccount, chainId: ETHEREUM_MAINNET_CHAIN_HEX });
}

export function publicMatcherWalletError(error: unknown): string {
  const code = providerErrorCode(error);
  if (code === 4001 || code === "4001" || code === "ACTION_REJECTED") {
    return "Wallet request was rejected.";
  }
  if (code === -32002 || code === "-32002") return "A wallet request is already pending.";
  if (code === 4200 || code === "4200") return "The connected wallet does not support this request.";
  if (error instanceof Error && (
    error.message === "Native matcher wallet connection is disabled by the deployment manifest"
    || error.message === "Switch to Ethereum Mainnet before reviewing a native matcher order"
    || error.message === "Wallet account changed while connecting to the native matcher"
  )) return error.message;
  return "Native matcher wallet connection failed.";
}
