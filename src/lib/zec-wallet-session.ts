// Connect flow for a transparent-ZEC wallet: connect, prove source-address
// control, and assemble a capability statement from what the wallet
// actually reports. The statement is validated with the same strict parser
// every other surface uses, and the assessment stays fail-closed: a valid
// statement is still unqualified for network actions until a separate
// qualification receipt exists. Connecting a wallet never enables
// extraction or broadcast on its own.

import {
  assessTransparentZecMainnetWalletCapabilityStatement,
  NETWORK_ACTION_DISABLED_PENDING_QUALIFICATION,
  parseTransparentZecMainnetWalletCapabilityStatement,
  QUALIFICATION_RECEIPT_REQUIREMENT,
  TRANSPARENT_ZEC_MAINNET_WALLET_CAPABILITY_SCHEMA,
  UNVERIFIED_WALLET_CAPABILITY_ASSERTION,
  type TransparentZecMainnetWalletCapabilityStatement,
  type UnqualifiedWalletCapabilityAssessment,
} from "./zcash-wallet-capabilities.ts";
import {
  canonicalTransparentAddresses,
  connectZecWallet,
  proveSourceAddressControl,
  ZEC_RPC_METHODS,
  type ZecJsonRpcProvider,
  type ZecWalletState,
} from "./zec-wallet-provider.ts";

export const ZEC_WALLET_ADAPTER_ID = "phlebas-injected-zec";
export const ZEC_WALLET_ADAPTER_VERSION = "1.0.0";

export type ObservedZecWalletCapabilities = Readonly<{
  /** A challenge signature verified locally for the connected account. */
  sourceAddressControl: boolean;
  /** ZIP 374 PCZT versions the wallet says it can consume. */
  pcztVersions: readonly (1 | 2)[];
  /** The wallet can fund an output to an arbitrary P2SH script. */
  arbitraryP2shFundingOutputs: boolean;
  /** The wallet can spend inputs of an arbitrary P2SH script. */
  arbitraryP2shSpendingInputs: boolean;
  /** The wallet lets the caller set an exact locktime. */
  exactLocktime: boolean;
  /** The wallet can extract a fully signed transaction for inspection. */
  transactionExtraction: boolean;
  /** The wallet can broadcast a transaction itself. */
  broadcast: boolean;
  /** The wallet can export signed artifacts without key material. */
  keylessRecoveryExport: boolean;
}>;

export type ZecWalletSession = Readonly<{
  state: ZecWalletState;
  statement: TransparentZecMainnetWalletCapabilityStatement | null;
  assessment: UnqualifiedWalletCapabilityAssessment | null;
  addressControlSignature: string | null;
}>;

export const disconnectedZecSession: ZecWalletSession = Object.freeze({
  state: Object.freeze({ address: null, error: null }),
  statement: null,
  assessment: null,
  addressControlSignature: null,
});

const DEFAULT_OBSERVED_CAPABILITIES: ObservedZecWalletCapabilities = Object.freeze({
  sourceAddressControl: false,
  pcztVersions: Object.freeze<(1 | 2)[]>([]),
  arbitraryP2shFundingOutputs: false,
  arbitraryP2shSpendingInputs: false,
  exactLocktime: false,
  transactionExtraction: false,
  broadcast: false,
  keylessRecoveryExport: false,
});

const ZEC_ACCOUNT_REVALIDATION_ERROR = "ZEC wallet account could not be revalidated.";

/**
 * Defaults describe only what the connect flow itself demonstrated: a
 * provider that answered `zcash_requestAccounts` and returned a valid
 * transparent mainnet P2PKH account has, at most, shown up. Everything a
 * connect flow cannot observe on its own (PCZT, P2SH funding/spending,
 * extraction, broadcast) is declared false so the statement can only
 * widen after the wallet explicitly reports the capability.
 */
export function zecCapabilityStatementFromObserved(
  observed: ObservedZecWalletCapabilities = DEFAULT_OBSERVED_CAPABILITIES,
): TransparentZecMainnetWalletCapabilityStatement {
  return parseTransparentZecMainnetWalletCapabilityStatement({
    schema: TRANSPARENT_ZEC_MAINNET_WALLET_CAPABILITY_SCHEMA,
    network: "mainnet",
    asset: "ZEC",
    addressScope: "transparent-p2pkh",
    adapter: {
      id: ZEC_WALLET_ADAPTER_ID,
      version: ZEC_WALLET_ADAPTER_VERSION,
    },
    assertion: UNVERIFIED_WALLET_CAPABILITY_ASSERTION,
    capabilities: {
      sourceAddressControl: {
        supported: observed.sourceAddressControl,
        proofMethod: observed.sourceAddressControl ? "transparent-message-signature" : "none",
      },
      pczt: { supportedVersions: [...observed.pcztVersions] },
      arbitraryP2sh: {
        fundingOutputs: observed.arbitraryP2shFundingOutputs,
        spendingInputs: observed.arbitraryP2shSpendingInputs,
      },
      exactLocktime: { supported: observed.exactLocktime },
      transactionExtraction: { supported: observed.transactionExtraction },
      broadcast: { supported: observed.broadcast },
      recoveryExport: {
        supported: observed.keylessRecoveryExport,
        format: observed.keylessRecoveryExport ? "signed-artifacts-without-keys" : "none",
        includesKeyMaterial: false,
      },
    },
    networkActionPolicy: {
      transactionExtraction: NETWORK_ACTION_DISABLED_PENDING_QUALIFICATION,
      broadcast: NETWORK_ACTION_DISABLED_PENDING_QUALIFICATION,
      qualificationReceipt: QUALIFICATION_RECEIPT_REQUIREMENT,
    },
  });
}

