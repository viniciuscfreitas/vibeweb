// Kanban Board Logic

function updateHeaderStats() {
  if (!DOM.dashboardContainer || !DOM.financialContainer) return;

  if (DOM.dashboardContainer.classList.contains('active')) {
    const metrics = calculateDashboardMetrics();
    renderDashboardHeader(metrics);
  } else if (DOM.financialContainer.classList.contains('active')) {
    const metrics = calculateDashboardMetrics();
    renderFinancialHeader(metrics);
  } else {
    renderProjectsHeader();
  }
}

function renderBoard() {
  if (!DOM.boardGrid || !DOM.searchInput) {
    console.warn('[Kanban] DOM elements not ready:', { boardGrid: !!DOM.boardGrid, searchInput: !!DOM.searchInput });
    return;
  }

  const searchTerm = DOM.searchInput.value.toLowerCase();
  const fragment = document.createDocumentFragment();
  const tasks = AppState.getTasks();
  const hasColumnFilter = AppState.filterByColumnId !== undefined && AppState.filterByColumnId !== null;
  const hasCustomFilter = AppState.filterByCustomType !== undefined && AppState.filterByCustomType !== null;
  const hasAnyFilter = hasColumnFilter || hasCustomFilter;

  if (hasAnyFilter) {
    DOM.boardGrid.classList.add('filtered-view');
  } else {
    DOM.boardGrid.classList.remove('filtered-view');
  }

  COLUMNS.forEach(col => {
    let shouldShowColumn = true;
    if (hasColumnFilter) {
      shouldShowColumn = col.id === AppState.filterByColumnId;
    } else if (hasCustomFilter) {
      if (AppState.filterByCustomType === 'activeJobs') {
        shouldShowColumn = col.id === 1 || col.id === 2;
      } else if (AppState.filterByCustomType === 'pendingPayments') {
        shouldShowColumn = true;
      }
    }

    if (!shouldShowColumn) {
      return;
    }

    let tasksInCol = tasks.filter(t => t.col_id === col.id);

    if (hasCustomFilter && AppState.filterByCustomType === 'pendingPayments') {
      tasksInCol = tasksInCol.filter(t => t.payment_status === PAYMENT_STATUS_PENDING);
    }

    const colTasks = tasksInCol.filter(t => {
      if (!searchTerm) return true;

      const clientMatches = t.client.toLowerCase().includes(searchTerm);
      const hasDomain = !!t.domain;
      const domainMatches = hasDomain && t.domain.toLowerCase().includes(searchTerm);

      return clientMatches || domainMatches;
    }).sort((a, b) => (a.order_position || 0) - (b.order_position || 0));

    const colDiv = document.createElement('div');
    colDiv.className = 'column';
    colDiv.setAttribute('role', 'region');
    colDiv.setAttribute('aria-label', `Coluna ${col.name} com ${colTasks.length} ${colTasks.length === 1 ? 'projeto' : 'projetos'}`);
    if (hasAnyFilter) {
      colDiv.classList.add('column-expanded');
    }
    colDiv.innerHTML = `
      <div class="col-header">
        <h2 class="col-title">${col.name}</h2>
        <span class="col-count" aria-label="${colTasks.length} ${colTasks.length === 1 ? 'projeto' : 'projetos'}">${colTasks.length}</span>
      </div>
      <div class="col-body" data-col-id="${col.id}" role="group" aria-label="Projetos em ${col.name}">
      </div>
    `;

    const bodyDiv = colDiv.querySelector('.col-body');
    bodyDiv.addEventListener('dragover', handleDragOver);
    bodyDiv.addEventListener('drop', handleDrop);
    bodyDiv.addEventListener('dragleave', handleDragLeave);

    colTasks.forEach(task => {
      const card = createCardElement(task, hasColumnFilter);
      if (card) {
        bodyDiv.appendChild(card);
      }
    });

    fragment.appendChild(colDiv);
  });

  DOM.boardGrid.innerHTML = '';
  DOM.boardGrid.appendChild(fragment);
  updateHeaderStats();
  updateDeadlineDisplays();
}

