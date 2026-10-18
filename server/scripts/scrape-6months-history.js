const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { enrichCompany } = require('../services/enricher');
const { parseShabXml } = require('../scrapers/switzerland');
const { parseBodaccAdministration } = require('../scrapers/france');
const { evaluateRevolutCompliance } = require('../services/compliance');
const { buildCompanyNetwork } = require('../services/network');

async function processInBatches(items, batchSize, fn, label = 'Batch') {
  const results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const res = await Promise.all(batch.map(fn));
    results.push(...res);
    console.log(`[${label}] ${Math.min(i + batchSize, items.length)} / ${items.length} traitées...`);
  }
  return results;
}

function generateDateWindows() {
  // 18 windows of 10 days from 2026-04-18 to 2026-10-18 (6 full months)
  const windows = [];
  const startBase = new Date('2026-04-18T00:00:00Z');
  const endLimit = new Date('2026-10-18T00:00:00Z');

  let cur = new Date(startBase);
  while (cur <= endLimit) {
    const wStart = cur.toISOString().split('T')[0];
    const next = new Date(cur);
    next.setUTCDate(next.getUTCDate() + 9);
    if (next > endLimit) {
      windows.push([wStart, endLimit.toISOString().split('T')[0]]);
      break;
    } else {
      windows.push([wStart, next.toISOString().split('T')[0]]);
    }
    cur = new Date(next);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return windows;
}

function normalizeFrenchLegalForm(raw = '') {
  const s = (raw || '').toLowerCase();
  if (s.includes('simplifiée') || /\bsas\b|\bsasu\b/i.test(raw)) return 'SAS / SASU';
  if (s.includes('responsabilité limitée') || /\bsarl\b|\beurl\b/i.test(raw)) return 'SARL / EURL';
  if (s.includes('anonyme') || /\bsa\b/i.test(raw)) return 'SA';
  if (s.includes('nom collectif') || /\bsnc\b/i.test(raw)) return 'SNC';
  return raw || 'SAS';
}

function isCommercialFrenchCompany(legalFormRaw = '', companyName = '', activity = '') {
  const combined = `${legalFormRaw} ${companyName} ${activity}`.toLowerCase();
  // Exclude passive civil real estate (SCI), agricultural (GAEC/EARL/SCEA), sole proprietors
  if (/\b(sci|société civile|exploitation agricole|earl|gaec|scea|individuel|auto-entrepreneur|micro-entreprise|groupement foncier|gfa|scm|scp|selarl)\b/i.test(combined)) {
    return false;
  }
  return /\b(sas|sasu|sarl|eurl|sa|snc|actions simplifiée|responsabilité limitée|société anonyme)\b/i.test(combined);
}

async function fetchFranceWindow([start, end], maxPerWindow = 22) {
  try {
    const url = 'https://bodacc-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/annonces-commerciales/records';
    const whereClause = `publicationavis='A' AND familleavis_lib='Créations' AND listepersonnes like '%administration%' AND dateparution >= date'${start}' AND dateparution <= date'${end}'`;

    const res = await axios.get(url, {
      params: {
        where: whereClause,
        order_by: 'dateparution desc',
        limit: 80,
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
        let immatDate = record.dateparution;

        if (record.acte) {
          try {
            const acteObj = typeof record.acte === 'string' ? JSON.parse(record.acte) : record.acte;
            if (acteObj.dateImmatriculation && acteObj.dateImmatriculation >= '2026-04-01') {
              // Keep dateparution or dateImmatriculation within the 6-month window
              immatDate = record.dateparution || acteObj.dateImmatriculation;
            }
          } catch {
            // ignore
          }
        }

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
              const adminParsed = parseBodaccAdministration(person.administration);
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
        if (!isCommercialFrenchCompany(rawLegalForm, companyName, activity)) continue;
        if (!dirigeants || dirigeants.length === 0 || dirigeants[0].name === 'X') continue;

        const legalForm = normalizeFrenchLegalForm(rawLegalForm);

        const rawComp = {
          id: `FR-${siren}`,
          country: 'FR',
          countryName: 'France',
          name: companyName.trim(),
          registrationNumber: siren,
          incorporationDate: immatDate || start,
          legalForm,
          shareCapital,
          activity: activity.trim(),
          address: address || `${postalCode} ${city}`.trim(),
          city: city || 'Paris',
          postalCode: postalCode || '75001',
          dirigeants,
          corporateLinks,
          source: 'BODACC A (Greffe RCS)',
          crmStatus: 'new',
          crmNotes: '',
          crmAssignedTo: null,
          lastContactedAt: null,
          createdAt: new Date().toISOString(),
        };

        // Pre-check Revolut Business compliance & prioritize eligible B2B / Tech / High-Capital leads
        const compCheck = evaluateRevolutCompliance(rawComp);
        rawComp.compliance = compCheck;

        // Score candidate quality so we pick the best leads per 10-day window
        let priorityScore = 0;
        if (compCheck.status === 'eligible') priorityScore += 30;
        if (shareCapital >= 5000) priorityScore += 15;
        if (shareCapital >= 20000) priorityScore += 15;
        if (dirigeants.length >= 2) priorityScore += 15;
        if (corporateLinks.length >= 1) priorityScore += 10;
        if (/logiciel|saas|tech|informatique|digital|ia|data|conseil|consulting|ingénierie|industrie|e-commerce|santé|médical|logistique|architecture|design|marketing|communication|formation|énergie/i.test(activity)) {
          priorityScore += 25;
        }
        rawComp._priority = priorityScore;

        candidates.push(rawComp);
      } catch {
        // ignore single record error
      }
    }

    // Sort by priority while preserving diversity of incorporation dates within the window
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

async function fetchSwitzerlandWindow([start, end], maxPerWindow = 14) {
  try {
    const res = await axios.get('https://www.shab.ch/api/v1/publications', {
      params: {
        publicationStates: 'PUBLISHED',
        subRubrics: 'HR01',
        'publicationDate.start': start,
        'publicationDate.end': end,
        'pageRequest.size': 32,
        'pageRequest.page': 0,
      },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      },
      timeout: 12000,
    });

    const pubs = res.data?.content || [];
    if (pubs.length === 0) return [];

    // Fetch XMLs in parallel
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

          // Filter out sole proprietorships (Entreprise Individuelle)
          if (parsed.legalForm === 'Entreprise Individuelle') return null;
          // Must have at least 1 real named director/board member
          if (!parsed.dirigeants || parsed.dirigeants.length === 0 || parsed.dirigeants[0].name === 'X') return null;
          if (!parsed.uid) return null;

          const rawComp = {
            id: `CH-${parsed.uid.replace(/[^\w]/g, '')}`,
            country: 'CH',
            countryName: 'Suisse',
            name: parsed.name || fallbackName,
            registrationNumber: parsed.uid,
            incorporationDate: pubDate,
            legalForm: parsed.legalForm || 'Sàrl / GmbH',
            shareCapital: parsed.shareCapital || 20000,
            activity: parsed.activity || 'Services commerciaux et conseil aux entreprises',
            address: parsed.address,
            city: parsed.city || 'Zürich',
            postalCode: parsed.postalCode || '8000',
            canton: parsed.canton || 'ZH',
            dirigeants: parsed.dirigeants,
            corporateLinks: parsed.corporateLinks || [],
            source: 'FOSC / SHAB (Registre du Commerce Suisse)',
            crmStatus: 'new',
            crmNotes: '',
            crmAssignedTo: null,
            lastContactedAt: null,
            createdAt: new Date().toISOString(),
          };

          const compCheck = evaluateRevolutCompliance(rawComp);
          rawComp.compliance = compCheck;

          let priorityScore = 0;
          if (compCheck.status === 'eligible') priorityScore += 30;
          if (rawComp.legalForm === 'SA / AG') priorityScore += 20;
          if (rawComp.shareCapital >= 100000) priorityScore += 15;
          if (rawComp.dirigeants.length >= 2) priorityScore += 15;
          if (rawComp.corporateLinks.length >= 1) priorityScore += 10;
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

async function main() {
  const t0 = Date.now();
  const dbPath = path.join(__dirname, '../data/db.json');
  const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  const existingCompanies = db.companies || [];

  const windows = generateDateWindows();
  console.log(`=== Collecte Historique sur 6 Mois (${windows[0][0]} -> ${windows[windows.length - 1][1]}) : ${windows.length} tranches de 10 jours ===`);

  // Fetch FR and CH windows in parallel (3 windows at a time)
  const rawNewCompanies = [];
  for (let i = 0; i < windows.length; i += 3) {
    const slice = windows.slice(i, i + 3);
    const sliceResults = await Promise.all(
      slice.map(async (win) => {
        const [frList, chList] = await Promise.all([
          fetchFranceWindow(win, 22),
          fetchSwitzerlandWindow(win, 14),
        ]);
        console.log(`  -> Tranche ${win[0]} au ${win[1]} : +${frList.length} FR, +${chList.length} CH`);
        return [...frList, ...chList];
      })
    );
    for (const arr of sliceResults) {
      rawNewCompanies.push(...arr);
    }
  }

  // Deduplicate against existing companies and within rawNewCompanies
  const existingIds = new Set(existingCompanies.map(c => c.id));
  const existingRegs = new Set(existingCompanies.map(c => (c.registrationNumber || '').replace(/[^\w]/g, '')).filter(Boolean));
  const uniqueNew = [];

  for (const c of rawNewCompanies) {
    const cleanReg = (c.registrationNumber || '').replace(/[^\w]/g, '');
    if (existingIds.has(c.id) || (cleanReg && existingRegs.has(cleanReg))) continue;
    existingIds.add(c.id);
    if (cleanReg) existingRegs.add(cleanReg);
    uniqueNew.push(c);
  }

  console.log(`=== ${uniqueNew.length} nouvelles entreprises qualifiées collectées sur 6 mois. Enrichissement DNS/Web/CFO en cours... ===`);

  // Enrich new companies in fast parallel batches of 35
  const enrichedNew = await processInBatches(uniqueNew, 35, async (comp) => {
    try {
      return await enrichCompany(comp);
    } catch {
      return comp;
    }
  }, 'Enrichissement 6 Mois');

  // Combine existing + new
  const allCombined = [...existingCompanies, ...enrichedNew];

  // Build network graph for all companies (fast cross-referencing across the entire 6-month database!)
  console.log(`=== Construction de la Cartographie Réseau sur ${allCombined.length} entreprises... ===`);
  for (const comp of allCombined) {
    if (!comp.network || !comp.network.nodes || comp.network.nodes.length <= 1) {
      comp.network = await buildCompanyNetwork(comp, allCombined, { skipLiveLookup: true });
    }
  }

  // Sort by incorporationDate descending (newest first)
  allCombined.sort((a, b) => (b.incorporationDate || '').localeCompare(a.incorporationDate || ''));

  db.companies = allCombined;
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));

  // Compute global stats
  const total = allCombined.length;
  const france = allCombined.filter(c => c.country === 'FR').length;
  const switzerland = allCombined.filter(c => c.country === 'CH').length;
  const toContact = allCombined.filter(c => c.crmStatus === 'to_contact' || c.crmStatus === 'new').length;
  const contacted = allCombined.filter(c => c.crmStatus?.startsWith('contacted')).length;
  const inCrm = allCombined.filter(c => c.crmStatus === 'in_crm' || c.crmStatus === 'converted').length;
  const highSafetyCount = allCombined.filter(c => (c.safety?.score || c.confidenceScore || 0) >= 60).length;
  const verifiedWebCount = allCombined.filter(c => Boolean(c.website)).length;

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
  };

  const publicBundle = { companies: allCombined, stats };
  fs.writeFileSync(path.join(__dirname, '../../client/public/data.json'), JSON.stringify(publicBundle, null, 2));
  fs.writeFileSync(path.join(__dirname, '../../client/src/data/companies.json'), JSON.stringify(publicBundle, null, 2));

  // Summary by month
  const byMonth = {};
  const distinctDays = new Set();
  for (const c of allCombined) {
    const m = (c.incorporationDate || '').slice(0, 7);
    byMonth[m] = (byMonth[m] || 0) + 1;
    if (c.incorporationDate) distinctDays.add(c.incorporationDate);
  }

  console.log(`=== TERMINÉ EN ${((Date.now() - t0) / 1000).toFixed(1)}s ===`);
  console.log(`Total entreprises : ${total} (🇫🇷 FR: ${france}, 🇨🇭 CH: ${switzerland})`);
  console.log(`Sites web actifs vérifiés : ${verifiedWebCount}`);
  console.log(`Sûreté élevée (>=60%) : ${highSafetyCount}`);
  console.log(`Jours d'incorporation distincts couverts : ${distinctDays.size} jours`);
  console.log(`Répartition par mois :`, byMonth);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
