// DOM References
const DOM = {
  boardGrid: null,
  boardContainer: null,
  dashboardContainer: null,
  financialContainer: null,
  activitiesContainer: null,
  activitiesListFull: null,
  activitiesLoadMore: null,
  searchContainer: null,
  searchBtn: null,
  searchInput: null,
  modalOverlay: null,
  modalTitle: null,
  btnCloseModal: null,
  btnCancel: null,
  btnDelete: null,
  btnGeneratePDF: null,
  formClient: null,
  formContact: null,
  formType: null,
  formStack: null,
  formDomain: null,
  formDesc: null,
  formPrice: null,
  formPayment: null,
  formDeadline: null,
  formHosting: null,
  formRecurring: null,
  formPublic: null,
  formAssetsLink: null,
  subtasksSection: null,
  subtasksProgress: null,
  subtaskList: null,
  subtaskNewTitle: null,
  btnAddTaskSubtask: null,
  errorClient: null,
  errorContact: null,
  errorDomain: null,
  errorPrice: null,
  formProgress: null,
  formProgressText: null,
  formAdvancedToggle: null,
  formAdvancedContent: null,
  modalEditBadge: null,
  modalPreview: null,
  statTotalValue: null,
  navButtons: null,
  statsGrid: null,
  revenueChart: null,
  statusList: null,
  urgentList: null,
  activityList: null,
  headerInfo: null,
  btnNewProject: null,
  pieChartLegend: null,
  settingsModalOverlay: null,
  settingsHostingPrice: null,
  settingsDefaultTicket: null,
  settingsAutoUpdate: null,
  settingsShowUrgent: null,
  settingsUrgentHours: null,
  profileAvatar: null,
  profileAvatarPreview: null,
  profileName: null,
  profileEmail: null,
  profileCurrentPassword: null,
  profileNewPassword: null,
  errorProfileName: null,
  errorProfileEmail: null,
  errorProfilePassword: null,
  errorProfileNewPassword: null,
  bottomNavItems: null,
  bottomNavCentral: null,
  bottomNavProfile: null,
  bottomNavProjects: null,
  bottomNavDashboard: null,
  bottomNavFinancial: null,
  bottomNavActivities: null,
  bottomNavAvatar: null,
  profileModalOverlay: null,
  profileModalAvatar: null,
  profileModalName: null,
  profileModalSettings: null,
  profileModalTheme: null,
  profileModalLogout: null,
  userAvatar: null,
  userProfile: null,
  userDropdown: null,
  dropdownAvatar: null,
  dropdownName: null,
  dropdownSettings: null,
  dropdownTheme: null,
  dropdownLogout: null,
  dropdownThemeIcon: null,
  dropdownThemeText: null,
  profileModalThemeIcon: null,
  profileModalThemeText: null,
  sidebar: null,
  ariaLiveRegion: null,

  init() {
    this.boardGrid = document.getElementById('boardGrid');
    this.boardContainer = document.getElementById('boardContainer');
    this.dashboardContainer = document.getElementById('dashboardContainer');
    this.financialContainer = document.getElementById('financialContainer');
    this.activitiesContainer = document.getElementById('activitiesContainer');
    this.activitiesListFull = document.getElementById('activitiesListFull');
    this.activitiesLoadMore = document.getElementById('activitiesLoadMore');
    this.searchContainer = document.getElementById('searchContainer');
    this.searchBtn = document.getElementById('searchBtn');
    this.searchInput = document.getElementById('searchInput');
    this.modalOverlay = document.getElementById('modalOverlay');
    this.modalTitle = document.getElementById('modalTitle');
    this.btnCloseModal = document.getElementById('btnCloseModal');
    this.btnCancel = document.getElementById('btnCancel');
    this.btnDelete = document.getElementById('btnDelete');
    this.btnGeneratePDF = document.getElementById('btnGeneratePDF');
    this.formClient = document.getElementById('formClient');
    this.formContact = document.getElementById('formContact');
    this.formType = document.getElementById('formType');
    this.formStack = document.getElementById('formStack');
    this.formDomain = document.getElementById('formDomain');
    this.formDesc = document.getElementById('formDesc');
    this.formPrice = document.getElementById('formPrice');
    this.formPayment = document.getElementById('formPayment');
    this.formDeadline = document.getElementById('formDeadline');
    this.formHosting = document.getElementById('formHosting');
    this.formRecurring = document.getElementById('formRecurring');
    this.formPublic = document.getElementById('formPublic');
    this.formAssetsLink = document.getElementById('formAssetsLink');
    this.subtasksSection = document.getElementById('subtasksSection');
    this.subtasksProgress = document.getElementById('subtasksProgress');
    this.subtaskList = document.getElementById('subtaskList');
    this.subtaskNewTitle = document.getElementById('subtaskNewTitle');
    this.btnAddTaskSubtask = document.getElementById('btnAddTaskSubtask');
    this.errorClient = document.getElementById('errorClient');
    this.errorContact = document.getElementById('errorContact');
    this.errorDomain = document.getElementById('errorDomain');
    this.errorPrice = document.getElementById('errorPrice');
    this.formProgress = document.getElementById('formProgress');
    this.formProgressText = document.getElementById('formProgressText');
    this.formAdvancedToggle = document.getElementById('formAdvancedToggle');
    this.formAdvancedContent = document.getElementById('formAdvancedContent');
    this.modalEditBadge = document.getElementById('modalEditBadge');
    this.modalPreview = document.getElementById('modalPreview');
    this.statTotalValue = document.getElementById('statTotalValue');
    this.navButtons = document.querySelectorAll('.nav-btn');
    this.statsGrid = document.getElementById('statsGrid');
    this.revenueChart = document.getElementById('revenueChart');
    this.statusList = document.getElementById('statusList');
    this.urgentList = document.getElementById('urgentList');
    this.activityList = document.getElementById('activityList');
    this.headerInfo = document.getElementById('headerInfo');
    this.btnNewProject = document.getElementById('btnNewProject');
    this.pieChartLegend = document.getElementById('pieChartLegend');
    this.settingsModalOverlay = document.getElementById('settingsModalOverlay');
    this.settingsHostingPrice = document.getElementById('settingsHostingPrice');
    this.settingsDefaultTicket = document.getElementById('settingsDefaultTicket');
    this.settingsAutoUpdate = document.getElementById('settingsAutoUpdate');
    this.settingsShowUrgent = document.getElementById('settingsShowUrgent');
    this.settingsUrgentHours = document.getElementById('settingsUrgentHours');
    this.profileAvatar = document.getElementById('profileAvatar');
    this.profileAvatarPreview = document.getElementById('profileAvatarPreview');
    this.profileName = document.getElementById('profileName');
    this.profileEmail = document.getElementById('profileEmail');
    this.profileCurrentPassword = document.getElementById('profileCurrentPassword');
    this.profileNewPassword = document.getElementById('profileNewPassword');
    this.errorProfileName = document.getElementById('errorProfileName');
    this.errorProfileEmail = document.getElementById('errorProfileEmail');
    this.errorProfilePassword = document.getElementById('errorProfilePassword');
    this.errorProfileNewPassword = document.getElementById('errorProfileNewPassword');
    this.bottomNavItems = document.querySelectorAll('.bottom-nav-item[data-view]');
    this.bottomNavCentral = document.getElementById('bottomNavCentral');
    this.bottomNavProfile = document.getElementById('bottomNavProfile');
    this.bottomNavProjects = document.getElementById('bottomNavProjects');
    this.bottomNavDashboard = document.getElementById('bottomNavDashboard');
    this.bottomNavFinancial = document.getElementById('bottomNavFinancial');
    this.bottomNavActivities = document.getElementById('bottomNavActivities');
    this.bottomNavAvatar = document.getElementById('bottomNavAvatar');
    this.profileModalOverlay = document.getElementById('profileModalOverlay');
    this.profileModalAvatar = document.getElementById('profileModalAvatar');
    this.profileModalName = document.getElementById('profileModalName');
    this.profileModalSettings = document.getElementById('profileModalSettings');
    this.profileModalTheme = document.getElementById('profileModalTheme');
    this.profileModalLogout = document.getElementById('profileModalLogout');
    this.userAvatar = document.getElementById('userAvatar');
    this.userProfile = document.getElementById('userProfile');
    this.userDropdown = document.getElementById('userDropdown');
    this.dropdownAvatar = document.getElementById('dropdownAvatar');
    this.dropdownName = document.getElementById('dropdownName');
    this.dropdownSettings = document.getElementById('dropdownSettings');
    this.dropdownTheme = document.getElementById('dropdownTheme');
    this.dropdownLogout = document.getElementById('dropdownLogout');
    this.dropdownThemeIcon = document.getElementById('dropdownThemeIcon');
    this.dropdownThemeText = document.getElementById('dropdownThemeText');
    this.profileModalThemeIcon = document.getElementById('profileModalThemeIcon');
    this.profileModalThemeText = document.getElementById('profileModalThemeText');
    this.sidebar = document.querySelector('.sidebar');
    this.ariaLiveRegion = document.getElementById('ariaLiveRegion');
  }
};
