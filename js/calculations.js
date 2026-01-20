function calculateMRR(tasks) {
  const settings = getSettings();
  const liveTasks = tasks.filter(t => t.col_id === 3 && t.hosting === HOSTING_YES);
  return liveTasks.length * settings.hostingPrice;
}

function calculateMRRGaps(mrr, hostingPrice) {
  const gap10k = Math.max(0, TARGET_MRR_10K - mrr);
  const gap20k = Math.max(0, TARGET_MRR_20K - mrr);
  // If hosting price is not configured or invalid, return gaps without upsells calculation
  // This prevents division by zero and provides clearer feedback that hosting price needs to be set
  if (!hostingPrice || hostingPrice <= 0 || !isFinite(hostingPrice)) {
    return { 
      gap10k, 
      gap20k, 
      upsellsNeeded10k: null, // null indicates hosting price not configured
      upsellsNeeded20k: null 
    };
  }
  const upsellsNeeded10k = Math.ceil(gap10k / hostingPrice);
  const upsellsNeeded20k = Math.ceil(gap20k / hostingPrice);
  return { gap10k, gap20k, upsellsNeeded10k, upsellsNeeded20k };
}

function parseTaskDate(dateString) {
  if (!dateString) return null;
  const date = new Date(dateString);
  return isNaN(date.getTime()) ? null : date;
}

function calculateRevenueForMonth(tasks, month, year) {
  if (!tasks || !Array.isArray(tasks)) return 0;
  const monthTasks = tasks.filter(t => {
    const taskDate = parseTaskDate(t.created_at);
    if (!taskDate) return false;
    return taskDate.getMonth() === month &&
      taskDate.getFullYear() === year &&
      (t.payment_status === PAYMENT_STATUS_PAID || t.payment_status === PAYMENT_STATUS_PARTIAL);
  });
  return monthTasks.reduce((sum, t) => sum + (parseFloat(t.price) || 0), 0);
}

function calculateAverageTicket(tasks) {
  if (!tasks || !Array.isArray(tasks)) return 0;
  const paidTasks = tasks.filter(t =>
    t.payment_status === PAYMENT_STATUS_PAID || t.payment_status === PAYMENT_STATUS_PARTIAL
  );
  if (paidTasks.length === 0) return 0;

  const totalRevenue = paidTasks.reduce((sum, t) => sum + (parseFloat(t.price) || 0), 0);
  return totalRevenue / paidTasks.length;
}

function calculateProjectCountsByStatus(tasks) {
  if (!tasks || !Array.isArray(tasks)) return { discoveryCount: 0, agreementCount: 0, buildCount: 0, liveCount: 0, activeProjects: 0 };
  const discoveryCount = tasks.filter(t => t.col_id === 0).length;
  const agreementCount = tasks.filter(t => t.col_id === 1).length;
  const buildCount = tasks.filter(t => t.col_id === 2).length;
  const liveCount = tasks.filter(t => t.col_id === 3).length;
  const activeProjects = agreementCount + buildCount;
  return { discoveryCount, agreementCount, buildCount, liveCount, activeProjects };
}

function isTaskUrgent(task, now, urgentHours = null) {
  if (urgentHours === null) {
    urgentHours = getSettings().urgentHours;
  }
  const urgentHoursMs = urgentHours * MS_PER_HOUR;

  const isInBuildWithoutDeadline = task.col_id === 2 && (!task.deadline || task.deadline === DEADLINE_UNDEFINED);
  if (isInBuildWithoutDeadline) return true;

  const hasNoDeadline = !task.deadline || task.deadline === DEADLINE_UNDEFINED;
  if (hasNoDeadline) return false;

  const isUrgentKeyword = URGENT_DEADLINES.includes(task.deadline);
  if (isUrgentKeyword) return true;
  const hasDeadlineTimestamp = task.deadline_timestamp !== null && task.deadline_timestamp !== undefined;
  if (!hasDeadlineTimestamp) return false;

  const deadlineHours = parseDeadlineHours(task.deadline);
  if (!deadlineHours) return false;

  const deadlineTimestamp = task.deadline_timestamp + (deadlineHours * MS_PER_HOUR);
  const timeRemaining = deadlineTimestamp - now;
  const isWithinUrgentHours = timeRemaining > 0 && timeRemaining <= urgentHoursMs;
  const isOverdue = timeRemaining <= 0;

  return isWithinUrgentHours || isOverdue;
}

