const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { enrichCompany, cleanCompanyName, categorizeActivity, calculateSafetyScore, detectCFO } = require('../services/enricher');
const { parseShabXml } = require('../scrapers/switzerland');
const { parseBodaccAdministration, normalizeFrenchLegalForm, extractFrenchRevenue, formatPersonName } = require('../scrapers/france');
const { evaluateRevolutCompliance, evaluateFxPotential, getGeoZone, isRevolutUnsupportedIndustry } = require('../services/compliance');
const { isValidPhysicalPersonName, isValidCommercialCompany, buildNorthDataUrl, detectInternationalLinks } = require('../services/northdata');

async function processInBatches(items, batchSize, fn, label = 'Batch') {
  const results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const res = await Promise.all(batch.map(fn));
    results.push(...res);
    if ((i + batchSize) % (batchSize * 2) === 0 || i + batchSize >= items.length) {
      console.log(`[${label}] ${Math.min(i + batchSize, items.length)} / ${items.length} traitées...`);
    }
  }
  return results;
}

/**
 * Generate fine-grained 10-day windows across ALL of 2024, 2025, and 2026 (from 2024-01-01 to 2026-10-21)
 * 3 windows per month x 34 months = 101 windows for deep multi-year registry coverage!
 */
function generateHistoricalWindows2024To2026() {
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

/**
 * Fetch up to 200 BODACC creation records per 10-day window (offset 0 and offset 100)
 */
async function fetchFranceWindow([start, end], maxPerWindow = 48) {
  try {
    const url = 'https://bodacc-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/annonces-commerciales/records';
    const whereClause = `publicationavis='A' AND familleavis_lib='Créations' AND listepersonnes like '%administration%' AND dateparution >= date'${start}' AND dateparution <= date'${end}'`;

    const [res0, res1] = await Promise.all([
      axios.get(url, {
        params: { where: whereClause, order_by: 'dateparution desc', limit: 100, offset: 0 },
        timeout: 12000,
      }).catch(() => ({ data: { results: [] } })),
      axios.get(url, {
        params: { where: whereClause, order_by: 'dateparution desc', limit: 100, offset: 100 },
        timeout: 12000,
      }).catch(() => ({ data: { results: [] } })),
    ]);

    const records = [...(res0.data?.results || []), ...(res1.data?.results || [])];
    const candidates = [];

    for (const record of records) {
      try {
        const sirenRaw = record.registre?.[0] || record.registre?.[1] || '';
        const siren = sirenRaw.replace(/\D/g, '');
        if (!siren || siren.length !== 9) continue;

        let companyName = record.commercant || '';
        let rawLegalForm = '';
        let shareCapital = 5000;
        let address = '';
        let city = record.ville || '';
        let postalCode = record.cp || '';
        let activity = '';
        let dirigeants = [];
        let corporateLinks = [];
        const immatDate = record.dateparution || start;

        if (record.listepersonnes) {
          const parsed = typeof record.listepersonnes === 'string' ? JSON.parse(record.listepersonnes) : record.listepersonnes;
          const person = parsed.personne;
          if (person) {
            if (!companyName && person.denomination) companyName = person.denomination;
            if (!companyName && person.nomCommercial) companyName = person.nomCommercial;
            if (person.formeJuridique) rawLegalForm = person.formeJuridique;
            if (person.capital?.montantCapital) {
              const cap = parseFloat(person.capital.montantCapital);
              if (!isNaN(cap) && cap > 0) shareCapital = Math.round(cap);
            }
            if (person.adresseSiegeSocial) {
              const a = person.adresseSiegeSocial;
              address = [a.numeroVoie, a.typeVoie, a.nomVoie].filter(Boolean).join(' ').trim();
              if (a.codePostal) postalCode = a.codePostal;
              if (a.ville) city = a.ville;
            }
            if (person.administration) {
              const adminParsed = parseBodaccAdministration(person.administration, companyName);
              dirigeants = adminParsed.dirigeants;
              corporateLinks = adminParsed.corporateLinks;
            }
          }
        }

        if (record.listeetablissements) {
          try {
            const parsed = typeof record.listeetablissements === 'string' ? JSON.parse(record.listeetablissements) : record.listeetablissements;
            const etab = parsed.etablissement;
            if (etab) {
              if (etab.activite) activity = etab.activite;
              if (etab.adresse && !address) {
                const a = etab.adresse;
                address = [a.numeroVoie, a.typeVoie, a.nomVoie].filter(Boolean).join(' ').trim();
                if (a.codePostal) postalCode = a.codePostal;
                if (a.ville) city = a.ville;
              }
            }
          } catch {
            // ignore
          }
        }

        if (!companyName || !activity || activity.length < 8) continue;
        // Exclude giant share capital > 5M€ (likely > 30M€ turnover)
        if (shareCapital > 5000000) continue;

        const legalForm = normalizeFrenchLegalForm(rawLegalForm);
        const rawComp = {
          id: `FR-${siren}`,
          country: 'FR',
          countryName: 'France',
          name: companyName.trim(),
          registrationNumber: siren,
          incorporationDate: immatDate,
          incorporationYear: immatDate.slice(0, 4),
          legalForm,
          shareCapital,
          revenue: null,
          revenueYear: null,
          activity: activity.trim(),
          address: address || `${postalCode} ${city}`.trim(),
          city: city || 'Paris',
          postalCode: postalCode || '75001',
          dirigeants,
          corporateLinks,
          source: 'BODACC A & RNE (INPI)',
          crmStatus: 'new',
          crmNotes: '',
          crmAssignedTo: null,
          lastContactedAt: null,
          createdAt: new Date().toISOString(),
        };

        // Strictly commercial + zero Unsupported Industries + physical human directors
        if (!isValidCommercialCompany(rawComp)) continue;
        if (!dirigeants || dirigeants.length === 0) continue;

        const compCheck = evaluateRevolutCompliance(rawComp);
        if (!compCheck.isEligible || compCheck.status === 'restricted') continue;
        rawComp.compliance = compCheck;

        let priorityScore = 0;
        if (compCheck.status === 'eligible') priorityScore += 30;
        if (shareCapital >= 5000) priorityScore += 10;
        if (shareCapital >= 20000) priorityScore += 15;
        if (dirigeants.length >= 2) priorityScore += 15;
        if (corporateLinks.length >= 1) priorityScore += 20;
        if (/logiciel|saas|tech|informatique|digital|ia|data|conseil|consulting|import|export|négoce|ingénierie|industrie|e-commerce|santé|médical|logistique/i.test(activity)) {
          priorityScore += 25;
        }
        rawComp._priority = priorityScore;

        candidates.push(rawComp);
      } catch {
        // ignore
      }
    }

    candidates.sort((a, b) => b._priority - a._priority);
    return candidates.slice(0, maxPerWindow).map(c => {
      delete c._priority;
      return c;
    });
  } catch (err) {
    console.warn(`[FR Window ${start}..${end}] Warning:`, err.message);
    return [];
  }
}

/**
 * Fetch Swiss SHAB HR01 creations per 10-day window, pre-filtering by commercial suffix in title
 * (SA / AG / Sàrl / GmbH / Sagl) so we skip 100% of Einzelunternehmen and Verein before XML download!
 */
async function fetchSwitzerlandWindow([start, end], maxPerWindow = 22) {
  try {
    const res = await axios.get('https://www.shab.ch/api/v1/publications', {
      params: {
        publicationStates: 'PUBLISHED',
        subRubrics: 'HR01',
        'publicationDate.start': start,
        'publicationDate.end': end,
        'pageRequest.size': 90,
        'pageRequest.page': 0,
      },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      },
      timeout: 12000,
    });

    const pubs = res.data?.content || [];
    if (pubs.length === 0) return [];

    // Pre-filter by title: ONLY fetch XML for commercial companies (SA, AG, Sàrl, GmbH, Sagl)
    const commercialPubs = pubs.filter(pub => {
      const meta = pub.meta || {};
      const titleFr = meta.title?.fr || meta.title?.de || meta.title?.it || meta.title?.en || '';
      const companyPart = titleFr
        .replace(/^(Nouvelles entrées|Neueintragung|Nuove registrazioni|New entries)\s+/i, '')
        .replace(/,\s*[^,]+$/, '')
        .trim();
      return /\b(SA|AG|S\.A\.|A\.G\.|Sàrl|Sarl|S\.à\.r\.l\.|GmbH|Sagl|Ltd|LLC)\b/i.test(companyPart) &&
        !/\b(Stiftung|Fondation|Fondazione|Verein|Association|Genossenschaft)\b/i.test(companyPart);
    }).slice(0, maxPerWindow + 8);

    const parsedItems = await Promise.all(
      commercialPubs.map(async (pub) => {
        try {
          const meta = pub.meta || {};
          const titleFr = meta.title?.fr || meta.title?.de || meta.title?.it || meta.title?.en || '';
          const pubDate = meta.publicationDate ? meta.publicationDate.split('T')[0] : start;
          const fallbackName = titleFr
            .replace(/^(Nouvelles entrées|Neueintragung|Nuove registrazioni|New entries)\s+/i, '')
            .replace(/,\s*[^,]+$/, '')
            .trim();

          const xmlRes = await axios.get(`https://www.shab.ch/api/v1/publications/${meta.id}/xml`, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 7000,
          });
          const parsed = parseShabXml(xmlRes.data, fallbackName);
          if (!parsed || !parsed.uid) return null;
          if (parsed.shareCapital > 5000000) return null; // Exclude >30M CHF mega-corporations

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
            activity: parsed.activity || 'Services commerciaux et conseil aux entreprises',
            address: parsed.address,
            city: parsed.city || 'Zürich',
            postalCode: parsed.postalCode || '8000',
            canton: parsed.canton || 'ZH',
            dirigeants: parsed.dirigeants,
            corporateLinks: parsed.corporateLinks || [],
            internationalLinks: parsed.internationalLinks || [],
            pubText: parsed.pubText,
            source: 'FOSC / SHAB (Registre du Commerce Suisse)',
            crmStatus: 'new',
            crmNotes: '',
            crmAssignedTo: null,
            lastContactedAt: null,
            createdAt: new Date().toISOString(),
          };

          if (!isValidCommercialCompany(rawComp)) return null;
          delete rawComp.pubText;
          if (!rawComp.dirigeants || rawComp.dirigeants.length === 0) return null;

          const compCheck = evaluateRevolutCompliance(rawComp);
          if (!compCheck.isEligible || compCheck.status === 'restricted') return null;
          rawComp.compliance = compCheck;

          return rawComp;
        } catch {
          return null;
        }
      })
    );

    return parsedItems.filter(Boolean).slice(0, maxPerWindow);
  } catch (err) {
    console.warn(`[CH Window ${start}..${end}] Warning:`, err.message);
    return [];
  }
}

