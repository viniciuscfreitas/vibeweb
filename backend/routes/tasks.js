// Tasks Routes - VibeWeb OS
// Grug Rule: Separated from server.js for better organization (>300 lines rule)

const URL_PATTERN = /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/i;
const SIMPLE_DOMAIN_PATTERN = /^([\da-z\.-]+)\.([a-z\.]{2,6})$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONTACT_PATTERN = /^[@]?[\w\-\.]+$/;

function parseDeadlineHours(deadlineStr) {
  if (!deadlineStr) return null;
  const match = deadlineStr.match(/(\d+)h/i);
  return match ? parseInt(match[1]) : null;
}

function calculateDeadlineTimestamp(deadline) {
  if (!deadline) return null;
  const hours = parseDeadlineHours(deadline);
  if (!hours) return null;
  // Calculate future timestamp: current time + hours in milliseconds
  const MS_PER_HOUR = 60 * 60 * 1000;
  return Date.now() + (hours * MS_PER_HOUR);
}

// Helper to send database error response (reduces repetition)
// Grug Rule: Simple helper, no abstraction overhead
function sendDbError(res, err, NODE_ENV, context = '') {
  const prefix = context ? `[${context}] ` : '';
  console.error(`${prefix}Database error:`, {
    error: err.message,
    stack: NODE_ENV === 'development' ? err.stack : undefined
  });
  return res.status(500).json({
    success: false,
    error: NODE_ENV === 'production' ? 'Erro interno do servidor' : err.message
  });
}

