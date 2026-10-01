import { readSecret } from "@/lib/server-env";

export function GET() {
  return Response.json({ product: "Liquid Signal", provider: "liquid", model: "d1:free", analysisVersion: "liquid-d1-v1", providers: { liquid: Boolean(readSecret("LIQUID_API_KEY")), jev: Boolean(readSecret("TYPESAFE_API_KEY")) }, demo: { enabled: process.env.DEMO_ACCESS_MODE === "public", maxSampleSize: 1000, counterPersistence: "instance" } }, { headers: { "Cache-Control": "no-store" } });
}
