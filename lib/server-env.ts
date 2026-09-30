import { env } from "cloudflare:workers";

export function readSecret(name: "YOUTUBE_API_KEY" | "LIQUID_API_KEY" | "OPENAI_API_KEY" | "OPENAI_MODEL") {
  const cloudflareEnv = env as unknown as Record<string, unknown>;
  const value = cloudflareEnv[name] ?? process.env[name];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
