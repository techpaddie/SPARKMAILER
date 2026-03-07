import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(Number).default('4000'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_ACCESS_EXPIRY: z.string().default('15m'),
  JWT_REFRESH_EXPIRY: z.string().default('7d'),
  ENCRYPTION_KEY: z.string().length(64, 'ENCRYPTION_KEY must be 32 bytes hex'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  // Public base URL used in email links (unsubscribe, etc). Example: https://app.example.com
  PUBLIC_BASE_URL: z.string().optional(),
  MAILGUN_API_KEY: z.string().optional(),
  MAILGUN_DOMAIN: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  BATCH_SIZE: z.string().transform(Number).default('200'),
  SEND_RATE_PER_SECOND: z.string().transform(Number).default('10'),
  SKIP_QUOTA_CHECK: z.string().optional().transform((v) => v === '1' || v === 'true'),
});

export type Env = z.infer<typeof envSchema>;

export const env = envSchema.parse(process.env);
