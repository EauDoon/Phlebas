import { eip712DigestHex, type Eip712Domain, type TypedOrder } from "./eip712.ts";
import { emptyBook, submitOrder, type Book, type Fill, type TimeInForce } from "./matcher.ts";

export type IntakeOrder = TypedOrder & {
  tif: TimeInForce;
  signature: string;
};

export type SequenceReceipt = {
  sequence: number;
  digest: string;
  maker: string;
  status: "open" | "filled" | "cancelled" | "rejected";
  remainingAtoms: string;
  fills: Fill[];
  reason?: string;
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

export function intakeSignedOrder(operator: MatcherOperator, order: IntakeOrder): SequenceReceipt {
  const digest = eip712DigestHex(operator.domain, order);
  operator.sequence += 1;
  const id = `seq-${operator.sequence}`;
  const result = submitOrder(operator.book, {
    id,
    side: order.side === 0 ? "buy" : "sell",
    tif: order.tif,
    priceTicks: order.limitPriceTicks,
    sizeAtoms: order.baseAmount,
  });
  operator.book = result.book;
  const receipt: SequenceReceipt = {
    sequence: operator.sequence,
    digest,
    maker: order.maker.toLowerCase(),
    status: result.status,
    remainingAtoms: result.remainingAtoms.toString(),
    fills: result.fills,
    reason: result.reason,
  };
  operator.receipts.push(receipt);
  return receipt;
}
