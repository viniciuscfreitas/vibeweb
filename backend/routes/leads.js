// Leads Routes - Public webhook for lead generation
// Grug Rule: Separated from tasks.js for better organization

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONTACT_PATTERN = /^[@]?[\w\-\.]+$/;

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

function createLeadsRoutes(db, NODE_ENV, sanitizeString, checkLeadRateLimit, io) {
  const router = require('express').Router();

  // Public webhook for leads (no authentication, but with rate limiting)
  router.post('/', (req, res) => {
    try {
      const clientIp = getClientIp(req);

      // Rate limiting: 10 requests per hour per IP (separado do login)
      if (!checkLeadRateLimit(clientIp)) {
        return res.status(429).json({
          success: false,
          error: 'Muitas requisições. Tente novamente em 1 hora.'
        });
      }

      // Validate request body exists
      if (!req.body || typeof req.body !== 'object') {
        return res.status(400).json({ success: false, error: 'Corpo da requisição inválido' });
      }

      const { client, contact, description, source } = req.body;

      const isWhatsAppClick = source === 'WhatsApp' && !client && !contact;
      
      const clientName = client || (isWhatsAppClick ? 'Visitante WhatsApp' : null);
      const contactInfo = contact || (isWhatsAppClick ? 'Clique no Botão' : null);
      const leadDescription = description || (isWhatsAppClick ? 'Interesse via clique no botão do WhatsApp pelo site.' : null);

      const clientSanitized = clientName ? sanitizeString(clientName, 255) : null;
      const contactSanitized = contactInfo ? sanitizeString(contactInfo, 255) : null;
      const descriptionSanitized = leadDescription ? sanitizeString(leadDescription, 5000) : null;
      const sourceSanitized = source ? sanitizeString(source, 100) : null;

      if (!clientSanitized || clientSanitized.trim().length === 0) {
        return res.status(400).json({ success: false, error: 'Campo client é obrigatório' });
      }
      if (!contactSanitized || contactSanitized.trim().length === 0) {
        return res.status(400).json({ success: false, error: 'Campo contact é obrigatório' });
      }

      if (clientSanitized.length > 255 || contactSanitized.length > 255 || (descriptionSanitized && descriptionSanitized.length > 5000)) {
        return res.status(400).json({ success: false, error: 'Campos excedem tamanho máximo permitido' });
      }

      if (!isWhatsAppClick && !EMAIL_PATTERN.test(contactSanitized) && !CONTACT_PATTERN.test(contactSanitized)) {
        return res.status(400).json({ success: false, error: 'Formato de contato inválido. Use email ou @username' });
      }

      // Get first user ID (or use user_id = 1 as default)
      db.get('SELECT id FROM users ORDER BY id LIMIT 1', [], (err, user) => {
        if (err) {
          console.error('[CreateLead] Error fetching user:', err);
          return res.status(500).json({
            success: false,
            error: NODE_ENV === 'production' ? 'Erro interno do servidor' : err.message
          });
        }

        const userId = user ? user.id : 1;

        // Create task automatically in column 0 (Descoberta)
        db.run(
          `INSERT INTO tasks (
            user_id, client, contact, description, price, payment_status,
            col_id, order_position, type
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            userId,
            clientSanitized,
            contactSanitized,
            descriptionSanitized,
            0, // Default price
            'Pendente',
            0, // Descoberta column
            0, // Order position
            sourceSanitized || 'Lead Externo'
          ],
          function (err) {
            if (err) {
              console.error('[CreateLead] Error creating task:', err);
              // Return generic error, don't expose database details
              return res.status(500).json({
                success: false,
                error: 'Erro ao processar lead. Tente novamente mais tarde.'
              });
            }

            const taskId = this.lastID;

            if (io) {
              const newTask = {
                id: taskId,
                user_id: userId,
                client: clientSanitized,
                contact: contactSanitized,
                description: descriptionSanitized,
                price: 0,
                payment_status: 'Pendente',
                col_id: 0,
                order_position: 0,
                type: sourceSanitized || 'Lead Externo',
                created_at: new Date().toISOString().replace('T', ' ').substring(0, 19),
                updated_at: new Date().toISOString().replace('T', ' ').substring(0, 19)
              };

              io.emit('task:created', {
                task: newTask,
                userId: userId,
                userName: 'Sistema (GTM)',
                actionDescription: `Novo lead de ${clientSanitized} via ${sourceSanitized || 'Site'}`
              });
            }

            res.json({
              success: true,
              data: {
                message: 'Lead criado com sucesso',
                taskId: taskId
              }
            });
          }
        );
      });
    } catch (error) {
      console.error('[CreateLead] Unexpected error:', {
        error: error.message,
        stack: NODE_ENV === 'development' ? error.stack : undefined
      });
      res.status(500).json({
        success: false,
        error: NODE_ENV === 'production' ? 'Erro interno do servidor' : error.message
      });
    }
  });

  return router;
}

module.exports = createLeadsRoutes;
