// Navigation and View Switching Module

function getViewFromUrl(path = window.location.pathname) {
  if (path.endsWith('/login')) return 'login';
  if (path.endsWith('/dashboard')) return 'dashboard';
  if (path.endsWith('/financeiro')) return 'financial';
  if (path.endsWith('/atividades')) return 'activities';
  if (path.match(/\/projetos\/(\d+|novo)$/)) return 'projects';
  return 'projects';
}

function updateUrl(view, path = window.location.pathname) {
  let newPath = '/';
  if (view === 'login') newPath = '/login';
  else if (view === 'dashboard') newPath = '/dashboard';
  else if (view === 'financial') newPath = '/financeiro';
  else if (view === 'activities') newPath = '/atividades';
  else if (view === 'projects') newPath = '/projetos';

  if (path !== newPath) window.history.pushState({ view }, '', newPath);
}

function fadeContainer(container, isFadeIn) {
  if (!container) return;
  container.style.transition = 'opacity 0.15s ease';
  requestAnimationFrame(() => {
    container.style.opacity = isFadeIn ? '1' : '0';
  });
}

function switchView(view) {
  if (!DOM.boardContainer || !DOM.dashboardContainer || !DOM.financialContainer || !DOM.activitiesContainer) return;
  
  const containers = [DOM.boardContainer, DOM.dashboardContainer, DOM.financialContainer, DOM.activitiesContainer];
  const activeContainer = view === 'dashboard' ? DOM.dashboardContainer : 
                          view === 'financial' ? DOM.financialContainer : 
                          view === 'activities' ? DOM.activitiesContainer :
                          DOM.boardContainer;

  // Visual feedback for transition
  if (DOM.sidebar) DOM.sidebar.classList.add('nav-transitioning');

  containers.forEach(c => {
    if (c !== activeContainer) fadeContainer(c, false);
  });

  setTimeout(() => {
    containers.forEach(c => {
      c.classList.add('hidden');
      c.classList.remove('active');
      c.setAttribute('aria-hidden', 'true');
    });

    activeContainer.classList.remove('hidden');
    activeContainer.classList.add('active');
    activeContainer.setAttribute('aria-hidden', 'false');
    fadeContainer(activeContainer, true);

    updateViewContent(view);
    updateUrl(view);
    updateNavButtons(view);
    updateBottomNavCentralButton(view);

    if (DOM.sidebar) {
      setTimeout(() => DOM.sidebar.classList.remove('nav-transitioning'), 150);
    }
  }, 150);
}

function updateViewContent(view) {
  if (view === 'dashboard') renderDashboard();
  else if (view === 'financial') renderFinancial();
  else if (view === 'activities') renderActivities();
  else renderBoard();
  
  if (typeof updateHeader === 'function') updateHeader(view);
}

function updateNavButtons(view) {
  const views = ['projects', 'dashboard', 'financial', 'activities'];
  
  // Desktop Nav
  DOM.navButtons.forEach((btn, idx) => {
    const isActive = views[idx] === view;
    btn.classList.toggle('active', isActive);
    if (isActive) btn.setAttribute('aria-current', 'page');
    else btn.removeAttribute('aria-current');
  });

  // Mobile Nav
  const mobileButtons = [DOM.bottomNavProjects, DOM.bottomNavDashboard, DOM.bottomNavFinancial, DOM.bottomNavActivities];
  mobileButtons.forEach((btn, idx) => {
    if (!btn) return;
    const isActive = views[idx] === view;
    btn.classList.toggle('active', isActive);
    if (isActive) btn.setAttribute('aria-current', 'page');
    else btn.removeAttribute('aria-current');
  });
}

function updateBottomNavCentralButton(view) {
  const centralBtn = DOM.bottomNavCentral;
  if (!centralBtn) return;

  if (view === 'projects') {
    centralBtn.style.display = 'flex';
    if (!centralBtn.innerHTML) {
      centralBtn.innerHTML = '<i class="fa-solid fa-plus" aria-hidden="true"></i>';
      centralBtn.onclick = () => openModal();
    }
  } else {
    centralBtn.style.display = 'none';
  }
}

window.NavigationManager = {
  getViewFromUrl,
  updateUrl,
  switchView,
  updateNavButtons
};
