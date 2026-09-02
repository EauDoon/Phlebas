import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import test from "node:test";
import { existsSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { previewStatus } from "./status.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const execFileAsync = promisify(execFile);

async function scanSecrets(cwd: string) {
  try {
    const result = await execFileAsync(process.execPath, ["scripts/scan-secrets.mjs"], {
      cwd,
      encoding: "utf8",
    });
    return { code: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error) {
      return {
        code: Number(error.code),
        stdout: "stdout" in error ? String(error.stdout ?? "") : "",
        stderr: "stderr" in error ? String(error.stderr ?? "") : "",
      };
    }
    throw error;
  }
}

function withoutHonestBridgeNegation(copy: string) {
  return copy.replace(/not (?:native ZEC, shielded ZEC, or )?a trustless bridge(?: asset)?/gi, "");
}

function withoutArchitectureFooterSentences(copy: string) {
  return copy
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/Phlebas is a protocol preview, not a live exchange or an offer of financial services\./gi, "")
    .replace(/The matcher is not trustless[^.]*\./gi, "")
    .replace(/Simulation only\./gi, "")
    .replace(/Native settlement target:[^.]*(?:\.|$)/gi, "");
}

function withoutHonestNegation(copy: string) {
  return withoutHonestBridgeNegation(copy)
    .replace(/from\s+["'][^"']+["'];?/g, "")
    .replace(/\bnot trustless\b/gi, "")
    .replace(/\bdoes not provide shielded(?: deposits)?\b/gi, "")
    .replace(/\bNo shielded deposit or withdrawal is planned for v1\b/gi, "")
    .replace(/\bnot a live exchange and not a shielded market\b/gi, "")
    .replace(/\bShielded ZEC stays out of scope\b/gi, "")
    .replace(/\bShielded deposits, leverage, lending, and token incentives remain out of scope\b/gi, "")
    .replace(/\bnot native ZEC(?: or the target asset)?\b/gi, "")
    .replace(/\bno native ZEC or stablecoin enters this application\b/gi, "")
    .replace(/\bNo live funds(?: or custody)?\b/gi, "")
    .replace(/\bNot a payable QR\b/gi, "")
    .replace(/\bNot payable\b/gi, "")
    .replace(/\bnon-payable\b/gi, "")
    .replace(/\bNative settlement target:[^.]*(?:\.|$)/gi, "")
    .replace(/\bnot the native-settlement target\b/gi, "")
    .replace(/\bnot live settlement\b/gi, "")
    .replace(/\bnot shielded\b/gi, "")
    .replace(/\bnot a trustless bridge\b/gi, "")
    .replace(/\bUSDT0 is abandoned\b/gi, "");
}

function withoutHonestCopyNegation(copy: string) {
  return withoutHonestNegation(copy);
}

async function shippedUiFiles() {
  const files: string[] = [];

  async function walk(directory: string, match: (name: string) => boolean) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(path, match);
        continue;
      }
      if (entry.isFile() && match(entry.name)) {
        files.push(path);
      }
    }
  }

  await walk(join(root, "src/components"), (name) => name.endsWith(".tsx"));
  await walk(join(root, "src/app"), (name) => name.endsWith(".tsx"));
  await walk(
    join(root, "src/lib"),
    (name) => name.includes("copy") && name.endsWith(".ts") && !name.endsWith(".test.ts"),
  );
  return files;
}

function isHonestLegalPage(file: string) {
  const normalized = file.replace(/\\/g, "/");
  return /\/app\/(legal|security|status)\/page\.tsx$/.test(normalized)
    || /\/components\/architecture-panel\.tsx$/.test(normalized)
    || /\/components\/bridge-panel\.tsx$/.test(normalized)
    || /\/components\/native-swap-fixtures\.ts$/.test(normalized)
    || /\/app\/(zcash|swap)\/page\.tsx$/.test(normalized);
}

async function operationalUiFiles() {
  return (await shippedUiFiles()).filter((file) => !isHonestLegalPage(file));
}

test("shipped UI copy does not claim live trustless, shielded, or native-ZEC settlement", async () => {
  const files = await shippedUiFiles();
  assert.ok(files.some((file) => file.endsWith("architecture-panel.tsx")));
  assert.ok(files.some((file) => file.endsWith("landing-copy.ts")));
  const joined = withoutHonestCopyNegation(
    (await Promise.all(files.map((file) => readFile(file, "utf8")))).join("\n"),
  );
  assert.doesNotMatch(joined, /\btrustless\b/i);
  assert.doesNotMatch(joined, /\bshielded\b/i);
  assert.doesNotMatch(joined, /\bshielded-market\b/i);
  assert.doesNotMatch(joined, /native-ZEC/i);
  assert.doesNotMatch(joined, /wallet-signed native[- ]ZEC/i);
  assert.doesNotMatch(joined, /native ZEC atomic settlement/i);
  assert.doesNotMatch(joined, /\bis audited\b/i);
  assert.doesNotMatch(joined, /\baccepts live funds\b/i);
  assert.doesNotMatch(joined, /\bhas live funds\b/i);
  assert.doesNotMatch(joined, /\bpayable\b/i);
  assert.doesNotMatch(joined, /pZEC is (?:native ZEC|live|a live)/i);
  assert.doesNotMatch(joined, /lists USDT0/i);
  assert.doesNotMatch(joined, /USDT0 is (?:listed|live)/i);
  const architecture = await readFile(join(root, "src/components/architecture-panel.tsx"), "utf8");
  assert.match(architecture, /Native settlement target/);
  assert.match(architecture, /The matcher is not trustless/);
  assert.doesNotMatch(architecture, /wallet-signed native-ZEC atomic settlement/);
  assert.doesNotMatch(architecture, /Onchain atomic settlement/);
});

