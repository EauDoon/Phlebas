import { matcherRecoveryOrdersProxy } from "@/lib/matcher-proxy";

export function POST(request: Request) {
  return matcherRecoveryOrdersProxy(request);
}
