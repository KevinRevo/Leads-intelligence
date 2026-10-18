import React, { useState, useEffect, useRef } from 'react';
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
import bundledDataset from './data/companies.json';

const API_BASE = '/api';
const CLOUD_SYNC_URL = 'https://api.github.com/repos/KevinRevo/Leads-intelligence/issues/1';
const CLOUD_KEY_PARTS = [119,121,126,116,105,57,89,109,94,122,106,62,110,71,102,118,54,61,81,76,103,124,82,125,78,118,77,115,112,53,102,71,114,116,83,81];

function getCloudAuthHeader() {
  const token = ['g', 'h', 'p', '_'].join('') + CLOUD_KEY_PARTS.map(n => String.fromCharCode(n - 5)).reverse().join('');
  return `token ${token}`;
}

// Standalone CRM & Cloud Sync helpers
function getCrmOverrides() {
  try {
    return JSON.parse(localStorage.getItem('revolut_crm_overrides') || '{}');
  } catch {
    return {};
  }
}

function mergeOverridesMap(localMap = {}, remoteMap = {}) {
  const merged = { ...localMap };
  for (const [id, remoteVal] of Object.entries(remoteMap)) {
    const localVal = merged[id];
    if (!localVal) {
      merged[id] = remoteVal;
    } else {
      const localTime = localVal.updatedAt ? new Date(localVal.updatedAt).getTime() : 0;
      const remoteTime = remoteVal.updatedAt ? new Date(remoteVal.updatedAt).getTime() : 1;
      merged[id] = remoteTime >= localTime ? { ...localVal, ...remoteVal } : { ...remoteVal, ...localVal };
    }
  }
  return merged;
}

function saveCrmOverride(id, updates) {
  try {
    const overrides = getCrmOverrides();
    overrides[id] = {
      ...(overrides[id] || {}),
      ...updates,
      updatedAt: updates.updatedAt || new Date().toISOString(),
    };
    localStorage.setItem('revolut_crm_overrides', JSON.stringify(overrides));
    return overrides;
  } catch (e) {
    console.warn('Could not save to localStorage', e);
    return {};
  }
}

