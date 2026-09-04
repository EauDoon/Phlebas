import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assessTransparentZecMainnetWalletCapabilityStatement,
  NETWORK_ACTION_DISABLED_PENDING_QUALIFICATION,
  QUALIFICATION_RECEIPT_REQUIREMENT,
} from "./zcash-wallet-capabilities.ts";
import {
  connectZecWalletSession,
  disconnectedZecSession,
  zecCapabilityStatementFromObserved,
} from "./zec-wallet-session.ts";

import proofVectors from "../../tests/fixtures/zcash-message/synthetic-vectors.json" with { type: "json" };

const validProof = proofVectors.vectors.find((vector) => vector.name === "provider-session-challenge")!;

const MAINNET_T1 = "t1HsxXoGneCWcA56J24xLE34CFDWNK6RCqD";
const MAINNET_CANONICAL = `zcash:mainnet:${MAINNET_T1}`;

function providerWith(handlers: Record<string, (args: { method: string; params?: unknown }) => Promise<unknown>>) {
  return {
    async request(args: { method: string; params?: unknown }) {
      const handler = handlers[args.method];
      if (!handler) throw new Error(`unexpected method ${args.method}`);
      return handler(args);
    },
  };
}

describe("capability statement assembly", () => {
  it("builds a schema-valid statement from observed capabilities", () => {
    const statement = zecCapabilityStatementFromObserved();
    assert.equal(statement.schema, "phlebas-transparent-zec-mainnet-wallet-capabilities-v1");
    assert.equal(statement.capabilities.sourceAddressControl.supported, false);
    assert.equal(statement.capabilities.sourceAddressControl.proofMethod, "none");
    assert.deepEqual([...statement.capabilities.pczt.supportedVersions], []);
    assert.equal(statement.capabilities.arbitraryP2sh.fundingOutputs, false);
    assert.equal(statement.capabilities.arbitraryP2sh.spendingInputs, false);
    assert.equal(statement.capabilities.exactLocktime.supported, false);
    assert.equal(statement.capabilities.transactionExtraction.supported, false);
    assert.equal(statement.capabilities.broadcast.supported, false);
    assert.equal(statement.capabilities.recoveryExport.supported, false);
  });

  it("never enables network actions, whatever was observed", () => {
    const statement = zecCapabilityStatementFromObserved({
      sourceAddressControl: true,
      pcztVersions: [1, 2],
      arbitraryP2shFundingOutputs: true,
      arbitraryP2shSpendingInputs: true,
      exactLocktime: true,
      transactionExtraction: true,
      broadcast: true,
      keylessRecoveryExport: true,
    });
    assert.equal(statement.networkActionPolicy.broadcast, NETWORK_ACTION_DISABLED_PENDING_QUALIFICATION);
    assert.equal(statement.networkActionPolicy.transactionExtraction, NETWORK_ACTION_DISABLED_PENDING_QUALIFICATION);
    assert.equal(statement.networkActionPolicy.qualificationReceipt, QUALIFICATION_RECEIPT_REQUIREMENT);
    const assessment = assessTransparentZecMainnetWalletCapabilityStatement(statement);
    assert.equal(assessment.broadcastEnabled, false);
    assert.equal(assessment.transactionExtractionEnabled, false);
    assert.equal(assessment.mainnetFundsEnabled, false);
  });

  it("declares unobserved capabilities as absent by default", () => {
    const statement = zecCapabilityStatementFromObserved();
    const assessment = assessTransparentZecMainnetWalletCapabilityStatement(statement);
    assert.deepEqual([...assessment.missingCapabilities], [
      "source-address-control",
      "pczt",
      "arbitrary-p2sh-funding",
      "arbitrary-p2sh-spending",
      "exact-locktime",
      "transaction-extraction",
      "broadcast",
      "keyless-recovery-export",
    ]);
  });
});

