// Alert router. The router decides which channel a watchtower
// alert goes to based on severity and service. The router is a
// pure function; the router never reaches out to the network and
// never signs a transaction. The router is the building block for
// the operations hardening surface.

export type AlertSeverity = "info" | "warning" | "critical";

export type AlertRoute = Readonly<{
  service: string;
  severity: AlertSeverity;
  channel: "pagerduty" | "slack" | "email" | "log";
  destination: string;
}>;

export type AlertRecord = Readonly<{
  service: string;
  alert: string;
  severity: AlertSeverity;
  recommendedAction: string;
  raisedAt: bigint;
}>;

export type AlertRoutingTable = Readonly<Record<string, AlertRoute>>;

export function emptyRoutingTable(): AlertRoutingTable {
  return {};
}

export function addRoute(table: AlertRoutingTable, service: string, severity: AlertSeverity, channel: AlertRoute["channel"], destination: string): AlertRoutingTable {
  const key = service + ":" + severity;
  return { ...table, [key]: { service, severity, channel, destination } };
}

export function routeAlert(table: AlertRoutingTable, alert: AlertRecord): AlertRoute | null {
  const key = alert.service + ":" + alert.severity;
  return table[key] ?? null;
}

export function defaultRoutingTable(): AlertRoutingTable {
  let t: AlertRoutingTable = {};
  t = addRoute(t, "observer", "critical", "pagerduty", "phlebas-observer-critical");
  t = addRoute(t, "observer", "warning", "slack", "#phlebas-alerts");
  t = addRoute(t, "matcher", "critical", "pagerduty", "phlebas-matcher-critical");
  t = addRoute(t, "matcher", "warning", "slack", "#phlebas-alerts");
  t = addRoute(t, "gateway", "critical", "pagerduty", "phlebas-gateway-critical");
  return t;
}
