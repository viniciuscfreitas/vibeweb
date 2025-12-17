// Main Initialization and Event Listeners

function getViewFromUrl(path = null) {
  const currentPath = path || window.location.pathname;
  if (currentPath === '/login' || currentPath.endsWith('/login')) {
    return 'login';
  }
  if (currentPath === '/dashboard' || currentPath.endsWith('/dashboard')) {
    return 'dashboard';
  }
  if (currentPath === '/financeiro' || currentPath.endsWith('/financeiro')) {
    return 'financial';
  }
  return 'projects';
}

function updateUrl(view, currentPath = null) {
  const path = currentPath || window.location.pathname;
  let newPath = '/';

  if (view === 'login') {
    newPath = '/login';
  } else if (view === 'dashboard') {
    newPath = '/dashboard';
  } else if (view === 'financial') {
    newPath = '/financeiro';
  }

  if (path !== newPath) {
    window.history.pushState({ view }, '', newPath);
  }
}

function getCurrentTheme() {
  const saved = localStorage.getItem(THEME_STORAGE_KEY);
  return saved || 'light';
}

function setTheme(theme) {
  const root = document.documentElement;
  root.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_STORAGE_KEY, theme);
  updateThemeIcon(theme);
}

function updateThemeIcon(theme) {
  const isDark = theme === 'dark';
  const isLight = theme === 'light';
  const dropdownThemeIcon = document.getElementById('dropdownThemeIcon');
  const dropdownThemeText = document.getElementById('dropdownThemeText');

  if (isDark) {
    if (dropdownThemeIcon) {
      dropdownThemeIcon.className = 'fa-solid fa-sun';
    }
    if (dropdownThemeText) {
      dropdownThemeText.textContent = 'Tema Claro';
    }
  } else if (isLight) {
    if (dropdownThemeIcon) {
      dropdownThemeIcon.className = 'fa-solid fa-moon';
    }
    if (dropdownThemeText) {
      dropdownThemeText.textContent = 'Tema Escuro';
    }
  }
}

function toggleTheme() {
  const currentTheme = getCurrentTheme();
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  setTheme(newTheme);
  AppState.log('Theme toggled', { theme: newTheme });
}

function initTheme() {
  const theme = getCurrentTheme();
  setTheme(theme);
}

function expandSearch() {
  if (!DOM.searchContainer || !DOM.searchInput) return;
  DOM.searchContainer.classList.add('expanded');
  setTimeout(() => {
    if (DOM.searchInput) {
      DOM.searchInput.focus();
    }
  }, 100);
}

function collapseSearch() {
  if (!DOM.searchInput || !DOM.searchContainer) return;
  const hasValue = DOM.searchInput.value.trim().length > 0;
  if (!hasValue) {
    DOM.searchContainer.classList.remove('expanded');
    DOM.searchInput.blur();
  }
}

function handleSearch() {
  // Try financial search first - it returns true if handled
  if (typeof handleFinancialSearch === 'function' && handleFinancialSearch()) {
    return; // Financial view handled the search
  }

  // Default Kanban search
  if (AppState.searchTimeout) {
    clearTimeout(AppState.searchTimeout);
  }
  AppState.searchTimeout = setTimeout(() => {
    renderBoard();
    updateHeaderStats();
    AppState.log('Search executed');
  }, SEARCH_DEBOUNCE_MS);
}

function fadeContainer(container, isFadeIn) {
  if (!container) return;

  container.style.transition = 'opacity 0.15s ease';

  if (isFadeIn) {
    requestAnimationFrame(() => {
      container.style.opacity = '1';
    });
  } else {
    container.style.opacity = '0';
  }
}

function switchToDashboard() {
  fadeContainer(DOM.boardContainer, false);
  fadeContainer(DOM.financialContainer, false);

  setTimeout(() => {
    DOM.boardContainer.classList.add('hidden');
    DOM.financialContainer.classList.add('hidden');
    DOM.financialContainer.classList.remove('active');
    DOM.financialContainer.style.display = '';
    DOM.dashboardContainer.classList.add('active');
    DOM.dashboardContainer.classList.remove('hidden');

    fadeContainer(DOM.dashboardContainer, true);
    clearKanbanFilter();
    renderDashboard();
    updateHeader('dashboard');
  }, 150);
}

