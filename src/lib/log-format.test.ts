import { strict as assert } from "node:assert";
import { test } from "node:test";

import { formatLog, parseLog, type LogEvent } from "./log-format.ts";

test("formatLog produces a single-line JSON string", () => {
  const e: LogEvent = {
    level: "info",
    service: "matcher",
    event: "order-accepted",
    fields: { sequence: 42, maker: "0xabc" },
    at: 100n,
  };
  const s = formatLog(e);
  assert.ok(s.length > 0);
  assert.equal(s.includes("\n"), false);
  assert.match(s, /"level":"info"/);
  assert.match(s, /"service":"matcher"/);
  assert.match(s, /"event":"order-accepted"/);
});

test("parseLog round-trips a formatted log line", () => {
  const e: LogEvent = {
    level: "warning",
    service: "observer",
    event: "deadline-breach",
    fields: { fillId: "0xaaa" },
    at: 200n,
  };
  const s = formatLog(e);
  const parsed = parseLog(s);
  assert.equal(parsed.level, e.level);
  assert.equal(parsed.service, e.service);
  assert.equal(parsed.event, e.event);
  assert.equal(parsed.at, e.at);
  assert.equal(parsed.fields.fillId, "0xaaa");
});

test("formatLog handles empty fields", () => {
  const e: LogEvent = {
    level: "debug",
    service: "matcher",
    event: "x",
    fields: {},
    at: 0n,
  };
  const s = formatLog(e);
  assert.match(s, /"fields":\{\}/);
});
