// HTTP server for the atomic-swap observer service. The server
// exposes the coordinator's state, the watchtower's alerts, and a
// health endpoint. The server is read-only on the chains and never
// signs a transaction. The signing surface lives in the wallet
// adapter, not here.

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { listenHost } from "../../src/lib/operator-url.ts";
import {
  atomicWriteFile,
} from "../durable-file.ts";
import { loadInitialState, pollOnceInto } from "./poller.ts";
import { buildHealth, type ServiceHealth } from "./health.ts";
import type { AtomicSwapObserverServiceConfig } from "./types.ts";
import { detectAlerts, type WatchtowerAlert } from "../../src/lib/watchtower.ts";
import type { CoordinatorState } from "../../src/lib/atomic-coordinator.ts";
import { stateOf } from "../../src/lib/swap-state.ts";
import { defineCounter, emptyMetricsState, incCounter, renderPrometheusText, type MetricsState } from "../../src/lib/metrics.ts";
import { emptySloState, recordSample, sloVerdict, type SloSample, type SloState, type SloTarget } from "../../src/lib/slo-tracker.ts";
import {
  checkRateLimit,
  emptyRateLimitMiddleware,
  extractClientKey,
  sendRateLimitExceeded,
  sendRateLimitHeaders,
  type RateLimitMiddleware,
} from "../../src/lib/rate-limit-http.ts";

const DEFAULT_PORT = 8790;

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(
    JSON.stringify(body, (_key, value) => (typeof value === "bigint" ? value.toString() : value)),
  );
}

export type ServiceState = Readonly<{
  state: CoordinatorState;
  bootstrap: "ready" | "missing" | "error";
  bootstrapError: string | null;
}>;

export async function bootstrapService(config: AtomicSwapObserverServiceConfig): Promise<ServiceState> {
  // The bootstrap distinguishes three cases. (1) The snapshot file
  // is present and parses cleanly: ready, return the restored
  // state. (2) The snapshot file is missing and the marker file is
  // also missing: first start, treat as ready with an empty
  // coordinator. (3) The snapshot file is missing but the marker
  // file is present: a previous run wrote a snapshot, the file
  // disappeared (operator error, disk corruption, race with a
  // crashed write), refuse to start fresh and surface the
  // inconsistency. (4) The snapshot file is present but does not
  // parse: surface the error so the operator can intervene.
  const markerPath = `${config.snapshotPath}.initialized`;
  let snapshotPresent = true;
  let state: CoordinatorState;
  try {
    const restored = await loadInitialState(config.snapshotPath);
    if (restored === null) {
      snapshotPresent = false;
      state = { fills: {}, cursor: 0n, alertLog: [] };
    } else {
      state = restored;
    }
  } catch (err) {
    return {
      state: { fills: {}, cursor: 0n, alertLog: [] },
      bootstrap: "error",
      bootstrapError: err instanceof Error ? err.message : String(err),
    };
  }
  if (snapshotPresent) {
    // Persist the marker so a later missing-snapshot incident is
    // detected. The marker is idempotent.
    try {
      await atomicWriteFile(markerPath, "initialized\n");
    } catch {
      // Marker writes are best-effort; failure to write does not
      // change the bootstrap result.
    }
    return { state, bootstrap: "ready", bootstrapError: null };
  }
  // Snapshot file is missing. Check for the marker.
  let markerExists = false;
  try {
    await fs.access(markerPath);
    markerExists = true;
  } catch {
    markerExists = false;
  }
  if (!markerExists) {
    // First start. Write the marker and proceed with an empty
    // coordinator.
    try {
      await atomicWriteFile(markerPath, "initialized\n");
    } catch {
      // best-effort
    }
    return { state, bootstrap: "ready", bootstrapError: null };
  }
  // Marker present but snapshot missing. Refuse to start fresh.
  return {
    state,
    bootstrap: "missing",
    bootstrapError: `Snapshot file is missing at ${config.snapshotPath} but the initialization marker is present; refusing replay reset.`,
  };
}

export type ServiceController = Readonly<{
  snapshot: () => ServiceState;
  poll: (nowSeconds: bigint) => Promise<{
    state: CoordinatorState;
    alerts: ReadonlyArray<WatchtowerAlert>;
  }>;
  health: () => ServiceHealth;
  metrics: () => string;
  slo: (nowSeconds: bigint) => {
    service: string;
    metric: string;
    ratio: number;
    threshold: number;
    meets: boolean;
    sampleCount: number;
  };
}>;

export function buildController(
  config: AtomicSwapObserverServiceConfig,
  initial: ServiceState,
): ServiceController {
  let current: ServiceState = initial;
  let metrics: MetricsState = defineCounter(emptyMetricsState(), "polls_total", "Total poll cycles");
  let sloState: SloState = emptySloState();
  const availabilityTarget: SloTarget = {
    service: "observer",
    metric: "availability",
    windowSeconds: 86_400n,
    threshold: 0.995,
    comparison: "ge",
  };
  return {
    snapshot: () => current,
    poll: async (nowSeconds: bigint) => {
      const outcome = await pollOnceInto(current.state, config, nowSeconds);
      current = { ...current, state: outcome.state };
      metrics = incCounter(metrics, "polls_total");
      const sample: SloSample = {
        service: "observer",
        metric: "availability",
        observedAt: nowSeconds,
        value: 1,
        success: outcome.alerts.filter((a) => a.alert === "deadline-breach").length === 0,
      };
      sloState = recordSample(sloState, sample);
      return { state: outcome.state, alerts: outcome.alerts };
    },
    health: () => buildHealth(current.state, config.reorgDepth, config.pollIntervalSeconds, current.bootstrap),
    metrics: () => renderPrometheusText(metrics),
    slo: (nowSeconds: bigint) => sloVerdict(sloState, availabilityTarget, nowSeconds),
  };
}

