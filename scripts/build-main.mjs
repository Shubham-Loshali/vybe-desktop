/**
 * Bundles the Electron main process and preload into dist-electron/, with Vybe's Supabase project
 * baked in from VYBE_SUPABASE_URL and VYBE_SUPABASE_KEY: the environment (CI secrets) or a local,
 * uncommitted .env (see .env.example). The source carries neither, so a copy of this code doesn't come
 * wired to Vybe's database. Without them the app runs guest-only; a release build (VYBE_RELEASE=1)
 * refuses to, so no official build ships without accounts.
 */
import { build } from "esbuild";

try {
  process.loadEnvFile(".env"); // values already in the environment win
} catch {
  /* no .env: CI, or a build without Vybe's project */
}
const url = process.env.VYBE_SUPABASE_URL ?? "";
const key = process.env.VYBE_SUPABASE_KEY ?? "";

await build({
  entryPoints: ["electron/main.ts", "electron/preload.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  external: ["electron", "jsdom", "undici"],
  outdir: "dist-electron",
  define: {
    "process.env.VYBE_SUPABASE_URL": JSON.stringify(url),
    "process.env.VYBE_SUPABASE_KEY": JSON.stringify(key),
  },
  logLevel: "warning",
});
