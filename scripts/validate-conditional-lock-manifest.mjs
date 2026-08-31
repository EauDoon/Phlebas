import { readFile, realpath } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { encodeConditionalLockConstructorArgs } from "../src/lib/conditional-lock-abi.ts";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = resolve(dirname(SCRIPT_PATH), "..");

export const SCHEMA_URI = "https://json-schema.org/draft/2020-12/schema";
export const SCHEMA_PATH = join(ROOT, "contracts", "manifests", "conditional-lock-deployment.schema.json");
export const MANIFEST_PATH = join(ROOT, "contracts", "manifests", "conditional-lock.not-deployed.json");
export const MANIFEST_VERSION = "1.0.0";

const DEPENDENCY_LOCK_PATH = "package-lock.json";
const COMPILER_SETTINGS_PATH = "contracts/foundry.toml";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ZERO_BYTES32 = `0x${"0".repeat(64)}`;
const REQUIRED_ROOT_KEYS = [
  "$schema",
  "schemaVersion",
  "manifestType",
  "deployed",
  "networkActionEnabled",
  "contract",
  "compiler",
  "terms",
  "build",
  "deployment",
];
const REQUIRED_CONTRACT_KEYS = ["name", "sourcePath", "upgradeability", "exactToken"];
const REQUIRED_COMPILER_KEYS = [
  "solidity",
  "solidityLongVersion",
  "foundry",
  "optimizer",
  "viaIR",
  "evmVersion",
  "openZeppelinContracts",
];
const REQUIRED_OPTIMIZER_KEYS = ["enabled", "runs"];
const TERM_FIELDS = [
  "swapId",
  "termsHash",
  "token",
  "funder",
  "claimRecipient",
  "refundRecipient",
  "amount",
  "hashlock",
  "fundingCutoff",
  "claimCutoff",
  "refundTime",
];
const TERM_TYPES = [
  ["swapId", "bytes32"],
  ["termsHash", "bytes32"],
  ["token", "address"],
  ["funder", "address"],
  ["claimRecipient", "address"],
  ["refundRecipient", "address"],
  ["amount", "uint256"],
  ["hashlock", "bytes32"],
  ["fundingCutoff", "uint64"],
  ["claimCutoff", "uint64"],
  ["refundTime", "uint64"],
];
const REQUIRED_TERMS_KEYS = ["argumentOrder", "argumentTypes", "values"];
const REQUIRED_VALUES_KEYS = TERM_FIELDS;
const REQUIRED_BUILD_KEYS = [
  "sourcePath",
  "sourceName",
  "standardJsonInputPath",
  "hashAlgorithm",
  "sourceSha256",
  "standardJsonInputSha256",
  "dependencyLockSha256",
  "compilerSettingsSha256",
];
const BUILD_HASH_FIELDS = [
  "sourceSha256",
  "standardJsonInputSha256",
  "dependencyLockSha256",
  "compilerSettingsSha256",
];
const REQUIRED_DEPLOYMENT_KEYS = [
  "network",
  "chainId",
  "address",
  "transactionHash",
  "blockNumber",
  "blockHash",
  "deployer",
  "receiptStatus",
  "sourceCommit",
  "constructorArguments",
  "artifactPath",
  "artifactSha256",
  "creationBytecode",
  "creationBytecodeSha256",
  "runtimeBytecode",
  "runtimeBytecodeSha256",
  "constructorArgumentsSha256",
  "initCodeSha256",
  "receiptVerified",
  "sourceVerified",
  "constructorArgumentsVerified",
  "runtimeBytecodeVerified",
];
const DEPLOYMENT_PROOF_FIELDS = [
  "network",
  "chainId",
  "address",
  "transactionHash",
  "blockNumber",
  "blockHash",
  "deployer",
  "receiptStatus",
  "sourceCommit",
  "constructorArguments",
  "creationBytecode",
  "runtimeBytecode",
  "artifactPath",
  "artifactSha256",
  "creationBytecodeSha256",
  "runtimeBytecodeSha256",
  "constructorArgumentsSha256",
  "initCodeSha256",
];
const DEPLOYMENT_VERIFICATION_FIELDS = [
  "receiptVerified",
  "sourceVerified",
  "constructorArgumentsVerified",
  "runtimeBytecodeVerified",
];
const DEPLOYMENT_NULL_FIELDS = REQUIRED_DEPLOYMENT_KEYS.filter((field) => !DEPLOYMENT_VERIFICATION_FIELDS.includes(field));
const HEX32_RE = /^0x[0-9a-f]{64}$/;
const ADDRESS_RE = /^0x[0-9a-f]{40}$/;
const HEX_BYTES_RE = /^0x[0-9a-f]{2,}$/;
const DECIMAL_RE = /^(0|[1-9][0-9]*)$/;
const SHA256_RE = HEX32_RE;
const COMMIT_RE = /^[0-9a-f]{40}$/;
const RELATIVE_PATH_RE = /^(?!\/)(?!.*\.\.)[A-Za-z0-9._/-]+$/;
const NETWORK_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SECRET_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/i,
  /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{16,}\b/i,
  /\bgithub_pat_[A-Za-z0-9_]{16,}\b/i,
  /\bsk_live_[A-Za-z0-9]{16,}\b/i,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\b(?:api|rpc)[_-]?key\s*[:=]\s*[^\s,}]+/i,
  /https?:\/\/[^\s/@:]+:[^\s/@]+@/i,
];

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(value, key) {
  return isObject(value) && Object.prototype.hasOwnProperty.call(value, key);
}

