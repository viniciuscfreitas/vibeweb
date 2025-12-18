const FINANCIAL_RENDER_DELAY_MS = 50;

function getRevenueChangeClass(revenueChange) {
  if (revenueChange > 0) return 'positive';
  if (revenueChange < 0) return 'negative';
  return '';
}

function getRevenueChangeIcon(revenueChange) {
  if (revenueChange > 0) return '<i class="fa-solid fa-arrow-up"></i>';
  if (revenueChange < 0) return '<i class="fa-solid fa-arrow-down"></i>';
  return '';
}

function getHostingDisplayText(hosting) {
  if (hosting === HOSTING_YES) return 'Sim';
  if (hosting === HOSTING_LATER) return 'Pendente';
  return 'Não';
}

function calculateFinancialMetrics(tasks) {
  let totalRevenue = 0;
  let pendingRevenue = 0;
  let paidCount = 0;
  let pendingCount = 0;
  let hostingActiveCount = 0;

  tasks.forEach(task => {
    const isPaid = task.payment_status === PAYMENT_STATUS_PAID || task.payment_status === PAYMENT_STATUS_PARTIAL;
    const isPending = task.payment_status === PAYMENT_STATUS_PENDING;
    const price = parseFloat(task.price) || 0;

    if (isPaid) {
      paidCount++;
      totalRevenue += price;
    } else if (isPending) {
      pendingCount++;
      pendingRevenue += price;
    }

    if (task.col_id === 3 && task.hosting === HOSTING_YES) {
      hostingActiveCount++;
    }
  });

  const settings = getSettings();
  const hostingRevenue = hostingActiveCount * settings.hostingPrice;

  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();
  const currentMonthRevenue = calculateRevenueForMonth(tasks, currentMonth, currentYear);
  const lastMonthInfo = getLastMonthInfo(currentMonth, currentYear);
  const lastMonthRevenue = calculateRevenueForMonth(tasks, lastMonthInfo.month, lastMonthInfo.year);
  const revenueChange = calculateRevenueChange(currentMonthRevenue, lastMonthRevenue);

  const metrics = AppState.getCachedMetrics(() => calculateDashboardMetrics());

  return {
    mrr: metrics.mrr,
    totalRevenue,
    pendingRevenue,
    hostingRevenue,
    hostingActive: hostingActiveCount,
    currentMonthRevenue,
    revenueChange,
    pendingCount,
    paidCount
  };
}

let financialSearchState = {
  tasks: [],
  sortedTasks: null,
  timeout: null,
  lastRenderHash: null,
  isRendered: false,
  gridElement: null,
  filterStatus: 'all', // 'all', 'paid', 'pending'
  sortColumn: 'value', // 'client', 'value', 'status', 'hosting'
  sortDirection: 'desc', // 'asc', 'desc'
  cachedMetrics: null, // Cache metrics to avoid recalculation
  tasksCache: new Map() // Cache parsed task data (dates, lowercased strings)
};

const paymentStatusHtml = {
  [PAYMENT_STATUS_PAID]: '<span style="color: var(--success);"><i class="fa-solid fa-check"></i> Pago</span>',
  [PAYMENT_STATUS_PARTIAL]: '<span style="color: var(--warning);">50%</span>',
  [PAYMENT_STATUS_PENDING]: '<span style="color: var(--danger);">Pendente</span>'
};

const hostingHtml = {
  [HOSTING_YES]: '<span style="color: var(--success);"><i class="fa-solid fa-check"></i></span>',
  [HOSTING_LATER]: '<span style="color: var(--warning);"><i class="fa-solid fa-clock"></i></span>',
  [HOSTING_NO]: ''
};

function resetFinancialRenderState() {
  financialSearchState.lastRenderHash = null;
  financialSearchState.isRendered = false;
  financialSearchState.gridElement = null;
  financialSearchState.sortedTasks = null;
  financialSearchState.filterStatus = 'all';
  financialSearchState.sortColumn = 'value';
  financialSearchState.sortDirection = 'desc';
  financialSearchState.cachedMetrics = null;
  financialSearchState.tasksCache.clear();
}

