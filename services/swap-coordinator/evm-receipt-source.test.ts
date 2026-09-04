import assert from "node:assert/strict";
import test from "node:test";

import {
  CLAIMED_EVENT_SIGNATURE,
  FUNDED_EVENT_SIGNATURE,
  LOCK_CREATED_EVENT_SIGNATURE,
  REFUNDED_EVENT_SIGNATURE,
  encodeClaimCalldata,
  encodeConditionalLockConstructorArgs,
  encodeFundCalldata,
  encodeRefundCalldata,
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
  bindEvmSpendReceipt,
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
  readEvmTerminalReceipt,
  readEvmTerminalReceiptWithAuthority,
} from "./evm-receipt-source.ts";

// Synthetic vectors only. They are not deployment, wallet, or chain evidence.
const DEPLOYMENT_TRANSACTION_HASH = `0x${"11".repeat(32)}` as Hex32;
const DEPLOYMENT_BLOCK_HASH = `0x${"12".repeat(32)}` as Hex32;
const FUNDING_TRANSACTION_HASH = `0x${"21".repeat(32)}` as Hex32;
const FUNDING_BLOCK_HASH = `0x${"22".repeat(32)}` as Hex32;
const FINALIZED_BLOCK_HASH = `0x${"31".repeat(32)}` as Hex32;
const TERMINAL_TRANSACTION_HASH = `0x${"41".repeat(32)}` as Hex32;
const TERMINAL_BLOCK_HASH = `0x${"42".repeat(32)}` as Hex32;
const DEPLOYER = "0x7777777777777777777777777777777777777777";
const RUNTIME_BYTECODE = "0x6000600055";
const CLAIM_PREIMAGE = `0x${"43".repeat(32)}` as Hex32;

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

