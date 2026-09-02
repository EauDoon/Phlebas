// Ethereum Mainnet settlement deployment record. Mainnet deploys only the
// Settlement CLOB contract: real USDC and USDT already exist on chain, and
// the historical AMM surfaces (Factory, Router, mock tokens) deliberately
// do not ship here. The manifest stays deployed: false until a real,
// successful mainnet transaction is recorded and its on-chain bytecode is
// verified against the local broadcast artifacts.

export const ETHEREUM_MAINNET_CHAIN_ID = 1;

export type MainnetManifest = {
  network: "ethereum-mainnet";
  chainId: number;
  commit: string;
  deployed: boolean;
  label: string;
  broadcastTx: string | null;
  contracts: {
    Settlement: string | null;
  };
};

export type FoundryBroadcast = {
  chain?: number;
  receipts?: Array<{ transactionHash?: string; contractAddress?: string; status?: string | number }>;
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

export function emptyManifest(commit = "UNDEPLOYED"): MainnetManifest {
  return {
    network: "ethereum-mainnet",
    chainId: ETHEREUM_MAINNET_CHAIN_ID,
    commit,
    deployed: false,
    label: "Ethereum Mainnet settlement",
    broadcastTx: null,
    contracts: {
      Settlement: null,
    },
  };
}

export function isOnchainAddress(value: string | null | undefined): value is string {
  return typeof value === "string" && ADDRESS.test(value) && value.toLowerCase() !== ZERO;
}

export function recordBroadcast(
  current: MainnetManifest,
  broadcast: FoundryBroadcast,
  options: { commit?: string; markDeployed?: boolean; deployedCode?: Record<string, string> } = {},
): MainnetManifest {
  if (broadcast.chain !== ETHEREUM_MAINNET_CHAIN_ID) {
    throw new Error("Broadcast is not Ethereum Mainnet (1)");
  }

  const next = emptyManifest(options.commit ?? current.commit);
  const creates = broadcast.transactions ?? [];
  for (const tx of creates) {
    const name = tx.contractName;
    const address = tx.contractAddress;
    if (tx.transactionType === "CREATE" && name === "Settlement" && isOnchainAddress(address)) {
      next.contracts.Settlement = address;
      for (const extra of tx.additionalContracts ?? []) {
        if (isOnchainAddress(extra.address) && extra.contractName === "Settlement") {
          next.contracts.Settlement = extra.address;
        }
      }
      break;
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
    if (!isOnchainAddress(next.contracts.Settlement)) {
      throw new Error("Cannot mark deployed without the Settlement address");
    }
    if (!/^[0-9a-f]{7,40}$/i.test(next.commit)) {
      throw new Error("Cannot mark deployed without the deployed git commit");
    }
    const successfulReceipt = broadcast.receipts?.some((receipt) => {
      const status = receipt.status;
      return receipt.transactionHash?.toLowerCase() === hash.toLowerCase()
        && (status === 1 || status === "1" || status === "0x1");
    });
    if (!successfulReceipt) {
      throw new Error("Cannot mark deployed without a successful mainnet receipt");
    }
    const code = options.deployedCode?.[next.contracts.Settlement.toLowerCase()];
    if (typeof code !== "string" || code.length <= 2) {
      throw new Error("Cannot mark deployed without verified on-chain bytecode for Settlement");
    }
    next.deployed = true;
  }
  return next;
}
