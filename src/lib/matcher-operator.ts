import { eip712DigestHex, type Eip712Domain, type TypedOrder } from "./eip712.ts";
import { keccak256Hex } from "./keccak.ts";
import { emptyBook, expireRestingOrders, submitOrder, type Book, type Fill, type RestingOrder, type TimeInForce } from "./matcher.ts";
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
  expiryUnix?: string;
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
};

export function createMatcherOperator(domain: Eip712Domain, lastTicks: bigint): MatcherOperator {
  return {
    book: emptyBook(lastTicks),
    sequence: 0,
    receipts: [],
    domain,
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
  if (options.verify !== false && order.signature.length >= 130) {
    verifyMakerSignature(digest, order.signature, order.maker);
  }
  operator.sequence += 1;
  const id = `seq-${operator.sequence}`;
  const nowUnix = BigInt(Math.floor(Date.now() / 1000));
  operator.book = expireRestingOrders(operator.book, nowUnix).book;
  const result = submitOrder(operator.book, {
    id,
    side: order.side === 0 ? "buy" : "sell",
    tif: order.tif,
    priceTicks: order.limitPriceTicks,
    sizeAtoms: order.baseAmount,
    expiryUnix: order.expiry,
    nowUnix,
  });
  operator.book = result.book;
  const receipt: SequenceReceipt = {
    sequence: operator.sequence,
    digest,
    maker: order.maker.toLowerCase(),
    signature: order.signature,
    status: result.status,
    remainingAtoms: result.remainingAtoms.toString(),
    fills: result.fills,
    reason: result.reason,
  };
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
    ...((order.expiryUnix ?? 0n) > 0n ? { expiryUnix: order.expiryUnix?.toString() } : {}),
  };
}

function restoreResting(order: SerializedOrder): RestingOrder {
  return {
    id: order.id,
    side: order.side,
    priceTicks: BigInt(order.priceTicks),
    remainingAtoms: BigInt(order.remainingAtoms),
    seq: order.seq,
    ...(order.expiryUnix ? { expiryUnix: BigInt(order.expiryUnix) } : {}),
  };
}

export function snapshotOperator(operator: MatcherOperator): OperatorSnapshot {
  return {
    domain: {
      ...operator.domain,
      chainId: operator.domain.chainId.toString(),
    },
    sequence: operator.sequence,
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

export function restoreOperator(snapshot: OperatorSnapshot): MatcherOperator {
  const operator: MatcherOperator = {
    domain: {
      ...snapshot.domain,
      chainId: BigInt(snapshot.domain.chainId),
    },
    sequence: snapshot.sequence,
    receipts: snapshot.receipts.map((receipt) => ({
      ...receipt,
      fills: receipt.fills.map((fill) => ({
        ...fill,
        priceTicks: BigInt(fill.priceTicks),
        sizeAtoms: BigInt(fill.sizeAtoms),
      })),
    })),
    book: {
      bids: snapshot.book.bids.map(restoreResting),
      asks: snapshot.book.asks.map(restoreResting),
      seq: snapshot.book.seq,
      lastTicks: BigInt(snapshot.book.lastTicks),
    },
  };
  for (const receipt of operator.receipts) {
    if (receipt.signature.length >= 130) {
      verifyMakerSignature(receipt.digest, receipt.signature, receipt.maker);
    }
  }
  const restoredRoot = sequenceRoot(operator);
  if (snapshot.sequenceRoot && snapshot.sequenceRoot !== restoredRoot) {
    throw new Error("Persisted sequence root does not match restored receipts.");
  }
  return operator;
}