function switchToProjects() {
  fadeContainer(DOM.dashboardContainer, false);
  fadeContainer(DOM.financialContainer, false);

  setTimeout(() => {
    DOM.dashboardContainer.classList.remove('active');
    DOM.dashboardContainer.classList.add('hidden');
    DOM.financialContainer.classList.add('hidden');
    DOM.financialContainer.classList.remove('active');
    DOM.financialContainer.style.display = '';
    DOM.boardContainer.classList.remove('hidden');

    fadeContainer(DOM.boardContainer, true);
    updateHeader('projects');
  }, 150);
}

function switchToFinancial() {
  fadeContainer(DOM.boardContainer, false);
  fadeContainer(DOM.dashboardContainer, false);

  setTimeout(() => {
    DOM.boardContainer.classList.add('hidden');
    DOM.dashboardContainer.classList.remove('active');
    DOM.dashboardContainer.classList.add('hidden');
    DOM.financialContainer.classList.remove('hidden');
    DOM.financialContainer.classList.add('active');
    DOM.financialContainer.style.display = 'block';

    fadeContainer(DOM.financialContainer, true);
    renderFinancial();
    updateHeader('financial');
  }, 150);
}

function updateNavButtons(isProjects, isDashboard, isFinancial) {
  DOM.navButtons.forEach((btn, index) => {
    if (index === 0 && isProjects) {
      btn.classList.add('active');
      btn.setAttribute('aria-current', 'page');
    } else if (index === 1 && isDashboard) {
      btn.classList.add('active');
      btn.setAttribute('aria-current', 'page');
    } else if (index === 2 && isFinancial) {
      btn.classList.add('active');
      btn.setAttribute('aria-current', 'page');
    } else {
      btn.classList.remove('active');
      btn.removeAttribute('aria-current');
    }
  });
}

function updateAriaHiddenForViews() {
  if (!DOM.boardContainer || !DOM.dashboardContainer || !DOM.financialContainer) return;

  const isBoardVisible = !DOM.boardContainer.classList.contains('hidden');
  const isDashboardVisible = DOM.dashboardContainer.classList.contains('active');
  const isFinancialVisible = DOM.financialContainer.classList.contains('active');

  DOM.boardContainer.setAttribute('aria-hidden', isBoardVisible ? 'false' : 'true');
  DOM.dashboardContainer.setAttribute('aria-hidden', isDashboardVisible ? 'false' : 'true');
  DOM.financialContainer.setAttribute('aria-hidden', isFinancialVisible ? 'false' : 'true');
}

// Announce view changes to screen readers (WCAG 2.1 - Status Changes)
function announceToScreenReader(message) {
  const liveRegion = document.getElementById('ariaLiveRegion');
  if (liveRegion) {
    liveRegion.textContent = message;
    // Clear after announcement to allow re-announcement of same message
    setTimeout(() => {
      liveRegion.textContent = '';
    }, 1000);
  }
}

// Determine current and target view states
function determineViewState(view) {
  const isDashboard = view === 'dashboard';
  const isProjects = view === 'projects';
  const isFinancial = view === 'financial';

  const currentIsDashboard = DOM.dashboardContainer.classList.contains('active');
  const currentIsProjects = !DOM.boardContainer.classList.contains('hidden');
  const currentIsFinancial = DOM.financialContainer.classList.contains('active');

  return {
    isDashboard,
    isProjects,
    isFinancial,
    currentIsDashboard,
    currentIsProjects,
    currentIsFinancial,
    isSwitchingToDashboard: isDashboard && !currentIsDashboard,
    isSwitchingToProjects: isProjects && !currentIsProjects,
    isSwitchingToFinancial: isFinancial && !currentIsFinancial
  };
}

// Update view visibility without animation
function updateViewVisibility(state) {
  DOM.boardContainer.classList.toggle('hidden', state.isDashboard || state.isFinancial);
  DOM.dashboardContainer.classList.toggle('active', state.isDashboard);
  DOM.dashboardContainer.classList.toggle('hidden', state.isProjects || state.isFinancial);

  if (state.isFinancial) {
    DOM.financialContainer.classList.remove('hidden');
    DOM.financialContainer.classList.add('active');
    DOM.financialContainer.style.display = 'block';
    fadeContainer(DOM.financialContainer, true);
  } else {
    DOM.financialContainer.classList.remove('active');
    DOM.financialContainer.classList.add('hidden');
    DOM.financialContainer.style.display = '';
  }

  if (state.isProjects) {
    fadeContainer(DOM.boardContainer, true);
  }
}

