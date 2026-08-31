import assert from "node:assert/strict";
import test from "node:test";

import { recoverAddress } from "./secp256k1.ts";

test("recovers the Anvil-0 address from the frozen EIP-712 digest", () => {
  const address = recoverAddress(
    "23cf06d636047955c46b031bd1e5e788d74321da1c19d01ee562b2e194cdc4e9",
    "0x25dda9696a4eed8b907e5b9fcb79f39169284f1c544f992627af993faa4a61e63c69c69b68a6306e970377cdcb9af0bb1dac6cd4f223f2fbba034c06682651091b",
  );
  assert.equal(address, "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266");
});

test("rejects a malleable high-s form of a valid signature", () => {
  const curveOrder = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
  const low = "0x25dda9696a4eed8b907e5b9fcb79f39169284f1c544f992627af993faa4a61e63c69c69b68a6306e970377cdcb9af0bb1dac6cd4f223f2fbba034c06682651091b";
  const highS = (curveOrder - BigInt(`0x${low.slice(66, 130)}`)).toString(16).padStart(64, "0");
  const high = `${low.slice(0, 66)}${highS}1c`;
  assert.throws(
    () => recoverAddress("23cf06d636047955c46b031bd1e5e788d74321da1c19d01ee562b2e194cdc4e9", high),
    /low-s/,
  );
});
