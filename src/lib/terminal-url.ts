import { INCIDENT_DEMO_QUERY, isIncidentDemoQuery } from "./gateway-incidents.ts";
import type { MarketId } from "./market-data.ts";
import type { FeedStatus } from "./market-state.ts";
import { DEFAULT_TERMINAL_MODE, isTerminalMode, type TerminalMode } from "./terminal-mode.ts";
import type { RenderableTerminalView } from "./terminal-views.ts";

export function terminalUrl(options: {
  view: RenderableTerminalView;
  market: MarketId;
  feed?: FeedStatus;
  demo?: string;
  mode?: TerminalMode;
}): string {
  const params = new URLSearchParams({ market: options.market });
  if (options.feed && options.feed !== "illustrative") {
    params.set("feed", options.feed);
  }
  if (options.mode && options.mode !== DEFAULT_TERMINAL_MODE && isTerminalMode(options.mode)) {
    params.set("mode", options.mode);
  }
  if (options.view === "architecture" && isIncidentDemoQuery(options.demo)) {
    params.set("demo", INCIDENT_DEMO_QUERY);
  }
  if (options.view === "liquidity") {
    return `/liquidity?${params.toString()}`;
  }
  params.set("view", options.view);
  return `/trade?${params.toString()}`;
}
