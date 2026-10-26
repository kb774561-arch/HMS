import app from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./utils/logger.js";

// Vercel / Cloudflare Workers provide their own request bridge — do not call listen there.
const isManagedRuntime = Boolean(process.env.VERCEL || process.env.CF_WORKER === "1");

if (!isManagedRuntime) {
  app.listen(env.PORT, () => {
    logger.info("Genius Girls PG API listening", {
      port: env.PORT,
      env: env.NODE_ENV,
      timezone: env.APP_TIMEZONE,
    });
  });
}

export default app;
