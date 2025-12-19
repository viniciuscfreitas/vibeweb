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
const http = require('http');
const https = require('https');
const { Server } = require('socket.io');

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
const leadAttempts = new Map(); // Separado para leads
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutos
const MAX_LOGIN_ATTEMPTS = 5;
const LEAD_RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hora para leads
const MAX_LEAD_ATTEMPTS = 10;

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

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

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
              const hasAvatarUrlColumn = Array.isArray(columns) && columns.some(col => col.name === 'avatar_url');

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

              if (!hasAvatarUrlColumn) {
                db.run(`ALTER TABLE users ADD COLUMN avatar_url TEXT`, (err) => {
                  if (err) {
                    console.error('Error adding avatar_url column:', err);
                  } else {
                    console.log('Added avatar_url column to users table');
                  }
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

            // Migrations: Add new columns if they don't exist
            db.all(`PRAGMA table_info(tasks)`, (err, columns) => {
              if (err) {
                console.error('Error checking tasks table info:', err);
                console.log('Database initialized successfully');
                resolve();
                return;
              }

              const columnNames = columns.map(col => col.name);

              // Migration: is_recurring
              if (!columnNames.includes('is_recurring')) {
                db.run(`ALTER TABLE tasks ADD COLUMN is_recurring INTEGER DEFAULT 0`, (err) => {
                  if (err) {
                    console.error('Error adding is_recurring column:', err);
                  } else {
                    console.log('Added is_recurring column to tasks table');
                  }
                });
              }

              // Migration: assets_link
              if (!columnNames.includes('assets_link')) {
                db.run(`ALTER TABLE tasks ADD COLUMN assets_link TEXT`, (err) => {
                  if (err) {
                    console.error('Error adding assets_link column:', err);
                  } else {
                    console.log('Added assets_link column to tasks table');
                  }
                });
              }

              // Migration: uptime_status
              if (!columnNames.includes('uptime_status')) {
                db.run(`ALTER TABLE tasks ADD COLUMN uptime_status TEXT`, (err) => {
                  if (err) {
                    console.error('Error adding uptime_status column:', err);
                  } else {
                    console.log('Added uptime_status column to tasks table');
                  }
                });
              }

              // Migration: public_uuid (SQLite não permite UNIQUE diretamente, adicionar sem UNIQUE primeiro)
              if (!columnNames.includes('public_uuid')) {
                db.run(`ALTER TABLE tasks ADD COLUMN public_uuid TEXT`, (err) => {
                  if (err) {
                    console.error('Error adding public_uuid column:', err);
                  } else {
                    console.log('Added public_uuid column to tasks table');
                    // Criar índice único separadamente se necessário
                    db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_public_uuid ON tasks(public_uuid) WHERE public_uuid IS NOT NULL`, (idxErr) => {
                      if (idxErr) {
                        console.error('Error creating unique index for public_uuid:', idxErr);
                      }
                    });
                  }
                });
              }

              db.run(`
                CREATE TABLE IF NOT EXISTS activity_log (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  user_id INTEGER NOT NULL,
                  task_id INTEGER,
                  action_type TEXT NOT NULL,
                  action_description TEXT,
                  old_data TEXT,
                  new_data TEXT,
                  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                  FOREIGN KEY (user_id) REFERENCES users(id),
                  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL
                )
              `, (err) => {
                if (err) {
                  console.error('Error creating activity_log table:', err);
                } else {
                  console.log('Activity log table created successfully');
                }

                db.run(`
                  CREATE INDEX IF NOT EXISTS idx_activity_log_user_id ON activity_log(user_id)
                `, (err) => {
                  if (err) console.error('Error creating activity_log user_id index:', err);
                });

                db.run(`
                  CREATE INDEX IF NOT EXISTS idx_activity_log_task_id ON activity_log(task_id)
                `, (err) => {
                  if (err) console.error('Error creating activity_log task_id index:', err);
                });

                db.run(`
                  CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log(created_at DESC)
                `, (err) => {
                  if (err) console.error('Error creating activity_log created_at index:', err);
                });

                db.run(`
                  CREATE INDEX IF NOT EXISTS idx_activity_log_task_created ON activity_log(task_id, created_at DESC)
                `, (err) => {
                  if (err) console.error('Error creating activity_log composite index:', err);
                });

                // Create subtasks table
                db.run(`
                  CREATE TABLE IF NOT EXISTS subtasks (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    task_id INTEGER NOT NULL,
                    title TEXT NOT NULL,
                    completed INTEGER DEFAULT 0,
                    order_position INTEGER NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
                  )
                `, (err) => {
                  if (err) {
                    console.error('Error creating subtasks table:', err);
                  } else {
                    console.log('Subtasks table created successfully');
                  }

                  // Create index for subtasks
                  db.run(`
                    CREATE INDEX IF NOT EXISTS idx_subtasks_task_id ON subtasks(task_id)
                  `, (err) => {
                    if (err) console.error('Error creating subtasks index:', err);

                    console.log('Database initialized successfully');

                    // Start uptime monitor after database is ready
                    startUptimeMonitor(db, NODE_ENV);

                    resolve();
                  });
                });
              });
            });
          });
        });
      });
    });
  });
}

function checkDomainWithTimeout(domain, timeoutMs) {
  return new Promise((resolve) => {
    let timeoutCleared = false;
    const timeout = setTimeout(() => {
      if (!timeoutCleared) {
        timeoutCleared = true;
        resolve('down');
      }
    }, timeoutMs);

    const protocol = https;
    const req = protocol.request({
      hostname: domain,
      method: 'HEAD',
      timeout: timeoutMs,
      rejectUnauthorized: false
    }, (res) => {
      if (!timeoutCleared) {
        timeoutCleared = true;
        clearTimeout(timeout);
        resolve(res.statusCode >= 200 && res.statusCode < 400 ? 'up' : 'down');
      }
    });

    req.on('error', () => {
      if (!timeoutCleared) {
        timeoutCleared = true;
        clearTimeout(timeout);
        resolve('down');
      }
    });

    req.on('timeout', () => {
      req.destroy();
      if (!timeoutCleared) {
        timeoutCleared = true;
        clearTimeout(timeout);
        resolve('down');
      }
    });

    req.setTimeout(timeoutMs);
    req.end();
  });
}

let uptimeMonitorInterval = null;

function startUptimeMonitor(db, NODE_ENV) {
  if (uptimeMonitorInterval) {
    clearInterval(uptimeMonitorInterval);
  }

  uptimeMonitorInterval = setInterval(async () => {
    try {
      db.all(
        `SELECT id, domain FROM tasks
         WHERE domain IS NOT NULL AND domain != ''
         LIMIT 100`,
        [],
        async (err, tasks) => {
          if (err) {
            console.error('[UptimeMonitor] Error fetching tasks:', err);
            return;
          }

          if (!tasks || tasks.length === 0) {
            return;
          }

          // Process in batches of 20
          const batchSize = 20;
          for (let i = 0; i < tasks.length; i += batchSize) {
            const batch = tasks.slice(i, i + batchSize);

            const checks = batch.map(task => {
              const domain = task.domain.replace(/^https?:\/\//, '').split('/')[0];
              return checkDomainWithTimeout(domain, 5000)
                .then(status => ({ taskId: task.id, status }))
                .catch(() => ({ taskId: task.id, status: 'down' }));
            });

            try {
              const results = await Promise.all(checks);

              const stmt = db.prepare('UPDATE tasks SET uptime_status = ? WHERE id = ?');
              results.forEach(({ taskId, status }) => {
                stmt.run([status, taskId], (err) => {
                  if (err) {
                    console.error(`[UptimeMonitor] Error updating task ${taskId}:`, err);
                  }
                });
              });
              stmt.finalize();

              if (i + batchSize < tasks.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
              }
            } catch (error) {
              console.error('[UptimeMonitor] Error processing batch:', error);
            }
          }
        }
      );
    } catch (error) {
      console.error('[UptimeMonitor] Unexpected error:', error);
    }
  }, 5 * 60 * 1000); // Every 5 minutes

  console.log('[UptimeMonitor] Started monitoring domains');
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

// Rate limiting helper for login
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

// Rate limiting helper for leads (separado)
function checkLeadRateLimit(ip) {
  const now = Date.now();
  const attempts = leadAttempts.get(ip) || { count: 0, resetTime: now + LEAD_RATE_LIMIT_WINDOW };

  if (now > attempts.resetTime) {
    attempts.count = 0;
    attempts.resetTime = now + LEAD_RATE_LIMIT_WINDOW;
  }

  if (attempts.count >= MAX_LEAD_ATTEMPTS) {
    return false;
  }

  attempts.count++;
  leadAttempts.set(ip, attempts);
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
const createLeadsRoutes = require('./routes/leads');

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
    // WebSocket authentication middleware (must be after JWT_SECRET is defined)
    io.use((socket, next) => {
      const token = socket.handshake.auth.token ||
                    (socket.handshake.headers.authorization && socket.handshake.headers.authorization.split(' ')[1]);

      if (!token) {
        if (NODE_ENV === 'development') {
          console.log('[WebSocket] ❌ Authentication failed: No token provided');
        }
        return next(new Error('Authentication error'));
      }

      jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) {
          if (NODE_ENV === 'development') {
            console.log('[WebSocket] ❌ Authentication failed: Invalid token', { error: err.message });
          }
          return next(new Error('Authentication error'));
        }
        socket.userId = decoded.userId;
        socket.userEmail = decoded.email;
        if (NODE_ENV === 'development') {
          console.log('[WebSocket] ✅ Authentication successful', { userId: decoded.userId, email: decoded.email });
        }
        next();
      });
    });

    // WebSocket connection events
    io.on('connection', (socket) => {
      if (NODE_ENV === 'development') {
        console.log('[WebSocket] 🔌 Client connected', { 
          socketId: socket.id, 
          userId: socket.userId, 
          email: socket.userEmail 
        });
      }

      socket.on('disconnect', (reason) => {
        if (NODE_ENV === 'development') {
          console.log('[WebSocket] 🔌 Client disconnected', { 
            socketId: socket.id, 
            userId: socket.userId, 
            reason 
          });
        }
      });

      socket.on('error', (error) => {
        console.error('[WebSocket] ❌ Socket error', { 
          socketId: socket.id, 
          userId: NODE_ENV === 'development' ? socket.userId : '[hidden]', 
          error: error.message 
        });
      });
    });

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

    // Leads route (public, with rate limiting)
    app.use('/api/leads', createLeadsRoutes(db, NODE_ENV, sanitizeString, checkLeadRateLimit));

    // Public view route (no authentication) - must be before auth middleware
    app.get('/api/tasks/view/:uuid', (req, res) => {
      try {
        const uuid = req.params.uuid;

        // Validate UUID format (UUID v4 pattern)
        const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!uuid || !UUID_PATTERN.test(uuid)) {
          return res.status(400).json({ success: false, error: 'UUID inválido' });
        }

        db.get('SELECT client, col_id, updated_at FROM tasks WHERE public_uuid = ?', [uuid], (err, task) => {
          if (err) {
            console.error('[GetPublicTask] Database error:', err);
            return res.status(500).json({
              success: false,
              error: NODE_ENV === 'production' ? 'Erro interno do servidor' : err.message
            });
          }

          if (!task) {
            return res.status(404).json({ success: false, error: 'Projeto não encontrado' });
          }

          // Calculate progress based on col_id: 0=0%, 1=33%, 2=66%, 3=100%
          const progress = Math.round((task.col_id / 3) * 100);
          const colName = ['Descoberta', 'Acordo', 'Construir e Entregar', 'Suporte / Live'][task.col_id] || 'Desconhecido';

          // Return minimal public data
          res.json({
            success: true,
            data: {
              client: task.client,
              status: colName,
              progress: progress,
              updated_at: task.updated_at
            }
          });
        });
      } catch (error) {
        console.error('[GetPublicTask] Unexpected error:', {
          error: error.message,
          uuid: req.params.uuid,
          stack: NODE_ENV === 'development' ? error.stack : undefined
        });
        res.status(500).json({
          success: false,
          error: NODE_ENV === 'production' ? 'Erro interno do servidor' : error.message
        });
      }
    });

    // Tasks routes require authentication - apply middleware before router
    app.use('/api/tasks', authenticateToken);
    app.use('/api/tasks', createTasksRoutes(db, NODE_ENV, sanitizeString, io));

    // Error handlers must be registered after all routes
    setupErrorHandlers();

    server.listen(PORT, () => {
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
