import { bytesToHex, hexToBytes, keccak256 } from "./keccak.ts";

const P = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn;
const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const GX = 0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n;
const GY = 0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n;

type Point = { x: bigint; y: bigint } | null;

function mod(value: bigint, modulus: bigint): bigint {
  const reduced = value % modulus;
  return reduced < 0n ? reduced + modulus : reduced;
}

function inverse(value: bigint, modulus: bigint): bigint {
  let [oldR, r] = [modulus, mod(value, modulus)];
  let [oldS, s] = [0n, 1n];
  while (r !== 0n) {
    const quotient = oldR / r;
    [oldR, r] = [r, oldR - quotient * r];
    [oldS, s] = [s, oldS - quotient * s];
  }
  if (oldR !== 1n) throw new RangeError("not invertible");
  return mod(oldS, modulus);
}

function add(left: Point, right: Point): Point {
  if (!left) return right;
  if (!right) return left;
  if (left.x === right.x) {
    if (mod(left.y + right.y, P) === 0n) return null;
    const lambda = mod(3n * left.x * left.x * inverse(2n * left.y, P), P);
    const x = mod(lambda * lambda - 2n * left.x, P);
    return { x, y: mod(lambda * (left.x - x) - left.y, P) };
  }
  const lambda = mod((right.y - left.y) * inverse(right.x - left.x, P), P);
  const x = mod(lambda * lambda - left.x - right.x, P);
  return { x, y: mod(lambda * (left.x - x) - left.y, P) };
}

function mul(point: Point, scalar: bigint): Point {
  let result: Point = null;
  let addend = point;
  let k = mod(scalar, N);
  while (k > 0n) {
    if (k & 1n) result = add(result, addend);
    addend = add(addend, addend);
    k >>= 1n;
  }
  return result;
}

function sqrt(value: bigint): bigint {
  let base = mod(value, P);
  let exp = (P + 1n) / 4n;
  let result = 1n;
  while (exp > 0n) {
    if (exp & 1n) result = mod(result * base, P);
    base = mod(base * base, P);
    exp >>= 1n;
  }
  if (mod(result * result, P) !== mod(value, P)) throw new RangeError("not a square");
  return result;
}

function bytesToInt(bytes: Uint8Array): bigint {
  return BigInt(`0x${bytesToHex(bytes)}`);
}

function decodeFixedHex(value: string, byteLength: number, label: string): Uint8Array {
  if (typeof value !== "string") throw new TypeError(`${label} must be hexadecimal`);
  const normalized = value.startsWith("0x") || value.startsWith("0X") ? value.slice(2) : value;
  if (normalized.length !== byteLength * 2 || !/^[0-9a-f]+$/i.test(normalized)) {
    throw new RangeError(`Expected a ${byteLength}-byte ${label.toLowerCase()} in hexadecimal`);
  }
  return hexToBytes(normalized);
}

function signatureValues(signature: Uint8Array): { r: bigint; s: bigint } {
  if (signature.length !== 64) throw new RangeError("Compact signature body must be 64 bytes");
  const r = bytesToInt(signature.slice(0, 32));
  const s = bytesToInt(signature.slice(32, 64));
  if (r === 0n || r >= N || s === 0n || s >= N) throw new RangeError("Invalid signature r/s");
  return { r, s };
}

function recoverPoint(digest: Uint8Array, signature: Uint8Array, recoveryId: number): Point {
  const { r, s } = signatureValues(signature);
  if (digest.length !== 32) throw new RangeError("Recovery digest must be 32 bytes");
  if (recoveryId < 0 || recoveryId > 3) throw new RangeError("Invalid recovery id");

  const x = r + BigInt(recoveryId >> 1) * N;
  if (x >= P) throw new RangeError("Invalid recovery x coordinate");
  let y = sqrt(mod(x * x * x + 7n, P));
  if ((y & 1n) !== BigInt(recoveryId & 1)) y = mod(P - y, P);
  if ((y & 1n) !== BigInt(recoveryId & 1)) throw new RangeError("Invalid recovery y coordinate");

  const recovered = mul(
    add(mul({ x: GX, y: GY }, mod(N - bytesToInt(digest), N)), mul({ x, y }, s)),
    inverse(r, N),
  );
  if (!recovered) throw new RangeError("Recovery produced infinity");
  return recovered;
}

function serializePoint(point: Point, compressed: boolean): Uint8Array {
  if (!point) throw new RangeError("Cannot serialize the point at infinity");
  const x = hexToBytes(point.x.toString(16).padStart(64, "0"));
  const y = hexToBytes(point.y.toString(16).padStart(64, "0"));
  if (compressed) {
    const output = new Uint8Array(33);
    output[0] = Number(2n + (point.y & 1n));
    output.set(x, 1);
    return output;
  }
  const output = new Uint8Array(65);
  output[0] = 4;
  output.set(x, 1);
  output.set(y, 33);
  return output;
}

export function recoverCompactPublicKey(digestHex: string, compactSignatureHex: string): Uint8Array {
  const digest = decodeFixedHex(digestHex, 32, "Digest");
  const signature = decodeFixedHex(compactSignatureHex, 65, "Compact signature");
  const header = signature[0];
  if (header < 27 || header > 34) throw new RangeError("Invalid compact signature header");
  const recoveryId = (header - 27) & 3;
  const compressed = ((header - 27) & 4) !== 0;
  return serializePoint(recoverPoint(digest, signature.slice(1), recoveryId), compressed);
}

export function verifySecp256k1Digest(
  digestHex: string,
  signatureBodyHex: string,
  publicKeyHex: string,
): boolean {
  try {
    const digest = decodeFixedHex(digestHex, 32, "Digest");
    const signature = decodeFixedHex(signatureBodyHex, 64, "Signature body");
    const publicKey = decodeFixedHex(publicKeyHex, 33, "Compressed public key");
    const { r, s } = signatureValues(signature);
    const prefix = publicKey[0];
    if (prefix !== 0x02 && prefix !== 0x03) return false;

    const x = bytesToInt(publicKey.slice(1));
    if (x >= P) return false;
    let y = sqrt(mod(x * x * x + 7n, P));
    if ((y & 1n) !== BigInt(prefix & 1)) y = mod(P - y, P);
    if ((y & 1n) !== BigInt(prefix & 1)) return false;
    const publicPoint = { x, y };
    const inverseS = inverse(s, N);
    const u1 = mod(bytesToInt(digest) * inverseS, N);
    const u2 = mod(r * inverseS, N);
    const point = add(
      mul({ x: GX, y: GY }, u1),
      mul(publicPoint, u2),
    );
    return point !== null && mod(point.x, N) === r;
  } catch {
    return false;
  }
}

export function recoverAddress(digestHex: string, signatureHex: string): string {
  const digest = decodeFixedHex(digestHex, 32, "Digest");
  const signature = decodeFixedHex(signatureHex, 65, "Signature");
  let v = signature[64];
  if (v < 27) v += 27;
  if (v !== 27 && v !== 28) throw new RangeError("Invalid signature v");
  const { s } = signatureValues(signature.slice(0, 64));
  if (s > N / 2n) throw new RangeError("Signature s must be canonical low-s");
  const uncompressed = serializePoint(recoverPoint(digest, signature.slice(0, 64), v - 27), false).slice(1);
  return `0x${bytesToHex(keccak256(uncompressed).slice(12))}`;
}
