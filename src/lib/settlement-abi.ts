import { bytesToHex, hexToBytes, keccak256 } from "./keccak.ts";
import { concat, wordAddress, wordUint, type TypedOrder } from "./eip712.ts";

export const SETTLE_TYPE = "settle((address,uint8,address,address,uint128,uint128,uint64,uint64,uint64,uint256,address,uint16,uint8),bytes,(address,uint8,address,address,uint128,uint128,uint64,uint64,uint64,uint256,address,uint16,uint8),bytes,uint128)";

export const SETTLE_SELECTOR = bytesToHex(keccak256(new TextEncoder().encode(SETTLE_TYPE)).slice(0, 4));

function encodeOrder(order: TypedOrder): Uint8Array {
  return concat([
    wordAddress(order.maker),
    wordUint(BigInt(order.side)),
    wordAddress(order.baseAsset),
    wordAddress(order.quoteAsset),
    wordUint(order.baseAmount),
    wordUint(order.limitPriceTicks),
    wordUint(order.nonce),
    wordUint(order.accountEpoch),
    wordUint(order.expiry),
    wordUint(order.salt),
    wordAddress(order.recipient),
    wordUint(BigInt(order.maximumFeeBps)),
    wordUint(BigInt(order.allowedVenues)),
  ]);
}

function encodeBytes(data: Uint8Array): Uint8Array {
  const padded = new Uint8Array(Math.ceil(data.length / 32) * 32);
  padded.set(data);
  return concat([wordUint(BigInt(data.length)), padded]);
}

export function encodeSettleCalldata(
  maker: TypedOrder,
  makerSignature: string,
  taker: TypedOrder,
  takerSignature: string,
  fillAtoms: bigint,
): string {
  const makerSig = hexToBytes(makerSignature);
  const takerSig = hexToBytes(takerSignature);
  const makerEnc = encodeOrder(maker);
  const takerEnc = encodeOrder(taker);
  const makerSigEnc = encodeBytes(makerSig);
  const takerSigEnc = encodeBytes(takerSig);
  const headSize = makerEnc.length + 32 + takerEnc.length + 32 + 32;
  const makerSigOffset = BigInt(headSize);
  const takerSigOffset = makerSigOffset + BigInt(makerSigEnc.length);
  const head = concat([
    makerEnc,
    wordUint(makerSigOffset),
    takerEnc,
    wordUint(takerSigOffset),
    wordUint(fillAtoms),
  ]);
  return `0x${SETTLE_SELECTOR}${bytesToHex(concat([head, makerSigEnc, takerSigEnc]))}`;
}
