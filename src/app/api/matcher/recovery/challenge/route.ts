import { matcherRecoveryChallengeProxy } from "@/lib/matcher-proxy";
import { exactMatcherMarketSelection } from "@/lib/matcher-market-routing";

export function POST(request: Request) {
  const selection = exactMatcherMarketSelection(new URL(request.url).searchParams);
  if (!selection) {
    return Response.json(
      { ok: false, reason: "matcher-market-query-invalid" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  return matcherRecoveryChallengeProxy(request, process.env, selection.deployment);
}
