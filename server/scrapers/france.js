const axios = require('axios');
const { enrichCompany } = require('../services/enricher');

function formatPersonName(prenoms = '', nom = '') {
  const cleanPart = (str) =>
    (str || '')
      .trim()
      .split(/[\s-]+/)
      .filter(Boolean)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  const first = cleanPart(prenoms);
  const last = (nom || '').trim().toUpperCase();
  return `${first} ${last}`.trim();
}

/**
 * Fetch all physical directors, board members, CFOs, and corporate holding links
 * from the official French government RNE/Sirene API (recherche-entreprises.api.gouv.fr).
 * If a company's President/Director is a corporate holding ("personne morale"),
 * recursively resolves the holding's SIREN to find the human decision-makers!
 */
async function fetchFrenchDirectorsAndLinks(siren = '', companyName = '') {
  const cleanSiren = (siren || '').replace(/\D/g, '');
  const query = cleanSiren.length === 9 ? cleanSiren : companyName;
  if (!query || query === 'En cours') {
    return { dirigeants: [], corporateLinks: [], item: null };
  }

  try {
    const res = await axios.get(`https://recherche-entreprises.api.gouv.fr/search?q=${encodeURIComponent(query)}&per_page=3`, {
      timeout: 5000,
    });
    const results = res.data?.results || [];
    let item = cleanSiren.length === 9
      ? results.find(r => r.siren === cleanSiren) || results[0]
      : results[0];

    // If SIREN search returned no dirigeants, try searching by companyName
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
      return { dirigeants: [], corporateLinks: [], item: null };
    }

    const dirigeants = [];
    const corporateLinks = [];
    const rawDirs = item.dirigeants || [];

    for (const d of rawDirs) {
      if (d.type_dirigeant === 'personne physique' || (d.nom && d.prenoms)) {
        const fullName = formatPersonName(d.prenoms, d.nom);
        if (fullName && fullName.length > 2 && !dirigeants.some(x => x.name.toLowerCase() === fullName.toLowerCase())) {
          dirigeants.push({
            name: fullName,
            role: d.qualite || 'Président / Dirigeant',
            birthYear: d.annee_de_naissance || null,
            isPrimary: dirigeants.length === 0,
          });
        }
      } else if (d.type_dirigeant === 'personne morale' || d.denomination) {
        const holdingName = (d.denomination || '').trim();
        const holdingSiren = (d.siren || '').replace(/\D/g, '');
        if (holdingName) {
          corporateLinks.push({
            id: holdingSiren ? `FR-${holdingSiren}` : undefined,
            name: holdingName,
            siren: holdingSiren,
            legalForm: 'Holding / Personne Morale',
            shareCapital: 50000,
            activity: `Société mère / Mandataire personne morale (${d.qualite || 'Président'})`,
            city: item.siege?.libelle_commune || 'France',
            roleHeld: `${d.qualite || 'Présidente'} (Personne Morale)`,
          });
        }

        // Resolve human directors of the holding company via its SIREN!
        if (holdingSiren && holdingSiren.length === 9) {
          try {
            const holdRes = await axios.get(`https://recherche-entreprises.api.gouv.fr/search?q=${holdingSiren}&per_page=1`, {
              timeout: 4000,
            });
            const holdItem = holdRes.data?.results?.[0];
            if (holdItem && Array.isArray(holdItem.dirigeants)) {
              for (const hd of holdItem.dirigeants) {
                if (hd.type_dirigeant === 'personne physique' || (hd.nom && hd.prenoms)) {
                  const humanName = formatPersonName(hd.prenoms, hd.nom);
                  if (humanName && humanName.length > 2 && !dirigeants.some(x => x.name.toLowerCase() === humanName.toLowerCase())) {
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

    return { dirigeants, corporateLinks, item };
  } catch (err) {
    return { dirigeants: [], corporateLinks: [], item: null };
  }
}

/**
 * Scraper for newly created companies in France.
 * Sources:
 * 1. BODACC A (Annonces de créations de sociétés) via opendatasoft API
 * 2. API Recherche d'entreprises (DINUM / data.gouv / INPI / Sirene)
 */
async function scrapeFranceCreations(limit = 20) {
  try {
    console.log(`[Scraper FR] Interrogation du BODACC pour les nouvelles créations...`);

    const bodaccUrl = 'https://bodacc-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/annonces-commerciales/records';
    const bodaccRes = await axios.get(bodaccUrl, {
      params: {
        where: 'publicationavis="A" AND familleavis_lib="Créations" AND listepersonnes like "%pm%"',
        order_by: 'dateparution desc',
        limit: Math.min(limit, 50),
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

        if (isPersonnePhysique) {
          continue;
        }

        const sirenRaw = record.registre?.[0] || '';
        const siren = sirenRaw.replace(/\D/g, '');
        let companyName = record.commercant || '';

        let dirigeants = [];
        let corporateLinks = [];
        let address = '';
        let city = record.ville || '';
        let postalCode = record.cp || '';
        let activity = '';
        let legalForm = 'SAS';
        let shareCapital = 5000;

        if (record.listepersonnes) {
          try {
            const parsed = typeof record.listepersonnes === 'string' ? JSON.parse(record.listepersonnes) : record.listepersonnes;
            const person = parsed.personne;
            if (person) {
              if (!companyName && person.denomination) companyName = person.denomination;
              if (person.formeJuridique) legalForm = person.formeJuridique;
              if (person.capital?.montantCapital) {
                const cap = parseFloat(person.capital.montantCapital);
                if (!isNaN(cap)) shareCapital = Math.round(cap);
              }
              if (person.adresseSiegeSocial) {
                const a = person.adresseSiegeSocial;
                address = [a.numeroVoie, a.typeVoie, a.nomVoie].filter(Boolean).join(' ').trim();
                if (a.codePostal) postalCode = a.codePostal;
                if (a.ville) city = a.ville;
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

        // Deep-enrich via API Recherche Entreprises (including holding resolution!)
        const gouvData = await fetchFrenchDirectorsAndLinks(siren, companyName);
        if (gouvData.dirigeants.length > 0) {
          dirigeants = gouvData.dirigeants;
        }
        if (gouvData.corporateLinks.length > 0) {
          corporateLinks = gouvData.corporateLinks;
        }
        if (gouvData.item) {
          const item = gouvData.item;
          if (!companyName && item.nom_complet) companyName = item.nom_complet;
          if (item.nature_juridique && (!legalForm || legalForm === 'Société Commerciale')) {
            legalForm = mapNatureJuridique(item.nature_juridique);
          }
          if (item.siege) {
            if (!address && item.siege.adresse) address = item.siege.adresse;
            if (!postalCode && item.siege.code_postal) postalCode = item.siege.code_postal;
            if (!city && item.siege.libelle_commune) city = item.siege.libelle_commune;
          }
        }

        if (dirigeants.length === 0) {
          dirigeants.push({
            name: 'X',
            role: 'Non renseigné au registre',
            isPrimary: true,
          });
        }

        const rawCompany = {
          id: `FR-${siren || record.id}`,
          country: 'FR',
          countryName: 'France',
          name: companyName || 'Société Commerciale',
          registrationNumber: siren || 'En cours',
          incorporationDate: record.dateparution || new Date().toISOString().split('T')[0],
          legalForm: legalForm || 'SAS',
          shareCapital: shareCapital || 5000,
          activity: activity || 'Conseil, commerce et services aux entreprises',
          address: address || `${postalCode} ${city}`,
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

        const enriched = await enrichCompany(rawCompany);
        companies.push(enriched);
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
 * Find related companies by director name in France
 */
async function findRelatedCompaniesFR(dirigeantName, currentSiren = '') {
  if (!dirigeantName || dirigeantName === 'X' || dirigeantName.length < 3) return [];

  try {
    const res = await axios.get(`https://recherche-entreprises.api.gouv.fr/search?q=${encodeURIComponent(dirigeantName)}&per_page=6`, {
      timeout: 4500,
    });
    const list = res.data?.results || [];
    const cleanCurrent = (currentSiren || '').replace(/\D/g, '');

    const related = [];
    for (const item of list) {
      if (cleanCurrent && item.siren === cleanCurrent) continue;

      related.push({
        id: `FR-${item.siren}`,
        name: item.nom_complet || item.nom_raison_sociale,
        siren: item.siren,
        incorporationDate: item.date_creation,
        activity: item.activite_principale ? `Code NAF ${item.activite_principale}` : 'Services aux entreprises',
        legalForm: mapNatureJuridique(item.nature_juridique),
        relationType: 'Même Dirigeant / Mandataire',
        roleHeld: item.dirigeants?.[0]?.qualite || 'Président / Mandataire',
        city: item.siege?.libelle_commune || 'France',
      });

      if (related.length >= 4) break;
    }

    return related;
  } catch (err) {
    return [];
  }
}

function mapNatureJuridique(code) {
  if (!code) return 'Société Commerciale';
  const c = String(code);
  if (c.startsWith('57')) return 'SAS / SASU';
  if (c.startsWith('54')) return 'SARL / EURL';
  if (c.startsWith('55') || c.startsWith('56')) return 'SA';
  if (c.startsWith('65')) return 'SCI';
  if (c.startsWith('10')) return 'Entrepreneur Individuel';
  return 'Société Commerciale';
}

module.exports = {
  scrapeFranceCreations,
  fetchFrenchDirectorsAndLinks,
  findRelatedCompaniesFR,
  formatPersonName,
  mapNatureJuridique,
};
