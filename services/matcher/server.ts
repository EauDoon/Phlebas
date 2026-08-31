import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { access, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { sepoliaDomain, timeInForceCode, type TypedOrder } from "../../src/lib/eip712.ts";
import {
  createMatcherOperator,
  intakeSignedOrder,
  restoreOperator,
  sequenceRoot,
  snapshotOperator,
  type MatcherOperator,
} from "../../src/lib/matcher-operator.ts";
import { listenHost } from "../../src/lib/operator-url.ts";
import { TESTNET } from "../../src/lib/testnet.ts";
import { atomicWriteFile } from "../durable-file.ts";
import { readOperator, writeOperator } from "./persist.ts";

const ZERO = "0x0000000000000000000000000000000000000000";
const dataPath = join(dirname(fileURLToPath(import.meta.url)), ".data", "state.json");

function send(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body, (_key, value) => typeof value === "bigint" ? value.toString() : value));
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += bytes.length;
    if (length > 64 * 1024) throw new RangeError("request-body-too-large");
    chunks.push(bytes);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

function parseOrder(body: Record<string, unknown>): TypedOrder & { tif: "GTC" | "IOC" | "FOK"; signature: string } {
  const tif = (body.tif as "GTC" | "IOC" | "FOK") ?? "GTC";
  return {
    maker: String(body.maker),
    side: Number(body.side) as 0 | 1,
    baseAsset: String(body.baseAsset),
    quoteAsset: String(body.quoteAsset),
    baseAmount: BigInt(String(body.baseAmount)),
    limitPriceTicks: BigInt(String(body.limitPriceTicks)),
    timeInForce: timeInForceCode(tif),
    nonce: BigInt(String(body.nonce)),
    accountEpoch: BigInt(String(body.accountEpoch)),
    expiry: BigInt(String(body.expiry ?? "0")),
    salt: BigInt(String(body.salt ?? "1")),
    recipient: String(body.recipient),
    maximumFeeBps: Number(body.maximumFeeBps),
    allowedVenues: Number(body.allowedVenues),
    tif,
    signature: String(body.signature),
  };
}

export function createMatcherService(verifyingContract?: string, lastTicks = 5291n): MatcherOperator {
  const settlement = verifyingContract ?? (TESTNET.deployed ? TESTNET.settlement : ZERO);
  return createMatcherOperator(sepoliaDomain(settlement), lastTicks, {
    baseAsset: TESTNET.pzec,
    quoteAssets: [TESTNET.usdc, TESTNET.usdt0],
  });
}

function isConfiguredDomain(operator: MatcherOperator): boolean {
  return TESTNET.deployed
    && operator.domain.chainId === TESTNET.chainId
    && operator.domain.verifyingContract === TESTNET.settlement;
}

export function startMatcher(options: { host?: string; port?: number; operator?: MatcherOperator; persistPath?: string } = {}) {
  const host = listenHost(options.host);
  const port = options.port ?? Number(process.env.PHLEBAS_PORT ?? 8788);
  const persistPath = options.persistPath ?? dataPath;
  const initializedPath = `${persistPath}.initialized`;
  const startedAt = Date.now();
  let lastSequenceAt = startedAt;
  let operator = options.operator;
  let mutation = Promise.resolve();

  const ready = (async () => {
    if (operator) return;
    const loaded = await readOperator(persistPath);
    if (loaded) {
      const expected = createMatcherService().domain;
      if (
        loaded.domain.name !== expected.name
        || loaded.domain.version !== expected.version
        || loaded.domain.chainId !== expected.chainId
        || loaded.domain.verifyingContract !== expected.verifyingContract
      ) {
        throw new Error("Persisted matcher domain does not match the configured settlement manifest");
      }
      operator = loaded;
      return;
    }
    try {
      const marker = await readFile(initializedPath, "utf8");
      if (marker.trim() === "initialized") {
        throw new Error("Matcher state is missing after initialization; refusing replay reset");
      }
      throw new Error("Matcher initialization marker is invalid");
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    operator = createMatcherService();
    await writeOperator(persistPath, operator);
    await atomicWriteFile(initializedPath, "initialized\n");
  })();

  const server = createServer((request, response) => {
    void (async () => {
      await ready;
      if (!operator) throw new Error("Matcher failed to initialize");
      const url = new URL(request.url ?? "/", `http://${host}:${port}`);
      if (request.method === "GET" && url.pathname === "/health") {
        let persistReadable = false;
        try {
          await access(persistPath);
          persistReadable = true;
        } catch {
          persistReadable = false;
        }
        send(response, 200, {
          ok: true,
          sequence: operator.sequence,
          sequenceRoot: sequenceRoot(operator),
          matcher: "local-operator",
          persist: persistPath,
          persistReadable,
          startedAt,
          lastSequenceAt,
          acceptingOrders: isConfiguredDomain(operator),
        });
        return;
      }
      if (request.method === "GET" && url.pathname === "/sequence") {
        const after = Number(url.searchParams.get("after") ?? "0");
        const receipts = Number.isInteger(after) && after > 0
          ? operator.receipts.filter((receipt) => receipt.sequence > after)
          : operator.receipts;
        send(response, 200, {
          sequence: operator.sequence,
          sequenceRoot: sequenceRoot(operator),
          after: Number.isInteger(after) && after > 0 ? after : 0,
          receipts,
        });
        return;
      }
      if (request.method === "GET" && url.pathname === "/book") {
        send(response, 200, operator.book);
        return;
      }
      if (request.method === "POST" && url.pathname === "/orders") {
        if (request.headers["content-type"]?.split(";", 1)[0] !== "application/json") {
          send(response, 415, { ok: false, reason: "content-type-must-be-application-json" });
          return;
        }
        if (!isConfiguredDomain(operator)) {
          send(response, 503, { ok: false, reason: "settlement-domain-unavailable" });
          return;
        }
        const order = parseOrder(await readJson(request));
        const issued = mutation.then(async () => {
          const candidate = restoreOperator(snapshotOperator(operator!), { verify: false });
          const receipt = intakeSignedOrder(candidate, order);
          await writeOperator(persistPath, candidate);
          operator = candidate;
          lastSequenceAt = Date.now();
          return receipt;
        });
        mutation = issued.then(() => undefined, () => undefined);
        const receipt = await issued;
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
