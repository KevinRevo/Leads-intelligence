const axios = require('axios');
const { enrichCompany } = require('../services/enricher');
const { isValidPhysicalPersonName, isValidCommercialCompany, detectInternationalLinks } = require('../services/northdata');

function formatPersonName(prenoms = '', nom = '') {
  const cleanNom = (nom || '')
    .replace(/\([^)]*\)/g, '') // Strip maiden/birth name in parens e.g. "PEDINI (BACONNET)"
    .trim()
    .toUpperCase();
  const cleanPart = (str) =>
    (str || '')
      .trim()
      .split(/[\s-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  const first = cleanPart(prenoms);
  return `${first} ${cleanNom}`.trim();
}

/**
 * Parse the `personne.administration` string directly from a BODACC record
 * to extract strictly PHYSICAL directors (`dirigeants`)
 * and corporate holdings (`corporateLinks`).
 */
function parseBodaccAdministration(adminStr = '', companyName = '') {
  if (!adminStr || typeof adminStr !== 'string') {
    return { dirigeants: [], corporateLinks: [] };
  }
  const dirigeants = [];
  const corporateLinks = [];

  const segments = adminStr
    .replace(/\u00a0/g, ' ')
    .split(/;\s*|\.\s+(?=(?:Pr[eé]sident|Directeur|G[eé]rant|Administrateur|Membre|Commissaire|Associ[eé]|Contr[oô]leur))/i)
    .map(s => s.trim())
    .filter(Boolean);

  for (const seg of segments) {
    const colonIdx = seg.indexOf(':');
    if (colonIdx === -1) continue;
    const rawRole = seg.slice(0, colonIdx).trim();
    let rawPerson = seg.slice(colonIdx + 1).trim().replace(/\.$/, '');
    rawPerson = rawPerson.replace(/\s+nom d'usage\s*:\s*[^,;.]*/gi, '').trim();

    const isCorporateKeyword = /(?:^|\s)(SAS|SARL|SA|SASU|EURL|SCI|SNC|GmbH|Sàrl|AG|Ltd|LLC|Inc|BV|Srl|St[eé]|Soci[eé]t[eé]|GROUP|GROUPE|HOLDING|CAPITAL|INVEST|PARTNERS|CABINET|AUDIT|KPMG|DELOITTE|ERNST|PWC|FIDUCIAIRE|GESTION|VENTURES|MANAGEMENT)(?:\s|$)/i.test(rawPerson);
    const hasAllCapsOnly = !/[A-ZÀ-Ÿ][a-zà-ÿ]{2,}/.test(rawPerson.replace(/\b(de|du|des|et|la|le|les|en|sur|par|actions|simplifiée|responsabilité|limitée|anonyme)\b/gi, ''));

    if (isCorporateKeyword || hasAllCapsOnly || /repr[eé]sent[eé] par/i.test(rawPerson)) {
      const corpName = rawPerson
        .split(/repr[eé]sent[eé] par/i)[0]
        .replace(/^(?:St[eé]|Soci[eé]t[eé])\s+(?:par\s+actions\s+simplifi[eé]e|à\s+responsabilit[eé]\s+limit[eé]e|anonyme|civile)\s+/i, '')
        .trim();
      if (corpName && corpName.length > 2) {
        const isAudit = /commissaire aux comptes/i.test(rawRole);
        corporateLinks.push({
          name: corpName,
          legalForm: isAudit ? 'Commissaire aux Comptes' : 'Holding / Personne Morale',
          shareCapital: 50000,
          activity: isAudit ? 'Audit légal & Commissariat aux comptes' : `Société mère / Mandataire (${rawRole})`,
          roleHeld: `${rawRole} (Personne Morale)`,
          city: 'France',
        });
      }
      const repMatch = rawPerson.match(/repr[eé]sent[eé] par\s+([A-ZÀ-Ÿa-zà-ÿ\s,-]+)$/i);
      if (repMatch) {
        rawPerson = repMatch[1].trim();
      } else {
        continue;
      }
    }

    // Parse human name
    let fullName = '';
    if (rawPerson.includes(',')) {
      const parts = rawPerson.split(',').map(p => p.trim()).filter(Boolean);
      const words0 = parts[0].split(/\s+/);
      if (words0.length >= 2 && words0[0] === words0[0].toUpperCase() && words0[1] !== words0[1].toUpperCase()) {
        const last = words0[0].toUpperCase();
        const first = words0.slice(1).join(' ');
        fullName = `${first} ${last}`.trim();
      } else if (parts.length >= 2) {
        const last = parts[0].toUpperCase();
        const first = parts[1].split(/\s+/)[0];
        fullName = `${first} ${last}`.trim();
      }
    } else {
      const words = rawPerson.split(/\s+/).filter(Boolean);
      if (words.length >= 2) {
        const upperWords = words.filter(w => w === w.toUpperCase() && w.length > 1);
        const mixedWords = words.filter(w => w !== w.toUpperCase() || w.length <= 1);
        if (upperWords.length >= 1 && mixedWords.length >= 1) {
          fullName = `${mixedWords[0]} ${upperWords.join(' ')}`.trim();
        } else {
          fullName = `${words.slice(1).join(' ')} ${words[0].toUpperCase()}`.trim();
        }
      }
    }

    if (
      fullName &&
      !/commissaire/i.test(rawRole) &&
      isValidPhysicalPersonName(fullName, companyName)
    ) {
      if (!dirigeants.some(d => d.name.toLowerCase() === fullName.toLowerCase())) {
        dirigeants.push({
          name: fullName,
          role: rawRole || 'Président / Dirigeant',
          isPrimary: dirigeants.length === 0,
        });
      }
    }
  }

  return { dirigeants, corporateLinks };
}

/**
 * Extract latest annual turnover (`Chiffre d'Affaires`) from INSEE/RNE `finances` object
 */
function extractFrenchRevenue(financesObj) {
  if (!financesObj || typeof financesObj !== 'object') return { revenue: null, revenueYear: null };
  const years = Object.keys(financesObj).sort((a, b) => Number(b) - Number(a));
  for (const y of years) {
    const ca = financesObj[y]?.ca;
    if (typeof ca === 'number' && !isNaN(ca) && ca > 0) {
      return { revenue: Math.round(ca), revenueYear: y };
    }
  }
  return { revenue: null, revenueYear: null };
}

/**
 * Fetch all physical directors, board members, CFOs, corporate holding links, and turnover
 * from the official French government RNE/Sirene API (recherche-entreprises.api.gouv.fr).
 * If a company's President/Director is a corporate holding ("personne morale"),
 * recursively resolves the holding's SIREN to find the human decision-makers!
 */
async function fetchFrenchDirectorsAndLinks(siren = '', companyName = '') {
  const cleanSiren = (siren || '').replace(/\D/g, '');
  const query = cleanSiren.length === 9 ? cleanSiren : companyName;
  if (!query || query === 'En cours') {
    return { dirigeants: [], corporateLinks: [], item: null, revenue: null, revenueYear: null };
  }

  try {
    const res = await axios.get(`https://recherche-entreprises.api.gouv.fr/search?q=${encodeURIComponent(query)}&per_page=3`, {
      timeout: 5000,
    });
    const results = res.data?.results || [];
    let item = cleanSiren.length === 9
      ? results.find(r => r.siren === cleanSiren) || results[0]
      : results[0];

    if ((!item || !item.dirigeants || item.dirigeants.length === 0) && companyName && query !== companyName) {
      try {
        const resName = await axios.get(`https://recherche-entreprises.api.gouv.fr/search?q=${encodeURIComponent(companyName)}&per_page=5`, {
          timeout: 4500,
        });
        const withDir = (resName.data?.results || []).find(r => r.dirigeants && r.dirigeants.length > 0);
        if (withDir) {
          item = withDir;
        }
      } catch {
        // ignore
      }
    }

    if (!item) {
      return { dirigeants: [], corporateLinks: [], item: null, revenue: null, revenueYear: null };
    }

    const { revenue, revenueYear } = extractFrenchRevenue(item.finances);
    const dirigeants = [];
    const corporateLinks = [];
    const rawDirs = item.dirigeants || [];

    for (const d of rawDirs) {
      if (d.type_dirigeant === 'personne physique' || (d.nom && d.prenoms)) {
        if (/commissaire aux comptes/i.test(d.qualite || '')) continue;
        const fullName = formatPersonName(d.prenoms, d.nom);
        if (
          isValidPhysicalPersonName(fullName, companyName) &&
          !dirigeants.some(x => x.name.toLowerCase() === fullName.toLowerCase())
        ) {
          dirigeants.push({
            name: fullName,
            role: d.qualite || 'Président / Dirigeant',
            birthYear: d.annee_de_naissance || null,
            nationality: d.nationalite || null,
            isPrimary: dirigeants.length === 0,
          });
        }
      } else if (d.type_dirigeant === 'personne morale' || d.denomination) {
        const holdingName = (d.denomination || '').trim();
        const holdingSiren = (d.siren || '').replace(/\D/g, '');
        if (holdingName) {
          const isAudit = /commissaire aux comptes/i.test(d.qualite || '');
          corporateLinks.push({
            id: holdingSiren ? `FR-${holdingSiren}` : undefined,
            name: holdingName,
            siren: holdingSiren,
            legalForm: isAudit ? 'Commissaire aux Comptes' : 'Holding / Personne Morale',
            shareCapital: 50000,
            activity: `Société mère / Mandataire personne morale (${d.qualite || 'Président'})`,
            city: item.siege?.libelle_commune || 'France',
            roleHeld: `${d.qualite || 'Présidente'} (Personne Morale)`,
          });
        }

        // Resolve human directors of the holding company via its SIREN!
        if (holdingSiren && holdingSiren.length === 9 && !/commissaire/i.test(d.qualite || '')) {
          try {
            const holdRes = await axios.get(`https://recherche-entreprises.api.gouv.fr/search?q=${holdingSiren}&per_page=1`, {
              timeout: 4000,
            });
            const holdItem = holdRes.data?.results?.[0];
            if (holdItem && Array.isArray(holdItem.dirigeants)) {
              for (const hd of holdItem.dirigeants) {
                if (hd.type_dirigeant === 'personne physique' || (hd.nom && hd.prenoms)) {
                  if (/commissaire/i.test(hd.qualite || '')) continue;
                  const humanName = formatPersonName(hd.prenoms, hd.nom);
                  if (
                    isValidPhysicalPersonName(humanName, companyName) &&
                    !dirigeants.some(x => x.name.toLowerCase() === humanName.toLowerCase())
                  ) {
                    dirigeants.push({
                      name: humanName,
                      role: `${hd.qualite || 'Dirigeant'} (via holding ${holdingName})`,
                      birthYear: hd.annee_de_naissance || null,
                      isPrimary: dirigeants.length === 0,
                    });
                  }
                }
              }
            }
          } catch {
            // Non-blocking
          }
        }
      }
    }

    return { dirigeants, corporateLinks, item, revenue, revenueYear };
  } catch {
    return { dirigeants: [], corporateLinks: [], item: null, revenue: null, revenueYear: null };
  }
}

/**
 * Scraper for newly created commercial companies in France (SAS/SASU, SARL/EURL, SA, SNC only).
 */
async function scrapeFranceCreations(limit = 20) {
  try {
    console.log(`[Scraper FR] Interrogation du BODACC pour les nouvelles créations...`);

    const bodaccUrl = 'https://bodacc-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/annonces-commerciales/records';
    const bodaccRes = await axios.get(bodaccUrl, {
      params: {
        where: 'publicationavis="A" AND familleavis_lib="Créations" AND listepersonnes like "%administration%"',
        order_by: 'dateparution desc',
        limit: Math.min(limit * 2, 60),
      },
      timeout: 10000,
    });

    const records = bodaccRes.data?.results || [];
    console.log(`[Scraper FR] ${records.length} annonces BODACC trouvées.`);

    const companies = [];

    for (const record of records) {
      try {
        const isPersonnePhysique =
          (record.acte && record.acte.includes('personne physique')) ||
          (record.listepersonnes && typeof record.listepersonnes === 'string' && record.listepersonnes.includes('"typePersonne": "pp"') && !record.listepersonnes.includes('formeJuridique')) ||
          /individuel|auto-entrepreneur|micro-entreprise/i.test(record.commercant || '');

        if (isPersonnePhysique) continue;

        const sirenRaw = record.registre?.[0] || record.registre?.[1] || '';
        const siren = sirenRaw.replace(/\D/g, '');
        if (!siren || siren.length !== 9) continue;

        let companyName = record.commercant || '';
        let dirigeants = [];
        let corporateLinks = [];
        let address = '';
        let city = record.ville || '';
        let postalCode = record.cp || '';
        let activity = '';
        let legalForm = '';
        let shareCapital = 5000;
        let revenue = null;
        let revenueYear = null;

        if (record.listepersonnes) {
          try {
            const parsed = typeof record.listepersonnes === 'string' ? JSON.parse(record.listepersonnes) : record.listepersonnes;
            const person = parsed.personne;
            if (person) {
              if (!companyName && person.denomination) companyName = person.denomination;
              if (person.formeJuridique) legalForm = person.formeJuridique;
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
                if (adminParsed.dirigeants.length > 0) dirigeants = adminParsed.dirigeants;
                if (adminParsed.corporateLinks.length > 0) corporateLinks = adminParsed.corporateLinks;
              }
            }
          } catch {
            // Ignore
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
                address = `${a.numeroVoie || ''} ${a.typeVoie || ''} ${a.nomVoie || ''}`.trim();
                if (a.codePostal) postalCode = a.codePostal;
                if (a.ville) city = a.ville;
              }
            }
          } catch {
            // Ignore
          }
        }

        if (dirigeants.length === 0 || corporateLinks.length > 0) {
          const gouvData = await fetchFrenchDirectorsAndLinks(siren, companyName);
          if (gouvData.dirigeants.length > 0) {
            dirigeants = gouvData.dirigeants;
          }
          if (gouvData.corporateLinks.length > 0 && corporateLinks.length === 0) {
            corporateLinks = gouvData.corporateLinks;
          }
          if (gouvData.revenue) {
            revenue = gouvData.revenue;
            revenueYear = gouvData.revenueYear;
          }
          if (gouvData.item) {
            const item = gouvData.item;
            if (!companyName && item.nom_complet) companyName = item.nom_complet;
            if (item.nature_juridique && !legalForm) {
              legalForm = mapNatureJuridique(item.nature_juridique);
            }
            if (item.siege) {
              if (!address && item.siege.adresse) address = item.siege.adresse;
              if (!postalCode && item.siege.code_postal) postalCode = item.siege.code_postal;
              if (!city && item.siege.libelle_commune) city = item.siege.libelle_commune;
            }
          }
        }

        const normalizedLf = normalizeFrenchLegalForm(legalForm);

        const rawCompany = {
          id: `FR-${siren}`,
          country: 'FR',
          countryName: 'France',
          name: companyName || '',
          registrationNumber: siren,
          incorporationDate: record.dateparution || new Date().toISOString().split('T')[0],
          legalForm: normalizedLf,
          shareCapital: shareCapital || 5000,
          revenue,
          revenueYear,
          activity: activity || 'Conseil, commerce et services aux entreprises',
          address: address || `${postalCode} ${city}`,
          city: city || 'Paris',
          postalCode: postalCode || '75001',
          dirigeants,
          corporateLinks,
          internationalLinks: detectInternationalLinks({ country: 'FR', corporateLinks, activity, address }),
          source: 'BODACC A & RNE (INPI)',
          crmStatus: 'new',
          crmNotes: '',
          crmAssignedTo: null,
          lastContactedAt: null,
          createdAt: new Date().toISOString(),
        };

        // Triple-check: strictly commercial SAS/SARL/SA/SNC, turnover <= 30M€, and physical director
        if (!isValidCommercialCompany(rawCompany)) continue;
        if (!rawCompany.dirigeants || rawCompany.dirigeants.length === 0) continue;

        const enriched = await enrichCompany(rawCompany);
        companies.push(enriched);
        if (companies.length >= limit) break;
      } catch (itemErr) {
        console.error('[Scraper FR] Erreur sur annonce unitaire:', itemErr.message);
      }
    }

    return companies;
  } catch (error) {
    console.error('[Scraper FR] Erreur globale lors du scraping:', error.message);
    return [];
  }
}

