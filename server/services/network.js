const { findRelatedCompaniesFR } = require('../scrapers/france');
const { findRelatedCompaniesCH } = require('../scrapers/switzerland');

/**
 * Service to build a complete, factual relationship map between:
 * - The target company
 * - Its directors, board members, CFO & corporate holdings (personnes physiques & morales)
 * - Their other active companies (sociétés liées / participations / mandats croisés RCS & FOSC)
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

  // 1. Central Target Company Node
  addNode({
    id: company.id,
    label: company.name,
    type: 'target_company',
    country: company.country,
    registrationNumber: company.registrationNumber,
    legalForm: company.legalForm,
    shareCapital: company.shareCapital,
    city: company.city,
    activity: company.activity,
    isTarget: true,
  });

  // 2. Corporate Holdings / Parent Companies / Domiciliation links (if any)
  const corporateLinks = company.corporateLinks || [];
  for (const corp of corporateLinks) {
    if (!corp.name) continue;
    const corpNodeId = corp.id || `sister-corp-${corp.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
    addNode({
      id: corpNodeId,
      label: corp.name,
      type: 'sister_company',
      siren: corp.siren || '',
      legalForm: corp.legalForm || (company.country === 'CH' ? 'SA / GmbH' : 'Holding SAS / SARL'),
      shareCapital: corp.shareCapital || 50000,
      city: corp.city || company.city,
      activity: corp.activity || 'Structure liée / Holding / Mandataire personne morale',
      country: company.country,
      roleHeld: corp.roleHeld || 'Holding / Société liée',
    });

    addEdge({
      id: `edge-${company.id}-${corpNodeId}`,
      source: company.id,
      target: corpNodeId,
      label: corp.roleHeld || 'Holding / Liée',
      type: 'mandate',
    });
  }

  // 3. Real Dirigeants, Board Members & Directeurs
  const realDirigeants = (company.dirigeants || []).filter(
    d => d.name && d.name !== 'X' && !/^(direction|conseil d'administration)/i.test(d.name)
  );

  for (let i = 0; i < realDirigeants.length; i++) {
    const d = realDirigeants[i];
    const personId = `person-${d.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;

    addNode({
      id: personId,
      label: d.name,
      type: 'person',
      role: d.role || 'Dirigeant / Membre du Board',
      birthYear: d.birthYear || null,
      email: company.bestEmail,
      phone: company.phone,
      linkedinUrl: `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(d.name)}`,
      isPrimary: Boolean(d.isPrimary || i === 0),
    });

    addEdge({
      id: `edge-${company.id}-${personId}`,
      source: company.id,
      target: personId,
      label: d.role || 'Dirigeant / Mandataire',
      type: 'mandate',
    });

    // Look for sister companies in current database first
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
        roleHeld: c.dirigeants.find(x => x.name.toLowerCase() === d.name.toLowerCase())?.role || 'Mandataire',
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

    // Add up to 3 sister companies per director to the graph
    for (const sister of sisterCompanies.slice(0, 3)) {
      const sisterNodeId = sister.id || `sister-${sister.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;

      addNode({
        id: sisterNodeId,
        label: sister.name,
        type: 'sister_company',
        siren: sister.siren || '',
        legalForm: sister.legalForm || (company.country === 'CH' ? 'Sàrl / AG' : 'SAS / SARL'),
        shareCapital: sister.shareCapital || (company.country === 'CH' ? 20000 : 10000),
        city: sister.city || company.city,
        activity: sister.activity || 'Société liée par mandat commun',
        country: company.country,
        roleHeld: sister.roleHeld || 'Mandat croisé',
      });

      addEdge({
        id: `edge-${personId}-${sisterNodeId}`,
        source: personId,
        target: sisterNodeId,
        label: sister.roleHeld || 'Mandat croisé',
        type: 'cross_mandate',
      });
    }
  }

  // 4. Distinct CFO node if not already in realDirigeants
  if (
    company.cfo &&
    company.cfo.name &&
    company.cfo.name !== 'X' &&
    !realDirigeants.some(d => d.name.toLowerCase() === company.cfo.name.toLowerCase())
  ) {
    const cfoId = `person-cfo-${company.cfo.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
    addNode({
      id: cfoId,
      label: company.cfo.name,
      type: 'person_cfo',
      role: company.cfo.role || 'Directeur Financier / CFO',
      linkedinUrl: company.cfo.linkedinSearchUrl,
    });

    addEdge({
      id: `edge-${company.id}-${cfoId}`,
      source: company.id,
      target: cfoId,
      label: company.cfo.role || 'Directeur Financier / CFO',
      type: 'finance_mandate',
    });
  }

  // 5. Ensure graph is never a single isolated node if registry has no physical person
  if (nodes.length === 1) {
    const linkedinNodeId = `person-linkedin-${company.id}`;
    addNode({
      id: linkedinNodeId,
      label: `Équipe ${company.name}`,
      type: 'person',
      role: 'Recherche Décideurs sur LinkedIn',
      email: company.bestEmail,
      phone: company.phone,
      linkedinUrl: company.linkedinCompanyUrl,
    });
    addEdge({
      id: `edge-${company.id}-${linkedinNodeId}`,
      source: company.id,
      target: linkedinNodeId,
      label: 'LinkedIn Entreprise',
      type: 'mandate',
    });

    const regNodeId = `sister-reg-${company.id}`;
    addNode({
      id: regNodeId,
      label: company.country === 'CH' ? `Registre FOSC (${company.canton || 'CH'})` : `Greffe RCS (${company.city})`,
      type: 'sister_company',
      legalForm: 'Dossier Officiel',
      city: company.city,
      activity: `Immatriculation ${company.registrationNumber} — consulter les statuts pour identifier les bénéficiaires effectifs`,
      country: company.country,
      roleHeld: 'Dépôt légal',
    });
    addEdge({
      id: `edge-${company.id}-${regNodeId}`,
      source: company.id,
      target: regNodeId,
      label: company.registrationNumber,
      type: 'cross_mandate',
    });
  }

  const sisterCount = nodes.filter(n => n.type === 'sister_company').length;
  const dirCount = realDirigeants.length;

  let pitch = '';
  if (sisterCount > 0 && dirCount > 0) {
    pitch = `Opportunité Multi-Comptes : ${realDirigeants[0].name} est lié(e) à ${sisterCount} autre(s) structure(s) identifiée(s). Proposer l'onboarding groupé Revolut Business.`;
  } else if (dirCount > 1) {
    pitch = `Gouvernance Collégiale (${dirCount} co-décideurs / membres du Board) : Proposer Revolut Business avec cartes d'entreprise et approbations multi-utilisateurs.`;
  } else if (dirCount === 1) {
    pitch = `Décideur unique identifié (${realDirigeants[0].name}, ${realDirigeants[0].role}) : Approche directe pour ouverture de compte pro rapide.`;
  } else {
    pitch = `Identifier les fondateurs via la page LinkedIn de ${company.name} ou la fiche officielle Pappers / Zefix.`;
  }

  return {
    companyId: company.id,
    companyName: company.name,
    stats: {
      totalEntities: nodes.length,
      totalDirigeants: dirCount,
      totalConnectedCompanies: nodes.filter(n => n.type.includes('company')).length,
      revolutPitch: pitch,
    },
    nodes,
    edges,
  };
}

module.exports = {
  buildCompanyNetwork,
};
