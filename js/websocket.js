(function() {
const isFileProtocol = window.location.protocol === 'file:';
const isLocalhost = window.location.hostname === 'localhost' ||
                    window.location.hostname === '127.0.0.1' ||
                    window.location.hostname === '' ||
                    isFileProtocol;

function getWebSocketUrl() {
  if (isLocalhost) {
    return 'http://localhost:3000';
  }
  return '';
}

const WS_URL = getWebSocketUrl();
const SOCKET_IO_LOAD_TIMEOUT = 5000;
const SOCKET_IO_LOAD_RETRY_DELAY = 100;
const MAX_RECONNECT_ATTEMPTS = 5;
const LOCAL_ACTION_TIMEOUT_MS = 1000;
const USER_ID_CACHE_MS = 5000;

let socket = null;
let cachedUserId = null;
let cachedUserIdTimestamp = 0;
let renderScheduled = false;
let pendingRenders = {
  board: false,
  dashboard: false,
  financial: false,
  header: false
};

const hasNormalizeTasksData = typeof normalizeTasksData === 'function';
const localActions = new Set();
const actionTimeouts = new Map();

let cdnLoadInProgress = false;
let socketIOWaitInProgress = false;
const SOCKET_IO_VERSION = '4.8.1';

function markLocalAction(taskId) {
  if (!taskId) return;

  const existingTimeout = actionTimeouts.get(taskId);
  if (existingTimeout) {
    clearTimeout(existingTimeout);
  }

  localActions.add(taskId);
  if (isLocalhost) {
    console.log('[WebSocket] 🏷️  Marked local action (will ignore WebSocket events for 1s)', { taskId });
  }
  const timeoutId = setTimeout(() => {
    localActions.delete(taskId);
    actionTimeouts.delete(taskId);
    if (isLocalhost) {
      console.log('[WebSocket] 🏷️  Local action timeout cleared', { taskId });
    }
  }, LOCAL_ACTION_TIMEOUT_MS);

  actionTimeouts.set(taskId, timeoutId);
}

let cdnLoadPromise = null;

function loadSocketIOFromCDN() {
  if (typeof io !== 'undefined') {
    return Promise.resolve();
  }

  if (cdnLoadPromise) {
    return cdnLoadPromise;
  }

  if (cdnLoadInProgress) {
    return new Promise((resolve, reject) => {
      const checkInterval = setInterval(() => {
        if (typeof io !== 'undefined') {
          clearInterval(checkInterval);
          cdnLoadInProgress = false;
          cdnLoadPromise = null;
          resolve();
        } else if (!cdnLoadInProgress) {
          clearInterval(checkInterval);
          cdnLoadPromise = null;
          reject(new Error('CDN load was cancelled'));
        }
      }, 100);
      setTimeout(() => {
        clearInterval(checkInterval);
        if (cdnLoadInProgress) {
          cdnLoadPromise = null;
        }
      }, SOCKET_IO_LOAD_TIMEOUT);
    });
  }

  cdnLoadInProgress = true;
  if (isLocalhost) {
    console.log('[WebSocket] 📦 Loading socket.io from CDN fallback...');
  }

  cdnLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://cdn.socket.io/${SOCKET_IO_VERSION}/socket.io.min.js`;
    script.crossOrigin = 'anonymous';
    script.onload = () => {
      cdnLoadInProgress = false;
      if (typeof io !== 'undefined') {
        if (isLocalhost) {
          console.log('[WebSocket] ✅ socket.io loaded from CDN');
        }
        cdnLoadPromise = null;
        resolve();
      } else {
        cdnLoadPromise = null;
        reject(new Error('socket.io not available after CDN load'));
      }
    };
    script.onerror = () => {
      cdnLoadInProgress = false;
      cdnLoadPromise = null;
      reject(new Error('Failed to load socket.io from CDN'));
    };
    document.head.appendChild(script);
  });

  return cdnLoadPromise;
}

