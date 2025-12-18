(function() {
const isFileProtocol = window.location.protocol === 'file:';
const isLocalhost = window.location.hostname === 'localhost' ||
                    window.location.hostname === '127.0.0.1' ||
                    window.location.hostname === '' ||
                    isFileProtocol;
const WS_URL = isLocalhost ? 'http://localhost:3000' : '';

let socket = null;
const MAX_RECONNECT_ATTEMPTS = 5;

let cachedUserId = null;
let cachedUserIdTimestamp = 0;
const USER_ID_CACHE_MS = 5000;

let renderScheduled = false;
let pendingRenders = {
  board: false,
  dashboard: false,
  financial: false,
  header: false
};

const hasNormalizeTasksData = typeof normalizeTasksData === 'function';

function connectWebSocket() {
  if (socket?.connected) {
    return;
  }

  if (typeof io === 'undefined') {
    if (isLocalhost) {
      console.warn('[WebSocket] socket.io library not loaded');
    }
    return;
  }

  initializeSocket();
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
        console.log('[WebSocket] Connected');
      }
    });

    socket.on('disconnect', () => {
      cachedUserId = null;
      cachedUserIdTimestamp = 0;
      if (isLocalhost) {
        console.log('[WebSocket] Disconnected');
      }
    });

    socket.on('task:created', (data) => {
      handleTaskCreated(data);
    });

    socket.on('task:updated', (data) => {
      handleTaskUpdated(data);
    });

    socket.on('task:deleted', (data) => {
      handleTaskDeleted(data);
    });

    socket.on('task:moved', (data) => {
      handleTaskMoved(data);
    });

    socket.on('connect_error', (error) => {
      if (isLocalhost) {
        console.warn('[WebSocket] Connection error:', error.message);
      }
      if (error.message === 'Authentication error') {
        if (isLocalhost) {
          console.warn('[WebSocket] Authentication failed, disconnecting');
        }
        socket.disconnect();
      }
    });
  } catch (error) {
    console.error('[WebSocket] Connection error:', error);
  }
}

function disconnectWebSocket() {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
  cachedUserId = null;
  cachedUserIdTimestamp = 0;
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
      updateHeaderStats();
      pendingRenders.header = false;
    }
  });
}

function isCurrentUser(userId) {
  if (userId === undefined) return false;
  const currentUserId = getCurrentUserId();
  return currentUserId !== null && userId === currentUserId;
}

function normalizeTask(task) {
  if (!hasNormalizeTasksData) return task;
  const normalized = normalizeTasksData([task]);
  return normalized[0] || task;
}

function handleTaskCreated(data) {
  if (!data?.task || !AppState) return;
  if (isCurrentUser(data.userId)) return;

  const tasks = AppState.getTasks();
  const exists = tasks.some(t => t.id === data.task.id);
  if (exists) return;

  const normalizedTask = normalizeTask(data.task);
  const newTasks = [...tasks, normalizedTask];
  AppState.setTasks(newTasks);

  pendingRenders.board = true;
  pendingRenders.header = true;
  scheduleRender();

  AppState.log('Task created via WebSocket', { taskId: data.task.id });
}

function handleTaskUpdated(data) {
  if (!data?.task || !AppState) return;
  if (isCurrentUser(data.userId)) return;

  const tasks = AppState.getTasks();
  const taskIndex = tasks.findIndex(t => t.id === data.task.id);
  if (taskIndex === -1) return;

  const normalizedTask = normalizeTask(data.task);
  const updatedTasks = [...tasks];
  updatedTasks[taskIndex] = normalizedTask;
  AppState.setTasks(updatedTasks);

  pendingRenders.board = true;
  pendingRenders.dashboard = true;
  pendingRenders.financial = true;
  pendingRenders.header = true;
  scheduleRender();

  AppState.log('Task updated via WebSocket', { taskId: data.task.id });
}

function handleTaskDeleted(data) {
  if (!data?.taskId || !AppState) return;
  if (isCurrentUser(data.userId)) return;

  const tasks = AppState.getTasks();
  const updatedTasks = tasks.filter(t => t.id !== data.taskId);

  if (updatedTasks.length === tasks.length) return;

  AppState.setTasks(updatedTasks);

  pendingRenders.board = true;
  pendingRenders.dashboard = true;
  pendingRenders.financial = true;
  pendingRenders.header = true;
  scheduleRender();

  AppState.log('Task deleted via WebSocket', { taskId: data.taskId });
}

function handleTaskMoved(data) {
  if (!data?.task || !AppState) return;
  if (isCurrentUser(data.userId)) return;

  const tasks = AppState.getTasks();
  const taskIndex = tasks.findIndex(t => t.id === data.task.id);
  if (taskIndex === -1) return;

  const task = tasks[taskIndex];
  if (task.col_id === data.task.col_id && task.order_position === data.task.order_position) {
    return;
  }

  const normalizedTask = normalizeTask(data.task);
  const updatedTasks = [...tasks];
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

  AppState.log('Task moved via WebSocket', { taskId: data.task.id });
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
      return cachedUserId;
    }
  } catch (e) {
  }

  cachedUserId = null;
  cachedUserIdTimestamp = now;
  return null;
}

window.connectWebSocket = connectWebSocket;
window.disconnectWebSocket = disconnectWebSocket;
})();
