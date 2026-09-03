import assert from "node:assert/strict";
import test from "node:test";

import {
  FUNDED_EVENT_SIGNATURE,
  LOCK_CREATED_EVENT_SIGNATURE,
  encodeConditionalLockConstructorArgs,
  encodeFundCalldata,
  type ConditionalLockTerms,
} from "../../src/lib/conditional-lock-abi.ts";
import {
  ETHEREUM_MAINNET_CHAIN_HEX,
  ETHEREUM_MAINNET_USDC_ADDRESS,
  ETHEREUM_MAINNET_USDT_ASSET,
  ETHEREUM_MAINNET_USDT_ADDRESS,
} from "../../src/lib/mainnet-assets.ts";
import { hexToBytes } from "../../src/lib/keccak.ts";
import { hashSwapMarketPolicy } from "../../src/lib/swap-domain.ts";
import type { Hex32 } from "../../src/lib/order-domain.ts";
import { sha256Hex } from "../../src/lib/sha256.ts";
import {
  bindEvmFundingReceipt,
  type EvmReceiptLog,
} from "../../src/lib/evm-bound-evidence.ts";
import {
  createSwapState,
  type SwapState,
} from "../../src/lib/swap-state.ts";
import {
  sampleEvidencePolicies,
  sampleMarketPolicy,
  sampleSwapTerms,
  sampleTimingPolicy,
} from "../../src/lib/swap-test-fixtures.ts";
import type {
  StablecoinClaimReadProvider,
  StablecoinLockDeploymentAuthority,
} from "../../src/lib/stablecoin-wallet-action.ts";
import {
  readEvmFundingBundle,
  readEvmFundingBundleWithAuthority,
} from "./evm-receipt-source.ts";

// Synthetic vectors only. They are not deployment, wallet, or chain evidence.
const DEPLOYMENT_TRANSACTION_HASH = `0x${"11".repeat(32)}` as Hex32;
const DEPLOYMENT_BLOCK_HASH = `0x${"12".repeat(32)}` as Hex32;
const FUNDING_TRANSACTION_HASH = `0x${"21".repeat(32)}` as Hex32;
const FUNDING_BLOCK_HASH = `0x${"22".repeat(32)}` as Hex32;
const FINALIZED_BLOCK_HASH = `0x${"31".repeat(32)}` as Hex32;
const DEPLOYER = "0x7777777777777777777777777777777777777777";
const RUNTIME_BYTECODE = "0x6000600055";

function quantity(value: bigint): string {
  return `0x${value.toString(16)}`;
}

function addressWord(address: string): string {
  return `0x${"0".repeat(24)}${address.slice(2)}`;
}

function uintWord(value: bigint): string {
  return `0x${value.toString(16).padStart(64, "0")}`;
}

function words(encoded: string): string[] {
  return Array.from({ length: 11 }, (_, index) => (
    `0x${encoded.slice(2 + index * 64, 2 + (index + 1) * 64)}`
  ));
}

function joinedWords(values: readonly string[]): string {
  return `0x${values.map((word) => word.slice(2)).join("")}`;
}

function canonicalState(symbol: "USDC" | "USDT" = "USDC"): SwapState {
  const terms = {
    ...sampleSwapTerms,
    evmRefundRecipient: sampleSwapTerms.evmFunder,
    ...(symbol === "USDT" ? {
      quoteAsset: ETHEREUM_MAINNET_USDT_ASSET,
      marketPolicyId: hashSwapMarketPolicy({
        ...sampleMarketPolicy,
        markets: [{ ...sampleMarketPolicy.markets[0]!, quoteAsset: ETHEREUM_MAINNET_USDT_ASSET }],
      }),
    } : {}),
  };
  const marketPolicy = symbol === "USDT"
    ? {
      ...sampleMarketPolicy,
      markets: [{ ...sampleMarketPolicy.markets[0]!, quoteAsset: ETHEREUM_MAINNET_USDT_ASSET }],
    }
    : sampleMarketPolicy;
  return createSwapState(
    terms,
    sampleTimingPolicy,
    sampleEvidencePolicies,
    marketPolicy,
  );
}

