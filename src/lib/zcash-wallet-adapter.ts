// Zcash wallet adapter surface. The matcher and the UI call into this
// adapter without holding a Zcash spend key. The adapter returns an
// unsigned transaction and a transaction id. The signing surface is an
// injected callback that the production code wires to a real wallet;
// the test code wires to a deterministic in-memory signer.
//
// No signing happens in this PR. The adapter surface is the seam where
// the Zallet or another Zcash wallet will be wired in a later PR.

import { buildAtomicSwapScript, type AtomicSwapParams } from "./zcash-atomic-swap.ts";

export type Signer = (digest: Uint8Array) => Promise<Uint8Array>;

export type UnsignedTransaction = Readonly<{
  txid: string;
  version: 4;
  lockTime: number;
  inputs: ReadonlyArray<UnsignedInput>;
  outputs: ReadonlyArray<UnsignedOutput>;
}>;

export type UnsignedInput = Readonly<{
  prevTxid: string;
  prevVout: number;
  scriptSig: Uint8Array;
  sequence: number;
}>;

export type UnsignedOutput = Readonly<{
  valueZat: bigint;
  scriptPubKey: Uint8Array;
}>;

export type BuildFundParams = Readonly<{
  fundOutput: UnsignedOutput;
  changeOutput: UnsignedOutput;
  lockTime: number;
}>;

export type BuildClaimParams = Readonly<{
  utxo: Readonly<{ txid: string; vout: number; valueZat: bigint; scriptPubKey: Uint8Array }>;
  preimage: Uint8Array;
  recipientOutput: UnsignedOutput;
  changeOutput: UnsignedOutput;
  sequence: number;
}>;

export type BuildRefundParams = Readonly<{
  utxo: Readonly<{ txid: string; vout: number; valueZat: bigint; scriptPubKey: Uint8Array }>;
  recipientOutput: UnsignedOutput;
  changeOutput: UnsignedOutput;
  sequence: number;
}>;

export function buildFundTransaction(params: BuildFundParams): UnsignedTransaction {
  return {
    txid: "",
    version: 4,
    lockTime: params.lockTime,
    inputs: [],
    outputs: [params.fundOutput, params.changeOutput],
  };
}

export function buildClaimTransaction(params: BuildClaimParams): UnsignedTransaction {
  return {
    txid: "",
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

export function buildRefundTransaction(params: BuildRefundParams): UnsignedTransaction {
  return {
    txid: "",
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

export function hashAtomicSwapParams(params: AtomicSwapParams): string {
  const script = buildAtomicSwapScript(params);
  let hex = "0x";
  for (let i = 0; i < script.length; i++) hex += script[i].toString(16).padStart(2, "0");
  return hex;
}
