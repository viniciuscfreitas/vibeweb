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

  setTasks(newTasks) {
    this.tasks = newTasks;
    const taskIds = newTasks.map(t => t.id).join(',');
    const newHash = newTasks.length + '-' + (taskIds.length > 0 ? taskIds : 'empty');
    if (this._tasksHash !== newHash) {
      this._metricsCache = null;
      this._tasksHash = newHash;
    }
    this.log('State updated', { taskCount: newTasks.length });
  },

  getTasks() {
    return this.tasks;
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