export async function connectZecWalletSession(
  provider: ZecJsonRpcProvider,
  options: { challenge: string; observed?: ObservedZecWalletCapabilities; signal?: AbortSignal } = { challenge: "" },
): Promise<ZecWalletSession> {
  const { challenge, observed: observedOverride, signal } = options;
  const requestedObserved: ObservedZecWalletCapabilities = observedOverride
    ? { ...observedOverride, pcztVersions: [...observedOverride.pcztVersions] }
    : {
      ...DEFAULT_OBSERVED_CAPABILITIES,
      // The default connect path attempts the one proof this flow can
      // perform. The result below, not this request flag, determines whether
      // source-address control is declared supported.
      sourceAddressControl: true,
    };

  const state = await connectZecWallet(provider, signal);
  if (signal?.aborted) return disconnectedZecSession;
  if (!state.address) {
    return Object.freeze({ ...disconnectedZecSession, state });
  }

  // sourceAddressControl is the one capability this connect flow can
  // actually exercise, by asking the wallet to sign the challenge right
  // here. The statement must record what that attempt showed, not what the
  // caller assumed going in: a wallet that fails or refuses the challenge
  // must not be declared as supporting the capability it just failed to
  // demonstrate. (A prior version trusted `requestedObserved` unconditionally,
  // so a wallet that could not sign at all still passed sourceAddressControl.)
  let addressControlSignature: string | null = null;
  let addressControlError: string | null = null;
  if (requestedObserved.sourceAddressControl) {
    if (signal?.aborted) return disconnectedZecSession;
    const proof = await proveSourceAddressControl(provider, state.address, challenge);
    if (signal?.aborted) return disconnectedZecSession;
    if ("error" in proof) {
      addressControlError = proof.error;
    } else {
      addressControlSignature = proof.signature;
      // A wallet can switch accounts while the signing request is open.
      // Re-read the selected account before declaring the proof usable.
      let currentAccounts: unknown;
      try {
        currentAccounts = await provider.request({ method: ZEC_RPC_METHODS.accounts });
      } catch {
        if (signal?.aborted) return disconnectedZecSession;
        return Object.freeze({
          ...disconnectedZecSession,
          state: Object.freeze({ address: null, error: ZEC_ACCOUNT_REVALIDATION_ERROR }),
        });
      }
      if (signal?.aborted) return disconnectedZecSession;
      if ((canonicalTransparentAddresses(currentAccounts)[0] ?? null) !== state.address) {
        return Object.freeze({
          ...disconnectedZecSession,
          state: Object.freeze({ address: null, error: ZEC_ACCOUNT_REVALIDATION_ERROR }),
        });
      }
    }
  }
  const observed: ObservedZecWalletCapabilities = {
    ...requestedObserved,
    sourceAddressControl: addressControlSignature !== null,
  };

  let statement: TransparentZecMainnetWalletCapabilityStatement;
  try {
    statement = zecCapabilityStatementFromObserved(observed);
  } catch (error: unknown) {
    // A capability statement that fails to parse was never validly
    // declared. Treat the session as fully disconnected rather than
    // keeping the address: an address with no statement is a wallet the
    // caller cannot reason about, which is exactly the "connected but
    // unqualified" confusion this module exists to prevent.
    return Object.freeze({
      ...disconnectedZecSession,
      state: { address: null, error: error instanceof Error ? error.message : "Capability statement rejected" },
    });
  }

  const assessment = assessTransparentZecMainnetWalletCapabilityStatement(statement);

  if (addressControlError) {
    return Object.freeze({
      state: { address: state.address, error: addressControlError },
      statement,
      assessment,
      addressControlSignature: null,
    });
  }

  return Object.freeze({
    state: Object.freeze({ address: state.address, error: null }),
    statement,
    assessment,
    addressControlSignature,
  });
}

export { ZEC_RPC_METHODS };
export type { ZecJsonRpcProvider };