function lockTerms(state: SwapState): ConditionalLockTerms {
  return {
    swapId: state.swapId,
    termsHash: state.termsHash,
    token: state.terms.quoteAsset === ETHEREUM_MAINNET_USDT_ASSET
      ? ETHEREUM_MAINNET_USDT_ADDRESS
      : ETHEREUM_MAINNET_USDC_ADDRESS,
    funder: state.terms.evmFunder,
    claimRecipient: state.terms.evmClaimRecipient,
    refundRecipient: state.terms.evmRefundRecipient,
    amount: state.terms.quoteAmountAtoms,
    hashlock: state.terms.secretHash,
    fundingCutoff: state.terms.evmFundBy,
    claimCutoff: state.terms.evmClaimSafetyCutoff,
    refundTime: state.terms.evmRefundTime,
  };
}

function authority(state: SwapState): StablecoinLockDeploymentAuthority {
  return {
    address: state.terms.evmEscrowContract as `0x${string}`,
    transactionHash: DEPLOYMENT_TRANSACTION_HASH,
    blockNumber: 100n,
    blockHash: DEPLOYMENT_BLOCK_HASH,
    runtimeBytecodeSha256: sha256Hex(hexToBytes(RUNTIME_BYTECODE)),
    terms: lockTerms(state) as StablecoinLockDeploymentAuthority["terms"],
  };
}

function rawLog(
  log: EvmReceiptLog,
  transactionHash: Hex32,
  blockNumber: bigint,
  blockHash: Hex32,
): Record<string, unknown> {
  return {
    address: log.address,
    logIndex: quantity(log.logIndex),
    topics: [...log.topics],
    data: log.data,
    transactionHash,
    blockNumber: quantity(blockNumber),
    blockHash,
    removed: false,
  };
}

function lockCreatedLog(state: SwapState): EvmReceiptLog {
  const encoded = encodeConditionalLockConstructorArgs(lockTerms(state));
  const encodedWords = words(encoded);
  return {
    address: state.terms.evmEscrowContract,
    logIndex: 0n,
    topics: [
      `0x${LOCK_CREATED_EVENT_SIGNATURE}`,
      encodedWords[0]!,
      encodedWords[1]!,
      encodedWords[2]!,
    ],
    data: joinedWords(encodedWords.slice(3)),
  };
}

function fundedLog(state: SwapState): EvmReceiptLog {
  return {
    address: state.terms.evmEscrowContract,
    logIndex: 0n,
    topics: [
      `0x${FUNDED_EVENT_SIGNATURE}`,
      state.swapId,
      addressWord(state.terms.evmFunder),
      addressWord(state.terms.quoteAsset === ETHEREUM_MAINNET_USDT_ASSET
        ? ETHEREUM_MAINNET_USDT_ADDRESS
        : ETHEREUM_MAINNET_USDC_ADDRESS),
    ],
    data: uintWord(state.terms.quoteAmountAtoms),
  };
}

type SyntheticChain = Readonly<{
  responses: unknown[];
  calls: Array<{ method: string; params: unknown[] }>;
}>;

