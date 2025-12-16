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
    notification.setAttribute('role', 'alert');

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

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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
  }
};
