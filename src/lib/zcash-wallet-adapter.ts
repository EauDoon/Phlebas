// Legacy synthetic display shapes only. These values are not canonical Zcash
// transactions, are not wallet inputs, and must never be signed or broadcast.

import { buildAtomicSwapScript, type AtomicSwapParams } from "./zcash-atomic-swap.ts";

export const LEGACY_ZCASH_SHAPE_BOUNDARY = "legacy-synthetic-incomplete-shape-not-a-zcash-transaction" as const;

export type LegacySyntheticTransactionShape = Readonly<{
  boundary: typeof LEGACY_ZCASH_SHAPE_BOUNDARY;
  transactionIdState: "unresolved";
  version: 4;
  lockTime: number;
  inputs: ReadonlyArray<LegacySyntheticInput>;
  outputs: ReadonlyArray<LegacySyntheticOutput>;
}>;

export type LegacySyntheticInput = Readonly<{
  prevTxid: string;
  prevVout: number;
  scriptSig: Uint8Array;
  sequence: number;
}>;

export type LegacySyntheticOutput = Readonly<{
  valueZat: bigint;
  scriptPubKey: Uint8Array;
}>;

export type BuildFundParams = Readonly<{
  fundOutput: LegacySyntheticOutput;
  changeOutput: LegacySyntheticOutput;
  lockTime: number;
}>;

export type BuildClaimParams = Readonly<{
  utxo: Readonly<{ txid: string; vout: number; valueZat: bigint; scriptPubKey: Uint8Array }>;
  preimage: Uint8Array;
  recipientOutput: LegacySyntheticOutput;
  changeOutput: LegacySyntheticOutput;
  sequence: number;
}>;

export type BuildRefundParams = Readonly<{
  utxo: Readonly<{ txid: string; vout: number; valueZat: bigint; scriptPubKey: Uint8Array }>;
  recipientOutput: LegacySyntheticOutput;
  changeOutput: LegacySyntheticOutput;
  sequence: number;
}>;

export function previewLegacyFundShape(params: BuildFundParams): LegacySyntheticTransactionShape {
  return {
    boundary: LEGACY_ZCASH_SHAPE_BOUNDARY,
    transactionIdState: "unresolved",
    version: 4,
    lockTime: params.lockTime,
    inputs: [],
    outputs: [params.fundOutput, params.changeOutput],
  };
}

export function previewLegacyClaimShape(params: BuildClaimParams): LegacySyntheticTransactionShape {
  return {
    boundary: LEGACY_ZCASH_SHAPE_BOUNDARY,
    transactionIdState: "unresolved",
    version: 4,
    lockTime: 0,
    inputs: [
      {
        prevTxid: params.utxo.txid,
        prevVout: params.utxo.vout,
        scriptSig: params.preimage,
        sequence: params.sequence,
      },
    ],
    outputs: [params.recipientOutput, params.changeOutput],
  };
}

export function previewLegacyRefundShape(params: BuildRefundParams): LegacySyntheticTransactionShape {
  return {
    boundary: LEGACY_ZCASH_SHAPE_BOUNDARY,
    transactionIdState: "unresolved",
    version: 4,
    lockTime: 0,
    inputs: [
      {
        prevTxid: params.utxo.txid,
        prevVout: params.utxo.vout,
        scriptSig: new Uint8Array(0),
        sequence: params.sequence,
      },
    ],
    outputs: [params.recipientOutput, params.changeOutput],
  };
}

export function legacyAtomicSwapScriptHex(params: AtomicSwapParams): string {
  const script = buildAtomicSwapScript(params);
  let hex = "0x";
  for (let i = 0; i < script.length; i++) hex += script[i].toString(16).padStart(2, "0");
  return hex;
}