function syntheticChain(state: SwapState, overrides: {
  deploymentReceipt?: Record<string, unknown>;
  deploymentTransaction?: Record<string, unknown>;
  deploymentBlock?: Record<string, unknown>;
  fundingReceipt?: Record<string, unknown>;
  fundingTransaction?: Record<string, unknown>;
  fundingBlock?: Record<string, unknown>;
  finalizedBlock?: Record<string, unknown>;
  recheckedFinalizedBlock?: Record<string, unknown>;
  code?: string;
  firstChainId?: string;
  finalChainId?: string;
} = {}): SyntheticChain {
  const deploymentLog = rawLog(lockCreatedLog(state), DEPLOYMENT_TRANSACTION_HASH, 100n, DEPLOYMENT_BLOCK_HASH);
  const fundingLog = rawLog(fundedLog(state), FUNDING_TRANSACTION_HASH, 101n, FUNDING_BLOCK_HASH);
  const deploymentInput = `0x60006000${encodeConditionalLockConstructorArgs(lockTerms(state)).slice(2)}`;
  const responses = [
    overrides.firstChainId ?? ETHEREUM_MAINNET_CHAIN_HEX,
    overrides.finalizedBlock ?? {
      number: quantity(200n),
      hash: FINALIZED_BLOCK_HASH,
      timestamp: quantity(200n),
    },
    overrides.deploymentReceipt ?? {
      transactionHash: DEPLOYMENT_TRANSACTION_HASH,
      blockNumber: quantity(100n),
      blockHash: DEPLOYMENT_BLOCK_HASH,
      status: "0x1",
      from: DEPLOYER,
      to: null,
      contractAddress: state.terms.evmEscrowContract,
      logs: [deploymentLog],
    },
    overrides.deploymentTransaction ?? {
      hash: DEPLOYMENT_TRANSACTION_HASH,
      blockNumber: quantity(100n),
      blockHash: DEPLOYMENT_BLOCK_HASH,
      from: DEPLOYER,
      to: null,
      input: deploymentInput,
      value: "0x0",
    },
    overrides.deploymentBlock ?? {
      number: quantity(100n),
      hash: DEPLOYMENT_BLOCK_HASH,
      timestamp: quantity(100n),
    },
    overrides.fundingReceipt ?? {
      transactionHash: FUNDING_TRANSACTION_HASH,
      blockNumber: quantity(101n),
      blockHash: FUNDING_BLOCK_HASH,
      status: "0x1",
      from: state.terms.evmFunder,
      to: state.terms.evmEscrowContract,
      contractAddress: null,
      logs: [fundingLog],
    },
    overrides.fundingTransaction ?? {
      hash: FUNDING_TRANSACTION_HASH,
      blockNumber: quantity(101n),
      blockHash: FUNDING_BLOCK_HASH,
      from: state.terms.evmFunder,
      to: state.terms.evmEscrowContract,
      input: encodeFundCalldata(),
      value: "0x0",
    },
    overrides.fundingBlock ?? {
      number: quantity(101n),
      hash: FUNDING_BLOCK_HASH,
      timestamp: quantity(101n),
    },
    overrides.code ?? RUNTIME_BYTECODE,
    overrides.recheckedFinalizedBlock ?? {
      number: quantity(200n),
      hash: FINALIZED_BLOCK_HASH,
      timestamp: quantity(200n),
    },
    overrides.finalChainId ?? ETHEREUM_MAINNET_CHAIN_HEX,
  ];
  const chain: SyntheticChain = { responses, calls: [] };
  return chain;
}

function providerFor(chain: SyntheticChain): StablecoinClaimReadProvider {
  return {
    request: async (args) => {
      chain.calls.push({ method: args.method, params: args.params ?? [] });
      const response = chain.responses.shift();
      if (response instanceof Error) throw response;
      return response;
    },
  };
}

function read(state: SwapState, chain: SyntheticChain, value = authority(state)) {
  return readEvmFundingBundleWithAuthority(providerFor(chain), state, FUNDING_TRANSACTION_HASH, value);
}

test("assembles source-checked receipts and composes with the existing binder", async () => {
  for (const symbol of ["USDC", "USDT"] as const) {
    const state = canonicalState(symbol);
    const chain = syntheticChain(state);
    const bundle = await read(state, chain);
    const fact = bindEvmFundingReceipt(state, bundle.deploymentReceipt, bundle.deploymentLogs, bundle.receipt);

    assert.equal(fact.transactionId, FUNDING_TRANSACTION_HASH);
    assert.equal(bundle.receipt.blockTimestampSeconds, 101n);
    assert.equal(bundle.finalizedBlock.number, 200n);
    assert.equal(Object.isFrozen(bundle), true);
    assert.equal(Object.isFrozen(bundle.deploymentReceipt), true);
    assert.equal(Object.isFrozen(bundle.deploymentLogs), true);
    assert.equal(Object.isFrozen(bundle.receipt), true);
    assert.equal(Object.isFrozen(bundle.receipt.logs), true);
    assert.deepEqual(
      chain.calls.map(({ method }) => method),
      [
        "eth_chainId",
        "eth_getBlockByNumber",
        "eth_getTransactionReceipt",
        "eth_getTransactionByHash",
        "eth_getBlockByNumber",
        "eth_getTransactionReceipt",
        "eth_getTransactionByHash",
        "eth_getBlockByNumber",
        "eth_getCode",
        "eth_getBlockByNumber",
        "eth_chainId",
      ],
    );
    assert.deepEqual(chain.calls[8]!.params, [state.terms.evmEscrowContract, {
      blockHash: FINALIZED_BLOCK_HASH,
      requireCanonical: true,
    }]);
  }
});

