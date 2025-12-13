// Global State Management
// Grug Rule: Keep state simple, avoid complex abstractions
// This is a simple object - no need for Redux/Vuex complexity
// State is local to this module, accessed via getters/setters
const AppState = {
  tasks: [],
  draggedTaskId: null,
  currentTaskId: null,
  searchTimeout: null,
  filterByColumnId: null,
  filterByCustomType: null,
  isLoading: false,
  error: null,

  setTasks(newTasks) {
    this.tasks = newTasks;
    this.log('State updated', { taskCount: newTasks.length });
  },

  getTasks() {
    return this.tasks;
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