// Update view content based on state
function updateViewContent(state) {
  if (state.isDashboard) {
    clearKanbanFilter();
    renderDashboard();
  }

  if (state.isFinancial) {
    renderFinancial();
    updateHeader('financial');
  } else {
    updateHeader(state.isDashboard ? 'dashboard' : state.isProjects ? 'projects' : 'financial');
  }
}

function switchView(view, currentPath = null) {
  if (!DOM.boardContainer || !DOM.dashboardContainer || !DOM.financialContainer) return;
  if (view === 'login') return;

  const state = determineViewState(view);
  const path = currentPath || window.location.pathname;

  // Handle animated transitions for major view changes
  if (state.isSwitchingToDashboard) {
    switchToDashboard();
  } else if (state.isSwitchingToProjects) {
    switchToProjects();
  } else if (state.isSwitchingToFinancial) {
    switchToFinancial();
  } else {
    // Minor updates - no animation needed
    updateViewVisibility(state);
    updateViewContent(state);
  }

  updateNavButtons(state.isProjects, state.isDashboard, state.isFinancial);
  updateAriaHiddenForViews();
  updateUrl(view, path);

  // Announce view change to screen readers
  if (state.isDashboard) {
    announceToScreenReader('Visualização alterada para Painel de controle');
  } else if (state.isProjects) {
    announceToScreenReader('Visualização alterada para Projetos');
  } else if (state.isFinancial) {
    announceToScreenReader('Visualização alterada para Financeiro');
  }
}

function updateHeader(view) {
  if (view === 'dashboard') {
    const metrics = AppState.getCachedMetrics(() => calculateDashboardMetrics());
    renderDashboardHeader(metrics);
    if (DOM.btnNewProject) DOM.btnNewProject.style.display = 'none';
    if (DOM.searchContainer) DOM.searchContainer.style.display = 'none';
  } else if (view === 'financial') {
    const metrics = AppState.getCachedMetrics(() => calculateDashboardMetrics());
    renderFinancialHeader(metrics);
    if (DOM.btnNewProject) DOM.btnNewProject.style.display = 'none';
    if (DOM.searchContainer) DOM.searchContainer.style.display = 'flex';
    // Placeholder is set by renderFinancial() in financial.js
  } else {
    renderProjectsHeader();
    if (DOM.btnNewProject) DOM.btnNewProject.style.display = 'flex';
    if (DOM.searchContainer) DOM.searchContainer.style.display = 'flex';
    if (DOM.searchInput) {
      DOM.searchInput.placeholder = 'Buscar projeto... (/)';
    }
  }
}

// Named event handlers to allow removal and prevent duplicates
// These must be defined before setupEventListeners() to prevent duplicate listeners
const handleDeleteClick = (e) => {
  // CRITICAL: preventDefault MUST be called FIRST, synchronously
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();

  // Call async function but don't await - preventDefault already called
  deleteItem().catch(err => console.error('Error in deleteItem:', err));

  return false;
};

const handleCloseModalClick = (e) => {
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
  closeModal();
  return false;
};

const handleCancelClick = (e) => {
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
  closeModal();
  return false;
};

const handleSaveClick = (e) => {
  // CRITICAL: preventDefault MUST be called FIRST, synchronously
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();

  // Call async function but don't await - preventDefault already called
  saveForm().catch(err => console.error('Error in saveForm:', err));

  return false;
};

const handleModalOverlayClick = (e) => {
  if (e.target === DOM.modalOverlay) {
    e.preventDefault();
    e.stopPropagation();
    closeModal();
  }
};