test("production manifest gate runs before provider validation or any request", async () => {
  const state = canonicalState();
  let calls = 0;
  const provider = {
    request: async () => {
      calls += 1;
      throw new Error("provider must not be reached");
    },
  } as StablecoinClaimReadProvider;

  await assert.rejects(
    readEvmFundingBundle(provider, state, FUNDING_TRANSACTION_HASH),
    /No approved Ethereum Mainnet conditional lock deployment manifest is active/,
  );
  assert.equal(calls, 0);
});

test("copies authority/state identity before the first await", async () => {
  const state = canonicalState();
  const authorityValue = authority(state);
  const chain = syntheticChain(state);
  const provider = providerFor(chain);
  const mutatingProvider = {
    request: async (args: { method: string; params?: unknown[] }) => {
      const result = await provider.request(args);
      if (args.method === "eth_chainId") {
        (authorityValue as { address: string }).address = "0x8888888888888888888888888888888888888888";
      }
      return result;
    },
  };

  const bundle = await readEvmFundingBundleWithAuthority(
    mutatingProvider,
    state,
    FUNDING_TRANSACTION_HASH,
    authorityValue,
  );
  assert.equal(bundle.deploymentReceipt.address, state.terms.evmEscrowContract);
});

test("rejects source identity, finality, and event-boundary mutations before returning", async () => {
  const state = canonicalState();
  const cases: ReadonlyArray<readonly [string, RegExp, (chain: SyntheticChain) => void]> = [
    ["chain ID", /Ethereum Mainnet chain ID 1 is required/, (chain) => { chain.responses[0] = "0x5"; }],
    ["finalized hash", /Finalized block changed/, (chain) => { (chain.responses[1] as Record<string, unknown>).hash = `0x${"32".repeat(32)}`; }],
    ["deployment receipt hash", /containing receipt/, (chain) => { (chain.responses[2] as Record<string, unknown>).blockHash = `0x${"13".repeat(32)}`; }],
    ["deployment transaction target", /identities disagree/, (chain) => { (chain.responses[3] as Record<string, unknown>).to = state.terms.evmEscrowContract; }],
    ["deployment transaction value", /Deployment transaction must carry zero native value/, (chain) => { (chain.responses[3] as Record<string, unknown>).value = "0x1"; }],
    ["deployment constructor suffix", /constructor arguments/, (chain) => { (chain.responses[3] as Record<string, unknown>).input = "0x6000"; }],
    ["deployment log provenance", /containing receipt/, (chain) => { ((chain.responses[2] as Record<string, unknown>).logs as Record<string, unknown>[])[0]!.blockHash = `0x${"13".repeat(32)}`; }],
    ["deployment after finalized timestamp", /Deployment is after the pinned finalized block/, (chain) => { (chain.responses[4] as Record<string, unknown>).timestamp = quantity(201n); }],
    ["funding sender", /identities disagree/, (chain) => { (chain.responses[6] as Record<string, unknown>).from = DEPLOYER; }],
    ["funding calldata", /approved lock fund call/, (chain) => { (chain.responses[6] as Record<string, unknown>).input = "0xdeadbeef"; }],
    ["funding block ordering", /Funding must be in a block after deployment/, (chain) => {
      (chain.responses[5] as Record<string, unknown>).blockNumber = quantity(100n);
      (chain.responses[6] as Record<string, unknown>).blockNumber = quantity(100n);
      (chain.responses[7] as Record<string, unknown>).number = quantity(100n);
      ((chain.responses[5] as Record<string, unknown>).logs as Record<string, unknown>[])[0]!.blockNumber = quantity(100n);
    }],
    ["funding after finalized timestamp", /Funding is after the pinned finalized block/, (chain) => { (chain.responses[7] as Record<string, unknown>).timestamp = quantity(201n); }],
    ["funding timestamp order", /Funding block timestamp must be after deployment block timestamp/, (chain) => { (chain.responses[7] as Record<string, unknown>).timestamp = quantity(100n); }],
    ["same-height finalized block hash", /Funding block identity does not match the pinned finalized block/, (chain) => {
      (chain.responses[1] as Record<string, unknown>).number = quantity(101n);
      (chain.responses[5] as Record<string, unknown>).blockNumber = quantity(101n);
      (chain.responses[6] as Record<string, unknown>).blockNumber = quantity(101n);
      (chain.responses[7] as Record<string, unknown>).number = quantity(101n);
    }],
    ["same-height finalized block timestamp", /Funding block identity does not match the pinned finalized block/, (chain) => {
      (chain.responses[1] as Record<string, unknown>).number = quantity(101n);
      (chain.responses[1] as Record<string, unknown>).hash = FUNDING_BLOCK_HASH;
      (chain.responses[5] as Record<string, unknown>).blockNumber = quantity(101n);
      (chain.responses[6] as Record<string, unknown>).blockNumber = quantity(101n);
      (chain.responses[7] as Record<string, unknown>).number = quantity(101n);
      (chain.responses[1] as Record<string, unknown>).timestamp = quantity(200n);
    }],
    ["lower-height finalized timestamp", /Funding block timestamp does not precede the pinned finalized block/, (chain) => {
      (chain.responses[1] as Record<string, unknown>).timestamp = quantity(101n);
    }],
    ["funding event count", /exactly one matching event/, (chain) => { (chain.responses[5] as Record<string, unknown>).logs = []; }],
    ["finalized code", /runtime bytecode does not match/, (chain) => { chain.responses[8] = "0x6001"; }],
    ["finalized recheck", /Finalized block changed/, (chain) => { (chain.responses[9] as Record<string, unknown>).hash = `0x${"32".repeat(32)}`; }],
    ["final chain ID", /Ethereum Mainnet chain ID 1 is required/, (chain) => { chain.responses[10] = "0x5"; }],
  ];

  for (const [label, expected, mutate] of cases) {
    const chain = syntheticChain(state);
    mutate(chain);
    await assert.rejects(read(state, chain), expected, label);
  }
});

