const fs = require('fs');
const path = require('path');

function prepareClientChunks(companiesList = null) {
  let all = companiesList;
  if (!all) {
    const dbPath = path.join(__dirname, '../data/db.json');
    if (fs.existsSync(dbPath)) {
      try {
        const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
        all = db.companies || [];
      } catch (e) {
        all = [];
      }
    } else {
      // Reconstitute from existing chunks if available
      const p1 = path.join(__dirname, '../../client/src/data/companies-part1.json');
      const p2 = path.join(__dirname, '../../client/src/data/companies-part2.json');
      if (fs.existsSync(p1) && fs.existsSync(p2)) {
        all = [...JSON.parse(fs.readFileSync(p1, 'utf8')), ...JSON.parse(fs.readFileSync(p2, 'utf8'))];
      } else {
        all = [];
      }
    }
  }

  console.log(`[Chunks] Préparation des bundles pour ${all.length} sociétés...`);

  // Mapping propre pour le bundle client (suppression du bruit debug pour passer sous les quotas GitHub Pages)
  const cleanCompanies = all.map((c) => ({
    id: c.id,
    country: c.country,
    countryName: c.countryName,
    name: c.name,
    registrationNumber: c.registrationNumber,
    incorporationDate: c.incorporationDate,
    incorporationYear: c.incorporationYear,
    legalForm: c.legalForm,
    shareCapital: c.shareCapital,
    revenue: c.revenue,
    revenueYear: c.revenueYear,
    activity: (c.activity && c.activity.length > 250) ? (c.activity.slice(0, 247) + '...') : (c.activity || ''),
    activityCategory: c.activityCategory || 'Services B2B',
    address: c.address,
    city: c.city,
    postalCode: c.postalCode,
    canton: c.canton,
    dirigeants: c.dirigeants || [],
    corporateLinks: c.corporateLinks || [],
    internationalLinks: c.internationalLinks || [],
    website: c.website || null,
    domain: c.domain || null,
    phone: c.phone || null,
    emails: c.emails || [],
    bestEmail: c.bestEmail || null,
    cfo: c.cfo || null,
    linkedinCompanyUrl: c.linkedinCompanyUrl || null,
    linkedinDirigeantUrl: c.linkedinDirigeantUrl || null,
    northDataUrl: c.northDataUrl || null,
    isCrossBorder: Boolean(c.isCrossBorder),
    crmStatus: c.crmStatus || 'new',
    crmNotes: c.crmNotes || '',
    crmAssignedTo: c.crmAssignedTo || null,
    lastContactedAt: c.lastContactedAt || null,
    confidenceScore: c.confidenceScore || 85,
    source: c.source || 'Registre Officiel',
    fxPotential: c.fxPotential ? { level: c.fxPotential.level, label: c.fxPotential.label } : undefined,
  }));

  const half = Math.ceil(cleanCompanies.length / 2);
  const part1 = cleanCompanies.slice(0, half);
  const part2 = cleanCompanies.slice(half);

  const part1Path = path.join(__dirname, '../../client/src/data/companies-part1.json');
  const part2Path = path.join(__dirname, '../../client/src/data/companies-part2.json');

  fs.mkdirSync(path.dirname(part1Path), { recursive: true });
  fs.writeFileSync(part1Path, JSON.stringify(part1));
  fs.writeFileSync(part2Path, JSON.stringify(part2));

  console.log(`[Chunks] Part 1 : ${part1.length} sociétés -> ${(fs.statSync(part1Path).size / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`[Chunks] Part 2 : ${part2.length} sociétés -> ${(fs.statSync(part2Path).size / (1024 * 1024)).toFixed(2)} MB`);

  // Conserver data.json unifié et minifié
  const count = (cc) => cleanCompanies.filter((c) => c.country === cc).length;
  const bundle = {
    lastSync: new Date().toISOString(),
    total: cleanCompanies.length,
    companies: cleanCompanies,
    stats: {
      total: cleanCompanies.length,
      france: count('FR'),
      switzerland: count('CH'),
      belgium: count('BE'),
      luxembourg: count('LU'),
      netherlands: count('NL'),
      franceCount: count('FR'),
      switzerlandCount: count('CH'),
      belgiumCount: count('BE'),
      luxembourgCount: count('LU'),
      netherlandsCount: count('NL'),
    }
  };

  const pubDataPath = path.join(__dirname, '../../client/public/data.json');
  const rootDataPath = path.join(__dirname, '../../data.json');
  fs.mkdirSync(path.dirname(pubDataPath), { recursive: true });
  fs.writeFileSync(pubDataPath, JSON.stringify(bundle));
  fs.writeFileSync(rootDataPath, JSON.stringify(bundle));

  console.log(`[Chunks] data.json minifié sauvegardé (${(fs.statSync(pubDataPath).size / (1024 * 1024)).toFixed(2)} MB).`);
  return { part1, part2, bundle };
}

if (require.main === module) {
  prepareClientChunks();
}

module.exports = { prepareClientChunks };