function setupEventListeners() {
  DOM.navButtons.forEach((btn, index) => {
    btn.addEventListener('click', () => {
      if (index === 0) {
        switchView('projects');
      } else if (index === 1) {
        switchView('dashboard');
      } else if (index === 2) {
        switchView('financial');
      }
    });
  });

  window.addEventListener('popstate', (e) => {
    const currentPath = window.location.pathname;
    const view = e.state?.view || getViewFromUrl(currentPath);
    if (view === 'login' && isAuthenticated()) {
      window.location.pathname = '/';
      return;
    }
    if (view !== 'login') {
      switchView(view, currentPath);
    }
  });

  document.addEventListener('keydown', (e) => {
    const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName);

    if (isInput) {
      if (e.key === 'Enter' && e.ctrlKey && DOM.modalOverlay.classList.contains('open')) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        saveForm().catch(err => console.error('Error in saveForm:', err));
        return false;
      }
      if (e.key === 'Escape' && DOM.modalOverlay.classList.contains('open')) {
        closeModal();
        return;
      }
    }

    if (e.key === '/' && !DOM.modalOverlay.classList.contains('open') && e.target !== DOM.searchInput) {
      e.preventDefault();
      expandSearch();
    }

    const isNewProjectKey = e.key === 'n' || e.key === 'N';
    const isCtrlKeyPressed = e.ctrlKey;
    const isModalClosed = !DOM.modalOverlay.classList.contains('open');
    const shouldOpenNewProject = isNewProjectKey && isCtrlKeyPressed && isModalClosed;

    if (shouldOpenNewProject) {
      e.preventDefault();
      openModal();
    }
  });

  const btnNewProject = document.getElementById('btnNewProject');
  if (btnNewProject) {
    btnNewProject.addEventListener('click', () => openModal());
  }

  const exportBtn = document.getElementById('exportBtn');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      const isDashboard = DOM.dashboardContainer.classList.contains('active');
      const isFinancial = DOM.financialContainer.classList.contains('active');
      if (isDashboard) {
        exportDashboardData();
      } else if (isFinancial) {
        exportFinancialData();
      } else {
        exportKanbanData();
      }
    });
  }

  // Remove old listeners before adding new ones to prevent duplicates
  if (DOM.btnDelete) {
    DOM.btnDelete.removeEventListener('click', handleDeleteClick);
    // Use capture phase to catch event early
    DOM.btnDelete.addEventListener('click', handleDeleteClick, { capture: true, passive: false });
    // Also prevent on mousedown as backup
    DOM.btnDelete.addEventListener('mousedown', (e) => {
      if (e.button === 0) { // Left click only
        e.preventDefault();
      }
    }, { passive: false });
  }

  const btnCloseModal = document.getElementById('btnCloseModal');
  if (btnCloseModal) {
    btnCloseModal.removeEventListener('click', handleCloseModalClick);
    btnCloseModal.addEventListener('click', handleCloseModalClick);
  }

  const btnCancel = document.getElementById('btnCancel');
  if (btnCancel) {
    btnCancel.removeEventListener('click', handleCancelClick);
    btnCancel.addEventListener('click', handleCancelClick);
  }

  const btnSave = document.getElementById('btnSave');
  if (btnSave) {
    btnSave.removeEventListener('click', handleSaveClick);
    // Use capture phase to catch event early
    btnSave.addEventListener('click', handleSaveClick, { capture: true, passive: false });
    // Also prevent on mousedown as backup
    btnSave.addEventListener('mousedown', (e) => {
      if (e.button === 0) { // Left click only
        e.preventDefault();
      }
    }, { passive: false });
  }

  if (DOM.btnGeneratePDF) {
    DOM.btnGeneratePDF.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const tasks = AppState.getTasks();
      const currentTask = tasks.find(t => t.id === AppState.currentTaskId);
      if (currentTask) {
        generateInvoice(currentTask);
      }
    });
  }

  if (DOM.searchBtn) {
    DOM.searchBtn.addEventListener('click', expandSearch);
  }

  if (DOM.searchInput) {
    DOM.searchInput.addEventListener('input', handleSearch);
    DOM.searchInput.addEventListener('blur', collapseSearch);
  }

  // Chart toggle buttons (WCAG - Update aria-selected for screen readers)
  const chartToggleHistory = document.getElementById('chartToggleHistory');
  const chartToggleProjection = document.getElementById('chartToggleProjection');
  if (chartToggleHistory) {
    chartToggleHistory.addEventListener('click', () => {
      const tasks = AppState.getTasks();
      const historicalData = calculateMonthlyRevenue(tasks, 12);
      renderRevenueChart(historicalData, 'history');
      // Update aria-selected for accessibility
      chartToggleHistory.setAttribute('aria-selected', 'true');
      if (chartToggleProjection) {
        chartToggleProjection.setAttribute('aria-selected', 'false');
        chartToggleProjection.classList.remove('active');
      }
      chartToggleHistory.classList.add('active');
    });
  }
  if (chartToggleProjection) {
    chartToggleProjection.addEventListener('click', () => {
      const tasks = AppState.getTasks();
      const projectionData = calculateProjectedRevenue(tasks, 12);
      renderRevenueChart(projectionData, 'projection');
      // Update aria-selected for accessibility
      chartToggleProjection.setAttribute('aria-selected', 'true');
      if (chartToggleHistory) {
        chartToggleHistory.setAttribute('aria-selected', 'false');
        chartToggleHistory.classList.remove('active');
      }
      chartToggleProjection.classList.add('active');
    });
  }

  // Remove old modal overlay listener before adding new one
  if (DOM.modalOverlay) {
    DOM.modalOverlay.removeEventListener('click', handleModalOverlayClick);
    DOM.modalOverlay.addEventListener('click', handleModalOverlayClick);
  }

  DOM.formClient.addEventListener('input', () => clearFormError('client'));
  DOM.formContact.addEventListener('input', () => clearFormError('contact'));
  DOM.formDomain.addEventListener('input', () => clearFormError('domain'));
  DOM.formPrice.addEventListener('input', () => clearFormError('price'));

  // Setup paste handler for magic paste feature
  setupPasteHandler();
}