describe("connect session", () => {
  it("keeps invalid provider signatures unproven and all network actions disabled", async () => {
    const provider = providerWith({
      zcash_requestAccounts: async () => [validProof.account],
      zcash_signMessage: async () => "0xfeedface",
    });
    const session = await connectZecWalletSession(provider, { challenge: validProof.message });
    assert.match(session.state.error ?? "", /does not verify/);
    assert.equal(session.addressControlSignature, null);
    assert.equal(session.statement?.capabilities.sourceAddressControl.supported, false);
    assert.ok(session.assessment?.missingCapabilities.includes("source-address-control"));
    assert.equal(session.assessment?.mainnetFundsEnabled, false);
    assert.equal(session.assessment?.transactionExtractionEnabled, false);
    assert.equal(session.assessment?.broadcastEnabled, false);
  });

  it("connects, proves control, and returns a frozen session", async () => {
    const provider = providerWith({
      zcash_requestAccounts: async () => [validProof.account],
      zcash_signMessage: async () => validProof.signatureBase64,
      zcash_accounts: async () => [validProof.account],
    });
    const session = await connectZecWalletSession(provider, { challenge: "phlebas-connect-challenge-0001" });
    assert.equal(session.state.address, validProof.account);
    assert.equal(session.state.error, null);
    assert.equal(session.addressControlSignature, validProof.signatureBase64);
    assert.equal(session.statement?.capabilities.sourceAddressControl.supported, true);
    assert.deepEqual(session.statement?.capabilities.pczt.supportedVersions, []);
    assert.equal(session.statement?.capabilities.arbitraryP2sh.fundingOutputs, false);
    assert.equal(session.statement?.capabilities.arbitraryP2sh.spendingInputs, false);
    assert.equal(session.statement?.capabilities.exactLocktime.supported, false);
    assert.equal(session.assessment?.statementValid, true);
    assert.deepEqual(session.assessment?.missingCapabilities, [
      "pczt",
      "arbitrary-p2sh-funding",
      "arbitrary-p2sh-spending",
      "exact-locktime",
      "transaction-extraction",
      "broadcast",
      "keyless-recovery-export",
    ]);
    assert.equal(session.assessment?.broadcastEnabled, false);
  });

  it("does not request a signature after the account response is aborted", async () => {
    const controller = new AbortController();
    const methods: string[] = [];
    const provider = providerWith({
      zcash_requestAccounts: async ({ method }) => {
        methods.push(method);
        controller.abort();
        throw new Error("late account response");
      },
      zcash_accounts: async ({ method }) => {
        methods.push(method);
        return [validProof.account];
      },
      zcash_signMessage: async ({ method }) => {
        methods.push(method);
        return validProof.signatureBase64;
      },
    });
    const session = await connectZecWalletSession(provider, {
      challenge: validProof.message,
      signal: controller.signal,
    });

    assert.deepEqual(methods, ["zcash_requestAccounts"]);
    assert.deepEqual(session, disconnectedZecSession);
  });

  it("does not re-read accounts after an in-flight proof is aborted", async () => {
    const controller = new AbortController();
    const methods: string[] = [];
    const provider = providerWith({
      zcash_requestAccounts: async ({ method }) => {
        methods.push(method);
        return [validProof.account];
      },
      zcash_signMessage: async ({ method }) => {
        methods.push(method);
        controller.abort();
        return validProof.signatureBase64;
      },
      zcash_accounts: async ({ method }) => {
        methods.push(method);
        return [validProof.account];
      },
    });
    const session = await connectZecWalletSession(provider, {
      challenge: validProof.message,
      signal: controller.signal,
    });

    assert.deepEqual(methods, ["zcash_requestAccounts", "zcash_signMessage"]);
    assert.deepEqual(session, disconnectedZecSession);
  });

  it("does not return a connected session when account revalidation resolves after abort", async () => {
    const controller = new AbortController();
    let resolveAccounts!: (accounts: string[]) => void;
    const provider = providerWith({
      zcash_requestAccounts: async () => [validProof.account],
      zcash_signMessage: async () => validProof.signatureBase64,
      zcash_accounts: async () => new Promise<string[]>((resolve) => {
        resolveAccounts = resolve;
      }),
    });
    const sessionPromise = connectZecWalletSession(provider, {
      challenge: validProof.message,
      signal: controller.signal,
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    controller.abort();
    resolveAccounts([validProof.account]);

    assert.deepEqual(await sessionPromise, disconnectedZecSession);
  });

  it("does not expose a revalidation error when the account read rejects after abort", async () => {
    const controller = new AbortController();
    let rejectAccounts!: (error: Error) => void;
    const provider = providerWith({
      zcash_requestAccounts: async () => [validProof.account],
      zcash_signMessage: async () => validProof.signatureBase64,
      zcash_accounts: async () => new Promise<string[]>((_, reject) => {
        rejectAccounts = reject;
      }),
    });
    const sessionPromise = connectZecWalletSession(provider, {
      challenge: validProof.message,
      signal: controller.signal,
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    controller.abort();
    rejectAccounts(new Error("private provider diagnostic"));

    assert.deepEqual(await sessionPromise, disconnectedZecSession);
  });

  it("fails fully closed when the selected account changes after proof", async () => {
    const provider = providerWith({
      zcash_requestAccounts: async () => [validProof.account],
      zcash_signMessage: async () => validProof.signatureBase64,
      zcash_accounts: async () => [MAINNET_T1],
    });
    const session = await connectZecWalletSession(provider, { challenge: validProof.message });

    assert.equal(session.state.address, null);
    assert.equal(session.state.error, "ZEC wallet account could not be revalidated.");
    assert.equal(session.statement, null);
    assert.equal(session.assessment, null);
    assert.equal(session.addressControlSignature, null);
  });

  it("fails fully closed for empty, malformed, or unreadable account revalidation", async () => {
    const results: unknown[] = [[], ["not-a-zcash-account"], "not-an-array"];
    for (const currentAccounts of results) {
      const provider = providerWith({
        zcash_requestAccounts: async () => [validProof.account],
        zcash_signMessage: async () => validProof.signatureBase64,
        zcash_accounts: async () => currentAccounts,
      });
      const session = await connectZecWalletSession(provider, { challenge: validProof.message });

      assert.equal(session.state.address, null);
      assert.equal(session.state.error, "ZEC wallet account could not be revalidated.");
      assert.equal(session.statement, null);
      assert.equal(session.assessment, null);
      assert.equal(session.addressControlSignature, null);
    }

    const failingProvider = providerWith({
      zcash_requestAccounts: async () => [validProof.account],
      zcash_signMessage: async () => validProof.signatureBase64,
      zcash_accounts: async () => {
        throw new Error("private provider diagnostic");
      },
    });
    const failedSession = await connectZecWalletSession(failingProvider, { challenge: validProof.message });
    assert.equal(failedSession.state.address, null);
    assert.equal(failedSession.state.error, "ZEC wallet account could not be revalidated.");
    assert.equal(failedSession.statement, null);
    assert.equal(failedSession.assessment, null);
    assert.equal(failedSession.addressControlSignature, null);
  });

  it("stays fully disconnected when the wallet reports no account", async () => {
    const provider = providerWith({
      zcash_requestAccounts: async () => [],
    });
    const session = await connectZecWalletSession(provider, { challenge: "phlebas-connect-challenge-0001" });
    assert.equal(session.state.address, null);
    assert.equal(session.statement, null);
    assert.deepEqual(session, { ...disconnectedZecSession, state: session.state });
  });

  it("keeps the statement but reports the error when signing is refused, and does not claim the unproven capability", async () => {
    // A wallet that refuses (or fails) the address-control challenge just
    // demonstrated that it cannot prove control of the address. The
    // statement must reflect that failure, not the caller's a-priori
    // assumption that the wallet would sign successfully. Regression for a
    // bug where connectZecWalletSession built the statement from the
    // pre-attempt assumption instead of the connect flow's own outcome, so
    // a wallet that could not sign at all still passed sourceAddressControl
    // and never showed up in assessment.missingCapabilities.
    const provider = providerWith({
      zcash_requestAccounts: async () => [MAINNET_T1],
      zcash_signMessage: async () => {
        throw Object.assign(new Error("refused"), { code: 4001 });
      },
    });
    const session = await connectZecWalletSession(provider, { challenge: "phlebas-connect-challenge-0001" });
    assert.equal(session.state.address, MAINNET_CANONICAL);
    assert.match(session.state.error ?? "", /signature request was rejected/);
    assert.equal(session.addressControlSignature, null);
    assert.equal(session.statement?.capabilities.sourceAddressControl.supported, false);
    assert.ok(session.assessment?.missingCapabilities.includes("source-address-control"));
  });

  it("fails fully closed when the capability statement itself is malformed, instead of keeping the address", async () => {
    // Regression for a bug where a capability statement that failed to
    // parse (e.g. a caller-supplied `observed` record outside the schema)
    // still left `state.address` populated with `statement` and
    // `assessment` both null. A naive `address !== null` connected check
    // (the pattern the landing page uses) would then report a wallet as
    // connected with a "capability statement declared" even though no
    // statement exists. A rejected statement must disconnect the session
    // entirely, matching the no-account case.
    const provider = providerWith({
      zcash_requestAccounts: async () => [MAINNET_T1],
      zcash_signMessage: async () => "0xsig",
    });
    const malformedObserved = {
      sourceAddressControl: true,
      pcztVersions: [3] as unknown as (1 | 2)[], // outside the schema's allowed PCZT versions
      arbitraryP2shFundingOutputs: true,
      arbitraryP2shSpendingInputs: true,
      exactLocktime: true,
      transactionExtraction: false,
      broadcast: false,
      keylessRecoveryExport: false,
    };
    const session = await connectZecWalletSession(provider, {
      challenge: "phlebas-connect-challenge-0001",
      observed: malformedObserved,
    });
    assert.equal(session.state.address, null);
    assert.match(session.state.error ?? "", /PCZT supportedVersions/);
    assert.equal(session.statement, null);
    assert.equal(session.assessment, null);
    assert.equal(session.addressControlSignature, null);
  });
});
