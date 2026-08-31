export const SEPOLIA_CHAIN_ID = 421614;

export type SepoliaManifest = {
  network: "arbitrum-sepolia";
  chainId: number;
  commit: string;
  deployed: boolean;
  label: string;
  broadcastTx: string | null;
  contracts: {
    Zec: string | null;
    TUsdc: string | null;
    TUsdt: string | null;
    Settlement: string | null;
    Factory: string | null;
    ZecUsdcPair: string | null;
    ZecUsdtPair: string | null;
    Router: string | null;
  };
};

export type FoundryBroadcast = {
  chain?: number;
  receipts?: Array<{ transactionHash?: string; contractAddress?: string }>;
  transactions?: Array<{
    contractName?: string;
    contractAddress?: string;
    hash?: string;
    transactionType?: string;
    additionalContracts?: Array<{ contractName?: string; address?: string }>;
  }>;
};

const ZERO = "0x0000000000000000000000000000000000000000";
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const TX = /^0x[0-9a-fA-F]{64}$/;

export function emptyManifest(commit = "UNDEPLOYED"): SepoliaManifest {
  return {
    network: "arbitrum-sepolia",
    chainId: SEPOLIA_CHAIN_ID,
    commit,
    deployed: false,
    label: "no-value Arbitrum Sepolia only",
    broadcastTx: null,
    contracts: {
      Zec: null,
      TUsdc: null,
      TUsdt: null,
      Settlement: null,
      Factory: null,
      ZecUsdcPair: null,
      ZecUsdtPair: null,
      Router: null,
    },
  };
}

export function isOnchainAddress(value: string | null | undefined): value is string {
  return typeof value === "string" && ADDRESS.test(value) && value.toLowerCase() !== ZERO;
}

export function recordBroadcast(
  current: SepoliaManifest,
  broadcast: FoundryBroadcast,
  options: { commit?: string; markDeployed?: boolean } = {},
): SepoliaManifest {
  if (broadcast.chain !== undefined && broadcast.chain !== SEPOLIA_CHAIN_ID) {
    throw new Error("Broadcast is not Arbitrum Sepolia (421614)");
  }

  const next = emptyManifest(options.commit ?? current.commit);
  next.contracts = { ...current.contracts };
  const creates = broadcast.transactions ?? [];
  for (const tx of creates) {
    const name = tx.contractName;
    const address = tx.contractAddress;
    if (name && isOnchainAddress(address) && name in next.contracts) {
      next.contracts[name as keyof SepoliaManifest["contracts"]] = address;
    }
    for (const extra of tx.additionalContracts ?? []) {
      if (extra.contractName === "Pair" && isOnchainAddress(extra.address)) {
        if (!next.contracts.ZecUsdcPair) next.contracts.ZecUsdcPair = extra.address;
        else next.contracts.ZecUsdtPair = extra.address;
      }
    }
  }

  const hash = creates.find((tx) => tx.hash && TX.test(tx.hash))?.hash
    ?? broadcast.receipts?.find((receipt) => receipt.transactionHash && TX.test(receipt.transactionHash))?.transactionHash
    ?? null;
  next.broadcastTx = hash;
  next.deployed = false;
  if (options.markDeployed) {
    if (!hash) {
      throw new Error("Cannot mark deployed without a real transaction hash");
    }
    next.deployed = true;
  }
  return next;
}
