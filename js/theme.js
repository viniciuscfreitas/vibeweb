// Theme Management Module

function getCurrentTheme() {
  const saved = localStorage.getItem(THEME_STORAGE_KEY);
  return saved || 'light';
}

function setTheme(theme) {
  const root = document.documentElement;
  root.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_STORAGE_KEY, theme);
  updateThemeIcon(theme);
}

function updateThemeIcon(theme) {
  const isDark = theme === 'dark';
  const isLight = theme === 'light';

  if (isDark) {
    if (DOM.dropdownThemeIcon) DOM.dropdownThemeIcon.className = 'fa-solid fa-sun';
    if (DOM.dropdownThemeText) DOM.dropdownThemeText.textContent = 'Tema Claro';
  } else if (isLight) {
    if (DOM.dropdownThemeIcon) DOM.dropdownThemeIcon.className = 'fa-solid fa-moon';
    if (DOM.dropdownThemeText) DOM.dropdownThemeText.textContent = 'Tema Escuro';
  }

  updateProfileModalThemeIcon(theme);
}

function updateProfileModalThemeIcon(theme) {
  const isDark = theme === 'dark';
  if (isDark) {
    if (DOM.profileModalThemeIcon) DOM.profileModalThemeIcon.className = 'fa-solid fa-sun';
    if (DOM.profileModalThemeText) DOM.profileModalThemeText.textContent = 'Tema Claro';
  } else {
    if (DOM.profileModalThemeIcon) DOM.profileModalThemeIcon.className = 'fa-solid fa-moon';
    if (DOM.profileModalThemeText) DOM.profileModalThemeText.textContent = 'Tema Escuro';
  }
}

function toggleTheme() {
  const currentTheme = getCurrentTheme();
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  setTheme(newTheme);
  AppState.log('Theme toggled', { theme: newTheme });
}

function initTheme() {
  const theme = getCurrentTheme();
  setTheme(theme);
}

window.ThemeManager = {
  getCurrentTheme,
  setTheme,
  toggleTheme,
  initTheme,
  updateThemeIcon
};
