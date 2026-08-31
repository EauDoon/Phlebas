import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { gatewayMaxIntents } from "../../src/lib/intent-cap.ts";
import { hexToBytes } from "../../src/lib/keccak.ts";
import { listenHost } from "../../src/lib/operator-url.ts";
import { SYNTHETIC_DEPOSIT_ZATOSHIS } from "../../src/lib/zip321.ts";

import { createGateway, issueTestnetIntent } from "./issuer.ts";
import { masterKeyHex, newMasterKey } from "./keys.ts";

const root = dirname(fileURLToPath(import.meta.url));
const defaultDataDir = join(root, ".data");

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

export async function loadGateway(directory = defaultDataDir) {
  await mkdir(directory, { recursive: true });
  const masterPath = join(directory, "master.key");
  const issuedPath = join(directory, "issued");
  let masterHex: string | undefined;
  try {
    masterHex = (await readFile(masterPath, "utf8")).trim();
  } catch {
    masterHex = undefined;
  }
  let issuedRaw: string | undefined;
  try {
    issuedRaw = (await readFile(issuedPath, "utf8")).trim();
  } catch {
    issuedRaw = undefined;
  }
  const masterExisted = masterHex !== undefined;
  if (!masterHex) {
    masterHex = masterKeyHex(newMasterKey());
    await writeFile(masterPath, `${masterHex}\n`, { encoding: "utf8", mode: 0o600 });
  }
  const state = createGateway(hexToBytes(masterHex));
  if (!masterExisted && issuedRaw === undefined) {
    return state;
  }
  if (masterExisted && issuedRaw !== undefined && /^[0-9]+$/.test(issuedRaw)) {
    state.sequence = Number.parseInt(issuedRaw, 10);
    return state;
  }
  state.sequence = Number.MAX_SAFE_INTEGER;
  return state;
}

async function persistIssued(directory: string, sequence: number) {
  await writeFile(join(directory, "issued"), `${sequence}\n`, { encoding: "utf8", mode: 0o600 });
}

export function startGateway(options: { host?: string; port?: number; maxIntents?: number; dataDir?: string } = {}) {
  const host = listenHost(options.host);
  const port = options.port ?? Number(process.env.PHLEBAS_PORT ?? 8787);
  const maxIntents = options.maxIntents ?? gatewayMaxIntents();
  const directory = options.dataDir ?? defaultDataDir;
  const ready = loadGateway(directory);

  const server = createServer((request, response) => {
    void (async () => {
      const state = await ready;
      const url = new URL(request.url ?? "/", `http://${host}:${port}`);
      if (request.method === "GET" && url.pathname === "/health") {
        send(response, 200, { ok: true, network: "testnet", issued: state.sequence, cap: maxIntents });
        return;
      }
      if (request.method === "POST" && url.pathname === "/intents") {
        if (state.sequence >= maxIntents) {
          send(response, 429, { ok: false, reason: "intent-cap" });
          return;
        }
        const body = await readJson(request);
        const amount = body.amountZatoshis === undefined
          ? SYNTHETIC_DEPOSIT_ZATOSHIS
          : BigInt(String(body.amountZatoshis));
        const intent = issueTestnetIntent(state, amount);
        await persistIssued(directory, state.sequence);
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
