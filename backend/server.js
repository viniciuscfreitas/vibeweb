// Backend Server - VibeWeb OS
// Grug Rule: Separated routes into modules for better organization
// Routes: routes/auth.js, routes/tasks.js
// server.js: setup, middleware, and initialization only

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Security: JWT_SECRET is required - no fallback to prevent accidental use of dev secret
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('ERROR: JWT_SECRET environment variable is required!');
  console.error('Set JWT_SECRET in your environment variables or .env file.');
  process.exit(1);
}

// Database setup
const DB_PATH = path.join(__dirname, 'database.db');
let db;

// Rate limiting simples (contador em memória)
// NOTE: In-memory rate limiting resets on server restart
// For production with multiple instances, use Redis or similar
// Current implementation is sufficient for single-instance deployment
const loginAttempts = new Map();
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutos
const MAX_LOGIN_ATTEMPTS = 5;

// Middleware
// CORS: Allow all origins in development (including file:// protocol)
// In production, restrict to specific origin
app.use(cors({
  origin: NODE_ENV === 'production'
    ? process.env.CORS_ORIGIN || 'http://localhost:8080'
    : true, // Allow all origins in development (including file://)
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' }));
app.disable('x-powered-by');

// Trust proxy for accurate IP addresses (needed for rate limiting behind reverse proxy)
if (NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Initialize Database
function initDatabase() {
  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.error('Error opening database:', err);
        reject(err);
        return;
      }
      console.log('Connected to SQLite database');

      // Enable foreign keys
      db.run('PRAGMA foreign_keys = ON;', (err) => {
        if (err) {
          console.error('Error enabling foreign keys:', err);
          reject(err);
          return;
        }

        // Create tables
        db.serialize(() => {
          // Users table
          db.run(`
            CREATE TABLE IF NOT EXISTS users (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              email TEXT UNIQUE NOT NULL,
              username TEXT UNIQUE,
              name TEXT NOT NULL,
              password_hash TEXT NOT NULL,
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
          `, (err) => {
            if (err) {
              console.error('Error creating users table:', err);
              reject(err);
              return;
            }

            // Add username column if table already exists (migration)
            // Check if column exists first to avoid errors
            db.all(`PRAGMA table_info(users)`, (err, columns) => {
              if (err) {
                console.error('Error checking table info:', err);
                return;
              }

              // Check if username column already exists
              // PRAGMA table_info returns an array of column objects
              const hasUsernameColumn = Array.isArray(columns) && columns.some(col => col.name === 'username');

              if (!hasUsernameColumn) {
                db.run(`ALTER TABLE users ADD COLUMN username TEXT`, (err) => {
                  if (err) {
                    console.error('Error adding username column:', err);
                  } else {
                    // Create unique index on username if column was added
                    db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username) WHERE username IS NOT NULL`, (err) => {
                      if (err) console.error('Error creating username index:', err);
                    });
                  }
                });
              } else {
                // Column already exists - just ensure index exists
                db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username) WHERE username IS NOT NULL`, (err) => {
                  if (err) console.error('Error creating username index:', err);
                });
              }
            });
          });

          // Index for users email
          db.run(`
            CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)
          `, (err) => {
            if (err) console.error('Error creating users email index:', err);
          });

          // Tasks table
          db.run(`
            CREATE TABLE IF NOT EXISTS tasks (
              id INTEGER PRIMARY KEY,
              user_id INTEGER NOT NULL,
              client TEXT NOT NULL,
              contact TEXT,
              type TEXT,
              stack TEXT,
              domain TEXT,
              description TEXT,
              price REAL NOT NULL,
              payment_status TEXT,
              deadline TEXT,
              deadline_timestamp INTEGER,
              hosting TEXT,
              col_id INTEGER NOT NULL,
              order_position INTEGER NOT NULL,
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY (user_id) REFERENCES users(id)
            )
          `, (err) => {
            if (err) {
              console.error('Error creating tasks table:', err);
              reject(err);
              return;
            }
          });

          // Indexes for tasks
          db.run(`
            CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id)
          `, (err) => {
            if (err) console.error('Error creating tasks user_id index:', err);
          });

          db.run(`
            CREATE INDEX IF NOT EXISTS idx_tasks_user_col_order ON tasks(user_id, col_id, order_position)
          `, (err) => {
            if (err) {
              console.error('Error creating tasks composite index:', err);
              reject(err);
              return;
            }
            console.log('Database initialized successfully');
            resolve();
          });
        });
      });
    });
  });
}

// Health check endpoint (no auth required)
app.get('/api/health', (req, res) => {
  res.json({ success: true, status: 'healthy', timestamp: new Date().toISOString() });
});

// Authentication middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, error: 'Não autenticado' });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).json({ success: false, error: 'Token inválido ou expirado' });
    }

    req.user = {
      id: decoded.userId,
      email: decoded.email
    };
    next();
  });
}

// Rate limiting helper
function checkRateLimit(ip) {
  const now = Date.now();
  const attempts = loginAttempts.get(ip) || { count: 0, resetTime: now + RATE_LIMIT_WINDOW };

  if (now > attempts.resetTime) {
    attempts.count = 0;
    attempts.resetTime = now + RATE_LIMIT_WINDOW;
  }

  if (attempts.count >= MAX_LOGIN_ATTEMPTS) {
    return false;
  }

  attempts.count++;
  loginAttempts.set(ip, attempts);
  return true;
}

// Input validation helpers
function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function sanitizeString(str, maxLength = 255) {
  if (!str) return '';
  return str.trim().substring(0, maxLength).replace(/[\x00-\x1F\x7F]/g, '');
}

// Routes - will be mounted after database initialization
const createAuthRoutes = require('./routes/auth');
const createTasksRoutes = require('./routes/tasks');

// Error handler (must be last middleware) - will be registered after routes
function setupErrorHandlers() {
app.use((err, req, res, next) => {
  // Log error with context
  console.error('[Error Handler]', {
    message: err.message,
    stack: NODE_ENV === 'development' ? err.stack : undefined,
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString()
  });

  // Don't expose stack trace in production
  const errorMessage = NODE_ENV === 'production'
    ? 'Erro interno do servidor'
    : err.message;

  res.status(err.status || 500).json({
    success: false,
    error: errorMessage
  });
});

// 404 handler (must be after all routes)
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Rota não encontrada'
  });
});
}

// Graceful shutdown handler
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing database...');
  if (db) {
    db.close((err) => {
      if (err) console.error('Error closing database:', err);
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
});

process.on('SIGINT', () => {
  console.log('SIGINT received, closing database...');
  if (db) {
    db.close((err) => {
      if (err) console.error('Error closing database:', err);
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
});

// Start server
initDatabase()
  .then(() => {
    // Mount routes after database is initialized (db is now available)
    // Auth routes: login (no auth), /me (requires auth)
    // Grug Rule: Group related parameters into config object
    app.use('/api/auth', createAuthRoutes({
      db,
      JWT_SECRET,
      NODE_ENV,
      checkRateLimit,
      validateEmail,
      sanitizeString,
      authenticateToken
    }));

    // Tasks routes require authentication - apply middleware before router
    app.use('/api/tasks', authenticateToken);
    app.use('/api/tasks', createTasksRoutes(db, NODE_ENV, sanitizeString));

    // Error handlers must be registered after all routes
    setupErrorHandlers();

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Environment: ${NODE_ENV}`);
      if (NODE_ENV !== 'production') {
        console.log('⚠️  Using dev JWT_SECRET. Set JWT_SECRET in production!');
      }
    });
  })
  .catch((err) => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });
