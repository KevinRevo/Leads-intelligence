/**
 * Benelux scrapers (même logique que FR / CH : sociétés commerciales uniquement, dirigeants = personnes physiques,
 * exclusion des industries non supportées par Revolut, constitution depuis le 01/01/2024).
 *
 * Sources :
 *  - Découverte  : GLEIF (api.gleif.org, API publique) — entités avec LEI, adresse légale BE / NL / LU, date de création.
 *  - Vérification & dirigeants (BE) : BCE / KBO Public Search (SPF Économie) — statut, date de début, forme légale,
 *    capital, code NACE-BEL, titulaires de fonctions (personnes physiques vs personnes morales).
 *
 * NL / LU : le registre officiel (KvK / LBR) ne publie pas gratuitement les dirigeants ; ces pays ne peuvent donc pas
 * satisfaire la règle « dirigeant = personne physique vérifiée » et ne sont pas ingérés (voir fetchGleifCandidates pour la découverte).
 */
const axios = require('axios');
const { isValidPhysicalPersonName } = require('../services/northdata');

const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Découverte GLEIF : entités "GENERAL" (hors fonds / personnes physiques) créées depuis `since` pour un pays donné.
 */
async function fetchGleifCandidates(countryCode, since = '2024-01-01', maxPages = 80) {
  const out = [];
  for (let page = 1; page <= maxPages; page++) {
    let items = [];
    for (let attempt = 0; attempt < 3 && !items.length; attempt++) {
      try {
        const r = await axios.get('https://api.gleif.org/api/v1/lei-records', {
          params: {
            'filter[entity.legalAddress.country]': countryCode,
            'filter[entity.category]': 'GENERAL',
            'page[size]': 200,
            'page[number]': page,
            sort: '-entity.creationDate',
          },
          timeout: 25000,
        });
        items = r.data.data || [];
        if (!items.length) break;
      } catch {
        await SLEEP(1500);
      }
    }
    if (!items.length) break;
    let reachedOld = false;
    for (const x of items) {
      const e = x.attributes.entity;
      const created = (e.creationDate || '').slice(0, 10);
      if (created && created < since) { reachedOld = true; break; }
      out.push({
        name: e.legalName?.name || '',
        registeredAs: e.registeredAs || '',
        elf: e.legalForm?.id || '',
        city: e.legalAddress?.city || '',
        postalCode: e.legalAddress?.postalCode || '',
        address: (e.legalAddress?.addressLines || []).join(', '),
        created,
      });
    }
    if (reachedOld) break;
  }
  return out;
}

const FR_MONTHS = {
  janvier: '01', février: '02', fevrier: '02', mars: '03', avril: '04', mai: '05', juin: '06',
  juillet: '07', août: '08', aout: '08', septembre: '09', octobre: '10', novembre: '11', décembre: '12', decembre: '12',
};

function frDateToIso(s = '') {
  const m = s.match(/(\d{1,2})\s+([A-Za-zÀ-ÿ]+)\s+(\d{4})/);
  if (!m) return '';
  const mm = FR_MONTHS[m[2].toLowerCase()];
  if (!mm) return '';
  return `${m[3]}-${mm}-${m[1].padStart(2, '0')}`;
}

function decodeEntities(s = '') {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function htmlToText(html = '') {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  ).replace(/\s+/g, ' ').trim();
}

/** "1043383666" -> "1043.383.666" */
function formatKboNumber(digits = '') {
  const d = digits.replace(/\D/g, '').padStart(10, '0');
  return `${d.slice(0, 4)}.${d.slice(4, 7)}.${d.slice(7, 10)}`;
}

