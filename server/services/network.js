const { findRelatedCompaniesFR } = require('../scrapers/france');
const { findRelatedCompaniesCH } = require('../scrapers/switzerland');
const { isValidPhysicalPersonName, buildNorthDataUrl, COUNTRY_MAP } = require('./northdata');

/**
 * Service to build a North Data-inspired relationship & ownership cartography between:
 * - The target company
 * - Its physical directors, board members & CFO (personnes physiques uniquement)
 * - Its corporate holdings / parent / sister companies (personnes morales)
 * - Its foreign / cross-border entities (`internationalLinks` with country flags)
 */
async function buildCompanyNetwork(company, allCompanies = [], options = {}) {
  if (!company) return null;
  const { skipLiveLookup = false } = options;

  const nodes = [];
  const edges = [];
  const nodeMap = new Set();
  const edgeMap = new Set();

  function addNode(node) {
    if (!node || !node.id) return;
    if (!nodeMap.has(node.id)) {
      nodeMap.add(node.id);
      nodes.push(node);
    }
  }

  function addEdge(edge) {
    if (!edge || !edge.source || !edge.target) return;
    const key = `${edge.source}->${edge.target}`;
    if (!edgeMap.has(key)) {
      edgeMap.add(key);
      edges.push(edge);
    }
  }

  const homeFlag = company.country === 'CH' ? '🇨🇭' : '🇫🇷';

  // 1. Central Target Company Node
  addNode({
    id: company.id,
    label: company.name,
    type: 'target_company',
    country: company.country,
    flag: homeFlag,
    registrationNumber: company.registrationNumber,
    legalForm: company.legalForm,
    shareCapital: company.shareCapital,
    revenue: company.revenue || null,
    city: company.city,
    activity: company.activity,
    northDataUrl: company.northDataUrl || buildNorthDataUrl(company),
    isTarget: true,
  });

  // 2. Corporate Holdings / Parent Companies / Domiciliation links
  const corporateLinks = company.corporateLinks || [];
  for (const corp of corporateLinks) {
    if (!corp.name) continue;
    const corpNodeId = corp.id || `sister-corp-${corp.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
    const cc = corp.countryCode || company.country;
    const cInfo = COUNTRY_MAP[cc] || { code: cc, name: cc, flag: homeFlag };
    const isForeign = cc !== company.country;

    addNode({
      id: corpNodeId,
      label: corp.name,
      type: 'sister_company',
      isForeign,
      country: cInfo.code,
      countryName: cInfo.name,
      flag: cInfo.flag,
      siren: corp.siren || '',
      legalForm: corp.legalForm || (company.country === 'CH' ? 'SA / GmbH' : 'Holding SAS / SARL'),
      shareCapital: corp.shareCapital || 50000,
      city: corp.city || company.city,
      activity: corp.activity || 'Structure liée / Holding / Actionnaire Personne Morale',
      roleHeld: corp.roleHeld || 'Holding / Société Mère',
      northDataUrl: `https://www.northdata.fr/?query=${encodeURIComponent(corp.name)}`,
    });

    addEdge({
      id: `edge-${company.id}-${corpNodeId}`,
      source: company.id,
      target: corpNodeId,
      label: corp.roleHeld || 'Détention / Holding',
      type: isForeign ? 'cross_border' : 'mandate',
    });
  }

  // 3. Explicit Foreign / Cross-Border Entities (`internationalLinks`)
  const internationalLinks = company.internationalLinks || [];
  for (const intl of internationalLinks) {
    if (!intl.entityName) continue;
    const intlId = `intl-${intl.countryCode}-${intl.entityName.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 28)}`;
    addNode({
      id: intlId,
      label: `${intl.flag || '🌍'} ${intl.entityName}`,
      type: 'sister_company',
      isForeign: true,
      country: intl.countryCode,
      countryName: intl.countryName,
      flag: intl.flag || '🌍',
      legalForm: `Entité Étrangère (${intl.countryName})`,
      shareCapital: company.shareCapital || 50000,
      city: intl.city || intl.countryName,
      activity: `${intl.relation} — Lien transfrontalier (${company.country} ↔ ${intl.countryCode})`,
      roleHeld: intl.relation || 'Lien International',
      northDataUrl: `https://www.northdata.fr/?query=${encodeURIComponent(intl.entityName)}`,
    });

    addEdge({
      id: `edge-${company.id}-${intlId}`,
      source: company.id,
      target: intlId,
      label: `${intl.flag || ''} ${intl.relation || 'Lien International'}`.trim(),
      type: 'cross_border',
    });
  }

  // 4. Strictly Physical Dirigeants, Board Members & Directeurs
  const realDirigeants = (company.dirigeants || []).filter(d =>
    isValidPhysicalPersonName(d?.name, company.name)
  );

  const cleanComp = (company.name || '').replace(/\b(SAS|SARL|SA|SASU|EURL|GmbH|Sàrl|AG)\b/gi, '').trim() || company.name;

  for (let i = 0; i < realDirigeants.length; i++) {
    const d = realDirigeants[i];
    const personId = `person-${d.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;

    addNode({
      id: personId,
      label: d.name,
      type: 'person',
      role: d.role || 'Dirigeant / Membre du Board (Personne Physique)',
      birthYear: d.birthYear || null,
      email: company.bestEmail,
      phone: company.phone,
      linkedinUrl: `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`"${d.name}" "${cleanComp}"`)}`,
      northDataUrl: `https://www.northdata.fr/?query=${encodeURIComponent(`${d.name} ${company.city || ''}`)}`,
      isPrimary: Boolean(d.isPrimary || i === 0),
    });

    addEdge({
      id: `edge-${company.id}-${personId}`,
      source: company.id,
      target: personId,
      label: d.role || 'Dirigeant Physique',
      type: 'mandate',
    });

    // Look for sister companies in current database (same physical director across FR or CH!)
    const sisterCompanies = [];
    const dbSisters = allCompanies.filter(
      c =>
        c.id !== company.id &&
        c.dirigeants?.some(x => x.name && x.name.toLowerCase().trim() === d.name.toLowerCase().trim())
    );

    for (const c of dbSisters) {
      sisterCompanies.push({
        id: c.id,
        name: c.name,
        siren: c.registrationNumber,
        legalForm: c.legalForm,
        shareCapital: c.shareCapital,
        activity: c.activity,
        city: c.city,
        countryCode: c.country,
        roleHeld: c.dirigeants.find(x => x.name.toLowerCase() === d.name.toLowerCase())?.role || 'Mandataire commun',
      });
    }

    // Live lookup for cross-mandates (only for top 2 directors when not skipped)
    if (!skipLiveLookup && i < 2) {
      if (company.country === 'FR') {
        try {
          const liveSisters = await findRelatedCompaniesFR(d.name, company.registrationNumber);
          for (const s of liveSisters) {
            if (
              s.name &&
              s.name.toLowerCase() !== company.name.toLowerCase() &&
              !sisterCompanies.some(x => x.name.toLowerCase() === s.name.toLowerCase())
            ) {
              sisterCompanies.push(s);
            }
          }
        } catch {
          // ignore
        }
      } else if (company.country === 'CH') {
        try {
          const liveSisters = await findRelatedCompaniesCH(d, company.registrationNumber, company.name);
          for (const s of liveSisters) {
            if (
              s.name &&
              s.name.toLowerCase() !== company.name.toLowerCase() &&
              !sisterCompanies.some(x => x.name.toLowerCase() === s.name.toLowerCase())
            ) {
              sisterCompanies.push(s);
            }
          }
        } catch {
          // ignore
        }
      }
    }

    for (const sister of sisterCompanies.slice(0, 3)) {
      const sisterNodeId = sister.id || `sister-${sister.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
      const sCountry = sister.countryCode || company.country;
      const sInfo = COUNTRY_MAP[sCountry] || { code: sCountry, name: sCountry, flag: homeFlag };
      const isForeignSister = sCountry !== company.country;

      addNode({
        id: sisterNodeId,
        label: sister.name,
        type: 'sister_company',
        isForeign: isForeignSister,
        country: sInfo.code,
        countryName: sInfo.name,
        flag: sInfo.flag,
        siren: sister.siren || '',
        legalForm: sister.legalForm || (sCountry === 'CH' ? 'Sàrl / AG' : 'SAS / SARL'),
        shareCapital: sister.shareCapital || (sCountry === 'CH' ? 20000 : 10000),
        city: sister.city || company.city,
        activity: sister.activity || 'Société liée par dirigeant physique commun',
        roleHeld: sister.roleHeld || 'Mandat croisé',
        northDataUrl: `https://www.northdata.fr/?query=${encodeURIComponent(sister.name)}`,
      });

      addEdge({
        id: `edge-${personId}-${sisterNodeId}`,
        source: personId,
        target: sisterNodeId,
        label: sister.roleHeld || 'Mandat croisé',
        type: isForeignSister ? 'cross_border' : 'cross_mandate',
      });
    }
  }

  // 5. Distinct Physical CFO node if not already in realDirigeants
  if (
    company.cfo &&
    isValidPhysicalPersonName(company.cfo.name, company.name) &&
    !realDirigeants.some(d => d.name.toLowerCase() === company.cfo.name.toLowerCase())
  ) {
    const cfoId = `person-cfo-${company.cfo.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
    addNode({
      id: cfoId,
      label: company.cfo.name,
      type: 'person_cfo',
      role: company.cfo.role || 'Directeur Financier / CFO (Personne Physique)',
      linkedinUrl: company.cfo.linkedinSearchUrl,
      northDataUrl: `https://www.northdata.fr/?query=${encodeURIComponent(company.cfo.name)}`,
    });

    addEdge({
      id: `edge-${company.id}-${cfoId}`,
      source: company.id,
      target: cfoId,
      label: company.cfo.role || 'Directeur Financier / CFO',
      type: 'finance_mandate',
    });
  }

  // 6. Add North Data / Registry Hub node if only 1 node exists
  if (nodes.length === 1) {
    const ndNodeId = `sister-nd-${company.id}`;
    addNode({
      id: ndNodeId,
      label: `Graphe North Data (${company.name})`,
      type: 'sister_company',
      country: company.country,
      flag: homeFlag,
      legalForm: 'Registre Européen North Data',
      city: company.city,
      activity: `Consulter la chaîne de détention et l'historique complet sur North Data (${company.registrationNumber})`,
      roleHeld: 'North Data Europe',
      northDataUrl: buildNorthDataUrl(company),
    });
    addEdge({
      id: `edge-${company.id}-${ndNodeId}`,
      source: company.id,
      target: ndNodeId,
      label: 'North Data',
      type: 'cross_mandate',
    });
  }

  return {
    nodes,
    edges,
    centerId: company.id,
    northDataUrl: buildNorthDataUrl(company),
  };
}

module.exports = { buildCompanyNetwork };
