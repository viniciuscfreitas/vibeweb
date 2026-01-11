// Notification System - Simple toast notifications
// Replaces alert() with touch-friendly, standardized notifications

const NotificationManager = {
  container: null,
  queue: [],
  isShowing: false,

  init() {
    if (this.container) return;

    this.container = document.createElement('div');
    this.container.className = 'notification-container';
    this.container.setAttribute('aria-live', 'polite');
    this.container.setAttribute('aria-atomic', 'true');
    document.body.appendChild(this.container);
  },

  show(message, type = 'info', duration = 4000) {
    this.init();

    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    // Removed role="alert" - container already has aria-live="polite"

    const icon = this.getIcon(type);
    notification.innerHTML = `
      <div class="notification-content">
        <i class="${icon}" aria-hidden="true"></i>
        <span class="notification-message">${this.escapeHtml(message)}</span>
      </div>
      <button class="notification-close" aria-label="Fechar notificação" type="button">
        <i class="fa-solid fa-xmark" aria-hidden="true"></i>
      </button>
    `;

    const closeBtn = notification.querySelector('.notification-close');
    const closeNotification = () => {
      this.hide(notification);
    };

    closeBtn.addEventListener('click', closeNotification);
    notification._closeHandler = closeNotification;

    this.container.appendChild(notification);

    requestAnimationFrame(() => {
      notification.classList.add('show');
    });

    if (duration > 0) {
      setTimeout(() => {
        if (notification.parentNode) {
          this.hide(notification);
        }
      }, duration);
    }

    return notification;
  },

  hide(notification) {
    if (!notification || !notification.parentNode) return;

    notification.classList.remove('show');
    notification.classList.add('hide');

    setTimeout(() => {
      if (notification.parentNode) {
        const closeBtn = notification.querySelector('.notification-close');
        if (closeBtn && notification._closeHandler) {
          closeBtn.removeEventListener('click', notification._closeHandler);
        }
        notification.parentNode.removeChild(notification);
      }
    }, 300);
  },

  getIcon(type) {
    const icons = {
      success: 'fa-solid fa-check-circle',
      error: 'fa-solid fa-exclamation-circle',
      warning: 'fa-solid fa-triangle-exclamation',
      info: 'fa-solid fa-info-circle'
    };
    return icons[type] || icons.info;
  },

  success(message, duration) {
    return this.show(message, 'success', duration);
  },

  error(message, duration) {
    return this.show(message, 'error', duration);
  },

  warning(message, duration) {
    return this.show(message, 'warning', duration);
  },

  info(message, duration) {
    return this.show(message, 'info', duration);
  },

  showUserActivity(message, userName, userAvatarUrl, type = 'info', duration = 5000) {
    this.init();

    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;

    const userInitials = userName ? getInitials(userName) : '?';
    const escapedUserName = escapeHtml(userName || 'Usuário');
    const escapedMessage = escapeHtml(message);
    
    let avatarUrl = userAvatarUrl;
    if (avatarUrl && !avatarUrl.startsWith('http')) {
      avatarUrl = `${getApiBaseUrl()}${avatarUrl}`;
    }

    const sanitizeCssUrl = (url) => url ? url.replace(/'/g, "\\'").replace(/\)/g, '\\)') : '';
    const sanitizedAvatarUrl = avatarUrl ? sanitizeCssUrl(avatarUrl) : null;
    const escapedInitials = escapeHtml(userInitials);

    const userBadgeHtml = sanitizedAvatarUrl
      ? `<div class="notification-user-badge" title="${escapedUserName}" style="background-image: url('${sanitizedAvatarUrl}'); background-size: cover; background-position: center; background-color: transparent; color: transparent;">${escapedInitials}</div>`
      : `<div class="notification-user-badge" title="${escapedUserName}">${escapedInitials}</div>`;

    notification.innerHTML = `
      <div class="notification-content">
        ${userBadgeHtml}
        <div class="notification-message-wrapper">
          <span class="notification-message">${escapedMessage}</span>
          <span class="notification-user-name">${escapedUserName}</span>
        </div>
      </div>
      <button class="notification-close" aria-label="Fechar notificação" type="button">
        <i class="fa-solid fa-xmark" aria-hidden="true"></i>
      </button>
    `;

    const closeBtn = notification.querySelector('.notification-close');
    const closeNotification = () => this.hide(notification);

    closeBtn.addEventListener('click', closeNotification);
    notification._closeHandler = closeNotification;

    this.container.appendChild(notification);
    requestAnimationFrame(() => notification.classList.add('show'));

    if (duration > 0) {
      setTimeout(() => {
        if (notification.parentNode) this.hide(notification);
      }, duration);
    }

    return notification;
  }
};


