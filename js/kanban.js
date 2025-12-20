// Kanban Board Logic
// URL_PATTERN is defined in forms.js (loaded before this file)

const COLUMNS_MAP = new Map(COLUMNS.map(col => [col.id, col]));
let sortableInstances = [];

function updateHeaderStats() {
  if (!DOM.dashboardContainer || !DOM.financialContainer) return;

  if (DOM.dashboardContainer.classList.contains('active')) {
    const metrics = AppState.getCachedMetrics(() => calculateDashboardMetrics());
    renderDashboardHeader(metrics);
  } else if (DOM.financialContainer.classList.contains('active')) {
    const metrics = AppState.getCachedMetrics(() => calculateDashboardMetrics());
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

  currentTimestamp = Date.now();

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

  const tasksByColumn = new Map();
  COLUMNS.forEach(col => {
    tasksByColumn.set(col.id, []);
  });

  tasks.forEach(task => {
    const colId = task.col_id || 0;

    if (hasColumnFilter && colId !== AppState.filterByColumnId) {
      return;
    }

    if (hasCustomFilter) {
      if (AppState.filterByCustomType === 'activeJobs' && colId !== 1 && colId !== 2) {
        return;
      }
      if (AppState.filterByCustomType === 'pendingPayments' && task.payment_status !== PAYMENT_STATUS_PENDING) {
        return;
      }
    }

    if (searchTerm) {
      const clientMatches = task.client && task.client.toLowerCase().includes(searchTerm);
      const domainMatches = task.domain && task.domain.toLowerCase().includes(searchTerm);
      if (!clientMatches && !domainMatches) {
        return;
      }
    }

    if (tasksByColumn.has(colId)) {
      tasksByColumn.get(colId).push(task);
    }
  });

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

    const colTasks = tasksByColumn.get(col.id) || [];
    colTasks.sort((a, b) => (a.order_position || 0) - (b.order_position || 0));

    const colDiv = document.createElement('div');
    colDiv.className = 'column';
    colDiv.setAttribute('role', 'region');
    colDiv.setAttribute('aria-label', `Coluna ${col.name} com ${colTasks.length} ${colTasks.length === 1 ? 'projeto' : 'projetos'}`);
    if (hasAnyFilter) {
      colDiv.classList.add('column-expanded');
    }
    colDiv.innerHTML = `
      <div class="col-header">
        <h2 class="col-title">${escapeHtml(col.name)}</h2>
        <span class="col-count ${colTasks.length > 0 ? 'col-count-active' : ''}" aria-label="${colTasks.length} ${colTasks.length === 1 ? 'projeto' : 'projetos'}">${colTasks.length}</span>
      </div>
      <div class="col-body" data-col-id="${col.id}" role="group" aria-label="Projetos em ${escapeHtml(col.name)}">
      </div>
    `;

    const bodyDiv = colDiv.querySelector('.col-body');

    if (colTasks.length === 0) {
      const emptyState = document.createElement('div');
      emptyState.className = 'empty-state';
      emptyState.innerHTML = `
        <div class="empty-state-icon"><i class="fa-solid fa-layer-group" aria-hidden="true"></i></div>
        <div class="empty-state-text">Nenhum projeto aqui</div>
        ${col.id === 0 ? '<button class="btn-text empty-state-action" id="emptyStateCreateBtn">Criar primeiro projeto</button>' : ''}
      `;
      bodyDiv.appendChild(emptyState);

      if (col.id === 0) {
        const createBtn = emptyState.querySelector('#emptyStateCreateBtn');
        if (createBtn) {
          createBtn.addEventListener('click', () => {
            if (DOM.btnNewProject && DOM.btnNewProject.offsetParent !== null) {
              DOM.btnNewProject.click();
            } else if (typeof openModal === 'function') {
              openModal();
            }
          });
        }
      }
    } else {
      colTasks.forEach(task => {
        const card = createCardElement(task, hasColumnFilter, currentTimestamp);
        if (card) {
          bodyDiv.appendChild(card);
        }
      });
    }

    fragment.appendChild(colDiv);
  });

  DOM.boardGrid.innerHTML = '';
  DOM.boardGrid.appendChild(fragment);
  updateHeaderStats();
  updateDeadlineDisplays();
  initializeSortable();
}

let currentTimestamp = Date.now();

