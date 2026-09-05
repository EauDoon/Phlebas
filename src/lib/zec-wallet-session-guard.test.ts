import assert from "node:assert/strict";
import { test } from "node:test";

import type { ZecWalletSession } from "./zec-wallet-session.ts";
import {
  assertFreshZecIdentity,
  DEFAULT_ZEC_SESSION_POLL_SECONDS,
  invalidatedZecSession,
  isReviewedZecSession,
  MAX_ZEC_SESSION_POLL_SECONDS,
  MIN_ZEC_SESSION_POLL_SECONDS,
  revalidateZecIdentity,
  zecSessionPollSeconds,
  ZecIdentityDriftError,
  type ReviewedZecSession,
} from "./zec-wallet-session-guard.ts";

const ADDRESS = "zcash:mainnet:t1HsxXoGneCWcA56J24xLE34CFDWNK6RCqD";
const OTHER_ADDRESS = "zcash:mainnet:t1abLbcsgp6zvsgVRsHstzHqu34FmhjbW3r";

function connectedSession(address: string = ADDRESS): ZecWalletSession {
  return Object.freeze({
    state: Object.freeze({ address, error: null }),
    statement: null,
    assessment: null,
    addressControlSignature: "signature",
  });
}

function reviewedSession(overrides: Partial<ReviewedZecSession> = {}): ReviewedZecSession {
  return {
    session: connectedSession(),
    challenge: "phlebas-connect-challenge:" + "0".repeat(32),
    provenAtMs: Date.now(),
    ...overrides,
  };
}

type ProviderCall = { method: string; params?: unknown };

function providerWith(accountsResult: () => unknown, calls: ProviderCall[]) {
  return {
    async request(args: { method: string; params?: unknown }): Promise<unknown> {
      calls.push({ method: args.method, params: args.params });
      return accountsResult();
    },
  };
}

test("poll seconds default, bounds, and fallback", () => {
  assert.equal(zecSessionPollSeconds({}), DEFAULT_ZEC_SESSION_POLL_SECONDS);
  assert.equal(DEFAULT_ZEC_SESSION_POLL_SECONDS, 30);
  assert.equal(zecSessionPollSeconds({ NEXT_PUBLIC_ZEC_SESSION_POLL_SECONDS: "15" }), 15);
  assert.equal(zecSessionPollSeconds({ NEXT_PUBLIC_ZEC_SESSION_POLL_SECONDS: "9" }), DEFAULT_ZEC_SESSION_POLL_SECONDS);
  assert.equal(zecSessionPollSeconds({ NEXT_PUBLIC_ZEC_SESSION_POLL_SECONDS: "301" }), DEFAULT_ZEC_SESSION_POLL_SECONDS);
  assert.equal(zecSessionPollSeconds({ NEXT_PUBLIC_ZEC_SESSION_POLL_SECONDS: "zebra" }), DEFAULT_ZEC_SESSION_POLL_SECONDS);
  assert.ok(MIN_ZEC_SESSION_POLL_SECONDS <= DEFAULT_ZEC_SESSION_POLL_SECONDS);
  assert.ok(DEFAULT_ZEC_SESSION_POLL_SECONDS <= MAX_ZEC_SESSION_POLL_SECONDS);
});

test("revalidation passes only while the same account stays selected", async () => {
  const calls: ProviderCall[] = [];
  const provider = providerWith(() => [ADDRESS], calls);
  const verdict = await revalidateZecIdentity(provider, reviewedSession());
  assert.deepEqual(verdict, { ok: true, address: ADDRESS });
  // Non-interactive only: a poll or pre-action check reads accounts, never
  // requests accounts and never asks for a signature.
  assert.deepEqual(calls.map((call) => call.method), ["zcash_accounts"]);
});

test("revalidation fails closed on account drift", async () => {
  const provider = providerWith(() => [OTHER_ADDRESS], []);
  const verdict = await revalidateZecIdentity(provider, reviewedSession());
  assert.equal(verdict.ok, false);
  assert.equal(verdict.ok ? "" : verdict.reason, "drift");
  assert.match(verdict.ok ? "" : verdict.copy, /invalidated/);
});

test("revalidation fails closed when the wallet reports no accounts", async () => {
  const provider = providerWith(() => [], []);
  const verdict = await revalidateZecIdentity(provider, reviewedSession());
  assert.equal(verdict.ok, false);
  assert.equal(verdict.ok ? "" : verdict.reason, "no-account");
});

test("revalidation fails closed when the provider is unreachable", async () => {
  const provider = {
    async request(): Promise<unknown> {
      throw new Error("wallet went away");
    },
  };
  const verdict = await revalidateZecIdentity(provider, reviewedSession());
  assert.equal(verdict.ok, false);
  assert.equal(verdict.ok ? "" : verdict.reason, "unavailable");
});

test("assertFreshZecIdentity throws a drift error with the public copy", async () => {
  const provider = providerWith(() => [OTHER_ADDRESS], []);
  await assert.rejects(
    assertFreshZecIdentity(provider, reviewedSession()),
    (error: unknown) => error instanceof ZecIdentityDriftError && /invalidated/.test(error.message),
  );
});

test("invalidation reduces to the disconnected session with the public copy", () => {
  const session = invalidatedZecSession({ ok: false, reason: "drift", copy: "ignored" });
  assert.equal(session.state.address, null);
  assert.equal(session.state.error !== null, true);
  assert.match(session.state.error ?? "", /invalidated/);
  assert.equal(session.addressControlSignature, null);
  assert.equal(session.statement, null);
});

test("reviewed-session predicate is strict", () => {
  assert.equal(isReviewedZecSession(reviewedSession()), true);
  assert.equal(isReviewedZecSession(reviewedSession({ challenge: "" })), false);
  const unproven = reviewedSession({ session: connectedSession() });
  assert.equal(isReviewedZecSession(unproven), true);
  const errored = reviewedSession({
    session: Object.freeze({
      ...connectedSession(),
      state: Object.freeze({ address: ADDRESS, error: "signing refused" }),
    }),
  });
  assert.equal(isReviewedZecSession(errored), false);
  assert.equal(isReviewedZecSession(null), false);
});
