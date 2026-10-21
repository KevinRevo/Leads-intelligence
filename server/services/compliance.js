/**
 * Liste officielle complète des industries NON ÉLIGIBLES sur Revolut Business
 * ("Unsupported industries for Revolut Business" - FR / DE / EN / IT & codes NAF)
 */
const REVOLUT_UNSUPPORTED_RULES = [
  // 1. Weapons, defence, armaments & UK/EU strategic export control / military / dual-use goods
  {
    id: 'weapons_defence',
    industry: 'Weapons, Defence & Armaments / Dual-Use',
    reason: 'Armes, défense, armement, munitions, pyrotechnie ou biens militaires / à double usage sous contrôle d\'exportation stratégique.',
    pattern: /\b(armement|arme|armes|munition|munitions|militaire|militaires|défense nationale|defense militaire|matériel de guerre|materiel de guerre|balistique|explosif|explosifs|pyrotechn|tir sportif|armurerie|airsoft|waffen|munition|rüstung|militär|sprengstoff|weapons|firearms|ammunition|military|armaments|dual-use)\b/i,
    nafPrefix: ['25.4', '20.51', '30.4', '47.78B']
  },
  // 2. Adult content and services
  {
    id: 'adult_content',
    industry: 'Adult Content & Services',
    reason: 'Contenus et services pour adultes, érotisme, sex-shops ou rencontres pour adultes.',
    pattern: /\b(adulte|adultes|érotique|erotique|érotisme|pornograph|sex-shop|sexshop|sexy|lingerie fine érotique|escort|strip-tease|striptease|cabaret de charme|charme|onlyfans|camgirl|erotik|sexkino|prostitution)\b/i
  },
  // 3. Auctions and fine art dealing
  {
    id: 'auctions_fine_art',
    industry: 'Auctions & Fine Art Dealing',
    reason: 'Ventes aux enchères, commissaires-priseurs, galeries d\'art, marchands d\'art et négoce d\'objets d\'art ou d\'antiquités.',
    pattern: /\b(enchères|encheres|vente aux enchères|commissaire-priseur|hotel des ventes|hôtel des ventes|galerie d'art|marchand d'art|négoce d'art|negoce d'art|oeuvres d'art|œuvres d'art|objets d'art|fine art|art dealer|art gallery|antiquité|antiquites|antiquaire|brocante|numismatique|kunsthandel|kunstgalerie|auktion|auktionshaus|antiquitäten)\b/i,
    nafPrefix: ['47.78C', '47.79Z', '90.03B']
  },
  // 4. Cannabinoids and controlled chemicals (plus tobacco/vape restrictions)
  {
    id: 'cannabinoids_controlled',
    industry: 'Cannabinoids & Controlled Chemicals',
    reason: 'Cannabinoïdes (CBD, chanvre, cannabis) et substances chimiques contrôlées.',
    pattern: /\b(cbd|cannabis|cannabino|chanvre|thc|hanf|marijuana|stupéfiant|stupefiant|narcotique|psychotrope|tabac|cigarette|vape|vapote|e-liquide|chicha)\b/i
  },
  // 5. Unregulated or high-risk financial services & Client funds management
  {
    id: 'unregulated_finance_client_funds',
    industry: 'Unregulated Financial Services & Client Funds Management',
    reason: 'Services financiers non régulés, change manuel, transfert de fonds, recouvrement de créances, prêt sur gage ou détention/gestion de fonds appartenant à des clients (Client Funds Management).',
    pattern: /\b(prêt sur gage|pret sur gage|pawnshop|pfandhaus|recouvrement de créances|recouvrement de creances|société de recouvrement|inkasso|debt collection|bureau de change|change de devises|wechselstube|transfert d'argent|transfert de fonds|money transfer|remittance|western union|fonds de tiers|fonds clients|pour le compte de tiers|encaissement pour compte de tiers|séquestre|sequestre|escrow|syndic de copropriété|syndic de copropriete|fiducie|forex|cfd|options binaires|binary options|courtage spéculatif|high-risk financial)\b/i,
    nafPrefix: ['64.92', '66.12', '82.91']
  },
  // 6. Diplomatic or political entities
  {
    id: 'diplomatic_political',
    industry: 'Diplomatic or Political Entities',
    reason: 'Entités diplomatiques, ambassades, consulats, partis ou organisations politiques et syndicats.',
    pattern: /\b(ambassade|consulat|diplomati|parti politique|organisation politique|campagne électorale|campagne electorale|syndicat professionnel|botschaft|konsulat|politische partei)\b/i,
    nafPrefix: ['94.92', '99.00']
  },
  // 7. Gambling and quasi-cash merchants
  {
    id: 'gambling_quasicash',
    industry: 'Gambling & Quasi-Cash Merchants',
    reason: 'Jeux d\'argent et de hasard, paris sportifs, casinos, loteries, poker et marchands quasi-cash.',
    pattern: /\b(casino|casinos|jeux d'argent|jeux de hasard|pari|paris sportifs|bookmaker|gambling|betting|loterie|loto|poker|pronostic|pronostics|turf|pmu|glücksspiel|wetten|spielbank|spielhalle|quasi-cash)\b/i,
    nafPrefix: ['92.00']
  },
  // 8. Charities, foundations, trusts, and religious organisations
  {
    id: 'charities_foundations_trusts_religious',
    industry: 'Charities, Foundations, Trusts & Religious Organisations',
    reason: 'Organisations caritatives, ONG, fondations (Stiftung), trusts, fiducies et organisations religieuses ou cultuelles.',
    pattern: /\b(charité|charite|caritatif|caritative|charity|philanthrop|fondation|stiftung|fondazione|familienstiftung|trust\b|trustee|fiducie|religieux|religieuse|organisation religieuse|culte|église|eglise|paroisse|mosquée|mosquee|synagogue|temple|monastère|kirchlich|religiös)\b/i,
    nafPrefix: ['94.91', '94.99', '88.99']
  },
  // 9. Secondhand vehicles and heavy equipment
  {
    id: 'secondhand_vehicles_heavy_equipment',
    industry: 'Secondhand Vehicles & Heavy Equipment',
    reason: 'Achat, vente et négoce de véhicules d\'occasion (voitures, motos, utilitaires, camions) et d\'équipements lourds / engins de chantier ou agricoles.',
    pattern: /\b(véhicules d'occasion|vehicules d'occasion|voitures d'occasion|autos d'occasion|achat et vente de véhicules|achat-vente de véhicules|achat vente de vehicules|négoce automobile|negoce automobile|négoce de véhicules|negoce de vehicules|commerce de voitures|commerce de véhicules|concessionnaire automobile|mandataire automobile|import-export de véhicules|achat et revente de véhicules|vente de voitures|vente de véhicules|occasion automobile|poids lourds|camions|engins de chantier|matériel lourd|materiel lourd|machines lourdes|engins btp|machines agricoles|macchine agricole|macchine movimento terra|engins agricoles|tracteurs|gebrauchtwagen|fahrzeugen aller art|handel mit fahrzeugen|autohandel|fahrzeughandel|baumaschinen|landmaschinen|heavy equipment|used cars|secondhand vehicles|car dealer)\b/i,
    nafPrefix: ['45.11', '45.19', '45.40', '46.63', '46.61']
  },
  // 10. Special purpose vehicles/entities (SPV / SPE / Acquisition SPVs / Tax-shelter SNCs)
  {
    id: 'spv_entities',
    industry: 'Special Purpose Vehicles / Entities (SPV)',
    reason: 'Véhicules de titrisation, Special Purpose Vehicles (SPV / SPE), véhicules d\'acquisition ad hoc (AcquiCo / BidCo / Acquisition AG) ou SNC de défiscalisation.',
    pattern: /\b(\bspv\b|\bspe\b|special purpose vehicle|special purpose entity|titrisation|fonds commun de titrisation|société de titrisation|véhicule d'investissement ad hoc|véhicule d'acquisition|zweckgesellschaft|securitisation|acquico|bidco|topco|midco|finco|mergeco|group acquisition\b|acquisition ag\b|acquisition sa\b|acquisition gmbh\b|acquisition sàrl\b|acquisition sas\b)\b/i,
    nafPrefix: ['64.30']
  },
  // 11. Streaming and video game arcades
  {
    id: 'streaming_arcades',
    industry: 'Streaming & Video Game Arcades',
    reason: 'Salles de jeux vidéo d\'arcade et plateformes de live streaming.',
    pattern: /\b(salle d'arcade|salles d'arcade|jeux d'arcade|video game arcade|spielhalle|arcade games|live streaming|plateforme de streaming|streaming vidéo|streaming musical)\b/i
  },
  // 12. Trading restricted/endangered animal/plant products
  {
    id: 'endangered_species',
    industry: 'Restricted / Endangered Animal & Plant Products',
    reason: 'Commerce d\'espèces animales ou végétales protégées, fourrure, ivoire ou bois exotiques réglementés (CITES).',
    pattern: /\b(espèces protégées|especes protegees|animaux exotiques|ivoire|fourrure|fourrures|pelleterie|cites\b|bois précieux protégés|pelzhandel|artenschutz|endangered species)\b/i
  },
  // 13. Pyramid and get-rich-quick schemes
  {
    id: 'pyramid_mlm',
    industry: 'Pyramid & Get-Rich-Quick Schemes',
    reason: 'Vente pyramidale, marketing de réseau (MLM) ou programmes d\'enrichissement rapide.',
    pattern: /\b(pyramidal|vente pyramidale|mlm\b|marketing de réseau|marketing de reseau|marketing multiniveau|network marketing|strukturvertrieb|get rich quick|revenus passifs garantis)\b/i
  },
  // 14. Oil, gas, and certain industrial sectors (exploration, extraction, refining, tankers, pipelines, marketing of petroleum)
  {
    id: 'oil_gas_petroleum',
    industry: 'Oil, Gas & Petroleum Products',
    reason: 'Pétrole, gaz, hydrocarbures : exploration, extraction, raffinage, transport par tankers/pipelines et commercialisation de produits pétroliers ou miniers.',
    pattern: /\b(pétrole|petrole|pétrolier|petrolier|produits pétroliers|produits petroliers|hydrocarbure|hydrocarbures|raffinage|raffinerie|forage pétrolier|extraction pétrolière|extraction minière|gaz naturel|gnl\b|pipeline|oil tanker|station-service|carburant|carburants|fioul|mazout|bitume|charbon|houille|uranium|erdöl|erdgas|mineralöl|rohöl|tankstelle|brennstoff|oil and gas|oil & gas|petroleum|crude oil|totalenergies)\b/i,
    nafPrefix: ['05.', '06.', '07.', '08.9', '09.', '19.', '46.71', '47.30']
  },
  // 15. Fake or counterfeit goods
  {
    id: 'counterfeit_goods',
    industry: 'Fake or Counterfeit Goods',
    reason: 'Marchandises contrefaites, répliques ou copies non autorisées.',
    pattern: /\b(contrefaçon|contrefacon|réplique de montre|repliques|imitation de marque|counterfeit|fälschung)\b/i
  },
  // 16. Precious metals & stone dealers (gold, silver, diamonds, jewelry, precious stones, watch/jewelry trading)
  {
    id: 'precious_metals_stones',
    industry: 'Precious Metals & Stone Dealers',
    reason: 'Négoce de métaux précieux (or, argent, platine), pierres précieuses, diamants, joaillerie et bijouterie.',
    pattern: /\b(métaux précieux|metaux precieux|or brut|achat d'or|vente d'or|négoce d'or|negoce d'or|gold capital|gold trading|lingot|pièces d'or|pieces d'or|diamant|diamants|diamantaire|pierres précieuses|pierres precieuses|pierres fines|gemmologie|joaillerie|joaillier|bijouterie|bijoutier|horlogerie-bijouterie|montres de luxe|négoce de montres|edelmetall|edelmetalle|goldhandel|diamanten|edelsteine|schmuckhandel|juwelier|precious metals|precious stones|bullion|diamond dealer)\b/i,
    nafPrefix: ['32.12', '46.48', '46.72', '47.77']
  },
  // 17. Chemicals and allied products
  {
    id: 'chemicals_allied',
    industry: 'Chemicals & Allied Products',
    reason: 'Fabrication, distribution ou négoce de produits chimiques, solvants, engrais chimiques et matières connexes.',
    pattern: /\b(produits chimiques|produit chimique|industrie chimique|négoce chimique|negoce chimique|chimie industrielle|chemitech|solvant|solvants|acide industriel|pesticide|pesticides|phytosanitaire|engrais chimique|matières dangereuses|matieres dangereuses|chemikalien|chemische produkte|chemische industrie|chemiehandel|chemicals)\b/i,
    nafPrefix: ['20.1', '20.2', '20.3', '20.5', '20.6', '46.75']
  },
  // 18. Unsupported Cryptocurrency firms (Exchanges, brokers, dealers, ATMs, ICOs, mining, investment/trading/asset management, unregulated custodial)
  {
    id: 'unsupported_crypto',
    industry: 'Unsupported Cryptocurrency Activity (Exchange / Broker / Mining / ICO / Trading)',
    reason: 'Plateformes d\'échange crypto, courtiers/dealers crypto, distributeurs ATM crypto, ICO, minage de crypto, trading ou gestion d\'actifs crypto.',
    pattern: /\b(crypto.?exchange|échange de crypto|echange de crypto|courtier en crypto|crypto broker|crypto dealer|crypto atm|distributeur bitcoin|\bico\b|initial coin offering|minage de crypto|crypto mining|bitcoin mining|ferme de minage|crypto trading|trading de crypto|investissement en crypto|fonds crypto|crypto asset management|gestion d'actifs numériques|gestion de portefeuille crypto|kryptobörse|krypto-mining|kryptohandel)\b/i
  },
  // 19. Mots-clés néerlandais (Belgique flamande / Pays-Bas) des industries non supportées
  {
    id: 'benelux_nl_terms',
    industry: 'Unsupported Industry (termes NL)',
    reason: 'Activité (libellé néerlandais) relevant d\'une industrie exclue par Revolut Business : armes, adulte, enchères/art, cannabis, jeux d\'argent, véhicules/engins d\'occasion, pétrole/gaz, métaux/pierres précieuses, produits chimiques, crypto-échange.',
    pattern: /\b(wapens|wapenhandel|munitie|erotiek|erotische|seksshop|veiling|veilinghuis|kunsthandel|kunstgalerij|antiquair|cannabis|hennep|gokken|gokhal|goksector|weddenschappen|loterij|tweedehands (?:auto|wagens|voertuigen)|handel in (?:tweedehands|gebruikte) (?:auto|voertuigen|machines)|zware machines|bouwmachines|landbouwmachines|aardolie|aardgas|brandstoffen|petroleum|edelmetaal|edelmetalen|goud(?:handel)?|juwelen|juwelier|diamanten|edelstenen|chemische producten|chemicali[eë]n|cryptobeurs|crypto-?handel|cryptomining|piramide|netwerkmarketing)\b/i
  }
];

/**
 * Vérifie si une entreprise exerce une activité exclue par Revolut Business.
 * Retourne l'objet de règle si exclu, ou `null` si l'entreprise est éligible.
 */
function getUnsupportedIndustryMatch(company) {
  if (!company) return null;
  const activity = (company.activity || '').toLowerCase();
  const name = (company.name || '').toLowerCase();
  const rawName = (company.name || '').trim();
  const category = (company.activityCategory || '').toLowerCase();
  const pubText = (company.pubText || '').toLowerCase();
  const lf = (company.legalForm || '').toUpperCase().trim();
  const naf = (company.nafCode || '').toUpperCase().trim();
  const fullText = `${name} ${activity} ${category} ${pubText}`;

  // Detect Loi Girardin / DOM-TOM tax-shelter SPV SNCs and serial-numbered SPV shells
  // (e.g. "PRONY 44", "MARVIC 864", "TECOMA 44", "SEQUOIA 85", "MUTUAL'IR 8 010", "HONU TAH 313", "HMONG AGRICOLE 949", "Hera TE 7 SA", "4 HUAHINE 2026")
  if (
    lf === 'SNC' ||
    /\b([A-ZÀ-Ÿ']+\s+\d{2,4}|\d+\s+[A-ZÀ-Ÿ]+\s+202\d|Hera\s+TE\s+\d+|Brusus\s+\d+)\b/i.test(rawName)
  ) {
    return {
      id: 'spv_entities',
      industry: 'Special Purpose Vehicles / Entities (SPV / SNC)',
      reason: 'Véhicule ad hoc (SPV / SNC de portage ou de défiscalisation) exclu par la politique Revolut Business.'
    };
  }

  // Check if it's an ACCEPTED blockchain/crypto tech company before flagging generic crypto keywords
  const isAcceptedBlockchainTech = /\b(blockchain consulting|conseil en blockchain|développement blockchain|developpement blockchain|application blockchain|nft platform|plateforme nft|non-custodial wallet|portefeuille non-custodial|formation blockchain|blockchain learning|blockchain news)\b/i.test(fullText) &&
    !/\b(exchange|broker|dealer|mining|minage|ico|trading|asset management|investissement)\b/i.test(fullText);

  for (const rule of REVOLUT_UNSUPPORTED_RULES) {
    if (rule.id === 'unsupported_crypto' && isAcceptedBlockchainTech) {
      continue;
    }
    if (rule.nafPrefix && naf) {
      if (rule.nafPrefix.some(prefix => naf.startsWith(prefix))) {
        return rule;
      }
    }
    if (rule.pattern.test(fullText)) {
      return rule;
    }
  }

  // Generic crypto/token trading catch-all if not explicitly in the accepted blockchain tech list
  if (!isAcceptedBlockchainTech && /\b(crypto-monnaie|cryptomonnaie|cryptocurrency|bitcoin|ethereum|kryptowährung)\b/i.test(fullText)) {
    return {
      id: 'unsupported_crypto_generic',
      industry: 'Unsupported Cryptocurrency / Virtual Asset Activity',
      reason: 'Activité liée au négoce, courtage, investissement ou gestion de crypto-actifs non supportée par Revolut Business.'
    };
  }

  return null;
}

function isRevolutUnsupportedIndustry(company) {
  return Boolean(getUnsupportedIndustryMatch(company));
}

function evaluateRevolutCompliance(company) {
  const unsupportedMatch = getUnsupportedIndustryMatch(company);
  if (unsupportedMatch) {
    return {
      status: 'restricted',
      badge: '🔴 Non éligible Revolut',
      tag: '🔴 Unsupported Industry',
      industry: unsupportedMatch.industry,
      color: 'rose',
      reason: unsupportedMatch.reason,
      isEligible: false
    };
  }

  const activity = (company.activity || '').toLowerCase();
  const primaryActivity = (company.activity || '').split(/\.\s+/)[0].toLowerCase();
  const name = (company.name || '').toLowerCase();
  const category = (company.activityCategory || '').toLowerCase();
  const primaryText = `${name} ${primaryActivity} ${category}`;

  // 2. PASTILLE JAUNE : Activités éligibles mais nécessitant des justificatifs KYB renforcés
  const regulatedIndustries = [
    {
      pattern: /\b(holding|participations|societe de portefeuille|société de portefeuille|beteiligungen|family office)\b/i,
      industry: 'Holding & Gestion de Participations (Propre Compte)',
      reason: 'Holding patrimoniale ou opérationnelle (sans gestion de fonds clients tiers) : nécessite l\'organigramme de détention et l\'identité des bénéficiaires effectifs (UBO).'
    },
    {
      pattern: /\b(marchand de biens|promotion immobiliere|promotion immobilière|construction-vente|immobilienentwicklung|generalunternehmung)\b/i,
      industry: 'Promotion Immobilière & Marchands de Biens',
      reason: 'Opérations immobilières pour compte propre (sans détention de fonds mandants/syndic) : justificatifs d\'origine des fonds requis.'
    },
    {
      pattern: /\b(blockchain consulting|conseil en blockchain|développement blockchain|nft platform|non-custodial wallet)\b/i,
      industry: 'Services Tech Blockchain / NFT / Wallet Non-Custodial',
      reason: 'Activité technologique ou conseil Blockchain acceptée par Revolut Business (hors échange, courtage, ICO ou minage).'
    }
  ];

  for (const item of regulatedIndustries) {
    if (item.pattern.test(primaryText)) {
      return {
        status: 'conditional',
        badge: '🟡 Éligible (KYB Renforcé)',
        tag: '🟡 KYB Renforcé',
        industry: item.industry,
        color: 'amber',
        reason: item.reason,
        isEligible: true
      };
    }
  }

  // 3. PASTILLE VERTE : Industries standards 100% Éligibles Revolut Business
  return {
    status: 'eligible',
    badge: '🟢 Éligible Revolut',
    tag: '🟢 Industrie Supportée',
    industry: company.activityCategory || 'Commerce, Services & Industrie',
    color: 'emerald',
    reason: 'Activité commerciale ou de services B2B/B2C conforme à la politique d\'acceptation Revolut Business (aucune activité sur la liste Unsupported Industries et aucune gestion de fonds clients tiers).',
    isEligible: true
  };
}

/**
 * Détecteur de Besoins FX / Multi-Devises (Score "Potentiel Revolut FX")
 * Analyse l'activité, le pays (Suisse CHF vs Zone Euro EUR), le capital, la zone frontalière
 * et la gouvernance pour identifier le potentiel de revenus FX & paiements internationaux.
 */
function evaluateFxPotential(company) {
  const activity = (company.activity || '').toLowerCase();
  const name = (company.name || '').toLowerCase();
  const category = (company.activityCategory || '').toLowerCase();
  const fullText = `${name} ${activity} ${category}`;
  const isCH = company.country === 'CH';
  const capital = Number(company.shareCapital) || 0;
  const canton = (company.canton || '').toUpperCase();
  const dept = (company.postalCode || '').slice(0, 2);

  let score = 0;
  const reasons = [];
  const currencySet = new Set(isCH ? ['CHF', 'EUR'] : ['EUR']);

  // 1. Facteur Suisse (CHF <-> EUR / USD)
  if (isCH) {
    score += 35;
    currencySet.add('USD');
    reasons.push('Société suisse (compte principal CHF) avec flux fournisseurs/clients naturels en Zone Euro (EUR)');
    if (['GE', 'VD', 'BS', 'BL', 'TI', 'ZG', 'ZH', 'VS'].includes(canton)) {
      score += 15;
      reasons.push(`Implantée dans le hub international / frontalier de ${company.city || canton} (${canton})`);
    }
  } else if (!company.country || company.country === 'FR') {
    // Départements frontaliers (Suisse, Allemagne, Belgique, Italie, Monaco) ou hubs internationaux FR
    if (['74', '68', '67', '06', '59', '75', '92', '69'].includes(dept)) {
      score += 15;
      if (['74', '68'].includes(dept)) {
        currencySet.add('CHF');
        reasons.push(`Zone frontalière franco-suisse (Dépt ${dept}) à forts flux EUR ↔ CHF`);
      } else {
        currencySet.add('USD');
        reasons.push(`Pôle économique à forte ouverture internationale (Dépt ${dept})`);
      }
    }
  }

  // 2. Analyse sémantique de l'objet social (Import/Export, SaaS, E-Commerce, Luxe, Industrie)
  if (/\b(import|export|négoce|negoce|international|trading|handel|welthandel|grossiste|wholesale|douane|transit|fret|shipping|maritime|aérien|logistique internationale|supply chain)\b/i.test(fullText)) {
    score += 45;
    currencySet.add('USD');
    currencySet.add('CNY');
    currencySet.add('GBP');
    reasons.push('Activité d\'Import-Export / Négoce international : paiements fournisseurs récurrents en USD, EUR, GBP ou CNY');
  } else if (/\b(logiciel|saas|software|cloud|intelligence artificielle|\bia\b|data|cyber|plateforme|application|tech|digital|numérique|it services|développement informatique)\b/i.test(fullText)) {
    score += 35;
    currencySet.add('USD');
    reasons.push('Secteur Tech / SaaS : facturation d\'infrastructures Cloud & outils logiciels en USD + scalabilité internationale');
  } else if (/\b(e-commerce|vente en ligne|vente à distance|marketplace|boutique en ligne|dropshipping|achat-revente|distribution)\b/i.test(fullText)) {
    score += 35;
    currencySet.add('USD');
    currencySet.add('GBP');
    reasons.push('E-Commerce & Distribution : encaissements clients multi-devises et achats fournisseurs hors zone Euro');
  } else if (/\b(mode|cosmétique|parfum|conciergerie|yacht|aviation|hôtellerie|tourisme|voyage|travel)\b/i.test(fullText)) {
    score += 30;
    currencySet.add('USD');
    currencySet.add('CHF');
    currencySet.add('GBP');
    reasons.push('Hôtellerie, Tourisme & Conciergerie : clientèle internationale (encaissements USD, CHF, GBP)');
  } else if (/\b(industrie|ingénierie|engineering|fabrication|manufacture|biotech|medtech|pharma|médical|laboratoire|énergie|solaire|cleantech|aéronautique)\b/i.test(fullText)) {
    score += 25;
    currencySet.add('USD');
    reasons.push('Industrie & Ingénierie : approvisionnement en composants/équipements sur les marchés internationaux');
  } else if (/\b(conseil|consulting|management|investissement|holding|participations|acquisition|private equity|family office|venture)\b/i.test(fullText)) {
    score += 22;
    currencySet.add('USD');
    reasons.push('Conseil B2B & Holding : honoraires internationaux et gestion de trésorerie multi-devises');
  }

  // 3. Facteur Capital Social (Capacité financière & volume de flux)
  if (capital >= 100000) {
    score += 20;
    currencySet.add('USD');
    reasons.push(`Capital social élevé (${capital.toLocaleString('fr-FR')} ${isCH ? 'CHF' : '€'}) indiquant un fort volume de trésorerie`);
  } else if (capital >= 20000) {
    score += 10;
  }

  // 4. Facteur Groupe / Holding / Multi-décideurs
  if ((company.corporateLinks && company.corporateLinks.length > 0) || (company.dirigeants && company.dirigeants.length >= 2)) {
    score += 10;
  }

  score = Math.min(98, Math.max(15, score));
  const currencies = Array.from(currencySet);

  if (score >= 60) {
    return {
      level: 'high',
      score,
      badge: `💱 Fort Potentiel FX (${currencies.slice(0, 3).join('/')})`,
      shortBadge: '💱 Fort Potentiel FX',
      currencies,
      reasons: reasons.slice(0, 3)
    };
  }

  if (score >= 38) {
    return {
      level: 'medium',
      score,
      badge: `🌐 FX Modéré (${currencies.slice(0, 2).join('/')})`,
      shortBadge: '🌐 FX Modéré',
      currencies,
      reasons: reasons.length > 0 ? reasons.slice(0, 2) : ['Dépenses logiciels/fournisseurs ponctuelles en devises étrangères']
    };
  }

  return {
    level: 'low',
    score,
    badge: '🏠 Flux Domestiques',
    shortBadge: '🏠 Domestique',
    currencies,
    reasons: ['Activité principalement locale (flux EUR / CHF)']
  };
}

/**
 * Détermine la zone géographique / linguistique (Suisse Romande FR vs Alémanique DE vs Italienne IT, et Régions FR)
 */
function getGeoZone(company) {
  if (company.country === 'CH') {
    const c = (company.canton || 'ZH').toUpperCase();
    const romands = ['GE', 'VD', 'VS', 'NE', 'FR', 'JU'];
    const italiens = ['TI'];
    let langZone = 'CH_DE';
    let langLabel = 'Suisse Alémanique (DE)';
    if (romands.includes(c)) {
      langZone = 'CH_FR';
      langLabel = 'Suisse Romande (FR)';
    } else if (italiens.includes(c)) {
      langZone = 'CH_IT';
      langLabel = 'Suisse Italienne (IT)';
    }
    return {
      regionCode: langZone,
      regionLabel: langLabel,
      subCode: c,
      subLabel: `Canton ${c}`,
    };
  }

  if (company.country === 'BE') {
    const pc = parseInt((company.postalCode || '').slice(0, 4), 10) || 0;
    if (pc >= 1000 && pc <= 1299) return { regionCode: 'BE_BRU', regionLabel: 'Bruxelles-Capitale', subCode: String(pc).slice(0, 2), subLabel: `CP ${pc}` };
    if ((pc >= 1300 && pc <= 1499) || (pc >= 4000 && pc <= 7999)) return { regionCode: 'BE_WAL', regionLabel: 'Wallonie', subCode: String(pc).slice(0, 2), subLabel: `CP ${pc}` };
    return { regionCode: 'BE_VLG', regionLabel: 'Flandre', subCode: String(pc).slice(0, 2), subLabel: `CP ${pc}` };
  }
  if (company.country === 'LU') {
    return { regionCode: 'LU', regionLabel: 'Luxembourg', subCode: 'LU', subLabel: company.city || 'Luxembourg' };
  }
  if (company.country === 'NL') {
    return { regionCode: 'NL', regionLabel: 'Pays-Bas', subCode: (company.postalCode || '').slice(0, 2), subLabel: company.city || 'Pays-Bas' };
  }

  const dept = (company.postalCode || '75000').slice(0, 2);
  if (['75', '77', '78', '91', '92', '93', '94', '95'].includes(dept)) {
    return { regionCode: 'FR_IDF', regionLabel: 'Île-de-France (Paris & RP)', subCode: dept, subLabel: `Dépt ${dept}` };
  }
  if (['01', '03', '07', '15', '26', '38', '42', '43', '63', '69', '73', '74'].includes(dept)) {
    return { regionCode: 'FR_ARA', regionLabel: 'Auvergne-Rhône-Alpes', subCode: dept, subLabel: `Dépt ${dept}` };
  }
  if (['04', '05', '06', '13', '83', '84'].includes(dept)) {
    return { regionCode: 'FR_PACA', regionLabel: 'PACA & Côte d\'Azur', subCode: dept, subLabel: `Dépt ${dept}` };
  }
  if (['16', '17', '19', '23', '24', '33', '40', '47', '64', '79', '86', '87'].includes(dept)) {
    return { regionCode: 'FR_NAQ', regionLabel: 'Nouvelle-Aquitaine', subCode: dept, subLabel: `Dépt ${dept}` };
  }
  if (['09', '11', '12', '30', '31', '32', '34', '46', '48', '65', '66', '81', '82'].includes(dept)) {
    return { regionCode: 'FR_OCC', regionLabel: 'Occitanie', subCode: dept, subLabel: `Dépt ${dept}` };
  }
  if (['02', '08', '10', '51', '52', '54', '55', '57', '59', '60', '62', '67', '68', '80', '88', '90'].includes(dept)) {
    return { regionCode: 'FR_HDF_GE', regionLabel: 'Nord & Grand Est', subCode: dept, subLabel: `Dépt ${dept}` };
  }
  return { regionCode: 'FR_OUEST', regionLabel: 'Grand Ouest & Centre', subCode: dept, subLabel: `Dépt ${dept}` };
}

module.exports = {
  REVOLUT_UNSUPPORTED_RULES,
  getUnsupportedIndustryMatch,
  isRevolutUnsupportedIndustry,
  evaluateRevolutCompliance,
  evaluateFxPotential,
  getGeoZone
};
