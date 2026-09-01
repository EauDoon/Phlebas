import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import test from "node:test";

import { bytesToHex, hexToBytes } from "./keccak.ts";
import {
  PCZT_HEADER_VALIDATION,
  REQUIRED_WALLET_PCZT_CAPABILITIES,
  assertWalletPcztReady,
  assertWalletPcztRestartReady,
  createPcztEnvelope,
  createWalletPcztRestartSnapshot,
  createWalletReviewRequest,
  encodePcztEnvelope,
  expectedWalletPcztInspection,
  parsePcztEnvelope,
  parseWalletPcztRestartSnapshot,
  parseWalletReviewRequest,
  pcztByteSha256,
  serializeWalletPcztRestartSnapshot,
  serializeWalletReviewRequest,
  verifyWalletPcztInspection,
  verifyWalletPcztRestartSnapshot,
  walletPcztReadiness,
  type WalletPcztAdapter,
  type WalletPcztCapabilities,
  type WalletPcztInspection,
} from "./zcash-pczt.ts";
import {
  ZCASH_ARTIFACT_BOUNDARY,
  ZCASH_ARTIFACT_SCHEMA,
  commitZcashArtifact,
  createArtifactConstructionPolicy,
  type CommittedZcashArtifact,
  type UnsignedTransparentManifest,
} from "./zcash-artifact.ts";
import { createZip317TransparentPolicy } from "./zcash-fees.ts";
import { buildHtlcRedeemScript, htlcP2shScriptPubKey } from "./zcash-htlc.ts";

function fixtureManifest(transactionVersion: 5 | 6 = 5): UnsignedTransparentManifest {
  const redeemScript = buildHtlcRedeemScript({
    digest: hexToBytes("00".repeat(32)),
    claimPkh: hexToBytes("11".repeat(20)),
    refundPkh: hexToBytes("22".repeat(20)),
    lock: { type: "height", value: 4_300_000 },
  });
  return {
    schema: ZCASH_ARTIFACT_SCHEMA,
    boundary: ZCASH_ARTIFACT_BOUNDARY,
    kind: "fund",
    network: "testnet",
    profile: {
      id: `zcash-testnet-nu6.3-v${transactionVersion}`,
      transactionVersion,
      versionGroupId: transactionVersion === 5 ? "26a7270a" : "d884b698",
      consensusBranchId: "37a5165b",
      coinType: 1,
    },
    targetHeight: 4_200_000,
    expiryHeight: 4_200_100,
    lockTime: 0,
    inputs: [
      {
        txid: "11".repeat(32),
        outputIndex: 0,
        sequence: 0xffff_ffff,
        valueZatoshis: "110000",
        scriptPubKeyHex: "76a914" + "22".repeat(20) + "88ac",
      },
    ],
    outputs: [
      { role: "contract", valueZatoshis: "100000", scriptPubKeyHex: bytesToHex(htlcP2shScriptPubKey(redeemScript)) },
    ],
    feeZatoshis: "10000",
    policy: createArtifactConstructionPolicy({
      feePolicy: createZip317TransparentPolicy({
        maximumFeeZatoshis: 50_000n,
        minimumOutputZatoshis: 10_000n,
        maximumSerializedTransactionBytes: 10_000,
      }),
      finalizedSize: { inputBytes: 150, outputBytes: 34 },
      feeZatoshis: 10_000n,
    }),
    authorization: {
      sighashType: "SIGHASH_ALL",
      sighashCode: 1,
      txModifiable: 0,
      branch: "fund",
      redeemScriptHex: bytesToHex(redeemScript),
      refundSafetyMargin: { type: "height", value: 10 },
      fundingLockCutoff: 4_200_000,
    },
    transactionIdState: "unresolved-until-canonical-transaction-extraction",
  };
}

function fixtureArtifact(transactionVersion: 5 | 6 = 5): CommittedZcashArtifact {
  return commitZcashArtifact(fixtureManifest(transactionVersion));
}

function fixturePcztBytes(version: 1 | 2, payload: number[] = [0xaa, 0xbb]): Uint8Array {
  return Uint8Array.from([0x50, 0x43, 0x5a, 0x54, version, 0, 0, 0, ...payload]);
}

