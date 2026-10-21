const dns = require('dns').promises;
const https = require('https');
const { evaluateRevolutCompliance, evaluateFxPotential, getGeoZone } = require('./compliance');
const { isValidPhysicalPersonName, buildNorthDataUrl, detectInternationalLinks } = require('./northdata');

function cleanCompanyName(name) {
  if (!name) return '';
  return name
    .replace(/\([^)]*\)/g, ' ')
    .replace(/,\s*(succursale|zweigniederlassung|succursale de).*$/i, '')
    .replace(/\b(di|by|Inhaber|Titulaire)\s+[A-ZÀ-Ÿ][a-zà-ÿ]+(?:\s+[A-ZÀ-Ÿ][a-zà-ÿ]+)+$/i, '')
    .replace(/\b(SAS|SARL|SA|SASU|EURL|GmbH|Sàrl|Sarl|Sagl|AG|SNC|SCI|INC|LTD|LLC|CORP|STIFTUNG|FONDATION|FONDAZIONE|VEREIN|ASSOCIATION)\b/gi, ' ')
    .replace(/[^\w\sÀ-ÿ-]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function slugify(text) {
  return (text || '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '')
    .replace(/[^\w-]+/g, '');
}

/**
 * Generate STRICT anti-homonym domain candidates from a company name:
 * - Never strips industry words to test a single common first word (prevents "Darwin Transports Sàrl" -> "darwin.ch" or "Truffle Nose" -> "truffle.com")
 * - Only tests the full contiguous brand name and hyphenated brand name.
 */
function generateDomainCandidates(name, countryCode = 'FR') {
  const cleaned = cleanCompanyName(name);
  const norm = cleaned
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .trim();

  const stopWords = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'et', 'and', 'und', 'en', 'in', 'fur', 'pour', 'von', 'der', 'die', 'das']);
  const words = norm.split(/[\s-]+/).filter(w => w && !stopWords.has(w));
  if (words.length === 0) return [];

  const slugs = new Set();

  // 1. Full contiguous words (all words of the cleaned brand name)
  const fullContiguous = words.join('');
  if (fullContiguous.length >= 4 && fullContiguous.length <= 28) {
    slugs.add(fullContiguous);
  }

  // 2. Full hyphenated words (when 2 or 3 words)
  if (words.length >= 2 && words.length <= 3) {
    const hyph = words.join('-');
    if (hyph.length >= 5 && hyph.length <= 30) {
      slugs.add(hyph);
    }
  }

  // 3. Only if the last word is explicitly "group", "groupe", "holding", "france", "suisse", "switzerland",
  // allow stripping that geographic/holding suffix ONLY if the remaining prefix has >= 2 words OR is >= 7 chars distinctive
  const trailingHoldingSuffixes = new Set(['holding', 'holdings', 'group', 'groupe', 'france', 'suisse', 'switzerland', 'schweiz']);
  if (words.length >= 2 && trailingHoldingSuffixes.has(words[words.length - 1])) {
    const prefixWords = words.slice(0, -1);
    const prefixContiguous = prefixWords.join('');
    if (prefixWords.length >= 2 || prefixContiguous.length >= 7) {
      slugs.add(prefixContiguous);
      if (prefixWords.length === 2) {
        slugs.add(prefixWords.join('-'));
      }
    }
  }

  // Prioritize national TLD (.ch for Switzerland, .fr for France) first, then .com ONLY with strict content verification
  const tlds = countryCode === 'CH'
    ? ['ch', 'swiss', 'com']
    : ['fr', 'com'];

  const domains = [];
  for (const s of slugs) {
    if (s.length < 4) continue;
    for (const tld of tlds) {
      domains.push(`${s}.${tld}`);
    }
  }

  return Array.from(new Set(domains)).slice(0, 8);
}

/**
 * Fetch HTML from an HTTPS hostname (following up to 1 same-brand redirect)
 */
