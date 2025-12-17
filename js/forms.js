// Forms and Modal Logic

if (typeof window.URL_PATTERN === 'undefined') {
  window.URL_PATTERN = /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/i;
  window.SIMPLE_DOMAIN_PATTERN = /^([\da-z\.-]+)\.([a-z\.]{2,6})$/i;
  window.EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  window.CONTACT_PATTERN = /^[@]?[\w\-\.]+$/;
}

var URL_PATTERN = window.URL_PATTERN;
var SIMPLE_DOMAIN_PATTERN = window.SIMPLE_DOMAIN_PATTERN;
var EMAIL_PATTERN = window.EMAIL_PATTERN;
var CONTACT_PATTERN = window.CONTACT_PATTERN;

let lastSavedFormState = null;

function saveFormState() {
  if (!DOM.formClient || !DOM.modalOverlay || !DOM.modalOverlay.classList.contains('open')) return;

  const formState = {
    client: DOM.formClient.value || '',
    contact: DOM.formContact?.value || '',
    type: DOM.formType?.value || '',
    stack: DOM.formStack?.value || '',
    domain: DOM.formDomain?.value || '',
    description: DOM.formDesc?.value || '',
    price: DOM.formPrice?.value || '',
    payment: DOM.formPayment?.value || '',
    deadline: DOM.formDeadline?.value || '',
    hosting: DOM.formHosting?.value || '',
    recurring: DOM.formRecurring?.checked || false,
    public: DOM.formPublic?.checked || false,
    assetsLink: DOM.formAssetsLink?.value || ''
  };

  const formStateJson = JSON.stringify(formState);
  if (formStateJson === lastSavedFormState) return;

  const hasData = Object.values(formState).some(val => val !== '' && val !== false);
  if (hasData) {
    sessionStorage.setItem('formDraft', formStateJson);
    lastSavedFormState = formStateJson;
  } else {
    lastSavedFormState = null;
  }
}

function restoreFormState() {
  try {
    const saved = sessionStorage.getItem('formDraft');
    if (!saved) return false;

    const formState = JSON.parse(saved);
    if (!formState) return false;

    if (DOM.formClient) DOM.formClient.value = formState.client || '';
    if (DOM.formContact) DOM.formContact.value = formState.contact || '';
    if (DOM.formType) DOM.formType.value = formState.type || 'Landing Essencial';
    if (DOM.formStack) DOM.formStack.value = formState.stack || '';
    if (DOM.formDomain) DOM.formDomain.value = formState.domain || '';
    if (DOM.formDesc) DOM.formDesc.value = formState.description || '';
    if (DOM.formPrice) DOM.formPrice.value = formState.price || '';
    if (DOM.formPayment) DOM.formPayment.value = formState.payment || PAYMENT_STATUS_PENDING;
    if (DOM.formDeadline) DOM.formDeadline.value = formState.deadline || '';
    if (DOM.formHosting) DOM.formHosting.value = formState.hosting || 'nao';
    if (DOM.formRecurring) DOM.formRecurring.checked = formState.recurring || false;
    if (DOM.formPublic) DOM.formPublic.checked = formState.public || false;
    if (DOM.formAssetsLink) DOM.formAssetsLink.value = formState.assetsLink || '';

    return true;
  } catch (e) {
    console.error('[Forms] Error restoring form state:', e);
    return false;
  }
}

function clearFormDraft() {
  sessionStorage.removeItem('formDraft');
  lastSavedFormState = null;
}

function resetFormToDefaults() {
  if (!DOM.formClient) return;

  const formFields = [
    { el: DOM.formClient, prop: 'value', val: '' },
    { el: DOM.formContact, prop: 'value', val: '' },
    { el: DOM.formType, prop: 'value', val: 'Landing Essencial' },
    { el: DOM.formStack, prop: 'value', val: '' },
    { el: DOM.formDomain, prop: 'value', val: '' },
    { el: DOM.formDesc, prop: 'value', val: '' },
    { el: DOM.formPrice, prop: 'value', val: '' },
    { el: DOM.formPayment, prop: 'value', val: PAYMENT_STATUS_PENDING },
    { el: DOM.formDeadline, prop: 'value', val: '' },
    { el: DOM.formHosting, prop: 'value', val: HOSTING_NO },
    { el: DOM.formAssetsLink, prop: 'value', val: '' }
  ];

  formFields.forEach(field => {
    if (field.el) {
      field.el[field.prop] = field.val;
    }
  });

  if (DOM.formRecurring) DOM.formRecurring.checked = false;
  if (DOM.formPublic) DOM.formPublic.checked = false;
}

