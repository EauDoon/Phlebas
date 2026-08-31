import assert from "node:assert/strict";
import test from "node:test";

import { recoverAddress } from "./secp256k1.ts";

test("recovers the Anvil-0 address from the frozen EIP-712 digest", () => {
  const address = recoverAddress(
    "eed61ef0af305769d9791ea9cb3a6cf587afa1e8acc3c81108e692e4900c8c1a",
    "0x0fd73c37f4362021fdd1693bdca85f8592eb338a7d62338504ba2cbaee2bb90f26bdec5b2efeb086308bce8a9db936bb754bfafeda2305485b91a3b1c371ee8b1b",
  );
  assert.equal(address, "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266");
});
