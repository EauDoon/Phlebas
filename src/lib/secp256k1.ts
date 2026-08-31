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

export function recoverAddress(digestHex: string, signatureHex: string): string {
  const digest = hexToBytes(digestHex);
  const signature = hexToBytes(signatureHex);
  if (digest.length !== 32 || signature.length !== 65) {
    throw new RangeError("Recover expects a 32-byte digest and 65-byte signature");
  }
  let v = signature[64];
  if (v < 27) v += 27;
  if (v !== 27 && v !== 28) throw new RangeError("Invalid signature v");
  const r = bytesToInt(signature.slice(0, 32));
  const s = bytesToInt(signature.slice(32, 64));
  if (r === 0n || r >= N || s === 0n || s >= N) throw new RangeError("Invalid signature r/s");

  let y = sqrt(mod(r * r * r + 7n, P));
  if ((y & 1n) !== BigInt(v - 27)) y = mod(P - y, P);
  const recovered = mul(
    add(mul({ x: GX, y: GY }, mod(N - bytesToInt(digest), N)), mul({ x: r, y }, s)),
    inverse(r, N),
  );
  if (!recovered) throw new RangeError("Recovery produced infinity");
  const uncompressed = hexToBytes(
    `${recovered.x.toString(16).padStart(64, "0")}${recovered.y.toString(16).padStart(64, "0")}`,
  );
  return `0x${bytesToHex(keccak256(uncompressed).slice(12))}`;
}
