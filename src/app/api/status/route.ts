import { previewStatus } from "@/lib/status";

export function GET() {
  return Response.json(previewStatus(), {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
