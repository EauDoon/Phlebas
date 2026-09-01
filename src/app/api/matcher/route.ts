import {
  matcherAccountProxy,
  matcherHealthProxy,
  matcherMutationAction,
  matcherMutationProxy,
  matcherOrderProxy,
} from "@/lib/matcher-proxy";
import { exactMatcherMarketSelection } from "@/lib/matcher-market-routing";

function invalidMarketRoute() {
  return Response.json(
    { ok: false, reason: "matcher-market-query-invalid" },
    { status: 400, headers: { "Cache-Control": "no-store" } },
  );
}

export function GET(request: Request) {
  const search = new URL(request.url).searchParams;
  const selection = exactMatcherMarketSelection(search, "account");
  if (!selection) return invalidMarketRoute();
  const account = search.get("account");
  if (account !== null) return matcherAccountProxy(account, process.env, selection.deployment);
  return matcherHealthProxy(process.env, selection.deployment);
}

export function POST(request: Request) {
  const search = new URL(request.url).searchParams;
  const selection = exactMatcherMarketSelection(search, "action");
  if (!selection) return invalidMarketRoute();
  if (search.get("action") === null) {
    return matcherOrderProxy(request, process.env, selection.deployment);
  }
  const action = matcherMutationAction(search.get("action"));
  if (!action) {
    return Response.json({ ok: false, reason: "matcher-action-invalid" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  return matcherMutationProxy(request, action, process.env, selection.deployment);
}