async function renderUserAvatar() {
  const user = await getCurrentUser();
  if (!user) return;

  const avatar = document.getElementById('userAvatar');
  const userProfile = document.getElementById('userProfile');
  const userDropdown = document.getElementById('userDropdown');
  const dropdownAvatar = document.getElementById('dropdownAvatar');
  const dropdownName = document.getElementById('dropdownName');
  const dropdownTheme = document.getElementById('dropdownTheme');
  const dropdownLogout = document.getElementById('dropdownLogout');

  if (avatar) {
    const initials = getInitials(user.name);
    avatar.textContent = initials;
    avatar.title = user.name;
  }

  if (dropdownAvatar) {
    const initials = getInitials(user.name);
    dropdownAvatar.textContent = initials;
  }

  if (dropdownName) {
    dropdownName.textContent = user.name;
  }

  if (userProfile) {
    userProfile.style.display = 'flex';
    avatar.addEventListener('click', toggleUserDropdown);
  }

  if (dropdownTheme) {
    dropdownTheme.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleTheme();
    });
  }

  if (dropdownLogout) {
    dropdownLogout.addEventListener('click', (e) => {
      e.stopPropagation();
      closeUserDropdown();
      logout();
    });
  }

  const currentTheme = getCurrentTheme();
  updateThemeIcon(currentTheme);
}

function toggleUserDropdown(e) {
  if (e) {
    e.stopPropagation();
  }

  const userDropdown = document.getElementById('userDropdown');
  if (!userDropdown) return;

  const isHidden = userDropdown.classList.contains('hidden');
  if (isHidden) {
    userDropdown.classList.remove('hidden');
    setTimeout(() => {
      document.addEventListener('click', closeUserDropdownOnOutsideClick, true);
    }, 0);
  } else {
    closeUserDropdown();
  }
}

function closeUserDropdown() {
  const userDropdown = document.getElementById('userDropdown');
  if (userDropdown) {
    userDropdown.classList.add('hidden');
  }
  document.removeEventListener('click', closeUserDropdownOnOutsideClick, true);
}

function closeUserDropdownOnOutsideClick(e) {
  const userProfile = document.getElementById('userProfile');
  const userDropdown = document.getElementById('userDropdown');

  if (userProfile && userDropdown &&
    !userProfile.contains(e.target)) {
    closeUserDropdown();
  }
}