function createCardElement(task, isExpanded = false) {
  if (!task) return null;

  const el = document.createElement('div');
  el.className = 'card';
  el.setAttribute('role', 'button');
  el.setAttribute('tabindex', '0');
  el.setAttribute('aria-label', `Projeto ${task.client}, ${formatPrice(task.price)}`);
  if (isExpanded) {
    el.classList.add('card-expanded');
  }
  el.draggable = true;
  el.dataset.id = task.id;
  el.dataset.colId = task.col_id;
  el.dataset.deadlineTimestamp = task.deadline_timestamp || '';

  const formattedPrice = formatPrice(task.price);
  const deadlineDisplay = formatDeadlineDisplay(task.deadline, task.deadline_timestamp);
  const deadlineHtml = deadlineDisplay ? `<span class="deadline" data-deadline="${task.deadline}" data-timestamp="${task.deadline_timestamp || ''}">${deadlineDisplay}</span>` : '';

  const badgeHtml = task.type ? `<span class="card-badge">${task.type}</span>` : '';

  if (isExpanded) {
    const stackHtml = task.stack ? `<div class="card-detail-item"><span class="card-detail-label">Stack:</span><span class="card-detail-value">${task.stack}</span></div>` : '';
    const domainHtml = task.domain ? `<div class="card-detail-item"><span class="card-detail-label">Domínio:</span><span class="card-detail-value">${task.domain}</span></div>` : '';
    const contactHtml = task.contact ? `<div class="card-detail-item"><span class="card-detail-label">Contato:</span><span class="card-detail-value">${task.contact}</span></div>` : '';
    const paymentHtml = task.payment_status ? `<div class="card-detail-item"><span class="card-detail-label">Pagamento:</span><span class="card-detail-value">${task.payment_status}</span></div>` : '';
    let hostingDisplay = 'Não';
    if (task.hosting === HOSTING_YES) {
      hostingDisplay = 'Sim';
    } else if (task.hosting === HOSTING_LATER) {
      hostingDisplay = 'Depois';
    }
    const hostingHtml = task.hosting ? `<div class="card-detail-item"><span class="card-detail-label">Hosting:</span><span class="card-detail-value">${hostingDisplay}</span></div>` : '';
    const descriptionHtml = task.description ? `<div class="card-description"><span class="card-detail-label">Descrição:</span><p class="card-detail-value">${task.description}</p></div>` : '';

    el.innerHTML = `
      <div class="card-header">
        <h4 class="card-title">${task.client}</h4>
        ${badgeHtml}
      </div>
      <div class="card-expanded-content">
        <div class="card-details">
          ${stackHtml}
          ${domainHtml}
          ${contactHtml}
          ${paymentHtml}
          ${hostingHtml}
        </div>
        ${descriptionHtml}
        <div class="card-meta">
          <span class="price">${formattedPrice}</span>
          ${deadlineHtml}
        </div>
      </div>
    `;
  } else {
    const stackHtml = task.stack ? `<div class="card-stack">${task.stack}</div>` : '';
    const taskColId = task.col_id || 0;
    const domainHtml = task.domain && taskColId >= 1 ? `<div class="card-domain">${task.domain}</div>` : '';
    const infoHtml = (stackHtml || domainHtml) ? `<div class="card-info">${stackHtml}${domainHtml}</div>` : '';

    el.innerHTML = `
      <div class="card-header">
        <h3 class="card-title">${task.client}</h3>
        ${badgeHtml}
      </div>
      ${infoHtml}
      <div class="card-meta">
        <span class="price">${formattedPrice}</span>
        ${deadlineHtml}
      </div>
    `;
  }

  el.addEventListener('dragstart', handleDragStart);
  el.addEventListener('click', () => openModal(task));
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openModal(task);
    }
  });

  return el;
}

// Update deadline displays - lightweight operation
// Only updates visible deadline elements, not entire board
function updateDeadlineDisplays() {
  // Only query visible cards (performance: avoid querying hidden elements)
  const cards = document.querySelectorAll('.card:not(.hidden) .deadline[data-deadline][data-timestamp]');
  cards.forEach(deadlineEl => {
    const deadline = deadlineEl.dataset.deadline;
    const timestamp = deadlineEl.dataset.timestamp ? parseInt(deadlineEl.dataset.timestamp) : null;
    if (timestamp) {
      const display = formatDeadlineDisplay(deadline, timestamp);
      if (display) {
        deadlineEl.textContent = display;

        if (display === DEADLINE_OVERDUE) {
          deadlineEl.classList.add('overdue');
        } else {
          deadlineEl.classList.remove('overdue');
        }
      }
    }
  });
}

function handleDragStart(e) {
  e.stopPropagation();
  const taskId = parseInt(this.dataset.id);
  AppState.draggedTaskId = taskId;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', taskId.toString());
  setTimeout(() => this.classList.add('card-dragging'), 0);
  AppState.log('Drag started', { taskId });
}

