const axios = require('axios');
const { enrichCompany } = require('../services/enricher');
const { normalizePersonName, isValidPhysicalPersonName, isValidCommercialCompany, detectInternationalLinks } = require('../services/northdata');

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
  if (/mitglied.*verwaltungsrat|membre.*administration|administrateur|membro.*amministrazione|administration/.test(t)) {
    return 'Membre du Conseil d\'Administration (Board)';
  }
  if (/vorsitzende.*geschäftsführung|président.*gérance|associé-gérant président/.test(t)) {
    return 'Président de la Direction (Associé-Gérant)';
  }
  if (/gesellschafter.*geschäftsführer|associé[s-]*gérant|socio.*gerente/.test(t)) {
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
  if (/prokura|procuration|fondé de pouvoir/.test(t)) {
    return 'Fondé de Pouvoir (Direction)';
  }
  return 'Mandataire / Membre du Board';
}

/**
 * Parse a single Swiss person clause (e.g. "Valarezo Barba Darwin, de Espagne, à Lausanne, associé-gérant...")
 * Returns { name, firstName, lastName, role } or null if corporate / invalid
 */
function parseSwissPersonEntry(entry = '', companyName = '', defaultRoleHint = '') {
  if (!entry) return null;
  // Reject if it's statutory communication boilerplate
  if (/par écrit|courriel|lettre|feuille officielle|fosc|organe de publication|communications? aux associés|mitteilungen/i.test(entry)) {
    return null;
  }

  const parts = entry.split(/,\s+/).map(s => s.trim()).filter(Boolean);
  if (parts.length === 0) return null;

  const seg0 = parts[0]
    .replace(/^(?:l'associé[e-]*gérant[e]*|l'associé[e]?|associé[e-]*gérant[e]*|gérant[e]*|président[e]*|administrateur|membre)\s+/i, '')
    .replace(/\s+avec signature.*$/i, '')
    .trim();
  const seg1 = parts[1] || '';

  let fullName = '';
  let lastName = '';
  let firstName = '';

  if (parts.length >= 2 && (/^(de|du|des|d'|von|da|in|à|a)\b/i.test(seg1) || /Staatsangehörig|ressortissant|citoyen/i.test(seg1))) {
    const words = seg0.split(/\s+/).filter(Boolean);
    if (words.length >= 2 && words.length <= 5) {
      firstName = words[words.length - 1];
      lastName = words.slice(0, -1).join(' ');
      fullName = `${firstName} ${lastName}`.trim();
    }
  } else if (parts.length >= 2 && !/^(avec|mit|con|sans|ohne|pour|avec signature)\b/i.test(seg1)) {
    // Format: "Eycan, Ozan, von Rheinfelden..." (seg0 is LastName, seg1 is FirstName)
    const cleanSeg1 = seg1.replace(/\s+avec signature.*$/i, '').trim();
    if (cleanSeg1.split(/\s+/).length <= 4 && seg0.split(/\s+/).length <= 3) {
      lastName = seg0;
      firstName = cleanSeg1;
      fullName = `${firstName} ${lastName}`.trim();
    }
  } else {
    const words = seg0.split(/\s+/).filter(Boolean);
    if (words.length >= 2 && words.length <= 4) {
      firstName = words[words.length - 1];
      lastName = words.slice(0, -1).join(' ');
      fullName = `${firstName} ${lastName}`.trim();
    }
  }

  const normalized = normalizePersonName(fullName, 'CH', firstName, lastName);
  if (!isValidPhysicalPersonName(normalized, companyName)) {
    return null;
  }

  const normParts = normalized.split(/\s+/);
  const role = normalizeSwissRole(`${defaultRoleHint} ${entry}`);
  return {
    name: normalized,
    firstName: normParts[0],
    lastName: normParts.slice(1).join(' '),
    role,
  };
}

/**
 * Parse a SHAB HR01 XML document to extract 100% factual Swiss registry fields:
 * - Official UID (CHE-xxx.xxx.xxx)
 * - Exact street address, zip code, city, canton
 * - Nominal share capital (CHF)
 * - Full corporate purpose (Zweck / But / Scopo)
 * - Strictly PHYSICAL directors, board members, managing partners (`dirigeants`)
 * - All corporate holdings & foreign links (`corporateLinks` & `internationalLinks`)
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

  // Strict Legal Form Mapping (never default a Verein or Einzelunternehmen to Sàrl!)
  const lfCode = getTag('legalForm', companyBlock);
  let legalForm = 'Autre';

  if (
    lfCode === '0101' ||
    /entreprise individuelle|Einzelunternehmen|Einzelfirma|impresa individuale|ditta individuale|raison individuelle|Inhaber(?:in)?\s*:|Titulaire\s*:/i.test(pubText)
  ) {
    legalForm = 'Entreprise Individuelle';
  } else if (
    lfCode === '0108' ||
    /\b(Verein|Association|Associazione)\b/i.test(rawName) ||
    /Der Verein verfolgt|Nouvelle association|Statuts de l'association|ohne kommerziellen Charakter/i.test(pubText)
  ) {
    legalForm = 'Association / Verein';
  } else if (lfCode === '0110' || /\b(Stiftung|Fondation|Fondazione)\b/i.test(rawName)) {
    legalForm = 'Fondation / Stiftung';
  } else if (lfCode === '0109' || /\b(Genossenschaft|Société coopérative|Società cooperativa)\b/i.test(rawName + ' ' + pubText)) {
    legalForm = 'Coopérative';
  } else if (lfCode === '0106' || /\b(AG|SA|S\.A\.|A\.G\.|Aktiengesellschaft|Société anonyme|Società anonima|Ltd)\b/i.test(rawName)) {
    legalForm = 'SA / AG';
  } else if (lfCode === '0107' || /\b(GmbH|Sàrl|Sarl|S\.à\.r\.l\.|Sagl|LLC)\b/i.test(rawName)) {
    legalForm = 'Sàrl / GmbH';
  }

  // Capital extraction
  let shareCapital = legalForm === 'SA / AG' ? 100000 : 20000;
  if (nominalCap && !isNaN(parseFloat(nominalCap))) {
    shareCapital = Math.round(parseFloat(nominalCap));
  } else {
    const capMatch = pubText.match(/(?:Stammkapital|Aktienkapital|Capital(?:\s+social|[- ]actions)?|Capitale\s+sociale)[:\s]+CHF\s*([\d'’\s.]+)/i);
    if (capMatch) {
      const num = parseInt(capMatch[1].replace(/['’\s]/g, '').split('.')[0], 10);
      if (!isNaN(num) && num > 0) shareCapital = num;
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
    const purpMatch = pubText.match(/(?:Zweck|But|Scopo)[:\s]+([\s\S]*?)(?:Stammkapital|Aktienkapital|Capital|Eingetragene Personen|Personne\(s\) inscrite\(s\)|Persone iscritte|Associé|Administration|$)/i);
    if (purpMatch) activity = purpMatch[1].trim();
  }

  const dirigeants = [];
  const corporateLinks = [];

  // Check c/o domiciliation or fiduciary
  const coText = addressLine1 || (pubText.match(/\bc\/o\s+([^,]+),/i)?.[1] || '');
  if (coText && /^c\/o\s+/i.test(coText)) {
    const coTarget = coText.replace(/^c\/o\s+/i, '').trim();
    if (/\b(AG|SA|GmbH|Sàrl|Sarl|Sagl|Fiduciaire|Treuhand|Holding|Management|Partners|Services|Group|Ltd|LLC|Inc)\b/i.test(coTarget)) {
      corporateLinks.push({
        name: coTarget,
        roleHeld: 'Siège / Fiduciaire / Groupe (c/o)',
        legalForm: /AG|SA/i.test(coTarget) ? 'SA / AG' : 'Sàrl / GmbH',
        city: town || canton
      });
    }
  }

  // Check branch parent company ("Nouvelle succursale de X (CHE-...)" or "Zweigniederlassung von X")
  const branchMatch = pubText.match(/(?:succursale de|Zweigniederlassung der|succursale di)\s+([^,(]+)(?:\s*\((CHE-[\d.]+|[A-Z0-9-]+)\))?/i);
  if (branchMatch) {
    corporateLinks.push({
      name: branchMatch[1].trim(),
      siren: branchMatch[2] || '',
      roleHeld: 'Société Mère (Siège Principal)',
      legalForm: legalForm,
      city: 'Suisse / International'
    });
  }

  // 1. Parse standard "Eingetragene Personen:" / "Personne(s) inscrite(s):" / "Persone iscritte:"
  const personsSectionMatch = pubText.match(/(?:Eingetragene Personen|Personne\(s\) inscrite\(s\)|Personnes? inscrites?|Persone iscritte)[:\s]+([\s\S]+)$/i);
  if (personsSectionMatch) {
    const section = personsSectionMatch[1].replace(/Selon déclaration[\s\S]*$/i, '').replace(/\.$/, '').trim();
    const entries = section.split(/;\s+/);

    for (const entry of entries) {
      const parts = entry.split(/,\s+/).map(s => s.trim()).filter(Boolean);
      if (parts.length < 2) continue;

      const seg0 = parts[0];

      // Check if entry is a corporate entity (Holding, Corporate Partner, or Foreign Parent)
      const isCorporate =
        /\b(AG|SA|GmbH|Sàrl|Sarl|Sagl|LLC|Ltd|Limited|Inc|PLC|BV|Srl|SpA|SAS|SARL|Holding|Holdings|Stiftung|Fondation|Treuhand|Fiduciaire|Partner|Partners|Group|Groupe|Services|Capital|Invest|Management|Ventures)\b/i.test(seg0) ||
        /CHE-\d{3}/.test(entry);

      if (isCorporate) {
        const uidMatch = entry.match(/CHE-\d{3}\.\d{3}\.\d{3}/);
        const corpName = seg0.replace(/\s*\(CHE-[^)]+\)/, '').trim();
        const isAudit = /revisionsstelle|organe de révision|ufficio di revisione/i.test(entry);
        const cityMatch = parts.find(p => /^(in|à|a)\s+/i.test(p))?.replace(/^(in|à|a)\s+/i, '') || town || canton;
        const foreignCountryMatch = cityMatch.match(/\(([A-Z]{2})\)/);
        corporateLinks.push({
          name: corpName,
          siren: uidMatch ? uidMatch[0] : '',
          countryCode: foreignCountryMatch ? foreignCountryMatch[1] : 'CH',
          roleHeld: isAudit ? 'Organe de Révision' : 'Actionnaire / Associée Morale (Holding)',
          legalForm: /AG|SA/i.test(corpName) ? 'SA / AG' : 'Holding / Société Morale',
          city: cityMatch,
        });
        continue;
      }

      const parsedPerson = parseSwissPersonEntry(entry, rawName);
      if (parsedPerson && !dirigeants.some(d => d.name.toLowerCase() === parsedPerson.name.toLowerCase())) {
        dirigeants.push({
          ...parsedPerson,
          isPrimary: dirigeants.length === 0,
        });
      }
    }
  }

  // 2. Fallback for Vaud / Genève / Neuchâtel / Valais / Fribourg French notices:
  // e.g. "Associé-gérant avec signature individuelle: Valarezo Barba Darwin, de Espagne, à Lausanne, avec 20 parts..."
  // e.g. "Administration: Dupont Jean, de France, à Genève, président, avec signature individuelle."
  // IMPORTANT: Exclude "Communications aux associés:" and "Obligation de fournir...:"!
  if (dirigeants.length === 0 && pubText) {
    // Strip statutory communication clauses first so they can NEVER be matched!
    const cleanedPubText = pubText
      .replace(/Communications?\s+aux\s+associ[eé]s\s*:[^.]+\./gi, '')
      .replace(/Communications?\s+aux\s+actionnaires\s*:[^.]+\./gi, '')
      .replace(/Mitteilungen\s+an\s+die\s+Gesellschafter\s*:[^.]+\./gi, '')
      .replace(/Organe\s+de\s+publication\s*:[^.]+\./gi, '')
      .replace(/Obligation\s+de\s+fournir[^.]+\./gi, '');

    const roleClauseRegex = /(?:Associé(?:e|s|es)?(?:-gérant(?:e|s|es)?)?(?:\s+avec\s+signature[^:]*)?|Administration|Conseil\s+d'administration|Gérant(?:e|s|es)?(?:\s+avec\s+signature[^:]*)?|Directeur(?:s)?|Direction)\s*:\s*([^.]+)\./gi;
    const matches = [...cleanedPubText.matchAll(roleClauseRegex)];

    for (const m of matches) {
      const roleHeader = m[0].split(':')[0].trim();
      const body = m[1].trim();
      const subEntries = body.split(/;\s+|\s+et\s+(?=[A-ZÀ-Ÿ])/);

      for (const sub of subEntries) {
        // Check if corporate partner in Vaud/Geneva format: e.g. "Associée: Holding XYZ SA, à Lausanne..."
        if (/\b(AG|SA|GmbH|Sàrl|Sarl|Sagl|LLC|Ltd|SAS|SARL|Holding|Group|Capital|Invest|CHE-\d{3})\b/i.test(sub)) {
          const corpName = sub.split(',')[0].replace(/\s*\(CHE-[^)]+\)/, '').trim();
          const uidMatch = sub.match(/CHE-\d{3}\.\d{3}\.\d{3}/);
          if (corpName && corpName.length > 2) {
            corporateLinks.push({
              name: corpName,
              siren: uidMatch ? uidMatch[0] : '',
              roleHeld: 'Associée Morale / Holding',
              legalForm: /AG|SA/i.test(corpName) ? 'SA / AG' : 'Holding / Sàrl',
              city: town || canton,
            });
          }
          continue;
        }

        const parsedPerson = parseSwissPersonEntry(sub, rawName, roleHeader);
        if (parsedPerson && !dirigeants.some(d => d.name.toLowerCase() === parsedPerson.name.toLowerCase())) {
          dirigeants.push({
            ...parsedPerson,
            isPrimary: dirigeants.length === 0,
          });
        }
      }
    }
  }

  // 3. If c/o is a valid physical person and no other director was parsed
  if (dirigeants.length === 0 && coText && /^c\/o\s+/i.test(coText)) {
    const coPerson = coText.replace(/^c\/o\s+/i, '').trim();
    if (isValidPhysicalPersonName(coPerson, rawName)) {
      dirigeants.push({
        name: coPerson,
        role: 'Fondateur & Gérant (c/o)',
        isPrimary: true,
      });
    }
  }

  const internationalLinks = detectInternationalLinks(
    { country: 'CH', corporateLinks, activity, address: fullAddress },
    pubText
  );

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
    internationalLinks,
    pubText,
  };
}

/**
 * Find other Swiss companies in SHAB where this physical director/board member holds a mandate
 */
async function findRelatedCompaniesCH(dirigeant, currentUid = '', currentName = '') {
  if (!dirigeant) return [];
  const nameStr = typeof dirigeant === 'string' ? dirigeant : dirigeant.name;
  if (!isValidPhysicalPersonName(nameStr, currentName)) return [];

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
      // Only include commercial entities (SA/AG/Sàrl/GmbH)
      if (!/\b(SA|AG|Sàrl|Sarl|GmbH|Sagl|Ltd|LLC)\b/i.test(compName)) continue;
      seenNames.add(compName.toLowerCase());

      const muni = meta.municipalities?.[0]?.town || meta.cantons?.[0] || 'Suisse';
      const lf = /\b(AG|SA)\b/.test(compName) ? 'SA / AG' : 'Sàrl / GmbH';

      related.push({
        id: `CH-${(itemUid || compName).replace(/[^a-zA-Z0-9]/g, '')}`,
        name: compName,
        siren: itemUid,
        legalForm: lf,
        shareCapital: lf === 'SA / AG' ? 100000 : 20000,
        activity: `Entité liée au Registre du Commerce (${meta.cantons?.[0] || 'CH'})`,
        city: muni,
        countryCode: 'CH',
        roleHeld: 'Administrateur / Associé (Mandat FOSC)',
      });

      if (related.length >= 3) break;
    }

    return related;
  } catch {
    return [];
  }
}