function openModal(task = null) {
  if (!DOM.modalOverlay || !DOM.modalTitle || !DOM.btnDelete) return;

  const isEditingExistingTask = !!task;
  AppState.currentTaskId = isEditingExistingTask ? task.id : null;
  clearFormErrors();

  const currentPath = window.location.pathname;
  let newPath = '/projetos';

  if (isEditingExistingTask && task.id) {
    newPath = `/projetos/${task.id}`;
  } else {
    newPath = '/projetos/novo';
  }

  if (currentPath !== newPath) {
    window.history.pushState({ view: 'projects', taskId: task?.id || 'new' }, '', newPath);
  }

  const modalTitle = isEditingExistingTask ? `Editar #${task.id}` : 'Novo Projeto';
  const deleteButtonDisplay = isEditingExistingTask ? 'block' : 'none';
  const pdfButtonDisplay = isEditingExistingTask ? 'block' : 'none';

  DOM.modalTitle.innerText = modalTitle;
  DOM.btnDelete.style.display = deleteButtonDisplay;
  if (DOM.btnGeneratePDF) {
    DOM.btnGeneratePDF.style.display = pdfButtonDisplay;
    DOM.btnGeneratePDF.classList.toggle('hidden', !isEditingExistingTask);
  }

  DOM.modalOverlay.setAttribute('aria-hidden', 'false');
  DOM.modalOverlay.classList.add('open');

  if (isEditingExistingTask) {
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

    if (DOM.formRecurring) {
      DOM.formRecurring.checked = task?.is_recurring === 1 || task?.is_recurring === true;
    }

    if (DOM.formPublic) {
      DOM.formPublic.checked = !!task?.public_uuid;
    }

    if (DOM.formAssetsLink) {
      let assetsDisplay = '';
      if (task?.assets_link) {
        try {
          const parsed = JSON.parse(task.assets_link);
          if (Array.isArray(parsed)) {
            assetsDisplay = parsed.join('\n');
          } else {
            assetsDisplay = task.assets_link;
          }
        } catch (e) {
          assetsDisplay = task.assets_link;
        }
      }
      DOM.formAssetsLink.value = assetsDisplay;
    }
  } else {
    const restored = restoreFormState();
    if (!restored) {
      resetFormToDefaults();
    }
  }

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

  saveFormState();

  DOM.modalOverlay.classList.remove('open');
  DOM.modalOverlay.setAttribute('aria-hidden', 'true');
  clearFormErrors();
  AppState.currentTaskId = null;
  releaseFocusFromModal();

  const currentPath = window.location.pathname;
  if (currentPath.startsWith('/projetos/')) {
    const basePath = '/projetos';
    if (currentPath !== basePath) {
      window.history.pushState({ view: 'projects' }, '', basePath);
    }
  }
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

function setupPasteHandler() {
  const pasteableInputs = document.querySelectorAll('[data-paste-enabled="true"]');
  pasteableInputs.forEach(input => {
    input.addEventListener('paste', handlePaste);
  });
}

function handlePaste(e) {
  if (!e.target.hasAttribute('data-paste-enabled')) return;

  const pastedText = (e.clipboardData || window.clipboardData).getData('text');
  if (!pastedText || !pastedText.trim()) return;

  let parsed = false;

  try {
    // Tentar parsear como JSON primeiro
    const jsonData = JSON.parse(pastedText);
    if (typeof jsonData === 'object' && jsonData !== null) {
      populateFieldsFromJson(jsonData);
      parsed = true;
      e.preventDefault();
      NotificationManager.info('Campos preenchidos automaticamente!', 2000);
      return;
    }
  } catch (e) {
    // Não é JSON, tentar formato de linhas
  }

  // Tentar formato de linhas: "Cliente: Nome\nPreço: R$ 1000\n..."
  const lines = pastedText.split('\n').map(line => line.trim()).filter(Boolean);
  if (lines.length > 1) {
    const parsedData = parseLinesFormat(lines);
    if (Object.keys(parsedData).length > 0) {
      populateFieldsFromJson(parsedData);
      parsed = true;
      e.preventDefault();
      NotificationManager.info('Campos preenchidos automaticamente!', 2000);
      return;
    }
  }

  // Se não conseguiu parsear, não fazer nada (comportamento silencioso é OK)
}

function parseLinesFormat(lines) {
  const data = {};

  lines.forEach(line => {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) return;

    const key = line.substring(0, colonIndex).trim().toLowerCase();
    const value = line.substring(colonIndex + 1).trim();

    if (!value) return;

    // Mapear chaves em português para campos do formulário
    if (key.includes('cliente') || key.includes('nome') || key.includes('empresa')) {
      data.client = value;
    } else if (key.includes('preço') || key.includes('preco') || key.includes('valor') || key.includes('price')) {
      // Extrair números, ignorar "R$", "€", etc
      const numbers = value.replace(/[^\d,.]/g, '').replace(',', '.');
      const numValue = parseFloat(numbers);
      if (!isNaN(numValue)) {
        data.price = numValue;
      }
    } else if (key.includes('descrição') || key.includes('descricao') || key.includes('detalhes') || key.includes('description')) {
      data.description = value;
    } else if (key.includes('contato') || key.includes('contact')) {
      data.contact = value;
    } else if (key.includes('domínio') || key.includes('dominio') || key.includes('domain') || key.includes('url')) {
      data.domain = value;
    } else if (key.includes('stack') || key.includes('tecnologia')) {
      data.stack = value;
    }
  });

  return data;
}

