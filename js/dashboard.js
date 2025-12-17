// Dashboard Logic

let currentChartView = 'history';

function renderDashboardHeader(metrics) {
  if (!DOM.headerInfo || !metrics) return;

  const gap = Math.max(0, TARGET_MRR_10K - (metrics.mrr || 0));
  const settings = getSettings();
  const upsellsNeeded = Math.ceil(gap / settings.hostingPrice);

  DOM.headerInfo.innerHTML = `
    <div class="header-stat">
      <span class="header-stat-label">MRR</span>
      <span class="header-stat-value" style="color: var(--success);">${formatCurrency(metrics.mrr)}</span>
    </div>
    <div class="header-stat" id="mrrProjection" title="Precisa de ${upsellsNeeded} upsells para atingir €10k">
      <span class="header-stat-label">Meta €10k</span>
      <span class="header-stat-value" id="gapValue" style="color: ${gap > 0 ? 'var(--danger)' : 'var(--success)'};">€${gap.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
    </div>
    ${metrics.urgentCount > 0 ? `
      <div class="header-stat">
        <span class="header-stat-label">Urgentes</span>
        <span class="header-stat-value" style="color: var(--danger);">${metrics.urgentCount}</span>
      </div>
    ` : ''}
  `;
}

let renderDashboardInProgress = false;
let renderDashboardPending = false;

async function renderDashboard() {
  if (renderDashboardInProgress) {
    renderDashboardPending = true;
    return;
  }

  renderDashboardInProgress = true;
  renderDashboardPending = false;

  try {
    const metrics = AppState.getCachedMetrics(() => calculateDashboardMetrics());
    const tasks = AppState.getTasks();

    renderMRRCard(metrics);
    renderStatsCards(metrics);

    if (currentChartView === 'history') {
      const historicalData = calculateMonthlyRevenue(tasks, 12);
      renderRevenueChart(historicalData, 'history');
    } else {
      const projectionData = calculateProjectedRevenue(tasks, 12);
      renderRevenueChart(projectionData, 'projection');
    }

    renderPieChart(metrics.statusDistribution);
    renderUrgentProjects(metrics.urgentProjects || []);

    try {
      const activities = await generateRecentActivities(tasks, true);
      renderRecentActivities(activities || []);
    } catch (error) {
      console.error('[Dashboard] Error loading activities:', error);
      renderRecentActivities([]);
    }

    setupExpandButtons();
  } finally {
    renderDashboardInProgress = false;

    if (renderDashboardPending) {
      renderDashboardPending = false;
      setTimeout(() => renderDashboard(), 0);
    }
  }
}


function renderMRRCard(metrics) {
  if (!metrics || !DOM.statsGrid) return;

  const mrrPercent10k = Math.min(100, ((metrics.mrr || 0) / TARGET_MRR_10K) * 100);

  const mrrCard = document.getElementById('mrrCard');
  if (!mrrCard) {
    const card = document.createElement('div');
    card.className = 'stat-card';
    card.id = 'mrrCard';
    card.style.gridColumn = 'span 2';
    DOM.statsGrid.insertBefore(card, DOM.statsGrid.firstChild);
  }

  const card = document.getElementById('mrrCard');
  card.innerHTML = `
    <div class="stat-card-header">
      <span class="stat-card-label">MRR</span>
      <div class="stat-card-icon success">
        <i class="fa-solid fa-chart-line"></i>
      </div>
    </div>
    <div class="stat-card-value" style="color: var(--success); font-size: 2rem;">${formatCurrency(metrics.mrr)}</div>
    <div class="mrr-projection" style="margin-top: 1rem;">
      <div class="mrr-projection-header">
        <div class="mrr-projection-label">Meta €10k</div>
        <div class="mrr-projection-gap">${formatCurrency(metrics.gap10k)}</div>
      </div>
      <div class="mrr-projection-bar">
        <div class="mrr-projection-fill ${mrrPercent10k >= 100 ? 'green' : 'orange'}"
             style="width: ${mrrPercent10k}%">
        </div>
      </div>
    </div>
  `;
}

