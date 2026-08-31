import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { eip712DigestHex, sepoliaDomain, type TypedOrder } from "../../src/lib/eip712.ts";
import { createMatcherOperator, intakeSignedOrder, type MatcherOperator } from "../../src/lib/matcher-operator.ts";
import { readOperator, writeOperator } from "./persist.ts";

const ZERO = "0x0000000000000000000000000000000000000000";
const dataPath = join(dirname(fileURLToPath(import.meta.url)), ".data", "state.json");

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

function parseOrder(body: Record<string, unknown>): TypedOrder & { tif: "GTC" | "IOC" | "FOK"; signature: string } {
  return {
    maker: String(body.maker),
    side: Number(body.side) as 0 | 1,
    baseAsset: String(body.baseAsset),
    quoteAsset: String(body.quoteAsset),
    baseAmount: BigInt(String(body.baseAmount)),
    limitPriceTicks: BigInt(String(body.limitPriceTicks)),
    nonce: BigInt(String(body.nonce)),
    accountEpoch: BigInt(String(body.accountEpoch)),
    expiry: BigInt(String(body.expiry ?? "0")),
    salt: BigInt(String(body.salt ?? "1")),
    recipient: String(body.recipient),
    maximumFeeBps: Number(body.maximumFeeBps),
    allowedVenues: Number(body.allowedVenues),
    tif: (body.tif as "GTC" | "IOC" | "FOK") ?? "GTC",
    signature: String(body.signature),
  };
}

export function createMatcherService(verifyingContract = ZERO, lastTicks = 5291n): MatcherOperator {
  return createMatcherOperator(sepoliaDomain(verifyingContract), lastTicks);
}

export function startMatcher(options: { host?: string; port?: number; operator?: MatcherOperator; persistPath?: string } = {}) {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 8788;
  const persistPath = options.persistPath ?? dataPath;
  let operator = options.operator;

  const ready = (async () => {
    if (operator) return;
    operator = await readOperator(persistPath) ?? createMatcherService();
  })();

  const server = createServer((request, response) => {
    void (async () => {
      await ready;
      if (!operator) operator = createMatcherService();
      const url = new URL(request.url ?? "/", `http://${host}:${port}`);
      if (request.method === "GET" && url.pathname === "/health") {
        send(response, 200, { ok: true, sequence: operator.sequence, matcher: "local-operator", persist: persistPath });
        return;
      }
      if (request.method === "GET" && url.pathname === "/sequence") {
        send(response, 200, { sequence: operator.sequence, receipts: operator.receipts });
        return;
      }
      if (request.method === "GET" && url.pathname === "/book") {
        send(response, 200, operator.book);
        return;
      }
      if (request.method === "POST" && url.pathname === "/orders") {
        const order = parseOrder(await readJson(request));
        const digest = eip712DigestHex(operator.domain, order);
        const receipt = intakeSignedOrder(operator, order);
        if (receipt.digest !== digest) {
          send(response, 500, { ok: false, reason: "digest-mismatch" });
          return;
        }
        await writeOperator(persistPath, operator);
        send(response, 201, receipt);
        return;
      }
      send(response, 404, { ok: false, reason: "not-found" });
    })().catch((error: unknown) => {
      send(response, 400, { ok: false, reason: error instanceof Error ? error.message : "matcher-error" });
    });
  });

  server.listen(port, host);
  return server;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  startMatcher();
}
