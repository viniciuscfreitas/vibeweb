// Main Initialization and Event Listeners

let cachedPath = null;
let cachedTaskId = null;
let cachedIsNew = null;

function getTaskIdFromUrl(path = null) {
  const currentPath = path || window.location.pathname;
  if (cachedPath !== currentPath) {
    cachedPath = currentPath;
    cachedTaskId = null;
    cachedIsNew = null;
  }
  if (cachedTaskId !== undefined) {
    return cachedTaskId;
  }
  const match = currentPath.match(/^\/projetos\/(\d+)$/);
  cachedTaskId = match ? match[1] : null;
  return cachedTaskId;
}

function isNewProjectUrl(path = null) {
  const currentPath = path || window.location.pathname;
  if (cachedPath !== currentPath) {
    cachedPath = currentPath;
    cachedTaskId = null;
    cachedIsNew = null;
  }
  if (cachedIsNew !== undefined) {
    return cachedIsNew;
  }
  cachedIsNew = currentPath === '/projetos/novo' || currentPath.endsWith('/projetos/novo');
  return cachedIsNew;
}

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
  if (currentPath === '/projetos/novo' || currentPath.endsWith('/projetos/novo')) {
    return 'projects';
  }
  if (getTaskIdFromUrl(currentPath)) {
    return 'projects';
  }
  if (currentPath === '/projetos' || currentPath.endsWith('/projetos')) {
    return 'projects';
  }
  if (currentPath === '/' || currentPath === '') {
    return 'projects';
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
  } else if (view === 'projects') {
    const taskId = getTaskIdFromUrl(path);
    const isNew = isNewProjectUrl(path);
    if (taskId !== null && taskId !== undefined) {
      newPath = `/projetos/${taskId}`;
    } else if (isNew) {
      newPath = '/projetos/novo';
    } else {
      newPath = '/projetos';
    }
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

  if (isDark) {
    if (DOM.dropdownThemeIcon) {
      DOM.dropdownThemeIcon.className = 'fa-solid fa-sun';
    }
    if (DOM.dropdownThemeText) {
      DOM.dropdownThemeText.textContent = 'Tema Claro';
    }
  } else if (isLight) {
    if (DOM.dropdownThemeIcon) {
      DOM.dropdownThemeIcon.className = 'fa-solid fa-moon';
    }
    if (DOM.dropdownThemeText) {
      DOM.dropdownThemeText.textContent = 'Tema Escuro';
    }
  }

  updateProfileModalThemeIcon(theme);
}

function toggleTheme() {
  const currentTheme = getCurrentTheme();
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  setTheme(newTheme);
  updateProfileModalThemeIcon(newTheme);
  AppState.log('Theme toggled', { theme: newTheme });
}

function initTheme() {
  const theme = getCurrentTheme();
  setTheme(theme);
}

let _settingsCache = null;
let _settingsCacheKey = null;

function getDefaultSettings() {
  return {
    hostingPrice: HOSTING_PRICE_EUR,
    defaultTicket: DEFAULT_AVERAGE_TICKET,
    autoUpdate: true,
    searchDebounce: SEARCH_DEBOUNCE_MS,
    enableCache: true,
    showUrgent: true,
    urgentHours: URGENT_HOURS_48
  };
}

function getSettings() {
  try {
    const saved = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (saved === _settingsCacheKey && _settingsCache) {
      return _settingsCache;
    }
    if (saved) {
      const parsed = JSON.parse(saved);
      const settings = { ...getDefaultSettings(), ...parsed };
      _settingsCache = settings;
      _settingsCacheKey = saved;
      return settings;
    }
  } catch (e) {
    console.error('[Settings] Erro ao carregar configurações:', e);
  }
  const defaultSettings = getDefaultSettings();
  _settingsCache = defaultSettings;
  _settingsCacheKey = null;
  return defaultSettings;
}

function saveSettings(settings) {
  try {
    const serialized = JSON.stringify(settings);
    localStorage.setItem(SETTINGS_STORAGE_KEY, serialized);
    _settingsCache = settings;
    _settingsCacheKey = serialized;
    AppState.log('Settings saved', settings);
    return true;
  } catch (e) {
    console.error('[Settings] Erro ao salvar configurações:', e);
    return false;
  }
}

function clearAvatarPreview() {
  if (!DOM.profileAvatarPreview) return;
  DOM.profileAvatarPreview.style.backgroundImage = '';
  DOM.profileAvatarPreview.style.backgroundSize = '';
  DOM.profileAvatarPreview.style.backgroundPosition = '';
}

