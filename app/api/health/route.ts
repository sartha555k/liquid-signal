import { readSecret } from "@/lib/server-env";
import { demoUsageLimited } from "@/lib/demo-policy.mjs";

export function GET() {
  const usageLimits = demoUsageLimited();
  return Response.json({ product: "Liquid Signal", provider: "liquid", model: "d1:free", analysisVersion: "liquid-d1-v1", providers: { liquid: Boolean(readSecret("LIQUID_API_KEY")), jev: Boolean(readSecret("TYPESAFE_API_KEY")) }, demo: { enabled: process.env.DEMO_ACCESS_MODE === "public", usageLimits, maxSampleSize: usageLimits ? 1000 : null, counterPersistence: usageLimits ? "instance" : null } }, { headers: { "Cache-Control": "no-store" } });
}
