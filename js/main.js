// Main Initialization and Event Listeners - VibeWeb OS

// Global lock and queue for header updates to prevent race conditions
let isUpdatingHeader = false;
let headerUpdateQueue = null;

function updateHeader(view) {
  if (isUpdatingHeader) {
    headerUpdateQueue = view;
    return;
  }
  isUpdatingHeader = true;

  try {
    if (view === "dashboard") {
      const metrics = AppState.getCachedMetrics(() =>
        calculateDashboardMetrics()
      );
      renderDashboardHeader(metrics);
      if (DOM.btnNewProject) DOM.btnNewProject.style.display = "none";
      if (DOM.searchContainer) DOM.searchContainer.style.display = "none";
    } else if (view === "financial") {
      const metrics = AppState.getCachedMetrics(() =>
        calculateDashboardMetrics()
      );
      renderFinancialHeader(metrics);
      if (DOM.btnNewProject) DOM.btnNewProject.style.display = "none";
      if (DOM.searchContainer) DOM.searchContainer.style.display = "flex";
    } else {
      renderProjectsHeader();
      if (DOM.btnNewProject) DOM.btnNewProject.style.display = "flex";
      if (DOM.searchContainer) DOM.searchContainer.style.display = "flex";
    }
  } finally {
    isUpdatingHeader = false;
    if (headerUpdateQueue) {
      const nextView = headerUpdateQueue;
      headerUpdateQueue = null;
      updateHeader(nextView);
    }
  }
}

function handleSearch() {
  if (AppState.searchTimeout) clearTimeout(AppState.searchTimeout);
  AppState.searchTimeout = setTimeout(() => {
    const view = NavigationManager.getViewFromUrl();
    if (view === "projects") renderBoard();
    else if (view === "financial") renderFinancial();
    if (typeof updateHeader === "function") updateHeader(view);
  }, 300);
}

function setupEventListeners() {
  // Navigation
  DOM.navButtons.forEach((btn, index) => {
    const views = ["projects", "dashboard", "financial"];
    btn.addEventListener("click", () =>
      NavigationManager.switchView(views[index])
    );
  });

  [
    DOM.bottomNavProjects,
    DOM.bottomNavDashboard,
    DOM.bottomNavFinancial,
  ].forEach((btn, idx) => {
    if (!btn) return;
    const views = ["projects", "dashboard", "financial"];
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      NavigationManager.switchView(views[idx]);
    });
  });

  if (DOM.bottomNavProfile) {
    DOM.bottomNavProfile.addEventListener("click", (e) => {
      e.preventDefault();
      openProfileModal();
    });
  }

  // Search Interaction
  if (DOM.searchBtn) {
    DOM.searchBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      DOM.searchContainer?.classList.toggle("expanded");
      if (DOM.searchContainer?.classList.contains("expanded")) {
        DOM.searchInput?.focus();
      }
    });
  }

  if (DOM.searchInput) {
    DOM.searchInput.addEventListener("input", handleSearch);
    DOM.searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        DOM.searchInput.value = "";
        handleSearch();
        DOM.searchContainer?.classList.remove("expanded");
      }
    });
  }

    // Modals & Actions
  if (DOM.btnNewProject) {
    DOM.btnNewProject.addEventListener("click", () => openModal());
  }

  if (DOM.btnCloseModal) {
    DOM.btnCloseModal.addEventListener("click", () => closeModal());
  }

  if (DOM.btnCancel) {
    DOM.btnCancel.addEventListener("click", () => closeModal());
  }

  if (DOM.modalOverlay) {
    DOM.modalOverlay.addEventListener("click", (e) => {
      if (e.target === DOM.modalOverlay) closeModal();
    });
  }

  if (DOM.exportBtn) {
    DOM.exportBtn.addEventListener("click", () => {
      const view = NavigationManager.getViewFromUrl();
      if (view === "dashboard") exportDashboardData();
      else if (view === "financial") exportFinancialData();
      else exportKanbanData();
    });
  }

  if (DOM.btnGeneratePDF) {
    DOM.btnGeneratePDF.addEventListener("click", async (e) => {
      e.preventDefault();
      const currentTaskId = AppState.currentTaskId;
      if (!currentTaskId) return;
      const tasks = AppState.getTasks();
      const task = tasks.find((t) => t.id === currentTaskId);
      if (task) {
        DOM.btnGeneratePDF.disabled = true;
        try {
          await generateInvoice(task);
          NotificationManager.success("PDF gerado com sucesso!");
        } catch (err) {
          NotificationManager.error("Erro ao gerar PDF");
        } finally {
          DOM.btnGeneratePDF.disabled = false;
        }
      }
    });
  }

  if (DOM.btnDelete) {
    DOM.btnDelete.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      deleteItem();
    });
  }

  if (DOM.btnSave) {
    DOM.btnSave.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      saveForm();
    });
  }

  // User Dropdown
  if (DOM.userAvatar) {
    DOM.userAvatar.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleUserDropdown();
    });
  }

  if (DOM.dropdownSettings) {
    DOM.dropdownSettings.addEventListener("click", () => {
      closeUserDropdown();
      SettingsManager.openSettingsModal();
    });
  }

  if (DOM.dropdownTheme) {
    DOM.dropdownTheme.addEventListener("click", () =>
      ThemeManager.toggleTheme()
    );
  }

  if (DOM.dropdownLogout) {
    DOM.dropdownLogout.addEventListener("click", () => logout());
  }

  // Charts
  const chartToggleHistory = document.getElementById("chartToggleHistory");
  const chartToggleProjection = document.getElementById(
    "chartToggleProjection"
  );

  if (chartToggleHistory) {
    chartToggleHistory.addEventListener("click", () => {
      const tasks = AppState.getTasks();
      renderRevenueChart(calculateMonthlyRevenue(tasks, 12), "history");
      chartToggleHistory.classList.add("active");
      chartToggleProjection?.classList.remove("active");
    });
  }
  if (chartToggleProjection) {
    chartToggleProjection.addEventListener("click", () => {
      const tasks = AppState.getTasks();
      renderRevenueChart(calculateProjectedRevenue(tasks, 12), "projection");
      chartToggleProjection.classList.add("active");
      chartToggleHistory?.classList.remove("active");
    });
  }

  // Global Shortcuts
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeModal();
      SettingsManager.closeSettingsModal();
      closeProfileModal();
      closeUserDropdown();
    }
    if (e.key === "n" && e.ctrlKey) {
      e.preventDefault();
      openModal();
    }
    if (e.key === "/" && document.activeElement.tagName !== "INPUT") {
      e.preventDefault();
      DOM.searchContainer?.classList.add("expanded");
      DOM.searchInput?.focus();
    }
  });

  window.addEventListener("popstate", (e) => {
    const view = e.state?.view || NavigationManager.getViewFromUrl();
    NavigationManager.switchView(view);
  });
}

