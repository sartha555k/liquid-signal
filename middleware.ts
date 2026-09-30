import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";

export function middleware(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith("/api/") || request.nextUrl.pathname === "/api/health") return NextResponse.next();
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
