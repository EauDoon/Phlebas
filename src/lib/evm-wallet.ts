import { ARBITRUM_SEPOLIA_CHAIN_ID } from "./eip712.ts";

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

export function getInjectedProvider(): Eip1193Provider | null {
  if (typeof window === "undefined") return null;
  const provider = (window as Window & { ethereum?: Eip1193Provider }).ethereum;
  return provider ?? null;
}

export async function connectTestnetWallet(provider: Eip1193Provider): Promise<WalletState> {
  const accounts = await provider.request({ method: "eth_requestAccounts" }) as string[];
  const address = accounts[0];
  if (!address) {
    return { ...disconnectedWallet, error: "No account returned by the injected provider." };
  }
  const chainId = await provider.request({ method: "eth_chainId" }) as string;
  if (chainId.toLowerCase() !== ARBITRUM_SEPOLIA_HEX) {
    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: ARBITRUM_SEPOLIA_HEX }],
      });
    } catch {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: ARBITRUM_SEPOLIA_HEX,
          chainName: "Arbitrum Sepolia",
          nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
          rpcUrls: ["https://sepolia-rollup.arbitrum.io/rpc"],
          blockExplorerUrls: ["https://sepolia.arbiscan.io"],
        }],
      });
    }
  }
  const connectedChain = await provider.request({ method: "eth_chainId" }) as string;
  if (connectedChain.toLowerCase() !== ARBITRUM_SEPOLIA_HEX) {
    return {
      address: address.toLowerCase(),
      chainId: connectedChain,
      error: "Switch to Arbitrum Sepolia. Mainnet signing is blocked.",
    };
  }
  return { address: address.toLowerCase(), chainId: connectedChain, error: null };
}

export async function signTypedData(
  provider: Eip1193Provider,
  address: string,
  typedData: unknown,
): Promise<string> {
  const signature = await provider.request({
    method: "eth_signTypedData_v4",
    params: [address, JSON.stringify(typedData)],
  });
  if (typeof signature !== "string" || !signature.startsWith("0x")) {
    throw new Error("Provider did not return a signature");
  }
  return signature;
}
