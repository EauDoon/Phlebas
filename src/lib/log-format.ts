// Structured log formatter. The formatter converts an event
// record into a single-line JSON string for the operator's log
// aggregator. The formatter is a pure function; the formatter
// never reaches out to the network and never signs a
// transaction.

export type LogLevel = "debug" | "info" | "warning" | "error" | "critical";

export type LogEvent = Readonly<{
  level: LogLevel;
  service: string;
  event: string;
  fields: Readonly<Record<string, string | number | boolean>>;
  at: bigint;
}>;

export function formatLog(event: LogEvent): string {
  const payload = {
    level: event.level,
    service: event.service,
    event: event.event,
    fields: event.fields,
    at: event.at.toString(),
  };
  return JSON.stringify(payload);
}

export function parseLog(line: string): LogEvent {
  const parsed = JSON.parse(line) as {
    level: LogLevel;
    service: string;
    event: string;
    fields: Record<string, string | number | boolean>;
    at: string;
  };
  return {
    level: parsed.level,
    service: parsed.service,
    event: parsed.event,
    fields: parsed.fields,
    at: BigInt(parsed.at),
  };
}
