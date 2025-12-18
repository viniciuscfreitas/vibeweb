// Constants - Business Rules
// All business logic constants in one place (Locality of Behavior)

// UI Constants
const SEARCH_DEBOUNCE_MS = 200;
const DISCOVERY_COLUMN_ID = 0;
const STORAGE_KEY = 'vibeTasks_Vanilla';

// Business Rule: Urgent deadline keywords - these are always considered urgent
const URGENT_DEADLINES = ['48h', '24h', 'Hoje'];

// Financial Business Rules
// Hosting subscription price per month
const HOSTING_PRICE_EUR = 29;
// MRR targets for business goals
const TARGET_MRR_10K = 10000;
const TARGET_MRR_20K = 20000;
// Default values for calculations when insufficient data
const DEFAULT_AVERAGE_TICKET = 1500; // Average project value
const DEFAULT_CAC = 40; // Customer Acquisition Cost (not currently used in calculations)
const MOCK_BASE_REVENUE = 2000; // Base revenue for mock data generation

// Time Constants (milliseconds)
const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;
const URGENT_HOURS_48 = 48;
const URGENT_HOURS_48_MS = URGENT_HOURS_48 * MS_PER_HOUR;
const HOURS_24_MS = 24 * MS_PER_HOUR;

// Payment Status Constants - Business Rules
// These values must match backend database values exactly
const PAYMENT_STATUS_PENDING = 'Pendente'; // No payment received
const PAYMENT_STATUS_PARTIAL = '50% Após Aprovação'; // Half paid (50% of total price)
const PAYMENT_STATUS_PAID = 'Pago 100%'; // Fully paid

// Hosting Status Constants - Business Rules
// These values must match backend database values exactly
const HOSTING_NO = 'nao'; // No hosting subscription
const HOSTING_YES = 'sim'; // Active hosting subscription (counts toward MRR)
const HOSTING_LATER = 'depois'; // Potential upsell opportunity

// UI Constants
const CHART_TOTAL_HEIGHT = 200;
const CHART_SPACE_FOR_LABELS = 40;
const CHART_MINIMUM_BAR_HEIGHT = 8;
const PIE_CHART_SIZE = 160;
const PIE_CHART_RADIUS = 60;

// Deadline Constants
const DEADLINE_UNDEFINED = 'A Definir';
const DEADLINE_OVERDUE = 'Vencido';

// Email validation
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Storage Keys
const THEME_STORAGE_KEY = 'vibeTasks_theme';
const SETTINGS_STORAGE_KEY = 'vibeTasks_settings';

// Kanban Pipeline - Business Rules
// Column IDs must match backend database (col_id values)
// Pipeline flow: 0 -> 1 -> 2 -> 3
const COLUMNS = [
  { id: 0, name: 'Descoberta' }, // New leads/projects
  { id: 1, name: 'Acordo' }, // Agreement reached, project approved
  { id: 2, name: 'Construir e Entregar' }, // In development/delivery
  { id: 3, name: 'Suporte / Live' } // Completed, live, with potential hosting
];