async function loadSettingsIntoForm() {
  const settings = getSettings();
  if (DOM.settingsHostingPrice) DOM.settingsHostingPrice.value = settings.hostingPrice || '';
  if (DOM.settingsDefaultTicket) DOM.settingsDefaultTicket.value = settings.defaultTicket || '';
  if (DOM.settingsAutoUpdate) DOM.settingsAutoUpdate.checked = settings.autoUpdate !== false;
  if (DOM.settingsSearchDebounce) DOM.settingsSearchDebounce.value = settings.searchDebounce || SEARCH_DEBOUNCE_MS;
  if (DOM.settingsEnableCache) DOM.settingsEnableCache.checked = settings.enableCache !== false;
  if (DOM.settingsShowUrgent) DOM.settingsShowUrgent.checked = settings.showUrgent !== false;
  if (DOM.settingsUrgentHours) DOM.settingsUrgentHours.value = settings.urgentHours || URGENT_HOURS_48;

  const saved = localStorage.getItem('vibeTasks_auth');
  let user = null;
  if (saved) {
    try {
      user = JSON.parse(saved);
    } catch (e) {
      user = await getCurrentUser();
    }
  } else {
    user = await getCurrentUser();
  }

  if (user) {
    if (DOM.profileName) DOM.profileName.value = user.name || '';
    if (DOM.profileEmail) DOM.profileEmail.value = user.email || '';
    if (DOM.profileAvatarPreview) {
      if (user.avatar_url) {
        const apiBaseUrl = getApiBaseUrl();
        const fullUrl = user.avatar_url.startsWith('http') ? user.avatar_url : `${apiBaseUrl}${user.avatar_url}`;
        DOM.profileAvatarPreview.style.backgroundImage = `url(${fullUrl})`;
        DOM.profileAvatarPreview.style.backgroundSize = 'cover';
        DOM.profileAvatarPreview.style.backgroundPosition = 'center';
        DOM.profileAvatarPreview.textContent = '';
      } else {
        DOM.profileAvatarPreview.textContent = getInitials(user.name);
        clearAvatarPreview();
      }
    }
    if (DOM.profileCurrentPassword) DOM.profileCurrentPassword.value = '';
    if (DOM.profileNewPassword) DOM.profileNewPassword.value = '';
  }
}

function getSettingsFromForm() {
  const hostingPriceRaw = DOM.settingsHostingPrice ? parseFloat(DOM.settingsHostingPrice.value) : NaN;
  const defaultTicketRaw = DOM.settingsDefaultTicket ? parseFloat(DOM.settingsDefaultTicket.value) : NaN;
  const searchDebounceRaw = DOM.settingsSearchDebounce ? parseInt(DOM.settingsSearchDebounce.value, 10) : NaN;
  const urgentHoursRaw = DOM.settingsUrgentHours ? parseInt(DOM.settingsUrgentHours.value, 10) : NaN;

  return {
    hostingPrice: !isNaN(hostingPriceRaw) && hostingPriceRaw >= 0 ? hostingPriceRaw : HOSTING_PRICE_EUR,
    defaultTicket: !isNaN(defaultTicketRaw) && defaultTicketRaw >= 0 ? defaultTicketRaw : DEFAULT_AVERAGE_TICKET,
    autoUpdate: DOM.settingsAutoUpdate ? DOM.settingsAutoUpdate.checked : true,
    searchDebounce: !isNaN(searchDebounceRaw) && searchDebounceRaw >= 0 ? searchDebounceRaw : SEARCH_DEBOUNCE_MS,
    enableCache: DOM.settingsEnableCache ? DOM.settingsEnableCache.checked : true,
    showUrgent: DOM.settingsShowUrgent ? DOM.settingsShowUrgent.checked : true,
    urgentHours: !isNaN(urgentHoursRaw) && urgentHoursRaw >= 1 ? urgentHoursRaw : URGENT_HOURS_48
  };
}

async function openSettingsModal() {
  if (!DOM.settingsModalOverlay) return;
  await loadSettingsIntoForm();
  DOM.settingsModalOverlay.classList.remove('hidden');
  DOM.settingsModalOverlay.classList.add('open');
  DOM.settingsModalOverlay.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  announceToScreenReader('Modal de configurações aberto');
}

function closeSettingsModal() {
  if (!DOM.settingsModalOverlay) return;

  if (DOM.profileAvatar) {
    DOM.profileAvatar.value = '';
    delete DOM.profileAvatar._cachedData;
  }

  if (DOM.profileAvatarPreview) {
    const saved = localStorage.getItem('vibeTasks_auth');
    if (saved) {
      try {
        const user = JSON.parse(saved);
        if (user?.name) {
          DOM.profileAvatarPreview.textContent = getInitials(user.name);
          clearAvatarPreview();
        }
      } catch (e) {
        // Silent fail
      }
    }
  }

  DOM.settingsModalOverlay.classList.add('hidden');
  DOM.settingsModalOverlay.classList.remove('open');
  DOM.settingsModalOverlay.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  announceToScreenReader('Modal de configurações fechado');
}

