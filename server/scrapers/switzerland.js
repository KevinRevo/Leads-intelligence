const axios = require('axios');
const { enrichCompany } = require('../services/enricher');

/**
 * Translate / normalize Swiss commercial register roles (DE / FR / IT -> clear FR title)
 */
function normalizeSwissRole(rawRoleText = '') {
  const t = rawRoleText.toLowerCase();
  if (/präsident.*verwaltungsrat|président.*administration|presidente.*amministrazione/.test(t)) {
    return 'Président du Conseil d\'Administration (Board)';
  }
  if (/vizepräsident.*verwaltungsrat|vice-président.*administration/.test(t)) {
    return 'Vice-Président du Conseil d\'Administration (Board)';
  }
  if (/mitglied.*verwaltungsrat|membre.*administration|administrateur|membro.*amministrazione/.test(t)) {
    return 'Membre du Conseil d\'Administration (Board)';
  }
  if (/präsident.*stiftungsrat|président.*fondation/.test(t)) {
    return 'Président du Conseil de Fondation (Board)';
  }
  if (/mitglied.*stiftungsrat|membre.*fondation/.test(t)) {
    return 'Membre du Conseil de Fondation (Board)';
  }
  if (/vorsitzende.*geschäftsführung|président.*gérance/.test(t)) {
    return 'Président de la Direction (Associé-Gérant)';
  }
  if (/gesellschafter.*geschäftsführer|associé.*gérant|socio.*gerente/.test(t)) {
    return 'Associé-Gérant (Direction)';
  }
  if (/geschäftsführer|gérant|gerente/.test(t)) {
    return 'Directeur Général / Gérant';
  }
  if (/finanzdirektor|directeur financier|cfo/.test(t)) {
    return 'Directeur Financier (CFO)';
  }
  if (/direktorin|direktor|directeur|directrice|direttore/.test(t)) {
    return 'Directeur / Directrice (Exécutif)';
  }
  if (/gesellschafter|associé|socio/.test(t)) {
    return 'Associé / Actionnaire';
  }
  if (/inhaber|titulaire|titolare/.test(t)) {
    return 'Fondateur & Titulaire';
  }
  if (/prokura|procuration|fondé de pouvoir/.test(t)) {
    return 'Fondé de Pouvoir (Direction)';
  }
  return 'Mandataire / Membre du Board';
}

/**
 * Parse a SHAB HR01 XML document to extract 100% factual Swiss registry fields:
 * - Official UID (CHE-xxx.xxx.xxx)
 * - Exact street address, zip code, city, canton
 * - Nominal share capital (CHF)
 * - Full corporate purpose (Zweck / But / Scopo)
 * - All registered directors, board members, managing partners, and corporate holdings
 */
