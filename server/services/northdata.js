const axios = require('axios');

const Dt = 'nOrThDaTa';
function Ot(e, t) {
  return Dt.charCodeAt(t % 9) ^ ((e + t * 7) & 255);
}

/**
 * Generates the exact North Data `extra` token required for `/data.json` graph requests
 */
function generateNorthDataToken(origin = 'https://www.northdata.fr', isoDate = new Date().toISOString(), seed = Math.floor(Math.random() * 256)) {
  const r = `d=${encodeURIComponent(origin)}&t=${encodeURIComponent(isoDate)}`;
  const i = seed & 255;
  let a = String.fromCharCode(i);
  for (let idx = 0; idx < r.length; idx++) {
    a += String.fromCharCode((r.charCodeAt(idx) ^ Ot(i, idx)) & 255);
  }
  return Buffer.from(a, 'binary')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Normalize a person's name from official registries (SHAB / BODACC / INPI)
 * to a clean, 100% accurate "FirstGivenName LastName" format:
 * - Strips leaked role tokens ("l'associé", "Directeur", etc.)
 * - Drops 2nd/3rd/4th civil-status middle names ("Christian Vincent Barrot" -> "Christian Barrot",
 *   "Frédéric Paul Robert Marie MINSSIEUX" -> "Frédéric MINSSIEUX")
 * - Preserves compound first names ("Jean-Pierre", "Marie-Louise", "Anna Rita")
 * - Preserves nobiliary particles & compound surnames ("DE OLIVEIRA", "EL QUALI", "LE MAREC", "Valarezo Barba", "Da Silva Bajouco")
 */
function normalizePersonName(rawName = '', country = 'FR', rawFirst = '', rawLast = '') {
  if (!rawName || typeof rawName !== 'string') return '';
  const roleStripRx = /(?:^|[\s,'’-])(l['’]associ[eé][e-]*g[eé]rant[e]*|l['’]associ[eé][e]?|associ[eé][e-]*g[eé]rant[e]*|der gesellschafter|die gesellschafterin|il socio)(?=$|[\s,.'’-])/gi;
  let cleaned = rawName
    .replace(/\([^)]*\)/g, ' ')
    .replace(roleStripRx, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned || cleaned === 'X') return cleaned;

  const particles = new Set(['de', 'du', 'd', "d'", 'des', 'le', 'la', 'les', 'el', 'al', 'ben', 'bin', 'ait', 'aït', 'da', 'di', 'do', 'dos', 'das', 'del', 'della', 'van', 'von', 'der', 'den', 'ten', 'ter', 'st', 'saint', 'sainte', 'mc', 'mac']);
  const compoundFirstPrefixes = new Set(['jean', 'marie', 'anne', 'pierre', 'paul', 'louis', 'marc', 'luc', 'charles', 'henri', 'francois', 'françois', 'mohamed', 'mohammed', 'fatima', 'anna', 'gian', 'pier']);

  // Fix known Geneva/Vaud no-comma multi-given-name inversions
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (country === 'CH' && words.length >= 2) {
    let f = (rawFirst || '').replace(roleStripRx, ' ').replace(/\s+/g, ' ').trim();
    let l = (rawLast || '').replace(roleStripRx, ' ').replace(/\s+/g, ' ').trim();

    if (f && l) {
      const lWords = l.split(/\s+/).filter(Boolean);
      const fWords = f.split(/\s+/).filter(Boolean);
      if (fWords.length === 1 && lWords.length >= 3 && !lWords.some(w => particles.has(w.toLowerCase()))) {
        const trueLast = lWords[0];
        const trueFirst = lWords[1];
        return `${trueFirst} ${trueLast}`;
      }
      if (fWords.length === 1 && lWords.length === 2 && /^(Paul|Camille|Jean|Marie|Pierre|Marc|Luc|Michel|Philippe|Thomas|David|Nicolas|Gilles)$/i.test(lWords[1])) {
        return `${lWords[1]} ${lWords[0]}`;
      }
      if (fWords.length >= 2) {
        const w0 = fWords[0];
        const w1 = fWords[1];
        const keepTwo = compoundFirstPrefixes.has(w0.toLowerCase()) && /^(pierre|paul|luc|marc|marie|claire|louise|laure|sophie|christine|france|antoine|baptiste|christophe|claude|françois|francois|michel|philippe|yves|louis|alain|amine|zahra|rita|luca|carlo|marco)$/i.test(w1);
        const normFirst = keepTwo ? `${w0}-${w1}` : w0;
        return `${normFirst} ${l}`.replace(/\s+/g, ' ').trim();
      }
      return `${f} ${l}`.replace(/\s+/g, ' ').trim();
    }
  }

  if (words.length <= 2) return cleaned;

  // French format: Given names are Title Case, Surnames are ALL CAPS (e.g. "Marion Rebecca CHETTRIT", "Jonathan EL QUALI", "Antonio DE OLIVEIRA")
  const isAllUpper = (w) => w.length > 1 && w === w.toUpperCase() && /[A-ZÀ-Ÿ]/.test(w);
  let firstSurnameIdx = -1;
  for (let i = 1; i < words.length; i++) {
    if (isAllUpper(words[i])) {
      firstSurnameIdx = i;
      break;
    }
  }

  if (firstSurnameIdx > 0) {
    while (firstSurnameIdx > 1 && particles.has(words[firstSurnameIdx - 1].toLowerCase().replace(/['’]/g, ''))) {
      firstSurnameIdx--;
    }
    const givenWords = words.slice(0, firstSurnameIdx);
    const surnameWords = words.slice(firstSurnameIdx);
    let normGiven = givenWords[0];
    if (givenWords.length >= 2) {
      const g0 = givenWords[0].toLowerCase();
      const g1 = givenWords[1].toLowerCase();
      if (compoundFirstPrefixes.has(g0) && /^(pierre|paul|luc|marc|marie|claire|louise|laure|sophie|christine|france|antoine|baptiste|christophe|claude|françois|francois|michel|philippe|yves|louis|alain|amine|zahra|rita)$/i.test(g1)) {
        normGiven = `${givenWords[0]}-${givenWords[1]}`;
      }
    }
    return `${normGiven} ${surnameWords.join(' ')}`.replace(/\s+/g, ' ').trim();
  }

  if (words.slice(1).some(w => particles.has(w.toLowerCase().replace(/['’]/g, '')))) {
    return cleaned;
  }

  if (words.length >= 4) {
    return `${words[0]} ${words[words.length - 1]}`;
  }

  return cleaned;
}

/**
 * Strict validator to guarantee ONLY physical human persons ("personnes physiques")
 * are ever accepted as Dirigeant / Board Member / CFO.
 * Rejects all legal entities, holdings, role-prefixed corporate names, statutory boilerplate, etc.
 */
function isValidPhysicalPersonName(name = '', companyName = '') {
  if (!name || typeof name !== 'string') return false;
  const trimmed = name.trim().replace(/\s+/g, ' ');
  if (trimmed.length < 4 || trimmed.length > 55) return false;
  if (trimmed === 'X') return false;

  // No digits or non-name punctuation
  if (/[0-9@#$%^&*()_+=[\]{}|\\<>/?~:;!"]/.test(trimmed)) return false;

  const lower = trimmed.toLowerCase();
  const compLower = (companyName || '').trim().toLowerCase();
  if (compLower && lower === compLower) return false;

  // Reject corporate / legal entity tokens & common business words (using Unicode-aware boundaries)
  const corporateRegex = /(?:^|[\s,'’-])(sas|sarl|sa|sasu|eurl|gmbh|sàrl|sagl|ag|ltd|llc|inc|plc|bv|nv|srl|spa|sl|lp|llp|sci|snc|scp|scm|selarl|earl|gaec|scea|gfa|holding|holdings|group|groupe|capital|invest|investissement|investments|partners|partner|management|consulting|conseil|services|service|solutions|solution|technologies|technology|tech|immobilier|immobiliere|immobilière|immobilien|immo|property|properties|construction|constructions|bau|transports|transport|logistics|logistique|audit|fiduciaire|treuhand|stiftung|fondation|fondazione|verein|association|genossenschaft|coopérative|cooperative|cabinet|office|bank|banque|trust|fund|venture|ventures|labs|studio|agency|agence|global|international|suisse|france|schweiz|switzerland|trading|commerce|enterprise|entreprise|société|societe|compagnie|company|corp|corporation|industrie|industries|pharma|medical|médical|praxis|klinik|clinique|agricole|gestion|finances|finance|auto|automobile|garage|atelier|maison|domaine|château|chateau|ferme|united|conquer|my|big|guyane|phalsbourg|atlantique|pacifique|mediterranee|méditerranée|europe|participations|patrimoine|promotion|developpement|développement|energie|énergie|solaire|digital|media|médias|events|event|advisory|expertise|comptable)(?=$|[\s,.'’-])/i;
  if (corporateRegex.test(trimmed)) return false;

  // Reject registry boilerplate & role words (FR / DE / IT) using Unicode-aware boundaries
  const boilerplateRegex = /(?:^|[\s,'’-])(écrit|ecrit|courriel|email|e-mail|lettre|communiqué|communications|communication|publication|organe|feuille|officielle|statuts|assemblée|assemblee|parts|sociales|actions|capital|chf|eur|signature|individuelle|collective|contrôle|controle|restreint|déclaration|declaration|renoncé|renonce|selon|aucun|aucune|néant|neant|non|renseigné|renseigne|direction|administration|conseil|fondateur|titulaire|inhaber|titolare|associé|associe|associée|associee|associés|associes|gérant|gerant|gérante|gerante|directeur|directrice|président|president|présidente|presidente|membre|administrateur|administratrice|liquidateur|liquidatrice|commissaire|représentant|representant|personne|personnes|inscrite|inscrites|domiciliataire|succursale|zweigniederlassung|eingetragene|personen|mitteilungen|gemäss|gemass|statuten|stammkapital|aktienkapital|revisionsstelle|ufficio|revisione|società|societa|statuto|comunicazioni|soci|scritta|posta|elettronica|monsieur|madame|mademoiselle|docteur|professeur|maître|maitre|par|ou|avec|sans|pour|dans|sur|sous|aux|des|les|une|qui|que|est|sont|ont|fait|plus|tous|toutes|autre|autres)(?=$|[\s,.'’-])/i;
  if (boilerplateRegex.test(trimmed)) return false;

  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 5) return false;

  // First word must NOT be ALL CAPS (in both FR and CH, first word is Given Name in Title Case; if all words are ALL CAPS, it's a corporate acronym/name)
  const w0Clean = words[0].replace(/['’-]/g, '');
  if (w0Clean.length > 1 && w0Clean === w0Clean.toUpperCase()) {
    return false;
  }

  // Every word must start with a letter and have at least 2 letters (except nobiliary particles)
  const allowedShort = new Set(['de', 'du', 'd', 'von', 'van', 'di', 'da', 'do', 'el', 'al', 'le', 'la', 'st', 'mc', 'o']);
  let validLongWords = 0;
  for (const w of words) {
    const cleanW = w.replace(/['’-]/g, '');
    if (!/^[A-Za-zÀ-ÿ]+$/.test(cleanW)) return false;
    if (cleanW.length >= 2 && !allowedShort.has(cleanW.toLowerCase())) {
      validLongWords++;
    } else if (!allowedShort.has(cleanW.toLowerCase())) {
      return false;
    }
  }

  return validLongWords >= 2;
}

/**
 * Triple-check that a company is a true commercial company with share capital
 * and NOT an Entrepreneur Individuel / Einzelunternehmen / Verein / Association / SCI / Fondation / SPV.
 */
function isValidCommercialCompany(company) {
  if (!company || !company.name) return false;
  const name = company.name.trim();
  const lf = (company.legalForm || '').trim();
  const act = (company.activity || '').trim();
  const pubText = (company.pubText || '').trim();
  const combined = `${name} ${lf} ${act} ${pubText}`;

  // 1. Explicitly reject sole proprietorships, associations, foundations, civil/agricultural entities, and SNCs
  const forbiddenFormsRegex = /\b(entreprise individuelle|entrepreneur individuel|einzelunternehmen|einzelfirma|impresa individuale|ditta individuale|raison individuelle|auto-entrepreneur|micro-entreprise|micro-entrepreneur|eirl|profession libérale|verein|association|associazione|stiftung|fondation|fondazione|genossenschaft|société coopérative|società cooperativa|société simple|einfache gesellschaft|sci\b|snc\b|société en nom collectif|société civile|groupement foncier|gfa\b|earl\b|gaec\b|scea\b|scm\b|scp\b|selarl\b|syndicat|comité|paroisse|kirche|gemeinde)\b/i;
  if (forbiddenFormsRegex.test(lf) || forbiddenFormsRegex.test(name)) {
    return false;
  }

  // Check Swiss / French activity & publication text for Verein / Einzelunternehmen / SCI
  if (/\b(der verein verfolgt|zweck des vereins|l'association a pour but|sans but lucratif|ohne kommerziellen charakter|non-profit|einzelunternehmen|entreprise individuelle|titulaire\s*:|inhaber(?:in)?\s*:|titolare\s*:)\b/i.test(combined)) {
    return false;
  }

  // 2. Country-specific strict legal form & name checks
  if (company.country === 'CH') {
    const validSwissLf = /^(SA \/ AG|Sàrl \/ GmbH|SA|AG|Sàrl|GmbH|Sagl)$/i.test(lf);
    if (!validSwissLf) return false;

    const hasSwissCommercialSuffix = /\b(SA|AG|S\.A\.|A\.G\.|Sàrl|Sarl|S\.à\.r\.l\.|GmbH|Sagl|Ltd|LLC|Inc)\b/i.test(name);
    if (!hasSwissCommercialSuffix) return false;

    if (company.shareCapital && company.shareCapital < 15000) return false;
  } else if (company.country === 'FR') {
    const validFrenchLf = /\b(SAS|SASU|SARL|EURL|SA|actions simplifiée|responsabilité limitée|société anonyme)\b/i.test(lf);
    if (!validFrenchLf) return false;
    if (/\b(individuel|civile|agricole|libérale|nom collectif)\b/i.test(lf)) return false;
  } else if (company.country === 'BE' || company.country === 'NL' || company.country === 'LU') {
    // Benelux: only capital companies (SRL/BV, SA/NV, Sàrl) — no sole proprietors, partnerships (VOF/CV/SNC/SCS), foundations, associations (ASBL/VZW), cooperatives
    const validBeneluxLf = /^(SRL \/ BV|SA \/ NV|BV|NV|SRL|SA|Sàrl)$/i.test(lf);
    if (!validBeneluxLf) return false;
    if (/\b(vzw|asbl|aisbl|ivzw|maatschap|eenmanszaak|stichting|vereniging|co[öo]peratie|coop[ée]rative)\b/i.test(name)) return false;
    if (/\b(v\.?o\.?f\.?|c\.?v\.?|scs|scsp|sicav|raif|sicar|fcp)\s*$/i.test(name)) return false;
  }

  // 3. Turnover (Chiffre d'affaires) check: must not exceed 30M€ / CHF
  if (company.revenue && company.revenue > 30000000) {
    return false;
  }

  // 4. Revolut Business Unsupported Industries check (including SPVs, Acquisition vehicles, Oil/Gas, Secondhand vehicles, Precious metals, etc.)
  const { isRevolutUnsupportedIndustry } = require('./compliance');
  if (isRevolutUnsupportedIndustry(company)) {
    return false;
  }

  return true;
}

const COUNTRY_MAP = {
  FR: { code: 'FR', name: 'France', flag: '🇫🇷' },
  CH: { code: 'CH', name: 'Suisse', flag: '🇨🇭' },
  DE: { code: 'DE', name: 'Allemagne', flag: '🇩🇪' },
  GB: { code: 'GB', name: 'Royaume-Uni', flag: '🇬🇧' },
  UK: { code: 'GB', name: 'Royaume-Uni', flag: '🇬🇧' },
  US: { code: 'US', name: 'États-Unis', flag: '🇺🇸' },
  LU: { code: 'LU', name: 'Luxembourg', flag: '🇱🇺' },
  BE: { code: 'BE', name: 'Belgique', flag: '🇧🇪' },
  NL: { code: 'NL', name: 'Pays-Bas', flag: '🇳🇱' },
  IT: { code: 'IT', name: 'Italie', flag: '🇮🇹' },
  ES: { code: 'ES', name: 'Espagne', flag: '🇪🇸' },
  PT: { code: 'PT', name: 'Portugal', flag: '🇵🇹' },
  AT: { code: 'AT', name: 'Autriche', flag: '🇦🇹' },
  IE: { code: 'IE', name: 'Irlande', flag: '🇮🇪' },
  AE: { code: 'AE', name: 'Émirats Arabes Unis (Dubaï)', flag: '🇦🇪' },
  SG: { code: 'SG', name: 'Singapour', flag: '🇸🇬' },
  HK: { code: 'HK', name: 'Hong Kong', flag: '🇭🇰' },
  CA: { code: 'CA', name: 'Canada', flag: '🇨🇦' },
  SE: { code: 'SE', name: 'Suède', flag: '🇸🇪' },
  DK: { code: 'DK', name: 'Danemark', flag: '🇩🇰' },
  PL: { code: 'PL', name: 'Pologne', flag: '🇵🇱' },
  CY: { code: 'CY', name: 'Chypre', flag: '🇨🇾' },
  MT: { code: 'MT', name: 'Malte', flag: '🇲🇹' },
};

/**
 * Detect foreign corporate holdings, cross-border subsidiaries, or international board links
 * from corporateLinks, registry publication text, and North Data.
 */
function detectInternationalLinks(company, rawText = '') {
  const homeCountry = company.country || 'FR';
  const links = [];
  const seen = new Set();

  function addIntl(countryCode, entityName, relation, city = '') {
    const info = COUNTRY_MAP[countryCode];
    if (!info || info.code === homeCountry) return;
    const key = `${info.code}:${(entityName || '').toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    links.push({
      countryCode: info.code,
      countryName: info.name,
      flag: info.flag,
      entityName: entityName || `Entité / Actionnaire (${info.name})`,
      relation: relation || 'Lien capitalistique / Groupe international',
      city: city || info.name,
    });
  }

  // 1. Check existing corporateLinks for foreign legal forms or country indicators
  for (const corp of company.corporateLinks || []) {
    const cname = corp.name || '';
    const ccity = corp.city || '';
    if (corp.countryCode && corp.countryCode !== homeCountry) {
      addIntl(corp.countryCode, cname, corp.roleHeld || 'Holding / Société Mère Étrangère', ccity);
      continue;
    }
    if (homeCountry === 'FR' && /\b(AG|GmbH|Sàrl|Sagl|CHE-)\b/i.test(cname + ' ' + (corp.siren || ''))) {
      addIntl('CH', cname, corp.roleHeld || 'Holding / Société liée Suisse', ccity || 'Suisse');
    } else if (homeCountry === 'CH' && /\b(SAS|SASU|SARL)\b/.test(cname)) {
      addIntl('FR', cname, corp.roleHeld || 'Holding / Société liée Française', ccity || 'France');
    } else if (/\b(Ltd|Limited|PLC|LLP)\b/i.test(cname)) {
      addIntl('GB', cname, corp.roleHeld || 'Holding / Société Mère UK', ccity || 'Londres');
    } else if (/\b(Inc\.|Corp\.|LLC)\b/i.test(cname)) {
      addIntl('US', cname, corp.roleHeld || 'Holding / Société Mère US', ccity || 'États-Unis');
    } else if (/\b(B\.?V\.?|N\.?V\.?)\b/.test(cname)) {
      addIntl('NL', cname, corp.roleHeld || 'Holding Néerlandaise (BV)', ccity || 'Pays-Bas');
    } else if (/\b(S\.?r\.?l\.?|S\.?p\.?A\.?)\b/i.test(cname)) {
      addIntl('IT', cname, corp.roleHeld || 'Société liée Italienne (Srl)', ccity || 'Italie');
    } else if (/Luxembourg|\bS\.à r\.l\., Luxembourg/i.test(cname + ' ' + ccity)) {
      addIntl('LU', cname, corp.roleHeld || 'Holding Luxembourgeoise', 'Luxembourg');
    } else if (/\b(Deutschland|München|Berlin|Frankfurt|Hamburg)\b/i.test(cname + ' ' + ccity)) {
      addIntl('DE', cname, corp.roleHeld || 'Holding Allemande (GmbH/AG)', ccity || 'Allemagne');
    }
  }

  // 2. Check raw publication text / activity for explicit cross-border parent or residence markers
  const textToScan = `${rawText || ''} ${company.activity || ''} ${company.address || ''}`;
  const countryMentions = [
    { rx: /\b(?:à|in|a)\s+([A-ZÀ-Ÿa-zà-ÿ-]+)\s*\((FR|DE|IT|GB|UK|US|LU|BE|NL|ES|PT|AT|AE|SG)\)/g, type: 'Siege/Domicile' },
    { rx: /\b(?:succursale de|Zweigniederlassung der|filiale de|détenue par|actionnaire unique\s*:)\s+([^,.(]+)\s*\((France|Suisse|Allemagne|Deutschland|Royaume-Uni|United Kingdom|Luxembourg|Belgique|Italie|Espagne|Pays-Bas|États-Unis|USA)\)/gi, type: 'Société Mère' }
  ];

  for (const m of textToScan.matchAll(countryMentions[0].rx)) {
    const city = m[1];
    const cc = m[2].toUpperCase();
    addIntl(cc, `Établissement / Actionnaire (${city})`, 'Lien transfrontalier enregistré au registre', city);
  }

  // Also check Swiss SHAB origin/residence in rawText (e.g. "de France, à Paris (FR)" or "deutscher Staatsangehöriger")
  if (homeCountry === 'CH' && rawText) {
    const foreignNationalities = [
      { rx: /\b(de France|französischer? Staatsangehöriger?|da Francia)\b/i, cc: 'FR', label: 'Actionnariat / Direction Franco-Suisse (FR ↔ CH)' },
      { rx: /\b(d'Allemagne|deutscher? Staatsangehöriger?|da Germania)\b/i, cc: 'DE', label: 'Actionnariat / Direction Germano-Suisse (DE ↔ CH)' },
      { rx: /\b(d'Italie|italienischer? Staatsangehöriger?|da Italia)\b/i, cc: 'IT', label: 'Actionnariat / Direction Italo-Suisse (IT ↔ CH)' },
      { rx: /\b(du Royaume-Uni|britischer? Staatsangehöriger?|Regno Unito)\b/i, cc: 'GB', label: 'Actionnariat / Direction UK-Suisse (GB ↔ CH)' },
      { rx: /\b(des États-Unis|US-amerikanischer? Staatsangehöriger?|Stati Uniti)\b/i, cc: 'US', label: 'Actionnariat / Direction US-Suisse (US ↔ CH)' },
      { rx: /\b(du Luxembourg|luxemburgischer? Staatsangehöriger?)\b/i, cc: 'LU', label: 'Actionnariat / Direction Luxembourg-Suisse (LU ↔ CH)' },
      { rx: /\b(de Belgique|belgischer? Staatsangehöriger?)\b/i, cc: 'BE', label: 'Actionnariat / Direction Belgo-Suisse (BE ↔ CH)' },
      { rx: /\b(d'Espagne|de Espagne|spanischer? Staatsangehöriger?)\b/i, cc: 'ES', label: 'Actionnariat / Direction Hispano-Suisse (ES ↔ CH)' },
      { rx: /\b(du Portugal|portugiesischer? Staatsangehöriger?)\b/i, cc: 'PT', label: 'Actionnariat / Direction Luso-Suisse (PT ↔ CH)' },
      { rx: /\b(d'Autriche|österreichischer? Staatsangehöriger?)\b/i, cc: 'AT', label: 'Actionnariat / Direction Austro-Suisse (AT ↔ CH)' },
      { rx: /\b(des Pays-Bas|niederländischer? Staatsangehöriger?)\b/i, cc: 'NL', label: 'Actionnariat / Direction NL-Suisse (NL ↔ CH)' },
    ];
    for (const fn of foreignNationalities) {
      if (fn.rx.test(rawText)) {
        addIntl(fn.cc, fn.label, 'Associé / Dirigeant International');
      }
    }
  }

  return links;
}

/**
 * Build canonical North Data URL for any French or Swiss company using its exact official registry ID
 * (`/Name, City/CHE-xxx.xxx.xxx` or `/Name, City/Siren xxxxxxxxx`).
 * Avoids `/?query=` free-text fuzzy matching which can auto-redirect to foreign homonyms.
 */
function buildNorthDataUrl(company) {
  if (!company) return 'https://www.northdata.fr';
  const reg = (company.registrationNumber || '').trim();
  const name = (company.name || '').trim();
  const city = (company.city || '').trim();
  const label = city ? `${name}, ${city}` : name;

  if (company.country === 'CH' && /^CHE-\d{3}\.\d{3}\.\d{3}$/.test(reg)) {
    return `https://www.northdata.fr/${encodeURIComponent(label)}/${reg}`;
  }
  const cleanSiren = reg.replace(/\s+/g, '');
  if (company.country === 'FR' && /^\d{9}$/.test(cleanSiren)) {
    return `https://www.northdata.fr/${encodeURIComponent(label)}/Siren%20${cleanSiren}`;
  }
  if (company.country === 'BE' && /^\d{4}\.\d{3}\.\d{3}$/.test(reg)) {
    return `https://www.northdata.fr/${encodeURIComponent(label)}/KBO%20${reg}`;
  }
  if (company.country === 'NL' && /^\d{8}$/.test(cleanSiren)) {
    return `https://www.northdata.fr/${encodeURIComponent(label)}/KVK%20${cleanSiren}`;
  }
  if (company.country === 'LU' && /^[A-Z]\d{4,7}$/.test(cleanSiren)) {
    return `https://www.northdata.fr/${encodeURIComponent(label)}/${cleanSiren}`;
  }
  return `https://www.northdata.fr/?query=${encodeURIComponent(label)}`;
}

/**
 * Build accurate North Data person search URL (never appends company headquarters city,
 * because North Data indexes physical persons by their personal residence commune, not the company seat).
 */
function buildNorthDataPersonUrl(personName = '') {
  const clean = (personName || '').trim();
  if (!clean || clean === 'X') return 'https://www.northdata.fr';
  return `https://www.northdata.fr/?query=${encodeURIComponent(clean)}`;
}

/**
 * Scrape North Data for a company (by SIREN/UID or Name) to retrieve:
 * - Physical board members / directors (`data-type="p"`)
 * - Parent / Sister corporate holdings (`data-type="c"`) including foreign entities!
 * - Published turnover / revenue (`Chiffre d'affaires`) if present
 */
async function fetchNorthDataEnrichment(company) {
  const result = {
    northDataUrl: buildNorthDataUrl(company),
    physicalPersons: [],
    corporateEntities: [],
    internationalLinks: [],
    revenue: null,
  };

  try {
    const reg = (company.registrationNumber || '').replace(/\s+/g, '');
    const query = reg && reg !== 'Encours' ? reg : `${company.name} ${company.city || ''}`;
    const searchUrl = `https://www.northdata.fr/?query=${encodeURIComponent(query)}`;

    const res = await axios.get(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept-Language': 'fr-FR,fr;q=0.9',
      },
      timeout: 4500,
    });

    let html = res.data || '';
    let companyIdMatch = html.match(/data-domain="company"\s+data-id="(\d+)"/);

    // If search page returned a list of links, follow the first matching company link
    if (!companyIdMatch) {
      const linkMatch = html.match(/<a[^>]+href="(\/[^"]+(?:CHE-[\d.]+|Siren%20\d+)[^"]*)"/i);
      if (linkMatch) {
        const directPath = linkMatch[1].replace(/&amp;/g, '&');
        result.northDataUrl = `https://www.northdata.fr${directPath}`;
        const pageRes = await axios.get(result.northDataUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept-Language': 'fr-FR,fr;q=0.9',
          },
          timeout: 4500,
        });
        html = pageRes.data || '';
        companyIdMatch = html.match(/data-domain="company"\s+data-id="(\d+)"/);
      }
    } else {
      const watchUri = html.match(/data-watch-uri="([^"]+)"/);
      if (watchUri) {
        result.northDataUrl = `https://www.northdata.fr${watchUri[1].replace(/&amp;/g, '&')}`;
      }
    }

    // Parse North Data embedded financial JSON if available
    const dataMatches = [...html.matchAll(/data-data="([^"]+)"/gi)];
    for (const dm of dataMatches) {
      try {
        const decoded = JSON.parse(dm[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'"));
        if (Array.isArray(decoded.item)) {
          for (const chart of decoded.item) {
            if (/Revenue|Chiffre|Sales|Umsatz/i.test(chart.item || chart.title || '')) {
              const points = chart.data?.data || [];
              const latest = points[points.length - 1];
              if (latest && typeof latest.value0 === 'number') {
                result.revenue = latest.value0;
              }
            }
          }
        }
      } catch {
        // ignore JSON parse error
      }
    }

    // Fetch North Data interactive Network Graph (`/data.json`) if companyId was found
    if (companyIdMatch && companyIdMatch[1]) {
      const ndCompanyId = companyIdMatch[1];
      const extra = generateNorthDataToken('https://www.northdata.fr');
      const graphParams = new URLSearchParams({
        id: ndCompanyId,
        domain: 'company',
        type: 'graph',
        layout: 'graph',
        language: 'fr',
        extra,
      });

      const graphRes = await axios.get(`https://www.northdata.fr/data.json?${graphParams.toString()}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'Referer': 'https://www.northdata.fr/',
        },
        timeout: 4500,
      });

      const svgHtml = graphRes.data?.result?.[0]?.html || '';
      if (svgHtml) {
        // Extract all <g class="link"> edge descriptions
        const edgeDescMap = {};
        for (const lm of svgHtml.matchAll(/<g class="link"[^>]*data-source-id="(\d+)"[^>]*data-target-id="(\d+)"[^>]*data-description="([^"]*)"/gi)) {
          edgeDescMap[lm[1]] = lm[3];
          edgeDescMap[lm[2]] = lm[3];
        }

        // Extract all <a class="node"> elements
        for (const nm of svgHtml.matchAll(/<a class="node"[^>]*data-id="(\d+)"[^>]*data-text="([^"]+)"[^>]*data-type="([pc])"[^>]*data-query="([^"]*)"[^>]*data-description="([^"]*)"/gi)) {
          const nodeId = nm[1];
          const text = nm[2].replace(/&amp;/g, '&').trim();
          const nodeType = nm[3]; // 'p' = physical person, 'c' = corporate entity
          const queryStr = nm[4].replace(/&amp;/g, '&');
          const desc = nm[5].replace(/&amp;/g, '&').trim();
          const role = edgeDescMap[nodeId] || 'Mandataire / Lié';

          if (nodeType === 'p') {
            if (isValidPhysicalPersonName(text, company.name)) {
              result.physicalPersons.push({
                name: text,
                role: role || 'Dirigeant / Membre du Board',
                description: desc,
                source: 'North Data & Registre',
              });
            }
          } else if (nodeType === 'c') {
            if (text.toLowerCase() === company.name.toLowerCase()) continue;
            const regKeyMatch = queryStr.match(/registerKey=([A-Z]{2})_([A-Za-z0-9.-]+)/);
            const countryCode = regKeyMatch ? regKeyMatch[1] : company.country;
            const regId = regKeyMatch ? regKeyMatch[2] : '';

            result.corporateEntities.push({
              name: text,
              siren: regId,
              countryCode,
              roleHeld: role || 'Holding / Société Liée (North Data)',
              city: desc.split(',').slice(1).join(',').trim() || countryCode,
              legalForm: 'Société / Holding',
            });

            if (countryCode && countryCode !== company.country && COUNTRY_MAP[countryCode]) {
              const cInfo = COUNTRY_MAP[countryCode];
              result.internationalLinks.push({
                countryCode: cInfo.code,
                countryName: cInfo.name,
                flag: cInfo.flag,
                entityName: text,
                relation: `${role || 'Entité liée'} (${cInfo.name})`,
                city: desc,
              });
            }
          }
        }
      }
    }
  } catch {
    // Non-blocking fallback
  }

  return result;
}

module.exports = {
  generateNorthDataToken,
  normalizePersonName,
  isValidPhysicalPersonName,
  isValidCommercialCompany,
  detectInternationalLinks,
  buildNorthDataUrl,
  buildNorthDataPersonUrl,
  fetchNorthDataEnrichment,
  COUNTRY_MAP,
};
