const fs = require('fs');
const path = require('path');

const SEED_DB_PATH = path.join(__dirname, 'data', 'db.json');
const DB_PATH = process.env.VERCEL 
  ? path.join('/tmp', 'revolut_db.json')
  : SEED_DB_PATH;

function ensureDbFile() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    try { fs.mkdirSync(dir, { recursive: true }); } catch (e) {}
  }
  if (!fs.existsSync(DB_PATH)) {
    if (fs.existsSync(SEED_DB_PATH)) {
      try {
        fs.copyFileSync(SEED_DB_PATH, DB_PATH);
        return;
      } catch (e) {
        console.warn('Could not copy seed DB to /tmp:', e.message);
      }
    }
    const initialData = {
      companies: [],
      syncLogs: [],
      lastSync: null,
      settings: {
        autoRefreshHour: 5,
        filterSci: true,
        minCapital: 1000,
      }
    };
    try {
      fs.writeFileSync(DB_PATH, JSON.stringify(initialData, null, 2), 'utf-8');
    } catch (e) {
      console.warn('Could not write initial DB:', e.message);
    }
  }
}

function readDb() {
  ensureDbFile();
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    if (fs.existsSync(SEED_DB_PATH)) {
      try {
        return JSON.parse(fs.readFileSync(SEED_DB_PATH, 'utf-8'));
      } catch (err) {}
    }
    console.error('Error reading DB, restoring blank:', e);
    return { companies: [], syncLogs: [], lastSync: null, settings: {} };
  }
}

function writeDb(data) {
  try {
    ensureDbFile();
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.error('writeDb failed:', e.message);
  }
}

/**
 * Get all companies with search and filtering
 */
function getCompanies(filters = {}) {
  const db = readDb();
  let list = db.companies || [];

  if (filters.country && filters.country !== 'ALL') {
    list = list.filter(c => c.country === filters.country);
  }

  if (filters.crmStatus && filters.crmStatus !== 'ALL') {
    list = list.filter(c => c.crmStatus === filters.crmStatus);
  }

  if (filters.search) {
    const q = filters.search.toLowerCase().trim();
    list = list.filter(c => 
      c.name?.toLowerCase().includes(q) ||
      c.registrationNumber?.toLowerCase().includes(q) ||
      c.city?.toLowerCase().includes(q) ||
      c.activity?.toLowerCase().includes(q) ||
      c.dirigeants?.some(d => d.name?.toLowerCase().includes(q))
    );
  }

  // Always exclude solo individual entrepreneurs (EI / personnes physiques)
  list = list.filter(c => !/individuel|personne physique|einzelfirma|einzelunternehmen|auto-entrepreneur/i.test(c.legalForm || '') && !/individuel/i.test(c.name || ''));

  if (filters.exactDate) {
    list = list.filter(c => (c.incorporationDate || '').split('T')[0] === filters.exactDate);
  } else if (filters.dateRange && filters.dateRange.startsWith('month:')) {
    const targetMonth = filters.dateRange.replace('month:', '');
    list = list.filter(c => (c.incorporationDate || '').startsWith(targetMonth));
  } else if (filters.dateRange === 'today') {
    const limitDate = new Date(Date.now() - 2 * 86400000).toISOString().split('T')[0];
    list = list.filter(c => (c.incorporationDate || c.createdAt) >= limitDate);
  } else if (filters.dateRange === '3days') {
    const limitDate = new Date(Date.now() - 3 * 86400000).toISOString().split('T')[0];
    list = list.filter(c => (c.incorporationDate || c.createdAt) >= limitDate);
  } else if (filters.dateRange === '7days') {
    const limitDate = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
    list = list.filter(c => (c.incorporationDate || c.createdAt) >= limitDate);
  } else if (filters.dateRange === '14days') {
    const limitDate = new Date(Date.now() - 14 * 86400000).toISOString().split('T')[0];
    list = list.filter(c => (c.incorporationDate || c.createdAt) >= limitDate);
  } else if (filters.dateRange === '30days') {
    const limitDate = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
    list = list.filter(c => (c.incorporationDate || c.createdAt) >= limitDate);
  } else if (filters.dateRange === '90days') {
    const limitDate = new Date(Date.now() - 90 * 86400000).toISOString().split('T')[0];
    list = list.filter(c => (c.incorporationDate || c.createdAt) >= limitDate);
  } else if (filters.dateRange === '180days') {
    const limitDate = new Date(Date.now() - 185 * 86400000).toISOString().split('T')[0];
    list = list.filter(c => (c.incorporationDate || c.createdAt) >= limitDate);
  }
  // 'all' preserves all historical leads from day 14, 15, 16, etc.

  if (filters.verifiedOnly === 'true' || filters.verifiedOnly === true) {
    list = list.filter(c => c.hasDigitalPresence || c.website || (c.safety && c.safety.score >= 50));
  }

  // Sort by incorporationDate desc then createdAt desc
  list.sort((a, b) => new Date(b.incorporationDate || b.createdAt) - new Date(a.incorporationDate || a.createdAt));

  return list;
}

