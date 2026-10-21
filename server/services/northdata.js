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
 * Strict validator to guarantee ONLY physical human persons ("personnes physiques")
 * are ever accepted as Dirigeant / Board Member / CFO.
 * Rejects all legal entities, holdings, statutory boilerplate ("écrit ou par courriel"), etc.
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
  if (compLower && (lower === compLower || compLower.includes(lower) && lower.split(' ').length >= 2 && compLower.startsWith(lower))) {
    // Wait: only reject if it's the corporate name itself (unless the corporate name has no legal suffix, which is blocked anyway)
  }
  if (compLower && lower === compLower) return false;

  // Reject corporate / legal entity tokens
  const corporateRegex = /\b(sas|sarl|sa|sasu|eurl|gmbh|sàrl|sarl|sagl|ag|ltd|llc|inc|plc|bv|nv|srl|spa|sl|lp|llp|sci|snc|scp|scm|selarl|earl|gaec|scea|gfa|holding|holdings|group|groupe|capital|invest|investissement|investments|partners|partner|management|consulting|conseil|services|service|solutions|solution|technologies|technology|tech|immobilier|immobiliere|immobilien|immo|property|properties|construction|constructions|bau|transports|transport|logistics|logistique|audit|fiduciaire|treuhand|stiftung|fondation|fondazione|verein|association|genossenschaft|coopérative|cooperative|cabinet|office|bank|banque|trust|fund|venture|ventures|labs|studio|agency|agence|global|international|suisse|france|schweiz|switzerland|trading|commerce|enterprise|entreprise|société|societe|compagnie|company|corp|corporation|industrie|industries|pharma|medical|médical|praxis|klinik|clinique)\b/i;
  if (corporateRegex.test(trimmed)) return false;

  // Reject registry boilerplate words (FR / DE / IT) like "écrit ou par courriel par"
  const boilerplateRegex = /\b(écrit|ecrit|courriel|email|e-mail|lettre|communiqué|communications|communication|publication|organe|feuille|officielle|statuts|assemblée|assemblee|parts|sociales|actions|capital|chf|eur|signature|individuelle|collective|contrôle|controle|restreint|déclaration|declaration|renoncé|renonce|selon|aucun|aucune|néant|neant|non|renseigné|renseigne|direction|administration|conseil|fondateur|titulaire|inhaber|titolare|associé|associe|associés|associes|gérant|gerant|gérante|représentant|representant|personne|personnes|inscrite|inscrites|domiciliataire|succursale|zweigniederlassung|eingetragene|personen|mitteilungen|gemäss|gemass|statuten|stammkapital|aktienkapital|revisionsstelle|ufficio|revisione|società|societa|statuto|comunicazioni|soci|scritta|posta|elettronica|par|ou|avec|sans|pour|dans|sur|sous|aux|des|les|une|qui|que|est|sont|ont|fait|plus|tous|toutes|autre|autres)\b/i;
  if (boilerplateRegex.test(trimmed)) return false;

  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 5) return false;

  // Every word must start with a letter and have at least 2 letters (except nobiliary particles like de, von, van, di, da, el, al, ben, st)
  const allowedShort = new Set(['de', 'du', 'd', 'von', 'van', 'di', 'da', 'el', 'al', 'le', 'la', 'st', 'mc', 'o']);
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
 * and NOT an Entrepreneur Individuel / Einzelunternehmen / Verein / Association / SCI / Fondation.
 */
function isValidCommercialCompany(company) {
  if (!company || !company.name) return false;
  const name = company.name.trim();
  const lf = (company.legalForm || '').trim();
  const act = (company.activity || '').trim();
  const pubText = (company.pubText || '').trim();
  const combined = `${name} ${lf} ${act} ${pubText}`;

  // 1. Explicitly reject sole proprietorships, associations, foundations, civil/agricultural entities
  const forbiddenFormsRegex = /\b(entreprise individuelle|entrepreneur individuel|einzelunternehmen|einzelfirma|impresa individuale|ditta individuale|raison individuelle|auto-entrepreneur|micro-entreprise|micro-entrepreneur|eirl|profession libérale|verein|association|associazione|stiftung|fondation|fondazione|genossenschaft|société coopérative|società cooperativa|société simple|einfache gesellschaft|sci\b|société civile|groupement foncier|gfa\b|earl\b|gaec\b|scea\b|scm\b|scp\b|selarl\b|syndicat|comité|paroisse|kirche|gemeinde)\b/i;
  if (forbiddenFormsRegex.test(lf) || forbiddenFormsRegex.test(name)) {
    return false;
  }

  // Check Swiss / French activity & publication text for Verein / Einzelunternehmen / SCI
  if (/\b(der verein verfolgt|zweck des vereins|l'association a pour but|sans but lucratif|ohne kommerziellen charakter|non-profit|einzelunternehmen|entreprise individuelle|titulaire\s*:|inhaber(?:in)?\s*:|titolare\s*:)\b/i.test(combined)) {
    return false;
  }

  // 2. Country-specific strict legal form & name checks
  if (company.country === 'CH') {
    // In Switzerland, commercial companies MUST be SA / AG or Sàrl / GmbH / Sagl
    const validSwissLf = /^(SA \/ AG|Sàrl \/ GmbH|SA|AG|Sàrl|GmbH|Sagl)$/i.test(lf);
    if (!validSwissLf) return false;

    // In Switzerland, SA/AG and Sàrl/GmbH are legally required by CO art. 950 to include the legal form in their registered name!
    // (e.g. "SA", "AG", "Ltd", "Sàrl", "Sarl", "GmbH", "Sagl", "LLC")
    // This completely eliminates sole proprietorships ("Truffle Nose Ilias Daskalopoulos") and associations ("SHIVA SHAMBHO")!
    const hasSwissCommercialSuffix = /\b(SA|AG|S\.A\.|A\.G\.|Sàrl|Sarl|S\.à\.r\.l\.|GmbH|Sagl|Ltd|LLC|Inc)\b/i.test(name);
    if (!hasSwissCommercialSuffix) return false;

    if (company.shareCapital && company.shareCapital < 15000) return false;
  } else if (company.country === 'FR') {
    const validFrenchLf = /\b(SAS|SASU|SARL|EURL|SA|SNC|actions simplifiée|responsabilité limitée|société anonyme)\b/i.test(lf);
    if (!validFrenchLf) return false;
    if (/\b(individuel|civile|agricole|libérale)\b/i.test(lf)) return false;
  }

  // 3. Turnover (Chiffre d'affaires) check: must not exceed 30M€ / CHF
  if (company.revenue && company.revenue > 30000000) {
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
 * Build direct North Data URL for any French or Swiss company
 */
function buildNorthDataUrl(company) {
  if (!company) return 'https://www.northdata.fr';
  const reg = (company.registrationNumber || '').trim();
  const name = (company.name || '').trim();
  const city = (company.city || '').trim();
  if (company.country === 'CH' && reg.startsWith('CHE-')) {
    return `https://www.northdata.fr/?query=${encodeURIComponent(`${name} ${reg}`)}`;
  }
  if (company.country === 'FR' && /^\d{9}$/.test(reg.replace(/\s+/g, ''))) {
    return `https://www.northdata.fr/?query=${encodeURIComponent(`${name} ${reg.replace(/\s+/g, '')}`)}`;
  }
  return `https://www.northdata.fr/?query=${encodeURIComponent(`${name} ${city}`)}`;
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
  isValidPhysicalPersonName,
  isValidCommercialCompany,
  detectInternationalLinks,
  buildNorthDataUrl,
  fetchNorthDataEnrichment,
  COUNTRY_MAP,
};
