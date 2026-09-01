import assert from "node:assert/strict";
import test from "node:test";

import {
  NATIVE_ZEC_USDC_MATCHER_DEPLOYMENT,
  NATIVE_ZEC_USDC_MATCHER_MANIFEST,
  computeNativeZecUsdcMatcherConfigurationHash,
  parseNativeZecUsdcMatcherManifest,
} from "./native-zec-usdc-matcher-manifest.ts";
import {
  NATIVE_ZEC_USDT_MATCHER_MANIFEST,
  computeNativeZecUsdtMatcherConfigurationHash,
  parseNativeZecUsdtMatcherManifest,
} from "./native-zec-usdt-matcher-manifest.ts";
import { buildMatcherBuyOrderDraft, type MatcherBuyOrderDraftInput } from "./matcher-order-draft.ts";
import { evmAuthorizedSignerId } from "./matcher-auth.ts";
import { hashTypedOrder } from "./eip712-order.ts";
import { hash160Value, p2pkhAddress, p2shAddress } from "./zcash-address.ts";

const NOW = 1_800_000_000n;
const WALLET = `0x${"11".repeat(20)}`;
const CONTRACT = `0x${"22".repeat(20)}`;
const RECIPIENT = p2pkhAddress(hash160Value(new TextEncoder().encode("matcher-order-draft")), "mainnet");
const P2SH_RECIPIENT = p2shAddress(hash160Value(new TextEncoder().encode("matcher-order-draft-p2sh")), "mainnet");

function activatedDeployment() {
  const manifest = JSON.parse(JSON.stringify(NATIVE_ZEC_USDC_MATCHER_MANIFEST)) as {
    deployed: boolean;
    submissionEnabled: boolean;
    evm: { verifyingContract: string | null };
    configurationHash: string | null;
  };
  manifest.deployed = true;
  manifest.submissionEnabled = true;
  manifest.evm.verifyingContract = CONTRACT;
  manifest.configurationHash = computeNativeZecUsdcMatcherConfigurationHash(CONTRACT);
  return parseNativeZecUsdcMatcherManifest(manifest);
}

function activatedUsdtDeployment() {
  const manifest = JSON.parse(JSON.stringify(NATIVE_ZEC_USDT_MATCHER_MANIFEST)) as {
    deployed: boolean;
    submissionEnabled: boolean;
    evm: { verifyingContract: string | null };
    configurationHash: string | null;
  };
  manifest.deployed = true;
  manifest.submissionEnabled = true;
  manifest.evm.verifyingContract = CONTRACT;
  manifest.configurationHash = computeNativeZecUsdtMatcherConfigurationHash(CONTRACT);
  return parseNativeZecUsdtMatcherManifest(manifest);
}

function validInput(overrides: Partial<MatcherBuyOrderDraftInput> = {}): MatcherBuyOrderDraftInput {
  const deployment = overrides.deployment ?? activatedDeployment();
  const configuredDeployment = deployment.orderDomain === null
    ? deployment.manifest.market.id === "ZEC/USDT" ? activatedUsdtDeployment() : activatedDeployment()
    : deployment;
  const makerAccountId = evmAuthorizedSignerId(configuredDeployment.orderDomain!.chainId, WALLET);
  const configurationHash = configuredDeployment.configurationHash!;
  return {
    deployment,
    selectedMarket: deployment.manifest.market.id,
    connectedEvmWallet: WALLET,
    zcashRecipient: RECIPIENT,
    matcherHealth: {
      ok: true,
      matcher: "persistent-native-v1",
      configured: true,
      acceptingMutations: true,
      mode: "no-value",
      custody: false,
      configurationHash,
      market: deployment.market,
    },
    matcherAccount: {
      ok: true,
      makerAccountId,
      configurationHash,
      accountEpoch: "7",
      sequence: "9",
      checkpoint: {
        version: 1,
        sequence: "9",
        recordHash: `0x${"33".repeat(32)}`,
        stateRoot: `0x${"44".repeat(32)}`,
        configurationHash,
      },
    },
    priceTicks: 650_000n,
    sizeAtoms: 100_000_000n,
    occurredAt: NOW,
    expiresAt: NOW + 600n,
    nonce: 3n,
    salt: `0x${"55".repeat(32)}`,
    ...overrides,
  };
}

test("fails closed when the native matcher manifest is disabled", () => {
  const input = validInput({ deployment: NATIVE_ZEC_USDC_MATCHER_DEPLOYMENT });
  assert.throws(() => buildMatcherBuyOrderDraft(input), /not enabled/);
});

