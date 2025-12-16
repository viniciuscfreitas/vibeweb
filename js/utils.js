// Utility Functions

const DEADLINE_HOURS_REGEX = /(\d+)h/i;

function parseDeadlineHours(deadlineStr) {
  const match = deadlineStr.match(DEADLINE_HOURS_REGEX);
  return match ? parseInt(match[1]) : null;
}

function calculateTimeRemaining(deadline, deadlineTimestamp) {
  if (!deadline || !deadlineTimestamp) return null;

  const hours = parseDeadlineHours(deadline);
  if (!hours) return deadline;

  const now = Date.now();
  const deadlineTime = deadlineTimestamp + (hours * MS_PER_HOUR);
  const remaining = deadlineTime - now;

  if (remaining <= 0) return DEADLINE_OVERDUE;

  const remainingHours = Math.floor(remaining / MS_PER_HOUR);
  const remainingMinutes = Math.floor((remaining % MS_PER_HOUR) / MS_PER_MINUTE);

  if (remainingHours >= 24) {
    const days = Math.floor(remainingHours / 24);
    const hoursLeft = remainingHours % 24;
    return `${days}d ${hoursLeft}h`;
  }

  if (remainingHours > 0) {
    return `${remainingHours}h ${remainingMinutes}m`;
  }

  return `${remainingMinutes}m`;
}

function formatDeadlineDisplay(deadline, deadlineTimestamp) {
  if (!deadline || deadline === DEADLINE_UNDEFINED) return null;

  const hours = parseDeadlineHours(deadline);
  if (hours && deadlineTimestamp) {
    return calculateTimeRemaining(deadline, deadlineTimestamp);
  }

  return deadline;
}

const CURRENCY_FORMATTER = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 0
});

const PRICE_FORMATTER = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2
});

// Format currency without decimals (for metrics, MRR, revenue)
function formatCurrency(value) {
  return CURRENCY_FORMATTER.format(value);
}

// Format price with decimals (for task prices)
function formatPrice(value) {
  return PRICE_FORMATTER.format(value);
}

function downloadCSV(csv, filename) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Escape HTML to prevent XSS attacks
function escapeHtml(text) {
  if (text == null) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}


function getLastMonthInfo(currentMonth, currentYear) {
  if (currentMonth === 0) {
    return { month: 11, year: currentYear - 1 };
  }
  return { month: currentMonth - 1, year: currentYear };
}

function calculateRevenueChange(currentRevenue, lastRevenue) {
  if (lastRevenue <= 0) {
    return 0;
  }
  return ((currentRevenue - lastRevenue) / lastRevenue * 100).toFixed(1);
}

function getTimeAgo(date) {
  if (!date || !(date instanceof Date)) {
    return 'agora';
  }

  const now = Date.now();
  const diff = now - date.getTime();

  // Handle negative diff (date in future due to timezone issues) or very recent (< 1 min)
  if (diff < 0 || diff < MS_PER_MINUTE) {
    return 'agora';
  }

  const minutes = Math.floor(diff / MS_PER_MINUTE);
  const hours = Math.floor(diff / MS_PER_HOUR);
  const days = Math.floor(diff / MS_PER_DAY);

  // Check larger units first to avoid incorrect display (e.g., 90 minutes should show as hours)
  if (days >= 7) {
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  }
  if (hours >= 24) {
    return `${days}d atrás`;
  }
  if (hours >= 1) {
    return `${hours}h atrás`;
  }
  return `${minutes}m atrás`;
}

// Normalize task data from backend - ensure defaults for edge cases
function normalizeTasksData(tasks) {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    return tasks || [];
  }

  try {
    return tasks.map(task => {
      if (!task || typeof task !== 'object') {
        return task;
      }

      if (task.hosting === undefined || task.hosting === null) {
        return { ...task, hosting: HOSTING_NO };
      }

      // Backend now always provides deadline_timestamp when deadline exists
      // Legacy data without timestamp will have null, which is handled by display logic

      return task;
    });
  } catch (error) {
    console.error('[Normalize] Erro ao normalizar dados:', error);
    return tasks;
  }
}