// Centralized function to calculate urgent project time display
// Used in dashboard and kanban views to ensure consistent behavior
function calculateUrgentProjectTimeDisplay(project, currentTimestamp) {
  const hasDeadlineTimestamp = project.deadline_timestamp !== null && project.deadline_timestamp !== undefined;
  const deadlineHours = parseDeadlineHours(project.deadline);
  const isInBuildWithoutDeadline = project.col_id === 2 && (!project.deadline || project.deadline === DEADLINE_UNDEFINED);
  const isUrgentKeyword = URGENT_DEADLINES.includes(project.deadline);

  if (isInBuildWithoutDeadline) {
    return { display: 'Em desenvolvimento', isOverdue: false };
  }

  if (isUrgentKeyword && !hasDeadlineTimestamp) {
    return { display: project.deadline, isOverdue: false };
  }

  if (!hasDeadlineTimestamp || !deadlineHours) {
    return { display: project.deadline || 'Sem prazo', isOverdue: false };
  }

  const deadlineTimestamp = project.deadline_timestamp + (deadlineHours * MS_PER_HOUR);
  const timeRemaining = deadlineTimestamp - currentTimestamp;

  if (timeRemaining <= 0) {
    const hoursOverdue = Math.abs(Math.floor(timeRemaining / MS_PER_HOUR));
    const minutesOverdue = Math.abs(Math.floor((timeRemaining % MS_PER_HOUR) / MS_PER_MINUTE));
    const display = hoursOverdue > 0 ? `Vencido há ${hoursOverdue}h` : `Vencido há ${minutesOverdue}m`;
    return { display, isOverdue: true };
  }

  const remainingHours = Math.floor(timeRemaining / MS_PER_HOUR);
  const remainingMinutes = Math.floor((timeRemaining % MS_PER_HOUR) / MS_PER_MINUTE);
  const display = remainingHours > 0 ? `${remainingHours}h` : `${remainingMinutes}m`;
  return { display, isOverdue: false };
}

function compareUrgentProjects(projectA, projectB, now) {
  // Calculate deadline hours once per project to avoid duplicate parsing
  const projectADeadlineHours = parseDeadlineHours(projectA.deadline);
  const projectBDeadlineHours = parseDeadlineHours(projectB.deadline);

  // Calculate deadline timestamps
  let projectADeadlineTimestamp = Infinity;
  let projectBDeadlineTimestamp = Infinity;
  
  if (projectA.deadline_timestamp && projectADeadlineHours) {
    projectADeadlineTimestamp = projectA.deadline_timestamp + (projectADeadlineHours * MS_PER_HOUR);
  }
  
  if (projectB.deadline_timestamp && projectBDeadlineHours) {
    projectBDeadlineTimestamp = projectB.deadline_timestamp + (projectBDeadlineHours * MS_PER_HOUR);
  }

  // Check if overdue (using calculated timestamps)
  const projectAIsOverdue = projectADeadlineTimestamp !== Infinity && projectADeadlineTimestamp <= now;
  const projectBIsOverdue = projectBDeadlineTimestamp !== Infinity && projectBDeadlineTimestamp <= now;

  // Sort overdue items first
  if (projectAIsOverdue && !projectBIsOverdue) return -1;
  if (!projectAIsOverdue && projectBIsOverdue) return 1;

  // For items with no valid deadline, use fallback value
  const projectAFinalTimestamp = projectADeadlineTimestamp === Infinity ? (projectADeadlineHours || 999) * MS_PER_HOUR : projectADeadlineTimestamp;
  const projectBFinalTimestamp = projectBDeadlineTimestamp === Infinity ? (projectBDeadlineHours || 999) * MS_PER_HOUR : projectBDeadlineTimestamp;

  return projectAFinalTimestamp - projectBFinalTimestamp;
}

