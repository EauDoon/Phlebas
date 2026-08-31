import { keccak256Text } from "./keccak.ts";
import { UINT64_MAX, normalizeHex32, type Hex32 } from "./order-domain.ts";

export const RECEIPT_VERSION = 1;
export const RECEIPT_GENESIS_HASH = `0x${"00".repeat(32)}` as Hex32;

export type IntakeReceipt = Readonly<{
  version: typeof RECEIPT_VERSION;
  sequence: bigint;
  acceptedAtSeconds: bigint;
  orderHash: Hex32;
  previousReceiptHash: Hex32;
  receiptHash: Hex32;
}>;

export type ReceiptChain = Readonly<{
  receipts: readonly IntakeReceipt[];
  head: Hex32;
  nextSequence: bigint;
}>;

export function emptyReceiptChain(): ReceiptChain {
  return { receipts: [], head: RECEIPT_GENESIS_HASH, nextSequence: 1n };
}

function receiptPayload(
  sequence: bigint,
  acceptedAtSeconds: bigint,
  orderHash: Hex32,
  previousReceiptHash: Hex32,
): string {
  return [
    "PhlebasIntakeReceipt",
    `version=${RECEIPT_VERSION}`,
    `sequence=${sequence}`,
    `acceptedAtSeconds=${acceptedAtSeconds}`,
    `orderHash=${normalizeHex32(orderHash, "Order hash")}`,
    `previousReceiptHash=${normalizeHex32(previousReceiptHash, "Previous receipt hash")}`,
  ].join("\n");
}

export function hashIntakeReceipt(
  sequence: bigint,
  acceptedAtSeconds: bigint,
  orderHash: Hex32,
  previousReceiptHash: Hex32,
): Hex32 {
  if (typeof sequence !== "bigint") throw new TypeError("Receipt sequence must be a bigint");
  if (typeof acceptedAtSeconds !== "bigint") throw new TypeError("Receipt time must be a bigint");
  if (sequence <= 0n || sequence > UINT64_MAX) throw new RangeError("Receipt sequence must be a positive uint64");
  if (acceptedAtSeconds < 0n || acceptedAtSeconds > UINT64_MAX) throw new RangeError("Receipt time must fit uint64");
  return keccak256Text(receiptPayload(sequence, acceptedAtSeconds, orderHash, previousReceiptHash));
}

export function appendIntakeReceipt(
  chain: ReceiptChain,
  orderHash: Hex32,
  acceptedAtSeconds: bigint,
): { chain: ReceiptChain; receipt: IntakeReceipt } {
  if (!verifyReceiptChain(chain)) throw new Error("Cannot append to an invalid receipt chain");
  const normalizedOrderHash = normalizeHex32(orderHash, "Order hash");
  const previousReceipt = chain.receipts.at(-1);
  if (previousReceipt && acceptedAtSeconds < previousReceipt.acceptedAtSeconds) {
    throw new RangeError("Receipt time cannot move backward");
  }
  if (chain.receipts.some((receipt) => normalizeHex32(receipt.orderHash, "Receipt order hash") === normalizedOrderHash)) {
    throw new Error("Order hash already has an intake receipt");
  }
  const receipt: IntakeReceipt = {
    version: RECEIPT_VERSION,
    sequence: chain.nextSequence,
    acceptedAtSeconds,
    orderHash: normalizedOrderHash,
    previousReceiptHash: chain.head,
    receiptHash: hashIntakeReceipt(chain.nextSequence, acceptedAtSeconds, normalizedOrderHash, chain.head),
  };
  return {
    receipt,
    chain: {
      receipts: [...chain.receipts, receipt],
      head: receipt.receiptHash,
      nextSequence: chain.nextSequence + 1n,
    },
  };
}

export function verifyReceiptChain(chain: ReceiptChain): boolean {
  try {
    let previous = RECEIPT_GENESIS_HASH;
    let previousAcceptedAtSeconds: bigint | undefined;
    let sequence = 1n;
    const seen = new Set<string>();
    for (const receipt of chain.receipts) {
      const orderHash = normalizeHex32(receipt.orderHash, "Receipt order hash");
      if (receipt.version !== RECEIPT_VERSION || receipt.sequence !== sequence) return false;
      if (receipt.previousReceiptHash !== previous || seen.has(orderHash)) return false;
      if (previousAcceptedAtSeconds !== undefined && receipt.acceptedAtSeconds < previousAcceptedAtSeconds) return false;
      if (receipt.receiptHash !== hashIntakeReceipt(sequence, receipt.acceptedAtSeconds, orderHash, previous)) return false;
      seen.add(orderHash);
      previous = receipt.receiptHash;
      previousAcceptedAtSeconds = receipt.acceptedAtSeconds;
      sequence += 1n;
    }
    return chain.head === previous && chain.nextSequence === sequence;
  } catch {
    return false;
  }
}
