/**
 * Module d'évaluation de la conformité sectorielle Revolut Business
 * Basé strictement sur la Nature d'Activité (Liste officielle des industries interdites / non éligibles).
 */

function evaluateRevolutCompliance(company) {
  const activity = (company.activity || '').toLowerCase();
  const primaryActivity = (company.activity || '').split(/\.\s+/)[0].toLowerCase();
  const name = (company.name || '').toLowerCase();
  const category = (company.activityCategory || '').toLowerCase();
  const fullText = `${name} ${activity} ${category}`;
  const primaryText = `${name} ${primaryActivity} ${category}`;

  // 1. PASTILLE ROUGE : Industries interdites / Non éligibles sur Revolut Business
  // (Politique d'utilisation acceptable & restrictions bancaires Revolut)
  const prohibitedIndustries = [
    {
      pattern: /\b(crypto|krypto|bitcoin|ethereum|token|nft|web3|blockchain|mining|minage|ico)\b/i,
      industry: 'Crypto-actifs & Minage non régulé',
      reason: 'Activité sur les actifs numériques / crypto-monnaies non autorisée par la politique Revolut Business.'
    },
    {
      pattern: /\b(casino|pari|gambling|jeux d'argent|loterie|betting|poker|pronostic|turf|glücksspiel|wetten)\b/i,
      industry: 'Jeux d\'argent, Paris & Casinos',
      reason: 'Jeux de hasard, paris sportifs et loteries strictement exclus de l\'ouverture de compte Revolut.'
    },
    {
      pattern: /\b(armement|defense militaire|armes|munitions|tactical|fusil|balistique|waffen|munition|rüstung)\b/i,
      industry: 'Armes, Munitions & Matériel Militaire',
      reason: 'Fabrication et négoce d\'armes, munitions et équipements de combat exclus par la politique de conformité.'
    },
    {
      pattern: /\b(adulte|erotique|sex|escort|pornograph|strip-tease|charme|erotik)\b/i,
      industry: 'Divertissement pour adultes & Services érotiques',
      reason: 'Industrie pour adultes et contenus érotiques non acceptés par la politique de conformité Revolut.'
    },
    {
      pattern: /\b(tabac|tabak|cigarette|vape|vapote|e-liquide|cbd|cannabis|hanf|chicha|buraliste)\b/i,
      industry: 'Tabac, Vape & Produits dérivés du CBD',
      reason: 'Vente de tabac, produits de vapotage et dérivés de cannabinoïdes restreinte par la réglementation bancaire.'
    },
    {
      pattern: /\b(forex|cfd|options binaires|trading speculatif|courtage speculatif|algo trading|devisenhandel)\b/i,
      industry: 'Trading Spéculatif, Forex & CFD',
      reason: 'Trading de devises et instruments financiers à effet de levier non agréés.'
    },
    {
      pattern: /\b(pret sur gage|pawnshop|recouvrement agressif|usure|rachat de dette|pfandhaus|inkasso)\b/i,
      industry: 'Prêt sur Gage & Recouvrement Agressif',
      reason: 'Crédit non bancaire sur gage et recouvrement contentieux exclus de l\'offre Revolut.'
    },
    {
      pattern: /\b(or brut|diamant brut|pierres precieuses|metaux precieux|edelmetall|rohstoffhandel|commodities)\b/i,
      industry: 'Négoce de Métaux & Matières Premières Sensibles',
      reason: 'Commerce physique de métaux précieux bruts, diamants ou matières premières réglementées.'
    },
    {
      pattern: /\b(pyramidal|mlm|marketing de reseau|vente multiniveau|strukturvertrieb)\b/i,
      industry: 'Vente Pyramidale & Marketing Multi-Niveaux (MLM)',
      reason: 'Modèles de distribution multiniveaux ou vente pyramidale exclus des services Revolut Business.'
    },
    {
      pattern: /\b(stiftung|fondation|fondazione|familienstiftung)\b/i,
      industry: 'Fondation & Structure Patrimoniale Spéciale',
      reason: 'Les fondations (Stiftung) et trusts familiaux sont exclus de l\'onboarding standard Revolut Business.'
    }
  ];

  for (const item of prohibitedIndustries) {
    if (item.pattern.test(fullText)) {
      return {
        status: 'restricted',
        badge: '🔴 Non éligible',
        tag: '🔴 Industrie Interdite',
        industry: item.industry,
        color: 'rose',
        reason: item.reason,
        salesRecommendation: 'Ne pas contacter : industrie sur liste rouge Revolut, ouverture de compte bloquée.',
        isEligible: false
      };
    }
  }

  // 2. PASTILLE JAUNE : Activités réglementées nécessitant une vérification de conformité
  // (Holdings, promoteurs immobiliers, courtiers financiers agréés)
  const regulatedIndustries = [
    {
      pattern: /\b(holding|participations|societe de portefeuille|societe de gestion|beteiligungen|family office|vermögensverwaltung)\b/i,
      industry: 'Holding & Gestion de Participations',
      reason: 'Holdings et structures financières : nécessite la fourniture de l\'organigramme et des bénéficiaires effectifs (UBO).'
    },
    {
      pattern: /\b(marchand de biens|promotion immobiliere|construction-vente|immobilienentwicklung|generalunternehmung)\b/i,
      industry: 'Promotion Immobilière & Marchands de Biens',
      reason: 'Opérations immobilières complexes : justification de l\'origine des fonds et garanties financières requises.'
    },
    {
      pattern: /\b(courtage|courtier|fintech|paiement|intermediaire bancaire|finanzdienstleistung|treuhand|fiduciaire)\b/i,
      industry: 'Intermédiation Financière & Fiduciaire',
      reason: 'Activités financières réglementées : justificatif d\'enregistrement officiel ORIAS (FR) ou FINMA / OAR (CH) requis.'
    },
    {
      pattern: /\b(negoc|import.export|matiere premiere|petrole)\b/i,
      industry: 'Négoce International & Import-Export',
      reason: 'Commerce international à flux transfrontaliers : vérification des pays partenaires et flux de paiement.'
    }
  ];

  for (const item of regulatedIndustries) {
    if (item.pattern.test(primaryText)) {
      return {
        status: 'conditional',
        badge: '🟡 Réglementé',
        tag: '🟡 Activité Réglementée',
        industry: item.industry,
        color: 'amber',
        reason: item.reason,
        salesRecommendation: 'Prospectable en demandant la structure juridique et les pièces justificatives d\'activité.',
        isEligible: true
      };
    }
  }

  // 3. PASTILLE VERTE : Industries standards 100% Éligibles Revolut Business
  return {
    status: 'eligible',
    badge: '🟢 Éligible',
    tag: '🟢 Éligible Revolut',
    industry: company.activityCategory || 'Commerce, Services & Industrie',
    color: 'emerald',
    reason: 'Activité commerciale ou de services conforme à la charte d\'acceptation Revolut Business (Tech, BTP, E-commerce, Conseil, Restauration, Santé, Transport, etc.).',
    salesRecommendation: 'Prospect prioritaire : activité standard directement acceptée sur Revolut Business.',
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
  } else {
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
  } else if (/\b(luxe|horlogerie|montres|joaillerie|bijoux|mode|cosmétique|parfum|conciergerie|yacht|aviation|hôtellerie|tourisme|voyage|travel)\b/i.test(fullText)) {
    score += 35;
    currencySet.add('USD');
    currencySet.add('CHF');
    currencySet.add('GBP');
    reasons.push('Luxe, Horlogerie & Conciergerie : clientèle internationale fortunée (encaissements USD, CHF, GBP, AED)');
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
      reasons: reasons.slice(0, 3),
      salesPitch: isCH
        ? `Argument FX Revolut : Cette société suisse (${capital.toLocaleString('fr-FR')} CHF) est exposée aux flux ${currencies.join(' / ')}. Proposer les comptes IBAN multi-devises CHF/EUR/USD au taux interbancaire pour économiser 1,5% à 2,5% de marge bancaire.`
        : `Argument FX Revolut : Fort besoin de change (${currencies.join(' / ')}) détecté sur l'activité. Proposer les comptes multi-devises et cartes corporate sans frais de change à l'étranger.`
    };
  }

  if (score >= 38) {
    return {
      level: 'medium',
      score,
      badge: `🌐 FX Modéré (${currencies.slice(0, 2).join('/')})`,
      shortBadge: '🌐 FX Modéré',
      currencies,
      reasons: reasons.length > 0 ? reasons.slice(0, 2) : ['Dépenses logiciels/fournisseurs ponctuelles en devises étrangères'],
      salesPitch: `Argument Revolut : Proposer le compte principal pro + cartes physiques/virtuelles sans frais sur les abonnements SaaS en USD et déplacements internationaux.`
    };
  }

  return {
    level: 'low',
    score,
    badge: '🏠 Flux Domestiques',
    shortBadge: '🏠 Domestique',
    currencies,
    reasons: ['Activité principalement locale : cibler sur la gratuité des virements SEPA et les cartes multi-utilisateurs'],
    salesPitch: `Argument Revolut : Mettre en avant la rapidité d'ouverture de compte, l'automatisation comptable et les cartes d'équipe avec plafonds personnalisés.`
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
  evaluateRevolutCompliance,
  evaluateFxPotential,
  getGeoZone
};
