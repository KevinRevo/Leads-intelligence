const https = require('https');
const http = require('http');
const { URL } = require('url');

const FAKE_BLACKLIST = new Set([
  '+33 1 84 16 00 00',
  '0184160000',
  '33184160000',
  '+41 22 819 20 00',
  '0228192000',
  '41228192000',
  '0123456789',
  '1234567890',
  '0102030405',
  '0612345678',
  '33612345678',
  '+33 6 12 34 56 78',
]);

/**
 * Normalise et valide un numéro de téléphone pour un pays donné (FR, CH, BE, LU, NL).
 * Renvoie le numéro formaté canonique international ou null si invalide/placeholder.
 */
function normalizePhone(raw, country = 'FR') {
  if (!raw || typeof raw !== 'string') return null;

  let cleaned = raw.trim().replace(/[^\d+]/g, '');
  if (cleaned.startsWith('00')) cleaned = '+' + cleaned.slice(2);

  const digitsOnly = cleaned.replace(/\D/g, '');
  if (digitsOnly.length < 8 || digitsOnly.length > 13) return null;

  // Rejet des séquences bidons (0000000, 1111111, 0123456789, 06 12 34 56 78...)
  if (/^(\d)\1+$/.test(digitsOnly)) return null;
  if (/^(0123456789|1234567890|0102030405|0000000000)/.test(digitsOnly)) return null;
  if (digitsOnly.includes('12345678') || digitsOnly.includes('01020304')) return null;
  if (FAKE_BLACKLIST.has(digitsOnly) || FAKE_BLACKLIST.has(cleaned)) return null;

  // France
  if (country === 'FR') {
    let national9 = '';
    if (cleaned.startsWith('+33')) {
      national9 = cleaned.slice(3);
    } else if (digitsOnly.length === 10 && digitsOnly.startsWith('0')) {
      national9 = digitsOnly.slice(1);
    }
    if (national9.length === 9 && /^[1-9]/.test(national9)) {
      // Rejet des faux numéros type 01 00 00 00 00
      if (/^0+$/.test(national9.slice(1))) return null;
      if (national9 === '184160000') return null; // Ancien faux placeholder
      return `+33 ${national9[0]} ${national9.slice(1, 3)} ${national9.slice(3, 5)} ${national9.slice(5, 7)} ${national9.slice(7, 9)}`;
    }
  }

  // Suisse
  if (country === 'CH') {
    let national9 = '';
    if (cleaned.startsWith('+41')) {
      national9 = cleaned.slice(3);
    } else if (digitsOnly.length === 10 && digitsOnly.startsWith('0')) {
      national9 = digitsOnly.slice(1);
    } else if (digitsOnly.length === 9 && /^[1-9]/.test(digitsOnly)) {
      national9 = digitsOnly;
    }
    if (national9.length === 9 && /^[1-9]/.test(national9)) {
      if (national9 === '228192000') return null; // Ancien faux placeholder
      return `+41 ${national9.slice(0, 2)} ${national9.slice(2, 5)} ${national9.slice(5, 7)} ${national9.slice(7, 9)}`;
    }
  }

  // Belgique
  if (country === 'BE') {
    let national = '';
    if (cleaned.startsWith('+32')) {
      national = cleaned.slice(3);
    } else if (digitsOnly.length >= 9 && digitsOnly.startsWith('0')) {
      national = digitsOnly.slice(1);
    }
    if (national.length >= 8 && national.length <= 9 && /^[1-9]/.test(national)) {
      if (national.length === 8) {
        return `+32 ${national[0]} ${national.slice(1, 4)} ${national.slice(4, 6)} ${national.slice(6, 8)}`;
      }
      return `+32 ${national.slice(0, 2)} ${national.slice(2, 5)} ${national.slice(5, 7)} ${national.slice(7, 9)}`;
    }
  }

  // Luxembourg
  if (country === 'LU') {
    let num = '';
    if (cleaned.startsWith('+352')) {
      num = cleaned.slice(4);
    } else if (digitsOnly.length >= 8 && digitsOnly.length <= 11) {
      num = digitsOnly;
    }
    if (num.length >= 6 && num.length <= 11) {
      return `+352 ${num}`;
    }
  }

  // Pays-Bas
  if (country === 'NL') {
    let national9 = '';
    if (cleaned.startsWith('+31')) {
      national9 = cleaned.slice(3);
    } else if (digitsOnly.length === 10 && digitsOnly.startsWith('0')) {
      national9 = digitsOnly.slice(1);
    }
    if (national9.length === 9 && /^[1-9]/.test(national9)) {
      return `+31 ${national9.slice(0, 2)} ${national9.slice(2, 5)} ${national9.slice(5, 9)}`;
    }
  }

  return null;
}

/**
 * Extrait les numéros réels présents dans le code source HTML d'une page web d'entreprise.
 */