function getCompanyById(id) {
  const db = readDb();
  return db.companies.find(c => c.id === id) || null;
}

/**
 * Update CRM status, notes, or assigned sales rep
 */
function updateCompanyCRM(id, updates) {
  const db = readDb();
  const index = db.companies.findIndex(c => c.id === id);
  if (index === -1) return null;

  const current = db.companies[index];
  db.companies[index] = {
    ...current,
    crmStatus: updates.crmStatus !== undefined ? updates.crmStatus : current.crmStatus,
    crmNotes: updates.crmNotes !== undefined ? updates.crmNotes : current.crmNotes,
    crmAssignedTo: updates.crmAssignedTo !== undefined ? updates.crmAssignedTo : current.crmAssignedTo,
    lastContactedAt: updates.crmStatus && updates.crmStatus.startsWith('contacted') ? new Date().toISOString() : current.lastContactedAt,
    updatedAt: new Date().toISOString(),
  };

  writeDb(db);
  return db.companies[index];
}

/**
 * Bulk upsert scraped companies without losing existing CRM notes or statuses
 */
function upsertScrapedCompanies(newItems = []) {
  const db = readDb();
  let addedCount = 0;
  let updatedCount = 0;

  for (const item of newItems) {
    const existingIndex = db.companies.findIndex(c => 
      c.id === item.id || 
      (c.registrationNumber && c.registrationNumber === item.registrationNumber)
    );

    if (existingIndex >= 0) {
      // Preserve existing CRM status, notes and assignment!
      const current = db.companies[existingIndex];
      db.companies[existingIndex] = {
        ...item,
        crmStatus: current.crmStatus || 'new',
        crmNotes: current.crmNotes || '',
        crmAssignedTo: current.crmAssignedTo || null,
        lastContactedAt: current.lastContactedAt || null,
        updatedAt: new Date().toISOString(),
      };
      updatedCount++;
    } else {
      db.companies.unshift(item);
      addedCount++;
    }
  }

  writeDb(db);
  return { addedCount, updatedCount, total: db.companies.length };
}

/**
 * Save sync execution log
 */
function logSync(info) {
  const db = readDb();
  db.lastSync = {
    date: new Date().toISOString(),
    ...info,
  };
  db.syncLogs = db.syncLogs || [];
  db.syncLogs.unshift(db.lastSync);
  if (db.syncLogs.length > 30) db.syncLogs.pop(); // keep last 30 logs

  writeDb(db);
  return db.lastSync;
}

/**
 * Get dashboard metrics
 */
function getDashboardStats() {
  const db = readDb();
  const list = db.companies || [];
  const today = new Date().toISOString().split('T')[0];

  const total = list.length;
  const todayCount = list.filter(c => c.incorporationDate === today).length;
  const highSafetyCount = list.filter(c => (c.safety && c.safety.score >= 60)).length;
  const verifiedWebCount = list.filter(c => Boolean(c.website)).length;
  const inCrm = list.filter(c => c.crmStatus === 'in_crm').length;
  const contacted = list.filter(c => c.crmStatus === 'contacted_email' || c.crmStatus === 'contacted_call').length;
  const converted = list.filter(c => c.crmStatus === 'converted').length;
  const toContact = list.filter(c => c.crmStatus === 'to_contact' || c.crmStatus === 'new').length;
  
  const franceCount = list.filter(c => c.country === 'FR').length;
  const switzerlandCount = list.filter(c => c.country === 'CH').length;

  return {
    total,
    todayCount,
    highSafetyCount,
    verifiedWebCount,
    inCrm,
    contacted,
    converted,
    toContact,
    franceCount,
    switzerlandCount,
    lastSync: db.lastSync,
  };
}

module.exports = {
  getCompanies,
  getCompanyById,
  updateCompanyCRM,
  upsertScrapedCompanies,
  logSync,
  getDashboardStats,
  readDb,
};
