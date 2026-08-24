/** Bindings declared in wrangler.jsonc, plus the one secret. */
declare global {
  interface CloudflareEnv {
    DB: D1Database;
    /** Only bound when R2 is enabled on the account; photos fall back to D1. */
    PHOTOS?: R2Bucket;
    SESSION_SECRET?: string;
  }
}

export {};
