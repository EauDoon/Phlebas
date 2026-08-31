// Zcash network guard. The project defaults to testnet because the
// production target is a local Anvil or testnet; the guard exists so
// the matcher, the wallet adapter, and the UI can fail closed if a
// caller asks for a network that the project has not approved.

import type { ZcashNetwork } from "./zcash-address.ts";

const APPROVED_NETWORKS: ReadonlySet<ZcashNetwork> = new Set(["testnet", "mainnet"]);

export function isApprovedNetwork(value: string): value is ZcashNetwork {
  return APPROVED_NETWORKS.has(value as ZcashNetwork);
}

export function assertNetwork(value: string): ZcashNetwork {
  if (!isApprovedNetwork(value)) {
    throw new RangeError(`Zcash network is not approved: ${value}`);
  }
  return value;
}

export const DEFAULT_NETWORK: ZcashNetwork = "testnet";
