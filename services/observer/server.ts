import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { attestMint, emptyMintLedger, type MintLedger } from "../../src/lib/attestation.ts";
import { agreeObservations, outpointKey, parseStubObservation, type ObservedOutpoint } from "../../src/lib/observer.ts";

const bind = process.env.PHLEBAS_BIND ?? "127.0.0.1";
const port = Number(process.env.PHLEBAS_PORT ?? 8789);
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

function stringField(row: Record<string, unknown>, name: string): string {
  if (typeof row[name] !== "string" || row[name].length === 0) throw new TypeError(`${name}-must-be-a-string`);
  return row[name];
}

function integerField(row: Record<string, unknown>, name: string): number {
  if (typeof row[name] !== "number" || !Number.isSafeInteger(row[name])) throw new TypeError(`${name}-must-be-a-safe-integer`);
  return row[name];
}

function booleanField(row: Record<string, unknown>, name: string): boolean {
  if (typeof row[name] !== "boolean") throw new TypeError(`${name}-must-be-a-boolean`);
  return row[name];
}

export async function readMintLedger(path: string): Promise<MintLedger> {
  try {
    const snapshot = JSON.parse(await readFile(path, "utf8")) as { authorizedOutpoints?: unknown };
    if (!Array.isArray(snapshot.authorizedOutpoints)) throw new Error("Invalid observer ledger");
    for (const key of snapshot.authorizedOutpoints) {
      if (typeof key !== "string") throw new Error("Invalid observer ledger");
      const separator = key.lastIndexOf(":");
      if (separator < 0) throw new Error("Invalid observer ledger");
      if (outpointKey(key.slice(0, separator), Number(key.slice(separator + 1))) !== key) {
        throw new Error("Invalid observer ledger");
      }
    }
    return new Set(snapshot.authorizedOutpoints);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyMintLedger();
    throw error;
  }
}

export async function writeMintLedger(path: string, ledger: MintLedger): Promise<void> {
  const directoryPath = dirname(path);
  await mkdir(directoryPath, { recursive: true, mode: 0o700 });
  const temporaryPath = join(directoryPath, `state-${process.pid}-${randomUUID()}.tmp`);
  const handle = await open(temporaryPath, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify({ authorizedOutpoints: [...ledger] })}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporaryPath, path);
  const directory = await open(directoryPath, "r");
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
}

export function startObserver(options: { host?: string; port?: number; persistPath?: string } = {}) {
  const host = options.host ?? bind;
  const listenPort = options.port ?? port;
  const persistPath = options.persistPath ?? dataPath;
  let spent = emptyMintLedger();
  let mutation = Promise.resolve();
  const ready = readMintLedger(persistPath).then((loaded) => { spent = loaded; });
  const server = createServer((request, response) => {
    void (async () => {
      await ready;
      const url = new URL(request.url ?? "/", `http://${host}:${listenPort}`);
      if (request.method === "GET" && url.pathname === "/health") {
        send(response, 200, { ok: true, network: "testnet", zebra: "stub", mint: "stub" });
        return;
      }
      if (request.method === "POST" && url.pathname === "/attest") {
        if (request.headers["content-type"]?.split(";", 1)[0] !== "application/json") {
          send(response, 415, { ok: false, reason: "content-type-must-be-application-json" });
          return;
        }
        const body = await readJson(request);
        const candidateRows = body.observations === undefined ? [body] : body.observations;
        if (!Array.isArray(candidateRows) || candidateRows.length === 0 || candidateRows.length > 16) {
          throw new RangeError("observations-must-contain-between-1-and-16-items");
        }
        const rows = candidateRows.map((row) => {
          if (typeof row !== "object" || row === null || Array.isArray(row)) throw new TypeError("observation-must-be-an-object");
          return row as Record<string, unknown>;
        });
        const observations: ObservedOutpoint[] = rows.map((row) => parseStubObservation({
          txid: stringField(row, "txid"),
          vout: integerField(row, "vout"),
          amountZatoshis: BigInt(stringField(row, "amountZatoshis")),
          tex: stringField(row, "tex"),
          blockHeight: integerField(row, "blockHeight"),
          blockHash: stringField(row, "blockHash"),
          tipHeight: integerField(row, "tipHeight"),
          transparentInputsOnly: booleanField(row, "transparentInputsOnly"),
          transparentOutputsOnly: booleanField(row, "transparentOutputsOnly"),
          shieldedBundle: booleanField(row, "shieldedBundle"),
        }));
        const agreed = agreeObservations(observations);
        const issued = mutation.then(async () => {
          const candidate = new Set(spent);
          const attestation = attestMint(agreed, candidate);
          if (attestation.status === "eligible") await writeMintLedger(persistPath, candidate);
          spent = candidate;
          return attestation;
        });
        mutation = issued.then(() => undefined, () => undefined);
        send(response, 200, await issued);
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
