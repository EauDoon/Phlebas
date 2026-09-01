import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import test from "node:test";

import {
  MANIFEST_PATH,
  SCHEMA_PATH,
  isValidManifest,
  readJson,
  sha256Hex,
  validateManifest,
  validateManifestFile,
  validateEvidenceFiles,
} from "./validate-conditional-lock-manifest.mjs";

const baseManifest = await readJson(MANIFEST_PATH);
const packageJsonBytes = await readFile(new URL("../package.json", import.meta.url));
const sourceBytes = await readFile(new URL("../contracts/src/swap/ConditionalLock.sol", import.meta.url));
const dependencyLockBytes = await readFile(new URL("../package-lock.json", import.meta.url));
const compilerSettingsBytes = await readFile(new URL("../contracts/foundry.toml", import.meta.url));
const schema = await readJson(SCHEMA_PATH);
const repositoryRoot = new URL("..", import.meta.url);
const currentCommit = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: repositoryRoot,
  encoding: "utf8",
}).trim();

function copyManifest() {
  return structuredClone(baseManifest);
}

function assertRejected(manifest, expectedPath) {
  const errors = validateManifest(manifest);
  assert.ok(errors.length > 0, "mutation must be rejected");
  if (expectedPath) assert.ok(errors.some((error) => error.startsWith(`${expectedPath}:`)), errors.join("\n"));
}

function completeDeployedManifest() {
  const manifest = copyManifest();
  manifest.deployed = true;
  manifest.compiler.solidityLongVersion = "0.8.28+commit.7893614a";
  manifest.compiler.foundry = "1.8.1";
  manifest.build.standardJsonInputPath = "package.json";
  manifest.build.sourceSha256 = sha256Hex(sourceBytes);
  manifest.build.standardJsonInputSha256 = sha256Hex(packageJsonBytes);
  manifest.build.dependencyLockSha256 = sha256Hex(dependencyLockBytes);
  manifest.build.compilerSettingsSha256 = sha256Hex(compilerSettingsBytes);
  manifest.terms.values = {
    swapId: `0x${"01".repeat(32)}`,
    termsHash: `0x${"02".repeat(32)}`,
    token: "0x1111111111111111111111111111111111111111",
    funder: "0x2222222222222222222222222222222222222222",
    claimRecipient: "0x3333333333333333333333333333333333333333",
    refundRecipient: "0x2222222222222222222222222222222222222222",
    amount: "1",
    hashlock: `0x${"03".repeat(32)}`,
    fundingCutoff: "1",
    claimCutoff: "2",
    refundTime: "4",
  };
  const constructorArguments = `0x${[
    "01".repeat(32),
    "02".repeat(32),
    "0".repeat(24) + "11".repeat(20),
    "0".repeat(24) + "22".repeat(20),
    "0".repeat(24) + "33".repeat(20),
    "0".repeat(24) + "22".repeat(20),
    "0".repeat(63) + "1",
    "03".repeat(32),
    "0".repeat(63) + "1",
    "0".repeat(63) + "2",
    "0".repeat(63) + "4",
  ].join("")}`;
  const creationBytecode = "0x6000";
  const runtimeBytecode = "0x6001";
  manifest.deployment = {
    network: "local-test",
    chainId: "31337",
    address: "0x4444444444444444444444444444444444444444",
    transactionHash: `0x${"04".repeat(32)}`,
    blockNumber: "1",
    blockHash: `0x${"05".repeat(32)}`,
    deployer: "0x5555555555555555555555555555555555555555",
    receiptStatus: "0x1",
    sourceCommit: currentCommit,
    constructorArguments,
    artifactPath: "package.json",
    artifactSha256: sha256Hex(packageJsonBytes),
    creationBytecode,
    creationBytecodeSha256: sha256Hex(creationBytecode),
    runtimeBytecode,
    runtimeBytecodeSha256: sha256Hex(runtimeBytecode),
    constructorArgumentsSha256: sha256Hex(constructorArguments),
    initCodeSha256: sha256Hex(`${creationBytecode}${constructorArguments.slice(2)}`),
    receiptVerified: true,
    sourceVerified: true,
    constructorArgumentsVerified: true,
    runtimeBytecodeVerified: true,
  };
  return manifest;
}

