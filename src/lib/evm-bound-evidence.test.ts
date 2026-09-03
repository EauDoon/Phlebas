import assert from "node:assert/strict";
import test from "node:test";

import {
  FUNDED_EVENT_SIGNATURE,
  LOCK_CREATED_EVENT_SIGNATURE,
  encodeConditionalLockConstructorArgs,
  type ConditionalLockTerms,
} from "./conditional-lock-abi.ts";
import {
  ETHEREUM_MAINNET_CHAIN_HEX,
  ETHEREUM_MAINNET_NETWORK,
  ETHEREUM_MAINNET_USDC_ADDRESS,
  ETHEREUM_MAINNET_USDC_ASSET,
  ETHEREUM_MAINNET_USDT_ADDRESS,
  ETHEREUM_MAINNET_USDT_ASSET,
  NATIVE_ZEC_ASSET,
  ZCASH_MAINNET_NETWORK,
} from "./mainnet-assets.ts";
import { hashSwapMarketPolicy, type SwapMarketPolicyV1, type SwapTermsV1 } from "./swap-domain.ts";
import { hashSwapFinalityPolicy } from "./swap-policy.ts";
import {
  authorizeSwapTerms,
  createSwapState,
  fundingFactId,
  type FundingFact,
  type SwapState,
} from "./swap-state.ts";
import {
  sampleEvidencePolicies,
  sampleMarketPolicy,
  sampleSwapTerms,
  sampleTimingPolicy,
} from "./swap-test-fixtures.ts";
import {
  bindEvmFundingReceipt,
  type EvmFundingReceipt,
  type EvmReceiptLog,
} from "./evm-bound-evidence.ts";
import type { StablecoinLockDeploymentReceipt } from "./stablecoin-wallet-action.ts";

// Synthetic fixtures only. These values are not deployment receipts or chain evidence.
const UINT64_MAX = (1n << 64n) - 1n;
const SYNTHETIC_DEPLOYMENT_TX = `0x${"90".repeat(32)}`;
const SYNTHETIC_DEPLOYMENT_BLOCK_HASH = `0x${"91".repeat(32)}`;
const SYNTHETIC_RUNTIME_HASH = `0x${"92".repeat(32)}`;
const SYNTHETIC_FUNDING_TX = `0x${"a0".repeat(32)}`;
const SYNTHETIC_FUNDING_BLOCK_HASH = `0x${"a1".repeat(32)}`;
const SYNTHETIC_OTHER_ADDRESS = "0x7777777777777777777777777777777777777777";
const SYNTHETIC_OTHER_CLAIMANT = "0x8888888888888888888888888888888888888888";
const SYNTHETIC_OTHER_REFUND = "0x9999999999999999999999999999999999999999";
const MAX_RECEIPT_DATA_BYTES = 1_048_576;

const USDT_MARKET_POLICY: SwapMarketPolicyV1 = {
  version: 1,
  markets: [{
    zecChain: sampleSwapTerms.zecChain,
    zecAsset: sampleSwapTerms.zecAsset,
    quoteChain: ETHEREUM_MAINNET_NETWORK,
    quoteAsset: ETHEREUM_MAINNET_USDT_ASSET,
  }],
};

type QuoteSymbol = "USDC" | "USDT";

function termsFor(symbol: QuoteSymbol): SwapTermsV1 {
  const base = {
    ...sampleSwapTerms,
    // ConditionalLock requires refunds to return to the funder.
    evmRefundRecipient: sampleSwapTerms.evmFunder,
  };
  if (symbol === "USDC") return base;
  return {
    ...base,
    quoteAsset: ETHEREUM_MAINNET_USDT_ASSET,
    marketPolicyId: hashSwapMarketPolicy(USDT_MARKET_POLICY),
  };
}

function marketPolicyFor(symbol: QuoteSymbol): SwapMarketPolicyV1 {
  return symbol === "USDC" ? sampleMarketPolicy : USDT_MARKET_POLICY;
}

function canonicalState(symbol: QuoteSymbol): SwapState {
  const terms = termsFor(symbol);
  return createSwapState(
    terms,
    sampleTimingPolicy,
    sampleEvidencePolicies,
    marketPolicyFor(symbol),
  );
}

