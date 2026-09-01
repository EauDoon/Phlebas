export const MAKER_FEE_BPS = 5;
export const TAKER_FEE_BPS = 15;
export const AMM_FEE_BPS = 30;
export const MAX_FEE_BPS = 30;

export function feeEnvelopeCopy(): string {
  return `Proposed taker ${TAKER_FEE_BPS} bps, maker ${MAKER_FEE_BPS} bps, AMM ${AMM_FEE_BPS} bps. Not deducted in this preview. Protocol fee is zero.`;
}