function fixturePczt(version: 1 | 2, payload?: number[]) {
  return createPcztEnvelope(fixturePcztBytes(version, payload));
}

function reviewRequest(artifact: CommittedZcashArtifact, version: 1 | 2) {
  return createWalletReviewRequest({
    artifact,
    pczt: fixturePczt(version),
    expectedManifestDigest: artifact.manifestDigest,
  });
}

function allCapabilities(state: "proven" | "unproven" | "unsupported"): WalletPcztCapabilities {
  return Object.fromEntries(REQUIRED_WALLET_PCZT_CAPABILITIES.map((key) => [key, state])) as WalletPcztCapabilities;
}

test("accepts v1 and v2 canonical PCZT envelopes and exposes the byte digest", () => {
  for (const version of [1, 2] as const) {
    const bytes = fixturePcztBytes(version);
    const envelope = createPcztEnvelope(bytes);
    assert.equal(envelope.version, version);
    assert.equal(envelope.validation, PCZT_HEADER_VALIDATION);
    assert.equal(envelope.pcztBase64, encodePcztEnvelope(bytes));
    assert.equal(envelope.byteSha256, createHash("sha256").update(bytes).digest("hex"));
    assert.equal(envelope.byteSha256, pcztByteSha256(bytes));
    assert.deepEqual(parsePcztEnvelope(envelope.pcztBase64), envelope);
  }
});

test("rejects malformed, noncanonical, unknown-header, and empty-payload PCZT envelopes", () => {
  assert.throws(() => parsePcztEnvelope(""), /non-empty/);
  assert.throws(() => parsePcztEnvelope("UENaVAE=\n"), /canonical|encoding/);
  assert.throws(() => parsePcztEnvelope("UENaVDE="), /canonical|encoding|header|payload/);
  assert.throws(() => createPcztEnvelope(Uint8Array.of(0x50, 0x43, 0x5a, 0x54)), /shorter|payload/);
  assert.throws(() => createPcztEnvelope(Uint8Array.of(0x50, 0x43, 0x5a, 0x54, 3, 0, 0, 0, 0xaa)), /unsupported/);
  assert.throws(() => createPcztEnvelope(Uint8Array.of(0x00, 0x43, 0x5a, 0x54, 1, 0, 0, 0, 0xaa)), /magic/);
  assert.throws(() => parsePcztEnvelope(fixturePczt(1).pcztBase64.replace(/=$/, "")), /canonical|encoding/);
});

test("creates immutable v5 review requests for both permitted PCZT versions", () => {
  const artifact = fixtureArtifact(5);
  for (const version of [1, 2] as const) {
    const request = reviewRequest(artifact, version);
    assert.deepEqual(request.expectedPcztVersions, [1, 2]);
    assert.equal(request.pcztVersion, version);
    assert.equal(request.manifestDigest, artifact.manifestDigest);
    assert.equal(request.txModifiable, 0);
    assert.equal(request.sighashType, "SIGHASH_ALL");
    assert.equal(Object.isFrozen(request), true);
    assert.equal(Object.isFrozen(request.manifest), true);
    assert.equal(Object.isFrozen(request.expectedPcztVersions), true);

    const serialized = serializeWalletReviewRequest(request, artifact.manifestDigest);
    assert.deepEqual(parseWalletReviewRequest(serialized, {
      expectedManifestDigest: artifact.manifestDigest,
    }), request);
    assert.throws(
      () => parseWalletReviewRequest(serialized, { expectedManifestDigest: "00".repeat(32) }),
      /caller-supplied expected/,
    );
  }
});

test("requires PCZT v2 for transaction version 6 and rejects mutable authorization", () => {
  const artifact = fixtureArtifact(6);
  assert.throws(() => reviewRequest(artifact, 1), /not permitted.*transaction version 6/);
  const request = reviewRequest(artifact, 2);
  assert.deepEqual(request.expectedPcztVersions, [2]);

  const mutable = {
    ...fixtureArtifact(5),
    manifest: { ...fixtureArtifact(5).manifest, authorization: { ...fixtureArtifact(5).manifest.authorization, txModifiable: 1 } },
  } as never;
  assert.throws(() => createWalletReviewRequest({
    artifact: mutable,
    pczt: fixturePczt(1),
    expectedManifestDigest: fixtureArtifact(5).manifestDigest,
  }), /digest|txModifiable|freeze SIGHASH_ALL/);
  assert.throws(() => createWalletReviewRequest({
    artifact: fixtureArtifact(5),
    pczt: fixturePczt(1),
    expectedManifestDigest: "00".repeat(32),
  }), /caller-supplied expected/);
});

