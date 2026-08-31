import { isLoopbackOperatorUrl, operatorUnavailable } from "@/lib/operator-url";

export async function GET() {
  const matcherUrl = process.env.PHLEBAS_MATCHER_URL;
  if (!isLoopbackOperatorUrl(matcherUrl)) {
    return operatorUnavailable("matcher-unavailable", { matcher: "in-browser" });
  }
  const response = await fetch(new URL("/health", matcherUrl));
  return new Response(await response.text(), {
    status: response.status,
    headers: { "content-type": "application/json", "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  const matcherUrl = process.env.PHLEBAS_MATCHER_URL;
  if (!isLoopbackOperatorUrl(matcherUrl)) {
    return operatorUnavailable("matcher-unavailable", { matcher: "in-browser" });
  }
  const response = await fetch(new URL("/orders", matcherUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: await request.text(),
  });
  return new Response(await response.text(), {
    status: response.status,
    headers: { "content-type": "application/json", "Cache-Control": "no-store" },
  });
}
