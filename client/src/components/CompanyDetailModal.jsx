import React, { useState } from 'react';
import { 
  Building2, 
  User, 
  Briefcase, 
  Globe, 
  Mail, 
  Phone, 
  ExternalLink, 
  CheckCircle, 
  Clock, 
  X, 
  Copy, 
  Check, 
  Share2, 
  FileText,
  DollarSign,
  MapPin,
  Calendar,
  Sparkles,
  ShieldCheck,
  ShieldAlert,
  HelpCircle
} from 'lucide-react';
import LinkedinIcon from './LinkedinIcon';

export default function CompanyDetailModal({ company, onClose, onUpdateStatus, onOpenNetwork }) {
  const [crmStatus, setCrmStatus] = useState(company.crmStatus || 'new');
  const [crmNotes, setCrmNotes] = useState(company.crmNotes || '');
  const [crmAssignedTo, setCrmAssignedTo] = useState(company.crmAssignedTo || '');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [copiedField, setCopiedField] = useState(null);

  const handleCopy = (text, fieldName) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleSaveCRM = async () => {
    setIsSaving(true);
    await onUpdateStatus(company.id, {
      crmStatus,
      crmNotes,
      crmAssignedTo,
    });
    setIsSaving(false);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  const isCH = company.country === 'CH';
  const flag = isCH ? '🇨🇭' : '🇫🇷';
  const safety = company.safety || { score: 50, label: 'Moyenne', breakdown: [] };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade-in">
      <div className="bg-white dark:bg-[#121824] border border-slate-300 dark:border-slate-700 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden transition-colors">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between bg-slate-50 dark:bg-[#161f30]">
          <div className="flex items-start gap-4">
            <span className="text-3xl select-none">{flag}</span>
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-wide">
                  {company.name}
                </h2>
                <span className="text-xs px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold border border-slate-200 dark:border-slate-700">
                  {company.legalForm}
                </span>
                <button
                  onClick={() => handleCopy(company.registrationNumber, 'siren')}
                  className="text-xs px-2.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 font-mono hover:bg-blue-100 transition"
                  title="Copier le numéro"
                >
                  {copiedField === 'siren' ? '✓ Copié' : company.registrationNumber}
                </button>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-4 flex-wrap">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" /> Immatriculation : {company.incorporationDate}
                </span>
                <span className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" /> {company.city} ({company.postalCode})
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onOpenNetwork(company)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-600/20 hover:bg-blue-100 dark:hover:bg-blue-600/30 text-blue-700 dark:text-blue-400 text-xs font-semibold border border-blue-200 dark:border-blue-500/30 transition shadow-sm"
            >
              <Share2 className="w-3.5 h-3.5" /> Cartographie Réseau
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* Quick Badges Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            
            <div className="bg-slate-50 dark:bg-[#182030] p-4 rounded-xl border border-slate-200 dark:border-slate-800">
              <span className="text-xs text-slate-500 dark:text-slate-400 block mb-1">Capital Déposé</span>
              <span className="text-lg font-bold text-slate-900 dark:text-white">
                {company.shareCapital ? company.shareCapital.toLocaleString() : 'N/A'} {isCH ? 'CHF' : '€'}
              </span>
            </div>

            <div className="bg-slate-50 dark:bg-[#182030] p-4 rounded-xl border border-slate-200 dark:border-slate-800">
              <span className="text-xs text-slate-500 dark:text-slate-400 block mb-1">Source Officielle</span>
              <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">
                {company.source || 'Registre Légal'}
              </span>
            </div>

            {/* Score de Sûreté transparent */}
            <div className="bg-slate-50 dark:bg-[#182030] p-4 rounded-xl border border-slate-200 dark:border-slate-800">
              <span className="text-xs text-slate-500 dark:text-slate-400 block mb-1">Score de Sûreté Lead</span>
              <div className="flex items-center gap-2">
                <span className={`text-sm font-bold flex items-center gap-1.5 ${
                  safety.score >= 70 ? 'text-emerald-600 dark:text-emerald-400' :
                  safety.score >= 45 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500'
                }`}>
                  <ShieldCheck className="w-4 h-4" /> {safety.score}% - {safety.label}
                </span>
              </div>
            </div>
          </div>

          {/* Revolut Industry & Compliance Eligibility Assessment */}
          {company.compliance && (
            <div className={`p-4 rounded-xl border transition ${
              company.compliance.status === 'restricted'
                ? 'bg-rose-50/80 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900/60'
                : company.compliance.status === 'conditional'
                ? 'bg-amber-50/80 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/60'
                : 'bg-emerald-50/80 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/60'
            }`}>
              <div className="flex items-center justify-between flex-wrap gap-2 mb-2.5 pb-2.5 border-b border-current/10">
                <div className="flex items-center gap-2">
                  <span className="text-base font-bold">{company.compliance.badge}</span>
                  <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wide ${
                    company.compliance.status === 'restricted'
                      ? 'bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-200'
                      : company.compliance.status === 'conditional'
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200'
                      : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200'
                  }`}>
                    {company.compliance.tag || company.compliance.badge}
                  </span>
                </div>
                <div className="text-xs font-semibold flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                  <span className="text-slate-500 dark:text-slate-400">Secteur analysé :</span>
                  <span className="font-bold">{company.compliance.industry || company.activityCategory || 'Services B2B'}</span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs mt-2">
                <div className="space-y-1">
                  <span className="font-bold text-slate-700 dark:text-slate-300 block">
                    📋 Éligibilité selon l'Activité & Politique Revolut :
                  </span>
                  <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                    {company.compliance.reason}
                  </p>
                </div>
                <div className="space-y-1">
                  <span className="font-bold text-slate-700 dark:text-slate-300 block">
                    💼 Action Commerciale Recommandée :
                  </span>
                  <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                    {company.compliance.salesRecommendation}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Official Registries & Legal Portals (Pappers for FR, Zefix for CH) */}
          <div className="bg-gradient-to-r from-slate-100 to-blue-50/50 dark:from-slate-900/80 dark:to-blue-950/20 p-4 rounded-xl border border-slate-200 dark:border-blue-900/30 flex items-center justify-between flex-wrap gap-3">
            <div>
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-blue-500" />
                <span>{isCH ? 'Registre Fédéral Suisse (Zefix & FOSC)' : 'Registres Légaux & Financiers (Pappers & INPI)'}</span>
              </span>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                {isCH 
                  ? 'Vérification directe auprès de l\'Index central des raisons de commerce (OFJ)' 
                  : 'Vérification légale, bilans, statuts déposés et bénéficiaires effectifs'}
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {isCH ? (
                <>
                  <a
                    href={`https://www.zefix.ch/fr/search/entity/list?name=${encodeURIComponent(company.name)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition"
                    title="Ouvrir la recherche officielle sur l'Index central Zefix"
                  >
                    <span>🇨🇭 Consulter sur Zefix</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  <a
                    href={`https://www.shab.ch/#!/search/publications?subRubrics=HR01&search=${encodeURIComponent(company.name)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition"
                    title="Voir l'annonce officielle sur la FOSC"
                  >
                    <span>Fiche FOSC / SHAB</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </>
              ) : (
                <>
                  <a
                    href={`https://www.pappers.fr/entreprise/${company.registrationNumber?.replace(/\s+/g, '') || encodeURIComponent(company.name)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1.5 rounded-lg bg-[#0066FF] hover:bg-[#0052cc] text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition"
                    title="Ouvrir la fiche complète sur Pappers.fr"
                  >
                    <span>🇫🇷 Fiche Pappers</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  <a
                    href={`https://annuaire-entreprises.data.gouv.fr/entreprise/${company.registrationNumber?.replace(/\s+/g, '') || encodeURIComponent(company.name)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition"
                    title="Ouvrir l'Annuaire des Entreprises officiel (data.gouv.fr)"
                  >
                    <span>data.gouv.fr (INPI)</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </>
              )}
            </div>
          </div>

          {/* Activity */}
          <div className="bg-slate-50 dark:bg-[#182030] p-4 rounded-xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Nature d'activité & But Social
              </span>
              <button
                onClick={() => handleCopy(company.activity, 'activity')}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
              >
                {copiedField === 'activity' ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                {copiedField === 'activity' ? 'Copié !' : 'Copier'}
              </button>
            </div>
            <p className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed">
              {company.activity || 'Non spécifiée dans l\'annonce légale'}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-slate-400" /> Siège social : {company.address}
            </p>
          </div>

          {/* Dirigeants & CFO Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Dirigeants */}
            <div className="bg-slate-50 dark:bg-[#182030] p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                Dirigeants & Mandataires Sociaux
              </span>
              <div className="space-y-2">
                {company.dirigeants?.map((d, idx) => {
                  const isX = !d.name || d.name === 'X' || d.name.includes('Direction') || d.name.includes('Conseil');
                  return (
                    <div key={idx} className="flex items-center justify-between p-2.5 rounded-lg bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center font-bold text-xs font-mono">
                          {isX ? 'X' : d.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          {isX ? (
                            <span className="text-sm font-semibold text-slate-400 dark:text-slate-500 font-mono italic">
                              X <span className="text-xs font-sans not-italic text-slate-400">(Non renseigné au registre)</span>
                            </span>
                          ) : (
                            <button
                              onClick={() => handleCopy(d.name, `dir-${idx}`)}
                              className="text-sm font-semibold text-slate-900 dark:text-white hover:text-blue-500 text-left"
                              title="Copier le nom"
                            >
                              {d.name} {copiedField === `dir-${idx}` && <span className="text-emerald-500 text-xs">✓</span>}
                            </button>
                          )}
                          <div className="text-xs text-slate-500 dark:text-slate-400">{d.role || 'Mandataire'}</div>
                        </div>
                      </div>
                      {!isX && (
                        <div className="flex items-center gap-1.5">
                          <a
                            href={`https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(d.name)}`}
                            target="_blank"
                            rel="noreferrer"
                            className="px-2 py-1 bg-[#0a66c2]/10 hover:bg-[#0a66c2]/20 text-[#0a66c2] rounded-lg transition flex items-center gap-1 text-xs font-semibold"
                            title={`Rechercher ${d.name} sur LinkedIn`}
                          >
                            <LinkedinIcon className="w-3.5 h-3.5" />
                            <span>LinkedIn</span>
                          </a>
                          <a
                            href={`https://www.google.com/search?q=${encodeURIComponent('site:linkedin.com/in ' + d.name + ' ' + (company.city || ''))}`}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 rounded-lg transition"
                            title={`Recherche Google directe du profil LinkedIn de ${d.name}`}
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* CFO / Décideur Financier */}
            <div className="bg-slate-50 dark:bg-[#182030] p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                Directeur Financier / CFO
              </span>
              <div className="p-3 rounded-lg bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/40 space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    {(!company.cfo?.name || company.cfo.name === 'X' || company.cfo.name.includes('Direction')) ? (
                      <div>
                        <span className="text-sm font-bold text-slate-400 dark:text-slate-500 font-mono italic block">
                          X <span className="text-xs font-sans not-italic text-slate-400">(Non renseigné au registre)</span>
                        </span>
                        <span className="text-xs text-slate-400">Fonction financière non individualisée au greffe</span>
                      </div>
                    ) : (
                      <div>
                        <span className="text-sm font-bold text-slate-900 dark:text-white block">
                          {company.cfo.name}
                        </span>
                        <span className="text-xs text-blue-700 dark:text-blue-300 font-medium">
                          {company.cfo.role || 'Directeur Financier'}
                        </span>
                      </div>
                    )}
                  </div>
                  {company.cfo?.name && company.cfo.name !== 'X' && !company.cfo.name.includes('Direction') && (
                    <div className="flex items-center gap-1.5">
                      <a
                        href={`https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(company.cfo.name)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="px-2 py-1 bg-[#0a66c2]/10 hover:bg-[#0a66c2]/20 text-[#0a66c2] rounded-lg transition flex items-center gap-1 text-xs font-semibold"
                        title="Chercher CFO sur LinkedIn"
                      >
                        <LinkedinIcon className="w-3.5 h-3.5" />
                        <span>LinkedIn</span>
                      </a>
                    </div>
                  )}
                </div>
              </div>

              {/* Dedicated LinkedIn Company Banner */}
              {company.linkedinCompanyUrl && (
                <div className="pt-1">
                  <a
                    href={company.linkedinCompanyUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full py-2 px-3 bg-[#0a66c2] hover:bg-[#004182] text-white rounded-lg flex items-center justify-center gap-2 text-xs font-bold transition shadow-xs"
                    title="Ouvrir la page LinkedIn de l'entreprise"
                  >
                    <LinkedinIcon className="w-4 h-4 text-white" />
                    <span>Rechercher l'entreprise sur LinkedIn (Voir l'équipe & employés)</span>
                    <ExternalLink className="w-3 h-3 text-white/80" />
                  </a>
                </div>
              )}
            </div>

          </div>

          {/* Contact Details with TRANSPARENT SOURCE ATTRIBUTION */}
          <div className="bg-slate-50 dark:bg-[#182030] p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
              Coordonnées de Contact & Origine des Données
            </span>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              
              {/* Email */}
              <div className="p-3 bg-white dark:bg-slate-900/70 rounded-lg border border-slate-200 dark:border-slate-800 flex flex-col justify-between">
                <div>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mb-1">
                    <Mail className="w-3.5 h-3.5 text-blue-500" /> Email Direct
                  </span>
                  <span className="text-xs font-mono font-medium text-slate-900 dark:text-slate-200 block truncate" title={company.bestEmail}>
                    {company.bestEmail || 'Non communiqué aux registres'}
                  </span>
                  <span className="text-[10px] text-blue-600 dark:text-blue-400 block mt-1">
                    Source : {company.emailSource || 'Serveur MX'}
                  </span>
                </div>
                {company.bestEmail && (
                  <button
                    onClick={() => handleCopy(company.bestEmail, 'email')}
                    className="mt-2 text-xs flex items-center gap-1 text-blue-600 dark:text-blue-400 font-medium hover:underline"
                  >
                    {copiedField === 'email' ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                    {copiedField === 'email' ? 'Copié !' : 'Copier email'}
                  </button>
                )}
              </div>

              {/* Phone */}
              <div className="p-3 bg-white dark:bg-slate-900/70 rounded-lg border border-slate-200 dark:border-slate-800 flex flex-col justify-between">
                <div>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mb-1">
                    <Phone className="w-3.5 h-3.5 text-emerald-500" /> Téléphone Direct
                  </span>
                  <span className="text-xs font-mono font-medium text-slate-900 dark:text-slate-200 block">
                    {company.phone || 'Non communiqué au greffe'}
                  </span>
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 block mt-1">
                    Source : {company.phoneSource || 'Standard'}
                  </span>
                </div>
                {company.phone && (
                  <button
                    onClick={() => handleCopy(company.phone, 'phone')}
                    className="mt-2 text-xs flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium hover:underline"
                  >
                    {copiedField === 'phone' ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                    {copiedField === 'phone' ? 'Copié !' : 'Copier numéro'}
                  </button>
                )}
              </div>

              {/* Website with REAL DNS status */}
              <div className="p-3 bg-white dark:bg-slate-900/70 rounded-lg border border-slate-200 dark:border-slate-800 flex flex-col justify-between">
                <div>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mb-1">
                    <Globe className="w-3.5 h-3.5 text-purple-500" /> Site Internet
                  </span>
                  <span className="text-xs font-mono font-medium text-slate-900 dark:text-slate-200 block truncate" title={company.website}>
                    {company.website || 'Aucun site actif'}
                  </span>
                  <span className={`text-[10px] block mt-1 ${
                    company.website ? 'text-purple-600 dark:text-purple-400 font-semibold' : 'text-slate-400 italic'
                  }`}>
                    {company.websiteStatus || 'Non déposé ou inactif'}
                  </span>
                </div>
                {company.website && (
                  <a
                    href={company.website}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 text-xs flex items-center gap-1 text-purple-600 dark:text-purple-400 font-medium hover:underline"
                  >
                    <ExternalLink className="w-3 h-3" /> Ouvrir le site
                  </a>
                )}
              </div>

            </div>

          </div>

          {/* CRM & Sales Management Box */}
          <div className="bg-slate-100 dark:bg-[#162035] p-5 rounded-xl border border-slate-300 dark:border-blue-900/50 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <h4 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                  Suivi Commercial & Synchronisation CRM
                </h4>
              </div>
              {saveSuccess && (
                <span className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <CheckCircle className="w-4 h-4" /> Modifié et enregistré !
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* CRM Status Dropdown */}
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1.5">
                  Statut de Prospection
                </label>
                <select
                  value={crmStatus}
                  onChange={(e) => setCrmStatus(e.target.value)}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="new">🔵 Nouveau (Non contacté)</option>
                  <option value="to_contact">🟡 À contacter en priorité</option>
                  <option value="contacted_email">🟣 Contacté par Email</option>
                  <option value="contacted_call">📞 Contacté par Téléphone</option>
                  <option value="in_crm">🟢 Déjà dans le CRM (HubSpot / Salesforce)</option>
                  <option value="converted">🏆 Converti (Compte Revolut Business Ouvert)</option>
                  <option value="unqualified">⚪ Non qualifié / Hors cible</option>
                </select>
              </div>

              {/* Assignee */}
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1.5">
                  Commercial Revolut Assigné
                </label>
                <input
                  type="text"
                  placeholder="Ex: Kevin M."
                  value={crmAssignedTo}
                  onChange={(e) => setCrmAssignedTo(e.target.value)}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                />
              </div>

            </div>

            {/* Notes */}
            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1.5">
                Notes d'appel / Historique de contact
              </label>
              <textarea
                rows={3}
                placeholder="Ex: Intéressé par le compte multi-devises CHF/EUR. Relance prévue jeudi 10h."
                value={crmNotes}
                onChange={(e) => setCrmNotes(e.target.value)}
                className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg p-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex justify-end pt-1">
              <button
                onClick={handleSaveCRM}
                disabled={isSaving}
                className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition shadow-md disabled:opacity-50"
              >
                {isSaving ? 'Enregistrement...' : 'Enregistrer le statut CRM'}
              </button>
            </div>

          </div>

        </div>

      </div>
    </div>
  );
}
