export const TRANSPARENT_ZEC_MAINNET_WALLET_CAPABILITY_SCHEMA =
  "phlebas-transparent-zec-mainnet-wallet-capabilities-v1" as const;

export const UNVERIFIED_WALLET_CAPABILITY_ASSERTION = "self-declared-unverified" as const;
export const QUALIFICATION_RECEIPT_REQUIREMENT = "required-separate-artifact" as const;
export const NETWORK_ACTION_DISABLED_PENDING_QUALIFICATION = "disabled-pending-qualification" as const;

export type PcztVersion = 1 | 2;

export type TransparentZecMainnetWalletCapabilityStatement = Readonly<{
  schema: typeof TRANSPARENT_ZEC_MAINNET_WALLET_CAPABILITY_SCHEMA;
  network: "mainnet";
  asset: "ZEC";
  addressScope: "transparent-p2pkh";
  adapter: Readonly<{
    id: string;
    version: string;
  }>;
  assertion: typeof UNVERIFIED_WALLET_CAPABILITY_ASSERTION;
  capabilities: Readonly<{
    sourceAddressControl: Readonly<{
      supported: boolean;
      proofMethod: "transparent-message-signature" | "none";
    }>;
    pczt: Readonly<{
      supportedVersions: readonly PcztVersion[];
    }>;
    arbitraryP2sh: Readonly<{
      fundingOutputs: boolean;
      spendingInputs: boolean;
    }>;
    exactLocktime: Readonly<{
      supported: boolean;
    }>;
    transactionExtraction: Readonly<{
      supported: boolean;
    }>;
    broadcast: Readonly<{
      supported: boolean;
    }>;
    recoveryExport: Readonly<{
      supported: boolean;
      format: "signed-artifacts-without-keys" | "none";
      includesKeyMaterial: false;
    }>;
  }>;
  networkActionPolicy: Readonly<{
    transactionExtraction: typeof NETWORK_ACTION_DISABLED_PENDING_QUALIFICATION;
    broadcast: typeof NETWORK_ACTION_DISABLED_PENDING_QUALIFICATION;
    qualificationReceipt: typeof QUALIFICATION_RECEIPT_REQUIREMENT;
  }>;
}>;

export type RequiredTransparentWalletCapability =
  | "source-address-control"
  | "pczt"
  | "arbitrary-p2sh-funding"
  | "arbitrary-p2sh-spending"
  | "exact-locktime"
  | "transaction-extraction"
  | "broadcast"
  | "keyless-recovery-export";

export type UnqualifiedWalletCapabilityAssessment = Readonly<{
  statementValid: true;
  qualification: "not-assessed";
  mainnetFundsEnabled: false;
  transactionExtractionEnabled: false;
  broadcastEnabled: false;
  qualificationReceipt: typeof QUALIFICATION_RECEIPT_REQUIREMENT;
  missingCapabilities: readonly RequiredTransparentWalletCapability[];
}>;

const ADAPTER_ID = /^[a-z0-9](?:[a-z0-9._-]{0,30}[a-z0-9])?$/;
const ADAPTER_VERSION = /^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/;

function plainRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be a plain object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${label} must be a plain object`);
  }
  return value as Record<string, unknown>;
}

function assertExactDataProperties(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  const actual = Reflect.ownKeys(value);
  if (actual.some((key) => typeof key !== "string")) {
    throw new TypeError(`${label} has missing or unsupported fields`);
  }
  const actualStrings = (actual as string[]).sort();
  const expectedStrings = [...expected].sort();
  if (
    actualStrings.length !== expectedStrings.length ||
    actualStrings.some((key, index) => key !== expectedStrings[index])
  ) {
    throw new TypeError(`${label} has missing or unsupported fields`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of expected) {
    const descriptor = descriptors[key];
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
      throw new TypeError(`${label}.${key} must be an enumerable data property`);
    }
  }
}

function exactString<T extends string>(value: unknown, expected: T, label: string): T {
  if (value !== expected) throw new TypeError(`${label} must be ${expected}`);
  return expected;
}

function booleanValue(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new TypeError(`${label} must be a boolean`);
  return value;
}

function adapterIdentifier(value: unknown, label: string): string {
  if (typeof value !== "string" || !ADAPTER_ID.test(value)) {
    throw new TypeError(`${label} must be a lowercase adapter identifier`);
  }
  return value;
}

function adapterVersion(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length > 64 || !ADAPTER_VERSION.test(value)) {
    throw new TypeError(`${label} must be a semantic version`);
  }
  return value;
}

function pcztVersions(value: unknown): readonly PcztVersion[] {
  if (!Array.isArray(value)) throw new TypeError("Wallet PCZT supportedVersions must be an array");
  if (value.length > 2) throw new TypeError("Wallet PCZT supportedVersions contains unsupported entries");
  const expectedKeys = ["length", ...Array.from({ length: value.length }, (_, index) => String(index))].sort();
  const actualKeys = Reflect.ownKeys(value);
  if (
    actualKeys.some((key) => typeof key !== "string") ||
    (actualKeys as string[]).sort().some((key, index) => key !== expectedKeys[index]) ||
    actualKeys.length !== expectedKeys.length
  ) {
    throw new TypeError("Wallet PCZT supportedVersions has unsupported properties");
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
      throw new TypeError("Wallet PCZT supportedVersions entries must be enumerable data properties");
    }
  }
  const parsed: PcztVersion[] = [];
  for (let index = 0; index < value.length; index += 1) {
    if (!(index in value)) throw new TypeError("Wallet PCZT supportedVersions must not contain holes");
    const version = value[index];
    if (version !== 1 && version !== 2) {
      throw new TypeError("Wallet PCZT supportedVersions may contain only versions 1 and 2");
    }
    if (parsed.includes(version)) throw new TypeError("Wallet PCZT supportedVersions must be unique");
    if (parsed.length > 0 && version < parsed[parsed.length - 1]) {
      throw new TypeError("Wallet PCZT supportedVersions must be in ascending order");
    }
    parsed.push(version);
  }
  return Object.freeze(parsed);
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}

export function parseTransparentZecMainnetWalletCapabilityStatement(
  value: unknown,
): TransparentZecMainnetWalletCapabilityStatement {
  const root = plainRecord(value, "Wallet capability statement");
  assertExactDataProperties(
    root,
    ["schema", "network", "asset", "addressScope", "adapter", "assertion", "capabilities", "networkActionPolicy"],
    "Wallet capability statement",
  );

  const adapter = plainRecord(root.adapter, "Wallet capability adapter");
  assertExactDataProperties(adapter, ["id", "version"], "Wallet capability adapter");

  const capabilities = plainRecord(root.capabilities, "Wallet capabilities");
  assertExactDataProperties(
    capabilities,
    [
      "sourceAddressControl",
      "pczt",
      "arbitraryP2sh",
      "exactLocktime",
      "transactionExtraction",
      "broadcast",
      "recoveryExport",
    ],
    "Wallet capabilities",
  );

  const sourceAddressControl = plainRecord(capabilities.sourceAddressControl, "Wallet source-address control");
  assertExactDataProperties(sourceAddressControl, ["supported", "proofMethod"], "Wallet source-address control");
  const sourceAddressControlSupported = booleanValue(
    sourceAddressControl.supported,
    "Wallet source-address control supported",
  );
  const sourceAddressControlProofMethod = sourceAddressControl.proofMethod;
  if (
    sourceAddressControlProofMethod !== "transparent-message-signature" &&
    sourceAddressControlProofMethod !== "none"
  ) {
    throw new TypeError("Wallet source-address control proofMethod is unsupported");
  }
  if (sourceAddressControlSupported !== (sourceAddressControlProofMethod === "transparent-message-signature")) {
    throw new TypeError("Wallet source-address control support and proofMethod are inconsistent");
  }

  const pczt = plainRecord(capabilities.pczt, "Wallet PCZT capability");
  assertExactDataProperties(pczt, ["supportedVersions"], "Wallet PCZT capability");
  const supportedPcztVersions = pcztVersions(pczt.supportedVersions);

  const arbitraryP2sh = plainRecord(capabilities.arbitraryP2sh, "Wallet arbitrary P2SH capability");
  assertExactDataProperties(arbitraryP2sh, ["fundingOutputs", "spendingInputs"], "Wallet arbitrary P2SH capability");

  const exactLocktime = plainRecord(capabilities.exactLocktime, "Wallet exact-locktime capability");
  assertExactDataProperties(exactLocktime, ["supported"], "Wallet exact-locktime capability");

  const transactionExtraction = plainRecord(
    capabilities.transactionExtraction,
    "Wallet transaction-extraction capability",
  );
  assertExactDataProperties(transactionExtraction, ["supported"], "Wallet transaction-extraction capability");

  const broadcast = plainRecord(capabilities.broadcast, "Wallet broadcast capability");
  assertExactDataProperties(broadcast, ["supported"], "Wallet broadcast capability");

  const recoveryExport = plainRecord(capabilities.recoveryExport, "Wallet recovery-export capability");
  assertExactDataProperties(
    recoveryExport,
    ["supported", "format", "includesKeyMaterial"],
    "Wallet recovery-export capability",
  );
  const recoveryExportSupported = booleanValue(recoveryExport.supported, "Wallet recovery-export supported");
  if (recoveryExport.format !== "signed-artifacts-without-keys" && recoveryExport.format !== "none") {
    throw new TypeError("Wallet recovery-export format is unsupported");
  }
  if (recoveryExport.includesKeyMaterial !== false) {
    throw new TypeError("Wallet recovery export must never contain key material");
  }
  if (recoveryExportSupported !== (recoveryExport.format === "signed-artifacts-without-keys")) {
    throw new TypeError("Wallet recovery-export support and format are inconsistent");
  }

  const networkActionPolicy = plainRecord(root.networkActionPolicy, "Wallet network-action policy");
  assertExactDataProperties(
    networkActionPolicy,
    ["transactionExtraction", "broadcast", "qualificationReceipt"],
    "Wallet network-action policy",
  );

  const parsed: TransparentZecMainnetWalletCapabilityStatement = {
    schema: exactString(
      root.schema,
      TRANSPARENT_ZEC_MAINNET_WALLET_CAPABILITY_SCHEMA,
      "Wallet capability schema",
    ),
    network: exactString(root.network, "mainnet", "Wallet capability network"),
    asset: exactString(root.asset, "ZEC", "Wallet capability asset"),
    addressScope: exactString(root.addressScope, "transparent-p2pkh", "Wallet capability addressScope"),
    adapter: {
      id: adapterIdentifier(adapter.id, "Wallet capability adapter id"),
      version: adapterVersion(adapter.version, "Wallet capability adapter version"),
    },
    assertion: exactString(
      root.assertion,
      UNVERIFIED_WALLET_CAPABILITY_ASSERTION,
      "Wallet capability assertion",
    ),
    capabilities: {
      sourceAddressControl: {
        supported: sourceAddressControlSupported,
        proofMethod: sourceAddressControlProofMethod,
      },
      pczt: { supportedVersions: supportedPcztVersions },
      arbitraryP2sh: {
        fundingOutputs: booleanValue(arbitraryP2sh.fundingOutputs, "Wallet arbitrary P2SH fundingOutputs"),
        spendingInputs: booleanValue(arbitraryP2sh.spendingInputs, "Wallet arbitrary P2SH spendingInputs"),
      },
      exactLocktime: {
        supported: booleanValue(exactLocktime.supported, "Wallet exact-locktime supported"),
      },
      transactionExtraction: {
        supported: booleanValue(
          transactionExtraction.supported,
          "Wallet transaction-extraction supported",
        ),
      },
      broadcast: {
        supported: booleanValue(broadcast.supported, "Wallet broadcast supported"),
      },
      recoveryExport: {
        supported: recoveryExportSupported,
        format: recoveryExport.format,
        includesKeyMaterial: false,
      },
    },
    networkActionPolicy: {
      transactionExtraction: exactString(
        networkActionPolicy.transactionExtraction,
        NETWORK_ACTION_DISABLED_PENDING_QUALIFICATION,
        "Wallet transaction-extraction policy",
      ),
      broadcast: exactString(
        networkActionPolicy.broadcast,
        NETWORK_ACTION_DISABLED_PENDING_QUALIFICATION,
        "Wallet broadcast policy",
      ),
      qualificationReceipt: exactString(
        networkActionPolicy.qualificationReceipt,
        QUALIFICATION_RECEIPT_REQUIREMENT,
        "Wallet qualification-receipt policy",
      ),
    },
  };
  return deepFreeze(parsed);
}

export function assessTransparentZecMainnetWalletCapabilityStatement(
  value: unknown,
): UnqualifiedWalletCapabilityAssessment {
  const statement = parseTransparentZecMainnetWalletCapabilityStatement(value);
  const missingCapabilities: RequiredTransparentWalletCapability[] = [];
  if (!statement.capabilities.sourceAddressControl.supported) missingCapabilities.push("source-address-control");
  if (statement.capabilities.pczt.supportedVersions.length === 0) missingCapabilities.push("pczt");
  if (!statement.capabilities.arbitraryP2sh.fundingOutputs) missingCapabilities.push("arbitrary-p2sh-funding");
  if (!statement.capabilities.arbitraryP2sh.spendingInputs) missingCapabilities.push("arbitrary-p2sh-spending");
  if (!statement.capabilities.exactLocktime.supported) missingCapabilities.push("exact-locktime");
  if (!statement.capabilities.transactionExtraction.supported) missingCapabilities.push("transaction-extraction");
  if (!statement.capabilities.broadcast.supported) missingCapabilities.push("broadcast");
  if (!statement.capabilities.recoveryExport.supported) missingCapabilities.push("keyless-recovery-export");

  return deepFreeze({
    statementValid: true,
    qualification: "not-assessed",
    mainnetFundsEnabled: false,
    transactionExtractionEnabled: false,
    broadcastEnabled: false,
    qualificationReceipt: QUALIFICATION_RECEIPT_REQUIREMENT,
    missingCapabilities,
  });
}
