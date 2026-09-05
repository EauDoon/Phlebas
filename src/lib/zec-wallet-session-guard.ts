// ZEC wallet session guard (review-7): a proven ZEC session is a claim about
// the past. This module keeps that claim honest by revalidating wallet
// identity with non-interactive reads only, invalidating on drift or
// unreliability, and never letting a supplementary poll trigger a wallet
// approval prompt.
//
// Policy implemented here (owner direction, 2026-09-06):
//   - Fresh identity validation before every sensitive action and after
//     reconnect or page resume.
//   - Signatures stay bound to the exact reviewed account and network; any
//     drift fails closed.
//   - Zcash browser wallets expose no event surface, so foreground polling
//     with non-interactive account reads is the supplementary detection.
//     Polling stops while the page is hidden or the session is gone and
//     revalidation runs once on return.
//   - A session that cannot be reliably revalidated is invalidated; it is
//     never retained as "verified" merely because it was valid earlier.

import {
  canonicalTransparentAddresses,
  ZEC_RPC_METHODS,
  type ZecJsonRpcProvider,
} from "./zec-wallet-provider.ts";
import {
  disconnectedZecSession,
  type ZecWalletSession,
} from "./zec-wallet-session.ts";

/** The reviewed session wrapper: a connected session plus its proof binding. */
export type ReviewedZecSession = Readonly<{
  session: ZecWalletSession;
  /** The exact challenge the wallet signed; a fresh proof must bind a new one. */
  challenge: string;
  /** Wall-clock milliseconds when the proof was accepted. */
  provenAtMs: number;
}>;

export const DEFAULT_ZEC_SESSION_POLL_SECONDS = 30;
export const MIN_ZEC_SESSION_POLL_SECONDS = 10;
export const MAX_ZEC_SESSION_POLL_SECONDS = 300;

/**
 * Configurable foreground polling interval (seconds). Public env var only:
 * this is a UX cadence, never a secret. Out-of-range values fall back to
 * the 30-second default rather than being trusted.
 */
export function zecSessionPollSeconds(env: Record<string, string | undefined> = process.env): number {
  const raw = env.NEXT_PUBLIC_ZEC_SESSION_POLL_SECONDS;
  if (raw === undefined) return DEFAULT_ZEC_SESSION_POLL_SECONDS;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < MIN_ZEC_SESSION_POLL_SECONDS || parsed > MAX_ZEC_SESSION_POLL_SECONDS) {
    return DEFAULT_ZEC_SESSION_POLL_SECONDS;
  }
  return parsed;
}

export function isReviewedZecSession(value: ReviewedZecSession | null): value is ReviewedZecSession {
  return value !== null
    && value.session.state.address !== null
    && value.session.state.error === null
    && value.session.addressControlSignature !== null
    && value.challenge.length > 0;
}

export type ZecRevalidationVerdict =
  | { ok: true; address: string }
  | { ok: false; reason: "drift" | "unavailable" | "no-account"; copy: string };

export const ZEC_IDENTITY_INVALIDATED_COPY =
  "ZEC wallet identity could not be revalidated, so the session was invalidated. Reconnect to continue.";
const ZEC_IDENTITY_DRIFT_COPY =
  "The selected ZEC wallet account changed, so the session was invalidated. Reconnect with the account you intend to use.";
const ZEC_IDENTITY_UNAVAILABLE_COPY = ZEC_IDENTITY_INVALIDATED_COPY;
const ZEC_IDENTITY_NO_ACCOUNT_COPY = ZEC_IDENTITY_DRIFT_COPY;

/**
 * Non-interactive identity revalidation. Reads `zcash_accounts` only: this
 * function must never request accounts or ask for a signature. A provider
 * error, an empty account list, or a different first canonical mainnet
 * address all fail closed.
 */
export async function revalidateZecIdentity(
  provider: ZecJsonRpcProvider,
  reviewed: ReviewedZecSession,
): Promise<ZecRevalidationVerdict> {
  const provenAddress = reviewed.session.state.address;
  if (provenAddress === null || reviewed.session.state.error !== null) {
    return { ok: false, reason: "drift", copy: ZEC_IDENTITY_INVALIDATED_COPY };
  }
  let accounts: unknown;
  try {
    accounts = await provider.request({ method: ZEC_RPC_METHODS.accounts });
  } catch {
    return { ok: false, reason: "unavailable", copy: ZEC_IDENTITY_UNAVAILABLE_COPY };
  }
  const current = canonicalTransparentAddresses(accounts)[0] ?? null;
  if (current === null) {
    return { ok: false, reason: "no-account", copy: ZEC_IDENTITY_NO_ACCOUNT_COPY };
  }
  if (current !== provenAddress) {
    return { ok: false, reason: "drift", copy: ZEC_IDENTITY_DRIFT_COPY };
  }
  return { ok: true, address: current };
}

/**
 * The invalidation verdict for a reviewed session, reduced to the frozen
 * disconnected session plus the public copy a surface should show.
 */
export function invalidatedZecSession(verdict: Extract<ZecRevalidationVerdict, { ok: false }>): ZecWalletSession {
  void verdict;
  return Object.freeze({
    ...disconnectedZecSession,
    state: Object.freeze({ address: null, error: ZEC_IDENTITY_INVALIDATED_COPY }),
  });
}

/** A sensitive action must prove identity immediately before it runs. */
export async function assertFreshZecIdentity(
  provider: ZecJsonRpcProvider,
  reviewed: ReviewedZecSession,
): Promise<void> {
  const verdict = await revalidateZecIdentity(provider, reviewed);
  if (!verdict.ok) {
    throw new ZecIdentityDriftError(verdict.copy);
  }
}

export class ZecIdentityDriftError extends Error {
  constructor(copy: string) {
    super(copy);
    this.name = "ZecIdentityDriftError";
  }
}
