import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual, createHash } from "node:crypto";
import { DemoError, demoCost, demoReservations, readDemoBody } from "./lib/demo-policy.mjs";

export async function middleware(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith("/api/") || request.nextUrl.pathname === "/api/health") return NextResponse.next();
  // This is an explicit opt-in. Missing/unknown modes retain private access.
  if (process.env.DEMO_ACCESS_MODE === "public") {
    try {
      if (process.env.DEPLOY_TARGET !== "render") throw new DemoError("Public demo limits require the Render Node runtime.", 503);
      if (request.method !== "POST") throw new DemoError("This endpoint is not available in the public demo.", 403);
      const path = request.nextUrl.pathname;
      const body = await readDemoBody(request);
      const cost = demoCost(path, body);
      // Render routes through its edge proxy. Global caps remain enforced
      // regardless of the network identifier; no client-provided demo ID.
      const ip = request.headers.get("cf-connecting-ip")
        ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
      const network = createHash("sha256").update(`${new Date().toISOString().slice(0, 10)}|${ip}`).digest("hex");
      const { reserveDemoUsage } = await import("./lib/demo-quota-node.mjs");
      reserveDemoUsage(demoReservations(path, network, cost));
      return NextResponse.next();
    } catch (error) {
      if (error instanceof DemoError) {
        return NextResponse.json({ error: error.message, code: error.status === 429 ? "demo_limit" : "demo_request" }, {
          status: error.status,
          headers: { "Cache-Control": "no-store", ...(error.retryAfter ? { "Retry-After": String(error.retryAfter) } : {}) },
        });
      }
      console.error("Demo limiter unavailable");
      return NextResponse.json({ error: "The demo safeguards are temporarily unavailable. Please try later." }, { status: 503 });
    }
  }
  const expected = process.env.API_ACCESS_TOKEN;
  if (!expected) {
    if (process.env.NODE_ENV === "production") return NextResponse.json({ error: "Set API_ACCESS_TOKEN in Render and enter it in the extension before using this demo." }, { status: 503 });
    return NextResponse.next();
  }
  const a = Buffer.from(request.headers.get("authorization") ?? "");
  const b = Buffer.from(`Bearer ${expected}`);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return NextResponse.json({ error: "Enter the backend access token in the extension." }, { status: 401 });
  return NextResponse.next();
}

export const config = { matcher: "/api/:path*" };
