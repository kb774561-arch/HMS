import { existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import compression from "compression";
import cors from "cors";
import express from "express";
import helmetImport from "helmet";
import morgan from "morgan";
import { env } from "./config/env.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { apiRouter } from "./routes/index.js";
import { cjsDefault } from "./utils/interop.js";

const helmet = cjsDefault(helmetImport);

/** Built frontend (frontend/dist). When present, the API also serves the website on the same port. */
const WEB_DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../frontend/dist");

export function createApp() {
  const app = express();

  // Behind a tunnel/proxy: use X-Forwarded-For so the login rate limit is per visitor, not per tunnel.
  app.set("trust proxy", 1);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          // index.html has one small inline script that applies the saved theme before paint.
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
          fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
          imgSrc: ["'self'", "data:", "blob:"],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
    }),
  );
  // Gzip responses — the app is often served from a slow home/mobile upload link.
  app.use(compression());
  app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
  app.use(express.json({ limit: "2mb" }));
  app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));

  app.use("/api", apiRouter);

  if (existsSync(path.join(WEB_DIST, "index.html"))) {
    // Hashed build assets never change, so browsers can keep them for a year.
    app.use("/assets", express.static(path.join(WEB_DIST, "assets"), { immutable: true, maxAge: "365d" }));
    app.use(express.static(WEB_DIST, { index: false, maxAge: "1h" }));
    // Client-side routes (/tenants, /rent, …) all load the single-page app.
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(WEB_DIST, "index.html")));
  } else {
    app.get("/", (_req, res) => {
      res.json({ name: "Genius Girls PG API", poweredBy: "Karmatechlab", website: "https://karmatechlab.com/" });
    });
  }

  app.use(errorHandler);
  return app;
}

/**
 * Vercel's Express preset auto-detects its entry and checks src/app.* before
 * src/index.*, so this module's default export must be the ready app itself.
 */
const app = createApp();
export default app;
