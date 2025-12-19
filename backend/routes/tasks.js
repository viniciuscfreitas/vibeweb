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

function logActivity(db, userId, taskId, actionType, actionDescription, oldData = null, newData = null) {
  if (!db || !userId || !actionType) {
    return;
  }

  const validActionTypes = ['create', 'update', 'delete', 'move'];
  if (!validActionTypes.includes(actionType)) {
    console.error('[ActivityLog] Invalid action_type:', actionType);
    return;
  }

  let oldDataJson = null;
  let newDataJson = null;

  try {
    oldDataJson = oldData ? JSON.stringify(oldData) : null;
  } catch (err) {
    console.error('[ActivityLog] Error stringifying oldData:', err);
    oldDataJson = '[Error serializing data]';
  }

  try {
    newDataJson = newData ? JSON.stringify(newData) : null;
  } catch (err) {
    console.error('[ActivityLog] Error stringifying newData:', err);
    newDataJson = '[Error serializing data]';
  }

  db.run(
    `INSERT INTO activity_log (user_id, task_id, action_type, action_description, old_data, new_data)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [userId, taskId, actionType, actionDescription || null, oldDataJson, newDataJson],
    (err) => {
      if (err) {
        console.error('[ActivityLog] Error logging activity:', {
          error: err.message,
          userId,
          taskId,
          actionType
        });
      }
    }
  );
}

function createTasksRoutes(db, NODE_ENV, sanitizeString, io) {
  const router = require('express').Router();

  router.get('/activities/recent', (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 50;
      const taskIdParam = req.query.task_id;
      let taskId = null;

      if (taskIdParam) {
        taskId = parseInt(taskIdParam);
        if (isNaN(taskId)) {
          return res.status(400).json({ success: false, error: 'task_id inválido' });
        }
      }

      const params = [];
      let query = `
        SELECT
          al.task_id,
          al.action_type,
          al.action_description,
          al.created_at,
          u.name as user_name,
          u.avatar_url as user_avatar_url
        FROM activity_log al
        LEFT JOIN users u ON al.user_id = u.id
      `;

      if (taskId !== null) {
        query += ' WHERE al.task_id = ?';
        params.push(taskId);
      }

      query += ' ORDER BY al.created_at DESC LIMIT ?';
      params.push(limit);

      db.all(query, params, (err, activities) => {
        if (err) {
          return sendDbError(res, err, NODE_ENV, 'GetActivities');
        }

        res.json({
          success: true,
          data: activities || []
        });
      });
    } catch (error) {
      console.error('[GetActivities] Unexpected error:', {
        error: error.message,
        stack: NODE_ENV === 'development' ? error.stack : undefined
      });
      res.status(500).json({
        success: false,
        error: NODE_ENV === 'production' ? 'Erro interno do servidor' : error.message
      });
    }
  });

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
        order_position,
        is_recurring,
        assets_link,
        public_uuid
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

        const assetsLinkSanitized = assets_link ? sanitizeString(assets_link, 2000) : null;
        const publicUuidSanitized = public_uuid ? sanitizeString(public_uuid, 100) : null;

        db.run(
          `INSERT INTO tasks (
            id, user_id, client, contact, type, stack, domain, description,
            price, payment_status, deadline, deadline_timestamp, hosting,
            col_id, order_position, is_recurring, assets_link, public_uuid
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
            orderNum,
            is_recurring === 1 || is_recurring === true ? 1 : 0,
            assetsLinkSanitized,
            publicUuidSanitized
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

            setImmediate(() => {
              logActivity(
                db,
                req.user.id,
                task.id,
                'create',
                `Criou projeto ${clientSanitized}`,
                null,
                { client: clientSanitized, col_id: colIdNum, price: priceNum }
              );

              if (io) {
                if (NODE_ENV === 'development') {
                  console.log('[WebSocket] 📤 Emitting task:created', { 
                    taskId: task.id, 
                    client: task.client, 
                    userId: req.user.id 
                  });
                }
                io.emit('task:created', { task, userId: req.user.id });
              }
            });

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
          order_position,
          is_recurring,
          assets_link,
          public_uuid
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
        const assetsLinkSanitized = assets_link ? sanitizeString(assets_link, 2000) : null;
        const publicUuidSanitized = public_uuid ? sanitizeString(public_uuid, 100) : null;
        const stackSanitized = stack ? sanitizeString(stack, 255) : null;

        let finalDeadlineTimestamp = deadline_timestamp;
        if (deadline && deadline !== existing.deadline) {
          finalDeadlineTimestamp = calculateDeadlineTimestamp(deadline);
        } else if (deadline === existing.deadline && existing.deadline_timestamp) {
          finalDeadlineTimestamp = existing.deadline_timestamp;
        } else if (deadline && !finalDeadlineTimestamp) {
          finalDeadlineTimestamp = calculateDeadlineTimestamp(deadline);
        }

        const isRecurringValue = is_recurring !== undefined
          ? (is_recurring === 1 || is_recurring === true ? 1 : 0)
          : (existing.is_recurring || 0);

        db.run(
          `UPDATE tasks SET
            client = ?, contact = ?, type = ?, stack = ?, domain = ?, description = ?,
            price = ?, payment_status = ?, deadline = ?, deadline_timestamp = ?, hosting = ?,
            col_id = ?, order_position = ?, is_recurring = ?, assets_link = ?, public_uuid = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
          [
            clientSanitized,
            contactSanitized,
            type || null,
            stackSanitized,
            domainSanitized,
            descriptionSanitized,
            priceNum,
            payment_status || existing.payment_status,
            deadline || null,
            finalDeadlineTimestamp || null,
            hosting || existing.hosting,
            colIdNum,
            orderNum,
            isRecurringValue,
            assetsLinkSanitized !== null ? assetsLinkSanitized : existing.assets_link,
            publicUuidSanitized !== null ? publicUuidSanitized : existing.public_uuid,
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
              stack: stackSanitized,
              domain: domainSanitized,
              description: descriptionSanitized,
              price: priceNum,
              payment_status: payment_status || existing.payment_status,
              deadline: deadline || null,
              deadline_timestamp: finalDeadlineTimestamp || null,
              hosting: hosting || existing.hosting,
              col_id: colIdNum,
              order_position: orderNum,
              is_recurring: isRecurringValue,
              assets_link: assetsLinkSanitized !== null ? assetsLinkSanitized : existing.assets_link,
              public_uuid: publicUuidSanitized !== null ? publicUuidSanitized : existing.public_uuid,
              updated_at: new Date().toISOString().replace('T', ' ').substring(0, 19)
            };

            // Log activity - detect what changed
            const changes = [];
            if (existing.client !== clientSanitized) changes.push(`cliente: ${existing.client} → ${clientSanitized}`);
            if (existing.col_id !== colIdNum) {
              const colNames = ['Descoberta', 'Acordo', 'Build', 'Live'];
              changes.push(`status: ${colNames[existing.col_id] || existing.col_id} → ${colNames[colIdNum] || colIdNum}`);
            }
            if (existing.price !== priceNum) changes.push(`preço: €${existing.price} → €${priceNum}`);
            if (existing.payment_status !== (payment_status || existing.payment_status)) {
              changes.push(`pagamento: ${existing.payment_status} → ${payment_status || existing.payment_status}`);
            }

            const actionDescription = changes.length > 0
              ? `Editou projeto ${clientSanitized}: ${changes.join(', ')}`
              : `Editou projeto ${clientSanitized}`;

            setImmediate(() => {
              logActivity(
                db,
                req.user.id,
                taskId,
                'update',
                actionDescription,
                { client: existing.client, col_id: existing.col_id, price: existing.price, payment_status: existing.payment_status },
                { client: clientSanitized, col_id: colIdNum, price: priceNum, payment_status: payment_status || existing.payment_status }
              );

              if (io) {
                if (NODE_ENV === 'development') {
                  console.log('[WebSocket] 📤 Emitting task:updated', { 
                    taskId: task.id, 
                    client: task.client, 
                    userId: req.user.id 
                  });
                }
                io.emit('task:updated', { task, userId: req.user.id });
              }
            });

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

        // Get task data before deletion for logging
        db.get('SELECT client, user_id FROM tasks WHERE id = ?', [taskId], (err, taskData) => {
          if (err) {
            return sendDbError(res, err, NODE_ENV, 'DeleteTask');
          }

          db.run(
            'DELETE FROM tasks WHERE id = ?',
            [taskId],
            function (err) {
              if (err) {
                return sendDbError(res, err, NODE_ENV, 'DeleteTask');
              }

              setImmediate(() => {
                logActivity(
                  db,
                  req.user.id,
                  taskId,
                  'delete',
                  `Deletou projeto ${taskData?.client || 'ID ' + taskId}`,
                  taskData ? { client: taskData.client } : null,
                  null
                );

                if (io) {
                  if (NODE_ENV === 'development') {
                    console.log('[WebSocket] 📤 Emitting task:deleted', { 
                      taskId, 
                      userId: req.user.id 
                    });
                  }
                  io.emit('task:deleted', { taskId, userId: req.user.id });
                }
              });

              res.json({
                success: true,
                data: { message: 'Task deletada com sucesso' }
              });
            }
          );
        });
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

            setImmediate(() => {
              if (task.col_id !== colIdNum) {
                const colNames = ['Descoberta', 'Acordo', 'Build', 'Live'];
                const fromCol = colNames[task.col_id] || task.col_id;
                const toCol = colNames[colIdNum] || colIdNum;

                logActivity(
                  db,
                  req.user.id,
                  taskId,
                  'move',
                  `Moveu projeto ${task.client} de ${fromCol} para ${toCol}`,
                  { col_id: task.col_id, client: task.client },
                  { col_id: colIdNum, client: task.client }
                );
              }

              if (io) {
                if (NODE_ENV === 'development') {
                  console.log('[WebSocket] 📤 Emitting task:moved', { 
                    taskId: updatedTask.id, 
                    client: updatedTask.client,
                    fromCol: task.col_id,
                    toCol: colIdNum,
                    userId: req.user.id 
                  });
                }
                io.emit('task:moved', { task: updatedTask, userId: req.user.id });
              }
            });

            // Check if task was moved to col_id = 3 (Suporte / Live) and is recurring
            if (colIdNum === 3 && task.is_recurring === 1) {
              // Calculate new date: use deadline_timestamp if exists, otherwise created_at + 30 days
              let baseDate;
              if (task.deadline_timestamp) {
                baseDate = new Date(task.deadline_timestamp);
              } else if (task.created_at) {
                baseDate = new Date(task.created_at);
              } else {
                baseDate = new Date(); // Fallback para hoje
              }

              // Validate date
              if (isNaN(baseDate.getTime())) {
                baseDate = new Date(); // Fallback se data inválida
              }

              const newDeadlineDate = new Date(baseDate);
              newDeadlineDate.setDate(newDeadlineDate.getDate() + 30);

              // Calculate deadline_timestamp for new task
              const newDeadlineTimestamp = newDeadlineDate.getTime();

              // Create new cloned task (don't block response if it fails)
              db.run(
                `INSERT INTO tasks (
                  user_id, client, contact, type, stack, domain, description,
                  price, payment_status, deadline, deadline_timestamp, hosting,
                  col_id, order_position, is_recurring, assets_link, public_uuid
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                  task.user_id,
                  task.client,
                  task.contact,
                  task.type,
                  task.stack,
                  task.domain,
                  task.description,
                  task.price,
                  'Pendente', // Reset payment status
                  null, // Deadline will be calculated via timestamp
                  newDeadlineTimestamp,
                  task.hosting,
                  0, // New task in Descoberta column
                  0, // Order position will be adjusted
                  1, // Keep is_recurring = true
                  task.assets_link || null,
                  task.public_uuid || null
                ],
                function (err) {
                  if (err) {
                    // Log error but don't fail movement of original task
                    console.error('[RecurringTask] Error cloning task:', {
                      originalTaskId: task.id,
                      error: err.message
                    });
                  } else {
                    console.log('[RecurringTask] Successfully cloned task', {
                      originalTaskId: task.id,
                      newTaskId: this.lastID
                    });
                  }
                }
              );
            }

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

  // Subtasks routes
  // Get all subtasks for a task
  router.get('/:id/subtasks', (req, res) => {
    try {
      const taskId = parseInt(req.params.id);
      if (isNaN(taskId)) {
        return res.status(400).json({ success: false, error: 'ID inválido' });
      }

      db.all(
        'SELECT * FROM subtasks WHERE task_id = ? ORDER BY order_position',
        [taskId],
        (err, subtasks) => {
          if (err) {
            return sendDbError(res, err, NODE_ENV, 'GetSubtasks');
          }

          res.json({
            success: true,
            data: subtasks || []
          });
        }
      );
    } catch (error) {
      console.error('[GetSubtasks] Unexpected error:', {
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

  // Create subtask
  router.post('/:id/subtasks', (req, res) => {
    try {
      const taskId = parseInt(req.params.id);
      if (isNaN(taskId)) {
        return res.status(400).json({ success: false, error: 'ID inválido' });
      }

      if (!req.body || typeof req.body !== 'object') {
        return res.status(400).json({ success: false, error: 'Corpo da requisição inválido' });
      }

      const { title, order_position } = req.body;
      const titleSanitized = sanitizeString(title, 500);
      if (!titleSanitized) {
        return res.status(400).json({ success: false, error: 'Título da subtarefa é obrigatório' });
      }

      // Verify task exists
      db.get('SELECT id FROM tasks WHERE id = ?', [taskId], (err, task) => {
        if (err) {
          return sendDbError(res, err, NODE_ENV, 'CreateSubtask');
        }

        if (!task) {
          return res.status(404).json({ success: false, error: 'Task não encontrada' });
        }

        // Get max order_position if not provided
        db.get('SELECT MAX(order_position) as max_order FROM subtasks WHERE task_id = ?', [taskId], (err, result) => {
          if (err) {
            return sendDbError(res, err, NODE_ENV, 'CreateSubtask');
          }

          const orderNum = order_position !== undefined ? parseInt(order_position) : ((result?.max_order ?? -1) + 1);

          db.run(
            'INSERT INTO subtasks (task_id, title, completed, order_position) VALUES (?, ?, ?, ?)',
            [taskId, titleSanitized, 0, orderNum],
            function (err) {
              if (err) {
                return sendDbError(res, err, NODE_ENV, 'CreateSubtask');
              }

              db.get('SELECT * FROM subtasks WHERE id = ?', [this.lastID], (err, subtask) => {
                if (err) {
                  return sendDbError(res, err, NODE_ENV, 'CreateSubtask');
                }

                res.json({
                  success: true,
                  data: subtask
                });
              });
            }
          );
        });
      });
    } catch (error) {
      console.error('[CreateSubtask] Unexpected error:', {
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

  // Update subtask
  router.patch('/subtasks/:id', (req, res) => {
    try {
      const subtaskId = parseInt(req.params.id);
      if (isNaN(subtaskId)) {
        return res.status(400).json({ success: false, error: 'ID inválido' });
      }

      if (!req.body || typeof req.body !== 'object') {
        return res.status(400).json({ success: false, error: 'Corpo da requisição inválido' });
      }

      const { title, completed, order_position } = req.body;

      db.get('SELECT * FROM subtasks WHERE id = ?', [subtaskId], (err, existing) => {
        if (err) {
          return sendDbError(res, err, NODE_ENV, 'UpdateSubtask');
        }

        if (!existing) {
          return res.status(404).json({ success: false, error: 'Subtask não encontrada' });
        }

        const titleSanitized = title !== undefined ? sanitizeString(title, 500) : existing.title;
        const completedNum = completed !== undefined ? (completed === 1 || completed === true ? 1 : 0) : existing.completed;
        const orderNum = order_position !== undefined ? parseInt(order_position) : existing.order_position;

        if (isNaN(orderNum) || orderNum < 0) {
          return res.status(400).json({ success: false, error: 'order_position deve ser >= 0' });
        }

        db.run(
          'UPDATE subtasks SET title = ?, completed = ?, order_position = ? WHERE id = ?',
          [titleSanitized, completedNum, orderNum, subtaskId],
          function (err) {
            if (err) {
              return sendDbError(res, err, NODE_ENV, 'UpdateSubtask');
            }

            db.get('SELECT * FROM subtasks WHERE id = ?', [subtaskId], (err, subtask) => {
              if (err) {
                return sendDbError(res, err, NODE_ENV, 'UpdateSubtask');
              }

              res.json({
                success: true,
                data: subtask
              });
            });
          }
        );
      });
    } catch (error) {
      console.error('[UpdateSubtask] Unexpected error:', {
        error: error.message,
        subtaskId: req.params.id,
        stack: NODE_ENV === 'development' ? error.stack : undefined
      });
      res.status(500).json({
        success: false,
        error: NODE_ENV === 'production' ? 'Erro interno do servidor' : error.message
      });
    }
  });

  // Delete subtask
  router.delete('/subtasks/:id', (req, res) => {
    try {
      const subtaskId = parseInt(req.params.id);
      if (isNaN(subtaskId)) {
        return res.status(400).json({ success: false, error: 'ID inválido' });
      }

      db.get('SELECT id FROM subtasks WHERE id = ?', [subtaskId], (err, subtask) => {
        if (err) {
          return sendDbError(res, err, NODE_ENV, 'DeleteSubtask');
        }

        if (!subtask) {
          return res.status(404).json({ success: false, error: 'Subtask não encontrada' });
        }

        db.run('DELETE FROM subtasks WHERE id = ?', [subtaskId], function (err) {
          if (err) {
            return sendDbError(res, err, NODE_ENV, 'DeleteSubtask');
          }

          res.json({
            success: true,
            data: { message: 'Subtask deletada com sucesso' }
          });
        });
      });
    } catch (error) {
      console.error('[DeleteSubtask] Unexpected error:', {
        error: error.message,
        subtaskId: req.params.id,
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

