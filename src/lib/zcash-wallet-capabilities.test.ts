import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  NETWORK_ACTION_DISABLED_PENDING_QUALIFICATION,
  QUALIFICATION_RECEIPT_REQUIREMENT,
  TRANSPARENT_ZEC_MAINNET_WALLET_CAPABILITY_SCHEMA,
  UNVERIFIED_WALLET_CAPABILITY_ASSERTION,
  assessTransparentZecMainnetWalletCapabilityStatement,
  parseTransparentZecMainnetWalletCapabilityStatement,
} from "./zcash-wallet-capabilities.ts";

function capabilityStatement(): Record<string, unknown> {
  return {
    schema: TRANSPARENT_ZEC_MAINNET_WALLET_CAPABILITY_SCHEMA,
    network: "mainnet",
    asset: "ZEC",
    addressScope: "transparent-p2pkh",
    adapter: { id: "example-wallet-adapter", version: "1.2.3" },
    assertion: UNVERIFIED_WALLET_CAPABILITY_ASSERTION,
    capabilities: {
      sourceAddressControl: { supported: true, proofMethod: "transparent-message-signature" },
      pczt: { supportedVersions: [1, 2] },
      arbitraryP2sh: { fundingOutputs: true, spendingInputs: true },
      exactLocktime: { supported: true },
      transactionExtraction: { supported: true },
      broadcast: { supported: true },
      recoveryExport: {
        supported: true,
        format: "signed-artifacts-without-keys",
        includesKeyMaterial: false,
      },
    },
    networkActionPolicy: {
      transactionExtraction: NETWORK_ACTION_DISABLED_PENDING_QUALIFICATION,
      broadcast: NETWORK_ACTION_DISABLED_PENDING_QUALIFICATION,
      qualificationReceipt: QUALIFICATION_RECEIPT_REQUIREMENT,
    },
  };
}

function cloneStatement(): Record<string, unknown> {
  return structuredClone(capabilityStatement());
}

test("parses and freezes an explicit transparent-ZEC-mainnet capability statement", () => {
  const parsed = parseTransparentZecMainnetWalletCapabilityStatement(capabilityStatement());

  assert.equal(parsed.network, "mainnet");
  assert.equal(parsed.asset, "ZEC");
  assert.equal(parsed.addressScope, "transparent-p2pkh");
  assert.deepEqual(parsed.capabilities.pczt.supportedVersions, [1, 2]);
  assert.equal(parsed.capabilities.recoveryExport.includesKeyMaterial, false);
  assert.equal(parsed.networkActionPolicy.broadcast, NETWORK_ACTION_DISABLED_PENDING_QUALIFICATION);
  assert.equal(Object.isFrozen(parsed), true);
  assert.equal(Object.isFrozen(parsed.capabilities), true);
  assert.equal(Object.isFrozen(parsed.capabilities.pczt.supportedVersions), true);
});

test("a complete statement is still unqualified and cannot enable mainnet actions", () => {
  const assessment = assessTransparentZecMainnetWalletCapabilityStatement(capabilityStatement());

  assert.equal(assessment.statementValid, true);
  assert.equal(assessment.qualification, "not-assessed");
  assert.equal(assessment.mainnetFundsEnabled, false);
  assert.equal(assessment.transactionExtractionEnabled, false);
  assert.equal(assessment.broadcastEnabled, false);
  assert.equal(assessment.qualificationReceipt, QUALIFICATION_RECEIPT_REQUIREMENT);
  assert.deepEqual(assessment.missingCapabilities, []);
});

test("reports every explicitly unsupported capability without treating the statement as qualified", () => {
  const statement = cloneStatement();
  const capabilities = statement.capabilities as Record<string, unknown>;
  capabilities.sourceAddressControl = { supported: false, proofMethod: "none" };
  capabilities.pczt = { supportedVersions: [] };
  capabilities.arbitraryP2sh = { fundingOutputs: false, spendingInputs: false };
  capabilities.exactLocktime = { supported: false };
  capabilities.transactionExtraction = { supported: false };
  capabilities.broadcast = { supported: false };
  capabilities.recoveryExport = { supported: false, format: "none", includesKeyMaterial: false };

  const assessment = assessTransparentZecMainnetWalletCapabilityStatement(statement);
  assert.equal(assessment.qualification, "not-assessed");
  assert.equal(assessment.mainnetFundsEnabled, false);
  assert.deepEqual(assessment.missingCapabilities, [
    "source-address-control",
    "pczt",
    "arbitrary-p2sh-funding",
    "arbitrary-p2sh-spending",
    "exact-locktime",
    "transaction-extraction",
    "broadcast",
    "keyless-recovery-export",
  ]);
});

