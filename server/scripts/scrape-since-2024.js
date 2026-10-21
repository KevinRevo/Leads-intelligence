const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { enrichCompany, cleanCompanyName, categorizeActivity, calculateSafetyScore, detectCFO } = require('../services/enricher');
const { parseShabXml } = require('../scrapers/switzerland');
const { parseBodaccAdministration, normalizeFrenchLegalForm, extractFrenchRevenue, formatPersonName } = require('../scrapers/france');
const { evaluateRevolutCompliance, evaluateFxPotential, getGeoZone } = require('../services/compliance');
const { buildCompanyNetwork } = require('../services/network');
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
 * Generate date windows across 2024, 2025, and Jan-Apr 2026 (since Apr-Oct 2026 is already in DB)
 * so we cover the full period from 2024-01-01 to 2026-10-21!
 */
function generateHistoricalWindows2024To2026() {
  const windows = [
    // 2024 windows (every month of 2024)
    ['2024-01-01', '2024-01-31'],
    ['2024-02-01', '2024-02-29'],
    ['2024-03-01', '2024-03-31'],
    ['2024-04-01', '2024-04-30'],
    ['2024-05-01', '2024-05-31'],
    ['2024-06-01', '2024-06-30'],
    ['2024-07-01', '2024-07-31'],
    ['2024-08-01', '2024-08-31'],
    ['2024-09-01', '2024-09-30'],
    ['2024-10-01', '2024-10-31'],
    ['2024-11-01', '2024-11-30'],
    ['2024-12-01', '2024-12-31'],
    // 2025 windows (every month of 2025)
    ['2025-01-01', '2025-01-31'],
    ['2025-02-01', '2025-02-28'],
    ['2025-03-01', '2025-03-31'],
    ['2025-04-01', '2025-04-30'],
    ['2025-05-01', '2025-05-31'],
    ['2025-06-01', '2025-06-30'],
    ['2025-07-01', '2025-07-31'],
    ['2025-08-01', '2025-08-31'],
    ['2025-09-01', '2025-09-30'],
    ['2025-10-01', '2025-10-31'],
    ['2025-11-01', '2025-11-30'],
    ['2025-12-01', '2025-12-31'],
    // Early 2026 windows (Jan-Apr 2026 + Oct 18-21 2026)
    ['2026-01-01', '2026-01-31'],
    ['2026-02-01', '2026-02-28'],
    ['2026-03-01', '2026-03-31'],
    ['2026-04-01', '2026-04-17'],
    ['2026-10-18', '2026-10-21'],
  ];
  return windows;
}

/**
 * Audit whether an existing company's website is a false homonym
 * (e.g., "Darwin Transports Sàrl" -> "darwin.ch", or "SHIVA SHAMBHO" -> "shivashambho.com")
 */
function isSuspiciousHomonymWebsite(company) {
  if (!company.website) return false;
  try {
    const u = new URL(company.website);
    const hostApex = u.hostname.replace(/^www\./i, '').toLowerCase();
    const hostSlug = hostApex.split('.')[0];

    const cleaned = cleanCompanyName(company.name)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s-]/g, ' ')
      .trim();

    const stopWords = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'et', 'and', 'und', 'en', 'in', 'fur', 'pour', 'von', 'der', 'die', 'das', 'holding', 'holdings', 'group', 'groupe', 'france', 'suisse', 'switzerland', 'schweiz']);
    const words = cleaned.split(/[\s-]+/).filter(w => w && !stopWords.has(w));

    // If company name has 2+ distinctive words (e.g. "darwin transports"),
    // but the domain is ONLY the first word (e.g. "darwin.ch"), it's a single-word homonym false positive!
    if (words.length >= 2) {
      const fullContig = words.join('');
      const fullHyph = words.join('-');
      const firstTwoContig = words.slice(0, 2).join('');
      const firstTwoHyph = words.slice(0, 2).join('-');
      if (
        hostSlug !== fullContig &&
        hostSlug !== fullHyph &&
        hostSlug !== firstTwoContig &&
        hostSlug !== firstTwoHyph
      ) {
        return true;
      }
    }
    return false;
  } catch {
    return true;
  }
}

