/**
 * Module d'évaluation de la conformité et d'appétit au risque Revolut Business (KYB & Compliance Pre-Screening)
 * Permet aux commerciaux de savoir immédiatement si un lead est directement éligible à l'ouverture de compte
 * ou s'il risque d'être bloqué par la conformité bancaire.
 */

function evaluateRevolutCompliance(company) {
  const activity = (company.activity || '').toLowerCase();
  const name = (company.name || '').toLowerCase();
  const category = (company.activityCategory || '').toLowerCase();
  const fullText = `${name} ${activity} ${category}`;

  // 1. Catégorie ROUGE : Secteurs hors appétit / Interdits par la politique Revolut Business
  const prohibitedPatterns = [
    { pattern: /\b(crypto|bitcoin|ethereum|token|nft|web3|blockchain|mining)\b/i, reason: 'Crypto-actifs non régulés / Minage (Activité hors appétit au risque Revolut)' },
    { pattern: /\b(casino|pari|gambling|jeux d'argent|loterie|betting|poker)\b/i, reason: 'Jeux d\'argent et paris en ligne (Réglementation et licence bancaire restreinte)' },
    { pattern: /\b(armement|defense militaire|armes|munitions|tactical)\b/i, reason: 'Matériel de guerre et armement (Exclusion stricte de conformité)' },
    { pattern: /\b(adulte|erotique|sex|escort|pornograph)\b/i, reason: 'Contenus pour adultes (Exclusion stricte de politique d\'acceptation)' },
    { pattern: /\b(tabac|cigarette|vape|cbd|cannabis|chicha)\b/i, reason: 'Produits du tabac & CBD (Restrictions réglementaires et de licence)' },
    { pattern: /\b(forex|cfd|options binaires|trading speculatif)\b/i, reason: 'Trading spéculatif de devises / CFD sans agrément AMF ou FINMA' },
    { pattern: /\b(pret sur gage|pawnshop|recouvrement agressif)\b/i, reason: 'Intermédiation de crédit non bancaire / Prêt sur gage' }
  ];

  for (const item of prohibitedPatterns) {
    if (item.pattern.test(fullText)) {
      return {
        status: 'restricted',
        badge: '🔴 Risque Compliance',
        label: 'Hors Cible / Risque Bloquant',
        color: 'rose',
        reason: item.reason,
        onboardingSpeed: 'Bloqué ou Revue Manuelle Approfondie',
        salesRecommendation: 'Ne pas prospecter en priorité : risque élevé de refus à l\'onboarding KYB.',
        isEligible: false
      };
    }
  }

  // 2. Catégorie JAUNE : Secteurs sous conditions / Due Diligence renforcée
  const conditionalPatterns = [
    { pattern: /\b(holding|participations|societe de gestion)\b/i, reason: 'Holding / Gestion de participations : justificatif de la chaîne d\'actionnariat requis (UBO)' },
    { pattern: /\b(marchand de biens|promotion immobiliere)\b/i, reason: 'Opérations immobilières complexes : justification de l\'origine des fonds requise' },
    { pattern: /\b(courtage|courtier|fintech|paiement|intermediaire)\b/i, reason: 'Intermédiation financière : vérification de l\'enregistrement ORIAS ou FINMA' },
    { pattern: /\b(negoc|import.export|matiere premiere|petrole|or|diamant)\b/i, reason: 'Négoce international à flux transfrontaliers : revue des pays tiers et partenaires' }
  ];

  for (const item of conditionalPatterns) {
    if (item.pattern.test(fullText)) {
      return {
        status: 'conditional',
        badge: '🟡 Due Diligence',
        label: 'Éligible sous Conditions',
        color: 'amber',
        reason: item.reason,
        onboardingSpeed: '48h - 72h (Revue documentaire requise)',
        salesRecommendation: 'Prospectable en qualifiant la structure juridique et la liste des bénéficiaires effectifs.',
        isEligible: true
      };
    }
  }

  // 3. Catégorie VERTE : Cible Prioritaire Revolut Business (Onboarding direct & fluide)
  return {
    status: 'eligible',
    badge: '🟢 Éligible Revolut',
    label: 'Onboarding Immédiat',
    color: 'emerald',
    reason: 'Activité commerciale ou de services standard (B2B, Conseil, Tech, BTP, E-commerce, Santé, Transport). Conforme à 100% à la politique d\'acceptation Revolut.',
    onboardingSpeed: 'Moins de 24h (Onboarding automatisé)',
    salesRecommendation: 'Cible prioritaire : conversion rapide avec compte actif sous 24h.',
    isEligible: true
  };
}

module.exports = {
  evaluateRevolutCompliance
};