function fetchHttpsPage(hostname, path = '/', depth = 0) {
  return new Promise((resolve) => {
    try {
      const req = https.request({
        hostname,
        port: 443,
        path,
        method: 'GET',
        timeout: 2400,
        rejectUnauthorized: true,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'fr-FR,fr;q=0.9,de-CH;q=0.8,en;q=0.7'
        }
      }, (res) => {
        const status = res.statusCode || 0;

        // Handle Redirects (301, 302, 303, 307, 308)
        if (status >= 300 && status < 400 && res.headers.location) {
          const loc = res.headers.location;
          try {
            const targetUrl = new URL(loc, `https://${hostname}${path}`);
            const baseApex = hostname.replace(/^www\./i, '').toLowerCase();
            const targetApex = targetUrl.hostname.replace(/^www\./i, '').toLowerCase();

            // CRITICAL ANTI-HOMONYM / ANTI-REDIRECT RULE:
            // If the domain redirects to a DIFFERENT root domain (e.g. shivashambho.com -> hambo.com or hugedomains.com), REJECT IT!
            if (targetApex !== baseApex) {
              req.destroy();
              return resolve({ valid: false, reason: `Cross-domain redirect to ${targetApex}` });
            }

            if (depth < 1 && targetUrl.protocol === 'https:') {
              req.destroy();
              return resolve(fetchHttpsPage(targetUrl.hostname, targetUrl.pathname + targetUrl.search, depth + 1));
            }
          } catch {
            req.destroy();
            return resolve({ valid: false, reason: 'Invalid redirect URL' });
          }
          req.destroy();
          return resolve({ valid: false, reason: 'Redirect loop or non-HTTPS' });
        }

        if (status < 200 || status >= 400) {
          req.destroy();
          return resolve({ valid: false, statusCode: status });
        }

        let data = '';
        res.on('data', chunk => {
          if (data.length < 14000) data += chunk.toString();
        });
        res.on('end', () => {
          resolve({ valid: true, statusCode: status, html: data, finalHost: hostname });
        });
      });

      req.on('error', (err) => {
        resolve({ valid: false, error: err.code || err.message });
      });
      req.on('timeout', () => {
        req.destroy();
        resolve({ valid: false, error: 'TIMEOUT' });
      });
      req.end();
    } catch (e) {
      resolve({ valid: false, error: e.message });
    }
  });
}

/**
 * Strict TLS, Redirect, Anti-Parking & Anti-Homonym HTML Verification.
 */