test("rejects any network, asset, or address scope other than transparent ZEC mainnet", () => {
  for (const [field, value] of [
    ["network", "testnet"],
    ["asset", "USDC"],
    ["addressScope", "unified"],
  ] as const) {
    const statement = cloneStatement();
    statement[field] = value;
    assert.throws(() => parseTransparentZecMainnetWalletCapabilityStatement(statement));
  }
});

test("rejects missing fields, unknown fields, accessors, and inline qualification receipts", () => {
  const missing = cloneStatement();
  delete (missing.capabilities as Record<string, unknown>).broadcast;
  assert.throws(
    () => parseTransparentZecMainnetWalletCapabilityStatement(missing),
    /missing or unsupported fields/,
  );

  const unknown = cloneStatement();
  unknown.privateKey = "not-accepted";
  assert.throws(
    () => parseTransparentZecMainnetWalletCapabilityStatement(unknown),
    /missing or unsupported fields/,
  );

  const inlineReceipt = cloneStatement();
  inlineReceipt.qualificationReceipt = { status: "passed" };
  assert.throws(
    () => parseTransparentZecMainnetWalletCapabilityStatement(inlineReceipt),
    /missing or unsupported fields/,
  );

  const accessor = cloneStatement();
  Object.defineProperty(accessor, "asset", { enumerable: true, get: () => "ZEC" });
  assert.throws(
    () => parseTransparentZecMainnetWalletCapabilityStatement(accessor),
    /enumerable data property/,
  );
});

test("rejects key material in recovery exports and anywhere outside the exact schema", () => {
  const recoveryWithKeys = cloneStatement();
  const capabilities = recoveryWithKeys.capabilities as Record<string, unknown>;
  capabilities.recoveryExport = {
    supported: true,
    format: "signed-artifacts-without-keys",
    includesKeyMaterial: true,
  };
  assert.throws(
    () => parseTransparentZecMainnetWalletCapabilityStatement(recoveryWithKeys),
    /must never contain key material/,
  );

  const nestedKey = cloneStatement();
  const adapter = nestedKey.adapter as Record<string, unknown>;
  adapter.viewingKey = "not-accepted";
  assert.throws(
    () => parseTransparentZecMainnetWalletCapabilityStatement(nestedKey),
    /missing or unsupported fields/,
  );
});

test("rejects inconsistent source-control and recovery-export declarations", () => {
  const sourceControl = cloneStatement();
  const sourceCapabilities = sourceControl.capabilities as Record<string, unknown>;
  sourceCapabilities.sourceAddressControl = { supported: true, proofMethod: "none" };
  assert.throws(
    () => parseTransparentZecMainnetWalletCapabilityStatement(sourceControl),
    /support and proofMethod are inconsistent/,
  );

  const recovery = cloneStatement();
  const recoveryCapabilities = recovery.capabilities as Record<string, unknown>;
  recoveryCapabilities.recoveryExport = {
    supported: false,
    format: "signed-artifacts-without-keys",
    includesKeyMaterial: false,
  };
  assert.throws(
    () => parseTransparentZecMainnetWalletCapabilityStatement(recovery),
    /support and format are inconsistent/,
  );
});

test("rejects unsupported, duplicate, or unsorted PCZT versions", () => {
  for (const versions of [[3], [1, 1], [2, 1]]) {
    const statement = cloneStatement();
    const capabilities = statement.capabilities as Record<string, unknown>;
    capabilities.pczt = { supportedVersions: versions };
    assert.throws(() => parseTransparentZecMainnetWalletCapabilityStatement(statement), /PCZT/);
  }

  const statement = cloneStatement();
  const capabilities = statement.capabilities as Record<string, unknown>;
  const versions = [1, 2];
  Object.assign(versions, { privateKey: "not-accepted" });
  capabilities.pczt = { supportedVersions: versions };
  assert.throws(
    () => parseTransparentZecMainnetWalletCapabilityStatement(statement),
    /unsupported properties/,
  );

  const accessorStatement = cloneStatement();
  const accessorCapabilities = accessorStatement.capabilities as Record<string, unknown>;
  const accessorVersions = [1, 2];
  Object.defineProperty(accessorVersions, "1", { enumerable: true, get: () => 2 });
  accessorCapabilities.pczt = { supportedVersions: accessorVersions };
  assert.throws(
    () => parseTransparentZecMainnetWalletCapabilityStatement(accessorStatement),
    /enumerable data properties/,
  );
});

test("network-action policy cannot self-enable extraction or broadcast", () => {
  for (const action of ["transactionExtraction", "broadcast"] as const) {
    const statement = cloneStatement();
    (statement.networkActionPolicy as Record<string, unknown>)[action] = "enabled";
    assert.throws(
      () => parseTransparentZecMainnetWalletCapabilityStatement(statement),
      /disabled-pending-qualification/,
    );
  }
});
