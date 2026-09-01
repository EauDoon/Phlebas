import { matcherRecoveryChallengeProxy } from "@/lib/matcher-proxy";

export function POST(request: Request) {
  return matcherRecoveryChallengeProxy(request);
}