function calculateUrgentProjects(tasks) {
  const now = Date.now();
  const settings = getSettings();
  const urgentHours = settings.urgentHours;
  return tasks
    .filter(task => isTaskUrgent(task, now, urgentHours))
    .sort((a, b) => compareUrgentProjects(a, b, now));
}

function calculateDashboardMetrics() {
  const tasks = AppState.getTasks();
  const settings = getSettings();
  const now = Date.now();
  const today = new Date();
  const todayDay = today.getDate();
  const todayMonth = today.getMonth();
  const todayYear = today.getFullYear();
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();

  let mrr = 0;
  let totalRevenue = 0;
  let pendingRevenue = 0;
  let paidTasksCount = 0;
  let pendingPaymentsCount = 0;
  let hostingActiveCount = 0;
  let leadsToday = 0;
  
  const projectCounts = { discoveryCount: 0, agreementCount: 0, buildCount: 0, liveCount: 0 };
  const statusDistribution = COLUMNS.map(col => ({ name: col.name, count: 0, value: 0 }));
  const monthRevenueMap = new Map();
  const upsellPending = [];

  tasks.forEach(task => {
    const colId = task.col_id || 0;
    const price = parseFloat(task.price) || 0;
    const isPaid = task.payment_status === PAYMENT_STATUS_PAID || task.payment_status === PAYMENT_STATUS_PARTIAL;
    const isPending = task.payment_status === PAYMENT_STATUS_PENDING;
    const taskDate = parseTaskDate(task.created_at);

    // Leads today
    const isLeadType = task.type === 'Lead Externo' || 
                       task.type === 'WhatsApp' || 
                       task.type === 'Lead Site' || 
                       (task.type && task.type.includes('LP'));
    
    if (taskDate && isLeadType) {
      if (taskDate.getDate() === todayDay && 
          taskDate.getMonth() === todayMonth && 
          taskDate.getFullYear() === todayYear) {
        leadsToday++;
      }
    }

    // Project counts and distribution
    if (colId >= 0 && colId <= 3) {
      const countKeys = ['discoveryCount', 'agreementCount', 'buildCount', 'liveCount'];
      projectCounts[countKeys[colId]]++;
      statusDistribution[colId].count++;
      statusDistribution[colId].value += price;
    }

    // MRR
    if (colId === 3 && task.hosting === HOSTING_YES) {
      mrr += settings.hostingPrice;
      hostingActiveCount++;
    }

    // Revenue
    if (isPaid) {
      paidTasksCount++;
      totalRevenue += price;

      if (taskDate) {
        const monthKey = `${taskDate.getFullYear()}-${taskDate.getMonth()}`;
        let taskRevenue = price;
        if (task.payment_status === PAYMENT_STATUS_PARTIAL) {
          taskRevenue = taskRevenue / 2;
        }
        monthRevenueMap.set(monthKey, (monthRevenueMap.get(monthKey) || 0) + taskRevenue);
      }
    } else if (isPending) {
      pendingPaymentsCount++;
      pendingRevenue += price;
    }

    // Upsell
    if (task.hosting === HOSTING_LATER && colId >= 1) {
      upsellPending.push(task);
    }
  });

  const mrrGaps = calculateMRRGaps(mrr, settings.hostingPrice);
  const lastMonthInfo = getLastMonthInfo(currentMonth, currentYear);
  const currentMonthKey = `${currentYear}-${currentMonth}`;
  const lastMonthKey = `${lastMonthInfo.year}-${lastMonthInfo.month}`;
  
  const monthlyRevenue = monthRevenueMap.get(currentMonthKey) || 0;
  const lastMonthRevenue = monthRevenueMap.get(lastMonthKey) || 0;

  return {
    mrr,
    gap10k: mrrGaps.gap10k,
    gap20k: mrrGaps.gap20k,
    upsellsNeeded10k: mrrGaps.upsellsNeeded10k,
    upsellsNeeded20k: mrrGaps.upsellsNeeded20k,
    monthlyRevenue,
    lastMonthRevenue,
    revenueChange: calculateRevenueChange(monthlyRevenue, lastMonthRevenue),
    averageTicket: paidTasksCount > 0 ? totalRevenue / paidTasksCount : 0,
    totalRevenue,
    activeProjects: projectCounts.agreementCount + projectCounts.buildCount,
    discoveryCount: projectCounts.discoveryCount,
    agreementCount: projectCounts.agreementCount,
    buildCount: projectCounts.buildCount,
    liveCount: projectCounts.liveCount,
    pendingPayments: pendingPaymentsCount,
    pendingRevenue,
    hostingActive: hostingActiveCount,
    cacAverage: DEFAULT_CAC,
    urgentCount: calculateUrgentProjects(tasks).length,
    urgentProjects: calculateUrgentProjects(tasks),
    upsellPending,
    statusDistribution,
    leadsToday
  };
}