async function saveSettingsFromForm() {
  const settings = getSettingsFromForm();

  if (settings.hostingPrice <= 0 || settings.hostingPrice > 10000) {
    NotificationManager.error('Preço de hospedagem deve estar entre 0.01 e 10000');
    return;
  }

  if (settings.defaultTicket < 0 || settings.defaultTicket > 100000) {
    NotificationManager.error('Ticket médio deve estar entre 0 e 100000');
    return;
  }

  if (settings.urgentHours < 1 || settings.urgentHours > 720) {
    NotificationManager.error('Horas de urgência devem estar entre 1 e 720');
    return;
  }

  if (settings.searchDebounce < 0 || settings.searchDebounce > 5000) {
    NotificationManager.error('Tempo de busca deve estar entre 0 e 5000ms');
    return;
  }

  let profileUpdated = false;
  const nameRaw = DOM.profileName?.value.trim() || '';
  const emailRaw = DOM.profileEmail?.value.trim() || '';
  const hasName = nameRaw.length > 0;
  const hasEmail = emailRaw.length > 0;

  let avatarUploaded = false;
  if (DOM.profileAvatar?.files?.[0]) {
    const file = DOM.profileAvatar.files[0];
    if (file.size > 2 * 1024 * 1024) {
      NotificationManager.error('Arquivo muito grande. Máximo 2MB');
      return;
    }
    if (!file.type.startsWith('image/')) {
      NotificationManager.error('Apenas imagens são permitidas');
      return;
    }

    try {
      const avatarData = DOM.profileAvatar._cachedData || await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const uploadResult = await api.uploadAvatar(avatarData);
      if (uploadResult?.user) {
        setCurrentUser(uploadResult.user);
        await renderUserAvatar(uploadResult.user);
        profileUpdated = true;
        avatarUploaded = true;
      }
    } catch (error) {
      NotificationManager.error(error.message || 'Erro ao fazer upload da foto');
      return;
    }
  }

  if (hasName || hasEmail) {
    if (hasName && (nameRaw.length < 2 || nameRaw.length > 100)) {
      NotificationManager.error('Nome deve ter entre 2 e 100 caracteres');
      return;
    }

    if (hasEmail && !EMAIL_REGEX.test(emailRaw)) {
      NotificationManager.error('Email inválido');
      return;
    }

    try {
      const updatedUser = await api.updateProfile(
        hasName ? nameRaw : undefined,
        hasEmail ? emailRaw : undefined,
        undefined
      );
      if (updatedUser) {
        setCurrentUser(updatedUser);
        await renderUserAvatar(updatedUser);
        profileUpdated = true;
      }
    } catch (error) {
      NotificationManager.error(error.message || 'Erro ao atualizar perfil');
      return;
    }
  }

  const currentPassword = DOM.profileCurrentPassword?.value || '';
  const newPassword = DOM.profileNewPassword?.value || '';

  if (currentPassword || newPassword) {
    if (!currentPassword || !newPassword) {
      NotificationManager.error('Para alterar a senha, preencha ambos os campos');
      return;
    }

    if (newPassword.length < 6 || newPassword.length > 128) {
      NotificationManager.error('Nova senha deve ter entre 6 e 128 caracteres');
      return;
    }

    try {
      await api.updatePassword(currentPassword, newPassword);
      DOM.profileCurrentPassword.value = '';
      DOM.profileNewPassword.value = '';
      NotificationManager.success('Senha atualizada com sucesso');
    } catch (error) {
      NotificationManager.error(error.message || 'Erro ao atualizar senha');
      return;
    }
  }

  if (saveSettings(settings)) {
    closeSettingsModal();
    closeUserDropdown();
    AppState.log('Settings applied', settings);
    if (profileUpdated) {
      NotificationManager.success('Configurações e perfil atualizados com sucesso');
    } else {
      NotificationManager.success('Configurações salvas com sucesso');
    }
    if (DOM.dashboardContainer && DOM.dashboardContainer.classList.contains('active')) {
      renderDashboard();
    } else if (DOM.financialContainer && DOM.financialContainer.classList.contains('active')) {
      resetFinancialRenderState();
      renderFinancial();
    }
  } else {
    NotificationManager.error('Erro ao salvar configurações');
  }
}

function clearCache() {
  AppState.clearMetricsCache();
  AppState.clearActivitiesCache();
  NotificationManager.success('Cache limpo com sucesso');
  AppState.log('Cache cleared');
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
  const settings = getSettings();
  if (AppState.searchTimeout) {
    clearTimeout(AppState.searchTimeout);
  }
  AppState.searchTimeout = setTimeout(() => {
    renderBoard();
    updateHeaderStats();
    AppState.log('Search executed');
  }, settings.searchDebounce);
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
    renderBoard();
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

    fadeContainer(DOM.financialContainer, true);
    resetFinancialRenderState();
    renderFinancial();
    updateHeader('financial');
  }, 150);
}

function updateBottomNavCentralButton(view) {
  const centralBtn = DOM.bottomNavCentral;
  if (!centralBtn) return;

  const shouldShow = view === 'projects';
  const isCurrentlyVisible = centralBtn.style.display !== 'none';
  const currentView = centralBtn._currentView;

  if (currentView === view && shouldShow === isCurrentlyVisible) {
    return;
  }

  if (currentView !== view) {
    centralBtn.innerHTML = '';
    const oldHandler = centralBtn._clickHandler;
    if (oldHandler) {
      centralBtn.removeEventListener('click', oldHandler);
      centralBtn._clickHandler = null;
    }
  }

  if (shouldShow) {
    if (!centralBtn.querySelector('i')) {
      const icon = document.createElement('i');
      icon.className = 'fa-solid fa-plus';
      icon.setAttribute('aria-hidden', 'true');
      centralBtn.appendChild(icon);
    }

    if (!centralBtn._clickHandler) {
      const clickHandler = () => openModal();
      centralBtn.addEventListener('click', clickHandler);
      centralBtn._clickHandler = clickHandler;
    }
    centralBtn.style.display = 'flex';
  } else {
    centralBtn.style.display = 'none';
  }

  centralBtn._currentView = view;
}

