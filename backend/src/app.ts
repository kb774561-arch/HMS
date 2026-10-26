import { existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import compression from "compression";
import cors from "cors";
import express from "express";
import helmetImport from "helmet";
import morgan from "morgan";
import { createPrismaClient, disposePrisma, runWithRequestPrisma } from "./config/database.js";
import { env } from "./config/env.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { apiRouter } from "./routes/index.js";
import { cjsDefault } from "./utils/interop.js";

const helmet = cjsDefault(helmetImport);

const isServerlessRuntime = Boolean(process.env.VERCEL || process.env.CF_WORKER === "1");

export function createApp() {
  const app = express();

  // Behind a tunnel/proxy: use X-Forwarded-For so the login rate limit is per visitor, not per tunnel.
  app.set("trust proxy", 1);

  // Cloudflare Workers: Prisma + pg hang if one client/pool is reused across requests.
  // Scope a fresh client to each request via AsyncLocalStorage.
  if (process.env.CF_WORKER === "1") {
    app.use((_req, res, next) => {
      const client = createPrismaClient();
      let cleaned = false;
      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        void disposePrisma(client);
      };
      res.on("finish", cleanup);
      res.on("close", cleanup);
      runWithRequestPrisma(client, () => next());
    });
  }

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
  // Gzip / access logs — Node local/VPS only. Skip on Vercel/Workers compat layers.
  if (!isServerlessRuntime) {
    app.use(compression());
    app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));
  }
  app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
  app.use(express.json({ limit: "2mb" }));

  app.use("/api", apiRouter);

  // Static SPA hosting is Node-only. Never call fileURLToPath when import.meta.url is unavailable (Workers).
  let servedFrontend = false;
  if (!isServerlessRuntime && typeof import.meta.url === "string" && import.meta.url.length > 0) {
    const webDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../frontend/dist");
    if (existsSync(path.join(webDist, "index.html"))) {
      app.use("/assets", express.static(path.join(webDist, "assets"), { immutable: true, maxAge: "365d" }));
      app.use(express.static(webDist, { index: false, maxAge: "1h" }));
      app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(webDist, "index.html")));
      servedFrontend = true;
    }
  }

  if (!servedFrontend) {
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
 * Cloudflare Workers use src/worker.ts → httpServerHandler around this same app.
 */
const app = createApp();
export default app;