async function fetchFranceWindow([start, end], maxPerWindow = 16) {
  try {
    const url = 'https://bodacc-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/annonces-commerciales/records';
    const whereClause = `publicationavis='A' AND familleavis_lib='Créations' AND listepersonnes like '%administration%' AND dateparution >= date'${start}' AND dateparution <= date'${end}'`;

    const res = await axios.get(url, {
      params: {
        where: whereClause,
        order_by: 'dateparution desc',
        limit: 70,
      },
      timeout: 12000,
    });

    const records = res.data?.results || [];
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

        if (!isValidCommercialCompany(rawComp)) continue;
        if (!dirigeants || dirigeants.length === 0) continue;

        const compCheck = evaluateRevolutCompliance(rawComp);
        rawComp.compliance = compCheck;

        let priorityScore = 0;
        if (compCheck.status === 'eligible') priorityScore += 30;
        if (shareCapital >= 10000) priorityScore += 15;
        if (shareCapital >= 50000) priorityScore += 15;
        if (dirigeants.length >= 2) priorityScore += 15;
        if (corporateLinks.length >= 1) priorityScore += 20;
        if (/logiciel|saas|tech|informatique|digital|ia|data|conseil|consulting|import|export|négoce|ingénierie|industrie|e-commerce|santé|médical|logistique|luxe|horlogerie/i.test(activity)) {
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

async function fetchSwitzerlandWindow([start, end], maxPerWindow = 10) {
  try {
    const res = await axios.get('https://www.shab.ch/api/v1/publications', {
      params: {
        publicationStates: 'PUBLISHED',
        subRubrics: 'HR01',
        'publicationDate.start': start,
        'publicationDate.end': end,
        'pageRequest.size': 28,
        'pageRequest.page': 0,
      },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      },
      timeout: 12000,
    });

    const pubs = res.data?.content || [];
    if (pubs.length === 0) return [];

    const parsedItems = await Promise.all(
      pubs.map(async (pub) => {
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
          rawComp.compliance = compCheck;

          let priorityScore = 0;
          if (compCheck.status === 'eligible') priorityScore += 30;
          if (rawComp.legalForm === 'SA / AG') priorityScore += 20;
          if (rawComp.shareCapital >= 100000) priorityScore += 15;
          if (rawComp.dirigeants.length >= 2) priorityScore += 15;
          if (rawComp.corporateLinks.length >= 1 || rawComp.internationalLinks.length >= 1) priorityScore += 20;
          rawComp._priority = priorityScore;

          return rawComp;
        } catch {
          return null;
        }
      })
    );

    const valid = parsedItems.filter(Boolean);
    valid.sort((a, b) => b._priority - a._priority);
    return valid.slice(0, maxPerWindow).map(c => {
      delete c._priority;
      return c;
    });
  } catch (err) {
    console.warn(`[CH Window ${start}..${end}] Warning:`, err.message);
    return [];
  }
}

/**
 * Enrich French companies with official INSEE/RNE turnover (`finances.ca` <= 30M€) and holding resolution
 */
async function enrichFrenchFinancialsInBatches(companies) {
  const frCompanies = companies.filter(c => c.country === 'FR' && /^\d{9}$/.test(c.registrationNumber || ''));
  console.log(`[RNE Finances & Holdings] Vérification du Chiffre d'Affaires (≤ 30M€) et des holdings pour ${frCompanies.length} sociétés FR...`);

  await processInBatches(frCompanies, 20, async (comp) => {
    try {
      const res = await axios.get(`https://recherche-entreprises.api.gouv.fr/search?q=${comp.registrationNumber}&per_page=1`, {
        timeout: 4000,
      });
      const item = res.data?.results?.[0];
      if (!item) return;

      // 1. Check nature_juridique: strictly block Entrepreneur Individuel (1000) or SCI (65xx)
      const nj = String(item.nature_juridique || '');
      if (nj.startsWith('10') || nj.startsWith('65')) {
        comp._reject = true;
        return;
      }

      // 2. Extract official turnover (Chiffre d'affaires)
      const { revenue, revenueYear } = extractFrenchRevenue(item.finances);
      if (revenue !== null) {
        if (revenue > 30000000) {
          comp._reject = true; // Exceeds 30M€ limit!
          return;
        }
        comp.revenue = revenue;
        comp.revenueYear = revenueYear;
      }

      // 3. Extract any additional physical directors or corporate holdings from RNE
      if (Array.isArray(item.dirigeants)) {
        for (const d of item.dirigeants) {
          if (d.type_dirigeant === 'personne physique' || (d.nom && d.prenoms)) {
            if (/commissaire/i.test(d.qualite || '')) continue;
            const fullName = formatPersonName(d.prenoms, d.nom);
            if (
              isValidPhysicalPersonName(fullName, comp.name) &&
              !comp.dirigeants.some(x => x.name.toLowerCase() === fullName.toLowerCase())
            ) {
              comp.dirigeants.push({
                name: fullName,
                role: d.qualite || 'Dirigeant',
                birthYear: d.annee_de_naissance || null,
                isPrimary: comp.dirigeants.length === 0,
              });
            }
          } else if (d.type_dirigeant === 'personne morale' && d.denomination) {
            if (/commissaire/i.test(d.qualite || '')) continue;
            const hName = d.denomination.trim();
            const hSiren = (d.siren || '').replace(/\D/g, '');
            if (!comp.corporateLinks) comp.corporateLinks = [];
            if (!comp.corporateLinks.some(cl => cl.name.toLowerCase() === hName.toLowerCase())) {
              comp.corporateLinks.push({
                id: hSiren ? `FR-${hSiren}` : undefined,
                name: hName,
                siren: hSiren,
                legalForm: 'Holding / Personne Morale',
                shareCapital: 50000,
                roleHeld: `${d.qualite || 'Présidente'} (Holding)`,
                city: item.siege?.libelle_commune || comp.city,
              });
            }
          }
        }
      }
    } catch {
      // non-blocking
    }
  }, 'RNE Finances');
}

async function main() {
  console.log('=== RECONSTRUCTION & EXTENSION HISTORIQUE DEPUIS LE 01/01/2024 (CA ≤ 30M€) ===');

  const dbPath = path.join(__dirname, '../data/db.json');
  const existingDb = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

  // 1. Fetch live GitHub data.json so we also clean any companies added by the 05:00 AM GitHub Action (like Darwin Transports Sàrl)
  let liveGithubCompanies = [];
  try {
    const ghRes = await fetch('https://raw.githubusercontent.com/KevinRevo/Leads-intelligence/main/data.json');
    if (ghRes.ok) {
      const ghData = await ghRes.json();
      liveGithubCompanies = ghData.companies || [];
      console.log(`[Init] ${liveGithubCompanies.length} sociétés récupérées depuis la version live GitHub.`);
    }
  } catch (e) {
    console.warn('[Init] Lecture GitHub data.json ignorée:', e.message);
  }

  // 2. Fetch shared CRM overrides from GitHub Issue #1
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

  // Merge existing local + live GitHub companies
  const mergedInitialMap = new Map();
  for (const c of [...(existingDb.companies || []), ...liveGithubCompanies]) {
    if (c && c.id) mergedInitialMap.set(c.id, c);
  }

  console.log(`[Audit] Audit strict des ${mergedInitialMap.size} sociétés existantes (Triple-check statut juridique, dirigeants physiques & sites web anti-homonymes)...`);

  const cleanedExisting = [];
  let purgedCount = 0;
  let fixedWebsitesCount = 0;
  let fixedDirectorsCount = 0;

  for (const comp of mergedInitialMap.values()) {
    // Specific fix for Darwin Transports Sàrl (CHE-306.247.256)
    if (comp.id === 'CH-CHE306247256' || /Darwin Transports/i.test(comp.name)) {
      comp.dirigeants = [{
        name: 'Darwin Valarezo Barba',
        firstName: 'Darwin',
        lastName: 'Valarezo Barba',
        role: 'Associé-Gérant (Direction)',
        isPrimary: true,
      }];
      comp.internationalLinks = [{
        countryCode: 'ES',
        countryName: 'Espagne',
        flag: '🇪🇸',
        entityName: 'Actionnariat / Direction Hispano-Suisse (ES ↔ CH)',
        relation: 'Associé / Dirigeant International',
        city: 'Espagne',
      }];
      comp.website = null;
      comp.domain = null;
      comp.bestEmail = null;
      comp.emails = [];
      comp.phone = null;
      fixedDirectorsCount++;
    }

    // Triple-check: reject Entrepreneur Individuel, Verein (SHIVA SHAMBHO), SCI, etc.
    if (!isValidCommercialCompany(comp)) {
      purgedCount++;
      continue;
    }

    // Validate physical directors only!
    const validDirs = (comp.dirigeants || []).filter(d => isValidPhysicalPersonName(d?.name, comp.name));
    if (validDirs.length !== (comp.dirigeants || []).length) {
      fixedDirectorsCount++;
    }
    if (validDirs.length === 0) {
      purgedCount++;
      continue;
    }
    comp.dirigeants = validDirs.map((d, idx) => ({ ...d, isPrimary: idx === 0 }));

    // Check if website is a single-word homonym false positive (e.g. "Darwin Transports" -> "darwin.ch")
    if (isSuspiciousHomonymWebsite(comp)) {
      comp.website = null;
      comp.domain = null;
      comp.websiteStatus = 'Pas de site web officiel détecté';
      comp.bestEmail = null;
      comp.emails = [];
      fixedWebsitesCount++;
    }

    cleanedExisting.push(comp);
  }

  console.log(`[Audit] Résultat : ${cleanedExisting.length} sociétés commerciales valides conservées (${purgedCount} EI/Associations/Invalides purgées, ${fixedWebsitesCount} sites homonymes corrigés, ${fixedDirectorsCount} dirigeants corrigés).`);

  // 3. Scrape historical windows across 2024, 2025, and early 2026
  const windows = generateHistoricalWindows2024To2026();
  console.log(`[Scraping 2024-2026] Extraction sur ${windows.length} fenêtres mensuelles depuis le 01/01/2024...`);

  const rawFrWindows = await processInBatches(windows, 6, (w) => fetchFranceWindow(w, 14), 'BODACC FR 2024-2026');
  const rawChWindows = await processInBatches(windows, 6, (w) => fetchSwitzerlandWindow(w, 9), 'SHAB CH 2024-2026');

  const rawNewCandidates = [
    ...rawFrWindows.flat(),
    ...rawChWindows.flat(),
  ];

  // Deduplicate new candidates against cleanedExisting
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

  console.log(`[Scraping 2024-2026] ${uniqueNewRaw.length} nouvelles sociétés (2024-2026) uniques à enrichir (DNS/SSL anti-homonyme, RNE CA ≤ 30M€, FX, Carto)...`);

  // Enrich new candidates in parallel batches of 25
  const enrichedNew = await processInBatches(uniqueNewRaw, 25, (c) => enrichCompany(c), 'Enrichissement 2024-2026');

  // Combine all companies
  let allCompanies = [...cleanedExisting, ...enrichedNew];

  // 4. Enrich French companies with official RNE turnover (Chiffre d'affaires <= 30M€) & holding links
  await enrichFrenchFinancialsInBatches(allCompanies);

  // Filter out any company marked `_reject` (e.g. CA > 30M€ or INSEE code 1000/65xx) or failing `isValidCommercialCompany`
  allCompanies = allCompanies.filter(c => !c._reject && isValidCommercialCompany(c));

  // 5. Finalize all fields (LinkedIn anti-homonym URLs, North Data URLs, International Links, CFO, Compliance, FX, GeoZone, Network Cartography)
  console.log(`[Finalisation] Construction de la cartographie North Data & liens internationaux pour ${allCompanies.length} sociétés...`);

  for (const comp of allCompanies) {
    // Apply shared Cloud CRM overrides
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

    // Anti-homonym LinkedIn URLs
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

    comp.network = await buildCompanyNetwork(comp, allCompanies, { skipLiveLookup: true });
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
  console.log(`Total : ${total} sociétés commerciales vérifiées (CA ≤ 30M€) | 🇫🇷 France : ${france} | 🇨🇭 Suisse : ${switzerland}`);
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
  fs.writeFileSync(path.join(__dirname, '../../client/public/data.json'), JSON.stringify(publicBundle, null, 2));
  fs.writeFileSync(path.join(__dirname, '../../client/src/data/companies.json'), JSON.stringify(allCompanies, null, 2));
  fs.writeFileSync(path.join(__dirname, '../../data.json'), JSON.stringify(publicBundle, null, 2));

  console.log('Tous les fichiers JSON (server, client/public, client/src, root) ont été mis à jour avec succès !');
}

main().catch(err => {
  console.error('Erreur fatale:', err);
  process.exit(1);
});
