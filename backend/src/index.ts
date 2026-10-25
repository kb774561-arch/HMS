import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./utils/logger.js";

const app = createApp();

app.listen(env.PORT, () => {
  logger.info("Genius Girls PG API listening", {
    port: env.PORT,
    env: env.NODE_ENV,
    timezone: env.APP_TIMEZONE,
  });
});