function calculateMonthlyRevenue(tasks, monthsCount = 12) {
  const months = [];
  const now = new Date();

  const monthMap = new Map();
  for (let i = monthsCount - 1; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthName = date.toLocaleDateString('pt-BR', { month: 'short' });
    const year = date.getFullYear();
    const monthKey = `${year}-${date.getMonth()}`;
    const monthData = {
      name: monthName,
      value: 0,
      month: date.getMonth(),
      year: year
    };
    months.push(monthData);
    monthMap.set(monthKey, monthData);
  }

  tasks.forEach(task => {
    const isPaid = task.payment_status === PAYMENT_STATUS_PAID || task.payment_status === PAYMENT_STATUS_PARTIAL;
    if (!isPaid) return;

    const taskCreatedDate = parseTaskDate(task.created_at);
    if (!taskCreatedDate) return;

    const taskMonth = taskCreatedDate.getMonth();
    const taskYear = taskCreatedDate.getFullYear();
    const monthKey = `${taskYear}-${taskMonth}`;

    const monthData = monthMap.get(monthKey);
    if (monthData) {
      let taskRevenue = parseFloat(task.price || 0);
      if (task.payment_status === PAYMENT_STATUS_PARTIAL) {
        taskRevenue = taskRevenue / 2;
      }
      monthData.value += taskRevenue;
    }
  });

  return months;
}

function calculateAverageTicketFromRecentTasks(recentTasks) {
  const paidRecentTasks = recentTasks.filter(t =>
    t.payment_status === PAYMENT_STATUS_PAID || t.payment_status === PAYMENT_STATUS_PARTIAL
  );

  if (paidRecentTasks.length === 0) {
    return getSettings().defaultTicket;
  }

  const totalPaidRevenue = paidRecentTasks.reduce((sum, task) => {
    let taskRevenue = parseFloat(task.price || 0);
    if (task.payment_status === PAYMENT_STATUS_PARTIAL) {
      taskRevenue = taskRevenue / 2;
    }
    return sum + taskRevenue;
  }, 0);

  return totalPaidRevenue / paidRecentTasks.length;
}

