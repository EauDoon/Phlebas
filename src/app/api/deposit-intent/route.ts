import { isLoopbackOperatorUrl, operatorUnavailable } from "@/lib/operator-url";

export async function POST() {
  const gatewayUrl = process.env.PHLEBAS_GATEWAY_URL;
  if (!isLoopbackOperatorUrl(gatewayUrl)) {
    return operatorUnavailable("gateway-unavailable");
  }

  const response = await fetch(new URL("/intents", gatewayUrl), { method: "POST" });
  const body = await response.text();
  return new Response(body, {
    status: response.status,
    headers: { "content-type": "application/json", "Cache-Control": "no-store" },
  });
}