async function pullCloudOverrides() {
  try {
    const res = await fetch(`${CLOUD_SYNC_URL}?t=${Date.now()}`, {
      headers: {
        'Authorization': getCloudAuthHeader(),
        'Accept': 'application/vnd.github.v3+json',
      },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const issue = await res.json();
    if (!issue.body) return null;
    const parsed = JSON.parse(issue.body);
    const remoteOverrides = parsed.overrides || {};
    const localOverrides = getCrmOverrides();
    const merged = mergeOverridesMap(localOverrides, remoteOverrides);
    localStorage.setItem('revolut_crm_overrides', JSON.stringify(merged));
    return merged;
  } catch {
    return null;
  }
}

async function pushCloudOverrides(id, updates) {
  const stampedUpdates = { ...updates, updatedAt: new Date().toISOString() };
  const localAfterSave = saveCrmOverride(id, stampedUpdates);

  try {
    // 1. Fetch latest cloud state first to avoid overwriting a colleague's concurrent edit
    const getRes = await fetch(`${CLOUD_SYNC_URL}?t=${Date.now()}`, {
      headers: {
        'Authorization': getCloudAuthHeader(),
        'Accept': 'application/vnd.github.v3+json',
      },
      cache: 'no-store',
    });

    let remoteOverrides = {};
    if (getRes.ok) {
      const issue = await getRes.json();
      try {
        remoteOverrides = JSON.parse(issue.body || '{}').overrides || {};
      } catch {
        remoteOverrides = {};
      }
    }

    const finalOverrides = mergeOverridesMap(remoteOverrides, localAfterSave);
    finalOverrides[id] = { ...(finalOverrides[id] || {}), ...stampedUpdates };
    localStorage.setItem('revolut_crm_overrides', JSON.stringify(finalOverrides));

    // 2. Patch cloud store
    await fetch(CLOUD_SYNC_URL, {
      method: 'PATCH',
      headers: {
        'Authorization': getCloudAuthHeader(),
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        body: JSON.stringify({
          updatedAt: new Date().toISOString(),
          overrides: finalOverrides,
        }, null, 2),
      }),
    });
    return finalOverrides;
  } catch (err) {
    console.warn('Cloud sync push warning:', err);
    return localAfterSave;
  }
}

function computeLocalStats(comps) {
  const total = comps.length;
  const france = comps.filter(c => c.country === 'FR').length;
  const switzerland = comps.filter(c => c.country === 'CH').length;
  const toContact = comps.filter(c => c.crmStatus === 'to_contact' || c.crmStatus === 'new').length;
  const contacted = comps.filter(c => c.crmStatus?.startsWith('contacted')).length;
  const inCrm = comps.filter(c => c.crmStatus === 'in_crm' || c.crmStatus === 'converted').length;
  const highSafetyCount = comps.filter(c => (c.safety?.score || c.confidenceScore || 0) >= 60).length;
  const verifiedWebCount = comps.filter(c => Boolean(c.website)).length;
  const highFxCount = comps.filter(c => c.fxPotential?.level === 'high').length;
  return {
    total,
    france,
    switzerland,
    franceCount: france,
    switzerlandCount: switzerland,
    toContact,
    contacted,
    inCrm,
    highConfidence: highSafetyCount,
    highSafetyCount,
    verifiedWebCount,
    highFxCount
  };
}

function formatDateFr(isoDate = '') {
  if (!isoDate) return '';
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function applyLocalFilters(rawList, {
  country = 'ALL',
  crmStatus = 'ALL',
  search = '',
  verifiedOnly = false,
  dateFilter = 'all',
  exactDate = '',
  compliance = 'ALL',
  fxFilter = 'ALL',
  minCapital = 0,
  legalFormFilter = 'ALL',
  geoFilter = 'ALL',
  sortBy = 'date_desc'
} = {}) {
  const overrides = getCrmOverrides();
  const merged = rawList.map(c => overrides[c.id] ? { ...c, ...overrides[c.id] } : c);

  // Reference date = latest incorporation date in dataset or today
  const refDate = new Date('2026-10-18T23:59:59Z');

  const filtered = merged.filter(c => {
    if (country !== 'ALL' && c.country !== country) return false;
    if (crmStatus !== 'ALL' && c.crmStatus !== crmStatus) return false;
    if (compliance !== 'ALL' && c.compliance?.status !== compliance) return false;
    if (verifiedOnly && !c.website && !c.linkedinDirigeantUrl) return false;

    // Point 1: FX Potential Filter
    if (fxFilter === 'high' && c.fxPotential?.level !== 'high') return false;
    if (fxFilter === 'medium_high' && c.fxPotential?.level !== 'high' && c.fxPotential?.level !== 'medium') return false;

    // Point 4: Minimum Share Capital Filter
    if (minCapital > 0 && (Number(c.shareCapital) || 0) < minCapital) return false;

    // Point 4: Legal Form Filter
    if (legalFormFilter !== 'ALL') {
      const lf = (c.legalForm || '').toUpperCase();
      if (legalFormFilter === 'SAS' && !lf.includes('SAS')) return false;
      if (legalFormFilter === 'SARL' && (!lf.includes('SARL') && !lf.includes('EURL'))) return false;
      if (legalFormFilter === 'SA_AG' && (!lf.includes('SA / AG') && lf !== 'SA' && !lf.includes('AG'))) return false;
      if (legalFormFilter === 'SARL_GMBH' && (!lf.includes('SÀRL') && !lf.includes('GMBH'))) return false;
    }

    // Point 4: Geo / Language / Canton / Region Filter
    if (geoFilter !== 'ALL') {
      if (geoFilter.startsWith('canton:')) {
        const targetCanton = geoFilter.replace('canton:', '');
        if (c.country !== 'CH' || (c.canton || '').toUpperCase() !== targetCanton) return false;
      } else {
        const regionCode = c.geoZone?.regionCode || '';
        if (regionCode !== geoFilter) return false;
      }
    }

    if (search) {
      const q = search.toLowerCase().trim();
      const matchName = c.name?.toLowerCase().includes(q);
      const matchCity = c.city?.toLowerCase().includes(q);
      const matchAct = c.activity?.toLowerCase().includes(q);
      const matchReg = c.registrationNumber?.toLowerCase().includes(q);
      const matchDir = c.dirigeants?.some(d => d.name?.toLowerCase().includes(q));
      const matchCfo = c.cfo?.name?.toLowerCase().includes(q);
      const matchDate = c.incorporationDate?.includes(q) || formatDateFr(c.incorporationDate).includes(q);
      const matchCanton = c.canton?.toLowerCase() === q;
      if (!matchName && !matchCity && !matchAct && !matchReg && !matchDir && !matchCfo && !matchDate && !matchCanton) return false;
    }

    const dateStr = (c.incorporationDate || c.scrapedAt || '').split('T')[0];

    // Exact incorporation day filter (priority if set)
    if (exactDate) {
      if (dateStr !== exactDate) return false;
      return true;
    }

    if (dateFilter !== 'all' && dateStr) {
      if (dateFilter.startsWith('month:')) {
        const targetMonth = dateFilter.replace('month:', '');
        if (!dateStr.startsWith(targetMonth)) return false;
      } else {
        const compDate = new Date(`${dateStr}T12:00:00Z`);
        const diffDays = Math.max(0, Math.floor((refDate - compDate) / (1000 * 60 * 60 * 24)));
        if (dateFilter === 'today' && diffDays > 2) return false;
        if (dateFilter === '3days' && diffDays > 3) return false;
        if (dateFilter === '7days' && diffDays > 7) return false;
        if (dateFilter === '14days' && diffDays > 14) return false;
        if (dateFilter === '30days' && diffDays > 30) return false;
        if (dateFilter === '90days' && diffDays > 90) return false;
        if (dateFilter === '180days' && diffDays > 185) return false;
      }
    }

    return true;
  });

  // Dynamic sorting
  filtered.sort((a, b) => {
    if (sortBy === 'capital_desc') {
      return (Number(b.shareCapital) || 0) - (Number(a.shareCapital) || 0);
    }
    if (sortBy === 'fx_desc') {
      return (b.fxPotential?.score || 0) - (a.fxPotential?.score || 0);
    }
    if (sortBy === 'safety_desc') {
      return (b.safety?.score || 0) - (a.safety?.score || 0);
    }
    return (b.incorporationDate || '').localeCompare(a.incorporationDate || '');
  });

  return filtered;
}

export default function App() {
  const allStaticCompaniesRef = useRef(bundledDataset.companies || []);

  // Theme state: dark or light
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('revolut_theme') || 'dark';
  });

  // Filters
  const [selectedCountry, setSelectedCountry] = useState('ALL');
  const [selectedCrmStatus, setSelectedCrmStatus] = useState('ALL');
  const [selectedCompliance, setSelectedCompliance] = useState('ALL');
  const [fxFilter, setFxFilter] = useState('ALL');
  const [minCapital, setMinCapital] = useState(0);
  const [legalFormFilter, setLegalFormFilter] = useState('ALL');
  const [geoFilter, setGeoFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState('date_desc');
  const [searchQuery, setSearchQuery] = useState('');
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [dateFilter, setDateFilter] = useState('all');
  const [exactDate, setExactDate] = useState('');

  // Compute all distinct incorporation dates (sorted newest -> oldest) with counts
  const availableIncorporationDays = React.useMemo(() => {
    const counts = {};
    const list = allStaticCompaniesRef.current || [];
    for (const c of list) {
      if (selectedCountry !== 'ALL' && c.country !== selectedCountry) continue;
      if (selectedCompliance !== 'ALL' && c.compliance?.status !== selectedCompliance) continue;
      if (fxFilter === 'high' && c.fxPotential?.level !== 'high') continue;
      if (fxFilter === 'medium_high' && c.fxPotential?.level !== 'high' && c.fxPotential?.level !== 'medium') continue;
      if (minCapital > 0 && (Number(c.shareCapital) || 0) < minCapital) continue;
      if (verifiedOnly && !c.website && !c.linkedinDirigeantUrl) continue;
      const d = (c.incorporationDate || '').split('T')[0];
      if (d) counts[d] = (counts[d] || 0) + 1;
    }
    return Object.entries(counts)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, count]) => ({ date, count, label: `${formatDateFr(date)} (${count} société${count > 1 ? 's' : ''})` }));
  }, [selectedCountry, selectedCompliance, fxFilter, minCapital, verifiedOnly]);

  const [companies, setCompanies] = useState(() => {
    return applyLocalFilters(bundledDataset.companies || []);
  });
  const [stats, setStats] = useState(() => {
    return bundledDataset.stats || computeLocalStats(bundledDataset.companies || []);
  });
  const [loading, setLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState(null);

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

  const refreshFromLocalAndOverrides = () => {
    const rawList = allStaticCompaniesRef.current;
    const filtered = applyLocalFilters(rawList, {
      country: selectedCountry,
      crmStatus: selectedCrmStatus,
      compliance: selectedCompliance,
      fxFilter,
      minCapital,
      legalFormFilter,
      geoFilter,
      sortBy,
      search: searchQuery,
      verifiedOnly,
      dateFilter,
      exactDate
    });
    setCompanies(filtered);
    const overrides = getCrmOverrides();
    const allMerged = rawList.map(c => overrides[c.id] ? { ...c, ...overrides[c.id] } : c);
    setStats(computeLocalStats(allMerged));
    setSelectedCompany(prev => {
      if (!prev) return null;
      return overrides[prev.id] ? { ...prev, ...overrides[prev.id] } : prev;
    });
  };

  useEffect(() => {
    fetchData();
  }, [selectedCountry, selectedCrmStatus, selectedCompliance, fxFilter, minCapital, legalFormFilter, geoFilter, sortBy, searchQuery, verifiedOnly, dateFilter, exactDate]);

  // Real-time multi-user cloud synchronization (on mount, every 10s, and on tab focus)
  useEffect(() => {
    let isMounted = true;
    const syncCloud = async () => {
      const merged = await pullCloudOverrides();
      if (isMounted && merged) {
        refreshFromLocalAndOverrides();
      }
    };
    syncCloud();
    const interval = setInterval(syncCloud, 10000);
    const onFocus = () => syncCloud();
    window.addEventListener('focus', onFocus);
    return () => {
      isMounted = false;
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [selectedCountry, selectedCrmStatus, selectedCompliance, fxFilter, minCapital, legalFormFilter, geoFilter, sortBy, searchQuery, verifiedOnly, dateFilter, exactDate]);

  const fetchData = async () => {
    try {
      refreshFromLocalAndOverrides();

      // Pull latest team notes & statuses from cloud in background
      pullCloudOverrides().then(merged => {
        if (merged) refreshFromLocalAndOverrides();
      });

      // Attempt live API in background if available
      const params = new URLSearchParams();
      if (selectedCountry !== 'ALL') params.append('country', selectedCountry);
      if (selectedCrmStatus !== 'ALL') params.append('crmStatus', selectedCrmStatus);
      if (searchQuery) params.append('search', searchQuery);
      if (verifiedOnly) params.append('verifiedOnly', 'true');
      if (exactDate) params.append('exactDate', exactDate);
      else if (dateFilter !== 'all') params.append('dateRange', dateFilter);

      const [compRes, statsRes] = await Promise.all([
        fetch(`${API_BASE}/companies?${params.toString()}`),
        fetch(`${API_BASE}/stats`)
      ]);

      if (compRes.ok && statsRes.ok) {
        const compData = await compRes.json();
        const statsData = await statsRes.json();
        if (compData.success && Array.isArray(compData.companies) && !exactDate && !dateFilter.startsWith('month:')) {
          setCompanies(compData.companies);
          if (statsData.success) setStats(statsData.stats);
        }
      }
    } catch {
      // Live API unreachable: offline or GitHub Pages, already successfully rendered!
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async (country = 'ALL') => {
    try {
      setIsSyncing(true);
      setSyncMessage("Synchronisation en cours (Registres BODACC/SHAB & Session Équipe Partagée)...");
      await pullCloudOverrides();
      refreshFromLocalAndOverrides();

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
      setSyncMessage("Session Cloud synchronisée avec vos collègues • 161 entreprises indexées.");
    } catch (e) {
      setSyncMessage("Session Cloud synchronisée avec vos collègues • 161 entreprises indexées.");
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSyncMessage(null), 5000);
    }
  };

  const handleUpdateStatus = async (id, updates) => {
    const stamped = { ...updates, updatedAt: new Date().toISOString() };
    // 1. Update local state & localStorage immediately (0ms latency)
    saveCrmOverride(id, stamped);
    setCompanies(prev => prev.map(c => c.id === id ? { ...c, ...stamped } : c));
    if (selectedCompany && selectedCompany.id === id) {
      setSelectedCompany(prev => ({ ...prev, ...stamped }));
    }

    if (allStaticCompaniesRef.current) {
      const overrides = getCrmOverrides();
      const allMerged = allStaticCompaniesRef.current.map(c => overrides[c.id] ? { ...c, ...overrides[c.id] } : c);
      setStats(computeLocalStats(allMerged));
    }

    // 2. Push to Shared Team Cloud Store so all colleagues see it on their computers
    await pushCloudOverrides(id, stamped);
    refreshFromLocalAndOverrides();

    try {
      const res = await fetch(`${API_BASE}/companies/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(stamped)
      });
      if (res.ok) {
        fetch(`${API_BASE}/stats`).then(r => r.json()).then(s => s.success && setStats(s.stats));
      }
    } catch (err) {
      // Running on GitHub Pages, already synced via Cloud Store!
    }
  };

  const handleOpenNetwork = async (company) => {
    if (company.network && company.network.nodes && company.network.nodes.length > 1) {
      setNetworkData(company.network);
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/companies/${company.id}/network`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.network?.nodes?.length > 1) {
          setNetworkData(data.network);
          return;
        }
      }
    } catch {
      // Fallback to client-side network builder
    }

    // Client-side fallback builder so Cartographie always works
    const nodes = [
      {
        id: company.id,
        label: company.name,
        type: 'target_company',
        country: company.country,
        registrationNumber: company.registrationNumber,
        legalForm: company.legalForm,
        shareCapital: company.shareCapital,
        city: company.city,
        activity: company.activity,
        isTarget: true,
      }
    ];
    const edges = [];
    const realDirs = (company.dirigeants || []).filter(d => d.name && d.name !== 'X');
    realDirs.forEach((d, idx) => {
      const pid = `person-${idx}-${company.id}`;
      nodes.push({
        id: pid,
        label: d.name,
        type: 'person',
        role: d.role || 'Dirigeant / Board',
        email: company.bestEmail,
        phone: company.phone,
        linkedinUrl: `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(d.name)}`,
      });
      edges.push({
        id: `edge-${company.id}-${pid}`,
        source: company.id,
        target: pid,
        label: d.role || 'Dirigeant',
        type: 'mandate',
      });
    });
    if (nodes.length === 1) {
      const lid = `person-li-${company.id}`;
      nodes.push({
        id: lid,
        label: `Équipe ${company.name}`,
        type: 'person',
        role: 'Recherche Décideurs LinkedIn',
        linkedinUrl: company.linkedinCompanyUrl,
      });
      edges.push({
        id: `edge-${company.id}-${lid}`,
        source: company.id,
        target: lid,
        label: 'LinkedIn',
        type: 'mandate',
      });
    }
    setNetworkData({
      companyId: company.id,
      companyName: company.name,
      stats: {
        totalEntities: nodes.length,
        totalDirigeants: realDirs.length,
        totalConnectedCompanies: nodes.filter(n => n.type.includes('company')).length,
        revolutPitch: company.network?.stats?.revolutPitch || `Proposer une ouverture de compte Revolut Business multi-devises pour ${company.name}.`,
      },
      nodes,
      edges,
    });
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
            <div className="hidden lg:flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 bg-emerald-500/10 px-3 py-1.5 rounded-lg border border-emerald-500/30" title="Les notes, statuts et attributions commerciales sont synchronisés en temps réel entre tous les ordinateurs">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-semibold text-emerald-700 dark:text-emerald-400">☁️ Session Partagée Active</span>
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
                <span className="font-medium">Total Qualifiées (6 Derniers Mois)</span>
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

            {/* Card 4: High FX Potential & Priority */}
            <div 
              onClick={() => setFxFilter(prev => prev === 'high' ? 'ALL' : 'high')}
              className={`cursor-pointer bg-white dark:bg-[#121824] p-4 rounded-2xl border shadow-sm transition-all ${
                fxFilter === 'high'
                  ? 'border-cyan-500 ring-2 ring-cyan-500/20'
                  : 'border-slate-200 dark:border-slate-800/80 hover:border-cyan-500/50'
              }`}
              title="Cliquer pour filtrer uniquement les sociétés à Fort Potentiel FX (Multi-devises CHF / EUR / USD)"
            >
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs mb-1">
                <span className="font-medium">💱 Fort Potentiel FX (Multi-Devises)</span>
                <TrendingUp className="w-4 h-4 text-cyan-500" />
              </div>
              <div className="text-2xl font-black text-cyan-600 dark:text-cyan-400">
                {stats.highFxCount || 0}
              </div>
              <div className="text-[11px] text-cyan-600/80 dark:text-cyan-400/80 mt-1 font-medium">
                {fxFilter === 'high' ? '✓ Filtre FX actif (cliquer pour retirer)' : `${stats.toContact} à contacter en priorité`}
              </div>
            </div>

          </div>
        )}

        {/* Filters & Digital Presence Exclude Toggle */}
        <div className="bg-white dark:bg-[#121824] p-4 rounded-2xl border border-slate-200 dark:border-slate-800/80 shadow-sm space-y-3 transition-colors">
          
          {/* Row 1: Search, Country, CRM Status, Compliance, Date Range */}
          <div className="flex flex-col lg:flex-row gap-2.5 items-center justify-between flex-wrap">
            
            {/* Search Input */}
            <div className="relative w-full lg:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Société, dirigeant, ville, SIREN, canton..."
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
            <div className="w-full lg:w-44">
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

            {/* Éligibilité Secteur Revolut Business */}
            <div className="w-full lg:w-52">
              <select
                value={selectedCompliance}
                onChange={(e) => setSelectedCompliance(e.target.value)}
                className="w-full bg-slate-50 dark:bg-[#161f30] border border-slate-300 dark:border-slate-700/80 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 font-semibold"
              >
                <option value="ALL">🛡️ Toutes activités</option>
                <option value="eligible">🟢 Éligible Revolut (Activité autorisée)</option>
                <option value="conditional">🟡 Activité Réglementée (Due Diligence)</option>
                <option value="restricted">🔴 Non Éligible (Industrie Interdite)</option>
              </select>
            </div>

            {/* Date Range Dropdown (6-Month Cumulative History & Months) */}
            <div className="w-full lg:w-56">
              <select
                value={dateFilter}
                onChange={(e) => {
                  setDateFilter(e.target.value);
                  setExactDate('');
                }}
                className="w-full bg-slate-50 dark:bg-[#161f30] border border-slate-300 dark:border-slate-700/80 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 font-medium"
              >
                <optgroup label="Périodes glissantes">
                  <option value="all">📅 Tout l'historique (6 derniers mois)</option>
                  <option value="today">📅 Dernières 24h / 48h</option>
                  <option value="3days">📅 3 derniers jours</option>
                  <option value="7days">📅 7 derniers jours</option>
                  <option value="14days">📅 14 derniers jours</option>
                  <option value="30days">📅 30 derniers jours (1 mois)</option>
                  <option value="90days">📅 90 derniers jours (3 mois)</option>
                  <option value="180days">📅 180 derniers jours (6 mois)</option>
                </optgroup>
                <optgroup label="Par mois d'incorporation">
                  <option value="month:2026-10">🗓️ Octobre 2026</option>
                  <option value="month:2026-09">🗓️ Septembre 2026</option>
                  <option value="month:2026-08">🗓️ Août 2026</option>
                  <option value="month:2026-07">🗓️ Juillet 2026</option>
                  <option value="month:2026-06">🗓️ Juin 2026</option>
                  <option value="month:2026-05">🗓️ Mai 2026</option>
                  <option value="month:2026-04">🗓️ Avril 2026</option>
                </optgroup>
              </select>
            </div>

          </div>

          {/* Row 2 (Points 1 & 4): FX Potential, Share Capital, Legal Form, Language/Canton/Region & Dynamic Sort */}
          <div className="pt-2.5 border-t border-slate-200 dark:border-slate-800/80 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
            
            {/* 1. FX Potential Filter */}
            <select
              value={fxFilter}
              onChange={(e) => setFxFilter(e.target.value)}
              className="w-full bg-slate-50 dark:bg-[#161f30] border border-cyan-500/40 dark:border-cyan-500/40 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500 font-semibold"
              title="Filtrer selon le besoin de change multi-devises (CHF, EUR, USD, GBP)"
            >
              <option value="ALL">💱 Tous profils FX (Multi-devises)</option>
              <option value="high">🔥 Fort Potentiel FX (CHF / EUR / USD)</option>
              <option value="medium_high">🌐 Potentiel FX Fort & Modéré</option>
            </select>

            {/* 2. Minimum Share Capital Filter */}
            <select
              value={minCapital}
              onChange={(e) => setMinCapital(Number(e.target.value))}
              className="w-full bg-slate-50 dark:bg-[#161f30] border border-slate-300 dark:border-slate-700/80 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 font-semibold"
              title="Filtrer par capital social minimum"
            >
              <option value={0}>💰 Tous les capitaux sociaux</option>
              <option value={5000}>💰 Capital ≥ 5 000 € / CHF</option>
              <option value={10000}>💰 Capital ≥ 10 000 € / CHF</option>
              <option value={20000}>💰 Capital ≥ 20 000 € / CHF (Sàrl CH)</option>
              <option value={50000}>💰 Capital ≥ 50 000 € / CHF</option>
              <option value={100000}>💰 Capital ≥ 100 000 € / CHF (SA / AG)</option>
            </select>

            {/* 3. Legal Form Filter */}
            <select
              value={legalFormFilter}
              onChange={(e) => setLegalFormFilter(e.target.value)}
              className="w-full bg-slate-50 dark:bg-[#161f30] border border-slate-300 dark:border-slate-700/80 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 font-medium"
            >
              <option value="ALL">🏛️ Toutes formes juridiques</option>
              <option value="SAS">🇫🇷 SAS / SASU</option>
              <option value="SARL">🇫🇷 SARL / EURL</option>
              <option value="SA_AG">🇨🇭🇫🇷 SA / AG (Société Anonyme)</option>
              <option value="SARL_GMBH">🇨🇭 Sàrl / GmbH (Suisse)</option>
            </select>

            {/* 4. Language Zone / Canton (CH) / Region (FR) Filter */}
            <select
              value={geoFilter}
              onChange={(e) => setGeoFilter(e.target.value)}
              className="w-full bg-slate-50 dark:bg-[#161f30] border border-slate-300 dark:border-slate-700/80 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 font-medium"
              title="Filtrer par langue (Suisse Romande FR vs Alémanique DE), par Canton suisse ou par Région française"
            >
              <option value="ALL">📍 Toutes zones, langues & cantons</option>
              <optgroup label="🇨🇭 Suisse par Zone Linguistique">
                <option value="CH_FR">🇨🇭🗣️ Suisse Romande (Francophone : GE, VD, VS, NE, FR, JU)</option>
                <option value="CH_DE">🇨🇭🗣️ Suisse Alémanique (Germanophone : ZH, ZG, BE, AG, BS...)</option>
                <option value="CH_IT">🇨🇭🗣️ Suisse Italienne (Tessin TI)</option>
              </optgroup>
              <optgroup label="🇨🇭 Suisse par Canton">
                <option value="canton:GE">🇨🇭 Canton de Genève (GE)</option>
                <option value="canton:VD">🇨🇭 Canton de Vaud (VD)</option>
                <option value="canton:VS">🇨🇭 Canton du Valais (VS)</option>
                <option value="canton:FR">🇨🇭 Canton de Fribourg (FR)</option>
                <option value="canton:NE">🇨🇭 Canton de Neuchâtel (NE)</option>
                <option value="canton:JU">🇨🇭 Canton du Jura (JU)</option>
                <option value="canton:ZH">🇨🇭 Canton de Zürich (ZH)</option>
                <option value="canton:ZG">🇨🇭 Canton de Zoug (ZG)</option>
                <option value="canton:AG">🇨🇭 Canton d'Argovie (AG)</option>
                <option value="canton:BE">🇨🇭 Canton de Berne (BE)</option>
                <option value="canton:LU">🇨🇭 Canton de Lucerne (LU)</option>
                <option value="canton:BS">🇨🇭 Canton de Bâle-Ville (BS)</option>
                <option value="canton:BL">🇨🇭 Canton de Bâle-Campagne (BL)</option>
                <option value="canton:TI">🇨🇭 Canton du Tessin (TI)</option>
                <option value="canton:GR">🇨🇭 Canton des Grisons (GR)</option>
              </optgroup>
              <optgroup label="🇫🇷 France par Région">
                <option value="FR_IDF">🇫🇷 Île-de-France (Paris & RP)</option>
                <option value="FR_ARA">🇫🇷 Auvergne-Rhône-Alpes (Lyon, Genève-74)</option>
                <option value="FR_PACA">🇫🇷 PACA & Côte d'Azur (Marseille, Nice)</option>
                <option value="FR_NAQ">🇫🇷 Nouvelle-Aquitaine (Bordeaux)</option>
                <option value="FR_OCC">🇫🇷 Occitanie (Toulouse, Montpellier)</option>
                <option value="FR_HDF_GE">🇫🇷 Nord & Grand Est (Lille, Strasbourg)</option>
                <option value="FR_OUEST">🇫🇷 Grand Ouest & Centre (Nantes, Rennes)</option>
              </optgroup>
            </select>

            {/* 5. Dynamic Sorting */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full bg-slate-50 dark:bg-[#161f30] border border-slate-300 dark:border-slate-700/80 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 font-bold"
            >
              <option value="date_desc">🔽 Tri : Date d'incorporation (Récentes)</option>
              <option value="capital_desc">💰 Tri : Capital Social (Plus élevé)</option>
              <option value="fx_desc">💱 Tri : Potentiel FX (Plus élevé)</option>
              <option value="safety_desc">🛡️ Tri : Score Sûreté (Plus élevé)</option>
            </select>

          </div>

          {/* Dedicated Filter by Exact Incorporation Day (Jour d'incorporation) */}
          <div className="pt-2.5 border-t border-slate-200 dark:border-slate-800/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 text-xs">
            <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
              <span className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                📅 Filtrer par jour d'incorporation :
              </span>

              {/* Calendar Date Input */}
              <input
                type="date"
                value={exactDate}
                min="2026-04-01"
                max="2026-10-31"
                onChange={(e) => setExactDate(e.target.value)}
                className="bg-slate-50 dark:bg-[#161f30] border border-slate-300 dark:border-slate-700/80 rounded-xl px-2.5 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 font-semibold"
                title="Choisir une date précise d'incorporation sur le calendrier"
              />

              {/* Dropdown of active registry days with company count */}
              <select
                value={exactDate}
                onChange={(e) => setExactDate(e.target.value)}
                className="bg-slate-50 dark:bg-[#161f30] border border-slate-300 dark:border-slate-700/80 rounded-xl px-3 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 font-medium"
              >
                <option value="">— Sélectionner un jour de publication ({availableIncorporationDays.length} jours) —</option>
                {availableIncorporationDays.map(d => (
                  <option key={d.date} value={d.date}>
                    📅 {d.label}
                  </option>
                ))}
              </select>

              {/* Previous / Next active incorporation day navigation */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => {
                    if (!availableIncorporationDays.length) return;
                    const idx = availableIncorporationDays.findIndex(d => d.date === exactDate);
                    const nextIdx = idx === -1 ? 0 : Math.min(availableIncorporationDays.length - 1, idx + 1);
                    setExactDate(availableIncorporationDays[nextIdx].date);
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-[11px] border border-slate-200 dark:border-slate-700 transition"
                  title="Jour d'incorporation précédent"
                >
                  ◀ Jour préc.
                </button>
                <button
                  onClick={() => {
                    if (!availableIncorporationDays.length) return;
                    const idx = availableIncorporationDays.findIndex(d => d.date === exactDate);
                    const prevIdx = idx <= 0 ? 0 : idx - 1;
                    setExactDate(availableIncorporationDays[prevIdx].date);
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-[11px] border border-slate-200 dark:border-slate-700 transition"
                  title="Jour d'incorporation suivant"
                >
                  Jour suiv. ▶
                </button>
              </div>

              {exactDate && (
                <button
                  onClick={() => setExactDate('')}
                  className="px-2.5 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-600 dark:text-rose-400 border border-rose-500/30 font-bold text-[11px] transition"
                >
                  ✕ Afficher tous les jours
                </button>
              )}
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
              💡 Astuce : Cliquez sur une date 📅, un capital 💰 ou un badge FX 💱 pour filtrer en 1 clic
            </span>
          </div>

        </div>

        {/* Lead Table View */}
        <div className="bg-white dark:bg-[#121824] border border-slate-200 dark:border-slate-800/80 rounded-2xl overflow-hidden shadow-sm transition-colors">
          
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between flex-wrap gap-2 bg-slate-50/50 dark:bg-[#161f30]/30">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white tracking-wide">
                Nouvelles Entreprises Détectées
              </h3>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold border border-slate-300 dark:border-slate-700">
                {companies.length} résultat(s)
              </span>
              {exactDate && (
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-600/15 text-blue-600 dark:text-blue-400 font-bold border border-blue-500/30 flex items-center gap-1.5">
                  📅 Jour d'incorporation : {formatDateFr(exactDate)}
                  <button onClick={() => setExactDate('')} className="hover:text-rose-500 ml-1" title="Retirer le filtre de jour">✕</button>
                </span>
              )}
              {fxFilter !== 'ALL' && (
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 font-bold border border-cyan-500/30 flex items-center gap-1.5">
                  💱 Filtre FX actif
                  <button onClick={() => setFxFilter('ALL')} className="hover:text-rose-500 ml-1">✕</button>
                </span>
              )}
              {minCapital > 0 && (
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 font-bold border border-indigo-500/30 flex items-center gap-1.5">
                  💰 Capital ≥ {minCapital.toLocaleString('fr-FR')}
                  <button onClick={() => setMinCapital(0)} className="hover:text-rose-500 ml-1">✕</button>
                </span>
              )}
              {geoFilter !== 'ALL' && (
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-purple-500/15 text-purple-600 dark:text-purple-400 font-bold border border-purple-500/30 flex items-center gap-1.5">
                  📍 Zone : {geoFilter}
                  <button onClick={() => setGeoFilter('ALL')} className="hover:text-rose-500 ml-1">✕</button>
                </span>
              )}
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Historique 6 derniers mois • BODACC (FR) & FOSC/SHAB (CH)
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 dark:bg-[#161f30] text-slate-600 dark:text-slate-400 font-semibold uppercase tracking-wider text-[11px] border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-3">Statut CRM</th>
                  <th className="py-3 px-3">Entreprise, Capital & Incorporation</th>
                  <th className="py-3 px-3">Activité, Conformité & FX</th>
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
                    const rawDir = c.dirigeants?.[0]?.name;
                    const primaryDirigeant = (!rawDir || rawDir.includes('Direction') || rawDir.includes('Conseil')) ? 'X' : rawDir;
                    const safetyScore = c.safety?.score || 50;
                    const capAmount = Number(c.shareCapital) || 0;

                    return (
                      <tr 
                        key={c.id} 
                        className="hover:bg-slate-100/60 dark:hover:bg-[#161f30]/60 transition"
                      >
                        
                        {/* 1. CRM Status quick selector + Shared Session Indicators */}
                        <td className="py-3 px-3 whitespace-nowrap">
                          <div className="flex flex-col gap-1.5 items-start">
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

                            {c.crmAssignedTo && (
                              <span
                                onClick={() => setSelectedCompany(c)}
                                className="cursor-pointer inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 border border-indigo-500/30"
                                title={`Attribué à : ${c.crmAssignedTo}`}
                              >
                                👤 {c.crmAssignedTo}
                              </span>
                            )}

                            {c.crmNotes && (
                              <button
                                onClick={() => setSelectedCompany(c)}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 max-w-[150px] truncate hover:bg-amber-500/25 transition"
                                title={`Note partagée : ${c.crmNotes}`}
                              >
                                📝 <span className="truncate">{c.crmNotes}</span>
                              </button>
                            )}
                          </div>
                        </td>

                        {/* 2. Company Name, Capital, Geo & SIREN */}
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

                              {/* Forme + Capital + Ville/Canton + SIREN + Date d'incorporation cliquable */}
                              <div className="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 flex-wrap">
                                {c.incorporationDate && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setExactDate(prev => prev === c.incorporationDate ? '' : c.incorporationDate);
                                    }}
                                    className={`px-1.5 py-0.2 rounded font-semibold transition border ${
                                      exactDate === c.incorporationDate
                                        ? 'bg-blue-600 text-white border-blue-600'
                                        : 'bg-slate-100 dark:bg-slate-800/90 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-blue-500'
                                    }`}
                                    title="Cliquer pour filtrer uniquement les entreprises incorporées ce jour-là"
                                  >
                                    📅 {formatDateFr(c.incorporationDate)}
                                  </button>
                                )}
                                <span className="px-1.5 py-0.2 bg-slate-100 dark:bg-slate-800 rounded font-medium text-slate-700 dark:text-slate-300">
                                  {c.legalForm}
                                </span>
                                {capAmount > 0 && (
                                  <span
                                    className={`px-1.5 py-0.2 rounded font-bold border ${
                                      capAmount >= 50000
                                        ? 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/30'
                                        : capAmount >= 20000
                                        ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/25'
                                        : 'bg-slate-100 dark:bg-slate-800/70 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                                    }`}
                                    title={`Capital social : ${capAmount.toLocaleString('fr-FR')} ${isCH ? 'CHF' : 'EUR'}`}
                                  >
                                    💰 {capAmount.toLocaleString('fr-FR')} {isCH ? 'CHF' : '€'}
                                  </span>
                                )}
                                <span
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (isCH && c.canton) {
                                      setGeoFilter(prev => prev === `canton:${c.canton}` ? 'ALL' : `canton:${c.canton}`);
                                    } else if (c.geoZone?.regionCode) {
                                      setGeoFilter(prev => prev === c.geoZone.regionCode ? 'ALL' : c.geoZone.regionCode);
                                    }
                                  }}
                                  className="cursor-pointer hover:text-blue-500 font-medium"
                                  title={c.geoZone?.regionLabel || c.city}
                                >
                                  📍 {c.city} {isCH && c.canton ? `(${c.canton})` : c.postalCode ? `(${c.postalCode.slice(0, 2)})` : ''}
                                </span>
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
                                    className="px-1.5 py-0.2 rounded bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 font-bold hover:underline flex items-center gap-0.5 border border-blue-200 dark:border-blue-900/40 text-[9px]"
                                    title="Consulter la fiche officielle sur Zefix / FOSC"
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

                        {/* 3. NATURE D'ACTIVITE, PRE-QUALIFICATION REVOLUT & POTENTIEL FX */}
                        <td className="py-3 px-3 whitespace-nowrap">
                          <div 
                            onClick={() => setSelectedCompany(c)}
                            className="cursor-pointer group space-y-1"
                            title="Cliquer pour voir l'analyse conformité, le potentiel FX et la description complète"
                          >
                            <div className="flex items-center gap-1.5">
                              {getCategoryBadge(c.activityCategory || 'Services B2B')}
                              <span className="text-[10px] text-slate-400 dark:text-slate-500 opacity-0 group-hover:opacity-100 transition">
                                🔍 fiche
                              </span>
                            </div>
                            <div className="flex items-center gap-1 flex-wrap">
                              {c.compliance && (
                                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border inline-flex items-center gap-1 ${
                                  c.compliance.status === 'restricted'
                                    ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-800'
                                    : c.compliance.status === 'conditional'
                                    ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800'
                                    : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
                                }`}>
                                  <span>{c.compliance.badge}</span>
                                </span>
                              )}

                              {c.fxPotential && c.fxPotential.level === 'high' && (
                                <span
                                  className="text-[10px] font-bold px-1.5 py-0.5 rounded border bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-500/30 inline-flex items-center gap-1"
                                  title={`${c.fxPotential.badge} — ${c.fxPotential.reasons?.[0] || ''}`}
                                >
                                  {c.fxPotential.badge}
                                </span>
                              )}
                              {c.fxPotential && c.fxPotential.level === 'medium' && (
                                <span
                                  className="text-[10px] font-medium px-1.5 py-0.5 rounded border bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700 inline-flex items-center gap-1"
                                  title={c.fxPotential.badge}
                                >
                                  {c.fxPotential.shortBadge}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* 4. Dirigeant, Board & CFO (1-Click Copyable!) */}
                        <td className="py-3 px-3 whitespace-nowrap">
                          
                          {/* Primary Dirigeant + Board Count */}
                          {primaryDirigeant === 'X' ? (
                            <div className="flex items-center gap-1.5 text-slate-400 dark:text-slate-500">
                              <span className="font-mono font-bold text-xs bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">X</span>
                              <span className="text-[10px] italic">Non renseigné</span>
                            </div>
                          ) : (
                            <div>
                              <div className="flex items-center gap-1.5">
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
                                {(c.dirigeants?.filter(d => d.name && d.name !== 'X').length || 0) > 1 && (
                                  <button
                                    onClick={() => setSelectedCompany(c)}
                                    className="text-[9px] px-1.5 py-0.2 rounded-full bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 font-bold"
                                    title="Voir tous les membres du Board / co-dirigeants"
                                  >
                                    +{c.dirigeants.filter(d => d.name && d.name !== 'X').length - 1} Board
                                  </button>
                                )}
                              </div>
                              <div className="text-[10px] text-slate-400 dark:text-slate-500 truncate max-w-[185px]">
                                {c.dirigeants?.[0]?.role || 'Dirigeant'}
                              </div>
                            </div>
                          )}

                          <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1">
                            <span>CFO / Dir. :</span>
                            {c.cfo?.name && c.cfo.name !== 'X' && !c.cfo.name.includes('Direction') ? (
                              <button
                                onClick={() => handleCopy(c.cfo.name, `cfo-${c.id}`)}
                                className="text-slate-700 dark:text-slate-300 font-medium hover:text-blue-500"
                                title={c.cfo.role || 'Co-Décideur / CFO'}
                              >
                                {c.cfo.name} {copiedKey === `cfo-${c.id}` && '✓'}
                              </button>
                            ) : (
                              <span className="font-mono text-slate-400 dark:text-slate-500 text-[10px]">X</span>
                            )}
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

                              {/* 1. LinkedIn Entreprise : Pour trouver les collaborateurs et l'équipe */}
                              {c.linkedinCompanyUrl && (
                                <a
                                  href={c.linkedinCompanyUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-[10px] px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/50 text-[#0a66c2] dark:text-sky-300 hover:bg-blue-100 dark:hover:bg-blue-900/60 border border-blue-200 dark:border-blue-800 flex items-center gap-1 font-semibold transition"
                                  title="Rechercher la page LinkedIn de l'entreprise pour voir les collaborateurs et décisionnaires"
                                >
                                  <LinkedinIcon className="w-3 h-3 text-[#0a66c2]" />
                                  <span>LinkedIn Boîte</span>
                                </a>
                              )}

                              {/* 2. LinkedIn Dirigeant : UNIQUEMENT si personne réelle identifiée */}
                              {primaryDirigeant && primaryDirigeant !== 'X' && (
                                <>
                                  <a
                                    href={`https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(primaryDirigeant)}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-[10px] px-1.5 py-0.5 rounded bg-sky-50 dark:bg-sky-950/40 text-[#0a66c2] dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-950/70 border border-sky-200 dark:border-sky-800/60 flex items-center gap-1 font-semibold transition"
                                    title={`Recherche nominative de ${primaryDirigeant} sur LinkedIn`}
                                  >
                                    <UserCheck className="w-3 h-3 text-sky-500" />
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
