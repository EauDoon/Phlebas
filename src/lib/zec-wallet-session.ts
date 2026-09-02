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
  connectZecWallet,
  proveSourceAddressControl,
  ZEC_RPC_METHODS,
  type ZecJsonRpcProvider,
  type ZecWalletState,
} from "./zec-wallet-provider.ts";

export const ZEC_WALLET_ADAPTER_ID = "phlebas-injected-zec";
export const ZEC_WALLET_ADAPTER_VERSION = "1.0.0";

export type ObservedZecWalletCapabilities = Readonly<{
  /** The wallet can produce a signature for the connected account. */
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
  sourceAddressControl: true,
  pcztVersions: Object.freeze<(1 | 2)[]>([1, 2]),
  arbitraryP2shFundingOutputs: true,
  arbitraryP2shSpendingInputs: true,
  exactLocktime: true,
  transactionExtraction: false,
  broadcast: false,
  keylessRecoveryExport: false,
});

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
  options: { challenge: string; observed?: ObservedZecWalletCapabilities } = { challenge: "" },
): Promise<ZecWalletSession> {
  const state = await connectZecWallet(provider);
  if (!state.address) {
    return Object.freeze({ ...disconnectedZecSession, state });
  }

  const observed = options.observed ?? DEFAULT_OBSERVED_CAPABILITIES;
  let statement: TransparentZecMainnetWalletCapabilityStatement;
  try {
    statement = zecCapabilityStatementFromObserved(observed);
  } catch (error: unknown) {
    return Object.freeze({
      ...disconnectedZecSession,
      state: { address: state.address, error: error instanceof Error ? error.message : "Capability statement rejected" },
    });
  }

  const assessment = assessTransparentZecMainnetWalletCapabilityStatement(statement);

  let addressControlSignature: string | null = null;
  if (observed.sourceAddressControl) {
    const proof = await proveSourceAddressControl(provider, state.address, options.challenge);
    if ("error" in proof) {
      return Object.freeze({
        state: { address: state.address, error: proof.error },
        statement,
        assessment,
        addressControlSignature: null,
      });
    }
    addressControlSignature = proof.signature;
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
