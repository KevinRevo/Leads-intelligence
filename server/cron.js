const cron = require('node-cron');
const { scrapeFranceCreations } = require('./scrapers/france');
const { scrapeSwitzerlandCreations } = require('./scrapers/switzerland');
const { upsertScrapedCompanies, logSync } = require('./db');

let isSyncRunning = false;

/**
 * Run the daily or on-demand sync for France, Switzerland or both
 */
async function runSync(options = { country: 'ALL' }) {
  if (isSyncRunning) {
    return { status: 'already_running', message: 'Une synchronisation est déjà en cours' };
  }

  isSyncRunning = true;
  const startTime = Date.now();
  console.log(`[Sync] Démarrage de la synchronisation (Cible: ${options.country || 'ALL'})...`);

  let fetched = [];
  let errors = [];

  try {
    if (options.country === 'ALL' || options.country === 'FR') {
      try {
        const frList = await scrapeFranceCreations(25);
        fetched.push(...frList);
      } catch (e) {
        errors.push(`France: ${e.message}`);
      }
    }

    if (options.country === 'ALL' || options.country === 'CH') {
      try {
        const chList = await scrapeSwitzerlandCreations(20);
        fetched.push(...chList);
      } catch (e) {
        errors.push(`Suisse: ${e.message}`);
      }
    }

    const { addedCount, updatedCount, total } = upsertScrapedCompanies(fetched);
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    const syncResult = {
      status: 'success',
      recordsFetched: fetched.length,
      recordsAdded: addedCount,
      recordsUpdated: updatedCount,
      totalDatabase: total,
      durationSeconds: Number(duration),
      errors: errors.length > 0 ? errors : null,
      country: options.country || 'ALL',
    };

    logSync(syncResult);
    console.log(`[Sync terminé] ${addedCount} nouvelles sociétés ajoutées, ${updatedCount} mises à jour en ${duration}s.`);

    return syncResult;
  } catch (globalErr) {
    console.error('[Sync Erreur]', globalErr);
    const failResult = {
      status: 'error',
      message: globalErr.message,
      recordsFetched: 0,
      durationSeconds: ((Date.now() - startTime) / 1000).toFixed(1),
    };
    logSync(failResult);
    return failResult;
  } finally {
    isSyncRunning = false;
  }
}

/**
 * Initialize automatic daily cron job (runs every day at 05:00 AM)
 */
function initScheduler() {
  // Every day at 05:00 AM
  cron.schedule('0 5 * * *', async () => {
    console.log('[Scheduler] Exécution automatique du scraping quotidien (05:00)...');
    await runSync({ country: 'ALL' });
  });

  console.log('[Scheduler] Planificateur quotidien activé : synchronisation programmée tous les jours à 05:00.');
}

module.exports = {
  runSync,
  initScheduler,
  isSyncRunning: () => isSyncRunning,
};
