import { encodeTex, isTestnetTex, texPayloadHex } from "./tex.ts";
import { buildZip321Uri, formatZip321Amount } from "./zip321.ts";

export type DepositIntent = {
  id: string;
  network: "testnet";
  tex: string;
  p2pkhHashHex: string;
  amountZatoshis: string;
  createdAt: string;
};

export type DepositLedger = {
  byId: Map<string, DepositIntent>;
  byHash: Map<string, string>;
  byTex: Map<string, string>;
};

export function emptyDepositLedger(): DepositLedger {
  return { byId: new Map(), byHash: new Map(), byTex: new Map() };
}

export function issueDepositIntent(
  ledger: DepositLedger,
  options: {
    id: string;
    payload: Uint8Array;
    amountZatoshis: bigint;
    createdAt?: string;
  },
): DepositIntent {
  formatZip321Amount(options.amountZatoshis);
  if (ledger.byId.has(options.id)) {
    throw new Error("Deposit intent id is already assigned");
  }
  const tex = encodeTex(options.payload, "testnet");
  const p2pkhHashHex = texPayloadHex(tex);
  if (ledger.byHash.has(p2pkhHashHex) || ledger.byTex.has(tex)) {
    throw new Error("Deposit receiver is already assigned");
  }
  if (!isTestnetTex(tex)) {
    throw new Error("Issued address is not testnet TEX");
  }
  const intent: DepositIntent = {
    id: options.id,
    network: "testnet",
    tex,
    p2pkhHashHex,
    amountZatoshis: options.amountZatoshis.toString(),
    createdAt: options.createdAt ?? new Date().toISOString(),
  };
  ledger.byId.set(intent.id, intent);
  ledger.byHash.set(intent.p2pkhHashHex, intent.id);
  ledger.byTex.set(intent.tex, intent.id);
  return intent;
}

export function paymentRequestFor(intent: DepositIntent): string {
  return buildZip321Uri({
    address: intent.tex,
    amountZatoshis: BigInt(intent.amountZatoshis),
  });
}
