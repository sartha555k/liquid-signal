import vinext from "vinext";
import { defineConfig } from "vite";
import hostingConfig from "./.openai/hosting.json";
import { readExecutionProfile } from "./scripts/execution-profile.mjs";
import { sites } from "./build/sites-vite-plugin";
import { fileURLToPath } from "node:url";

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  "00000000-0000-4000-8000-000000000000";

const { d1, r2 } = hostingConfig;

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";
const managedLinux = readExecutionProfile() === "managed-linux";

const localBindingConfig = {
  main: "vinext/server/fetch-handler",
  compatibility_flags: ["nodejs_compat"],
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: "site-creator-d1",
          database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: "site-creator-r2",
        },
      ]
    : [],
};

export default defineConfig(async () => {
  if (process.env.DEPLOY_TARGET === "render") {
    const workerDb = fileURLToPath(new URL("./db/index.ts", import.meta.url));
    const nodeDb = fileURLToPath(new URL("./db/node-index.ts", import.meta.url));
    return {
      plugins: [{
        name: "render-sqlite-database",
        enforce: "pre",
        resolveId(source: string) {
          // vinext's TS-path resolver can bypass the ordinary @/db alias.
          // Intercept both the original import and its resolved file path.
          if (source === "@/db" || source === workerDb || source === workerDb.slice(0, -3)) return nodeDb;
        },
        load(id: string) {
          // Also cover imports already resolved by framework build hooks.
          if (id.split("?")[0] === workerDb) return `export { getDb } from ${JSON.stringify(nodeDb)};`;
        },
      }, vinext()], server: { host: "0.0.0.0" },
      resolve: { alias: [
        { find: "cloudflare:workers", replacement: fileURLToPath(new URL("./lib/node-env.ts", import.meta.url)) },
        { find: /^@\/db$/, replacement: fileURLToPath(new URL("./db/node-index.ts", import.meta.url)) },
      ] },
    };
  }
  // Use Miniflare's local Request.cf placeholder unless fetching is requested.
  process.env.CLOUDFLARE_CF_FETCH_ENABLED ??= "false";
  process.env.WRANGLER_SEND_METRICS ??= "false";

  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.WRANGLER_REGISTRY_PATH ??= ".wrangler/dev-registry";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    server: {
      ...(managedLinux ? { host: "0.0.0.0", allowedHosts: ["terminal.local"] } : {}),
      ...(isCodexSeatbeltSandbox ? { watch: { useFsEvents: false, usePolling: true } } : {}),
    },
    plugins: [
      vinext(),
      sites({ mockAuth: !managedLinux }),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        inspectorPort: false,
        config: localBindingConfig,
      }),
    ],
  };
});