function buildActionButtonsHtml(task) {
  if (!task.contact) return '';

  const contact = task.contact.trim();
  let whatsappHtml = '';
  let emailHtml = '';

  // Validar e extrair telefone (não aceitar @username)
  if (!contact.startsWith('@')) {
    const phoneMatch = contact.replace(/\D/g, '');
    if (phoneMatch.length >= 10) {
      const colName = COLUMNS_MAP.get(task.col_id)?.name || 'em andamento';
      const message = `Olá! Segue o status do projeto ${task.client}: ${colName}.`;
      const whatsappUrl = `https://wa.me/${phoneMatch}?text=${encodeURIComponent(message)}`;
      whatsappHtml = `<a href="${whatsappUrl}" class="action-btn whatsapp" target="_blank" aria-label="Abrir WhatsApp" onclick="event.stopPropagation();">WhatsApp</a>`;
    }
  }

  // Validar e extrair email usando EMAIL_PATTERN de forms.js
  const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (EMAIL_PATTERN.test(contact)) {
    const emailUrl = `mailto:${contact}?subject=${encodeURIComponent(`Status do Projeto ${task.client}`)}`;
    emailHtml = `<a href="${emailUrl}" class="action-btn email" aria-label="Enviar email" onclick="event.stopPropagation();">Email</a>`;
  }

  if (!whatsappHtml && !emailHtml) return '';

  return `<div class="card-actions">${whatsappHtml}${emailHtml}</div>`;
}

