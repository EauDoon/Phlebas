export const POOL_IDS = ["pZEC/USDC", "pZEC/USDT0"] as const;

export type PoolId = (typeof POOL_IDS)[number];

export function isPoolId(value: string | undefined): value is PoolId {
  return POOL_IDS.includes(value as PoolId);
}

export function nextPoolId(id: PoolId, delta: number): PoolId {
  const count = POOL_IDS.length;
  const index = (POOL_IDS.indexOf(id) + delta + count) % count;
  return POOL_IDS[index];
}
