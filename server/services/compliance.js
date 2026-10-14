/**
 * Module d'évaluation de la conformité sectorielle Revolut Business
 * Basé strictement sur la Nature d'Activité (Liste officielle des industries interdites / non éligibles).
 */

function evaluateRevolutCompliance(company) {
  const activity = (company.activity || '').toLowerCase();
  const name = (company.name || '').toLowerCase();
  const category = (company.activityCategory || '').toLowerCase();
  const fullText = `${name} ${activity} ${category}`;

  // 1. PASTILLE ROUGE : Industries interdites / Non éligibles sur Revolut Business
  // (Politique d'utilisation acceptable & restrictions bancaires Revolut)
  const prohibitedIndustries = [
    {
      pattern: /\b(crypto|bitcoin|ethereum|token|nft|web3|blockchain|mining|minage|ico)\b/i,
      industry: 'Crypto-actifs & Minage non régulé',
      reason: 'Activité sur les actifs numériques / crypto-monnaies non autorisée par la politique Revolut Business.'
    },
    {
      pattern: /\b(casino|pari|gambling|jeux d'argent|loterie|betting|poker|pronostic|turf)\b/i,
      industry: 'Jeux d\'argent, Paris & Casinos',
      reason: 'Jeux de hasard, paris sportifs et loteries strictement exclus de l\'ouverture de compte Revolut.'
    },
    {
      pattern: /\b(armement|defense militaire|armes|munitions|tactical|fusil|balistique)\b/i,
      industry: 'Armes, Munitions & Matériel Militaire',
      reason: 'Fabrication et négoce d\'armes, munitions et équipements de combat exclus par la politique de conformité.'
    },
    {
      pattern: /\b(adulte|erotique|sex|escort|pornograph|strip-tease|charme)\b/i,
      industry: 'Divertissement pour adultes & Services érotiques',
      reason: 'Industrie pour adultes et contenus érotiques non acceptés par la politique de conformité Revolut.'
    },
    {
      pattern: /\b(tabac|cigarette|vape|vapote|e-liquide|cbd|cannabis|chicha|buraliste)\b/i,
      industry: 'Tabac, Vape & Produits dérivés du CBD',
      reason: 'Vente de tabac, produits de vapotage et dérivés de cannabinoïdes restreinte par la réglementation bancaire.'
    },
    {
      pattern: /\b(forex|cfd|options binaires|trading speculatif|courtage speculatif)\b/i,
      industry: 'Trading Spéculatif, Forex & CFD',
      reason: 'Trading de devises et instruments financiers à effet de levier non agréés.'
    },
    {
      pattern: /\b(pret sur gage|pawnshop|recouvrement agressif|usure|rachat de dette)\b/i,
      industry: 'Prêt sur Gage & Recouvrement Agressif',
      reason: 'Crédit non bancaire sur gage et recouvrement contentieux exclus de l\'offre Revolut.'
    },
    {
      pattern: /\b(or brut|diamant brut|pierres precieuses|metaux precieux physique)\b/i,
      industry: 'Négoce de Métaux & Pierres Précieuses Brutes',
      reason: 'Commerce physique de métaux précieux bruts et lingots sans certification bancaire.'
    },
    {
      pattern: /\b(pyramidal|mlm|marketing de reseau|vente multiniveau)\b/i,
      industry: 'Vente Pyramidale & Marketing Multi-Niveaux (MLM)',
      reason: 'Modèles de distribution multiniveaux ou vente pyramidale exclus des services Revolut Business.'
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
      pattern: /\b(holding|participations|societe de portefeuille|societe de gestion)\b/i,
      industry: 'Holding & Gestion de Participations',
      reason: 'Holdings et structures financières : nécessite la fourniture de l\'organigramme et des bénéficiaires effectifs (UBO).'
    },
    {
      pattern: /\b(marchand de biens|promotion immobiliere|construction-vente)\b/i,
      industry: 'Promotion Immobilière & Marchands de Biens',
      reason: 'Opérations immobilières complexes : justification de l\'origine des fonds et garanties financières requises.'
    },
    {
      pattern: /\b(courtage|courtier|fintech|paiement|intermediaire bancaire)\b/i,
      industry: 'Intermédiation Financière & Assurance',
      reason: 'Activités financières réglementées : justificatif d\'enregistrement officiel ORIAS (FR) ou FINMA (CH) requis.'
    },
    {
      pattern: /\b(negoc|import.export|matiere premiere|petrole)\b/i,
      industry: 'Négoce International & Import-Export',
      reason: 'Commerce international à flux transfrontaliers : vérification des pays partenaires et flux de paiement.'
    }
  ];

  for (const item of regulatedIndustries) {
    if (item.pattern.test(fullText)) {
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

module.exports = {
  evaluateRevolutCompliance
};
