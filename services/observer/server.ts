import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";

import { attestMint, emptyMintLedger } from "../../src/lib/attestation.ts";
import { agreeObservations, parseStubObservation, type ObservedOutpoint } from "../../src/lib/observer.ts";
import { listenHost } from "../../src/lib/operator-url.ts";
import { calculateReserveCoverage, type ReserveCoverageState, type WithdrawalClaim } from "../../src/lib/reserve.ts";

const port = Number(process.env.PHLEBAS_PORT ?? 8789);

function send(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body, (_key, value) => typeof value === "bigint" ? value.toString() : value));
}

function asBigint(value: unknown, name: string): bigint {
  if (value === undefined || value === null || value === "") {
    throw new TypeError(`${name} is required`);
  }
  return BigInt(String(value));
}

function parseCoverageState(body: Record<string, unknown>): ReserveCoverageState {
  const claims = Array.isArray(body.withdrawalClaims) ? body.withdrawalClaims : [];
  const ids = Array.isArray(body.committedTransactionIds) ? body.committedTransactionIds.map(String) : [];
  return {
    controlledAssets: asBigint(body.controlledAssets, "controlledAssets"),
    tokenSupply: asBigint(body.tokenSupply, "tokenSupply"),
    depositEntitlements: asBigint(body.depositEntitlements ?? 0, "depositEntitlements"),
    withdrawalClaims: claims.map((row) => {
      const claim = row as Record<string, unknown>;
      return {
        claimId: String(claim.claimId),
        transactionId: String(claim.transactionId ?? ""),
        payable: asBigint(claim.payable, "payable"),
        status: claim.status as WithdrawalClaim["status"],
        selectedInput: asBigint(claim.selectedInput ?? 0, "selectedInput"),
        inTransitPrincipal: asBigint(claim.inTransitPrincipal ?? 0, "inTransitPrincipal"),
        inFlightChange: asBigint(claim.inFlightChange ?? 0, "inFlightChange"),
        networkFee: asBigint(claim.networkFee ?? 0, "networkFee"),
      };
    }),
    committedTransactionIds: ids,
    otherLiabilities: asBigint(body.otherLiabilities ?? 0, "otherLiabilities"),
    requiredBuffer: asBigint(body.requiredBuffer ?? 0, "requiredBuffer"),
  };
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

export function startObserver(options: { host?: string; port?: number } = {}) {
  const host = listenHost(options.host);
  const listenPort = options.port ?? port;
  const spent = emptyMintLedger();
  const server = createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? "/", `http://${host}:${listenPort}`);
      if (request.method === "GET" && url.pathname === "/health") {
        send(response, 200, { ok: true, network: "testnet", zebra: "stub", mint: "stub" });
        return;
      }
      if (request.method === "POST" && url.pathname === "/attest") {
        const body = await readJson(request);
        if (body.reserve && typeof body.reserve === "object") {
          const coverage = calculateReserveCoverage(parseCoverageState(body.reserve as Record<string, unknown>));
          if (!coverage.controlledCovered) {
            send(response, 400, { ok: false, reason: "reserve-uncovered", coverage });
            return;
          }
        }
        const rows = (Array.isArray(body.observations) ? body.observations : [body]) as Array<Record<string, unknown>>;
        const observations: ObservedOutpoint[] = rows.map((row) => parseStubObservation({
          txid: String(row.txid),
          vout: Number(row.vout),
          amountZatoshis: BigInt(String(row.amountZatoshis)),
          tex: String(row.tex),
          blockHeight: Number(row.blockHeight),
          blockHash: String(row.blockHash),
          tipHeight: Number(row.tipHeight),
          transparentInputsOnly: row.transparentInputsOnly !== false,
          transparentOutputsOnly: row.transparentOutputsOnly !== false,
          shieldedBundle: row.shieldedBundle === true,
        }));
        const agreed = agreeObservations(observations);
        send(response, 200, attestMint(agreed, spent));
        return;
      }
      if (request.method === "POST" && url.pathname === "/coverage") {
        const coverage = calculateReserveCoverage(parseCoverageState(await readJson(request)));
        send(response, 200, { ok: true, coverage });
        return;
      }
      send(response, 404, { ok: false, reason: "not-found" });
    })().catch((error: unknown) => {
      send(response, 400, { ok: false, reason: error instanceof Error ? error.message : "observer-error" });
    });
  });
  server.listen(listenPort, host);
  return server;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  startObserver();
}
