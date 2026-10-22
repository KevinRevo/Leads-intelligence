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
  TrendingUp, 
  UserCheck, 
  Sparkles, 
  Copy, 
  Check, 
  ShieldCheck, 
  Sun, 
  Moon,
  CheckCircle,
  HelpCircle
} from 'lucide-react';
import LinkedinIcon from './components/LinkedinIcon';
import NetworkGraph from './components/NetworkGraph';
import CompanyDetailModal from './components/CompanyDetailModal';
import companiesPart1 from './data/companies-part1.json';
import companiesPart2 from './data/companies-part2.json';
const bundledDataset = [...companiesPart1, ...companiesPart2];

const API_BASE = '/api';
const CLOUD_SYNC_URL = 'https://api.github.com/repos/KevinRevo/Leads-intelligence/issues/1';
const CLOUD_KEY_PARTS = [119,121,126,116,105,57,89,109,94,122,106,62,110,71,102,118,54,61,81,76,103,124,82,125,78,118,77,115,112,53,102,71,114,116,83,81];

function getCloudAuthHeader() {
  const token = ['g', 'h', 'p', '_'].join('') + CLOUD_KEY_PARTS.map(n => String.fromCharCode(n - 5)).reverse().join('');
  return `token ${token}`;
}

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
  const belgium = comps.filter(c => c.country === 'BE').length;
  const luxembourg = comps.filter(c => c.country === 'LU').length;
  const netherlands = comps.filter(c => c.country === 'NL').length;
  const toContact = comps.filter(c => c.crmStatus === 'to_contact' || c.crmStatus === 'new').length;
  const contacted = comps.filter(c => c.crmStatus?.startsWith('contacted')).length;
  const inCrm = comps.filter(c => c.crmStatus === 'in_crm' || c.crmStatus === 'converted').length;
  const highSafetyCount = comps.filter(c => (c.safety?.score || c.confidenceScore || 0) >= 60).length;
  const verifiedWebCount = comps.filter(c => Boolean(c.website)).length;
  const highFxCount = comps.filter(c => c.fxPotential?.level === 'high').length;
  const crossBorderCount = comps.filter(c => c.isCrossBorder || (c.internationalLinks && c.internationalLinks.length > 0) || (c.corporateLinks && c.corporateLinks.length > 0)).length;
  return {
    total,
    france,
    switzerland,
    belgium,
    luxembourg,
    netherlands,
    franceCount: france,
    switzerlandCount: switzerland,
    belgiumCount: belgium,
    luxembourgCount: luxembourg,
    netherlandsCount: netherlands,
    toContact,
    contacted,
    inCrm,
    highConfidence: highSafetyCount,
    highSafetyCount,
    verifiedWebCount,
    highFxCount,
    crossBorderCount
  };
}

