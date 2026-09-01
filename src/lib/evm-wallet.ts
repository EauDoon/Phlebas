import { ARBITRUM_SEPOLIA_CHAIN_ID } from "./eip712.ts";
import {
  ETHEREUM_MAINNET_CHAIN_HEX,
  ETHEREUM_MAINNET_CHAIN_ID,
} from "./mainnet-assets.ts";
import type { Market } from "./market-data.ts";

// Retained only for the isolated legacy Sepolia submission module.
export const ARBITRUM_SEPOLIA_HEX = `0x${ARBITRUM_SEPOLIA_CHAIN_ID.toString(16)}`;

export type Eip1193Provider = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
};

export type WalletState = {
  address: string | null;
  chainId: string | null;
  error: string | null;
};

export const disconnectedWallet: WalletState = {
  address: null,
  chainId: null,
  error: null,
};

export function walletConnectFailureCopy(
  reason: string,
  settlementPair: Market["settlementPair"],
): string {
  const punctuated = reason.endsWith(".") ? reason : `${reason}.`;
  return `${punctuated} Settled as ${settlementPair}.`;
}

function providerErrorCode(error: unknown): unknown {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  return (error as { code?: unknown }).code;
}

function isRejectedProviderRequest(error: unknown): boolean {
  const code = providerErrorCode(error);
  return code === 4001 || code === "4001" || code === "ACTION_REJECTED";
}

export function publicWalletConnectionError(error: unknown): string {
  if (isRejectedProviderRequest(error)) return "Wallet request was rejected.";
  const code = providerErrorCode(error);
  if (code === -32002 || code === "-32002") return "A wallet request is already pending.";
  if (code === 4200 || code === "4200") return "The connected wallet does not support this request.";
  return "Wallet connection failed.";
}

export function publicWalletSigningError(error: unknown): string {
  if (isRejectedProviderRequest(error)) return "Wallet signature request was rejected.";
  if (error instanceof Error && error.message === "Switch to Ethereum Mainnet before signing.") {
    return error.message;
  }
  if (error instanceof Error && error.message === "Provider did not return a signature") {
    return "The wallet did not return a valid signature.";
  }
  if (error instanceof Error && /^Matcher rejected the signed order \(\d{3}\)\.$/.test(error.message)) {
    return "The matcher rejected the signed order.";
  }
  return "Wallet signing failed.";
}

export function missingProviderCopy(settlementPair: Market["settlementPair"]): string {
  return walletConnectFailureCopy("No compatible EVM wallet was found. Ethereum Mainnet only.", settlementPair);
}

export function isMissingProviderCopy(copy: string): boolean {
  return copy.startsWith("No compatible EVM wallet was found.");
}

const SETTLEMENT_PAIRS = ["ZEC-USDC", "ZEC-USDT"] as const satisfies ReadonlyArray<Market["settlementPair"]>;

export function retargetSettlementCopy(
  copy: string,
  settlementPair: Market["settlementPair"],
): string {
  for (const pair of SETTLEMENT_PAIRS) {
    const tail = ` Settled as ${pair}.`;
    if (copy.endsWith(tail)) {
      return `${copy.slice(0, -tail.length)} Settled as ${settlementPair}.`;
    }
  }
  return walletConnectFailureCopy(copy, settlementPair);
}

export function walletStateWithSettlement(
  state: WalletState,
  settlementPair: Market["settlementPair"],
): WalletState {
  if (!state.error) return state;
  return { ...state, error: walletConnectFailureCopy(state.error, settlementPair) };
}

export function walletDisconnectLabel(
  address: string,
  settlementPair: Market["settlementPair"],
): string {
  return `Disconnect ${address.slice(0, 6)}…${address.slice(-4)}. Settled as ${settlementPair}.`;
}

export function walletConnectIdleTitle(settlementPair: Market["settlementPair"]): string {
  return `Connect MetaMask or Rabby on Ethereum Mainnet. Settled as ${settlementPair}.`;
}

export function walletConnectBusyTitle(settlementPair: Market["settlementPair"]): string {
  return `Connecting an EVM wallet on Ethereum Mainnet. Settled as ${settlementPair}.`;
}

export function walletConnectTitle(
  settlementPair: Market["settlementPair"],
  busy: boolean,
): string {
  return busy ? walletConnectBusyTitle(settlementPair) : walletConnectIdleTitle(settlementPair);
}

export function walletConnectBarTitle(
  settlementPair: Market["settlementPair"],
  { busy, error }: { busy: boolean; error: string | null },
): string {
  return busy ? walletConnectTitle(settlementPair, true) : (error ?? walletConnectTitle(settlementPair, false));
}

