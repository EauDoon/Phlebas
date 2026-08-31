import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { simulationStatus } from "./status.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

function withoutHonestBridgeNegation(copy: string) {
  return copy.replace(/not (?:native ZEC, shielded ZEC, or )?a trustless bridge asset/gi, "");
}

test("status payload cannot be read as live funds or custody", async () => {
  const statusRoute = await readFile(join(root, "src/app/api/status/route.ts"), "utf8");
  assert.match(statusRoute, /Response\.json\(simulationStatus\(\)/);
  const status = simulationStatus();
  assert.equal(status.liveFunds, false);
  assert.equal(status.mode, "simulation");
  assert.equal(status.custody, "none");
  assert.equal(status.contracts, "source-undeployed");
  assert.equal(status.marketData, "illustrative");
  assert.equal(status.incidents, "architecture-demonstration");
});

test("status page links to legal and security without a live-funds claim", async () => {
  const statusPage = await readFile(join(root, "src/app/status/page.tsx"), "utf8");
  assert.match(statusPage, /href="\/legal"/);
  assert.match(statusPage, /href="\/security"/);
  assert.match(statusPage, /href="\/trade\?view=architecture"/);
  assert.match(statusPage, /href="\/#launch-gates"/);
  assert.match(statusPage, /from "next\/link"/);
  assert.match(statusPage, /No live funds or custody/);
  assert.match(statusPage, /labeled incident demonstrations/);
  assert.match(statusPage, /not an incident feed/);
  assert.doesNotMatch(statusPage, /is audited/);
});

test("landing and terminal banners stay simulation-only", async () => {
  const landing = await readFile(join(root, "src/components/landing-page.tsx"), "utf8");
  const terminal = await readFile(join(root, "src/components/trading-terminal.tsx"), "utf8");
  assert.match(landing, /Simulation only/);
  assert.match(landing, /Simulation disclosure/);
  assert.match(terminal, /Simulation disclosure/);
  assert.match(await readFile(join(root, "src/components/simulation-frame.tsx"), "utf8"), /Simulation disclosure/);
  assert.match(await readFile(join(root, "src/components/simulation-loading.tsx"), "utf8"), /Simulation disclosure/);
  assert.match(landing, /No mainnet funds/);
  assert.match(landing, /Deny by default/);
  assert.match(landing, /no-value simulation/);
  assert.match(landing, /not a live exchange and not a shielded market/);
  assert.match(landing, /does not list USDT0/);
  assert.match(landing, /native ZEC against native USDC/);
  assert.match(landing, /USDT0 is abandoned/);
  assert.match(landing, /Native labels are simulation names, not live settlement/);
  assert.match(landing, /Understand native pairs/);
  assert.match(landing, /href="#pairs"/);
  assert.doesNotMatch(landing, /Understand pZEC/);
  assert.doesNotMatch(landing, /wrap ZEC as pZEC/);
  assert.match(landing, /pairsSection/);
  assert.match(landing, /pairsCopy/);
  assert.doesNotMatch(landing, /pzecSection/);
  assert.doesNotMatch(landing, /pzecCopy/);
  assert.doesNotMatch(landing, /pZEC/);
  const landingCss = await readFile(join(root, "src/components/landing.module.css"), "utf8");
  assert.match(landingCss, /\.pairsSection/);
  assert.match(landingCss, /\.pairsCopy/);
  assert.doesNotMatch(landingCss, /pzec/i);
  assert.match(await readFile(join(root, "src/lib/session.ts"), "utf8"), /SESSION_ZEC_ATOMS/);
  assert.match(await readFile(join(root, "src/lib/session.ts"), "utf8"), /export function availableZec/);
  assert.doesNotMatch(await readFile(join(root, "src/lib/session.ts"), "utf8"), /availablePzec/);
  assert.match(
    await readFile(join(root, "src/lib/encoding.test.ts"), "utf8"),
    /2d3360d350d50a83e69a46f50a4fedcfc77a610dc91fe0d80fee67616acb38ca/,
  );
  assert.match(await readFile(join(root, "src/lib/deposit-tour.ts"), "utf8"), /nothing was minted/);
  assert.doesNotMatch(await readFile(join(root, "src/lib/deposit-tour.ts"), "utf8"), /pZEC/);
  assert.doesNotMatch(landing, /Later listing gate/);
  assert.doesNotMatch(await readFile(join(root, "src/components/trading-terminal.tsx"), "utf8"), /Later listing gate/);
  assert.doesNotMatch(await readFile(join(root, "src/components/liquidity-panel.tsx"), "utf8"), /Later listing gate/);
  assert.doesNotMatch(await readFile(join(root, "src/components/trade-ticket.tsx"), "utf8"), /Later listing gate/);
  assert.match(await readFile(join(root, "src/lib/market-data.ts"), "utf8"), /settlementPair: "ZEC-USDT"/);
  assert.match(await readFile(join(root, "src/lib/encoding.ts"), "utf8"), /quoteAsset: "USDC" \| "USDT"/);
  assert.match(await readFile(join(root, "src/lib/encoding.ts"), "utf8"), /baseAsset: "ZEC"/);
  assert.doesNotMatch(await readFile(join(root, "src/lib/encoding.ts"), "utf8"), /baseAsset: "pZEC"/);
  assert.doesNotMatch(await readFile(join(root, "src/lib/encoding.ts"), "utf8"), /USDT0/);
  assert.match(await readFile(join(root, "src/lib/lp.ts"), "utf8"), /4x ZEC\/quote/);
  assert.match(await readFile(join(root, "src/lib/lp.ts"), "utf8"), /1\/4x ZEC\/quote/);
  assert.match(await readFile(join(root, "src/lib/lp.ts"), "utf8"), /reserveZecAtoms/);
  assert.doesNotMatch(await readFile(join(root, "src/lib/lp.ts"), "utf8"), /reservePzecAtoms/);
  assert.match(await readFile(join(root, "contracts/src/token/Zec.sol"), "utf8"), /"tZEC"/);
  assert.doesNotMatch(await readFile(join(root, "contracts/src/token/Zec.sol"), "utf8"), /tpZEC/);
  assert.match(await readFile(join(root, "contracts/src/amm/Pair.sol"), "utf8"), /"tLP"/);
  assert.doesNotMatch(await readFile(join(root, "contracts/src/amm/Pair.sol"), "utf8"), /tpLP/);
  assert.match(await readFile(join(root, "src/lib/matcher.ts"), "utf8"), /8-decimal ZEC atoms/);
  assert.doesNotMatch(await readFile(join(root, "src/lib/session.test.ts"), "utf8"), /credits pZEC/);
  assert.match(await readFile(join(root, "src/lib/session.test.ts"), "utf8"), /credits ZEC and debits quote/);
  assert.match(await readFile(join(root, "README.md"), "utf8"), /not wrapped, minted, or represented as a Phlebas platform balance/);
  assert.match(await readFile(join(root, "contracts/src/amm/Factory.sol"), "utf8"), /address public immutable zec;/);
  assert.doesNotMatch(await readFile(join(root, "contracts/src/amm/Factory.sol"), "utf8"), /address public immutable pzec;/);
  assert.match(await readFile(join(root, "src/lib/units.ts"), "utf8"), /ZEC_DECIMALS = 8/);
  assert.doesNotMatch(await readFile(join(root, "src/lib/units.ts"), "utf8"), /PZEC_DECIMALS/);
  assert.match(await readFile(join(root, "src/lib/market-data.ts"), "utf8"), /zecAtomsFromHundredths/);
  assert.doesNotMatch(await readFile(join(root, "src/lib/market-data.ts"), "utf8"), /pzecAtomsFromHundredths/);
  assert.match(await readFile(join(root, "src/lib/testnet.ts"), "utf8"), /zec:/);
  assert.doesNotMatch(await readFile(join(root, "src/lib/testnet.ts"), "utf8"), /pzec:/);
  assert.match(await readFile(join(root, "src/lib/sepolia-manifest.ts"), "utf8"), /Zec: string/);
  assert.doesNotMatch(await readFile(join(root, "src/lib/sepolia-manifest.ts"), "utf8"), /PZec:/);
  assert.match(await readFile(join(root, "src/components/bridge-panel.tsx"), "utf8"), /ZEC gateway/);
  assert.doesNotMatch(await readFile(join(root, "src/components/bridge-panel.tsx"), "utf8"), /ZEC to pZEC/);
  assert.doesNotMatch(await readFile(join(root, "src/components/bridge-panel.tsx"), "utf8"), /pZEC/);
  assert.doesNotMatch(await readFile(join(root, "src/lib/gateway-incidents.ts"), "utf8"), /pZEC/);
  assert.match(await readFile(join(root, "src/components/trade-ticket.tsx"), "utf8"), /It is not live settlement/);
  assert.match(await readFile(join(root, "src/components/liquidity-panel.tsx"), "utf8"), /It is not live settlement/);
  assert.doesNotMatch(await readFile(join(root, "src/components/trade-ticket.tsx"), "utf8"), /pZEC is a custody receipt/);
  assert.match(await readFile(join(root, "contracts/src/amm/Factory.sol"), "utf8"), /address public immutable usdt;/);
  assert.doesNotMatch(await readFile(join(root, "contracts/src/amm/Factory.sol"), "utf8"), /usdt0/);
  assert.match(await readFile(join(root, "contracts/script/DeployTestnet.s.sol"), "utf8"), /"tUSDT"/);
  assert.doesNotMatch(await readFile(join(root, "contracts/script/DeployTestnet.s.sol"), "utf8"), /tUSDT0/);
  const journeyDocs = await readFile(join(root, "docs/LANDING_AND_USER_JOURNEYS.md"), "utf8");
  assert.match(journeyDocs, /Later listing gate[`']? is absent/);
  assert.doesNotMatch(journeyDocs, /Later listing gate is visible/);
  assert.match(await readFile(join(root, "src/lib/testnet.ts"), "utf8"), /usdt:/);
  assert.doesNotMatch(await readFile(join(root, "src/lib/testnet.ts"), "utf8"), /usdt0/);
  assert.match(await readFile(join(root, "docs/adr/0002-native-zec-usdc-usdt.md"), "utf8"), /USDT0 is abandoned/);
  assert.match(landing, /LANDING_LEDGER/);
  assert.match(landing, /LANDING_HERO/);
  assert.match(landing, /LANDING_SKIP_LINKS/);
  assert.match(
    await readFile(join(root, "src/lib/landing-copy.ts"), "utf8"),
    /wallet-held solver liquidity/,
  );
  const skipCopy = await readFile(join(root, "src/lib/landing-copy.ts"), "utf8");
  assert.match(skipCopy, /Skip to markets/);
  assert.match(skipCopy, /Skip to evidence/);
  assert.match(skipCopy, /Skip to native pairs/);
  assert.doesNotMatch(skipCopy, /Skip to pZEC/);
  assert.match(skipCopy, /Skip to terminal preview/);
  assert.match(skipCopy, /Skip to journeys/);
  assert.match(skipCopy, /Skip to launch gates/);
  assert.match(landing, /No shielded deposit or withdrawal is planned for v1/);
  assert.match(landing, /zips\.z\.cash\/zip-0320/);
  assert.doesNotMatch(landing, /pZEC (?:is|equals|represents) native ZEC/i);
  assert.doesNotMatch(withoutHonestBridgeNegation(landing), /trustless bridge/i);
  assert.doesNotMatch(withoutHonestBridgeNegation(terminal), /trustless bridge/i);
  assert.match(terminal, /Fixture \$\{market\.volume\}/);
  assert.match(terminal, /do not move mainnet funds/);
  assert.match(await readFile(join(root, "src/components/wallet-bar.tsx"), "utf8"), /Wallet connection rejection/);
  assert.match(await readFile(join(root, "src/components/wallet-bar.tsx"), "utf8"), /No injected EVM wallet/);
  assert.match(terminal, /not trustless/);
  assert.match(await readFile(join(root, "src/components/trade-ticket.tsx"), "utf8"), /custodyRedemptionCopy/);
  assert.match(await readFile(join(root, "src/components/trade-ticket.tsx"), "utf8"), /publicLinkabilityCopy/);
  assert.match(await readFile(join(root, "src/components/trade-ticket.tsx"), "utf8"), /marketOrderConstraintCopy/);
  assert.match(await readFile(join(root, "src/components/trade-ticket.tsx"), "utf8"), /publicLinkabilityCopy\("fill"\)/);
  assert.match(await readFile(join(root, "src/components/trade-ticket.tsx"), "utf8"), /Review custody notice/);
  assert.match(await readFile(join(root, "src/components/trade-ticket.tsx"), "utf8"), /feeEnvelopeCopy/);
  assert.match(await readFile(join(root, "src/lib/order.ts"), "utf8"), /no unbounded market instruction/);
  assert.doesNotMatch(await readFile(join(root, "src/lib/order.ts"), "utf8"), /pZEC/);
  assert.match(await readFile(join(root, "src/components/trade-ticket.tsx"), "utf8"), /parseExpiryUnix/);
  assert.match(await readFile(join(root, "src/components/trade-ticket.tsx"), "utf8"), /Order expiry unix time/);
  assert.match(await readFile(join(root, "src/components/architecture-panel.tsx"), "utf8"), /never hosted on Vercel/);
  assert.match(await readFile(join(root, "src/components/architecture-panel.tsx"), "utf8"), /id="honesty-bar"/);
  assert.match(await readFile(join(root, "src/components/architecture-panel.tsx"), "utf8"), /id="architecture-layers"/);
  assert.match(await readFile(join(root, "src/components/architecture-panel.tsx"), "utf8"), /The matcher is not trustless/);
  assert.match(await readFile(join(root, "src/components/country-block.tsx"), "utf8"), /id="country-block"/);
  assert.match(await readFile(join(root, "src/components/country-block.tsx"), "utf8"), /shareable preview of a blocked location/);
  assert.match(await readFile(join(root, "src/components/incident-demo.tsx"), "utf8"), /Selected incident demonstration/);
  assert.doesNotMatch(landing, /is audited/);
  assert.doesNotMatch(terminal, /is audited/);
  const bridge = await readFile(join(root, "src/components/bridge-panel.tsx"), "utf8");
  assert.match(bridge, /Preview withdrawal states, not Withdraw ZEC/);
  assert.match(bridge, /Preview deposit states, not Deposit ZEC/);
  assert.match(bridge, /WITHDRAWAL_TOUR/);
  assert.match(bridge, /nextGatewayJourney/);
  assert.match(bridge, /interpretRovingKey/);
  assert.match(bridge, /payoutClaimForTourStep/);
  assert.match(bridge, /payoutClaimStubCopy/);
  assert.match(bridge, /Nothing is sent/);
  assert.match(bridge, /gatewayOffCopy/);
  assert.match(bridge, /gatewayUnavailableCopy/);
  assert.match(bridge, /gatewayIssuingCopy/);
  assert.match(await readFile(join(root, "src/lib/withdrawal-tour.ts"), "utf8"), /does not invent a payout/);
  assert.match(bridge, /Nothing is sent/);
  assert.match(bridge, /id="privacy-callouts"/);
  assert.match(bridge, /does not provide shielded deposits/);
  assert.match(bridge, /id="destination-inspector"/);
  assert.match(bridge, /Not a payable QR/);
  assert.match(bridge, /copyUri/);
  assert.match(bridge, /Not payable/);
  assert.match(terminal, /feedSurface/);
  assert.match(terminal, /nextTerminalView/);
  assert.match(terminal, /nextMarketId/);
  assert.match(terminal, /nextFeedStatus/);
  assert.match(terminal, /interpretRovingKey/);
  assert.match(terminal, /role="tablist"/);
  assert.match(terminal, /role="radiogroup"/);
  assert.match(terminal, /Skip to order ticket/);
  assert.match(terminal, /Skip to price chart/);
  assert.match(terminal, /Skip to order book/);
  assert.match(terminal, /Skip to recent trades/);
  assert.match(terminal, /Skip to incident demonstration/);
  assert.match(terminal, /Skip to honesty bar/);
  assert.match(terminal, /Skip to architecture layers/);
  assert.match(terminal, /Skip to pool tabs/);
  assert.match(terminal, /Skip to pool stats/);
  assert.match(terminal, /Skip to destination inspector/);
  assert.match(terminal, /Skip to privacy callouts/);
  assert.match(terminal, /Skip to country-block notice/);
  assert.match(await readFile(join(root, "src/components/incident-demo.tsx"), "utf8"), /id="incident-demonstration"/);
  assert.match(await readFile(join(root, "src/components/price-chart.tsx"), "utf8"), /chartDisplayGeometry/);
  assert.match(await readFile(join(root, "src/components/price-chart.tsx"), "utf8"), /Chart empty state/);
  assert.match(await readFile(join(root, "src/lib/chart-display.ts"), "utf8"), /display exception/);
  assert.match(await readFile(join(root, "src/components/order-book.tsx"), "utf8"), /id="order-book"/);
  assert.match(terminal, /id="recent-trades"/);
  assert.match(terminal, /Launch gates/);
  assert.match(await readFile(join(root, "src/components/simulation-frame.tsx"), "utf8"), /Launch gates/);
  assert.match(await readFile(join(root, "src/app/status/page.tsx"), "utf8"), /Skip to status ledger/);
  const terminalCss = await readFile(join(root, "src/components/terminal.module.css"), "utf8");
  assert.match(terminalCss, /:global\(#main-content\)/);
  assert.match(terminalCss, /:global\(#status-ledger\)/);
  assert.match(terminalCss, /:global\(#legal-article\)/);
  assert.match(terminalCss, /:global\(#security-article\)/);
  assert.match(terminalCss, /scroll-margin-top: 12px/);
  assert.match(landingCss, /:global\(#main-content\)/);
  assert.match(landingCss, /:global\(#markets\)/);
  assert.match(landingCss, /:global\(#exists-today\)/);
  assert.match(landingCss, /:global\(#pairs\)/);
  assert.match(landingCss, /:global\(#terminal-preview\)/);
  assert.match(landingCss, /:global\(#journeys\)/);
  assert.match(landingCss, /:global\(#launch-gates\)/);
  assert.match(landingCss, /outline: 2px solid #15140d/);
  assert.match(landingCss, /outline-offset: 2px/);
  assert.match(landingCss, /top: 12px/);
  assert.match(landingCss, /left: 12px/);
  assert.match(terminalCss, /:global\(#order-ticket\)/);
  assert.match(terminalCss, /a\.skipLink:focus \{/);
  assert.match(terminalCss, /a\.skipLink:focus-visible \{/);
  assert.match(landingCss, /a\.skipLink:focus \{/);
  assert.match(landingCss, /a\.skipLink:focus-visible \{/);
  assert.match(terminalCss, /top: 12px/);
  assert.match(terminalCss, /left: 12px/);
  assert.match(terminalCss, /clip-path: inset\(50%\)/);
  assert.match(terminalCss, /max-width: calc\(100vw - 24px\)/);
  assert.match(terminalCss, /flex-wrap: wrap/);
  assert.match(terminalCss, /flex: 1 1 calc\(50% - 4px\)/);
  assert.match(terminalCss, /max-height: min\(40vh, 17.5rem\)/);
  assert.match(landingCss, /clip-path: inset\(50%\)/);
  assert.match(landingCss, /max-width: calc\(100vw - 24px\)/);
  assert.match(landingCss, /flex-wrap: wrap/);
  assert.match(landingCss, /flex: 1 1 calc\(50% - 4px\)/);
  assert.match(landingCss, /max-height: min\(40vh, 17.5rem\)/);
  assert.match(landingCss, /white-space: normal;/);
  assert.match(terminalCss, /white-space: normal;/);
  assert.match(landingCss, /padding: 4px;/);
  assert.match(terminalCss, /padding: 4px;/);
  assert.match(landingCss, /padding: 0;/);
  assert.match(terminalCss, /padding: 0;/);
  assert.match(landingCss, /gap: 0;/);
  assert.match(terminalCss, /gap: 0;/);
  assert.match(landingCss, /transition: none !important;/);
  assert.match(terminalCss, /transition: none !important;/);
  assert.match(landingCss, /line-height: 1\.3;/);
  assert.match(terminalCss, /line-height: 1\.3;/);
  assert.match(terminalCss, /max-height: calc\(100vh - min\(40vh, 17\.5rem\) - 12px\)/);
  assert.match(terminalCss, /\.educationDialog \.tourNav \{[\s\S]*?position: sticky;/);
  assert.match(terminalCss, /scroll-padding-top: 8px;/);
  assert.match(terminalCss, /scroll-padding-bottom: 8px;/);
  assert.match(terminalCss, /scroll-margin-top: 8px;/);
  assert.match(terminalCss, /\.educationDialog \.tourNav button \{[\s\S]*?flex-shrink: 0;/);
  assert.match(terminalCss, /\.educationDialog \.tourNav button:disabled \{[\s\S]*?min-height: 44px;/);
  assert.match(terminalCss, /padding-bottom: 8px;/);
  assert.match(terminalCss, /flex-direction: column;/);
  assert.match(terminalCss, /margin-top: auto;/);
  assert.match(terminalCss, /outline: 2px solid #f4c95d;/);
  assert.match(terminalCss, /padding-top: 24px;/);
  assert.match(terminalCss, /z-index: 2;/);
  assert.match(terminalCss, /\.educationDialog h2 \{[\s\S]*?overflow: visible;/);
  assert.match(terminalCss, /\.educationDialog h2 \{[\s\S]*?min-height: 44px;/);
  assert.match(terminalCss, /\.educationDialog h2 \{[\s\S]*?min-width: 44px;/);
  assert.match(terminalCss, /\.educationDialog \{[\s\S]*?padding-bottom: 8px;/);
  assert.match(terminalCss, /min-width: 44px;\s*flex-shrink: 0;/);
  assert.match(terminalCss, /\.skipLink:last-child \{[\s\S]*?min-width: 44px;/);
  assert.match(landingCss, /\.skipLink:last-child \{[\s\S]*?min-width: 44px;/);
  assert.match(terminalCss, /\.educationDialog \.tourNav button:focus,/);
  assert.match(terminalCss, /\.educationDialog \.tourNav button:focus-visible \{/);
  assert.match(landingCss, /scrollbar-gutter: stable;/);
  assert.match(terminalCss, /scrollbar-gutter: stable;/);
  assert.match(landingCss, /right: auto;/);
  assert.match(terminalCss, /right: auto;/);
  assert.match(landingCss, /bottom: auto;/);
  assert.match(terminalCss, /bottom: auto;/);
  assert.match(landingCss, /overflow-wrap: anywhere;/);
  assert.match(terminalCss, /overflow-wrap: anywhere;/);
  assert.match(landingCss, /column-gap: 8px;/);
  assert.match(terminalCss, /column-gap: 8px;/);
  assert.match(landingCss, /row-gap: 8px;/);
  assert.match(terminalCss, /row-gap: 8px;/);
  assert.match(landingCss, /max-width: min\(100%, calc\(50% - 4px\)\)/);
  assert.match(terminalCss, /max-width: min\(100%, calc\(50% - 4px\)\)/);
  assert.match(landingCss, /align-items: stretch;/);
  assert.match(terminalCss, /align-items: stretch;/);
  assert.match(landingCss, /align-self: stretch;/);
  assert.match(terminalCss, /align-self: stretch;/);
  assert.match(landingCss, /z-index: 1;/);
  assert.match(terminalCss, /z-index: 1;/);
  assert.match(landingCss, /padding: 8px;/);
  assert.match(terminalCss, /padding: 8px;/);
  assert.match(landingCss, /word-break: break-word;/);
  assert.match(terminalCss, /word-break: break-word;/);
  assert.match(
    landingCss,
    /\.skipLink \{\r?\n    box-sizing: border-box;\r?\n    flex: 1 1 calc\(50% - 4px\);\r?\n    max-width: min\(100%, calc\(50% - 4px\)\);/,
  );
  assert.match(
    terminalCss,
    /\.skipLink \{\r?\n    box-sizing: border-box;\r?\n    flex: 1 1 calc\(50% - 4px\);\r?\n    max-width: min\(100%, calc\(50% - 4px\)\);/,
  );
  assert.match(landingCss, /overflow-y: auto;\r?\n    padding: 8px;/);
  assert.match(terminalCss, /overflow-y: auto;\r?\n    padding: 8px;/);
  assert.match(terminalCss, /margin-top: min\(40vh, 17\.5rem\)/);
  assert.match(
    await readFile(join(root, "src/components/preview-education.tsx"), "utf8"),
    /skipNavFocused/,
  );
  assert.match(await readFile(join(root, "src/app/status/page.tsx"), "utf8"), /id="status-ledger"/);
  assert.match(await readFile(join(root, "src/app/status/page.tsx"), "utf8"), /role="list" aria-label="Simulation status ledger"/);
  assert.match(await readFile(join(root, "src/lib/copy-uri.ts"), "utf8"), /Nothing was sent/);
  assert.match(await readFile(join(root, "src/lib/ticket-shortcuts.ts"), "utf8"), /reviewOpen/);
  const liquidity = await readFile(join(root, "src/components/liquidity-panel.tsx"), "utf8");
  assert.match(liquidity, /aria-errormessage/);
  assert.match(liquidity, /amountErrorId/);
  assert.match(liquidity, /id="pool-stats"/);
  assert.match(liquidity, /Fixture \{selectedPool\.tvl\}/);
  assert.match(liquidity, /Fixture \{selectedPool\.volume\}/);
  assert.match(liquidity, /Retry illustrative feed/);
  assert.match(await readFile(join(root, "src/lib/lp.ts"), "utf8"), /No session LP shares/);
  assert.match(liquidity, /not a return or profit projection/i);
  assert.match(liquidity, /feeEnvelopeCopy/);
  assert.match(liquidity, /Confirm simulated \{review\.kind\}/);
  assert.match(liquidity, /custodyRedemptionCopy/);
  assert.match(liquidity, /publicLinkabilityCopy/);
  assert.match(liquidity, /lpRiskCopy/);
  assert.match(liquidity, /lpFeedBlockCopy/);
  assert.match(liquidity, /lpEmptyBookCopy/);
  assert.doesNotMatch(liquidity, /adverse selection/);
  assert.match(liquidity, /publicly linkable/);
  assert.match(liquidity, /Review custody notice/);
  assert.match(liquidity, /Review simulated mint/);
  assert.match(liquidity, /nextFeedStatus/);
  assert.match(liquidity, /interpretRovingKey/);
  assert.match(liquidity, /id="liquidity-pools"/);
  assert.match(
    await readFile(join(root, "src/lib/preview-education.ts"), "utf8"),
    /not live settlement, not shielded ZEC, and not a trustless bridge/,
  );
  assert.match(await readFile(join(root, "src/components/preview-education.tsx"), "utf8"), /Education copy/);
  assert.match(await readFile(join(root, "src/components/preview-education.tsx"), "utf8"), /Education, not consent/);
  assert.match(landing, /Open status details/);
  assert.match(landing, /aria-label="Current system"/);
  assert.match(landing, /Legal and compliance/);
  assert.match(landing, /Choose what to inspect/);
  assert.match(landing, /A working preview, bounded on purpose/);
  assert.match(landing, /What exists today/);
  assert.match(landing, /Focused markets/);
  assert.match(landing, /role="listitem"/);
  assert.match(landing, /Not cleared for real assets/);
  assert.match(landing, /Mainnet launch gates/);
  assert.match(
    await readFile(join(root, "src/components/landing-journeys.tsx"), "utf8"),
    /styles.journeyList\} role="list" aria-label="Preview journeys"/,
  );
  assert.doesNotMatch(landing, /github.com/);
  const journeys = await readFile(join(root, "src/lib/landing-journeys.ts"), "utf8");
  assert.match(journeys, /Preview trading/);
  assert.match(journeys, /Preview liquidity/);
  assert.match(journeys, /Preview deposit states/);
  assert.match(journeys, /Preview withdrawal states/);
  assert.doesNotMatch(journeys, /^Deposit ZEC$/m);
  const evidence = await readFile(join(root, "src/lib/landing-evidence.ts"), "utf8");
  assert.match(evidence, /no return projection/);
  assert.match(evidence, /no address generation/);
  const gates = await readFile(join(root, "src/lib/landing-gates.ts"), "utf8");
  assert.match(gates, /Not cleared/);
  assert.doesNotMatch(gates, /waitlist/i);
  const preview = await readFile(join(root, "src/components/landing-terminal-preview.tsx"), "utf8");
  assert.match(preview, />Simulation</);
  assert.match(preview, /cannot submit, sign, or fill/);
  assert.match(preview, /Fixture \{formatAtomicUnits\(market\.lastTicks/);
  assert.match(preview, /Fixture price/);
  assert.match(preview, /Fixture size ZEC/);
  assert.doesNotMatch(preview, /tex1/);
  assert.doesNotMatch(preview, /wallet balance/i);
  assert.doesNotMatch(preview, /APY|profit/i);
  const ticket = await readFile(join(root, "src/components/trade-ticket.tsx"), "utf8");
  assert.match(ticket, /sideControlCopy/);
  assert.match(ticket, /sideControlCopy\(id, side === id\)/);
  assert.match(ticket, /Order rejected/);
  assert.match(ticket, /describeSubmit/);
  assert.match(ticket, /isTicketRejectCopy/);
  assert.match(await readFile(join(root, "src/lib/session.ts"), "utf8"), /ticketRejectCopy/);
  assert.match(await readFile(join(root, "src/lib/session.ts"), "utf8"), /Settled as \$\{markets\[marketId\]\.settlementPair\}/);
  assert.match(await readFile(join(root, "src/lib/market-state.ts"), "utf8"), /depthEmptyCopy/);
  assert.match(await readFile(join(root, "src/lib/market-state.ts"), "utf8"), /feedWithheldCopy/);
  assert.match(await readFile(join(root, "src/lib/market-state.ts"), "utf8"), /orderBookCaptionCopy/);
  assert.match(await readFile(join(root, "src/lib/market-state.ts"), "utf8"), /bookSideControlCopy/);
  assert.match(await readFile(join(root, "src/lib/market-state.ts"), "utf8"), /tapeSideCopy/);
  assert.match(await readFile(join(root, "src/lib/market-state.ts"), "utf8"), /emptyBookGateCopy/);
  assert.match(await readFile(join(root, "src/lib/market-state.ts"), "utf8"), /depthSessionLastCopy/);
  assert.match(await readFile(join(root, "src/lib/market-state.ts"), "utf8"), /loadingGateCopy/);
  assert.match(await readFile(join(root, "src/lib/market-state.ts"), "utf8"), /staleGateCopy/);
  assert.match(await readFile(join(root, "src/lib/market-state.ts"), "utf8"), /unavailableGateCopy/);
  assert.match(await readFile(join(root, "src/lib/market-state.ts"), "utf8"), /tapeCaptionCopy/);
  assert.match(await readFile(join(root, "src/lib/market-state.ts"), "utf8"), /sessionLastStatLabel/);
  assert.match(await readFile(join(root, "src/lib/market-state.ts"), "utf8"), /tapeMiniLabel/);
  assert.match(await readFile(join(root, "src/lib/market-state.ts"), "utf8"), /chartRangeTabLabel/);
  assert.match(await readFile(join(root, "src/lib/evm-wallet.ts"), "utf8"), /missingProviderCopy/);
  assert.match(await readFile(join(root, "src/lib/evm-wallet.ts"), "utf8"), /isMissingProviderCopy/);
  assert.match(await readFile(join(root, "src/lib/evm-wallet.ts"), "utf8"), /walletConnectFailureCopy/);
  assert.match(await readFile(join(root, "src/lib/evm-wallet.ts"), "utf8"), /retargetSettlementCopy/);
  assert.match(await readFile(join(root, "src/lib/lp.ts"), "utf8"), /lpPauseNoticeCopy/);
  assert.match(await readFile(join(root, "src/lib/lp.ts"), "utf8"), /isLpPauseNotice/);
  assert.match(await readFile(join(root, "src/lib/lp.ts"), "utf8"), /lpResetNoticeCopy/);
  assert.match(await readFile(join(root, "src/lib/market-state.ts"), "utf8"), /chartPanelHeadingCopy/);
  assert.match(await readFile(join(root, "src/lib/market-state.ts"), "utf8"), /chartPanelEyebrowCopy/);
  assert.match(await readFile(join(root, "src/lib/evm-wallet.ts"), "utf8"), /walletStateWithSettlement/);
  assert.match(await readFile(join(root, "src/lib/evm-wallet.ts"), "utf8"), /walletDisconnectLabel/);
  assert.match(await readFile(join(root, "src/lib/market-state.ts"), "utf8"), /priceChartLabelCopy/);
  assert.match(await readFile(join(root, "src/lib/lp.ts"), "utf8"), /lpMintNoticeCopy/);
  assert.match(await readFile(join(root, "src/lib/lp.ts"), "utf8"), /lpBurnNoticeCopy/);
  assert.match(await readFile(join(root, "src/lib/lp.ts"), "utf8"), /lpSwapNoticeCopy/);
  assert.match(await readFile(join(root, "src/lib/evm-wallet.ts"), "utf8"), /walletConnectIdleTitle/);
  assert.match(await readFile(join(root, "src/lib/evm-wallet.ts"), "utf8"), /walletConnectBusyTitle/);
  assert.match(await readFile(join(root, "src/lib/evm-wallet.ts"), "utf8"), /walletConnectTitle/);
  assert.match(await readFile(join(root, "src/lib/evm-wallet.ts"), "utf8"), /walletConnectBarTitle/);
  assert.match(await readFile(join(root, "src/components/liquidity-panel.tsx"), "utf8"), /lpResetNoticeCopy/);
  assert.match(await readFile(join(root, "src/components/liquidity-panel.tsx"), "utf8"), /lpPauseNoticeCopy/);
  assert.match(await readFile(join(root, "src/components/liquidity-panel.tsx"), "utf8"), /isLpPauseNotice\(notice\) \? lpPauseNoticeCopy/);
  assert.match(await readFile(join(root, "src/components/liquidity-panel.tsx"), "utf8"), /lpBurnNoticeCopy/);
  assert.match(await readFile(join(root, "src/components/liquidity-panel.tsx"), "utf8"), /lpMintNoticeCopy/);
  assert.match(await readFile(join(root, "src/components/liquidity-panel.tsx"), "utf8"), /lpSwapNoticeCopy/);
  assert.match(await readFile(join(root, "src/components/wallet-bar.tsx"), "utf8"), /missingProviderCopy/);
  assert.match(await readFile(join(root, "src/components/wallet-bar.tsx"), "utf8"), /retargetSettlementCopy/);
  assert.match(await readFile(join(root, "src/components/wallet-bar.tsx"), "utf8"), /walletDisconnectLabel/);
  assert.match(await readFile(join(root, "src/components/wallet-bar.tsx"), "utf8"), /walletConnectBarTitle/);
  assert.match(
    await readFile(join(root, "src/lib/evm-wallet.ts"), "utf8"),
    /busy \? walletConnectTitle\(settlementPair, true\)/,
  );
  assert.match(await readFile(join(root, "src/components/price-chart.tsx"), "utf8"), /priceChartLabelCopy/);
  assert.match(
    await readFile(join(root, "src/components/price-chart.tsx"), "utf8"),
    /feedSurface\(feedStatus\)/,
  );
  assert.match(await readFile(join(root, "src/components/trade-ticket.tsx"), "utf8"), /market\.settlementPair/);
  assert.match(await readFile(join(root, "src/components/trade-ticket.tsx"), "utf8"), /missingProviderCopy/);
  assert.match(await readFile(join(root, "src/components/trade-ticket.tsx"), "utf8"), /retargetSettlementCopy/);
  assert.match(await readFile(join(root, "src/components/trade-ticket.tsx"), "utf8"), /isTicketRejectCopy/);
  assert.match(await readFile(join(root, "src/components/trade-ticket.tsx"), "utf8"), /isMissingProviderCopy/);
  assert.match(await readFile(join(root, "src/components/trading-terminal.tsx"), "utf8"), /key=\{feedStatus\}/);
  const terminalTape = await readFile(join(root, "src/components/trading-terminal.tsx"), "utf8");
  assert.match(terminalTape, /tapeSideCopy/);
  assert.match(terminalTape, /tapeSideCopy\(trade\.takerSide\)/);
  assert.match(terminalTape, /tapeSideCopy\(trade\.side\)/);
  assert.doesNotMatch(terminalTape, /srOnly\}>\{trade\.(?:takerSide|side) === "buy" \? "Buy" : "Sell"/);
  assert.doesNotMatch(terminalTape, /srOnly\}>\{tapeSideCopy/);
  const orderBook = await readFile(join(root, "src/components/order-book.tsx"), "utf8");
  assert.match(orderBook, /bookSideControlCopy/);
  assert.match(orderBook, /bookSideControlCopy\(bookSide, priceLabel\)/);
  assert.doesNotMatch(orderBook, /\{label\} <\/span>/);
  assert.match(ticket, /Ticket blocked/);
  assert.match(ticket, /interpretTicketKey/);
  assert.match(ticket, /nextTicketSide/);
  assert.match(ticket, /nextTicketOrderType/);
  assert.match(ticket, /nextTicketTif/);
  assert.match(ticket, /interpretRovingKey/);
  assert.match(ticket, /Ticket keyboard/);
  assert.match(ticket, /shortcutRegion/);
  assert.match(ticket, /aria-errormessage/);
  assert.match(ticket, /expiryErrorId/);
  const blotter = await readFile(join(root, "src/components/order-blotter.tsx"), "utf8");
  assert.match(blotter, /role="tabpanel"/);
  assert.match(blotter, /describeSessionLogEvent/);
  assert.match(blotter, /nextBlotterTab/);
  assert.match(blotter, /Enter" \|\| event\.key === " "/);
  assert.match(await readFile(join(root, "src/app/legal/page.tsx"), "utf8"), /not a live exchange/);
  assert.match(await readFile(join(root, "src/app/legal/page.tsx"), "utf8"), /Skip to legal article/);
  assert.match(await readFile(join(root, "src/app/legal/page.tsx"), "utf8"), /id="legal-article"/);
  assert.match(await readFile(join(root, "src/app/legal/page.tsx"), "utf8"), /aria-label="Legal and compliance ledger"/);
  assert.match(await readFile(join(root, "src/app/security/page.tsx"), "utf8"), /no production support commitment/);
  assert.match(await readFile(join(root, "src/app/security/page.tsx"), "utf8"), /Skip to security article/);
  assert.match(await readFile(join(root, "src/app/security/page.tsx"), "utf8"), /id="security-article"/);
  assert.match(await readFile(join(root, "src/app/security/page.tsx"), "utf8"), /aria-label="Security ledger"/);
  assert.match(await readFile(join(root, "src/app/not-found.tsx"), "utf8"), /Skip to missing-route copy/);
  assert.match(await readFile(join(root, "src/app/not-found.tsx"), "utf8"), /id="missing-route"/);
  assert.match(await readFile(join(root, "src/app/trade/page.tsx"), "utf8"), /isRenderFailureQuery/);
  assert.match(await readFile(join(root, "src/app/trade/page.tsx"), "utf8"), /RENDER_FAILURE_MESSAGE/);
  assert.match(await readFile(join(root, "src/app/trade/page.tsx"), "utf8"), /isLoadingForceQuery/);
  assert.match(await readFile(join(root, "src/app/trade/page.tsx"), "utf8"), /SimulationLoading/);
  assert.match(await readFile(join(root, "src/components/simulation-loading.tsx"), "utf8"), /aria-label="Withheld-price notice"/);
  assert.match(await readFile(join(root, "src/app/error.tsx"), "utf8"), /Skip to retry copy/);
  assert.match(await readFile(join(root, "src/app/error.tsx"), "utf8"), /id="retry-copy"/);
  assert.match(await readFile(join(root, "src/app/error.tsx"), "utf8"), /Nothing was submitted/);
  const globalError = await readFile(join(root, "src/app/global-error.tsx"), "utf8");
  assert.match(globalError, /Nothing was submitted to a chain, matcher, or custody system/);
  assert.match(globalError, /minHeight: 44/);
  assert.match(globalError, /minWidth: 44/);
  assert.match(globalError, /Skip to retry copy/);
  assert.match(globalError, /Skip to main content/);
  assert.match(globalError, /id="retry-copy"/);
  assert.match(globalError, /id="main-content"/);
  assert.match(globalError, /flex-wrap: wrap/);
  assert.match(globalError, /flex: 1 1 calc\(50% - 4px\)/);
  assert.match(globalError, /outline: 2px solid #15140d/);
  assert.doesNotMatch(globalError, /is a live exchange/);
  assert.doesNotMatch(await readFile(join(root, "src/app/legal/page.tsx"), "utf8"), /is audited/);
  const education = await readFile(join(root, "src/lib/preview-education.ts"), "utf8");
  assert.match(education, /Education, not consent|not a financial record/);
  assert.match(education, /Pairs are native ZEC against USDC and USDT/);
  assert.match(education, /not live settlement/);
  assert.doesNotMatch(education, /pZEC would depend on custody/);
  assert.doesNotMatch(education, /I agree/);
  assert.match(await readFile(join(root, "src/components/preview-education.tsx"), "utf8"), /Education, not consent/);
  assert.match(await readFile(join(root, "src/lib/access-demo.ts"), "utf8"), /State demonstration/);
  assert.doesNotMatch(await readFile(join(root, "src/lib/access-demo.ts"), "utf8"), /geolocat/i);
  assert.match(await readFile(join(root, "src/lib/ticket-shortcuts.ts"), "utf8"), /dialogOpen/);
  assert.match(await readFile(join(root, "src/components/trade-ticket.tsx"), "utf8"), /interpretTicketKey/);
  assert.match(await readFile(join(root, "src/lib/deposit-tour.ts"), "utf8"), /No address generated in simulation/);
  assert.match(await readFile(join(root, "src/components/incident-demo.tsx"), "utf8"), /State demonstration/);
  assert.doesNotMatch(await readFile(join(root, "src/lib/gateway-incidents.ts"), "utf8"), /\blive outage\b/i);
  assert.match(await readFile(join(root, "src/app/status/page.tsx"), "utf8"), /Architecture incident demonstrations/);
  assert.match(await readFile(join(root, "src/app/status/page.tsx"), "utf8"), /demo=incidents/);
  assert.match(await readFile(join(root, "src/app/status/page.tsx"), "utf8"), /not a live outage/);
  assert.match(await readFile(join(root, "src/components/incident-demo.tsx"), "utf8"), /architecture-demonstration/);
  assert.match(await readFile(join(root, "src/lib/ticket-shortcuts.ts"), "utf8"), /reviewOpen/);
  assert.match(await readFile(join(root, "src/lib/lp.ts"), "utf8"), /emptyShareCopy/);
  assert.match(await readFile(join(root, "src/lib/blotter-copy.ts"), "utf8"), /Settled as \$\{settlementPair\}/);
  assert.match(await readFile(join(root, "src/lib/blotter-copy.ts"), "utf8"), /blotterEmptyLogCopy/);
  assert.match(await readFile(join(root, "src/lib/blotter-copy.ts"), "utf8"), /blotterLogEventCopy/);
  assert.match(await readFile(join(root, "src/lib/blotter-copy.ts"), "utf8"), /expiry \$\{expiry\}/);
  assert.match(await readFile(join(root, "src/lib/terminal-url.ts"), "utf8"), /demo/);
  assert.match(await readFile(join(root, "src/lib/gateway-incidents.ts"), "utf8"), /rememberIncidentDemo/);
  assert.match(await readFile(join(root, "src/lib/gateway-incidents.ts"), "utf8"), /phlebas\.incidentDemo/);
  assert.match(await readFile(join(root, "src/components/trading-terminal.tsx"), "utf8"), /useSyncExternalStore/);
  assert.match(await readFile(join(root, "src/components/trading-terminal.tsx"), "utf8"), /rememberIncidentDemo\(true\)/);
  assert.match(await readFile(join(root, "src/components/trading-terminal.tsx"), "utf8"), /demoQuery = incidentDemo/);
  assert.match(await readFile(join(root, "src/components/trading-terminal.tsx"), "utf8"), /highlightIncidents=\{incidentDemo\}/);
});

test("vercel.json does not assign operator URLs", async () => {
  const vercelPath = join(root, "vercel.json");
  if (!existsSync(vercelPath)) {
    assert.equal(existsSync(vercelPath), false);
    return;
  }
  const vercel = await readFile(vercelPath, "utf8");
  assert.doesNotMatch(vercel, /PHLEBAS_GATEWAY_URL\s*[:=]/);
  assert.doesNotMatch(vercel, /PHLEBAS_MATCHER_URL\s*[:=]/);
});

test("Open Graph and Twitter cards stay labeled as a simulation", async () => {
  const layout = await readFile(join(root, "src/app/layout.tsx"), "utf8");
  assert.match(layout, /No-value simulation and non-custodial protocol plan/);
  assert.match(layout, /openGraph:/);
  assert.match(layout, /twitter:/);
  assert.doesNotMatch(layout, /is a live exchange/);
  assert.doesNotMatch(layout, /payable|shielded|native-ZEC/);
});

test("route loading copy names a simulation and withholds prices", async () => {
  const loading = await readFile(join(root, "src/components/simulation-loading.tsx"), "utf8");
  assert.match(loading, /Loading the simulation/);
  assert.match(loading, /id="withheld-price"/);
  assert.match(loading, /Skip to withheld-price notice/);
  assert.match(loading, /No market data is live/);
  assert.match(loading, /Nothing was submitted/);
  assert.doesNotMatch(loading, /APY|wallet balance|tex1/i);
  assert.match(await readFile(join(root, "src/app/trade/loading.tsx"), "utf8"), /SimulationLoading/);
  assert.match(await readFile(join(root, "src/app/liquidity/loading.tsx"), "utf8"), /SimulationLoading/);
  assert.equal(existsSync(join(root, "src/app/loading.tsx")), false);
});

test("robots and security headers keep the public app noindex", async () => {
  const robots = await readFile(join(root, "src/app/robots.ts"), "utf8");
  const nextConfig = await readFile(join(root, "next.config.ts"), "utf8");
  assert.match(robots, /disallow: "\/"/);
  assert.match(nextConfig, /noindex, nofollow, noarchive/);
  assert.match(nextConfig, /X-Frame-Options/);
});

test("production CSP connect-src is self only", async () => {
  const nextConfig = await readFile(join(root, "next.config.ts"), "utf8");
  const connectSrc = "`connect-src 'self'${isDevelopment ? \" ws: http:\" : \"\"}`";
  assert.match(nextConfig, /const isDevelopment = process\.env\.NODE_ENV === "development"/);
  assert.equal(nextConfig.includes(connectSrc), true);
  const withoutConnect = nextConfig.replace(connectSrc, "");
  assert.doesNotMatch(withoutConnect, /\bws:/);
  assert.doesNotMatch(withoutConnect, /\bhttp:/);
});

test("design docs do not claim the repo has no matcher or wallet stubs", async () => {
  const threat = await readFile(join(root, "docs/THREAT_MODEL.md"), "utf8");
  const architecture = await readFile(join(root, "docs/ARCHITECTURE.md"), "utf8");
  assert.match(threat, /no-value simulation/);
  assert.match(threat, /loopback/);
  assert.doesNotMatch(threat, /It has no wallet integration/);
  assert.match(architecture, /loopback operator stubs/);
  assert.doesNotMatch(architecture, /It has no database, wallet connection/);
});

test("native settlement target never presents a receipt token as ZEC authority", async () => {
  const architecture = await readFile(join(root, "docs/ARCHITECTURE.md"), "utf8");
  const accounting = await readFile(join(root, "docs/ASSET_AND_ACCOUNTING.md"), "utf8");
  assert.match(architecture, /It never becomes a Phlebas receipt or platform balance/);
  assert.match(architecture, /supersedes the custody-backed pZEC design/);
  assert.match(accounting, /Status: superseded custody model/);
  assert.match(accounting, /Do not extend this model into a live path/);
  const spec = await readFile(join(root, "docs/PRODUCT_SPEC.md"), "utf8");
  assert.match(spec, /Users and liquidity providers keep control of their wallets/);
  assert.match(spec, /custody-backed pZEC/);
  const readme = await readFile(join(root, "README.md"), "utf8");
  assert.match(readme, /It is not wrapped, minted, or represented as a Phlebas platform balance/);
  assert.match(readme, /historical pZEC and AMM simulations/);
});

test("simulation-label ADR is explicitly superseded by wallet-controlled settlement", async () => {
  const adr2 = await readFile(join(root, "docs/adr/0002-native-zec-usdc-usdt.md"), "utf8");
  assert.match(adr2, /Status: Superseded simulation-label record/);
  assert.match(adr2, /Superseded by: \[Native ZEC Atomic Settlement\]/);
  assert.match(adr2, /legacy fixtures/);
  const journeys = await readFile(join(root, "docs/LANDING_AND_USER_JOURNEYS.md"), "utf8");
  assert.match(journeys, /Section ID: `pairs`/);
  assert.match(journeys, /Native labels are simulation names, not live settlement/);
  const threat = await readFile(join(root, "docs/THREAT_MODEL.md"), "utf8");
  assert.match(threat, /retained as historical simulation evidence/);
  assert.match(threat, /does not define the production target/);
  const readme = await readFile(join(root, "README.md"), "utf8");
  assert.match(readme, /wallet-held maker and solver inventory instead of passive cross-chain LP shares/);
});

test("source identifiers no longer use listed pZEC leftovers", async () => {
  const lp = await readFile(join(root, "src/lib/lp.ts"), "utf8");
  const lpTest = await readFile(join(root, "src/lib/lp.test.ts"), "utf8");
  const order = await readFile(join(root, "src/lib/order.ts"), "utf8");
  const ticket = await readFile(join(root, "src/components/trade-ticket.tsx"), "utf8");
  const foundry = await readFile(join(root, "contracts/test/Phlebas.t.sol"), "utf8");
  assert.match(lp, /zecLabel: string/);
  assert.doesNotMatch(lp, /pzecLabel/);
  assert.doesNotMatch(lp, /lpPzecAtoms/);
  assert.doesNotMatch(lpTest, /pzecLabel/);
  assert.doesNotMatch(lpTest, /entryPzec/);
  assert.match(order, /ZEC_ATOMIC_RULE/);
  assert.match(order, /formatZecPreviewAmount/);
  assert.doesNotMatch(order, /PZEC_ATOMIC_RULE/);
  assert.doesNotMatch(order, /formatPzecPreviewAmount/);
  assert.doesNotMatch(order, /PZEC_ATOM/);
  assert.match(ticket, /ZEC_ATOMIC_RULE/);
  assert.doesNotMatch(ticket, /PZEC_ATOMIC_RULE/);
  assert.match(foundry, /reserveZec/);
  assert.doesNotMatch(foundry, /reservePzec/);
  assert.doesNotMatch(foundry, /backPzec/);
});

test("journeys pin expired closed withdrawal states without live payout", async () => {
  const journeys = await readFile(join(root, "docs/LANDING_AND_USER_JOURNEYS.md"), "utf8");
  assert.match(journeys, /Expired evidence|closed without a finalized burn/);
  assert.match(journeys, /unresolved/);
  assert.doesNotMatch(journeys, /\blive payout/i);
});

test("journeys pin refunded tZEC restore without live payout", async () => {
  const journeys = await readFile(join(root, "docs/LANDING_AND_USER_JOURNEYS.md"), "utf8");
  assert.match(journeys, /refunded|tZEC restored/);
  assert.doesNotMatch(journeys, /\blive payout/i);
});

test("journeys pin unresolved recovery without live payout", async () => {
  const journeys = await readFile(join(root, "docs/LANDING_AND_USER_JOURNEYS.md"), "utf8");
  assert.match(journeys, /unresolved -> exact committed transaction observed -> broadcast \| mined/);
  assert.match(journeys, /unresolved -> verified input restoration -> payable/);
  assert.doesNotMatch(journeys, /\blive payout/i);
});

test("PRODUCT_SPEC keeps native settlement and legacy recovery boundaries distinct", async () => {
  const spec = await readFile(join(root, "docs/PRODUCT_SPEC.md"), "utf8");
  assert.match(spec, /one two-chain atomic-swap workflow per fill/);
  assert.match(spec, /custody-backed pZEC/);
  assert.match(spec, /The current public application is a simulation/);
});

test("journeys pin deposit fail-closed Unavailable Rejected Stale without minting", async () => {
  const journeys = await readFile(join(root, "docs/LANDING_AND_USER_JOURNEYS.md"), "utf8");
  const start = journeys.indexOf("## Deposit journey");
  const end = journeys.indexOf("## Withdrawal journey");
  assert.ok(start >= 0 && end > start);
  const deposit = journeys.slice(start, end);
  assert.match(deposit, /Unavailable/);
  assert.match(deposit, /Rejected/);
  assert.match(deposit, /Stale/);
  assert.match(deposit, /Observers unavailable or disagree/);
  assert.match(deposit, /no receivable address/i);
  assert.match(deposit, /Nothing is minted|nothing was minted/);
  assert.doesNotMatch(deposit, /\blive mint/i);
});

test("accounting pins refunded tZEC not listed pZEC", async () => {
  const accounting = await readFile(join(root, "docs/ASSET_AND_ACCOUNTING.md"), "utf8");
  assert.match(accounting, /Outstanding tZEC/);
  assert.match(accounting, /refunded|tZEC restoration/);
  assert.doesNotMatch(accounting, /Outstanding pZEC/);
  assert.doesNotMatch(accounting, /### pZEC/);
});

test("public error boundaries never render exception details", async () => {
  for (const path of ["src/app/error.tsx", "src/app/global-error.tsx"]) {
    const source = await readFile(join(root, path), "utf8");
    assert.match(source, /No private diagnostic details are shown here/);
    assert.doesNotMatch(source, /error\.message|error\.stack|error\.digest/);
  }
});

test("legacy fill projection cannot emit wallet instructions", async () => {
  const projection = await readFile(join(root, "src/lib/swap-fill-projection.ts"), "utf8");
  const coordinator = await readFile(join(root, "src/lib/atomic-coordinator.ts"), "utf8");
  assert.match(projection, /not settlement authority/);
  assert.match(projection, /projectedDiagnosticNextStep/);
  assert.doesNotMatch(projection, /export type (?:Fill|Transition)\b/);
  assert.doesNotMatch(projection, /export function transition\b/);
  assert.doesNotMatch(projection, /return "(?:fund|claim|refund)-/);
  assert.match(coordinator, /Legacy observer projection/);
  assert.match(coordinator, /not settlement authority/);
  assert.doesNotMatch(coordinator, /source of truth/);
});

test("canonical settlement and wallet modules cannot import the diagnostic projection", async () => {
  const restrictedConsumers = [
    "src/lib/swap-state.ts",
    "src/lib/swap-journal.ts",
    "src/lib/swap-replay.ts",
    "src/lib/evm-wallet.ts",
    "src/lib/matcher-operator.ts",
    "src/lib/settlement-accounting.ts",
    "src/lib/sepolia-submit.ts",
    "src/components/trade-ticket.tsx",
    "src/components/native-swap-panel.tsx",
    "src/app/api/matcher/route.ts",
  ];
  for (const path of restrictedConsumers) {
    const source = await readFile(join(root, path), "utf8");
    assert.doesNotMatch(source, /swap-fill-projection|atomic-coordinator/, path);
  }
  const observerServer = await readFile(join(root, "services/atomic-swap-observer/server.ts"), "utf8");
  assert.match(observerServer, /diagnostic-untrusted/);
});
