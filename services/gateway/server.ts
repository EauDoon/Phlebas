import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdir, open, readFile, rename } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

import { hexToBytes } from "../../src/lib/keccak.ts";
import { SYNTHETIC_DEPOSIT_ZATOSHIS } from "../../src/lib/zip321.ts";

import { createGateway, issueTestnetIntent, snapshotGateway, type GatewayState } from "./issuer.ts";
import { masterKeyHex, newMasterKey } from "./keys.ts";

const root = dirname(fileURLToPath(import.meta.url));
const defaultDataDir = join(root, ".data");

function send(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += bytes.length;
    if (length > 16 * 1024) throw new RangeError("request-body-too-large");
    chunks.push(bytes);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

async function loadOrCreateMaster(masterPath: string): Promise<{ masterHex: string; created: boolean }> {
  let masterHex: string;
  try {
    masterHex = (await readFile(masterPath, "utf8")).trim();
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    masterHex = masterKeyHex(newMasterKey());
    try {
      const handle = await open(masterPath, "wx", 0o600);
      try {
        await handle.writeFile(`${masterHex}\n`, "utf8");
        await handle.sync();
      } finally {
        await handle.close();
      }
    } catch (writeError: unknown) {
      if ((writeError as NodeJS.ErrnoException).code !== "EEXIST") throw writeError;
      masterHex = (await readFile(masterPath, "utf8")).trim();
      return { masterHex, created: false };
    }
    return { masterHex, created: true };
  }
  return { masterHex, created: false };
}

export async function loadGateway(options: { dataDirectory?: string } = {}) {
  const dataDirectory = options.dataDirectory ?? defaultDataDir;
  const masterPath = join(dataDirectory, "master.key");
  const statePath = join(dataDirectory, "state.json");
  await mkdir(dataDirectory, { recursive: true, mode: 0o700 });
  const loadedMaster = await loadOrCreateMaster(masterPath);
  const master = hexToBytes(loadedMaster.masterHex);
  if (master.length !== 32) throw new Error("Gateway master key must be exactly 32 bytes");
  let snapshot = undefined;
  try {
    snapshot = JSON.parse(await readFile(statePath, "utf8")) as Parameters<typeof createGateway>[1];
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    if (!loadedMaster.created) throw new Error("Gateway state is missing; refusing to reuse derivation indexes");
  }
  const state = createGateway(master, snapshot);
  if (loadedMaster.created) await saveGateway(state, options);
  return state;
}

export async function saveGateway(state: GatewayState, options: { dataDirectory?: string } = {}) {
  const dataDirectory = options.dataDirectory ?? defaultDataDir;
  const statePath = join(dataDirectory, "state.json");
  const temporaryPath = join(dataDirectory, `state-${process.pid}-${randomUUID()}.tmp`);
  const handle = await open(temporaryPath, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(snapshotGateway(state))}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporaryPath, statePath);
  const directory = await open(dataDirectory, "r");
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
}

export function startGateway(options: { host?: string; port?: number; dataDirectory?: string } = {}) {
  const host = options.host ?? process.env.PHLEBAS_BIND ?? "127.0.0.1";
  const port = options.port ?? Number(process.env.PHLEBAS_PORT ?? 8787);
  const ready = loadGateway(options);
  let mutation = Promise.resolve();

  const server = createServer((request, response) => {
    void (async () => {
      const state = await ready;
      const url = new URL(request.url ?? "/", `http://${host}:${port}`);
      if (request.method === "GET" && url.pathname === "/health") {
        send(response, 200, { ok: true, network: "testnet", issued: state.sequence });
        return;
      }
      if (request.method === "POST" && url.pathname === "/intents") {
        const contentType = request.headers["content-type"]?.split(";", 1)[0];
        if (contentType && contentType !== "application/json") {
          send(response, 415, { ok: false, reason: "content-type-must-be-application-json" });
          return;
        }
        const body = await readJson(request);
        const amount = body.amountZatoshis === undefined
          ? SYNTHETIC_DEPOSIT_ZATOSHIS
          : BigInt(String(body.amountZatoshis));
        const issued = mutation.then(async () => {
          const candidate = createGateway(state.master, snapshotGateway(state));
          const intent = issueTestnetIntent(candidate, amount);
          await saveGateway(candidate, options);
          state.sequence = candidate.sequence;
          state.ledger = candidate.ledger;
          return intent;
        });
        mutation = issued.then(() => undefined, () => undefined);
        const intent = await issued;
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