function renderStatsCards(metrics) {
  if (!metrics || !DOM.statsGrid) return;

  const stats = [
    {
      id: 'stat-faturado',
      label: 'Faturado',
      value: formatCurrency(metrics.monthlyRevenue),
      icon: 'fa-euro-sign',
      iconClass: 'primary',
      clickable: false
    },
    {
      id: 'stat-active-jobs',
      label: 'Jobs Ativos',
      value: metrics.activeProjects,
      icon: 'fa-layer-group',
      iconClass: 'success',
      clickable: true
    },
    {
      id: 'stat-pending-payments',
      label: 'Pagamentos Pendentes',
      value: metrics.pendingPayments,
      icon: 'fa-clock',
      iconClass: 'warning',
      clickable: true
    }
  ];

  DOM.statsGrid.innerHTML = stats.map(stat => `
    <div class="stat-card" id="${stat.id}" ${stat.clickable ? 'role="button" tabindex="0" aria-label="${stat.label}: ${stat.value}. Clique para filtrar." style="cursor: pointer;"' : 'role="region" aria-label="${stat.label}: ${stat.value}"'}>
      <div class="stat-card-header">
        <span class="stat-card-label">${stat.label}</span>
        <div class="stat-card-icon ${stat.iconClass}" aria-hidden="true">
          <i class="fa-solid ${stat.icon}"></i>
        </div>
      </div>
      <div class="stat-card-value">${stat.value}</div>
    </div>
  `).join('');

  const activeJobsCard = document.getElementById('stat-active-jobs');
  if (activeJobsCard) {
    activeJobsCard.addEventListener('click', filterKanbanByActiveJobs);
    activeJobsCard.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        filterKanbanByActiveJobs();
      }
    });
  }

  const pendingPaymentsCard = document.getElementById('stat-pending-payments');
  if (pendingPaymentsCard) {
    pendingPaymentsCard.addEventListener('click', filterKanbanByPendingPayments);
    pendingPaymentsCard.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        filterKanbanByPendingPayments();
      }
    });
  }
}

function renderRevenueChart(monthlyRevenueData, view = 'history') {
  if (!DOM.revenueChart) return;

  const hasNoData = !monthlyRevenueData || monthlyRevenueData.length === 0;
  if (hasNoData) {
    DOM.revenueChart.innerHTML = '<div class="empty-state"><div class="empty-state-text">Sem dados</div></div>';
    return;
  }

  currentChartView = view;
  const revenueValues = monthlyRevenueData.map(month => month.value);
  const highestRevenueValue = Math.max(...revenueValues, 1);

  const chartBarAreaHeight = CHART_TOTAL_HEIGHT - CHART_SPACE_FOR_LABELS;
  const minimumBarHeight = CHART_MINIMUM_BAR_HEIGHT;

  const highestRevenueFormatted = formatCurrency(highestRevenueValue);

  const maxValueLine = `
    <div class="chart-max-line" style="top: 0.5rem; left: 0; right: 0; position: absolute; border-top: 1px dashed var(--border-subtle); pointer-events: none;">
      <span style="position: absolute; right: 0; top: -0.5rem; font-size: 0.65rem; color: var(--text-muted); font-family: 'JetBrains Mono', monospace;">${highestRevenueFormatted}</span>
    </div>
  `;

  const chartBars = monthlyRevenueData.map(month => {
    const revenuePercentage = highestRevenueValue > 0 ? (month.value / highestRevenueValue) : 0;
    const barHeight = Math.max(minimumBarHeight, revenuePercentage * chartBarAreaHeight);
    const monthRevenueFormatted = formatCurrency(month.value);

    return `
      <div class="chart-bar" style="height: ${barHeight}px;" title="${monthRevenueFormatted}">
        <span class="chart-bar-value">${monthRevenueFormatted}</span>
        <span class="chart-bar-label">${month.name}</span>
      </div>
    `;
  }).join('');

  DOM.revenueChart.innerHTML = maxValueLine + chartBars;

  // Update accessible description for screen readers
  const descriptionEl = document.getElementById('revenueChartDescription');
  if (descriptionEl) {
    const chartData = monthlyRevenueData.map(month => {
      return `${month.label}: ${formatCurrency(month.value)}`;
    }).join(', ');
    const viewType = view === 'history' ? 'histórica' : 'projetada';
    descriptionEl.textContent = `Gráfico de barras de receita mensal ${viewType}. ${chartData}`;
  }

  const legendElement = document.getElementById('chartLegendText');
  if (legendElement) {
    const isHistoryView = view === 'history';
    legendElement.textContent = isHistoryView ? 'Receita Mensal' : 'Projeção Mensal';
  }

  const historyButton = document.getElementById('chartToggleHistory');
  const projectionButton = document.getElementById('chartToggleProjection');

  if (historyButton && projectionButton) {
    const isHistoryView = view === 'history';
    if (isHistoryView) {
      historyButton.classList.add('active');
      projectionButton.classList.remove('active');
    } else {
      projectionButton.classList.add('active');
      historyButton.classList.remove('active');
    }
  }
}