test("checked-in manifest and schema are valid", async () => {
  const { errors } = await validateManifestFile();
  assert.deepEqual(errors, []);
  assert.equal(await isValidManifest(baseManifest), true);
  assert.equal(await isValidManifest(completeDeployedManifest(), schema), true);
});

test("undeployed record is network-neutral and cannot authorize network action", () => {
  assert.equal(Object.hasOwn(baseManifest, "network"), false);
  assert.equal(baseManifest.deployment.network, null);
  assert.equal(baseManifest.deployment.chainId, null);
  assert.equal(baseManifest.networkActionEnabled, false);
});

test("undeployed manifest rejects an address", () => {
  const manifest = copyManifest();
  manifest.deployment.address = "0x1111111111111111111111111111111111111111";
  assertRejected(manifest, "deployment.address");
});

test("undeployed manifest rejects a deployment/network mismatch", () => {
  const manifest = copyManifest();
  manifest.deployment.network = "ethereum-mainnet";
  assertRejected(manifest, "deployment.network");
});

test("manifest rejects unsupported contract or compiler settings", () => {
  const contractMutation = copyManifest();
  contractMutation.contract.upgradeability = "transparent-proxy";
  assertRejected(contractMutation, "contract.upgradeability");

  const compilerMutation = copyManifest();
  compilerMutation.compiler.optimizer.runs = 1_000;
  assertRejected(compilerMutation, "compiler.optimizer.runs");

  const longVersionMutation = copyManifest();
  longVersionMutation.compiler.solidityLongVersion = "0.8.28";
  assertRejected(longVersionMutation, "compiler.solidityLongVersion");

  const foundryMutation = copyManifest();
  foundryMutation.compiler.foundry = "1.8.0";
  assertRejected(foundryMutation, "compiler.foundry");
});

test("manifest rejects missing exact constructor terms", () => {
  const manifest = copyManifest();
  delete manifest.terms.values.termsHash;
  assertRejected(manifest, "terms.values.termsHash");
});

test("manifest rejects malformed hashes and addresses", () => {
  const hashMutation = copyManifest();
  hashMutation.build.sourceSha256 = "0xABCDEF";
  assertRejected(hashMutation, "build.sourceSha256");

  const addressMutation = copyManifest();
  addressMutation.deployment.deployer = "0X1111111111111111111111111111111111111111";
  assertRejected(addressMutation, "deployment.deployer");
});

test("deployed true requires complete proof fields", () => {
  const manifest = copyManifest();
  manifest.deployed = true;
  assertRejected(manifest, "deployment.address");
  assertRejected(manifest, "build.sourceSha256");
  assertRejected(manifest, "terms.values.swapId");
});

test("networkActionEnabled true is rejected even for deployed records", () => {
  const manifest = completeDeployedManifest();
  manifest.networkActionEnabled = true;
  assertRejected(manifest, "networkActionEnabled");
});

test("deployed byte fields must match their hashes and init-code hash", () => {
  const hashMutation = completeDeployedManifest();
  hashMutation.deployment.runtimeBytecodeSha256 = `0x${"07".repeat(32)}`;
  assertRejected(hashMutation, "deployment.runtimeBytecodeSha256");

  const initMutation = completeDeployedManifest();
  initMutation.deployment.initCodeSha256 = `0x${"08".repeat(32)}`;
  assertRejected(initMutation, "deployment.initCodeSha256");
});

test("deployed constructor arguments must encode the declared terms", () => {
  const manifest = completeDeployedManifest();
  manifest.terms.values.amount = "2";
  assertRejected(manifest, "deployment.constructorArguments");
});

test("deployed terms must leave an excluded refund timestamp", () => {
  const manifest = completeDeployedManifest();
  manifest.terms.values.refundTime = "3";
  assertRejected(manifest, "terms.values.refundTime");
});

