/**
 * Script d'augmentation du vivier Suisse (CH) depuis la FOSC / SHAB (2024-2026).
 * - Préserve 100% des sociétés FR, BE, LU, NL existantes.
 * - Récupère les nouvelles inscriptions HR01 non encore présentes dans la base.
 * - Filtre strictly : SA/AG et Sàrl/GmbH, dirigeants = personnes physiques réelles.
 * - 0% industries non supportées Revolut.
 * - Enrichissement complet : DNS, MX, téléphones réels (sans faux placeholders).
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { enrichCompany } = require('../services/enricher');
const { parseShabXml } = require('../scrapers/switzerland');
const { isValidCommercialCompany, buildNorthDataUrl } = require('../services/northdata');
const { evaluateRevolutCompliance, isRevolutUnsupportedIndustry } = require('../services/compliance');

const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));

const dbPath = path.join(__dirname, '../data/db.json');
const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

const existingSwiss = (db.companies || []).filter((c) => c.country === 'CH');
const seenUids = new Set(existingSwiss.map((c) => (c.registrationNumber || '').replace(/\D/g, '')));
console.log(`[CH Existant] ${existingSwiss.length} sociétés suisses déjà en base.`);

function generateHistoricalWindows() {
  const windows = [];
  const years = [2024, 2025, 2026];
  for (const year of years) {
    const maxMonth = year === 2026 ? 10 : 12;
    for (let month = 1; month <= maxMonth; month++) {
      const mStr = String(month).padStart(2, '0');
      const lastDay = new Date(year, month, 0).getDate();
      if (year === 2026 && month === 10) {
        windows.push([`2026-10-01`, `2026-10-10`]);
        windows.push([`2026-10-11`, `2026-10-21`]);
      } else {
        windows.push([`${year}-${mStr}-01`, `${year}-${mStr}-10`]);
        windows.push([`${year}-${mStr}-11`, `${year}-${mStr}-20`]);
        windows.push([`${year}-${mStr}-21`, `${year}-${mStr}-${lastDay}`]);
      }
    }
  }
  return windows;
}

async function fetchShabWindow([start, end], targetNewPerWindow = 18) {
  try {
    const pages = [0, 1];
    let allPubs = [];
    for (const page of pages) {
      const res = await axios.get('https://www.shab.ch/api/v1/publications', {
        params: {
          publicationStates: 'PUBLISHED',
          subRubrics: 'HR01',
          'publicationDate.start': start,
          'publicationDate.end': end,
          'pageRequest.size': 100,
          'pageRequest.page': page,
        },
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 10000,
      });
      const items = res.data?.content || [];
      allPubs.push(...items);
      if (items.length < 100) break;
    }

    if (!allPubs.length) return [];

    // Pré-filtrage par titre pour ne garder que SA / AG / Sàrl / GmbH / Sagl
    const commercialPubs = allPubs.filter((pub) => {
      const meta = pub.meta || {};
      const title = meta.title?.fr || meta.title?.de || meta.title?.it || meta.title?.en || '';
      const compName = title
        .replace(/^(Nouvelles entrées|Neueintragung|Nuove registrazioni|New entries)\s+/i, '')
        .replace(/,\s*[^,]+$/, '')
        .trim();
      return (
        /\b(SA|AG|S\.A\.|A\.G\.|Sàrl|Sarl|S\.à\.r\.l\.|GmbH|Sagl|Ltd|LLC)\b/i.test(compName) &&
        !/\b(Stiftung|Fondation|Fondazione|Verein|Association|Genossenschaft)\b/i.test(compName)
      );
    });

    const candidates = [];
    for (const pub of commercialPubs) {
      if (candidates.length >= targetNewPerWindow) break;
      const meta = pub.meta || {};
      const title = meta.title?.fr || meta.title?.de || meta.title?.it || meta.title?.en || '';
      const pubDate = meta.publicationDate ? meta.publicationDate.split('T')[0] : start;
      const fallbackName = title
        .replace(/^(Nouvelles entrées|Neueintragung|Nuove registrazioni|New entries)\s+/i, '')
        .replace(/,\s*[^,]+$/, '')
        .trim();

      try {
        const xmlRes = await axios.get(`https://www.shab.ch/api/v1/publications/${meta.id}/xml`, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          timeout: 6000,
        });
        const parsed = parseShabXml(xmlRes.data, fallbackName);
        if (!parsed || !parsed.uid) continue;

        const uidDigits = parsed.uid.replace(/\D/g, '');
        if (seenUids.has(uidDigits)) continue; // déjà en base !
        if (parsed.shareCapital > 5000000) continue; // exclusion méga-corporations

        const rawComp = {
          id: `CH-${parsed.uid.replace(/[^\w]/g, '')}`,
          country: 'CH',
          countryName: 'Suisse',
          name: parsed.name || fallbackName,
          registrationNumber: parsed.uid,
          incorporationDate: pubDate,
          incorporationYear: pubDate.slice(0, 4),
          legalForm: parsed.legalForm,
          shareCapital: parsed.shareCapital || 20000,
          revenue: null,
          revenueYear: null,
          activity: parsed.activity || 'Services commerciaux, conseil et technologies en Suisse',
          address: parsed.address,
          city: parsed.city || 'Zürich',
          postalCode: parsed.postalCode || '8000',
          canton: parsed.canton || 'ZH',
          dirigeants: parsed.dirigeants,
          corporateLinks: parsed.corporateLinks || [],
          internationalLinks: parsed.internationalLinks || [],
          source: 'FOSC / SHAB (Registre officiel suisse)',
          crmStatus: 'new',
          crmNotes: '',
          crmAssignedTo: null,
          lastContactedAt: null,
          createdAt: new Date().toISOString(),
        };

        if (!isValidCommercialCompany(rawComp) || isRevolutUnsupportedIndustry(rawComp)) continue;
        if (!rawComp.dirigeants || rawComp.dirigeants.length === 0) continue;

        const compCheck = evaluateRevolutCompliance(rawComp);
        if (!compCheck.isEligible || compCheck.status === 'restricted') continue;

        seenUids.add(uidDigits);
        candidates.push(rawComp);
      } catch {
        // ignore
      }
    }

    return candidates;
  } catch (err) {
    return [];
  }
}

async function main() {
  console.log('=== AUGMENTATION SUISSE (CH) — FOSC / SHAB 2024-2026 ===');

  const windows = generateHistoricalWindows();
  console.log(`[CH Planning] ${windows.length} fenêtres de 10 jours à analyser...`);

  const newSwissCompanies = [];
  let winIdx = 0;

  for (const win of windows) {
    winIdx++;
    const found = await fetchShabWindow(win, 18);
    if (found.length > 0) {
      newSwissCompanies.push(...found);
      console.log(`[CH Fenêtre ${winIdx}/${windows.length} ${win[0]}..${win[1]}] +${found.length} nouvelles sociétés (Total nouveau: ${newSwissCompanies.length})`);
    }
    // Objectif : atteindre ~1 500 à 1 800 nouvelles sociétés
    if (newSwissCompanies.length >= 1700) {
      console.log(`[CH Objectif Atteint] ${newSwissCompanies.length} nouvelles sociétés suisses qualifiées récoltées !`);
      break;
    }
    await SLEEP(80);
  }

  console.log(`\n[CH Enrichissement] Début de l'enrichissement de ${newSwissCompanies.length} nouvelles sociétés suisses...`);
  const enrichedSwiss = [];
  for (let i = 0; i < newSwissCompanies.length; i += 25) {
    const batch = await Promise.all(newSwissCompanies.slice(i, i + 25).map((c) => enrichCompany(c)));
    enrichedSwiss.push(...batch);
    if ((i + 25) % 100 === 0 || i + 25 >= newSwissCompanies.length) {
      console.log(`[CH Enrichissement] ${Math.min(i + 25, newSwissCompanies.length)} / ${newSwissCompanies.length} finalisées...`);
    }
  }

  for (const c of enrichedSwiss) {
    c.northDataUrl = buildNorthDataUrl(c);
  }

  // Fusion avec la base complète
  const currentDb = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  const currentNonSwiss = (currentDb.companies || []).filter((c) => c.country !== 'CH');
  const currentSwiss = (currentDb.companies || []).filter((c) => c.country === 'CH');

  const allSwissMap = new Map();
  for (const c of [...currentSwiss, ...enrichedSwiss]) {
    allSwissMap.set(c.id, c);
  }
  const mergedSwiss = Array.from(allSwissMap.values());

  const all = [...currentNonSwiss, ...mergedSwiss].sort((a, b) =>
    (b.incorporationDate || '').localeCompare(a.incorporationDate || '')
  );

  const count = (cc) => all.filter((c) => c.country === cc).length;
  const statsOut = {
    total: all.length,
    france: count('FR'),
    switzerland: count('CH'),
    belgium: count('BE'),
    luxembourg: count('LU'),
    netherlands: count('NL'),
    franceCount: count('FR'),
    switzerlandCount: count('CH'),
    belgiumCount: count('BE'),
    luxembourgCount: count('LU'),
    netherlandsCount: count('NL'),
  };

  currentDb.companies = all;
  currentDb.syncHistory = [
    {
      id: `sync-scale-ch-${Date.now()}`,
      timestamp: new Date().toISOString(),
      country: 'CH',
      added: enrichedSwiss.length,
      totalSwissAfter: count('CH'),
      totalAfter: all.length,
    },
    ...(currentDb.syncHistory || []).slice(0, 15),
  ];
  fs.writeFileSync(dbPath, JSON.stringify(currentDb, null, 2));

  const bundle = { lastSync: new Date().toISOString(), total: all.length, companies: all, stats: statsOut };
  fs.writeFileSync(path.join(__dirname, '../../client/public/data.json'), JSON.stringify(bundle));
  fs.writeFileSync(path.join(__dirname, '../../data.json'), JSON.stringify(bundle));
  fs.writeFileSync(path.join(__dirname, '../../client/src/data/companies.json'), JSON.stringify(all));

  console.log(`\n=== SUCCÈS SUISSE (CH) ===`);
  console.log(`- Suisse (CH) avant : ${existingSwiss.length} | Ajoutées : ${enrichedSwiss.length} | Nouveau Total CH : ${statsOut.switzerland}`);
  console.log(`- Total Global Base : ${statsOut.total}`);
}

main().catch((e) => {
  console.error('Erreur fatale Suisse:', e);
  process.exit(1);
});
