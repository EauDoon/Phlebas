import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { matcherBookFeed, matcherExecutionFeed, matcherSolverQuoteFeed, MAX_FEED_PAGE_SIZE } from "../../src/lib/matcher-feeds.ts";
import { createEvmEoaSignatureVerifier, type MatcherSignatureVerifier } from "../../src/lib/matcher-auth.ts";
import {
  findRequestReceipt,
  matcherConfigurationHash,
  matcherStateRoot,
  type PersistentMatcherConfiguration,
  type PersistentMatcherEvent,
} from "../../src/lib/persistent-matcher.ts";
import { UINT64_MAX } from "../../src/lib/order-domain.ts";
import { listenHost } from "../../src/lib/operator-url.ts";
import type { JournalValue } from "./journal.ts";
import {
  PersistentMatcherStore,
  deserializePersistentMatcherEvent,
  type PersistentMatcherStoreOptions,
} from "./persistent-store.ts";
import { parseStrictJson } from "./strict-json.ts";

const DEFAULT_DATA_DIRECTORY = join(dirname(fileURLToPath(import.meta.url)), ".data", "native-v1");
const DEFAULT_BODY_BYTES = 64 * 1024;
const DEFAULT_PENDING_MUTATIONS = 64;
const DEFAULT_RATE_WINDOW_MILLISECONDS = 60_000;
const DEFAULT_RATE_LIMIT = 120;
const MUTATION_KINDS = new Map<string, PersistentMatcherEvent["kind"]>([
  ["/v1/orders", "accept-order"],
  ["/v1/order-cancellations", "cancel-order"],
  ["/v1/account-epochs", "advance-epoch"],
  ["/v1/solver-quotes", "accept-solver-quote"],
  ["/v1/solver-quote-cancellations", "cancel-solver-quote"],
]);

type RateWindow = { startedAt: number; count: number };

export type MatcherServerOptions = Readonly<{
  host?: string;
  port?: number;
  dataDirectory?: string;
  configuration?: PersistentMatcherConfiguration;
  verifier?: MatcherSignatureVerifier;
  maximumBodyBytes?: number;
  maximumPendingMutations?: number;
  mutationRateLimit?: number;
  mutationRateWindowMilliseconds?: number;
  clockSeconds?: () => bigint;
}>;

class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function positiveBoundedInteger(value: number, label: string, maximum: number): number {
  if (!Number.isSafeInteger(value) || value <= 0 || value > maximum) throw new RangeError(`${label} is outside its allowed range`);
  return value;
}

function send(response: ServerResponse, status: number, body: unknown): void {
  if (response.headersSent) {
    response.destroy();
    return;
  }
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    "x-content-type-options": "nosniff",
  });
  response.end(JSON.stringify(body, (_key, value) => typeof value === "bigint" ? value.toString() : value));
}

async function readJson(request: IncomingMessage, maximumBodyBytes: number): Promise<Record<string, JournalValue>> {
  if (request.headers["content-type"]?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") {
    throw new HttpError(415, "content-type-must-be-application-json");
  }
  const declaredLength = request.headers["content-length"];
  if (declaredLength && (!/^(?:0|[1-9][0-9]*)$/.test(declaredLength) || BigInt(declaredLength) > BigInt(maximumBodyBytes))) {
    throw new HttpError(413, "request-body-too-large");
  }
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += bytes.length;
    if (length > maximumBodyBytes) throw new HttpError(413, "request-body-too-large");
    chunks.push(bytes);
  }
  if (length === 0) throw new HttpError(400, "request-body-required");
  let parsed: unknown;
  try {
    parsed = parseStrictJson(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "request-body-invalid-json");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new HttpError(400, "request-body-must-be-object");
  return parsed as Record<string, JournalValue>;
}

function decimalCursor(value: string | null, label: string): bigint {
  const input = value ?? "0";
  if (!/^(?:0|[1-9][0-9]*)$/.test(input)) throw new HttpError(400, `${label}-must-be-canonical-decimal`);
  const parsed = BigInt(input);
  if (parsed > UINT64_MAX) throw new HttpError(400, `${label}-outside-uint64`);
  return parsed;
}

function pageLimit(value: string | null): number {
  if (value === null) return 50;
  if (!/^[1-9][0-9]*$/.test(value)) throw new HttpError(400, "limit-must-be-positive-decimal");
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > MAX_FEED_PAGE_SIZE) throw new HttpError(400, `limit-must-not-exceed-${MAX_FEED_PAGE_SIZE}`);
  return parsed;
}