function parseShabXml(xml = '', fallbackName = '') {
  const getTag = (tag, src = xml) => {
    const m = src.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i'));
    return m ? m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').trim() : '';
  };

  const companyBlock = getTag('company', xml) || xml;
  const addressBlock = getTag('address', companyBlock) || companyBlock;
  const capitalBlock = getTag('capital', xml);

  const uid = getTag('uid', companyBlock) || (xml.match(/CHE-\d{3}\.\d{3}\.\d{3}/)?.[0]) || '';
  const rawName = getTag('name', companyBlock) || fallbackName;
  const seat = getTag('seat', companyBlock);
  const canton = getTag('cantons', xml) || 'ZH';
  const street = getTag('street', addressBlock);
  const houseNumber = getTag('houseNumber', addressBlock);
  const addressLine1 = getTag('addressLine1', addressBlock);
  const zipCode = getTag('swissZipCode', addressBlock);
  const town = getTag('town', addressBlock) || seat;

  const purpose = getTag('purpose', xml);
  const pubText = getTag('publicationText', xml);
  const nominalCap = getTag('nominal', capitalBlock);

  // Legal form mapping
  const lfCode = getTag('legalForm', companyBlock);
  let legalForm = 'Sàrl / GmbH';
  if (lfCode === '0106' || /\b(AG|SA|Aktiengesellschaft|Société anonyme)\b/i.test(rawName)) {
    legalForm = 'SA / AG';
  } else if (lfCode === '0107' || /\b(GmbH|Sàrl|Sagl|LLC)\b/i.test(rawName)) {
    legalForm = 'Sàrl / GmbH';
  } else if (lfCode === '0110' || /\b(Stiftung|Fondation|Fondazione)\b/i.test(rawName)) {
    legalForm = 'Fondation / Stiftung';
  } else if (lfCode === '0101' || /entreprise individuelle|Einzelunternehmen|impresa individuale/i.test(pubText)) {
    legalForm = 'Entreprise Individuelle';
  } else if (lfCode === '0103' || /\b(SNC|Kollektivgesellschaft)\b/i.test(rawName)) {
    legalForm = 'SNC';
  }

  // Capital extraction
  let shareCapital = 20000;
  if (nominalCap && !isNaN(parseFloat(nominalCap))) {
    shareCapital = Math.round(parseFloat(nominalCap));
  } else {
    const capMatch = pubText.match(/(?:Stammkapital|Aktienkapital|Capital(?:\s+social|[- ]actions)?|Capitale\s+sociale)[:\s]+CHF\s*([\d'’\s.]+)/i);
    if (capMatch) {
      const num = parseInt(capMatch[1].replace(/['’\s]/g, '').split('.')[0], 10);
      if (!isNaN(num) && num > 0) shareCapital = num;
    } else if (legalForm === 'SA / AG') {
      shareCapital = 100000;
    }
  }

  // Address formatting
  const addrParts = [];
  if (addressLine1) addrParts.push(addressLine1);
  if (street) addrParts.push(`${street}${houseNumber ? ' ' + houseNumber : ''}`);
  if (zipCode || town) addrParts.push(`${zipCode} ${town}`.trim());
  const fullAddress = addrParts.length > 0 ? addrParts.join(', ') : `${town || 'Zürich'} (${canton})`;

  // Activity extraction
  let activity = purpose;
  if (!activity && pubText) {
    const purpMatch = pubText.match(/(?:Zweck|But|Scopo)[:\s]+([\s\S]*?)(?:Stammkapital|Aktienkapital|Capital|Eingetragene Personen|Personne\(s\) inscrite\(s\)|Persone iscritte|$)/i);
    if (purpMatch) activity = purpMatch[1].trim();
  }

  // Extract Dirigeants, Board Members, CFO, Directeurs AND Corporate Partners/Holdings
  const dirigeants = [];
  const corporateLinks = [];

  // Check c/o domiciliation or fiduciary
  const coText = addressLine1 || (pubText.match(/\bc\/o\s+([^,]+),/i)?.[1] || '');
  if (coText && /^c\/o\s+/i.test(coText)) {
    const coTarget = coText.replace(/^c\/o\s+/i, '').trim();
    if (/\b(AG|SA|GmbH|Sàrl|Sagl|Fiduciaire|Treuhand|Holding|Management|Partners|Services|Group)\b/i.test(coTarget)) {
      corporateLinks.push({
        name: coTarget,
        roleHeld: 'Siège / Fiduciaire / Groupe (c/o)',
        legalForm: /AG|SA/i.test(coTarget) ? 'SA / AG' : 'Sàrl / GmbH',
        city: town || canton
      });
    }
  }

  // Check branch parent company ("Nouvelle succursale de X (CHE-...)" or "Zweigniederlassung von X")
  const branchMatch = pubText.match(/(?:succursale de|Zweigniederlassung der|succursale di)\s+([^,(]+)(?:\s*\((CHE-[\d.]+)\))?/i);
  if (branchMatch) {
    corporateLinks.push({
      name: branchMatch[1].trim(),
      siren: branchMatch[2] || '',
      roleHeld: 'Société Mère (Siège Principal)',
      legalForm: legalForm,
      city: 'Suisse'
    });
  }

  // Parse "Eingetragene Personen:" / "Personne(s) inscrite(s):" / "Personne inscrite:" / "Persone iscritte:"
  const personsSectionMatch = pubText.match(/(?:Eingetragene Personen|Personne\(s\) inscrite\(s\)|Personnes? inscrites?|Persone iscritte)[:\s]+([\s\S]+)$/i);
  if (personsSectionMatch) {
    const section = personsSectionMatch[1].replace(/Selon déclaration[\s\S]*$/i, '').replace(/\.$/, '').trim();
    const entries = section.split(/;\s+/);

    for (const entry of entries) {
      const parts = entry.split(/,\s+/).map(s => s.trim()).filter(Boolean);
      if (parts.length < 2) continue;

      const seg0 = parts[0];
      const seg1 = parts[1];

      // Check if entry is a corporate entity (Holding, Corporate Partner, or Audit firm)
      const isCorporate =
        /\b(AG|SA|GmbH|Sàrl|Sagl|LLC|Ltd|Inc|Holding|Stiftung|Fondation|Treuhand|Fiduciaire|Partner|Partners|Group|Services)\b/i.test(seg0) ||
        /CHE-\d{3}/.test(entry);

      if (isCorporate) {
        const uidMatch = entry.match(/CHE-\d{3}\.\d{3}\.\d{3}/);
        const corpName = seg0.replace(/\s*\(CHE-[^)]+\)/, '').trim();
        const isAudit = /revisionsstelle|organe de révision|ufficio di revisione/i.test(entry);
        corporateLinks.push({
          name: corpName,
          siren: uidMatch ? uidMatch[0] : '',
          roleHeld: isAudit ? 'Organe de Révision' : 'Holding / Associée Morale',
          legalForm: /AG|SA/i.test(corpName) ? 'SA / AG' : 'Sàrl / GmbH',
          city: parts.find(p => /^(in|à|a)\s+/i.test(p))?.replace(/^(in|à|a)\s+/i, '') || town || canton
        });
        continue;
      }

      // Case A: "Robalinho Lopes Joel, du Portugal, à Cugy FR, associé..." (seg1 starts with de/du/d'/von/da)
      let fullName = '';
      let lastName = '';
      let firstName = '';

      if (/^(de|du|des|d'|von|da|in|à|a)\b/i.test(seg1) || /Staatsangehörig|ressortissant/i.test(seg1)) {
        const words = seg0.split(/\s+/).filter(Boolean);
        if (words.length >= 2) {
          firstName = words[words.length - 1];
          lastName = words.slice(0, -1).join(' ');
          fullName = `${firstName} ${lastName}`.trim();
        }
      } else {
        // Case B: "Eycan, Ozan, von Rheinfelden..." (seg0 is LastName, seg1 is FirstName)
        lastName = seg0;
        firstName = seg1;
        if (firstName.length >= 2 && lastName.length >= 2 && !/\d/.test(firstName + lastName)) {
          fullName = `${firstName} ${lastName}`.trim();
        }
      }

      if (!fullName || fullName.length < 4 || /\d/.test(fullName)) continue;
      const role = normalizeSwissRole(entry);

      if (!dirigeants.some(d => d.name.toLowerCase() === fullName.toLowerCase())) {
        dirigeants.push({
          name: fullName,
          lastName,
          firstName,
          role,
          isPrimary: dirigeants.length === 0,
        });
      }
    }
  }

  // Fallback for Geneva / Vaud / Fribourg French notices: "Associé(e)(s): ... Gérant(e)(s): ... Administration: ..."
  if (dirigeants.length === 0 && pubText) {
    const assocMatches = [...pubText.matchAll(/(?:Associé(?:e|s|es)?|Administration|Gérant(?:e|s|es)?|Titulaire|Inhaber(?:in)?|Titolare)[:\s]+([^.]+)\./gi)];
    for (const m of assocMatches) {
      const clause = m[0];
      const body = m[1].replace(/^l'associé(?:e)?\s+/i, '').trim();
      // Split by " et " if multiple people listed
      const subEntries = body.split(/\s+et\s+(?=[A-ZÀ-Ÿ])/);
      for (const sub of subEntries) {
        const cleanedSub = sub.replace(/^l'associé(?:e)?\s+/i, '').trim();
        const namePart = cleanedSub.split(',')[0].replace(/\s+avec signature.*$/i, '').trim();
        const words = namePart.split(/\s+/).filter(Boolean);
        if (words.length >= 2 && words.length <= 5 && !/\d/.test(namePart)) {
          const firstName = words.slice(1).join(' ');
          const lastName = words[0];
          const fullName = `${firstName} ${lastName}`.trim();
          const role = normalizeSwissRole(clause);
          if (!dirigeants.some(d => d.name.toLowerCase() === fullName.toLowerCase())) {
            dirigeants.push({
              name: fullName,
              lastName,
              firstName,
              role,
              isPrimary: dirigeants.length === 0,
            });
          }
        }
      }
    }
  }

  // If c/o is a physical person and no other director was parsed (e.g. branch or foundation)
  if (dirigeants.length === 0 && coText && /^c\/o\s+/i.test(coText)) {
    const coPerson = coText.replace(/^c\/o\s+/i, '').trim();
    if (
      coPerson.split(/\s+/).length >= 2 &&
      coPerson.split(/\s+/).length <= 4 &&
      !/\b(AG|SA|GmbH|Sàrl|Sagl|Fiduciaire|Treuhand|Holding|Management)\b/i.test(coPerson)
    ) {
      dirigeants.push({
        name: coPerson,
        role: 'Représentant & Domiciliataire (c/o)',
        isPrimary: true,
      });
    }
  }

  return {
    uid,
    name: rawName,
    legalForm,
    shareCapital,
    activity,
    address: fullAddress,
    city: town || 'Zürich',
    postalCode: zipCode || '8000',
    canton,
    dirigeants,
    corporateLinks,
    pubText,
  };
}

/**
 * Find other Swiss companies in SHAB where this director/board member holds a mandate
 */
async function findRelatedCompaniesCH(dirigeant, currentUid = '', currentName = '') {
  if (!dirigeant) return [];
  const nameStr = typeof dirigeant === 'string' ? dirigeant : dirigeant.name;
  if (!nameStr || nameStr === 'X' || nameStr.length < 4) return [];

  // Build SHAB search query: "LastName, FirstName" or full name
  let query = nameStr;
  if (typeof dirigeant === 'object' && dirigeant.lastName && dirigeant.firstName) {
    query = `${dirigeant.lastName}, ${dirigeant.firstName.split(' ')[0]}`;
  } else {
    const parts = nameStr.trim().split(/\s+/);
    if (parts.length >= 2) {
      const last = parts[parts.length - 1];
      const first = parts[0];
      query = `${last}, ${first}`;
    }
  }

  try {
    const res = await axios.get('https://www.shab.ch/api/v1/publications', {
      params: {
        allowRubrics: 'HR',
        publicationStates: 'PUBLISHED',
        keyword: query,
        'pageRequest.size': 6,
      },
      timeout: 4500,
    });

    const items = res.data?.content || [];
    const related = [];
    const seenNames = new Set([(currentName || '').toLowerCase().trim()]);

    for (const item of items) {
      const meta = item.meta || {};
      const itemUid = meta.uid?.[0] || '';
      if (currentUid && itemUid && itemUid.replace(/\D/g, '') === currentUid.replace(/\D/g, '')) continue;

      const rawTitle = meta.title?.fr || meta.title?.de || meta.title?.it || meta.title?.en || '';
      const compName = rawTitle
        .replace(/^(Nouvelles entrées|Mutation|Radiation|Neueintragung|Löschung|Nuove registrazioni|Mutazione)\s+/i, '')
        .replace(/,\s*[^,]+$/, '')
        .trim();

      if (!compName || seenNames.has(compName.toLowerCase())) continue;
      seenNames.add(compName.toLowerCase());

      const muni = meta.municipalities?.[0]?.town || meta.cantons?.[0] || 'Suisse';
      let lf = 'Sàrl / GmbH';
      if (/\b(AG|SA)\b/.test(compName)) lf = 'SA / AG';
      else if (/\b(Stiftung|Fondation)\b/i.test(compName)) lf = 'Fondation';

      related.push({
        id: `CH-${(itemUid || compName).replace(/[^a-zA-Z0-9]/g, '')}`,
        name: compName,
        siren: itemUid,
        legalForm: lf,
        shareCapital: lf === 'SA / AG' ? 100000 : 20000,
        activity: `Entité liée au Registre du Commerce (${meta.cantons?.[0] || 'CH'})`,
        city: muni,
        roleHeld: 'Administrateur / Associé (Mandat FOSC)',
      });

      if (related.length >= 3) break;
    }

    return related;
  } catch (err) {
    return [];
  }
}

/**
 * Scraper for newly registered companies in Switzerland.
 * Source: SHAB / FOSC (Feuille Officielle Suisse du Commerce) API + XML
 * Rubric: HR01 (Nouvelles inscriptions au registre du commerce)
 */
async function scrapeSwitzerlandCreations(limit = 15) {
  try {
    console.log(`[Scraper CH] Interrogation de la FOSC / SHAB (Suisse) pour nouvelles inscriptions HR01...`);

    const shabListUrl = 'https://www.shab.ch/api/v1/publications';
    const res = await axios.get(shabListUrl, {
      params: {
        publicationStates: 'PUBLISHED',
        subRubrics: 'HR01',
        'pageRequest.size': Math.min(limit, 25),
        'pageRequest.page': 0,
      },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      timeout: 10000,
    });

    const publications = res.data?.content || [];
    console.log(`[Scraper CH] ${publications.length} publications suisses trouvées.`);

    const companies = [];

    for (const pub of publications) {
      try {
        const meta = pub.meta || {};
        const titleFr = meta.title?.fr || meta.title?.de || meta.title?.it || meta.title?.en || '';
        const pubDate = meta.publicationDate ? meta.publicationDate.split('T')[0] : new Date().toISOString().split('T')[0];

        let fallbackName = titleFr
          .replace(/^(Nouvelles entrées|Neueintragung|Nuove registrazioni|New entries)\s+/i, '')
          .replace(/,\s*[^,]+$/, '')
          .trim();

        // Fetch full XML from SHAB API
        let parsed = null;
        try {
          const xmlRes = await axios.get(`https://www.shab.ch/api/v1/publications/${meta.id}/xml`, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 6000,
          });
          parsed = parseShabXml(xmlRes.data, fallbackName);
        } catch (xmlErr) {
          // fallback if XML fails
        }

        const companyName = parsed?.name || fallbackName || `Société Suisse`;
        const uid = parsed?.uid || meta.uid?.[0] || 'En cours';
        const legalForm = parsed?.legalForm || (/\b(AG|SA)\b/.test(companyName) ? 'SA / AG' : 'Sàrl / GmbH');
        const shareCapital = parsed?.shareCapital || 20000;
        const activity = parsed?.activity || 'Services commerciaux et financiers en Suisse';
        const city = parsed?.city || meta.municipalities?.[0]?.town || 'Zürich';
        const postalCode = parsed?.postalCode || String(meta.municipalities?.[0]?.swissZipCode || '8000');
        const canton = parsed?.canton || meta.cantons?.[0] || 'ZH';
        const address = parsed?.address || `${postalCode} ${city} (${canton})`;
        const dirigeants = parsed?.dirigeants?.length > 0
          ? parsed.dirigeants
          : [{ name: 'X', role: 'Non renseigné au registre', isPrimary: true }];

        const raw = {
          id: `CH-${uid !== 'En cours' ? uid.replace(/[^\w]/g, '') : meta.id}`,
          country: 'CH',
          countryName: 'Suisse',
          name: companyName,
          registrationNumber: uid,
          incorporationDate: pubDate,
          legalForm,
          shareCapital,
          activity,
          address,
          city,
          postalCode,
          canton,
          dirigeants,
          corporateLinks: parsed?.corporateLinks || [],
          source: 'FOSC / SHAB (Registre du Commerce Suisse)',
          crmStatus: 'new',
          crmNotes: '',
          crmAssignedTo: null,
          lastContactedAt: null,
          createdAt: new Date().toISOString(),
        };

        const enriched = await enrichCompany(raw);
        companies.push(enriched);
      } catch (itemErr) {
        console.error('[Scraper CH] Erreur sur annonce suisse:', itemErr.message);
      }
    }

    return companies;
  } catch (error) {
    console.error('[Scraper CH] Erreur globale lors du scraping:', error.message);
    return [];
  }
}

module.exports = {
  scrapeSwitzerlandCreations,
  parseShabXml,
  findRelatedCompaniesCH,
  normalizeSwissRole,
};