function renderPieChart(distribution) {
  const canvas = document.getElementById('pieChart');
  if (!canvas) return;

  const total = distribution.reduce((sum, d) => sum + d.value, 0);
  if (total > 0) {
    const distributionText = distribution.map((item, index) => {
      const percentage = ((item.value / total) * 100).toFixed(1);
      return `${item.name}: ${formatCurrency(item.value)} (${percentage}%)`;
    }).join(', ');
    canvas.setAttribute('aria-label', `Gráfico de pizza mostrando distribuição de projetos: ${distributionText}`);
  } else {
    canvas.setAttribute('aria-label', 'Gráfico de pizza: Sem dados disponíveis');
  }

  const ctx = canvas.getContext('2d');
  const centerX = PIE_CHART_SIZE / 2;
  const centerY = PIE_CHART_SIZE / 2;
  const radius = PIE_CHART_RADIUS;

  canvas.width = PIE_CHART_SIZE;
  canvas.height = PIE_CHART_SIZE;

  const colors = [
    'rgba(37, 99, 235, 0.8)',   // Primary - Discovery
    'rgba(52, 211, 153, 0.8)',  // Success - Acordo
    'rgba(251, 191, 36, 0.8)',  // Warning - Build
    'rgba(168, 85, 247, 0.8)'   // Purple - Live
  ];

  if (total === 0) {
    // Use white color for placeholder text (as requested)
    ctx.fillStyle = '#ffffff';
    ctx.font = '12px Inter';
    ctx.textAlign = 'center';
    ctx.fillText('Sem dados', centerX, centerY);
    return;
  }

  let currentAngle = -Math.PI / 2;

  distribution.forEach((item, index) => {
    const sliceAngle = (item.value / total) * 2 * Math.PI;

    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + sliceAngle);
    ctx.closePath();
    ctx.fillStyle = colors[index] || colors[0];
    ctx.fill();

    currentAngle += sliceAngle;
  });

  if (DOM.pieChartLegend) {
    DOM.pieChartLegend.innerHTML = distribution.map((item, index) => {
      const percentage = total > 0 ? ((item.value / total) * 100).toFixed(1) : 0;
      const columnId = COLUMNS.find(col => col.name === item.name)?.id;
      const isClickable = columnId !== undefined;

      return `
        <div class="pie-legend-item ${isClickable ? 'pie-legend-clickable' : ''}"
             ${isClickable ? `onclick="filterKanbanByStatus(${columnId})"` : ''}
             style="cursor: ${isClickable ? 'pointer' : 'default'};">
          <div class="pie-legend-color" style="background: ${colors[index] || colors[0]};"></div>
          <div class="pie-legend-info">
            <span class="pie-legend-name">${item.name}</span>
            <span class="pie-legend-value">${formatCurrency(item.value)} (${percentage}%)</span>
          </div>
        </div>
      `;
    }).join('');
  }
}