async function initApp() {
  DOM.init();
  updateAriaHiddenForViews();

  // Show loading state (only in boardGrid, not entire container)
  if (DOM.boardGrid) {
    DOM.boardGrid.innerHTML = '<div style="padding: 2rem; text-align: center; color: var(--text-muted); grid-column: 1 / -1;">Carregando...</div>';
  }

  try {
    // Fetch tasks from API
    const tasks = await api.getTasks();
    if (!Array.isArray(tasks)) {
      console.error('[Init] API retornou dados inválidos:', tasks);
      throw new Error('Formato de dados inválido da API');
    }
    const normalizedTasks = normalizeTasksData(tasks);
    AppState.setTasks(normalizedTasks);
    AppState.log('Loaded from API', { count: normalizedTasks.length });
  } catch (error) {
    // Log full error for debugging
    console.error('[Init] Erro ao carregar dados:', {
      error: error.message,
      stack: error.stack
    });

    if (error.message && error.message.includes('401')) {
      logout();
      return;
    }

    // Show error message (only in boardGrid, not entire container)
    if (DOM.boardGrid) {
      DOM.boardGrid.innerHTML = `
        <div style="padding: 2rem; text-align: center; grid-column: 1 / -1;">
          <div style="color: var(--danger); margin-bottom: 1rem;">Erro ao carregar dados</div>
          <div style="color: var(--text-muted); font-size: 0.9rem;">${error.message || 'Erro desconhecido'}</div>
        </div>
      `;
    }
    AppState.setTasks([]);
    AppState.log('Failed to load tasks', { error: error.message });
  }

  initTheme();
  await renderUserAvatar();
  setupEventListeners();

  const currentPath = window.location.pathname;
  const initialView = getViewFromUrl(currentPath);
  if (initialView !== 'login') {
    switchView(initialView, currentPath);
  }

  let updateInterval = null;

  function startUpdateInterval() {
    if (updateInterval) return;

    updateInterval = setInterval(() => {
      if (document.hidden) return;

      updateDeadlineDisplays();

      if (DOM.dashboardContainer && DOM.dashboardContainer.classList.contains('active')) {
        renderDashboard();
      } else if (DOM.financialContainer && DOM.financialContainer.classList.contains('active')) {
        renderFinancial();
      } else {
        updateHeader('projects');
      }
    }, 60000);
  }

  function stopUpdateInterval() {
    if (updateInterval) {
      clearInterval(updateInterval);
      updateInterval = null;
    }
  }

  startUpdateInterval();

  const handleVisibilityChange = () => {
    if (document.hidden) {
      stopUpdateInterval();
    } else {
      startUpdateInterval();
      updateDeadlineDisplays();
      if (DOM.dashboardContainer && DOM.dashboardContainer.classList.contains('active')) {
        renderDashboard();
      } else if (DOM.financialContainer && DOM.financialContainer.classList.contains('active')) {
        renderFinancial();
      }
    }
  };

  document.addEventListener('visibilitychange', handleVisibilityChange);

  window.addEventListener('beforeunload', () => {
    stopUpdateInterval();
  });
}

