import {
  emptyDepositLedger,
  issueDepositIntent,
  paymentRequestFor,
  type DepositIntent,
  type DepositLedger,
} from "../../src/lib/deposit-intent.ts";
import { SYNTHETIC_DEPOSIT_ZATOSHIS } from "../../src/lib/zip321.ts";

import { bytesToHex, hexToBytes } from "../../src/lib/keccak.ts";
import { deriveTestnetChildKey, p2pkhHashFromPrivateKey } from "./keys.ts";

export type GatewayState = {
  master: Uint8Array;
  sequence: number;
  ledger: DepositLedger;
};

export type GatewaySnapshot = {
  sequence: number;
  intents: DepositIntent[];
};

export function createGateway(
  master: Uint8Array,
  snapshot: GatewaySnapshot = { sequence: 0, intents: [] },
): GatewayState {
  if (master.length !== 32) throw new Error("Gateway master key must be exactly 32 bytes");
  if (!Number.isSafeInteger(snapshot.sequence) || snapshot.sequence < 0 || !Array.isArray(snapshot.intents)) {
    throw new Error("Invalid gateway snapshot");
  }
  if (snapshot.sequence !== snapshot.intents.length) {
    throw new Error("Gateway sequence does not match its durable intent ledger");
  }
  const ledger = emptyDepositLedger();
  snapshot.intents.forEach((intent, index) => {
    if (
      !intent
      || intent.id !== `tex-testnet-${index + 1}`
      || intent.network !== "testnet"
      || typeof intent.tex !== "string"
      || typeof intent.p2pkhHashHex !== "string"
      || typeof intent.amountZatoshis !== "string"
      || typeof intent.createdAt !== "string"
    ) {
      throw new Error("Invalid durable deposit intent");
    }
    const expectedHash = bytesToHex(p2pkhHashFromPrivateKey(deriveTestnetChildKey(master, index)));
    if (intent.p2pkhHashHex !== expectedHash) {
      throw new Error("Durable deposit intent does not match the gateway master key");
    }
    const restored = issueDepositIntent(ledger, {
      id: intent.id,
      payload: hexToBytes(intent.p2pkhHashHex),
      amountZatoshis: BigInt(intent.amountZatoshis),
      createdAt: intent.createdAt,
    });
    if (restored.tex !== intent.tex) throw new Error("Durable TEX mapping is inconsistent");
  });
  return { master, sequence: snapshot.sequence, ledger };
}

export function snapshotGateway(state: GatewayState): GatewaySnapshot {
  return { sequence: state.sequence, intents: [...state.ledger.byId.values()] };
}

export function issueTestnetIntent(
  state: GatewayState,
  amountZatoshis: bigint = SYNTHETIC_DEPOSIT_ZATOSHIS,
): DepositIntent & { request: string } {
  if (!Number.isSafeInteger(state.sequence) || state.sequence < 0) {
    throw new RangeError("Gateway sequence is outside the supported range");
  }
  const id = `tex-testnet-${state.sequence + 1}`;
  const privateKey = deriveTestnetChildKey(state.master, state.sequence);
  const payload = p2pkhHashFromPrivateKey(privateKey);
  const intent = issueDepositIntent(state.ledger, { id, payload, amountZatoshis });
  state.sequence += 1;
  return { ...intent, request: paymentRequestFor(intent) };
}