function handleFinancialSearch() {
  if (!DOM.financialContainer || !DOM.financialContainer.classList.contains('active')) {
    return false;
  }

  if (!DOM.searchInput) return false;

  if (financialSearchState.timeout) {
    clearTimeout(financialSearchState.timeout);
  }

  financialSearchState.timeout = setTimeout(() => {
    const searchTerm = DOM.searchInput.value.toLowerCase().trim();
    filterAndRenderProjects(searchTerm);
  }, SEARCH_DEBOUNCE_MS);

  return true;
}

function filterAndRenderProjects(searchTerm) {
  const hasSearchTerm = searchTerm && searchTerm.length > 0;
  let filteredTasks = financialSearchState.tasks;

  if (financialSearchState.filterStatus === 'paid') {
    filteredTasks = filteredTasks.filter(task =>
      task.payment_status === PAYMENT_STATUS_PAID || task.payment_status === PAYMENT_STATUS_PARTIAL
    );
  } else if (financialSearchState.filterStatus === 'pending') {
    filteredTasks = filteredTasks.filter(task =>
      task.payment_status === PAYMENT_STATUS_PENDING
    );
  }

  if (hasSearchTerm) {
    const searchLower = searchTerm.toLowerCase();
    filteredTasks = filteredTasks.filter(task => {
      const cacheKey = task.id;
      let cached = financialSearchState.tasksCache.get(cacheKey);

      if (!cached || cached.version !== task.updated_at) {
        cached = {
          version: task.updated_at,
          client: (task.client || '').toLowerCase(),
          contact: (task.contact || '').toLowerCase(),
          type: (task.type || '').toLowerCase(),
          description: (task.description || '').toLowerCase()
        };
        financialSearchState.tasksCache.set(cacheKey, cached);
      }

      return cached.client.includes(searchLower) ||
        cached.contact.includes(searchLower) ||
        cached.type.includes(searchLower) ||
        cached.description.includes(searchLower);
    });
  }

  financialSearchState.sortedTasks = null;
  renderProjectsTable(filteredTasks, hasSearchTerm);
}

function sortTasks(tasks) {
  if (!tasks || tasks.length === 0) return tasks;

  const column = financialSearchState.sortColumn;
  const direction = financialSearchState.sortDirection;

  const tasksWithSortKey = tasks.map(task => {
    let sortKey;

    switch (column) {
      case 'client':
        sortKey = (task.client || '').toLowerCase();
        break;
      case 'value':
        sortKey = parseFloat(task.price) || 0;
        break;
      case 'status':
        const statusOrder = { [PAYMENT_STATUS_PAID]: 0, [PAYMENT_STATUS_PARTIAL]: 1, [PAYMENT_STATUS_PENDING]: 2 };
        sortKey = statusOrder[task.payment_status] !== undefined ? statusOrder[task.payment_status] : 3;
        break;
      case 'hosting':
        const hostingOrder = { [HOSTING_YES]: 0, [HOSTING_LATER]: 1, [HOSTING_NO]: 2 };
        sortKey = hostingOrder[task.hosting] !== undefined ? hostingOrder[task.hosting] : 3;
        break;
      default:
        sortKey = 0;
    }

    return { task, sortKey };
  });

  tasksWithSortKey.sort((a, b) => {
    if (column === 'client') {
      return direction === 'asc'
        ? a.sortKey.localeCompare(b.sortKey)
        : b.sortKey.localeCompare(a.sortKey);
    } else {
      return direction === 'asc' ? a.sortKey - b.sortKey : b.sortKey - a.sortKey;
    }
  });

  return tasksWithSortKey.map(item => item.task);
}

function handleSort(column) {
  if (financialSearchState.sortColumn === column) {
    financialSearchState.sortDirection = financialSearchState.sortDirection === 'asc' ? 'desc' : 'asc';
  } else {
    financialSearchState.sortColumn = column;
    financialSearchState.sortDirection = 'desc';
  }

  const searchTerm = DOM.searchInput ? DOM.searchInput.value.toLowerCase().trim() : '';
  filterAndRenderProjects(searchTerm);
}

