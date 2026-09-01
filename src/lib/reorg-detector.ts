// Reorg detector. The detector compares a fresh block height to a
// previously observed height and decides whether a reorg is in
// progress. The detector is a pure function: same input always
// yields the same output. The detector never holds a key and never
// signs a transaction. The detector never reaches out to the chain
// clients; the poller feeds it the heights.

const UINT64_MAX = (1n << 64n) - 1n;

export type ReorgVerdict = Readonly<{
  reorgDetected: boolean;
  depthBlocks: bigint;
  recommendation: "none" | "freeze" | "resync";
}>;

export function detectReorg(
  previousTip: bigint,
  freshTip: bigint,
  reorgDepth: bigint,
): ReorgVerdict {
  if (previousTip < 0n || freshTip < 0n) {
    throw new RangeError("Reorg detector inputs must be non-negative");
  }
  if (previousTip > UINT64_MAX || freshTip > UINT64_MAX) {
    throw new RangeError("Reorg detector inputs must fit uint64");
  }
  if (freshTip >= previousTip) {
    return { reorgDetected: false, depthBlocks: 0n, recommendation: "none" };
  }
  const depth = previousTip - freshTip;
  if (depth === 0n) {
    return { reorgDetected: false, depthBlocks: 0n, recommendation: "none" };
  }
  if (depth <= reorgDepth) {
    return { reorgDetected: true, depthBlocks: depth, recommendation: "freeze" };
  }
  return { reorgDetected: true, depthBlocks: depth, recommendation: "resync" };
}