function updateNavButtons(isProjects, isDashboard, isFinancial) {
  if (!DOM.navButtons || DOM.navButtons.length < 3) return;

  const projectsBtn = DOM.navButtons[0];
  const dashboardBtn = DOM.navButtons[1];
  const financialBtn = DOM.navButtons[2];

  if (projectsBtn) {
    const isActive = projectsBtn.classList.contains('active');
    if (isProjects !== isActive) {
      projectsBtn.classList.toggle('active', isProjects);
      if (isProjects) {
        projectsBtn.setAttribute('aria-current', 'page');
      } else {
        projectsBtn.removeAttribute('aria-current');
      }
    }
  }

  if (dashboardBtn) {
    const isActive = dashboardBtn.classList.contains('active');
    if (isDashboard !== isActive) {
      dashboardBtn.classList.toggle('active', isDashboard);
      if (isDashboard) {
        dashboardBtn.setAttribute('aria-current', 'page');
      } else {
        dashboardBtn.removeAttribute('aria-current');
      }
    }
  }

  if (financialBtn) {
    const isActive = financialBtn.classList.contains('active');
    if (isFinancial !== isActive) {
      financialBtn.classList.toggle('active', isFinancial);
      if (isFinancial) {
        financialBtn.setAttribute('aria-current', 'page');
      } else {
        financialBtn.removeAttribute('aria-current');
      }
    }
  }

  const bottomProjectsBtn = DOM.bottomNavProjects;
  const bottomDashboardBtn = DOM.bottomNavDashboard;
  const bottomFinancialBtn = DOM.bottomNavFinancial;

  if (bottomProjectsBtn) {
    const isActive = bottomProjectsBtn.classList.contains('active');
    if (isProjects !== isActive) {
      bottomProjectsBtn.classList.toggle('active', isProjects);
      if (isProjects) {
        bottomProjectsBtn.setAttribute('aria-current', 'page');
      } else {
        bottomProjectsBtn.removeAttribute('aria-current');
      }
    }
  }

  if (bottomDashboardBtn) {
    const isActive = bottomDashboardBtn.classList.contains('active');
    if (isDashboard !== isActive) {
      bottomDashboardBtn.classList.toggle('active', isDashboard);
      if (isDashboard) {
        bottomDashboardBtn.setAttribute('aria-current', 'page');
      } else {
        bottomDashboardBtn.removeAttribute('aria-current');
      }
    }
  }

  if (bottomFinancialBtn) {
    const isActive = bottomFinancialBtn.classList.contains('active');
    if (isFinancial !== isActive) {
      bottomFinancialBtn.classList.toggle('active', isFinancial);
      if (isFinancial) {
        bottomFinancialBtn.setAttribute('aria-current', 'page');
      } else {
        bottomFinancialBtn.removeAttribute('aria-current');
      }
    }
  }
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
    fadeContainer(DOM.financialContainer, true);
  } else {
    DOM.financialContainer.classList.remove('active');
    DOM.financialContainer.classList.add('hidden');
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
    resetFinancialRenderState();
    renderFinancial();
    updateHeader('financial');
  } else {
    const view = state.isDashboard ? 'dashboard' : state.isProjects ? 'projects' : 'financial';
    updateHeader(view);
  }

  if (state.isProjects) {
    renderBoard();
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
  updateBottomNavCentralButton(view);

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
    updateBottomNavCentralButton('dashboard');
  } else if (view === 'financial') {
    const metrics = AppState.getCachedMetrics(() => calculateDashboardMetrics());
    renderFinancialHeader(metrics);
    if (DOM.btnNewProject) DOM.btnNewProject.style.display = 'none';
    if (DOM.searchContainer) DOM.searchContainer.style.display = 'flex';
    updateBottomNavCentralButton('financial');
    // Placeholder is set by renderFinancial() in financial.js
  } else {
    renderProjectsHeader();
    if (DOM.btnNewProject) DOM.btnNewProject.style.display = 'flex';
    if (DOM.searchContainer) DOM.searchContainer.style.display = 'flex';
    if (DOM.searchInput) {
      DOM.searchInput.placeholder = 'Buscar projeto... (/)';
    }
    updateBottomNavCentralButton('projects');
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

  if (DOM.bottomNavItems && DOM.bottomNavItems.length > 0) {
    DOM.bottomNavItems.forEach((btn) => {
      const view = btn.getAttribute('data-view');
      if (view) {
        const oldHandler = btn._clickHandler;
        if (oldHandler) {
          btn.removeEventListener('click', oldHandler);
        }
        const clickHandler = (e) => {
          e.preventDefault();
          e.stopPropagation();
          switchView(view);
        };
        btn.addEventListener('click', clickHandler, { passive: false });
        btn._clickHandler = clickHandler;
      }
    });
  }

  if (DOM.bottomNavProfile) {
    const oldProfileHandler = DOM.bottomNavProfile._clickHandler;
    if (oldProfileHandler) {
      DOM.bottomNavProfile.removeEventListener('click', oldProfileHandler);
    }
    const profileClickHandler = (e) => {
      e.preventDefault();
      e.stopPropagation();
      openProfileModal();
    };
    DOM.bottomNavProfile.addEventListener('click', profileClickHandler, { passive: false });
    DOM.bottomNavProfile._clickHandler = profileClickHandler;
  }

  const btnCloseProfileModal = document.getElementById('btnCloseProfileModal');
  if (btnCloseProfileModal) {
    const oldCloseHandler = btnCloseProfileModal._closeClickHandler;
    if (oldCloseHandler) {
      btnCloseProfileModal.removeEventListener('click', oldCloseHandler);
    }
    const closeClickHandler = (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeProfileModal();
    };
    btnCloseProfileModal._closeClickHandler = closeClickHandler;
    btnCloseProfileModal.addEventListener('click', closeClickHandler);
  }

  if (DOM.profileModalSettings) {
    const oldSettingsHandler = DOM.profileModalSettings._settingsClickHandler;
    if (oldSettingsHandler) {
      DOM.profileModalSettings.removeEventListener('click', oldSettingsHandler);
    }
    const settingsClickHandler = (e) => {
      e.stopPropagation();
      closeProfileModal();
      openSettingsModal();
    };
    DOM.profileModalSettings._settingsClickHandler = settingsClickHandler;
    DOM.profileModalSettings.addEventListener('click', settingsClickHandler);
  }

  if (DOM.profileModalTheme) {
    const oldThemeHandler = DOM.profileModalTheme._themeClickHandler;
    if (oldThemeHandler) {
      DOM.profileModalTheme.removeEventListener('click', oldThemeHandler);
    }
    const themeClickHandler = (e) => {
      e.stopPropagation();
      toggleTheme();
    };
    DOM.profileModalTheme._themeClickHandler = themeClickHandler;
    DOM.profileModalTheme.addEventListener('click', themeClickHandler);
  }

  if (DOM.profileModalLogout) {
    const oldLogoutHandler = DOM.profileModalLogout._logoutClickHandler;
    if (oldLogoutHandler) {
      DOM.profileModalLogout.removeEventListener('click', oldLogoutHandler);
    }
    const logoutClickHandler = (e) => {
      e.stopPropagation();
      closeProfileModal();
      logout();
    };
    DOM.profileModalLogout._logoutClickHandler = logoutClickHandler;
    DOM.profileModalLogout.addEventListener('click', logoutClickHandler);
  }

  if (DOM.profileModalOverlay) {
    const oldOverlayHandler = DOM.profileModalOverlay._overlayClickHandler;
    if (oldOverlayHandler) {
      DOM.profileModalOverlay.removeEventListener('click', oldOverlayHandler);
    }
    const overlayClickHandler = (e) => {
      if (e.target === DOM.profileModalOverlay) {
        e.preventDefault();
        closeProfileModal();
      }
    };
    DOM.profileModalOverlay._overlayClickHandler = overlayClickHandler;
    DOM.profileModalOverlay.addEventListener('click', overlayClickHandler);
  }

  window.addEventListener('popstate', (e) => {
    const currentPath = window.location.pathname;
    const view = e.state?.view || getViewFromUrl(currentPath);
    if (view === 'login' && isAuthenticated()) {
      window.location.pathname = '/';
      return;
    }
    if (view !== 'login') {
      switchView(view, currentPath);

      const taskId = getTaskIdFromUrl(currentPath);
      const isNew = isNewProjectUrl(currentPath);
      const hasOpenModal = typeof window.openModal === 'function';
      const modalIsOpen = DOM.modalOverlay?.classList.contains('open');

      if (taskId && hasOpenModal) {
        const tasks = AppState.getTasks();
        const taskIdNum = parseInt(taskId, 10);
        const task = isNaN(taskIdNum) ? null : tasks.find(t => t.id === taskIdNum);
        if (task) {
          setTimeout(() => {
            window.openModal(task);
          }, 300);
        } else if (modalIsOpen) {
          window.closeModal();
        }
      } else if (isNew && hasOpenModal) {
        setTimeout(() => {
          window.openModal();
        }, 300);
      } else if (modalIsOpen) {
        window.closeModal();
      }
    }
  });

  document.addEventListener('keydown', (e) => {
    const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName);

    if (e.key === 'Escape') {
      if (DOM.settingsModalOverlay && DOM.settingsModalOverlay.classList.contains('open')) {
        e.preventDefault();
        closeSettingsModal();
        return;
      }
      if (DOM.profileModalOverlay && DOM.profileModalOverlay.classList.contains('open')) {
        e.preventDefault();
        closeProfileModal();
        return;
      }
      if (DOM.modalOverlay && DOM.modalOverlay.classList.contains('open')) {
        if (isInput) {
          closeModal();
          return;
        }
      }
    }

    if (isInput) {
      if (e.key === 'Enter' && e.ctrlKey && DOM.modalOverlay && DOM.modalOverlay.classList.contains('open')) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        saveForm().catch(err => console.error('Error in saveForm:', err));
        return false;
      }
    }

    if (e.key === '/' && !DOM.modalOverlay.classList.contains('open') && !DOM.settingsModalOverlay.classList.contains('open') && e.target !== DOM.searchInput) {
      e.preventDefault();
      expandSearch();
    }

    const isNewProjectKey = e.key === 'n' || e.key === 'N';
    const isCtrlKeyPressed = e.ctrlKey;
    const isModalClosed = !DOM.modalOverlay.classList.contains('open') && !DOM.settingsModalOverlay.classList.contains('open');
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
    DOM.btnGeneratePDF.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const currentTaskId = AppState.currentTaskId;
      if (currentTaskId) {
        const tasks = AppState.getTasks();
        const currentTask = tasks.find(t => t.id === currentTaskId);
        if (currentTask) {
          const originalHTML = DOM.btnGeneratePDF.innerHTML;
          DOM.btnGeneratePDF.disabled = true;
          DOM.btnGeneratePDF.innerHTML = '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Gerando PDF...';

          try {
            await generateInvoice(currentTask);
            NotificationManager.success('PDF gerado com sucesso!');
          } catch (error) {
            NotificationManager.error('Erro ao gerar PDF. Tente novamente.');
          } finally {
            DOM.btnGeneratePDF.disabled = false;
            DOM.btnGeneratePDF.innerHTML = originalHTML;
          }
        }
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

  let cachedChartData = {
    historical: null,
    projection: null,
    tasksHash: null
  };

  const chartToggleHistory = document.getElementById('chartToggleHistory');
  const chartToggleProjection = document.getElementById('chartToggleProjection');

  function getChartData(type) {
    const tasks = AppState.getTasks();
    let tasksHash = tasks.length;
    if (tasks.length > 0) {
      for (let i = 0; i < tasks.length; i++) {
        tasksHash = ((tasksHash << 5) - tasksHash) + (tasks[i].id || 0);
        tasksHash = tasksHash & tasksHash;
      }
    }

    if (cachedChartData.tasksHash !== tasksHash) {
      cachedChartData.historical = null;
      cachedChartData.projection = null;
      cachedChartData.tasksHash = tasksHash;
    }

    if (type === 'history') {
      if (!cachedChartData.historical) {
        cachedChartData.historical = calculateMonthlyRevenue(tasks, 12);
      }
      return cachedChartData.historical;
    } else {
      if (!cachedChartData.projection) {
        cachedChartData.projection = calculateProjectedRevenue(tasks, 12);
      }
      return cachedChartData.projection;
    }
  }

  if (chartToggleHistory) {
    chartToggleHistory.addEventListener('click', () => {
      const historicalData = getChartData('history');
      renderRevenueChart(historicalData, 'history');
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
      const projectionData = getChartData('projection');
      renderRevenueChart(projectionData, 'projection');
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

  const btnCloseSettingsModal = document.getElementById('btnCloseSettingsModal');
  if (btnCloseSettingsModal) {
    btnCloseSettingsModal.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeSettingsModal();
    });
  }

  const btnCancelSettings = document.getElementById('btnCancelSettings');
  if (btnCancelSettings) {
    btnCancelSettings.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeSettingsModal();
    });
  }

  const btnSaveSettings = document.getElementById('btnSaveSettings');
  if (btnSaveSettings) {
    btnSaveSettings.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      saveSettingsFromForm().catch(err => console.error('Error in saveSettingsFromForm:', err));
    });
  }

  if (DOM.profileAvatar) {
    DOM.profileAvatar.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      if (file.size > 2 * 1024 * 1024) {
        NotificationManager.error('Arquivo muito grande. Máximo 2MB');
        e.target.value = '';
        return;
      }

      if (!file.type.startsWith('image/')) {
        NotificationManager.error('Apenas imagens são permitidas');
        e.target.value = '';
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        const avatarData = event.target.result;
        DOM.profileAvatar._cachedData = avatarData;
        if (DOM.profileAvatarPreview) {
          DOM.profileAvatarPreview.style.backgroundImage = `url(${avatarData})`;
          DOM.profileAvatarPreview.style.backgroundSize = 'cover';
          DOM.profileAvatarPreview.style.backgroundPosition = 'center';
          DOM.profileAvatarPreview.textContent = '';
        }
      };
      reader.readAsDataURL(file);
    });
  }

  if (DOM.profileName) {
    DOM.profileName.addEventListener('input', () => {
      if (DOM.errorProfileName) {
        DOM.errorProfileName.classList.remove('show');
        DOM.errorProfileName.textContent = '';
      }
    });
  }

  if (DOM.profileEmail) {
    DOM.profileEmail.addEventListener('input', () => {
      if (DOM.errorProfileEmail) {
        DOM.errorProfileEmail.classList.remove('show');
        DOM.errorProfileEmail.textContent = '';
      }
    });
  }

  if (DOM.btnClearCache) {
    DOM.btnClearCache.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      clearCache();
    });
  }

  if (DOM.settingsModalOverlay) {
    DOM.settingsModalOverlay.addEventListener('click', (e) => {
      if (e.target === DOM.settingsModalOverlay) {
        e.preventDefault();
        closeSettingsModal();
      }
    });
  }

  DOM.formClient.addEventListener('input', () => clearFormError('client'));
  DOM.formContact.addEventListener('input', () => clearFormError('contact'));
  DOM.formDomain.addEventListener('input', () => clearFormError('domain'));
  DOM.formPrice.addEventListener('input', () => clearFormError('price'));

  // Setup paste handler for magic paste feature
  if (typeof window.setupPasteHandler === 'function') {
    window.setupPasteHandler();
  }
}

