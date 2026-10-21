const fs = require('fs');
const path = require('path');
const { runSync } = require('../cron');
const { evaluateRevolutCompliance, evaluateFxPotential, getGeoZone } = require('../services/compliance');
const { buildCompanyNetwork } = require('../services/network');
const { isValidPhysicalPersonName, isValidCommercialCompany, buildNorthDataUrl, detectInternationalLinks } = require('../services/northdata');
const { cleanCompanyName } = require('../services/enricher');

async function main() {
  console.log('[Daily Sync] Démarrage du scraping quotidien automatisé...');

  // 1. Run official scrapers (BODACC France & SHAB Suisse)
  const syncResult = await runSync({ country: 'ALL' });
  console.log('[Daily Sync] Résultat brut:', JSON.stringify(syncResult));

  // 2. Read updated database and apply 100% factual rules, triple-check commercial filter & cloud CRM overrides
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

  // Triple-check: Purge any non-commercial company (Entrepreneur Individuel, Verein, SCI, >30M€ CA)
  db.companies = db.companies.filter(comp => isValidCommercialCompany(comp));

  for (const comp of db.companies) {
    // Merge shared team notes/status if present
    if (cloudOverrides[comp.id]) {
      const ov = cloudOverrides[comp.id];
      if (ov.crmStatus) comp.crmStatus = ov.crmStatus;
      if (ov.crmNotes !== undefined) comp.crmNotes = ov.crmNotes;
      if (ov.crmAssignedTo !== undefined) comp.crmAssignedTo = ov.crmAssignedTo;
    }

    const cleanComp = cleanCompanyName(comp.name) || comp.name;
    const countryLabel = comp.country === 'CH' ? 'Suisse' : 'France';
    comp.linkedinCompanyUrl = `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(`"${cleanComp}" ${countryLabel}`)}`;
    comp.northDataUrl = buildNorthDataUrl(comp);
    comp.incorporationYear = (comp.incorporationDate || '').slice(0, 4) || '2026';

    // Strictly PHYSICAL Dirigeants only
    const realDirs = (comp.dirigeants || []).filter(d => isValidPhysicalPersonName(d?.name, comp.name));
    if (realDirs.length > 0) {
      comp.dirigeants = realDirs.map((d, idx) => ({ ...d, isPrimary: idx === 0 }));
      comp.linkedinDirigeantUrl = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`"${realDirs[0].name}" "${cleanComp}"`)}`;
    } else {
      comp.dirigeants = [{ name: 'X', role: 'Non renseigné au registre', isPrimary: true }];
      comp.linkedinDirigeantUrl = null;
    }

    // Strictly PHYSICAL CFO only
    if (comp.cfo && !isValidPhysicalPersonName(comp.cfo.name, comp.name)) {
      comp.cfo = { name: 'X', role: 'Non renseigné', isEstimated: false, linkedinSearchUrl: null };
    }

    // International / Cross-Border Links
    comp.internationalLinks = comp.internationalLinks && comp.internationalLinks.length > 0
      ? comp.internationalLinks
      : detectInternationalLinks(comp);
    comp.isCrossBorder = comp.internationalLinks.length > 0;

    // Revolut Compliance Pre-Screening + FX Multi-Currency & Geo Zone
    comp.compliance = evaluateRevolutCompliance(comp);
    comp.fxPotential = evaluateFxPotential(comp);
    comp.geoZone = getGeoZone(comp);

    // Ensure rich North Data-style network cartography
    comp.network = await buildCompanyNetwork(comp, db.companies, { skipLiveLookup: true });
  }

  // Remove any company without a physical director
  db.companies = db.companies.filter(c => c.dirigeants?.[0]?.name && c.dirigeants[0].name !== 'X');

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
  const highFxCount = db.companies.filter(c => c.fxPotential?.level === 'high').length;
  const crossBorderCount = db.companies.filter(c => c.isCrossBorder || (c.corporateLinks && c.corporateLinks.length > 0)).length;

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
    verifiedWebCount,
    highFxCount,
    crossBorderCount
  };
  const publicBundle = { companies: db.companies, stats };

  // 5. Update client data sources
  const clientPublicData = path.join(__dirname, '../../client/public/data.json');
  const clientSrcData = path.join(__dirname, '../../client/src/data/companies.json');
  const rootData = path.join(__dirname, '../../data.json');

  fs.writeFileSync(clientPublicData, JSON.stringify(publicBundle, null, 2));
  fs.writeFileSync(clientSrcData, JSON.stringify(db.companies, null, 2));
  fs.writeFileSync(rootData, JSON.stringify(publicBundle, null, 2));

  console.log(`[Daily Sync] Terminé avec succès ! Total base: ${total} sociétés (${france} FR / ${switzerland} CH).`);
}

main().catch(err => {
  console.error('[Daily Sync] Erreur fatale:', err);
  process.exit(1);
});