function pathFor(parent, key) {
  if (typeof key === "number") return `${parent}[${key}]`;
  return parent ? `${parent}.${key}` : key;
}

function add(errors, path, message) {
  errors.push(`${path}: ${message}`);
}

function expectObject(value, path, requiredKeys, errors) {
  if (!isObject(value)) {
    add(errors, path, "must be an object");
    return false;
  }
  for (const key of requiredKeys) {
    if (!hasOwn(value, key)) add(errors, pathFor(path, key), "is required");
  }
  const requiredSet = new Set(requiredKeys);
  for (const key of Object.keys(value).sort()) {
    if (!requiredSet.has(key)) add(errors, pathFor(path, key), "is not allowed");
  }
  return true;
}

function expectConst(value, path, expected, errors) {
  if (JSON.stringify(value) !== JSON.stringify(expected)) {
    add(errors, path, `must equal ${JSON.stringify(expected)}`);
    return false;
  }
  return true;
}

function expectBoolean(value, path, errors) {
  if (typeof value !== "boolean") {
    add(errors, path, "must be a boolean");
    return false;
  }
  return true;
}

function expectNullable(value, path, predicate, description, errors) {
  if (value === null) return true;
  if (!predicate(value)) {
    add(errors, path, `must be null or ${description}`);
    return false;
  }
  return true;
}

function expectBytes32(value, path, errors, { nonZero = false } = {}) {
  if (typeof value !== "string" || !HEX32_RE.test(value)) {
    add(errors, path, "must be a lower-case 0x32-byte value");
    return false;
  }
  if (nonZero && value === ZERO_BYTES32) {
    add(errors, path, "must not be all zero");
    return false;
  }
  return true;
}

function isHash(value) {
  return typeof value === "string" && SHA256_RE.test(value) && value !== ZERO_BYTES32;
}

function expectDecimal(value, path, errors, { positive = false, max = null } = {}) {
  if (typeof value !== "string" || !DECIMAL_RE.test(value) || (positive && value === "0")) {
    add(errors, path, positive ? "must be a positive canonical decimal string" : "must be a canonical decimal string");
    return false;
  }
  if (max !== null && BigInt(value) > max) {
    add(errors, path, `must be at most ${max.toString()}`);
    return false;
  }
  return true;
}

function expectNullableAddress(value, path, errors) {
  return expectNullable(value, path, (candidate) => typeof candidate === "string" && ADDRESS_RE.test(candidate) && candidate !== ZERO_ADDRESS, "a non-zero lower-case 0x address", errors);
}

function expectNullableBytes32(value, path, errors) {
  return expectNullable(value, path, (candidate) => typeof candidate === "string" && HEX32_RE.test(candidate), "a lower-case 0x32-byte value", errors);
}

function expectNullableHash(value, path, errors) {
  return expectNullable(value, path, (candidate) => typeof candidate === "string" && SHA256_RE.test(candidate) && candidate !== ZERO_BYTES32, "a non-zero lower-case 0x SHA-256 hash", errors);
}