function calculateInsertIndex(cards, mouseY) {
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    const rect = card.getBoundingClientRect();
    const cardMiddleY = rect.top + rect.height / 2;
    if (mouseY < cardMiddleY) {
      return i;
    }
  }
  return cards.length;
}

function handleDragOver(e) {
  e.preventDefault();
  e.stopPropagation();
  e.dataTransfer.dropEffect = 'move';

  const colBody = e.currentTarget;
  const cards = Array.from(colBody.querySelectorAll('.card:not(.card-dragging)'));
  const insertIndex = calculateInsertIndex(cards, e.clientY);

  cards.forEach(card => card.classList.remove('card-over'));
  if (cards[insertIndex]) {
    cards[insertIndex].classList.add('card-over');
  }
}

function handleDragLeave(e) {
  const colBody = e.currentTarget;
  const cards = colBody.querySelectorAll('.card');
  cards.forEach(card => card.classList.remove('card-over'));
}

function handleDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();

  const colBody = e.currentTarget;
  if (!colBody || !colBody.dataset.colId) {
    AppState.log('Drop failed: invalid column');
    return false;
  }

  const targetColId = parseInt(colBody.dataset.colId);
  if (isNaN(targetColId)) {
    AppState.log('Drop failed: invalid column ID');
    return false;
  }

  const taskId = parseInt(e.dataTransfer.getData('text/plain'));
  if (isNaN(taskId)) {
    AppState.log('Drop failed: invalid task ID');
    return false;
  }

  const tasks = AppState.getTasks();
  const task = tasks.find(t => t.id === taskId);

  if (!task) {
    AppState.log('Drop failed: task not found', { taskId });
    return false;
  }

  const cards = Array.from(colBody.querySelectorAll('.card:not(.card-dragging)'));
  const insertIndex = calculateInsertIndex(cards, e.clientY);

  // Backup state for rollback
  const previousState = [...tasks];

  const tasksWithoutMoved = tasks.filter(t => t.id !== taskId);
  const tasksInOtherCols = tasksWithoutMoved.filter(t => t.col_id !== targetColId);
  const tasksInTargetCol = tasksWithoutMoved
    .filter(t => t.col_id === targetColId)
    .sort((a, b) => (a.order_position || 0) - (b.order_position || 0));

  const updatedTask = { ...task, col_id: targetColId };

  tasksInTargetCol.splice(insertIndex, 0, updatedTask);
  tasksInTargetCol.forEach((t, idx) => {
    t.order_position = idx;
  });

  const finalTasks = [...tasksInOtherCols, ...tasksInTargetCol];

  // Optimistic update: Update UI immediately for better UX
  // If API call fails, we rollback to previousState
  // This gives instant feedback while maintaining data consistency
  AppState.setTasks(finalTasks);
  cards.forEach(card => card.classList.remove('card-over'));
  renderBoard();

  // Call API in background - update server state
  api.moveTask(taskId, targetColId, insertIndex)
    .then((updatedTaskFromServer) => {
      // Success: Update with server response (normalize to ensure defaults)
      const normalizedTask = normalizeTasksData([updatedTaskFromServer])[0];
      const currentTasks = AppState.getTasks();
      const updatedTasks = currentTasks.map(t => t.id === taskId ? normalizedTask : t);
      AppState.setTasks(updatedTasks);
      renderBoard();
      AppState.log('Task moved successfully', { taskId, targetColId: targetColId, insertIndex });
    })
    .catch((error) => {
      // Error: Rollback to previous state
      console.error('[Kanban] Failed to move task:', {
        error: error.message,
        stack: error.stack,
        taskId,
        targetColId
      });
      AppState.setTasks(previousState);
      renderBoard();
      AppState.log('Task move failed, rolled back', { taskId, error: error.message });
      // Show user-friendly error message
      alert('Erro ao mover tarefa: ' + (error.message || 'Tente novamente'));
    });

  return false;
}

function renderProjectsHeader() {
  if (!DOM.headerInfo) return;

  const tasks = AppState.getTasks();
  if (!Array.isArray(tasks)) return;

  const searchTerm = DOM.searchInput ? DOM.searchInput.value.toLowerCase() : '';
  const filteredTasks = tasks.filter(t => {
    if (!searchTerm) return true;
    if (!t || !t.client) return false;
    const clientMatches = t.client.toLowerCase().includes(searchTerm);
    const hasDomain = !!t.domain;
    const domainMatches = hasDomain && t.domain.toLowerCase().includes(searchTerm);
    return clientMatches || domainMatches;
  });
  const totalValue = filteredTasks.reduce((sum, t) => sum + (parseFloat(t.price) || 0), 0);

  DOM.headerInfo.innerHTML = `
    <div class="header-stat">
      <span class="header-stat-label">Total:</span>
      <span class="header-stat-value">${formatCurrency(totalValue)}</span>
    </div>
  `;
}

