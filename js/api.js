const isFileProtocol = window.location.protocol === 'file:';
const isLocalhost = window.location.hostname === 'localhost' ||
                    window.location.hostname === '127.0.0.1' ||
                    window.location.hostname === '' ||
                    isFileProtocol;
const API_BASE_URL = isLocalhost ? 'http://localhost:3000' : '';

if (isFileProtocol) {
  console.warn('[API] Acesso via file:// detectado. Para melhor compatibilidade, use um servidor HTTP local:\n  npx serve .\n  ou\n  python -m http.server 8080');
}
const TOKEN_STORAGE_KEY = 'vibeTasks_token';

async function apiRequest(method, endpoint, data = null, requiresAuth = true, silent = false) {
  const url = `${API_BASE_URL}${endpoint}`;
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json'
    }
  };

  if (requiresAuth) {
    const token = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!token) {
      const authError = new Error('Não autenticado');
      if (!silent) NotificationManager.error(authError.message);
      throw authError;
    }
    options.headers['Authorization'] = `Bearer ${token}`;
  }

  if (data) {
    options.body = JSON.stringify(data);
  }

  // Timeout: 5 segundos (better UX - faster feedback)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);
  options.signal = controller.signal;

  try {
    // Log request details in development for debugging
    if (isLocalhost) {
      console.log('[API] Request:', { method, url, hasData: !!data });
    }

    const response = await fetch(url, options);
    clearTimeout(timeoutId);

    // Parse JSON response (handle invalid JSON)
    let result;
    try {
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        result = await response.json();
      } else {
        const text = await response.text();
        if (text.trim().startsWith('<')) {
          throw new Error(`Server returned HTML instead of JSON (${response.status}): ${response.statusText}`);
        }
        result = text ? JSON.parse(text) : {};
      }
    } catch (parseError) {
      console.error('[API] JSON parse error:', parseError);
      const errorMessage = parseError.message || `Resposta inválida do servidor: ${response.status} ${response.statusText}`;
      throw new Error(errorMessage);
    }

    if (!response.ok) {
      // Handle 401 - but only for authenticated routes, not for login
      if (response.status === 401 && requiresAuth) {
        localStorage.removeItem(TOKEN_STORAGE_KEY);
        localStorage.removeItem('vibeTasks_auth');
        // Try to call logout if available (may not be in scope yet)
        try {
          if (typeof window !== 'undefined' && typeof window.logout === 'function') {
            window.logout();
          } else if (typeof logout === 'function') {
            logout();
          }
        } catch (e) {
          // Ignore if logout not available yet
        }
        const authError = new Error('Sessão expirada. Por favor, faça login novamente.');
        if (!silent) NotificationManager.error(authError.message);
        throw authError;
      }

      // For login endpoint, show the actual error message from backend
      const errorMsg = result.error || `Erro ${response.status}: ${response.statusText}`;
      if (!silent) NotificationManager.error(errorMsg);
      throw new Error(errorMsg);
    }

    return result;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error.name === 'AbortError') {
      const timeoutError = new Error('Timeout: A requisição demorou muito para responder');
      if (!silent) NotificationManager.error(timeoutError.message);
      throw timeoutError;
    }

    // Log full error for debugging
    console.error('[API] Network error:', {
      error: error.message,
      name: error.name,
      url: url,
      method: method,
      isLocalhost: isLocalhost,
      hostname: window.location.hostname,
      protocol: window.location.protocol,
      port: window.location.port
    });

    // More specific error message based on error type
    let finalError;
    if (error.message.includes('Failed to fetch') ||
        error.message.includes('NetworkError') ||
        error.name === 'TypeError') {
      if (isLocalhost) {
        finalError = new Error('Não foi possível conectar ao servidor. Verifique se o backend está rodando na porta 3000 (http://localhost:3000)');
      } else {
        finalError = new Error('Erro de rede. Verifique sua conexão e se o servidor está acessível.');
      }
    } else {
      finalError = error;
    }

    if (!silent && finalError.message && !finalError.message.includes('Sessão expirada')) {
      NotificationManager.error(finalError.message);
    }

    throw finalError;
  }
}

