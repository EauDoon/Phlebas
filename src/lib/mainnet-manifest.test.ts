import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  emptyManifest,
  ETHEREUM_MAINNET_CHAIN_ID,
  isOnchainAddress,
  recordBroadcast,
  type FoundryBroadcast,
} from "./mainnet-manifest.ts";

const SETTLEMENT = "0x1111111111111111111111111111111111111111";
const OTHER = "0x2222222222222222222222222222222222222222";
const TX = `0x${"ab".repeat(32)}`;
const CODE = "0x6080";

function broadcastWith(options: {
  chain?: number;
  settlement?: string;
  txHash?: string;
  status?: string | number;
  transactionType?: string;
}): FoundryBroadcast {
  return {
    chain: options.chain ?? ETHEREUM_MAINNET_CHAIN_ID,
    transactions: options.settlement === undefined ? [] : [{
      transactionType: options.transactionType ?? "CREATE",
      contractName: "Settlement",
      contractAddress: options.settlement,
      hash: options.txHash === undefined ? TX : options.txHash,
    }],
    receipts: options.settlement === undefined ? [] : [{
      transactionHash: options.txHash === undefined ? TX : options.txHash,
      status: options.status ?? 1,
    }],
  };
}

describe("mainnet deployment manifest", () => {
  it("records a Settlement CREATE and stays undeployed without marking", () => {
    const next = recordBroadcast(emptyManifest(), broadcastWith({ settlement: SETTLEMENT }));
    assert.equal(next.contracts.Settlement, SETTLEMENT);
    assert.equal(next.broadcastTx, TX);
    assert.equal(next.deployed, false);
  });

  it("rejects a broadcast from any chain other than Ethereum Mainnet", () => {
    assert.throws(
      () => recordBroadcast(emptyManifest(), broadcastWith({ chain: 421614, settlement: SETTLEMENT })),
      /not Ethereum Mainnet/,
    );
  });

  it("marking deployed requires a real transaction hash", () => {
    assert.throws(
      () => recordBroadcast(emptyManifest(), broadcastWith({ settlement: SETTLEMENT, txHash: "" }), { markDeployed: true }),
      /without a real transaction hash/,
    );
  });

  it("marking deployed requires a successful receipt", () => {
    assert.throws(
      () => recordBroadcast(emptyManifest(), broadcastWith({ settlement: SETTLEMENT, status: 0 }), { markDeployed: true, commit: "abcdef1234" }),
      /without a successful mainnet receipt/,
    );
  });

  it("marking deployed requires well-formed nonzero on-chain bytecode", () => {
    assert.throws(
      () => recordBroadcast(emptyManifest(), broadcastWith({ settlement: SETTLEMENT }), { markDeployed: true, commit: "abcdef1234" }),
      /without well-formed nonzero on-chain bytecode/,
    );
  });

  it("marks deployed only with hash, receipt, commit, and bytecode", () => {
    const next = recordBroadcast(
      emptyManifest(),
      broadcastWith({ settlement: SETTLEMENT }),
      { markDeployed: true, commit: "abcdef1234", deployedCode: { [SETTLEMENT]: CODE } },
    );
    assert.equal(next.deployed, true);
    assert.equal(next.commit, "abcdef1234");
  });

  it("rejects malformed, odd-length, or all-zero bytecode as absent deployment evidence", () => {
    // A weaker check (string length alone) would let these invalid values
    // pass as deployment evidence: a garbage RPC or tamper payload that
    // is not hex at all, an odd-length hex string (impossible as real EVM
    // bytecode, which is always whole bytes), and a run of zero bytes
    // (indistinguishable in intent from "no code" but longer than "0x").
    // Each must raise, not mark deployed.
    for (const badCode of ["not-real-bytecode", "0x6", "0x600", "0x00", "0x0000"]) {
      assert.throws(
        () => recordBroadcast(
          emptyManifest(),
          broadcastWith({ settlement: SETTLEMENT }),
          { markDeployed: true, commit: "abcdef1234", deployedCode: { [SETTLEMENT]: badCode } },
        ),
        /without well-formed nonzero on-chain bytecode/,
        `expected ${JSON.stringify(badCode)} to be rejected`,
      );
    }
  });

  it("keeps a zero address or malformed address out of the record", () => {
    assert.equal(isOnchainAddress("0x0000000000000000000000000000000000000000"), false);
    assert.equal(isOnchainAddress("0x1234"), false);
    assert.equal(isOnchainAddress(null), false);
    const next = recordBroadcast(emptyManifest(), broadcastWith({ settlement: OTHER, status: 1 }));
    assert.equal(next.contracts.Settlement, OTHER);
  });

  it("ignores non-CREATE entries and wrong contract names", () => {
    const next = recordBroadcast(
      emptyManifest(),
      broadcastWith({ settlement: SETTLEMENT, transactionType: "CALL" }),
    );
    assert.equal(next.contracts.Settlement, null);
    assert.equal(next.deployed, false);
  });
});