test("rejects wallet inspection substitutions and conflicting envelope fields", () => {
  const request = reviewRequest(fixtureArtifact(), 2);
  const inspection = expectedWalletPcztInspection(request, request.manifestDigest);
  verifyWalletPcztInspection(request, inspection, request.manifestDigest);

  const changedOutput: WalletPcztInspection = {
    ...inspection,
    manifest: {
      ...inspection.manifest,
      outputs: [{ ...inspection.manifest.outputs[0], valueZatoshis: "99999" }],
    },
  };
  assert.throws(() => verifyWalletPcztInspection(request, changedOutput, request.manifestDigest), /does not exactly match/);

  const changedDigest: WalletPcztInspection = { ...inspection, pcztByteSha256: "00".repeat(32) };
  assert.throws(() => verifyWalletPcztInspection(request, changedDigest, request.manifestDigest), /does not exactly match|conflicts/);

  const changedManifestDigest: WalletPcztInspection = { ...inspection, manifestDigest: "00".repeat(32) };
  assert.throws(() => verifyWalletPcztInspection(request, changedManifestDigest, request.manifestDigest), /does not exactly match/);

  const withUnexpectedField = { ...inspection, extra: true } as never;
  assert.throws(() => verifyWalletPcztInspection(request, withUnexpectedField, request.manifestDigest), /unexpected fields/);
});

test("refuses readiness for an unproven Zallet-like capability declaration", () => {
  const unproven = allCapabilities("unproven");
  const report = assertWalletPcztReady instanceof Function
    ? (() => {
      try {
        return assertWalletPcztReady(unproven);
      } catch {
        return null;
      }
    })()
    : null;
  assert.equal(report, null);
  assert.throws(() => assertWalletPcztReady(unproven), /not ready.*unproven/);
  assert.throws(() => assertWalletPcztReady({ ...unproven, exactExpiry: "unsupported" }), /unsupported/);

  const proven = allCapabilities("proven");
  const narrowedCall = walletPcztReadiness as unknown as (...args: unknown[]) => ReturnType<typeof walletPcztReadiness>;
  const provenReport = narrowedCall(proven, []);
  assert.deepEqual(provenReport.required, REQUIRED_WALLET_PCZT_CAPABILITIES);
  assert.equal(provenReport.capabilityReady, true);
  assert.equal(provenReport.ready, false);
  assert.deepEqual(provenReport.policyBlockers, ["serializedTransactionSize=unresolved", "relayability=unresolved"]);
  assert.throws(() => assertWalletPcztReady(proven), /serializedTransactionSize=unresolved.*relayability=unresolved/);
});

test("keeps the adapter API opaque and string-only", () => {
  const adapter: WalletPcztAdapter = {
    capabilities: allCapabilities("proven"),
    createPczt: async (artifact: string) => artifact,
    inspectPczt: async (request: string) => request,
    signPczt: async (request: string) => request,
    combinePczt: async (requests: readonly string[]) => requests[0] ?? "",
    extractPczt: async (request: string) => request,
  };
  assert.throws(() => assertWalletPcztReady(adapter), /serializedTransactionSize=unresolved.*relayability=unresolved/);
  assert.equal(typeof adapter.createPczt, "function");
  assert.equal(typeof adapter.inspectPczt, "function");
  assert.equal(typeof adapter.signPczt, "function");
});