test("accepts a receipt at the exact finalized block when all block fields match", async () => {
  const state = canonicalState();
  const chain = syntheticChain(state);
  (chain.responses[1] as Record<string, unknown>).number = quantity(101n);
  (chain.responses[1] as Record<string, unknown>).hash = FUNDING_BLOCK_HASH;
  (chain.responses[1] as Record<string, unknown>).timestamp = quantity(101n);
  (chain.responses[9] as Record<string, unknown>).number = quantity(101n);
  (chain.responses[9] as Record<string, unknown>).hash = FUNDING_BLOCK_HASH;
  (chain.responses[9] as Record<string, unknown>).timestamp = quantity(101n);

  const bundle = await read(state, chain);
  assert.equal(bundle.finalizedBlock.hash, FUNDING_BLOCK_HASH);
});

test("rejects malformed quantities and receipt log bounds before decoding", async () => {
  const state = canonicalState();
  const hugeQuantity = `0x${"f".repeat(10_000)}`;
  const quantityChain = syntheticChain(state);
  (quantityChain.responses[1] as Record<string, unknown>).number = hugeQuantity;
  await assert.rejects(read(state, quantityChain), /canonical hexadecimal quantity/);

  const nullReceiptChain = syntheticChain(state);
  nullReceiptChain.responses[2] = null;
  await assert.rejects(read(state, nullReceiptChain), /Deployment receipt must be an object/);

  const pendingReceiptChain = syntheticChain(state);
  (pendingReceiptChain.responses[5] as Record<string, unknown>).blockNumber = null;
  await assert.rejects(read(state, pendingReceiptChain), /Funding receipt block number must be a string/);

  const dataChain = syntheticChain(state);
  const receipt = dataChain.responses[5] as Record<string, unknown>;
  const log = (receipt.logs as Record<string, unknown>[])[0]!;
  log.data = `0x${"00".repeat(1_048_577)}`;
  await assert.rejects(read(state, dataChain), /bounded|receipt limit/);

  const aggregateDataChain = syntheticChain(state);
  const aggregateReceipt = aggregateDataChain.responses[5] as Record<string, unknown>;
  const aggregateLog = { ...((aggregateReceipt.logs as Record<string, unknown>[])[0]!) };
  aggregateLog.logIndex = "0x1";
  aggregateLog.topics = [`0x${"ee".repeat(32)}`];
  aggregateLog.data = `0x${"00".repeat(1_048_576)}`;
  aggregateReceipt.logs = [...(aggregateReceipt.logs as Record<string, unknown>[]), aggregateLog];
  await assert.rejects(read(state, aggregateDataChain), /log data exceeds the bounded receipt limit/);

  const overLogsChain = syntheticChain(state);
  const overLogsReceipt = overLogsChain.responses[5] as Record<string, unknown>;
  const baseLog = (overLogsReceipt.logs as Record<string, unknown>[])[0]!;
  overLogsReceipt.logs = [
    baseLog,
    ...Array.from({ length: 1_024 }, (_, index) => ({
      ...baseLog,
      logIndex: quantity(BigInt(index + 1)),
      topics: [`0x${"ee".repeat(32)}`],
      data: "0x",
    })),
  ];
  await assert.rejects(read(state, overLogsChain), /logs exceed the bounded receipt limit/);

  const malformedTopicChain = syntheticChain(state);
  const malformedReceipt = malformedTopicChain.responses[5] as Record<string, unknown>;
  const malformedLog = (malformedReceipt.logs as Record<string, unknown>[])[0]!;
  malformedLog.topics = [`0x${"ee".repeat(32)}00`];
  await assert.rejects(read(state, malformedTopicChain), /topic 0 must be one ABI word/);

  const removedLogChain = syntheticChain(state);
  const removedReceipt = removedLogChain.responses[5] as Record<string, unknown>;
  ((removedReceipt.logs as Record<string, unknown>[])[0]!).removed = true;
  await assert.rejects(read(state, removedLogChain), /is removed/);

  const duplicateChain = syntheticChain(state);
  const duplicateReceipt = duplicateChain.responses[5] as Record<string, unknown>;
  const duplicateLog = { ...((duplicateReceipt.logs as Record<string, unknown>[])[0]!) };
  duplicateReceipt.logs = [...(duplicateReceipt.logs as Record<string, unknown>[]), duplicateLog];
  await assert.rejects(read(state, duplicateChain), /reuse a log index|containing receipt/);
});

test("rejects a zero or deployment transaction as the funding identity before requests", async () => {
  const state = canonicalState();
  const zeroChain = syntheticChain(state);
  await assert.rejects(
    readEvmFundingBundleWithAuthority(providerFor(zeroChain), state, `0x${"00".repeat(32)}`, authority(state)),
    /Funding transaction hash cannot be zero/,
  );
  assert.equal(zeroChain.calls.length, 0);

  const reusedChain = syntheticChain(state);
  await assert.rejects(
    readEvmFundingBundleWithAuthority(providerFor(reusedChain), state, DEPLOYMENT_TRANSACTION_HASH, authority(state)),
    /must differ from the approved deployment transaction/,
  );
  assert.equal(reusedChain.calls.length, 0);
});

test("requires the synthetic authority to bind the exact canonical EVM market", async () => {
  const state = canonicalState();
  const mismatched = authority(state);
  (mismatched.terms as { token: string }).token = "0xdac17f958d2ee523a2206206994597c13d831ec7";
  const chain = syntheticChain(state);
  await assert.rejects(read(state, chain, mismatched), /canonical swap terms/);
  assert.equal(chain.responses.length, 11);
});