function waitForSocketIO(callback, retries = 0) {
  const maxRetries = Math.floor(SOCKET_IO_LOAD_TIMEOUT / SOCKET_IO_LOAD_RETRY_DELAY);
  
  if (typeof io !== 'undefined') {
    console.log('[WebSocket] ✅ socket.io already loaded');
    socketIOWaitInProgress = false;
    callback();
    return;
  }

  if (retries === 0 && socketIOWaitInProgress) {
    console.log('[WebSocket] ⏳ Waiting for existing socket.io load attempt...');
    // Wait for existing attempt, but set a timeout to prevent infinite wait
    const checkExisting = setInterval(() => {
      if (typeof io !== 'undefined') {
        clearInterval(checkExisting);
        socketIOWaitInProgress = false;
        console.log('[WebSocket] ✅ socket.io loaded by existing attempt');
        callback();
      } else if (!socketIOWaitInProgress) {
        clearInterval(checkExisting);
        // Previous attempt finished, start new one
        console.log('[WebSocket] 🔄 Previous attempt finished, starting new one');
        waitForSocketIO(callback, 0);
      }
    }, 100);
    setTimeout(() => {
      clearInterval(checkExisting);
      if (socketIOWaitInProgress) {
        console.warn('[WebSocket] ⚠️  Timeout waiting for existing attempt, resetting flag');
        socketIOWaitInProgress = false;
      }
    }, SOCKET_IO_LOAD_TIMEOUT);
    return;
  }

  if (retries === 0) {
    console.log('[WebSocket] 🔍 Starting socket.io wait (retry 0)');
    socketIOWaitInProgress = true;
  }

  if (retries >= maxRetries) {
    console.warn('[WebSocket] ⚠️  socket.io not loaded after', maxRetries, 'retries, trying CDN fallback...');
    socketIOWaitInProgress = false;
    loadSocketIOFromCDN()
      .then(() => {
        socketIOWaitInProgress = false;
        console.log('[WebSocket] ✅ CDN load successful, calling callback');
        callback();
      })
      .catch((error) => {
        socketIOWaitInProgress = false;
        console.error('[WebSocket] ❌ Failed to load socket.io:', error.message);
        console.warn('[WebSocket] 💡 WebSocket features will be disabled');
      });
    return;
  }

  if (retries > 0 && retries % 10 === 0) {
    console.log('[WebSocket] 🔍 Still waiting for socket.io... (retry', retries, '/', maxRetries, ')');
  }

  setTimeout(() => waitForSocketIO(callback, retries + 1), SOCKET_IO_LOAD_RETRY_DELAY);
}

function connectWebSocket() {
  if (socket?.connected) {
    if (isLocalhost) {
      console.log('[WebSocket] Already connected, skipping');
    }
    return;
  }

  console.log('[WebSocket] 🔌 connectWebSocket called');
  waitForSocketIO(() => {
    if (typeof io === 'undefined') {
      console.error('[WebSocket] ❌ socket.io library not available after wait');
      socketIOWaitInProgress = false;
      return;
    }
    console.log('[WebSocket] 🔌 socket.io available, initiating connection...');
    initializeSocket();
  }, 0);
}

