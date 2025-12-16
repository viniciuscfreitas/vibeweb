// Forms and Modal Logic

const URL_PATTERN = /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/i;
const SIMPLE_DOMAIN_PATTERN = /^([\da-z\.-]+)\.([a-z\.]{2,6})$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONTACT_PATTERN = /^[@]?[\w\-\.]+$/;

function openModal(task = null) {
  if (!DOM.modalOverlay || !DOM.modalTitle || !DOM.btnDelete) return;

  const isEditingExistingTask = !!task;
  AppState.currentTaskId = isEditingExistingTask ? task.id : null;
  clearFormErrors();

  const modalTitle = isEditingExistingTask ? `Editar #${task.id}` : 'Novo Projeto';
  const deleteButtonDisplay = isEditingExistingTask ? 'block' : 'none';

  DOM.modalTitle.innerText = modalTitle;
  DOM.btnDelete.style.display = deleteButtonDisplay;

  DOM.modalOverlay.setAttribute('aria-hidden', 'false');
  DOM.modalOverlay.classList.add('open');

  DOM.formClient.value = task?.client || '';
  DOM.formContact.value = task?.contact || '';
  DOM.formType.value = task?.type || 'Landing Essencial';
  DOM.formStack.value = task?.stack || '';
  DOM.formDomain.value = task?.domain || '';
  DOM.formDesc.value = task?.description || '';
  DOM.formPrice.value = task?.price || '';
  DOM.formPayment.value = task?.payment_status || PAYMENT_STATUS_PENDING;
  DOM.formDeadline.value = task?.deadline || '';

  const hostingValue = task?.hosting || HOSTING_NO;
  DOM.formHosting.value = hostingValue;

  setTimeout(() => {
    if (DOM.formClient) {
      DOM.formClient.focus();
    }
  }, 100);

  trapFocusInModal();
  AppState.log('Modal opened', { isEditingExistingTask, taskId: AppState.currentTaskId });
}

function closeModal() {
  if (!DOM.modalOverlay) return;
  DOM.modalOverlay.classList.remove('open');
  DOM.modalOverlay.setAttribute('aria-hidden', 'true');
  clearFormErrors();
  AppState.currentTaskId = null;
  releaseFocusFromModal();
}

let modalFocusTrap = null;

function trapFocusInModal() {
  if (!DOM.modalOverlay) return;

  const focusableElements = DOM.modalOverlay.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  const firstElement = focusableElements[0];
  const lastElement = focusableElements[focusableElements.length - 1];

  const handleTabKey = (e) => {
    if (e.key !== 'Tab') return;

    if (e.shiftKey) {
      if (document.activeElement === firstElement) {
        e.preventDefault();
        lastElement.focus();
      }
    } else {
      if (document.activeElement === lastElement) {
        e.preventDefault();
        firstElement.focus();
      }
    }
  };

  DOM.modalOverlay.addEventListener('keydown', handleTabKey);
  modalFocusTrap = handleTabKey;
}

function releaseFocusFromModal() {
  if (modalFocusTrap && DOM.modalOverlay) {
    DOM.modalOverlay.removeEventListener('keydown', modalFocusTrap);
    modalFocusTrap = null;
  }
}

function validateDomain(domain) {
  if (!domain) return true;
  const matchesUrl = URL_PATTERN.test(domain);
  const matchesSimple = SIMPLE_DOMAIN_PATTERN.test(domain);
  return matchesUrl || matchesSimple;
}

function validateContact(contact) {
  if (!contact) return true;
  const matchesEmail = EMAIL_PATTERN.test(contact);
  const matchesContact = CONTACT_PATTERN.test(contact);
  return matchesEmail || matchesContact;
}

// Field error mapping to reduce repetition
const FIELD_ERROR_MAP = {
  client: { error: () => DOM.errorClient, input: () => DOM.formClient },
  contact: { error: () => DOM.errorContact, input: () => DOM.formContact },
  domain: { error: () => DOM.errorDomain, input: () => DOM.formDomain },
  price: { error: () => DOM.errorPrice, input: () => DOM.formPrice }
};

