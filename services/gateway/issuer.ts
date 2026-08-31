import {
  emptyDepositLedger,
  issueDepositIntent,
  paymentRequestFor,
  type DepositIntent,
  type DepositLedger,
} from "../../src/lib/deposit-intent.ts";
import { SYNTHETIC_DEPOSIT_ZATOSHIS } from "../../src/lib/zip321.ts";

import { deriveTestnetChildKey, p2pkhHashFromPrivateKey } from "./keys.ts";

export type GatewayState = {
  master: Uint8Array;
  sequence: number;
  ledger: DepositLedger;
};

export function createGateway(master: Uint8Array): GatewayState {
  return { master, sequence: 0, ledger: emptyDepositLedger() };
}

export function issueTestnetIntent(
  state: GatewayState,
  amountZatoshis: bigint = SYNTHETIC_DEPOSIT_ZATOSHIS,
): DepositIntent & { request: string } {
  const id = `tex-testnet-${state.sequence + 1}`;
  const privateKey = deriveTestnetChildKey(state.master, state.sequence);
  const payload = p2pkhHashFromPrivateKey(privateKey);
  const intent = issueDepositIntent(state.ledger, { id, payload, amountZatoshis });
  state.sequence += 1;
  return { ...intent, request: paymentRequestFor(intent) };
}
