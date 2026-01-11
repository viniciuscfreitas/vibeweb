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
let isDeletingItem = false;

function saveFormState() {
  if (!DOM.formClient || !DOM.modalOverlay || !DOM.modalOverlay.classList.contains('open')) return;

  const formState = {
    client: (DOM.formClient?.value || '').trim(),
    contact: (DOM.formContact?.value || '').trim(),
    type: DOM.formType?.value || '',
    stack: (DOM.formStack?.value || '').trim(),
    domain: (DOM.formDomain?.value || '').trim(),
    description: (DOM.formDesc?.value || '').trim(),
    price: (DOM.formPrice?.value || '').trim(),
    payment: DOM.formPayment?.value || '',
    deadline: (DOM.formDeadline?.value || '').trim(),
    hosting: DOM.formHosting?.checked ? HOSTING_YES : HOSTING_NO,
    recurring: DOM.formRecurring?.checked || false,
    public: DOM.formPublic?.checked || false,
    assetsLink: (DOM.formAssetsLink?.value || '').trim()
  };

  const formStateJson = JSON.stringify(formState);
  if (formStateJson === lastSavedFormState) return;

  const hasData = Object.values(formState).some(val => val !== '' && val !== false);
  if (hasData) {
    sessionStorage.setItem('formDraft', formStateJson);
    lastSavedFormState = formStateJson;
  } else {
    sessionStorage.removeItem('formDraft');
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
    if (DOM.formHosting) {
      const hostingValue = formState.hosting || HOSTING_NO;
      DOM.formHosting.checked = hostingValue === HOSTING_YES;
    }
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
    { el: DOM.formHosting, prop: 'checked', val: false },
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
  if (DOM.modalOverlay.classList.contains('open')) return;

  const isEditingExistingTask = !!task;
  AppState.currentTaskId = isEditingExistingTask && task?.id ? task.id : null;
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

  const modalTitle = isEditingExistingTask
    ? `Editar: ${task?.client || (task?.id ? `OS #${task.id}` : 'Projeto')}`
    : 'Novo Projeto';
  const pdfButtonDisplay = isEditingExistingTask ? 'block' : 'none';

  DOM.modalTitle.innerText = modalTitle;
  if (DOM.modalTitle) {
    DOM.modalTitle.setAttribute('data-editing', isEditingExistingTask ? 'true' : 'false');
  }

  if (DOM.modalEditBadge) {
    DOM.modalEditBadge.classList.toggle('hidden', !isEditingExistingTask);
  }

  if (DOM.btnDelete) {
    DOM.btnDelete.classList.toggle('hidden', !isEditingExistingTask);
  }
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
    if (DOM.formHosting) {
      DOM.formHosting.checked = hostingValue === HOSTING_YES;
    }

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

    const hasAdvancedData = !!(
      (task?.stack && typeof task.stack === 'string' && task.stack.trim()) ||
      (task?.domain && typeof task.domain === 'string' && task.domain.trim()) ||
      (task?.description && typeof task.description === 'string' && task.description.trim()) ||
      (task?.deadline && typeof task.deadline === 'string' && task.deadline.trim()) ||
      task?.payment_status !== PAYMENT_STATUS_PENDING ||
      task?.hosting === HOSTING_YES ||
      task?.is_recurring ||
      task?.public_uuid ||
      task?.assets_link
    );

    if (DOM.formAdvancedToggle && DOM.formAdvancedContent && hasAdvancedData) {
      DOM.formAdvancedToggle.setAttribute('aria-expanded', 'true');
      DOM.formAdvancedContent.setAttribute('aria-hidden', 'false');
    } else if (DOM.formAdvancedToggle && DOM.formAdvancedContent) {
      DOM.formAdvancedToggle.setAttribute('aria-expanded', 'false');
      DOM.formAdvancedContent.setAttribute('aria-hidden', 'true');
    }

    if (DOM.modalPreview) {
      const previewParts = [];
      if (task?.client) {
        previewParts.push(`Cliente: ${task.client}`);
      }
      if (task?.price !== undefined && task?.price !== null && task?.price !== '') {
        const priceNum = typeof task.price === 'number' ? task.price : parseFloat(task.price);
        if (!isNaN(priceNum) && isFinite(priceNum)) {
          previewParts.push(`Preço: €${priceNum.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
        } else if (task.price) {
          previewParts.push(`Preço: €${task.price}`);
        }
      }
      if (task?.type) {
        previewParts.push(`Tipo: ${task.type}`);
      }

      if (previewParts.length > 0) {
        const previewText = previewParts.join(' • ');
        if (DOM.modalPreview.textContent !== previewText) {
          DOM.modalPreview.textContent = previewText;
        }
        if (DOM.modalPreview.classList.contains('hidden')) {
          DOM.modalPreview.classList.remove('hidden');
        }
      } else {
        if (!DOM.modalPreview.classList.contains('hidden')) {
          DOM.modalPreview.classList.add('hidden');
        }
      }
    }

    updateFormProgress();

    if (typeof SubtaskManager !== 'undefined') {
      DOM.subtasksSection?.classList.remove('hidden');
      SubtaskManager.loadSubtasks(task.id);
    }

    setTimeout(() => {
      const firstEmptyField = findFirstEmptyField();
      if (firstEmptyField) {
        firstEmptyField.focus();
      } else if (DOM.formClient) {
        DOM.formClient.focus();
      }
    }, 100);
  } else {
    if (DOM.formAdvancedToggle && DOM.formAdvancedContent) {
      DOM.formAdvancedToggle.setAttribute('aria-expanded', 'false');
      DOM.formAdvancedContent.setAttribute('aria-hidden', 'true');
    }

    if (DOM.modalPreview) {
      DOM.modalPreview.classList.add('hidden');
    }

    const restored = restoreFormState();
    if (!restored) {
      resetFormToDefaults();
    }

    setTimeout(() => {
      if (DOM.formClient) {
        DOM.formClient.focus();
      }
    }, 100);

    DOM.subtasksSection?.classList.add('hidden');
  }

  setupInlineValidation();
  setupAdvancedSection();
  if (!isEditingExistingTask) {
    updateFormProgress();
  }
  trapFocusInModal();
  AppState.log('Modal opened', { isEditingExistingTask, taskId: AppState.currentTaskId });
}

function findFirstEmptyField() {
  const fields = [
    DOM.formClient,
    DOM.formContact,
    DOM.formType,
    DOM.formPrice,
    DOM.formStack,
    DOM.formDeadline,
    DOM.formDomain,
    DOM.formDesc
  ];

  for (const field of fields) {
    if (field && (!field.value || field.value.trim() === '')) {
      return field;
    }
  }
  return null;
}

function closeModal() {
  if (!DOM.modalOverlay) return;

  saveFormState();

  DOM.modalOverlay.classList.remove('open');
  DOM.modalOverlay.setAttribute('aria-hidden', 'true');
  clearFormErrors();
  if (DOM.subtaskList) DOM.subtaskList.innerHTML = '';
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

  lastProgressText = '';
  lastValidationState.client = { value: null, isValid: null };
  lastValidationState.contact = { value: null, isValid: null };
  lastValidationState.domain = { value: null, isValid: null };
  lastValidationState.price = { value: null, isValid: null };
}

const REQUIRED_FIELDS = [
  { el: () => DOM.formClient, name: 'Cliente' },
  { el: () => DOM.formType, name: 'Tipo' },
  { el: () => DOM.formPrice, name: 'Preço' }
];

let progressUpdateTimeout = null;
let lastProgressText = '';

function updateFormProgress() {
  if (!DOM.formProgressText) return;

  if (progressUpdateTimeout) {
    clearTimeout(progressUpdateTimeout);
  }

  progressUpdateTimeout = setTimeout(() => {
    let filledCount = 0;
    const totalCount = REQUIRED_FIELDS.length;

    for (let i = 0; i < REQUIRED_FIELDS.length; i++) {
      const field = REQUIRED_FIELDS[i];
      const el = field.el();
      if (el) {
        const value = el.value ? el.value.trim() : '';
        if (value !== '') {
          filledCount++;
        }
      }
    }

    const newText = `${filledCount} de ${totalCount} campos obrigatórios preenchidos`;
    if (newText !== lastProgressText) {
      DOM.formProgressText.textContent = newText;
      lastProgressText = newText;
    }
    progressUpdateTimeout = null;
  }, 100);
}

const lastValidationState = {
  client: { value: null, isValid: null },
  contact: { value: null, isValid: null },
  domain: { value: null, isValid: null },
  price: { value: null, isValid: null }
};

function validateFieldInline(fieldId, value) {
  if (value == null) return true;

  const trimmedValue = String(value).trim();
  const lastState = lastValidationState[fieldId];

  if (lastState && lastState.value === trimmedValue && lastState.isValid !== null) {
    return lastState.isValid;
  }

  let isValid = true;

  switch (fieldId) {
    case 'client':
      if (!trimmedValue) {
        showFormError('client', 'Nome do cliente é obrigatório');
        isValid = false;
      } else {
        clearFormError('client');
      }
      break;

    case 'contact':
      if (trimmedValue && !validateContact(trimmedValue)) {
        showFormError('contact', 'Formato inválido. Use email ou @username');
        isValid = false;
      } else {
        clearFormError('contact');
      }
      break;

    case 'domain':
      if (trimmedValue && !validateDomain(trimmedValue)) {
        showFormError('domain', 'Formato de URL/domínio inválido');
        isValid = false;
      } else {
        clearFormError('domain');
      }
      break;

    case 'price':
      if (!trimmedValue) {
        showFormError('price', 'Preço é obrigatório');
        isValid = false;
      } else {
        const price = parseFloat(trimmedValue);
        if (isNaN(price) || price < 0) {
          showFormError('price', 'Preço deve ser um número positivo');
          isValid = false;
        } else {
          clearFormError('price');
        }
      }
      break;

    default:
      return true;
  }

  lastValidationState[fieldId] = { value: trimmedValue, isValid };
  return isValid;
}

let inlineValidationHandlers = {
  client: { blur: null, input: null },
  contact: { blur: null, input: null },
  domain: { blur: null, input: null },
  price: { blur: null, input: null },
  type: { change: null }
};

function setupInlineValidation() {
  if (DOM.formClient && !inlineValidationHandlers.client.blur) {
    const blurHandler = () => {
      validateFieldInline('client', DOM.formClient.value);
      updateFormProgress();
    };
    const inputHandler = () => {
      if (DOM.formClient.classList.contains('error')) {
        validateFieldInline('client', DOM.formClient.value);
      }
      updateFormProgress();
    };
    DOM.formClient.addEventListener('blur', blurHandler);
    DOM.formClient.addEventListener('input', inputHandler);
    inlineValidationHandlers.client.blur = blurHandler;
    inlineValidationHandlers.client.input = inputHandler;
  }

  if (DOM.formContact && !inlineValidationHandlers.contact.blur) {
    const blurHandler = () => {
      validateFieldInline('contact', DOM.formContact.value);
    };
    const inputHandler = () => {
      if (DOM.formContact.classList.contains('error')) {
        validateFieldInline('contact', DOM.formContact.value);
      }
    };
    DOM.formContact.addEventListener('blur', blurHandler);
    DOM.formContact.addEventListener('input', inputHandler);
    inlineValidationHandlers.contact.blur = blurHandler;
    inlineValidationHandlers.contact.input = inputHandler;
  }

  if (DOM.formDomain && !inlineValidationHandlers.domain.blur) {
    const blurHandler = () => {
      validateFieldInline('domain', DOM.formDomain.value);
    };
    const inputHandler = () => {
      if (DOM.formDomain.classList.contains('error')) {
        validateFieldInline('domain', DOM.formDomain.value);
      }
    };
    DOM.formDomain.addEventListener('blur', blurHandler);
    DOM.formDomain.addEventListener('input', inputHandler);
    inlineValidationHandlers.domain.blur = blurHandler;
    inlineValidationHandlers.domain.input = inputHandler;
  }

  if (DOM.formPrice && !inlineValidationHandlers.price.blur) {
    const blurHandler = () => {
      validateFieldInline('price', DOM.formPrice.value);
      updateFormProgress();
    };
    const inputHandler = () => {
      if (DOM.formPrice.classList.contains('error')) {
        validateFieldInline('price', DOM.formPrice.value);
      }
      updateFormProgress();
    };
    DOM.formPrice.addEventListener('blur', blurHandler);
    DOM.formPrice.addEventListener('input', inputHandler);
    inlineValidationHandlers.price.blur = blurHandler;
    inlineValidationHandlers.price.input = inputHandler;
  }

  if (DOM.formType && !inlineValidationHandlers.type.change) {
    const changeHandler = () => {
      updateFormProgress();
    };
    DOM.formType.addEventListener('change', changeHandler);
    inlineValidationHandlers.type.change = changeHandler;
  }
}

let advancedToggleHandler = null;

function setupAdvancedSection() {
  if (!DOM.formAdvancedToggle || !DOM.formAdvancedContent) return;
  if (advancedToggleHandler) return;

  advancedToggleHandler = () => {
    const isExpanded = DOM.formAdvancedToggle.getAttribute('aria-expanded') === 'true';
    const newState = !isExpanded;

    DOM.formAdvancedToggle.setAttribute('aria-expanded', newState);
    DOM.formAdvancedContent.setAttribute('aria-hidden', !newState);
  };

  DOM.formAdvancedToggle.addEventListener('click', advancedToggleHandler);
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
    // Try to parse as JSON first
    const jsonData = JSON.parse(pastedText);
    if (typeof jsonData === 'object' && jsonData !== null) {
      populateFieldsFromJson(jsonData);
      parsed = true;
      e.preventDefault();
      NotificationManager.info('Campos preenchidos automaticamente!', 2000);
      return;
    }
  } catch (e) {
    // Not JSON, try line format
  }

  // Try line format: "Client: Name\nPrice: € 1000\n..."
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

  // If parsing failed, do nothing (silent fail is OK)
}

function parseLinesFormat(lines) {
  const data = {};

  lines.forEach(line => {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) return;

    const key = line.substring(0, colonIndex).trim().toLowerCase();
    const value = line.substring(colonIndex + 1).trim();

    if (!value) return;

    // Map Portuguese keys to form fields
    if (key.includes('cliente') || key.includes('nome') || key.includes('empresa')) {
      data.client = value;
    } else if (key.includes('preço') || key.includes('preco') || key.includes('valor') || key.includes('price')) {
      // Extract numbers, ignore "R$", "€", etc
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
    return null; // Always null if not checked, never undefined
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

  if (!DOM.formClient || !DOM.formPrice || !DOM.formType) {
    AppState.log('Form save failed: missing required form elements');
    return;
  }

  const clientName = DOM.formClient.value.trim();
  const priceValue = DOM.formPrice.value;
  const price = priceValue ? parseFloat(priceValue) : 0;

  const deadlineValue = DOM.formDeadline ? DOM.formDeadline.value.trim() : '';
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
      contact: DOM.formContact ? DOM.formContact.value.trim() : '',
      type: DOM.formType.value,
      stack: DOM.formStack ? DOM.formStack.value.trim() : '',
      domain: DOM.formDomain ? DOM.formDomain.value.trim() : '',
      description: DOM.formDesc ? DOM.formDesc.value.trim() : '',
      price: price,
      payment_status: DOM.formPayment ? DOM.formPayment.value : PAYMENT_STATUS_PENDING,
      deadline: deadline,
      hosting: DOM.formHosting && DOM.formHosting.checked ? HOSTING_YES : HOSTING_NO,
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

      if (typeof window.markLocalTaskAction === 'function') {
        window.markLocalTaskAction(AppState.currentTaskId);
      }

      // Normalize task to ensure defaults
      const normalizedTask = normalizeTasksData([updatedTaskFromServer])[0];

      // Update local state
      const updatedTasks = tasks.map(t => t.id === AppState.currentTaskId ? normalizedTask : t);
      AppState.setTasks(updatedTasks);
      AppState.log('Task updated', { taskId: AppState.currentTaskId });
      NotificationManager.success(`Projeto ${normalizedTask.client} atualizado!`);

      clearFormDraft();
      closeModal();
    } else {
      // Create new task
      const discoveryTasks = tasks.filter(t => t.col_id === DISCOVERY_COLUMN_ID);
      const maxOrder = discoveryTasks.length > 0
        ? Math.max(...discoveryTasks.map(t => t.order_position || 0))
        : -1;
      const newOrder = maxOrder + 1;

      const hours = parseDeadlineHours(formData.deadline);
      const deadline_timestamp = hours ? Date.now() : null;

      formData.col_id = DISCOVERY_COLUMN_ID;
      formData.order_position = newOrder;
      formData.deadline_timestamp = deadline_timestamp;

      const newTaskFromServer = await api.createTask(formData);
      const normalizedNewTask = normalizeTasksData([newTaskFromServer])[0];

      if (typeof window.markLocalTaskAction === 'function') {
        window.markLocalTaskAction(normalizedNewTask.id);
      }

      const updatedTasks = [...tasks, normalizedNewTask];
      AppState.setTasks(updatedTasks);
      AppState.log('Task created', { taskId: normalizedNewTask.id });
      NotificationManager.success(`Projeto ${normalizedNewTask.client} criado com sucesso!`);

      clearFormDraft();
      clearFormErrors();
      
      // Instead of closing modal, open it in edit mode for the new task
      // This allows adding subtasks immediately
      openModal(normalizedNewTask);
    }

    renderBoard();

    if (DOM.dashboardContainer.classList.contains('active')) {
      renderDashboard();
    } else if (DOM.financialContainer.classList.contains('active')) {
      resetFinancialRenderState();
      renderFinancial();
    }
  } catch (error) {
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

function showConfirmDialog(message, onConfirm, onCancel = null) {
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

  dialog.querySelector('#confirmCancel').addEventListener('click', () => {
    cleanup();
    if (onCancel) onCancel();
  });
  dialog.querySelector('#confirmOk').addEventListener('click', () => {
    cleanup();
    onConfirm();
  });

  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) {
      cleanup();
      if (onCancel) onCancel();
    }
  });
}

function deleteItem() {
  if (!AppState.currentTaskId) return;
  if (isDeletingItem) return;
  isDeletingItem = true;

  showConfirmDialog("Arquivar este projeto?", async () => {
    try {
      const taskId = AppState.currentTaskId;
      await api.deleteTask(taskId);

      if (typeof window.markLocalTaskAction === 'function') {
        window.markLocalTaskAction(taskId);
      }

      // Update local state
      const tasks = AppState.getTasks();
      const updatedTasks = tasks.filter(t => t.id !== taskId);
      AppState.setTasks(updatedTasks);
      AppState.log('Task deleted', { taskId });
      NotificationManager.success('Projeto arquivado com sucesso!');

      closeModal();
      renderBoard();

      if (DOM.dashboardContainer.classList.contains('active')) {
        renderDashboard();
      } else if (DOM.financialContainer.classList.contains('active')) {
        resetFinancialRenderState();
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
    } finally {
      isDeletingItem = false;
    }
  }, () => {
    isDeletingItem = false;
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
