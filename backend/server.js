// Backend Server - VibeWeb OS
const express = require("express");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const path = require("path");
const http = require("http");
const https = require("https");
const { Server } = require("socket.io");

const { initDatabase } = require("./db");
const { sanitizeString } = require("./utils/validation");

const app = express();
const {
  PORT = 3000,
  NODE_ENV = "development",
  JWT_SECRET,
  CORS_ORIGIN,
} = process.env;

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: true, // Allow all origins for real-time dashboard updates
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// Security: JWT_SECRET validation
if (!JWT_SECRET) {
  if (NODE_ENV === "production") {
    console.error("ERROR: JWT_SECRET environment variable is REQUIRED!");
    process.exit(1);
  }
  console.warn("WARNING: JWT_SECRET not set. Using insecure default.");
}
const ACTUAL_JWT_SECRET = JWT_SECRET || "dev_secret_key_vibe_tasks_2024";

// Rate limiting (in-memory)
const loginAttempts = new Map();
const leadAttempts = new Map();

function handleRateLimit(map, ip, limit, windowMs) {
  const now = Date.now();
  const attempts = map.get(ip) || { count: 0, resetTime: now + windowMs };

  if (now > attempts.resetTime) {
    attempts.count = 0;
    attempts.resetTime = now + windowMs;
  }

  if (attempts.count >= limit) return false;

  attempts.count++;
  map.set(ip, attempts);
  return true;
}

const checkRateLimit = (ip) => handleRateLimit(loginAttempts, ip, 5, 15 * 60 * 1000);
const checkLeadRateLimit = (ip) => handleRateLimit(leadAttempts, ip, 10, 60 * 60 * 1000);

// Global Middlewares
app.use(cors({
  origin: true, // Reflect request origin to allow all domains (CORS "liberado")
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

app.use(express.json({ limit: "10mb" }));
app.disable("x-powered-by");
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

if (NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

// Domain Uptime Monitoring
function checkDomain(domain, timeoutMs = 5000) {
  return new Promise((resolve) => {
    let finished = false;
    const cleanDomain = domain.replace(/^https?:\/\//, "").split("/")[0];

    const done = (status) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (req) req.destroy();
      resolve(status);
    };

    const timer = setTimeout(() => done("down"), timeoutMs);

    const req = https.request({
      hostname: cleanDomain,
      method: "HEAD",
      timeout: timeoutMs,
      rejectUnauthorized: false,
    }, (res) => {
      done(res.statusCode >= 200 && res.statusCode < 400 ? "up" : "down");
    });

    req.on("error", () => done("down"));
    req.end();
  });
}

function startUptimeMonitor(db) {
  setInterval(async () => {
    db.all("SELECT id, domain FROM tasks WHERE domain IS NOT NULL AND domain != '' LIMIT 100", [], async (err, tasks) => {
      if (err || !tasks?.length) return;

      const batchSize = 10;
      for (let i = 0; i < tasks.length; i += batchSize) {
        const batch = tasks.slice(i, i + batchSize);
        const results = await Promise.all(batch.map(t => checkDomain(t.domain).then(s => ({ id: t.id, s }))));
        
        const stmt = db.prepare("UPDATE tasks SET uptime_status = ? WHERE id = ?");
        results.forEach(r => stmt.run([r.s, r.id]));
        stmt.finalize();

        if (i + batchSize < tasks.length) await new Promise(r => setTimeout(r, 200));
      }
    });
  }, 5 * 60 * 1000);
  console.log("[UptimeMonitor] Active");
}

// Authentication Middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader?.split(" ")[1];

  if (!token) return res.status(401).json({ success: false, error: "Não autenticado" });

  jwt.verify(token, ACTUAL_JWT_SECRET, (err, decoded) => {
    if (err) return res.status(401).json({ success: false, error: "Token inválido" });
    req.user = { id: decoded.userId, email: decoded.email };
    next();
  });
}

// API Routes
app.get("/api/health", (req, res) => {
  res.json({ success: true, status: "healthy", time: new Date().toISOString() });
});

initDatabase(startUptimeMonitor).then((database) => {
  const db = database;
  const deps = { db, JWT_SECRET: ACTUAL_JWT_SECRET, NODE_ENV, sanitizeString, io };

  app.use("/api/auth", require("./routes/auth")({ ...deps, checkRateLimit, authenticateToken }));
  app.use("/api/leads", require("./routes/leads")(db, NODE_ENV, sanitizeString, checkLeadRateLimit, io));
  app.use("/api/tasks", authenticateToken, require("./routes/tasks")(db, NODE_ENV, sanitizeString, io));

  // Public Task View
  app.get("/api/tasks/view/:uuid", (req, res) => {
    const uuid = req.params.uuid;
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    
    if (!UUID_REGEX.test(uuid)) return res.status(400).json({ success: false, error: "UUID inválido" });

    db.get("SELECT client, col_id, updated_at FROM tasks WHERE public_uuid = ?", [uuid], (err, task) => {
      if (err || !task) return res.status(404).json({ success: false, error: "Não encontrado" });
      
      const columns = ["Descoberta", "Acordo", "Construir e Entregar", "Suporte / Live"];
      res.json({
        success: true,
        data: {
          client: task.client,
          status: columns[task.col_id] || "Desconhecido",
          progress: Math.round((task.col_id / 3) * 100),
          updated_at: task.updated_at
        }
      });
    });
  });

  // Error Handlers
  app.use((err, req, res, next) => {
    console.error("[Fatal]", err.message);
    res.status(err.status || 500).json({ 
      success: false, 
      error: NODE_ENV === "production" ? "Erro interno" : err.message 
    });
  });

  app.use((req, res) => res.status(404).json({ success: false, error: "Não encontrado" }));

  // WebSocket Security
  io.use((socket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(" ")[1];
    if (!token) return next(new Error("Auth error"));
    jwt.verify(token, ACTUAL_JWT_SECRET, (err, decoded) => {
      if (err) return next(new Error("Auth error"));
      socket.userId = decoded.userId;
      next();
    });
  });

  server.listen(PORT, () => console.log(`Server: ${PORT} [${NODE_ENV}]`));
}).catch((err) => {
  console.error("DB Init Failed:", err);
  process.exit(1);
});

// Graceful Shutdown
const shutdown = () => {
  console.log("Shutting down...");
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
