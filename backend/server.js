// Backend Server - VibeWeb OS
const express = require('express');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
const http = require('http');
const https = require('https');
const { Server } = require('socket.io');

const { initDatabase } = require('./db');
const { sanitizeString } = require('./utils/validation');

const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: NODE_ENV === 'production'
      ? process.env.CORS_ORIGIN || 'http://localhost:8080'
      : true,
    methods: ['GET', 'POST']
  }
});

// Security: JWT_SECRET is required
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  if (NODE_ENV === 'production') {
    console.error('ERROR: JWT_SECRET environment variable is REQUIRED in production!');
    process.exit(1);
  } else {
    console.warn('WARNING: JWT_SECRET not set. Using insecure default for development.');
  }
}
const ACTUAL_JWT_SECRET = JWT_SECRET || 'dev_secret_key_vibe_tasks_2024';

// Rate limiting (in-memory)
const loginAttempts = new Map();
const leadAttempts = new Map();
const RATE_LIMIT_WINDOW = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 5;
const LEAD_RATE_LIMIT_WINDOW = 60 * 60 * 1000;
const MAX_LEAD_ATTEMPTS = 10;

let db;

// Middleware
app.use(cors({
  origin: NODE_ENV === 'production'
    ? process.env.CORS_ORIGIN || 'http://localhost:8080'
    : true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' }));
app.disable('x-powered-by');
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

if (NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Uptime Monitoring logic
function checkDomainWithTimeout(domain, timeoutMs) {
  return new Promise((resolve) => {
    let timeoutCleared = false;
    let requestAborted = false;
    let req = null;
    
    const timeout = setTimeout(() => {
      if (!timeoutCleared) {
        timeoutCleared = true;
        requestAborted = true;
        if (req && !req.destroyed) req.destroy();
        resolve('down');
      }
    }, timeoutMs);

    req = https.request({
      hostname: domain,
      method: 'HEAD',
      timeout: timeoutMs,
      rejectUnauthorized: false
    }, (res) => {
      if (!timeoutCleared && !requestAborted) {
        timeoutCleared = true;
        clearTimeout(timeout);
        resolve(res.statusCode >= 200 && res.statusCode < 400 ? 'up' : 'down');
      }
    });

    req.on('error', () => {
      if (!timeoutCleared && !requestAborted) {
        timeoutCleared = true;
        clearTimeout(timeout);
        resolve('down');
      }
    });

    req.setTimeout(timeoutMs, () => {
      if (!requestAborted) {
        requestAborted = true;
        req.destroy();
        if (!timeoutCleared) {
          timeoutCleared = true;
          clearTimeout(timeout);
          resolve('down');
        }
      }
    });
    req.end();
  });
}

function startUptimeMonitor(db) {
  setInterval(async () => {
    db.all(`SELECT id, domain FROM tasks WHERE domain IS NOT NULL AND domain != '' LIMIT 100`, [], async (err, tasks) => {
      if (err || !tasks || tasks.length === 0) return;

      const batchSize = 20;
      for (let i = 0; i < tasks.length; i += batchSize) {
        const batch = tasks.slice(i, i + batchSize);
        const checks = batch.map(task => {
          const domain = task.domain.replace(/^https?:\/\//, '').split('/')[0];
          return checkDomainWithTimeout(domain, 5000).then(status => ({ taskId: task.id, status }));
        });

        const results = await Promise.all(checks);
        const stmt = db.prepare('UPDATE tasks SET uptime_status = ? WHERE id = ?');
        results.forEach(({ taskId, status }) => stmt.run([status, taskId]));
        stmt.finalize();
        
        if (i + batchSize < tasks.length) await new Promise(r => setTimeout(r, 100));
      }
    });
  }, 5 * 60 * 1000);
  console.log('[UptimeMonitor] Started monitoring domains');
}

// Auth Middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ success: false, error: 'Não autenticado' });

  jwt.verify(token, ACTUAL_JWT_SECRET, (err, decoded) => {
    if (err) return res.status(401).json({ success: false, error: 'Token inválido ou expirado' });
    req.user = { id: decoded.userId, email: decoded.email };
    next();
  });
}

function checkRateLimit(ip) {
  const now = Date.now();
  const attempts = loginAttempts.get(ip) || { count: 0, resetTime: now + RATE_LIMIT_WINDOW };
  if (now > attempts.resetTime) {
    attempts.count = 0;
    attempts.resetTime = now + RATE_LIMIT_WINDOW;
  }
  if (attempts.count >= MAX_LOGIN_ATTEMPTS) return false;
  attempts.count++;
  loginAttempts.set(ip, attempts);
  return true;
}

function checkLeadRateLimit(ip) {
  const now = Date.now();
  const attempts = leadAttempts.get(ip) || { count: 0, resetTime: now + LEAD_RATE_LIMIT_WINDOW };
  if (now > attempts.resetTime) {
    attempts.count = 0;
    attempts.resetTime = now + LEAD_RATE_LIMIT_WINDOW;
  }
  if (attempts.count >= MAX_LEAD_ATTEMPTS) return false;
  attempts.count++;
  leadAttempts.set(ip, attempts);
  return true;
}

// Routes
app.get('/api/health', (req, res) => {
  res.json({ success: true, status: 'healthy', timestamp: new Date().toISOString() });
});

initDatabase(startUptimeMonitor).then(database => {
  db = database;

  app.use('/api/auth', require('./routes/auth')({
    db, JWT_SECRET: ACTUAL_JWT_SECRET, NODE_ENV, checkRateLimit, authenticateToken
  }));

  app.use('/api/leads', require('./routes/leads')(db, NODE_ENV, sanitizeString, checkLeadRateLimit));

  app.get('/api/tasks/view/:uuid', (req, res) => {
    const uuid = req.params.uuid;
    const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuid || !UUID_PATTERN.test(uuid)) return res.status(400).json({ success: false, error: 'UUID inválido' });

    db.get('SELECT client, col_id, updated_at FROM tasks WHERE public_uuid = ?', [uuid], (err, task) => {
      if (err) return res.status(500).json({ success: false, error: 'Erro interno' });
      if (!task) return res.status(404).json({ success: false, error: 'Projeto não encontrado' });
      
      const progress = Math.round((task.col_id / 3) * 100);
      const colName = ['Descoberta', 'Acordo', 'Construir e Entregar', 'Suporte / Live'][task.col_id] || 'Desconhecido';
      res.json({ success: true, data: { client: task.client, status: colName, progress, updated_at: task.updated_at } });
    });
  });

  app.use('/api/tasks', authenticateToken, require('./routes/tasks')(db, NODE_ENV, sanitizeString, io));

  app.use((err, req, res, next) => {
    console.error('[Error Handler]', err.message);
    res.status(err.status || 500).json({ success: false, error: NODE_ENV === 'production' ? 'Erro interno' : err.message });
  });

  app.use((req, res) => res.status(404).json({ success: false, error: 'Rota não encontrada' }));

  // WebSocket Auth
  io.use((socket, next) => {
    const token = socket.handshake.auth.token || (socket.handshake.headers.authorization && socket.handshake.headers.authorization.split(' ')[1]);
    if (!token) return next(new Error('Auth error'));
    jwt.verify(token, ACTUAL_JWT_SECRET, (err, decoded) => {
      if (err) return next(new Error('Auth error'));
      socket.userId = decoded.userId;
      next();
    });
  });

  server.listen(PORT, () => console.log(`Server running on port ${PORT} [${NODE_ENV}]`));
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});

const shutdown = () => {
  if (db) db.close(() => process.exit(0));
  else process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