async function fetchKboHtml(digits) {
  const url = `https://kbopub.economie.fgov.be/kbopub/toonondernemingps.html?lang=fr&ondernemingsnummer=${digits}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'fr-FR,fr;q=0.9',
        },
        timeout: 6000,
        maxRedirects: 0,
        validateStatus: () => true,
      });
      if (r.status === 302 && r.headers.location && r.headers.location.includes('captcha')) {
        // Anti-bot temporaire activé par la BCE
        return '';
      }
      if (r.status === 200 && typeof r.data === 'string' && r.data.includes("Numéro d'entreprise")) return r.data;
    } catch {
      // retry
    }
    await SLEEP(500 * (attempt + 1));
  }
  return '';
}

const PARTICLES = new Set(['de', 'du', 'des', 'van', 'von', 'der', 'den', 'ter', 'ten', 'te', 'la', 'le', 'di', 'da', 'el', 'al', 'het']);

function titleCaseName(s = '') {
  const clean = s.replace(/\s+/g, ' ').trim();
  const isAllUpper = clean === clean.toUpperCase() && /[A-ZÀ-Ý]/.test(clean);
  const base = isAllUpper ? clean.toLowerCase() : clean;
  return base
    .split(' ')
    .map((w, i) => {
      if (isAllUpper || w === w.toLowerCase()) {
        if (i > 0 && PARTICLES.has(w.toLowerCase())) return w.toLowerCase();
        return w.split('-').map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('-');
      }
      return w;
    })
    .join(' ');
}

const COMPOUND_FIRST = new Set(['jean', 'marie', 'anne', 'pierre', 'louis', 'paul', 'marc', 'luc', 'charles', 'henri', 'gian', 'maria']);
const COMPOUND_SECOND = new Set(['pierre', 'paul', 'luc', 'marc', 'marie', 'claire', 'louise', 'laure', 'sophie', 'christine', 'antoine', 'baptiste', 'claude', 'françois', 'francois', 'michel', 'philippe', 'yves', 'louis', 'alain', 'jacques', 'charles', 'noël', 'noel', 'françoise', 'catherine', 'charlotte']);

/** KBO: "Dary , Antoine" (Nom , Prénoms) -> "Antoine Dary" (prénom usuel + nom, sans 2e/3e prénoms d'état civil). */
function parseKboPerson(text = '') {
  const t = decodeEntities(text).replace(/\s+/g, ' ').trim();
  const m = t.match(/^(.+?)\s*,\s*(.+)$/);
  if (!m) return null;
  const last = titleCaseName(m[1]);
  const firstTokens = titleCaseName(m[2]).split(' ').filter(Boolean);
  if (!firstTokens.length || !last) return null;
  let given = firstTokens[0];
  if (firstTokens.length >= 2 && COMPOUND_FIRST.has(firstTokens[0].toLowerCase()) && COMPOUND_SECOND.has(firstTokens[1].toLowerCase())) {
    given = `${firstTokens[0]}-${firstTokens[1]}`;
  }
  return { name: `${given} ${last}`, firstName: given, lastName: last };
}

/**
 * Parse la fiche publique BCE/KBO (FR) en un objet structuré.
 */
function parseKboHtml(html = '', digits = '') {
  if (!html) return null;
  const t = htmlToText(html);
  const grab = (rx) => (t.match(rx) || [])[1] || '';

  const status = grab(/Statut\s*:\s*([A-Za-zÀ-ÿ]+)/);
  const entityType = grab(/Type d'entité\s*:\s*(Personne \w+)/);
  const legalFormRaw = grab(/Forme légale\s*:\s*(.+?)\s+(?:Depuis le|Nombre d)/);
  const startIso = frDateToIso(grab(/Date de début\s*:\s*(\d{1,2} [A-Za-zÀ-ÿ]+ \d{4})/));
  const name = grab(/Dénomination\s*:\s*(.+?)\s+(?:Dénomination en|Dénomination commerciale|Abréviation|Adresse du siège)/);
  const addressRaw = grab(/Adresse du siège\s*:\s*(.+?)\s+(?:Depuis le|Numéro de téléphone)/);
  const capitalRaw = grab(/Capital\s+([\d.]+,\d{2})\s*EUR/);
  const phone = grab(/Numéro de téléphone\s*:\s*(\+?[\d\s./-]{8,})/).trim();

  const am = addressRaw.match(/^(.*?)\s*(\d{4})\s+(.+)$/);
  const street = am ? am[1].trim() : addressRaw;
  const postalCode = am ? am[2] : '';
  const city = am ? am[3].trim() : '';

  // Activités NACE-BEL (première = principale)
  const naceSection = t.split('Activités TVA')[1] || t.split('Activités')[1] || '';
  const naceMatches = [...naceSection.matchAll(/(\d{2}\.\d{3}) - (.+?)\s+Depuis le/g)].map((m) => ({ code: m[1], label: m[2].trim() }));

  // Titulaires de fonctions (lignes <tr><td>Rôle</td><td>Nom, Prénom | lien n° BCE</td><td>Depuis le …)
  const dirigeants = [];
  const corporateLinks = [];
  const fx = html.split(/<h2>Fonctions<\/h2>/)[1];
  if (fx) {
    const section = fx.split(/<h2>/)[0];
    for (const row of section.matchAll(/<tr><td class="[A-Z]L">\s*([^<]*?)\s*<\/td><td class="[A-Z]L">([\s\S]*?)<\/td>/g)) {
      const role = decodeEntities(row[1]).replace(/\s+/g, ' ').trim();
      if (!role || /commissaire|liquidateur|réviseur|reviseur/i.test(role)) continue;
      const cell = row[2];
      const link = cell.match(/ondernemingsnummer=(\d+)/);
      if (link) {
        corporateLinks.push({
          name: `Personne morale ${formatKboNumber(link[1])}`,
          siren: formatKboNumber(link[1]),
          countryCode: 'BE',
          roleHeld: `${role} (Personne Morale)`,
          legalForm: 'Holding / Personne Morale',
          city: 'Belgique',
        });
        continue;
      }
      const person = parseKboPerson(htmlToText(cell));
      if (!person) continue;
      if (!isValidPhysicalPersonName(person.name, name)) continue;
      if (dirigeants.some((d) => d.name.toLowerCase() === person.name.toLowerCase())) continue;
      dirigeants.push({ name: person.name, firstName: person.firstName, lastName: person.lastName, role, isPrimary: dirigeants.length === 0 });
    }
  }

  return {
    number: formatKboNumber(digits),
    status,
    entityType,
    legalFormRaw,
    startIso,
    name,
    street,
    postalCode,
    city,
    capital: capitalRaw ? Math.round(parseFloat(capitalRaw.replace(/\./g, '').replace(',', '.'))) : null,
    phone: /\d{8}/.test(phone.replace(/\D/g, '')) ? phone : '',
    nace: naceMatches,
    dirigeants,
    corporateLinks,
  };
}

/** Forme légale KBO -> libellé normalisé de l'application (null si non commerciale). */
function normalizeBelgianLegalForm(raw = '') {
  if (/société anonyme/i.test(raw)) return 'SA / NV';
  if (/société (?:privée )?à responsabilité limitée/i.test(raw)) return 'SRL / BV';
  return null;
}

module.exports = {
  fetchGleifCandidates,
  fetchKboHtml,
  parseKboHtml,
  parseKboPerson,
  normalizeBelgianLegalForm,
  formatKboNumber,
};
