/**
 * Ajout de la Belgique (Benelux) à la base — n'altère PAS les sociétés FR / CH déjà présentes.
 * Usage : node server/scripts/scrape-benelux.js [--limit=N]
 */
const fs = require('fs');
const path = require('path');
const { enrichCompany } = require('../services/enricher');
const { isValidCommercialCompany, buildNorthDataUrl } = require('../services/northdata');
const { evaluateRevolutCompliance, isRevolutUnsupportedIndustry } = require('../services/compliance');
const {
  fetchGleifCandidates,
  fetchKboHtml,
  parseKboHtml,
  normalizeBelgianLegalForm,
  formatKboNumber,
} = require('../scrapers/benelux');

const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));
const limitArg = (process.argv.find((a) => a.startsWith('--limit=')) || '').split('=')[1];
const LIMIT = limitArg ? parseInt(limitArg, 10) : Infinity;

const cachePath = path.join(__dirname, '../data/benelux-cache-BE.json');
const cache = fs.existsSync(cachePath) ? JSON.parse(fs.readFileSync(cachePath, 'utf8')) : {};
const saveCache = () => fs.writeFileSync(cachePath, JSON.stringify(cache));

async function runPool(items, concurrency, worker, delayMs = 120) {
  let idx = 0;
  let done = 0;
  const total = items.length;
  async function loop() {
    while (idx < total) {
      const i = idx++;
      await worker(items[i]);
      done++;
      if (done % 100 === 0) {
        saveCache();
        console.log(`[KBO] ${done} / ${total} fiches analysées...`);
      }
      await SLEEP(delayMs);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, loop));
  saveCache();
}

async function getKbo(digits) {
  if (Object.prototype.hasOwnProperty.call(cache, digits)) return cache[digits];
  const html = await fetchKboHtml(digits);
  const parsed = html ? parseKboHtml(html, digits) : null;
  if (html) cache[digits] = parsed; // on ne met pas en cache les échecs réseau
  return parsed;
}