async function main() {
  console.log('=== EXTRACTION MASSIVE MULTI-ANNÉES (2024, 2025, 2026) — FR & CH (CA ≤ 30M€ • 0% Unsupported Industries) ===');

  const dbPath = path.join(__dirname, '../data/db.json');
  const existingDb = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

  // Load shared CRM overrides from GitHub Issue #1
  let cloudOverrides = {};
  try {
    const issueRes = await fetch('https://api.github.com/repos/KevinRevo/Leads-intelligence/issues/1', {
      headers: { 'Accept': 'application/vnd.github.v3+json' }
    });
    if (issueRes.ok) {
      const issue = await issueRes.json();
      const parsed = JSON.parse(issue.body || '{}');
      cloudOverrides = parsed.overrides || {};
      console.log(`[Cloud CRM] ${Object.keys(cloudOverrides).length} notes/statuts partagés chargés.`);
    }
  } catch (e) {
    console.warn('[Cloud CRM] Avertissement:', e.message);
  }

  // Keep valid existing companies
  const cleanedExisting = [];
  for (const comp of existingDb.companies || []) {
    if (!isValidCommercialCompany(comp)) continue;
    if (isRevolutUnsupportedIndustry(comp)) continue;
    const validDirs = (comp.dirigeants || []).filter(d => isValidPhysicalPersonName(d?.name, comp.name));
    if (validDirs.length === 0) continue;
    comp.dirigeants = validDirs.map((d, idx) => ({ ...d, isPrimary: idx === 0 }));
    delete comp.network; // Dynamically built in UI to keep bundle compact
    cleanedExisting.push(comp);
  }

  console.log(`[Base Existante] ${cleanedExisting.length} sociétés commerciales déjà qualifiées en base.`);

  // Scrape 101 10-day windows from 2024-01-01 to 2026-10-21
  const windows = generateHistoricalWindows2024To2026();
  console.log(`[Scraping 2024-2026] Lancement sur ${windows.length} fenêtres de 10 jours (du 01/01/2024 au 21/10/2026)...`);

  const rawFrWindows = await processInBatches(windows, 10, (w) => fetchFranceWindow(w, 45), 'BODACC FR 2024-2026');
  const rawChWindows = await processInBatches(windows, 8, (w) => fetchSwitzerlandWindow(w, 20), 'SHAB CH 2024-2026');

  const rawNewCandidates = [
    ...rawFrWindows.flat(),
    ...rawChWindows.flat(),
  ];

  // Deduplicate against cleanedExisting
  const existingIds = new Set(cleanedExisting.map(c => c.id));
  const existingNames = new Set(cleanedExisting.map(c => c.name.toLowerCase().trim()));

  const uniqueNewRaw = [];
  for (const cand of rawNewCandidates) {
    const nameKey = cand.name.toLowerCase().trim();
    if (existingIds.has(cand.id) || existingNames.has(nameKey)) continue;
    existingIds.add(cand.id);
    existingNames.add(nameKey);
    uniqueNewRaw.push(cand);
  }

  console.log(`[Scraping 2024-2026] ${uniqueNewRaw.length} nouvelles sociétés uniques extraites ! Enrichissement DNS/SSL anti-homonyme en cours...`);

  // Enrich new candidates in high-concurrency batches of 50
  const enrichedNew = await processInBatches(uniqueNewRaw, 50, (c) => enrichCompany(c), 'Enrichissement 2024-2026');

  // Combine all companies and perform final strict validation
  let allCompanies = [...cleanedExisting, ...enrichedNew].filter(
    c => isValidCommercialCompany(c) && !isRevolutUnsupportedIndustry(c)
  );

  console.log(`[Finalisation] Mise à jour des métadonnées North Data, secteurs et statuts CRM pour ${allCompanies.length} sociétés...`);

  for (const comp of allCompanies) {
    if (cloudOverrides[comp.id]) {
      const ov = cloudOverrides[comp.id];
      if (ov.crmStatus) comp.crmStatus = ov.crmStatus;
      if (ov.crmNotes !== undefined) comp.crmNotes = ov.crmNotes;
      if (ov.crmAssignedTo !== undefined) comp.crmAssignedTo = ov.crmAssignedTo;
    }

    const cleanComp = cleanCompanyName(comp.name) || comp.name;
    const countryLabel = comp.country === 'CH' ? 'Suisse' : 'France';
    comp.incorporationYear = (comp.incorporationDate || '').slice(0, 4) || '2026';
    comp.activityCategory = categorizeActivity(comp.activity, comp.legalForm, comp.name);

    comp.linkedinCompanyUrl = `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(`"${cleanComp}" ${countryLabel}`)}`;
    const primaryDir = comp.dirigeants?.[0]?.name;
    comp.linkedinDirigeantUrl = isValidPhysicalPersonName(primaryDir, comp.name)
      ? `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`"${primaryDir}" "${cleanComp}"`)}`
      : null;

    comp.cfo = detectCFO(comp.dirigeants, comp.name);
    comp.northDataUrl = buildNorthDataUrl(comp);
    comp.internationalLinks = comp.internationalLinks && comp.internationalLinks.length > 0
      ? comp.internationalLinks
      : detectInternationalLinks(comp);
    comp.isCrossBorder = comp.internationalLinks.length > 0;

    comp.safety = calculateSafetyScore(comp, {
      website: comp.website,
      hasMx: Boolean(comp.bestEmail),
    });
    comp.confidenceScore = comp.safety.score;
    comp.compliance = evaluateRevolutCompliance(comp);
    comp.fxPotential = evaluateFxPotential(comp);
    comp.geoZone = getGeoZone(comp);

    // Omit redundant static `network` field to keep JSON bundle fast (App.jsx builds it dynamically with cross-mandate links)
    delete comp.network;
  }

  // Sort by incorporationDate descending
  allCompanies.sort((a, b) => (b.incorporationDate || '').localeCompare(a.incorporationDate || ''));

  const total = allCompanies.length;
  const france = allCompanies.filter(c => c.country === 'FR').length;
  const switzerland = allCompanies.filter(c => c.country === 'CH').length;
  const toContact = allCompanies.filter(c => c.crmStatus === 'to_contact' || c.crmStatus === 'new').length;
  const contacted = allCompanies.filter(c => c.crmStatus?.startsWith('contacted')).length;
  const inCrm = allCompanies.filter(c => c.crmStatus === 'in_crm' || c.crmStatus === 'converted').length;
  const highSafetyCount = allCompanies.filter(c => (c.safety?.score || c.confidenceScore || 0) >= 60).length;
  const verifiedWebCount = allCompanies.filter(c => Boolean(c.website)).length;
  const highFxCount = allCompanies.filter(c => c.fxPotential?.level === 'high').length;
  const crossBorderCount = allCompanies.filter(c => c.isCrossBorder || (c.corporateLinks && c.corporateLinks.length > 0)).length;

  const byYear = {
    2024: allCompanies.filter(c => c.incorporationYear === '2024').length,
    2025: allCompanies.filter(c => c.incorporationYear === '2025').length,
    2026: allCompanies.filter(c => c.incorporationYear === '2026').length,
  };

  console.log(`=== RÉSULTAT FINAL ===`);
  console.log(`Total : ${total} sociétés commerciales vérifiées (CA ≤ 30M€ • 0% Unsupported) | 🇫🇷 France : ${france} | 🇨🇭 Suisse : ${switzerland}`);
  console.log(`Répartition par année : 2024 = ${byYear[2024]} | 2025 = ${byYear[2025]} | 2026 = ${byYear[2026]}`);
  console.log(`Sites web certifiés anti-homonymes : ${verifiedWebCount} | Fort Potentiel FX : ${highFxCount} | Liens Holdings/Internationaux : ${crossBorderCount}`);

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
    crossBorderCount,
  };

  const newDb = {
    companies: allCompanies,
    syncHistory: [
      {
        id: `sync-2024-2026-${Date.now()}`,
        timestamp: new Date().toISOString(),
        country: 'ALL',
        added: enrichedNew.length,
        totalAfter: total,
      },
      ...(existingDb.syncHistory || []).slice(0, 15),
    ],
  };

  const publicBundle = { companies: allCompanies, stats };

  fs.writeFileSync(dbPath, JSON.stringify(newDb, null, 2));
  fs.writeFileSync(path.join(__dirname, '../../client/public/data.json'), JSON.stringify(publicBundle));
  fs.writeFileSync(path.join(__dirname, '../../client/src/data/companies.json'), JSON.stringify(allCompanies));
  fs.writeFileSync(path.join(__dirname, '../../data.json'), JSON.stringify(publicBundle));

  console.log('Tous les fichiers JSON ont été mis à jour avec succès !');
}

main().catch(err => {
  console.error('Erreur fatale:', err);
  process.exit(1);
});