export function getInjectedProvider(): Eip1193Provider | null {
  if (typeof window === "undefined") return null;
  const provider = (window as Window & { ethereum?: Eip1193Provider }).ethereum;
  return provider ?? null;
}

export async function connectMainnetWallet(provider: Eip1193Provider): Promise<WalletState> {
  const accounts = await provider.request({ method: "eth_requestAccounts" }) as string[];
  const address = accounts[0];
  if (!address) {
    return { ...disconnectedWallet, error: "No account returned by the injected provider." };
  }
  const chainId = await provider.request({ method: "eth_chainId" }) as string;
  if (chainId.toLowerCase() !== ETHEREUM_MAINNET_CHAIN_HEX) {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: ETHEREUM_MAINNET_CHAIN_HEX }],
    });
  }
  const connectedChain = await provider.request({ method: "eth_chainId" }) as string;
  if (connectedChain.toLowerCase() !== ETHEREUM_MAINNET_CHAIN_HEX) {
    return {
      address: address.toLowerCase(),
      chainId: connectedChain,
      error: "Switch to Ethereum Mainnet. Other chains are blocked.",
    };
  }
  const currentAccounts = await provider.request({ method: "eth_accounts" });
  if (!Array.isArray(currentAccounts) || typeof currentAccounts[0] !== "string"
    || currentAccounts[0].toLowerCase() !== address.toLowerCase()) {
    return { ...disconnectedWallet, chainId: connectedChain, error: "Wallet account changed while connecting." };
  }
  return { address: address.toLowerCase(), chainId: connectedChain, error: null };
}

export async function signTypedData(
  provider: Eip1193Provider,
  address: string,
  typedData: unknown,
): Promise<string> {
  const chainId = await provider.request({ method: "eth_chainId" });
  if (typeof chainId !== "string" || BigInt(chainId) !== ETHEREUM_MAINNET_CHAIN_ID) {
    throw new Error("Switch to Ethereum Mainnet before signing.");
  }
  const signature = await provider.request({
    method: "eth_signTypedData_v4",
    params: [address, JSON.stringify(typedData)],
  });
  if (typeof signature !== "string" || !signature.startsWith("0x")) {
    throw new Error("Provider did not return a signature");
  }
  return signature;
}

function chainHex(chainId: bigint): string {
  if (typeof chainId !== "bigint" || chainId <= 0n || chainId > (1n << 256n) - 1n) {
    throw new RangeError("Expected wallet chain ID must be a positive uint256");
  }
  return `0x${chainId.toString(16)}`;
}

function canonicalWalletAddress(value: string, label: string): string {
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) throw new TypeError(`${label} must be a 20-byte EVM address`);
  return value.toLowerCase();
}

export async function assertConnectedWalletAuthority(
  provider: Eip1193Provider,
  expectedAddress: string,
  expectedChainId: bigint,
): Promise<string> {
  const address = canonicalWalletAddress(expectedAddress, "Expected wallet address");
  const [chainId, accounts] = await Promise.all([
    provider.request({ method: "eth_chainId" }),
    provider.request({ method: "eth_accounts" }),
  ]);
  if (typeof chainId !== "string" || chainId.toLowerCase() !== chainHex(expectedChainId)) {
    throw new Error("Connected wallet chain does not match the approved matcher manifest");
  }
  if (!Array.isArray(accounts) || typeof accounts[0] !== "string"
    || canonicalWalletAddress(accounts[0], "Connected wallet account") !== address) {
    throw new Error("Connected wallet account changed after order review");
  }
  return address;
}

async function signReviewedTypedData(
  provider: Eip1193Provider,
  expectedAddress: string,
  expectedChainId: bigint,
  typedData: unknown,
  signatureLabel: "order" | "matcher control",
): Promise<string> {
  const address = await assertConnectedWalletAuthority(provider, expectedAddress, expectedChainId);
  const signature = await provider.request({
    method: "eth_signTypedData_v4",
    params: [address, JSON.stringify(typedData)],
  });
  if (typeof signature !== "string" || !/^0x[0-9a-fA-F]{130}$/.test(signature)) {
    throw new Error(`Provider did not return a 65-byte ${signatureLabel} signature`);
  }
  return signature;
}

export function signTypedOrderIntent(
  provider: Eip1193Provider,
  expectedAddress: string,
  expectedChainId: bigint,
  orderTypedData: unknown,
): Promise<string> {
  return signReviewedTypedData(provider, expectedAddress, expectedChainId, orderTypedData, "order");
}

export function signTypedMatcherControl(
  provider: Eip1193Provider,
  expectedAddress: string,
  expectedChainId: bigint,
  controlTypedData: unknown,
): Promise<string> {
  return signReviewedTypedData(provider, expectedAddress, expectedChainId, controlTypedData, "matcher control");
}