function handleFilterStatus(status) {
  financialSearchState.filterStatus = status;
  const searchTerm = DOM.searchInput ? DOM.searchInput.value.toLowerCase().trim() : '';
  filterAndRenderProjects(searchTerm);

  const filterButtons = document.querySelectorAll('.financial-filter-btn');
  filterButtons.forEach(btn => {
    if (btn.dataset.filter === status) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

async function quickMarkAsPaid(taskId, e) {
  e.stopPropagation();

  try {
    const task = AppState.getTasks().find(t => t.id === taskId);
    if (!task) {
      NotificationManager.warning('Projeto não encontrado');
      return;
    }

    const updatedTaskFromServer = await api.updateTask(taskId, {
      payment_status: PAYMENT_STATUS_PAID
    });

    if (!updatedTaskFromServer) {
      throw new Error('Resposta inválida do servidor');
    }

    const normalizedTask = normalizeTasksData([updatedTaskFromServer])[0];

    if (!normalizedTask) {
      throw new Error('Erro ao normalizar dados do projeto');
    }

    const tasks = AppState.getTasks();
    const updatedTasks = tasks.map(t => t.id === taskId ? normalizedTask : t);
    AppState.setTasks(updatedTasks);

    financialSearchState.tasksCache.delete(taskId);
    financialSearchState.cachedMetrics = null;

    NotificationManager.success('Pagamento marcado como pago');

    updateFinancialRow(normalizedTask);
  } catch (error) {
    NotificationManager.error('Erro ao atualizar pagamento: ' + error.message);
  }
}

function updateFinancialRow(updatedTask) {
  const tableBody = document.getElementById('projectsTable');
  const mobileCards = document.getElementById('financialMobileCards');

  if (!tableBody) {
    renderFinancial();
    return;
  }

  const rows = tableBody.querySelectorAll('tr');
  for (const row of rows) {
    const btn = row.querySelector('.quick-action-btn');
    if (btn && parseInt(btn.dataset.taskId, 10) === updatedTask.id) {
      const formattedPrice = formatCurrency(updatedTask.price);
      const paymentStatus = paymentStatusHtml[updatedTask.payment_status] || paymentStatusHtml[PAYMENT_STATUS_PENDING];
      const hosting = hostingHtml[updatedTask.hosting] || '';
      const isUrgent = isTaskUrgent(updatedTask);
      const canMarkAsPaid = updatedTask.payment_status === PAYMENT_STATUS_PENDING;

      row.className = isUrgent ? 'financial-row-urgent' : '';
      row.cells[1].innerHTML = `<span style="font-weight: 600; font-family: 'JetBrains Mono', monospace;">${formattedPrice}</span>`;
      row.cells[2].innerHTML = paymentStatus;
      row.cells[3].innerHTML = hosting;

      if (canMarkAsPaid) {
        if (!row.cells[4].querySelector('.quick-action-btn')) {
          row.cells[4].innerHTML = `
            <button class="quick-action-btn"
                    data-task-id="${updatedTask.id}"
                    aria-label="Marcar como pago"
                    title="Marcar como pago">
              <i class="fa-solid fa-check"></i>
            </button>
          `;
          const quickBtn = row.cells[4].querySelector('.quick-action-btn');
          quickBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const taskId = parseInt(quickBtn.dataset.taskId, 10);
            if (!isNaN(taskId)) {
              quickMarkAsPaid(taskId, e);
            }
          });
        }
      } else {
        row.cells[4].innerHTML = '';
      }
      break;
    }
  }

  if (mobileCards) {
    const cards = mobileCards.querySelectorAll('.financial-mobile-card');
    for (const card of cards) {
      const btn = card.querySelector('.quick-action-btn');
      if (btn && parseInt(btn.dataset.taskId, 10) === updatedTask.id) {
        const formattedPrice = formatCurrency(updatedTask.price);
        const paymentStatus = paymentStatusHtml[updatedTask.payment_status] || paymentStatusHtml[PAYMENT_STATUS_PENDING];
        const hosting = hostingHtml[updatedTask.hosting] || '';
        const isUrgent = isTaskUrgent(updatedTask);
        const canMarkAsPaid = updatedTask.payment_status === PAYMENT_STATUS_PENDING;

        card.className = isUrgent ? 'financial-mobile-card financial-card-urgent' : 'financial-mobile-card';

        const header = card.querySelector('.financial-mobile-card-header');
        const body = card.querySelector('.financial-mobile-card-body');

        if (header && body) {
          header.innerHTML = `
            <div>
              <strong>${escapeHtml(updatedTask.client)}</strong>
              ${isUrgent ? '<span class="urgent-badge"><i class="fa-solid fa-exclamation-triangle"></i></span>' : ''}
            </div>
            ${canMarkAsPaid ? `
              <button class="quick-action-btn"
                      data-task-id="${updatedTask.id}"
                      aria-label="Marcar como pago"
                      title="Marcar como pago">
                <i class="fa-solid fa-check"></i>
              </button>
            ` : ''}
          `;

          body.innerHTML = `
            <div class="financial-mobile-card-row">
              <span class="financial-mobile-label">Valor:</span>
              <span style="font-weight: 600; font-family: 'JetBrains Mono', monospace;">${formattedPrice}</span>
            </div>
            <div class="financial-mobile-card-row">
              <span class="financial-mobile-label">Status:</span>
              ${paymentStatus}
            </div>
            <div class="financial-mobile-card-row">
              <span class="financial-mobile-label">Hosting:</span>
              ${hosting || 'Não'}
            </div>
          `;

          if (canMarkAsPaid) {
            const quickBtn = header.querySelector('.quick-action-btn');
            if (quickBtn) {
              quickBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const taskId = parseInt(quickBtn.dataset.taskId, 10);
                if (!isNaN(taskId)) {
                  quickMarkAsPaid(taskId, e);
                }
              });
            }
          }
        }
        break;
      }
    }
  }

  if (financialSearchState.cachedMetrics) {
    const tasks = AppState.getTasks();
    const financialMetrics = calculateFinancialMetrics(tasks);
    financialSearchState.cachedMetrics.financialMetrics = financialMetrics;

    const summaryCards = document.querySelectorAll('.financial-summary .stat-card');
    if (summaryCards.length >= 4) {
      summaryCards[0].querySelector('.stat-card-value').textContent = formatCurrency(financialMetrics.mrr);
      summaryCards[0].querySelector('.stat-card-change span').textContent = `${financialMetrics.hostingActive} hosting ativo`;
      summaryCards[1].querySelector('.stat-card-value').textContent = formatCurrency(financialMetrics.totalRevenue);
      summaryCards[2].querySelector('.stat-card-value').textContent = formatCurrency(financialMetrics.currentMonthRevenue);
      summaryCards[3].querySelector('.stat-card-value').textContent = formatCurrency(financialMetrics.pendingRevenue);
      summaryCards[3].querySelector('.stat-card-change span').textContent = `${financialMetrics.pendingCount} projetos`;
    }
  }
}

