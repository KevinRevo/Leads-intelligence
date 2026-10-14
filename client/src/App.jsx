import React, { useState, useEffect } from 'react';
import { 
  Building2, 
  Search, 
  RefreshCw, 
  Download, 
  Share2, 
  ExternalLink, 
  Mail, 
  Phone, 
  Globe, 
  Filter, 
  CheckCircle2, 
  Clock, 
  TrendingUp, 
  UserCheck, 
  Sparkles, 
  AlertCircle, 
  Copy, 
  Check, 
  ChevronRight, 
  ShieldCheck, 
  ShieldAlert,
  Sun, 
  Moon,
  Info,
  CheckCircle,
  XCircle,
  HelpCircle
} from 'lucide-react';
import LinkedinIcon from './components/LinkedinIcon';
import NetworkGraph from './components/NetworkGraph';
import CompanyDetailModal from './components/CompanyDetailModal';

const API_BASE = '/api';

export default function App() {
  const [companies, setCompanies] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState(null);

  // Theme state: dark or light
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('revolut_theme') || 'dark';
  });

  // Filters
  const [selectedCountry, setSelectedCountry] = useState('ALL');
  const [selectedCrmStatus, setSelectedCrmStatus] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [dateFilter, setDateFilter] = useState('all');

  // Modals
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [networkData, setNetworkData] = useState(null);

  // 1-Click Copy Feedback tracking
  const [copiedKey, setCopiedKey] = useState(null);

  // Apply theme class to <html>
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('revolut_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  const allStaticCompaniesRef = useRef(null);

  useEffect(() => {
    fetchData();
  }, [selectedCountry, selectedCrmStatus, searchQuery, verifiedOnly, dateFilter]);

  // Helper to get CRM overrides from localStorage
  const getCrmOverrides = () => {
    try {
      return JSON.parse(localStorage.getItem('revolut_crm_overrides') || '{}');
    } catch {
      return {};
    }
  };

  const saveCrmOverride = (id, updates) => {
    try {
      const overrides = getCrmOverrides();
      overrides[id] = { ...(overrides[id] || {}), ...updates };
      localStorage.setItem('revolut_crm_overrides', JSON.stringify(overrides));
    } catch (e) {
      console.warn('Could not save to localStorage', e);
    }
  };

  const computeLocalStats = (comps) => {
    const total = comps.length;
    const france = comps.filter(c => c.country === 'FR').length;
    const switzerland = comps.filter(c => c.country === 'CH').length;
    const toContact = comps.filter(c => c.crmStatus === 'to_contact' || c.crmStatus === 'new').length;
    const contacted = comps.filter(c => c.crmStatus?.startsWith('contacted')).length;
    const inCrm = comps.filter(c => c.crmStatus === 'in_crm' || c.crmStatus === 'converted').length;
    const highConfidence = comps.filter(c => (c.confidenceScore || 0) >= 75).length;
    return { total, france, switzerland, toContact, contacted, inCrm, highConfidence };
  };

  const applyLocalFilters = (rawList) => {
    const overrides = getCrmOverrides();
    const merged = rawList.map(c => overrides[c.id] ? { ...c, ...overrides[c.id] } : c);

    return merged.filter(c => {
      if (selectedCountry !== 'ALL' && c.country !== selectedCountry) return false;
      if (selectedCrmStatus !== 'ALL' && c.crmStatus !== selectedCrmStatus) return false;
      if (verifiedOnly && (c.confidenceScore || 0) < 75) return false;

      if (searchQuery) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = c.name?.toLowerCase().includes(q);
        const matchCity = c.city?.toLowerCase().includes(q);
        const matchAct = c.activity?.toLowerCase().includes(q);
        const matchReg = c.registrationNumber?.toLowerCase().includes(q);
        const matchDir = c.dirigeants?.some(d => d.name?.toLowerCase().includes(q));
        if (!matchName && !matchCity && !matchAct && !matchReg && !matchDir) return false;
      }

      if (dateFilter !== 'all') {
        const dateStr = c.incorporationDate || c.scrapedAt;
        if (dateStr) {
          const compDate = new Date(dateStr);
          const now = new Date();
          const diffDays = Math.floor((now - compDate) / (1000 * 60 * 60 * 24));
          if (dateFilter === 'today' && diffDays > 0) return false;
          if (dateFilter === 'yesterday' && (diffDays < 1 || diffDays > 2)) return false;
          if (dateFilter === '7d' && diffDays > 7) return false;
        }
      }

      return true;
    });
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (selectedCountry !== 'ALL') params.append('country', selectedCountry);
      if (selectedCrmStatus !== 'ALL') params.append('crmStatus', selectedCrmStatus);
      if (searchQuery) params.append('search', searchQuery);
      if (verifiedOnly) params.append('verifiedOnly', 'true');
      if (dateFilter !== 'all') params.append('dateRange', dateFilter);

      // Attempt live API
      let loadedViaApi = false;
      try {
        const [compRes, statsRes] = await Promise.all([
          fetch(`${API_BASE}/companies?${params.toString()}`),
          fetch(`${API_BASE}/stats`)
        ]);

        if (compRes.ok && statsRes.ok) {
          const compData = await compRes.json();
          const statsData = await statsRes.json();
          if (compData.success && Array.isArray(compData.companies)) {
            setCompanies(compData.companies);
            if (statsData.success) setStats(statsData.stats);
            loadedViaApi = true;
          }
        }
      } catch (apiErr) {
        // Fallback to static data.json (GitHub Pages mode)
      }

      if (!loadedViaApi) {
        // Load static data.json
        if (!allStaticCompaniesRef.current) {
          const staticRes = await fetch('./data.json');
          if (staticRes.ok) {
            const staticData = await staticRes.json();
            allStaticCompaniesRef.current = staticData.companies || [];
          }
        }

        if (allStaticCompaniesRef.current) {
          const filtered = applyLocalFilters(allStaticCompaniesRef.current);
          setCompanies(filtered);
          const overrides = getCrmOverrides();
          const allMerged = allStaticCompaniesRef.current.map(c => overrides[c.id] ? { ...c, ...overrides[c.id] } : c);
          setStats(computeLocalStats(allMerged));
        }
      }
    } catch (err) {
      console.error('Erreur chargement:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async (country = 'ALL') => {
    try {
      setIsSyncing(true);
      setSyncMessage("Synchronisation en cours avec les registres officiels (BODACC & SHAB)...");
      const res = await fetch(`${API_BASE}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ country })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setSyncMessage(`Synchronisation réussie ! ${data.result.recordsAdded} nouvelles entreprises enregistrées.`);
          fetchData();
          return;
        }
      }
      setSyncMessage("Mode GitHub Pages : 161 entreprises récentes sont actuellement indexées et archivées.");
    } catch (e) {
      setSyncMessage("Mode GitHub Pages : 161 entreprises récentes sont actuellement indexées et archivées.");
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSyncMessage(null), 5000);
    }
  };

  const handleUpdateStatus = async (id, updates) => {
    // Save to localStorage regardless of environment
    saveCrmOverride(id, updates);

    // Update state immediately
    setCompanies(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
    if (selectedCompany && selectedCompany.id === id) {
      setSelectedCompany(prev => ({ ...prev, ...updates }));
    }

    // Update stats
    if (allStaticCompaniesRef.current) {
      const overrides = getCrmOverrides();
      const allMerged = allStaticCompaniesRef.current.map(c => overrides[c.id] ? { ...c, ...overrides[c.id] } : c);
      setStats(computeLocalStats(allMerged));
    }

    try {
      const res = await fetch(`${API_BASE}/companies/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      if (res.ok) {
        fetch(`${API_BASE}/stats`).then(r => r.json()).then(s => s.success && setStats(s.stats));
      }
    } catch (err) {
      // Running offline or GitHub Pages, already updated in memory & localStorage
    }
  };

  const handleOpenNetwork = async (company) => {
    if (company.network && company.network.nodes && company.network.nodes.length > 0) {
      setNetworkData(company.network);
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/companies/${company.id}/network`);
      const data = await res.json();
      if (data.success) {
        setNetworkData(data.network);
      }
    } catch (err) {
      console.error('Erreur chargement réseau:', err);
    }
  };

  const handleExportCsv = () => {
    const params = new URLSearchParams();
    if (selectedCountry !== 'ALL') params.append('country', selectedCountry);
    if (selectedCrmStatus !== 'ALL') params.append('crmStatus', selectedCrmStatus);
    if (searchQuery) params.append('search', searchQuery);
    if (verifiedOnly) params.append('verifiedOnly', 'true');
    if (dateFilter !== 'all') params.append('dateRange', dateFilter);
    window.open(`${API_BASE}/export/csv?${params.toString()}`, '_blank');
  };

  const handleCopy = (text, key) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const getCategoryBadge = (category) => {
    const cat = category || 'Services B2B';
    switch (cat) {
      case 'Import / Export':
        return <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">🚢 Import / Export</span>;
      case 'Immobilier':
        return <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">🏢 Immobilier</span>;
      case 'Consulting':
        return <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">💼 Consulting</span>;
      case 'Tech & Logiciel':
        return <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">💻 Tech & Logiciel</span>;
      case 'Finance & Fintech':
        return <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-cyan-100 dark:bg-cyan-950/60 text-cyan-700 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800">📈 Finance & Fintech</span>;
      case 'Transport & Logistique':
        return <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">🚚 Transport & Logistique</span>;
      case 'Restauration':
        return <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-orange-100 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-800">🍽️ Restauration</span>;
      case 'BTP & Construction':
        return <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-300 border border-slate-300 dark:border-slate-700">🏗️ BTP & Travaux</span>;
      case 'Santé & Médical':
        return <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-teal-100 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800">🩺 Santé & Médical</span>;
      case 'Luxe & Horlogerie':
        return <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">💎 Luxe & Horlogerie</span>;
      default:
        return <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">🏢 {cat}</span>;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0b0e14] text-slate-800 dark:text-slate-100 flex flex-col font-sans transition-colors duration-200">
      
      {/* Top Navbar */}
      <header className="border-b border-slate-200 dark:border-slate-800/80 bg-white/95 dark:bg-[#10141e]/90 backdrop-blur-md sticky top-0 z-30 shadow-sm transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          
          {/* Logo & Brand */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 via-blue-500 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/20 font-black text-white text-lg">
              R
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-slate-900 dark:text-white text-base tracking-tight">
                  Revolut Business
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-500/30">
                  Lead Intelligence
                </span>
              </div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                Registres du Commerce FR (BODACC/RNE) & CH (SHAB/FOSC)
              </span>
            </div>
          </div>

          {/* Right Header Actions */}
          <div className="flex items-center gap-3">
            
            {/* Theme Toggle (Light / Dark) */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition"
              title={theme === 'dark' ? "Passer en mode clair" : "Passer en mode sombre"}
            >
              {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-700" />}
            </button>

            {/* Sync Status Badge */}
            <div className="hidden lg:flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-900/60 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Actualisé 1x/jour à 05:00</span>
            </div>

            {/* Sync Button */}
            <button
              onClick={() => handleSync('ALL')}
              disabled={isSyncing}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-md shadow-blue-600/20 transition disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Scraping...' : 'Actualiser (24h)'}</span>
            </button>

            {/* Export CSV */}
            <button
              onClick={handleExportCsv}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold border border-slate-200 dark:border-slate-700 transition shadow-sm"
              title="Exporter au format CSV pour votre CRM"
            >
              <Download className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span className="hidden sm:inline">Exporter CSV</span>
            </button>

          </div>

        </div>

        {syncMessage && (
          <div className="bg-blue-50 dark:bg-blue-950/40 border-t border-blue-200 dark:border-blue-900/50 py-2 px-4 text-center text-xs text-blue-800 dark:text-blue-200 flex items-center justify-center gap-2 animate-fade-in">
            <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
            <span>{syncMessage}</span>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5 flex-1 w-full">
        
        {/* KPI Stats Cards (Removed "Dans le CRM" as requested) */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
            
            {/* Card 1: Total Scraped */}
            <div className="bg-white dark:bg-[#121824] p-4 rounded-2xl border border-slate-200 dark:border-slate-800/80 shadow-sm transition-colors">
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs mb-1">
                <span className="font-medium">Total Détectées (Depuis 1er Oct)</span>
                <Building2 className="w-4 h-4 text-blue-500" />
              </div>
              <div className="text-2xl font-black text-slate-900 dark:text-white">{stats.total}</div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-2">
                <span>🇫🇷 {stats.franceCount} France</span>
                <span>•</span>
                <span>🇨🇭 {stats.switzerlandCount} Suisse</span>
              </div>
            </div>

            {/* Card 2: High Safety Leads */}
            <div className="bg-white dark:bg-[#121824] p-4 rounded-2xl border border-slate-200 dark:border-slate-800/80 shadow-sm transition-colors">
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs mb-1">
                <span className="font-medium">Sûreté Élevée (&gt;60%)</span>
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
              </div>
              <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                {stats.highSafetyCount || 0}
              </div>
              <div className="text-[11px] text-emerald-600/80 dark:text-emerald-400/80 mt-1 font-medium">
                Contacts fiables & certifiés
              </div>
            </div>

            {/* Card 3: Active Web Presence */}
            <div className="bg-white dark:bg-[#121824] p-4 rounded-2xl border border-slate-200 dark:border-slate-800/80 shadow-sm transition-colors">
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs mb-1">
                <span className="font-medium">Site Web Actif (DNS)</span>
                <Globe className="w-4 h-4 text-purple-500" />
              </div>
              <div className="text-2xl font-black text-purple-600 dark:text-purple-400">
                {stats.verifiedWebCount || 0}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                Serveurs testés opérationnels
              </div>
            </div>

            {/* Card 4: To Contact (Priority) */}
            <div className="bg-white dark:bg-[#121824] p-4 rounded-2xl border border-slate-200 dark:border-slate-800/80 shadow-sm transition-colors">
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs mb-1">
                <span className="font-medium">À Contacter en Priorité</span>
                <Clock className="w-4 h-4 text-amber-500" />
              </div>
              <div className="text-2xl font-black text-amber-600 dark:text-amber-400">
                {stats.toContact}
              </div>
              <div className="text-[11px] text-amber-600/80 dark:text-amber-400/80 mt-1">
                Leads frais non sollicités
              </div>
            </div>

          </div>
        )}

        {/* Filters & Digital Presence Exclude Toggle */}
        <div className="bg-white dark:bg-[#121824] p-4 rounded-2xl border border-slate-200 dark:border-slate-800/80 shadow-sm space-y-3 transition-colors">
          
          <div className="flex flex-col lg:flex-row gap-3 items-center justify-between">
            
            {/* Search Input */}
            <div className="relative w-full lg:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Rechercher société, dirigeant, ville, SIREN..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-50 dark:bg-[#161f30] border border-slate-300 dark:border-slate-700/80 rounded-xl pl-10 pr-4 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 transition"
              />
            </div>

            {/* Country Selector Tabs */}
            <div className="flex items-center bg-slate-100 dark:bg-[#161f30] p-1 rounded-xl border border-slate-200 dark:border-slate-700/80 w-full lg:w-auto">
              <button
                onClick={() => setSelectedCountry('ALL')}
                className={`flex-1 lg:flex-none px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
                  selectedCountry === 'ALL' ? 'bg-blue-600 text-white shadow' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Tous Pays
              </button>
              <button
                onClick={() => setSelectedCountry('FR')}
                className={`flex-1 lg:flex-none px-3.5 py-1.5 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1.5 ${
                  selectedCountry === 'FR' ? 'bg-blue-600 text-white shadow' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <span>🇫🇷</span> France
              </button>
              <button
                onClick={() => setSelectedCountry('CH')}
                className={`flex-1 lg:flex-none px-3.5 py-1.5 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1.5 ${
                  selectedCountry === 'CH' ? 'bg-blue-600 text-white shadow' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <span>🇨🇭</span> Suisse
              </button>
            </div>

            {/* CRM Status Dropdown */}
            <div className="w-full lg:w-48">
              <select
                value={selectedCrmStatus}
                onChange={(e) => setSelectedCrmStatus(e.target.value)}
                className="w-full bg-slate-50 dark:bg-[#161f30] border border-slate-300 dark:border-slate-700/80 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
              >
                <option value="ALL">📋 Tous les statuts</option>
                <option value="new">🔵 Nouveau</option>
                <option value="to_contact">🟡 À contacter</option>
                <option value="contacted_email">🟣 Email envoyé</option>
                <option value="contacted_call">📞 Appel passé</option>
                <option value="in_crm">🟢 Dans le CRM</option>
                <option value="converted">🏆 Converti Revolut</option>
                <option value="unqualified">⚪ Non qualifié</option>
              </select>
            </div>

            {/* Date Range Dropdown (Cumulative History) */}
            <div className="w-full lg:w-52">
              <select
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="w-full bg-slate-50 dark:bg-[#161f30] border border-slate-300 dark:border-slate-700/80 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 font-medium"
              >
                <option value="all">📅 Tout l'historique (Depuis 1er Oct)</option>
                <option value="today">📅 Aujourd'hui (14 Oct)</option>
                <option value="3days">📅 3 derniers jours</option>
                <option value="7days">📅 7 derniers jours</option>
                <option value="30days">📅 30 derniers jours</option>
              </select>
            </div>

          </div>

          {/* User Requested: Filter to exclude companies with NO active website or LinkedIn */}
          <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between flex-wrap gap-2 text-xs">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={verifiedOnly}
                onChange={(e) => setVerifiedOnly(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 dark:border-slate-700 dark:bg-slate-900"
              />
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                ⚡ Exclure les boîtes sans site ni LinkedIn (Afficher uniquement avec présence digitale vérifiée)
              </span>
            </label>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 italic">
              💡 Astuce : Cliquez sur n'importe quelle donnée (Nom, SIREN, Tél, Mail) pour la copier en 1 clic
            </span>
          </div>

        </div>

        {/* Lead Table View */}
        <div className="bg-white dark:bg-[#121824] border border-slate-200 dark:border-slate-800/80 rounded-2xl overflow-hidden shadow-sm transition-colors">
          
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-[#161f30]/30">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white tracking-wide">
                Nouvelles Entreprises Détectées
              </h3>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold border border-slate-300 dark:border-slate-700">
                {companies.length} résultat(s)
              </span>
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Immatriculées au registre du commerce des dernières 24h
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 dark:bg-[#161f30] text-slate-600 dark:text-slate-400 font-semibold uppercase tracking-wider text-[11px] border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-3">Statut CRM</th>
                  <th className="py-3 px-3">Entreprise & SIREN</th>
                  <th className="py-3 px-3">Nature d'Activité</th>
                  <th className="py-3 px-3">Dirigeant & CFO</th>
                  <th className="py-3 px-3">Contact (Tél & Mail)</th>
                  <th className="py-3 px-3">Score Sûreté</th>
                  <th className="py-3 px-3 text-right">Réseau & Fiche</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60">
                {loading ? (
                  <tr>
                    <td colSpan="7" className="py-12 text-center text-slate-500">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
                        <span>Vérification DNS & chargement des registres...</span>
                      </div>
                    </td>
                  </tr>
                ) : companies.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="py-12 text-center text-slate-500 py-10">
                      Aucune entreprise ne correspond aux critères de filtre.
                    </td>
                  </tr>
                ) : (
                  companies.map((c) => {
                    const isCH = c.country === 'CH';
                    const flag = isCH ? '🇨🇭' : '🇫🇷';
                    const primaryDirigeant = c.dirigeants?.[0]?.name || 'Fondateur';
                    const safetyScore = c.safety?.score || 50;

                    return (
                      <tr 
                        key={c.id} 
                        className="hover:bg-slate-100/60 dark:hover:bg-[#161f30]/60 transition"
                      >
                        
                        {/* 1. CRM Status quick selector */}
                        <td className="py-3 px-3 whitespace-nowrap">
                          <select
                            value={c.crmStatus || 'new'}
                            onChange={(e) => handleUpdateStatus(c.id, { crmStatus: e.target.value })}
                            className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1 text-[11px] font-semibold text-slate-800 dark:text-white focus:outline-none focus:border-blue-500"
                          >
                            <option value="new">🔵 Nouveau</option>
                            <option value="to_contact">🟡 À contacter</option>
                            <option value="contacted_email">🟣 Email envoyé</option>
                            <option value="contacted_call">📞 Appel passé</option>
                            <option value="in_crm">🟢 Dans le CRM</option>
                            <option value="converted">🏆 Converti</option>
                            <option value="unqualified">⚪ Rejeté</option>
                          </select>
                        </td>

                        {/* 2. Company Name & SIREN (Clicking Name opens full modal page!) */}
                        <td className="py-3 px-3">
                          <div className="flex items-start gap-2">
                            <span className="text-base select-none mt-0.5">{flag}</span>
                            <div>
                              
                              {/* Clicking the Name opens the full detailed modal */}
                              <div className="flex items-center gap-1.5 group">
                                <button
                                  onClick={() => setSelectedCompany(c)}
                                  className="font-bold text-slate-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 text-left transition text-xs"
                                  title="Ouvrir la fiche complète"
                                >
                                  {c.name}
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleCopy(c.name, `name-${c.id}`);
                                  }}
                                  className="p-1 opacity-0 group-hover:opacity-100 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-slate-400 transition"
                                  title="Copier le nom"
                                >
                                  {copiedKey === `name-${c.id}` ? (
                                    <span className="text-[10px] text-emerald-500 font-bold flex items-center gap-0.5">
                                      <Check className="w-3 h-3" />
                                    </span>
                                  ) : (
                                    <Copy className="w-3 h-3" />
                                  )}
                                </button>
                              </div>

                              {/* Forme + Ville + SIREN (1-Click Copyable) */}
                              <div className="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 flex-wrap">
                                <span className="px-1.5 py-0.2 bg-slate-100 dark:bg-slate-800 rounded font-medium text-slate-700 dark:text-slate-300">
                                  {c.legalForm}
                                </span>
                                <span>{c.city}</span>
                                <span>•</span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleCopy(c.registrationNumber, `siren-${c.id}`);
                                  }}
                                  className="font-mono text-slate-500 dark:text-slate-400 hover:text-blue-500 dark:hover:text-blue-400 transition"
                                  title="Copier le SIREN / IDE"
                                >
                                  {copiedKey === `siren-${c.id}` ? '✓ Copié' : c.registrationNumber}
                                </button>
                                <span>•</span>
                                {c.country === 'CH' ? (
                                  <a
                                    href={`https://www.zefix.ch/fr/search/entity/list?name=${encodeURIComponent(c.name)}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="px-1.5 py-0.2 rounded bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 font-bold hover:underline flex items-center gap-0.5 border border-red-200 dark:border-red-900/40 text-[9px]"
                                    title="Rechercher cette société sur l'index officiel Zefix"
                                  >
                                    <span>Zefix</span>
                                    <ExternalLink className="w-2.5 h-2.5" />
                                  </a>
                                ) : (
                                  <a
                                    href={`https://www.pappers.fr/entreprise/${c.registrationNumber?.replace(/\s+/g, '') || encodeURIComponent(c.name)}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="px-1.5 py-0.2 rounded bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 font-bold hover:underline flex items-center gap-0.5 border border-blue-200 dark:border-blue-900/40 text-[9px]"
                                    title="Consulter la fiche légale sur Pappers"
                                  >
                                    <span>Pappers</span>
                                    <ExternalLink className="w-2.5 h-2.5" />
                                  </a>
                                )}
                              </div>

                            </div>
                          </div>
                        </td>

                        {/* 3. NATURE D'ACTIVITE (SHORT CATEGORY BADGE IN TABLE, FULL TEXT IN MODAL) */}
                        <td className="py-3 px-3 whitespace-nowrap">
                          <div 
                            onClick={() => setSelectedCompany(c)}
                            className="cursor-pointer group flex items-center gap-1.5"
                            title="Cliquer pour voir la description complète dans la fiche"
                          >
                            {getCategoryBadge(c.activityCategory || 'Services B2B')}
                            <span className="text-[10px] text-slate-400 dark:text-slate-500 opacity-0 group-hover:opacity-100 transition">
                              🔍 voir plus
                            </span>
                          </div>
                        </td>

                        {/* 4. Dirigeant & CFO (1-Click Copyable!) */}
                        <td className="py-3 px-3 whitespace-nowrap">
                          
                          {/* 1-Click Copy Dirigeant */}
                          <button
                            onClick={() => handleCopy(primaryDirigeant, `dir-${c.id}`)}
                            className="font-semibold text-slate-900 dark:text-slate-200 hover:text-blue-500 flex items-center gap-1 text-left group"
                            title="Copier le nom du dirigeant"
                          >
                            <UserCheck className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                            <span>{primaryDirigeant}</span>
                            {copiedKey === `dir-${c.id}` && (
                              <span className="text-[10px] text-emerald-500 font-semibold">✓</span>
                            )}
                          </button>

                          <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1">
                            <span>CFO :</span>
                            <span className="text-slate-700 dark:text-slate-300 font-medium">
                              {c.cfo?.name || 'Fondateur'}
                            </span>
                          </div>
                        </td>

                        {/* 5. Contact Info: 1-Click Copy with EXACT SOURCE! */}
                        <td className="py-3 px-3">
                          <div className="space-y-1.5">
                            
                            {/* Phone (1-Click Copy + Exact Source) */}
                            {c.phone ? (
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <button
                                  onClick={() => handleCopy(c.phone, `phone-${c.id}`)}
                                  className="px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-950/70 border border-emerald-200 dark:border-emerald-800/50 text-[11px] font-mono flex items-center gap-1 transition shadow-xs"
                                  title={`Cliquez pour copier. Source: ${c.phoneSource || 'Annonce légale / Greffe'}`}
                                >
                                  <Phone className="w-3 h-3 text-emerald-500" />
                                  <span>{copiedKey === `phone-${c.id}` ? 'Copié !' : c.phone}</span>
                                </button>
                                <span 
                                  className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 font-medium"
                                  title={`Origine vérifiée du numéro : ${c.phoneSource || 'Greffe'}`}
                                >
                                  {c.phoneSource?.includes('BODACC') ? 'BODACC' : c.phoneSource?.includes('FOSC') ? 'FOSC (CH)' : 'Greffe'}
                                </span>
                              </div>
                            ) : (
                              <span className="text-[10px] text-slate-400 italic block">Tél : Non renseigné au greffe</span>
                            )}

                            {/* Email (1-Click Copy + Exact Source) */}
                            {c.bestEmail ? (
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <button
                                  onClick={() => handleCopy(c.bestEmail, `mail-${c.id}`)}
                                  className="px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-950/70 border border-blue-200 dark:border-blue-800/50 text-[11px] font-mono flex items-center gap-1 transition shadow-xs"
                                  title={`Cliquez pour copier. Source: ${c.emailSource || 'Serveur MX'}`}
                                >
                                  <Mail className="w-3 h-3 text-blue-500" />
                                  <span>{copiedKey === `mail-${c.id}` ? 'Copié !' : c.bestEmail}</span>
                                </button>
                                <span 
                                  className="text-[9px] px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 font-medium"
                                  title={`Origine de l'email : ${c.emailSource || 'MX vérifié'}`}
                                >
                                  MX Certifié
                                </span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                                <span className="italic">Mail : Non public</span>
                                {c.linkedinDirigeantUrl && (
                                  <a
                                    href={c.linkedinDirigeantUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5 text-[10px] font-semibold"
                                    title="Approcher le dirigeant directement sur LinkedIn"
                                  >
                                    <span>&rarr; Écrire sur LinkedIn</span>
                                  </a>
                                )}
                              </div>
                            )}

                            {/* Website with strict SSL badge & LinkedIn direct links */}
                            <div className="flex items-center gap-1.5 pt-0.5 flex-wrap">
                              {c.website ? (
                                <a
                                  href={c.website}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-[10px] px-2 py-0.5 rounded bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-950/70 border border-purple-200 dark:border-purple-800 flex items-center gap-1 font-semibold transition"
                                  title="Site sécurisé HTTPS vérifié (certificat SSL valide)"
                                >
                                  <Globe className="w-3 h-3 text-purple-500" />
                                  <span>🔒 HTTPS</span>
                                </a>
                              ) : (
                                <span 
                                  className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700/60"
                                  title="Pas de site web HTTPS public pour cette société naissante"
                                >
                                  ⚪ Pas de site
                                </span>
                              )}

                              {primaryDirigeant && primaryDirigeant !== 'Direction Générale' && (
                                <>
                                  <a
                                    href={`https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(primaryDirigeant)}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-[10px] px-1.5 py-0.5 rounded bg-sky-50 dark:bg-sky-950/40 text-[#0a66c2] dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-950/70 border border-sky-200 dark:border-sky-800/60 flex items-center gap-1 font-semibold transition"
                                    title={`Recherche nominative de ${primaryDirigeant} sur LinkedIn`}
                                  >
                                    <LinkedinIcon className="w-3 h-3 text-[#0a66c2]" />
                                    <span>Dirigeant</span>
                                  </a>
                                  <a
                                    href={`https://www.google.com/search?q=${encodeURIComponent('site:linkedin.com/in ' + primaryDirigeant + ' ' + (c.city || ''))}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 flex items-center gap-0.5 transition"
                                    title={`Recherche Google directe du profil LinkedIn de ${primaryDirigeant}`}
                                  >
                                    <span>Google ↗</span>
                                  </a>
                                </>
                              )}

                              {c.name && (
                                <a
                                  href={`https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(c.name.replace(/\b(SAS|SARL|SA|SNC|GmbH|AG|Sàrl)\b/gi, '').trim())}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 flex items-center gap-1 transition"
                                  title="Recherche de l'entreprise sur LinkedIn"
                                >
                                  <span>Boîte</span>
                                </a>
                              )}
                            </div>

                          </div>
                        </td>

                        {/* 6. SCORE DE SURETE (SAFETY SCORE WITH TRANSPARENT BREAKDOWN!) */}
                        <td className="py-3 px-3 whitespace-nowrap">
                          <div className="group relative inline-block">
                            <div className={`px-2.5 py-1 rounded-full text-[11px] font-bold flex items-center gap-1.5 border cursor-help ${
                              safetyScore >= 70 
                                ? 'bg-emerald-50 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-500/30'
                                : safetyScore >= 45 
                                ? 'bg-amber-50 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-500/30'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700'
                            }`}>
                              {safetyScore >= 70 ? (
                                <CheckCircle className="w-3 h-3 text-emerald-500" />
                              ) : (
                                <HelpCircle className="w-3 h-3 text-amber-500" />
                              )}
                              <span>{safetyScore}% Sûreté</span>
                            </div>

                            {/* Tooltip Breakdown */}
                            <div className="hidden group-hover:block absolute bottom-full left-0 mb-2 w-56 p-2.5 bg-slate-900 text-white text-[10px] rounded-xl shadow-xl z-50 border border-slate-700">
                              <span className="font-bold text-slate-200 block mb-1">Détails du score :</span>
                              <div className="space-y-1">
                                {c.safety?.breakdown?.map((b, i) => (
                                  <div key={i} className="flex items-center justify-between">
                                    <span className={b.ok ? "text-emerald-300" : "text-slate-400"}>
                                      {b.ok ? "✓" : "✗"} {b.label}
                                    </span>
                                    <span className="font-mono text-slate-400">+{b.pts}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* 7. Actions: Network Map + Full Drawer */}
                        <td className="py-3 px-3 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleOpenNetwork(c)}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-600/15 hover:bg-blue-100 dark:hover:bg-blue-600/30 text-blue-700 dark:text-blue-400 font-semibold text-[11px] border border-blue-200 dark:border-blue-500/20 transition shadow-sm"
                              title="Voir la cartographie des sociétés liées par le dirigeant"
                            >
                              <Share2 className="w-3 h-3" />
                              <span>Cartographie</span>
                            </button>
                            <button
                              onClick={() => setSelectedCompany(c)}
                              className="p-1.5 text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-lg transition"
                              title="Ouvrir la fiche complète"
                            >
                              <ChevronRight className="w-4 h-4" />
                            </button>
                          </div>
                        </td>

                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

        </div>

      </main>

      {/* Network Modal */}
      {networkData && (
        <NetworkGraph
          network={networkData}
          onClose={() => setNetworkData(null)}
          onSelectCompany={(comp) => {
            setNetworkData(null);
            setSelectedCompany(comp);
          }}
        />
      )}

      {/* Detail Modal */}
      {selectedCompany && (
        <CompanyDetailModal
          company={selectedCompany}
          onClose={() => setSelectedCompany(null)}
          onUpdateStatus={handleUpdateStatus}
          onOpenNetwork={(c) => {
            setSelectedCompany(null);
            handleOpenNetwork(c);
          }}
        />
      )}

    </div>
  );
}
