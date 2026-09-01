import nativeZecUsdcMatcherManifestJson from "../../infra/matcher/native-zec-usdc.json" with { type: "json" };

import {
  type AtomicSwapPair,
  type ExactAsset,
} from "./atomic-swap-plan.ts";
import {
  createOrderDomain,
  hashOrderDomain,
  type OrderDomain,
} from "./eip712-order.ts";
import { keccak256Text } from "./keccak.ts";
import {
  ETHEREUM_MAINNET_CHAIN_ID,
  ETHEREUM_MAINNET_NETWORK,
  ETHEREUM_MAINNET_USDC_ASSET,
  NATIVE_ZEC_ASSET as MAINNET_ZEC_ASSET,
  ZCASH_MAINNET_NETWORK,
} from "./mainnet-assets.ts";
import {
  UINT64_MAX,
  UINT256_MAX,
  adapterIdentifier,
  assetIdentifier,
  chainIdentifier,
  normalizeAddress,
  normalizeHex32,
  type Hex32,
} from "./order-domain.ts";

export const NATIVE_ZEC_USDC_MATCHER_SCHEMA_VERSION = "1.0.0" as const;
export const NATIVE_ZEC_USDC_MATCHER_MANIFEST_TYPE = "native-zec-usdc-matcher-deployment" as const;
export const NATIVE_ZEC_USDC_MATCHER_SCHEMA_URL = "https://json-schema.org/draft/2020-12/schema" as const;

export const NATIVE_ZEC_NETWORK = ZCASH_MAINNET_NETWORK;
export const NATIVE_ZEC_ASSET = MAINNET_ZEC_ASSET;
export const NATIVE_USDC_ASSET = ETHEREUM_MAINNET_USDC_ASSET;
export const NATIVE_ZEC_USDC_MARKET_ID = "ZEC/USDC" as const;
export const NATIVE_ZEC_USDC_SETTLEMENT_PAIR = "ZEC-USDC" as const;
export const NATIVE_ZEC_USDC_PROTOCOL_VERSION = "transparent-htlc-v1" as const;
export const NATIVE_ZEC_USDC_ADAPTER_ID = adapterIdentifier(NATIVE_ZEC_USDC_PROTOCOL_VERSION);

const ZERO_HEX32 = `0x${"00".repeat(32)}`;
const DECIMAL = /^(0|[1-9][0-9]*)$/;
const POSITIVE_DECIMAL = /^[1-9][0-9]*$/;
const MAX_SAFE_COUNT = 1_000_000;
const MAX_ROUTE_FILLS = 128;
const MAX_SOLVER_FILLS = 128;
const MAX_BPS = 10_000n;

type ManifestAsset = Readonly<{
  network: string;
  asset: string;
  environment: "testnet" | "mainnet";
  decimals: number;
}>;

export type NativeZecUsdcMatcherManifest = Readonly<{
  $schema: typeof NATIVE_ZEC_USDC_MATCHER_SCHEMA_URL;
  schemaVersion: typeof NATIVE_ZEC_USDC_MATCHER_SCHEMA_VERSION;
  manifestType: typeof NATIVE_ZEC_USDC_MATCHER_MANIFEST_TYPE;
  deployed: boolean;
  submissionEnabled: boolean;
  orderDomain: Readonly<{
    name: "Phlebas Order Intent";
    version: "1";
  }>;
  evm: Readonly<{
    network: typeof ETHEREUM_MAINNET_NETWORK;
    chainId: 1;
    verifyingContract: string | null;
  }>;
  market: Readonly<{
    id: typeof NATIVE_ZEC_USDC_MARKET_ID;
    settlementPair: typeof NATIVE_ZEC_USDC_SETTLEMENT_PAIR;
    base: ManifestAsset;
    quote: ManifestAsset;
  }>;
  configurationHash: Hex32 | null;
  settlement: Readonly<{
    protocolVersion: typeof NATIVE_ZEC_USDC_PROTOCOL_VERSION;
    adapterId: Hex32;
    stablecoinRefundDelaySeconds: string;
    zcashRefundSafetyDeltaSeconds: string;
    zcashRequiredConfirmations: number;
    quoteRequiredConfirmations: number;
  }>;
  limits: Readonly<{
    minimumBaseAmountAtoms: string;
    maximumBaseAmountAtoms: string;
    maximumAcceptedOrders: number;
    maximumOpenOrders: number;
    maximumOpenOrdersPerAccount: number;
    maximumSolverQuotes: number;
    maximumRouteFills: number;
    maximumSolverFills: number;
    maximumOrderLifetimeSeconds: string;
    maximumSolverLifetimeSeconds: string;
    maximumSolverCapacityBaseAtoms: string;
    maximumSolverFeeBps: string;
    maximumSolverSlippageBps: string;
  }>;
}>;

