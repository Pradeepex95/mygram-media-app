import { z } from "zod";

const boolString = z
  .string()
  .optional()
  .transform((v) => v === "true" || v === "1");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().min(1).optional(),
  DB_SLOW_QUERY_MS: z.coerce.number().int().nonnegative().default(200),
  AUTH_SECRET: z.string().min(32),
  NEXT_PUBLIC_APP_NAME: z.string().default("MyGram"),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  SESSION_MAX_AGE_SECONDS: z.coerce.number().int().positive().default(2592000),
  SESSION_POLICY: z.enum(["newest_wins", "block_if_active"]).default("newest_wins"),
  ADMIN_EMAIL: z.string().email(),
  ADMIN_PASSWORD: z.string().min(8),
  ADMIN_USERNAME: z.string().min(3).default("admin"),
  ALLOW_SUBSCRIBER_UPLOADS: boolString.default(true),
  MAX_IMAGE_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(10 * 1024 * 1024),
  MAX_VIDEO_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(500 * 1024 * 1024),
  LOGIN_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  LOGIN_LOCKOUT_MINUTES: z.coerce.number().int().positive().default(15),
  STORAGE_DRIVER: z.enum(["s3", "local"]).default("s3"),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default("auto"),
  S3_BUCKET: z.string().default("mygram"),
  S3_ACCESS_KEY_ID: z.string().default("local"),
  S3_SECRET_ACCESS_KEY: z.string().default("local"),
  S3_FORCE_PATH_STYLE: boolString.default(true),
  S3_PUBLIC_BASE_URL: z.string().optional().default(""),
  SIGNED_URL_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  UPSTASH_REDIS_REST_URL: z.string().optional().default(""),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional().default(""),
  CRON_SECRET: z.string().min(8),
  PAYMENT_PROVIDER: z.enum(["stripe", "razorpay", "none"]).default("none"),
  STRIPE_SECRET_KEY: z.string().optional().default(""),
  STRIPE_WEBHOOK_SECRET: z.string().optional().default(""),
  RAZORPAY_KEY_ID: z.string().optional().default(""),
  RAZORPAY_KEY_SECRET: z.string().optional().default(""),
});

export type AppEnv = z.infer<typeof envSchema>;

let cached: AppEnv | null = null;

export function getEnv(): AppEnv {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid environment variables: ${details}`);
  }
  cached = parsed.data;
  return cached;
}

export function getAppName(): string {
  return process.env.NEXT_PUBLIC_APP_NAME || "MyGram";
}
