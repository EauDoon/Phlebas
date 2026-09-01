import { matcherAccountProxy, matcherHealthProxy, matcherOrderProxy } from "@/lib/matcher-proxy";

export function GET(request: Request) {
  const search = new URL(request.url).searchParams;
  const account = search.get("account");
  if (search.size > 1 || (search.size === 1 && account === null)) {
    return Response.json({ ok: false, reason: "matcher-query-invalid" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  if (account !== null) return matcherAccountProxy(account);
  return matcherHealthProxy();
}

export function POST(request: Request) {
  return matcherOrderProxy(request);
}
