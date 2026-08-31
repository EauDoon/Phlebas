export const SEPOLIA_CHAIN_ID = 421614;

export type SepoliaManifest = {
  network: "arbitrum-sepolia";
  chainId: number;
  commit: string;
  deployed: boolean;
  label: string;
  broadcastTx: string | null;
  contracts: {
    PZec: string | null;
    TUsdc: string | null;
    TUsdt0: string | null;
    Settlement: string | null;
    Factory: string | null;
    PzecUsdcPair: string | null;
    PzecUsdt0Pair: string | null;
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
      PZec: null,
      TUsdc: null,
      TUsdt0: null,
      Settlement: null,
      Factory: null,
      PzecUsdcPair: null,
      PzecUsdt0Pair: null,
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
  if (broadcast.chain !== SEPOLIA_CHAIN_ID) {
    throw new Error("Broadcast is not Arbitrum Sepolia (421614)");
  }

  const next = emptyManifest(options.commit ?? current.commit);
  const creates = broadcast.transactions ?? [];
  const quoteTokens: string[] = [];
  const pairs: string[] = [];
  const appendUnique = (values: string[], value: string | null | undefined) => {
    if (isOnchainAddress(value) && !values.includes(value)) values.push(value);
  };
  for (const tx of creates) {
    const name = tx.contractName;
    const address = tx.contractAddress;
    if (tx.transactionType === "CREATE" && name && isOnchainAddress(address) && name in next.contracts) {
      next.contracts[name as keyof SepoliaManifest["contracts"]] = address;
    }
    if (tx.transactionType === "CREATE" && name === "QuoteToken") appendUnique(quoteTokens, address);
    if (tx.transactionType === "CREATE" && name === "Pair") appendUnique(pairs, address);
    for (const extra of tx.additionalContracts ?? []) {
      if (extra.contractName === "Pair") appendUnique(pairs, extra.address);
    }
  }
  next.contracts.TUsdc = quoteTokens[0] ?? null;
  next.contracts.TUsdt0 = quoteTokens[1] ?? null;
  next.contracts.PzecUsdcPair = pairs[0] ?? null;
  next.contracts.PzecUsdt0Pair = pairs[1] ?? null;

  const hash = creates.find((tx) => tx.hash && TX.test(tx.hash))?.hash
    ?? broadcast.receipts?.find((receipt) => receipt.transactionHash && TX.test(receipt.transactionHash))?.transactionHash
    ?? null;
  next.broadcastTx = hash;
  next.deployed = false;
  if (options.markDeployed) {
    if (!hash) {
      throw new Error("Cannot mark deployed without a real transaction hash");
    }
    if (!Object.values(next.contracts).every(isOnchainAddress)) {
      throw new Error("Cannot mark deployed without every contract address");
    }
    if (!/^[0-9a-f]{7,40}$/i.test(next.commit)) {
      throw new Error("Cannot mark deployed without the deployed git commit");
    }
    next.deployed = true;
  }
  return next;
}
