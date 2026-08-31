import {
  VENUE_CLOB,
  assertAddress,
  eip712DigestHex,
  timeInForceCode,
  type Eip712Domain,
  type TypedOrder,
} from "./eip712.ts";
import { keccak256Hex } from "./keccak.ts";
import { emptyBook, submitOrder, type Book, type Fill, type RestingOrder, type TimeInForce } from "./matcher.ts";
import { recoverAddress } from "./secp256k1.ts";

export type IntakeOrder = TypedOrder & {
  tif: TimeInForce;
  signature: string;
};

export type SequenceReceipt = {
  sequence: number;
  digest: string;
  maker: string;
  signature: string;
  status: "open" | "filled" | "cancelled" | "rejected";
  remainingAtoms: string;
  fills: Fill[];
  reason?: string;
};

type SerializedOrder = {
  id: string;
  side: RestingOrder["side"];
  priceTicks: string;
  remainingAtoms: string;
  seq: number;
};

type SerializedFill = {
  makerId: string;
  takerSide: Fill["takerSide"];
  priceTicks: string;
  sizeAtoms: string;
};

type SerializedReceipt = Omit<SequenceReceipt, "fills"> & { fills: SerializedFill[] };

export type OperatorSnapshot = {
  domain: Omit<Eip712Domain, "chainId"> & { chainId: string };
  sequence: number;
  baseAsset: string | null;
  quoteAssets: string[];
  sequenceRoot: string;
  book: {
    bids: SerializedOrder[];
    asks: SerializedOrder[];
    seq: number;
    lastTicks: string;
  };
  receipts: SerializedReceipt[];
};

export type MatcherOperator = {
  book: Book;
  sequence: number;
  receipts: SequenceReceipt[];
  domain: Eip712Domain;
  seenDigests: Set<string>;
  baseAsset: string | null;
  quoteAssets: Set<string>;
  now: () => bigint;
};

export function createMatcherOperator(
  domain: Eip712Domain,
  lastTicks: bigint,
  options: { baseAsset?: string; quoteAssets?: readonly string[]; now?: () => bigint } = {},
): MatcherOperator {
  return {
    book: emptyBook(lastTicks),
    sequence: 0,
    receipts: [],
    domain,
    seenDigests: new Set(),
    baseAsset: options.baseAsset ? assertAddress(options.baseAsset, "baseAsset") : null,
    quoteAssets: new Set(options.quoteAssets?.map((address) => assertAddress(address, "quoteAsset")) ?? []),
    now: options.now ?? (() => BigInt(Math.floor(Date.now() / 1_000))),
  };
}

export function sequenceRoot(operator: Pick<MatcherOperator, "sequence" | "receipts">): string {
  return keccak256Hex(`${operator.sequence}:${operator.receipts.map((receipt) => receipt.digest).join(":")}`);
}

export function verifyMakerSignature(digest: string, signature: string, maker: string): void {
  const recovered = recoverAddress(digest, signature);
  if (recovered !== maker.toLowerCase()) {
    throw new Error("Signature does not match maker");
  }
}

export function intakeSignedOrder(operator: MatcherOperator, order: IntakeOrder, options: { verify?: boolean } = {}): SequenceReceipt {
  const digest = eip712DigestHex(operator.domain, order);
  if (operator.seenDigests.has(digest)) throw new Error("duplicate-order");
  if (order.tif !== "GTC" && order.tif !== "IOC" && order.tif !== "FOK") throw new Error("invalid-time-in-force");
  if (order.timeInForce !== timeInForceCode(order.tif)) throw new Error("signed-time-in-force-mismatch");
  if (order.expiry !== 0n && order.expiry < operator.now()) throw new Error("expired-order");
  if ((order.allowedVenues & VENUE_CLOB) === 0) throw new Error("clob-venue-not-allowed");
  if (operator.baseAsset && order.baseAsset.toLowerCase() !== operator.baseAsset) throw new Error("base-asset-not-allowed");
  if (operator.quoteAssets.size > 0 && !operator.quoteAssets.has(order.quoteAsset.toLowerCase())) {
    throw new Error("quote-asset-not-allowed");
  }
  if (options.verify !== false) verifyMakerSignature(digest, order.signature, order.maker);
  const nextSequence = operator.sequence + 1;
  const id = `seq-${nextSequence}`;
  const result = submitOrder(operator.book, {
    id,
    side: order.side === 0 ? "buy" : "sell",
    tif: order.tif,
    priceTicks: order.limitPriceTicks,
    sizeAtoms: order.baseAmount,
  });
  if (order.tif !== "GTC" && result.fills.length > 1) throw new Error("multi-fill-tif-unsupported");
  const selfTrade = result.fills.some((fill) => {
    const makerSequence = Number(fill.makerId.slice(4));
    return operator.receipts[makerSequence - 1]?.maker === order.maker.toLowerCase();
  });
  if (selfTrade) throw new Error("self-trade-prevented");
  if (result.fills.length > 0 && order.maximumFeeBps < 15) throw new Error("taker-fee-cap-too-low");
  if (result.status === "open" && order.maximumFeeBps < 5) throw new Error("maker-fee-cap-too-low");
  operator.sequence = nextSequence;
  operator.book = result.book;
  const receipt: SequenceReceipt = {
    sequence: nextSequence,
    digest,
    maker: order.maker.toLowerCase(),
    signature: order.signature,
    status: result.status,
    remainingAtoms: result.remainingAtoms.toString(),
    fills: result.fills,
    reason: result.reason,
  };
  operator.seenDigests.add(digest);
  operator.receipts.push(receipt);
  return receipt;
}

