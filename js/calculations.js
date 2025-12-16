function calculateMRR(tasks) {
  const liveTasks = tasks.filter(t => t.col_id === 3 && t.hosting === HOSTING_YES);
  return liveTasks.length * HOSTING_PRICE_EUR;
}

function calculateMRRGaps(mrr) {
  const gap10k = Math.max(0, TARGET_MRR_10K - mrr);
  const gap20k = Math.max(0, TARGET_MRR_20K - mrr);
  const upsellsNeeded10k = Math.ceil(gap10k / HOSTING_PRICE_EUR);
  const upsellsNeeded20k = Math.ceil(gap20k / HOSTING_PRICE_EUR);
  return { gap10k, gap20k, upsellsNeeded10k, upsellsNeeded20k };
}

function parseTaskDate(dateString) {
  if (!dateString) return null;
  const date = new Date(dateString);
  return isNaN(date.getTime()) ? null : date;
}

function calculateRevenueForMonth(tasks, month, year) {
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
  const paidTasks = tasks.filter(t =>
    t.payment_status === PAYMENT_STATUS_PAID || t.payment_status === PAYMENT_STATUS_PARTIAL
  );
  if (paidTasks.length === 0) return 0;

  const totalRevenue = paidTasks.reduce((sum, t) => sum + (parseFloat(t.price) || 0), 0);
  return totalRevenue / paidTasks.length;
}

function calculateProjectCountsByStatus(tasks) {
  const discoveryCount = tasks.filter(t => t.col_id === 0).length;
  const agreementCount = tasks.filter(t => t.col_id === 1).length;
  const buildCount = tasks.filter(t => t.col_id === 2).length;
  const liveCount = tasks.filter(t => t.col_id === 3).length;
  const activeProjects = agreementCount + buildCount;
  return { discoveryCount, agreementCount, buildCount, liveCount, activeProjects };
}

function isTaskUrgent(task, now) {
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
  const isWithin48Hours = timeRemaining > 0 && timeRemaining <= URGENT_HOURS_48_MS;
  const isOverdue = timeRemaining <= 0;

  return isWithin48Hours || isOverdue;
}

function compareUrgentProjects(projectA, projectB, now) {
  let projectAIsOverdue = false;
  if (projectA.deadline_timestamp) {
    const projectADeadlineHours = parseDeadlineHours(projectA.deadline);
    if (projectADeadlineHours) {
      const projectADeadlineTimestamp = projectA.deadline_timestamp + (projectADeadlineHours * MS_PER_HOUR);
      projectAIsOverdue = projectADeadlineTimestamp <= now;
    }
  }

  let projectBIsOverdue = false;
  if (projectB.deadline_timestamp) {
    const projectBDeadlineHours = parseDeadlineHours(projectB.deadline);
    if (projectBDeadlineHours) {
      const projectBDeadlineTimestamp = projectB.deadline_timestamp + (projectBDeadlineHours * MS_PER_HOUR);
      projectBIsOverdue = projectBDeadlineTimestamp <= now;
    }
  }

  if (projectAIsOverdue && !projectBIsOverdue) return -1;
  if (!projectAIsOverdue && projectBIsOverdue) return 1;

  const projectADeadlineHours = parseDeadlineHours(projectA.deadline) || 999;
  const projectBDeadlineHours = parseDeadlineHours(projectB.deadline) || 999;

  let projectADeadlineTimestamp = Infinity;
  if (projectA.deadline_timestamp) {
    projectADeadlineTimestamp = projectA.deadline_timestamp + (projectADeadlineHours * MS_PER_HOUR);
  }

  let projectBDeadlineTimestamp = Infinity;
  if (projectB.deadline_timestamp) {
    projectBDeadlineTimestamp = projectB.deadline_timestamp + (projectBDeadlineHours * MS_PER_HOUR);
  }

  return projectADeadlineTimestamp - projectBDeadlineTimestamp;
}

function calculateUrgentProjects(tasks) {
  const now = Date.now();
  return tasks
    .filter(task => isTaskUrgent(task, now))
    .sort((a, b) => compareUrgentProjects(a, b, now));
}