function setAvatarImage(element, avatarUrl, initials) {
  if (!element) return;
  const apiBaseUrl = getApiBaseUrl();
  if (avatarUrl) {
    const fullUrl = avatarUrl.startsWith('http') ? avatarUrl : `${apiBaseUrl}${avatarUrl}`;
    element.style.backgroundImage = `url(${fullUrl})`;
    element.style.backgroundSize = 'cover';
    element.style.backgroundPosition = 'center';
    element.textContent = '';
  } else {
    element.style.backgroundImage = '';
    element.style.backgroundSize = '';
    element.style.backgroundPosition = '';
    element.textContent = initials;
  }
}

async function renderUserAvatar(userParam = null) {
  const user = userParam || await getCurrentUser();
  if (!user) return;

  const initials = getInitials(user.name);
  if (DOM.userAvatar) {
    setAvatarImage(DOM.userAvatar, user.avatar_url, initials);
    DOM.userAvatar.title = user.name;
  }

  if (DOM.dropdownAvatar) {
    setAvatarImage(DOM.dropdownAvatar, user.avatar_url, initials);
  }

  if (DOM.dropdownName) {
    DOM.dropdownName.textContent = user.name;
  }

  if (DOM.bottomNavAvatar) {
    setAvatarImage(DOM.bottomNavAvatar, user.avatar_url, initials);
  }

  if (DOM.profileModalAvatar) {
    setAvatarImage(DOM.profileModalAvatar, user.avatar_url, initials);
  }

  if (DOM.profileModalName) {
    DOM.profileModalName.textContent = user.name;
  }

  if (DOM.userProfile) {
    DOM.userProfile.style.display = 'flex';
    if (DOM.userAvatar) {
      DOM.userAvatar.removeEventListener('click', toggleUserDropdown);
      DOM.userAvatar.addEventListener('click', toggleUserDropdown);
    }
  }

  if (DOM.dropdownSettings) {
    const oldSettingsHandler = DOM.dropdownSettings._settingsClickHandler;
    if (oldSettingsHandler) {
      DOM.dropdownSettings.removeEventListener('click', oldSettingsHandler);
    }
    const settingsClickHandler = (e) => {
      e.stopPropagation();
      closeUserDropdown();
      openSettingsModal();
    };
    DOM.dropdownSettings._settingsClickHandler = settingsClickHandler;
    DOM.dropdownSettings.addEventListener('click', settingsClickHandler);
  }

  if (DOM.dropdownTheme) {
    const oldThemeHandler = DOM.dropdownTheme._themeClickHandler;
    if (oldThemeHandler) {
      DOM.dropdownTheme.removeEventListener('click', oldThemeHandler);
    }
    const themeClickHandler = (e) => {
      e.stopPropagation();
      toggleTheme();
    };
    DOM.dropdownTheme._themeClickHandler = themeClickHandler;
    DOM.dropdownTheme.addEventListener('click', themeClickHandler);
  }

  if (DOM.dropdownLogout) {
    const oldLogoutHandler = DOM.dropdownLogout._logoutClickHandler;
    if (oldLogoutHandler) {
      DOM.dropdownLogout.removeEventListener('click', oldLogoutHandler);
    }
    const logoutClickHandler = (e) => {
      e.stopPropagation();
      closeUserDropdown();
      logout();
    };
    DOM.dropdownLogout._logoutClickHandler = logoutClickHandler;
    DOM.dropdownLogout.addEventListener('click', logoutClickHandler);
  }

  const currentTheme = getCurrentTheme();
  updateThemeIcon(currentTheme);
}

