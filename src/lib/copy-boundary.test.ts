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
});

test("status page links to legal and security without a live-funds claim", async () => {
  const statusPage = await readFile(join(root, "src/app/status/page.tsx"), "utf8");
  assert.match(statusPage, /href="\/legal"/);
  assert.match(statusPage, /href="\/security"/);
  assert.match(statusPage, /href="\/trade\?view=architecture"/);
  assert.match(statusPage, /href="\/#launch-gates"/);
  assert.match(statusPage, /from "next\/link"/);
  assert.match(statusPage, /No live funds or custody/);
  assert.doesNotMatch(statusPage, /is audited/);
});

test("landing and terminal banners stay simulation-only", async () => {
  const landing = await readFile(join(root, "src/components/landing-page.tsx"), "utf8");
  const terminal = await readFile(join(root, "src/components/trading-terminal.tsx"), "utf8");
  assert.match(landing, /Simulation only/);
  assert.match(landing, /No mainnet funds/);
  assert.match(landing, /LANDING_LEDGER/);
  assert.match(landing, /LANDING_HERO/);
  assert.match(
    await readFile(join(root, "src/lib/landing-copy.ts"), "utf8"),
    /not native ZEC, shielded ZEC, or a trustless bridge asset/,
  );
  assert.match(landing, /LANDING_PZEC/);
  assert.match(landing, /LANDING_SKIP_LINKS/);
  const skipCopy = await readFile(join(root, "src/lib/landing-copy.ts"), "utf8");
  assert.match(skipCopy, /Skip to journeys/);
  assert.match(skipCopy, /Skip to evidence/);
  assert.match(skipCopy, /Skip to terminal preview/);
  assert.match(await readFile(join(root, "src/lib/landing-copy.ts"), "utf8"), /No shielded deposit or withdrawal is planned for v1/);
  assert.match(await readFile(join(root, "src/lib/landing-copy.ts"), "utf8"), /zips\.z\.cash\/zip-0320/);
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
  assert.match(bridge, /Preview deposit states, not Deposit ZEC/);
  assert.match(bridge, /payoutClaimForTourStep/);
  assert.match(bridge, /Nothing is sent/);
  const liquidity = await readFile(join(root, "src/components/liquidity-panel.tsx"), "utf8");
  assert.match(liquidity, /not a return or profit projection/i);
  assert.match(liquidity, /feeEnvelopeCopy/);
  assert.match(liquidity, /Confirm simulated \{review\.kind\}/);
  assert.match(liquidity, /publicly linkable/);
  assert.match(liquidity, /Review simulated mint/);
  assert.match(
    await readFile(join(root, "src/lib/preview-education.ts"), "utf8"),
    /not native ZEC, shielded ZEC, or a trustless bridge asset/,
  );
  assert.match(landing, /Open status details/);
  assert.match(landing, /Legal and compliance/);
  assert.match(landing, /Choose what to inspect/);
  assert.match(landing, /A working preview, bounded on purpose/);
  assert.match(landing, /Not cleared for real assets/);
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
  assert.doesNotMatch(preview, /tex1/);
  assert.doesNotMatch(preview, /wallet balance/i);
  assert.doesNotMatch(preview, /APY|profit/i);
  const ticket = await readFile(join(root, "src/components/trade-ticket.tsx"), "utf8");
  assert.match(ticket, /Order rejected/);
  const blotter = await readFile(join(root, "src/components/order-blotter.tsx"), "utf8");
  assert.match(blotter, /role="tabpanel"/);
  assert.match(blotter, /describeSessionLogEvent/);
  assert.match(blotter, /nextBlotterTab/);
  assert.match(blotter, /Enter" \|\| event\.key === " "/);
  assert.match(await readFile(join(root, "src/app/legal/page.tsx"), "utf8"), /not a live exchange/);
  assert.match(await readFile(join(root, "src/app/security/page.tsx"), "utf8"), /no production support commitment/);
  assert.doesNotMatch(await readFile(join(root, "src/app/legal/page.tsx"), "utf8"), /is audited/);
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