function initAuth() {
  sanitizeUrl();

  const loginForm = document.getElementById('loginForm');
  const loginOverlay = document.getElementById('loginOverlay');
  const appContainer = document.getElementById('appContainer');
  const btnLogout = document.getElementById('btnLogout');

  const currentPath = window.location.pathname;
  const viewFromUrl = getViewFromUrl(currentPath);

  if (isAuthenticated()) {
    if (viewFromUrl === 'login') {
      window.location.pathname = '/';
      return;
    }

    if (loginOverlay) {
      loginOverlay.classList.add('hidden');
      loginOverlay.classList.remove('fade-out', 'fade-in');
    }
    if (appContainer) {
      appContainer.classList.remove('hidden', 'fade-out');
      appContainer.classList.remove('fade-in');
      requestAnimationFrame(() => {
        appContainer.classList.add('fade-in');
      });
    }
    initApp();
    return;
  }

  if (viewFromUrl !== 'login') {
    sessionStorage.setItem('redirectAfterLogin', currentPath);
    updateUrl('login', currentPath);
  }

  if (loginOverlay) {
    loginOverlay.classList.remove('hidden', 'fade-out');
    loginOverlay.classList.remove('fade-in');
    requestAnimationFrame(() => {
      loginOverlay.classList.add('fade-in');
    });
  }
  if (appContainer) {
    appContainer.classList.add('hidden');
    appContainer.classList.remove('fade-out', 'fade-in');
  }

  if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      e.stopPropagation();

      const emailInput = document.getElementById('loginEmail');
      const passwordInput = document.getElementById('loginPassword');
      const errorGeneral = document.getElementById('errorLoginGeneral');
      const errorEmail = document.getElementById('errorLoginEmail');
      const errorPassword = document.getElementById('errorLoginPassword');

      if (errorEmail) {
        errorEmail.classList.remove('show');
        errorEmail.textContent = '';
      }
      if (errorPassword) {
        errorPassword.classList.remove('show');
        errorPassword.textContent = '';
      }
      if (errorGeneral) {
        errorGeneral.classList.remove('show');
        errorGeneral.textContent = '';
      }

      if (emailInput) {
        emailInput.setAttribute('aria-invalid', 'false');
        emailInput.classList.remove('error');
      }
      if (passwordInput) {
        passwordInput.setAttribute('aria-invalid', 'false');
        passwordInput.classList.remove('error');
      }

      const email = emailInput ? emailInput.value.trim() : '';
      const password = passwordInput ? passwordInput.value : '';

      // Disable submit button during login
      const submitButton = loginForm.querySelector('button[type="submit"]');
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = 'Entrando...';
      }

      login(email, password).then((result) => {
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.textContent = 'Entrar';
        }

        if (result.success) {
          clearFormCredentials();

          if (loginOverlay) {
            loginOverlay.classList.remove('fade-in');
            loginOverlay.classList.add('fade-out');
          }

          setTimeout(() => {
            if (loginOverlay) {
              loginOverlay.classList.add('hidden');
              loginOverlay.classList.remove('fade-out', 'fade-in');
            }

            if (appContainer) {
              appContainer.classList.remove('hidden', 'fade-out');
              appContainer.classList.remove('fade-in');
              requestAnimationFrame(() => {
                appContainer.classList.add('fade-in');
              });
            } else {
              console.error('[Login] ERRO: appContainer não encontrado!');
            }

            clearFormCredentials();

            const savedPath = sessionStorage.getItem('redirectAfterLogin');
            sessionStorage.removeItem('redirectAfterLogin');

            if (savedPath && savedPath !== '/login') {
              window.location.pathname = savedPath;
            } else {
              window.location.pathname = '/';
            }
          }, 400);
        } else {
          if (errorGeneral) {
            errorGeneral.textContent = result.message;
            errorGeneral.classList.add('show');
          }
          if (emailInput) {
            emailInput.setAttribute('aria-invalid', 'true');
            emailInput.classList.add('error');
          }
          if (passwordInput) {
            passwordInput.setAttribute('aria-invalid', 'true');
            passwordInput.classList.add('error');
          }
        }
      }).catch((error) => {
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.textContent = 'Entrar';
        }
        if (errorGeneral) {
          errorGeneral.textContent = error.message || 'Erro ao fazer login';
          errorGeneral.classList.add('show');
        }
        if (emailInput) {
          emailInput.setAttribute('aria-invalid', 'true');
          emailInput.classList.add('error');
        }
        if (passwordInput) {
          passwordInput.setAttribute('aria-invalid', 'true');
          passwordInput.classList.add('error');
        }
      });
    });

    const emailInput = document.getElementById('loginEmail');
    const passwordInput = document.getElementById('loginPassword');

    if (emailInput) {
      emailInput.addEventListener('input', () => {
        emailInput.setAttribute('aria-invalid', 'false');
        emailInput.classList.remove('error');
        const errorEmail = document.getElementById('errorLoginEmail');
        if (errorEmail) {
          errorEmail.classList.remove('show');
          errorEmail.textContent = '';
        }
      });
    }

    if (passwordInput) {
      passwordInput.addEventListener('input', () => {
        passwordInput.setAttribute('aria-invalid', 'false');
        passwordInput.classList.remove('error');
        const errorPassword = document.getElementById('errorLoginPassword');
        if (errorPassword) {
          errorPassword.classList.remove('show');
          errorPassword.textContent = '';
        }
      });
    }
  }

}

initAuth();
