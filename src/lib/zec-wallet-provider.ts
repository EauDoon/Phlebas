// Discovery and typed access for an injected transparent-ZEC wallet provider.
//
// Zcash browser wallets do not yet share an EIP-6963-style discovery
// standard, so this module detects the de-facto injected surface
// (`window.zcash` with a JSON-RPC `request`) and accepts an explicit
// provider for environments where the injection point differs. Everything
// here is fail-closed: a provider that answers wrongly is treated as
// absent or disconnected, never as connected.

import {
  assertZcashTransparentP2pkhAccount,
  canonicalZcashTransparentAccount,
  decodeAddress,
  decodeZcashTransparentAccount,
} from "./zcash-address.ts";

export type ZecJsonRpcProvider = {
  request(args: { method: string; params?: unknown[] | object }): Promise<unknown>;
};

/** RPC methods the adapter uses. A wallet that rejects these stays unconnected. */
export const ZEC_RPC_METHODS = Object.freeze({
  requestAccounts: "zcash_requestAccounts",
  accounts: "zcash_accounts",
  signMessage: "zcash_signMessage",
} as const);

export type ZecWalletState = Readonly<{
  address: string | null;
  error: string | null;
}>;

export const disconnectedZecWallet: ZecWalletState = Object.freeze({
  address: null,
  error: null,
});

function hasRequestMethod(value: unknown): value is ZecJsonRpcProvider {
  return typeof value === "object" && value !== null
    && typeof (value as { request?: unknown }).request === "function";
}

export function detectZecWalletProvider(scope: unknown): ZecJsonRpcProvider | null {
  if (typeof scope !== "object" || scope === null) return null;
  const injected = (scope as { zcash?: unknown }).zcash;
  return hasRequestMethod(injected) ? injected : null;
}

/**
 * Keep only accounts the parser accepts as transparent mainnet P2PKH and
 * return them in the canonical `zcash:mainnet:<address>` form. Wallets
 * report bare `t1...` addresses; canonical account URIs are accepted too.
 * Shielded, TEX, testnet, and malformed entries are dropped rather than
 * surfaced: the settlement scope is transparent ZEC mainnet only.
 */
export function canonicalTransparentAddresses(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  for (const value of values) {
    if (typeof value !== "string") continue;
    try {
      if (value.startsWith("zcash:")) {
        const decoded = decodeZcashTransparentAccount(value);
        if (decoded.environment !== "mainnet" || decoded.kind !== "p2pkh") continue;
        seen.add(value);
        continue;
      }
      const decoded = decodeAddress(value);
      if (decoded.network !== "mainnet" || decoded.kind !== "p2pkh") continue;
      seen.add(canonicalZcashTransparentAccount("mainnet", value));
    } catch {
      // Not a transparent mainnet P2PKH address; skip it.
    }
  }
  return [...seen];
}

function firstAddress(values: unknown): string | null {
  const addresses = canonicalTransparentAddresses(values);
  return addresses.length > 0 ? addresses[0] : null;
}

function providerErrorCode(error: unknown): unknown {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  return (error as { code?: unknown }).code;
}

export function publicZecConnectionError(error: unknown): string {
  if (providerErrorCode(error) === 4001 || providerErrorCode(error) === "4001") {
    return "ZEC wallet request was rejected.";
  }
  if (providerErrorCode(error) === -32002 || providerErrorCode(error) === "-32002") {
    return "A ZEC wallet request is already pending.";
  }
  return "ZEC wallet connection failed.";
}

export function publicZecSigningError(error: unknown): string {
  if (providerErrorCode(error) === 4001 || providerErrorCode(error) === "4001") {
    return "ZEC wallet signature request was rejected.";
  }
  return "ZEC wallet signing failed.";
}

export async function connectZecWallet(
  provider: ZecJsonRpcProvider,
): Promise<ZecWalletState> {
  let accounts: unknown;
  try {
    accounts = await provider.request({ method: ZEC_RPC_METHODS.requestAccounts });
  } catch (error: unknown) {
    // Some wallets only expose a read-only accounts listing without an
    // interactive grant; fall back to it before giving up.
    try {
      accounts = await provider.request({ method: ZEC_RPC_METHODS.accounts });
    } catch {
      return { ...disconnectedZecWallet, error: publicZecConnectionError(error) };
    }
  }
  const address = firstAddress(accounts);
  if (!address) {
    return {
      ...disconnectedZecWallet,
      error: "The wallet returned no transparent ZEC mainnet address.",
    };
  }
  return Object.freeze({ address, error: null });
}

/**
 * Ask the wallet to sign a fixed challenge so the adapter can assert
 * source-address control. The signature is verified out of band by the
 * qualification reviewer, not parsed here; this call only proves the
 * wallet is present, unlocked, and willing to sign for the account.
 */
export async function proveSourceAddressControl(
  provider: ZecJsonRpcProvider,
  address: string,
  challenge: string,
): Promise<Readonly<{ signature: string } | { error: string }>> {
  assertZcashTransparentP2pkhAccount(address, "mainnet");
  if (!/^[ -~]{16,512}$/.test(challenge)) {
    return { error: "Challenge is not printable ASCII within the accepted length." };
  }
  try {
    const signature = await provider.request({
      method: ZEC_RPC_METHODS.signMessage,
      params: { account: address, message: challenge },
    });
    if (typeof signature !== "string" || signature.length === 0) {
      return { error: "The wallet did not return a signature." };
    }
    return Object.freeze({ signature });
  } catch (error: unknown) {
    return { error: publicZecSigningError(error) };
  }
}
