const fs = require('fs');
const path = require('path');
const { runSync } = require('../cron');
const { readDb, writeDb } = require('../db');
const { evaluateRevolutCompliance, evaluateFxPotential, getGeoZone } = require('../services/compliance');
const { isValidPhysicalPersonName, isValidCommercialCompany, buildNorthDataUrl, detectInternationalLinks } = require('../services/northdata');
const { cleanCompanyName } = require('../services/enricher');
const { prepareClientChunks } = require('./prepare-client-chunks');

async function main() {
  console.log('[Daily Sync] Démarrage du scraping quotidien automatisé...');

  // 1. Run official scrapers (BODACC France & SHAB Suisse)
  const syncResult = await runSync({ country: 'ALL' });
  console.log('[Daily Sync] Résultat brut du scraping:', JSON.stringify(syncResult));

  // 2. Read updated database (avec restauration automatique depuis les chunks si vide)
  const db = readDb();
  console.log(`[Daily Sync] Base chargée : ${db.companies.length} sociétés.`);

  // 3. Pull shared multi-computer CRM overrides from GitHub Issue #1 (si GITHUB_TOKEN ou public)
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

  // 4. Filtrage et mise à jour rapide des entités (sans boucle quadratique bloquante)
  db.companies = db.companies.filter(comp => isValidCommercialCompany(comp));

  for (const comp of db.companies) {
    // Merge shared team notes/status if present
    if (cloudOverrides[comp.id]) {
      const ov = cloudOverrides[comp.id];
      if (ov.crmStatus) comp.crmStatus = ov.crmStatus;
      if (ov.crmNotes !== undefined) comp.crmNotes = ov.crmNotes;
      if (ov.crmAssignedTo !== undefined) comp.crmAssignedTo = ov.crmAssignedTo;
    }

    if (!comp.northDataUrl) {
      comp.northDataUrl = buildNorthDataUrl(comp);
    }
    if (!comp.incorporationYear) {
      comp.incorporationYear = (comp.incorporationDate || '').slice(0, 4) || '2026';
    }

    // Strictly PHYSICAL Dirigeants only
    const realDirs = (comp.dirigeants || []).filter(d => isValidPhysicalPersonName(d?.name, comp.name));
    if (realDirs.length > 0) {
      comp.dirigeants = realDirs.map((d, idx) => ({ ...d, isPrimary: idx === 0 }));
      if (!comp.linkedinDirigeantUrl) {
        const cleanComp = cleanCompanyName(comp.name) || comp.name;
        comp.linkedinDirigeantUrl = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`"${realDirs[0].name}" "${cleanComp}"`)}`;
      }
    } else {
      comp.dirigeants = [{ name: 'X', role: 'Non renseigné au registre', isPrimary: true }];
      comp.linkedinDirigeantUrl = null;
    }
  }

  // Filtrer toute société sans dirigeant physique
  db.companies = db.companies.filter(c => c.dirigeants?.[0]?.name && c.dirigeants[0].name !== 'X');

  // 5. Sauvegarde de la base principale
  writeDb(db);

  // 6. Préparation et découpage automatique des chunks clients pour GitHub Pages (création auto des dossiers)
  const { bundle } = prepareClientChunks(db.companies);

  const stats = bundle.stats;
  console.log(`[Daily Sync] Terminé avec succès ! Total base: ${stats.total} sociétés (🇫🇷 ${stats.france} FR | 🇨🇭 ${stats.switzerland} CH | 🇧🇪 ${stats.belgium} BE | 🇱🇺 ${stats.luxembourg} LU).`);
}

main().catch(err => {
  console.error('[Daily Sync] Erreur fatale:', err);
  process.exit(1);
});