function initializeSocket() {
  try {
    const token = localStorage.getItem('vibeTasks_token');
    if (!token) {
      if (isLocalhost) {
        console.warn('[WebSocket] No token available, cannot connect');
      }
      return;
    }

    if (socket) {
      socket.removeAllListeners();
      socket.disconnect();
    }

    if (isLocalhost) {
      console.log('[WebSocket] Connecting to:', WS_URL);
    }
    socket = io(WS_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
      auth: {
        token: token
      }
    });

    socket.on('connect', () => {
      cachedUserId = null;
      if (isLocalhost) {
        const socketId = socket.id;
        console.log('[WebSocket] ✅ Connected successfully', { socketId, url: WS_URL });
      }
    });

    socket.on('disconnect', (reason) => {
      cachedUserId = null;
      cachedUserIdTimestamp = 0;
      if (isLocalhost) {
        console.log('[WebSocket] ❌ Disconnected', { reason });
      }
    });

    socket.on('reconnect', (attemptNumber) => {
      if (isLocalhost) {
        console.log('[WebSocket] 🔄 Reconnected', { attemptNumber });
      }
    });

    socket.on('reconnect_attempt', (attemptNumber) => {
      if (isLocalhost) {
        console.log('[WebSocket] 🔄 Reconnection attempt', { attemptNumber, maxAttempts: MAX_RECONNECT_ATTEMPTS });
      }
    });

    socket.on('reconnect_failed', () => {
      console.error('[WebSocket] ❌ Reconnection failed after', MAX_RECONNECT_ATTEMPTS, 'attempts');
    });

    socket.on('task:created', (data) => {
      if (isLocalhost) {
        console.log('[WebSocket] 📨 Received task:created', { taskId: data?.task?.id, userId: data?.userId });
      }
      handleTaskCreated(data);
    });

    socket.on('task:updated', (data) => {
      if (isLocalhost) {
        console.log('[WebSocket] 📨 Received task:updated', { taskId: data?.task?.id, userId: data?.userId });
      }
      handleTaskUpdated(data);
    });

    socket.on('task:deleted', (data) => {
      if (isLocalhost) {
        console.log('[WebSocket] 📨 Received task:deleted', { taskId: data?.taskId, userId: data?.userId });
      }
      handleTaskDeleted(data);
    });

    socket.on('task:moved', (data) => {
      if (isLocalhost) {
        console.log('[WebSocket] 📨 Received task:moved', { 
          taskId: data?.task?.id, 
          userId: data?.userId,
          fromCol: data?.task?.col_id,
          toPosition: data?.task?.order_position
        });
      }
      handleTaskMoved(data);
    });

    socket.on('connect_error', (error) => {
      console.error('[WebSocket] ❌ Connection error:', error.message, { url: WS_URL || 'same-origin' });
      if (error.message === 'Authentication error') {
        console.warn('[WebSocket] 🔒 Authentication failed, disconnecting');
        socket.disconnect();
      }
    });
  } catch (error) {
    console.error('[WebSocket] ❌ Fatal connection error:', error);
    socketIOWaitInProgress = false;
  }
}

