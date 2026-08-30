import { simulationStatus } from "@/lib/status";

export function GET() {
  return Response.json(simulationStatus(), {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