function authorizedState(symbol: QuoteSymbol): SwapState {
  const terms = termsFor(symbol);
  const created = canonicalState(symbol);
  const first = authorizeSwapTerms(
    created,
    terms.zecSellerId,
    created.termsHash,
    terms.authorizationDeadline - 2n,
  );
  return authorizeSwapTerms(
    first,
    terms.stablecoinSellerId,
    first.termsHash,
    terms.authorizationDeadline - 1n,
  );
}

function alternateZecState(): SwapState {
  const zecChain = `bip122:${"ff".repeat(16)}`;
  const zecAsset = `${zecChain}/slip44:133`;
  const marketPolicy: SwapMarketPolicyV1 = {
    version: 1,
    markets: [{
      zecChain,
      zecAsset,
      quoteChain: ETHEREUM_MAINNET_NETWORK,
      quoteAsset: ETHEREUM_MAINNET_USDC_ASSET,
    }],
  };
  const evidencePolicies = {
    ...sampleEvidencePolicies,
    zecFinality: {
      ...sampleEvidencePolicies.zecFinality,
      chain: zecChain,
    },
  };
  const terms = {
    ...termsFor("USDC"),
    zecChain,
    zecAsset,
    marketPolicyId: hashSwapMarketPolicy(marketPolicy),
    zecFinalityPolicyId: hashSwapFinalityPolicy(evidencePolicies.zecFinality),
  };
  return createSwapState(terms, sampleTimingPolicy, evidencePolicies, marketPolicy);
}

function tokenAddress(state: SwapState): string {
  if (state.terms.quoteAsset === ETHEREUM_MAINNET_USDC_ASSET) return ETHEREUM_MAINNET_USDC_ADDRESS;
  if (state.terms.quoteAsset === ETHEREUM_MAINNET_USDT_ASSET) return ETHEREUM_MAINNET_USDT_ADDRESS;
  throw new Error("fixture quote asset is not a tracked mainnet stablecoin");
}

function addressWord(address: string): string {
  return `0x${"0".repeat(24)}${address.slice(2)}`;
}

function bytes32(byte: string): string {
  return `0x${byte.repeat(32)}`;
}

function uintWord(value: bigint): string {
  return `0x${value.toString(16).padStart(64, "0")}`;
}

function words(encoded: string, count: number): string[] {
  const body = encoded.slice(2);
  assert.equal(body.length, count * 64);
  return Array.from({ length: count }, (_, index) => (
    `0x${body.slice(index * 64, (index + 1) * 64)}`
  ));
}

function joinedWords(values: readonly string[]): string {
  return `0x${values.map((value) => value.slice(2)).join("")}`;
}