function disconnectWebSocket() {
  if (socket) {
    if (isLocalhost) {
      console.log('[WebSocket] 🔌 Disconnecting...');
    }
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
  cachedUserId = null;
  cachedUserIdTimestamp = 0;

  for (const timeoutId of actionTimeouts.values()) {
    clearTimeout(timeoutId);
  }
  localActions.clear();
  actionTimeouts.clear();
  if (isLocalhost) {
    console.log('[WebSocket] ✅ Disconnected and cleaned up');
  }
}

function scheduleRender() {
  if (renderScheduled) return;

  renderScheduled = true;
  requestAnimationFrame(() => {
    renderScheduled = false;

    if (pendingRenders.board) {
      if (DOM.boardContainer && !DOM.boardContainer.classList.contains('hidden')) {
        renderBoard();
      }
      pendingRenders.board = false;
    }

    if (pendingRenders.dashboard && DOM.dashboardContainer?.classList.contains('active')) {
      renderDashboard();
      pendingRenders.dashboard = false;
    }

    if (pendingRenders.financial && DOM.financialContainer?.classList.contains('active')) {
      renderFinancial();
      pendingRenders.financial = false;
    }

    if (pendingRenders.header) {
      if (typeof debouncedUpdateHeaderStats === 'function') {
        debouncedUpdateHeaderStats();
      } else {
        updateHeaderStats();
      }
      pendingRenders.header = false;
    }
  });
}

function shouldIgnoreWebSocketEvent(taskId, userId) {
  if (!taskId || userId === undefined) return false;
  const currentUserId = getCurrentUserId();
  if (currentUserId === null || userId !== currentUserId) {
    // Event from different user, don't ignore
    return false;
  }
  const shouldIgnore = localActions.has(taskId);
  if (shouldIgnore && isLocalhost) {
    console.log('[WebSocket] ⏭️  Ignoring event (local action)', { taskId, userId });
  }
  return shouldIgnore;
}

function normalizeTask(task) {
  if (!hasNormalizeTasksData) return task;
  const normalized = normalizeTasksData([task]);
  return normalized[0] || task;
}

function handleTaskCreated(data) {
  if (!data?.task || !AppState) {
    if (isLocalhost) {
      console.warn('[WebSocket] Invalid task:created data', data);
    }
    return;
  }
  if (shouldIgnoreWebSocketEvent(data.task.id, data.userId)) return;

  const tasks = AppState.getTasks();
  const exists = tasks.some(t => t.id === data.task.id);
  if (exists) {
    if (isLocalhost) {
      console.log('[WebSocket] ⏭️  Task already exists, skipping', { taskId: data.task.id });
    }
    return;
  }

  const normalizedTask = normalizeTask(data.task);
  const newTasks = [...tasks, normalizedTask];
  AppState.setTasks(newTasks);

  pendingRenders.board = true;
  pendingRenders.header = true;
  scheduleRender();

  if (isLocalhost) {
    console.log('[WebSocket] ✅ Task created and rendered', { taskId: data.task.id, client: data.task.client });
  }
  AppState.log('Task created via WebSocket', { taskId: data.task.id });

  // Show notification if from another user
  if (data.userId && data.userId !== getCurrentUserId() && data.userName && 
      typeof NotificationManager !== 'undefined' && 
      typeof NotificationManager.showUserActivity === 'function') {
    const message = data.actionDescription || `Criou projeto ${data.task.client || 'novo'}`;
    NotificationManager.showUserActivity(
      message,
      data.userName,
      data.userAvatarUrl,
      'success'
    );
  }
}

function handleTaskUpdated(data) {
  if (!data?.task || !AppState) {
    if (isLocalhost) {
      console.warn('[WebSocket] Invalid task:updated data', data);
    }
    return;
  }
  if (shouldIgnoreWebSocketEvent(data.task.id, data.userId)) return;

  const tasks = AppState.getTasks();
  const taskIndex = tasks.findIndex(t => t.id === data.task.id);
  if (taskIndex === -1) {
    if (isLocalhost) {
      console.log('[WebSocket] ⏭️  Task not found locally, skipping update', { taskId: data.task.id });
    }
    return;
  }

  const normalizedTask = normalizeTask(data.task);
  const updatedTasks = [...tasks];
  updatedTasks[taskIndex] = normalizedTask;
  AppState.setTasks(updatedTasks);

  pendingRenders.board = true;
  pendingRenders.dashboard = true;
  pendingRenders.financial = true;
  pendingRenders.header = true;
  scheduleRender();

  if (isLocalhost) {
    console.log('[WebSocket] ✅ Task updated and rendered', { taskId: data.task.id, client: data.task.client });
  }
  AppState.log('Task updated via WebSocket', { taskId: data.task.id });

  // Show notification if from another user
  if (data.userId && data.userId !== getCurrentUserId() && data.userName && 
      typeof NotificationManager !== 'undefined' && 
      typeof NotificationManager.showUserActivity === 'function') {
    const message = data.actionDescription || `Editou projeto ${data.task.client || 'projeto'}`;
    NotificationManager.showUserActivity(
      message,
      data.userName,
      data.userAvatarUrl,
      'info'
    );
  }
}

function handleTaskDeleted(data) {
  if (!data?.taskId || !AppState) {
    if (isLocalhost) {
      console.warn('[WebSocket] Invalid task:deleted data', data);
    }
    return;
  }
  if (shouldIgnoreWebSocketEvent(data.taskId, data.userId)) return;

  const tasks = AppState.getTasks();
  const taskExists = tasks.some(t => t.id === data.taskId);
  if (!taskExists) {
    if (isLocalhost) {
      console.log('[WebSocket] ⏭️  Task not found locally, skipping delete', { taskId: data.taskId });
    }
    return;
  }

  const updatedTasks = tasks.filter(t => t.id !== data.taskId);

  AppState.setTasks(updatedTasks);

  pendingRenders.board = true;
  pendingRenders.dashboard = true;
  pendingRenders.financial = true;
  pendingRenders.header = true;
  scheduleRender();

  if (isLocalhost) {
    console.log('[WebSocket] ✅ Task deleted and rendered', { taskId: data.taskId });
  }
  AppState.log('Task deleted via WebSocket', { taskId: data.taskId });

  // Show notification if from another user
  if (data.userId && data.userId !== getCurrentUserId() && data.userName && 
      typeof NotificationManager !== 'undefined' && 
      typeof NotificationManager.showUserActivity === 'function') {
    const message = data.actionDescription || 'Deletou um projeto';
    NotificationManager.showUserActivity(
      message,
      data.userName,
      data.userAvatarUrl,
      'warning'
    );
  }
}

function handleTaskMoved(data) {
  if (!data?.task || !AppState) {
    if (isLocalhost) {
      console.warn('[WebSocket] Invalid task:moved data', data);
    }
    return;
  }
  if (shouldIgnoreWebSocketEvent(data.task.id, data.userId)) return;

  const tasks = AppState.getTasks();
  const taskIndex = tasks.findIndex(t => t.id === data.task.id);
  if (taskIndex === -1) {
    if (isLocalhost) {
      console.log('[WebSocket] ⏭️  Task not found locally, skipping move', { taskId: data.task.id });
    }
    return;
  }

  const task = tasks[taskIndex];
  if (task.col_id === data.task.col_id && task.order_position === data.task.order_position) {
    if (isLocalhost) {
      console.log('[WebSocket] ⏭️  Task position unchanged, skipping', { 
        taskId: data.task.id, 
        col_id: data.task.col_id, 
        order_position: data.task.order_position 
      });
    }
    return;
  }

  const normalizedTask = normalizeTask(data.task);
  const updatedTasks = [...tasks];
  const oldCol = updatedTasks[taskIndex].col_id;
  const oldPos = updatedTasks[taskIndex].order_position;
  updatedTasks[taskIndex] = {
    ...updatedTasks[taskIndex],
    col_id: normalizedTask.col_id,
    order_position: normalizedTask.order_position,
    updated_at: normalizedTask.updated_at
  };
  AppState.setTasks(updatedTasks);

  pendingRenders.board = true;
  pendingRenders.header = true;
  scheduleRender();

  if (isLocalhost) {
    console.log('[WebSocket] ✅ Task moved and rendered', { 
      taskId: data.task.id, 
      client: data.task.client,
      fromCol: oldCol,
      toCol: normalizedTask.col_id,
      fromPos: oldPos,
      toPos: normalizedTask.order_position
    });
  }
  AppState.log('Task moved via WebSocket', { taskId: data.task.id });

  // Show notification if from another user
  if (data.userId && data.userId !== getCurrentUserId() && data.userName && 
      typeof NotificationManager !== 'undefined' && 
      typeof NotificationManager.showUserActivity === 'function') {
    const message = data.actionDescription || (() => {
      const colNames = ['Descoberta', 'Acordo', 'Build', 'Live'];
      const fromColName = colNames[oldCol] || oldCol;
      const toColName = colNames[normalizedTask.col_id] || normalizedTask.col_id;
      return `Moveu ${data.task.client || 'projeto'} de ${fromColName} para ${toColName}`;
    })();
    NotificationManager.showUserActivity(
      message,
      data.userName,
      data.userAvatarUrl,
      'info'
    );
  }
}

function getCurrentUserId() {
  const now = Date.now();
  if (cachedUserId !== null && (now - cachedUserIdTimestamp) < USER_ID_CACHE_MS) {
    return cachedUserId;
  }

  try {
    const saved = localStorage.getItem('vibeTasks_auth');
    if (saved) {
      const user = JSON.parse(saved);
      cachedUserId = user?.id || null;
      cachedUserIdTimestamp = now;
      if (isLocalhost && cachedUserId) {
        console.log('[WebSocket] User ID cached', { userId: cachedUserId });
      }
      return cachedUserId;
    }
  } catch (e) {
    if (isLocalhost) {
      console.warn('[WebSocket] Error parsing auth data from localStorage:', e);
    }
  }

  cachedUserId = null;
  cachedUserIdTimestamp = now;
  return null;
}

window.connectWebSocket = connectWebSocket;
window.disconnectWebSocket = disconnectWebSocket;
window.markLocalTaskAction = markLocalAction;
})();