function serializeResting(order: RestingOrder): SerializedOrder {
  return {
    id: order.id,
    side: order.side,
    priceTicks: order.priceTicks.toString(),
    remainingAtoms: order.remainingAtoms.toString(),
    seq: order.seq,
  };
}

function restoreResting(order: SerializedOrder): RestingOrder {
  return {
    id: order.id,
    side: order.side,
    priceTicks: BigInt(order.priceTicks),
    remainingAtoms: BigInt(order.remainingAtoms),
    seq: order.seq,
  };
}

export function snapshotOperator(operator: MatcherOperator): OperatorSnapshot {
  return {
    domain: {
      ...operator.domain,
      chainId: operator.domain.chainId.toString(),
    },
    sequence: operator.sequence,
  baseAsset: operator.baseAsset,
  quoteAssets: [...operator.quoteAssets],
    sequenceRoot: sequenceRoot(operator),
    book: {
      bids: operator.book.bids.map(serializeResting),
      asks: operator.book.asks.map(serializeResting),
      seq: operator.book.seq,
      lastTicks: operator.book.lastTicks.toString(),
    },
    receipts: operator.receipts.map((receipt) => ({
      ...receipt,
      fills: receipt.fills.map((fill) => ({
        makerId: fill.makerId,
        takerSide: fill.takerSide,
        priceTicks: fill.priceTicks.toString(),
        sizeAtoms: fill.sizeAtoms.toString(),
      })),
    })),
  };
}

export function restoreOperator(snapshot: OperatorSnapshot, options: { verify?: boolean; now?: () => bigint } = {}): MatcherOperator {
  if (!Number.isSafeInteger(snapshot.sequence) || snapshot.sequence < 0 || snapshot.receipts.length !== snapshot.sequence) {
    throw new Error("Invalid matcher sequence");
  }
  const baseAsset = snapshot.baseAsset === null ? null : assertAddress(snapshot.baseAsset, "baseAsset");
  const quoteAssets = snapshot.quoteAssets.map((address) => assertAddress(address, "quoteAsset"));
  const receipts = snapshot.receipts.map((receipt, index) => {
    if (receipt.sequence !== index + 1 || !/^[0-9a-f]{64}$/.test(receipt.digest)) {
      throw new Error("Invalid matcher receipt sequence or digest");
    }
    return {
      ...receipt,
      fills: receipt.fills.map((fill) => ({
        ...fill,
        priceTicks: BigInt(fill.priceTicks),
        sizeAtoms: BigInt(fill.sizeAtoms),
      })),
    };
  });
  const seenDigests = new Set(receipts.map((receipt) => receipt.digest));
  if (seenDigests.size !== receipts.length) throw new Error("Duplicate matcher receipt digest");
  const operator: MatcherOperator = {
    domain: {
      ...snapshot.domain,
      chainId: BigInt(snapshot.domain.chainId),
    },
    sequence: snapshot.sequence,
    receipts,
    book: {
      bids: snapshot.book.bids.map(restoreResting),
      asks: snapshot.book.asks.map(restoreResting),
      seq: snapshot.book.seq,
      lastTicks: BigInt(snapshot.book.lastTicks),
    },
    seenDigests,
    baseAsset,
    quoteAssets: new Set(quoteAssets),
    now: options.now ?? (() => BigInt(Math.floor(Date.now() / 1_000))),
  };
  if (options.verify !== false) {
    for (const receipt of operator.receipts) {
      verifyMakerSignature(receipt.digest, receipt.signature, receipt.maker);
    }
  }
  if (snapshot.sequenceRoot !== sequenceRoot(operator)) {
    throw new Error("Persisted sequence root does not match restored receipts");
  }
  return operator;
}