export type NativeZecUsdcMatcherLimits = Readonly<{
  minimumBaseAmountAtoms: bigint;
  maximumBaseAmountAtoms: bigint;
  maximumAcceptedOrders: number;
  maximumOpenOrders: number;
  maximumOpenOrdersPerAccount: number;
  maximumSolverQuotes: number;
  maximumRouteFills: number;
  maximumSolverFills: number;
  maximumOrderLifetimeSeconds: bigint;
  maximumSolverLifetimeSeconds: bigint;
  maximumSolverCapacityBaseAtoms: bigint;
  maximumSolverFeeBps: bigint;
  maximumSolverSlippageBps: bigint;
}>;

export type NativeZecUsdcMatcherIdentity = Readonly<{
  configurationHash: Hex32;
  orderDomain: OrderDomain;
  market: AtomicSwapPair;
  settlementAdapterId: Hex32;
}>;

export type NativeZecUsdcMatcherDeploymentState = Readonly<{
  manifest: NativeZecUsdcMatcherManifest;
  deployed: boolean;
  submissionEnabled: boolean;
  enabled: boolean;
  configured: boolean;
  state: "disabled" | "enabled";
  reason: "manifest-disabled" | "submission-disabled";
  orderDomain: OrderDomain | null;
  market: AtomicSwapPair;
  orderPair: Readonly<{
    baseChainId: Hex32;
    baseAssetId: Hex32;
    quoteChainId: Hex32;
    quoteAssetId: Hex32;
  }>;
  configurationHash: Hex32 | null;
  settlementProtocolVersion: typeof NATIVE_ZEC_USDC_PROTOCOL_VERSION;
  settlementAdapterId: Hex32;
  limits: NativeZecUsdcMatcherLimits;
  expectedMatcher: NativeZecUsdcMatcherIdentity | null;
}>;

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be a plain object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${label} must be a plain object`);
  }
  return value as Record<string, unknown>;
}

function assertExactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const allowed = [...expected].sort();
  if (actual.length !== allowed.length || actual.some((key, index) => key !== allowed[index])) {
    throw new TypeError(`${label} has missing or unsupported fields`);
  }
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== "string") throw new TypeError(`${label} must be a string`);
  return value;
}

function exactString(value: unknown, expected: string, label: string): string {
  const actual = stringValue(value, label);
  if (actual !== expected) throw new Error(`${label} does not match the native ZEC/USDC manifest`);
  return actual;
}

function booleanValue(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new TypeError(`${label} must be a boolean`);
  return value;
}

function safeInteger(value: unknown, label: string, maximum = MAX_SAFE_COUNT): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new RangeError(`${label} must be a positive bounded integer`);
  }
  return value;
}

function decimalValue(value: unknown, label: string, positive = false, maximum = UINT256_MAX): bigint {
  const actual = stringValue(value, label);
  const pattern = positive ? POSITIVE_DECIMAL : DECIMAL;
  if (!pattern.test(actual)) throw new TypeError(`${label} must be a canonical unsigned decimal string`);
  const parsed = BigInt(actual);
  if (parsed > maximum) throw new RangeError(`${label} exceeds its integer range`);
  return parsed;
}

function canonicalAddress(value: unknown, label: string): string | null {
  if (value === null) return null;
  const actual = stringValue(value, label);
  const normalized = normalizeAddress(actual, label);
  if (actual !== normalized) throw new TypeError(`${label} must use canonical lowercase hexadecimal`);
  if (normalized === `0x${"00".repeat(20)}`) throw new RangeError(`${label} cannot be zero`);
  return normalized;
}

function canonicalHex32(value: unknown, label: string): Hex32 {
  const actual = stringValue(value, label);
  const normalized = normalizeHex32(actual, label);
  if (actual !== normalized) throw new TypeError(`${label} must use canonical lowercase hexadecimal`);
  if (normalized === ZERO_HEX32) throw new RangeError(`${label} cannot be zero`);
  return normalized;
}

function nullableHex32(value: unknown, label: string): Hex32 | null {
  return value === null ? null : canonicalHex32(value, label);
}

function exactAsset(value: unknown, expected: ManifestAsset, label: string): ManifestAsset {
  const asset = objectValue(value, label);
  assertExactKeys(asset, ["network", "asset", "environment", "decimals"], label);
  exactString(asset.network, expected.network, `${label} network`);
  exactString(asset.asset, expected.asset, `${label} identifier`);
  exactString(asset.environment, expected.environment, `${label} environment`);
  if (asset.decimals !== expected.decimals) throw new Error(`${label} decimals do not match the native ZEC/USDC manifest`);
  chainIdentifier(expected.network);
  assetIdentifier(expected.asset);
  return expected;
}

function parseManifest(value: unknown): NativeZecUsdcMatcherManifest {
  const manifest = objectValue(value, "Native ZEC/USDC matcher manifest");
  assertExactKeys(manifest, [
    "$schema",
    "schemaVersion",
    "manifestType",
    "deployed",
    "submissionEnabled",
    "orderDomain",
    "evm",
    "market",
    "configurationHash",
    "settlement",
    "limits",
  ], "Native ZEC/USDC matcher manifest");

  exactString(manifest.$schema, NATIVE_ZEC_USDC_MATCHER_SCHEMA_URL, "Manifest $schema");
  exactString(manifest.schemaVersion, NATIVE_ZEC_USDC_MATCHER_SCHEMA_VERSION, "Manifest schema version");
  exactString(manifest.manifestType, NATIVE_ZEC_USDC_MATCHER_MANIFEST_TYPE, "Manifest type");
  const deployed = booleanValue(manifest.deployed, "Manifest deployed flag");
  const submissionEnabled = booleanValue(manifest.submissionEnabled, "Manifest submission flag");

  const orderDomainValue = objectValue(manifest.orderDomain, "Manifest order domain");
  assertExactKeys(orderDomainValue, ["name", "version"], "Manifest order domain");
  exactString(orderDomainValue.name, "Phlebas Order Intent", "Manifest order domain name");
  exactString(orderDomainValue.version, "1", "Manifest order domain version");

  const evm = objectValue(manifest.evm, "Manifest EVM identity");
  assertExactKeys(evm, ["network", "chainId", "verifyingContract"], "Manifest EVM identity");
  exactString(evm.network, ETHEREUM_MAINNET_NETWORK, "Manifest EVM network");
  if (evm.chainId !== Number(ETHEREUM_MAINNET_CHAIN_ID)) {
    throw new Error("Manifest EVM chain ID does not match Ethereum Mainnet");
  }
  const verifyingContract = canonicalAddress(evm.verifyingContract, "Manifest verifying contract");

  const market = objectValue(manifest.market, "Manifest market");
  assertExactKeys(market, ["id", "settlementPair", "base", "quote"], "Manifest market");
  exactString(market.id, NATIVE_ZEC_USDC_MARKET_ID, "Manifest market ID");
  exactString(market.settlementPair, NATIVE_ZEC_USDC_SETTLEMENT_PAIR, "Manifest settlement pair");
  const expectedBase: ManifestAsset = {
    network: NATIVE_ZEC_NETWORK,
    asset: NATIVE_ZEC_ASSET,
    environment: "mainnet",
    decimals: 8,
  };
  const expectedQuote: ManifestAsset = {
    network: ETHEREUM_MAINNET_NETWORK,
    asset: NATIVE_USDC_ASSET,
    environment: "mainnet",
    decimals: 6,
  };
  const base = exactAsset(market.base, expectedBase, "Manifest base asset");
  const quote = exactAsset(market.quote, expectedQuote, "Manifest quote asset");
  if (quote.network !== evm.network) throw new Error("Manifest quote network does not match the EVM network");

  const configurationHash = nullableHex32(manifest.configurationHash, "Manifest configuration hash");

  const settlement = objectValue(manifest.settlement, "Manifest settlement policy");
  assertExactKeys(settlement, [
    "protocolVersion",
    "adapterId",
    "stablecoinRefundDelaySeconds",
    "zcashRefundSafetyDeltaSeconds",
    "zcashRequiredConfirmations",
    "quoteRequiredConfirmations",
  ], "Manifest settlement policy");
  exactString(settlement.protocolVersion, NATIVE_ZEC_USDC_PROTOCOL_VERSION, "Manifest settlement protocol");
  const adapterId = canonicalHex32(settlement.adapterId, "Manifest settlement adapter ID");
  if (adapterId !== NATIVE_ZEC_USDC_ADAPTER_ID) throw new Error("Manifest settlement adapter ID is not the configured protocol adapter");
  const stablecoinRefundDelaySeconds = decimalValue(settlement.stablecoinRefundDelaySeconds, "Stablecoin refund delay", true, UINT64_MAX);
  const zcashRefundSafetyDeltaSeconds = decimalValue(settlement.zcashRefundSafetyDeltaSeconds, "Zcash refund safety delta", true, UINT64_MAX);
  const zcashRequiredConfirmations = safeInteger(settlement.zcashRequiredConfirmations, "Zcash confirmations", 10_000);
  const quoteRequiredConfirmations = safeInteger(settlement.quoteRequiredConfirmations, "Quote confirmations", 10_000);

  const limits = objectValue(manifest.limits, "Manifest matcher limits");
  assertExactKeys(limits, [
    "minimumBaseAmountAtoms",
    "maximumBaseAmountAtoms",
    "maximumAcceptedOrders",
    "maximumOpenOrders",
    "maximumOpenOrdersPerAccount",
    "maximumSolverQuotes",
    "maximumRouteFills",
    "maximumSolverFills",
    "maximumOrderLifetimeSeconds",
    "maximumSolverLifetimeSeconds",
    "maximumSolverCapacityBaseAtoms",
    "maximumSolverFeeBps",
    "maximumSolverSlippageBps",
  ], "Manifest matcher limits");
  const minimumBaseAmountAtoms = decimalValue(limits.minimumBaseAmountAtoms, "Minimum base amount", true);
  const maximumBaseAmountAtoms = decimalValue(limits.maximumBaseAmountAtoms, "Maximum base amount", true);
  if (maximumBaseAmountAtoms < minimumBaseAmountAtoms) throw new RangeError("Maximum base amount cannot be below the minimum");
  const maximumAcceptedOrders = safeInteger(limits.maximumAcceptedOrders, "Maximum accepted orders");
  const maximumOpenOrders = safeInteger(limits.maximumOpenOrders, "Maximum open orders");
  const maximumOpenOrdersPerAccount = safeInteger(limits.maximumOpenOrdersPerAccount, "Maximum open orders per account");
  const maximumSolverQuotes = safeInteger(limits.maximumSolverQuotes, "Maximum solver quotes");
  const maximumRouteFills = safeInteger(limits.maximumRouteFills, "Maximum route fills", MAX_ROUTE_FILLS);
  const maximumSolverFills = safeInteger(limits.maximumSolverFills, "Maximum solver fills", MAX_SOLVER_FILLS);
  if (maximumOpenOrdersPerAccount > maximumOpenOrders) throw new RangeError("Per-account open-order limit exceeds the global limit");
  if (maximumSolverFills > maximumRouteFills) throw new RangeError("Solver fill limit exceeds the route fill limit");
  const maximumOrderLifetimeSeconds = decimalValue(limits.maximumOrderLifetimeSeconds, "Maximum order lifetime", true, UINT64_MAX);
  const maximumSolverLifetimeSeconds = decimalValue(limits.maximumSolverLifetimeSeconds, "Maximum solver lifetime", true, UINT64_MAX);
  const maximumSolverCapacityBaseAtoms = decimalValue(limits.maximumSolverCapacityBaseAtoms, "Maximum solver capacity", true);
  const maximumSolverFeeBps = decimalValue(limits.maximumSolverFeeBps, "Maximum solver fee", false, MAX_BPS);
  const maximumSolverSlippageBps = decimalValue(limits.maximumSolverSlippageBps, "Maximum solver slippage", false, MAX_BPS);
  if (maximumSolverFeeBps !== 0n) throw new Error("Manifest solver fee must remain zero");
  if (maximumSolverSlippageBps !== 2_000n) throw new Error("Manifest solver slippage must remain 2,000 basis points");

  if (submissionEnabled && !deployed) throw new Error("Matcher submission cannot be enabled before deployment is committed");
  if ((verifyingContract === null) !== (configurationHash === null)) {
    throw new Error("Manifest verifying contract and configuration hash must be committed together");
  }

  const canonical: NativeZecUsdcMatcherManifest = {
    $schema: NATIVE_ZEC_USDC_MATCHER_SCHEMA_URL,
    schemaVersion: NATIVE_ZEC_USDC_MATCHER_SCHEMA_VERSION,
    manifestType: NATIVE_ZEC_USDC_MATCHER_MANIFEST_TYPE,
    deployed,
    submissionEnabled,
    orderDomain: { name: "Phlebas Order Intent", version: "1" },
    evm: { network: ETHEREUM_MAINNET_NETWORK, chainId: 1, verifyingContract },
    market: {
      id: NATIVE_ZEC_USDC_MARKET_ID,
      settlementPair: NATIVE_ZEC_USDC_SETTLEMENT_PAIR,
      base,
      quote,
    },
    configurationHash,
    settlement: {
      protocolVersion: NATIVE_ZEC_USDC_PROTOCOL_VERSION,
      adapterId,
      stablecoinRefundDelaySeconds: stablecoinRefundDelaySeconds.toString(),
      zcashRefundSafetyDeltaSeconds: zcashRefundSafetyDeltaSeconds.toString(),
      zcashRequiredConfirmations,
      quoteRequiredConfirmations,
    },
    limits: {
      minimumBaseAmountAtoms: minimumBaseAmountAtoms.toString(),
      maximumBaseAmountAtoms: maximumBaseAmountAtoms.toString(),
      maximumAcceptedOrders,
      maximumOpenOrders,
      maximumOpenOrdersPerAccount,
      maximumSolverQuotes,
      maximumRouteFills,
      maximumSolverFills,
      maximumOrderLifetimeSeconds: maximumOrderLifetimeSeconds.toString(),
      maximumSolverLifetimeSeconds: maximumSolverLifetimeSeconds.toString(),
      maximumSolverCapacityBaseAtoms: maximumSolverCapacityBaseAtoms.toString(),
      maximumSolverFeeBps: maximumSolverFeeBps.toString(),
      maximumSolverSlippageBps: maximumSolverSlippageBps.toString(),
    },
  };

  if (verifyingContract !== null && configurationHash !== null) {
    const orderDomain = createOrderDomain(ETHEREUM_MAINNET_CHAIN_ID, verifyingContract);
    const expectedHash = configurationHashForCanonicalManifest(canonical, orderDomain);
    if (configurationHash !== expectedHash) throw new Error("Manifest configuration hash does not match its exact fields");
  }
  if (deployed && (verifyingContract === null || configurationHash === null)) {
    throw new Error("Deployed matcher manifest requires a verifying contract and configuration hash");
  }
  return canonical;
}

function configurationHashForCanonicalManifest(
  manifest: NativeZecUsdcMatcherManifest,
  orderDomain: OrderDomain,
): Hex32 {
  const limits = manifest.limits;
  const settlement = manifest.settlement;
  const domainHash = hashOrderDomain(orderDomain);
  return keccak256Text([
    "PhlebasPersistentMatcherConfiguration",
    "version=1",
    `domain=${domainHash}`,
    `solverDomain=${domainHash}`,
    `base=${manifest.market.base.network}:${manifest.market.base.asset}:${manifest.market.base.environment}:${manifest.market.base.decimals}`,
    `quote=${manifest.market.quote.network}:${manifest.market.quote.asset}:${manifest.market.quote.environment}:${manifest.market.quote.decimals}`,
    `protocol=${settlement.protocolVersion}`,
    `refunds=${settlement.stablecoinRefundDelaySeconds}:${settlement.zcashRefundSafetyDeltaSeconds}`,
    `confirmations=${settlement.zcashRequiredConfirmations}:${settlement.quoteRequiredConfirmations}`,
    `orderLifetime=${limits.maximumOrderLifetimeSeconds}`,
    `solverLifetime=${limits.maximumSolverLifetimeSeconds}`,
    `solverCapacity=${limits.maximumSolverCapacityBaseAtoms}`,
    `solverCaps=${limits.maximumSolverFeeBps}:${limits.maximumSolverSlippageBps}`,
    `limits=${limits.minimumBaseAmountAtoms}:${limits.maximumBaseAmountAtoms}:${limits.maximumAcceptedOrders}:${limits.maximumOpenOrders}:${limits.maximumOpenOrdersPerAccount}:${limits.maximumSolverQuotes}:${limits.maximumRouteFills}:${limits.maximumSolverFills}`,
  ].join("\n") as string) as Hex32;
}

export function computeNativeZecUsdcMatcherConfigurationHash(verifyingContract: string): Hex32 {
  const normalized = canonicalAddress(verifyingContract, "Matcher verifying contract");
  if (normalized === null) throw new TypeError("Matcher verifying contract is required");
  const source = parseManifest(nativeZecUsdcMatcherManifestJson);
  const orderDomain = createOrderDomain(BigInt(source.evm.chainId), normalized);
  return configurationHashForCanonicalManifest(source, orderDomain);
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  }
  return value;
}

export function parseNativeZecUsdcMatcherManifest(value: unknown): NativeZecUsdcMatcherDeploymentState {
  const manifest = parseManifest(value);
  const market: AtomicSwapPair = {
    base: manifest.market.base as ExactAsset,
    quote: manifest.market.quote as ExactAsset,
  };
  const orderPair = {
    baseChainId: chainIdentifier(market.base.network),
    baseAssetId: assetIdentifier(market.base.asset),
    quoteChainId: chainIdentifier(market.quote.network),
    quoteAssetId: assetIdentifier(market.quote.asset),
  } as const;
  const orderDomain = manifest.evm.verifyingContract === null
    ? null
    : createOrderDomain(BigInt(manifest.evm.chainId), manifest.evm.verifyingContract);
  const limits: NativeZecUsdcMatcherLimits = {
    minimumBaseAmountAtoms: BigInt(manifest.limits.minimumBaseAmountAtoms),
    maximumBaseAmountAtoms: BigInt(manifest.limits.maximumBaseAmountAtoms),
    maximumAcceptedOrders: manifest.limits.maximumAcceptedOrders,
    maximumOpenOrders: manifest.limits.maximumOpenOrders,
    maximumOpenOrdersPerAccount: manifest.limits.maximumOpenOrdersPerAccount,
    maximumSolverQuotes: manifest.limits.maximumSolverQuotes,
    maximumRouteFills: manifest.limits.maximumRouteFills,
    maximumSolverFills: manifest.limits.maximumSolverFills,
    maximumOrderLifetimeSeconds: BigInt(manifest.limits.maximumOrderLifetimeSeconds),
    maximumSolverLifetimeSeconds: BigInt(manifest.limits.maximumSolverLifetimeSeconds),
    maximumSolverCapacityBaseAtoms: BigInt(manifest.limits.maximumSolverCapacityBaseAtoms),
    maximumSolverFeeBps: BigInt(manifest.limits.maximumSolverFeeBps),
    maximumSolverSlippageBps: BigInt(manifest.limits.maximumSolverSlippageBps),
  };
  const enabled = manifest.deployed && manifest.submissionEnabled && orderDomain !== null && manifest.configurationHash !== null;
  const expectedMatcher = enabled
    ? {
      configurationHash: manifest.configurationHash as Hex32,
      orderDomain,
      market,
      settlementAdapterId: manifest.settlement.adapterId,
    }
    : null;
  return deepFreeze({
    manifest,
    deployed: manifest.deployed,
    submissionEnabled: manifest.submissionEnabled,
    enabled,
    configured: manifest.evm.verifyingContract !== null && manifest.configurationHash !== null,
    state: enabled ? "enabled" : "disabled",
    reason: manifest.submissionEnabled && manifest.deployed ? "submission-disabled" : "manifest-disabled",
    orderDomain,
    market,
    orderPair,
    configurationHash: manifest.configurationHash,
    settlementProtocolVersion: manifest.settlement.protocolVersion,
    settlementAdapterId: manifest.settlement.adapterId,
    limits,
    expectedMatcher,
  });
}

export const NATIVE_ZEC_USDC_MATCHER_MANIFEST = nativeZecUsdcMatcherManifestJson as NativeZecUsdcMatcherManifest;
export const NATIVE_ZEC_USDC_MATCHER_DEPLOYMENT = parseNativeZecUsdcMatcherManifest(NATIVE_ZEC_USDC_MATCHER_MANIFEST);
