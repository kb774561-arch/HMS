import dotenv from "dotenv";
import { z } from "zod";

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
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