function evmLockTerms(state: SwapState): ConditionalLockTerms {
  return {
    swapId: state.swapId,
    termsHash: state.termsHash,
    token: tokenAddress(state),
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

function lockCreatedLog(state: SwapState): EvmReceiptLog {
  const encoded = encodeConditionalLockConstructorArgs(evmLockTerms(state));
  const encodedWords = words(encoded, 11);
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

function fundedLog(state: SwapState, changes: Partial<EvmReceiptLog> = {}): EvmReceiptLog {
  return {
    address: state.terms.evmEscrowContract,
    logIndex: 0n,
    topics: [
      `0x${FUNDED_EVENT_SIGNATURE}`,
      state.swapId,
      addressWord(state.terms.evmFunder),
      addressWord(tokenAddress(state)),
    ],
    data: uintWord(state.terms.quoteAmountAtoms),
    ...changes,
  };
}

function deploymentReceipt(
  state: SwapState,
  changes: Partial<StablecoinLockDeploymentReceipt> = {},
): StablecoinLockDeploymentReceipt {
  return {
    chainId: ETHEREUM_MAINNET_CHAIN_HEX,
    address: state.terms.evmEscrowContract,
    transactionHash: SYNTHETIC_DEPLOYMENT_TX,
    blockNumber: 100n,
    blockHash: SYNTHETIC_DEPLOYMENT_BLOCK_HASH,
    receiptStatus: "0x1",
    runtimeBytecodeSha256: SYNTHETIC_RUNTIME_HASH,
    ...changes,
  };
}

function fundingReceipt(
  state: SwapState,
  deployment: StablecoinLockDeploymentReceipt,
  changes: Partial<EvmFundingReceipt> = {},
): EvmFundingReceipt {
  return {
    chainId: ETHEREUM_MAINNET_CHAIN_HEX,
    transactionHash: SYNTHETIC_FUNDING_TX,
    blockNumber: deployment.blockNumber + 1n,
    blockHash: SYNTHETIC_FUNDING_BLOCK_HASH,
    blockTimestampSeconds: state.terms.evmFundBy,
    receiptStatus: "0x1",
    logs: [fundedLog(state)],
    ...changes,
  };
}

function expectedFunding(
  state: SwapState,
  deployment: StablecoinLockDeploymentReceipt,
  receipt: EvmFundingReceipt,
  log: EvmReceiptLog,
): Omit<FundingFact, "factId"> {
  return {
    leg: "evm",
    swapId: state.swapId,
    termsHash: state.termsHash,
    transactionId: receipt.transactionHash as `0x${string}`,
    blockHash: receipt.blockHash as `0x${string}`,
    blockHeight: receipt.blockNumber,
    executedAtSeconds: receipt.blockTimestampSeconds,
    outputIndex: log.logIndex,
    chain: state.terms.quoteChain,
    asset: state.terms.quoteAsset,
    amountAtoms: state.terms.quoteAmountAtoms,
    lockIdentity: deployment.address,
    escrowRecordId: state.swapId,
    funder: state.terms.evmFunder,
    claimRecipient: state.terms.evmClaimRecipient,
    refundRecipient: state.terms.evmRefundRecipient,
    secretHash: state.terms.secretHash,
    refundTime: state.terms.evmRefundTime,
    successful: true,
  };
}

function replaceWord(values: readonly string[], index: number, value: string): string[] {
  return values.map((current, currentIndex) => currentIndex === index ? value : current);
}

function deploymentLogWithWords(state: SwapState, values: readonly string[]): EvmReceiptLog {
  const original = lockCreatedLog(state);
  return {
    ...original,
    topics: [
      original.topics[0]!,
      values[0]!,
      values[1]!,
      values[2]!,
    ],
    data: joinedWords(values.slice(3)),
  };
}

function unknownLog(state: SwapState, logIndex: bigint): EvmReceiptLog {
  return {
    address: state.terms.evmEscrowContract,
    logIndex,
    topics: [bytes32("ee")],
    data: "0x",
  };
}

test("binds synthetic exact-mainnet USDC and USDT receipts into frozen facts", () => {
  for (const symbol of ["USDC", "USDT"] as const) {
    const state = authorizedState(symbol);
    assert.equal(state.terms.quoteChain, ETHEREUM_MAINNET_NETWORK);
    assert.equal(
      state.terms.quoteAsset,
      symbol === "USDC" ? ETHEREUM_MAINNET_USDC_ASSET : ETHEREUM_MAINNET_USDT_ASSET,
    );
    assert.equal(state.terms.protocolFeeQuoteAtoms, 0n);

    const deployment = deploymentReceipt(state);
    const receipt = fundingReceipt(state, deployment);
    const [log] = receipt.logs;
    const before = structuredClone(state);
    const fact = bindEvmFundingReceipt(
      state,
      deployment,
      [lockCreatedLog(state)],
      receipt,
    );
    const unsigned = expectedFunding(state, deployment, receipt, log!);

    assert.deepEqual(fact, { factId: fundingFactId(unsigned), ...unsigned });
    assert.equal(Object.isFrozen(fact), true);
    assert.deepEqual(state, before);
    assert.equal("attestation" in fact, false);
    assert.equal("state" in fact, false);
    assert.equal("authority" in fact, false);
  }
});

test("binds a canonical unsigned state without claiming signed authority", () => {
  const state = canonicalState("USDC");
  assert.deepEqual(state.authorizations, {});
  const deployment = deploymentReceipt(state);
  const receipt = fundingReceipt(state, deployment);
  const fact = bindEvmFundingReceipt(state, deployment, [lockCreatedLog(state)], receipt);

  assert.equal(Object.keys(state.authorizations).length, 0);
  assert.equal(fact.successful, true);
  assert.equal("authority" in fact, false);
  assert.equal("authorization" in fact, false);
});

test("requires the exact native ZEC Mainnet identity", () => {
  const state = alternateZecState();
  assert.notEqual(state.terms.zecChain, ZCASH_MAINNET_NETWORK);
  assert.notEqual(state.terms.zecAsset, NATIVE_ZEC_ASSET);
  const deployment = deploymentReceipt(state);
  const receipt = fundingReceipt(state, deployment);

  assert.throws(
    () => bindEvmFundingReceipt(state, deployment, [lockCreatedLog(state)], receipt),
    "non-mainnet ZEC chain and asset",
  );
});

test("LockCreated deployment evidence binds all eleven immutable terms", () => {
  const state = authorizedState("USDC");
  const deployment = deploymentReceipt(state);
  const receipt = fundingReceipt(state, deployment);
  const original = words(encodeConditionalLockConstructorArgs(evmLockTerms(state)), 11);
  const mutations: ReadonlyArray<readonly [string, readonly string[]]> = [
    ["swap ID", replaceWord(original, 0, bytes32("ab"))],
    ["terms hash", replaceWord(original, 1, bytes32("ac"))],
    ["token", replaceWord(original, 2, addressWord(ETHEREUM_MAINNET_USDT_ADDRESS))],
    ["funder and refund recipient", [
      ...replaceWord(original, 3, addressWord(SYNTHETIC_OTHER_ADDRESS)).slice(0, 5),
      addressWord(SYNTHETIC_OTHER_ADDRESS),
      ...original.slice(6),
    ]],
    ["claim recipient", replaceWord(original, 4, addressWord(SYNTHETIC_OTHER_CLAIMANT))],
    ["amount", replaceWord(original, 6, uintWord(state.terms.quoteAmountAtoms + 1n))],
    ["hashlock", replaceWord(original, 7, bytes32("ad"))],
    ["funding cutoff", replaceWord(original, 8, uintWord(state.terms.evmFundBy + 1n))],
    ["claim cutoff", replaceWord(original, 9, uintWord(state.terms.evmClaimSafetyCutoff + 1n))],
    ["refund time", replaceWord(original, 10, uintWord(state.terms.evmRefundTime + 1n))],
  ];

  for (const [label, mutated] of mutations) {
    assert.throws(
      () => bindEvmFundingReceipt(
        state,
        deployment,
        [deploymentLogWithWords(state, mutated)],
        receipt,
      ),
      label,
    );
  }

  const refundOnly = replaceWord(original, 5, addressWord(SYNTHETIC_OTHER_REFUND));
  assert.throws(
    () => bindEvmFundingReceipt(state, deployment, [deploymentLogWithWords(state, refundOnly)], receipt),
    "refund recipient",
  );
});

test("requires successful canonical deployment and funding receipt identities", () => {
  const state = authorizedState("USDC");
  const deployment = deploymentReceipt(state);
  const receipt = fundingReceipt(state, deployment);
  const badReceipts: ReadonlyArray<readonly [string, EvmFundingReceipt]> = [
    ["funding chain", { ...receipt, chainId: "0x5" as typeof ETHEREUM_MAINNET_CHAIN_HEX }],
    ["funding status", { ...receipt, receiptStatus: "0x0" as "0x1" }],
    ["funding transaction hash", { ...receipt, transactionHash: "0x1234" }],
    ["funding block hash", { ...receipt, blockHash: "0x0" }],
    ["funding reuses deployment transaction hash", { ...receipt, transactionHash: deployment.transactionHash }],
    ["funding reuses deployment block hash", { ...receipt, blockHash: deployment.blockHash }],
  ];
  for (const [label, bad] of badReceipts) {
    assert.throws(() => bindEvmFundingReceipt(state, deployment, [lockCreatedLog(state)], bad), label);
  }

  const badDeployments: ReadonlyArray<readonly [string, StablecoinLockDeploymentReceipt]> = [
    ["deployment chain", { ...deployment, chainId: "0x5" as typeof ETHEREUM_MAINNET_CHAIN_HEX }],
    ["deployment status", { ...deployment, receiptStatus: "0x0" as "0x1" }],
    ["deployment address", { ...deployment, address: SYNTHETIC_OTHER_ADDRESS }],
    ["deployment transaction hash", { ...deployment, transactionHash: "0x1234" }],
    ["deployment block hash", { ...deployment, blockHash: "0x0" }],
    ["deployment runtime hash", { ...deployment, runtimeBytecodeSha256: "0x0" }],
  ];
  for (const [label, bad] of badDeployments) {
    assert.throws(() => bindEvmFundingReceipt(state, bad, [lockCreatedLog(state)], receipt), label);
  }

  const wrongDeploymentLog = { ...lockCreatedLog(state), address: SYNTHETIC_OTHER_ADDRESS };
  assert.throws(
    () => bindEvmFundingReceipt(state, deployment, [wrongDeploymentLog], receipt),
    "deployment log address",
  );
});

test("requires the exact Funded event identity, indexed fields, and amount", () => {
  const state = authorizedState("USDC");
  const deployment = deploymentReceipt(state);
  const receipt = fundingReceipt(state, deployment);
  const valid = fundedLog(state);
  const mutations: ReadonlyArray<readonly [string, EvmReceiptLog]> = [
    ["funded log address", { ...valid, address: SYNTHETIC_OTHER_ADDRESS }],
    ["funded signature", { ...valid, topics: [bytes32("ff"), ...valid.topics.slice(1)] }],
    ["funded swap ID", { ...valid, topics: [valid.topics[0]!, bytes32("ab"), ...valid.topics.slice(2)] }],
    ["funded funder", { ...valid, topics: [valid.topics[0]!, valid.topics[1]!, addressWord(SYNTHETIC_OTHER_ADDRESS), valid.topics[3]!] }],
    ["funded token", { ...valid, topics: [valid.topics[0]!, valid.topics[1]!, valid.topics[2]!, addressWord(ETHEREUM_MAINNET_USDT_ADDRESS)] }],
    ["funded amount", { ...valid, data: uintWord(state.terms.quoteAmountAtoms + 1n) }],
    ["funded topic count", { ...valid, topics: valid.topics.slice(0, 3) }],
    ["funded oversized topic", { ...valid, topics: [valid.topics[0]!, `${valid.topics[1]}00`, valid.topics[2]!, valid.topics[3]!] }],
    ["funded data width", { ...valid, data: "0x" }],
  ];
  for (const [label, log] of mutations) {
    assert.throws(
      () => bindEvmFundingReceipt(state, deployment, [lockCreatedLog(state)], { ...receipt, logs: [log] }),
      label,
    );
  }
});

test("rejects values outside uint64 for blocks, timestamps, and log indices", () => {
  const state = authorizedState("USDC");
  const deployment = deploymentReceipt(state);
  const receipt = fundingReceipt(state, deployment);
  const validDeploymentLog = lockCreatedLog(state);
  const badDeployments: ReadonlyArray<readonly [string, StablecoinLockDeploymentReceipt]> = [
    ["negative deployment block", { ...deployment, blockNumber: -1n }],
    ["wide deployment block", { ...deployment, blockNumber: UINT64_MAX + 1n }],
  ];
  for (const [label, bad] of badDeployments) {
    assert.throws(() => bindEvmFundingReceipt(state, bad, [validDeploymentLog], receipt), label);
  }

  const badReceipts: ReadonlyArray<readonly [string, EvmFundingReceipt]> = [
    ["negative funding block", { ...receipt, blockNumber: -1n }],
    ["wide funding block", { ...receipt, blockNumber: UINT64_MAX + 1n }],
    ["negative block timestamp", { ...receipt, blockTimestampSeconds: -1n }],
    ["wide block timestamp", { ...receipt, blockTimestampSeconds: UINT64_MAX + 1n }],
    ["negative log index", { ...receipt, logs: [fundedLog(state, { logIndex: -1n })] }],
    ["wide log index", { ...receipt, logs: [fundedLog(state, { logIndex: UINT64_MAX + 1n })] }],
  ];
  for (const [label, bad] of badReceipts) {
    assert.throws(() => bindEvmFundingReceipt(state, deployment, [validDeploymentLog], bad), label);
  }

  assert.throws(
    () => bindEvmFundingReceipt(state, deployment, [{ ...validDeploymentLog, logIndex: UINT64_MAX + 1n }], receipt),
    "deployment log index",
  );
});

test("requires funding strictly after deployment and no later than evmFundBy", () => {
  const state = authorizedState("USDC");
  const deployment = deploymentReceipt(state);
  const deploymentLogs = [lockCreatedLog(state)];
  const equalBlock = fundingReceipt(state, deployment, { blockNumber: deployment.blockNumber });
  const priorBlock = fundingReceipt(state, deployment, { blockNumber: deployment.blockNumber - 1n });
  assert.throws(() => bindEvmFundingReceipt(state, deployment, deploymentLogs, equalBlock), "same deployment block");
  assert.throws(() => bindEvmFundingReceipt(state, deployment, deploymentLogs, priorBlock), "before deployment block");

  const atCutoff = fundingReceipt(state, deployment, {
    blockTimestampSeconds: state.terms.evmFundBy,
  });
  const fact = bindEvmFundingReceipt(state, deployment, deploymentLogs, atCutoff);
  assert.equal(fact.executedAtSeconds, state.terms.evmFundBy);

  const afterCutoff = fundingReceipt(state, deployment, {
    blockTimestampSeconds: state.terms.evmFundBy + 1n,
  });
  assert.throws(() => bindEvmFundingReceipt(state, deployment, deploymentLogs, afterCutoff), "after evmFundBy");
});

test("caps receipt logs at 1024 and rejects duplicate or ambiguous indices", () => {
  const state = authorizedState("USDC");
  const deployment = deploymentReceipt(state);
  const deploymentLogs = [lockCreatedLog(state)];
  const receipt = fundingReceipt(state, deployment);
  const atLimitLogs = [
    fundedLog(state),
    ...Array.from({ length: 1023 }, (_, index) => unknownLog(state, BigInt(index + 1))),
  ];
  const atLimit = bindEvmFundingReceipt(state, deployment, deploymentLogs, { ...receipt, logs: atLimitLogs });
  assert.equal(atLimit.outputIndex, 0n);

  const overLimitLogs = [...atLimitLogs, unknownLog(state, 1024n)];
  assert.throws(
    () => bindEvmFundingReceipt(state, deployment, deploymentLogs, { ...receipt, logs: overLimitLogs }),
    "1024",
  );

  assert.throws(
    () => bindEvmFundingReceipt(state, deployment, deploymentLogs, {
      ...receipt,
      logs: [fundedLog(state), unknownLog(state, 0n)],
    }),
    "duplicate log index",
  );
  assert.throws(
    () => bindEvmFundingReceipt(state, deployment, deploymentLogs, {
      ...receipt,
      logs: [fundedLog(state), fundedLog(state, { logIndex: 1n })],
    }),
    "ambiguous funded logs",
  );
  assert.throws(
    () => bindEvmFundingReceipt(state, deployment, deploymentLogs, {
      ...receipt,
      logs: [fundedLog(state), unknownLog(state, 1n), unknownLog(state, 1n)],
    }),
    "duplicate log index",
  );

  const halfLimitData = `0x${"00".repeat(MAX_RECEIPT_DATA_BYTES / 2)}`;
  const overLimitData = `0x${"00".repeat(MAX_RECEIPT_DATA_BYTES / 2 + 1)}`;
  assert.throws(
    () => bindEvmFundingReceipt(state, deployment, deploymentLogs, {
      ...receipt,
      logs: [
        fundedLog(state),
        { ...unknownLog(state, 1n), data: halfLimitData },
        { ...unknownLog(state, 2n), data: overLimitData },
      ],
    }),
    "aggregate receipt data cap",
  );
});