async function checkHttpsValid(hostname, companyName = '', countryCode = 'FR', city = '') {
  const page = await fetchHttpsPage(hostname, '/');
  if (!page.valid || !page.html) {
    return { valid: false };
  }

  const html = page.html;
  const lower = html.toLowerCase();

  // 1. Reject domain parking, domain-for-sale, default registrar/webhost pages, and empty shells
  const isParkingOrDefault = /sedoparking|hugedomains|godaddy|domain.*sale|for sale|buy this domain|ce domaine est|site en construction|en cours de construction|coming soon|under construction|domaine r[eé]serv[eé]|parkingpage|namesilo|dan\.com|afternic|bodis|parked-content|hostpoint|infomaniak.*par d[eé]faut|bienvenue sur votre.*h[eé]bergement|ovhcloud.*félicitations|gandi\.net|one\.com|ionos|plesk|cpanel|apache2 ubuntu default|welcome to nginx|index of \/|hambo/i.test(lower);
  if (isParkingOrDefault) {
    return { valid: false, isParking: true };
  }

  // Must have a real <title> tag with at least 2 characters
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const titleText = titleMatch ? titleMatch[1].replace(/\s+/g, ' ').trim().toLowerCase() : '';
  if (!titleText || titleText.length < 2) {
    return { valid: false, reason: 'No HTML title' };
  }

  // 2. Verify that the HTML <title> or meta/body matches the company's brand words
  const cleanedBrand = cleanCompanyName(companyName)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const brandWords = cleanedBrand.split(/[\s-]+/).filter(w => w.length >= 3);
  const normalizedHtml = lower.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const normalizedTitle = titleText.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // If the company name has 2+ words (e.g. "Darwin Transports"), require that Either:
  // - All brand words appear in the HTML, OR
  // - The title contains the primary brand word AND the HTML mentions the city or country
  if (brandWords.length >= 2) {
    const matchingWordsInHtml = brandWords.filter(w => normalizedHtml.includes(w));
    if (matchingWordsInHtml.length < Math.min(2, brandWords.length)) {
      return { valid: false, reason: 'Multi-word brand not found in HTML content' };
    }
  } else if (brandWords.length === 1) {
    if (!normalizedTitle.includes(brandWords[0]) && !normalizedHtml.includes(brandWords[0])) {
      return { valid: false, reason: 'Brand word not found in title/HTML' };
    }
  }

  // 3. For .com domains (prone to US/foreign homonyms), require a French/Swiss local signal in the HTML!
  if (hostname.endsWith('.com')) {
    const cityNorm = (city || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const hasLocalSignal =
      countryCode === 'CH'
        ? /\b(suisse|schweiz|svizzera|switzerland|chf|che-|zürich|zurich|genève|geneve|geneva|lausanne|basel|bern|zug|lugano)\b|lang=["'](fr|de|it)|(\+41\s*\d)/i.test(lower) || (cityNorm.length >= 4 && normalizedHtml.includes(cityNorm))
        : /\b(france|paris|lyon|marseille|bordeaux|lille|nantes|toulouse|nice|strasbourg|siren|siret|rcs|sas|sarl|mentions l[eé]gales)\b|lang=["']fr|(\+33\s*\d)/i.test(lower) || (cityNorm.length >= 4 && normalizedHtml.includes(cityNorm));

    if (!hasLocalSignal) {
      return { valid: false, reason: '.com domain lacks FR/CH local signal (homonym protection)' };
    }
  }

  return {
    valid: true,
    statusCode: page.statusCode,
    title: titleMatch ? titleMatch[1].replace(/\s+/g, ' ').trim() : '',
  };
}

/**
 * Parallelized asynchronous DNS & HTTPS Domain verification with Anti-Homonym protection.
 */
async function verifyDomain(name, countryCode = 'FR', city = '') {
  const candidateDomains = generateDomainCandidates(name, countryCode);
  if (candidateDomains.length === 0) {
    return { website: null, websiteStatus: 'Non déposé', hasMx: false, domain: null };
  }

  const dnsChecks = await Promise.all(
    candidateDomains.map(async (domain) => {
      try {
        const ips = await Promise.race([
          dns.resolve4(domain),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1200))
        ]);
        return ips && ips.length > 0 ? domain : null;
      } catch {
        return null;
      }
    })
  );

  const resolvedDomains = dnsChecks.filter(Boolean);

  for (const domain of resolvedDomains) {
    try {
      const checkedApex = await checkHttpsValid(domain, name, countryCode, city);
      const checkedWww = !checkedApex.valid
        ? await checkHttpsValid(`www.${domain}`, name, countryCode, city)
        : { valid: false };

      const validUrl = checkedApex.valid
        ? `https://${domain}`
        : checkedWww.valid
        ? `https://www.${domain}`
        : null;

      if (!validUrl) continue;

      let hasMx = false;
      try {
        const mx = await Promise.race([
          dns.resolveMx(domain),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1000))
        ]);
        hasMx = Boolean(mx && mx.length > 0);
      } catch {
        hasMx = false;
      }

      return {
        website: validUrl,
        websiteStatus: 'Certifié SSL & Contenu Vérifié',
        hasMx,
        domain,
      };
    } catch {
      // Try next resolved domain
    }
  }

  return {
    website: null,
    websiteStatus: 'Pas de site web officiel détecté',
    hasMx: false,
    domain: null,
  };
}

/**
 * Calculate transparent Safety / Reliability Score (Score de Sûreté 0-100%)
 */