function asNumber(value: string | null, fallback: number): number {
  if (value === null) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function statusFor(bootstrap: ServiceState["bootstrap"]): number {
  return bootstrap === "ready" ? 200 : 503;
}

export type StartServiceOptions = Readonly<{
  config: AtomicSwapObserverServiceConfig;
  initial: ServiceState;
  host?: string;
  port?: number;
  clock?: () => bigint;
}>;

export function startService(options: StartServiceOptions): Server {
  const host = listenHost(options.host);
  const port = options.port ?? DEFAULT_PORT;
  const controller = buildController(options.config, options.initial);
  let rateLimit: RateLimitMiddleware = emptyRateLimitMiddleware({ capacity: 60n, refillPerSecond: 1n });
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    void (async () => {
      const now = options.clock ? options.clock() : BigInt(Math.floor(Date.now() / 1000));
      const clientKey = extractClientKey(request);
      const rl = checkRateLimit(rateLimit, clientKey, now);
      rateLimit = { state: rl.state, config: rateLimit.config };
      if (!rl.allowed) {
        sendRateLimitExceeded(response, rl.remaining, rl.retryAfterSeconds);
        return;
      }
      sendRateLimitHeaders(response, rl.remaining, 0n);
      const url = new URL(request.url ?? "/", `http://${host}:${port}`);
      const path = url.pathname;
      const method = request.method ?? "GET";
      if (method === "GET" && path === "/health") {
        send(response, statusFor(controller.snapshot().bootstrap), controller.health());
        return;
      }
      if (method === "GET" && path === "/state") {
        const snap = controller.snapshot();
        send(response, statusFor(snap.bootstrap), {
          ok: snap.bootstrap === "ready",
          bootstrap: snap.bootstrap,
          bootstrapError: snap.bootstrapError,
          fillCount: Object.keys(snap.state.fills).length,
          cursor: snap.state.cursor.toString(),
          alertCount: snap.state.alertLog.length,
        });
        return;
      }
      if (method === "GET" && path === "/alerts") {
        const snap = controller.snapshot();
        const now = options.clock ? options.clock() : BigInt(Math.floor(Date.now() / 1000));
        const alerts = detectAlerts(snap.state, now, options.config.watchtower);
        send(response, statusFor(snap.bootstrap), { ok: true, count: alerts.length, alerts });
        return;
      }
      if (method === "GET" && path === "/fills") {
        const snap = controller.snapshot();
        const fills = Object.values(snap.state.fills).map((f) => ({
          fillId: f.fillId,
          state: stateOf(f),
          evmLeg: f.evmLeg,
          zecLeg: f.zecLeg,
          evmRefundAfter: f.evmRefundAfter.toString(),
          zecRefundAfter: f.zecRefundAfter.toString(),
          disputed: f.disputed,
        }));
        send(response, statusFor(snap.bootstrap), { ok: true, count: fills.length, fills });
        return;
      }
      const fillMatch = /^\/fills\/(0x[0-9a-fA-F]{64})$/.exec(path);
      if (method === "GET" && fillMatch) {
        const fillId = (fillMatch[1] ?? "").toLowerCase();
        const snap = controller.snapshot();
        const fill = snap.state.fills[fillId as `0x${string}`];
        if (!fill) {
          send(response, 404, { ok: false, reason: "fill-not-found" });
          return;
        }
        send(response, 200, {
          ok: true,
          fillId: fill.fillId,
          state: stateOf(fill),
          evmLeg: fill.evmLeg,
          zecLeg: fill.zecLeg,
          evmRefundAfter: fill.evmRefundAfter.toString(),
          zecRefundAfter: fill.zecRefundAfter.toString(),
          disputed: fill.disputed,
        });
        return;
      }
      if (method === "POST" && path === "/observe") {
        const now = options.clock ? options.clock() : BigInt(Math.floor(Date.now() / 1000));
        const out = await controller.poll(now);
        send(response, 200, { ok: true, cursor: out.state.cursor.toString(), alertCount: out.alerts.length });
        return;
      }
      if (method === "GET" && path === "/metrics") {
        response.writeHead(200, { "content-type": "text/plain; version=0.0.4" });
        response.end(controller.metrics());
        return;
      }
      if (method === "GET" && path === "/slo") {
        const now = options.clock ? options.clock() : BigInt(Math.floor(Date.now() / 1000));
        const verdict = controller.slo(now);
        send(response, 200, { ok: true, verdict });
        return;
      }
      send(response, 404, { ok: false, reason: "not-found" });
    })().catch((err: unknown) => {
      send(response, 500, { ok: false, reason: err instanceof Error ? err.message : "service-error" });
    });
  });
  server.listen(port, host);
  return server;
}

export function defaultSnapshotPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, ".data", "coordinator.json");
}

export function ensureSnapshotFile(path: string): Promise<void> {
  return atomicWriteFile(path, `${JSON.stringify({ version: 1, cursor: "0", fills: [], alertLog: [] }, null, 2)}\n`);
}

export { asNumber };