function createCardElement(task, isExpanded = false, now = null) {
  if (!task) return null;

  if (now === null) {
    now = Date.now();
  }

  const el = document.createElement('div');
  el.className = 'card';
  el.setAttribute('role', 'button');
  el.setAttribute('tabindex', '0');
  const deadlineInfo = task.deadline ? `, prazo: ${task.deadline}` : '';
  const colName = COLUMNS_MAP.get(task.col_id)?.name || '';
  el.setAttribute('aria-label', `Projeto ${task.client}, ${formatPrice(task.price)}${deadlineInfo}, coluna: ${colName}. Use setas esquerda e direita para mover entre colunas, Enter ou Espaço para editar`);
  if (isExpanded) {
    el.classList.add('card-expanded');
  }
  el.dataset.id = task.id;
  el.dataset.colId = task.col_id;
  el.dataset.deadlineTimestamp = task.deadline_timestamp || '';
  if (task.uptime_status) {
    el.dataset.uptimeStatus = task.uptime_status;
  }

  if (isTaskUrgent(task, now)) {
    el.dataset.urgent = 'true';
  }

  const formattedPrice = formatPrice(task.price);
  const deadlineDisplay = formatDeadlineDisplay(task.deadline, task.deadline_timestamp);
  const deadlineHtml = deadlineDisplay ? `<span class="deadline" data-deadline="${escapeHtml(task.deadline || '')}" data-timestamp="${task.deadline_timestamp || ''}">${escapeHtml(deadlineDisplay)}</span>` : '';

  const badgeHtml = task.type ? `<span class="card-badge">${escapeHtml(task.type)}</span>` : '';

  if (isExpanded) {
    const stackHtml = task.stack ? `<div class="card-detail-item"><span class="card-detail-label">Stack:</span><span class="card-detail-value">${escapeHtml(task.stack)}</span></div>` : '';
    const domainHtml = task.domain ? `<div class="card-detail-item"><span class="card-detail-label">Domínio:</span><span class="card-detail-value">${escapeHtml(task.domain)}</span></div>` : '';
    const contactHtml = task.contact ? `<div class="card-detail-item"><span class="card-detail-label">Contato:</span><span class="card-detail-value">${escapeHtml(task.contact)}</span></div>` : '';
    const paymentHtml = task.payment_status ? `<div class="card-detail-item"><span class="card-detail-label">Pagamento:</span><span class="card-detail-value">${escapeHtml(task.payment_status)}</span></div>` : '';
    let hostingDisplay = 'Não';
    if (task.hosting === HOSTING_YES) {
      hostingDisplay = 'Sim';
    } else if (task.hosting === HOSTING_LATER) {
      hostingDisplay = 'Depois';
    }
    const hostingHtml = task.hosting ? `<div class="card-detail-item"><span class="card-detail-label">Hosting:</span><span class="card-detail-value">${escapeHtml(hostingDisplay)}</span></div>` : '';

    // Uptime status badge
    let uptimeBadgeHtml = '';
    if (task.domain && task.uptime_status === 'down') {
      uptimeBadgeHtml = '<span class="uptime-badge offline" title="Site offline">OFFLINE</span>';
    } else if (task.domain && task.uptime_status === 'up') {
      uptimeBadgeHtml = '<span class="uptime-badge online" title="Site online">ONLINE</span>';
    }

    const descriptionHtml = task.description ? `<div class="card-description"><span class="card-detail-label">Descrição:</span><p class="card-detail-value">${escapeHtml(task.description)}</p></div>` : '';

    // Parse and render assets links
    let assetsHtml = '';
    if (task.assets_link) {
      try {
        const links = JSON.parse(task.assets_link);
        if (Array.isArray(links) && links.length > 0) {
          // Validate URLs before rendering
          const validLinks = links.filter(link => URL_PATTERN.test(link));
          if (validLinks.length > 0) {
            if (validLinks.length === 1) {
              assetsHtml = `<div class="card-assets"><a href="${escapeHtml(validLinks[0])}" target="_blank" class="assets-link" onclick="event.stopPropagation();" aria-label="Abrir anexo">🔗 Anexo</a></div>`;
            } else {
              assetsHtml = `<div class="card-assets"><span class="assets-link-multiple" title="${validLinks.join(', ')}">🔗 ${validLinks.length} anexos</span></div>`;
            }
          }
        }
      } catch (e) {
        // If not JSON, validate if it's a valid URL before treating as single link
        if (URL_PATTERN.test(task.assets_link)) {
          assetsHtml = `<div class="card-assets"><a href="${escapeHtml(task.assets_link)}" target="_blank" class="assets-link" onclick="event.stopPropagation();" aria-label="Abrir anexo">🔗 Anexo</a></div>`;
        }
      }
    }

    const actionButtonsHtml = buildActionButtonsHtml(task);

    el.innerHTML = `
      <div class="card-header">
        <h4 class="card-title">${escapeHtml(task.client)}</h4>
        <div style="display: flex; gap: 0.5rem; align-items: center;">
          ${badgeHtml}
          ${uptimeBadgeHtml}
        </div>
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
        ${assetsHtml}
        ${actionButtonsHtml}
        <div class="card-meta">
          <span class="price">${formattedPrice}</span>
          ${deadlineHtml}
        </div>
      </div>
    `;
  } else {
    const stackHtml = task.stack ? `<div class="card-stack">${escapeHtml(task.stack)}</div>` : '';
    const taskColId = task.col_id || 0;
    const domainHtml = task.domain && taskColId >= 1 ? `<div class="card-domain">${escapeHtml(task.domain)}</div>` : '';
    const infoHtml = (stackHtml || domainHtml) ? `<div class="card-info">${stackHtml}${domainHtml}</div>` : '';

    // Uptime badge for collapsed card
    let uptimeBadgeCollapsed = '';
    if (task.domain && task.uptime_status === 'down') {
      uptimeBadgeCollapsed = '<span class="uptime-badge offline" title="Site offline">OFF</span>';
    }

    el.innerHTML = `
      <div class="card-header">
        <h3 class="card-title">${escapeHtml(task.client)}</h3>
        <div style="display: flex; gap: 0.5rem; align-items: center;">
          ${badgeHtml}
          ${uptimeBadgeCollapsed}
        </div>
      </div>
      ${infoHtml}
      <div class="card-meta">
        <span class="price">${formattedPrice}</span>
        ${deadlineHtml}
      </div>
    `;
  }

  el.addEventListener('click', () => openModal(task));
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openModal(task);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      // Keyboard navigation for moving cards between columns
      e.preventDefault();
      handleKeyboardMove(e, task, el);
    }
  });

  return el;
}

