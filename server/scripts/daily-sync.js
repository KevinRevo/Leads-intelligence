const fs = require('fs');
const path = require('path');
const { runSync } = require('../cron');
const { evaluateRevolutCompliance } = require('../services/compliance');
const { buildCompanyNetwork } = require('../services/network');

function cleanCompanyName(name) {
  if (!name) return '';
  return name
    .replace(/\b(SAS|SARL|SA|SASU|EURL|GmbH|Sàrl|Sarl|AG|SNC|SCI|INC|LTD|CORP|GROUP|FRANCE|SUISSE)\b/gi, '')
    .replace(/[^\w\s-]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isGeneric(name, companyName) {
  if (!name) return true;
  const n = name.trim().toLowerCase();
  const c = (companyName || '').trim().toLowerCase();
  if (n === 'x' || n === 'fondateur' || n === 'non renseigné' || n === 'non renseigne') return true;
  if (n.includes('direction') || n.includes('conseil d\'administration')) return true;
  if (n === c || n === c + ' direction' || n.includes(c + ' direction')) return true;
  return false;
}

async function main() {
  console.log('[Daily Sync] Démarrage du scraping quotidien automatisé...');
  
  // 1. Run official scrapers (BODACC France & SHAB Suisse)
  const syncResult = await runSync({ country: 'ALL' });
  console.log('[Daily Sync] Résultat brut:', JSON.stringify(syncResult));

  // 2. Read updated database and apply 100% factual rules, compliance & cloud CRM overrides
  const dbPath = path.join(__dirname, '../data/db.json');
  const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

  // Pull shared multi-computer CRM overrides from GitHub Issue #1
  let cloudOverrides = {};
  try {
    const res = await fetch('https://api.github.com/repos/KevinRevo/Leads-intelligence/issues/1', {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        ...(process.env.GITHUB_TOKEN ? { 'Authorization': `token ${process.env.GITHUB_TOKEN}` } : {})
      }
    });
    if (res.ok) {
      const issue = await res.json();
      const parsed = JSON.parse(issue.body || '{}');
      cloudOverrides = parsed.overrides || {};
      console.log(`[Daily Sync] ${Object.keys(cloudOverrides).length} notes/statuts partagés récupérés du Cloud.`);
    }
  } catch (e) {
    console.warn('[Daily Sync] Impossible de lire les overrides Cloud:', e.message);
  }

  for (const comp of db.companies) {
    // Merge shared team notes/status if present
    if (cloudOverrides[comp.id]) {
      const ov = cloudOverrides[comp.id];
      if (ov.crmStatus) comp.crmStatus = ov.crmStatus;
      if (ov.crmNotes !== undefined) comp.crmNotes = ov.crmNotes;
      if (ov.crmAssignedTo !== undefined) comp.crmAssignedTo = ov.crmAssignedTo;
    }

    const cleanComp = cleanCompanyName(comp.name);
    comp.linkedinCompanyUrl = `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(cleanComp || comp.name)}`;

    // Dirigeants
    const realDirs = (comp.dirigeants || []).filter(d => !isGeneric(d.name, comp.name));
    if (realDirs.length > 0) {
      comp.dirigeants = realDirs;
      comp.linkedinDirigeantUrl = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(realDirs[0].name)}`;
    } else {
      comp.dirigeants = [{ name: 'X', role: 'Non renseigné au registre', isPrimary: true }];
      comp.linkedinDirigeantUrl = null;
    }

    // CFO
    if (comp.cfo && isGeneric(comp.cfo.name, comp.name)) {
      comp.cfo = { name: 'X', role: 'Non renseigné', isEstimated: false, linkedinSearchUrl: null };
    }

    // Revolut Compliance Pre-Screening
    comp.compliance = evaluateRevolutCompliance(comp);

    // Ensure rich network cartography
    if (!comp.network || !comp.network.nodes || comp.network.nodes.length <= 1) {
      comp.network = await buildCompanyNetwork(comp, db.companies);
    }
  }

  // 3. Write back to server db.json
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));

  // 4. Calculate stats and build public bundle
  const total = db.companies.length;
  const france = db.companies.filter(c => c.country === 'FR').length;
  const switzerland = db.companies.filter(c => c.country === 'CH').length;
  const toContact = db.companies.filter(c => c.crmStatus === 'to_contact' || c.crmStatus === 'new').length;
  const contacted = db.companies.filter(c => c.crmStatus?.startsWith('contacted')).length;
  const inCrm = db.companies.filter(c => c.crmStatus === 'in_crm' || c.crmStatus === 'converted').length;
  const highSafetyCount = db.companies.filter(c => (c.safety?.score || c.confidenceScore || 0) >= 60).length;
  const verifiedWebCount = db.companies.filter(c => Boolean(c.website)).length;

  const stats = {
    total,
    france,
    switzerland,
    franceCount: france,
    switzerlandCount: switzerland,
    toContact,
    contacted,
    inCrm,
    highConfidence: highSafetyCount,
    highSafetyCount,
    verifiedWebCount
  };
  const publicBundle = { companies: db.companies, stats };

  // 5. Update client data sources
  const clientPublicPath = path.join(__dirname, '../../client/public/data.json');
  const clientSrcPath = path.join(__dirname, '../../client/src/data/companies.json');

  if (fs.existsSync(path.dirname(clientPublicPath))) {
    fs.writeFileSync(clientPublicPath, JSON.stringify(publicBundle, null, 2));
  }
  if (fs.existsSync(path.dirname(clientSrcPath))) {
    fs.writeFileSync(clientSrcPath, JSON.stringify(publicBundle, null, 2));
  }

  console.log(`[Daily Sync Terminé] Base à jour avec ${total} sociétés (${france} FR, ${switzerland} CH).`);
}

main().catch(err => {
  console.error('[Daily Sync Erreur]', err);
  process.exit(1);
});
