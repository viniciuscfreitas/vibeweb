// Auth Routes - VibeWeb OS
// Grug Rule: Separated from server.js for better organization (>300 lines rule)

const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

// Dummy hash válido de bcrypt para prevenir timing attacks
const DUMMY_PASSWORD_HASH = '$2b$10$QifQjXA8GUTxPTixOWuG8eIaT0Grw/o9C1FkQye/KKnJy5hH6KWQe';

const USERNAME_REGEX = /^[a-zA-Z0-9_-]{3,30}$/;

const QUERY_USER_BY_EMAIL = 'SELECT * FROM users WHERE email = ?';
const QUERY_USER_BY_USERNAME = 'SELECT * FROM users WHERE username = ?';
const QUERY_USER_BY_ID = 'SELECT id, name, email, created_at FROM users WHERE id = ?';

function getClientIp(req) {
  if (req.ip) return req.ip;

  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const trimmed = forwarded.trim();
    if (trimmed) {
      const firstIp = trimmed.split(',')[0];
      return firstIp.trim();
    }
  }

  return req.connection?.remoteAddress || 'unknown';
}

// Grug Rule: Group related parameters into config object (max 3-4 params)
function createAuthRoutes(config) {
  const { db, JWT_SECRET, NODE_ENV, checkRateLimit, validateEmail, sanitizeString, authenticateToken } = config;
  const router = require('express').Router();

  // Login route (no auth required)
  router.post('/login', async (req, res) => {
    try {
      // Validate request body exists
      if (!req.body || typeof req.body !== 'object') {
        return res.status(400).json({ success: false, error: 'Corpo da requisição inválido' });
      }

      const { email, username, password } = req.body;
      const loginIdentifier = email || username;

      const clientIp = getClientIp(req);
      if (!checkRateLimit(clientIp)) {
        return res.status(429).json({
          success: false,
          error: 'Muitas tentativas. Tente novamente em 15 minutos.'
        });
      }

      if (!loginIdentifier || !password) {
        return res.status(400).json({ success: false, error: 'Email/usuário e senha são obrigatórios' });
      }

      if (password.length < 6 || password.length > 128) {
        return res.status(400).json({ success: false, error: 'Senha deve ter entre 6 e 128 caracteres' });
      }

      const identifierTrimmed = sanitizeString(loginIdentifier.toLowerCase(), 255);
      const isEmail = validateEmail(identifierTrimmed);

      if (!isEmail) {
        if (!USERNAME_REGEX.test(identifierTrimmed)) {
          return res.status(400).json({
            success: false,
            error: 'Formato de usuário inválido. Use apenas letras, números, underscore e hífen (3-30 caracteres)'
          });
        }
      }

      const query = isEmail ? QUERY_USER_BY_EMAIL : QUERY_USER_BY_USERNAME;
      const queryParams = [identifierTrimmed];

      db.get(query, queryParams, async (err, user) => {
        if (err) {
          console.error('[Login] Database error:', {
            error: err.message,
            identifier: identifierTrimmed,
            stack: NODE_ENV === 'development' ? err.stack : undefined
          });
          return res.status(500).json({
            success: false,
            error: NODE_ENV === 'production' ? 'Erro interno do servidor' : err.message
          });
        }

        try {
          // Timing attack prevention: sempre executar bcrypt.compare
          // Use dummy hash if user doesn't exist to prevent timing attacks
          // Attacker can't determine if user exists by response time
          const passwordHash = user ? user.password_hash : DUMMY_PASSWORD_HASH;
          const isValid = await bcrypt.compare(password, passwordHash);

          if (!user || !isValid) {
            return res.status(401).json({ success: false, error: 'Usuário ou senha incorretos' });
          }

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
        } catch (error) {
          console.error('[Login] Error in callback:', {
            error: error.message,
            identifier: identifierTrimmed,
            stack: NODE_ENV === 'development' ? error.stack : undefined
          });
          return res.status(500).json({
            success: false,
            error: NODE_ENV === 'production' ? 'Erro interno do servidor' : error.message
          });
        }
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

  // Get current user route (requires authentication)
  router.get('/me', authenticateToken, (req, res) => {
    try {
      if (!req.user || !req.user.id) {
        return res.status(401).json({ success: false, error: 'Não autenticado' });
      }

      db.get(QUERY_USER_BY_ID, [req.user.id], (err, user) => {
        if (err) {
          console.error('[GetUser] Database error:', {
            error: err.message,
            userId: req.user.id,
            stack: NODE_ENV === 'development' ? err.stack : undefined
          });
          return res.status(500).json({
            success: false,
            error: NODE_ENV === 'production' ? 'Erro interno do servidor' : err.message
          });
        }

        try {
          if (!user) {
            return res.status(404).json({ success: false, error: 'Usuário não encontrado' });
          }

          res.json({
            success: true,
            data: { user }
          });
        } catch (error) {
          console.error('[GetUser] Error in callback:', {
            error: error.message,
            userId: req.user.id,
            stack: NODE_ENV === 'development' ? error.stack : undefined
          });
          return res.status(500).json({
            success: false,
            error: NODE_ENV === 'production' ? 'Erro interno do servidor' : error.message
          });
        }
      });
    } catch (error) {
      console.error('[GetUser] Unexpected error:', {
        error: error.message,
        stack: NODE_ENV === 'development' ? error.stack : undefined
      });
      res.status(500).json({
        success: false,
        error: NODE_ENV === 'production' ? 'Erro interno do servidor' : error.message
      });
    }
  });

  // Update profile route (name, email)
  router.put('/profile', authenticateToken, (req, res) => {
    try {
      if (!req.body || typeof req.body !== 'object') {
        return res.status(400).json({ success: false, error: 'Corpo da requisição inválido' });
      }

      const { name, email } = req.body;
      const updates = [];
      const values = [];

      if (name !== undefined) {
        const nameTrimmed = sanitizeString(name, 255);
        if (!nameTrimmed || nameTrimmed.length < 2 || nameTrimmed.length > 100) {
          return res.status(400).json({ success: false, error: 'Nome deve ter entre 2 e 100 caracteres' });
        }
        updates.push('name = ?');
        values.push(nameTrimmed);
      }

      if (email !== undefined) {
        const emailTrimmed = sanitizeString(email.toLowerCase(), 255);
        if (!validateEmail(emailTrimmed)) {
          return res.status(400).json({ success: false, error: 'Email inválido' });
        }

        db.get('SELECT id FROM users WHERE email = ? AND id != ?', [emailTrimmed, req.user.id], (err, existing) => {
          if (err) {
            console.error('[UpdateProfile] Database error checking email:', err);
            return res.status(500).json({ success: false, error: 'Erro ao verificar email' });
          }
          if (existing) {
            return res.status(400).json({ success: false, error: 'Email já está em uso' });
          }

          updates.push('email = ?');
          values.push(emailTrimmed);

          values.push(req.user.id);
          const updateQuery = `UPDATE users SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
          db.run(updateQuery, values, function(err) {
            if (err) {
              console.error('[UpdateProfile] Database error:', err);
              return res.status(500).json({ success: false, error: 'Erro ao atualizar perfil' });
            }

            db.get(QUERY_USER_BY_ID, [req.user.id], (err, user) => {
              if (err || !user) {
                return res.status(500).json({ success: false, error: 'Erro ao buscar usuário atualizado' });
              }
              res.json({ success: true, data: { user } });
            });
          });
        });
        return;
      }

      if (updates.length === 0) {
        return res.status(400).json({ success: false, error: 'Nenhum campo para atualizar' });
      }

      values.push(req.user.id);
      const updateQuery = `UPDATE users SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
      db.run(updateQuery, values, function(err) {
        if (err) {
          console.error('[UpdateProfile] Database error:', err);
          return res.status(500).json({ success: false, error: 'Erro ao atualizar perfil' });
        }

        db.get(QUERY_USER_BY_ID, [req.user.id], (err, user) => {
          if (err || !user) {
            return res.status(500).json({ success: false, error: 'Erro ao buscar usuário atualizado' });
          }
          res.json({ success: true, data: { user } });
        });
      });
    } catch (error) {
      console.error('[UpdateProfile] Unexpected error:', error);
      res.status(500).json({ success: false, error: 'Erro interno do servidor' });
    }
  });

  // Update password route
  router.put('/password', authenticateToken, async (req, res) => {
    try {
      if (!req.body || typeof req.body !== 'object') {
        return res.status(400).json({ success: false, error: 'Corpo da requisição inválido' });
      }

      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        return res.status(400).json({ success: false, error: 'Senha atual e nova senha são obrigatórias' });
      }

      if (newPassword.length < 6 || newPassword.length > 128) {
        return res.status(400).json({ success: false, error: 'Nova senha deve ter entre 6 e 128 caracteres' });
      }

      db.get('SELECT password_hash FROM users WHERE id = ?', [req.user.id], async (err, user) => {
        if (err || !user) {
          return res.status(500).json({ success: false, error: 'Erro ao buscar usuário' });
        }

        const isValid = await bcrypt.compare(currentPassword, user.password_hash);
        if (!isValid) {
          return res.status(401).json({ success: false, error: 'Senha atual incorreta' });
        }

        const newPasswordHash = await bcrypt.hash(newPassword, 10);
        db.run('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [newPasswordHash, req.user.id], function(err) {
          if (err) {
            console.error('[UpdatePassword] Database error:', err);
            return res.status(500).json({ success: false, error: 'Erro ao atualizar senha' });
          }

          res.json({ success: true, message: 'Senha atualizada com sucesso' });
        });
      });
    } catch (error) {
      console.error('[UpdatePassword] Unexpected error:', error);
      res.status(500).json({ success: false, error: 'Erro interno do servidor' });
    }
  });

  return router;
}

module.exports = createAuthRoutes;

