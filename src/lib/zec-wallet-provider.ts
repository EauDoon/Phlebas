// Discovery and typed access for an injected transparent-ZEC wallet provider.
//
// Zcash browser wallets do not yet share an EIP-6963-style discovery
// standard. This candidate adapter detects `window.zcash` with a JSON-RPC
// `request` and accepts an explicit provider; these names do not establish
// a shipped wallet standard or qualified compatibility. Everything
// here is fail-closed: a provider that answers wrongly is treated as
// absent or disconnected, never as connected.

import { verifyZcashTransparentSignedMessage } from "./zcash-signed-message.ts";
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

function isUnsupportedMethodError(error: unknown): boolean {
  const code = providerErrorCode(error);
  // JSON-RPC -32601 and EIP-1193 4200 both explicitly mean unsupported.
  return code === -32601 || code === "-32601" || code === 4200 || code === "4200";
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

// An AbortSignal prevents fallback and later provider requests. Injected
// wallet promises have no cancellation contract, so an already-issued
// request may still settle; callers must discard that result.
export async function connectZecWallet(
  provider: ZecJsonRpcProvider,
  signal?: AbortSignal,
): Promise<ZecWalletState> {
  if (signal?.aborted) return disconnectedZecWallet;
  let accounts: unknown;
  try {
    accounts = await provider.request({ method: ZEC_RPC_METHODS.requestAccounts });
  } catch (error: unknown) {
    if (signal?.aborted) return disconnectedZecWallet;
    if (!isUnsupportedMethodError(error)) {
      return { ...disconnectedZecWallet, error: publicZecConnectionError(error) };
    }
    // Some wallets expose only a read-only accounts listing. Fall back only
    // when the interactive method explicitly reports that it is unsupported;
    // a user rejection or pending request must never turn into a connection.
    try {
      accounts = await provider.request({ method: ZEC_RPC_METHODS.accounts });
    } catch (fallbackError: unknown) {
      if (signal?.aborted) return disconnectedZecWallet;
      return { ...disconnectedZecWallet, error: publicZecConnectionError(fallbackError) };
    }
  }
  if (signal?.aborted) return disconnectedZecWallet;
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
 * Ask the wallet to sign the supplied challenge and verify its zcashd-format
 * compact signature against the requested account. Challenge freshness and
 * session binding belong to the caller. A valid proof does not qualify the
 * wallet or authorize any transaction action.
 */
export async function proveSourceAddressControl(
  provider: ZecJsonRpcProvider,
  address: string,
  challenge: string,
): Promise<Readonly<{ signature: string } | { error: string }>> {
  assertZcashTransparentP2pkhAccount(address, "mainnet");
  if (typeof challenge !== "string" || challenge.length > 512 || !/^[ -~]{16,512}$/.test(challenge)) {
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
    if (!verifyZcashTransparentSignedMessage(address, challenge, signature)) {
      return { error: "The wallet signature does not verify for this ZEC account and challenge." };
    }
    return Object.freeze({ signature });
  } catch (error: unknown) {
    return { error: publicZecSigningError(error) };
  }
}
