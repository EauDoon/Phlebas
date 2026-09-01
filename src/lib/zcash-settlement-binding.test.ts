import { strict as assert } from "node:assert";
import { test } from "node:test";

import type { ZcashSwapProjectionV1 } from "./zcash-swap-projection.ts";
import {
  commitZcashSettlementArtifactBinding,
  parseZcashSettlementArtifactBinding,
  serializeZcashSettlementArtifactBinding,
  verifyZcashSettlementArtifactBinding,
} from "./zcash-settlement-binding.ts";

const projection = {
  swapId: `0x${"11".repeat(32)}`,
  termsHash: `0x${"22".repeat(32)}`,
} as ZcashSwapProjectionV1;

test("commits each Zcash artifact manifest to an exact swap and terms hash", () => {
  const committed = commitZcashSettlementArtifactBinding({
    projection,
    action: "fund",
    artifactManifestDigest: "33".repeat(32),
  });
  verifyZcashSettlementArtifactBinding(committed);
  const restored = parseZcashSettlementArtifactBinding(serializeZcashSettlementArtifactBinding(committed));
  assert.deepEqual(restored, committed);
  assert.equal(Object.isFrozen(restored), true);
  assert.equal(Object.isFrozen(restored.binding), true);
});

test("domain-separates funding, claim, refund, artifact, swap, and terms commitments", () => {
  const baseline = commitZcashSettlementArtifactBinding({ projection, action: "fund", artifactManifestDigest: "33".repeat(32) });
  for (const changed of [
    commitZcashSettlementArtifactBinding({ projection, action: "claim", artifactManifestDigest: "33".repeat(32) }),
    commitZcashSettlementArtifactBinding({ projection, action: "refund", artifactManifestDigest: "33".repeat(32) }),
    commitZcashSettlementArtifactBinding({ projection, action: "fund", artifactManifestDigest: "44".repeat(32) }),
    commitZcashSettlementArtifactBinding({
      projection: { ...projection, swapId: `0x${"55".repeat(32)}` },
      action: "fund",
      artifactManifestDigest: "33".repeat(32),
    }),
    commitZcashSettlementArtifactBinding({
      projection: { ...projection, termsHash: `0x${"66".repeat(32)}` },
      action: "fund",
      artifactManifestDigest: "33".repeat(32),
    }),
  ]) assert.notEqual(changed.bindingDigest, baseline.bindingDigest);
});

test("rejects mutation, unknown fields, noncanonical bytes, and invalid digests", () => {
  const committed = commitZcashSettlementArtifactBinding({ projection, action: "fund", artifactManifestDigest: "33".repeat(32) });
  assert.throws(
    () => verifyZcashSettlementArtifactBinding({
      ...committed,
      binding: { ...committed.binding, artifactManifestDigest: "44".repeat(32) },
    }),
    /does not match/,
  );
  assert.throws(
    () => verifyZcashSettlementArtifactBinding({ ...committed, extra: true } as never),
    /unsupported fields/,
  );
  assert.throws(
    () => parseZcashSettlementArtifactBinding(`${serializeZcashSettlementArtifactBinding(committed)}\n`),
    /surrounding whitespace/,
  );
  assert.throws(
    () => parseZcashSettlementArtifactBinding(JSON.stringify(committed)),
    /canonical JSON/,
  );
  assert.throws(
    () => commitZcashSettlementArtifactBinding({ projection, action: "fund", artifactManifestDigest: "AA".repeat(32) }),
    /lowercase hexadecimal/,
  );
});
