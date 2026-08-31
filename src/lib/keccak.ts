const MASK64 = 0xffffffffffffffffn;

const RC = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
  0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
  0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
  0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
  0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
] as const;

const ROT = [
  0, 1, 62, 28, 27,
  36, 44, 6, 55, 20,
  3, 10, 43, 25, 39,
  41, 45, 15, 21, 8,
  18, 2, 61, 56, 14,
] as const;

function rotl64(value: bigint, shift: number): bigint {
  const n = BigInt(shift % 64);
  return ((value << n) | (value >> (64n - n))) & MASK64;
}

function keccakF(state: bigint[]): void {
  const c = new Array<bigint>(5);
  const d = new Array<bigint>(5);
  const b = new Array<bigint>(25);

  for (let round = 0; round < 24; round += 1) {
    for (let x = 0; x < 5; x += 1) {
      c[x] = state[x] ^ state[x + 5] ^ state[x + 10] ^ state[x + 15] ^ state[x + 20];
    }
    for (let x = 0; x < 5; x += 1) {
      d[x] = c[(x + 4) % 5] ^ rotl64(c[(x + 1) % 5], 1);
    }
    for (let i = 0; i < 25; i += 1) {
      state[i] ^= d[i % 5];
    }
    for (let i = 0; i < 25; i += 1) {
      const x = i % 5;
      const y = Math.floor(i / 5);
      b[y + 5 * ((2 * x + 3 * y) % 5)] = rotl64(state[i], ROT[i]);
    }
    for (let y = 0; y < 5; y += 1) {
      for (let x = 0; x < 5; x += 1) {
        const index = x + 5 * y;
        state[index] = b[index] ^ ((~b[((x + 1) % 5) + 5 * y]) & b[((x + 2) % 5) + 5 * y]);
        state[index] &= MASK64;
      }
    }
    state[0] ^= RC[round];
  }
}

function absorb(bytes: Uint8Array): bigint[] {
  const state = Array.from({ length: 25 }, () => 0n);
  const rate = 136;
  const padded = new Uint8Array((Math.floor(bytes.length / rate) + 1) * rate);
  padded.set(bytes);
  padded[bytes.length] ^= 0x01;
  padded[padded.length - 1] ^= 0x80;

  for (let offset = 0; offset < padded.length; offset += rate) {
    for (let i = 0; i < rate / 8; i += 1) {
      let lane = 0n;
      for (let j = 0; j < 8; j += 1) {
        lane |= BigInt(padded[offset + i * 8 + j]) << BigInt(8 * j);
      }
      state[i] ^= lane;
    }
    keccakF(state);
  }
  return state;
}

export function keccak256(bytes: Uint8Array): Uint8Array {
  const state = absorb(bytes);
  const out = new Uint8Array(32);
  for (let i = 0; i < 4; i += 1) {
    let lane = state[i];
    for (let j = 0; j < 8; j += 1) {
      out[i * 8 + j] = Number(lane & 0xffn);
      lane >>= 8n;
    }
  }
  return out;
}

export function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function hexToBytes(hex: string): Uint8Array {
  const normalized = hex.startsWith("0x") || hex.startsWith("0X") ? hex.slice(2) : hex;
  if (normalized.length % 2 !== 0 || !/^[0-9a-f]*$/i.test(normalized)) {
    throw new TypeError("Hex string must be even-length hexadecimal");
  }
  const out = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(normalized.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function keccak256Hex(input: Uint8Array | string): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  return bytesToHex(keccak256(bytes));
}
