import dotenv from "dotenv";
import { z } from "zod";

// Cloudflare Workers inject secrets into process.env; dotenv is a no-op without a file.
dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(5000),
  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().min(1),
  APP_TIMEZONE: z.string().default("Asia/Kolkata"),
  FRONTEND_URL: z.string().default("http://localhost:5173"),
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default("12h"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const message = `Invalid environment configuration: ${JSON.stringify(parsed.error.flatten().fieldErrors)}`;
  console.error(message);
  // Workers must not call process.exit — throw so the isolate reports a clear startup error.
  if (process.env.CF_WORKER === "1") {
    throw new Error(message);
  }
  process.exit(1);
}

export const env = parsed.data;