function isTaskUrgent(task) {
  if (task.payment_status !== PAYMENT_STATUS_PENDING) return false;

  const cacheKey = task.id;
  let cached = financialSearchState.tasksCache.get(cacheKey);

  if (!cached || cached.version !== task.updated_at) {
    cached = {
      version: task.updated_at,
      createdDate: parseTaskDate(task.created_at),
      isUrgent: null
    };
    financialSearchState.tasksCache.set(cacheKey, cached);
  }

  if (cached.isUrgent !== null) {
    return cached.isUrgent;
  }

  if (!cached.createdDate) {
    cached.isUrgent = false;
    return false;
  }

  const daysSinceCreation = (Date.now() - cached.createdDate.getTime()) / MS_PER_DAY;
  cached.isUrgent = daysSinceCreation > 30;
  return cached.isUrgent;
}

function renderFinancial() {
  if (!DOM.financialContainer) return;

  const tasks = AppState.getTasks();

  if (!tasks || tasks.length === 0) {
    if (financialSearchState.isRendered && financialSearchState.gridElement) {
      return;
    }
    DOM.financialContainer.classList.remove('hidden');
    DOM.financialContainer.classList.add('active');
    DOM.financialContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">
          <i class="fa-solid fa-euro-sign"></i>
        </div>
        <div class="empty-state-text">Nenhum projeto cadastrado</div>
        <div class="empty-state-subtext">Crie seu primeiro projeto para ver métricas financeiras</div>
        <button class="btn-primary" onclick="if(typeof openModal === 'function') openModal();" style="margin-top: 1rem;">
          <i class="fa-solid fa-plus"></i> Criar Projeto
        </button>
      </div>
    `;
    financialSearchState.tasks = [];
    financialSearchState.isRendered = true;
    financialSearchState.lastRenderHash = null;
    financialSearchState.gridElement = null;
    return;
  }

  let tasksHash = tasks.length.toString();
  if (tasks.length > 0) {
    const sampleSize = Math.min(5, tasks.length);
    const step = Math.max(1, Math.floor(tasks.length / sampleSize));
    const samples = [];
    for (let i = 0; i < tasks.length; i += step) {
      const t = tasks[i];
      samples.push(`${t.id}:${t.price || 0}:${t.payment_status || ''}:${t.hosting || ''}:${t.col_id || ''}`);
      if (samples.length >= sampleSize) break;
    }
    tasksHash += '-' + samples.join('|');
  }

  if (financialSearchState.isRendered && financialSearchState.lastRenderHash === tasksHash) {
    if (!financialSearchState.gridElement && DOM.financialContainer) {
      financialSearchState.gridElement = DOM.financialContainer.querySelector('.financial-grid');
    }
    if (financialSearchState.gridElement) {
      return;
    }
  }

  DOM.financialContainer.classList.remove('hidden');
  DOM.financialContainer.classList.add('active');

  financialSearchState.lastRenderHash = tasksHash;
  financialSearchState.isRendered = true;
  financialSearchState.gridElement = null;
  financialSearchState.tasks = tasks;
  financialSearchState.sortedTasks = null;

  if (financialSearchState.timeout) {
    clearTimeout(financialSearchState.timeout);
    financialSearchState.timeout = null;
  }

  if (DOM.searchInput) {
    DOM.searchInput.value = '';
    DOM.searchInput.placeholder = 'Buscar projeto financeiro... (/)';
  }

  if (!financialSearchState.cachedMetrics) {
    const metrics = AppState.getCachedMetrics(() => calculateDashboardMetrics());
    financialSearchState.cachedMetrics = {
      metrics,
      financialMetrics: calculateFinancialMetrics(tasks),
      tasksHash: tasksHash
    };
  } else if (financialSearchState.cachedMetrics.tasksHash !== tasksHash) {
    const metrics = AppState.getCachedMetrics(() => calculateDashboardMetrics());
    financialSearchState.cachedMetrics = {
      metrics,
      financialMetrics: calculateFinancialMetrics(tasks),
      tasksHash: tasksHash
    };
  }

  const metrics = financialSearchState.cachedMetrics.metrics;
  const financialMetrics = financialSearchState.cachedMetrics.financialMetrics;

  const sortIcon = (column) => {
    if (financialSearchState.sortColumn !== column) {
      return '<i class="fa-solid fa-sort" style="opacity: 0.3;"></i>';
    }
    return financialSearchState.sortDirection === 'asc'
      ? '<i class="fa-solid fa-sort-up"></i>'
      : '<i class="fa-solid fa-sort-down"></i>';
  };

  DOM.financialContainer.innerHTML = `
    <div class="financial-grid">
      <!-- Key Metrics Cards -->
      <div class="financial-summary">
        <div class="stat-card">
          <div class="stat-card-header">
            <span class="stat-card-label">MRR</span>
            <div class="stat-card-icon success">
              <i class="fa-solid fa-chart-line"></i>
            </div>
          </div>
          <div class="stat-card-value" style="color: var(--success); font-size: 1.75rem;">${formatCurrency(financialMetrics.mrr)}</div>
          <div class="stat-card-change">
            <span>${financialMetrics.hostingActive} hosting ativo</span>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-card-header">
            <span class="stat-card-label">Receita Total</span>
            <div class="stat-card-icon primary">
              <i class="fa-solid fa-euro-sign"></i>
            </div>
          </div>
          <div class="stat-card-value" style="font-size: 1.75rem;">${formatCurrency(financialMetrics.totalRevenue)}</div>
        </div>

        <div class="stat-card">
          <div class="stat-card-header">
            <span class="stat-card-label">Receita do Mês</span>
            <div class="stat-card-icon primary">
              <i class="fa-solid fa-calendar"></i>
            </div>
          </div>
          <div class="stat-card-value" style="font-size: 1.75rem;">${formatCurrency(financialMetrics.currentMonthRevenue)}</div>
          <div class="stat-card-change ${getRevenueChangeClass(financialMetrics.revenueChange)}">
            ${getRevenueChangeIcon(financialMetrics.revenueChange)} ${Math.abs(financialMetrics.revenueChange).toFixed(1)}% vs anterior
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-card-header">
            <span class="stat-card-label">Pendente</span>
            <div class="stat-card-icon danger">
              <i class="fa-solid fa-clock"></i>
            </div>
          </div>
          <div class="stat-card-value" style="color: var(--danger); font-size: 1.75rem;">${formatCurrency(financialMetrics.pendingRevenue)}</div>
          <div class="stat-card-change">
            <span>${financialMetrics.pendingCount} projetos</span>
          </div>
        </div>
      </div>

      <!-- Projects Table -->
      <div class="dashboard-card">
        <div class="dashboard-card-header">
          <h3 class="dashboard-card-title">Projetos</h3>
          <div class="financial-filters">
            <button class="financial-filter-btn ${financialSearchState.filterStatus === 'all' ? 'active' : ''}"
                    data-filter="all"
                    onclick="handleFilterStatus('all')"
                    aria-label="Mostrar todos os projetos">
              Todos
            </button>
            <button class="financial-filter-btn ${financialSearchState.filterStatus === 'paid' ? 'active' : ''}"
                    data-filter="paid"
                    onclick="handleFilterStatus('paid')"
                    aria-label="Mostrar apenas projetos pagos">
              Pago
            </button>
            <button class="financial-filter-btn ${financialSearchState.filterStatus === 'pending' ? 'active' : ''}"
                    data-filter="pending"
                    onclick="handleFilterStatus('pending')"
                    aria-label="Mostrar apenas projetos pendentes">
              Pendente
            </button>
          </div>
        </div>
        <div class="financial-table-container">
          <table class="financial-table" role="table" aria-label="Tabela de projetos financeiros">
            <thead>
              <tr>
                <th scope="col" class="sortable" onclick="handleSort('client')" style="cursor: pointer;">
                  Cliente ${sortIcon('client')}
                </th>
                <th scope="col" class="sortable" onclick="handleSort('value')" style="cursor: pointer;">
                  Valor ${sortIcon('value')}
                </th>
                <th scope="col" class="sortable" onclick="handleSort('status')" style="cursor: pointer;">
                  Status ${sortIcon('status')}
                </th>
                <th scope="col" class="sortable" onclick="handleSort('hosting')" style="cursor: pointer;">
                  Hosting ${sortIcon('hosting')}
                </th>
                <th scope="col" style="width: 80px;">Ação</th>
              </tr>
            </thead>
            <tbody id="projectsTable">
            </tbody>
          </table>
        </div>
        <div id="financialMobileCards" class="financial-mobile-cards">
          <!-- Mobile cards will be rendered here -->
        </div>
      </div>
    </div>
  `;

  setTimeout(() => {
    const searchTerm = DOM.searchInput ? DOM.searchInput.value.toLowerCase().trim() : '';
    filterAndRenderProjects(searchTerm);
    if (DOM.financialContainer) {
      financialSearchState.gridElement = DOM.financialContainer.querySelector('.financial-grid');
    }
  }, FINANCIAL_RENDER_DELAY_MS);
}

function renderProjectsTable(tasks, showNoResults = false) {
  const tableBody = document.getElementById('projectsTable');
  const mobileCards = document.getElementById('financialMobileCards');
  if (!tableBody) return;

  if (tasks.length === 0) {
    const message = showNoResults
      ? 'Nenhum projeto encontrado com o termo buscado'
      : 'Nenhum projeto';
    tableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 2rem; color: var(--text-muted);">${message}</td></tr>`;
    if (mobileCards) {
      mobileCards.innerHTML = `<div style="padding: 2rem; text-align: center; color: var(--text-muted);">${message}</div>`;
    }
    return;
  }

  const sortedTasks = sortTasks(tasks);
  financialSearchState.sortedTasks = sortedTasks;

  const fragment = document.createDocumentFragment();
  const mobileFragment = document.createDocumentFragment();

  sortedTasks.forEach(task => {
    const formattedPrice = formatCurrency(task.price);
    const paymentStatus = paymentStatusHtml[task.payment_status] || paymentStatusHtml[PAYMENT_STATUS_PENDING];
    const hosting = hostingHtml[task.hosting] || '';
    const isUrgent = isTaskUrgent(task);
    const canMarkAsPaid = task.payment_status === PAYMENT_STATUS_PENDING;

    // Desktop table row
    const row = document.createElement('tr');
    if (isUrgent) {
      row.classList.add('financial-row-urgent');
    }
    row.style.cursor = 'pointer';
    row.setAttribute('role', 'button');
    row.setAttribute('tabindex', '0');
    row.setAttribute('aria-label', `Projeto ${task.client}, ${formattedPrice}, ${task.payment_status}`);

    const rowClickHandler = (e) => {
      if (!e.target.closest('.quick-action-btn')) {
        openModal(task);
      }
    };

    row.addEventListener('click', rowClickHandler);
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openModal(task);
      }
    });

    row.innerHTML = `
      <td>
        <strong>${escapeHtml(task.client)}</strong>
        ${isUrgent ? '<span class="urgent-badge" title="Pagamento pendente há mais de 30 dias"><i class="fa-solid fa-exclamation-triangle"></i></span>' : ''}
      </td>
      <td style="font-weight: 600; font-family: 'JetBrains Mono', monospace;">${formattedPrice}</td>
      <td>${paymentStatus}</td>
      <td>${hosting}</td>
      <td>
        ${canMarkAsPaid ? `
          <button class="quick-action-btn"
                  data-task-id="${task.id}"
                  aria-label="Marcar como pago"
                  title="Marcar como pago">
            <i class="fa-solid fa-check"></i>
          </button>
        ` : ''}
      </td>
    `;

    if (canMarkAsPaid) {
      const quickBtn = row.querySelector('.quick-action-btn');
      if (quickBtn) {
        quickBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const taskId = parseInt(quickBtn.dataset.taskId, 10);
          if (!isNaN(taskId)) {
            quickMarkAsPaid(taskId, e);
          }
        });
      }
    }

    fragment.appendChild(row);

    // Mobile card
    if (mobileCards) {
      const card = document.createElement('div');
      card.className = 'financial-mobile-card';
      if (isUrgent) {
        card.classList.add('financial-card-urgent');
      }
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-label', `Projeto ${task.client}, ${formattedPrice}, ${task.payment_status}`);

      const cardClickHandler = (e) => {
        if (!e.target.closest('.quick-action-btn')) {
          openModal(task);
        }
      };

      card.addEventListener('click', cardClickHandler);
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openModal(task);
        }
      });

      card.innerHTML = `
        <div class="financial-mobile-card-header">
          <div>
            <strong>${escapeHtml(task.client)}</strong>
            ${isUrgent ? '<span class="urgent-badge"><i class="fa-solid fa-exclamation-triangle"></i></span>' : ''}
          </div>
          ${canMarkAsPaid ? `
            <button class="quick-action-btn"
                    data-task-id="${task.id}"
                    aria-label="Marcar como pago"
                    title="Marcar como pago">
              <i class="fa-solid fa-check"></i>
            </button>
          ` : ''}
        </div>
        <div class="financial-mobile-card-body">
          <div class="financial-mobile-card-row">
            <span class="financial-mobile-label">Valor:</span>
            <span style="font-weight: 600; font-family: 'JetBrains Mono', monospace;">${formattedPrice}</span>
          </div>
          <div class="financial-mobile-card-row">
            <span class="financial-mobile-label">Status:</span>
            ${paymentStatus}
          </div>
          <div class="financial-mobile-card-row">
            <span class="financial-mobile-label">Hosting:</span>
            ${hosting || 'Não'}
          </div>
        </div>
      `;

      if (canMarkAsPaid) {
        const quickBtn = card.querySelector('.quick-action-btn');
        if (quickBtn) {
          quickBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const taskId = parseInt(quickBtn.dataset.taskId, 10);
            if (!isNaN(taskId)) {
              quickMarkAsPaid(taskId, e);
            }
          });
        }
      }

      mobileFragment.appendChild(card);
    }
  });

  tableBody.innerHTML = '';
  tableBody.appendChild(fragment);

  if (mobileCards) {
    mobileCards.innerHTML = '';
    mobileCards.appendChild(mobileFragment);
  }
}

