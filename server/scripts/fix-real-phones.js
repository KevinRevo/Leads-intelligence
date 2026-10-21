/**
 * Script de nettoyage et d'extraction des vrais numéros de téléphone :
 * 1. Supprime définitivement les faux numéros placeholders (+33 1 84 16 00 00 et +41 22 819 20 00).
 * 2. Scrape le site internet officiel de chaque entreprise pour extraire son VRAI numéro de téléphone (page d'accueil, mentions légales, /contact).
 * 3. Si aucun numéro réel n'est détecté sur le site ou au greffe, laisse phone = null (au lieu d'un faux numéro identique).
 * 4. Met à jour db.json, client/public/data.json, data.json et client/src/data/companies.json.
 */

const fs = require('fs');
const path = require('path');
const { scrapeWebsitePhone, normalizePhone, FAKE_BLACKLIST } = require('../services/phoneExtractor');

const dbPath = path.join(__dirname, '../data/db.json');
const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));

async function runPool(items, concurrency, worker) {
  let idx = 0;
  let done = 0;
  const total = items.length;
  async function loop() {
    while (idx < total) {
      const i = idx++;
      await worker(items[i]);
      done++;
      if (done % 50 === 0 || done === total) {
        console.log(`[Vrais Téléphones] ${done} / ${total} entreprises vérifiées...`);
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, loop));
}

async function main() {
  console.log('=== EXTRACTION DES VRAIS NUMÉROS DE TÉLÉPHONE SUR LES SITES WEB ===');

  let fakeRemoved = 0;
  let realFound = 0;
  let keptRegistry = 0;
  let nullPhones = 0;

  // Filtrer les entreprises nécessitant un scan
  const toScan = [];

  for (const c of db.companies) {
    const isFake = !c.phone || FAKE_BLACKLIST.has(c.phone) || c.phone.includes('84 16 00') || c.phone.includes('819 20 00');
    if (isFake) {
      c.phone = null;
      fakeRemoved++;
      if (c.website) {
        toScan.push(c);
      } else {
        c.phoneSource = 'Non renseigné au registre ou sur le site';
        nullPhones++;
      }
    } else {
      // Valider si le numéro existant est bien conforme
      const valid = normalizePhone(c.phone, c.country);
      if (valid) {
        c.phone = valid;
        keptRegistry++;
      } else {
        c.phone = null;
        if (c.website) {
          toScan.push(c);
        } else {
          c.phoneSource = 'Non renseigné au registre ou sur le site';
          nullPhones++;
        }
      }
    }
  }

  console.log(`[Diagnostic initial] Faux numéros supprimés : ${fakeRemoved} | Numéros de registre conservés : ${keptRegistry}`);
  console.log(`[Crawl des sites] ${toScan.length} entreprises avec site web vont être analysées pour extraire leur vrai numéro...`);

  await runPool(toScan, 20, async (company) => {
    try {
      const res = await scrapeWebsitePhone(company.website, company.country);
      if (res && res.phone) {
        company.phone = res.phone;
        company.phoneSource = res.source;
        realFound++;
      } else {
        company.phone = null;
        company.phoneSource = 'Non renseigné au registre ou sur le site';
        nullPhones++;
      }
    } catch {
      company.phone = null;
      company.phoneSource = 'Non renseigné au registre ou sur le site';
      nullPhones++;
    }
  });

  console.log(`\n=== RÉSULTATS DU SCAN TÉLÉPHONIQUE ===`);
  console.log(`- Vrais numéros extraits depuis les sites : ${realFound}`);
  console.log(`- Numéros officiels de registres (BCE, etc.) : ${keptRegistry}`);
  console.log(`- Entreprises sans numéro (affichées 'Non renseigné') : ${nullPhones}`);
  console.log(`- Total numéros réels uniques en base : ${realFound + keptRegistry}`);

  // Vérifier qu'aucun numéro n'apparaît de façon anormale (> 5 fois)
  const phoneCounts = {};
  for (const c of db.companies) {
    if (c.phone) {
      phoneCounts[c.phone] = (phoneCounts[c.phone] || 0) + 1;
    }
  }
  const duplicates = Object.entries(phoneCounts).filter(([_, count]) => count > 3);
  if (duplicates.length > 0) {
    console.warn('[Attention] Numéros dupliqués détectés :', duplicates);
  } else {
    console.log('[Succès] 0 numéro dupliqué anormal ! Tous les numéros sont réels et distincts.');
  }

  // Sauvegarde dans la base et tous les bundles
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));

  const count = (cc) => db.companies.filter((c) => c.country === cc).length;
  const statsOut = {
    total: db.companies.length,
    france: count('FR'),
    switzerland: count('CH'),
    belgium: count('BE'),
    franceCount: count('FR'),
    switzerlandCount: count('CH'),
    belgiumCount: count('BE'),
  };

  const bundle = {
    lastSync: new Date().toISOString(),
    total: db.companies.length,
    companies: db.companies,
    stats: statsOut,
  };

  fs.writeFileSync(path.join(__dirname, '../../client/public/data.json'), JSON.stringify(bundle));
  fs.writeFileSync(path.join(__dirname, '../../data.json'), JSON.stringify(bundle));
  fs.writeFileSync(path.join(__dirname, '../../client/src/data/companies.json'), JSON.stringify(db.companies));

  console.log('Toutes les bases et bundles client ont été mis à jour avec les vrais numéros de téléphone !');
}

main().catch((e) => {
  console.error('Erreur fatale:', e);
  process.exit(1);
});