function calculateProjectedRevenue(tasks, monthsCount = 12) {
  const projectedMonths = [];
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth();

  let liveProjectsWithHostingCount = 0;
  let paidTasksCount = 0;
  let pipelineRevenue = 0;
  const recentTasks = [];
  const MONTHS_FOR_AVERAGE = 6;

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    const colId = task.col_id;

    if (colId === 3 && task.hosting === HOSTING_YES) {
      liveProjectsWithHostingCount++;
    }
    if (task.payment_status === PAYMENT_STATUS_PAID || task.payment_status === PAYMENT_STATUS_PARTIAL) {
      paidTasksCount++;
    }
    if ((colId === 1 || colId === 2) && task.payment_status === PAYMENT_STATUS_PENDING) {
      pipelineRevenue += parseFloat(task.price) || 0;
    }

    const taskCreatedDate = parseTaskDate(task.created_at);
    if (taskCreatedDate) {
      const monthsSinceCreation = (currentYear - taskCreatedDate.getFullYear()) * 12 +
        (currentMonth - taskCreatedDate.getMonth());
      if (monthsSinceCreation >= 0 && monthsSinceCreation <= (MONTHS_FOR_AVERAGE - 1)) {
        recentTasks.push(task);
      }
    }
  }

  const settings = getSettings();
  const monthlyRecurringRevenue = liveProjectsWithHostingCount * settings.hostingPrice;

  if (liveProjectsWithHostingCount === 0 && paidTasksCount === 0) {
    for (let monthsAhead = 1; monthsAhead <= monthsCount; monthsAhead++) {
      const futureDate = new Date(currentYear, currentMonth + monthsAhead, 1);
      const monthName = futureDate.toLocaleDateString('pt-BR', { month: 'short' });
      projectedMonths.push({
        name: monthName,
        value: 0,
        month: futureDate.getMonth(),
        year: futureDate.getFullYear()
      });
    }
    return projectedMonths;
  }

  const pipelineDistribution = [0.5, 0.3, 0.2];

  const averageJobsPerMonth = recentTasks.length > 0 ? recentTasks.length / MONTHS_FOR_AVERAGE : 0;
  const averageTicketPrice = calculateAverageTicketFromRecentTasks(recentTasks);
  const baseNewProjectsRevenue = averageJobsPerMonth * averageTicketPrice;

  const monthlyGrowthRate = 1.02;
  const currentYearMonth = currentYear * 12 + currentMonth;

  for (let monthsAhead = 1; monthsAhead <= monthsCount; monthsAhead++) {
    const futureYearMonth = currentYearMonth + monthsAhead;
    const futureYear = Math.floor(futureYearMonth / 12);
    const futureMonth = futureYearMonth % 12;
    const futureDate = new Date(futureYear, futureMonth, 1);
    const monthName = futureDate.toLocaleDateString('pt-BR', { month: 'short' });

    let pipelineRevenueThisMonth = 0;
    if (monthsAhead <= 3) {
      pipelineRevenueThisMonth = pipelineRevenue * pipelineDistribution[monthsAhead - 1];
    }

    const growthFactor = Math.pow(monthlyGrowthRate, monthsAhead);
    const projectedNewProjectsRevenue = baseNewProjectsRevenue * growthFactor;

    const projectedRevenue = Math.round(
      monthlyRecurringRevenue +
      pipelineRevenueThisMonth +
      projectedNewProjectsRevenue
    );

    projectedMonths.push({
      name: monthName,
      value: projectedRevenue,
      month: futureMonth,
      year: futureYear
    });
  }

  return projectedMonths;
}

function calculateStatusDistribution(tasks) {
  const distribution = COLUMNS.map(col => ({ name: col.name, count: 0, value: 0 }));
  if (!tasks || !Array.isArray(tasks)) return distribution;

  tasks.forEach(task => {
    const colId = task.col_id || 0;
    if (colId >= 0 && colId <= 3) {
      distribution[colId].count++;
      distribution[colId].value += parseFloat(task.price) || 0;
    }
  });

  return distribution;
}

function getInitials(fullName) {
  if (!fullName) return 'U';
  const parts = fullName.trim().split(' ');
  if (parts.length === 1) {
    return parts[0].substring(0, 2).toUpperCase();
  }
  const firstInitial = parts[0][0];
  const lastInitial = parts[parts.length - 1][0];
  return (firstInitial + lastInitial).toUpperCase();
}

