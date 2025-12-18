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

function getTimeAgo(date, currentTime = null) {
  if (!date) {
    return 'Agora';
  }

  if (!(date instanceof Date)) {
    return 'Agora';
  }

  const dateTime = date.getTime();
  if (isNaN(dateTime)) {
    return 'Agora';
  }

  const now = currentTime ?? Date.now();
  const diff = now - dateTime;

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
  return new Promise((resolve, reject) => {
    if (typeof window.jspdf === 'undefined' && typeof jspdf === 'undefined') {
      NotificationManager.error('Biblioteca jsPDF não carregada. Recarregue a página.');
      reject(new Error('jsPDF not loaded'));
      return;
    }

    try {
      const { jsPDF } = window.jspdf || jspdf;
      const doc = new jsPDF();

      const layout = {
        margin: 20,
        pageWidth: doc.internal.pageSize.getWidth(),
        pageHeight: doc.internal.pageSize.getHeight(),
        lineHeight: 7
      };

      const contentWidth = layout.pageWidth - 2 * layout.margin;
      const pageBottomThreshold = layout.pageHeight - 30;
      const footerY = layout.pageHeight - 15;

      const numberFormatter = typeof formatPrice === 'function' ? null : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'EUR' });
      const formatCurrency = (val) => {
        if (typeof formatPrice === 'function') return formatPrice(val);
        if (numberFormatter) return numberFormatter.format(val);
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'EUR' }).format(val);
      };

      const now = new Date();
      const dateText = `Gerado em: ${now.toLocaleDateString('pt-BR')}`;
      const dateStr = now.toISOString().split('T')[0];
      let yPos = layout.margin;

      // Header
      doc.setFontSize(24);
      doc.setFont('helvetica', 'bold');
      doc.text('PROPOSTA COMERCIAL', layout.pageWidth / 2, yPos, { align: 'center' });
      yPos += 12;

      // Linha separadora
      doc.setLineWidth(1);
      doc.setDrawColor(100, 100, 100);
      doc.line(layout.margin, yPos, layout.pageWidth - layout.margin, yPos);
      yPos += 12;

      // Seção: Informações do Cliente
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 0, 0);
      doc.text('INFORMAÇÕES DO CLIENTE', layout.margin, yPos);
      yPos += 8;

      // Cliente
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('Cliente:', layout.margin, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text(taskData.client || 'N/A', layout.margin + 35, yPos);
      yPos += 7;

      // Contato
      if (taskData.contact) {
        doc.setFont('helvetica', 'bold');
        doc.text('Contato:', layout.margin, yPos);
        doc.setFont('helvetica', 'normal');
        doc.text(taskData.contact, layout.margin + 35, yPos);
        yPos += 7;
      }

      yPos += 5;

      // Seção: Detalhes do Projeto
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('DETALHES DO PROJETO', layout.margin, yPos);
      yPos += 8;

      // Tipo de Projeto
      if (taskData.type) {
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('Tipo:', layout.margin, yPos);
        doc.setFont('helvetica', 'normal');
        doc.text(taskData.type, layout.margin + 35, yPos);
        yPos += 7;
      }

      // Stack
      if (taskData.stack) {
        doc.setFont('helvetica', 'bold');
        doc.text('Stack:', layout.margin, yPos);
        doc.setFont('helvetica', 'normal');
        doc.text(taskData.stack, layout.margin + 35, yPos);
        yPos += 7;
      }

      // Domínio
      if (taskData.domain) {
        doc.setFont('helvetica', 'bold');
        doc.text('Domínio:', layout.margin, yPos);
        doc.setFont('helvetica', 'normal');
        doc.text(taskData.domain, layout.margin + 35, yPos);
        yPos += 7;
      }

      yPos += 5;

      // Descrição
      if (taskData.description) {
        doc.setFont('helvetica', 'bold');
        doc.text('Descrição:', layout.margin, yPos);
        yPos += 7;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        const descriptionLines = doc.splitTextToSize(taskData.description, contentWidth);
        const descriptionHeight = descriptionLines.length * 5;
        if (yPos + descriptionHeight > pageBottomThreshold) {
          doc.addPage();
          yPos = layout.margin;
        }
        doc.text(descriptionLines, layout.margin, yPos);
        yPos += descriptionHeight + 5;
      }

      yPos += 5;

      // Linha separadora antes do preço
      yPos += 5;
      doc.setLineWidth(1);
      doc.setDrawColor(100, 100, 100);
      doc.line(layout.margin, yPos, layout.margin + contentWidth, yPos);
      yPos += 12;

      // Preço - Destaque visual
      doc.setFontSize(22);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 0, 0);
      const priceText = `Valor Total: ${formatCurrency(taskData.price || 0)}`;
      doc.text(priceText, layout.margin, yPos);
      yPos += 12;

      // Status de Pagamento
      if (taskData.payment_status) {
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 100, 100);
        doc.text(`Status de Pagamento: ${taskData.payment_status}`, layout.margin, yPos);
        yPos += 8;
      }

      // Prazo
      if (taskData.deadline) {
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('Prazo:', labelX, yPos);
        doc.setFont('helvetica', 'normal');
        doc.text(taskData.deadline, deadlineValueX, yPos);
        yPos += 10;
      }

      // Hosting
      if (taskData.hosting === HOSTING_YES) {
        doc.setFontSize(10);
        doc.setFont('helvetica', 'italic');
        doc.text('Inclui hospedagem: €29/mês', layout.margin, yPos);
        yPos += 8;
      }

      // Links de Anexos
      if (taskData.assets_link) {
        yPos += 5;
        let assetsLinks = [];

        if (Array.isArray(taskData.assets_link)) {
          assetsLinks = taskData.assets_link;
        } else if (typeof taskData.assets_link === 'string') {
          const trimmed = taskData.assets_link.trim();
          if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
            try {
              const parsed = JSON.parse(taskData.assets_link);
              assetsLinks = Array.isArray(parsed) ? parsed : [taskData.assets_link];
            } catch (e) {
              assetsLinks = [taskData.assets_link];
            }
          } else if (taskData.assets_link.includes('\n')) {
            assetsLinks = taskData.assets_link.split('\n').filter(link => link.trim());
          } else if (taskData.assets_link.includes(',')) {
            assetsLinks = taskData.assets_link.split(',').map(link => link.trim()).filter(link => link);
          } else {
            assetsLinks = [taskData.assets_link];
          }
        } else {
          assetsLinks = [String(taskData.assets_link)];
        }

        if (assetsLinks.length > 0) {
          doc.setFontSize(10);
          doc.setFont('helvetica', 'bold');
          doc.text('Links de Anexos:', layout.margin, yPos);
          yPos += 7;
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(9);
          assetsLinks.forEach((link) => {
            if (yPos > pageBottomThreshold) {
              doc.addPage();
              yPos = layout.margin;
            }
            const linkStr = String(link);
            const linkText = linkStr.length > 60 ? linkStr.substring(0, 57) + '...' : linkStr;
            doc.text(linkText, layout.margin + 5, yPos);
            yPos += 6;
          });
          yPos += 3;
        }
      }

      // Data
      yPos += 5;
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text(dateText, layout.margin, yPos);

      // Footer
      doc.setFontSize(8);
      doc.setFont('helvetica', 'italic');
      doc.text('VibeWeb OS - Sistema de Gestão de Projetos', layout.pageWidth / 2, footerY, { align: 'center' });

      // Salvar PDF
      const clientName = (taskData.client || 'projeto')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .trim()
        .replace(/\s+/g, '-');
      const filename = `proposta-${clientName}-${dateStr}.pdf`;

      doc.save(filename);
      resolve();
  } catch (error) {
    console.error('[PDF Generator] Erro ao gerar PDF:', error);
    reject(error);
  }
  });
}