function calculateUrgentProjectTimeDisplay(project, currentTimestamp) {
  const hasDeadlineTimestamp = project.deadline_timestamp !== null && project.deadline_timestamp !== undefined;
  const deadlineHours = parseDeadlineHours(project.deadline);
  const isInBuildWithoutDeadline = project.col_id === 2 && (!project.deadline || project.deadline === DEADLINE_UNDEFINED);
  const isUrgentKeyword = URGENT_DEADLINES.includes(project.deadline);

  if (isInBuildWithoutDeadline) {
    return { display: 'Em desenvolvimento', isOverdue: false };
  }

  if (isUrgentKeyword && !hasDeadlineTimestamp) {
    return { display: project.deadline, isOverdue: false };
  }

  if (!hasDeadlineTimestamp || !deadlineHours) {
    return { display: project.deadline || 'Sem prazo', isOverdue: false };
  }

  const deadlineTimestamp = project.deadline_timestamp + (deadlineHours * MS_PER_HOUR);
  const timeRemaining = deadlineTimestamp - currentTimestamp;

  if (timeRemaining <= 0) {
    const hoursOverdue = Math.abs(Math.floor(timeRemaining / MS_PER_HOUR));
    const minutesOverdue = Math.abs(Math.floor((timeRemaining % MS_PER_HOUR) / MS_PER_MINUTE));
    const display = hoursOverdue > 0 ? `Vencido há ${hoursOverdue}h` : `Vencido há ${minutesOverdue}m`;
    return { display, isOverdue: true };
  }

  const remainingHours = Math.floor(timeRemaining / MS_PER_HOUR);
  const remainingMinutes = Math.floor((timeRemaining % MS_PER_HOUR) / MS_PER_MINUTE);
  const display = remainingHours > 0 ? `${remainingHours}h` : `${remainingMinutes}m`;
  return { display, isOverdue: false };
}

function buildWhatsAppUrl(contact) {
  if (!contact) return null;
  const whatsappNumber = contact.replace(/[@\s]/g, '').replace(/[^\d]/g, '');
  if (!whatsappNumber) return null;
  const settings = getSettings();
  const message = encodeURIComponent(`Ei, site pronto? Ativa hosting €${settings.hostingPrice}/mês?`);
  return `https://wa.me/${whatsappNumber}?text=${message}`;
}

