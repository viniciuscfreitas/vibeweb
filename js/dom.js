// DOM References
const DOM = {
  boardGrid: null,
  boardContainer: null,
  dashboardContainer: null,
  financialContainer: null,
  searchContainer: null,
  searchBtn: null,
  searchInput: null,
  modalOverlay: null,
  modalTitle: null,
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
  errorClient: null,
  errorContact: null,
  errorDomain: null,
  errorPrice: null,
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
  settingsSearchDebounce: null,
  settingsEnableCache: null,
  settingsShowUrgent: null,
  settingsUrgentHours: null,
  btnClearCache: null,
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

  init() {
    this.boardGrid = document.getElementById('boardGrid');
    this.boardContainer = document.getElementById('boardContainer');
    this.dashboardContainer = document.getElementById('dashboardContainer');
    this.financialContainer = document.getElementById('financialContainer');
    this.searchContainer = document.getElementById('searchContainer');
    this.searchBtn = document.getElementById('searchBtn');
    this.searchInput = document.getElementById('searchInput');
    this.modalOverlay = document.getElementById('modalOverlay');
    this.modalTitle = document.getElementById('modalTitle');
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
    this.errorClient = document.getElementById('errorClient');
    this.errorContact = document.getElementById('errorContact');
    this.errorDomain = document.getElementById('errorDomain');
    this.errorPrice = document.getElementById('errorPrice');
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
    this.settingsSearchDebounce = document.getElementById('settingsSearchDebounce');
    this.settingsEnableCache = document.getElementById('settingsEnableCache');
    this.settingsShowUrgent = document.getElementById('settingsShowUrgent');
    this.settingsUrgentHours = document.getElementById('settingsUrgentHours');
    this.btnClearCache = document.getElementById('btnClearCache');
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
  }
};
