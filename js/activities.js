// Activities Logic
let activitiesPage = 0;
const activitiesPerPage = 50;
let allActivitiesLoaded = false;

async function renderActivities(append = false) {
  if (!DOM.activitiesListFull) return;

  if (!append) {
    activitiesPage = 0;
    allActivitiesLoaded = false;
    DOM.activitiesListFull.innerHTML = '<div class="loading-state">Carregando atividades…</div>';
    if (DOM.activitiesLoadMore) DOM.activitiesLoadMore.classList.add('hidden');
  }

  try {
    const limit = activitiesPerPage;
    const activities = await api.getActivities(limit, activitiesPage * limit);

    if (!append) DOM.activitiesListFull.innerHTML = '';

    if (!activities || activities.length === 0) {
      if (!append) {
        DOM.activitiesListFull.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon"><i class="fa-solid fa-clock-rotate-left"></i></div>
            <div class="empty-state-text">Nenhuma atividade encontrada</div>
          </div>
        `;
      }
      allActivitiesLoaded = true;
      if (DOM.activitiesLoadMore) DOM.activitiesLoadMore.classList.add('hidden');
      return;
    }

    const tasks = AppState.getTasks();
    const currentTime = Date.now();
    const fragment = document.createDocumentFragment();

    const iconMap = {
      'create': 'fa-plus-circle',
      'move': 'fa-arrows-left-right',
      'update': 'fa-edit',
      'delete': 'fa-trash'
    };

    activities.forEach(activity => {
      const activityDate = parseTaskDate(activity.created_at);
      const timeDisplay = activityDate ? getTimeAgo(activityDate, currentTime) : 'Agora';
      const userName = activity.user_name || 'Usuário';
      const initials = getInitials(userName);
      const apiBaseUrl = getApiBaseUrl();
      const userAvatarUrl = activity.user_avatar_url
        ? (activity.user_avatar_url.startsWith('http') ? activity.user_avatar_url : `${apiBaseUrl}${activity.user_avatar_url}`)
        : null;

      const item = document.createElement('div');
      item.className = 'activity-full-item';
      
      const icon = iconMap[activity.action_type] || 'fa-file-invoice';
      
      const userBadgeHtml = userAvatarUrl
        ? `<div class="activity-user-badge" title="${escapeHtml(userName)}" style="background-image: url('${escapeHtml(userAvatarUrl)}'); background-size: cover; background-position: center;"></div>`
        : `<div class="activity-user-badge" title="${escapeHtml(userName)}">${escapeHtml(initials)}</div>`;

      item.innerHTML = `
        <div class="activity-full-icon ${activity.action_type}">
          <i class="fa-solid ${icon}"></i>
        </div>
        <div class="activity-full-content">
          <div class="activity-full-header">
            <span class="activity-full-description">${escapeHtml(activity.action_description)}</span>
            <span class="activity-full-time">${timeDisplay}</span>
          </div>
          <div class="activity-full-meta">
            ${userBadgeHtml}
            <span class="activity-full-user">${escapeHtml(userName)}</span>
          </div>
          ${renderActivityDetails(activity)}
        </div>
      `;

      if (activity.task_id) {
        const task = tasks.find(t => t.id === activity.task_id);
        if (task) {
          item.classList.add('clickable');
          item.onclick = () => openModal(task);
        }
      }

      fragment.appendChild(item);
    });

    DOM.activitiesListFull.appendChild(fragment);

    if (activities.length < limit) {
      allActivitiesLoaded = true;
      if (DOM.activitiesLoadMore) DOM.activitiesLoadMore.classList.add('hidden');
    } else {
      if (DOM.activitiesLoadMore) DOM.activitiesLoadMore.classList.remove('hidden');
    }

  } catch (error) {
    console.error('[Activities] Error rendering activities:', error);
    if (!append) {
      DOM.activitiesListFull.innerHTML = '<div class="error-state">Erro ao carregar atividades.</div>';
    }
  }
}

function renderActivityDetails(activity) {
  if (!activity.old_data && !activity.new_data) return '';
  
  try {
    const oldData = activity.old_data ? JSON.parse(activity.old_data) : null;
    const newData = activity.new_data ? JSON.parse(activity.new_data) : null;
    
    if (!oldData && !newData) return '';

    // Simple diff display for common fields
    let diffHtml = '<div class="activity-diff">';
    
    const fields = {
      'client': 'Cliente',
      'price': 'Preço',
      'col_id': 'Coluna',
      'payment_status': 'Pagamento'
    };

    const colNames = ['Descoberta', 'Acordo', 'Build', 'Live'];

    for (const [field, label] of Object.entries(fields)) {
      const oldVal = oldData ? oldData[field] : undefined;
      const newVal = newData ? newData[field] : undefined;

      if (oldVal !== undefined && newVal !== undefined && oldVal !== newVal) {
        let displayOld = oldVal;
        let displayNew = newVal;

        if (field === 'col_id') {
          displayOld = colNames[oldVal] || oldVal;
          displayNew = colNames[newVal] || newVal;
        } else if (field === 'price') {
          displayOld = formatCurrency(oldVal);
          displayNew = formatCurrency(newVal);
        }

        diffHtml += `
          <div class="diff-row">
            <span class="diff-label">${label}:</span>
            <span class="diff-old">${escapeHtml(String(displayOld))}</span>
            <i class="fa-solid fa-arrow-right"></i>
            <span class="diff-new">${escapeHtml(String(displayNew))}</span>
          </div>
        `;
      }
    }
    
    diffHtml += '</div>';
    return diffHtml;
  } catch (e) {
    return '';
  }
}

function setupActivitiesListeners() {
  if (DOM.activitiesLoadMore) {
    const btn = DOM.activitiesLoadMore.querySelector('button');
    if (btn) {
      btn.onclick = () => {
        activitiesPage++;
        renderActivities(true);
      };
    }
  }
}

// Initialize listeners when the script loads
// Note: DOM elements might not be ready yet, so we'll call this from main.js or initApp
window.renderActivities = renderActivities;
window.setupActivitiesListeners = setupActivitiesListeners;