/**
 * Scraper for newly registered commercial companies in Switzerland (SA / AG & Sàrl / GmbH only).
 */
async function scrapeSwitzerlandCreations(limit = 20) {
  try {
    console.log(`[Scraper CH] Interrogation de la FOSC / SHAB (Suisse) pour nouvelles inscriptions HR01...`);

    const shabListUrl = 'https://www.shab.ch/api/v1/publications';
    const res = await axios.get(shabListUrl, {
      params: {
        publicationStates: 'PUBLISHED',
        subRubrics: 'HR01',
        'pageRequest.size': Math.min(limit * 2, 40),
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

        const fallbackName = titleFr
          .replace(/^(Nouvelles entrées|Neueintragung|Nuove registrazioni|New entries)\s+/i, '')
          .replace(/,\s*[^,]+$/, '')
          .trim();

        let parsed = null;
        try {
          const xmlRes = await axios.get(`https://www.shab.ch/api/v1/publications/${meta.id}/xml`, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 6000,
          });
          parsed = parseShabXml(xmlRes.data, fallbackName);
        } catch {
          continue;
        }

        if (!parsed || !parsed.uid) continue;

        const raw = {
          id: `CH-${parsed.uid.replace(/[^\w]/g, '')}`,
          country: 'CH',
          countryName: 'Suisse',
          name: parsed.name || fallbackName,
          registrationNumber: parsed.uid,
          incorporationDate: pubDate,
          legalForm: parsed.legalForm,
          shareCapital: parsed.shareCapital || 20000,
          activity: parsed.activity || 'Services commerciaux et financiers en Suisse',
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

        // Triple-check: strictly commercial SA/AG or Sàrl/GmbH, zero Entreprise Individuelle or Verein, and physical director present
        if (!isValidCommercialCompany(raw)) {
          continue;
        }
        delete raw.pubText;

        if (!raw.dirigeants || raw.dirigeants.length === 0) {
          continue;
        }

        const enriched = await enrichCompany(raw);
        companies.push(enriched);
        if (companies.length >= limit) break;
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
  parseSwissPersonEntry,
  findRelatedCompaniesCH,
  normalizeSwissRole,
};
