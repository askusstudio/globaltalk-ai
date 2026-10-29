import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = Number(process.env.PORT || 8787);
const isProduction = process.env.NODE_ENV === "production";

// Security headers
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

// Request body size limit
app.use(express.json({ limit: "1mb" }));

// Configurable CORS support
const allowedOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:8787",
  ...(process.env.CLIENT_URL ? process.env.CLIENT_URL.split(",").map(u => u.trim()) : []),
  ...(process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(",").map(u => u.trim()) : [])
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g. mobile apps, curl, or same-origin static frontend)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin) || allowedOrigins.includes("*")) {
      return callback(null, true);
    }
    // In production when served from same host or custom subdomains
    if (process.env.RENDER_EXTERNAL_URL && origin === process.env.RENDER_EXTERNAL_URL) {
      return callback(null, true);
    }
    callback(null, true); // Permissive fallback for API with tokens, but with origin reflection
  },
  credentials: true,
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

// In-memory rate limiter for token generation (max 30 tokens per 15 minutes per IP)
const tokenRateLimits = new Map();
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const MAX_TOKENS_PER_WINDOW = 30;

function checkTokenRateLimit(ip) {
  const now = Date.now();
  const clientRecord = tokenRateLimits.get(ip) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };

  if (now > clientRecord.resetAt) {
    clientRecord.count = 0;
    clientRecord.resetAt = now + RATE_LIMIT_WINDOW_MS;
  }

  clientRecord.count += 1;
  tokenRateLimits.set(ip, clientRecord);

  if (clientRecord.count > MAX_TOKENS_PER_WINDOW) {
    return false;
  }
  return true;
}

// Clean up stale rate-limit entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of tokenRateLimits.entries()) {
    if (now > record.resetAt) {
      tokenRateLimits.delete(ip);
    }
  }
}, 5 * 60 * 1000);

// API Health Check
app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "GlobalTalk AI Service",
    environment: isProduction ? "production" : "development",
    timestamp: new Date().toISOString(),
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY)
  });
});

// Short-lived Gemini Live API token provisioning
app.post("/api/live-token", async (req, res) => {
  const clientIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "anonymous";

  if (!checkTokenRateLimit(clientIp)) {
    return res.status(429).json({
      error: "Too many session token requests. Please wait a few minutes before starting a new session."
    });
  }

  if (!process.env.GEMINI_API_KEY) {
    return res.status(503).json({
      error: "Missing GEMINI_API_KEY in server environment. Please configure it in your environment variables or .env file."
    });
  }

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const expireTime = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const newSessionExpireTime = new Date(Date.now() + 60 * 1000).toISOString();

    const token = await ai.authTokens.create({
      config: {
        uses: 1,
        expireTime,
        newSessionExpireTime,
        liveConnectConstraints: {
          model: "gemini-3.8-live",
          config: {
            responseModalities: ["AUDIO"],
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            sessionResumption: {}
          }
        }
      }
    });

    res.json({
      token: token.name,
      expiresAt: expireTime
    });
  } catch (error) {
    // Never leak API key or full stack in production responses
    console.error("Token creation error:", error?.message || "Unknown error");
    res.status(500).json({
      error: "Could not create a Live API token. Please check your Gemini API key, model quota, and account permissions."
    });
  }
});

// Serve static Vite frontend in production if built dist exists
const distPath = path.resolve(__dirname, "../dist");
if (fs.existsSync(distPath)) {
  console.log(`Serving static client files from ${distPath}`);
  app.use(express.static(distPath));

  // SPA fallback for client-side routing (Express 5 compatible)
  app.use((req, res, next) => {
    if (req.method === "GET" && !req.path.startsWith("/api")) {
      return res.sendFile(path.join(distPath, "index.html"));
    }
    next();
  });
}

// 404 handler for API routes
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "API endpoint not found." });
});

// Global error handler
app.use((err, _req, res, _next) => {
  console.error("Server error:", err?.message || err);
  res.status(500).json({
    error: isProduction ? "An unexpected server error occurred." : err?.message || "Internal server error"
  });
});

app.listen(port, () => {
  console.log(`GlobalTalk server listening on port ${port} (mode: ${isProduction ? "production" : "development"})`);
});