function persistenceOptions(options: MatcherServerOptions): PersistentMatcherStoreOptions | null {
  if (!options.configuration) return null;
  const directory = options.dataDirectory ?? DEFAULT_DATA_DIRECTORY;
  return {
    journalPath: join(directory, "events.jsonl"),
    checkpointPath: join(directory, "checkpoint.json"),
    markerPath: join(directory, "initialized"),
    lockPath: join(directory, "writer.lock"),
    configuration: options.configuration,
    verifier: options.verifier ?? createEvmEoaSignatureVerifier(options.configuration.domain.chainId),
  };
}

function remoteKey(request: IncomingMessage): string {
  return request.socket.remoteAddress ?? "unknown";
}

function errorStatus(error: unknown): number {
  if (error instanceof HttpError) return error.status;
  const message = error instanceof Error ? error.message : "matcher-error";
  if (/already used for a different command|already has a matcher receipt|replayed|already cancelled/.test(message)) return 409;
  if (/limit reached|outside matcher limits/.test(message)) return 422;
  return 400;
}

function errorReason(error: unknown): string {
  return error instanceof Error ? error.message : "matcher-error";
}

export function startMatcher(options: MatcherServerOptions = {}): Server {
  const host = listenHost(options.host);
  const port = options.port ?? Number(process.env.PHLEBAS_PORT ?? 8788);
  const maximumBodyBytes = positiveBoundedInteger(options.maximumBodyBytes ?? DEFAULT_BODY_BYTES, "Maximum request body bytes", 1024 * 1024);
  const maximumPending = positiveBoundedInteger(options.maximumPendingMutations ?? DEFAULT_PENDING_MUTATIONS, "Maximum pending mutations", 10_000);
  const mutationRateLimit = positiveBoundedInteger(options.mutationRateLimit ?? DEFAULT_RATE_LIMIT, "Mutation rate limit", 1_000_000);
  const rateWindowMilliseconds = positiveBoundedInteger(
    options.mutationRateWindowMilliseconds ?? DEFAULT_RATE_WINDOW_MILLISECONDS,
    "Mutation rate window",
    24 * 60 * 60 * 1000,
  );
  const clockSeconds = options.clockSeconds ?? (() => BigInt(Math.floor(Date.now() / 1_000)));
  const configured = persistenceOptions(options);
  const startedAt = Date.now();
  const rateWindows = new Map<string, RateWindow>();
  let pendingMutations = 0;
  let storeError: unknown;
  const storeReady = configured
    ? PersistentMatcherStore.open(configured).catch((error: unknown) => {
        storeError = error;
        return null;
      })
    : Promise.resolve(null);

  function checkRate(request: IncomingMessage): void {
    const now = Date.now();
    const key = remoteKey(request);
    const prior = rateWindows.get(key);
    const current = !prior || now - prior.startedAt >= rateWindowMilliseconds
      ? { startedAt: now, count: 1 }
      : { ...prior, count: prior.count + 1 };
    rateWindows.set(key, current);
    if (current.count > mutationRateLimit) throw new HttpError(429, "mutation-rate-limit-exceeded");
  }

  const server = createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? "/", `http://${host}:${port}`);
      if (request.method === "GET" && url.pathname === "/health") {
        if (!configured) {
          send(response, 200, {
            ok: true,
            matcher: "persistent-native-v1",
            configured: false,
            acceptingMutations: false,
            mode: "no-value",
            custody: false,
            reason: "matcher-configuration-unavailable",
            startedAt,
          });
          return;
        }
        const store = await storeReady;
        if (!store) {
          send(response, 503, {
            ok: false,
            matcher: "persistent-native-v1",
            configured: true,
            acceptingMutations: false,
            reason: errorReason(storeError),
          });
          return;
        }
        send(response, 200, {
          ok: true,
          matcher: "persistent-native-v1",
          configured: true,
          acceptingMutations: true,
          mode: "no-value",
          custody: false,
          sequence: store.state.sequence,
          stateRoot: matcherStateRoot(store.state),
          configurationHash: matcherConfigurationHash(store.state.configuration),
          checkpoint: store.checkpoint,
          startedAt,
        });
        return;
      }

      const store = await storeReady;
      if (!store) throw new HttpError(503, configured ? errorReason(storeError) : "matcher-configuration-unavailable");

      if (request.method === "GET" && url.pathname === "/v1/checkpoint") {
        send(response, 200, { checkpoint: store.checkpoint, stateRoot: matcherStateRoot(store.state) });
        return;
      }
      if (request.method === "GET" && url.pathname === "/v1/sequence") {
        const after = decimalCursor(url.searchParams.get("after"), "after");
        const limit = pageLimit(url.searchParams.get("limit"));
        const matching = store.state.receipts.filter((receipt) => receipt.sequence > after);
        const receipts = matching.slice(0, limit);
        send(response, 200, {
          checkpoint: store.checkpoint,
          after,
          nextAfter: receipts.at(-1)?.sequence ?? after,
          hasMore: matching.length > receipts.length,
          receipts,
        });
        return;
      }
      if (request.method === "GET" && url.pathname === "/v1/market/book") {
        send(response, 200, { checkpoint: store.checkpoint, book: matcherBookFeed(store.state, clockSeconds(), pageLimit(url.searchParams.get("limit"))) });
        return;
      }
      if (request.method === "GET" && url.pathname === "/v1/solver-quotes") {
        send(response, 200, {
          checkpoint: store.checkpoint,
          quotes: matcherSolverQuoteFeed(store.state, clockSeconds(), pageLimit(url.searchParams.get("limit"))),
        });
        return;
      }
      if (request.method === "GET" && url.pathname === "/v1/executions") {
        const after = decimalCursor(url.searchParams.get("after"), "after");
        const limit = pageLimit(url.searchParams.get("limit"));
        const executions = matcherExecutionFeed(store.state, after, limit);
        send(response, 200, {
          checkpoint: store.checkpoint,
          after,
          nextAfter: executions.at(-1)?.sequence ?? after,
          executions,
        });
        return;
      }
      if (request.method === "GET" && url.pathname.startsWith("/v1/requests/")) {
        const encoded = url.pathname.slice("/v1/requests/".length);
        if (!encoded || encoded.includes("/")) throw new HttpError(404, "not-found");
        let requestId: string;
        try {
          requestId = decodeURIComponent(encoded);
        } catch {
          throw new HttpError(400, "request-id-invalid-encoding");
        }
        const receipt = findRequestReceipt(store.state, requestId);
        if (!receipt) throw new HttpError(404, "request-receipt-not-found");
        send(response, 200, { checkpoint: store.checkpoint, receipt });
        return;
      }

      const expectedKind = request.method === "POST" ? MUTATION_KINDS.get(url.pathname) : undefined;
      if (expectedKind) {
        checkRate(request);
        if (pendingMutations >= maximumPending) throw new HttpError(503, "mutation-queue-capacity-reached");
        pendingMutations += 1;
        try {
          const body = await readJson(request, maximumBodyBytes);
          const event = deserializePersistentMatcherEvent(store.state.configuration, {
            type: "persistent-matcher-event",
            configurationHash: matcherConfigurationHash(store.state.configuration),
            payload: body,
          });
          if (event.kind !== expectedKind) throw new HttpError(400, "matcher-event-kind-does-not-match-endpoint");
          const idempotencyKey = request.headers["idempotency-key"];
          if (typeof idempotencyKey !== "string" || idempotencyKey !== event.requestId) {
            throw new HttpError(400, "idempotency-key-must-match-request-id");
          }
          const result = await store.mutate(event);
          send(response, result.replayed ? 200 : 201, { ok: true, ...result });
        } finally {
          pendingMutations -= 1;
        }
        return;
      }
      send(response, 404, { ok: false, reason: "not-found" });
    })().catch((error: unknown) => {
      send(response, errorStatus(error), { ok: false, reason: errorReason(error) });
    });
  });

  const originalClose = server.close.bind(server);
  server.close = ((callback?: (error?: Error) => void) => {
    originalClose((error?: Error) => {
      void storeReady.then((store) => store?.close()).catch(() => undefined).finally(() => callback?.(error));
    });
    return server;
  }) as typeof server.close;
  server.listen(port, host);
  return server;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const server = startMatcher();
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    server.close((error?: Error) => {
      if (error) {
        process.exitCode = 1;
        process.stderr.write(`${error.message}\n`);
      }
    });
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}