function renderUrgentProjects(urgentProjects) {
  if (!DOM.urgentList) return;

  const urgentProjectsList = urgentProjects || [];
  const cards = getCachedCardElements();
  const isExpanded = cards.urgentCard && cards.urgentCard.classList.contains('expanded');

  if (urgentProjectsList.length === 0) {
    DOM.urgentList.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon"><i class="fa-solid fa-check-circle"></i></div>
        <div class="empty-state-text">Nenhum projeto urgente</div>
      </div>
    `;
    return;
  }

  const currentTimestamp = Date.now();
  const projectsToShow = isExpanded ? urgentProjectsList : urgentProjectsList.slice(0, 5);
  const fragment = document.createDocumentFragment();

  projectsToShow.forEach(project => {
    const { display: timeDisplay, isOverdue } = calculateUrgentProjectTimeDisplay(project, currentTimestamp);
    const whatsappUrl = buildWhatsAppUrl(project.contact);
    const escapedClient = escapeHtml(project.client);
    const escapedTime = escapeHtml(timeDisplay);
    const colorStyle = isOverdue ? 'var(--danger)' : 'var(--text-muted)';
    const ariaLabel = isOverdue
      ? `Projeto urgente: ${escapedClient}, ${escapedTime}, vencido`
      : `Projeto urgente: ${escapedClient}, ${escapedTime}`;

    const item = document.createElement('div');
    item.className = 'urgent-item';
    item.setAttribute('role', 'button');
    item.setAttribute('tabindex', '0');
    item.setAttribute('aria-label', ariaLabel);

    if (isOverdue) {
      item.style.borderLeft = '3px solid var(--danger)';
    }

    item.innerHTML = `
      <div class="urgent-item-content">
        <div class="urgent-item-title">${escapedClient}</div>
        <div class="urgent-item-time" style="color: ${colorStyle};">
          ${escapedTime}
        </div>
      </div>
      ${whatsappUrl ? `
        <a href="${escapeHtml(whatsappUrl)}" target="_blank" class="wa-button" onclick="event.stopPropagation();">
          <i class="fa-brands fa-whatsapp"></i>
        </a>
      ` : ''}
    `;

    item.addEventListener('click', () => openModal(project));
    item.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openModal(project);
      }
    });

    fragment.appendChild(item);
  });

  DOM.urgentList.innerHTML = '';
  DOM.urgentList.appendChild(fragment);
}

function renderRecentActivities(activities) {
  if (!DOM.activityList) {
    return;
  }

  const activitiesList = activities || [];

  if (activitiesList.length === 0) {
    DOM.activityList.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon"><i class="fa-solid fa-inbox"></i></div>
        <div class="empty-state-text">Nenhuma atividade recente</div>
      </div>
    `;
    return;
  }

  const currentTime = Date.now();
  const tasks = AppState.getTasks();
  const fragment = document.createDocumentFragment();

  activitiesList.forEach(activity => {
    const activityDate = activity.createdAt;
    const timeDisplay = activityDate ? getTimeAgo(activityDate, currentTime) : (activity.time || 'Agora');
    const userInfo = activity.userName ? ` por ${activity.userName}` : '';
    const escapedUserName = activity.userName ? escapeHtml(activity.userName) : '';
    const escapedText = escapeHtml(activity.text);
    const escapedInitials = activity.userInitials ? escapeHtml(activity.userInitials) : '';
    const escapedAvatarUrl = activity.userAvatarUrl ? escapeHtml(activity.userAvatarUrl) : '';

    const item = document.createElement('div');
    item.className = 'activity-item';
    item.style.cursor = 'pointer';
    item.setAttribute('role', 'button');
    item.setAttribute('tabindex', '0');
    item.setAttribute('aria-label', `Atividade: ${escapedText}${userInfo}, ${timeDisplay}`);

    const userBadgeHtml = activity.userName && activity.userInitials
      ? activity.userAvatarUrl
        ? `<div class="activity-user-badge" title="${escapedUserName}" style="background-image: url('${escapedAvatarUrl}'); background-size: cover; background-position: center; background-color: transparent; color: transparent;">${escapedInitials}</div>`
        : `<div class="activity-user-badge" title="${escapedUserName}">${escapedInitials}</div>`
      : '';

    const userInfoHtml = activity.userName
      ? `<span class="activity-user-info"> por ${escapedUserName}</span>`
      : '';

    item.innerHTML = `
      <div class="activity-item-icon">
        <i class="fa-solid ${activity.icon}"></i>
      </div>
      <div class="activity-item-content">
        <div class="activity-item-text">${escapedText}${userInfoHtml}</div>
        <div class="activity-item-time">${timeDisplay}</div>
      </div>
      ${userBadgeHtml}
    `;

    const taskId = activity.taskId;
    const task = tasks.find(t => t.id === taskId);

    if (task) {
      item.addEventListener('click', () => openModal(task));
      item.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openModal(task);
        }
      });
    }

    fragment.appendChild(item);
  });

  DOM.activityList.innerHTML = '';
  DOM.activityList.appendChild(fragment);
}

