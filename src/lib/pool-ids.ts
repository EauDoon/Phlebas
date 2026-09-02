export const POOL_IDS = ["ZEC/USDC", "ZEC/USDT"] as const;

export type PoolId = (typeof POOL_IDS)[number];

export function isPoolId(value: string | undefined): value is PoolId {
  return POOL_IDS.includes(value as PoolId);
}

export function nextPoolId(id: PoolId, delta: number): PoolId {
  const count = POOL_IDS.length;
  const current = POOL_IDS.indexOf(id);
  if (current < 0) {
    throw new Error(`Unknown pool id: ${id}`);
  }
  if (!Number.isInteger(delta)) {
    throw new Error("Pool id step must be an integer");
  }
  // A single `+ count` only cancels a delta of magnitude up to `count`; any
  // caller stepping further back (e.g. delta <= -count) drove the index
  // negative again, and POOL_IDS[negative] is `undefined` in JS rather than
  // an error -- a PoolId-typed function silently handing back `undefined`
  // to whatever expects a pool id. Reduce modulo count twice so any integer
  // delta lands in range instead of guessing.
  const index = (((current + delta) % count) + count) % count;
  return POOL_IDS[index];
}