/**
 * Find related commercial companies by physical director name in France
 */
async function findRelatedCompaniesFR(dirigeantName, currentSiren = '') {
  if (!isValidPhysicalPersonName(dirigeantName)) return [];

  try {
    const res = await axios.get(`https://recherche-entreprises.api.gouv.fr/search?q=${encodeURIComponent(dirigeantName)}&per_page=6`, {
      timeout: 4500,
    });
    const list = res.data?.results || [];
    const cleanCurrent = (currentSiren || '').replace(/\D/g, '');

    const related = [];
    for (const item of list) {
      if (cleanCurrent && item.siren === cleanCurrent) continue;
      const lf = mapNatureJuridique(item.nature_juridique);
      if (lf === 'Entrepreneur Individuel') continue;

      related.push({
        id: `FR-${item.siren}`,
        name: item.nom_complet || item.nom_raison_sociale,
        siren: item.siren,
        incorporationDate: item.date_creation,
        activity: item.activite_principale ? `Code NAF ${item.activite_principale}` : 'Services aux entreprises',
        legalForm: lf,
        countryCode: 'FR',
        relationType: 'Même Dirigeant / Mandataire',
        roleHeld: item.dirigeants?.[0]?.qualite || 'Président / Mandataire',
        city: item.siege?.libelle_commune || 'France',
      });

      if (related.length >= 4) break;
    }

    return related;
  } catch {
    return [];
  }
}

