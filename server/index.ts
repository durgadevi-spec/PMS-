import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import compression from "compression";
import { createServer as createHttpServer } from "http";
import { createServer as createHttpsServer } from "https";
import fs from "fs";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { pool, checkDatabaseConnection } from "./db.ts";

const app = express();

// Determine if we should use HTTPS
const sslKeyPath = process.env.SSL_KEY_PATH;
const sslCertPath = process.env.SSL_CERT_PATH;
const useHttps = sslKeyPath && sslCertPath && fs.existsSync(sslKeyPath) && fs.existsSync(sslCertPath);

let httpServer: any;

if (useHttps) {
  const options = {
    key: fs.readFileSync(sslKeyPath!),
    cert: fs.readFileSync(sslCertPath!),
  };
  httpServer = createHttpsServer(options, app);
  log("Initializing server with HTTPS support", "bootstrap");
} else {
  httpServer = createHttpServer(app);
  if (sslKeyPath || sslCertPath) {
    log("Warning: SSL paths provided but files not found or incomplete. Falling back to HTTP.", "bootstrap");
  } else {
    log("Initializing server with HTTP (Note: Microphone requires HTTPS for remote access)", "bootstrap");
  }
}

/* ===============================
   TYPES
================================ */
declare module "http" {
  interface IncomingMessage {
    rawBody?: unknown;
  }
}

/* ===============================
   MIDDLEWARE
================================ */

// Enable gzip compression for all responses
app.use(compression({
  level: 6, // Balance between compression ratio and CPU usage
  threshold: 1024, // Only compress responses larger than 1KB
  filter: (req: any, res: any) => {
    // Don't compress file uploads
    if (req.headers['content-type']?.includes('multipart/form-data')) {
      return false;
    }
    return (compression as any).filter?.(req, res) ?? true;
  },
}));

app.use(
  express.json({
    verify: (req, _res, buf) => {
      (req as any).rawBody = buf;
    },
  })
);

app.use(express.urlencoded({ extended: false }));

// Security headers for performance and security
app.use((req, res, next) => {
  // Cache control for static assets
  if (req.path.startsWith('/public')) {
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
  }
  // API GET responses are NOT cached at the HTTP layer on purpose: the
  // client (apiClient.ts) already does its own in-memory caching with
  // proper invalidation on every POST/PUT/DELETE. A blanket max-age here
  // meant the browser's own HTTP cache could silently serve a stale list
  // (e.g. missing a just-created task) for up to 60s after a reload,
  // completely bypassing that invalidation.
  else if (req.method === 'GET' && req.path.startsWith('/api')) {
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  } else {
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  }
  next();
});

/* ===============================
   LOGGER
================================ */
export function log(message: string, source = "express") {
  const time = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  console.log(`${time} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: any;

  const originalJson = res.json.bind(res);

  res.json = ((body: any) => {
    capturedJsonResponse = body;
    return originalJson(body);
  }) as typeof res.json;

  res.on("finish", () => {
    if (path.startsWith("/api")) {
      const duration = Date.now() - start;
      log(
        `${req.method} ${path} ${res.statusCode} in ${duration}ms` +
        (capturedJsonResponse
          ? ` :: ${JSON.stringify(capturedJsonResponse)}`
          : "")
      );
    }
  });

  next();
});

/* ===============================
   BOOTSTRAP
================================ */
async function bootstrap() {
  /* ---------- DB HEALTH CHECK ---------- */
  console.log("📍 Starting database health check...");
  const isConnected = await checkDatabaseConnection();

  if (!isConnected) {
    console.warn(
      "⚠️  Warning: Database connection failed. Server will start but API calls may fail."
    );
    console.log(
      "💡 Please check your DATABASE_URL in .env and verify Neon is accessible."
    );
  } else {
    console.log("✨ Database is ready for queries.");
  }

  app.get("/db-test", async (_req, res) => {
    try {
      await pool.query("SELECT 1");
      res.json({ success: true });
    } catch (err: any) {
      console.error("DB ERROR:", err.message);
      res.status(500).json({
        error: err.message,
        code: err.code,
      });
    }
  });

  /* ---------- REGISTER API ROUTES ---------- */
  await registerRoutes(httpServer, app);

  /* ---------- START REMINDER SERVICE ---------- */
  // Task due-date reminder emails are disabled for now. Set
  // ENABLE_TASK_REMINDERS=true in the environment to turn them back on —
  // no code changes needed.
  if (process.env.ENABLE_TASK_REMINDERS === "true") {
    try {
      const { startReminderService } = await import("./reminders.ts");
      startReminderService();
      console.log("✅ Reminder service initialized");
    } catch (err) {
      console.error("❌ Failed to start reminder service:", err);
    }
  } else {
    console.log("⏸️  Task reminder emails are disabled (set ENABLE_TASK_REMINDERS=true to re-enable)");
  }

  /* ---------- GLOBAL ERROR HANDLER ---------- */
  app.use(
    (err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      res.status(status).json({
        message: err.message || "Internal Server Error",
      });
    }
  );

  /* ---------- FRONTEND (VITE / STATIC) ---------- */
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    // In development, we use setupVite to serve the frontend through the backend port (5000)
    // This allows localhost:5000 to work for both API and frontend.
    // We import it dynamically here to avoid issues in production builds.
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  /* ---------- START SERVER (ONE PORT ONLY) ---------- */
  const PORT = Number(process.env.PORT) || 5000;

  httpServer.listen(PORT, "0.0.0.0", () => {
    const protocol = useHttps ? "https" : "http";
    log(`Server running at ${protocol}://0.0.0.0:${PORT}`);
    if (!useHttps) {
      log(`⚠️  Warning: Running on HTTP. Voice recording will ONLY work on localhost. Use HTTPS for remote access.`, "express");
    }
  });
}

/* ===============================
   START
================================ */
// Fix applied: Corrected DATABASE_URL in .env (Fixed password and hostname typos)
bootstrap().catch((err) => {
  console.error("❌ Failed to start server:", err);
  process.exit(1);
});