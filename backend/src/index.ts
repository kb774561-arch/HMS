import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./utils/logger.js";

const app = createApp();

// On Vercel the exported app runs as a Vercel Function; locally we listen on a port.
if (!process.env.VERCEL) {
  app.listen(env.PORT, () => {
    logger.info("Genius Girls PG API listening", {
      port: env.PORT,
      env: env.NODE_ENV,
      timezone: env.APP_TIMEZONE,
    });
  });
}

export default app;