test("deployed integer fields enforce EVM widths and a positive block", () => {
  const amount = completeDeployedManifest();
  amount.terms.values.amount = (1n << 256n).toString();
  assertRejected(amount, "terms.values.amount");
  assert.ok(validateManifest(amount, schema).some((error) => error.startsWith("manifest.terms.values.amount:")));

  const deadline = completeDeployedManifest();
  deadline.terms.values.refundTime = (1n << 64n).toString();
  assertRejected(deadline, "terms.values.refundTime");
  assert.ok(validateManifest(deadline, schema).some((error) => error.startsWith("manifest.terms.values.refundTime:")));

  const block = completeDeployedManifest();
  block.deployment.blockNumber = "0";
  assertRejected(block, "deployment.blockNumber");
});

test("deployed source commit must be nonzero and resolve to the declared source tree", async () => {
  const zero = completeDeployedManifest();
  zero.deployment.sourceCommit = "0".repeat(40);
  assertRejected(zero, "deployment.sourceCommit");

  const unknown = completeDeployedManifest();
  unknown.deployment.sourceCommit = "6".repeat(40);
  const errors = [];
  await validateEvidenceFiles(unknown, errors);
  assert.ok(errors.some((error) => error.startsWith("deployment.sourceCommit:")), errors.join("\n"));
});

test("deployed records require every verification flag to be true", () => {
  const manifest = completeDeployedManifest();
  manifest.deployment.sourceVerified = false;
  assertRejected(manifest, "deployment.sourceVerified");
});

test("deployed evidence hashes are checked against repo-contained files", async () => {
  const manifest = completeDeployedManifest();
  manifest.build.standardJsonInputSha256 = `0x${"09".repeat(32)}`;
  const errors = [];
  await validateEvidenceFiles(manifest, errors);
  assert.ok(errors.some((error) => error.startsWith("build.standardJsonInputSha256:")), errors.join("\n"));

  const escape = completeDeployedManifest();
  escape.build.standardJsonInputPath = "../package.json";
  assertRejected(escape, "build.standardJsonInputPath");
  const escapeErrors = [];
  await validateEvidenceFiles(escape, escapeErrors);
  assert.ok(escapeErrors.some((error) => error.startsWith("build.standardJsonInputPath:")), escapeErrors.join("\n"));

  const source = completeDeployedManifest();
  source.build.sourceSha256 = `0x${"0a".repeat(32)}`;
  const sourceErrors = [];
  await validateEvidenceFiles(source, sourceErrors);
  assert.ok(sourceErrors.some((error) => error.startsWith("build.sourceSha256:")), sourceErrors.join("\n"));

  const dependencies = completeDeployedManifest();
  dependencies.build.dependencyLockSha256 = `0x${"0b".repeat(32)}`;
  const dependencyErrors = [];
  await validateEvidenceFiles(dependencies, dependencyErrors);
  assert.ok(dependencyErrors.some((error) => error.startsWith("build.dependencyLockSha256:")), dependencyErrors.join("\n"));

  const compilerSettings = completeDeployedManifest();
  compilerSettings.build.compilerSettingsSha256 = `0x${"0c".repeat(32)}`;
  const compilerSettingsErrors = [];
  await validateEvidenceFiles(compilerSettings, compilerSettingsErrors);
  assert.ok(compilerSettingsErrors.some((error) => error.startsWith("build.compilerSettingsSha256:")), compilerSettingsErrors.join("\n"));
});

test("manifest rejects uppercase and zero-address values", () => {
  const uppercase = copyManifest();
  uppercase.deployment.address = "0x111111111111111111111111111111111111111A";
  assertRejected(uppercase, "deployment.address");

  const zero = copyManifest();
  zero.deployment.address = "0x0000000000000000000000000000000000000000";
  assertRejected(zero, "deployment.address");
});

test("manifest rejects secret-looking strings and unknown fields", async () => {
  const secret = copyManifest();
  secret.deployment.artifactPath = "rpcKey=do-not-store";
  assertRejected(secret, "manifest.deployment.artifactPath");

  const extra = copyManifest();
  extra.unexpected = true;
  assertRejected(extra, "manifest.unexpected");

  assert.equal(schema.schemaVersion, "1.0.0");
});