function filterKanbanByStatus(columnId) {
  if (!DOM.dashboardContainer) return;

  const wasOnDashboard = DOM.dashboardContainer.classList.contains('active');

  if (wasOnDashboard) {
    fadeOutDashboardContainer();

    setTimeout(() => {
      switchView('projects');
      AppState.filterByColumnId = columnId;
      renderBoard();
      showFilterIndicator(columnId);
      fadeInBoardContainer();

      AppState.log('Filtered kanban by status', { columnId });
    }, 150);
  } else {
    AppState.filterByColumnId = columnId;
    renderBoard();
    showFilterIndicator(columnId);
    AppState.log('Filtered kanban by status', { columnId });
  }
}

function filterKanbanByActiveJobs() {
  switchView('projects');
  AppState.filterByColumnId = null;
  AppState.filterByCustomType = 'activeJobs';
  renderBoard();
  showFilterIndicatorCustom('Jobs Ativos');
  AppState.log('Filtered kanban by active jobs');
}

function filterKanbanByPendingPayments() {
  switchView('projects');
  AppState.filterByColumnId = null;
  AppState.filterByCustomType = 'pendingPayments';
  renderBoard();
  showFilterIndicatorCustom('Pagamentos Pendentes');
  AppState.log('Filtered kanban by pending payments');
}

function clearKanbanFilter() {
  AppState.filterByColumnId = null;
  AppState.filterByCustomType = null;
  renderBoard();
  hideFilterIndicator();
  AppState.log('Cleared kanban filter');
}

function showFilterIndicator(columnId) {
  const column = COLUMNS.find(col => col.id === columnId);
  if (!column) return;

  let filterIndicator = document.getElementById('filterIndicator');
  if (!filterIndicator) {
    filterIndicator = document.createElement('div');
    filterIndicator.id = 'filterIndicator';
    filterIndicator.className = 'filter-indicator';
    filterIndicator.innerHTML = `
      <span>Filtrado: ${column.name}</span>
      <button class="btn-text" onclick="clearKanbanFilter()" style="margin-left: 0.5rem;">
        <i class="fa-solid fa-xmark"></i>
      </button>
    `;
    const headerInfo = document.querySelector('.header-info');
    if (headerInfo) {
      headerInfo.appendChild(filterIndicator);
    }
  } else {
    filterIndicator.querySelector('span').textContent = `Filtrado: ${column.name}`;
  }
  filterIndicator.style.display = 'flex';
}

function showFilterIndicatorCustom(filterName) {
  let filterIndicator = document.getElementById('filterIndicator');
  if (!filterIndicator) {
    filterIndicator = document.createElement('div');
    filterIndicator.id = 'filterIndicator';
    filterIndicator.className = 'filter-indicator';
    filterIndicator.innerHTML = `
      <span>Filtrado: ${filterName}</span>
      <button class="btn-text" onclick="clearKanbanFilter()" style="margin-left: 0.5rem;">
        <i class="fa-solid fa-xmark"></i>
      </button>
    `;
    const headerInfo = document.querySelector('.header-info');
    if (headerInfo) {
      headerInfo.appendChild(filterIndicator);
    }
  } else {
    filterIndicator.querySelector('span').textContent = `Filtrado: ${filterName}`;
  }
  filterIndicator.style.display = 'flex';
}

function hideFilterIndicator() {
  const filterIndicator = document.getElementById('filterIndicator');
  if (filterIndicator) {
    filterIndicator.style.display = 'none';
  }
}

function exportKanbanData() {
  const tasks = AppState.getTasks();
  const csv = 'Cliente,Contato,Domínio,Stack,Tipo,Preço,Status Pagamento,Deadline,Hosting\n' +
    tasks.map(t =>
      `"${t.client || ''}","${t.contact || ''}","${t.domain || ''}","${t.stack || ''}","${t.type || ''}",${t.price || 0},"${t.payment_status || ''}","${t.deadline || ''}","${t.hosting || 'não'}"`
    ).join('\n');
  downloadCSV(csv, `vibeos-kanban-${new Date().toISOString().split('T')[0]}.csv`);
}