function exportDashboardData() {
  const metrics = calculateDashboardMetrics();
  const tasks = AppState.getTasks();
  const now = Date.now();
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();

  const liveTasks = tasks.filter(t => t.col_id === 3 && t.hosting === HOSTING_YES);
  const discoveryCount = tasks.filter(t => t.col_id === 0).length;
  const agreementCount = tasks.filter(t => t.col_id === 1).length;
  const buildCount = tasks.filter(t => t.col_id === 2).length;
  const liveCount = tasks.filter(t => t.col_id === 3).length;

  const currentMonthTasks = tasks.filter(t => {
    const taskDate = parseTaskDate(t.created_at);
    if (!taskDate) return false;
    return taskDate.getMonth() === currentMonth &&
      taskDate.getFullYear() === currentYear &&
      (t.payment_status === PAYMENT_STATUS_PAID || t.payment_status === PAYMENT_STATUS_PARTIAL);
  });
  const monthlyRevenue = currentMonthTasks.reduce((sum, t) => sum + (parseFloat(t.price) || 0), 0);

  const paidTasks = tasks.filter(t =>
    t.payment_status === PAYMENT_STATUS_PAID || t.payment_status === PAYMENT_STATUS_PARTIAL
  );
  const totalRevenue = paidTasks.reduce((sum, t) => sum + (parseFloat(t.price) || 0), 0);
  const averageTicket = paidTasks.length > 0 ? totalRevenue / paidTasks.length : 0;

  const csv = [
    'Métrica,Valor',
    `MRR,€${metrics.mrr.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    `Meta €10k (Gap),€${Math.max(0, TARGET_MRR_10K - metrics.mrr).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    `Upsells Necessários,${Math.ceil(Math.max(0, TARGET_MRR_10K - metrics.mrr) / getSettings().hostingPrice)}`,
    `Receita do Mês,€${monthlyRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    `Ticket Médio,€${averageTicket.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    `Total Faturado,€${totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    `Projetos Urgentes,${metrics.urgentCount}`,
    `Descoberta,${discoveryCount}`,
    `Acordo,${agreementCount}`,
    `Build,${buildCount}`,
    `Live,${liveCount}`,
    `Total de Projetos,${tasks.length}`
  ].join('\n');

  downloadCSV(csv, `vibeos-dashboard-${new Date().toISOString().split('T')[0]}.csv`);
}

let _expandedActivitiesCache = null;
let _expandedActivitiesCacheTime = null;
const EXPANDED_ACTIVITIES_CACHE_MS = 60000;

let _cachedCardElements = {
  urgentCard: null,
  activityCard: null,
  expandUrgentBtn: null,
  expandActivityBtn: null
};

let _cachedApiBaseUrl = null;

function getCachedCardElements() {
  if (!_cachedCardElements.urgentCard) {
    _cachedCardElements.urgentCard = document.getElementById('urgentCard');
    _cachedCardElements.activityCard = document.getElementById('activityCard');
    _cachedCardElements.expandUrgentBtn = document.getElementById('expandUrgentBtn');
    _cachedCardElements.expandActivityBtn = document.getElementById('expandActivityBtn');
  }
  return _cachedCardElements;
}

function clearCardElementsCache() {
  _cachedCardElements = {
    urgentCard: null,
    activityCard: null,
    expandUrgentBtn: null,
    expandActivityBtn: null
  };
}

function isAnyCardExpanded() {
  const cards = getCachedCardElements();
  const urgentExpanded = cards.urgentCard && cards.urgentCard.classList.contains('expanded');
  const activityExpanded = cards.activityCard && cards.activityCard.classList.contains('expanded');
  return urgentExpanded || activityExpanded;
}

function updateBodyOverflow() {
  if (isAnyCardExpanded()) {
    document.body.style.overflow = 'hidden';
  } else {
    document.body.style.overflow = '';
  }
}

function getCachedApiBaseUrl() {
  if (!_cachedApiBaseUrl) {
    _cachedApiBaseUrl = getApiBaseUrl();
  }
  return _cachedApiBaseUrl;
}

const ACTION_TYPE_ICONS = {
  'create': 'fa-plus-circle',
  'move': 'fa-arrows-left-right',
  'update': 'fa-edit',
  'delete': 'fa-trash'
};

function transformActivityFromApi(activity) {
  const activityDate = parseTaskDate(activity.created_at);
  if (!activityDate) return null;

  const icon = ACTION_TYPE_ICONS[activity.action_type] || 'fa-file-invoice';
  const userName = activity.user_name || 'Usuário';
  const userInitials = getInitials(userName);
  const escapedDescription = escapeHtml(activity.action_description || '');
  const apiBaseUrl = getCachedApiBaseUrl();
  const userAvatarUrl = activity.user_avatar_url
    ? (activity.user_avatar_url.startsWith('http') ? activity.user_avatar_url : `${apiBaseUrl}${activity.user_avatar_url}`)
    : null;

  return {
    text: escapedDescription,
    createdAt: activityDate,
    icon: icon,
    taskId: activity.task_id,
    userName: userName,
    userInitials: userInitials,
    userAvatarUrl: userAvatarUrl
  };
}

async function loadAllActivities(useCache = true) {
  if (useCache && _expandedActivitiesCache && _expandedActivitiesCacheTime) {
    const age = Date.now() - _expandedActivitiesCacheTime;
    if (age < EXPANDED_ACTIVITIES_CACHE_MS) {
      return _expandedActivitiesCache;
    }
  }

  const allActivities = await api.getActivities(100);
  if (allActivities && Array.isArray(allActivities) && allActivities.length > 0) {
    const activities = allActivities
      .map(transformActivityFromApi)
      .filter(activity => activity !== null);

    if (activities.length > 0) {
      _expandedActivitiesCache = activities;
      _expandedActivitiesCacheTime = Date.now();
      return activities;
    }
  }

  return null;
}

function setupExpandButtons() {
  const cards = getCachedCardElements();

  if (cards.expandUrgentBtn && cards.urgentCard) {
    cards.expandUrgentBtn.removeEventListener('click', toggleUrgentExpand);
    cards.expandUrgentBtn.addEventListener('click', toggleUrgentExpand);
  }

  if (cards.expandActivityBtn && cards.activityCard) {
    cards.expandActivityBtn.removeEventListener('click', toggleActivityExpand);
    cards.expandActivityBtn.addEventListener('click', toggleActivityExpand);
  }
}

function toggleCardExpand(cardId, btnId, sectionName, onExpand, onCollapse) {
  const cards = getCachedCardElements();
  const card = cardId === 'urgentCard' ? cards.urgentCard : cards.activityCard;
  const btn = btnId === 'expandUrgentBtn' ? cards.expandUrgentBtn : cards.expandActivityBtn;
  const icon = btn.querySelector('i');

  if (!card || !btn) return;

  const isExpanded = card.classList.contains('expanded');

  if (isExpanded) {
    card.classList.remove('expanded');
    updateBodyOverflow();
    icon.className = 'fa-solid fa-expand';
    btn.setAttribute('aria-label', `Expandir lista de ${sectionName}`);
    btn.setAttribute('title', 'Expandir');
    onCollapse();
  } else {
    card.classList.add('expanded');
    updateBodyOverflow();
    icon.className = 'fa-solid fa-compress';
    btn.setAttribute('aria-label', `Recolher lista de ${sectionName}`);
    btn.setAttribute('title', 'Recolher');
    onExpand();
  }
}

function toggleUrgentExpand() {
  const metrics = AppState.getCachedMetrics(() => calculateDashboardMetrics());
  const urgentProjects = metrics.urgentProjects || [];

  toggleCardExpand(
    'urgentCard',
    'expandUrgentBtn',
    'urgentes',
    () => renderUrgentProjects(urgentProjects),
    () => renderUrgentProjects(urgentProjects)
  );
}

async function toggleActivityExpand() {
  toggleCardExpand(
    'activityCard',
    'expandActivityBtn',
    'atividades',
    async () => {
      try {
        const activities = await loadAllActivities(true);
        if (activities && activities.length > 0) {
          renderRecentActivities(activities);
        } else {
          const tasks = AppState.getTasks();
          const fallbackActivities = await generateRecentActivities(tasks, true);
          renderRecentActivities(fallbackActivities || []);
        }
      } catch (error) {
        console.error('[Dashboard] Error loading expanded activities:', error);
        const tasks = AppState.getTasks();
        const fallbackActivities = await generateRecentActivities(tasks, true);
        renderRecentActivities(fallbackActivities || []);
      }
    },
    async () => {
      const tasks = AppState.getTasks();
      const activities = await generateRecentActivities(tasks, true);
      renderRecentActivities(activities || []);
    }
  );
}