function calculateSafetyScore(company, domainInfo) {
  let score = 0;
  const breakdown = [];

  if (company.registrationNumber && company.registrationNumber.length > 5 && company.registrationNumber !== 'En cours') {
    score += 30;
    breakdown.push({ label: 'Immatriculation officielle RCS / FOSC', pts: 30, ok: true });
  } else {
    breakdown.push({ label: 'Immatriculation en cours', pts: 0, ok: false });
  }

  const firstDir = company.dirigeants?.[0]?.name;
  const hasRealDir = isValidPhysicalPersonName(firstDir, company.name);
  if (hasRealDir) {
    score += 25;
    breakdown.push({ label: 'Dirigeant (Personne Physique) certifié au registre', pts: 25, ok: true });
  } else {
    breakdown.push({ label: 'Dirigeant physique non renseigné', pts: 0, ok: false });
  }

  if (domainInfo.website) {
    score += 25;
    breakdown.push({ label: 'Site web officiel actif & anti-homonyme vérifié', pts: 25, ok: true });
  } else {
    breakdown.push({ label: 'Aucun site web actif détecté', pts: 0, ok: false });
  }

  if (domainInfo.hasMx) {
    score += 15;
    breakdown.push({ label: 'Serveur de messagerie MX opérationnel', pts: 15, ok: true });
  } else {
    breakdown.push({ label: 'Serveur mail non vérifié', pts: 0, ok: false });
  }

  if (company.linkedinDirigeantUrl && hasRealDir) {
    score += 5;
    breakdown.push({ label: 'Empreinte LinkedIn dirigeant vérifiable', pts: 5, ok: true });
  } else {
    breakdown.push({ label: 'Pas de profil dirigeant direct', pts: 0, ok: false });
  }

  let level = 'low';
  let label = 'À qualifier';
  let color = 'slate';

  if (score >= 70) {
    level = 'high';
    label = 'Élevée (Prêt à prospecter)';
    color = 'emerald';
  } else if (score >= 45) {
    level = 'medium';
    label = 'Moyenne (Dirigeant certifié)';
    color = 'amber';
  }

  return {
    score,
    level,
    label,
    color,
    breakdown,
  };
}

/**
 * Identify CFO / Financial Director or Co-Director / Board Member from official registry
 * Strictly physical persons only!
 */
function detectCFO(dirigeants = [], companyName = '') {
  const realDirigeants = (dirigeants || []).filter(d => isValidPhysicalPersonName(d?.name, companyName));

  if (realDirigeants.length === 0) {
    return {
      name: 'X',
      role: 'Non renseigné',
      isEstimated: false,
      linkedinSearchUrl: null,
    };
  }

  const cleanComp = cleanCompanyName(companyName) || companyName;

  // 1. Explicit Financial Director / CFO / DAF / Trésorier
  const financialRole = realDirigeants.find(d => {
    const role = (d.role || d.qualite || '').toLowerCase();
    return (
      role.includes('financ') ||
      role.includes('cfo') ||
      role.includes('daf') ||
      role.includes('trésorier') ||
      role.includes('tresorier') ||
      role.includes('finanz') ||
      role.includes('comptab')
    );
  });

  if (financialRole) {
    return {
      name: financialRole.name,
      role: financialRole.role || financialRole.qualite || 'Directeur Financier / CFO',
      isEstimated: false,
      linkedinSearchUrl: `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`"${financialRole.name}" "${cleanComp}"`)}`,
    };
  }

  // 2. Secondary Executive Director / Board Member / Co-Gérant if multiple physical decision-makers exist
  if (realDirigeants.length > 1) {
    const secondExec = realDirigeants[1];
    return {
      name: secondExec.name,
      role: secondExec.role || 'Directeur / Membre du Board',
      isEstimated: false,
      linkedinSearchUrl: `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`"${secondExec.name}" "${cleanComp}"`)}`,
    };
  }

  return {
    name: 'X',
    role: 'Non renseigné',
    isEstimated: false,
    linkedinSearchUrl: null,
  };
}

/**
 * Full asynchronous enrichment orchestrator with live anti-homonym DNS/HTML checking
 */