function openProfileModal() {
  if (!DOM.profileModalOverlay) return;
  DOM.profileModalOverlay.classList.remove('hidden');
  DOM.profileModalOverlay.classList.add('open');
  DOM.profileModalOverlay.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  announceToScreenReader('Menu de perfil aberto');
}

function closeProfileModal() {
  if (!DOM.profileModalOverlay) return;
  DOM.profileModalOverlay.classList.add('hidden');
  DOM.profileModalOverlay.classList.remove('open');
  DOM.profileModalOverlay.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  announceToScreenReader('Menu de perfil fechado');
}

function updateProfileModalThemeIcon(theme) {
  const isDark = theme === 'dark';
  const isLight = theme === 'light';

  if (isDark) {
    if (DOM.profileModalThemeIcon) {
      DOM.profileModalThemeIcon.className = 'fa-solid fa-sun';
    }
    if (DOM.profileModalThemeText) {
      DOM.profileModalThemeText.textContent = 'Tema Claro';
    }
  } else if (isLight) {
    if (DOM.profileModalThemeIcon) {
      DOM.profileModalThemeIcon.className = 'fa-solid fa-moon';
    }
    if (DOM.profileModalThemeText) {
      DOM.profileModalThemeText.textContent = 'Tema Escuro';
    }
  }
}