test("requires the exact selected manifest market and only constructs the buy-side CLOB GTC order", () => {
  assert.throws(
    () => buildMatcherBuyOrderDraft(validInput({ selectedMarket: "ZEC/USDT" })),
    /exact selected ZEC\/USDC or ZEC\/USDT market/,
  );

  const draft = buildMatcherBuyOrderDraft(validInput());
  assert.equal(draft.order.side, 0);
  assert.equal(draft.order.timeInForce, 0);
  assert.equal(draft.order.maximumFeeBps, 0n);
  assert.equal(draft.order.allowedVenues, 1);
});

test("builds an exact ZEC/USDT draft without substituting USDC identity", () => {
  const deployment = activatedUsdtDeployment();
  const draft = buildMatcherBuyOrderDraft(validInput({ deployment }));
  assert.equal(deployment.manifest.market.id, "ZEC/USDT");
  assert.equal(draft.order.quoteChainId, deployment.orderPair.quoteChainId);
  assert.equal(draft.order.quoteAssetId, deployment.orderPair.quoteAssetId);
  assert.equal(draft.order.settlementAdapterId, deployment.settlementAdapterId);
});

test("rejects a non-canonical or non-mainnet transparent Zcash recipient", () => {
  assert.throws(
    () => buildMatcherBuyOrderDraft(validInput({ zcashRecipient: "t1not-a-zcash-address" })),
    /base58|Zcash|address/i,
  );
});

test("rejects a mainnet P2SH buyer recipient that the Zcash spend adapter cannot pay", () => {
  assert.throws(
    () => buildMatcherBuyOrderDraft(validInput({ zcashRecipient: P2SH_RECIPIENT })),
    /buyer recipient account must be a transparent P2PKH mainnet Zcash account/,
  );
});

test("rejects matcher health and account configuration mismatches", () => {
  const healthBase = validInput();
  const healthMismatch: MatcherBuyOrderDraftInput = {
    ...healthBase,
    matcherHealth: { ...(healthBase.matcherHealth as object), configurationHash: `0x${"66".repeat(32)}` },
  };
  assert.throws(() => buildMatcherBuyOrderDraft(healthMismatch), /configuration does not match/);

  const accountBase = validInput();
  const accountMismatch: MatcherBuyOrderDraftInput = {
    ...accountBase,
    matcherAccount: { ...(accountBase.matcherAccount as object), configurationHash: `0x${"77".repeat(32)}` },
  };
  assert.throws(() => buildMatcherBuyOrderDraft(accountMismatch), /configuration does not match/);
});

test("builds a deterministic, fully reviewed draft from an activated manifest clone", () => {
  const input = validInput();
  const draft = buildMatcherBuyOrderDraft(input);
  const deployment = input.deployment;
  assert.equal(deployment.configurationHash, computeNativeZecUsdcMatcherConfigurationHash(CONTRACT));
  assert.equal(draft.healthConfigurationHash, deployment.configurationHash);
  assert.equal(draft.order.accountEpoch, 7n);
  assert.equal(draft.accounts.sourceAccount, `eip155:1:${WALLET}`);
  assert.equal(draft.accounts.recipientAccount, `zcash:mainnet:${RECIPIENT}`);
  assert.equal(draft.requestId, `order-${hashTypedOrder(deployment.orderDomain!, draft.order).slice(2)}`);
  assert.deepEqual(draft.typedOrderData.message.accountEpoch, "7");
});

test("freezes the complete review snapshot", () => {
  const draft = buildMatcherBuyOrderDraft(validInput());
  assert.equal(Object.isFrozen(draft), true);
  assert.equal(Object.isFrozen(draft.order), true);
  assert.equal(Object.isFrozen(draft.accounts), true);
  assert.equal(Object.isFrozen(draft.accountCheckpoint), true);
  assert.equal(Object.isFrozen(draft.typedOrderData.message), true);
  assert.throws(() => {
    (draft.order as { side: number }).side = 1;
  }, TypeError);
});

test("enforces manifest size limits and future bounded expiry", () => {
  const deployment = activatedDeployment();
  assert.throws(
    () => buildMatcherBuyOrderDraft(validInput({ sizeAtoms: deployment.limits.maximumBaseAmountAtoms + 1n })),
    /manifest limits/,
  );
  assert.throws(
    () => buildMatcherBuyOrderDraft(validInput({ expiresAt: NOW })),
    /future uint64 bigint expiry/,
  );
  assert.throws(
    () => buildMatcherBuyOrderDraft(validInput({ expiresAt: NOW + deployment.limits.maximumOrderLifetimeSeconds + 1n })),
    /maximum lifetime/,
  );
  assert.doesNotThrow(() => buildMatcherBuyOrderDraft(validInput({
    expiresAt: NOW + deployment.limits.maximumOrderLifetimeSeconds,
  })));
});