// API methods
const api = {
  async login(emailOrUsername, password) {
    // Backend accepts both email and username, so send identifier as email field
    // Backend will detect if it's email or username and handle accordingly
    // This avoids frontend misclassification issues
    const payload = { email: emailOrUsername, password };

    const result = await apiRequest('POST', '/api/auth/login', payload, false, true);

    if (result.success && result.data.token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, result.data.token);
    }

    return result.data;
  },

  async getCurrentUser() {
    try {
      const result = await apiRequest('GET', '/api/auth/me', null, true, true);
      return result.data.user;
    } catch (error) {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      return null;
    }
  },

  async getTasks() {
    const result = await apiRequest('GET', '/api/tasks');
    // Backend returns { success: true, data: [...] }
    if (result && result.success && Array.isArray(result.data)) {
      return result.data;
    }
    // Fallback: try result.data directly or return empty array
    return Array.isArray(result.data) ? result.data : (Array.isArray(result) ? result : []);
  },

  async getTask(id) {
    const result = await apiRequest('GET', `/api/tasks/${id}`);
    return result.data;
  },

  async createTask(taskData) {
    const result = await apiRequest('POST', '/api/tasks', taskData);
    return result.data;
  },

  async updateTask(id, taskData) {
    const result = await apiRequest('PUT', `/api/tasks/${id}`, taskData);
    return result.data;
  },

  async deleteTask(id) {
    const result = await apiRequest('DELETE', `/api/tasks/${id}`);
    return result;
  },

  async moveTask(id, col_id, order_position) {
    // Validate inputs before sending
    const taskId = parseInt(id);
    const colIdNum = parseInt(col_id);
    const orderNum = parseInt(order_position);

    if (isNaN(taskId) || isNaN(colIdNum) || isNaN(orderNum)) {
      throw new Error('Valores inválidos para mover tarefa');
    }

    if (colIdNum < 0 || colIdNum > 3) {
      throw new Error(`col_id deve ser entre 0 e 3, recebido: ${colIdNum}`);
    }

    if (orderNum < 0) {
      throw new Error(`order_position deve ser >= 0, recebido: ${orderNum}`);
    }

    // Backend accepts both snake_case (preferred) and camelCase (for compatibility)
    // We send snake_case to be consistent with frontend conventions
    const result = await apiRequest('PATCH', `/api/tasks/${taskId}/move`, {
      col_id: colIdNum,
      order_position: orderNum
    });
    return result.data;
  },

  // Subtasks API
  async getSubtasks(taskId) {
    const result = await apiRequest('GET', `/api/tasks/${taskId}/subtasks`);
    return result.data;
  },

  async createSubtask(taskId, title, order_position) {
    const result = await apiRequest('POST', `/api/tasks/${taskId}/subtasks`, {
      title,
      order_position
    });
    return result.data;
  },

  async updateSubtask(subtaskId, data) {
    const result = await apiRequest('PATCH', `/api/tasks/subtasks/${subtaskId}`, data);
    return result.data;
  },

  async deleteSubtask(subtaskId) {
    const result = await apiRequest('DELETE', `/api/tasks/subtasks/${subtaskId}`);
    return result.data;
  },

  async getActivities(limit = 50, offset = 0, taskId = null) {
    const params = new URLSearchParams();
    if (limit !== null && limit !== undefined) {
      params.append('limit', limit);
    }
    if (offset !== null && offset !== undefined) {
      params.append('offset', offset);
    }
    if (taskId !== null && taskId !== undefined) {
      params.append('task_id', taskId);
    }

    const queryString = params.toString();
    const endpoint = `/api/tasks/activities/recent${queryString ? `?${queryString}` : ''}`;
    const result = await apiRequest('GET', endpoint);
    return result.data;
  },

  async uploadAvatar(avatarData) {
    const result = await apiRequest('POST', '/api/auth/avatar', { avatarData });
    return result.data;
  },

  async updateProfile(name, email, avatar_url) {
    const result = await apiRequest('PUT', '/api/auth/profile', { name, email, avatar_url });
    return result.data.user;
  },

  async updatePassword(currentPassword, newPassword) {
    const result = await apiRequest('PUT', '/api/auth/password', { currentPassword, newPassword });
    return result;
  }
};