function populateFieldsFromJson(data) {
  if (data.client && DOM.formClient) {
    DOM.formClient.value = data.client;
  }
  if (data.price !== undefined && DOM.formPrice) {
    DOM.formPrice.value = data.price;
  }
  if (data.description && DOM.formDesc) {
    DOM.formDesc.value = data.description;
  }
  if (data.contact && DOM.formContact) {
    DOM.formContact.value = data.contact;
  }
  if (data.domain && DOM.formDomain) {
    DOM.formDomain.value = data.domain;
  }
  if (data.stack && DOM.formStack) {
    DOM.formStack.value = data.stack;
  }
}

function parseAssetsLinks(value) {
  if (!value || !value.trim()) return null;

  // Split by comma or newline, trim and filter empty
  const links = value.split(/[,\n]/).map(link => link.trim()).filter(Boolean);

  if (links.length === 0) return null;

  // Validate URLs
  const validLinks = links.filter(link => URL_PATTERN.test(link));

  if (validLinks.length === 0) return null;

  // Return as JSON string
  return JSON.stringify(validLinks);
}

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function getPublicUuidValue() {
  if (!DOM.formPublic) return null;

  if (DOM.formPublic.checked) {
    if (AppState.currentTaskId) {
      const tasks = AppState.getTasks();
      const existingTask = tasks.find(t => t.id === AppState.currentTaskId);
      return existingTask?.public_uuid || generateUUID();
    } else {
      return generateUUID();
    }
  } else {
    return null; // Sempre null se não marcado, nunca undefined
  }
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
      is_recurring: DOM.formRecurring && DOM.formRecurring.checked ? 1 : 0,
      public_uuid: DOM.formPublic && DOM.formPublic.checked
        ? (AppState.currentTaskId ? (tasks.find(t => t.id === AppState.currentTaskId)?.public_uuid || generateUUID()) : generateUUID())
        : (DOM.formPublic && !DOM.formPublic.checked ? null : undefined),
      assets_link: DOM.formAssetsLink ? parseAssetsLinks(DOM.formAssetsLink.value) : null,
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

      clearFormDraft();
      closeModal();
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

      clearFormDraft();
      clearFormErrors();
      AppState.currentTaskId = null;

      requestAnimationFrame(() => {
        resetFormToDefaults();

        if (DOM.modalTitle) DOM.modalTitle.innerText = 'Novo Projeto';
        if (DOM.btnDelete) DOM.btnDelete.style.display = 'none';
        if (DOM.btnGeneratePDF) {
          DOM.btnGeneratePDF.style.display = 'none';
          DOM.btnGeneratePDF.classList.add('hidden');
        }

        const currentPath = window.location.pathname;
        if (currentPath !== '/projetos/novo') {
          window.history.pushState({ view: 'projects', taskId: 'new' }, '', '/projetos/novo');
        }

        requestAnimationFrame(() => {
          if (DOM.formClient) {
            DOM.formClient.focus();
          }
        });
      });
    }

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

if (typeof window.openModal === 'undefined') {
  window.openModal = openModal;
}
if (typeof window.closeModal === 'undefined') {
  window.closeModal = closeModal;
}
if (typeof window.setupPasteHandler === 'undefined') {
  window.setupPasteHandler = setupPasteHandler;
}

let formSaveTimeout = null;
let formAutoSaveSetup = false;

function setupFormAutoSave() {
  if (!DOM.formClient || formAutoSaveSetup) return;
  formAutoSaveSetup = true;

  const formFields = [
    DOM.formClient, DOM.formContact, DOM.formType, DOM.formStack,
    DOM.formDomain, DOM.formDesc, DOM.formPrice, DOM.formPayment,
    DOM.formDeadline, DOM.formHosting, DOM.formRecurring, DOM.formPublic,
    DOM.formAssetsLink
  ].filter(Boolean);

  formFields.forEach(field => {
    if (field.type === 'checkbox') {
      field.addEventListener('change', () => {
        if (formSaveTimeout) clearTimeout(formSaveTimeout);
        formSaveTimeout = setTimeout(() => {
          saveFormState();
        }, 1000);
      });
    } else {
      field.addEventListener('input', () => {
        if (formSaveTimeout) clearTimeout(formSaveTimeout);
        formSaveTimeout = setTimeout(() => {
          saveFormState();
        }, 1000);
      });
    }
  });
}
