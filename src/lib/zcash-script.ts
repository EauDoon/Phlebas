// Zcash script op-code helpers. Atomic-swap P2SH scripts are built from
// these primitives. The script engine is the same as Bitcoin's: every
// opcode has a one-byte tag, push data uses OP_PUSHBYTES_N (1..75) or
// OP_PUSHDATA1/2/4, and the lock time is checked by OP_CHECKLOCKTIMEVERIFY
// (0xB1) over a 4-byte little-endian unix timestamp.

export const OP = {
  OP_FALSE: 0x00,
  OP_TRUE: 0x51,
  OP_IF: 0x63,
  OP_NOTIF: 0x64,
  OP_ELSE: 0x67,
  OP_ENDIF: 0x68,
  OP_VERIFY: 0x69,
  OP_RETURN: 0x6a,
  OP_DUP: 0x76,
  OP_EQUAL: 0x87,
  OP_EQUALVERIFY: 0x88,
  OP_HASH160: 0xa9,
  OP_HASH256: 0xaa,
  OP_CHECKSIG: 0xac,
  OP_CHECKSIGVERIFY: 0xad,
  OP_CHECKLOCKTIMEVERIFY: 0xb1,
  OP_CHECKMULTISIG: 0xae,
  OP_DROP: 0x75,
} as const;

export function pushData(data: Uint8Array): Uint8Array {
  const len = data.length;
  if (len < 0x4c) {
    return new Uint8Array([len, ...data]);
  }
  if (len <= 0xff) {
    return new Uint8Array([0x4c, len, ...data]);
  }
  if (len <= 0xffff) {
    const out = new Uint8Array(3 + len);
    out[0] = 0x4d;
    out[1] = len & 0xff;
    out[2] = (len >> 8) & 0xff;
    out.set(data, 3);
    return out;
  }
  const out = new Uint8Array(5 + len);
  out[0] = 0x4e;
  out[1] = len & 0xff;
  out[2] = (len >> 8) & 0xff;
  out[3] = (len >> 16) & 0xff;
  out[4] = (len >> 24) & 0xff;
  out.set(data, 5);
  return out;
}

/**
 * Push a non-negative integer as a minimally encoded CScriptNum.
 *
 * CScriptNum is sign-and-magnitude little-endian, so the sign lives in
 * the top bit of the *last* byte and a value whose most significant byte
 * already has bit 7 set needs a 0x00 byte appended after it to stay
 * positive. Zero is the empty push, which is the single byte OP_0.
 */
export function pushNumber(value: number | bigint): Uint8Array {
  if (value < 0n) throw new RangeError("Script cannot push negative numbers");
  let n = typeof value === "bigint" ? value : BigInt(value);
  const little: number[] = [];
  while (n > 0n) {
    little.push(Number(n & 0xffn));
    n >>= 8n;
  }
  // The pad follows the most significant byte, which in little-endian
  // order is the last one. Testing the first byte and prepending the pad
  // shifts every byte one place up, so 1000 pushes as 256000, and a value
  // whose real high byte has bit 7 set is read back as negative.
  if (little.length > 0 && (little[little.length - 1]! & 0x80) !== 0) little.push(0x00);
  return pushData(Uint8Array.from(little));
}

export function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
