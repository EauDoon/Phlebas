import { fetchLoopbackOperator, isLoopbackOperatorUrl, operatorUnavailable } from "@/lib/operator-url";

export async function POST() {
  const gatewayUrl = process.env.PHLEBAS_GATEWAY_URL;
  if (!isLoopbackOperatorUrl(gatewayUrl)) {
    return operatorUnavailable("gateway-unavailable");
  }

  const response = await fetchLoopbackOperator(new URL("/intents", gatewayUrl), { method: "POST" });
  if (!response) return operatorUnavailable("gateway-unavailable");
  return new Response(response.body, {
    status: response.status,
    headers: { "content-type": "application/json", "Cache-Control": "no-store" },
  });
}