function showFormError(fieldId, message) {
  const field = FIELD_ERROR_MAP[fieldId];
  if (!field) return;

  const errorEl = field.error();
  const inputEl = field.input();

  if (errorEl && inputEl) {
    errorEl.textContent = message;
    errorEl.classList.add('show');
    inputEl.classList.add('error');
  }
}

function clearFormError(fieldId) {
  const field = FIELD_ERROR_MAP[fieldId];
  if (!field) return;

  const errorEl = field.error();
  const inputEl = field.input();

  if (errorEl && inputEl) {
    errorEl.classList.remove('show');
    inputEl.classList.remove('error');
  }
}

function clearFormErrors() {
  clearFormError('client');
  clearFormError('contact');
  clearFormError('domain');
  clearFormError('price');
}

function validateForm() {
  let isFormValid = true;
  clearFormErrors();

  const clientName = DOM.formClient.value.trim();
  if (!clientName) {
    showFormError('client', 'Nome do cliente é obrigatório');
    isFormValid = false;
  }

  const contact = DOM.formContact.value.trim();
  if (contact && !validateContact(contact)) {
    showFormError('contact', 'Formato inválido. Use email ou @username');
    isFormValid = false;
  }

  const domain = DOM.formDomain.value.trim();
  if (domain && !validateDomain(domain)) {
    showFormError('domain', 'Formato de URL/domínio inválido');
    isFormValid = false;
  }

  const priceValue = DOM.formPrice.value;
  const price = priceValue ? parseFloat(priceValue) : 0;
  const isInvalidNumber = isNaN(price);
  const isNegative = price < 0;
  const isInvalidPrice = isInvalidNumber || isNegative;

  if (isInvalidPrice) {
    showFormError('price', 'Preço deve ser um número positivo');
    isFormValid = false;
  }

  return isFormValid;
}

async function saveForm() {
  if (!validateForm()) {
    AppState.log('Form validation failed');
    return;
  }

  if (!DOM.formClient || !DOM.formPrice || !DOM.formContact || !DOM.formType ||
    !DOM.formStack || !DOM.formDomain || !DOM.formDesc || !DOM.formPayment ||
    !DOM.formDeadline || !DOM.formHosting) {
    AppState.log('Form save failed: missing form elements');
    return;
  }

  const clientName = DOM.formClient.value.trim();
  const priceValue = DOM.formPrice.value;
  const price = priceValue ? parseFloat(priceValue) : 0;

  const deadlineValue = DOM.formDeadline.value.trim();
  const deadline = deadlineValue || DEADLINE_UNDEFINED;

  // Get save button and disable it
  const saveButton = DOM.btnSave;
  const originalButtonText = saveButton ? saveButton.textContent : 'Salvar';
  if (saveButton) {
    saveButton.disabled = true;
    saveButton.textContent = 'Salvando...';
  }

  try {
    const tasks = AppState.getTasks();
    const formData = {
      client: clientName,
      contact: DOM.formContact.value.trim(),
      type: DOM.formType.value,
      stack: DOM.formStack.value.trim(),
      domain: DOM.formDomain.value.trim(),
      description: DOM.formDesc.value.trim(),
      price: price,
      payment_status: DOM.formPayment.value, // Use snake_case consistently
      deadline: deadline,
      hosting: DOM.formHosting.value,
    };

    if (AppState.currentTaskId) {
      // Update existing task
      const existingTask = tasks.find(t => t.id === AppState.currentTaskId);
      if (existingTask) {
        const currentDeadline = existingTask.deadline;
        const newDeadline = formData.deadline;

        if (currentDeadline !== newDeadline && parseDeadlineHours(newDeadline)) {
          const hours = parseDeadlineHours(newDeadline);
          formData.deadline_timestamp = Date.now() + (hours * MS_PER_HOUR);
        } else if (currentDeadline === newDeadline && existingTask.deadline_timestamp) {
          // Deadline unchanged - preserve existing timestamp
          formData.deadline_timestamp = existingTask.deadline_timestamp;
        } else if (newDeadline && parseDeadlineHours(newDeadline) && !existingTask.deadline_timestamp) {
          // New deadline without existing timestamp - calculate it
          const hours = parseDeadlineHours(newDeadline);
          formData.deadline_timestamp = Date.now() + (hours * MS_PER_HOUR);
        }

        formData.col_id = existingTask.col_id; // Use snake_case consistently
        formData.order_position = existingTask.order_position || 0; // Use snake_case consistently
      }

      const updatedTaskFromServer = await api.updateTask(AppState.currentTaskId, formData);

      // Normalize task to ensure defaults
      const normalizedTask = normalizeTasksData([updatedTaskFromServer])[0];

      // Update local state
      const updatedTasks = tasks.map(t => t.id === AppState.currentTaskId ? normalizedTask : t);
      AppState.setTasks(updatedTasks);
      AppState.log('Task updated', { taskId: AppState.currentTaskId });
    } else {
      // Create new task
      let maxOrder = -1;
      tasks.forEach(t => {
        if (t.col_id === DISCOVERY_COLUMN_ID) {
          const order = t.order_position || 0;
          if (order > maxOrder) maxOrder = order;
        }
      });
      const newOrder = maxOrder + 1;

      const hours = parseDeadlineHours(formData.deadline);
      const deadline_timestamp = hours ? Date.now() : null;

      formData.col_id = DISCOVERY_COLUMN_ID; // Use snake_case consistently
      formData.order_position = newOrder; // Use snake_case consistently
      formData.deadline_timestamp = deadline_timestamp;

      const newTaskFromServer = await api.createTask(formData);

      // Normalize task to ensure defaults
      const normalizedNewTask = normalizeTasksData([newTaskFromServer])[0];

      // Update local state
      const updatedTasks = [...tasks, normalizedNewTask];
      AppState.setTasks(updatedTasks);
      AppState.log('Task created', { taskId: normalizedNewTask.id });
    }

    closeModal();
    renderBoard();

    if (DOM.dashboardContainer.classList.contains('active')) {
      renderDashboard();
    } else if (DOM.financialContainer.classList.contains('active')) {
      renderFinancial();
    }
  } catch (error) {
    // Log full error for debugging
    console.error('[Forms] Error saving task:', {
      error: error.message,
      stack: error.stack,
      taskId: AppState.currentTaskId
    });
    // Show user-friendly error message
    const errorMessage = error.message || 'Erro ao salvar. Tente novamente.';
    NotificationManager.error(errorMessage);
    // Keep modal open on error
  } finally {
    if (saveButton) {
      saveButton.disabled = false;
      saveButton.textContent = originalButtonText;
    }
  }
}