function toggleUserDropdown(e) {
  if (e) {
    e.stopPropagation();
  }

  if (!DOM.userDropdown) return;

  const isHidden = DOM.userDropdown.classList.contains('hidden');
  if (isHidden) {
    DOM.userDropdown.classList.remove('hidden');
    setTimeout(() => {
      document.addEventListener('click', closeUserDropdownOnOutsideClick, true);
    }, 0);
  } else {
    closeUserDropdown();
  }
}

function closeUserDropdown() {
  if (DOM.userDropdown) {
    DOM.userDropdown.classList.add('hidden');
  }
  document.removeEventListener('click', closeUserDropdownOnOutsideClick, true);
}

function closeUserDropdownOnOutsideClick(e) {
  const clickedOutside = DOM.userDropdown && !DOM.userDropdown.contains(e.target);
  const clickedOutsideProfile = DOM.userProfile && !DOM.userProfile.contains(e.target);
  const clickedOutsideBottomNav = DOM.bottomNavProfile && !DOM.bottomNavProfile.contains(e.target);

  if (clickedOutside && clickedOutsideProfile && clickedOutsideBottomNav) {
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

  if (typeof setupFormAutoSave === 'function') {
    setupFormAutoSave();
  }

  if (typeof connectWebSocket === 'function') {
    connectWebSocket();
  }

  const currentPath = window.location.pathname;
  const initialView = getViewFromUrl(currentPath);
  if (initialView !== 'login') {
    switchView(initialView, currentPath);

    const taskId = getTaskIdFromUrl(currentPath);
    const isNew = isNewProjectUrl(currentPath);
    const hasOpenModal = typeof window.openModal === 'function';

    if (taskId && hasOpenModal) {
      const tasks = AppState.getTasks();
      const taskIdNum = parseInt(taskId, 10);
      const task = isNaN(taskIdNum) ? null : tasks.find(t => t.id === taskIdNum);
      if (task) {
        setTimeout(() => {
          window.openModal(task);
        }, 300);
      }
    } else if (isNew && hasOpenModal) {
      setTimeout(() => {
        window.openModal();
      }, 300);
    }
  }

  let updateInterval = null;

  function startUpdateInterval() {
    if (updateInterval) return;

    let lastUpdateTime = Date.now();
    const UPDATE_INTERVAL_MS = 60000;

    updateInterval = setInterval(() => {
      if (document.hidden) return;

      const now = Date.now();
      if (now - lastUpdateTime < UPDATE_INTERVAL_MS - 1000) return;
      lastUpdateTime = now;

      updateDeadlineDisplays();

      if (DOM.dashboardContainer && DOM.dashboardContainer.classList.contains('active')) {
        renderDashboard();
      } else if (DOM.financialContainer && DOM.financialContainer.classList.contains('active')) {
        renderFinancial();
      } else {
        updateHeader('projects');
      }
    }, UPDATE_INTERVAL_MS);
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
    if (loginOverlay) {
      loginOverlay.classList.add('hidden');
      loginOverlay.classList.remove('fade-out', 'fade-in');
    }
    if (appContainer) {
      appContainer.classList.remove('hidden', 'fade-out');
      appContainer.classList.remove('fade-in');
    }

    if (viewFromUrl === 'login') {
      window.location.pathname = '/';
      return;
    }

    if (appContainer) {
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
    const emailInput = document.getElementById('loginEmail');
    const passwordInput = document.getElementById('loginPassword');
    const errorGeneral = document.getElementById('errorLoginGeneral');
    const errorEmail = document.getElementById('errorLoginEmail');
    const errorPassword = document.getElementById('errorLoginPassword');
    const submitButton = loginForm.querySelector('button[type="submit"]');
    const spinner = submitButton ? submitButton.querySelector('.btn-loading-spinner') : null;

    function isCredentialError(msg) {
      return msg.includes('credenciais') || msg.includes('inválid') || msg.includes('401');
    }

    function isNetworkError(msg) {
      return msg.includes('rede') || msg.includes('network') || msg.includes('fetch');
    }

    loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      e.stopPropagation();

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

      let hasErrors = false;
      if (!email) {
        if (errorEmail) {
          errorEmail.textContent = 'Email ou usuário é obrigatório';
          errorEmail.classList.add('show');
        }
        if (emailInput) {
          emailInput.setAttribute('aria-invalid', 'true');
          emailInput.classList.add('error');
        }
        hasErrors = true;
      } else if (emailInput && !emailInput.validity.valid && email.includes('@')) {
        if (errorEmail) {
          errorEmail.textContent = 'Email inválido';
          errorEmail.classList.add('show');
        }
        if (emailInput) {
          emailInput.setAttribute('aria-invalid', 'true');
          emailInput.classList.add('error');
        }
        hasErrors = true;
      }

      if (!password) {
        if (errorPassword) {
          errorPassword.textContent = 'Senha é obrigatória';
          errorPassword.classList.add('show');
        }
        if (passwordInput) {
          passwordInput.setAttribute('aria-invalid', 'true');
          passwordInput.classList.add('error');
        }
        hasErrors = true;
      }

      if (hasErrors) {
        return;
      }

      if (submitButton) {
        submitButton.disabled = true;
        submitButton.classList.add('loading');
        if (spinner) {
          spinner.classList.remove('hidden');
        }
      }

      login(email, password).then((result) => {
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.classList.remove('loading');
          if (spinner) {
            spinner.classList.add('hidden');
          }
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
            const errorMsg = result.message || 'Erro ao fazer login';
            errorGeneral.textContent = isCredentialError(errorMsg)
              ? 'Email/usuário ou senha incorretos'
              : errorMsg;
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
          submitButton.classList.remove('loading');
          if (spinner) {
            spinner.classList.add('hidden');
          }
        }
        if (errorGeneral) {
          const errorMsg = error.message || 'Erro ao fazer login';
          if (isCredentialError(errorMsg)) {
            errorGeneral.textContent = 'Email/usuário ou senha incorretos';
          } else if (isNetworkError(errorMsg)) {
            errorGeneral.textContent = 'Erro de conexão. Verifique sua internet';
          } else {
            errorGeneral.textContent = errorMsg;
          }
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

    function validateEmailInput(clearOnValid = true) {
      const value = emailInput.value.trim();

      if (value && value.includes('@') && emailInput.validity.valid === false) {
        emailInput.setAttribute('aria-invalid', 'true');
        emailInput.classList.add('error');
        if (errorEmail) {
          errorEmail.textContent = 'Email inválido';
          errorEmail.classList.add('show');
        }
      } else {
        emailInput.setAttribute('aria-invalid', 'false');
        emailInput.classList.remove('error');
        if (errorEmail && clearOnValid) {
          errorEmail.classList.remove('show');
          errorEmail.textContent = '';
        }
      }
    }

    let emailValidationTimeout = null;
    function debouncedEmailValidation(clearOnValid) {
      if (emailValidationTimeout) {
        clearTimeout(emailValidationTimeout);
      }
      emailValidationTimeout = setTimeout(() => {
        validateEmailInput(clearOnValid);
      }, 150);
    }

    if (emailInput) {
      emailInput.addEventListener('input', () => {
        debouncedEmailValidation(true);
      });

      emailInput.addEventListener('blur', () => {
        if (emailValidationTimeout) {
          clearTimeout(emailValidationTimeout);
        }
        validateEmailInput(false);
      });
    }

    if (passwordInput) {
      passwordInput.addEventListener('input', () => {
        passwordInput.setAttribute('aria-invalid', 'false');
        passwordInput.classList.remove('error');
        if (errorPassword) {
          errorPassword.classList.remove('show');
          errorPassword.textContent = '';
        }
      });
    }
  }

}

initAuth();
