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

test("landing and terminal banners stay simulation-only", async () => {
  const landing = await readFile(join(root, "src/components/landing-page.tsx"), "utf8");
  const terminal = await readFile(join(root, "src/components/trading-terminal.tsx"), "utf8");
  assert.match(landing, /Simulation only/);
  assert.match(landing, /No mainnet funds/);
  assert.match(landing, /Deny by default/);
  assert.match(landing, /not native ZEC, shielded ZEC, or a trustless bridge asset/);
  assert.doesNotMatch(withoutHonestBridgeNegation(landing), /trustless bridge/i);
  assert.doesNotMatch(withoutHonestBridgeNegation(terminal), /trustless bridge/i);
  assert.match(terminal, /do not move mainnet funds/);
  assert.match(terminal, /not trustless/);
  assert.match(await readFile(join(root, "src/components/trade-ticket.tsx"), "utf8"), /publicly linkable/);
  assert.match(await readFile(join(root, "src/components/trade-ticket.tsx"), "utf8"), /feeEnvelopeCopy/);
  assert.match(await readFile(join(root, "src/components/trade-ticket.tsx"), "utf8"), /parseExpiryUnix/);
  assert.match(await readFile(join(root, "src/components/trade-ticket.tsx"), "utf8"), /Order expiry unix time/);
  assert.match(await readFile(join(root, "src/components/architecture-panel.tsx"), "utf8"), /never hosted on Vercel/);
  assert.doesNotMatch(landing, /is audited/);
  assert.doesNotMatch(terminal, /is audited/);
  const bridge = await readFile(join(root, "src/components/bridge-panel.tsx"), "utf8");
  assert.match(bridge, /Preview withdrawal states, not Withdraw ZEC/);
  assert.match(bridge, /payoutClaimForTourStep/);
  assert.match(bridge, /Nothing is sent/);
  const liquidity = await readFile(join(root, "src/components/liquidity-panel.tsx"), "utf8");
  assert.match(liquidity, /not a return or profit projection/i);
  assert.match(liquidity, /feeEnvelopeCopy/);
  assert.match(liquidity, /Confirm simulated \{review\.kind\}/);
  assert.match(liquidity, /publicly linkable/);
  const ticket = await readFile(join(root, "src/components/trade-ticket.tsx"), "utf8");
  assert.match(ticket, /Order rejected/);
  const blotter = await readFile(join(root, "src/components/order-blotter.tsx"), "utf8");
  assert.match(blotter, /role="tabpanel"/);
  assert.match(blotter, /blotterLogEventCopy/);
  assert.match(blotter, /blotterLogCaptionCopy/);
  assert.match(blotter, /blotterEmptyLogCopy/);
  assert.match(await readFile(join(root, "src/lib/landing-journeys.ts"), "utf8"), /Preview trading/);
  assert.match(await readFile(join(root, "src/lib/landing-journeys.ts"), "utf8"), /Preview withdrawal states/);
  assert.match(await readFile(join(root, "src/components/landing-journeys.tsx"), "utf8"), /Choose what to inspect/);
  assert.match(await readFile(join(root, "src/components/placeholder-qr.tsx"), "utf8"), /Not payable/);
  assert.match(await readFile(join(root, "src/lib/copy-uri.ts"), "utf8"), /Nothing was sent/);
  assert.doesNotMatch(await readFile(join(root, "src/lib/copy-uri.ts"), "utf8"), /navigator\.clipboard\?\.writeText/);
  assert.match(await readFile(join(root, "src/app/legal/page.tsx"), "utf8"), /not a live exchange/);
  assert.match(await readFile(join(root, "src/app/security/page.tsx"), "utf8"), /no production support commitment/);
  assert.doesNotMatch(await readFile(join(root, "src/app/legal/page.tsx"), "utf8"), /is audited/);
  const education = await readFile(join(root, "src/lib/preview-education.ts"), "utf8");
  assert.match(education, /Education, not consent|not a financial record/);
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
