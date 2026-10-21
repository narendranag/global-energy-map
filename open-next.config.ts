import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import staticAssetsIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache";

// OpenNext's Cloudflare adapter: how this Next.js app runs on Workers (`pnpm run deploy`).
// Every page is prerendered at build time and nothing revalidates, so the prerendered HTML is
// served read-only from the asset store. Without a cache OpenNext renders them again per request,
// and /methodology, /terms and /privacy read docs/*.md from a disk the Worker doesn't have.
export default defineCloudflareConfig({
  incrementalCache: staticAssetsIncrementalCache,
  enableCacheInterception: true,
});