test("operational UI does not use simulation, fixture, or walkthrough vocabulary", async () => {
  const files = await operationalUiFiles();
  assert.ok(files.some((file) => file.endsWith("landing-copy.ts")));
  assert.ok(files.some((file) => file.endsWith("preview-education.tsx")));
  assert.equal(files.some((file) => /legal[\\/]page\.tsx$/.test(file)), false);
  assert.equal(files.some((file) => /security[\\/]page\.tsx$/.test(file)), false);
  assert.equal(files.some((file) => /status[\\/]page\.tsx$/.test(file)), false);
  assert.equal(files.some((file) => file.endsWith("architecture-panel.tsx")), false);
  const source = withoutArchitectureFooterSentences(
    withoutHonestNegation(
      (await Promise.all(files.map((file) => readFile(file, "utf8")))).join("\n"),
    ),
  );
  const joined = [...source.matchAll(/(['"`])(?:\\.|(?!\1)[^\\])*\1/g)].map((match) => match[0]).join("\n");
  assert.doesNotMatch(joined, /\bsimulation\b/i);
  assert.doesNotMatch(joined, /\bsimulator\b/i);
  assert.doesNotMatch(joined, /\bfixture\b/i);
  assert.doesNotMatch(joined, /\bno-value\b/i);
  assert.doesNotMatch(joined, /\binspect\b/i);
  assert.doesNotMatch(joined, /\bwalkthrough\b/i);
  assert.doesNotMatch(joined, /\bpreview-only\b/i);
  assert.doesNotMatch(joined, /\billustrative fixture\b/i);
});

test("shipped modules carry the pre-launch product vocabulary", async () => {
  const landingCopy = await readFile(join(root, "src/lib/landing-copy.ts"), "utf8");
  const landing = await readFile(join(root, "src/components/landing-page.tsx"), "utf8");
  const header = await readFile(join(root, "src/components/landing-header.tsx"), "utf8");
  const frame = await readFile(join(root, "src/components/site-chrome.tsx"), "utf8");
  const terminal = await readFile(join(root, "src/components/trading-terminal.tsx"), "utf8");
  const ticket = await readFile(join(root, "src/components/trade-ticket.tsx"), "utf8");
  const session = await readFile(join(root, "src/lib/session.ts"), "utf8");
  const review = await readFile(join(root, "src/lib/review-copy.ts"), "utf8");
  const liquidity = await readFile(join(root, "src/components/liquidity-panel.tsx"), "utf8");
  const chip = await readFile(join(root, "src/lib/preview-chip.ts"), "utf8");
  const reviewComplete = await readFile(join(root, "src/lib/ticket-review-copy.ts"), "utf8");
  const settlementCopy = await readFile(join(root, "src/lib/settlement-ticket-copy.ts"), "utf8");
  const solverQuotes = await readFile(join(root, "src/lib/solver-quotes.ts"), "utf8");
  const product = [
    landingCopy,
    landing,
    header,
    frame,
    terminal,
    ticket,
    session,
    review,
    liquidity,
    chip,
    reviewComplete,
    settlementCopy,
    solverQuotes,
  ].join("\n");
  assert.match(product, /Native ZEC\. Native stables\. No platform balance\./);
  assert.match(product, /Public preview · illustrative data · no mainnet funds/);
  assert.match(product, /Open terminal/);
  assert.match(product, /Nothing was signed or submitted\./);
  assert.match(product, /solver quote/i);
  assert.match(product, /risk/i);
  assert.doesNotMatch(product, /Enter simulation/);
  assert.match(terminal, /PRODUCT_NAV/);
  assert.match(terminal, /SiteFooter/);
  assert.doesNotMatch(terminal, /24h volume/);
  assert.match(liquidity, /historical-amm/);
  assert.match(await readFile(join(root, "src/lib/fees.ts"), "utf8"), /Not deducted in this preview/);
  assert.doesNotMatch(await readFile(join(root, "src/lib/fees.ts"), "utf8"), /simulation/);
  const walletBar = await readFile(join(root, "src/components/wallet-bar.tsx"), "utf8");
  assert.match(walletBar, /discoverEip6963Providers/);
  assert.match(walletBar, /connectMainnetWallet/);
  assert.match(walletBar, /Ethereum Mainnet/);
  assert.doesNotMatch(walletBar, /walletOffTitle|walletConnectEnabled|Sepolia/);
  assert.match(await readFile(join(root, "src/components/site-footer.tsx"), "utf8"), /Phlebas is not a live exchange and not an offer of financial services/);
});

test("status payload cannot be read as live funds or custody", async () => {
  const statusRoute = await readFile(join(root, "src/app/api/status/route.ts"), "utf8");
  assert.match(statusRoute, /Response\.json\(previewStatus\(\)/);
  const status = previewStatus();
  assert.equal(status.liveFunds, false);
  assert.equal(status.mode, "preview");
  assert.equal(status.custody, "none");
  assert.equal(status.contracts, "conditional-lock-undeployed");
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
  assert.match(statusPage, /title="Status"/);
  assert.match(statusPage, /No live funds or custody/);
  assert.match(statusPage, /This preview does not accept funds/);
  assert.match(statusPage, /No mainnet funds/);
  assert.match(statusPage, /labeled historical-state demonstrations/);
  assert.match(statusPage, /not an incident feed/);
  assert.doesNotMatch(statusPage, /is audited/);
  assert.doesNotMatch(statusPage, /Simulation status/);
  assert.doesNotMatch(statusPage, /no-value interface/);
});

test("landing and terminal banners stay a public preview", async () => {
  const landing = await readFile(join(root, "src/components/landing-page.tsx"), "utf8");
  const terminal = await readFile(join(root, "src/components/trading-terminal.tsx"), "utf8");
  const chip = await readFile(join(root, "src/lib/preview-chip.ts"), "utf8");
  const hero = await readFile(join(root, "src/lib/landing-copy.ts"), "utf8");
  assert.match(chip, /Public preview · illustrative data · no mainnet funds/);
  assert.match(hero, /Native ZEC\. Native stables\. No platform balance\./);
  assert.match(hero, /Open terminal/);
  assert.match(landing, /PreviewChip/);
  assert.match(landing, /LANDING_HERO/);
  assert.doesNotMatch(landing, /Simulation only/);
  assert.doesNotMatch(landing, /Simulation disclosure/);
  assert.doesNotMatch(landing, /Enter simulation/);
  assert.match(landing, /id="settlement-how"/);
  assert.match(landing, /id="why-not-wrapped"/);
  assert.match(landing, /id="paths"/);
  assert.match(await readFile(join(root, "src/components/site-chrome.tsx"), "utf8"), /PreviewChip/);
  assert.doesNotMatch(await readFile(join(root, "src/components/site-chrome.tsx"), "utf8"), /Simulation disclosure/);
  assert.match(await readFile(join(root, "src/components/terminal-loading.tsx"), "utf8"), /PreviewChip/);
  assert.doesNotMatch(await readFile(join(root, "src/components/terminal-loading.tsx"), "utf8"), /Simulation disclosure/);
  assert.match(chip, /no mainnet funds/);
  assert.match(await readFile(join(root, "src/components/site-footer.tsx"), "utf8"), /Phlebas is not a live exchange and not an offer of financial services/);
  assert.doesNotMatch(await readFile(join(root, "src/components/site-footer.tsx"), "utf8"), /GitHub/);
  assert.doesNotMatch(await readFile(join(root, "src/app/trade/page.tsx"), "utf8"), /Trading simulation/);
  assert.doesNotMatch(await readFile(join(root, "src/app/liquidity/page.tsx"), "utf8"), /Liquidity simulation/);
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
    /aa1bdf8c7374fd894cad16abede66833f88629a057d820c3c8526a2962f8b969/,
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
  assert.match(await readFile(join(root, "src/components/bridge-panel.tsx"), "utf8"), /Historical ZEC state tour/);
  assert.doesNotMatch(await readFile(join(root, "src/components/bridge-panel.tsx"), "utf8"), /ZEC to pZEC/);
  assert.doesNotMatch(await readFile(join(root, "src/components/bridge-panel.tsx"), "utf8"), /pZEC/);
  assert.doesNotMatch(await readFile(join(root, "src/lib/gateway-incidents.ts"), "utf8"), /pZEC/);
  assert.match(await readFile(join(root, "src/lib/ticket-review-copy.ts"), "utf8"), /It is not live settlement/);
  assert.match(await readFile(join(root, "src/components/trade-ticket.tsx"), "utf8"), /ticketReviewNoticeCopy/);
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
  const skipCopy = await readFile(join(root, "src/lib/landing-copy.ts"), "utf8");
  assert.match(skipCopy, /Native ZEC\. Native stables\. No platform balance\./);
  assert.match(skipCopy, /matcher never holds the assets/);
  assert.match(skipCopy, /Open terminal/);
  assert.match(skipCopy, /How settlement works/);
  assert.match(skipCopy, /Nothing here can be bought, sold, deposited, withdrawn, or redeemed/);
  assert.match(skipCopy, /USDT0 is abandoned/);
  assert.match(skipCopy, /No pZEC/);
  assert.match(skipCopy, /Skip to markets/);
  assert.match(skipCopy, /Skip to settlement/);
  assert.match(skipCopy, /Skip to why not wrapped/);
  assert.doesNotMatch(skipCopy, /Skip to pZEC/);
  assert.doesNotMatch(skipCopy, /Skip to evidence/);
  assert.doesNotMatch(skipCopy, /Skip to native pairs/);
  assert.match(skipCopy, /Skip to terminal preview/);
  assert.match(skipCopy, /Skip to paths/);
  assert.doesNotMatch(skipCopy, /Skip to journeys/);
  assert.doesNotMatch(skipCopy, /Skip to launch gates/);
  assert.doesNotMatch(landing, /zips\.z\.cash\/zip-0320/);
  assert.doesNotMatch(landing, /pZEC (?:is|equals|represents) native ZEC/i);
  assert.doesNotMatch(withoutHonestBridgeNegation(landing), /trustless bridge/i);
  assert.doesNotMatch(withoutHonestBridgeNegation(terminal), /trustless bridge/i);
  assert.match(chip, /no mainnet funds/);
  const walletBar = await readFile(join(root, "src/components/wallet-bar.tsx"), "utf8");
  assert.match(walletBar, /Wallet connection rejection/);
  assert.match(walletBar, /discoverEip6963Providers/);
  assert.match(walletBar, /connectMainnetWallet/);
  assert.match(walletBar, /Ethereum Mainnet/);
  assert.match(await readFile(join(root, "src/lib/settlement-ticket-copy.ts"), "utf8"), /not trustless/);
  assert.match(await readFile(join(root, "src/components/trade-ticket.tsx"), "utf8"), /custodyRedemptionCopy/);
  assert.match(await readFile(join(root, "src/components/trade-ticket.tsx"), "utf8"), /publicLinkabilityCopy/);
  assert.match(await readFile(join(root, "src/components/trade-ticket.tsx"), "utf8"), /marketOrderConstraintCopy/);
  assert.match(await readFile(join(root, "src/components/trade-ticket.tsx"), "utf8"), /publicLinkabilityCopy\("fill"\)/);
  assert.match(await readFile(join(root, "src/lib/ticket-review-copy.ts"), "utf8"), /publicLinkabilityCopy\("fill"\)/);
  assert.match(await readFile(join(root, "src/components/trade-ticket.tsx"), "utf8"), /Review custody notice/);
  assert.match(await readFile(join(root, "src/components/trade-ticket.tsx"), "utf8"), /feeEnvelopeCopy/);
  assert.match(await readFile(join(root, "src/components/trade-ticket.tsx"), "utf8"), /ticketReviewRows/);
  assert.match(await readFile(join(root, "src/lib/ticket-review-copy.ts"), "utf8"), /ticketReviewCompleteCopy/);
  assert.match(await readFile(join(root, "src/components/trade-ticket.tsx"), "utf8"), /setNotice\(result\)/);
  assert.match(await readFile(join(root, "src/components/trade-ticket.tsx"), "utf8"), /ticketReviewFeeCopy/);
  assert.match(await readFile(join(root, "src/lib/order.ts"), "utf8"), /no unbounded market instruction/);
  assert.doesNotMatch(await readFile(join(root, "src/lib/order.ts"), "utf8"), /pZEC/);
  assert.match(await readFile(join(root, "src/components/trade-ticket.tsx"), "utf8"), /parseExpiryUnix/);
  assert.match(await readFile(join(root, "src/components/trade-ticket.tsx"), "utf8"), /Order expiry unix time/);
  assert.match(await readFile(join(root, "src/components/architecture-panel.tsx"), "utf8"), /No local operator service is hosted on Vercel/);
  assert.match(await readFile(join(root, "src/components/architecture-panel.tsx"), "utf8"), /id="honesty-bar"/);
  assert.match(await readFile(join(root, "src/components/architecture-panel.tsx"), "utf8"), /id="architecture-layers"/);
  assert.match(await readFile(join(root, "src/components/architecture-panel.tsx"), "utf8"), /The matcher is not trustless/);
  assert.match(await readFile(join(root, "src/components/architecture-panel.tsx"), "utf8"), /How settlement works/);
  assert.match(await readFile(join(root, "src/components/architecture-panel.tsx"), "utf8"), /href="\/#launch-gates"/);
  assert.doesNotMatch(await readFile(join(root, "src/components/architecture-panel.tsx"), "utf8"), /LANDING_MAINNET_GATES/);
  assert.match(await readFile(join(root, "src/components/country-block.tsx"), "utf8"), /id="country-block"/);
  assert.match(await readFile(join(root, "src/components/country-block.tsx"), "utf8"), /shareable preview of a blocked location/);
  assert.match(await readFile(join(root, "src/components/incident-demo.tsx"), "utf8"), /Selected incident demonstration/);
  assert.doesNotMatch(landing, /is audited/);
  assert.doesNotMatch(terminal, /is audited/);
  const bridge = await readFile(join(root, "src/components/bridge-panel.tsx"), "utf8");
  assert.match(bridge, /Historical withdrawal states only/);
  assert.match(bridge, /Historical deposit states only/);
  assert.match(bridge, /WITHDRAWAL_TOUR/);
  assert.match(bridge, /nextGatewayJourney/);
  assert.match(bridge, /interpretRovingKey/);
  assert.match(bridge, /payoutClaimForTourStep/);
  assert.match(bridge, /payoutClaimStubCopy/);
  assert.match(bridge, /Nothing is sent/);
  assert.doesNotMatch(bridge, /gatewayOffCopy/);
  assert.doesNotMatch(bridge, /gatewayUnavailableCopy/);
  assert.doesNotMatch(bridge, /gatewayIssuingCopy/);
  assert.match(await readFile(join(root, "src/lib/withdrawal-tour.ts"), "utf8"), /does not invent a payout/);
  assert.match(bridge, /Nothing is sent/);
  assert.match(bridge, /id="privacy-callouts"/);
  assert.match(bridge, /does not provide shielded deposits/);
  assert.match(bridge, /id="destination-inspector"/);
  assert.match(bridge, /PlaceholderQr/);
  assert.doesNotMatch(bridge, /copyUri/);
  assert.match(bridge, /Not payable/);
  assert.match(terminal, /feedSurface/);
  assert.match(terminal, /PRODUCT_NAV/);
  assert.match(terminal, /nextMarketId/);
  assert.match(terminal, /nextFeedStatus/);
  assert.match(terminal, /interpretRovingKey/);
  assert.match(terminal, /role="radiogroup"/);
  assert.match(terminal, /Skip to order ticket/);
  assert.match(terminal, /Skip to price chart/);
  assert.match(terminal, /Skip to order book/);
  assert.match(terminal, /Skip to recent trades/);
  assert.match(terminal, /Skip to incident demonstration/);
  assert.match(terminal, /Skip to honesty bar/);
  assert.match(terminal, /Skip to architecture layers/);
  assert.match(terminal, /Skip to quote pairs/);
  assert.match(terminal, /Skip to quote risks/);
  assert.match(terminal, /Skip to destination inspector/);
  assert.match(terminal, /Skip to privacy callouts/);
  assert.match(terminal, /Skip to country-block notice/);
  assert.match(await readFile(join(root, "src/components/incident-demo.tsx"), "utf8"), /id="incident-demonstration"/);
  assert.match(await readFile(join(root, "src/components/price-chart.tsx"), "utf8"), /chartDisplayGeometry/);
  assert.match(await readFile(join(root, "src/components/price-chart.tsx"), "utf8"), /Chart empty state/);
  assert.match(await readFile(join(root, "src/lib/chart-display.ts"), "utf8"), /display exception/);
  assert.match(await readFile(join(root, "src/components/order-book.tsx"), "utf8"), /id="order-book"/);
  assert.match(terminal, /id="recent-trades"/);
  assert.match(await readFile(join(root, "src/components/site-footer.tsx"), "utf8"), /Launch gates/);
  assert.match(await readFile(join(root, "src/components/site-chrome.tsx"), "utf8"), /SiteFooter/);
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
  assert.match(landingCss, /outline: 2px solid var\(--accent-fg\)/);
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
  assert.match(terminalCss, /max-height: calc\(100vh - min\(40vh, 17\.5rem\) - 16px\)/);
  assert.match(terminalCss, /\.educationDialog \.tourNav \{[\s\S]*?position: sticky;/);
  assert.match(terminalCss, /scroll-padding-top: 12px;/);
  assert.match(terminalCss, /scroll-padding-bottom: 12px;/);
  assert.match(terminalCss, /\.educationDialog h2 \{[\s\S]*?scroll-margin-top: 12px;/);
  assert.match(terminalCss, /\.educationDialog \.tourNav button \{[\s\S]*?flex-shrink: 0;/);
  assert.match(terminalCss, /\.educationDialog \.tourNav button:disabled \{[\s\S]*?min-height: 44px;/);
  assert.match(terminalCss, /padding-bottom: 8px;/);
  assert.match(terminalCss, /flex-direction: column;/);
  assert.match(terminalCss, /margin-top: auto;/);
  assert.match(terminalCss, /outline: 2px solid var\(--accent-fg\);/);
  assert.match(terminalCss, /padding-top: 24px;/);
  assert.match(terminalCss, /z-index: 2;/);
  assert.match(terminalCss, /\.educationDialog h2 \{[\s\S]*?overflow: visible;/);
  assert.match(terminalCss, /\.educationDialog h2 \{[\s\S]*?min-height: 44px;/);
  assert.match(terminalCss, /\.educationDialog h2 \{[\s\S]*?min-width: 44px;/);
  assert.match(terminalCss, /\.educationDialog h2 \{[\s\S]*?display: flex;/);
  assert.match(terminalCss, /\.educationDialog h2 \{[\s\S]*?align-items: center;/);
  assert.match(terminalCss, /\.educationDialog h2 \{[\s\S]*?box-sizing: border-box;/);
  assert.match(
    terminalCss,
    /\.educationDialog h2 \{\r?\n  display: flex;\r?\n  align-items: center;\r?\n  box-sizing: border-box;\r?\n  min-width: 44px;\r?\n  min-height: 44px;/,
  );
  assert.match(terminalCss, /\.educationDialog \{[\s\S]*?overflow: visible;/);
  assert.match(terminalCss, /\.educationDialog \{[\s\S]*?box-sizing: border-box;/);
  assert.match(terminalCss, /padding: 24px 22px 18px;/);
  assert.match(
    terminalCss,
    /\.educationDialog \.tourNav \{\r?\n  box-sizing: border-box;\r?\n  display: flex;\r?\n  align-items: center;\r?\n  width: 100%;\r?\n  min-width: 0;\r?\n  max-width: 100%;\r?\n  min-height: 44px;\r?\n  flex-shrink: 0;/,
  );
  assert.match(terminalCss, /\.educationDialog \{[\s\S]*?scroll-padding-top: 12px;/);
  assert.match(terminalCss, /padding-bottom: 12px;/);
  assert.match(terminalCss, /max-height: calc\(100vh - 32px\)/);
  assert.match(terminalCss, /max-width: 820px\) and \(max-height: 700px\)/);
  assert.match(terminalCss, /margin-top: min\(24vh, 8rem\)/);
  assert.match(terminalCss, /\.educationDialog \.tourNav \{[\s\S]*?overflow: visible;/);
  assert.match(terminalCss, /\.educationDialog \.tourNav \{[\s\S]*?padding: 12px;/);
  assert.match(terminalCss, /\.educationDialog \.tourNav \{[\s\S]*?box-sizing: border-box;/);
  assert.match(terminalCss, /\.educationDialog \.tourNav \{[\s\S]*?width: 100%;/);
  assert.match(terminalCss, /\.educationDialog \.tourNav button \{[\s\S]*?box-sizing: border-box;/);
  assert.match(terminalCss, /\.simpleMain a \{[\s\S]*?flex-shrink: 0;/);
  assert.match(terminalCss, /\.simpleMain a \{[\s\S]*?box-sizing: border-box;/);
  assert.match(terminalCss, /\.tourNav a \{[\s\S]*?box-sizing: border-box;/);
  assert.match(terminalCss, /\.educationDialog \{[\s\S]*?padding-bottom: 8px;/);
  assert.match(terminalCss, /min-width: 44px;\s*flex-shrink: 0;/);
  assert.match(terminalCss, /\.skipLink:last-child \{[\s\S]*?min-width: 44px;/);
  assert.match(landingCss, /\.skipLink:last-child \{[\s\S]*?min-width: 44px;/);
  assert.match(
    terminalCss,
    /\.skipLink:last-child \{\r?\n  box-sizing: border-box;\r?\n  min-width: 44px;\r?\n  min-height: 44px;\r?\n  flex-shrink: 0;/,
  );
  assert.match(
    landingCss,
    /\.skipLink:last-child \{\r?\n  box-sizing: border-box;\r?\n  min-width: 44px;\r?\n  min-height: 44px;\r?\n  flex-shrink: 0;/,
  );
  assert.match(terminalCss, /\.skipLink:last-child \{[\s\S]*?flex-shrink: 0;/);
  assert.match(landingCss, /\.skipLink:last-child \{[\s\S]*?flex-shrink: 0;/);
  assert.match(terminalCss, /\.skipLink:last-child:nth-child\(odd\) \{[\s\S]*?flex-shrink: 0;/);
  assert.match(landingCss, /\.skipLink:last-child:nth-child\(odd\) \{[\s\S]*?flex-shrink: 0;/);
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
  assert.match(await readFile(join(root, "src/app/status/page.tsx"), "utf8"), /role="list" aria-label="Status ledger"/);
  assert.match(await readFile(join(root, "src/lib/copy-uri.ts"), "utf8"), /Nothing was sent/);
  assert.match(await readFile(join(root, "src/lib/ticket-shortcuts.ts"), "utf8"), /reviewOpen/);
  const liquidity = await readFile(join(root, "src/components/liquidity-panel.tsx"), "utf8");
  assert.match(liquidity, /aria-errormessage/);
  assert.match(liquidity, /amountErrorId/);
  assert.match(liquidity, /id="pool-stats"/);
  assert.match(liquidity, /Historical pool size/);
  assert.doesNotMatch(liquidity, /Historical pool volume/);
  assert.match(liquidity, /Retry illustrative feed/);
  assert.match(liquidity, /emptyShareCopy\(selectedPool\.id\)/);
  assert.match(await readFile(join(root, "src/lib/lp.ts"), "utf8"), /No session LP shares/);
  assert.match(liquidity, /not a return or profit projection/i);
  assert.match(liquidity, /feeEnvelopeCopy/);
  assert.match(liquidity, /Complete \{review\.kind\}/);
  assert.match(liquidity, /custodyRedemptionCopy/);
  assert.match(liquidity, /publicLinkabilityCopy/);
  assert.match(liquidity, /lpRiskCopy/);
  assert.match(liquidity, /lpFeedBlockCopy/);
  assert.match(liquidity, /lpEmptyBookCopy/);
  assert.doesNotMatch(liquidity, /adverse selection/);
  assert.match(liquidity, /publicly linkable/);
  assert.match(liquidity, /Review custody notice/);
  assert.match(liquidity, /Review mint/);
  assert.match(liquidity, /nextFeedStatus/);
  assert.match(liquidity, /interpretRovingKey/);
  assert.match(liquidity, /id="liquidity-pools"/);
  assert.match(
    await readFile(join(root, "src/lib/preview-education.ts"), "utf8"),
    /not live settlement, not shielded, not a trustless bridge/i,
  );
  assert.match(await readFile(join(root, "src/components/preview-education.tsx"), "utf8"), /Education copy/);
  assert.match(await readFile(join(root, "src/components/preview-education.tsx"), "utf8"), /Education, not consent/);
  assert.match(landing, /LANDING_STATUS_DETAILS/);
  assert.match(landing, /LANDING_LEDGER_HEADING/);
  assert.match(landing, /SiteFooter/);
  assert.match(await readFile(join(root, "src/components/site-footer.tsx"), "utf8"), /label: "Legal"/);
  assert.match(landing, /LANDING_PATHS_INTRO/);
  assert.match(landing, /role="listitem"/);
  assert.match(landing, /LANDING_GATES_INTRO/);
  assert.match(landing, /LANDING_GATES_SUMMARY/);
  assert.match(
    await readFile(join(root, "src/components/landing-journeys.tsx"), "utf8"),
    /styles.journeyList\} role="list" aria-label=\{LANDING_PATHS_INTRO.eyebrow\}/,
  );
  assert.doesNotMatch(landing, /github.com/);
  const journeys = await readFile(join(root, "src/lib/landing-journeys.ts"), "utf8");
  assert.match(journeys, /tab: "Trade"/);
  assert.match(journeys, /tab: "Provide quotes"/);
  assert.match(journeys, /tab: "Read settlement"/);
  assert.match(journeys, /href: "\/trade\?view=trade"/);
  assert.match(journeys, /href: "\/liquidity"/);
  assert.match(journeys, /href: "\/trade\?view=settlement"/);
  assert.doesNotMatch(journeys, /id: "deposit"/);
  assert.doesNotMatch(journeys, /id: "withdrawal"/);
  assert.doesNotMatch(journeys, /href: "\/trade\?view=bridge"/);
  assert.doesNotMatch(journeys, /^Deposit ZEC$/m);
  const evidence = await readFile(join(root, "src/lib/landing-evidence.ts"), "utf8");
  assert.match(evidence, /No pZEC/);
  assert.match(evidence, /No mint/);
  assert.match(evidence, /No omnibus/);
  assert.match(evidence, /No shared LP token/);
  assert.match(evidence, /Solvers keep inventory in their own wallets/);
  const gates = await readFile(join(root, "src/lib/landing-gates.ts"), "utf8");
  assert.match(gates, /Not cleared/);
  assert.match(gates, /USDT0 is abandoned/);
  assert.doesNotMatch(gates, /waitlist/i);
  assert.doesNotMatch(gates, /separate later gate/i);
  const preview = await readFile(join(root, "src/components/landing-terminal-preview.tsx"), "utf8");
  assert.match(preview, /LANDING_TERMINAL_PREVIEW.chip/);
  assert.match(preview, /LANDING_TERMINAL_PREVIEW.bound/);
  assert.match(preview, /formatAtomicUnits\(market\.lastTicks/);
  assert.doesNotMatch(preview, /Fixture \{formatAtomicUnits/);
  assert.doesNotMatch(preview, /Fixture price/);
  assert.doesNotMatch(preview, /Fixture size ZEC/);
  assert.doesNotMatch(preview, />Simulation</);
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
  const tradeTicket = await readFile(join(root, "src/components/trade-ticket.tsx"), "utf8");
  assert.match(tradeTicket, /market\.settlementPair/);
  assert.match(tradeTicket, /retargetSettlementCopy/);
  assert.match(tradeTicket, /isTicketRejectCopy/);
  assert.doesNotMatch(tradeTicket, /missingProviderCopy|isMissingProviderCopy/);
  assert.doesNotMatch(tradeTicket, /sendSettlement|planTestnetSubmit|sepoliaSubmitEnabled/);
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
  assert.match(await readFile(join(root, "src/app/legal/page.tsx"), "utf8"), /SITE_FOOTER_SENTENCE/);
  assert.doesNotMatch(await readFile(join(root, "src/app/legal/page.tsx"), "utf8"), /protocol preview/);
  assert.doesNotMatch(await readFile(join(root, "src/app/legal/page.tsx"), "utf8"), /simulation legal boundary/);
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
  assert.match(await readFile(join(root, "src/app/trade/page.tsx"), "utf8"), /TerminalLoading/);
  assert.match(await readFile(join(root, "src/components/terminal-loading.tsx"), "utf8"), /aria-label="Withheld-price notice"/);
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
  assert.match(globalError, /width: 100%/);
  assert.match(globalError, /flex: 1 1 calc\(50% - 4px\)/);
  assert.match(globalError, /outline: 2px solid #03121b/);
  assert.match(globalError, /a:last-child/);
  assert.match(globalError, /flex-shrink: 0/);
  assert.doesNotMatch(globalError, /is a live exchange/);
  assert.doesNotMatch(await readFile(join(root, "src/app/legal/page.tsx"), "utf8"), /is audited/);
  const education = await readFile(join(root, "src/lib/preview-education.ts"), "utf8");
  assert.match(education, /This public preview uses illustrative data/);
  assert.match(education, /Ethereum Mainnet wallet can connect for identity/);
  assert.match(education, /does not sign or submit a transaction/);
  assert.match(education, /Pairs are native ZEC against USDC and USDT/);
  assert.match(education, /not live settlement/i);
  assert.match(education, /Actions stay in this browser/);
  assert.match(education, /Contracts are not deployed/);
  assert.match(education, /no signing, submission, or asset movement is enabled/);
  assert.doesNotMatch(education, /pZEC would depend on custody/);
  assert.doesNotMatch(education, /I agree/);
  assert.doesNotMatch(education, /Enter simulation/);
  assert.doesNotMatch(education, /\bsimulation\b/i);
  assert.match(await readFile(join(root, "src/components/preview-education.tsx"), "utf8"), /Education, not consent/);
  assert.match(await readFile(join(root, "src/lib/access-demo.ts"), "utf8"), /State demonstration/);
  assert.doesNotMatch(await readFile(join(root, "src/lib/access-demo.ts"), "utf8"), /geolocat/i);
  assert.match(await readFile(join(root, "src/lib/ticket-shortcuts.ts"), "utf8"), /dialogOpen/);
  assert.match(await readFile(join(root, "src/components/trade-ticket.tsx"), "utf8"), /interpretTicketKey/);
  assert.match(await readFile(join(root, "src/lib/deposit-tour.ts"), "utf8"), /No address is generated/);
  assert.match(await readFile(join(root, "src/components/incident-demo.tsx"), "utf8"), /State demonstration/);
  assert.doesNotMatch(await readFile(join(root, "src/lib/gateway-incidents.ts"), "utf8"), /\blive outage\b/i);
  assert.match(await readFile(join(root, "src/app/status/page.tsx"), "utf8"), /Architecture incident demonstrations/);
  assert.match(await readFile(join(root, "src/app/status/page.tsx"), "utf8"), /demo=incidents/);
  assert.match(await readFile(join(root, "src/app/status/page.tsx"), "utf8"), /not a live outage/);
  assert.match(await readFile(join(root, "src/components/incident-demo.tsx"), "utf8"), /architecture-demonstration/);
  assert.match(await readFile(join(root, "src/lib/ticket-shortcuts.ts"), "utf8"), /reviewOpen/);
  assert.match(await readFile(join(root, "src/lib/lp.ts"), "utf8"), /emptyShareCopy/);
  assert.match(await readFile(join(root, "src/components/liquidity-panel.tsx"), "utf8"), /emptyShareCopy\(selectedPool\.id\)/);
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
  assert.doesNotMatch(vercel, /PHLEBAS_MATCHER_URL\s*[:=]/);
  assert.doesNotMatch(vercel, /PHLEBAS_MATCHER_(?:USDC|USDT)_URL\s*[:=]/);
});

test("secret scan rejects operator URLs in .env, vercel.json, and .vercel/", async () => {
  const dir = await mkdtemp(join(tmpdir(), "phlebas-secrets-"));
  try {
    await mkdir(join(dir, "scripts"));
    await copyFile(join(root, "scripts/scan-secrets.mjs"), join(dir, "scripts/scan-secrets.mjs"));
    await execFileAsync("git", ["init"], { cwd: dir });
    await execFileAsync("git", ["add", "-A"], { cwd: dir });

    const clean = await scanSecrets(dir);
    assert.equal(clean.code, 0);

    await writeFile(join(dir, ".env"), "PHLEBAS_GATEWAY_URL=http://127.0.0.1:8787\n");
    await execFileAsync("git", ["add", "-A"], { cwd: dir });
    const envHit = await scanSecrets(dir);
    assert.notEqual(envHit.code, 0);
    assert.match(`${envHit.stdout}${envHit.stderr}`, /vercel-operator-gateway/);
    await rm(join(dir, ".env"));

    await writeFile(join(dir, "vercel.json"), "{\n  env: { PHLEBAS_MATCHER_URL: \"http://127.0.0.1:8788\" }\n}\n");
    await execFileAsync("git", ["add", "-A"], { cwd: dir });
    const vercelHit = await scanSecrets(dir);
    assert.notEqual(vercelHit.code, 0);
    assert.match(`${vercelHit.stdout}${vercelHit.stderr}`, /vercel-operator-matcher/);
    await rm(join(dir, "vercel.json"));

    await writeFile(join(dir, ".env"), "PHLEBAS_MATCHER_USDT_URL=http://127.0.0.1:8789\n");
    await execFileAsync("git", ["add", "-A"], { cwd: dir });
    const marketMatcherHit = await scanSecrets(dir);
    assert.notEqual(marketMatcherHit.code, 0);
    assert.match(`${marketMatcherHit.stdout}${marketMatcherHit.stderr}`, /vercel-operator-market-matcher/);
    await rm(join(dir, ".env"));

    await mkdir(join(dir, ".vercel"));
    await writeFile(join(dir, ".vercel", "project.json"), "PHLEBAS_GATEWAY_URL=http://example.com:8787\n");
    await execFileAsync("git", ["add", "-A"], { cwd: dir });
    const vercelDirHit = await scanSecrets(dir);
    assert.notEqual(vercelDirHit.code, 0);
    assert.match(`${vercelDirHit.stdout}${vercelDirHit.stderr}`, /vercel-operator-gateway/);
    await rm(join(dir, ".vercel"), { recursive: true, force: true });

    await writeFile(
      join(dir, "readme.md"),
      "PHLEBAS_GATEWAY_URL=http://example.com\nPHLEBAS_MATCHER_URL=http://example.com\nPHLEBAS_MATCHER_USDC_URL=http://example.com\n",
    );
    await execFileAsync("git", ["add", "-A"], { cwd: dir });
    const ignored = await scanSecrets(dir);
    assert.equal(ignored.code, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("Open Graph and Twitter cards stay labeled as a public preview", async () => {
  const layout = await readFile(join(root, "src/app/layout.tsx"), "utf8");
  assert.match(layout, /Public preview of a non-custodial protocol plan/);
  assert.match(layout, /Illustrative data/);
  assert.match(layout, /No mainnet funds/);
  assert.match(layout, /openGraph:/);
  assert.match(layout, /twitter:/);
  assert.match(layout, /index: false/);
  assert.doesNotMatch(layout, /is a live exchange/);
  assert.doesNotMatch(layout, /is audited/);
  assert.doesNotMatch(layout, /payable|shielded|native-ZEC/);
});

test("route loading copy withholds prices and does not claim a live market", async () => {
  const loading = await readFile(join(root, "src/components/terminal-loading.tsx"), "utf8");
  assert.match(loading, /id="withheld-price"/);
  assert.match(loading, /Skip to withheld-price notice/);
  assert.match(loading, /No market data is live/);
  assert.match(loading, /Nothing was submitted/);
  assert.doesNotMatch(loading, /APY|wallet balance|tex1/i);
  assert.match(await readFile(join(root, "src/app/trade/loading.tsx"), "utf8"), /TerminalLoading/);
  assert.match(await readFile(join(root, "src/app/liquidity/loading.tsx"), "utf8"), /TerminalLoading/);
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

test("shipped UI CSS does not keep the retired gold accent", async () => {
  const files = [
    join(root, "src/app/globals.css"),
    join(root, "src/components/landing.module.css"),
    join(root, "src/components/terminal.module.css"),
    join(root, "src/app/global-error.tsx"),
  ];
  const joined = (await Promise.all(files.map((file) => readFile(file, "utf8")))).join("\n");
  assert.doesNotMatch(joined, /#f4c95d/i);
  assert.doesNotMatch(joined, /244\s*,\s*201\s*,\s*93/);
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
  assert.match(journeys, /Those pairs are native ZEC against native USDC or native USDT/);
  assert.match(journeys, /must not claim live native-ZEC execution/);
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

test("journeys retire custodial state machines instead of promising live payout", async () => {
  const journeys = await readFile(join(root, "docs/LANDING_AND_USER_JOURNEYS.md"), "utf8");
  assert.match(journeys, /Retired custody-state reference/);
  assert.match(journeys, /not a production backlog/);
  assert.doesNotMatch(journeys, /Production-intent state machine/);
  assert.doesNotMatch(journeys, /\blive payout/i);
});

test("journeys forbid rebuilding wrapped-ZEC custody services", async () => {
  const journeys = await readFile(join(root, "docs/LANDING_AND_USER_JOURNEYS.md"), "utf8");
  assert.match(journeys, /Do not implement an address service, reserve ledger, wrapped-ZEC mint controller/);
  assert.match(journeys, /must not be used to build a burn queue, custody signer, payout claim/);
  assert.doesNotMatch(journeys, /The production address service/);
});

test("journeys bind the ZIP 321 fixture and destination inspector to non-payable local examples", async () => {
  const journeys = await readFile(join(root, "docs/LANDING_AND_USER_JOURNEYS.md"), "utf8");
  assert.match(journeys, /intentionally invalid `zcash:` URI-format example/);
  assert.match(journeys, /literal brace-delimited `\{TEX_ADDRESS\}` placeholder/);
  assert.match(journeys, /does not accept a real Zcash or EVM address as a deposit or payment input/);
  assert.match(journeys, /separate local destination inspector follows the format-only boundary/);
  assert.match(journeys, /must not persist or transmit the value/);
});

test("journeys route native withdrawals to user-controlled atomic settlement", async () => {
  const journeys = await readFile(join(root, "docs/LANDING_AND_USER_JOURNEYS.md"), "utf8");
  assert.match(journeys, /user-controlled refund or claim path of the atomic settlement/);
  assert.match(journeys, /evidence and timelock rules in ADR 0005/);
  assert.match(journeys, /No current UI action signs, broadcasts, or submits value/);
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
    "src/components/trade-ticket.tsx",
    "src/components/native-swap-panel.tsx",
    "src/components/settlement-ticket.tsx",
    "src/app/api/matcher/route.ts",
  ];
  for (const path of restrictedConsumers) {
    const source = await readFile(join(root, path), "utf8");
    assert.doesNotMatch(source, /swap-fill-projection|atomic-coordinator/, path);
  }
  const observerServer = await readFile(join(root, "services/atomic-swap-observer/server.ts"), "utf8");
  assert.match(observerServer, /diagnostic-untrusted/);
});