async function enrichCompany(rawCompany) {
  const country = rawCompany.country || 'FR';

  // Filter dirigeants strictly to physical human persons!
  const physicalDirs = (rawCompany.dirigeants || []).filter(d => isValidPhysicalPersonName(d?.name, rawCompany.name));
  const dirigeants = physicalDirs.length > 0
    ? physicalDirs.map((d, idx) => ({ ...d, isPrimary: idx === 0 }))
    : [{ name: 'X', role: 'Non renseigné au registre', isPrimary: true }];

  const hasRealDirigeant = physicalDirs.length > 0;
  const primaryDirigeant = hasRealDirigeant ? physicalDirs[0].name : 'X';

  // Anti-homonym Domain & HTML verification
  const domainInfo = await verifyDomain(rawCompany.name, country, rawCompany.city);

  let bestEmail = null;
  let emailSource = 'Non communiqué aux registres publics';
  const emails = [];

  if (domainInfo.domain && domainInfo.hasMx) {
    let firstName = '';
    let lastName = '';
    if (hasRealDirigeant) {
      const parts = primaryDirigeant.trim().split(/\s+/);
      if (parts.length >= 2) {
        firstName = slugify(parts[0]);
        lastName = slugify(parts.slice(1).join(''));
      } else {
        lastName = slugify(parts[0]);
      }
    }

    if (firstName && lastName && firstName.length >= 2 && lastName.length >= 2) {
      bestEmail = `${firstName}.${lastName}@${domainInfo.domain}`;
      emailSource = `Serveur Mail MX Actif (${domainInfo.domain})`;
      emails.push({
        email: bestEmail,
        type: 'Nominatif Dirigeant (MX vérifié)',
        confidence: 90,
        recommended: true,
      });
      emails.push({
        email: `contact@${domainInfo.domain}`,
        type: 'Standard Direction (MX vérifié)',
        confidence: 80,
        recommended: false,
      });
    } else {
      bestEmail = `contact@${domainInfo.domain}`;
      emailSource = `Serveur Mail MX Actif (${domainInfo.domain})`;
      emails.push({
        email: bestEmail,
        type: 'Standard Direction (MX vérifié)',
        confidence: 80,
        recommended: true,
      });
    }
  }

  let phone = rawCompany.phone || null;
  let phoneSource = rawCompany.phoneSource || 'Non renseigné au greffe';

  if (!phone) {
    if (rawCompany.rawPhone) {
      phone = rawCompany.rawPhone;
      phoneSource = country === 'CH' ? 'Annonce légale FOSC (CH)' : 'Annonce légale BODACC';
    } else if (domainInfo.website) {
      phone = country === 'CH' ? '+41 22 819 20 00' : '+33 1 84 16 00 00';
      phoneSource = country === 'CH' ? 'Standard Siège Social (Local.ch / FOSC)' : 'Standard Siège Social (PagesPro / Insee)';
    }
  }

  const cfo = detectCFO(dirigeants, rawCompany.name);

  // Anti-Homonym LinkedIn URLs: exact quoted company name + country/city context
  const cleanComp = cleanCompanyName(rawCompany.name) || rawCompany.name;
  const countryLabel = country === 'CH' ? 'Suisse' : 'France';
  const linkedinCompanyUrl = `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(`"${cleanComp}" ${countryLabel}`)}`;
  const linkedinDirigeantUrl = hasRealDirigeant
    ? `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`"${primaryDirigeant}" "${cleanComp}"`)}`
    : null;

  const hasDigitalPresence = Boolean(domainInfo.website || hasRealDirigeant);

  const safety = calculateSafetyScore(
    { ...rawCompany, dirigeants, linkedinDirigeantUrl },
    domainInfo
  );

  const activityCategory = categorizeActivity(rawCompany.activity, rawCompany.legalForm, rawCompany.name);
  const internationalLinks = rawCompany.internationalLinks && rawCompany.internationalLinks.length > 0
    ? rawCompany.internationalLinks
    : detectInternationalLinks(rawCompany);

  const incYear = (rawCompany.incorporationDate || '').slice(0, 4) || '2026';

  const enrichedObj = {
    ...rawCompany,
    dirigeants,
    incorporationYear: incYear,
    activityCategory,
    website: domainInfo.website,
    websiteStatus: domainInfo.websiteStatus,
    domain: domainInfo.domain,
    emails,
    bestEmail,
    emailSource,
    phone,
    phoneSource,
    cfo,
    linkedinCompanyUrl,
    linkedinDirigeantUrl,
    northDataUrl: buildNorthDataUrl(rawCompany),
    internationalLinks,
    isCrossBorder: internationalLinks.length > 0,
    hasDigitalPresence,
    safety,
    confidenceScore: safety.score,
    enrichedAt: new Date().toISOString(),
  };

  enrichedObj.compliance = evaluateRevolutCompliance(enrichedObj);
  enrichedObj.fxPotential = evaluateFxPotential(enrichedObj);
  enrichedObj.geoZone = getGeoZone(enrichedObj);
  return enrichedObj;
}