function calculateDashboardMetrics() {
  const tasks = AppState.getTasks();
  const now = Date.now();
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();
  let mrr = 0;
  let totalRevenue = 0;
  let paidTasksCount = 0;
  let pendingPaymentsCount = 0;
  const projectCounts = { discoveryCount: 0, agreementCount: 0, buildCount: 0, liveCount: 0 };
  const paidTasks = [];
  const pendingTasks = [];
  const upsellPending = [];
  const statusDistribution = COLUMNS.map(col => ({ name: col.name, count: 0, value: 0 }));

  tasks.forEach(task => {
    const colId = task.col_id || 0;
    if (colId >= 0 && colId <= 3) {
      const countKeys = ['discoveryCount', 'agreementCount', 'buildCount', 'liveCount'];
      projectCounts[countKeys[colId]]++;
      statusDistribution[colId].count++;
      statusDistribution[colId].value += parseFloat(task.price) || 0;
    }

    if (colId === 3 && task.hosting === HOSTING_YES) {
      mrr += HOSTING_PRICE_EUR;
    }

    const isPaid = task.payment_status === PAYMENT_STATUS_PAID || task.payment_status === PAYMENT_STATUS_PARTIAL;
    const isPending = task.payment_status === PAYMENT_STATUS_PENDING;

    if (isPaid) {
      paidTasks.push(task);
      paidTasksCount++;
      const price = parseFloat(task.price) || 0;
      totalRevenue += price;
    } else if (isPending) {
      pendingPaymentsCount++;
      pendingTasks.push(task);
    }

    if (task.hosting === HOSTING_LATER && colId >= 1) {
      upsellPending.push(task);
    }
  });

  const mrrGaps = calculateMRRGaps(mrr);
  const lastMonthInfo = getLastMonthInfo(currentMonth, currentYear);

  const monthRevenueMap = new Map();
  tasks.forEach(task => {
    const isPaid = task.payment_status === PAYMENT_STATUS_PAID || task.payment_status === PAYMENT_STATUS_PARTIAL;
    if (!isPaid) return;

    const taskDate = parseTaskDate(task.created_at);
    if (!taskDate) return;

    const taskMonth = taskDate.getMonth();
    const taskYear = taskDate.getFullYear();
    const monthKey = `${taskYear}-${taskMonth}`;

    if (!monthRevenueMap.has(monthKey)) {
      monthRevenueMap.set(monthKey, 0);
    }

    let taskRevenue = parseFloat(task.price) || 0;
    if (task.payment_status === PAYMENT_STATUS_PARTIAL) {
      taskRevenue = taskRevenue / 2;
    }
    monthRevenueMap.set(monthKey, monthRevenueMap.get(monthKey) + taskRevenue);
  });

  const currentMonthKey = `${currentYear}-${currentMonth}`;
  const lastMonthKey = `${lastMonthInfo.year}-${lastMonthInfo.month}`;
  const monthlyRevenue = monthRevenueMap.get(currentMonthKey) || 0;
  const lastMonthRevenue = monthRevenueMap.get(lastMonthKey) || 0;
  const revenueChange = calculateRevenueChange(monthlyRevenue, lastMonthRevenue);

  const averageTicket = paidTasksCount > 0 ? totalRevenue / paidTasksCount : 0;
  const activeProjects = projectCounts.agreementCount + projectCounts.buildCount;
  const urgentProjects = calculateUrgentProjects(tasks);
  const recentActivities = generateRecentActivities(tasks);

  return {
    mrr,
    gap10k: mrrGaps.gap10k,
    gap20k: mrrGaps.gap20k,
    upsellsNeeded10k: mrrGaps.upsellsNeeded10k,
    upsellsNeeded20k: mrrGaps.upsellsNeeded20k,
    monthlyRevenue,
    lastMonthRevenue,
    revenueChange,
    averageTicket,
    totalRevenue,
    activeProjects,
    discoveryCount: projectCounts.discoveryCount,
    agreementCount: projectCounts.agreementCount,
    buildCount: projectCounts.buildCount,
    liveCount: projectCounts.liveCount,
    pendingPayments: pendingPaymentsCount,
    cacAverage: DEFAULT_CAC,
    urgentCount: urgentProjects.length,
    urgentProjects,
    upsellPending,
    statusDistribution,
    recentActivities
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
    return DEFAULT_AVERAGE_TICKET;
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

  let liveProjectsWithHostingCount = 0;
  let paidTasksCount = 0;

  tasks.forEach(task => {
    if (task.col_id === 3 && task.hosting === HOSTING_YES) {
      liveProjectsWithHostingCount++;
    }
    if (task.payment_status === PAYMENT_STATUS_PAID || task.payment_status === PAYMENT_STATUS_PARTIAL) {
      paidTasksCount++;
    }
  });

  const monthlyRecurringRevenue = liveProjectsWithHostingCount * HOSTING_PRICE_EUR;

  if (liveProjectsWithHostingCount === 0 && paidTasksCount === 0) {
    for (let monthsAhead = 1; monthsAhead <= monthsCount; monthsAhead++) {
      const futureDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + monthsAhead, 1);
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

  const recentTasks = tasks.filter(t => {
    const taskCreatedDate = parseTaskDate(t.created_at);
    if (!taskCreatedDate) return false;
    const monthsSinceCreation = (currentDate.getFullYear() - taskCreatedDate.getFullYear()) * 12 +
      (currentDate.getMonth() - taskCreatedDate.getMonth());
    return monthsSinceCreation >= 0 && monthsSinceCreation <= 5;
  });

  const averageJobsPerMonth = recentTasks.length > 0 ? recentTasks.length / 6 : 0;
  const averageTicketPrice = calculateAverageTicketFromRecentTasks(recentTasks);
  const baseNewProjectsRevenue = averageJobsPerMonth * averageTicketPrice;
  const monthlyGrowthRate = 1.01;

  for (let monthsAhead = 1; monthsAhead <= monthsCount; monthsAhead++) {
    const futureDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + monthsAhead, 1);
    const monthName = futureDate.toLocaleDateString('pt-BR', { month: 'short' });
    const growthFactor = Math.pow(monthlyGrowthRate, monthsAhead);
    const projectedNewProjectsRevenue = baseNewProjectsRevenue * growthFactor;
    const projectedRevenue = Math.round(monthlyRecurringRevenue + projectedNewProjectsRevenue);

    projectedMonths.push({
      name: monthName,
      value: projectedRevenue,
      month: futureDate.getMonth(),
      year: futureDate.getFullYear()
    });
  }

  return projectedMonths;
}

function calculateStatusDistribution(tasks) {
  const distribution = COLUMNS.map(col => ({ name: col.name, count: 0, value: 0 }));

  tasks.forEach(task => {
    const colId = task.col_id || 0;
    if (colId >= 0 && colId <= 3) {
      distribution[colId].count++;
      distribution[colId].value += parseFloat(task.price) || 0;
    }
  });

  return distribution;
}

function generateRecentActivities(tasks) {
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
    const timeAgo = getTimeAgo(taskCreatedDate);

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
      time: timeAgo,
      icon: icon,
      taskId: task.id
    });
  });

  return activities;
}
