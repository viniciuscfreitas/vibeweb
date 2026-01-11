// Dashboard Logic

let currentChartView = 'history';

const statCardClickHandler = (e) => {
  const card = e.target.closest('.stat-card-clickable');
  if (!card) return;

  if (card.id === 'stat-active-jobs') {
    filterKanbanByActiveJobs();
  } else if (card.id === 'stat-pending-payments') {
    filterKanbanByPendingPayments();
  }
};

const statCardKeydownHandler = (e) => {
  const card = e.target.closest('.stat-card-clickable');
  if (!card) return;

  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    if (card.id === 'stat-active-jobs') {
      filterKanbanByActiveJobs();
    } else if (card.id === 'stat-pending-payments') {
      filterKanbanByPendingPayments();
    }
  }
};

let lastRenderedStats = null;

function renderDashboardHeader(metrics) {
  // Add null check with warning
  if (!DOM.headerInfo) {
    console.warn('[Header] headerInfo not initialized');
    return;
  }
  if (!metrics) {
    console.warn('[Header] Metrics not available');
    return;
  }

  const gap = Math.max(0, TARGET_MRR_10K - (metrics.mrr || 0));
  const settings = getSettings();
  const hostingPrice = settings.hostingPrice || 0;
  const upsellsNeeded = (hostingPrice > 0 && isFinite(hostingPrice)) 
    ? Math.ceil(gap / hostingPrice) 
    : null;
  const upsellsText = upsellsNeeded !== null ? `${upsellsNeeded} upsells` : 'configurar preço de hospedagem';
  const titleText = upsellsNeeded !== null 
    ? `Precisa de ${upsellsNeeded} upsells para atingir €10k`
    : 'Configure o preço de hospedagem nas configurações para calcular upsells necessários';

  // Use DOM manipulation instead of innerHTML to prevent XSS
  DOM.headerInfo.innerHTML = '';
  
  // MRR stat
  const mrrStat = document.createElement('div');
  mrrStat.className = 'header-stat';
  const mrrLabel = document.createElement('span');
  mrrLabel.className = 'header-stat-label';
  mrrLabel.textContent = 'MRR';
  const mrrValue = document.createElement('span');
  mrrValue.className = 'header-stat-value';
  mrrValue.style.color = 'var(--success)';
  mrrValue.textContent = formatCurrency(metrics.mrr || 0);
  mrrStat.appendChild(mrrLabel);
  mrrStat.appendChild(mrrValue);
  DOM.headerInfo.appendChild(mrrStat);
  
  // Gap stat
  const gapStat = document.createElement('div');
  gapStat.className = 'header-stat';
  gapStat.id = 'mrrProjection';
  gapStat.title = titleText;
  const gapLabel = document.createElement('span');
  gapLabel.className = 'header-stat-label';
  gapLabel.textContent = 'Meta €10k';
  const gapValue = document.createElement('span');
  gapValue.id = 'gapValue';
  gapValue.className = 'header-stat-value';
  gapValue.style.color = gap > 0 ? 'var(--danger)' : 'var(--success)';
  gapValue.textContent = `€${(gap || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  gapStat.appendChild(gapLabel);
  gapStat.appendChild(gapValue);
  DOM.headerInfo.appendChild(gapStat);
  
  // Urgent count stat (only if > 0)
  if ((metrics.urgentCount || 0) > 0) {
    const urgentStat = document.createElement('div');
    urgentStat.className = 'header-stat';
    const urgentLabel = document.createElement('span');
    urgentLabel.className = 'header-stat-label';
    urgentLabel.textContent = 'Urgentes';
    const urgentValue = document.createElement('span');
    urgentValue.className = 'header-stat-value';
    urgentValue.style.color = 'var(--danger)';
    urgentValue.textContent = String(metrics.urgentCount || 0);
    urgentStat.appendChild(urgentLabel);
    urgentStat.appendChild(urgentValue);
    DOM.headerInfo.appendChild(urgentStat);
  }
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

    renderStatsCards(metrics);
    renderMRRCard(metrics);

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

let lastMRRValues = null;

function renderMRRCard(metrics) {
  if (!metrics || !DOM.statsGrid) return;

  const currentMRR = metrics.mrr || 0;
  const currentGap = metrics.gap10k || 0;
  const mrrPercent10k = Math.min(100, (currentMRR / TARGET_MRR_10K) * 100);

  const valuesChanged = !lastMRRValues ||
    lastMRRValues.mrr !== currentMRR ||
    lastMRRValues.gap !== currentGap;

  let mrrCard = document.getElementById('mrrCard');
  if (!mrrCard) {
    const card = document.createElement('div');
    card.className = 'stat-card';
    card.id = 'mrrCard';
    card.style.gridColumn = 'span 2';
    DOM.statsGrid.insertBefore(card, DOM.statsGrid.firstChild);
    mrrCard = document.getElementById('mrrCard');
  } else if (mrrCard.parentNode === DOM.statsGrid && mrrCard !== DOM.statsGrid.firstChild) {
    DOM.statsGrid.insertBefore(mrrCard, DOM.statsGrid.firstChild);
  }

  if (mrrCard && valuesChanged && lastMRRValues) {
    const valueEl = mrrCard.querySelector('.stat-card-value.mrr-primary-value');
    const gapEl = mrrCard.querySelector('.mrr-projection-gap');
    const fillEl = mrrCard.querySelector('.mrr-projection-fill');
    const fillClass = mrrPercent10k >= 100 ? 'green' : 'orange';

    if (valueEl) {
      valueEl.textContent = formatCurrency(currentMRR);
    }
    if (gapEl) {
      gapEl.textContent = formatCurrency(currentGap);
    }
    if (fillEl) {
      fillEl.style.width = `${mrrPercent10k}%`;
      fillEl.className = `mrr-projection-fill ${fillClass}`;
    }

    lastMRRValues = { mrr: currentMRR, gap: currentGap };
    return;
  }

  if (mrrCard && !lastMRRValues) {
    mrrCard.innerHTML = `
      <div class="stat-card-header">
        <span class="stat-card-label">MRR</span>
        <div class="stat-card-icon success">
          <i class="fa-solid fa-chart-line"></i>
        </div>
      </div>
      <div class="stat-card-value mrr-primary-value" style="color: var(--success);">${formatCurrency(currentMRR)}</div>
      <div class="mrr-projection" style="margin-top: 0.5rem;">
        <div class="mrr-projection-header">
          <div class="mrr-projection-label">Meta €10k</div>
          <div class="mrr-projection-gap">${formatCurrency(currentGap)}</div>
        </div>
        <div class="mrr-projection-bar">
          <div class="mrr-projection-fill ${mrrPercent10k >= 100 ? 'green' : 'orange'}"
               style="width: ${mrrPercent10k}%">
          </div>
        </div>
      </div>
    `;
    lastMRRValues = { mrr: currentMRR, gap: currentGap };
  }
}

function renderStatsCards(metrics) {
  if (!metrics || !DOM.statsGrid) return;

  const currentStats = {
    monthlyRevenue: metrics.monthlyRevenue || 0,
    activeProjects: metrics.activeProjects || 0,
    pendingPayments: metrics.pendingPayments || 0
  };

  const valuesChanged = !lastRenderedStats ||
    lastRenderedStats.monthlyRevenue !== currentStats.monthlyRevenue ||
    lastRenderedStats.activeProjects !== currentStats.activeProjects ||
    lastRenderedStats.pendingPayments !== currentStats.pendingPayments;

  if (!valuesChanged && DOM.statsGrid.children.length > 0) {
    const faturadoCard = document.getElementById('stat-faturado');
    const activeJobsCard = document.getElementById('stat-active-jobs');
    const pendingPaymentsCard = document.getElementById('stat-pending-payments');

    if (faturadoCard) {
      const valueEl = faturadoCard.querySelector('.stat-card-value');
      if (valueEl) valueEl.textContent = formatCurrency(currentStats.monthlyRevenue);
    }
    if (activeJobsCard) {
      const valueEl = activeJobsCard.querySelector('.stat-card-value');
      if (valueEl) valueEl.textContent = currentStats.activeProjects;
      const ariaLabel = activeJobsCard.getAttribute('aria-label');
      if (ariaLabel) {
        activeJobsCard.setAttribute('aria-label', `Jobs Ativos: ${currentStats.activeProjects}. Clique para filtrar.`);
      }
    }
    if (pendingPaymentsCard) {
      const valueEl = pendingPaymentsCard.querySelector('.stat-card-value');
      if (valueEl) valueEl.textContent = currentStats.pendingPayments;
      const ariaLabel = pendingPaymentsCard.getAttribute('aria-label');
      if (ariaLabel) {
        pendingPaymentsCard.setAttribute('aria-label', `Pagamentos Pendentes: ${currentStats.pendingPayments}. Clique para filtrar.`);
      }
    }

    lastRenderedStats = currentStats;
    return;
  }

  const stats = [
    {
      id: 'stat-faturado',
      label: 'Faturado',
      value: formatCurrency(currentStats.monthlyRevenue),
      icon: 'fa-euro-sign',
      iconClass: 'primary',
      clickable: false
    },
    {
      id: 'stat-active-jobs',
      label: 'Jobs Ativos',
      value: currentStats.activeProjects,
      icon: 'fa-layer-group',
      iconClass: 'success',
      clickable: true
    },
    {
      id: 'stat-pending-payments',
      label: 'Pagamentos Pendentes',
      value: currentStats.pendingPayments,
      icon: 'fa-clock',
      iconClass: 'warning',
      clickable: true
    }
  ];

  const fragment = document.createDocumentFragment();
  const tempDiv = document.createElement('div');

  tempDiv.innerHTML = stats.map(stat => {
    const cardClass = `stat-card ${stat.clickable ? 'stat-card-clickable' : ''}`;
    const cardRole = stat.clickable ? 'role="button" tabindex="0"' : 'role="region"';
    const cardAriaLabel = stat.clickable
      ? `aria-label="${stat.label}: ${stat.value}. Clique para filtrar."`
      : `aria-label="${stat.label}: ${stat.value}"`;
    const hintHtml = stat.clickable ? '<div class="stat-card-hint">Clique para filtrar</div>' : '';

    return `
      <div class="${cardClass}" id="${stat.id}" ${cardRole} ${cardAriaLabel}>
        <div class="stat-card-header">
          <span class="stat-card-label">${stat.label}</span>
          <div class="stat-card-icon ${stat.iconClass}" aria-hidden="true">
            <i class="fa-solid ${stat.icon}"></i>
          </div>
        </div>
        <div class="stat-card-value">${stat.value}</div>
        ${hintHtml}
      </div>
    `;
  }).join('');

  while (tempDiv.firstChild) {
    fragment.appendChild(tempDiv.firstChild);
  }

  DOM.statsGrid.innerHTML = '';
  DOM.statsGrid.appendChild(fragment);

  if (DOM.statsGrid && !DOM.statsGrid._statCardListenersAttached) {
    DOM.statsGrid.addEventListener('click', statCardClickHandler);
    DOM.statsGrid.addEventListener('keydown', statCardKeydownHandler);
    DOM.statsGrid._statCardListenersAttached = true;
  }

  lastRenderedStats = currentStats;
}

function renderRevenueChart(monthlyRevenueData, view = 'history') {
  if (!DOM.revenueChart) return;

  const hasNoData = !monthlyRevenueData || monthlyRevenueData.length === 0;
  if (hasNoData) {
    DOM.revenueChart.innerHTML = '<div class="empty-state"><div class="empty-state-icon"><i class="fa-solid fa-chart-line"></i></div><div class="empty-state-text">Sem dados de receita</div><div class="empty-state-subtext">Crie projetos para ver o histórico</div></div>';
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
    'rgba(4, 211, 97, 0.8)',    // Brand Green
    'rgba(250, 204, 21, 0.8)',  // Accent Yellow
    'rgba(14, 165, 233, 0.8)',  // Sky Blue
    'rgba(168, 85, 247, 0.8)'   // Purple
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

// calculateUrgentProjectTimeDisplay moved to calculations.js for centralized logic

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
  const elements = getExpandElements();
  const isExpanded = elements.urgentCard && elements.urgentCard.classList.contains('expanded');

  if (urgentProjectsList.length === 0) {
    DOM.urgentList.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon"><i class="fa-solid fa-check-circle"></i></div>
        <div class="empty-state-text">Nenhum projeto urgente</div>
        <div class="empty-state-subtext">Tudo em dia! 🎉</div>
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
        <div class="empty-state-subtext">As atividades aparecerão aqui</div>
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
    const taskId = activity.taskId;
    const task = tasks.find(t => t.id === taskId);

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
    `MRR,€${(metrics.mrr || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    `Meta €10k (Gap),€${Math.max(0, TARGET_MRR_10K - (metrics.mrr || 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    `Upsells Necessários,${Math.ceil(Math.max(0, TARGET_MRR_10K - (metrics.mrr || 0)) / getSettings().hostingPrice)}`,
    `Receita do Mês,€${(monthlyRevenue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    `Ticket Médio,€${(averageTicket || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    `Total Faturado,€${(totalRevenue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    `Projetos Urgentes,${metrics.urgentCount || 0}`,
    `Descoberta,${discoveryCount}`,
    `Acordo,${agreementCount}`,
    `Build,${buildCount}`,
    `Live,${liveCount}`,
    `Total de Projetos,${tasks.length}`
  ].join('\n');

  downloadCSV(csv, `vibeos-dashboard-${new Date().toISOString().split('T')[0]}.csv`);
}

let _cachedExpandElements = {
  urgentCard: null,
  activityCard: null,
  expandUrgentBtn: null,
  expandActivityBtn: null,
  expandUrgentIcon: null,
  expandActivityIcon: null
};

function getExpandElements() {
  if (!_cachedExpandElements.urgentCard) {
    _cachedExpandElements.urgentCard = document.getElementById('urgentCard');
    _cachedExpandElements.activityCard = document.getElementById('activityCard');
    _cachedExpandElements.expandUrgentBtn = document.getElementById('expandUrgentBtn');
    _cachedExpandElements.expandActivityBtn = document.getElementById('expandActivityBtn');
    _cachedExpandElements.expandUrgentIcon = _cachedExpandElements.expandUrgentBtn?.querySelector('i');
    _cachedExpandElements.expandActivityIcon = _cachedExpandElements.expandActivityBtn?.querySelector('i');
  }
  return _cachedExpandElements;
}

function setupExpandButtons() {
  const elements = getExpandElements();

  if (elements.expandUrgentBtn) {
    elements.expandUrgentBtn.removeEventListener('click', toggleUrgentExpand);
    elements.expandUrgentBtn.addEventListener('click', toggleUrgentExpand);
  }

  if (elements.expandActivityBtn) {
    elements.expandActivityBtn.removeEventListener('click', toggleActivityExpand);
    elements.expandActivityBtn.addEventListener('click', toggleActivityExpand);
  }
}

function toggleUrgentExpand() {
  const elements = getExpandElements();
  const urgentCard = elements.urgentCard;
  const expandBtn = elements.expandUrgentBtn;
  const expandIcon = elements.expandUrgentIcon;

  if (!urgentCard || !expandBtn || !expandIcon) return;

  const isExpanded = urgentCard.classList.contains('expanded');
  const metrics = AppState.getCachedMetrics(() => calculateDashboardMetrics());

  if (isExpanded) {
    urgentCard.classList.remove('expanded');
    expandIcon.className = 'fa-solid fa-expand';
    expandBtn.setAttribute('aria-label', 'Expandir lista de urgentes');
    expandBtn.setAttribute('title', 'Expandir');
  } else {
    urgentCard.classList.add('expanded');
    expandIcon.className = 'fa-solid fa-compress';
    expandBtn.setAttribute('aria-label', 'Recolher lista de urgentes');
    expandBtn.setAttribute('title', 'Recolher');
  }

  renderUrgentProjects(metrics.urgentProjects || []);
}

async function toggleActivityExpand() {
  const elements = getExpandElements();
  const activityCard = elements.activityCard;
  const expandBtn = elements.expandActivityBtn;
  const expandIcon = elements.expandActivityIcon;

  if (!activityCard || !expandBtn || !expandIcon) return;

  const isExpanded = activityCard.classList.contains('expanded');

  if (isExpanded) {
    activityCard.classList.remove('expanded');
    expandIcon.className = 'fa-solid fa-expand';
    expandBtn.setAttribute('aria-label', 'Expandir lista de atividades');
    expandBtn.setAttribute('title', 'Expandir');

    const tasks = AppState.getTasks();
    const activities = await generateRecentActivities(tasks, true);
    renderRecentActivities(activities || []);
  } else {
    activityCard.classList.add('expanded');
    expandIcon.className = 'fa-solid fa-compress';
    expandBtn.setAttribute('aria-label', 'Recolher lista de atividades');
    expandBtn.setAttribute('title', 'Recolher');

    const allActivities = await api.getActivities(100);
    if (allActivities && Array.isArray(allActivities) && allActivities.length > 0) {
      const activities = [];
      const apiBaseUrl = getApiBaseUrl();
      const iconMap = {
        'create': 'fa-plus-circle',
        'move': 'fa-arrows-left-right',
        'update': 'fa-edit',
        'delete': 'fa-trash'
      };

      allActivities.forEach(activity => {
        const activityDate = parseTaskDate(activity.created_at);
        if (!activityDate) return;

        const userName = activity.user_name || 'Usuário';
        const userAvatarUrl = activity.user_avatar_url
          ? (activity.user_avatar_url.startsWith('http') ? activity.user_avatar_url : `${apiBaseUrl}${activity.user_avatar_url}`)
          : null;

        activities.push({
          text: escapeHtml(activity.action_description || ''),
          createdAt: activityDate,
          icon: iconMap[activity.action_type] || 'fa-file-invoice',
          taskId: activity.task_id,
          userName: userName,
          userInitials: getInitials(userName),
          userAvatarUrl: userAvatarUrl
        });
      });
      renderRecentActivities(activities);
    } else {
      const tasks = AppState.getTasks();
      const activities = await generateRecentActivities(tasks, true);
      renderRecentActivities(activities || []);
    }
  }
}