function updateDeadlineDisplays() {
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

function initializeSortable() {
  if (typeof Sortable === 'undefined') {
    console.warn('[Kanban] SortableJS not loaded');
    return;
  }

  sortableInstances.forEach(instance => instance.destroy());
  sortableInstances = [];

  const columnBodies = document.querySelectorAll('.col-body[data-col-id]');
  
  columnBodies.forEach(colBody => {
    const sortable = Sortable.create(colBody, {
      group: 'kanban-columns',
      animation: 150,
      ghostClass: 'sortable-ghost',
      dragClass: 'sortable-drag',
      chosenClass: 'sortable-chosen',
      handle: '.card',
      filter: '.empty-state',
      forceFallback: false,
      fallbackOnBody: true,
      swapThreshold: 0.65,
      onAdd: function(evt) {
        const emptyState = evt.to.querySelector('.empty-state');
        if (emptyState) {
          emptyState.remove();
        }
      },
      onEnd: function(evt) {
        handleSortableEnd(evt);
      }
    });
    sortableInstances.push(sortable);
  });
}

function handleSortableEnd(evt) {
  const { item, to, from, newIndex, oldIndex } = evt;
  
  if (!item || !to || newIndex === undefined || newIndex === null) {
    AppState.log('Sortable: invalid event data', { item: !!item, to: !!to, newIndex });
    return;
  }

  if (to === from && newIndex === oldIndex) {
    return;
  }

  const taskId = parseInt(item.dataset.id);
  if (isNaN(taskId)) {
    AppState.log('Sortable: invalid task ID');
    return;
  }

  const targetColId = parseInt(to.dataset.colId);
  if (isNaN(targetColId) || targetColId < 0 || targetColId > 3) {
    NotificationManager.error('Coluna inválida');
    return;
  }

  const tasks = AppState.getTasks();
  const task = tasks.find(t => t.id === taskId);
  if (!task) {
    AppState.log('Sortable: task not found', { taskId });
    return;
  }

  const previousState = [...tasks];
  const insertIndex = newIndex;

  api.moveTask(taskId, targetColId, insertIndex)
    .then((updatedTaskFromServer) => {
      if (typeof window.markLocalTaskAction === 'function') {
        window.markLocalTaskAction(taskId);
      }

      const normalizedTask = normalizeTasksData([updatedTaskFromServer])[0];
      const currentTasks = AppState.getTasks();
      const updatedTasks = currentTasks.map(t => t.id === taskId ? normalizedTask : t);
      AppState.setTasks(updatedTasks);
      renderBoard();

      const colName = COLUMNS_MAP.get(targetColId)?.name || 'Coluna';
      NotificationManager.info(`Projeto ${task.client} movido para ${colName}`, 2000);
      AppState.log('Task moved successfully', { taskId, targetColId, insertIndex });
    })
    .catch((error) => {
      console.error('[Kanban] Failed to move task:', {
        error: error.message,
        taskId,
        targetColId
      });
      AppState.setTasks(previousState);
      renderBoard();
      NotificationManager.error('Erro ao mover tarefa: ' + (error.message || 'Tente novamente'));
      AppState.log('Task move failed, rolled back', { taskId, error: error.message });
    });
}

function handleKeyboardMove(e, task, cardElement) {
  const currentColId = task.col_id || 0;
  let newColId = currentColId;

  if (e.key === 'ArrowLeft' && currentColId > 0) {
    newColId = currentColId - 1;
  } else if (e.key === 'ArrowRight' && currentColId < 3) {
    newColId = currentColId + 1;
  } else {
    return; // Cannot move in this direction
  }

  const tasks = AppState.getTasks();
  const tasksInTargetCol = tasks
    .filter(t => t.col_id === newColId && t.id !== task.id)
    .sort((a, b) => (a.order_position || 0) - (b.order_position || 0));

  const newOrderPosition = tasksInTargetCol.length;

  // Update task position
  api.moveTask(task.id, newColId, newOrderPosition)
    .then((updatedTask) => {
      if (typeof window.markLocalTaskAction === 'function') {
        window.markLocalTaskAction(task.id);
      }

      const normalizedTask = normalizeTasksData([updatedTask])[0];
      const updatedTasks = tasks.map(t => t.id === task.id ? normalizedTask : t);
      AppState.setTasks(updatedTasks);
      renderBoard();

      // Announce move to screen readers
      const colName = COLUMNS_MAP.get(newColId)?.name || 'Coluna';
      NotificationManager.info(`Projeto ${task.client} movido para ${colName}`, 2000);

      // Focus the moved card
      setTimeout(() => {
        const movedCard = document.querySelector(`[data-id="${task.id}"]`);
        if (movedCard) {
          movedCard.focus();
        }
      }, 100);
    })
    .catch((error) => {
      console.error('[Keyboard Move] Error:', error);
      NotificationManager.error('Erro ao mover projeto. Tente novamente.');
    });
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
  const column = COLUMNS_MAP.get(columnId);
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
