import { env } from "cloudflare:workers";

export function readSecret(name: "YOUTUBE_API_KEY" | "TYPESAFE_API_KEY") {
  const cloudflareEnv = env as unknown as Record<string, unknown>;
  const value = cloudflareEnv[name] ?? process.env[name];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
