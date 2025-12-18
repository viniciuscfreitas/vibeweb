// Authentication Logic

const AUTH_STORAGE_KEY = 'vibeTasks_auth';

function sanitizeUrl() {
  const hasQueryParams = window.location.search && window.location.search.length > 0;
  const hasHash = window.location.hash && window.location.hash.length > 0;

  if (hasQueryParams || hasHash) {
    const cleanUrl = window.location.origin + window.location.pathname;
    window.history.replaceState({}, document.title, cleanUrl);
    AppState.log('URL sanitized - removed query params and hash');
  }
}

function clearFormCredentials() {
  const emailInput = document.getElementById('loginEmail');
  const passwordInput = document.getElementById('loginPassword');

  if (emailInput) {
    emailInput.value = '';
    emailInput.blur();
  }
  if (passwordInput) {
    passwordInput.value = '';
    passwordInput.blur();
  }
}
const DEFAULT_USER = {
  name: 'Vinícius Freitas',
  email: 'vinicius@example.com'
};

function getInitials(fullName) {
  if (!fullName) return 'U';

  const parts = fullName.trim().split(' ');
  if (parts.length === 1) {
    return parts[0].substring(0, 2).toUpperCase();
  }

  const firstInitial = parts[0][0];
  const lastInitial = parts[parts.length - 1][0];
  return (firstInitial + lastInitial).toUpperCase();
}

async function getCurrentUser() {
  try {
    // Try to get from API first (if token exists)
    const token = localStorage.getItem('vibeTasks_token');
    if (token) {
      const user = await api.getCurrentUser();
      if (user) {
        setCurrentUser(user);
        return user;
      }
    }

    // Fallback to localStorage
    const saved = localStorage.getItem(AUTH_STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (error) {
    console.error('[Auth] Erro ao carregar usuário:', error);
  }
  return null;
}

function setCurrentUser(user) {
  try {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
    AppState.log('User authenticated', { name: user.name });
  } catch (error) {
    console.error('[Auth] Erro ao salvar usuário:', error);
  }
}

function logout() {
  localStorage.removeItem(AUTH_STORAGE_KEY);
  localStorage.removeItem('vibeTasks_token');
  sessionStorage.removeItem('redirectAfterLogin');
  AppState.log('User logged out');

  if (typeof disconnectWebSocket === 'function') {
    disconnectWebSocket();
  }

  const appContainer = document.getElementById('appContainer');
  const loginOverlay = document.getElementById('loginOverlay');

  if (appContainer) {
    appContainer.classList.remove('fade-in');
    appContainer.classList.add('fade-out');
  }

  setTimeout(() => {
    if (appContainer) {
      appContainer.classList.add('hidden');
      appContainer.classList.remove('fade-out', 'fade-in');
    }

    if (loginOverlay) {
      loginOverlay.classList.remove('hidden', 'fade-out');
      loginOverlay.classList.remove('fade-in');
      requestAnimationFrame(() => {
        loginOverlay.classList.add('fade-in');
      });
    } else {
      console.error('[Logout] ERRO: loginOverlay não encontrado!');
    }

    clearFormCredentials();
    window.location.pathname = '/login';

    const emailInput = document.getElementById('loginEmail');
    if (emailInput) {
      emailInput.focus();
    }
  }, 400);
}

function isAuthenticated() {
  const token = localStorage.getItem('vibeTasks_token');
  return token !== null;
}

async function login(emailOrUsername, password) {
  if (!emailOrUsername || !password) {
    return { success: false, message: 'Email/usuário e senha são obrigatórios' };
  }

  try {
    const data = await api.login(emailOrUsername, password);
    const user = data.user;

    setCurrentUser(user);
    sanitizeUrl();
    return { success: true, user };
  } catch (error) {
    return { success: false, message: error.message || 'Erro ao fazer login' };
  }
}
