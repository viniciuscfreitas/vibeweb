// Financial Screen Logic - Minimal Cognitive Load

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
  const paidTasks = tasks.filter(t =>
    t.payment_status === PAYMENT_STATUS_PAID || t.payment_status === PAYMENT_STATUS_PARTIAL
  );
  const pendingTasks = tasks.filter(t => t.payment_status === PAYMENT_STATUS_PENDING);

  const totalRevenue = paidTasks.reduce((sum, t) => sum + (parseFloat(t.price) || 0), 0);
  const pendingRevenue = pendingTasks.reduce((sum, t) => sum + (parseFloat(t.price) || 0), 0);

  const hostingActive = tasks.filter(t => t.col_id === 3 && t.hosting === HOSTING_YES);
  const hostingRevenue = hostingActive.length * HOSTING_PRICE_EUR;

  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();
  const currentMonthRevenue = calculateRevenueForMonth(tasks, currentMonth, currentYear);
  const lastMonthInfo = getLastMonthInfo(currentMonth, currentYear);
  const lastMonthRevenue = calculateRevenueForMonth(tasks, lastMonthInfo.month, lastMonthInfo.year);
  const revenueChange = calculateRevenueChange(currentMonthRevenue, lastMonthRevenue);

  const metrics = calculateDashboardMetrics();

  return {
    mrr: metrics.mrr,
    totalRevenue,
    pendingRevenue,
    hostingRevenue,
    hostingActive: hostingActive.length,
    currentMonthRevenue,
    revenueChange,
    pendingCount: pendingTasks.length,
    paidCount: paidTasks.length
  };
}

function renderFinancial() {
  if (!DOM.financialContainer) return;

  DOM.financialContainer.classList.remove('hidden');
  DOM.financialContainer.classList.add('active');
  DOM.financialContainer.style.display = 'block';

  const tasks = AppState.getTasks();

  if (!tasks || tasks.length === 0) {
    DOM.financialContainer.innerHTML = '<div style="padding: 2rem; text-align: center; color: var(--text-muted);">Nenhum projeto cadastrado</div>';
    return;
  }

  const financialMetrics = calculateFinancialMetrics(tasks);

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
          <div class="stat-card-value" style="color: var(--success);">${formatCurrency(financialMetrics.mrr)}</div>
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
          <div class="stat-card-value">${formatCurrency(financialMetrics.totalRevenue)}</div>
        </div>

        <div class="stat-card">
          <div class="stat-card-header">
            <span class="stat-card-label">Receita do Mês</span>
            <div class="stat-card-icon primary">
              <i class="fa-solid fa-calendar"></i>
            </div>
          </div>
          <div class="stat-card-value">${formatCurrency(financialMetrics.currentMonthRevenue)}</div>
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
          <div class="stat-card-value" style="color: var(--danger);">${formatCurrency(financialMetrics.pendingRevenue)}</div>
          <div class="stat-card-change">
            <span>${financialMetrics.pendingCount} projetos</span>
          </div>
        </div>
      </div>

      <!-- Projects Table -->
      <div class="dashboard-card">
        <div class="dashboard-card-header">
          <h3 class="dashboard-card-title">Projetos</h3>
        </div>
        <div class="financial-table-container">
          <table class="financial-table" role="table" aria-label="Tabela de projetos financeiros">
            <thead>
              <tr>
                <th scope="col">Cliente</th>
                <th scope="col">Valor</th>
                <th scope="col">Status</th>
                <th scope="col">Hosting</th>
              </tr>
            </thead>
            <tbody id="projectsTable">
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  setTimeout(() => {
    renderProjectsTable(tasks);
  }, 50);
}

function renderProjectsTable(tasks) {
  const tableBody = document.getElementById('projectsTable');
  if (!tableBody) return;

  if (tasks.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 2rem; color: var(--text-muted);">Nenhum projeto</td></tr>';
    return;
  }

  const sortedTasks = [...tasks].sort((a, b) => {
    const priceA = parseFloat(a.price) || 0;
    const priceB = parseFloat(b.price) || 0;
    return priceB - priceA;
  });

  tableBody.innerHTML = '';
  sortedTasks.forEach(task => {
    const formattedPrice = formatCurrency(task.price);
    const paymentStatus = task.payment_status === PAYMENT_STATUS_PAID
      ? '<span style="color: var(--success);"><i class="fa-solid fa-check"></i> Pago</span>'
      : task.payment_status === PAYMENT_STATUS_PARTIAL
        ? '<span style="color: var(--warning);">50%</span>'
        : '<span style="color: var(--danger);">Pendente</span>';
    let hosting = '';
    if (task.hosting === HOSTING_YES) {
      hosting = '<span style="color: var(--success);"><i class="fa-solid fa-check"></i></span>';
    } else if (task.hosting === HOSTING_LATER) {
      hosting = '<span style="color: var(--warning);"><i class="fa-solid fa-clock"></i></span>';
    }

    const row = document.createElement('tr');
    row.style.cursor = 'pointer';
    row.setAttribute('role', 'button');
    row.setAttribute('tabindex', '0');
    row.setAttribute('aria-label', `Projeto ${task.client}, ${formattedPrice}, ${task.payment_status}`);
    row.addEventListener('click', () => openModal(task));
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openModal(task);
      }
    });
    row.innerHTML = `
      <td><strong>${task.client}</strong></td>
      <td>${formattedPrice}</td>
      <td>${paymentStatus}</td>
      <td>${hosting}</td>
    `;
    tableBody.appendChild(row);
  });
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
  const tasks = AppState.getTasks();
  const metrics = calculateDashboardMetrics();
  const financialMetrics = calculateFinancialMetrics(tasks);
  const monthlyRevenue = calculateMonthlyRevenue(tasks, 12);
  const projectedRevenue = calculateProjectedRevenue(tasks, 12);

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
    'Cliente,Valor,Status Pagamento,Hosting',
    ...tasks.map(t => {
      const hosting = getHostingDisplayText(t.hosting);
      return `"${t.client}",€${(parseFloat(t.price) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })},"${t.payment_status}","${hosting}"`;
    })
  ].join('\n');

  downloadCSV(csv, `vibeos-financial-${new Date().toISOString().split('T')[0]}.csv`);
}