function createTasksRoutes(db, NODE_ENV, sanitizeString) {
  const router = require('express').Router();

  // Get all tasks (shared across all users - team collaboration)
  router.get('/', (req, res) => {
    try {
      db.all(
        'SELECT * FROM tasks ORDER BY col_id, order_position',
        [],
        (err, tasks) => {
          if (err) {
            return sendDbError(res, err, NODE_ENV, 'GetTasks');
          }

          res.json({
            success: true,
            data: tasks || []
          });
        }
      );
    } catch (error) {
      console.error('[GetTasks] Unexpected error:', {
        error: error.message,
        stack: NODE_ENV === 'development' ? error.stack : undefined
      });
      res.status(500).json({
        success: false,
        error: NODE_ENV === 'production' ? 'Erro interno do servidor' : error.message
      });
    }
  });

  // Get single task
  router.get('/:id', (req, res) => {
    try {
      const taskId = parseInt(req.params.id);
      if (isNaN(taskId)) {
        return res.status(400).json({ success: false, error: 'ID inválido' });
      }

      db.get(
        'SELECT * FROM tasks WHERE id = ?',
        [taskId],
        (err, task) => {
          if (err) {
            return sendDbError(res, err, NODE_ENV, 'GetTask');
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
      console.error('[GetTask] Unexpected error:', {
        error: error.message,
        taskId: req.params.id,
        stack: NODE_ENV === 'development' ? error.stack : undefined
      });
      res.status(500).json({
        success: false,
        error: NODE_ENV === 'production' ? 'Erro interno do servidor' : error.message
      });
    }
  });

  // Create task
  router.post('/', (req, res) => {
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
        payment_status,
        deadline,
        deadline_timestamp,
        hosting,
        col_id,
        order_position
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

      const colIdNum = parseInt(col_id);
      if (isNaN(colIdNum) || colIdNum < 0 || colIdNum > 3) {
        return res.status(400).json({ success: false, error: 'col_id deve ser 0, 1, 2 ou 3' });
      }

      const orderNum = (order_position !== undefined && order_position !== null)
        ? parseInt(order_position)
        : 0;
      if (isNaN(orderNum) || orderNum < 0) {
        return res.status(400).json({ success: false, error: 'order_position deve ser >= 0' });
      }

      // Validate domain if provided
      const domainSanitized = domain ? sanitizeString(domain, 255) : null;
      if (domainSanitized) {
        if (!URL_PATTERN.test(domainSanitized) && !SIMPLE_DOMAIN_PATTERN.test(domainSanitized)) {
          return res.status(400).json({ success: false, error: 'Formato de URL/domínio inválido' });
        }
      }

      // Validate contact if provided
      const contactSanitized = contact ? sanitizeString(contact, 255) : null;
      if (contactSanitized) {
        if (!EMAIL_PATTERN.test(contactSanitized) && !CONTACT_PATTERN.test(contactSanitized)) {
          return res.status(400).json({ success: false, error: 'Formato de contato inválido. Use email ou @username' });
        }
      }

      // Generate ID if not provided
      // Use timestamp + random to reduce collision chance, then retry on conflict
      let taskId = req.body.id !== undefined && req.body.id !== null
        ? parseInt(req.body.id)
        : Date.now() + Math.floor(Math.random() * 10000);
      if (isNaN(taskId)) {
        taskId = Date.now() + Math.floor(Math.random() * 10000);
      }

      const descriptionSanitized = description ? sanitizeString(description, 5000) : null;

      // Calculate deadline_timestamp if deadline is provided but timestamp is not
      let finalDeadlineTimestamp = deadline_timestamp;
      if (deadline && !finalDeadlineTimestamp) {
        finalDeadlineTimestamp = calculateDeadlineTimestamp(deadline);
      }

      // Insert with retry logic to handle race conditions
      function attemptInsert(retryCount = 0) {
        const MAX_RETRIES = 5;

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
            payment_status || 'Pendente',
            deadline || null,
            finalDeadlineTimestamp || null,
            hosting || 'nao',
            colIdNum,
            orderNum
          ],
          function (err) {
            if (err) {
              // SQLite error code 19 = SQLITE_CONSTRAINT (UNIQUE constraint failed)
              if (err.code === 'SQLITE_CONSTRAINT' && retryCount < MAX_RETRIES) {
                // ID collision - generate new ID and retry
                taskId = Date.now() + Math.floor(Math.random() * 10000) + retryCount;
                return attemptInsert(retryCount + 1);
              }
              return sendDbError(res, err, NODE_ENV, 'CreateTask');
            }

            const task = {
              id: this.lastID || taskId,
              user_id: req.user.id,
              client: clientSanitized,
              contact: contactSanitized,
              type: type || null,
              stack: stack ? sanitizeString(stack, 255) : null,
              domain: domainSanitized,
              description: descriptionSanitized,
              price: priceNum,
              payment_status: payment_status || 'Pendente',
              deadline: deadline || null,
              deadline_timestamp: finalDeadlineTimestamp || null,
              hosting: hosting || 'nao',
              col_id: colIdNum,
              order_position: orderNum,
              created_at: new Date().toISOString().replace('T', ' ').substring(0, 19),
              updated_at: new Date().toISOString().replace('T', ' ').substring(0, 19)
            };

            res.status(201).json({
              success: true,
              data: task
            });
          }
        );
      }

      attemptInsert();
    } catch (error) {
      console.error('[CreateTask] Unexpected error:', {
        error: error.message,
        stack: NODE_ENV === 'development' ? error.stack : undefined
      });
      res.status(500).json({
        success: false,
        error: NODE_ENV === 'production' ? 'Erro interno do servidor' : error.message
      });
    }
  });

  // Update task
  router.put('/:id', (req, res) => {
    try {
      const taskId = parseInt(req.params.id);
      if (isNaN(taskId)) {
        return res.status(400).json({ success: false, error: 'ID inválido' });
      }

      // Verify task exists (shared access - team collaboration)
      db.get('SELECT * FROM tasks WHERE id = ?', [taskId], (err, existing) => {
        if (err) {
          return sendDbError(res, err, NODE_ENV, 'UpdateTask');
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
          payment_status,
          deadline,
          deadline_timestamp,
          hosting,
          col_id,
          order_position
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

        const colIdNum = parseInt(col_id);
        if (isNaN(colIdNum) || colIdNum < 0 || colIdNum > 3) {
          return res.status(400).json({ success: false, error: 'col_id deve ser entre 0 e 3' });
        }

        const orderNum = (order_position !== undefined && order_position !== null)
          ? parseInt(order_position)
          : (existing.order_position || 0);
        if (isNaN(orderNum) || orderNum < 0) {
          return res.status(400).json({ success: false, error: 'order_position deve ser >= 0' });
        }

        // Validate domain if provided
        const domainSanitized = domain ? sanitizeString(domain, 255) : null;
        if (domainSanitized) {
          if (!URL_PATTERN.test(domainSanitized) && !SIMPLE_DOMAIN_PATTERN.test(domainSanitized)) {
            return res.status(400).json({ success: false, error: 'Formato de URL/domínio inválido' });
          }
        }

        // Validate contact if provided
        const contactSanitized = contact ? sanitizeString(contact, 255) : null;
        if (contactSanitized) {
          if (!EMAIL_PATTERN.test(contactSanitized) && !CONTACT_PATTERN.test(contactSanitized)) {
            return res.status(400).json({ success: false, error: 'Formato de contato inválido. Use email ou @username' });
          }
        }

        const descriptionSanitized = description ? sanitizeString(description, 5000) : null;

        // Calculate deadline_timestamp if deadline changed
        let finalDeadlineTimestamp = deadline_timestamp;
        if (deadline && deadline !== existing.deadline) {
          // Deadline changed - calculate new timestamp
          finalDeadlineTimestamp = calculateDeadlineTimestamp(deadline);
        } else if (deadline === existing.deadline && existing.deadline_timestamp) {
          // Deadline unchanged - preserve existing timestamp
          finalDeadlineTimestamp = existing.deadline_timestamp;
        } else if (deadline && !finalDeadlineTimestamp) {
          // New deadline without timestamp - calculate it
          finalDeadlineTimestamp = calculateDeadlineTimestamp(deadline);
        }

        db.run(
          `UPDATE tasks SET
            client = ?, contact = ?, type = ?, stack = ?, domain = ?, description = ?,
            price = ?, payment_status = ?, deadline = ?, deadline_timestamp = ?, hosting = ?,
            col_id = ?, order_position = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
          [
            clientSanitized,
            contactSanitized,
            type || null,
            stack ? sanitizeString(stack, 255) : null,
            domainSanitized,
            descriptionSanitized,
            priceNum,
            payment_status || existing.payment_status,
            deadline || null,
            finalDeadlineTimestamp || null,
            hosting || existing.hosting,
            colIdNum,
            orderNum,
            taskId
          ],
          function (err) {
            if (err) {
              return sendDbError(res, err, NODE_ENV, 'UpdateTask');
            }

            const task = {
              ...existing,
              client: clientSanitized,
              contact: contactSanitized,
              type: type || null,
              stack: stack ? sanitizeString(stack, 255) : null,
              domain: domainSanitized,
              description: descriptionSanitized,
              price: priceNum,
              payment_status: payment_status || existing.payment_status,
              deadline: deadline || null,
              deadline_timestamp: finalDeadlineTimestamp || null,
              hosting: hosting || existing.hosting,
              col_id: colIdNum,
              order_position: orderNum,
              updated_at: new Date().toISOString().replace('T', ' ').substring(0, 19)
            };

            res.json({
              success: true,
              data: task
            });
          }
        );
      });
    } catch (error) {
      console.error('[UpdateTask] Unexpected error:', {
        error: error.message,
        taskId: req.params.id,
        stack: NODE_ENV === 'development' ? error.stack : undefined
      });
      res.status(500).json({
        success: false,
        error: NODE_ENV === 'production' ? 'Erro interno do servidor' : error.message
      });
    }
  });

  // Delete task
  router.delete('/:id', (req, res) => {
    try {
      const taskId = parseInt(req.params.id);
      if (isNaN(taskId)) {
        return res.status(400).json({ success: false, error: 'ID inválido' });
      }

      // Verify task exists before deleting (more efficient and clearer error handling)
      db.get('SELECT id FROM tasks WHERE id = ?', [taskId], (err, task) => {
        if (err) {
          return sendDbError(res, err, NODE_ENV, 'DeleteTask');
        }

        if (!task) {
          return res.status(404).json({ success: false, error: 'Recurso não encontrado' });
        }

        db.run(
          'DELETE FROM tasks WHERE id = ?',
          [taskId],
          function (err) {
            if (err) {
              return sendDbError(res, err, NODE_ENV, 'DeleteTask');
            }

            res.json({
              success: true,
              data: { message: 'Task deletada com sucesso' }
            });
          }
        );
      });
    } catch (error) {
      console.error('[DeleteTask] Unexpected error:', {
        error: error.message,
        taskId: req.params.id,
        stack: NODE_ENV === 'development' ? error.stack : undefined
      });
      res.status(500).json({
        success: false,
        error: NODE_ENV === 'production' ? 'Erro interno do servidor' : error.message
      });
    }
  });

  // Move task
  router.patch('/:id/move', (req, res) => {
    try {
      const taskId = parseInt(req.params.id);
      if (isNaN(taskId)) {
        return res.status(400).json({ success: false, error: 'ID inválido' });
      }

      // Validate request body exists
      if (!req.body || typeof req.body !== 'object') {
        return res.status(400).json({ success: false, error: 'Corpo da requisição inválido' });
      }

      const { col_id, order_position } = req.body;

      const colIdNum = parseInt(col_id);
      if (isNaN(colIdNum) || colIdNum < 0 || colIdNum > 3) {
        return res.status(400).json({ success: false, error: 'col_id deve ser 0, 1, 2 ou 3' });
      }

      const orderNum = parseInt(order_position);
      if (isNaN(orderNum) || orderNum < 0) {
        return res.status(400).json({ success: false, error: 'order_position deve ser >= 0' });
      }

      // Verify task exists (shared access - team collaboration)
      db.get('SELECT * FROM tasks WHERE id = ?', [taskId], (err, task) => {
        if (err) {
          return sendDbError(res, err, NODE_ENV, 'MoveTask');
        }

        if (!task) {
          return res.status(404).json({ success: false, error: 'Recurso não encontrado' });
        }

        // Update task position
        db.run(
          'UPDATE tasks SET col_id = ?, order_position = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [colIdNum, orderNum, taskId],
          function (err) {
            if (err) {
              return sendDbError(res, err, NODE_ENV, 'MoveTask');
            }

            const updatedTask = {
              ...task,
              col_id: colIdNum,
              order_position: orderNum,
              updated_at: new Date().toISOString().replace('T', ' ').substring(0, 19)
            };

            res.json({
              success: true,
              data: updatedTask
            });
          }
        );
      });
    } catch (error) {
      console.error('[MoveTask] Unexpected error:', {
        error: error.message,
        taskId: req.params.id,
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

module.exports = createTasksRoutes;