function showConfirmDialog(message, onConfirm) {
  const dialog = document.createElement('div');
  dialog.className = 'confirm-dialog';
  dialog.innerHTML = `
    <p style="margin: 0; color: var(--text-main);">${message}</p>
    <div class="confirm-dialog-buttons">
      <button class="btn-text" id="confirmCancel">Cancelar</button>
      <button class="btn-danger" id="confirmOk">Confirmar</button>
    </div>
  `;

  document.body.appendChild(dialog);

  const cleanup = () => {
    document.body.removeChild(dialog);
  };

  dialog.querySelector('#confirmCancel').addEventListener('click', cleanup);
  dialog.querySelector('#confirmOk').addEventListener('click', () => {
    cleanup();
    onConfirm();
  });

  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) cleanup();
  });
}

function deleteItem() {
  if (!AppState.currentTaskId) return;

  showConfirmDialog("Arquivar este projeto?", async () => {
    try {
      await api.deleteTask(AppState.currentTaskId);

      // Update local state
      const tasks = AppState.getTasks();
      const updatedTasks = tasks.filter(t => t.id !== AppState.currentTaskId);
      AppState.setTasks(updatedTasks);
      AppState.log('Task deleted', { taskId: AppState.currentTaskId });

      closeModal();
      renderBoard();

      if (DOM.dashboardContainer.classList.contains('active')) {
        renderDashboard();
      } else if (DOM.financialContainer.classList.contains('active')) {
        renderFinancial();
      }
    } catch (error) {
      // Log full error for debugging
      console.error('[Forms] Error deleting task:', {
        error: error.message,
        stack: error.stack,
        taskId: AppState.currentTaskId
      });
      const errorMessage = error.message || 'Erro ao deletar. Tente novamente.';
      NotificationManager.error(errorMessage);
    }
  });
}