function claimState(symbol: "USDC" | "USDT" = "USDC"): SwapState {
  const base = canonicalState(symbol);
  const marketPolicy = symbol === "USDT"
    ? {
      ...sampleMarketPolicy,
      markets: [{ ...sampleMarketPolicy.markets[0]!, quoteAsset: ETHEREUM_MAINNET_USDT_ASSET }],
    }
    : sampleMarketPolicy;
  return createSwapState(
    { ...base.terms, secretHash: sha256Hex(hexToBytes(CLAIM_PREIMAGE)) as Hex32 },
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

type TerminalAction = "claim" | "refund";

function terminalSender(state: SwapState, action: TerminalAction): string {
  return action === "claim" ? state.terms.evmClaimRecipient : state.terms.evmFunder;
}

function terminalRecipient(state: SwapState, action: TerminalAction): string {
  return action === "claim" ? state.terms.evmClaimRecipient : state.terms.evmRefundRecipient;
}

function terminalInput(action: TerminalAction): string {
  return action === "claim" ? encodeClaimCalldata(CLAIM_PREIMAGE) : encodeRefundCalldata();
}

function terminalTimestamp(state: SwapState, action: TerminalAction): bigint {
  return action === "claim" ? state.terms.evmClaimSafetyCutoff : state.terms.evmRefundTime;
}

function terminalLog(
  state: SwapState,
  action: TerminalAction,
  logIndex = 0n,
): EvmReceiptLog {
  return {
    address: state.terms.evmEscrowContract,
    logIndex,
    topics: [
      `0x${action === "claim" ? CLAIMED_EVENT_SIGNATURE : REFUNDED_EVENT_SIGNATURE}`,
      state.swapId,
      addressWord(terminalRecipient(state, action)),
    ],
    data: uintWord(state.terms.quoteAmountAtoms),
  };
}

type SyntheticChain = Readonly<{
  responses: unknown[];
  calls: Array<{ method: string; params: unknown[] }>;
}>;

type TerminalChainOverrides = Readonly<{
  finalizedBlock?: Record<string, unknown>;
  recheckedFinalizedBlock?: Record<string, unknown>;
  terminalReceipt?: Record<string, unknown>;
  terminalTransaction?: Record<string, unknown>;
  terminalBlock?: Record<string, unknown>;
  terminalRecheckedFinalizedBlock?: Record<string, unknown>;
  finalChainId?: string;
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

function syntheticTerminalChain(
  state: SwapState,
  action: TerminalAction,
  overrides: TerminalChainOverrides = {},
): SyntheticChain {
  const terminalBlockNumber = 102n;
  const terminalBlockTimestamp = terminalTimestamp(state, action);
  const finalizedTimestamp = terminalBlockTimestamp + 1n;
  const finalizedBlock = overrides.finalizedBlock ?? {
    number: quantity(200n),
    hash: FINALIZED_BLOCK_HASH,
    timestamp: quantity(finalizedTimestamp),
  };
  const chain = syntheticChain(state, {
    finalizedBlock,
    recheckedFinalizedBlock: overrides.recheckedFinalizedBlock ?? finalizedBlock,
  });
  const terminalLogValue = rawLog(
    terminalLog(state, action),
    TERMINAL_TRANSACTION_HASH,
    terminalBlockNumber,
    TERMINAL_BLOCK_HASH,
  );
  const sender = terminalSender(state, action);
  chain.responses.push(
    overrides.terminalReceipt ?? {
      transactionHash: TERMINAL_TRANSACTION_HASH,
      blockNumber: quantity(terminalBlockNumber),
      blockHash: TERMINAL_BLOCK_HASH,
      status: "0x1",
      from: sender,
      to: state.terms.evmEscrowContract,
      contractAddress: null,
      logs: [terminalLogValue],
    },
    overrides.terminalTransaction ?? {
      hash: TERMINAL_TRANSACTION_HASH,
      blockNumber: quantity(terminalBlockNumber),
      blockHash: TERMINAL_BLOCK_HASH,
      from: sender,
      to: state.terms.evmEscrowContract,
      input: terminalInput(action),
      value: "0x0",
    },
    overrides.terminalBlock ?? {
      number: quantity(terminalBlockNumber),
      hash: TERMINAL_BLOCK_HASH,
      timestamp: quantity(terminalBlockTimestamp),
    },
    overrides.terminalRecheckedFinalizedBlock ?? finalizedBlock,
    overrides.finalChainId ?? ETHEREUM_MAINNET_CHAIN_HEX,
  );
  return chain;
}

function terminalResponse(chain: SyntheticChain, offset: 0 | 1 | 2 | 3 | 4): Record<string, unknown> {
  return chain.responses[11 + offset] as Record<string, unknown>;
}

function terminalLogRecord(chain: SyntheticChain): Record<string, unknown> {
  return (terminalResponse(chain, 0).logs as Record<string, unknown>[])[0]!;
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

function readTerminal(
  state: SwapState,
  chain: SyntheticChain,
  action: TerminalAction,
  value = authority(state),
  terminalHash = TERMINAL_TRANSACTION_HASH,
) {
  return readEvmTerminalReceiptWithAuthority(
    providerFor(chain),
    state,
    FUNDING_TRANSACTION_HASH,
    terminalHash,
    action,
    value,
  );
}

test("reads both terminal actions for both issuer markets and composes canonical binders", async () => {
  for (const symbol of ["USDC", "USDT"] as const) {
    for (const action of ["claim", "refund"] as const) {
      const state = claimState(symbol);
      const chain = syntheticTerminalChain(state, action);
      const bundle = await readTerminal(state, chain, action);
      const funding = bindEvmFundingReceipt(
        state,
        bundle.funding.deploymentReceipt,
        bundle.funding.deploymentLogs,
        bundle.funding.receipt,
      );
      const spend = bindEvmSpendReceipt(
        state,
        funding,
        bundle.receipt,
        action,
        action === "claim" ? bundle.transactionInput : undefined,
      );

      assert.equal(bundle.funding.receipt.transactionHash, FUNDING_TRANSACTION_HASH);
      assert.equal(bundle.receipt.transactionHash, TERMINAL_TRANSACTION_HASH);
      assert.equal(bundle.transactionInput, terminalInput(action));
      assert.equal(spend.action, action);
      assert.equal(spend.asset, state.terms.quoteAsset);
      assert.equal(spend.amountAtoms, state.terms.quoteAmountAtoms);
      assert.equal(Object.isFrozen(bundle), true);
      assert.equal(Object.isFrozen(bundle.funding), true);
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
          "eth_getTransactionReceipt",
          "eth_getTransactionByHash",
          "eth_getBlockByNumber",
          "eth_getBlockByNumber",
          "eth_chainId",
        ],
      );
    }
  }
});

test("production terminal reader fails the manifest gate before any provider request", async () => {
  const state = claimState();
  let calls = 0;
  const provider = {
    request: async () => {
      calls += 1;
      throw new Error("provider must not be reached");
    },
  } as StablecoinClaimReadProvider;

  await assert.rejects(
    readEvmTerminalReceipt(provider, state, FUNDING_TRANSACTION_HASH, TERMINAL_TRANSACTION_HASH, "claim"),
    /No approved Ethereum Mainnet conditional lock deployment manifest is active/,
  );
  assert.equal(calls, 0);
});

test("snapshots mutable state and authority before the first terminal await", async () => {
  const mutableState = structuredClone(claimState()) as SwapState;
  const originalLock = mutableState.terms.evmEscrowContract;
  const authorityValue = authority(mutableState);
  const chain = syntheticTerminalChain(mutableState, "claim");
  const provider = providerFor(chain);
  const mutatingProvider = {
    request: async (args: { method: string; params?: unknown[] }) => {
      const result = await provider.request(args);
      if (args.method === "eth_chainId" && chain.calls.length === 1) {
        (mutableState.terms as { evmEscrowContract: string; evmClaimRecipient: string }).evmEscrowContract =
          "0x8888888888888888888888888888888888888888";
        (mutableState.terms as { evmClaimRecipient: string }).evmClaimRecipient =
          "0x9999999999999999999999999999999999999999";
        (authorityValue as { address: string }).address = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
        (authorityValue.terms as { claimRecipient: string }).claimRecipient =
          "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
      }
      return result;
    },
  };

  const bundle = await readEvmTerminalReceiptWithAuthority(
    mutatingProvider,
    mutableState,
    FUNDING_TRANSACTION_HASH,
    TERMINAL_TRANSACTION_HASH,
    "claim",
    authorityValue,
  );
  assert.equal(bundle.funding.deploymentReceipt.address, originalLock);
  assert.equal(bundle.receipt.logs[0]!.address, originalLock);
  assert.equal(bundle.transactionInput, terminalInput("claim"));
});

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

test("rejects malformed terminal receipts, transactions, events, and ordering", async () => {
  const state = claimState();
  const cases: ReadonlyArray<readonly [
    string,
    RegExp,
    (chain: SyntheticChain) => void,
  ]> = [
    ["null terminal receipt", /Terminal receipt must be an object/, (chain) => {
      chain.responses[11] = null;
    }],
    ["failed terminal receipt", /Terminal receipt must report successful execution/, (chain) => {
      terminalResponse(chain, 0).status = "0x0";
    }],
    ["terminal receipt and transaction identity", /Terminal receipt and transaction identities disagree/, (chain) => {
      terminalResponse(chain, 1).blockHash = `0x${"52".repeat(32)}`;
    }],
    ["terminal log provenance", /Terminal receipt log 0 does not identify its containing receipt/, (chain) => {
      terminalLogRecord(chain).transactionHash = `0x${"51".repeat(32)}`;
    }],
    ["terminal sender", /Terminal receipt and transaction do not match the approved lock action/, (chain) => {
      terminalResponse(chain, 0).from = DEPLOYER;
      terminalResponse(chain, 1).from = DEPLOYER;
    }],
    ["terminal target", /Terminal receipt and transaction do not match the approved lock action/, (chain) => {
      const otherLock = "0x8888888888888888888888888888888888888888";
      terminalResponse(chain, 0).to = otherLock;
      terminalResponse(chain, 1).to = otherLock;
    }],
    ["terminal value", /Terminal receipt and transaction do not match the approved lock action/, (chain) => {
      terminalResponse(chain, 1).value = "0x1";
    }],
    ["malformed terminal claim calldata", /claim calldata must be exactly selector plus bytes32/, (chain) => {
      terminalResponse(chain, 1).input = "0xdeadbeef";
    }],
    ["wrong terminal claim preimage", /Claim transaction preimage does not match the canonical hashlock/, (chain) => {
      terminalResponse(chain, 1).input = encodeClaimCalldata(`0x${"44".repeat(32)}`);
    }],
    ["terminal opposite event", /Terminal receipt contains the opposite terminal event/, (chain) => {
      terminalLogRecord(chain).topics = [
        `0x${REFUNDED_EVENT_SIGNATURE}`,
        state.swapId,
        addressWord(state.terms.evmRefundRecipient),
      ];
    }],
    ["missing terminal event", /Terminal receipt is missing the requested terminal event/, (chain) => {
      terminalLogRecord(chain).topics = [`0x${"53".repeat(32)}`];
    }],
    ["duplicate terminal event", /Terminal receipt contains duplicate requested terminal events/, (chain) => {
      const log = terminalLogRecord(chain);
      terminalResponse(chain, 0).logs = [log, { ...log, logIndex: "0x1" }];
    }],
    ["malformed terminal event", /claim event must contain exactly three topics/, (chain) => {
      terminalLogRecord(chain).topics = (terminalLogRecord(chain).topics as string[]).slice(0, 2);
    }],
    ["terminal event terms", /claim event does not match the canonical conditional lock terms/, (chain) => {
      terminalLogRecord(chain).topics = [
        `0x${CLAIMED_EVENT_SIGNATURE}`,
        `0x${"54".repeat(32)}`,
        addressWord(state.terms.evmClaimRecipient),
      ];
    }],
    ["terminal block identity", /Terminal receipt is not in its queried block/, (chain) => {
      terminalResponse(chain, 2).hash = `0x${"55".repeat(32)}`;
    }],
    ["terminal block ordering", /Terminal must be in a block after funding/, (chain) => {
      terminalResponse(chain, 0).blockNumber = quantity(101n);
      terminalResponse(chain, 1).blockNumber = quantity(101n);
      terminalResponse(chain, 2).number = quantity(101n);
      terminalLogRecord(chain).blockNumber = quantity(101n);
    }],
    ["terminal timestamp ordering", /Terminal block timestamp must be after funding block timestamp/, (chain) => {
      terminalResponse(chain, 2).timestamp = quantity(101n);
    }],
    ["terminal funding block identity reuse", /Terminal receipt reuses a funding transaction or block identity/, (chain) => {
      terminalResponse(chain, 0).blockHash = FUNDING_BLOCK_HASH;
      terminalResponse(chain, 1).blockHash = FUNDING_BLOCK_HASH;
      terminalResponse(chain, 2).hash = FUNDING_BLOCK_HASH;
      terminalLogRecord(chain).blockHash = FUNDING_BLOCK_HASH;
    }],
    ["terminal log data bound", /Terminal receipt log 0 data must be bounded even-length hexadecimal bytes/, (chain) => {
      terminalLogRecord(chain).data = `0x${"00".repeat(1_048_577)}`;
    }],
    ["terminal log count bound", /Terminal receipt logs exceed the bounded receipt limit/, (chain) => {
      const log = terminalLogRecord(chain);
      terminalResponse(chain, 0).logs = Array.from({ length: 1_025 }, (_, index) => ({
        ...log,
        logIndex: quantity(BigInt(index)),
      }));
    }],
    ["terminal input bound", /Terminal transaction input must be bounded even-length hexadecimal bytes/, (chain) => {
      terminalResponse(chain, 1).input = `0x${"00".repeat(1_048_577)}`;
    }],
  ];

  for (const [label, expected, mutate] of cases) {
    const chain = syntheticTerminalChain(state, "claim");
    mutate(chain);
    await assert.rejects(readTerminal(state, chain, "claim"), expected, label);
  }
});

test("rejects terminal identity reuse and finalized-anchor mutations before evidence is returned", async () => {
  const state = claimState();
  const zeroChain = syntheticTerminalChain(state, "claim");
  await assert.rejects(
    readEvmTerminalReceiptWithAuthority(
      providerFor(zeroChain),
      state,
      FUNDING_TRANSACTION_HASH,
      `0x${"00".repeat(32)}`,
      "claim",
      authority(state),
    ),
    /Terminal transaction hash cannot be zero/,
  );
  assert.equal(zeroChain.calls.length, 0);

  const reusedFundingChain = syntheticTerminalChain(state, "claim");
  await assert.rejects(
    readEvmTerminalReceiptWithAuthority(
      providerFor(reusedFundingChain),
      state,
      FUNDING_TRANSACTION_HASH,
      FUNDING_TRANSACTION_HASH,
      "claim",
      authority(state),
    ),
    /Terminal transaction must differ from the deployment and funding transactions/,
  );
  assert.equal(reusedFundingChain.calls.length, 0);

  const reusedDeploymentChain = syntheticTerminalChain(state, "claim");
  await assert.rejects(
    readEvmTerminalReceiptWithAuthority(
      providerFor(reusedDeploymentChain),
      state,
      FUNDING_TRANSACTION_HASH,
      DEPLOYMENT_TRANSACTION_HASH,
      "claim",
      authority(state),
    ),
    /Terminal transaction must differ from the deployment and funding transactions/,
  );
  assert.equal(reusedDeploymentChain.calls.length, 0);

  const afterFinalized = syntheticTerminalChain(state, "claim", {
    finalizedBlock: {
      number: quantity(101n),
      hash: FUNDING_BLOCK_HASH,
      timestamp: quantity(101n),
    },
  });
  await assert.rejects(
    readTerminal(state, afterFinalized, "claim"),
    /Terminal is after the pinned finalized block/,
  );

  const sameHeightFinalized = syntheticTerminalChain(state, "claim", {
    finalizedBlock: {
      number: quantity(102n),
      hash: FINALIZED_BLOCK_HASH,
      timestamp: quantity(terminalTimestamp(state, "claim")),
    },
  });
  await assert.rejects(
    readTerminal(state, sameHeightFinalized, "claim"),
    /Terminal block identity does not match the pinned finalized block/,
  );

  const recheck = syntheticTerminalChain(state, "claim", {
    terminalRecheckedFinalizedBlock: {
      number: quantity(200n),
      hash: `0x${"56".repeat(32)}`,
      timestamp: quantity(terminalTimestamp(state, "claim") + 1n),
    },
  });
  await assert.rejects(readTerminal(state, recheck, "claim"), /Finalized block changed during the read/);

  const finalChain = syntheticTerminalChain(state, "claim", { finalChainId: "0x5" });
  await assert.rejects(readTerminal(state, finalChain, "claim"), /Ethereum Mainnet chain ID 1 is required/);
});

test("enforces the exact refund selector and rejects unknown terminal actions", async () => {
  const state = claimState();
  const wrongRefundInput = syntheticTerminalChain(state, "refund");
  terminalResponse(wrongRefundInput, 1).input = encodeClaimCalldata(CLAIM_PREIMAGE);
  await assert.rejects(
    readTerminal(state, wrongRefundInput, "refund"),
    /Refund transaction input does not match the exact refund call/,
  );

  const unknownAction = syntheticTerminalChain(state, "claim");
  await assert.rejects(
    readEvmTerminalReceiptWithAuthority(
      providerFor(unknownAction),
      state,
      FUNDING_TRANSACTION_HASH,
      TERMINAL_TRANSACTION_HASH,
      "exchange" as "claim",
      authority(state),
    ),
    /EVM terminal action is not recognized/,
  );
  assert.equal(unknownAction.calls.length, 0);
});
