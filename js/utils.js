// Utility Functions

function parseDeadlineHours(deadlineStr) {
  const match = deadlineStr.match(/(\d+)h/i);
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

function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0
  }).format(value);
}

function formatPrice(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'EUR'
  }).format(value);
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


function getLastMonthInfo(currentMonth, currentYear) {
  if (currentMonth === 0) {
    return { month: 11, year: currentYear - 1 };
  }
  return { month: currentMonth - 1, year: currentYear };
}

function calculateRevenueChange(currentRevenue, lastRevenue) {
  if (lastRevenue > 0) {
    return ((currentRevenue - lastRevenue) / lastRevenue * 100).toFixed(1);
  }
  return 0;
}

function getTimeAgo(date) {
  const now = Date.now();
  const diff = now - date.getTime();
  const minutes = Math.floor(diff / MS_PER_MINUTE);
  const hours = Math.floor(diff / MS_PER_HOUR);
  const days = Math.floor(diff / MS_PER_DAY);

  if (minutes < 60) return `${minutes}m atrás`;
  if (hours < 24) return `${hours}h atrás`;
  if (days < 7) return `${days}d atrás`;
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

// Normalize task data from backend - ensure defaults for edge cases
// Backend uses snake_case (col_id, order_position, payment_status, deadline_timestamp)
// Frontend uses same naming convention - no field mapping needed
// This function only sets default values for missing fields:
// - hosting: defaults to HOSTING_NO if missing (for legacy data or edge cases)
// - deadline_timestamp: sets from task.id if deadline exists but timestamp missing (legacy data)
// NOTE: Backend should always return these fields, but this protects against edge cases
function normalizeTasksData(tasks) {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    return tasks || [];
  }

  try {
    return tasks.map(task => {
      if (!task || typeof task !== 'object') {
        return task;
      }

      const normalized = { ...task };

      // Set default hosting if missing (edge case: legacy data or missing field)
      if (normalized.hosting === undefined || normalized.hosting === null) {
        normalized.hosting = HOSTING_NO;
      }

      // Set default deadline_timestamp if deadline exists but timestamp doesn't (legacy data)
      if (normalized.deadline && !normalized.deadline_timestamp) {
        const deadlineHours = parseDeadlineHours(normalized.deadline);
        if (deadlineHours && normalized.id) {
          // Use task ID as fallback timestamp for legacy data
          normalized.deadline_timestamp = normalized.id;
        }
      }

      return normalized;
    });
  } catch (error) {
    console.error('[Normalize] Erro ao normalizar dados:', error);
    return tasks;
  }
}
