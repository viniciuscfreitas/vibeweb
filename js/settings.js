// Settings and Profile Management Module
const SETTINGS_STORAGE_KEY = 'vibeTasks_settings';

function getDefaultSettings() {
  return {
    hostingPrice: HOSTING_PRICE_EUR,
    defaultTicket: DEFAULT_AVERAGE_TICKET,
    autoUpdate: true,
    showUrgent: true,
    urgentHours: URGENT_HOURS_48
  };
}

function getSettings() {
  try {
    const saved = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (saved) {
      return { ...getDefaultSettings(), ...JSON.parse(saved) };
    }
  } catch (e) {
    console.error('[Settings] Erro ao carregar configurações:', e);
  }
  return getDefaultSettings();
}

function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    AppState.log('Settings saved', settings);
    return true;
  } catch (e) {
    console.error('[Settings] Erro ao salvar configurações:', e);
    return false;
  }
}

async function loadSettingsIntoForm() {
  const settings = getSettings();
  if (DOM.settingsHostingPrice) DOM.settingsHostingPrice.value = settings.hostingPrice || '';
  if (DOM.settingsDefaultTicket) DOM.settingsDefaultTicket.value = settings.defaultTicket || '';
  if (DOM.settingsAutoUpdate) DOM.settingsAutoUpdate.checked = settings.autoUpdate !== false;
  if (DOM.settingsShowUrgent) DOM.settingsShowUrgent.checked = settings.showUrgent !== false;
  if (DOM.settingsUrgentHours) DOM.settingsUrgentHours.value = settings.urgentHours || URGENT_HOURS_48;

  const user = await getCurrentUser();
  if (user) {
    if (DOM.profileName) DOM.profileName.value = user.name || '';
    if (DOM.profileEmail) DOM.profileEmail.value = user.email || '';
    if (DOM.profileAvatarPreview) {
      if (user.avatar_url) {
        const fullUrl = user.avatar_url.startsWith('http') ? user.avatar_url : `${getApiBaseUrl()}${user.avatar_url}`;
        DOM.profileAvatarPreview.style.backgroundImage = `url(${fullUrl})`;
        DOM.profileAvatarPreview.style.backgroundSize = 'cover';
        DOM.profileAvatarPreview.textContent = '';
      } else {
        DOM.profileAvatarPreview.textContent = getInitials(user.name);
        DOM.profileAvatarPreview.style.backgroundImage = '';
      }
    }
    if (DOM.profileCurrentPassword) DOM.profileCurrentPassword.value = '';
    if (DOM.profileNewPassword) DOM.profileNewPassword.value = '';
  }
}

function getSettingsFromForm() {
  return {
    hostingPrice: parseFloat(DOM.settingsHostingPrice?.value) || HOSTING_PRICE_EUR,
    defaultTicket: parseFloat(DOM.settingsDefaultTicket?.value) || DEFAULT_AVERAGE_TICKET,
    autoUpdate: DOM.settingsAutoUpdate?.checked ?? true,
    showUrgent: DOM.settingsShowUrgent?.checked ?? true,
    urgentHours: parseInt(DOM.settingsUrgentHours?.value, 10) || URGENT_HOURS_48
  };
}

async function openSettingsModal() {
  if (!DOM.settingsModalOverlay || DOM.settingsModalOverlay.classList.contains('open')) return;
  await loadSettingsIntoForm();
  DOM.settingsModalOverlay.classList.remove('hidden');
  DOM.settingsModalOverlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeSettingsModal() {
  if (!DOM.settingsModalOverlay) return;
  DOM.settingsModalOverlay.classList.add('hidden');
  DOM.settingsModalOverlay.classList.remove('open');
  document.body.style.overflow = '';
}

async function handleAvatarUpload(file) {
  if (!file) return null;
  if (file.size > 2 * 1024 * 1024) throw new Error('Imagem muito grande (máx 2MB)');
  
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const result = await api.uploadAvatar(e.target.result);
        resolve(result.user);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function saveSettingsFromForm() {
  const settings = getSettingsFromForm();
  
  // Validations
  if (settings.hostingPrice < 0 || settings.hostingPrice > 10000) {
    NotificationManager.error('Preço de hospedagem inválido');
    return;
  }

  const nameRaw = DOM.profileName?.value.trim() || '';
  const emailRaw = DOM.profileEmail?.value.trim() || '';
  const currentPassword = DOM.profileCurrentPassword?.value || '';
  const newPassword = DOM.profileNewPassword?.value || '';

  const saveBtn = document.getElementById('btnSaveSettings');
  if (saveBtn) saveBtn.disabled = true;

  try {
    let userUpdated = false;

    // Avatar
    if (DOM.profileAvatar?.files?.[0]) {
      const updatedUser = await handleAvatarUpload(DOM.profileAvatar.files[0]);
      if (updatedUser) {
        setCurrentUser(updatedUser);
        userUpdated = true;
      }
    }

    // Profile Info
    if (nameRaw || emailRaw) {
      const updatedUser = await api.updateProfile(nameRaw || undefined, emailRaw || undefined);
      if (updatedUser) {
        setCurrentUser(updatedUser);
        userUpdated = true;
      }
    }

    // Password
    if (currentPassword && newPassword) {
      await api.updatePassword(currentPassword, newPassword);
      NotificationManager.success('Senha atualizada!');
    }

    if (saveSettings(settings)) {
      if (userUpdated && typeof renderUserAvatar === 'function') {
        await renderUserAvatar();
      }
      closeSettingsModal();
      NotificationManager.success('Configurações salvas!');
      const view = NavigationManager.getViewFromUrl();
      if (view === 'dashboard') renderDashboard();
      else if (view === 'financial') renderFinancial();
    }
  } catch (error) {
    NotificationManager.error(error.message || 'Erro ao salvar');
  } finally {
    if (saveBtn) saveBtn.disabled = false;
  }
}

// Add avatar preview listener
document.addEventListener('DOMContentLoaded', () => {
  if (DOM.profileAvatar) {
    DOM.profileAvatar.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file && DOM.profileAvatarPreview) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          DOM.profileAvatarPreview.style.backgroundImage = `url(${ev.target.result})`;
          DOM.profileAvatarPreview.style.backgroundSize = 'cover';
          DOM.profileAvatarPreview.textContent = '';
        };
        reader.readAsDataURL(file);
      }
    });
  }
});

window.SettingsManager = {
  getSettings,
  saveSettings,
  openSettingsModal,
  closeSettingsModal,
  saveSettingsFromForm
};

// Global event handlers for settings modal buttons (can't use addEventListener easily if DOM.init not called yet)
document.addEventListener('click', (e) => {
  if (e.target.id === 'btnSaveSettings') SettingsManager.saveSettingsFromForm();
  if (e.target.id === 'btnCancelSettings' || e.target.id === 'btnCloseSettingsModal') SettingsManager.closeSettingsModal();
});
