import React, { useState, useEffect } from 'react';
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

  useEffect(() => {
    setCrmStatus(company.crmStatus || 'new');
    setCrmNotes(company.crmNotes || '');
    setCrmAssignedTo(company.crmAssignedTo || '');
  }, [company.id, company.crmStatus, company.crmNotes, company.crmAssignedTo]);

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
  const COUNTRY_FLAGS_M = { FR: '\u{1F1EB}\u{1F1F7}', CH: '\u{1F1E8}\u{1F1ED}', BE: '\u{1F1E7}\u{1F1EA}', LU: '\u{1F1F1}\u{1F1FA}', NL: '\u{1F1F3}\u{1F1F1}' };
  const flag = COUNTRY_FLAGS_M[company.country] || COUNTRY_FLAGS_M.FR;
  const isBE = company.country === 'BE';
  const countryLabelFr = { FR: 'France', CH: 'Suisse', BE: 'Belgique', LU: 'Luxembourg', NL: 'Pays-Bas' }[company.country] || 'France';
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
                {company.geoZone && (
                  <span className="px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-semibold border border-blue-200 dark:border-blue-800/50">
                    {company.geoZone.regionLabel} • {company.geoZone.subLabel}
                  </span>
                )}
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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            
            <div className="bg-slate-50 dark:bg-[#182030] p-3.5 rounded-xl border border-slate-200 dark:border-slate-800">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block mb-0.5">Capital Social</span>
              <span className="text-base font-bold text-slate-900 dark:text-white">
                {company.shareCapital ? company.shareCapital.toLocaleString('fr-FR') : 'N/A'} {isCH ? 'CHF' : '€'}
              </span>
            </div>

            <div className="bg-slate-50 dark:bg-[#182030] p-3.5 rounded-xl border border-slate-200 dark:border-slate-800">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block mb-0.5">Chiffre d'Affaires (≤ 30M€)</span>
              <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                {company.revenue
                  ? `${company.revenue.toLocaleString('fr-FR')} € ${company.revenueYear ? `(${company.revenueYear})` : ''}`
                  : 'PME ≤ 30M€ (Non publié)'}
              </span>
            </div>

            <div className="bg-slate-50 dark:bg-[#182030] p-3.5 rounded-xl border border-slate-200 dark:border-slate-800">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block mb-0.5">Source Officielle</span>
              <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                {company.source || 'Registre Légal'}
              </span>
            </div>

            {/* Score de Sûreté transparent */}
            <div className="bg-slate-50 dark:bg-[#182030] p-3.5 rounded-xl border border-slate-200 dark:border-slate-800">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block mb-0.5">Score de Sûreté Lead</span>
              <div className="flex items-center gap-1.5">
                <span className={`text-xs font-bold flex items-center gap-1 ${
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
                  <span className="text-slate-500 dark:text-slate-400">Secteur d'activité :</span>
                  <span className="font-bold">{company.activityCategory || company.compliance.industry || 'Services B2B'}</span>
                </div>
              </div>

              <div className="text-xs mt-2">
                <span className="font-bold text-slate-700 dark:text-slate-300 block mb-0.5">
                  📋 Politique d'éligibilité Revolut Business (Unsupported Industries Check) :
                </span>
                <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                  {company.compliance.reason}
                </p>
              </div>
            </div>
          )}

          {/* Détecteur de Besoins FX / Multi-Devises (sans pitch commercial) */}
          {company.fxPotential && (
            <div className={`p-4 rounded-xl border transition ${
              company.fxPotential.level === 'high'
                ? 'bg-violet-50/90 dark:bg-violet-950/30 border-violet-300 dark:border-violet-800/70'
                : company.fxPotential.level === 'medium'
                ? 'bg-indigo-50/70 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-900/50'
                : 'bg-slate-50 dark:bg-[#161e2e] border-slate-200 dark:border-slate-800'
            }`}>
              <div className="flex items-center justify-between flex-wrap gap-2 mb-2 pb-2 border-b border-violet-200/60 dark:border-violet-800/40">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold text-violet-900 dark:text-violet-200">
                    {company.fxPotential.badge}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-violet-200/80 dark:bg-violet-900/70 text-violet-900 dark:text-violet-200 font-bold">
                    Score FX : {company.fxPotential.score}/100
                  </span>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Devises cibles détectées :</span>
                  {(company.fxPotential.currencies || []).map(curr => (
                    <span
                      key={curr}
                      className="text-xs px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 text-violet-700 dark:text-violet-300 font-mono font-bold border border-violet-300 dark:border-violet-700 shadow-sm"
                    >
                      {curr}
                    </span>
                  ))}
                </div>
              </div>

              <div className="text-xs mt-1.5">
                <span className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  🔍 Signaux Multi-Devises & Transfrontaliers détectés :
                </span>
                <ul className="list-disc list-inside text-slate-600 dark:text-slate-400 space-y-0.5">
                  {(company.fxPotential.reasons || []).map((r, idx) => (
                    <li key={idx} className="leading-relaxed">{r}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Official Registries, North Data & Legal Portals (Unified Visuals for FR & CH) */}
          <div className="bg-gradient-to-r from-slate-100 to-blue-50/50 dark:from-slate-900/80 dark:to-blue-950/20 p-4 rounded-xl border border-slate-200 dark:border-blue-900/30 flex items-center justify-between flex-wrap gap-3">
            <div>
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-blue-500" />
                <span>{isCH ? 'Registres Légaux, North Data & FOSC' : isBE ? 'Registres Légaux, North Data & BCE/KBO' : 'Registres Légaux, North Data & Pappers'}</span>
              </span>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Vérification de la chaîne de détention, bilans, personnes physiques et entités étrangères liées
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <a
                href={company.northDataUrl || `https://www.northdata.fr/?query=${encodeURIComponent(`${company.name} ${company.registrationNumber || ''}`)}`}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition"
                title="Ouvrir le graphe de détention, le board et les finances sur North Data"
              >
                <Globe className="w-3.5 h-3.5" />
                <span>🌐 North Data</span>
                <ExternalLink className="w-3 h-3" />
              </a>
              {isBE ? (
                <>
                  <a
                    href={`https://kbopub.economie.fgov.be/kbopub/toonondernemingps.html?lang=fr&ondernemingsnummer=${(company.registrationNumber || '').replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1.5 rounded-lg bg-[#0066FF] hover:bg-[#0052cc] text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition"
                    title="Ouvrir la fiche officielle sur la Banque-Carrefour des Entreprises (BCE / KBO)"
                  >
                    <span>Fiche BCE / KBO</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  <a
                    href={`https://www.ejustice.just.fgov.be/cgi_tsv/list.pl?language=fr&btw=${(company.registrationNumber || '').replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition"
                    title="Voir les publications au Moniteur belge"
                  >
                    <span>Moniteur belge</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </>
              ) : isCH ? (
                <>
                  <a
                    href={`https://www.zefix.ch/fr/search/entity/list?name=${encodeURIComponent(company.name)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1.5 rounded-lg bg-[#0066FF] hover:bg-[#0052cc] text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition"
                    title="Ouvrir la fiche officielle sur l'Index central Zefix"
                  >
                    <span>🇨🇭 Fiche Zefix</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  <a
                    href={`https://www.shab.ch/#!/search/publications?subRubrics=HR01&search=${encodeURIComponent(company.registrationNumber && company.registrationNumber !== 'En cours' ? company.registrationNumber : company.name)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition"
                    title="Voir l'annonce officielle sur la FOSC / SHAB"
                  >
                    <span>FOSC / SHAB (OFJ)</span>
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
                Nature d'activité & Objet Social
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

          {/* Dirigeants (Personnes Physiques uniquement), Holdings & Liens Internationaux */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Dirigeants, Membres du Board & Directeurs (Personnes Physiques) */}
            <div className="bg-slate-50 dark:bg-[#182030] p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                  👤 Dirigeants & Board (Personnes Physiques)
                </span>
                {company.dirigeants?.filter(d => d.name && d.name !== 'X').length > 0 && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-bold">
                    {company.dirigeants.filter(d => d.name && d.name !== 'X').length} personne(s) physique(s)
                  </span>
                )}
              </div>
              <div className="space-y-2">
                {company.dirigeants?.map((d, idx) => {
                  const isX = !d.name || d.name === 'X' || d.name.includes('Direction') || d.name.includes('Conseil');
                  const cleanBrand = (company.name || '').replace(/\b(SAS|SARL|SA|SASU|EURL|GmbH|Sàrl|AG)\b/gi, '').trim() || company.name;
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
                              title="Copier le nom de la personne physique"
                            >
                              {d.name} {copiedField === `dir-${idx}` && <span className="text-emerald-500 text-xs">✓</span>}
                            </button>
                          )}
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            {d.role || 'Mandataire / Membre du Board'}
                            {d.birthYear ? ` • Né(e) en ${d.birthYear}` : ''}
                          </div>
                        </div>
                      </div>
                      {!isX && (
                        <div className="flex items-center gap-1.5">
                          <a
                            href={`https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`${d.name} ${countryLabelFr}`)}`}
                            target="_blank"
                            rel="noreferrer"
                            className="px-2 py-1 bg-[#0a66c2]/10 hover:bg-[#0a66c2]/20 text-[#0a66c2] rounded-lg transition flex items-center gap-1 text-xs font-semibold"
                            title={`Rechercher ${d.name} (${countryLabelFr}) sur LinkedIn`}
                          >
                            <LinkedinIcon className="w-3.5 h-3.5" />
                            <span>LinkedIn</span>
                          </a>
                          <a
                            href={`https://www.northdata.fr/?query=${encodeURIComponent(d.name)}`}
                            target="_blank"
                            rel="noreferrer"
                            className="px-2 py-1 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 rounded-lg transition flex items-center gap-1 text-[11px] font-bold"
                            title={`Voir tous les mandats de ${d.name} sur North Data`}
                          >
                            <span>NorthData</span>
                          </a>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* International / Foreign Entity Links if present */}
                {company.internationalLinks?.length > 0 && (
                  <div className="pt-1.5 space-y-1.5">
                    <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider block">
                      🌍 Rattachements Internationaux & Entités Étrangères :
                    </span>
                    {company.internationalLinks.map((intl, iIdx) => (
                      <div key={iIdx} className="flex items-center justify-between p-2 rounded-lg bg-amber-50/70 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800/60 text-xs">
                        <div>
                          <span className="font-bold text-slate-900 dark:text-amber-200 block">
                            {intl.flag} {intl.entityName} ({intl.countryName})
                          </span>
                          <span className="text-[11px] text-amber-800 dark:text-amber-300">
                            {intl.relation}
                          </span>
                        </div>
                        <button
                          onClick={() => onOpenNetwork(company)}
                          className="text-[11px] text-amber-700 dark:text-amber-300 font-bold hover:underline flex items-center gap-1 shrink-0"
                        >
                          <Share2 className="w-3 h-3" /> Carto
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Corporate Holdings / Personnes Morales if present */}
                {company.corporateLinks?.length > 0 && (
                  <div className="pt-1 space-y-1.5">
                    <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider block">
                      🏢 Détention / Holdings & Personnes Morales (Hors Dirigeants Physiques) :
                    </span>
                    {company.corporateLinks.map((corp, cIdx) => (
                      <div key={cIdx} className="flex items-center justify-between p-2 rounded-lg bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40 text-xs">
                        <div>
                          <span className="font-bold text-slate-800 dark:text-slate-200 block">{corp.name}</span>
                          <span className="text-[11px] text-emerald-700 dark:text-emerald-400">
                            {corp.roleHeld || 'Holding / Associée Morale'} {corp.siren ? `(${corp.siren})` : ''}
                          </span>
                        </div>
                        <button
                          onClick={() => onOpenNetwork(company)}
                          className="text-[11px] text-blue-600 dark:text-blue-400 font-semibold hover:underline flex items-center gap-1"
                        >
                          <Share2 className="w-3 h-3" /> Voir graphe
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* CFO / Décideur Financier & Co-Direction */}
            <div className="bg-slate-50 dark:bg-[#182030] p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                Directeur Financier / CFO & Co-Décideurs
              </span>
              <div className="p-3 rounded-lg bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/40 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    {(!company.cfo?.name || company.cfo.name === 'X' || company.cfo.name.includes('Direction')) ? (
                      <div>
                        <span className="text-sm font-bold text-slate-400 dark:text-slate-500 font-mono italic block">
                          X <span className="text-xs font-sans not-italic text-slate-400">(Pas de 2e mandataire ou CFO inscrit au greffe)</span>
                        </span>
                        <span className="text-xs text-slate-400">Utiliser le bouton ci-dessous pour cibler le DAF/CFO salarié sur LinkedIn</span>
                      </div>
                    ) : (
                      <div>
                        <span className="text-sm font-bold text-slate-900 dark:text-white block">
                          {company.cfo.name}
                        </span>
                        <span className="text-xs text-blue-700 dark:text-blue-300 font-medium">
                          {company.cfo.role || 'Directeur Financier / Co-Décideur'}
                        </span>
                      </div>
                    )}
                  </div>
                  {company.cfo?.name && company.cfo.name !== 'X' && !company.cfo.name.includes('Direction') && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <a
                        href={`https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(company.cfo.name)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="px-2 py-1 bg-[#0a66c2]/10 hover:bg-[#0a66c2]/20 text-[#0a66c2] rounded-lg transition flex items-center gap-1 text-xs font-semibold"
                        title="Chercher sur LinkedIn"
                      >
                        <LinkedinIcon className="w-3.5 h-3.5" />
                        <span>LinkedIn</span>
                      </a>
                    </div>
                  )}
                </div>

                {/* Direct LinkedIn search for CFO / DAF of this company */}
                <div className="pt-1.5 border-t border-blue-200/60 dark:border-blue-900/40 flex items-center justify-between">
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">Ciblage fonction finance :</span>
                  <a
                    href={`https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent((company.name || '').replace(/\([^)]*\)/g, '').trim() + ' CFO OR DAF OR Finance OR Directeur')}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                  >
                    <span>Chercher CFO / Directeurs sur LinkedIn</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
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
                    <span>Rechercher l'entreprise sur LinkedIn (Voir l'équipe & Board)</span>
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
                  {company.phone ? (
                    <>
                      <span className="text-xs font-mono font-bold text-slate-900 dark:text-slate-100 block">
                        {company.phone}
                      </span>
                      <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium block mt-1">
                        ✓ {company.phoneSource || 'Site internet officiel'}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="text-xs font-mono text-slate-400 dark:text-slate-500 italic block">
                        Non renseigné
                      </span>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 block mt-1">
                        {company.website ? 'Non publié sur le site web' : 'Non renseigné au registre légal'}
                      </span>
                    </>
                  )}
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
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <h4 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                  Suivi Commercial & Session Partagée (Anti-Doublon)
                </h4>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-semibold border border-emerald-200 dark:border-emerald-500/30">
                  ☁️ Sync Multi-Postes Active
                </span>
              </div>
              {saveSuccess && (
                <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                  <CheckCircle className="w-4 h-4" /> Synchronisé sur tous les postes !
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* CRM Status Dropdown */}
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1.5">
                  Statut de Prospection (Visible par toute l'équipe)
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
                  Commercial Revolut Assigné (Anti-doublon)
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
                Notes d'appel / Historique de contact (Partagé en direct avec les collègues)
              </label>
              <textarea
                rows={3}
                placeholder="Ex: Appelé ce matin par Kevin — intéressé par le compte multi-devises CHF/EUR. Ne pas relancer avant jeudi."
                value={crmNotes}
                onChange={(e) => setCrmNotes(e.target.value)}
                className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg p-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex items-center justify-between pt-1 flex-wrap gap-2">
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                {company.updatedAt ? `Dernière modification partagée : ${new Date(company.updatedAt).toLocaleString('fr-FR')}` : 'Toute modification ici est immédiatement visible sur les ordinateurs de vos collègues.'}
              </span>
              <button
                onClick={handleSaveCRM}
                disabled={isSaving}
                className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition shadow-md disabled:opacity-50"
              >
                {isSaving ? 'Synchronisation Cloud...' : 'Enregistrer & Partager avec l\'équipe'}
              </button>
            </div>

          </div>

        </div>

      </div>
    </div>
  );
}