test("round-trips an exact restart snapshot and rejects checksum or artifact mutation", () => {
  const artifact = fixtureArtifact();
  const snapshot = createWalletPcztRestartSnapshot({
    artifact,
    pczt: fixturePczt(2),
    expectedManifestDigest: artifact.manifestDigest,
    lifecycle: "inspected",
    observedHeight: 4_200_050,
  });
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.artifact), true);
  assert.equal(Object.isFrozen(snapshot.artifact.manifest), true);
  const serialized = serializeWalletPcztRestartSnapshot(snapshot, artifact.manifestDigest);
  const restored = parseWalletPcztRestartSnapshot(serialized, {
    expectedManifestDigest: artifact.manifestDigest,
  });
  assert.deepEqual(restored, snapshot);
  verifyWalletPcztRestartSnapshot(restored, { expectedManifestDigest: artifact.manifestDigest });
  assert.doesNotThrow(() => assertWalletPcztRestartReady(restored, {
    expectedManifestDigest: artifact.manifestDigest,
  }));
  assert.throws(
    () => parseWalletPcztRestartSnapshot(serialized, { expectedManifestDigest: "00".repeat(32) }),
    /caller-supplied expected/,
  );

  const changedArtifact = {
    ...snapshot,
    artifact: {
      ...snapshot.artifact,
      manifest: { ...snapshot.artifact.manifest, feeZatoshis: "9999" },
    },
  };
  assert.throws(
    () => serializeWalletPcztRestartSnapshot(changedArtifact, artifact.manifestDigest),
    /checksum|artifact|input value/,
  );

  const changedPczt = { ...snapshot, pcztBase64: fixturePczt(2, [0xcc]).pcztBase64 };
  assert.throws(() => serializeWalletPcztRestartSnapshot(changedPczt, artifact.manifestDigest), /digest|checksum/);

  const unknownLifecycle = { ...snapshot, lifecycle: "mystery" } as never;
  assert.throws(() => serializeWalletPcztRestartSnapshot(unknownLifecycle, artifact.manifestDigest), /unknown|checksum/);
});

test("fails closed when restart expiry is observed or unresolved", () => {
  const artifact = fixtureArtifact();
  const snapshot = createWalletPcztRestartSnapshot({
    artifact,
    pczt: fixturePczt(1),
    expectedManifestDigest: artifact.manifestDigest,
    lifecycle: "inspected",
    observedHeight: 4_200_050,
  });
  const serialized = serializeWalletPcztRestartSnapshot(snapshot, artifact.manifestDigest);
  assert.throws(() => parseWalletPcztRestartSnapshot(serialized, {
    expectedManifestDigest: artifact.manifestDigest,
    observedHeight: 4_200_101,
  }), /expired/);
  assert.throws(() => assertWalletPcztRestartReady(snapshot, {
    expectedManifestDigest: artifact.manifestDigest,
    observedHeight: 4_200_101,
  }), /expired/);

  const unresolved = createWalletPcztRestartSnapshot({
    artifact,
    pczt: fixturePczt(1),
    expectedManifestDigest: artifact.manifestDigest,
    lifecycle: "created",
  });
  assert.equal(unresolved.observedHeight, null);
  assert.throws(() => assertWalletPcztRestartReady(unresolved, {
    expectedManifestDigest: artifact.manifestDigest,
  }), /unresolved/);
  assert.throws(() => parseWalletPcztRestartSnapshot(
    serializeWalletPcztRestartSnapshot(unresolved, artifact.manifestDigest),
    { expectedManifestDigest: artifact.manifestDigest, observedHeight: 4_200_101 },
  ), /expired/);
});

test("treats signed and extracted restart lifecycles as unverified header-only labels", () => {
  const artifact = fixtureArtifact();
  for (const lifecycle of ["signed", "extracted"] as const) {
    const snapshot = createWalletPcztRestartSnapshot({
      artifact,
      pczt: fixturePczt(1),
      expectedManifestDigest: artifact.manifestDigest,
      lifecycle,
      observedHeight: 4_200_050,
    });
    const restored = parseWalletPcztRestartSnapshot(
      serializeWalletPcztRestartSnapshot(snapshot, artifact.manifestDigest),
      { expectedManifestDigest: artifact.manifestDigest },
    );
    assert.equal(restored.lifecycle, lifecycle);
    assert.throws(
      () => assertWalletPcztRestartReady(restored, { expectedManifestDigest: artifact.manifestDigest }),
      /unverified caller label.*header-only/,
    );
  }
});