async function generateRecentActivities(tasks, useCache = true) {
  // Check cache first (30 second TTL)
  if (useCache) {
    const cached = AppState.getCachedActivities(30000);
    if (cached) {
      return cached;
    }
  }

  try {
    // Try to fetch activities from database (with user info)
    // Only fetch 3 since that's all we use
    const dbActivities = await api.getActivities(3);

    if (dbActivities && Array.isArray(dbActivities) && dbActivities.length > 0) {
      const activities = [];

      dbActivities.forEach(activity => {
        const activityDate = parseTaskDate(activity.created_at);
        if (!activityDate) return;

        let icon = 'fa-file-invoice';
        if (activity.action_type === 'create') {
          icon = 'fa-plus-circle';
        } else if (activity.action_type === 'move') {
          icon = 'fa-arrows-left-right';
        } else if (activity.action_type === 'update') {
          icon = 'fa-edit';
        } else if (activity.action_type === 'delete') {
          icon = 'fa-trash';
        }

        const userName = activity.user_name || 'Usuário';
        const userInitials = getInitials(userName);
        const escapedDescription = escapeHtml(activity.action_description || '');
        const apiBaseUrl = getApiBaseUrl();
        const userAvatarUrl = activity.user_avatar_url
          ? (activity.user_avatar_url.startsWith('http') ? activity.user_avatar_url : `${apiBaseUrl}${activity.user_avatar_url}`)
          : null;

        activities.push({
          text: escapedDescription,
          createdAt: activityDate,
          icon: icon,
          taskId: activity.task_id,
          userName: userName,
          userInitials: userInitials,
          userAvatarUrl: userAvatarUrl
        });
      });

      AppState.setCachedActivities(activities);
      return activities;
    }
  } catch (error) {
    console.warn('[Activities] Error fetching from database, falling back to task-based generation:', error);
  }

  // Fallback: generate from tasks (legacy behavior)
  const activities = [];
  const currentDate = Date.now();

  const tasksByStatus = { 0: [], 1: [], 2: [], 3: [] };

  tasks.forEach(task => {
    const colId = task.col_id || 0;
    if (colId >= 0 && colId <= 3) {
      tasksByStatus[colId].push(task);
    }
  });

  const projectsInBuild = tasksByStatus[2].sort((a, b) => b.id - a.id);
  const projectsInAgreement = tasksByStatus[1].sort((a, b) => b.id - a.id);
  const projectsRecentlyCreated = tasksByStatus[0].sort((a, b) => b.id - a.id);
  const projectsRecentlyCompleted = tasksByStatus[3].sort((a, b) => b.id - a.id);

  const selectedTasks = [];

  if (projectsInBuild.length > 0) {
    selectedTasks.push(projectsInBuild[0]);
  }
  if (projectsInAgreement.length > 0 && selectedTasks.length < 3) {
    selectedTasks.push(projectsInAgreement[0]);
  }
  if (projectsRecentlyCreated.length > 0 && selectedTasks.length < 3) {
    selectedTasks.push(projectsRecentlyCreated[0]);
  }
  if (projectsRecentlyCompleted.length > 0 && selectedTasks.length < 3) {
    selectedTasks.push(projectsRecentlyCompleted[0]);
  }

  if (selectedTasks.length < 3 && tasks.length > 0) {
    const allTasksSorted = [...tasks].sort((a, b) => b.id - a.id);
    allTasksSorted.forEach(task => {
      const alreadySelected = selectedTasks.find(t => t.id === task.id);
      if (selectedTasks.length < 3 && !alreadySelected) {
        selectedTasks.push(task);
      }
    });
  }

  if (selectedTasks.length === 0 && tasks.length > 0) {
    const mostRecentTask = [...tasks].sort((a, b) => b.id - a.id)[0];
    selectedTasks.push(mostRecentTask);
  }

  selectedTasks.slice(0, 3).forEach(task => {
    const taskCreatedDate = parseTaskDate(task.created_at);
    if (!taskCreatedDate) return;

    let activityText = '';
    let icon = 'fa-file-invoice';

    const escapedClient = escapeHtml(task.client);
    if (task.col_id === 0) {
      activityText = `Novo projeto <strong>${escapedClient}</strong>`;
      icon = 'fa-plus-circle';
    } else if (task.col_id === 1) {
      activityText = `<strong>${escapedClient}</strong> em acordo`;
      icon = 'fa-handshake';
    } else if (task.col_id === 2) {
      activityText = `<strong>${escapedClient}</strong> em desenvolvimento`;
      icon = 'fa-code';
    } else if (task.col_id === 3) {
      activityText = `<strong>${escapedClient}</strong> concluído`;
      icon = 'fa-check-circle';
    }

    activities.push({
      text: activityText,
      createdAt: taskCreatedDate,
      icon: icon,
      taskId: task.id
    });
  });

  // Always return an array, never undefined
  return activities;
}