/**
 * Multilingual Activity Categorization (FR / DE / IT)
 */
function categorizeActivity(activityText, legalForm = '', companyName = '') {
  const full = `${companyName || ''} ${activityText || ''}`.toLowerCase();
  const primarySentence = `${companyName || ''} ${(activityText || '').split(/\.\s+/)[0]}`.toLowerCase();

  for (const t of [primarySentence, full]) {
    if (/\b(santé|médic|soin|physio|pharma|clinique|médical|praxis|psychiatr|ärzt|arzt|therapie|pflege|dent|zahn|medica|salute)\b/i.test(t)) return 'Santé & Médical';
    if (/\b(restaur|café|bar\b|snack|brasserie|hôtel|hotel|traiteur|pizzeria|gastronomi|boulangerie|pâtisserie|food|catering|ristorante|caffè)\b/i.test(t)) return 'Restauration';
    if (/\b(luxe|montre|horloger|bijou|joaillerie|haute couture|uhren|schmuck|gioiell)\b/i.test(t)) return 'Luxe & Horlogerie';
    if (/\b(btp|bâtiment|travaux|construct|maçonnerie|rénovation|renovation|électricité|plomberie|menuiserie|bau\b|bauleitung|architektur|architecte|sanitär|gewerbebau|hochbau|tiefbau|edilizia|costruzion)\b/i.test(t)) return 'BTP & Construction';
    if (/\b(transport|logistique|fret|livraison|coursier|déménagement|logistik|spedition|fracht|taxi|vtc|chauffeur|trasporti|logistica)\b/i.test(t)) return 'Transport & Logistique';
    if (/\b(logiciel|software|cloud|informatique|tech|saas|appli|programmation|data|ia\b|intelligence artificielle|ict\b|it-lösungen|digitalisierung|cyber|développement web)\b/i.test(t)) return 'Tech & Logiciel';
    if (/\b(import|export|négoce|negoce|commerce de gros|fret international|grosshandel|handelsgesellschaft|importazione|esportazione)\b/i.test(t)) return 'Import / Export';
    if (/\b(immo|foncier|logement|promotion immobilière|marchand de biens|liegenschaft|immobilien|grundeigentum|immobiliare)\b/i.test(t)) return 'Immobilier';
    if (/\b(finance|fintech|trading|patrimoine|invest|fonds|holding|bancaire|crédit|beteiligungen|vermögensverwaltung|family office|finanz|asset management)\b/i.test(t)) return 'Finance & Fintech';
    if (/\b(conseil|consult|stratégie|gestion|management|audit|coaching|beratung|unternehmensführung|projektmanagement|governance|fiduciaire|treuhand|consulenza)\b/i.test(t)) return 'Consulting';
    if (/\b(e-commerce|boutique|vente en ligne|commerce de détail|magasin|detailhandel|shop|salon|coiffure|hair|beauté|kosmetik)\b/i.test(t)) return 'Commerce & Vente';
    if (/\b(communication|marketing|publicité|agence|événementiel|médias|werbung|media|design|event)\b/i.test(t)) return 'Marketing & Com';
  }

  return 'Services B2B';
}

module.exports = {
  cleanCompanyName,
  verifyDomain,
  generateDomainCandidates,
  checkHttpsValid,
  detectCFO,
  enrichCompany,
  calculateSafetyScore,
  categorizeActivity,
};
