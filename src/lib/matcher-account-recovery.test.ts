import assert from "node:assert/strict";
import test from "node:test";

import { createOrderDomain } from "./eip712-order.ts";
import {
  MATCHER_ACCOUNT_RECOVERY_DOMAIN_NAME,
  RECOVER_OPEN_ORDERS_TYPE,
  canonicalMatcherAccountRecoveryAuthorization,
  hashMatcherAccountRecovery,
  typedMatcherAccountRecoveryData,
  verifyMatcherAccountRecovery,
  type MatcherAccountRecoveryAuthorization,
} from "./matcher-account-recovery.ts";

const domain = createOrderDomain(42_161n, `0x${"11".repeat(20)}`);
const authorization: MatcherAccountRecoveryAuthorization = {
  makerAccountId: `0x${"22".repeat(32)}`,
  configurationHash: `0x${"33".repeat(32)}`,
  checkpointSequence: 9n,
  checkpointRecordHash: `0x${"44".repeat(32)}`,
  checkpointStateRoot: `0x${"55".repeat(32)}`,
  afterSequence: 2n,
  limit: 10,
  challenge: `0x${"66".repeat(32)}`,
  expiresAtSeconds: 1_800_000_060n,
};

test("account recovery typed data binds the exact matcher checkpoint and page", () => {
  const typed = typedMatcherAccountRecoveryData(domain, authorization);
  assert.equal(typed.domain.name, MATCHER_ACCOUNT_RECOVERY_DOMAIN_NAME);
  assert.equal(typed.primaryType, "RecoverOpenOrders");
  assert.equal(typed.message.makerAccountId, authorization.makerAccountId);
  assert.equal(typed.message.checkpointSequence, "9");
  assert.equal(typed.message.afterSequence, "2");
  assert.equal(typed.message.limit, 10);
  assert.deepEqual(
    typed.types.RecoverOpenOrders.map((field) => `${field.type} ${field.name}`).join(","),
    RECOVER_OPEN_ORDERS_TYPE.slice(RECOVER_OPEN_ORDERS_TYPE.indexOf("(") + 1, -1),
  );
});

test("recovery verification uses the EIP-712 digest and maker authority", () => {
  let observed: unknown;
  const digest = verifyMatcherAccountRecovery({
    verify(nextDigest, signature, signer) {
      observed = { nextDigest, signature, signer };
    },
  }, domain, authorization, "signature");
  assert.equal(digest, hashMatcherAccountRecovery(domain, authorization));
  assert.deepEqual(observed, {
    nextDigest: digest,
    signature: "signature",
    signer: authorization.makerAccountId,
  });
});

test("recovery authorization is canonical, immutable, and strictly bounded", () => {
  const canonical = canonicalMatcherAccountRecoveryAuthorization(authorization);
  assert.equal("signature" in canonical, false);
  assert.equal("signature" in typedMatcherAccountRecoveryData(domain, authorization).message, false);
  assert.equal(Object.isFrozen(canonical), true);
  assert.equal(
    canonicalMatcherAccountRecoveryAuthorization({ ...authorization, makerAccountId: `0x${"AA".repeat(32)}` }).makerAccountId,
    `0x${"aa".repeat(32)}`,
  );
  assert.throws(
    () => canonicalMatcherAccountRecoveryAuthorization({ ...authorization, limit: 101 }),
    /from 1 to 100/,
  );
  assert.throws(
    () => canonicalMatcherAccountRecoveryAuthorization({ ...authorization, expiresAtSeconds: 1n << 64n }),
    /fit uint64/,
  );
});

test("every recovery-bound field changes the digest", () => {
  const baseline = hashMatcherAccountRecovery(domain, authorization);
  const variants: MatcherAccountRecoveryAuthorization[] = [
    { ...authorization, makerAccountId: `0x${"77".repeat(32)}` },
    { ...authorization, configurationHash: `0x${"77".repeat(32)}` },
    { ...authorization, checkpointSequence: 10n },
    { ...authorization, checkpointRecordHash: `0x${"77".repeat(32)}` },
    { ...authorization, checkpointStateRoot: `0x${"77".repeat(32)}` },
    { ...authorization, afterSequence: 3n },
    { ...authorization, limit: 11 },
    { ...authorization, challenge: `0x${"77".repeat(32)}` },
    { ...authorization, expiresAtSeconds: authorization.expiresAtSeconds + 1n },
  ];
  for (const variant of variants) assert.notEqual(hashMatcherAccountRecovery(domain, variant), baseline);
});
