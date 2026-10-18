const express = require('express');
const cors = require('cors');
const path = require('path');
const { 
  getCompanies, 
  getCompanyById, 
  updateCompanyCRM, 
  getDashboardStats, 
  readDb 
} = require('./db');
const { runSync, initScheduler, isSyncRunning } = require('./cron');
const { buildCompanyNetwork } = require('./services/network');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Initialize auto-scheduler
if (!process.env.VERCEL) {
  initScheduler();

  // Run initial sync on startup if db is empty
  (async () => {
    const db = readDb();
    if (!db.companies || db.companies.length === 0) {
      console.log('[Startup] Base de données vide, lancement d\'un premier scraping initial...');
      await runSync({ country: 'ALL' });
    }
  })();
}

/**
 * 1. GET /api/companies
 * Filter by country, crmStatus, search, dateRange
 */
app.get('/api/companies', (req, res) => {
  try {
    const filters = {
      country: req.query.country || 'ALL',
      crmStatus: req.query.crmStatus || 'ALL',
      search: req.query.search || '',
      dateRange: req.query.dateRange || 'all',
      exactDate: req.query.exactDate || '',
      verifiedOnly: req.query.verifiedOnly === 'true',
    };
    const list = getCompanies(filters);
    res.json({
      success: true,
      count: list.length,
      companies: list,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 2. GET /api/companies/:id
 */
app.get('/api/companies/:id', (req, res) => {
  try {
    const company = getCompanyById(req.params.id);
    if (!company) {
      return res.status(404).json({ success: false, message: 'Société non trouvée' });
    }
    res.json({ success: true, company });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 3. PATCH /api/companies/:id/status
 * Update CRM status ('new', 'to_contact', 'contacted_email', 'contacted_call', 'in_crm', 'converted', 'unqualified'),
 * notes and assigned sales rep
 */
app.patch('/api/companies/:id/status', (req, res) => {
  try {
    const { crmStatus, crmNotes, crmAssignedTo } = req.body;
    const updated = updateCompanyCRM(req.params.id, { crmStatus, crmNotes, crmAssignedTo });
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Société non trouvée' });
    }
    res.json({ success: true, company: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 4. POST /api/companies/bulk-status
 */
app.post('/api/companies/bulk-status', (req, res) => {
  try {
    const { ids = [], crmStatus, crmAssignedTo } = req.body;
    const updated = [];
    for (const id of ids) {
      const u = updateCompanyCRM(id, { crmStatus, crmAssignedTo });
      if (u) updated.push(u);
    }
    res.json({ success: true, count: updated.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 5. GET /api/companies/:id/network
 * Cartographie des boîtes liées par le dirigeant ou actionnaires
 */
app.get('/api/companies/:id/network', async (req, res) => {
  try {
    const company = getCompanyById(req.params.id);
    if (!company) {
      return res.status(404).json({ success: false, message: 'Société non trouvée' });
    }

    const all = getCompanies();
    const network = await buildCompanyNetwork(company, all);
    res.json({ success: true, network });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 6. GET /api/stats
 */
app.get('/api/stats', (req, res) => {
  try {
    const stats = getDashboardStats();
    res.json({ success: true, stats, isSyncRunning: isSyncRunning() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 7. POST /api/sync
 * Trigger manual sync now
 */
app.post('/api/sync', async (req, res) => {
  try {
    const country = req.body.country || 'ALL';
    const result = await runSync({ country });
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 8. GET /api/sync/status
 */
app.get('/api/sync/status', (req, res) => {
  const db = readDb();
  res.json({
    isRunning: isSyncRunning(),
    lastSync: db.lastSync,
    logs: (db.syncLogs || []).slice(0, 10),
  });
});

/**
 * 9. GET /api/export/csv
 * Export filtered list to standard CRM CSV format
 */
app.get('/api/export/csv', (req, res) => {
  try {
    const filters = {
      country: req.query.country || 'ALL',
      crmStatus: req.query.crmStatus || 'ALL',
      search: req.query.search || '',
    };
    const list = getCompanies(filters);

    const headers = [
      'ID',
      'Pays',
      'Nom Entreprise',
      'Score Surete (%)',
      'Niveau Surete',
      'Numero Immatriculation',
      'Date Creation',
      'Forme Juridique',
      'Capital Social',
      'Activite',
      'Ville',
      'Code Postal',
      'Adresse',
      'Dirigeant Principal',
      'Role Dirigeant',
      'Email Direct',
      'Source Email',
      'Telephone',
      'Source Telephone',
      'Site Web',
      'Statut Site Web',
      'LinkedIn Entreprise',
      'LinkedIn Dirigeant',
      'Nom CFO / Dir Financier',
      'Statut CRM',
      'Assigné à',
      'Notes Commerciales',
    ];

    const escapeCsv = (val) => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const rows = list.map(c => [
      c.id,
      c.country,
      c.name,
      c.safety?.score || 50,
      c.safety?.label || 'Moyenne',
      c.registrationNumber,
      c.incorporationDate,
      c.legalForm,
      c.shareCapital,
      c.activity,
      c.city,
      c.postalCode,
      c.address,
      c.dirigeants?.[0]?.name || '',
      c.dirigeants?.[0]?.role || '',
      c.bestEmail || '',
      c.emailSource || '',
      c.phone || '',
      c.phoneSource || '',
      c.website || '',
      c.websiteStatus || '',
      c.linkedinCompanyUrl || '',
      c.linkedinDirigeantUrl || '',
      c.cfo?.name || '',
      c.crmStatus || '',
      c.crmAssignedTo || '',
      c.crmNotes || '',
    ].map(escapeCsv).join(','));

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=revolut_leads_${new Date().toISOString().split('T')[0]}.csv`);
    res.send(csvContent);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

const distPath = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(distPath));
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(distPath, 'index.html'));
});

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`[Revolut Sales Engine API] Serveur démarré sur http://localhost:${PORT}`);
  });
}

module.exports = app;