function expectNullableHexBytes(value, path, errors) {
  return expectNullable(value, path, (candidate) => typeof candidate === "string" && HEX_BYTES_RE.test(candidate) && (candidate.length - 2) % 2 === 0, "even-length lower-case 0x bytes", errors);
}

function expectNullableDecimal(value, path, errors) {
  return expectNullable(value, path, (candidate) => typeof candidate === "string" && DECIMAL_RE.test(candidate), "a canonical decimal string", errors);
}

function expectNullablePath(value, path, errors) {
  return expectNullable(value, path, (candidate) => typeof candidate === "string" && RELATIVE_PATH_RE.test(candidate), "a safe relative path", errors);
}

function checkNoSecrets(value, path, errors) {
  if (typeof value === "string") {
    for (const pattern of SECRET_PATTERNS) {
      if (pattern.test(value)) {
        add(errors, path, "must not contain credentials or secret material");
        return;
      }
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => checkNoSecrets(item, pathFor(path, index), errors));
    return;
  }
  if (isObject(value)) {
    for (const [key, child] of Object.entries(value)) checkNoSecrets(child, pathFor(path, key), errors);
  }
}

function checkNullFields(value, path, fields, errors) {
  for (const field of fields) {
    if (value[field] !== null) add(errors, pathFor(path, field), "must remain null while undeployed");
  }
}

function validateContract(contract, errors) {
  if (!expectObject(contract, "contract", REQUIRED_CONTRACT_KEYS, errors)) return;
  expectConst(contract.name, "contract.name", "ConditionalLock", errors);
  expectConst(contract.sourcePath, "contract.sourcePath", "contracts/src/swap/ConditionalLock.sol", errors);
  expectConst(contract.upgradeability, "contract.upgradeability", "non-upgradeable", errors);
  expectConst(contract.exactToken, "contract.exactToken", true, errors);
}

function validateCompiler(compiler, errors) {
  if (!expectObject(compiler, "compiler", REQUIRED_COMPILER_KEYS, errors)) return;
  expectConst(compiler.solidity, "compiler.solidity", "0.8.28", errors);
  expectConst(compiler.solidityLongVersion, "compiler.solidityLongVersion", "0.8.28+commit.7893614a", errors);
  expectConst(compiler.foundry, "compiler.foundry", "1.8.1", errors);
  expectConst(compiler.viaIR, "compiler.viaIR", true, errors);
  expectConst(compiler.evmVersion, "compiler.evmVersion", "cancun", errors);
  expectConst(compiler.openZeppelinContracts, "compiler.openZeppelinContracts", "5.6.1", errors);
  if (expectObject(compiler.optimizer, "compiler.optimizer", REQUIRED_OPTIMIZER_KEYS, errors)) {
    expectConst(compiler.optimizer.enabled, "compiler.optimizer.enabled", true, errors);
    expectConst(compiler.optimizer.runs, "compiler.optimizer.runs", 200, errors);
  }
}

function validateTerms(terms, errors) {
  if (!expectObject(terms, "terms", REQUIRED_TERMS_KEYS, errors)) return;
  expectConst(terms.argumentOrder, "terms.argumentOrder", TERM_FIELDS, errors);
  const expectedTypes = TERM_TYPES.map(([name, type]) => ({ name, type }));
  expectConst(terms.argumentTypes, "terms.argumentTypes", expectedTypes, errors);
  if (!expectObject(terms.values, "terms.values", REQUIRED_VALUES_KEYS, errors)) return;

  for (const field of TERM_FIELDS) {
    const path = `terms.values.${field}`;
    const value = terms.values[field];
    switch (field) {
      case "swapId":
      case "termsHash":
      case "hashlock":
        expectNullableBytes32(value, path, errors);
        break;
      case "token":
      case "funder":
      case "claimRecipient":
      case "refundRecipient":
        expectNullableAddress(value, path, errors);
        break;
      case "amount":
        expectNullableDecimal(value, path, errors);
        break;
      case "fundingCutoff":
      case "claimCutoff":
      case "refundTime":
        expectNullableDecimal(value, path, errors);
        break;
      default:
        add(errors, path, "is not a recognized constructor term");
    }
  }
}

