import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().min(1),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    CORS_ORIGIN: z.url(),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    // Optional: shared, multi-instance rate-limit store (Upstash REST-compatible).
    RATE_LIMIT_REDIS_URL: z.string().url().optional(),
    RATE_LIMIT_REDIS_TOKEN: z.string().optional(),
    // Only trust proxy-set client-IP headers (cf-connecting-ip, x-real-ip,
    // x-forwarded-for) when the operator behind Cloudflare/nginx opt-in.
    TRUSTED_PROXY_IP_HEADERS: z.enum(["true", "1"]).optional(),
    // Dedicated HMAC key for signed media links. When unset, media signing
    // derives from BETTER_AUTH_SECRET; signing fails closed if neither exists.
    SOS_MEDIA_SECRET: z.string().min(32).optional(),
  },
  runtimeEnv: process.env,
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
