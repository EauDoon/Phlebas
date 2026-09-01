import { matcherHealthProxy, matcherOrderProxy } from "@/lib/matcher-proxy";

export function GET() {
  return matcherHealthProxy();
}

export function POST(request: Request) {
  return matcherOrderProxy(request);
}
