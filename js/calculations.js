// Financial Calculations and Metrics

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

function calculateRevenueForMonth(tasks, month, year) {
  const monthTasks = tasks.filter(t => {
    const taskDate = new Date(t.id);
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

  const mrr = calculateMRR(tasks);
  const mrrGaps = calculateMRRGaps(mrr);

  const monthlyRevenue = calculateRevenueForMonth(tasks, currentMonth, currentYear);
  const lastMonthInfo = getLastMonthInfo(currentMonth, currentYear);
  const lastMonthRevenue = calculateRevenueForMonth(tasks, lastMonthInfo.month, lastMonthInfo.year);
  const revenueChange = calculateRevenueChange(monthlyRevenue, lastMonthRevenue);

  const averageTicket = calculateAverageTicket(tasks);
  const projectCounts = calculateProjectCountsByStatus(tasks);
  const urgentProjects = calculateUrgentProjects(tasks);
  const upsellPending = tasks.filter(t => t.hosting === HOSTING_LATER && t.col_id >= 1);

  const statusDistribution = calculateStatusDistribution(tasks);
  const recentActivities = generateRecentActivities(tasks);
  const paidTasks = tasks.filter(t =>
    t.payment_status === PAYMENT_STATUS_PAID || t.payment_status === PAYMENT_STATUS_PARTIAL
  );
  const totalRevenue = paidTasks.reduce((sum, t) => sum + (parseFloat(t.price) || 0), 0);

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
    activeProjects: projectCounts.activeProjects,
    discoveryCount: projectCounts.discoveryCount,
    agreementCount: projectCounts.agreementCount,
    buildCount: projectCounts.buildCount,
    liveCount: projectCounts.liveCount,
    pendingPayments: tasks.filter(t => t.payment_status === PAYMENT_STATUS_PENDING).length,
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

  for (let i = monthsCount - 1; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthName = date.toLocaleDateString('pt-BR', { month: 'short' });
    const year = date.getFullYear();
    months.push({
      name: monthName,
      value: 0,
      month: date.getMonth(),
      year: year
    });
  }

  const paidTasks = tasks.filter(t =>
    t.payment_status === PAYMENT_STATUS_PAID || t.payment_status === PAYMENT_STATUS_PARTIAL
  );

  paidTasks.forEach(task => {
    const taskCreatedDate = new Date(task.id);
    const taskMonth = taskCreatedDate.getMonth();
    const taskYear = taskCreatedDate.getFullYear();

    let taskRevenue = parseFloat(task.price || 0);
    if (task.payment_status === PAYMENT_STATUS_PARTIAL) {
      taskRevenue = taskRevenue / 2;
    }

    months.forEach((month) => {
      const isSameMonth = month.month === taskMonth && month.year === taskYear;
      if (isSameMonth) {
        month.value += taskRevenue;
      }
    });
  });

  const totalRevenueCalculated = months.reduce((sum, month) => sum + month.value, 0);
  const hasInsufficientData = totalRevenueCalculated === 0 || totalRevenueCalculated < 1000;

  if (hasInsufficientData) {
    const mockBaseRevenue = MOCK_BASE_REVENUE;
    months.forEach((month, monthIndex) => {
      if (month.value === 0) {
        const growthFactor = (monthIndex / monthsCount) * 1.5;
        const variationFactor = (Math.sin(monthIndex * 0.5) * 0.3) + 1;
        const mockRevenue = mockBaseRevenue * (1 + growthFactor) * variationFactor;
        month.value = Math.round(mockRevenue);
      }
    });
  }

  return months;
}

function calculateConversionRates(tasks) {
  const totalProjectsEver = tasks.length;
  const projectsInAgreement = tasks.filter(t => t.col_id >= 1).length;
  const projectsInBuild = tasks.filter(t => t.col_id >= 2).length;
  const projectsInLive = tasks.filter(t => t.col_id === 3).length;

  return {
    discoveryToAgreement: totalProjectsEver > 0 ? projectsInAgreement / totalProjectsEver : 0.6,
    agreementToBuild: projectsInAgreement > 0 ? projectsInBuild / projectsInAgreement : 0.8,
    buildToLive: projectsInBuild > 0 ? projectsInLive / projectsInBuild : 0.9
  };
}

function calculatePipelineValue(tasks, averageTicketPrice, conversionRates) {
  const discoveryProjects = tasks.filter(t => t.col_id === 0);
  const agreementProjects = tasks.filter(t => t.col_id === 1);
  const buildProjects = tasks.filter(t => t.col_id === 2);

  const discoveryValue = discoveryProjects.length * conversionRates.discoveryToAgreement *
    conversionRates.agreementToBuild * conversionRates.buildToLive * averageTicketPrice;
  const agreementValue = agreementProjects.length * conversionRates.agreementToBuild *
    conversionRates.buildToLive * averageTicketPrice;
  const buildValue = buildProjects.length * conversionRates.buildToLive * averageTicketPrice;

  return discoveryValue + agreementValue + buildValue;
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

function calculateTrendFactor(last6MonthsValues) {
  const last3MonthsAvg = last6MonthsValues.slice(-3).reduce((sum, val) => sum + val, 0) / 3;
  const previous3MonthsAvg = last6MonthsValues.slice(0, 3).reduce((sum, val) => sum + val, 0) / 3;
  return previous3MonthsAvg > 0 ? (last3MonthsAvg / previous3MonthsAvg) : 1;
}

function calculateProjectedRevenue(tasks, monthsCount = 12) {
  const projectedMonths = [];
  const currentDate = new Date();

  const liveProjectsWithHosting = tasks.filter(t => t.col_id === 3 && t.hosting === HOSTING_YES);
  const monthlyRecurringRevenue = liveProjectsWithHosting.length * HOSTING_PRICE_EUR;

  const last6MonthsRevenue = calculateMonthlyRevenue(tasks, 6);
  const last6MonthsValues = last6MonthsRevenue.map(m => m.value);
  const trendFactor = calculateTrendFactor(last6MonthsValues);

  const recentTasks = tasks.filter(t => {
    const taskCreatedDate = new Date(t.id);
    const monthsSinceCreation = (currentDate.getFullYear() - taskCreatedDate.getFullYear()) * 12 +
      (currentDate.getMonth() - taskCreatedDate.getMonth());
    return monthsSinceCreation >= 0 && monthsSinceCreation <= 5;
  });

  const averageJobsPerMonth = recentTasks.length > 0 ? recentTasks.length / 6 : 2;
  const averageTicketPrice = calculateAverageTicketFromRecentTasks(recentTasks);
  const conversionRates = calculateConversionRates(tasks);
  const pipelineValue = calculatePipelineValue(tasks, averageTicketPrice, conversionRates);

  const baseNewProjectsRevenue = averageJobsPerMonth * averageTicketPrice;
  const pipelinePerMonth = pipelineValue / 3;

  let baseGrowthRate = 1.01;
  if (trendFactor > 1.1) {
    baseGrowthRate = 1.015;
  } else if (trendFactor < 0.9) {
    baseGrowthRate = 0.995;
  }
  const adjustedGrowthRate = Math.max(0.99, Math.min(1.02, baseGrowthRate));

  for (let monthsAhead = 1; monthsAhead <= monthsCount; monthsAhead++) {
    const futureDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + monthsAhead, 1);
    const monthName = futureDate.toLocaleDateString('pt-BR', { month: 'short' });

    const pipelineContribution = monthsAhead <= 3 ? pipelinePerMonth : 0;
    const growthFactor = Math.pow(adjustedGrowthRate, monthsAhead);
    const naturalVariation = (Math.sin(monthsAhead * 0.2) * 0.05) + 1;
    const projectedNewProjectsRevenue = baseNewProjectsRevenue * growthFactor;
    const projectedRevenue = Math.round(
      (monthlyRecurringRevenue + projectedNewProjectsRevenue + pipelineContribution) * naturalVariation
    );

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
  const distribution = COLUMNS.map(col => ({
    name: col.name,
    count: tasks.filter(t => t.col_id === col.id).length,
    value: tasks
      .filter(t => t.col_id === col.id)
      .reduce((sum, t) => sum + (parseFloat(t.price) || 0), 0)
  }));

  return distribution;
}

function generateRecentActivities(tasks) {
  const activities = [];
  const currentDate = Date.now();

  // Priorizar projetos em diferentes estágios para dar visão completa
  const projectsInBuild = tasks.filter(t => t.col_id === 2).sort((a, b) => b.id - a.id);
  const projectsInAgreement = tasks.filter(t => t.col_id === 1).sort((a, b) => b.id - a.id);
  const projectsRecentlyCreated = tasks.filter(t => t.col_id === 0).sort((a, b) => b.id - a.id);
  const projectsRecentlyCompleted = tasks.filter(t => t.col_id === 3).sort((a, b) => b.id - a.id);

  // Selecionar atividades mais relevantes (máximo 3)
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

  // Se não tiver projetos suficientes, pegar os mais recentes de qualquer status
  if (selectedTasks.length < 3 && tasks.length > 0) {
    const allTasksSorted = [...tasks].sort((a, b) => b.id - a.id);
    allTasksSorted.forEach(task => {
      const alreadySelected = selectedTasks.find(t => t.id === task.id);
      if (selectedTasks.length < 3 && !alreadySelected) {
        selectedTasks.push(task);
      }
    });
  }

  // Garantir que sempre tenha pelo menos 1 atividade se houver projetos
  if (selectedTasks.length === 0 && tasks.length > 0) {
    const mostRecentTask = [...tasks].sort((a, b) => b.id - a.id)[0];
    selectedTasks.push(mostRecentTask);
  }

  selectedTasks.slice(0, 3).forEach(task => {
    const taskCreatedDate = new Date(task.id);
    const timeAgo = getTimeAgo(taskCreatedDate);

    let activityText = '';
    let icon = 'fa-file-invoice';

    if (task.col_id === 0) {
      activityText = `Novo projeto <strong>${task.client}</strong>`;
      icon = 'fa-plus-circle';
    } else if (task.col_id === 1) {
      activityText = `<strong>${task.client}</strong> em acordo`;
      icon = 'fa-handshake';
    } else if (task.col_id === 2) {
      activityText = `<strong>${task.client}</strong> em desenvolvimento`;
      icon = 'fa-code';
    } else if (task.col_id === 3) {
      activityText = `<strong>${task.client}</strong> concluído`;
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