let updateInterval = null;
function startUpdateInterval() {
  if (updateInterval) return;
  updateInterval = setInterval(() => {
    if (document.hidden) return;
    const view = NavigationManager.getViewFromUrl();
    if (view === "dashboard") renderDashboard();
    else if (view === "financial") renderFinancial();
    updateHeader(view);
  }, 60000);
}

async function renderUserAvatar(userParam = null) {
  const user = userParam || (await getCurrentUser());
  if (!user) return;

  const initials = getInitials(user.name);
  const elements = [
    DOM.userAvatar,
    DOM.dropdownAvatar,
    DOM.bottomNavAvatar,
    DOM.profileModalAvatar,
  ];

  elements.forEach((el) => {
    if (!el) return;
    if (user.avatar_url) {
      const fullUrl = user.avatar_url.startsWith("http")
        ? user.avatar_url
        : `${getApiBaseUrl()}${user.avatar_url}`;
      el.style.backgroundImage = `url(${fullUrl})`;
      el.style.backgroundSize = "cover";
      el.textContent = "";
    } else {
      el.style.backgroundImage = "";
      el.textContent = initials;
    }
  });

  if (DOM.dropdownName) DOM.dropdownName.textContent = user.name;
  if (DOM.profileModalName) DOM.profileModalName.textContent = user.name;
}

async function initApp() {
  DOM.init();
  try {
    const tasks = await api.getTasks();
    AppState.setTasks(normalizeTasksData(tasks));
  } catch (error) {
    console.error("[Init] Erro ao carregar dados:", error);
    if (error.message.includes("401")) return logout();
  }

  ThemeManager.initTheme();
  SettingsManager.init();
  await renderUserAvatar();
  setupEventListeners();
  startUpdateInterval();

  if (typeof window.setupPasteHandler === "function") {
    window.setupPasteHandler();
  }

  const view = NavigationManager.getViewFromUrl();
  NavigationManager.switchView(view);

  if (typeof connectWebSocket === "function") connectWebSocket();
}

function initAuth() {
  sanitizeUrl();
  if (isAuthenticated()) {
    const loginOverlay = document.getElementById("loginOverlay");
    const appContainer = document.getElementById("appContainer");

    if (loginOverlay) loginOverlay.classList.add("hidden");
    if (appContainer) {
      appContainer.classList.remove("hidden");
      // App container has opacity: 0 by default in CSS, needs fade-in
      requestAnimationFrame(() => {
        appContainer.classList.add("fade-in");
      });
    }

    initApp();
  } else {
    setupLoginForm();
  }
}

function setupLoginForm() {
  const loginForm = document.getElementById("loginForm");
  if (!loginForm) return;

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("loginEmail")?.value;
    const password = document.getElementById("loginPassword")?.value;
    const submitBtn = loginForm.querySelector('button[type="submit"]');

    if (submitBtn) submitBtn.disabled = true;
    try {
      const result = await login(email, password);
      if (result.success) window.location.reload();
      else throw new Error(result.message);
    } catch (err) {
      const errorEl = document.getElementById("errorLoginGeneral");
      if (errorEl) {
        errorEl.textContent = err.message || "Erro ao fazer login";
        errorEl.classList.add("show");
      }
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}

function openProfileModal() {
  DOM.profileModalOverlay?.classList.remove("hidden");
  DOM.profileModalOverlay?.classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeProfileModal() {
  DOM.profileModalOverlay?.classList.add("hidden");
  DOM.profileModalOverlay?.classList.remove("open");
  document.body.style.overflow = "";
}

function toggleUserDropdown() {
  DOM.userDropdown?.classList.toggle("hidden");
}

function closeUserDropdown() {
  DOM.userDropdown?.classList.add("hidden");
}

window.logout = logout;
window.openModal = openModal;
window.closeModal = closeModal;

initAuth();
