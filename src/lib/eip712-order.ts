import { bytesToHex, keccak256, keccak256Text } from "./keccak.ts";
import {
  assertUint,
  normalizeAddress,
  normalizeHex32,
  type Hex32,
  type HexAddress,
} from "./order-domain.ts";

export const ORDER_DOMAIN_NAME = "Phlebas Order Intent";
export const ORDER_DOMAIN_VERSION = "1";

export const EIP712_DOMAIN_TYPE = "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)";
export const ORDER_INTENT_TYPE = "OrderIntent(bytes32 makerAccountId,bytes32 authorizedSignerId,bytes32 baseChainId,bytes32 baseAssetId,bytes32 quoteChainId,bytes32 quoteAssetId,uint8 side,uint256 baseAmountAtoms,uint256 limitPriceTicks,uint64 nonce,uint64 accountEpoch,uint64 expiry,bytes32 salt,bytes32 recipientAccountId,uint8 timeInForce,uint16 maximumFeeBps,uint8 allowedVenues,bytes32 settlementAdapterId)";

export type OrderSideCode = 0 | 1;
export type TimeInForceCode = 0 | 1 | 2;

export type OrderDomain = Readonly<{
  name: typeof ORDER_DOMAIN_NAME;
  version: typeof ORDER_DOMAIN_VERSION;
  chainId: bigint;
  verifyingContract: HexAddress;
}>;

export type TypedOrderIntent = Readonly<{
  makerAccountId: Hex32;
  authorizedSignerId: Hex32;
  baseChainId: Hex32;
  baseAssetId: Hex32;
  quoteChainId: Hex32;
  quoteAssetId: Hex32;
  side: OrderSideCode;
  baseAmountAtoms: bigint;
  limitPriceTicks: bigint;
  nonce: bigint;
  accountEpoch: bigint;
  expiry: bigint;
  salt: Hex32;
  recipientAccountId: Hex32;
  timeInForce: TimeInForceCode;
  maximumFeeBps: bigint;
  allowedVenues: number;
  settlementAdapterId: Hex32;
}>;

function hexToBytes(value: string): Uint8Array {
  const hex = value.startsWith("0x") ? value.slice(2) : value;
  if (hex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hex)) throw new TypeError("Hex value is invalid");
  return Uint8Array.from({ length: hex.length / 2 }, (_, index) => Number.parseInt(hex.slice(index * 2, (index * 2) + 2), 16));
}

function concatBytes(...values: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(values.reduce((total, value) => total + value.length, 0));
  let offset = 0;
  for (const value of values) {
    output.set(value, offset);
    offset += value.length;
  }
  return output;
}

function encodeUint(value: bigint, bits: 8 | 16 | 64 | 256, label: string): Uint8Array {
  const maximum = (1n << BigInt(bits)) - 1n;
  if (value < 0n || value > maximum) throw new RangeError(`${label} must fit uint${bits}`);
  return hexToBytes(value.toString(16).padStart(64, "0"));
}

function encodeBytes32(value: Hex32, label: string): Uint8Array {
  return hexToBytes(normalizeHex32(value, label));
}

function encodeAddress(value: HexAddress, label: string): Uint8Array {
  return hexToBytes(normalizeAddress(value, label).slice(2).padStart(64, "0"));
}

export function createOrderDomain(chainId: bigint, verifyingContract: string): OrderDomain {
  assertUint(chainId, 256, "EIP-712 chain ID");
  if (chainId === 0n) throw new RangeError("EIP-712 chain ID must be positive");
  return {
    name: ORDER_DOMAIN_NAME,
    version: ORDER_DOMAIN_VERSION,
    chainId,
    verifyingContract: normalizeAddress(verifyingContract, "Verifying contract"),
  };
}

export function hashOrderDomain(domain: OrderDomain): Hex32 {
  const encoded = concatBytes(
    hexToBytes(keccak256Text(EIP712_DOMAIN_TYPE)),
    hexToBytes(keccak256Text(domain.name)),
    hexToBytes(keccak256Text(domain.version)),
    encodeUint(domain.chainId, 256, "EIP-712 chain ID"),
    encodeAddress(domain.verifyingContract, "Verifying contract"),
  );
  return bytesToHex(keccak256(encoded));
}

export function hashOrderStruct(order: TypedOrderIntent): Hex32 {
  const encoded = concatBytes(
    hexToBytes(keccak256Text(ORDER_INTENT_TYPE)),
    encodeBytes32(order.makerAccountId, "Maker account ID"),
    encodeBytes32(order.authorizedSignerId, "Authorized signer ID"),
    encodeBytes32(order.baseChainId, "Base chain ID"),
    encodeBytes32(order.baseAssetId, "Base asset ID"),
    encodeBytes32(order.quoteChainId, "Quote chain ID"),
    encodeBytes32(order.quoteAssetId, "Quote asset ID"),
    encodeUint(BigInt(order.side), 8, "Side"),
    encodeUint(order.baseAmountAtoms, 256, "Base amount"),
    encodeUint(order.limitPriceTicks, 256, "Limit price"),
    encodeUint(order.nonce, 64, "Nonce"),
    encodeUint(order.accountEpoch, 64, "Account epoch"),
    encodeUint(order.expiry, 64, "Expiry"),
    encodeBytes32(order.salt, "Salt"),
    encodeBytes32(order.recipientAccountId, "Recipient account ID"),
    encodeUint(BigInt(order.timeInForce), 8, "Time in force"),
    encodeUint(order.maximumFeeBps, 16, "Maximum fee"),
    encodeUint(BigInt(order.allowedVenues), 8, "Allowed venues"),
    encodeBytes32(order.settlementAdapterId, "Settlement adapter ID"),
  );
  return bytesToHex(keccak256(encoded));
}

export function hashTypedOrder(domain: OrderDomain, order: TypedOrderIntent): Hex32 {
  return bytesToHex(keccak256(concatBytes(
    new Uint8Array([0x19, 0x01]),
    hexToBytes(hashOrderDomain(domain)),
    hexToBytes(hashOrderStruct(order)),
  )));
}

export function typedOrderData(domain: OrderDomain, order: TypedOrderIntent) {
  return {
    domain: {
      name: domain.name,
      version: domain.version,
      chainId: domain.chainId.toString(),
      verifyingContract: domain.verifyingContract,
    },
    primaryType: "OrderIntent" as const,
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" },
      ],
      OrderIntent: ORDER_INTENT_TYPE.slice("OrderIntent(".length, -1).split(",").map((field) => {
        const splitAt = field.lastIndexOf(" ");
        return { type: field.slice(0, splitAt), name: field.slice(splitAt + 1) };
      }),
    },
    message: {
      ...order,
      baseAmountAtoms: order.baseAmountAtoms.toString(),
      limitPriceTicks: order.limitPriceTicks.toString(),
      nonce: order.nonce.toString(),
      accountEpoch: order.accountEpoch.toString(),
      expiry: order.expiry.toString(),
      maximumFeeBps: order.maximumFeeBps.toString(),
    },
  };
}
