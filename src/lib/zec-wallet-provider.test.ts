import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  canonicalTransparentAddresses,
  connectZecWallet,
  detectZecWalletProvider,
  disconnectedZecWallet,
  proveSourceAddressControl,
  publicZecConnectionError,
} from "./zec-wallet-provider.ts";

import proofVectors from "../../tests/fixtures/zcash-message/synthetic-vectors.json" with { type: "json" };

const validProof = proofVectors.vectors.find((vector) => vector.name === "provider-session-challenge")!;

const MAINNET_T1 = "t1HsxXoGneCWcA56J24xLE34CFDWNK6RCqD";
const MAINNET_CANONICAL = `zcash:mainnet:${MAINNET_T1}`;
const TESTNET_TM = "tmPZ3ntqAkxPQwU3e1AZxVpon6XNZtYLPs9";

function providerWith(accountsResult: unknown, extra: Record<string, (args: { method: string }) => Promise<unknown>> = {}) {
  return {
    async request(args: { method: string; params?: unknown }) {
      if (args.method === "zcash_requestAccounts") return accountsResult;
      if (args.method in extra) return extra[args.method](args);
      throw new Error(`unexpected method ${args.method}`);
    },
  };
}

describe("zec wallet provider discovery", () => {
  it("finds an injected provider with a request method", () => {
    const provider = providerWith([]);
    assert.equal(detectZecWalletProvider({ zcash: provider }), provider);
  });

  it("treats a provider without request as absent", () => {
    assert.equal(detectZecWalletProvider({ zcash: { request: "nope" } }), null);
    assert.equal(detectZecWalletProvider({}), null);
    assert.equal(detectZecWalletProvider(undefined), null);
  });
});

describe("canonical transparent address filtering", () => {
  it("accepts bare mainnet t1 addresses and canonicalizes them", () => {
    assert.deepEqual(
      canonicalTransparentAddresses([MAINNET_T1]),
      [MAINNET_CANONICAL],
    );
  });

  it("accepts canonical account URIs verbatim", () => {
    assert.deepEqual(
      canonicalTransparentAddresses([MAINNET_CANONICAL]),
      [MAINNET_CANONICAL],
    );
  });

  it("drops shielded, testnet, and malformed entries", () => {
    assert.deepEqual(canonicalTransparentAddresses([
      TESTNET_TM,
      "not-an-address",
      42,
      "zs1u9cduj3cmyc0q8m8en3uxqkumvhuqnyq7utvmqaturux9dz5sx6v8mehhmqpyhr9y072z9latxv",
      MAINNET_T1,
    ]), [MAINNET_CANONICAL]);
  });

  it("returns nothing for non-array input", () => {
    assert.deepEqual(canonicalTransparentAddresses(null), []);
    assert.deepEqual(canonicalTransparentAddresses("t1"), []);
  });
});

describe("connect flow", () => {
  it("connects and reports the canonical address", async () => {
    const state = await connectZecWallet(providerWith([MAINNET_T1]));
    assert.deepEqual(state, { address: MAINNET_CANONICAL, error: null });
  });

  it("stays disconnected when the wallet reports no transparent account", async () => {
    const state = await connectZecWallet(providerWith([TESTNET_TM]));
    assert.equal(state.address, null);
    assert.match(state.error ?? "", /no transparent ZEC mainnet address/);
  });

  it("reports rejection copy when the user refuses the request", async () => {
    const failing = {
      async request() {
        throw Object.assign(new Error("user rejected"), { code: 4001 });
      },
    };
    const state = await connectZecWallet(failing);
    assert.equal(state.address, null);
    assert.equal(state.error, publicZecConnectionError(Object.assign(new Error("x"), { code: 4001 })));
  });

  it("never reports a connected address for an empty wallet", async () => {
    const state = await connectZecWallet(providerWith([]));
    assert.deepEqual(state, { ...disconnectedZecWallet, error: state.error });
  });

  it("does not turn rejected, pending, or unknown requests into read-only connections", async () => {
    for (const code of [4001, "4001", -32002, "-32002", -32000]) {
      const methods: string[] = [];
      const provider = {
        async request(args: { method: string }) {
          methods.push(args.method);
          if (args.method === "zcash_requestAccounts") {
            throw Object.assign(new Error("provider diagnostic"), { code });
          }
          if (args.method === "zcash_accounts") return [MAINNET_T1];
          throw new Error(`unexpected method ${args.method}`);
        },
      };
      const state = await connectZecWallet(provider);

      assert.deepEqual(methods, ["zcash_requestAccounts"]);
      assert.equal(state.address, null);
      assert.equal(state.error, publicZecConnectionError({ code }));
    }
  });

  it("falls back to zcash_accounts only for explicit unsupported-method errors", async () => {
    for (const code of [-32601, "-32601", 4200, "4200"]) {
      const methods: string[] = [];
      const provider = {
        async request(args: { method: string }) {
          methods.push(args.method);
          if (args.method === "zcash_requestAccounts") {
            throw Object.assign(new Error("unsupported"), { code });
          }
          if (args.method === "zcash_accounts") return [MAINNET_T1];
          throw new Error(`unexpected method ${args.method}`);
        },
      };
      const state = await connectZecWallet(provider);

      assert.deepEqual(methods, ["zcash_requestAccounts", "zcash_accounts"]);
      assert.deepEqual(state, { address: MAINNET_CANONICAL, error: null });
    }
  });
});

describe("source-address-control proof", () => {
  it("rejects nonempty signatures and valid signatures for a different account or challenge", async () => {
    for (const [account, challenge, signature] of [
      [validProof.account, validProof.message, "0xdeadbeef"],
      [MAINNET_CANONICAL, validProof.message, validProof.signatureBase64],
      [validProof.account, validProof.message + "x", validProof.signatureBase64],
    ]) {
      const provider = providerWith([], { zcash_signMessage: async () => signature });
      const proof = await proveSourceAddressControl(provider, account, challenge);
      assert.deepEqual(proof, { error: "The wallet signature does not verify for this ZEC account and challenge." });
    }
  });

  it("returns the signature for a valid challenge", async () => {
    const provider = providerWith([], {
      zcash_signMessage: async (args) => {
        assert.deepEqual(args, { method: "zcash_signMessage", params: { account: validProof.account, message: validProof.message } });
        return validProof.signatureBase64;
      },
    });
    const proof = await proveSourceAddressControl(provider, validProof.account, validProof.message);
    assert.deepEqual(proof, { signature: validProof.signatureBase64 });
  });

  it("rejects a challenge outside the printable-ASCII length bound", async () => {
    const provider = providerWith([], { zcash_signMessage: async () => "sig" });
    const proof = await proveSourceAddressControl(provider, MAINNET_CANONICAL, "short");
    assert.ok("error" in proof);
  });

  it("fails closed when the wallet returns an empty signature", async () => {
    const provider = providerWith([], { zcash_signMessage: async () => "" });
    const proof = await proveSourceAddressControl(provider, MAINNET_CANONICAL, "phlebas-connect-challenge-0001");
    assert.ok("error" in proof);
  });

  it("refuses to sign for a non-mainnet account", async () => {
    const provider = providerWith([], { zcash_signMessage: async () => "sig" });
    await assert.rejects(
      proveSourceAddressControl(provider, `zcash:testnet:${TESTNET_TM}`, "phlebas-connect-challenge-0001"),
    );
  });
});
