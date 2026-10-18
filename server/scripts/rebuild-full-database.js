const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { enrichCompany } = require('../services/enricher');
const { parseShabXml } = require('../scrapers/switzerland');
const { fetchFrenchDirectorsAndLinks, mapNatureJuridique } = require('../scrapers/france');
const { buildCompanyNetwork } = require('../services/network');

async function processInBatches(items, batchSize, fn) {
  const results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const res = await Promise.all(batch.map(fn));
    results.push(...res);
    console.log(`[Progress] ${Math.min(i + batchSize, items.length)} / ${items.length} traitées...`);
  }
  return results;
}

async function main() {
  const dbPath = path.join(__dirname, '../data/db.json');
  const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  const companies = db.companies || [];

  console.log(`=== Reconstruction & Enrichissement profond de ${companies.length} entreprises (FR & CH) ===`);

  // Step 1: Deep registry extraction (INPI/Sirene for FR, SHAB XML for CH) + Website & CFO enrichment
  const enrichedList = await processInBatches(companies, 6, async (comp) => {
    try {
      let updated = { ...comp };

      if (comp.country === 'CH') {
        // Query SHAB HR01 by company name to fetch full XML
        try {
          const searchKw = comp.name.replace(/\([^)]*\)/g, '').split(',')[0].trim();
          const listRes = await axios.get('https://www.shab.ch/api/v1/publications', {
            params: {
              subRubrics: 'HR01',
              publicationStates: 'PUBLISHED',
              keyword: searchKw,
              'pageRequest.size': 3,
            },
            timeout: 6000,
          });

          const pub = listRes.data?.content?.[0];
          if (pub && pub.meta?.id) {
            const xmlRes = await axios.get(`https://www.shab.ch/api/v1/publications/${pub.meta.id}/xml`, {
              timeout: 6000,
            });
            const parsed = parseShabXml(xmlRes.data, comp.name);

            if (parsed.uid) updated.registrationNumber = parsed.uid;
            if (parsed.legalForm) updated.legalForm = parsed.legalForm;
            if (parsed.shareCapital) updated.shareCapital = parsed.shareCapital;
            if (parsed.activity && parsed.activity.length > 10) updated.activity = parsed.activity;
            if (parsed.address) updated.address = parsed.address;
            if (parsed.city) updated.city = parsed.city;
            if (parsed.postalCode) updated.postalCode = parsed.postalCode;
            if (parsed.canton) updated.canton = parsed.canton;
            if (parsed.dirigeants && parsed.dirigeants.length > 0) {
              updated.dirigeants = parsed.dirigeants;
            }
            if (parsed.corporateLinks && parsed.corporateLinks.length > 0) {
              updated.corporateLinks = parsed.corporateLinks;
            }
          }
        } catch (errCh) {
          // Keep existing fields if SHAB call timed out
        }
      } else if (comp.country === 'FR') {
        // Query French RNE / Sirene API + recursive holding lookup
        try {
          const gouvData = await fetchFrenchDirectorsAndLinks(comp.registrationNumber, comp.name);
          if (gouvData.dirigeants && gouvData.dirigeants.length > 0) {
            updated.dirigeants = gouvData.dirigeants;
          }
          if (gouvData.corporateLinks && gouvData.corporateLinks.length > 0) {
            updated.corporateLinks = gouvData.corporateLinks;
          }
          if (gouvData.item) {
            const item = gouvData.item;
            if (item.siren && (!updated.registrationNumber || updated.registrationNumber === 'En cours')) {
              updated.registrationNumber = item.siren;
            }
            if (item.nature_juridique && (!updated.legalForm || updated.legalForm === 'Société Commerciale')) {
              updated.legalForm = mapNatureJuridique(item.nature_juridique);
            }
            if (item.siege) {
              if ((!updated.city || updated.city === 'France') && item.siege.libelle_commune) {
                updated.city = item.siege.libelle_commune;
              }
              if ((!updated.postalCode || updated.postalCode === '75000') && item.siege.code_postal) {
                updated.postalCode = item.siege.code_postal;
              }
              if ((!updated.address || updated.address.length < 6) && item.siege.adresse) {
                updated.address = item.siege.adresse;
              }
            }
          }
        } catch (errFr) {
          // Keep existing fields
        }
      }

      // Ensure factual dirigentes fallback
      const validDirs = (updated.dirigeants || []).filter(
        d => d.name && d.name !== 'X' && !/^(direction|conseil d'administration)/i.test(d.name)
      );
      updated.dirigeants = validDirs.length > 0
        ? validDirs
        : [{ name: 'X', role: 'Non renseigné au registre', isPrimary: true }];

      // Reset phone before re-enrichment unless it came from BODACC/FOSC rawPhone
      if (updated.phoneSource && updated.phoneSource.includes('Standard Siège')) {
        updated.phone = null;
      }

      // Run full domain, HTTPS, MX, CFO, Safety Score, and Revolut Compliance enrichment
      const fullyEnriched = await enrichCompany(updated);
      return fullyEnriched;
    } catch (e) {
      console.error(`Erreur sur ${comp.name}:`, e.message);
      return comp;
    }
  });

  console.log(`=== Construction de la Cartographie Réseau pour les ${enrichedList.length} entreprises ===`);

  const finalCompanies = await processInBatches(enrichedList, 8, async (comp) => {
    try {
      comp.network = await buildCompanyNetwork(comp, enrichedList);
    } catch (e) {
      console.error(`Erreur network sur ${comp.name}:`, e.message);
    }
    return comp;
  });

  db.companies = finalCompanies;
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));

  // Compute complete stats
  const total = finalCompanies.length;
  const france = finalCompanies.filter(c => c.country === 'FR').length;
  const switzerland = finalCompanies.filter(c => c.country === 'CH').length;
  const toContact = finalCompanies.filter(c => c.crmStatus === 'to_contact' || c.crmStatus === 'new').length;
  const contacted = finalCompanies.filter(c => c.crmStatus?.startsWith('contacted')).length;
  const inCrm = finalCompanies.filter(c => c.crmStatus === 'in_crm' || c.crmStatus === 'converted').length;
  const highSafetyCount = finalCompanies.filter(c => (c.safety?.score || c.confidenceScore || 0) >= 60).length;
  const verifiedWebCount = finalCompanies.filter(c => Boolean(c.website)).length;

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

  const publicBundle = { companies: finalCompanies, stats };
  fs.writeFileSync(path.join(__dirname, '../../client/public/data.json'), JSON.stringify(publicBundle, null, 2));
  fs.writeFileSync(path.join(__dirname, '../../client/src/data/companies.json'), JSON.stringify(publicBundle, null, 2));

  // Print summary metrics
  const frRealDirs = finalCompanies.filter(c => c.country === 'FR' && c.dirigeants?.[0]?.name !== 'X').length;
  const chRealDirs = finalCompanies.filter(c => c.country === 'CH' && c.dirigeants?.[0]?.name !== 'X').length;
  const withMultiNodes = finalCompanies.filter(c => (c.network?.nodes?.length || 0) > 1).length;
  const withSisters = finalCompanies.filter(c => c.network?.nodes?.some(n => n.type === 'sister_company')).length;
  const withCfoOrBoard = finalCompanies.filter(c => c.cfo?.name && c.cfo.name !== 'X').length;

  console.log('=== RÉSUMÉ DE LA RECONSTRUCTION ===');
  console.log(`Total sociétés : ${total} (FR: ${france}, CH: ${switzerland})`);
  console.log(`Dirigeants / Board identifiés FR : ${frRealDirs} / ${france}`);
  console.log(`Dirigeants / Board identifiés CH : ${chRealDirs} / ${switzerland}`);
  console.log(`Second décideur / Board / CFO identifié : ${withCfoOrBoard}`);
  console.log(`Sites web HTTPS actifs vérifiés : ${verifiedWebCount}`);
  console.log(`Cartographies Réseau multi-noeuds : ${withMultiNodes} / ${total} (dont ${withSisters} avec sociétés liées/holdings)`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
