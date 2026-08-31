import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { hexToBytes } from "../../src/lib/keccak.ts";
import { SYNTHETIC_DEPOSIT_ZATOSHIS } from "../../src/lib/zip321.ts";

import { createGateway, issueTestnetIntent } from "./issuer.ts";
import { masterKeyHex, newMasterKey } from "./keys.ts";

const root = dirname(fileURLToPath(import.meta.url));
const dataDir = join(root, ".data");
const masterPath = join(dataDir, "master.key");

function send(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

export async function loadGateway() {
  await mkdir(dataDir, { recursive: true });
  let masterHex: string;
  try {
    masterHex = (await readFile(masterPath, "utf8")).trim();
  } catch {
    masterHex = masterKeyHex(newMasterKey());
    await writeFile(masterPath, `${masterHex}\n`, { encoding: "utf8", mode: 0o600 });
  }
  return createGateway(hexToBytes(masterHex));
}

export function startGateway(options: { host?: string; port?: number } = {}) {
  const host = options.host ?? process.env.PHLEBAS_BIND ?? "127.0.0.1";
  const port = options.port ?? Number(process.env.PHLEBAS_PORT ?? 8787);
  const ready = loadGateway();

  const server = createServer((request, response) => {
    void (async () => {
      const state = await ready;
      const url = new URL(request.url ?? "/", `http://${host}:${port}`);
      if (request.method === "GET" && url.pathname === "/health") {
        send(response, 200, { ok: true, network: "testnet", issued: state.sequence });
        return;
      }
      if (request.method === "POST" && url.pathname === "/intents") {
        const body = await readJson(request);
        const amount = body.amountZatoshis === undefined
          ? SYNTHETIC_DEPOSIT_ZATOSHIS
          : BigInt(String(body.amountZatoshis));
        const intent = issueTestnetIntent(state, amount);
        send(response, 201, intent);
        return;
      }
      send(response, 404, { ok: false, reason: "not-found" });
    })().catch((error: unknown) => {
      send(response, 500, { ok: false, reason: error instanceof Error ? error.message : "gateway-error" });
    });
  });

  server.listen(port, host);
  return server;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  startGateway();
}
