import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";

import { attestMint, emptyMintLedger } from "../../src/lib/attestation.ts";
import { agreeObservations, parseStubObservation, type ObservedOutpoint } from "../../src/lib/observer.ts";

const bind = process.env.PHLEBAS_BIND ?? "127.0.0.1";
const port = Number(process.env.PHLEBAS_PORT ?? 8789);

function send(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body, (_key, value) => typeof value === "bigint" ? value.toString() : value));
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
  const host = options.host ?? bind;
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
