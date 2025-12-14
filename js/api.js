// API Service Layer - VibeWeb OS
// Grug Rule: Base URL no topo do mesmo arquivo (Localidade de Comportamento)
// All API configuration in one place - easy to change for production

// API Configuration
// In production, nginx proxies /api to backend, so use relative path
// In development, use full URL
const API_BASE_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:3000'
  : '';
const TOKEN_STORAGE_KEY = 'vibeTasks_token';

// Generic API request wrapper
async function apiRequest(method, endpoint, data = null, requiresAuth = true) {
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
      throw new Error('Não autenticado');
    }
    options.headers['Authorization'] = `Bearer ${token}`;
  }

  if (data) {
    options.body = JSON.stringify(data);
  }

  // Timeout: 10 segundos
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  options.signal = controller.signal;

  try {
    const response = await fetch(url, options);
    clearTimeout(timeoutId);

    // Parse JSON response (handle invalid JSON)
    let result;
    try {
      const text = await response.text();
      result = text ? JSON.parse(text) : {};
    } catch (parseError) {
      console.error('[API] JSON parse error:', parseError, 'Response:', text?.substring(0, 200));
      throw new Error(`Resposta inválida do servidor: ${response.status} ${response.statusText}`);
    }

    if (!response.ok) {
      // Handle 401 - logout automatically
      if (response.status === 401) {
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
        throw new Error('Sessão expirada. Por favor, faça login novamente.');
      }

      throw new Error(result.error || `Erro ${response.status}: ${response.statusText}`);
    }

    return result;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error.name === 'AbortError') {
      throw new Error('Timeout: A requisição demorou muito para responder');
    }

    // Preserve original error message if it exists
    if (error.message) {
      throw error;
    }

    // Log full error for debugging, but throw user-friendly message
    console.error('[API] Network error:', error);
    throw new Error('Erro de rede. Verifique sua conexão.');
  }
}

// API methods
const api = {
  async login(email, password) {
    const result = await apiRequest('POST', '/api/auth/login', { email, password }, false);

    if (result.success && result.data.token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, result.data.token);
    }

    return result.data;
  },

  async getCurrentUser() {
    try {
      const result = await apiRequest('GET', '/api/auth/me');
      return result.data.user;
    } catch (error) {
      // If token is invalid, remove it
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
  }
};