function validateBuild(build, errors) {
  if (!expectObject(build, "build", REQUIRED_BUILD_KEYS, errors)) return;
  expectConst(build.sourcePath, "build.sourcePath", "contracts/src/swap/ConditionalLock.sol", errors);
  expectConst(build.sourceName, "build.sourceName", "ConditionalLock.sol", errors);
  expectNullablePath(build.standardJsonInputPath, "build.standardJsonInputPath", errors);
  expectConst(build.hashAlgorithm, "build.hashAlgorithm", "sha256", errors);
  for (const field of BUILD_HASH_FIELDS) expectNullableHash(build[field], `build.${field}`, errors);
}

function validateDeployment(deployment, errors) {
  if (!expectObject(deployment, "deployment", REQUIRED_DEPLOYMENT_KEYS, errors)) return;
  expectNullable(deployment.network, "deployment.network", (value) => typeof value === "string" && NETWORK_SLUG_RE.test(value), "a lower-case network slug", errors);
  expectNullable(deployment.chainId, "deployment.chainId", (value) => typeof value === "string" && DECIMAL_RE.test(value) && value !== "0", "a positive canonical decimal-string chain ID", errors);
  expectNullableAddress(deployment.address, "deployment.address", errors);
  expectNullableHash(deployment.transactionHash, "deployment.transactionHash", errors);
  expectNullableDecimal(deployment.blockNumber, "deployment.blockNumber", errors);
  expectNullableHash(deployment.blockHash, "deployment.blockHash", errors);
  expectNullableAddress(deployment.deployer, "deployment.deployer", errors);
  expectNullable(deployment.receiptStatus, "deployment.receiptStatus", (value) => value === "0x1", '\"0x1\"', errors);
  expectNullable(deployment.sourceCommit, "deployment.sourceCommit", (value) => typeof value === "string" && COMMIT_RE.test(value), "a lower-case 40-character git commit", errors);
  expectNullableHexBytes(deployment.constructorArguments, "deployment.constructorArguments", errors);
  expectNullablePath(deployment.artifactPath, "deployment.artifactPath", errors);
  expectNullableHash(deployment.artifactSha256, "deployment.artifactSha256", errors);
  expectNullableHexBytes(deployment.creationBytecode, "deployment.creationBytecode", errors);
  expectNullableHash(deployment.creationBytecodeSha256, "deployment.creationBytecodeSha256", errors);
  expectNullableHexBytes(deployment.runtimeBytecode, "deployment.runtimeBytecode", errors);
  expectNullableHash(deployment.runtimeBytecodeSha256, "deployment.runtimeBytecodeSha256", errors);
  expectNullableHash(deployment.constructorArgumentsSha256, "deployment.constructorArgumentsSha256", errors);
  expectNullableHash(deployment.initCodeSha256, "deployment.initCodeSha256", errors);
  for (const field of DEPLOYMENT_VERIFICATION_FIELDS) expectBoolean(deployment[field], `deployment.${field}`, errors);
}