function extractPhonesFromHtml(html, country = 'FR') {
  if (!html || typeof html !== 'string') return [];
  const found = new Set();

  // 1. Priorité 1 : les liens <a href="tel:..."> (signal le plus propre et officiel)
  const telLinkRx = /href\s*=\s*["']tel:([^"'>\s]+)["']/gi;
  let match;
  while ((match = telLinkRx.exec(html)) !== null) {
    const norm = normalizePhone(match[1], country);
    if (norm) found.add(norm);
  }

  // 2. Priorité 2 : Textes contextualisés par un libellé "Tél / Phone / Appelez / Contact"
  const telContextRx = /(?:t[eé]l[eé]phone|t[eé]l\b|phone\b|mobile\b|appelez-nous|contactez-nous|standard)[^0-9+<]{0,25}(\+?[0-9\s()./-]{9,22})/gi;
  while ((match = telContextRx.exec(html)) !== null) {
    const candidate = match[1];
    // Éviter de capturer des codes postaux ou années
    if (/^\s*(?:19|20)\d{2}\s*$/.test(candidate)) continue;
    const norm = normalizePhone(candidate, country);
    if (norm) found.add(norm);
  }

  // 3. Priorité 3 : Motifs nationaux standard dans les balises de contact / footer / header
  if (found.size === 0) {
    if (country === 'FR') {
      const frRx = /(?:\+33[\s.-]*[1-9](?:[\s.-]*\d{2}){4}|\b0[1-9](?:[\s.-]*\d{2}){4}\b)/g;
      while ((match = frRx.exec(html)) !== null) {
        const norm = normalizePhone(match[0], 'FR');
        if (norm) found.add(norm);
      }
    } else if (country === 'CH') {
      const chRx = /(?:\+41[\s.-]*[1-9]\d[\s.-]*\d{3}[\s.-]*\d{2}[\s.-]*\d{2}|\b0[1-9]\d[\s.-]*\d{3}[\s.-]*\d{2}[\s.-]*\d{2}\b|\+41[\s.-]*[1-9]\d[\s.-]*\d{3}[\s.-]*\d{3})/g;
      while ((match = chRx.exec(html)) !== null) {
        const norm = normalizePhone(match[0], 'CH');
        if (norm) found.add(norm);
      }
    } else if (country === 'BE') {
      const beRx = /(?:\+32[\s.-]*[1-9]\d?[\s.-]*(?:\d{2,3}[\s.-]*){2,3}|\b0[1-9]\d?[\s.-]*(?:\d{2,3}[\s.-]*){2,3}\b)/g;
      while ((match = beRx.exec(html)) !== null) {
        const norm = normalizePhone(match[0], 'BE');
        if (norm) found.add(norm);
      }
    }
  }

  return Array.from(found);
}

/**
 * Télécharge une page web avec timeout strict (3500ms max) et extrait le texte/HTML
 */
function fetchHtmlSnippet(targetUrl, timeoutMs = 3500) {
  return new Promise((resolve) => {
    try {
      const u = new URL(targetUrl);
      const mod = u.protocol === 'https:' ? https : http;
      const req = mod.get(u.href, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
        },
        timeout: timeoutMs,
      }, (res) => {
        // Redirection simple (1 saut)
        if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
          try {
            const nextUrl = new URL(res.headers.location, u.href).href;
            req.destroy();
            return resolve(fetchHtmlSnippet(nextUrl, timeoutMs));
          } catch {
            return resolve('');
          }
        }
        if (res.statusCode < 200 || res.statusCode >= 400) {
          req.destroy();
          return resolve('');
        }
        let data = '';
        res.on('data', chunk => {
          if (data.length < 60000) data += chunk.toString();
        });
        res.on('end', () => resolve(data));
      });

      req.on('error', () => resolve(''));
      req.on('timeout', () => { req.destroy(); resolve(''); });
    } catch {
      resolve('');
    }
  });
}

/**
 * Scrape le site internet d'une entreprise pour trouver son vrai numéro de téléphone.
 * Teste d'abord la page d'accueil, puis si aucun numéro n'est trouvé, teste la page /contact.
 */
async function scrapeWebsitePhone(websiteUrl, country = 'FR') {
  if (!websiteUrl) return null;
  let cleanUrl = websiteUrl.trim();
  if (!cleanUrl.startsWith('http')) cleanUrl = `https://${cleanUrl}`;

  try {
    const u = new URL(cleanUrl);
    const origin = u.origin;

    // 1. Test page d'accueil
    const homeHtml = await fetchHtmlSnippet(cleanUrl, 3500);
    let phones = extractPhonesFromHtml(homeHtml, country);
    if (phones.length > 0) {
      return { phone: phones[0], source: `Site internet officiel (${u.hostname})` };
    }

    // 2. Si pas trouvé, test page contact / mentions légales
    const contactPages = [`${origin}/contact`, `${origin}/nous-contacter`, `${origin}/mentions-legales`];
    for (const cp of contactPages) {
      const contactHtml = await fetchHtmlSnippet(cp, 2500);
      phones = extractPhonesFromHtml(contactHtml, country);
      if (phones.length > 0) {
        return { phone: phones[0], source: `Site internet officiel (${u.hostname})` };
      }
    }
  } catch {
    // Non-blocking
  }

  return null;
}

module.exports = {
  normalizePhone,
  extractPhonesFromHtml,
  scrapeWebsitePhone,
  FAKE_BLACKLIST,
};