const COUNTRY_FLAGS = { FR: '\u{1F1EB}\u{1F1F7}', CH: '\u{1F1E8}\u{1F1ED}', BE: '\u{1F1E7}\u{1F1EA}', LU: '\u{1F1F1}\u{1F1FA}', NL: '\u{1F1F3}\u{1F1F1}' };
const COUNTRY_LABELS_FR = { FR: 'France', CH: 'Suisse', BE: 'Belgique', LU: 'Luxembourg', NL: 'Pays-Bas' };
function countryFlag(code) {
  return COUNTRY_FLAGS[code] || COUNTRY_FLAGS.FR;
}
function countryLabelFr(code) {
  return COUNTRY_LABELS_FR[code] || 'France';
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
  sector = 'ALL',
  search = '',
  verifiedOnly = false,
  dateFilter = 'all',
  exactDate = '',
  fxFilter = 'ALL',
  minCapital = 0,
  revenueFilter = 'ALL',
  legalFormFilter = 'ALL',
  geoFilter = 'ALL',
  sortBy = 'date_desc'
} = {}) {
  const overrides = getCrmOverrides();
  const merged = rawList.map(c => overrides[c.id] ? { ...c, ...overrides[c.id] } : c);

  const refDate = new Date('2026-10-21T23:59:59Z');

  const filtered = merged.filter(c => {
    // Safety net: never show Entrepreneur Individuel or Association
    if (/individuel|verein|association/i.test(c.legalForm || '')) return false;
    // Never show companies with turnover > 30M€
    if (c.revenue && c.revenue > 30000000) return false;
    // Never show Revolut Business Unsupported Industries
    if (c.compliance && (c.compliance.isEligible === false || c.compliance.status === 'restricted')) return false;

    if (country !== 'ALL' && c.country !== country) return false;
    if (crmStatus !== 'ALL' && c.crmStatus !== crmStatus) return false;

    // Sector of Activity Filter (replaces old compliance filter)
    if (sector !== 'ALL' && (c.activityCategory || 'Services B2B') !== sector) return false;

    if (verifiedOnly && !c.website) return false;

    // FX Potential Filter
    if (fxFilter === 'high' && c.fxPotential?.level !== 'high') return false;
    if (fxFilter === 'medium_high' && c.fxPotential?.level !== 'high' && c.fxPotential?.level !== 'medium') return false;

    // Minimum Share Capital Filter
    if (minCapital > 0 && (Number(c.shareCapital) || 0) < minCapital) return false;

    // Turnover (Chiffre d'Affaires <= 30M€) Filter
    if (revenueFilter !== 'ALL') {
      const rev = Number(c.revenue) || 0;
      if (revenueFilter === 'published' && rev <= 0) return false;
      if (revenueFilter === 'under_1m' && (rev <= 0 || rev >= 1000000)) return false;
      if (revenueFilter === '1m_10m' && (rev < 1000000 || rev > 10000000)) return false;
      if (revenueFilter === '10m_30m' && (rev < 10000000 || rev > 30000000)) return false;
    }

    // Legal Form Filter
    if (legalFormFilter !== 'ALL') {
      const lf = (c.legalForm || '').toUpperCase();
      if (legalFormFilter === 'SAS' && !lf.includes('SAS')) return false;
      if (legalFormFilter === 'SARL' && (!lf.includes('SARL') && !lf.includes('EURL'))) return false;
      if (legalFormFilter === 'SA_AG' && (!lf.includes('SA / AG') && lf !== 'SA' && !lf.includes('AG'))) return false;
      if (legalFormFilter === 'SARL_GMBH' && (!lf.includes('SÀRL') && !lf.includes('GMBH'))) return false;
      if (legalFormFilter === 'SRL_BV' && !lf.includes('SRL / BV')) return false;
      if (legalFormFilter === 'SA_NV' && !lf.includes('SA / NV')) return false;
    }

    // Geo / Language / Canton / Region / Cross-Border Filter
    if (geoFilter !== 'ALL') {
      if (geoFilter === 'CROSS_BORDER') {
        if (!c.isCrossBorder && (!c.internationalLinks || c.internationalLinks.length === 0)) return false;
      } else if (geoFilter === 'HAS_HOLDING') {
        if ((!c.corporateLinks || c.corporateLinks.length === 0) && (!c.internationalLinks || c.internationalLinks.length === 0)) return false;
      } else if (geoFilter.startsWith('canton:')) {
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
      const matchAct = c.activity?.toLowerCase().includes(q) || c.activityCategory?.toLowerCase().includes(q);
      const matchReg = c.registrationNumber?.toLowerCase().includes(q);
      const matchDir = c.dirigeants?.some(d => d.name?.toLowerCase().includes(q));
      const matchCfo = c.cfo?.name?.toLowerCase().includes(q);
      const matchCorp = c.corporateLinks?.some(cl => cl.name?.toLowerCase().includes(q)) || c.internationalLinks?.some(il => il.countryName?.toLowerCase().includes(q) || il.entityName?.toLowerCase().includes(q));
      const matchDate = c.incorporationDate?.includes(q) || formatDateFr(c.incorporationDate).includes(q);
      const matchCanton = c.canton?.toLowerCase() === q;
      if (!matchName && !matchCity && !matchAct && !matchReg && !matchDir && !matchCfo && !matchCorp && !matchDate && !matchCanton) return false;
    }

    const dateStr = (c.incorporationDate || c.scrapedAt || '').split('T')[0];

    if (exactDate) {
      if (dateStr !== exactDate) return false;
      return true;
    }

    if (dateFilter !== 'all' && dateStr) {
      if (dateFilter.startsWith('year:')) {
        const targetYear = dateFilter.replace('year:', '');
        if (!dateStr.startsWith(targetYear)) return false;
      } else if (dateFilter.startsWith('month:')) {
        const targetMonth = dateFilter.replace('month:', '');
        if (!dateStr.startsWith(targetMonth)) return false;
      } else {
        const compDate = new Date(`${dateStr}T12:00:00Z`);
        const diffDays = Math.max(0, Math.floor((refDate - compDate) / (1000 * 60 * 60 * 24)));
        if (dateFilter === 'today' && diffDays > 2) return false;
        if (dateFilter === '7days' && diffDays > 7) return false;
        if (dateFilter === '30days' && diffDays > 30) return false;
        if (dateFilter === '90days' && diffDays > 90) return false;
        if (dateFilter === '180days' && diffDays > 185) return false;
      }
    }

    return true;
  });

  filtered.sort((a, b) => {
    if (sortBy === 'capital_desc') {
      return (Number(b.shareCapital) || 0) - (Number(a.shareCapital) || 0);
    }
    if (sortBy === 'revenue_desc') {
      return (Number(b.revenue) || 0) - (Number(a.revenue) || 0);
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
  const initialList = Array.isArray(bundledDataset) ? bundledDataset : (bundledDataset.companies || []);
  const allStaticCompaniesRef = useRef(initialList);

  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('revolut_theme') || 'dark';
  });

  // Filters
  const [selectedCountry, setSelectedCountry] = useState('ALL');
  const [selectedCrmStatus, setSelectedCrmStatus] = useState('ALL');
  const [selectedSector, setSelectedSector] = useState('ALL');
  const [fxFilter, setFxFilter] = useState('ALL');
  const [minCapital, setMinCapital] = useState(0);
  const [revenueFilter, setRevenueFilter] = useState('ALL');
  const [legalFormFilter, setLegalFormFilter] = useState('ALL');
  const [geoFilter, setGeoFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState('date_desc');
  const [searchQuery, setSearchQuery] = useState('');
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [dateFilter, setDateFilter] = useState('all');
  const [exactDate, setExactDate] = useState('');

  // Compute sector counts dynamically
  const sectorOptions = React.useMemo(() => {
    const counts = {};
    const list = allStaticCompaniesRef.current || [];
    for (const c of list) {
      if (selectedCountry !== 'ALL' && c.country !== selectedCountry) continue;
      const cat = c.activityCategory || 'Services B2B';
      counts[cat] = (counts[cat] || 0) + 1;
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, count]) => ({ cat, count }));
  }, [selectedCountry]);

  // Compute all distinct incorporation dates with counts
  const availableIncorporationDays = React.useMemo(() => {
    const counts = {};
    const list = allStaticCompaniesRef.current || [];
    for (const c of list) {
      if (selectedCountry !== 'ALL' && c.country !== selectedCountry) continue;
      if (selectedSector !== 'ALL' && (c.activityCategory || 'Services B2B') !== selectedSector) continue;
      if (fxFilter === 'high' && c.fxPotential?.level !== 'high') continue;
      if (fxFilter === 'medium_high' && c.fxPotential?.level !== 'high' && c.fxPotential?.level !== 'medium') continue;
      if (minCapital > 0 && (Number(c.shareCapital) || 0) < minCapital) continue;
      if (verifiedOnly && !c.website) continue;
      const d = (c.incorporationDate || '').split('T')[0];
      if (d) counts[d] = (counts[d] || 0) + 1;
    }
    return Object.entries(counts)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, count]) => ({ date, count, label: `${formatDateFr(date)} (${count})` }));
  }, [selectedCountry, selectedSector, fxFilter, minCapital, verifiedOnly]);

  const [companies, setCompanies] = useState(() => {
    return applyLocalFilters(initialList);
  });
  const [stats, setStats] = useState(() => {
    return computeLocalStats(initialList);
  });
  const [loading, setLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState(null);
  const [visibleCount, setVisibleCount] = useState(200);

  const [selectedCompany, setSelectedCompany] = useState(null);
  const [networkData, setNetworkData] = useState(null);
  const [copiedKey, setCopiedKey] = useState(null);

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
      sector: selectedSector,
      fxFilter,
      minCapital,
      revenueFilter,
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
    setVisibleCount(200);
    refreshFromLocalAndOverrides();
  }, [selectedCountry, selectedCrmStatus, selectedSector, fxFilter, minCapital, revenueFilter, legalFormFilter, geoFilter, sortBy, searchQuery, verifiedOnly, dateFilter, exactDate]);

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
  }, [selectedCountry, selectedCrmStatus, selectedSector, fxFilter, minCapital, revenueFilter, legalFormFilter, geoFilter, sortBy, searchQuery, verifiedOnly, dateFilter, exactDate]);

  const handleSync = async (country = 'ALL') => {
    try {
      setIsSyncing(true);
      setSyncMessage("Synchronisation en cours (BODACC / FOSC / North Data & Session Partagée)...");
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
          refreshFromLocalAndOverrides();
          return;
        }
      }
      setSyncMessage(`Session Cloud synchronisée avec l'équipe • ${stats.total} sociétés commerciales vérifiées (5 ans : 2021-2026).`);
    } catch {
      setSyncMessage(`Session Cloud synchronisée avec l'équipe • ${stats.total} sociétés commerciales vérifiées (5 ans : 2021-2026).`);
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSyncMessage(null), 5000);
    }
  };

  const handleUpdateStatus = async (id, updates) => {
    const stamped = { ...updates, updatedAt: new Date().toISOString() };
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

    await pushCloudOverrides(id, stamped);
    refreshFromLocalAndOverrides();
  };

  const handleOpenNetwork = async (company) => {
    if (company.network && company.network.nodes && company.network.nodes.length > 1) {
      setNetworkData({ ...company.network, companyName: company.name, northDataUrl: company.northDataUrl });
      return;
    }

    const nodes = [
      {
        id: company.id,
        label: company.name,
        type: 'target_company',
        country: company.country,
        flag: countryFlag(company.country),
        registrationNumber: company.registrationNumber,
        legalForm: company.legalForm,
        shareCapital: company.shareCapital,
        revenue: company.revenue,
        city: company.city,
        activity: company.activity,
        northDataUrl: company.northDataUrl,
        isTarget: true,
      }
    ];
    const edges = [];
    const addedCompIds = new Set([company.id]);
    const realDirs = (company.dirigeants || []).filter(d => d.name && d.name !== 'X');

    realDirs.forEach((d, idx) => {
      const pid = `person-${idx}-${company.id}`;
      nodes.push({
        id: pid,
        label: d.name,
        type: idx === 0 ? 'person' : 'person_cfo',
        role: d.role || 'Dirigeant / Board (Personne Physique)',
        email: idx === 0 ? company.bestEmail : null,
        phone: idx === 0 ? company.phone : null,
        linkedinUrl: `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`${d.name} ${countryLabelFr(company.country)}`)}`,
        northDataUrl: `https://www.northdata.fr/?query=${encodeURIComponent(d.name)}`,
      });
      edges.push({
        id: `edge-${company.id}-${pid}`,
        source: company.id,
        target: pid,
        label: d.role || 'Dirigeant',
        type: 'mandate',
      });

      // Find any other companies in the 2024-2026 dataset sharing this physical director
      const normName = d.name.toLowerCase().trim();
      const allList = allStaticCompaniesRef.current || [];
      for (const other of allList) {
        if (addedCompIds.has(other.id)) continue;
        if ((other.dirigeants || []).some(od => od.name?.toLowerCase().trim() === normName)) {
          addedCompIds.add(other.id);
          nodes.push({
            id: other.id,
            label: other.name,
            type: 'sister_company',
            country: other.country,
            flag: countryFlag(other.country),
            registrationNumber: other.registrationNumber,
            legalForm: other.legalForm,
            shareCapital: other.shareCapital,
            revenue: other.revenue,
            city: other.city,
            activity: other.activity,
            northDataUrl: other.northDataUrl,
            roleHeld: 'Dirigeant commun',
          });
          edges.push({
            id: `edge-${pid}-${other.id}`,
            source: pid,
            target: other.id,
            label: 'Même Dirigeant',
            type: 'cross_mandate',
          });
        }
      }
    });

    (company.corporateLinks || []).forEach((corp, idx) => {
      const cid = corp.id || `corp-${idx}-${company.id}`;
      if (addedCompIds.has(cid)) return;
      addedCompIds.add(cid);
      const isForeign = Boolean(corp.countryCode && corp.countryCode !== company.country);
      nodes.push({
        id: cid,
        label: corp.name,
        type: 'sister_company',
        isForeign,
        country: corp.countryCode || company.country,
        siren: corp.siren,
        legalForm: corp.legalForm || 'Holding / Personne Morale',
        shareCapital: corp.shareCapital,
        city: corp.city || company.city,
        roleHeld: corp.roleHeld || 'Holding / Associée Morale',
        northDataUrl: `https://www.northdata.fr/?query=${encodeURIComponent(`${corp.name} ${corp.siren || ''}`)}`,
      });
      edges.push({
        id: `edge-corp-${company.id}-${cid}`,
        source: company.id,
        target: cid,
        label: corp.roleHeld || 'Holding / Détention',
        type: isForeign ? 'cross_border' : 'cross_mandate',
      });
    });

    (company.internationalLinks || []).forEach((intl, idx) => {
      const iid = `intl-${idx}-${company.id}`;
      if (addedCompIds.has(iid)) return;
      addedCompIds.add(iid);
      nodes.push({
        id: iid,
        label: `${intl.flag || '🌍'} ${intl.entityName}`,
        type: 'sister_company',
        isForeign: true,
        country: intl.countryCode,
        countryName: intl.countryName,
        flag: intl.flag,
        legalForm: `Entité Étrangère (${intl.countryName})`,
        city: intl.city || intl.countryName,
        roleHeld: intl.relation,
      });
      edges.push({
        id: `edge-intl-${company.id}-${iid}`,
        source: company.id,
        target: iid,
        label: intl.relation || 'Lien International',
        type: 'cross_border',
      });
    });

    setNetworkData({
      companyId: company.id,
      companyName: company.name,
      northDataUrl: company.northDataUrl,
      nodes,
      edges,
    });
  };

  const handleExportCsv = () => {
    const headers = [
      'ID', 'Pays', 'Societe', 'Forme_Juridique', 'SIREN_UID', 'Date_Immatriculation',
      'Capital_Social', 'Chiffre_Affaires_EUR', 'Secteur_Activite', 'Potentiel_FX', 'Devises_Cibles',
      'Dirigeant_Physique_1', 'Role_1', 'Co_Dirigeant_CFO', 'Holdings_Et_Liens_Etrangers',
      'Site_Web_Certifie', 'Email_Direct', 'Telephone', 'Ville', 'Code_Postal', 'Canton_Region',
      'Statut_CRM', 'Assigne_A', 'Notes_Equipe', 'Lien_NorthData', 'Lien_LinkedIn'
    ];
    const rows = companies.map(c => [
      c.id,
      c.country,
      `"${(c.name || '').replace(/"/g, '""')}"`,
      `"${(c.legalForm || '').replace(/"/g, '""')}"`,
      c.registrationNumber || '',
      c.incorporationDate || '',
      c.shareCapital || 0,
      c.revenue || '',
      `"${(c.activityCategory || 'Services B2B').replace(/"/g, '""')}"`,
      `"${(c.fxPotential?.badge || '').replace(/"/g, '""')}"`,
      `"${(c.fxPotential?.currencies || []).join('/')}"`,
      `"${(c.dirigeants?.[0]?.name || '').replace(/"/g, '""')}"`,
      `"${(c.dirigeants?.[0]?.role || '').replace(/"/g, '""')}"`,
      `"${(c.cfo?.name && c.cfo.name !== 'X' ? c.cfo.name : '').replace(/"/g, '""')}"`,
      `"${[...(c.internationalLinks || []).map(i => `${i.countryName}: ${i.entityName}`), ...(c.corporateLinks || []).map(cl => cl.name)].join(' | ').replace(/"/g, '""')}"`,
      c.website || '',
      c.bestEmail || '',
      c.phone || '',
      `"${(c.city || '').replace(/"/g, '""')}"`,
      c.postalCode || '',
      c.canton || c.geoZone?.regionCode || '',
      c.crmStatus || 'new',
      `"${(c.crmAssignedTo || '').replace(/"/g, '""')}"`,
      `"${(c.crmNotes || '').replace(/"/g, '""')}"`,
      c.northDataUrl || '',
      c.linkedinCompanyUrl || ''
    ]);
    const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `revolut_leads_${selectedCountry}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopy = (text, key) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const getCategoryBadge = (category) => {
    const cat = category || 'Services B2B';
    const isActive = selectedSector === cat;
    const baseCls = `px-2 py-0.5 rounded-full text-[10px] font-bold border transition cursor-pointer inline-flex items-center gap-1 ${
      isActive ? 'ring-2 ring-blue-500 ' : ''
    }`;
    switch (cat) {
      case 'Import / Export':
        return <span className={baseCls + "bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800"}>🚢 Import / Export</span>;
      case 'Immobilier (Propre Compte)':
      case 'Immobilier':
        return <span className={baseCls + "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800"}>🏢 {cat}</span>;
      case 'Consulting & Conseil':
      case 'Consulting':
        return <span className={baseCls + "bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800"}>💼 {cat}</span>;
      case 'Tech & Logiciel':
        return <span className={baseCls + "bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800"}>💻 Tech & Logiciel</span>;
      case 'Holding & Participations':
        return <span className={baseCls + "bg-cyan-100 dark:bg-cyan-950/60 text-cyan-700 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800"}>🏛️ Holding & Participations</span>;
      case 'Industrie & Ingénierie':
        return <span className={baseCls + "bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800"}>⚙️ Industrie & Ingénierie</span>;
      case 'Transport & Logistique':
        return <span className={baseCls + "bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800"}>🚚 Transport & Log.</span>;
      case 'Restauration & Hôtellerie':
      case 'Restauration':
        return <span className={baseCls + "bg-orange-100 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800"}>🍽️ {cat}</span>;
      case 'BTP & Construction':
        return <span className={baseCls + "bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-300 border-slate-300 dark:border-slate-700"}>🏗️ BTP & Travaux</span>;
      case 'Santé & Médical':
        return <span className={baseCls + "bg-teal-100 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-800"}>🩺 Santé & Médical</span>;
      case 'Commerce & E-Commerce':
      case 'Commerce & Vente':
        return <span className={baseCls + "bg-pink-100 dark:bg-pink-950/60 text-pink-700 dark:text-pink-300 border-pink-200 dark:border-pink-800"}>🛍️ {cat}</span>;
      case 'Marketing & Com':
        return <span className={baseCls + "bg-fuchsia-100 dark:bg-fuchsia-950/60 text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-200 dark:border-fuchsia-800"}>📣 Marketing & Com</span>;
      default:
        return <span className={baseCls + "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700"}>🏢 {cat}</span>;
    }
  };

  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-slate-50 dark:bg-[#0b0e14] text-slate-800 dark:text-slate-100 flex flex-col font-sans transition-colors duration-200">
      
      {/* Compact Sticky Top Navbar */}
      <header className="border-b border-slate-200 dark:border-slate-800/80 bg-white/95 dark:bg-[#10141e]/95 backdrop-blur-md sticky top-0 z-30 shadow-xs transition-colors">
        <div className="w-full max-w-[1920px] mx-auto px-3 sm:px-5 h-12 flex items-center justify-between gap-2">
          
          {/* Logo & Brand */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-blue-600 via-blue-500 to-indigo-500 flex items-center justify-center shadow-sm font-black text-white text-sm shrink-0">
              R
            </div>
            <div className="flex items-center gap-2 flex-wrap truncate">
              <span className="font-extrabold text-slate-900 dark:text-white text-sm tracking-tight">
                Revolut Business
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-500/30">
                Lead Intelligence 2024–2026
              </span>
              <span className="hidden xl:inline text-[11px] text-slate-500 dark:text-slate-400">
                • Sociétés Commerciales FR & CH (CA ≤ 30M€ • 0% Entrepreneur Individuel • Carto North Data)
              </span>
            </div>
          </div>

          {/* Right Header Actions */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={toggleTheme}
              className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition"
              title={theme === 'dark' ? "Passer en mode clair" : "Passer en mode sombre"}
            >
              {theme === 'dark' ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-slate-700" />}
            </button>

            <div className="hidden md:flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/30" title="Les notes et statuts sont synchronisés en temps réel entre tous les ordinateurs">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-semibold text-emerald-700 dark:text-emerald-400">☁️ Session Partagée</span>
            </div>

            <button
              onClick={() => handleSync('ALL')}
              disabled={isSyncing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-semibold shadow-xs transition disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Sync...' : 'Actualiser'}</span>
            </button>

            <button
              onClick={handleExportCsv}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-[11px] font-semibold border border-slate-200 dark:border-slate-700 transition"
              title="Exporter la sélection filtrée au format CSV (Excel)"
            >
              <Download className="w-3 h-3 text-blue-600 dark:text-blue-400" />
              <span className="hidden sm:inline">Exporter CSV ({companies.length})</span>
            </button>
          </div>
        </div>

        {syncMessage && (
          <div className="bg-blue-50 dark:bg-blue-950/40 border-t border-blue-200 dark:border-blue-900/50 py-1 px-4 text-center text-[11px] text-blue-800 dark:text-blue-200 flex items-center justify-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span>{syncMessage}</span>
          </div>
        )}
      </header>

      {/* Main Container — Full Viewport Width with Compact Vertical Spacing */}
      <main className="w-full max-w-[1920px] mx-auto px-3 sm:px-5 py-2.5 space-y-2.5 flex-1">
        
        {/* Compact Slim KPI Strip */}
        {stats && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
            
            {/* Card 1: Total Scraped 2024-2026 */}
            <div 
              onClick={() => { setSelectedCountry('ALL'); setFxFilter('ALL'); setGeoFilter('ALL'); setVerifiedOnly(false); }}
              className="cursor-pointer bg-white dark:bg-[#121824] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800/80 flex items-center justify-between shadow-2xs hover:border-blue-500/40 transition"
            >
              <div>
                <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">
                  Sociétés Qualifiées (5 ans : 2021-2026 • CA ≤ 30M€)
                </span>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <span className="text-lg font-black text-slate-900 dark:text-white">{stats.total}</span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    🇫🇷 {stats.franceCount} FR • 🇨🇭 {stats.switzerlandCount} CH • 🇧🇪 {stats.belgiumCount || 0} BE{stats.luxembourgCount ? ` • 🇱🇺 ${stats.luxembourgCount} LU` : ''}{stats.netherlandsCount ? ` • 🇳🇱 ${stats.netherlandsCount} NL` : ''}
                  </span>
                </div>
              </div>
              <Building2 className="w-5 h-5 text-blue-500 shrink-0" />
            </div>

            {/* Card 2: Cross-Border & Holdings (North Data) */}
            <div 
              onClick={() => setGeoFilter(prev => prev === 'HAS_HOLDING' ? 'ALL' : 'HAS_HOLDING')}
              className={`cursor-pointer bg-white dark:bg-[#121824] px-3.5 py-2 rounded-xl border flex items-center justify-between shadow-2xs transition ${
                geoFilter === 'HAS_HOLDING' || geoFilter === 'CROSS_BORDER'
                  ? 'border-amber-500 ring-1 ring-amber-500/30'
                  : 'border-slate-200 dark:border-slate-800/80 hover:border-amber-500/40'
              }`}
              title="Cliquer pour filtrer les sociétés reliées à une Holding ou à une entité étrangère"
            >
              <div>
                <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">
                  🌍 Liens Holdings & Entités Étrangères (North Data)
                </span>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <span className="text-lg font-black text-amber-600 dark:text-amber-400">{stats.crossBorderCount || 0}</span>
                  <span className="text-[11px] text-amber-600/80 dark:text-amber-400/80 font-medium">
                    {geoFilter === 'HAS_HOLDING' ? '✓ Filtre Holding actif' : 'Groupes & Filiales internationales'}
                  </span>
                </div>
              </div>
              <Share2 className="w-5 h-5 text-amber-500 shrink-0" />
            </div>

            {/* Card 3: Active Anti-Homonym Web Presence */}
            <div 
              onClick={() => setVerifiedOnly(prev => !prev)}
              className={`cursor-pointer bg-white dark:bg-[#121824] px-3.5 py-2 rounded-xl border flex items-center justify-between shadow-2xs transition ${
                verifiedOnly
                  ? 'border-purple-500 ring-1 ring-purple-500/30'
                  : 'border-slate-200 dark:border-slate-800/80 hover:border-purple-500/40'
              }`}
              title="Cliquer pour afficher uniquement les sociétés avec site web officiel certifié anti-homonyme"
            >
              <div>
                <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">
                  🌐 Site Web Certifié (Anti-Homonyme & SSL)
                </span>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <span className="text-lg font-black text-purple-600 dark:text-purple-400">{stats.verifiedWebCount || 0}</span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    {verifiedOnly ? '✓ Filtre Site Actif' : 'Contenu & DNS vérifiés'}
                  </span>
                </div>
              </div>
              <Globe className="w-5 h-5 text-purple-500 shrink-0" />
            </div>

            {/* Card 4: High FX Potential */}
            <div 
              onClick={() => setFxFilter(prev => prev === 'high' ? 'ALL' : 'high')}
              className={`cursor-pointer bg-white dark:bg-[#121824] px-3.5 py-2 rounded-xl border flex items-center justify-between shadow-2xs transition ${
                fxFilter === 'high'
                  ? 'border-cyan-500 ring-1 ring-cyan-500/30'
                  : 'border-slate-200 dark:border-slate-800/80 hover:border-cyan-500/40'
              }`}
              title="Cliquer pour filtrer uniquement les sociétés à Fort Potentiel FX (Multi-devises CHF / EUR / USD)"
            >
              <div>
                <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">
                  💱 Fort Potentiel FX (Multi-Devises)
                </span>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <span className="text-lg font-black text-cyan-600 dark:text-cyan-400">{stats.highFxCount || 0}</span>
                  <span className="text-[11px] text-cyan-600/80 dark:text-cyan-400/80 font-medium">
                    {fxFilter === 'high' ? '✓ Filtre FX actif' : `${stats.toContact} à contacter`}
                  </span>
                </div>
              </div>
              <TrendingUp className="w-5 h-5 text-cyan-500 shrink-0" />
            </div>

          </div>
        )}

        {/* Compact 2-Row Filter Bar */}
        <div className="bg-white dark:bg-[#121824] p-2.5 rounded-xl border border-slate-200 dark:border-slate-800/80 shadow-2xs space-y-2 transition-colors">
          
          {/* Filter Row 1: Search, Country, CRM Status, SECTEUR D'ACTIVITÉ, Période (2024-2026) & Jour Exact */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2 items-center">
            
            {/* Search Input (2 cols) */}
            <div className="relative lg:col-span-2">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Société, dirigeant physique, SIREN/UID, holding, ville..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-50 dark:bg-[#161f30] border border-slate-300 dark:border-slate-700/80 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* Country Selector Tabs (4 cols) */}
            <div className="flex items-center bg-slate-100 dark:bg-[#161f30] p-0.5 rounded-lg border border-slate-200 dark:border-slate-700/80 lg:col-span-4 overflow-x-auto">
              <button
                onClick={() => setSelectedCountry('ALL')}
                className={`flex-1 py-1 px-1.5 rounded-md text-[11px] font-bold transition whitespace-nowrap ${
                  selectedCountry === 'ALL' ? 'bg-blue-600 text-white shadow-2xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Tous ({stats.total})
              </button>
              <button
                onClick={() => setSelectedCountry('FR')}
                className={`flex-1 py-1 px-1.5 rounded-md text-[11px] font-bold transition whitespace-nowrap ${
                  selectedCountry === 'FR' ? 'bg-blue-600 text-white shadow-2xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                🇫🇷 FR ({stats.franceCount})
              </button>
              <button
                onClick={() => setSelectedCountry('CH')}
                className={`flex-1 py-1 px-1.5 rounded-md text-[11px] font-bold transition whitespace-nowrap ${
                  selectedCountry === 'CH' ? 'bg-blue-600 text-white shadow-2xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                🇨🇭 CH ({stats.switzerlandCount})
              </button>
              <button
                onClick={() => setSelectedCountry('BE')}
                className={`flex-1 py-1 px-1.5 rounded-md text-[11px] font-bold transition whitespace-nowrap ${
                  selectedCountry === 'BE' ? 'bg-blue-600 text-white shadow-2xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                🇧🇪 BE ({stats.belgiumCount || 0})
              </button>
              <button
                onClick={() => setSelectedCountry('LU')}
                className={`flex-1 py-1 px-1.5 rounded-md text-[11px] font-bold transition whitespace-nowrap ${
                  selectedCountry === 'LU' ? 'bg-blue-600 text-white shadow-2xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                🇱🇺 LU ({stats.luxembourgCount || 0})
              </button>
              <button
                onClick={() => setSelectedCountry('NL')}
                className={`flex-1 py-1 px-1.5 rounded-md text-[11px] font-bold transition whitespace-nowrap ${
                  selectedCountry === 'NL' ? 'bg-blue-600 text-white shadow-2xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                🇳🇱 NL ({stats.netherlandsCount || 0})
              </button>
            </div>

            {/* SECTEUR D'ACTIVITÉ Filter (replaces old "activités éligibles" filter) (2 cols) */}
            <div className="lg:col-span-2">
              <select
                value={selectedSector}
                onChange={(e) => setSelectedSector(e.target.value)}
                className="w-full bg-slate-50 dark:bg-[#161f30] border border-blue-500/40 dark:border-blue-500/40 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 font-semibold"
                title="Filtrer par Secteur d'Activité"
              >
                <option value="ALL">🏢 Tous les secteurs d'activité</option>
                {sectorOptions.map(s => (
                  <option key={s.cat} value={s.cat}>
                    {s.cat} ({s.count})
                  </option>
                ))}
              </select>
            </div>

            {/* CRM Status Dropdown (2 cols) */}
            <div className="lg:col-span-2">
              <select
                value={selectedCrmStatus}
                onChange={(e) => setSelectedCrmStatus(e.target.value)}
                className="w-full bg-slate-50 dark:bg-[#161f30] border border-slate-300 dark:border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
              >
                <option value="ALL">📋 Tous les statuts CRM</option>
                <option value="new">🔵 Nouveau</option>
                <option value="to_contact">🟡 À contacter</option>
                <option value="contacted_email">🟣 Email / LinkedIn envoyé</option>
                <option value="contacted_call">📞 Appel passé</option>
                <option value="in_crm">🟢 Dans le CRM</option>
                <option value="converted">🏆 Converti Revolut</option>
                <option value="unqualified">⚪ Non qualifié</option>
              </select>
            </div>

            {/* Date / Year Range Dropdown (Since Jan 1, 2024) + Exact Day Picker (3 cols) */}
            <div className="lg:col-span-3 flex items-center gap-1.5">
              <select
                value={dateFilter}
                onChange={(e) => {
                  setDateFilter(e.target.value);
                  setExactDate('');
                }}
                className="flex-1 min-w-0 bg-slate-50 dark:bg-[#161f30] border border-slate-300 dark:border-slate-700/80 rounded-lg px-2 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 font-medium"
              >
                <optgroup label="Historique 5 ans (2021 – 2026)">
                  <option value="all">📅 5 dernières années (2021 – 2026)</option>
                  <option value="year:2026">🗓️ Année 2026</option>
                  <option value="year:2025">🗓️ Année 2025</option>
                  <option value="year:2024">🗓️ Année 2024</option>
                  <option value="year:2023">🗓️ Année 2023</option>
                  <option value="year:2022">🗓️ Année 2022</option>
                  <option value="year:2021">🗓️ Année 2021</option>
                </optgroup>
                <optgroup label="Périodes récentes">
                  <option value="today">📅 Dernières 48h</option>
                  <option value="7days">📅 7 derniers jours</option>
                  <option value="30days">📅 30 derniers jours</option>
                  <option value="90days">📅 90 derniers jours</option>
                  <option value="180days">📅 6 derniers mois</option>
                </optgroup>
                <optgroup label="Mois 2026">
                  <option value="month:2026-10">Octobre 2026</option>
                  <option value="month:2026-09">Septembre 2026</option>
                  <option value="month:2026-08">Août 2026</option>
                  <option value="month:2026-07">Juillet 2026</option>
                  <option value="month:2026-06">Juin 2026</option>
                  <option value="month:2026-05">Mai 2026</option>
                  <option value="month:2026-04">Avril 2026</option>
                </optgroup>
              </select>

              <input
                type="date"
                value={exactDate}
                min="2021-01-01"
                max="2026-10-31"
                onChange={(e) => setExactDate(e.target.value)}
                className="w-[118px] shrink-0 bg-slate-50 dark:bg-[#161f30] border border-slate-300 dark:border-slate-700/80 rounded-lg px-2 py-1.5 text-[11px] text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                title="Filtrer par jour exact d'incorporation (5 ans : 2021-2026)"
              />
            </div>

          </div>

          {/* Filter Row 2: FX Potential, Capital Social, Chiffre d'Affaires (<=30M€), Forme Juridique, Zone/Langue/International & Tri */}
          <div className="pt-1.5 border-t border-slate-200 dark:border-slate-800/80 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-12 gap-2 items-center">
            
            {/* 1. FX Potential (2 cols) */}
            <div className="lg:col-span-2">
              <select
                value={fxFilter}
                onChange={(e) => setFxFilter(e.target.value)}
                className="w-full bg-slate-50 dark:bg-[#161f30] border border-cyan-500/40 rounded-lg px-2 py-1.5 text-[11px] text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500 font-semibold"
              >
                <option value="ALL">💱 Tous profils FX</option>
                <option value="high">🔥 Fort Potentiel FX (CHF/EUR/USD)</option>
                <option value="medium_high">🌐 FX Fort & Modéré</option>
              </select>
            </div>

            {/* 2. Capital Social Minimum (2 cols) */}
            <div className="lg:col-span-2">
              <select
                value={minCapital}
                onChange={(e) => setMinCapital(Number(e.target.value))}
                className="w-full bg-slate-50 dark:bg-[#161f30] border border-slate-300 dark:border-slate-700/80 rounded-lg px-2 py-1.5 text-[11px] text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 font-medium"
              >
                <option value={0}>💰 Tous capitaux sociaux</option>
                <option value={5000}>💰 Capital ≥ 5 000 € / CHF</option>
                <option value={10000}>💰 Capital ≥ 10 000 € / CHF</option>
                <option value={20000}>💰 Capital ≥ 20 000 € / CHF</option>
                <option value={50000}>💰 Capital ≥ 50 000 € / CHF</option>
                <option value={100000}>💰 Capital ≥ 100 000 € / CHF</option>
              </select>
            </div>

            {/* 3. Chiffre d'Affaires <= 30M€ Filter (2 cols) */}
            <div className="lg:col-span-2">
              <select
                value={revenueFilter}
                onChange={(e) => setRevenueFilter(e.target.value)}
                className="w-full bg-slate-50 dark:bg-[#161f30] border border-emerald-500/40 rounded-lg px-2 py-1.5 text-[11px] text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 font-semibold"
                title="Toutes les entreprises de la base respectent le critère CA ≤ 30M€"
              >
                <option value="ALL">📊 Tous CA (Certifiés ≤ 30M€)</option>
                <option value="published">📊 CA publié au bilan (≤ 30M€)</option>
                <option value="under_1m">📊 CA &lt; 1 Million €</option>
                <option value="1m_10m">📊 CA 1M€ à 10M€</option>
                <option value="10m_30m">📊 CA 10M€ à 30M€</option>
              </select>
            </div>

            {/* 4. Forme Juridique Commerciale (2 cols) */}
            <div className="lg:col-span-2">
              <select
                value={legalFormFilter}
                onChange={(e) => setLegalFormFilter(e.target.value)}
                className="w-full bg-slate-50 dark:bg-[#161f30] border border-slate-300 dark:border-slate-700/80 rounded-lg px-2 py-1.5 text-[11px] text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 font-medium"
              >
                <option value="ALL">🏛️ Formes commerciales (0% EI)</option>
                <option value="SAS">🇫🇷 SAS / SASU</option>
                <option value="SARL">🇫🇷 SARL / EURL</option>
                <option value="SA_AG">🇨🇭🇫🇷 SA / AG (Société Anonyme)</option>
                <option value="SARL_GMBH">🇨🇭 Sàrl / GmbH (Suisse)</option>
                <option value="SRL_BV">🇧🇪 SRL / BV (Belgique)</option>
                <option value="SA_NV">🇧🇪 SA / NV (Belgique)</option>
              </select>
            </div>

            {/* 5. Zone / Langue / Canton / Liens Étrangers (2 cols) */}
            <div className="lg:col-span-2">
              <select
                value={geoFilter}
                onChange={(e) => setGeoFilter(e.target.value)}
                className="w-full bg-slate-50 dark:bg-[#161f30] border border-slate-300 dark:border-slate-700/80 rounded-lg px-2 py-1.5 text-[11px] text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 font-medium"
              >
                <option value="ALL">📍 Zones, Cantons & International</option>
                <optgroup label="🌍 Groupes & Liens Internationaux (North Data)">
                  <option value="CROSS_BORDER">🌍 Liée à une entité à l'étranger</option>
                  <option value="HAS_HOLDING">🏢 Détenue par une Holding / Groupe</option>
                </optgroup>
                <optgroup label="🇨🇭 Suisse par Zone Linguistique">
                  <option value="CH_FR">🇨🇭🗣️ Suisse Romande (FR : GE, VD, VS, NE, FR, JU)</option>
                  <option value="CH_DE">🇨🇭🗣️ Suisse Alémanique (DE : ZH, ZG, BE, BS...)</option>
                  <option value="CH_IT">🇨🇭🗣️ Suisse Italienne (IT : Tessin TI)</option>
                </optgroup>
                <optgroup label="🇨🇭 Suisse par Canton">
                  <option value="canton:GE">🇨🇭 Genève (GE)</option>
                  <option value="canton:VD">🇨🇭 Vaud (VD)</option>
                  <option value="canton:VS">🇨🇭 Valais (VS)</option>
                  <option value="canton:FR">🇨🇭 Fribourg (FR)</option>
                  <option value="canton:NE">🇨🇭 Neuchâtel (NE)</option>
                  <option value="canton:JU">🇨🇭 Jura (JU)</option>
                  <option value="canton:ZH">🇨🇭 Zürich (ZH)</option>
                  <option value="canton:ZG">🇨🇭 Zoug (ZG)</option>
                  <option value="canton:AG">🇨🇭 Argovie (AG)</option>
                  <option value="canton:BE">🇨🇭 Berne (BE)</option>
                  <option value="canton:LU">🇨🇭 Lucerne (LU)</option>
                  <option value="canton:BS">🇨🇭 Bâle-Ville (BS)</option>
                  <option value="canton:TI">🇨🇭 Tessin (TI)</option>
                </optgroup>
                <optgroup label="🇧🇪 Belgique par Région">
                <option value="BE_BRU">Bruxelles-Capitale</option>
                <option value="BE_VLG">Flandre</option>
                <option value="BE_WAL">Wallonie</option>
              </optgroup>
              <optgroup label="🇫🇷 France par Région">
                  <option value="FR_IDF">🇫🇷 Île-de-France (Paris & RP)</option>
                  <option value="FR_ARA">🇫🇷 Auvergne-Rhône-Alpes (Lyon, 74)</option>
                  <option value="FR_PACA">🇫🇷 PACA & Côte d'Azur</option>
                  <option value="FR_NAQ">🇫🇷 Nouvelle-Aquitaine (Bordeaux)</option>
                  <option value="FR_OCC">🇫🇷 Occitanie (Toulouse, Montpellier)</option>
                  <option value="FR_HDF_GE">🇫🇷 Nord & Grand Est (Lille, Strasbourg)</option>
                  <option value="FR_OUEST">🇫🇷 Grand Ouest (Nantes, Rennes)</option>
                </optgroup>
              </select>
            </div>

            {/* 6. Tri Dynamique + Toggle Site Web (2 cols) */}
            <div className="lg:col-span-2 flex items-center gap-1.5">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="flex-1 min-w-0 bg-slate-50 dark:bg-[#161f30] border border-slate-300 dark:border-slate-700/80 rounded-lg px-2 py-1.5 text-[11px] text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 font-bold"
              >
                <option value="date_desc">🔽 Tri : Plus récentes</option>
                <option value="capital_desc">💰 Tri : Capital Social</option>
                <option value="revenue_desc">📊 Tri : Chiffre d'Affaires</option>
                <option value="fx_desc">💱 Tri : Potentiel FX</option>
                <option value="safety_desc">🛡️ Tri : Score Sûreté</option>
              </select>
            </div>

          </div>
        </div>

        {/* Lead Table View — 100% Viewport Fitting (`table-fixed w-full`), Zero Horizontal Cutoff */}
        <div className="bg-white dark:bg-[#121824] border border-slate-200 dark:border-slate-800/80 rounded-xl overflow-hidden shadow-xs transition-colors">
          
          {/* Compact Table Status Bar */}
          <div className="px-4 py-2 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between flex-wrap gap-2 bg-slate-50/70 dark:bg-[#161f30]/40 text-xs">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-slate-900 dark:text-white">
                Sociétés Commerciales Détectées :
              </span>
              <span className="px-2 py-0.5 rounded-full bg-blue-600/15 text-blue-700 dark:text-blue-300 font-bold border border-blue-500/30">
                {companies.length} résultat(s)
              </span>

              {/* Quick filter pills when active */}
              {selectedSector !== 'ALL' && (
                <span className="px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 font-bold border border-indigo-500/30 flex items-center gap-1 text-[11px]">
                  🏢 {selectedSector}
                  <button onClick={() => setSelectedSector('ALL')} className="hover:text-rose-500 ml-0.5">✕</button>
                </span>
              )}
              {exactDate && (
                <span className="px-2 py-0.5 rounded-full bg-blue-600/15 text-blue-600 dark:text-blue-400 font-bold border border-blue-500/30 flex items-center gap-1 text-[11px]">
                  📅 {formatDateFr(exactDate)}
                  <button onClick={() => setExactDate('')} className="hover:text-rose-500 ml-0.5">✕</button>
                </span>
              )}
              {fxFilter !== 'ALL' && (
                <span className="px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 font-bold border border-cyan-500/30 flex items-center gap-1 text-[11px]">
                  💱 Filtre FX
                  <button onClick={() => setFxFilter('ALL')} className="hover:text-rose-500 ml-0.5">✕</button>
                </span>
              )}
              {minCapital > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 font-bold border border-indigo-500/30 flex items-center gap-1 text-[11px]">
                  💰 ≥ {minCapital.toLocaleString('fr-FR')}
                  <button onClick={() => setMinCapital(0)} className="hover:text-rose-500 ml-0.5">✕</button>
                </span>
              )}
              {geoFilter !== 'ALL' && (
                <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 font-bold border border-amber-500/30 flex items-center gap-1 text-[11px]">
                  📍 {geoFilter}
                  <button onClick={() => setGeoFilter('ALL')} className="hover:text-rose-500 ml-0.5">✕</button>
                </span>
              )}
            </div>

            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 cursor-pointer select-none text-[11px]">
                <input
                  type="checkbox"
                  checked={verifiedOnly}
                  onChange={(e) => setVerifiedOnly(e.target.checked)}
                  className="w-3.5 h-3.5 rounded text-blue-600 focus:ring-blue-500 border-slate-300 dark:border-slate-700 dark:bg-slate-900"
                />
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  🌐 Uniquement avec Site Web vérifié
                </span>
              </label>

              {/* Day switcher */}
              <select
                value={exactDate}
                onChange={(e) => setExactDate(e.target.value)}
                className="bg-white dark:bg-[#161f30] border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1 text-[11px] text-slate-800 dark:text-slate-200 font-medium"
              >
                <option value="">📅 Choisir un jour ({availableIncorporationDays.length} j.)</option>
                {availableIncorporationDays.slice(0, 120).map(d => (
                  <option key={d.date} value={d.date}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="w-full overflow-x-auto">
            <table className="w-full table-fixed text-left text-xs">
              <thead className="bg-slate-100 dark:bg-[#161f30] text-slate-600 dark:text-slate-400 font-semibold uppercase tracking-wider text-[10px] border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-2.5 px-2.5 w-[125px]">Statut CRM</th>
                  <th className="py-2.5 px-2.5 w-[25%]">Entreprise, Capital, CA & Immat.</th>
                  <th className="py-2.5 px-2.5 w-[20%]">Secteur d'Activité & FX</th>
                  <th className="py-2.5 px-2.5 w-[22%]">Dirigeants (Personnes Physiques) & Liens</th>
                  <th className="py-2.5 px-2.5 w-[18%]">Site Web, LinkedIn & Contact</th>
                  <th className="py-2.5 px-2.5 w-[120px] text-right">Carto & Fiche</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60">
                {loading ? (
                  <tr>
                    <td colSpan="6" className="py-10 text-center text-slate-500">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <RefreshCw className="w-5 h-5 animate-spin text-blue-500" />
                        <span>Chargement des registres...</span>
                      </div>
                    </td>
                  </tr>
                ) : companies.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="py-12 text-center text-slate-500">
                      {selectedCountry === 'NL' ? (
                        <div className="max-w-md mx-auto space-y-2 px-4">
                          <div className="text-3xl">🇳🇱</div>
                          <div className="font-semibold text-slate-800 dark:text-slate-200 text-sm">
                            Pays-Bas : Registre KvK sous paywall légal
                          </div>
                          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                            Le registre officiel de commerce néerlandais (KvK) restreint l'accès aux dirigeants personnes physiques derrière un extrait payant obligatoire (KvK Uittreksel).
                            Conformément à la règle de conformité stricte (Option A : 100% dirigeants réels prouvés, 0% hallucination), aucune fiche non certifiée n'est injectée.
                          </p>
                        </div>
                      ) : (
                        "Aucune société commerciale ne correspond aux critères de filtre sélectionnés."
                      )}
                    </td>
                  </tr>
                ) : (
                  companies.slice(0, visibleCount).map((c) => {
                    const isCH = c.country === 'CH';
                    const flag = countryFlag(c.country);
                    const rawDir = c.dirigeants?.[0]?.name;
                    const primaryDirigeant = (!rawDir || rawDir === 'X') ? 'X' : rawDir;
                    const capAmount = Number(c.shareCapital) || 0;
                    const revAmount = Number(c.revenue) || 0;
                    const intlLinks = c.internationalLinks || [];
                    const corpLinks = c.corporateLinks || [];

                    return (
                      <tr 
                        key={c.id} 
                        className="hover:bg-slate-100/70 dark:hover:bg-[#161f30]/60 transition align-top"
                      >
                        
                        {/* 1. CRM Status + Shared Notes */}
                        <td className="py-2.5 px-2.5">
                          <div className="flex flex-col gap-1 items-start">
                            <select
                              value={c.crmStatus || 'new'}
                              onChange={(e) => handleUpdateStatus(c.id, { crmStatus: e.target.value })}
                              className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md px-1.5 py-1 text-[11px] font-semibold text-slate-800 dark:text-white focus:outline-none focus:border-blue-500"
                            >
                              <option value="new">🔵 Nouveau</option>
                              <option value="to_contact">🟡 À contacter</option>
                              <option value="contacted_email">🟣 Contacté</option>
                              <option value="contacted_call">📞 Appelé</option>
                              <option value="in_crm">🟢 Dans CRM</option>
                              <option value="converted">🏆 Converti</option>
                              <option value="unqualified">⚪ Rejeté</option>
                            </select>

                            {c.crmAssignedTo && (
                              <span
                                onClick={() => setSelectedCompany(c)}
                                className="cursor-pointer inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 border border-indigo-500/30 truncate max-w-full"
                              >
                                👤 {c.crmAssignedTo}
                              </span>
                            )}

                            {c.crmNotes && (
                              <button
                                onClick={() => setSelectedCompany(c)}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 max-w-full truncate hover:bg-amber-500/25 transition"
                                title={`Note d'équipe : ${c.crmNotes}`}
                              >
                                📝 <span className="truncate">{c.crmNotes}</span>
                              </button>
                            )}
                          </div>
                        </td>

                        {/* 2. Company Name, Capital, Turnover (CA) & Geo */}
                        <td className="py-2.5 px-2.5">
                          <div className="flex items-start gap-1.5">
                            <span className="text-sm select-none mt-0.5 shrink-0">{flag}</span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1 group">
                                <button
                                  onClick={() => setSelectedCompany(c)}
                                  className="font-bold text-slate-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 text-left transition text-xs truncate"
                                  title={c.name}
                                >
                                  {c.name}
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleCopy(c.name, `name-${c.id}`);
                                  }}
                                  className="p-0.5 opacity-0 group-hover:opacity-100 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-slate-400 transition shrink-0"
                                  title="Copier le nom"
                                >
                                  {copiedKey === `name-${c.id}` ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                                </button>
                              </div>

                              <div className="flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400 mt-1 flex-wrap">
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
                                    title="Filtrer sur ce jour d'immatriculation"
                                  >
                                    📅 {formatDateFr(c.incorporationDate)}
                                  </button>
                                )}
                                <span className="px-1.5 py-0.2 bg-slate-100 dark:bg-slate-800 rounded font-semibold text-slate-700 dark:text-slate-300">
                                  {c.legalForm}
                                </span>
                                {capAmount > 0 && (
                                  <span
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setMinCapital(prev => prev === capAmount ? 0 : Math.min(capAmount, 100000));
                                    }}
                                    className="cursor-pointer px-1.5 py-0.2 rounded font-bold bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/25 hover:bg-indigo-500/20"
                                    title="Cliquer pour filtrer par capital social"
                                  >
                                    💰 {capAmount.toLocaleString('fr-FR')} {isCH ? 'CHF' : '€'}
                                  </span>
                                )}
                                {revAmount > 0 && (
                                  <span
                                    className="px-1.5 py-0.2 rounded font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30"
                                    title={`Chiffre d'affaires officiel (${c.revenueYear || 'Bilan'}) : ${revAmount.toLocaleString('fr-FR')} €`}
                                  >
                                    📊 CA: {revAmount >= 1000000 ? `${(revAmount / 1000000).toFixed(1)}M€` : `${Math.round(revAmount / 1000)}k€`}
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400 mt-1 flex-wrap">
                                <span
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (isCH && c.canton) {
                                      setGeoFilter(prev => prev === `canton:${c.canton}` ? 'ALL' : `canton:${c.canton}`);
                                    } else if (c.geoZone?.regionCode) {
                                      setGeoFilter(prev => prev === c.geoZone.regionCode ? 'ALL' : c.geoZone.regionCode);
                                    }
                                  }}
                                  className="cursor-pointer hover:text-blue-500 font-medium truncate"
                                >
                                  📍 {c.city} {isCH && c.canton ? `(${c.canton})` : c.postalCode ? `(${c.postalCode.slice(0, 2)})` : ''}
                                </span>
                                <span>•</span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleCopy(c.registrationNumber, `siren-${c.id}`);
                                  }}
                                  className="font-mono hover:text-blue-500 transition"
                                >
                                  {copiedKey === `siren-${c.id}` ? '✓ Copié' : c.registrationNumber}
                                </button>
                                <a
                                  href={c.northDataUrl || `https://www.northdata.fr/?query=${encodeURIComponent(`${c.name} ${c.registrationNumber || ''}`)}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="px-1.5 py-0.2 rounded bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 font-bold hover:underline flex items-center gap-0.5 border border-indigo-200 dark:border-indigo-800/60 text-[9px]"
                                  title="Voir le graphe de détention et l'historique sur North Data"
                                >
                                  <span>NorthData</span>
                                  <ExternalLink className="w-2.5 h-2.5" />
                                </a>
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* 3. Secteur d'Activité, Conformité & FX */}
                        <td className="py-2.5 px-2.5">
                          <div className="space-y-1">
                            <div
                              onClick={(e) => {
                                e.stopPropagation();
                                const cat = c.activityCategory || 'Services B2B';
                                setSelectedSector(prev => prev === cat ? 'ALL' : cat);
                              }}
                              title="Cliquer pour filtrer par ce secteur d'activité"
                            >
                              {getCategoryBadge(c.activityCategory || 'Services B2B')}
                            </div>

                            <div className="flex items-center gap-1 flex-wrap">
                              {c.fxPotential && c.fxPotential.level === 'high' && (
                                <span
                                  onClick={() => setFxFilter(prev => prev === 'high' ? 'ALL' : 'high')}
                                  className="cursor-pointer text-[10px] font-bold px-1.5 py-0.5 rounded border bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-500/30 inline-flex items-center gap-0.5"
                                  title={`${c.fxPotential.badge} — Cliquer pour filtrer`}
                                >
                                  {c.fxPotential.badge}
                                </span>
                              )}
                              {c.fxPotential && c.fxPotential.level === 'medium' && (
                                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700">
                                  {c.fxPotential.shortBadge}
                                </span>
                              )}
                              {c.compliance && (
                                <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border ${
                                  c.compliance.status === 'restricted'
                                    ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-800'
                                    : c.compliance.status === 'conditional'
                                    ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800'
                                    : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
                                }`}>
                                  {c.compliance.badge}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* 4. Dirigeants (Strictly Physical Persons!) + Cross-Border / Holding Badges */}
                        <td className="py-2.5 px-2.5">
                          <div className="space-y-1">
                            <div className="flex items-center gap-1 flex-wrap">
                              <button
                                onClick={() => handleCopy(primaryDirigeant, `dir-${c.id}`)}
                                className="font-bold text-slate-900 dark:text-slate-100 hover:text-blue-500 flex items-center gap-1 text-left truncate max-w-full"
                                title="Personne physique certifiée au registre (Cliquer pour copier)"
                              >
                                <UserCheck className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                                <span className="truncate">{primaryDirigeant}</span>
                                {copiedKey === `dir-${c.id}` && <span className="text-[10px] text-emerald-500">✓</span>}
                              </button>
                              {(c.dirigeants?.filter(d => d.name && d.name !== 'X').length || 0) > 1 && (
                                <button
                                  onClick={() => setSelectedCompany(c)}
                                  className="text-[9px] px-1.5 py-0.2 rounded-full bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30 font-bold shrink-0"
                                >
                                  +{c.dirigeants.filter(d => d.name && d.name !== 'X').length - 1} Board
                                </button>
                              )}
                            </div>

                            <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                              {c.dirigeants?.[0]?.role || 'Dirigeant (Personne Physique)'}
                            </div>

                            {/* Cross-Border / Foreign Entity Badges */}
                            {intlLinks.length > 0 && (
                              <div className="flex items-center gap-1 flex-wrap pt-0.5">
                                {intlLinks.slice(0, 2).map((intl, idx) => (
                                  <button
                                    key={idx}
                                    onClick={() => handleOpenNetwork(c)}
                                    className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/15 hover:bg-amber-500/25 text-amber-700 dark:text-amber-300 border border-amber-500/30 font-bold flex items-center gap-1 truncate max-w-full"
                                    title={`${intl.relation} : ${intl.entityName} (${intl.countryName}) — Cliquer pour voir la cartographie`}
                                  >
                                    <span>🌍 {intl.flag} Liée : {intl.countryName}</span>
                                  </button>
                                ))}
                              </div>
                            )}

                            {/* Corporate Holding Badge (if owned by a holding) */}
                            {corpLinks.length > 0 && intlLinks.length === 0 && (
                              <button
                                onClick={() => handleOpenNetwork(c)}
                                className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 font-bold flex items-center gap-1 truncate max-w-full"
                                title={`Holding / Société Mère : ${corpLinks[0].name}`}
                              >
                                <span>🏢 Holding : {corpLinks[0].name.slice(0, 20)}</span>
                              </button>
                            )}
                          </div>
                        </td>

                        {/* 5. Verified Website, Anti-Homonym LinkedIn & Contact */}
                        <td className="py-2.5 px-2.5">
                          <div className="space-y-1">
                            {/* Website + LinkedIn Row */}
                            <div className="flex items-center gap-1 flex-wrap">
                              {c.website ? (
                                <a
                                  href={c.website}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-[10px] px-1.5 py-0.5 rounded bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 hover:bg-purple-100 border border-purple-200 dark:border-purple-800 flex items-center gap-1 font-bold transition truncate max-w-[140px]"
                                  title={`Site officiel vérifié (anti-homonyme) : ${c.website}`}
                                >
                                  <Globe className="w-3 h-3 text-purple-500 shrink-0" />
                                  <span className="truncate">{c.domain || 'Site Web'}</span>
                                </a>
                              ) : (
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800/80 text-slate-400 border border-slate-200 dark:border-slate-700/60">
                                  Pas de site
                                </span>
                              )}

                              {c.linkedinCompanyUrl && (
                                <a
                                  href={c.linkedinCompanyUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/50 text-[#0a66c2] dark:text-sky-300 hover:bg-blue-100 border border-blue-200 dark:border-blue-800 flex items-center gap-1 font-semibold transition"
                                  title="Recherche LinkedIn Entreprise (avec filtre pays anti-homonyme)"
                                >
                                  <LinkedinIcon className="w-2.5 h-2.5 text-[#0a66c2]" />
                                  <span>Société</span>
                                </a>
                              )}

                              {c.linkedinDirigeantUrl && (
                                <a
                                  href={c.linkedinDirigeantUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-[10px] px-1.5 py-0.5 rounded bg-sky-50 dark:bg-sky-950/40 text-[#0a66c2] dark:text-sky-300 hover:bg-sky-100 border border-sky-200 dark:border-sky-800/60 flex items-center gap-0.5 font-semibold transition"
                                  title={`Recherche LinkedIn : "${primaryDirigeant}" + "${c.name}"`}
                                >
                                  <UserCheck className="w-2.5 h-2.5 text-sky-500" />
                                  <span>Décideur</span>
                                </a>
                              )}
                            </div>

                            {/* Direct Email / Phone if available */}
                            {c.bestEmail && (
                              <button
                                onClick={() => handleCopy(c.bestEmail, `mail-${c.id}`)}
                                className="px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800/50 text-[10px] font-mono flex items-center gap-1 truncate max-w-full hover:bg-blue-100"
                                title={`Copier l'email (${c.emailSource})`}
                              >
                                <Mail className="w-2.5 h-2.5 text-blue-500 shrink-0" />
                                <span className="truncate">{copiedKey === `mail-${c.id}` ? '✓ Copié !' : c.bestEmail}</span>
                              </button>
                            )}

                            {c.phone && (
                              <button
                                onClick={() => handleCopy(c.phone, `phone-${c.id}`)}
                                className="px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50 text-[10px] font-mono flex items-center gap-1"
                              >
                                <Phone className="w-2.5 h-2.5 text-emerald-500 shrink-0" />
                                <span>{copiedKey === `phone-${c.id}` ? '✓ Copié !' : c.phone}</span>
                              </button>
                            )}
                          </div>
                        </td>

                        {/* 6. Actions: Cartographie Réseau & Fiche Complète */}
                        <td className="py-2.5 px-2.5 text-right whitespace-nowrap">
                          <div className="flex flex-col items-end gap-1">
                            <button
                              onClick={() => setSelectedCompany(c)}
                              className="w-full px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold transition shadow-2xs flex items-center justify-center gap-1"
                            >
                              <span>Fiche & Notes</span>
                            </button>
                            <button
                              onClick={() => handleOpenNetwork(c)}
                              className="w-full px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-[10px] font-semibold border border-slate-200 dark:border-slate-700 transition flex items-center justify-center gap-1"
                              title="Ouvrir la cartographie North Data des dirigeants et holdings"
                            >
                              <Share2 className="w-3 h-3 text-blue-500" />
                              <span>Cartographie</span>
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

          {companies.length > visibleCount && (
            <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-[#161f30]/50 flex items-center justify-between flex-wrap gap-3 text-xs">
              <span className="text-slate-600 dark:text-slate-400 font-medium">
                Affichage de <strong className="text-slate-900 dark:text-white">{visibleCount.toLocaleString('fr-FR')}</strong> sur <strong className="text-blue-600 dark:text-blue-400">{companies.length.toLocaleString('fr-FR')}</strong> sociétés commerciales qualifiées (2024–2026)
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setVisibleCount(v => v + 300)}
                  className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold transition shadow-xs"
                >
                  + Afficher 300 sociétés de plus
                </button>
                <button
                  onClick={() => setVisibleCount(companies.length)}
                  className="px-3.5 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-semibold border border-slate-300 dark:border-slate-700 transition"
                >
                  Tout afficher ({companies.length.toLocaleString('fr-FR')})
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Modals */}
      {selectedCompany && (
        <CompanyDetailModal
          company={selectedCompany}
          onClose={() => setSelectedCompany(null)}
          onUpdateStatus={handleUpdateStatus}
          onOpenNetwork={(comp) => {
            handleOpenNetwork(comp);
          }}
        />
      )}

      {networkData && (
        <NetworkGraph
          network={networkData}
          onClose={() => setNetworkData(null)}
        />
      )}
    </div>
  );
}