async function main() {
  console.log('=== AJOUT BELGIQUE — GLEIF (découverte) + BCE/KBO (vérification & dirigeants) ===');

  const gleif = await fetchGleifCandidates('BE', '2024-01-01');
  console.log(`[GLEIF] ${gleif.length} entités belges (hors fonds) créées depuis le 01/01/2024.`);

  const NON_COMMERCIAL_NAME = /\b(stichting|foundation|fondation|vzw|asbl|abdij|kerkfabriek|vereniging|mutualit|ziekenfonds|gemeente|commune|openbaar)\b/i;
  const NON_COMMERCIAL_ELF = new Set(['Y1Q4', 'ZUHK']);

  const seen = new Set();
  let candidates = [];
  for (const g of gleif) {
    const digits = (g.registeredAs || '').replace(/\D/g, '');
    if (digits.length < 9 || digits.length > 10) continue;
    const d10 = digits.padStart(10, '0');
    if (seen.has(d10)) continue;
    if (NON_COMMERCIAL_ELF.has(g.elf) || NON_COMMERCIAL_NAME.test(g.name)) continue;
    seen.add(d10);
    candidates.push({ digits: d10, gleif: g });
  }
  if (Number.isFinite(LIMIT)) candidates = candidates.slice(0, LIMIT);
  console.log(`[Pré-filtre] ${candidates.length} candidats à vérifier à la BCE/KBO.`);

  await runPool(candidates, 4, async (c) => {
    c.kbo = await getKbo(c.digits);
  });

  const stats = { noKbo: 0, inactive: 0, notPhysical: 0, badForm: 0, tooOld: 0, noActivity: 0, noDirector: 0, bigCap: 0, invalid: 0, unsupported: 0, ok: 0 };
  const raw = [];

  for (const c of candidates) {
    const k = c.kbo;
    if (!k) { stats.noKbo++; continue; }
    if (!/^actif$/i.test(k.status)) { stats.inactive++; continue; }
    if (!/morale/i.test(k.entityType)) { stats.notPhysical++; continue; }
    const legalForm = normalizeBelgianLegalForm(k.legalFormRaw);
    if (!legalForm) { stats.badForm++; continue; }
    if (!k.startIso || k.startIso < '2024-01-01') { stats.tooOld++; continue; }
    if (!k.nace.length) { stats.noActivity++; continue; }
    if (!k.dirigeants.length) { stats.noDirector++; continue; }
    if (k.capital && k.capital > 5000000) { stats.bigCap++; continue; }

    // Résolution des noms des personnes morales administrateurs (n° BCE -> dénomination)
    const corporateLinks = [];
    for (const cl of k.corporateLinks) {
      const kd = cl.siren.replace(/\D/g, '');
      const sub = await getKbo(kd);
      if (sub && sub.name) corporateLinks.push({ ...cl, name: sub.name, city: sub.city || 'Belgique' });
    }

    const rawComp = {
      id: `BE-${c.digits}`,
      country: 'BE',
      countryName: 'Belgique',
      name: k.name,
      registrationNumber: formatKboNumber(c.digits),
      incorporationDate: k.startIso,
      incorporationYear: k.startIso.slice(0, 4),
      legalForm,
      shareCapital: k.capital || 0,
      revenue: null,
      revenueYear: null,
      activity: k.nace.map((n) => n.label).join('. '),
      nafCode: k.nace[0].code,
      address: `${k.street}, ${k.postalCode} ${k.city}`.trim(),
      city: k.city,
      postalCode: k.postalCode,
      dirigeants: k.dirigeants,
      corporateLinks,
      phone: k.phone || null,
      phoneSource: k.phone ? 'BCE / KBO (Registre belge des entreprises)' : undefined,
      source: 'BCE / KBO (Registre belge des entreprises) & GLEIF',
      crmStatus: 'new',
      crmNotes: '',
      crmAssignedTo: null,
      lastContactedAt: null,
      createdAt: new Date().toISOString(),
    };
    if (!rawComp.phoneSource) delete rawComp.phoneSource;

    if (!isValidCommercialCompany(rawComp)) { stats.invalid++; continue; }
    if (isRevolutUnsupportedIndustry(rawComp)) { stats.unsupported++; continue; }
    const comp = evaluateRevolutCompliance(rawComp);
    if (!comp.isEligible || comp.status === 'restricted') { stats.unsupported++; continue; }
    stats.ok++;
    raw.push(rawComp);
  }
  console.log('[Filtres]', JSON.stringify(stats));

  console.log(`[Enrichissement] ${raw.length} sociétés belges — site web (.be) anti-homonyme, MX, scores...`);
  const enriched = [];
  for (let i = 0; i < raw.length; i += 25) {
    const batch = await Promise.all(raw.slice(i, i + 25).map((c) => enrichCompany(c)));
    enriched.push(...batch);
    console.log(`[Enrichissement] ${Math.min(i + 25, raw.length)} / ${raw.length}`);
  }

  // Fusion avec la base existante (FR / CH inchangées)
  const dbPath = path.join(__dirname, '../data/db.json');
  const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  const existing = (db.companies || []).filter((c) => c.country !== 'BE');
  const final = enriched.filter((c) => isValidCommercialCompany(c) && !isRevolutUnsupportedIndustry(c));
  for (const c of final) {
    c.northDataUrl = buildNorthDataUrl(c);
    delete c.network;
  }
  const all = [...existing, ...final].sort((a, b) => (b.incorporationDate || '').localeCompare(a.incorporationDate || ''));

  const count = (cc) => all.filter((c) => c.country === cc).length;
  const statsOut = {
    total: all.length,
    france: count('FR'),
    switzerland: count('CH'),
    belgium: count('BE'),
    franceCount: count('FR'),
    switzerlandCount: count('CH'),
    belgiumCount: count('BE'),
  };

  db.companies = all;
  db.syncHistory = [
    { id: `sync-benelux-${Date.now()}`, timestamp: new Date().toISOString(), country: 'BE', added: final.length, totalAfter: all.length },
    ...(db.syncHistory || []).slice(0, 15),
  ];
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));

  const bundle = { lastSync: new Date().toISOString(), total: all.length, companies: all, stats: statsOut };
  fs.writeFileSync(path.join(__dirname, '../../client/public/data.json'), JSON.stringify(bundle));
  fs.writeFileSync(path.join(__dirname, '../../data.json'), JSON.stringify(bundle));
  fs.writeFileSync(path.join(__dirname, '../../client/src/data/companies.json'), JSON.stringify(all));

  console.log(`=== RÉSULTAT === Belgique ajoutée : ${final.length} | FR : ${statsOut.france} | CH : ${statsOut.switzerland} | Total : ${all.length}`);
}

main().catch((e) => {
  console.error('Erreur fatale:', e);
  process.exit(1);
});
