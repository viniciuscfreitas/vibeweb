// Utility Functions

const DEADLINE_HOURS_REGEX = /(\d+)h/i;

function getApiBaseUrl() {
  const isFileProtocol = window.location.protocol === 'file:';
  const isLocalhost = window.location.hostname === 'localhost' ||
                      window.location.hostname === '127.0.0.1' ||
                      window.location.hostname === '' ||
                      isFileProtocol;
  return isLocalhost ? 'http://localhost:3000' : '';
}

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
    return 'Agora';
  }

  const now = Date.now();
  const diff = now - date.getTime();

  if (diff < 0) {
    return 'Agora';
  }

  if (diff < MS_PER_MINUTE) {
    return 'Agora';
  }

  const days = Math.floor(diff / MS_PER_DAY);

  if (days >= 365) {
    const years = Math.floor(days / 365);
    return years === 1 ? '1 ano atrás' : `${years} anos atrás`;
  }

  if (days >= 30) {
    const months = Math.floor(days / 30);
    return months === 1 ? '1 mês atrás' : `${months} meses atrás`;
  }

  if (days >= 7) {
    const weeks = Math.floor(days / 7);
    return weeks === 1 ? '1 semana atrás' : `${weeks} semanas atrás`;
  }

  if (days >= 1) {
    return days === 1 ? '1 dia atrás' : `${days} dias atrás`;
  }

  const hours = Math.floor(diff / MS_PER_HOUR);
  if (hours >= 1) {
    return hours === 1 ? '1 hora atrás' : `${hours} horas atrás`;
  }

  const minutes = Math.floor(diff / MS_PER_MINUTE);
  return minutes === 1 ? '1 minuto atrás' : `${minutes} minutos atrás`;
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

function generateInvoice(taskData) {
  // Verificar se jsPDF está disponível
  if (typeof window.jspdf === 'undefined' && typeof jspdf === 'undefined') {
    NotificationManager.error('Biblioteca jsPDF não carregada. Recarregue a página.');
    return;
  }

  try {
    const { jsPDF } = window.jspdf || jspdf;
    const doc = new jsPDF();

    // Configurações
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 20;
    let yPos = margin;

    // Header
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('PROPOSTA COMERCIAL', pageWidth / 2, yPos, { align: 'center' });
    yPos += 15;

    // Linha separadora
    doc.setLineWidth(0.5);
    doc.line(margin, yPos, pageWidth - margin, yPos);
    yPos += 10;

    // Cliente
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Cliente:', margin, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(taskData.client || 'N/A', margin + 30, yPos);
    yPos += 10;

    // Tipo de Projeto
    if (taskData.type) {
      doc.setFont('helvetica', 'bold');
      doc.text('Tipo:', margin, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text(taskData.type, margin + 30, yPos);
      yPos += 10;
    }

    // Stack
    if (taskData.stack) {
      doc.setFont('helvetica', 'bold');
      doc.text('Stack:', margin, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text(taskData.stack, margin + 30, yPos);
      yPos += 10;
    }

    // Domínio
    if (taskData.domain) {
      doc.setFont('helvetica', 'bold');
      doc.text('Domínio:', margin, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text(taskData.domain, margin + 30, yPos);
      yPos += 10;
    }

    yPos += 5;

    // Descrição
    if (taskData.description) {
      doc.setFont('helvetica', 'bold');
      doc.text('Descrição:', margin, yPos);
      yPos += 7;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      const descriptionLines = doc.splitTextToSize(taskData.description, pageWidth - 2 * margin);
      doc.text(descriptionLines, margin, yPos);
      yPos += descriptionLines.length * 5 + 5;
    }

    yPos += 5;

    // Linha separadora antes do preço
    doc.setLineWidth(0.5);
    doc.line(margin, yPos, pageWidth - margin, yPos);
    yPos += 10;

    // Preço
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    const priceText = `Valor: ${formatPrice(taskData.price || 0)}`;
    doc.text(priceText, margin, yPos);
    yPos += 10;

    // Status de Pagamento
    if (taskData.payment_status) {
      doc.setFontSize(12);
      doc.setFont('helvetica', 'normal');
      doc.text(`Status: ${taskData.payment_status}`, margin, yPos);
      yPos += 8;
    }

    // Hosting
    if (taskData.hosting === HOSTING_YES) {
      doc.setFontSize(10);
      doc.setFont('helvetica', 'italic');
      doc.text('Inclui hospedagem: €29/mês', margin, yPos);
      yPos += 8;
    }

    // Data
    yPos += 5;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    const dateText = `Gerado em: ${new Date().toLocaleDateString('pt-BR')}`;
    doc.text(dateText, margin, yPos);

    // Footer
    const footerY = doc.internal.pageSize.getHeight() - 15;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.text('VibeWeb OS - Sistema de Gestão de Projetos', pageWidth / 2, footerY, { align: 'center' });

    // Salvar PDF
    const filename = `proposta-${(taskData.client || 'projeto').replace(/[^a-z0-9]/gi, '-').toLowerCase()}.pdf`;
    doc.save(filename);
  } catch (error) {
    console.error('[PDF Generator] Erro ao gerar PDF:', error);
    NotificationManager.error('Erro ao gerar PDF. Tente novamente.');
  }
}
