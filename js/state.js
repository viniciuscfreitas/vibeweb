const AppState = {
  tasks: [],
  draggedTaskId: null,
  currentTaskId: null,
  searchTimeout: null,
  filterByColumnId: null,
  filterByCustomType: null,
  isLoading: false,
  error: null,
  _metricsCache: null,
  _tasksHash: null,
  _activitiesCache: null,
  _activitiesCacheTime: null,

  setTasks(newTasks) {
    this.tasks = newTasks;
    // Create hash that includes task IDs and last update timestamps to detect content changes
    // This ensures cache is invalidated when task data changes even if IDs remain the same
    const taskIds = newTasks.map(t => t.id).join(',');
    const taskTimestamps = newTasks.map(t => t.updated_at || t.created_at || '').join(',');
    const newHash = newTasks.length + '-' + (taskIds.length > 0 ? taskIds : 'empty') + '-' + (taskTimestamps.length > 0 ? taskTimestamps : 'empty');
    if (this._tasksHash !== newHash) {
      this._metricsCache = null;
      this._tasksHash = newHash;
      this.clearActivitiesCache();
    }
    this.log('State updated', { taskCount: newTasks.length });
  },

  getTasks() {
    return this.tasks;
  },

  getTaskById(id) {
    if (!id) return null;
    const numericId = typeof id === 'string' ? parseInt(id) : id;
    return this.tasks.find(t => t.id === numericId);
  },

  getCachedMetrics(calculator) {
    if (this._metricsCache) {
      return this._metricsCache;
    }
    this._metricsCache = calculator();
    return this._metricsCache;
  },

  clearMetricsCache() {
    this._metricsCache = null;
    this._tasksHash = null;
  },

  clearActivitiesCache() {
    this._activitiesCache = null;
    this._activitiesCacheTime = null;
  },

  getCachedActivities(cacheTimeMs = 30000) {
    if (this._activitiesCache && this._activitiesCacheTime) {
      const age = Date.now() - this._activitiesCacheTime;
      if (age < cacheTimeMs) {
        return this._activitiesCache;
      }
    }
    return null;
  },

  setCachedActivities(activities) {
    this._activitiesCache = activities;
    this._activitiesCacheTime = Date.now();
  },

  setLoading(loading) {
    this.isLoading = loading;
    this.log('Loading state changed', { isLoading: loading });
  },

  setError(error) {
    this.error = error;
    this.log('Error set', { error });
  },

  clearError() {
    this.error = null;
    this.log('Error cleared');
  },

  log(message, data = {}) {
    const hostname = window.location.hostname;
    const isLocalhost = hostname === 'localhost';
    const isLocalIP = hostname === '127.0.0.1';
    const isDev = isLocalhost || isLocalIP;

    if (isDev) {
      console.log(`[AppState] ${message}`, data);
    }
  }
};