function validateDeployedSemantics(manifest, errors) {
  const values = manifest.terms.values;
  const deployment = manifest.deployment;

  if (manifest.deployed === false) {
    if (manifest.networkActionEnabled !== false) add(errors, "networkActionEnabled", "must always be false");
    checkNullFields(values, "terms.values", TERM_FIELDS, errors);
    checkNullFields(deployment, "deployment", DEPLOYMENT_NULL_FIELDS, errors);
    for (const field of DEPLOYMENT_VERIFICATION_FIELDS) {
      if (deployment[field] !== false) add(errors, pathFor("deployment", field), "must be false while undeployed");
    }
    return;
  }

  if (manifest.deployed !== true) return;
  if (manifest.networkActionEnabled !== false) add(errors, "networkActionEnabled", "must always be false");
  if (typeof deployment.network !== "string" || !NETWORK_SLUG_RE.test(deployment.network)) {
    add(errors, "deployment.network", "must be a lower-case network slug when deployed");
  }
  if (typeof deployment.chainId !== "string" || !DECIMAL_RE.test(deployment.chainId) || deployment.chainId === "0") {
    add(errors, "deployment.chainId", "must be a positive canonical decimal-string chain ID when deployed");
  }
  for (const field of DEPLOYMENT_PROOF_FIELDS) {
    if (deployment[field] === null) add(errors, pathFor("deployment", field), "is required when deployed");
  }
  for (const field of BUILD_HASH_FIELDS) {
    if (manifest.build[field] === null) add(errors, pathFor("build", field), "is required when deployed");
  }
  if (manifest.build.standardJsonInputPath === null) {
    add(errors, "build.standardJsonInputPath", "is required when deployed");
  }
  for (const field of TERM_FIELDS) {
    if (values[field] === null) add(errors, pathFor("terms.values", field), "is required when deployed");
  }
  for (const field of DEPLOYMENT_VERIFICATION_FIELDS) {
    if (deployment[field] !== true) add(errors, pathFor("deployment", field), "must be true when deployed");
  }

  if (values.swapId !== null) expectBytes32(values.swapId, "terms.values.swapId", errors, { nonZero: true });
  if (values.termsHash !== null) expectBytes32(values.termsHash, "terms.values.termsHash", errors, { nonZero: true });
  if (values.hashlock !== null) expectBytes32(values.hashlock, "terms.values.hashlock", errors, { nonZero: true });
  if (values.amount !== null) expectDecimal(values.amount, "terms.values.amount", errors, { positive: true, max: (1n << 256n) - 1n });
  for (const field of ["fundingCutoff", "claimCutoff", "refundTime"]) {
    if (values[field] !== null) expectDecimal(values[field], `terms.values.${field}`, errors, { positive: true, max: (1n << 64n) - 1n });
  }
  if (values.funder !== null && values.claimRecipient !== null && values.funder === values.claimRecipient) {
    add(errors, "terms.values.claimRecipient", "must differ from funder");
  }
  if (values.funder !== null && values.refundRecipient !== null && values.funder !== values.refundRecipient) {
    add(errors, "terms.values.refundRecipient", "must equal funder");
  }
  if (values.token !== null) {
    for (const field of ["funder", "claimRecipient"]) {
      if (values[field] !== null && values[field] === values.token) add(errors, `terms.values.${field}`, "must differ from token");
    }
  }
  const hasFundingCutoff = typeof values.fundingCutoff === "string" && DECIMAL_RE.test(values.fundingCutoff);
  const hasClaimCutoff = typeof values.claimCutoff === "string" && DECIMAL_RE.test(values.claimCutoff);
  const hasRefundTime = typeof values.refundTime === "string" && DECIMAL_RE.test(values.refundTime);
  if (hasFundingCutoff && hasClaimCutoff && BigInt(values.fundingCutoff) >= BigInt(values.claimCutoff)) {
    add(errors, "terms.values.claimCutoff", "must be later than fundingCutoff");
  }
  if (hasClaimCutoff && hasRefundTime && BigInt(values.claimCutoff) + 1n >= BigInt(values.refundTime)) {
    add(errors, "terms.values.refundTime", "must leave at least one excluded timestamp after claimCutoff");
  }

  if (TERM_FIELDS.every((field) => values[field] !== null) && typeof deployment.constructorArguments === "string") {
    try {
      const encodedTerms = encodeConditionalLockConstructorArgs({
        swapId: values.swapId,
        termsHash: values.termsHash,
        token: values.token,
        funder: values.funder,
        claimRecipient: values.claimRecipient,
        refundRecipient: values.refundRecipient,
        amount: BigInt(values.amount),
        hashlock: values.hashlock,
        fundingCutoff: BigInt(values.fundingCutoff),
        claimCutoff: BigInt(values.claimCutoff),
        refundTime: BigInt(values.refundTime),
      });
      if (encodedTerms !== deployment.constructorArguments) {
        add(errors, "deployment.constructorArguments", "does not encode terms.values in the declared argument order");
      }
    } catch (error) {
      add(errors, "deployment.constructorArguments", `could not encode terms.values: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const byteFields = [
    ["constructorArguments", "constructorArgumentsSha256"],
    ["creationBytecode", "creationBytecodeSha256"],
    ["runtimeBytecode", "runtimeBytecodeSha256"],
  ];
  for (const [bytesField, hashField] of byteFields) {
    const bytes = deployment[bytesField];
    const declaredHash = deployment[hashField];
    if (typeof bytes === "string" && HEX_BYTES_RE.test(bytes) && (bytes.length - 2) % 2 === 0 && isHash(declaredHash)) {
      const computedHash = sha256Hex(bytes);
      if (computedHash !== declaredHash) add(errors, `deployment.${hashField}`, `does not match deployment.${bytesField}`);
    }
  }
  if (
    typeof deployment.creationBytecode === "string"
    && HEX_BYTES_RE.test(deployment.creationBytecode)
    && (deployment.creationBytecode.length - 2) % 2 === 0
    && typeof deployment.constructorArguments === "string"
    && HEX_BYTES_RE.test(deployment.constructorArguments)
    && (deployment.constructorArguments.length - 2) % 2 === 0
    && isHash(deployment.initCodeSha256)
  ) {
    const initCode = `0x${deployment.creationBytecode.slice(2)}${deployment.constructorArguments.slice(2)}`;
    const computedHash = sha256Hex(initCode);
    if (computedHash !== deployment.initCodeSha256) add(errors, "deployment.initCodeSha256", "does not match creationBytecode concatenated with constructorArguments");
  }
}

function validateSchemaSurface(schema, errors) {
  if (!isObject(schema)) {
    add(errors, "schema", "must be an object");
    return;
  }
  expectConst(schema.$schema, "schema.$schema", SCHEMA_URI, errors);
  expectConst(schema.schemaVersion, "schema.schemaVersion", MANIFEST_VERSION, errors);
  expectConst(schema.type, "schema.type", "object", errors);
  expectConst(schema.additionalProperties, "schema.additionalProperties", false, errors);
  if (!isObject(schema.properties)) add(errors, "schema.properties", "must be an object");
  for (const key of REQUIRED_ROOT_KEYS) {
    if (!Array.isArray(schema.required) || !schema.required.includes(key)) add(errors, "schema.required", `must include ${JSON.stringify(key)}`);
  }
  if (!Array.isArray(schema.allOf) || schema.allOf.length < 2) add(errors, "schema.allOf", "must contain conditional fail-closed branches");
}

function resolveSchemaRef(rootSchema, reference) {
  if (typeof reference !== "string" || !reference.startsWith("#/")) return null;
  let current = rootSchema;
  for (const segment of reference.slice(2).split("/")) {
    const key = segment.replaceAll("~1", "/").replaceAll("~0", "~");
    if (!isObject(current) || !hasOwn(current, key)) return null;
    current = current[key];
  }
  return current;
}

function matchesJsonType(value, type) {
  switch (type) {
    case "null": return value === null;
    case "boolean": return typeof value === "boolean";
    case "object": return isObject(value);
    case "array": return Array.isArray(value);
    case "string": return typeof value === "string";
    case "integer": return typeof value === "number" && Number.isInteger(value);
    case "number": return typeof value === "number" && Number.isFinite(value);
    default: return true;
  }
}

function validateJsonSchema(value, schema, rootSchema, path, errors) {
  if (!isObject(schema)) {
    add(errors, path, "schema node must be an object");
    return;
  }
  if (schema.$ref !== undefined) {
    const target = resolveSchemaRef(rootSchema, schema.$ref);
    if (target === null) {
      add(errors, path, `unresolvable schema reference ${JSON.stringify(schema.$ref)}`);
      return;
    }
    validateJsonSchema(value, target, rootSchema, path, errors);
    return;
  }
  if (schema.const !== undefined && JSON.stringify(value) !== JSON.stringify(schema.const)) {
    add(errors, path, `must equal ${JSON.stringify(schema.const)}`);
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((candidate) => JSON.stringify(candidate) === JSON.stringify(value))) {
    add(errors, path, `must be one of ${JSON.stringify(schema.enum)}`);
  }
  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((type) => matchesJsonType(value, type))) {
      add(errors, path, `must be of type ${types.join(" or ")}`);
      return;
    }
  }
  if (typeof schema.pattern === "string" && typeof value === "string") {
    let matches = false;
    try {
      matches = new RegExp(schema.pattern).test(value);
    } catch {
      add(errors, path, "has an invalid schema pattern");
    }
    if (!matches) add(errors, path, "does not match the required pattern");
  }
  if (schema.minLength !== undefined && typeof value === "string" && value.length < schema.minLength) {
    add(errors, path, `must contain at least ${schema.minLength} characters`);
  }
  if (schema.not !== undefined) {
    const notErrors = [];
    validateJsonSchema(value, schema.not, rootSchema, path, notErrors);
    if (notErrors.length === 0) add(errors, path, "must not match the prohibited schema");
  }
  if (schema.anyOf !== undefined) {
    if (!Array.isArray(schema.anyOf)) {
      add(errors, path, "schema anyOf must be an array");
    } else {
      const branchErrors = schema.anyOf.map((branch) => {
        const branchResult = [];
        validateJsonSchema(value, branch, rootSchema, path, branchResult);
        return branchResult;
      });
      if (!branchErrors.some((branchResult) => branchResult.length === 0)) {
        add(errors, path, "must satisfy at least one allowed schema");
      }
    }
  }
  if (schema.required !== undefined && isObject(value)) {
    if (!Array.isArray(schema.required)) {
      add(errors, path, "schema required must be an array");
    } else {
      for (const key of schema.required) {
        if (!hasOwn(value, key)) add(errors, pathFor(path, key), "is required");
      }
    }
  }
  if (isObject(schema.properties) && isObject(value)) {
    for (const [key, childSchema] of Object.entries(schema.properties)) {
      if (hasOwn(value, key)) validateJsonSchema(value[key], childSchema, rootSchema, pathFor(path, key), errors);
    }
  }
  if (schema.additionalProperties === false && isObject(value)) {
    const allowed = new Set(isObject(schema.properties) ? Object.keys(schema.properties) : []);
    for (const key of Object.keys(value).sort()) {
      if (!allowed.has(key)) add(errors, pathFor(path, key), "is not allowed");
    }
  }
  if (schema.if !== undefined) {
    const conditionErrors = [];
    validateJsonSchema(value, schema.if, rootSchema, path, conditionErrors);
    const branch = conditionErrors.length === 0 ? schema.then : schema.else;
    if (branch !== undefined) validateJsonSchema(value, branch, rootSchema, path, errors);
  }
  if (schema.allOf !== undefined) {
    if (!Array.isArray(schema.allOf)) {
      add(errors, path, "schema allOf must be an array");
    } else {
      for (const branch of schema.allOf) validateJsonSchema(value, branch, rootSchema, path, errors);
    }
  }
}

export function validateManifest(manifest, schema = null) {
  const errors = [];
  if (!expectObject(manifest, "manifest", REQUIRED_ROOT_KEYS, errors)) return errors;
  if (schema !== null) validateJsonSchema(manifest, schema, schema, "manifest", errors);
  expectConst(manifest.$schema, "$schema", SCHEMA_URI, errors);
  expectConst(manifest.schemaVersion, "schemaVersion", MANIFEST_VERSION, errors);
  expectConst(manifest.manifestType, "manifestType", "conditional-lock-deployment", errors);
  expectBoolean(manifest.deployed, "deployed", errors);
  expectConst(manifest.networkActionEnabled, "networkActionEnabled", false, errors);
  validateContract(manifest.contract, errors);
  validateCompiler(manifest.compiler, errors);
  validateTerms(manifest.terms, errors);
  validateBuild(manifest.build, errors);
  validateDeployment(manifest.deployment, errors);
  checkNoSecrets(manifest, "manifest", errors);
  if (isObject(manifest.terms) && isObject(manifest.terms.values) && isObject(manifest.build) && isObject(manifest.deployment)) {
    validateDeployedSemantics(manifest, errors);
  }
  return errors;
}

export function isValidManifest(manifest) {
  return validateManifest(manifest).length === 0;
}

export function validateConditionalLockManifest(manifest) {
  return validateManifest(manifest);
}

export async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function readRepoContainedFile(relativePath) {
  if (typeof relativePath !== "string" || !RELATIVE_PATH_RE.test(relativePath)) {
    throw new Error("path must be a safe relative path");
  }
  const rootPath = resolve(ROOT);
  const candidatePath = resolve(rootPath, relativePath);
  const lexicalRelative = relative(rootPath, candidatePath);
  if (lexicalRelative === ".." || lexicalRelative.startsWith(`..${sep}`) || isAbsolute(lexicalRelative)) {
    throw new Error("path escapes the repository root");
  }
  const [realRoot, realFile] = await Promise.all([realpath(rootPath), realpath(candidatePath)]);
  const canonicalRelative = relative(realRoot, realFile);
  if (canonicalRelative === ".." || canonicalRelative.startsWith(`..${sep}`) || isAbsolute(canonicalRelative)) {
    throw new Error("path escapes the repository root through a symlink");
  }
  return readFile(realFile);
}

async function validateDeclaredFileHash(pathValue, hashValue, pathName, hashName, errors) {
  if (pathValue === null || hashValue === null || !isHash(hashValue)) return;
  let bytes;
  try {
    bytes = await readRepoContainedFile(pathValue);
  } catch (error) {
    add(errors, pathName, `could not read repository-contained evidence file: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }
  const computedHash = sha256Hex(bytes);
  if (computedHash !== hashValue) add(errors, hashName, `does not match ${pathName}`);
}

export async function validateEvidenceFiles(manifest, errors) {
  if (!isObject(manifest) || manifest.deployed !== true || !isObject(manifest.build) || !isObject(manifest.deployment)) return;
  await validateDeclaredFileHash(
    manifest.build.sourcePath,
    manifest.build.sourceSha256,
    "build.sourcePath",
    "build.sourceSha256",
    errors,
  );
  await validateDeclaredFileHash(
    manifest.build.standardJsonInputPath,
    manifest.build.standardJsonInputSha256,
    "build.standardJsonInputPath",
    "build.standardJsonInputSha256",
    errors,
  );
  await validateDeclaredFileHash(
    DEPENDENCY_LOCK_PATH,
    manifest.build.dependencyLockSha256,
    "build.dependencyLockPath",
    "build.dependencyLockSha256",
    errors,
  );
  await validateDeclaredFileHash(
    COMPILER_SETTINGS_PATH,
    manifest.build.compilerSettingsSha256,
    "build.compilerSettingsPath",
    "build.compilerSettingsSha256",
    errors,
  );
  await validateDeclaredFileHash(
    manifest.deployment.artifactPath,
    manifest.deployment.artifactSha256,
    "deployment.artifactPath",
    "deployment.artifactSha256",
    errors,
  );
}

export async function validateManifestFile(manifestPath = MANIFEST_PATH, schemaPath = SCHEMA_PATH) {
  const [manifest, schema] = await Promise.all([readJson(manifestPath), readJson(schemaPath)]);
  const errors = [];
  validateSchemaSurface(schema, errors);
  errors.push(...validateManifest(manifest, schema));
  await validateEvidenceFiles(manifest, errors);
  return { manifest, schema, errors };
}

export function sha256Hex(value) {
  const input = typeof value === "string" && HEX_BYTES_RE.test(value) && (value.length - 2) % 2 === 0
    ? Buffer.from(value.slice(2), "hex")
    : value;
  return `0x${createHash("sha256").update(input).digest("hex")}`;
}

function parseCli(argv) {
  let manifestPath = MANIFEST_PATH;
  let schemaPath = SCHEMA_PATH;
  let positionalManifest = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--manifest" || argument === "-m") {
      if (!argv[index + 1]) throw new Error(`${argument} requires a path`);
      manifestPath = argv[++index];
      positionalManifest = true;
    } else if (argument === "--schema" || argument === "-s") {
      if (!argv[index + 1]) throw new Error(`${argument} requires a path`);
      schemaPath = argv[++index];
    } else if (argument.startsWith("-")) {
      throw new Error(`unknown option ${argument}`);
    } else if (!positionalManifest) {
      manifestPath = argument;
      positionalManifest = true;
    } else {
      throw new Error(`unexpected argument ${argument}`);
    }
  }
  return {
    manifestPath: isAbsolute(manifestPath) ? manifestPath : resolve(process.cwd(), manifestPath),
    schemaPath: isAbsolute(schemaPath) ? schemaPath : resolve(process.cwd(), schemaPath),
  };
}

export async function main(argv = process.argv.slice(2)) {
  try {
    const { manifestPath, schemaPath } = parseCli(argv);
    const { errors } = await validateManifestFile(manifestPath, schemaPath);
    if (errors.length > 0) {
      console.error("ConditionalLock manifest validation failed:");
      for (const error of errors) console.error(`  ${error}`);
      return 1;
    }
    console.log(`ConditionalLock manifest valid: ${manifestPath}`);
    return 0;
  } catch (error) {
    console.error(`ConditionalLock manifest validation failed: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

const invokedScript = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedScript === SCRIPT_PATH) {
  process.exitCode = await main();
}