function renderFinancialHeader(metrics) {
  if (!DOM.headerInfo) return;

  DOM.headerInfo.innerHTML = `
    <div class="header-stat">
      <span class="header-stat-label">MRR</span>
      <span class="header-stat-value" style="color: var(--success);">${formatCurrency(metrics.mrr)}</span>
    </div>
    <div class="header-stat">
      <span class="header-stat-label">Receita Total</span>
      <span class="header-stat-value">${formatCurrency(metrics.totalRevenue)}</span>
    </div>
    <div class="header-stat">
      <span class="header-stat-label">Ticket Médio</span>
      <span class="header-stat-value">${formatCurrency(metrics.averageTicket)}</span>
    </div>
  `;
}

function exportFinancialData() {
  let tasksToExport = (financialSearchState.sortedTasks && financialSearchState.sortedTasks.length > 0)
    ? financialSearchState.sortedTasks
    : financialSearchState.tasks;

  if (!tasksToExport || tasksToExport.length === 0) {
    NotificationManager.warning('Nenhum projeto para exportar');
    return;
  }

  if (financialSearchState.filterStatus === 'paid') {
    tasksToExport = tasksToExport.filter(task =>
      task.payment_status === PAYMENT_STATUS_PAID || task.payment_status === PAYMENT_STATUS_PARTIAL
    );
  } else if (financialSearchState.filterStatus === 'pending') {
    tasksToExport = tasksToExport.filter(task =>
      task.payment_status === PAYMENT_STATUS_PENDING
    );
  }

  const searchTerm = DOM.searchInput ? DOM.searchInput.value.toLowerCase().trim() : '';
  if (searchTerm) {
    const searchLower = searchTerm.toLowerCase();
    tasksToExport = tasksToExport.filter(task => {
      const client = (task.client || '').toLowerCase();
      const contact = (task.contact || '').toLowerCase();
      const type = (task.type || '').toLowerCase();
      const description = (task.description || '').toLowerCase();
      return client.includes(searchLower) ||
        contact.includes(searchLower) ||
        type.includes(searchLower) ||
        description.includes(searchLower);
    });
  }

  const allTasks = AppState.getTasks();
  const metrics = AppState.getCachedMetrics(() => calculateDashboardMetrics());
  const financialMetrics = calculateFinancialMetrics(allTasks);
  const monthlyRevenue = calculateMonthlyRevenue(allTasks, 12);
  const projectedRevenue = calculateProjectedRevenue(allTasks, 12);

  const filterInfo = financialSearchState.filterStatus !== 'all'
    ? ` (Filtrado: ${financialSearchState.filterStatus === 'paid' ? 'Pago' : 'Pendente'})`
    : '';
  const searchInfo = searchTerm ? ` (Busca: "${searchTerm}")` : '';

  const csv = [
    'Métrica,Valor',
    `MRR,€${metrics.mrr.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    `Receita Total,€${financialMetrics.totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    `Receita Pendente,€${financialMetrics.pendingRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    '',
    'Mês,Receita Histórica,Projeção',
    ...monthlyRevenue.map((month, index) => {
      const projection = projectedRevenue[index] || { value: 0 };
      return `${month.name},€${month.value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })},€${projection.value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }),
    '',
    `Cliente,Valor,Status Pagamento,Hosting${filterInfo}${searchInfo}`,
    ...tasksToExport.map(t => {
      const hosting = getHostingDisplayText(t.hosting);
      return `"${t.client}",€${(parseFloat(t.price) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })},"${t.payment_status}","${hosting}"`;
    })
  ].join('\n');

  downloadCSV(csv, `vibeos-financial-${new Date().toISOString().split('T')[0]}.csv`);
}

if (typeof window !== 'undefined') {
  window.handleSort = handleSort;
  window.handleFilterStatus = handleFilterStatus;
}