function normalizeFrenchLegalForm(raw = '') {
  const s = (raw || '').toLowerCase();
  if (s.includes('individuel') || s.includes('auto-entrepreneur') || s.includes('micro')) return 'Entrepreneur Individuel';
  if (s.includes('civile') || /\bsci\b/i.test(raw)) return 'SCI';
  if (s.includes('simplifiée') || /\bsas\b|\bsasu\b/i.test(raw)) return 'SAS / SASU';
  if (s.includes('responsabilité limitée') || /\bsarl\b|\beurl\b/i.test(raw)) return 'SARL / EURL';
  if (s.includes('anonyme') || /\bsa\b/i.test(raw)) return 'SA';
  if (s.includes('nom collectif') || /\bsnc\b/i.test(raw)) return 'SNC';
  return raw;
}

function mapNatureJuridique(code) {
  if (!code) return 'SAS / SASU';
  const c = String(code);
  if (c.startsWith('57')) return 'SAS / SASU';
  if (c.startsWith('54')) return 'SARL / EURL';
  if (c.startsWith('55') || c.startsWith('56')) return 'SA';
  if (c.startsWith('52')) return 'SNC';
  if (c.startsWith('65')) return 'SCI';
  if (c.startsWith('10')) return 'Entrepreneur Individuel';
  return 'Société Commerciale';
}

module.exports = {
  scrapeFranceCreations,
  fetchFrenchDirectorsAndLinks,
  parseBodaccAdministration,
  findRelatedCompaniesFR,
  formatPersonName,
  mapNatureJuridique,
  normalizeFrenchLegalForm,
  extractFrenchRevenue,
};
