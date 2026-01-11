// Kanban Board Logic
// URL_PATTERN is defined in forms.js (loaded before this file)

const COLUMNS_MAP = new Map(COLUMNS.map(col => [col.id, col]));
let sortableInstances = [];

function updateHeaderStats() {
  // Add null checks to prevent errors
  if (!DOM.dashboardContainer || !DOM.financialContainer) {
    console.warn('[Header] Containers not initialized');
    return;
  }

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

  // Cache search term lowercase once
  const searchInputValue = DOM.searchInput.value;
  const searchTerm = searchInputValue ? searchInputValue.toLowerCase() : '';
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

  // Pre-compute lowercase task properties once to avoid repeated toLowerCase() calls
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
      // Cache lowercase values once per task
      const clientLower = task.client ? task.client.toLowerCase() : '';
      const domainLower = task.domain ? task.domain.toLowerCase() : '';
      const clientMatches = clientLower.includes(searchTerm);
      const domainMatches = domainLower.includes(searchTerm);
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
      
      // Always show CTA button in column 0, even on mobile
      const showCreateBtn = col.id === 0;
      const emptyStateText = hasAnyFilter 
        ? 'Nenhum projeto encontrado com este filtro' 
        : 'Nenhum projeto aqui';
      
      emptyState.innerHTML = `
        <div class="empty-state-icon"><i class="fa-solid fa-layer-group" aria-hidden="true"></i></div>
        <div class="empty-state-text">${emptyStateText}</div>
        ${showCreateBtn ? '<button class="btn-text empty-state-action" id="emptyStateCreateBtn" aria-label="Criar primeiro projeto">Criar primeiro projeto</button>' : ''}
      `;
      bodyDiv.appendChild(emptyState);

      if (showCreateBtn) {
        const createBtn = emptyState.querySelector('#emptyStateCreateBtn');
        if (createBtn) {
          createBtn.addEventListener('click', () => {
            if (typeof openModal === 'function') {
              openModal();
            } else if (DOM.btnNewProject) {
              DOM.btnNewProject.click();
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

  // Cleanup event listeners from old cards before destroying DOM
  const oldCards = DOM.boardGrid.querySelectorAll('.card');
  oldCards.forEach(card => cleanupCardEventListeners(card));
  
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

  // Validar e extrair email usando EMAIL_PATTERN de forms.js (já definido globalmente)
  if (typeof EMAIL_PATTERN !== 'undefined' && EMAIL_PATTERN.test(contact)) {
    const emailUrl = `mailto:${contact}?subject=${encodeURIComponent(`Status do Projeto ${task.client}`)}`;
    emailHtml = `<a href="${emailUrl}" class="action-btn email" aria-label="Enviar email" onclick="event.stopPropagation();">Email</a>`;
  }

  if (!whatsappHtml && !emailHtml) return '';

  return `<div class="card-actions">${whatsappHtml}${emailHtml}</div>`;
}

// Store event handlers to allow cleanup (prevent memory leaks)
const cardEventHandlers = new WeakMap();

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

  const subtasksHtml = (task.subtask_count > 0) 
    ? `<span class="card-subtasks" title="Subtarefas: ${task.completed_subtask_count}/${task.subtask_count}">
         <i class="fa-solid fa-list-check"></i> ${task.completed_subtask_count}/${task.subtask_count}
       </span>` 
    : '';

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
          ${subtasksHtml}
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

  // Create event handlers and store references for cleanup
  const clickHandler = () => openModal(task);
  const keydownHandler = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openModal(task);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      // Keyboard navigation for moving cards between columns
      e.preventDefault();
      handleKeyboardMove(e, task, el);
    }
  };
  
  el.addEventListener('click', clickHandler);
  el.addEventListener('keydown', keydownHandler);
  
  // Store handlers for cleanup (WeakMap allows garbage collection when element is removed)
  cardEventHandlers.set(el, { click: clickHandler, keydown: keydownHandler });

  return el;
}

// Cleanup function to remove event listeners before destroying cards
function cleanupCardEventListeners(cardElement) {
  if (!cardElement) return;
  const handlers = cardEventHandlers.get(cardElement);
  if (handlers) {
    cardElement.removeEventListener('click', handlers.click);
    cardElement.removeEventListener('keydown', handlers.keydown);
    cardEventHandlers.delete(cardElement);
  }
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

  // Immediate visual feedback - show success state
  item.classList.add('card-move-success');
  setTimeout(() => {
    item.classList.remove('card-move-success');
  }, 500);

  api.moveTask(taskId, targetColId, insertIndex)
    .then((updatedTaskFromServer) => {
      if (typeof window.markLocalTaskAction === 'function') {
        window.markLocalTaskAction(taskId);
      }

      const normalizedTask = normalizeTasksData([updatedTaskFromServer])[0];
      const currentTasks = AppState.getTasks();
      const updatedTasks = currentTasks.map(t => t.id === taskId ? normalizedTask : t);
      AppState.setTasks(updatedTasks);
      
      // Incremental update: only update the moved card and column counts
      updateCardInPlace(item, normalizedTask);
      updateColumnCounts();

      const colName = COLUMNS_MAP.get(targetColId)?.name || 'Coluna';
      NotificationManager.info(`Projeto ${task.client} movido para ${colName}`, 2000);
      
      // Announce to screen readers
      const ariaLiveRegion = document.getElementById('ariaLiveRegion');
      if (ariaLiveRegion) {
        ariaLiveRegion.textContent = `Projeto ${task.client} movido para ${colName}`;
      }
      
      AppState.log('Task moved successfully', { taskId, targetColId, insertIndex });
    })
    .catch((error) => {
      console.error('[Kanban] Failed to move task:', {
        error: error.message,
        taskId,
        targetColId
      });
      
      // Visual feedback for error
      item.classList.add('card-move-error');
      setTimeout(() => {
        item.classList.remove('card-move-error');
      }, 1000);
      
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

  // Immediate visual feedback
  cardElement.classList.add('card-move-success');
  setTimeout(() => {
    cardElement.classList.remove('card-move-success');
  }, 500);

  // Update task position
  api.moveTask(task.id, newColId, newOrderPosition)
    .then((updatedTask) => {
      if (typeof window.markLocalTaskAction === 'function') {
        window.markLocalTaskAction(task.id);
      }

      const normalizedTask = normalizeTasksData([updatedTask])[0];
      const updatedTasks = tasks.map(t => t.id === task.id ? normalizedTask : t);
      AppState.setTasks(updatedTasks);
      
      // Incremental update: only update the moved card and column counts
      updateCardInPlace(cardElement, normalizedTask);
      updateColumnCounts();

      // Announce move to screen readers
      const colName = COLUMNS_MAP.get(newColId)?.name || 'Coluna';
      const ariaLiveRegion = document.getElementById('ariaLiveRegion');
      if (ariaLiveRegion) {
        ariaLiveRegion.textContent = `Projeto ${task.client} movido para ${colName}`;
      }
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
      cardElement.classList.add('card-move-error');
      setTimeout(() => {
        cardElement.classList.remove('card-move-error');
      }, 1000);
      NotificationManager.error('Erro ao mover projeto. Tente novamente.');
    });
}

// Cache for renderProjectsHeader to avoid recalculating if nothing changed
let _projectsHeaderCache = {
  tasksHash: null,
  searchTerm: null,
  totalValue: null,
  lastElement: null
};

function renderProjectsHeader() {
  // Add null check with warning
  if (!DOM.headerInfo) {
    console.warn('[Header] headerInfo not initialized');
    return;
  }

  const tasks = AppState.getTasks();
  if (!Array.isArray(tasks)) {
    console.warn('[Header] Tasks not available');
    return;
  }

  // Cache search term once
  const searchInputValue = DOM.searchInput ? DOM.searchInput.value : '';
  const searchTerm = searchInputValue ? searchInputValue.toLowerCase() : '';
  
  // Simple hash for tasks array (length + first few IDs for quick comparison)
  const tasksHash = tasks.length + (tasks.length > 0 ? tasks[0]?.id || 0 : 0) + (tasks.length > 1 ? tasks[tasks.length - 1]?.id || 0 : 0);
  
  // Check if we can reuse cached result
  if (_projectsHeaderCache.tasksHash === tasksHash && 
      _projectsHeaderCache.searchTerm === searchTerm && 
      _projectsHeaderCache.lastElement) {
    // Value hasn't changed, skip DOM manipulation
    return;
  }
  
  const filteredTasks = tasks.filter(t => {
    if (!searchTerm) return true;
    if (!t || !t.client) return false;
    // Cache lowercase values once per task
    const clientLower = t.client.toLowerCase();
    const domainLower = t.domain ? t.domain.toLowerCase() : '';
    const clientMatches = clientLower.includes(searchTerm);
    const domainMatches = domainLower.includes(searchTerm);
    return clientMatches || domainMatches;
  });
  const totalValue = filteredTasks.reduce((sum, t) => sum + (parseFloat(t.price) || 0), 0);
  
  // Check if value actually changed (avoid unnecessary DOM update)
  if (_projectsHeaderCache.totalValue === totalValue && _projectsHeaderCache.lastElement) {
    // Value is the same, just update cache
    _projectsHeaderCache.tasksHash = tasksHash;
    _projectsHeaderCache.searchTerm = searchTerm;
    return;
  }

  // Use textContent to prevent XSS instead of innerHTML
  const statDiv = document.createElement('div');
  statDiv.className = 'header-stat';
  
  const labelSpan = document.createElement('span');
  labelSpan.className = 'header-stat-label';
  labelSpan.textContent = 'Total:';
  
  const valueSpan = document.createElement('span');
  valueSpan.className = 'header-stat-value';
  valueSpan.textContent = formatCurrency(totalValue);
  
  statDiv.appendChild(labelSpan);
  statDiv.appendChild(valueSpan);
  
  // Use replaceChildren for better performance than innerHTML + appendChild
  DOM.headerInfo.replaceChildren(statDiv);
  
  // Update cache
  _projectsHeaderCache = {
    tasksHash: tasksHash,
    searchTerm: searchTerm,
    totalValue: totalValue,
    lastElement: statDiv
  };
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
  
  // Announce filter removal to screen readers
  const ariaLiveRegion = document.getElementById('ariaLiveRegion');
  if (ariaLiveRegion) {
    ariaLiveRegion.textContent = 'Filtro removido. Mostrando todos os projetos.';
  }
  
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
      <button class="btn-text" onclick="clearKanbanFilter()" style="margin-left: 0.5rem;" aria-label="Remover filtro">
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

  // Announce filter change to screen readers
  const ariaLiveRegion = document.getElementById('ariaLiveRegion');
  if (ariaLiveRegion) {
    ariaLiveRegion.textContent = `Visualização filtrada: ${column.name}`;
  }
}

function showFilterIndicatorCustom(filterName) {
  let filterIndicator = document.getElementById('filterIndicator');
  if (!filterIndicator) {
    filterIndicator = document.createElement('div');
    filterIndicator.id = 'filterIndicator';
    filterIndicator.className = 'filter-indicator';
    filterIndicator.innerHTML = `
      <span>Filtrado: ${filterName}</span>
      <button class="btn-text" onclick="clearKanbanFilter()" style="margin-left: 0.5rem;" aria-label="Remover filtro">
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

  // Announce filter change to screen readers
  const ariaLiveRegion = document.getElementById('ariaLiveRegion');
  if (ariaLiveRegion) {
    ariaLiveRegion.textContent = `Visualização filtrada: ${filterName}`;
  }
}

function hideFilterIndicator() {
  const filterIndicator = document.getElementById('filterIndicator');
  if (filterIndicator) {
    filterIndicator.style.display = 'none';
  }
}

function updateCardInPlace(cardElement, updatedTask) {
  if (!cardElement || !updatedTask || !cardElement.parentNode) return;
  
  const oldColId = parseInt(cardElement.dataset.colId) || 0;
  const newColId = updatedTask.col_id || 0;
  
  if (oldColId !== newColId) {
    const tasks = AppState.getTasks();
    const updatedTasks = tasks.map(t => t.id === updatedTask.id ? updatedTask : t);
    AppState.setTasks(updatedTasks);
    renderBoard();
    return;
  }
  
  cardElement.dataset.colId = newColId;
  if (updatedTask.deadline_timestamp) cardElement.dataset.deadlineTimestamp = updatedTask.deadline_timestamp;
  
  if (updatedTask.uptime_status) {
    cardElement.dataset.uptimeStatus = updatedTask.uptime_status;
  } else {
    delete cardElement.dataset.uptimeStatus;
  }
  
  const now = Date.now();
  if (isTaskUrgent(updatedTask, now)) {
    cardElement.dataset.urgent = 'true';
  } else {
    delete cardElement.dataset.urgent;
  }
  
  const deadlineInfo = updatedTask.deadline ? `, prazo: ${updatedTask.deadline}` : '';
  const colName = COLUMNS_MAP.get(newColId)?.name || '';
  cardElement.setAttribute('aria-label', `Projeto ${updatedTask.client}, ${formatPrice(updatedTask.price)}${deadlineInfo}, coluna: ${colName}. Use setas esquerda e direita para mover entre colunas, Enter ou Espaço para editar`);
  
  const priceEl = cardElement.querySelector('.price');
  if (priceEl) priceEl.textContent = formatPrice(updatedTask.price);
  
  let subtasksEl = cardElement.querySelector('.card-subtasks');
  if (updatedTask.subtask_count > 0) {
    const subtasksHtml = `
         <i class="fa-solid fa-list-check"></i> ${updatedTask.completed_subtask_count}/${updatedTask.subtask_count}
       `;
    if (!subtasksEl) {
      const metaEl = cardElement.querySelector('.card-meta');
      if (metaEl) {
        subtasksEl = document.createElement('span');
        subtasksEl.className = 'card-subtasks';
        metaEl.insertBefore(subtasksEl, metaEl.querySelector('.deadline') || null);
      }
    }
    if (subtasksEl) {
      subtasksEl.innerHTML = subtasksHtml;
      subtasksEl.title = `Subtarefas: ${updatedTask.completed_subtask_count}/${updatedTask.subtask_count}`;
    }
  } else if (subtasksEl) {
    subtasksEl.remove();
  }

  const deadlineEl = cardElement.querySelector('.deadline');
  if (deadlineEl && updatedTask.deadline_timestamp) {
    const display = formatDeadlineDisplay(updatedTask.deadline, updatedTask.deadline_timestamp);
    if (display) {
      deadlineEl.textContent = display;
      deadlineEl.dataset.deadline = updatedTask.deadline || '';
      deadlineEl.dataset.timestamp = updatedTask.deadline_timestamp || '';
      
      if (display === DEADLINE_OVERDUE) {
        deadlineEl.classList.add('overdue');
      } else {
        deadlineEl.classList.remove('overdue');
      }
    }
  }
}

function updateColumnCounts() {
  const tasks = AppState.getTasks();
  const tasksByColumn = new Map();
  COLUMNS.forEach(col => {
    tasksByColumn.set(col.id, []);
  });
  
  // Cache search term and filters once
  const searchInputValue = DOM.searchInput ? DOM.searchInput.value : '';
  const searchTerm = searchInputValue ? searchInputValue.toLowerCase() : '';
  const hasColumnFilter = AppState.filterByColumnId !== undefined && AppState.filterByColumnId !== null;
  const hasCustomFilter = AppState.filterByCustomType !== undefined && AppState.filterByCustomType !== null;
  
  tasks.forEach(task => {
    const colId = task.col_id || 0;
    
    // Apply same filters as renderBoard
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
      // Cache lowercase values once per task
      const clientLower = task.client ? task.client.toLowerCase() : '';
      const domainLower = task.domain ? task.domain.toLowerCase() : '';
      const clientMatches = clientLower.includes(searchTerm);
      const domainMatches = domainLower.includes(searchTerm);
      if (!clientMatches && !domainMatches) {
        return;
      }
    }
    
    if (tasksByColumn.has(colId)) {
      tasksByColumn.get(colId).push(task);
    }
  });
  
  // Cache DOM queries - query all column bodies once instead of per column
  const allColumnBodies = document.querySelectorAll('.col-body[data-col-id]');
  const columnBodyMap = new Map();
  allColumnBodies.forEach(colBody => {
    const colId = parseInt(colBody.dataset.colId);
    if (!isNaN(colId)) {
      columnBodyMap.set(colId, colBody);
    }
  });
  
  COLUMNS.forEach(col => {
    const colBody = columnBodyMap.get(col.id);
    if (!colBody) return;
    
    const colDiv = colBody.closest('.column');
    if (!colDiv) return;
    
    const colHeader = colDiv.querySelector('.col-header');
    if (colHeader) {
      const count = tasksByColumn.get(col.id).length;
      const countEl = colHeader.querySelector('.col-count');
      if (countEl) {
        countEl.textContent = count;
        countEl.setAttribute('aria-label', `${count} ${count === 1 ? 'projeto' : 'projetos'}`);
        if (count > 0) {
          countEl.classList.add('col-count-active');
        } else {
          countEl.classList.remove('col-count-active');
        }
      }
      
      // Update column aria-label
      colDiv.setAttribute('aria-label', `Coluna ${col.name} com ${count} ${count === 1 ? 'projeto' : 'projetos'}`);
    }
  });
  
  // Update header stats (will be debounced by main.js)
  if (typeof debouncedUpdateHeaderStats === 'function') {
    debouncedUpdateHeaderStats();
  } else {
    updateHeaderStats();
  }
}

// Export to global scope for other modules (like SubtaskManager)
window.renderBoard = renderBoard;
window.updateCardInPlace = updateCardInPlace;
window.updateColumnCounts = updateColumnCounts;
window.filterKanbanByStatus = filterKanbanByStatus;
window.filterKanbanByActiveJobs = filterKanbanByActiveJobs;
window.filterKanbanByPendingPayments = filterKanbanByPendingPayments;
window.clearKanbanFilter = clearKanbanFilter;
window.exportKanbanData = exportKanbanData;
