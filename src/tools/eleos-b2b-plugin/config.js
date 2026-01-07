// Configuration for Eleos B2B

const ELEOS_CONFIG = {
  API_BASE_URL: 'https://eleos-b2b-enrichment.kiruba-e.workers.dev',
  MASTER_PASSWORD: 'Florida'
};

// Make config available globally for content scripts
window.MEEKA_CONFIG = ELEOS_CONFIG;
window.ELEOS_CONFIG = ELEOS_CONFIG;
