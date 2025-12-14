// Backend Server - VibeWeb OS
// Grug Rule: Tudo em um arquivo primeiro. Separar apenas se >300 linhas.
// Current: ~839 lines - approaching limit but still manageable
// If grows further, consider: routes/auth.js, routes/tasks.js, keep server.js for setup only

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? null : 'dev-secret-change-in-production');
const NODE_ENV = process.env.NODE_ENV || 'development';

// Security: JWT_SECRET obrigatório em produção
if (NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  console.error('ERROR: JWT_SECRET environment variable is required in production!');
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
app.use(cors({
  origin: NODE_ENV === 'production'
    ? process.env.CORS_ORIGIN || 'http://localhost:8080'
    : '*',
  credentials: true
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

// Auth Routes
app.post('/api/auth/login', async (req, res) => {
  try {
    // Validate request body exists
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({ success: false, error: 'Corpo da requisição inválido' });
    }

    const { email, password } = req.body;

    // Rate limiting
    const clientIp = req.ip || req.headers['x-forwarded-for']?.split(',')[0] || req.connection.remoteAddress || 'unknown';
    if (!checkRateLimit(clientIp)) {
      return res.status(429).json({
        success: false,
        error: 'Muitas tentativas. Tente novamente em 15 minutos.'
      });
    }

    // Validation
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email e senha são obrigatórios' });
    }

    const emailTrimmed = sanitizeString(email.toLowerCase(), 255);
    if (!validateEmail(emailTrimmed)) {
      return res.status(400).json({ success: false, error: 'Email inválido' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, error: 'Senha deve ter no mínimo 6 caracteres' });
    }

    // Find user (prepared statement)
    db.get('SELECT * FROM users WHERE email = ?', [emailTrimmed], async (err, user) => {
      if (err) {
        console.error('[Login] Database error:', {
          error: err.message,
          email: emailTrimmed,
          stack: NODE_ENV === 'development' ? err.stack : undefined
        });
        return res.status(500).json({
          success: false,
          error: NODE_ENV === 'production' ? 'Erro interno do servidor' : err.message
        });
      }

      // Timing attack prevention: sempre executar bcrypt.compare
      // Use dummy hash if user doesn't exist to prevent timing attacks
      // Attacker can't determine if user exists by response time
      const passwordHash = user ? user.password_hash : '$2b$10$dummyhashfordummyuserpreventingtimingattacks';
      const isValid = await bcrypt.compare(password, passwordHash);

      if (!user || !isValid) {
        return res.status(401).json({ success: false, error: 'Email ou senha incorretos' });
      }

      // Generate JWT
      const token = jwt.sign(
        { userId: user.id, email: user.email },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      res.json({
        success: true,
        data: {
          user: {
            id: user.id,
            name: user.name,
            email: user.email
          },
          token
        }
      });
    });
  } catch (error) {
    console.error('[Login] Unexpected error:', {
      error: error.message,
      stack: NODE_ENV === 'development' ? error.stack : undefined
    });
    res.status(500).json({
      success: false,
      error: NODE_ENV === 'production' ? 'Erro interno do servidor' : error.message
    });
  }
});

app.get('/api/auth/me', authenticateToken, (req, res) => {
  try {
    db.get('SELECT id, name, email, created_at FROM users WHERE id = ?', [req.user.id], (err, user) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({
          success: false,
          error: NODE_ENV === 'production' ? 'Erro interno do servidor' : err.message
        });
      }

      if (!user) {
        return res.status(404).json({ success: false, error: 'Usuário não encontrado' });
      }

      res.json({
        success: true,
        data: { user }
      });
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      error: NODE_ENV === 'production' ? 'Erro interno do servidor' : error.message
    });
  }
});

// Tasks Routes
app.get('/api/tasks', authenticateToken, (req, res) => {
  try {
    db.all(
      'SELECT * FROM tasks WHERE user_id = ? ORDER BY col_id, order_position',
      [req.user.id],
      (err, tasks) => {
        if (err) {
          console.error('Database error:', err);
          return res.status(500).json({
            success: false,
            error: NODE_ENV === 'production' ? 'Erro interno do servidor' : err.message
          });
        }

        res.json({
          success: true,
          data: tasks || []
        });
      }
    );
  } catch (error) {
    console.error('Get tasks error:', error);
    res.status(500).json({
      success: false,
      error: NODE_ENV === 'production' ? 'Erro interno do servidor' : error.message
    });
  }
});

app.get('/api/tasks/:id', authenticateToken, (req, res) => {
  try {
    const taskId = parseInt(req.params.id);
    if (isNaN(taskId)) {
      return res.status(400).json({ success: false, error: 'ID inválido' });
    }

    db.get(
      'SELECT * FROM tasks WHERE id = ? AND user_id = ?',
      [taskId, req.user.id],
      (err, task) => {
        if (err) {
          console.error('Database error:', err);
          return res.status(500).json({
            success: false,
            error: NODE_ENV === 'production' ? 'Erro interno do servidor' : err.message
          });
        }

        if (!task) {
          return res.status(404).json({ success: false, error: 'Recurso não encontrado' });
        }

        res.json({
          success: true,
          data: task
        });
      }
    );
  } catch (error) {
    console.error('Get task error:', error);
    res.status(500).json({
      success: false,
      error: NODE_ENV === 'production' ? 'Erro interno do servidor' : error.message
    });
  }
});

app.post('/api/tasks', authenticateToken, (req, res) => {
  try {
    // Validate request body exists
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({ success: false, error: 'Corpo da requisição inválido' });
    }

    const {
      client,
      contact,
      type,
      stack,
      domain,
      description,
      price,
      // Accept both snake_case (preferred) and camelCase (for compatibility)
      payment_status,
      paymentStatus,
      deadline,
      deadline_timestamp,
      deadlineTimestamp,
      hosting,
      col_id,
      colId,
      order_position,
      order
    } = req.body;

    // Validation
    const clientSanitized = sanitizeString(client, 255);
    if (!clientSanitized) {
      return res.status(400).json({ success: false, error: 'Nome do cliente é obrigatório' });
    }

    const priceNum = parseFloat(price);
    if (isNaN(priceNum) || priceNum < 0 || priceNum > 999999.99) {
      return res.status(400).json({ success: false, error: 'Preço deve ser um número positivo válido' });
    }

    // Prefer snake_case, fallback to camelCase for compatibility
    const colIdNum = parseInt(col_id !== undefined ? col_id : colId);
    if (isNaN(colIdNum) || colIdNum < 0 || colIdNum > 3) {
      return res.status(400).json({ success: false, error: 'col_id/colId deve ser entre 0 e 3' });
    }

    const orderNum = (order_position !== undefined && order_position !== null)
      ? parseInt(order_position)
      : (order !== undefined && order !== null ? parseInt(order) : 0);
    if (isNaN(orderNum) || orderNum < 0) {
      return res.status(400).json({ success: false, error: 'order_position/order deve ser >= 0' });
    }

    // Validate domain if provided
    const domainSanitized = domain ? sanitizeString(domain, 255) : null;
    if (domainSanitized) {
      const urlPattern = /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/i;
      const simpleDomainPattern = /^([\da-z\.-]+)\.([a-z\.]{2,6})$/i;
      if (!urlPattern.test(domainSanitized) && !simpleDomainPattern.test(domainSanitized)) {
        return res.status(400).json({ success: false, error: 'Formato de URL/domínio inválido' });
      }
    }

    // Validate contact if provided
    const contactSanitized = contact ? sanitizeString(contact, 255) : null;
    if (contactSanitized) {
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const contactPattern = /^[@]?[\w\-\.]+$/;
      if (!emailPattern.test(contactSanitized) && !contactPattern.test(contactSanitized)) {
        return res.status(400).json({ success: false, error: 'Formato de contato inválido. Use email ou @username' });
      }
    }

    // Generate ID if not provided or if exists
    let taskId = req.body.id !== undefined && req.body.id !== null
      ? parseInt(req.body.id)
      : Date.now();
    if (isNaN(taskId)) {
      taskId = Date.now();
    }

    // Check if ID exists
    db.get('SELECT id FROM tasks WHERE id = ?', [taskId], (err, existing) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({
          success: false,
          error: NODE_ENV === 'production' ? 'Erro interno do servidor' : err.message
        });
      }

      if (existing) {
        taskId = Date.now();
      }

      const descriptionSanitized = description ? sanitizeString(description, 5000) : null;

      db.run(
        `INSERT INTO tasks (
          id, user_id, client, contact, type, stack, domain, description,
          price, payment_status, deadline, deadline_timestamp, hosting,
          col_id, order_position
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          taskId,
          req.user.id,
          clientSanitized,
          contactSanitized,
          type || null,
          stack ? sanitizeString(stack, 255) : null,
          domainSanitized,
          descriptionSanitized,
          priceNum,
          payment_status || paymentStatus || 'Pendente',
          deadline || null,
          deadline_timestamp || deadlineTimestamp || null,
          hosting || 'nao',
          colIdNum,
          orderNum
        ],
        function (err) {
          if (err) {
            console.error('Database error:', err);
            return res.status(500).json({
              success: false,
              error: NODE_ENV === 'production' ? 'Erro interno do servidor' : err.message
            });
          }

          db.get('SELECT * FROM tasks WHERE id = ?', [taskId], (err, task) => {
            if (err) {
              console.error('Database error:', err);
              return res.status(500).json({
                success: false,
                error: NODE_ENV === 'production' ? 'Erro interno do servidor' : err.message
              });
            }

            res.status(201).json({
              success: true,
              data: task
            });
          });
        }
      );
    });
  } catch (error) {
    console.error('Create task error:', error);
    res.status(500).json({
      success: false,
      error: NODE_ENV === 'production' ? 'Erro interno do servidor' : error.message
    });
  }
});

app.put('/api/tasks/:id', authenticateToken, (req, res) => {
  try {
    const taskId = parseInt(req.params.id);
    if (isNaN(taskId)) {
      return res.status(400).json({ success: false, error: 'ID inválido' });
    }

    // Verify ownership first
    db.get('SELECT * FROM tasks WHERE id = ? AND user_id = ?', [taskId, req.user.id], (err, existing) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({
          success: false,
          error: NODE_ENV === 'production' ? 'Erro interno do servidor' : err.message
        });
      }

      if (!existing) {
        return res.status(404).json({ success: false, error: 'Recurso não encontrado' });
      }

      // Validate request body exists
      if (!req.body || typeof req.body !== 'object') {
        return res.status(400).json({ success: false, error: 'Corpo da requisição inválido' });
      }

      const {
        client,
        contact,
        type,
        stack,
        domain,
        description,
        price,
        // Accept both snake_case (preferred) and camelCase (for compatibility)
        payment_status,
        paymentStatus,
        deadline,
        deadline_timestamp,
        deadlineTimestamp,
        hosting,
        col_id,
        colId,
        order_position,
        order
      } = req.body;

      // Validation
      const clientSanitized = sanitizeString(client, 255);
      if (!clientSanitized) {
        return res.status(400).json({ success: false, error: 'Nome do cliente é obrigatório' });
      }

      const priceNum = parseFloat(price);
      if (isNaN(priceNum) || priceNum < 0 || priceNum > 999999.99) {
        return res.status(400).json({ success: false, error: 'Preço deve ser um número positivo válido' });
      }

      // Prefer snake_case, fallback to camelCase for compatibility
      const colIdNum = parseInt(col_id !== undefined ? col_id : colId);
      if (isNaN(colIdNum) || colIdNum < 0 || colIdNum > 3) {
        return res.status(400).json({ success: false, error: 'col_id/colId deve ser entre 0 e 3' });
      }

      const orderNum = (order_position !== undefined && order_position !== null)
        ? parseInt(order_position)
        : (order !== undefined && order !== null
          ? parseInt(order)
          : (existing.order_position || 0));
      if (isNaN(orderNum) || orderNum < 0) {
        return res.status(400).json({ success: false, error: 'order_position/order deve ser >= 0' });
      }

      // Validate domain if provided
      const domainSanitized = domain ? sanitizeString(domain, 255) : null;
      if (domainSanitized) {
        const urlPattern = /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/i;
        const simpleDomainPattern = /^([\da-z\.-]+)\.([a-z\.]{2,6})$/i;
        if (!urlPattern.test(domainSanitized) && !simpleDomainPattern.test(domainSanitized)) {
          return res.status(400).json({ success: false, error: 'Formato de URL/domínio inválido' });
        }
      }

      // Validate contact if provided
      const contactSanitized = contact ? sanitizeString(contact, 255) : null;
      if (contactSanitized) {
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const contactPattern = /^[@]?[\w\-\.]+$/;
        if (!emailPattern.test(contactSanitized) && !contactPattern.test(contactSanitized)) {
          return res.status(400).json({ success: false, error: 'Formato de contato inválido. Use email ou @username' });
        }
      }

      const descriptionSanitized = description ? sanitizeString(description, 5000) : null;

      // Preserve deadline_timestamp if deadline hasn't changed
      // Accept both snake_case and camelCase
      let finalDeadlineTimestamp = deadline_timestamp || deadlineTimestamp;
      if (deadline === existing.deadline && existing.deadline_timestamp) {
        finalDeadlineTimestamp = existing.deadline_timestamp;
      }

      db.run(
        `UPDATE tasks SET
          client = ?, contact = ?, type = ?, stack = ?, domain = ?, description = ?,
          price = ?, payment_status = ?, deadline = ?, deadline_timestamp = ?, hosting = ?,
          col_id = ?, order_position = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND user_id = ?`,
        [
          clientSanitized,
          contactSanitized,
          type || null,
          stack ? sanitizeString(stack, 255) : null,
          domainSanitized,
          descriptionSanitized,
          priceNum,
          payment_status || paymentStatus || existing.payment_status,
          deadline || null,
          finalDeadlineTimestamp || null,
          hosting || existing.hosting,
          colIdNum,
          orderNum,
          taskId,
          req.user.id
        ],
        function (err) {
          if (err) {
            console.error('Database error:', err);
            return res.status(500).json({
              success: false,
              error: NODE_ENV === 'production' ? 'Erro interno do servidor' : err.message
            });
          }

          db.get('SELECT * FROM tasks WHERE id = ?', [taskId], (err, task) => {
            if (err) {
              console.error('Database error:', err);
              return res.status(500).json({
                success: false,
                error: NODE_ENV === 'production' ? 'Erro interno do servidor' : err.message
              });
            }

            res.json({
              success: true,
              data: task
            });
          });
        }
      );
    });
  } catch (error) {
    console.error('Update task error:', error);
    res.status(500).json({
      success: false,
      error: NODE_ENV === 'production' ? 'Erro interno do servidor' : error.message
    });
  }
});

app.delete('/api/tasks/:id', authenticateToken, (req, res) => {
  try {
    const taskId = parseInt(req.params.id);
    if (isNaN(taskId)) {
      return res.status(400).json({ success: false, error: 'ID inválido' });
    }

    db.run(
      'DELETE FROM tasks WHERE id = ? AND user_id = ?',
      [taskId, req.user.id],
      function (err) {
        if (err) {
          console.error('Database error:', err);
          return res.status(500).json({
            success: false,
            error: NODE_ENV === 'production' ? 'Erro interno do servidor' : err.message
          });
        }

        if (this.changes === 0) {
          return res.status(404).json({ success: false, error: 'Recurso não encontrado' });
        }

        res.json({
          success: true,
          data: { message: 'Task deletada com sucesso' }
        });
      }
    );
  } catch (error) {
    console.error('Delete task error:', error);
    res.status(500).json({
      success: false,
      error: NODE_ENV === 'production' ? 'Erro interno do servidor' : error.message
    });
  }
});

app.patch('/api/tasks/:id/move', authenticateToken, (req, res) => {
  try {
    const taskId = parseInt(req.params.id);
    if (isNaN(taskId)) {
      return res.status(400).json({ success: false, error: 'ID inválido' });
    }

    // Validate request body exists
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({ success: false, error: 'Corpo da requisição inválido' });
    }

    // Accept both snake_case (preferred) and camelCase (for compatibility)
    const { col_id, colId, order_position, order } = req.body;

    // Prefer snake_case, fallback to camelCase
    const colIdNum = parseInt(col_id !== undefined ? col_id : colId);
    if (isNaN(colIdNum) || colIdNum < 0 || colIdNum > 3) {
      return res.status(400).json({ success: false, error: 'col_id/colId deve ser entre 0 e 3' });
    }

    const orderNum = parseInt(order_position !== undefined ? order_position : order);
    if (isNaN(orderNum) || orderNum < 0) {
      return res.status(400).json({ success: false, error: 'order_position/order deve ser >= 0' });
    }

    // Verify ownership
    db.get('SELECT * FROM tasks WHERE id = ? AND user_id = ?', [taskId, req.user.id], (err, task) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({
          success: false,
          error: NODE_ENV === 'production' ? 'Erro interno do servidor' : err.message
        });
      }

      if (!task) {
        return res.status(404).json({ success: false, error: 'Recurso não encontrado' });
      }

      // Update task position
      db.run(
        'UPDATE tasks SET col_id = ?, order_position = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?',
        [colIdNum, orderNum, taskId, req.user.id],
        function (err) {
          if (err) {
            console.error('Database error:', err);
            return res.status(500).json({
              success: false,
              error: NODE_ENV === 'production' ? 'Erro interno do servidor' : err.message
            });
          }

          db.get('SELECT * FROM tasks WHERE id = ?', [taskId], (err, updatedTask) => {
            if (err) {
              console.error('Database error:', err);
              return res.status(500).json({
                success: false,
                error: NODE_ENV === 'production' ? 'Erro interno do servidor' : err.message
              });
            }

            res.json({
              success: true,
              data: updatedTask
            });
          });
        }
      );
    });
  } catch (error) {
    console.error('Move task error:', error);
    res.status(500).json({
      success: false,
      error: NODE_ENV === 'production' ? 'Erro interno do servidor' : error.message
    });
  }
});

// Error handler (must be last middleware)
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

// Start server
initDatabase()
  .then(() => {
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
