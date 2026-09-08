// src/pages/settings/SystemInformation.tsx

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Database,
  ShieldCheck,
  Scale,
  Info,
  HardDrive,
  Cpu,
  ChevronRight,
  RefreshCw,
  Cloud,
  Users,
  ClipboardList,
  ShoppingBag,
  Package,
  Layers,
  Code2,
  Phone,
  Mail,
  ExternalLink,
  AlertTriangle,
  Download,
  CheckCircle2,
  Settings2,
  Globe,
  Sparkles,
  Copy,
  Check,
  HelpCircle,
} from 'lucide-react';
import { toast } from 'react-toastify';
import { supabase } from '../../lib/supabase/client';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Table } from '../../components/ui/Table';
import type { Column } from '../../components/ui/Table';

// Capacitor Native Platform Support
import { Capacitor } from '@capacitor/core';

// Dynamic version retrieval from package.json
import pkg from '../../../package.json';

// App Update and Free Forever External Hosting Services
import {
  fetchLatestRelease,
  executeAppUpdate,
  getHostingSettings,
  saveHostingSettings,
  formatBytes,
  type AppReleaseInfo,
  type HostingSettings,
} from '../../lib/appUpdateService';

interface StorageMetric {
  title: string;
  value: string;
  subtext: string;
  progress: number;
  limitText?: string;
  icon: React.ReactNode;
  colorClass: string;
  barColorClass: string;
}

interface AppInfo {
  label: string;
  value: string;
}

interface RecordBreakdownItem {
  id: string;
  tableName: string;
  recordCount: number;
  sizeBytes: number;
  purpose: string;
  status: 'Active' | 'Operational' | 'System';
}

type LegalModalType = 'terms' | 'privacy' | 'developer' | null;

const tableDisplayMapping: Record<
  string,
  {
    label: string;
    purpose: string;
    status: 'Active' | 'Operational' | 'System';
  }
> = {
  members: {
    label: 'Members Directory',
    purpose:
      'Enrolled member profiles, contact directories, and security metadata',
    status: 'Active',
  },
  attendance: {
    label: 'Logbook Attendance',
    purpose: 'Daily check-in logs, walk-in visits, and timestamp telemetry',
    status: 'Active',
  },
  sales: {
    label: 'Sales Transactions',
    purpose: 'Point-of-sale invoice receipts, retail logs, and cashier history',
    status: 'Active',
  },
  products: {
    label: 'Product Catalog',
    purpose: 'Inventory merchandise, POS barcodes, stock quantity, and pricing',
    status: 'Active',
  },
  subscriptions: {
    label: 'Subscription Contracts',
    purpose: 'Active membership contracts, renewals, and expiration schedules',
    status: 'Active',
  },
  receipts: {
    label: 'Official Receipts',
    purpose:
      'Generated payment receipts, GCash references, and transaction proofs',
    status: 'Operational',
  },
  audit_logs: {
    label: 'Audit History',
    purpose:
      'System-wide activity logs, staff actions, and security audit trail',
    status: 'Operational',
  },
  rates_config: {
    label: 'Rates & Pricing',
    purpose: 'Pricing tiers, membership walk-in fees, tax configuration rates',
    status: 'System',
  },
  gym_profile: {
    label: 'Gym Profile',
    purpose:
      'Gym metadata configuration, addresses, logos, and support directories',
    status: 'System',
  },
  incident_reports: {
    label: 'Incident Reports',
    purpose:
      'Incident logging directories, status parameters, and safety tracking',
    status: 'Active',
  },
  database_backups: {
    label: 'Backup Archives',
    purpose: 'Historical ledger exports, manual backups, and recovery archives',
    status: 'Operational',
  },
  profiles: {
    label: 'Staff & User Accounts',
    purpose: 'System user profiles, coach/staff roles, and admin credentials',
    status: 'System',
  },
};

export const SystemInformation: React.FC = () => {
  const [activeModal, setActiveModal] = useState<LegalModalType>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [showSqlGuide, setShowSqlGuide] = useState<boolean>(false);

  // Storage telemetry states
  const [rpcSupported, setRpcSupported] = useState<boolean>(false);
  const [dbSizeBytes, setDbSizeBytes] = useState<number | null>(null);
  const [storageSizeBytes, setStorageSizeBytes] = useState<number | null>(null);

  // Dynamic values parsed from database catalog statistics
  const [dbTables, setDbTables] = useState<
    Array<{ table_name: string; record_count: number; size_bytes: number }>
  >([]);

  // ─── CAPACITOR & RELEASE UPDATE STATES ──────────────────────────────────────
  const isNative = useMemo(() => Capacitor.isNativePlatform(), []);
  const currentNativePlatform = useMemo(() => Capacitor.getPlatform(), []); // 'android' | 'ios' | 'web'
  const [checkingUpdate, setCheckingUpdate] = useState<boolean>(false);
  const [latestRelease, setLatestRelease] = useState<AppReleaseInfo | null>(null);
  const [hasUpdate, setHasUpdate] = useState<boolean>(false);

  // Update Execution & Hosting Configuration Modals
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState<boolean>(false);
  const [isHostingModalOpen, setIsHostingModalOpen] = useState<boolean>(false);
  const [isGuideModalOpen, setIsGuideModalOpen] = useState<boolean>(false);

  // Download & Installation Execution State
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [downloadStatusText, setDownloadStatusText] = useState<string>('');
  const [copiedLink, setCopiedLink] = useState<boolean>(false);

  // Hosting Settings State (Saved in LocalStorage / Synced with Service)
  const [hostingConfig, setHostingConfig] = useState<HostingSettings>(() => getHostingSettings());
  const [tempHostingConfig, setTempHostingConfig] = useState<HostingSettings>(() => getHostingSettings());
  const [testingHost, setTestingHost] = useState<boolean>(false);
  const [testHostResult, setTestHostResult] = useState<{ success: boolean; message: string; data?: any } | null>(null);

  const APP_VERSION = pkg.version;

  // Compute Build Metadata
  const buildNumber = useMemo(() => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}.${mm}.${dd}`;
  }, []);

  const detectedEnvironment = useMemo(() => {
    if (typeof window === 'undefined') return 'Production';
    if (isNative) return `Capacitor (${currentNativePlatform.toUpperCase()})`;

    const hostname = window.location.hostname;
    if (
      hostname.includes('localhost') ||
      hostname.includes('dev-wolfpalomar')
    ) {
      return 'Development';
    }
    if (hostname === 'wolfpalomar.vercel.app') {
      return 'Production';
    }
    return hostname.includes('vercel.app') && !hostname.includes('dev-')
      ? 'Production'
      : 'Development';
  }, [isNative, currentNativePlatform]);

  // ─── CHECK FOR APP UPDATES VIA FREE EXTERNAL HOSTING ────────────────────────
  const checkForAppUpdate = useCallback(
    async (isManualTrigger = false) => {
      try {
        setCheckingUpdate(true);
        const targetPlatform = currentNativePlatform === 'ios' ? 'ios' : 'android';
        
        // Fetch from external hosting (GitHub Releases / Custom CDN / Database external URLs)
        const remoteInfo = await fetchLatestRelease(APP_VERSION, targetPlatform);

        if (remoteInfo) {
          setLatestRelease(remoteInfo);
          setHasUpdate(remoteInfo.isNewer);

          if (isManualTrigger) {
            if (remoteInfo.isNewer) {
              toast.info(`New release v${remoteInfo.version} ready for download!`);
            } else {
              toast.success('System is already running the latest build!');
            }
          }
        } else {
          setHasUpdate(false);
          if (isManualTrigger) toast.success('System is up to date.');
        }
      } catch (err: any) {
        console.warn('Update check failed:', err.message);
        if (isManualTrigger) toast.error('Could not verify latest version from hosting service.');
      } finally {
        setCheckingUpdate(false);
      }
    },
    [APP_VERSION, currentNativePlatform]
  );

  // ─── EXECUTE UPDATE DOWNLOAD / LAUNCH ───────────────────────────────────────
  const handlePerformUpdate = () => {
    if (!latestRelease) {
      checkForAppUpdate(true);
      return;
    }
    setDownloadProgress(0);
    setDownloadStatusText('Ready to download update.');
    setIsUpdateModalOpen(true);
  };

  const handleStartUpdateDownload = async () => {
    if (!latestRelease) return;

    try {
      setIsDownloading(true);
      setDownloadProgress(15);
      setDownloadStatusText('Connecting to high-speed external CDN...');

      await executeAppUpdate(latestRelease, (percent, loadedBytes, totalBytes) => {
        setDownloadProgress(percent);
        if (percent < 40) {
          setDownloadStatusText(`Fetching Android APK (${formatBytes(loadedBytes)} / ${formatBytes(totalBytes)})...`);
        } else if (percent < 90) {
          setDownloadStatusText(`Verifying package integrity (${percent}%)...`);
        } else {
          setDownloadStatusText('Handing off to Android system installer...');
        }
      });

      toast.success(
        isNative
          ? 'APK download initiated! Check your Android status bar notifications to install.'
          : 'Update package download initiated.'
      );
    } catch (err: any) {
      console.error('Update download error:', err);
      toast.error('Failed to trigger update download: ' + (err.message || 'Network error'));
    } finally {
      setIsDownloading(false);
    }
  };

  const handleCopyApkLink = () => {
    if (!latestRelease?.downloadUrl) return;
    navigator.clipboard.writeText(latestRelease.downloadUrl);
    setCopiedLink(true);
    toast.success('Direct APK download link copied to clipboard!');
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleOpenHostingSettings = () => {
    const current = getHostingSettings();
    setTempHostingConfig(current);
    setTestHostResult(null);
    setIsHostingModalOpen(true);
  };

  const handleSaveHosting = () => {
    const saved = saveHostingSettings(tempHostingConfig);
    setHostingConfig(saved);
    setIsHostingModalOpen(false);
    toast.success('Hosting provider settings saved!');
    checkForAppUpdate(true);
  };

  const handleTestConnection = async () => {
    setTestingHost(true);
    setTestHostResult(null);
    try {
      if (tempHostingConfig.provider === 'github') {
        const repo = tempHostingConfig.githubRepo.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\/$/, '');
        const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
          headers: { Accept: 'application/vnd.github.v3+json' },
        });
        if (!res.ok) {
          throw new Error(`GitHub responded with HTTP ${res.status}: ${res.statusText}`);
        }
        const data = await res.json();
        const assets = Array.isArray(data.assets) ? data.assets : [];
        const apk = assets.find((a: any) => a.name.toLowerCase().endsWith('.apk')) || assets[0];

        setTestHostResult({
          success: true,
          message: `Connected successfully to GitHub! Found latest release: ${data.tag_name || data.name}`,
          data: {
            tag: data.tag_name,
            assetName: apk?.name || 'No direct .apk asset found yet',
            size: apk ? formatBytes(apk.size) : 'N/A',
            url: apk?.browser_download_url || data.html_url,
          },
        });
      } else {
        // Custom URL test
        if (!tempHostingConfig.customApkUrl) {
          throw new Error('Please enter a valid external APK URL');
        }
        setTestHostResult({
          success: true,
          message: `Direct external CDN configured: ${tempHostingConfig.customApkUrl.slice(0, 60)}...`,
          data: {
            version: tempHostingConfig.customVersion || '0.25.0',
            size: `${tempHostingConfig.customFileSizeMb || 45} MB`,
            url: tempHostingConfig.customApkUrl,
          },
        });
      }
    } catch (err: any) {
      setTestHostResult({
        success: false,
        message: err.message || 'Failed to connect to hosting provider.',
      });
    } finally {
      setTestingHost(false);
    }
  };

  const fetchSystemStats = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const tableKeys = Object.keys(tableDisplayMapping);

      // 1. Direct table live counts (Guaranteed fallback)
      const countQueries = await Promise.allSettled(
        tableKeys.map(async (table) => {
          let query = supabase
            .from(table)
            .select('*', { count: 'exact', head: true });
          if (['members', 'products', 'attendance', 'sales'].includes(table)) {
            query = query.is('deleted_at', null);
          }
          const { count, error: qErr } = await query;
          return {
            table_name: table,
            record_count: qErr ? 0 : (count ?? 0),
            size_bytes: 0,
          };
        })
      );

      const directCountsMap: Record<string, number> = {};
      countQueries.forEach((res, i) => {
        if (res.status === 'fulfilled') {
          directCountsMap[res.value.table_name] = res.value.record_count;
        } else {
          directCountsMap[tableKeys[i]] = 0;
        }
      });

      // 2. Storage RPC Telemetry Queries
      const [dbSizeRpc, storageSizeRpc, tableStatsRpc] =
        await Promise.allSettled([
          supabase.rpc('get_database_size_bytes'),
          supabase.rpc('get_storage_size_bytes'),
          supabase.rpc('get_table_registry_stats'),
        ]);

      if (
        dbSizeRpc.status === 'fulfilled' &&
        !dbSizeRpc.value.error &&
        storageSizeRpc.status === 'fulfilled' &&
        !storageSizeRpc.value.error
      ) {
        setDbSizeBytes(Number(dbSizeRpc.value.data || 0));
        setStorageSizeBytes(Number(storageSizeRpc.value.data || 0));
        setRpcSupported(true);
      } else {
        setRpcSupported(false);
      }

      if (
        tableStatsRpc.status === 'fulfilled' &&
        !tableStatsRpc.value.error &&
        Array.isArray(tableStatsRpc.value.data)
      ) {
        const rpcData = tableStatsRpc.value.data;
        const merged = tableKeys.map((name) => {
          const match = rpcData.find((r: any) => r.table_name === name);
          return {
            table_name: name,
            record_count:
              directCountsMap[name] ?? (match ? Number(match.record_count) : 0),
            size_bytes: match ? Number(match.size_bytes) : 0,
          };
        });
        setDbTables(merged);
      } else {
        setDbTables(
          tableKeys.map((name) => ({
            table_name: name,
            record_count: directCountsMap[name] ?? 0,
            size_bytes: 0,
          }))
        );
      }
    } catch (err: any) {
      console.error('System synchronization exception:', err);
      setError(err.message || 'Error occurred while syncing latest metrics.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSystemStats();
    checkForAppUpdate(false);
  }, [fetchSystemStats, checkForAppUpdate]);

  const displayedMetrics = useMemo<StorageMetric[]>(() => {
    const dbSize = dbSizeBytes ?? 0;
    const storageSize = storageSizeBytes ?? 0;

    // Database Capacity (Standard Supabase Free Tier: 500 MB)
    const dbAllocatedCap = 500 * 1024 * 1024;
    const dbPct = Math.min(
      100,
      parseFloat(((dbSize / dbAllocatedCap) * 100).toFixed(2))
    );

    // File Storage Capacity (Standard Supabase Free Tier: 1 GB)
    const bucketAllocatedCap = 1024 * 1024 * 1024;
    const bucketPct = Math.min(
      100,
      parseFloat(((storageSize / bucketAllocatedCap) * 100).toFixed(2))
    );

    return [
      {
        title: 'DATABASE SIZE',
        value: formatBytes(dbSize),
        limitText: '500 MB',
        subtext: `${dbPct}% of allocated Postgres storage capacity used`,
        progress: Math.max(1, dbPct),
        icon: <Database className="w-5.5 h-5.5" />,
        colorClass:
          'bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 border-emerald-500/20',
        barColorClass: 'bg-emerald-500',
      },
      {
        title: 'FILE & MEDIA STORAGE',
        value: formatBytes(storageSize),
        limitText: '1 GB',
        subtext: `${bucketPct}% of allocated bucket storage used`,
        progress: Math.max(1, bucketPct),
        icon: <Cloud className="w-5.5 h-5.5" />,
        colorClass:
          'bg-blue-500/10 text-blue-500 dark:text-blue-400 border-blue-500/20',
        barColorClass: 'bg-blue-500',
      },
    ];
  }, [dbSizeBytes, storageSizeBytes]);

  const appDetails: AppInfo[] = [
    { label: 'System Version', value: `v${APP_VERSION}` },
    { label: 'Build Number', value: buildNumber },
    { label: 'Environment', value: detectedEnvironment },
  ];

  const recordBreakdownData = useMemo<RecordBreakdownItem[]>(() => {
    if (dbTables.length > 0) {
      return dbTables.map((item, idx) => ({
        id: String(idx + 1),
        tableName: item.table_name,
        recordCount: item.record_count,
        sizeBytes: item.size_bytes,
        purpose:
          tableDisplayMapping[item.table_name]?.purpose ||
          'System database relational directory mapping',
        status: tableDisplayMapping[item.table_name]?.status || 'Active',
      }));
    }

    return Object.keys(tableDisplayMapping).map((name, idx) => ({
      id: String(idx + 1),
      tableName: name,
      recordCount: 0,
      sizeBytes: 0,
      purpose: tableDisplayMapping[name].purpose,
      status: tableDisplayMapping[name].status,
    }));
  }, [dbTables]);

  const columns: Column<RecordBreakdownItem>[] = [
    {
      key: 'tableName',
      header: 'DATABASE REGISTRY',
      sortable: true,
      render: (item) => (
        <div className="flex items-center gap-2.5 py-1">
          <HardDrive className="w-4 h-4 text-slate-400 shrink-0" />
          <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
            {tableDisplayMapping[item.tableName]?.label || item.tableName}
          </span>
        </div>
      ),
    },
    {
      key: 'recordCount',
      header: 'RECORD COUNT',
      sortable: true,
      render: (item) =>
        loading ? (
          <div className="h-5 w-10 bg-slate-200 dark:bg-white/10 rounded-md animate-pulse" />
        ) : (
          <span className="font-mono text-xs text-slate-900 dark:text-white font-bold bg-slate-100 dark:bg-[#1f232d] px-2.5 py-1 rounded-md border border-slate-200/50 dark:border-white/5">
            {item.recordCount}
          </span>
        ),
    },
    {
      key: 'sizeBytes',
      header: 'DISK SIZE',
      sortable: true,
      render: (item) =>
        loading ? (
          <div className="h-4 w-14 bg-slate-200 dark:bg-white/10 rounded-md animate-pulse" />
        ) : (
          <span className="font-mono text-xs text-slate-600 dark:text-slate-400 font-semibold">
            {item.sizeBytes > 0 ? formatBytes(item.sizeBytes) : '—'}
          </span>
        ),
    },
    {
      key: 'purpose',
      header: 'PRIMARY PURPOSE',
      sortable: false,
      render: (item) => (
        <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
          {item.purpose}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'STATUS',
      sortable: true,
      render: (item) => (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-heading font-black tracking-wider uppercase ${
            item.status === 'Active'
              ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
              : item.status === 'Operational'
                ? 'bg-blue-500/10 text-blue-500 border border-blue-500/20'
                : 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              item.status === 'Active'
                ? 'bg-emerald-500'
                : item.status === 'Operational'
                  ? 'bg-blue-500'
                  : 'bg-amber-500'
            }`}
          />
          {item.status}
        </span>
      ),
    },
  ];

  // Primary 4 Telemetry Directory Items
  const registryItems = useMemo(() => {
    const getCount = (name: string) =>
      dbTables.find((t) => t.table_name === name)?.record_count || 0;
    return [
      {
        name: 'Members Directory',
        count: getCount('members'),
        label: 'Enrolled profiles',
        icon: <Users className="w-4 h-4 text-indigo-500" />,
      },
      {
        name: 'Logbook Attendance',
        count: getCount('attendance'),
        label: 'Recorded check-ins',
        icon: <ClipboardList className="w-4 h-4 text-emerald-500" />,
      },
      {
        name: 'Sales Transactions',
        count: getCount('sales'),
        label: 'POS receipts logged',
        icon: <ShoppingBag className="w-4 h-4 text-blue-500" />,
      },
      {
        name: 'Product Catalog',
        count: getCount('products'),
        label: 'Inventory items',
        icon: <Package className="w-4 h-4 text-amber-500" />,
      },
    ];
  }, [dbTables]);

  return (
    <div className="space-y-4 sm:space-y-5 font-body text-slate-800 dark:text-slate-100 p-0 sm:p-1">
      {/* ─── HEADER & CONTROLS ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <span className="text-[10px] font-heading tracking-widest text-[#123c73] dark:text-[#bf0202] uppercase">
            System / Configurations
          </span>
          <h1 className="text-xl sm:text-2xl font-heading tracking-widest uppercase text-slate-900 dark:text-slate-100 mt-0.5">
            System Information
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 max-w-2xl leading-relaxed">
            View application architecture specifications, schema parameters,
            live database record telemetry, and developer contacts.
          </p>
        </div>
        <div className="shrink-0 flex items-center gap-2">
          {!rpcSupported && (
            <button
              type="button"
              onClick={() => setShowSqlGuide(!showSqlGuide)}
              className="text-xs py-1.5 px-3 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800/60 rounded-xl hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-all cursor-pointer font-bold select-none"
            >
              Configure Exact Disk Telemetry
            </button>
          )}
        </div>
      </div>

      {/* ─── TOP-PRIORITY UPDATE STATUS CARD (COMPACT HIGH-DENSITY BANNER) ─── */}
      {hasUpdate && latestRelease ? (
        /* ACTIVE UPDATE DETECTED BANNER - COMPACT HEIGHT */
        <div className="relative overflow-hidden p-3.5 sm:p-4 rounded-2xl bg-gradient-to-r from-blue-600/10 via-indigo-600/10 to-transparent dark:from-red-600/15 dark:via-rose-600/10 dark:to-transparent border border-blue-500/30 dark:border-red-600/30 shadow-md backdrop-blur-xl animate-fade-in">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            {/* Left Info: Meta badges + Version summary */}
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 dark:bg-red-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-600 dark:bg-red-600" />
                </span>
                <span className="px-2 py-0.5 rounded-full bg-blue-600 text-white dark:bg-red-600 font-heading font-black text-[9px] tracking-wider uppercase shadow-xs">
                  UPDATE AVAILABLE • v{latestRelease.version}
                </span>
                <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                  Current: v{APP_VERSION} → New: v{latestRelease.version}
                </span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[10px] font-mono font-bold">
                  {latestRelease.hostingProvider === 'github' ? 'GitHub CDN (Free Forever)' : 'External CDN'}
                </span>
              </div>

              <div className="flex items-center gap-2.5 flex-wrap">
                <h3 className="text-sm sm:text-base font-heading font-black tracking-wider uppercase text-slate-900 dark:text-white">
                  New {isNative ? 'Capacitor Client' : 'Terminal Build'} Ready
                </h3>
                <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                  ({latestRelease.fileName} • {formatBytes(latestRelease.fileSizeBytes)} • Zero Storage Quota Used)
                </span>
              </div>
            </div>

            {/* Right Controls: Guaranteed not to wrap or cut off */}
            <div className="shrink-0 flex items-center gap-2 flex-wrap sm:flex-nowrap">
              <button
                type="button"
                onClick={handlePerformUpdate}
                className="py-2 px-3.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-red-600 dark:to-rose-700 hover:from-blue-700 hover:to-indigo-800 dark:hover:from-red-700 dark:hover:to-rose-800 text-white font-heading font-black text-xs tracking-wider uppercase shadow-md shadow-blue-500/20 dark:shadow-red-600/25 hover:scale-102 active:scale-98 transition-all flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5 animate-bounce" />
                <span>DOWNLOAD &amp; INSTALL</span>
              </button>

              <button
                type="button"
                onClick={handleOpenHostingSettings}
                className="py-2 px-3 rounded-xl bg-white/80 dark:bg-neutral-800/80 hover:bg-white dark:hover:bg-neutral-700 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 font-heading font-bold text-xs tracking-wider uppercase transition-all flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                title="Configure free external hosting source"
              >
                <Settings2 className="w-3.5 h-3.5 text-blue-500 dark:text-red-400" />
                <span>HOSTING</span>
              </button>

              <button
                type="button"
                onClick={() => checkForAppUpdate(true)}
                disabled={checkingUpdate}
                className="py-2 px-3 rounded-xl bg-white/80 dark:bg-neutral-800/80 hover:bg-white dark:hover:bg-neutral-700 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 font-heading font-bold text-xs tracking-wider uppercase transition-all flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap disabled:opacity-50"
                title="Re-check for available releases"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${checkingUpdate ? 'animate-spin' : ''}`}
                />
                <span>CHECK</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* SYSTEM UP TO DATE CARD (CLEAN VERIFIED STATUS - COMPACT) */
        <div className="p-3.5 sm:p-4 rounded-2xl bg-white dark:bg-[#161920] border border-slate-200/90 dark:border-white/5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-heading font-black text-xs uppercase tracking-wider text-slate-900 dark:text-white">
                  SYSTEM UP TO DATE
                </h3>
                <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-[10px] font-mono font-bold uppercase tracking-wider">
                  v{APP_VERSION} STABLE
                </span>
                {isNative && (
                  <span className="px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 text-[10px] font-mono font-bold uppercase tracking-wider">
                    {currentNativePlatform.toUpperCase()} CLIENT
                  </span>
                )}
                <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-white/10 text-[10px] font-mono font-semibold">
                  HOST: {hostingConfig.provider === 'github' ? 'GITHUB RELEASES (FREE FOREVER)' : 'EXTERNAL CDN'}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 font-medium">
                Running latest build. Updates delivered directly via free external CDN with zero Supabase storage usage.
              </p>
            </div>
          </div>

          <div className="shrink-0 flex items-center gap-2">
            <button
              type="button"
              onClick={handleOpenHostingSettings}
              className="py-1.5 px-2.5 rounded-lg bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 font-heading font-bold text-[11px] tracking-wider uppercase transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Settings2 className="w-3 h-3" />
              <span>HOSTING</span>
            </button>
            <button
              type="button"
              onClick={() => checkForAppUpdate(true)}
              disabled={checkingUpdate}
              className="py-1.5 px-2.5 rounded-lg bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 font-heading font-bold text-[11px] tracking-wider uppercase transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw
                className={`w-3 h-3 ${checkingUpdate ? 'animate-spin' : ''}`}
              />
              <span>CHECK</span>
            </button>
          </div>
        </div>
      )}

      {/* SQL Deployment Helper Guide */}
      {showSqlGuide && !rpcSupported && (
        <div className="p-5 bg-blue-500/5 border border-blue-500/20 rounded-2xl space-y-3 text-left animate-fade-in">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-heading font-black text-xs uppercase tracking-wider text-slate-900 dark:text-slate-100">
                LINK EXACT STORAGE &amp; DISK TELEMETRY FROM SUPABASE
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                By default, security rules prevent web clients from inspecting
                Postgres storage size directly. To link catalog disk sizing,
                execute these SQL helper functions inside your{' '}
                <strong>Supabase SQL Editor</strong>:
              </p>
            </div>
          </div>
          <pre className="p-3 bg-slate-100 dark:bg-black/40 rounded-xl text-[10px] font-mono text-slate-700 dark:text-slate-300 overflow-x-auto border border-slate-200/50 dark:border-white/5 leading-relaxed">
            {`CREATE OR REPLACE FUNCTION public.get_database_size_bytes()
RETURNS bigint AS $$
  SELECT pg_database_size(current_database());
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.get_storage_size_bytes()
RETURNS bigint AS $$
  SELECT COALESCE(SUM((metadata->>'size')::bigint), 0)
  FROM storage.objects;
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.get_table_registry_stats()
RETURNS TABLE(table_name text, record_count bigint, size_bytes bigint) AS $$
DECLARE
  t_name text;
  r_count bigint;
  s_bytes bigint;
BEGIN
  FOR t_name IN 
    VALUES ('members', 'attendance', 'sales', 'products', 'subscriptions', 'receipts', 'audit_logs', 'rates_config', 'gym_profile', 'incident_reports', 'database_backups', 'profiles')
  LOOP
    BEGIN
      EXECUTE format('SELECT count(*) FROM %I WHERE deleted_at IS NULL', t_name) INTO r_count;
    EXCEPTION WHEN OTHERS THEN
      EXECUTE format('SELECT count(*) FROM %I', t_name) INTO r_count;
    END;
    s_bytes := pg_total_relation_size(quote_ident(t_name));
    table_name := t_name;
    record_count := r_count;
    size_bytes := s_bytes;
    RETURN NEXT;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;`}
          </pre>
          <div className="flex justify-end">
            <Button
              onClick={() => setShowSqlGuide(false)}
              className="text-xs py-1 px-3 bg-slate-200 hover:bg-slate-300 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-slate-700 dark:text-slate-200 font-bold rounded-lg cursor-pointer"
            >
              Dismiss Instructions
            </Button>
          </div>
        </div>
      )}

      {error && (
        <div className="p-3.5 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-500 font-semibold">
          ⚠️ {error}
        </div>
      )}

      {/* SECTION 1: Storage Capacity Displays (Clean 2-Column Grid) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {displayedMetrics.map((metric, idx) => (
          <div
            key={idx}
            className="p-4 sm:p-4.5 bg-white dark:bg-[#161920] border border-slate-200 dark:border-white/5 rounded-2xl space-y-3 shadow-xs"
          >
            <div className="flex items-center justify-between">
              <div
                className={`p-2 rounded-xl border shrink-0 ${metric.colorClass}`}
              >
                {metric.icon}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white font-mono">
                  {loading ? (
                    <span className="inline-block h-5 w-20 bg-slate-200 dark:bg-white/10 rounded animate-pulse" />
                  ) : (
                    <>
                      {metric.value}
                      {metric.limitText && (
                        <span className="text-xs text-slate-400 font-bold font-sans">
                          {' '}
                          / {metric.limitText}
                        </span>
                      )}
                    </>
                  )}
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                {metric.title}
              </span>
              <div className="w-full h-1.5 bg-slate-100 dark:bg-neutral-800 rounded-full overflow-hidden p-px shadow-inner relative">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${metric.barColorClass} ${loading ? 'animate-pulse' : ''}`}
                  style={{ width: loading ? '10%' : `${metric.progress}%` }}
                />
              </div>
              <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 block mt-0.5">
                {loading
                  ? 'Refreshing database capacity telemetry...'
                  : metric.subtext}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* SECTION 2: Build Metadata & Core Directory Telemetry */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left Card: Build Metadata */}
        <div className="lg:col-span-5 p-4 sm:p-5 bg-white dark:bg-[#161920] border border-slate-200 dark:border-white/5 rounded-2xl space-y-3 shadow-xs flex flex-col justify-between">
          <div className="flex items-center gap-2.5 pb-2 border-b border-slate-100 dark:border-white/5">
            <Cpu className="w-5 h-5 text-blue-500" />
            <h3 className="font-heading text-xs font-black uppercase tracking-wider text-slate-900 dark:text-slate-100">
              BUILD METADATA
            </h3>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-white/5">
            {appDetails.map((detail, idx) => (
              <div
                key={idx}
                className="flex justify-between py-2 text-xs font-semibold"
              >
                <span className="text-slate-500 dark:text-slate-400">
                  {detail.label}
                </span>
                <span className="font-mono text-slate-900 dark:text-white">
                  {detail.value}
                </span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 pt-2 text-[10px] text-slate-400 dark:text-slate-500 font-medium border-t border-slate-100 dark:border-white/5">
            <Layers className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            <span>
              Row Level Security (RLS) policies are active across all tables.
            </span>
          </div>
        </div>

        {/* Right Card: Dynamic Core Directory Telemetry */}
        <div className="lg:col-span-7 p-4 sm:p-5 bg-white dark:bg-[#161920] border border-slate-200 dark:border-white/5 rounded-2xl space-y-3 shadow-xs">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-white/5">
            <div className="flex items-center gap-2.5">
              <Database className="w-5 h-5 text-amber-500" />
              <h3 className="font-heading text-xs font-black uppercase tracking-wider text-slate-900 dark:text-slate-100">
                CORE SYSTEM REGISTRY
              </h3>
            </div>
            <span className="text-[9px] font-heading font-black tracking-widest px-2 py-0.5 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded-md">
              LIVE DATA
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {registryItems.map((metric, idx) => (
              <div
                key={idx}
                className="p-2.5 bg-slate-50/50 dark:bg-black/20 border border-slate-200/40 dark:border-white/5 rounded-xl flex items-center justify-between gap-2.5 text-xs"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="p-1.5 rounded-lg border bg-slate-100 dark:bg-neutral-900 border-slate-200 dark:border-white/5">
                    {metric.icon}
                  </div>
                  <div className="truncate">
                    <p className="font-bold text-slate-800 dark:text-slate-200 text-xs">
                      {metric.name}
                    </p>
                    <p className="text-[9px] text-slate-400 dark:text-slate-500 font-semibold font-mono">
                      {metric.label}
                    </p>
                  </div>
                </div>
                <span className="px-2 py-0.5 bg-slate-100 dark:bg-neutral-900 text-xs font-mono text-slate-700 dark:text-slate-300 border border-slate-200/50 dark:border-white/5 rounded-md font-bold">
                  {loading ? (
                    <span className="inline-block h-3.5 w-6 bg-slate-200 dark:bg-white/10 rounded animate-pulse" />
                  ) : (
                    metric.count
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* SECTION 3: Detailed Storage Breakdown Table */}
      <div className="p-1 rounded-2xl border border-slate-200 dark:border-white/5 bg-white dark:bg-[#161920] overflow-x-auto w-full shadow-xs">
        <Table<RecordBreakdownItem>
          data={recordBreakdownData}
          columns={columns}
          itemsPerPage={8}
          loading={false}
        />
      </div>

      {/* SECTION 4: Legal & Policy Documents + Developer Information */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
        {/* Terms of Service */}
        <div
          onClick={() => setActiveModal('terms')}
          className="p-3.5 sm:p-4 bg-white dark:bg-[#161920] border border-slate-200 dark:border-white/5 rounded-2xl flex items-center justify-between gap-3 cursor-pointer hover:border-blue-500 dark:hover:border-red-500 transition-all duration-300 group shadow-xs"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/10 text-blue-500 border border-blue-500/20 rounded-xl">
              <Scale className="w-5 h-5" />
            </div>
            <div className="text-left">
              <p className="text-xs font-bold text-slate-800 dark:text-slate-200 group-hover:text-blue-500 dark:group-hover:text-red-500 transition-colors">
                Terms of Service
              </p>
              <p className="text-[9px] text-slate-400 font-semibold mt-0.5">
                Rules, payments, and liability
              </p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-1 transition-transform" />
        </div>

        {/* Privacy Policy */}
        <div
          onClick={() => setActiveModal('privacy')}
          className="p-3.5 sm:p-4 bg-white dark:bg-[#161920] border border-slate-200 dark:border-white/5 rounded-2xl flex items-center justify-between gap-3 cursor-pointer hover:border-emerald-500 dark:hover:border-red-500 transition-all duration-300 group shadow-xs"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded-xl">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div className="text-left">
              <p className="text-xs font-bold text-slate-800 dark:text-slate-200 group-hover:text-emerald-500 dark:group-hover:text-red-500 transition-colors">
                Privacy Policy
              </p>
              <p className="text-[9px] text-slate-400 font-semibold mt-0.5">
                RA 10173 compliance
              </p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-1 transition-transform" />
        </div>

        {/* About Developer */}
        <div
          onClick={() => setActiveModal('developer')}
          className="p-3.5 sm:p-4 bg-white dark:bg-[#161920] border border-slate-200 dark:border-white/5 rounded-2xl flex items-center justify-between gap-3 cursor-pointer hover:border-amber-500 dark:hover:border-red-500 transition-all duration-300 group shadow-xs"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/10 text-amber-500 border border-amber-500/20 rounded-xl">
              <Code2 className="w-5 h-5" />
            </div>
            <div className="text-left">
              <p className="text-xs font-bold text-slate-800 dark:text-slate-200 group-hover:text-amber-500 transition-colors">
                About Developer
              </p>
              <p className="text-[9px] text-slate-400 font-semibold mt-0.5">
                Adrian R. Angeles • 09762607481
              </p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-1 transition-transform" />
        </div>
      </div>

      {/* SECTION 5: Branding Footer Banner */}
      <div className="flex items-start gap-3.5 p-4 bg-slate-50 dark:bg-neutral-900/30 border border-slate-200 dark:border-white/5 rounded-2xl text-xs leading-normal max-w-full text-left">
        <Info className="w-4.5 h-4.5 shrink-0 mt-0.5 text-blue-500" />
        <div className="space-y-1 flex-1 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-heading tracking-wider uppercase text-slate-900 dark:text-white text-xs">
              Wolf Palomar Fitness Gym Muaythai Boxing Management System
            </p>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 bg-emerald-500/10 text-[9px] text-emerald-500 dark:text-emerald-400 border border-emerald-500/20 rounded font-bold tracking-wider uppercase">
                v{APP_VERSION}
              </span>
              <span className="px-2 py-0.5 bg-blue-500/10 text-[9px] text-blue-500 border border-blue-500/20 rounded font-bold tracking-wider uppercase">
                Active Client
              </span>
            </div>
          </div>

          <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 opacity-90 leading-relaxed">
            Custom engineered for Wolf Palomar Fitness Gym. Designed with
            high-density cashier registers, QR badge verification, offline
            resilience, and encrypted audit histories.
          </p>
        </div>
      </div>

      {/* ─── MODALS: Terms of Service ─── */}
      <Modal
        isOpen={activeModal === 'terms'}
        onClose={() => setActiveModal(null)}
        title="Terms of Service"
        className="max-w-2xl text-left p-6 sm:p-8"
      >
        <div className="space-y-4 text-xs font-semibold text-slate-600 dark:text-slate-300 overflow-y-auto max-h-[65vh] pr-2 leading-relaxed">
          <div className="flex gap-3 p-3.5 rounded-2xl bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20">
            <Scale className="w-5 h-5 shrink-0 text-blue-600 dark:text-blue-400" />
            <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-200">
              These rules keep Wolf Palomar Gym safe, fair, and welcoming. They
              apply to every member, guest, coach, staff member, and parent or
              guardian agreeing for a minor.
            </p>
          </div>

          <div className="flex gap-2.5 rounded-2xl border border-amber-300/70 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 p-3.5 text-xs leading-relaxed text-amber-900 dark:text-amber-100">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
            <p>
              <strong>Important:</strong> Membership payments are non-refundable
              after payment, except where Philippine law requires a refund.
              Please verify your selected plan, duration, and total before
              paying.
            </p>
          </div>

          <div className="space-y-1.5 border-l-2 border-blue-500 pl-3.5">
            <h4 className="font-heading text-xs uppercase tracking-wider text-slate-900 dark:text-white">
              1. Safe and Respectful Gym Use
            </h4>
            <p>
              Use equipment only as intended and within your ability. Return
              weights, boxing gear, attachments, and benches to their designated
              rack after use. Follow staff instructions and safety procedures at
              all times.
            </p>
          </div>

          <div className="space-y-1.5 border-l-2 border-blue-500 pl-3.5">
            <h4 className="font-heading text-xs uppercase tracking-wider text-slate-900 dark:text-white">
              2. Damage, Theft, and Prohibited Conduct
            </h4>
            <p>
              Do not steal, misuse, or remove gym property. Violence,
              harassment, verbal abuse, or unpermitted recordings are strictly
              prohibited. Individuals are held liable for willful damage,
              resulting in immediate termination and referral to authorities.
            </p>
          </div>

          <div className="space-y-1.5 border-l-2 border-blue-500 pl-3.5">
            <h4 className="font-heading text-xs uppercase tracking-wider text-slate-900 dark:text-white">
              3. Payments, Subscriptions, and Consumer Rights
            </h4>
            <p>
              Memberships are personal and non-transferable without management
              approval. All payments are final in accordance with the Consumer
              Act of the Philippines (RA 7394) and the Electronic Commerce Act
              (RA 8792).
            </p>
          </div>

          <div className="space-y-1.5 border-l-2 border-blue-500 pl-3.5">
            <h4 className="font-heading text-xs uppercase tracking-wider text-slate-900 dark:text-white">
              4. Health, Injury, and Emergency Procedures
            </h4>
            <p>
              Exercise carries physical risk. Notify staff immediately if you
              experience dizziness, shortness of breath, or sharp pain.
              Emergency contacts on file will be contacted in urgent safety
              situations.
            </p>
          </div>

          <div className="space-y-1.5 border-l-2 border-blue-500 pl-3.5">
            <h4 className="font-heading text-xs uppercase tracking-wider text-slate-900 dark:text-white">
              5. Minors and Legal Guardian Consent
            </h4>
            <p>
              Athletes below 18 require parental or legal guardian consent. The
              guardian acknowledges responsibility for the minor's adherence to
              facility guidelines.
            </p>
          </div>

          <div className="space-y-1.5 border-l-2 border-blue-500 pl-3.5">
            <h4 className="font-heading text-xs uppercase tracking-wider text-slate-900 dark:text-white">
              6. Facility Safety Compliance
            </h4>
            <p>
              Wolf Palomar Gym actively enforces the Safe Spaces Act (RA 11313)
              and occupational health and safety regulations (RA 11058).
            </p>
          </div>
        </div>
        <div className="flex justify-end pt-4 border-t border-slate-100 dark:border-white/5">
          <Button
            onClick={() => setActiveModal(null)}
            className="bg-[#123c73] dark:bg-[#bf0202] text-white cursor-pointer px-4 font-heading text-xs tracking-wider"
          >
            Close Document
          </Button>
        </div>
      </Modal>

      {/* ─── MODALS: Privacy Policy ─── */}
      <Modal
        isOpen={activeModal === 'privacy'}
        onClose={() => setActiveModal(null)}
        title="Privacy Policy"
        className="max-w-2xl text-left p-6 sm:p-8"
      >
        <div className="space-y-4 text-xs font-semibold text-slate-600 dark:text-slate-300 overflow-y-auto max-h-[65vh] pr-2 leading-relaxed">
          <div className="flex gap-3 p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20">
            <ShieldCheck className="w-5 h-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-200">
              We collect and process only the information reasonably required to
              register gym members, manage subscriptions, secure the facility,
              and verify attendance.
            </p>
          </div>

          <div className="flex gap-2.5 rounded-2xl border border-emerald-300/70 dark:border-emerald-500/30 bg-emerald-50/70 dark:bg-emerald-500/10 p-3.5 text-xs leading-relaxed text-emerald-900 dark:text-emerald-100">
            <Info className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
            <p>
              <strong>Data Privacy Act of 2012 (RA 10173):</strong> You retain
              full rights over your personal data including access,
              rectification, objection, and erasure subject to legal limits.
            </p>
          </div>

          <div className="space-y-1.5 border-l-2 border-emerald-500 pl-3.5">
            <h4 className="font-heading text-xs uppercase tracking-wider text-slate-900 dark:text-white">
              1. Personal Information Collected
            </h4>
            <p>
              Records include member full name, phone number, email, date of
              birth, emergency contact, subscription term, QR identifier,
              check-in history, and payment reference numbers.
            </p>
          </div>

          <div className="space-y-1.5 border-l-2 border-emerald-500 pl-3.5">
            <h4 className="font-heading text-xs uppercase tracking-wider text-slate-900 dark:text-white">
              2. Purpose of Data Processing
            </h4>
            <p>
              Data is used exclusively to facilitate access control, generate
              receipts, renew subscriptions, monitor safety incidents, and
              verify payment proof. Personal information is never sold or
              rented.
            </p>
          </div>

          <div className="space-y-1.5 border-l-2 border-emerald-500 pl-3.5">
            <h4 className="font-heading text-xs uppercase tracking-wider text-slate-900 dark:text-white">
              3. Security Safeguards &amp; Encryption
            </h4>
            <p>
              Database entries are secured through Row Level Security (RLS)
              policies, restricting access solely to authenticated
              administrators and staff coaches.
            </p>
          </div>

          <div className="space-y-1.5 border-l-2 border-emerald-500 pl-3.5">
            <h4 className="font-heading text-xs uppercase tracking-wider text-slate-900 dark:text-white">
              4. Data Retention &amp; Privacy Inquiries
            </h4>
            <p>
              Records are retained only for active membership lifecycle, tax
              logging, and safety compliance. For inquiries, contact the gym
              management or the National Privacy Commission (NPC).
            </p>
          </div>
        </div>
        <div className="flex justify-end pt-4 border-t border-slate-100 dark:border-white/5">
          <Button
            onClick={() => setActiveModal(null)}
            className="bg-[#123c73] dark:bg-[#bf0202] text-white cursor-pointer px-4 font-heading text-xs tracking-wider"
          >
            Close Document
          </Button>
        </div>
      </Modal>

      {/* ─── MODALS: About Developer ─── */}
      <Modal
        isOpen={activeModal === 'developer'}
        onClose={() => setActiveModal(null)}
        title="About the Developer"
        className="max-w-xl text-left p-6 sm:p-8"
      >
        <div className="space-y-5 text-xs text-slate-600 dark:text-slate-300">
          <div className="p-5 bg-slate-50 dark:bg-[#1f232d] border border-slate-200 dark:border-white/5 rounded-3xl space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#123c73] to-blue-700 dark:from-[#bf0202] dark:to-red-700 text-white font-heading font-black text-xl flex items-center justify-center shadow-md">
                AA
              </div>
              <div className="space-y-0.5">
                <h3 className="font-heading font-black text-base text-slate-900 dark:text-white uppercase tracking-wider">
                  Adrian R. Angeles
                </h3>
                <p className="text-xs font-bold text-blue-600 dark:text-red-400">
                  Lead Software Developer &amp; System Architect
                </p>
                <span className="inline-block text-[10px] font-mono font-semibold text-slate-400">
                  Wolf Palomar Management Core
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed border-t border-slate-200 dark:border-white/5 pt-3">
              Designed and engineered the central management terminal for{' '}
              <strong>Wolf Palomar Fitness Gym Muaythai Boxing</strong>.
            </p>
          </div>

          <div className="space-y-2.5">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              DIRECT DEVELOPER SUPPORT &amp; INQUIRIES
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <a
                href="tel:09762607481"
                className="p-3 bg-blue-500/10 hover:bg-blue-500/15 border border-blue-500/25 rounded-2xl flex items-center gap-3 transition-colors group cursor-pointer text-blue-600 dark:text-blue-400"
              >
                <div className="p-2 rounded-xl bg-blue-500 text-white shadow-xs shrink-0">
                  <Phone className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="font-heading font-bold text-[10px] uppercase tracking-wider leading-none">
                    Phone / Mobile
                  </p>
                  <p className="font-mono text-xs font-bold mt-1 text-slate-900 dark:text-white">
                    09762607481
                  </p>
                </div>
              </a>

              <a
                href="mailto:adrianangeles2213@gmail.com"
                className="p-3 bg-emerald-500/10 hover:bg-emerald-500/15 border border-emerald-500/25 rounded-2xl flex items-center gap-3 transition-colors group cursor-pointer text-emerald-600 dark:text-emerald-400"
              >
                <div className="p-2 rounded-xl bg-emerald-500 text-white shadow-xs shrink-0">
                  <Mail className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="font-heading font-bold text-[10px] uppercase tracking-wider leading-none">
                    Email Address
                  </p>
                  <p className="font-mono text-xs font-bold mt-1 text-slate-900 dark:text-white truncate">
                    adrianangeles2213@gmail.com
                  </p>
                </div>
              </a>

              <a
                href="https://facebook.com/WukwukTwo"
                target="_blank"
                rel="noopener noreferrer"
                className="p-3 bg-indigo-500/10 hover:bg-indigo-500/15 border border-indigo-500/25 rounded-2xl flex items-center gap-3 transition-colors group cursor-pointer text-indigo-600 dark:text-indigo-400 sm:col-span-2"
              >
                <div className="p-2 rounded-xl bg-indigo-600 text-white shadow-xs shrink-0 flex items-center justify-center">
                  <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1 flex items-center justify-between">
                  <div>
                    <p className="font-heading font-bold text-[10px] uppercase tracking-wider leading-none">
                      Facebook Profile
                    </p>
                    <p className="text-xs font-semibold mt-1 text-slate-900 dark:text-white">
                      Adrian R. Angeles
                    </p>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-500 transition-colors" />
                </div>
              </a>
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-4 mt-5 border-t border-slate-100 dark:border-white/5">
          <Button
            onClick={() => setActiveModal(null)}
            className="bg-[#123c73] dark:bg-[#bf0202] text-white cursor-pointer px-4 font-heading text-xs tracking-wider"
          >
            Close Dialog
          </Button>
        </div>
      </Modal>

      {/* ─── NATIVE APP UPDATE EXECUTION MODAL ─── */}
      <Modal
        isOpen={isUpdateModalOpen && !!latestRelease}
        onClose={() => {
          if (!isDownloading) setIsUpdateModalOpen(false);
        }}
        title="Download & Install Application Update"
      >
        {latestRelease && (
          <div className="space-y-5 text-left text-slate-900 dark:text-slate-100 py-1">
            {/* Version & Hosting Badge */}
            <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-transparent dark:from-red-600/15 dark:via-rose-600/10 dark:to-transparent border border-blue-500/20 dark:border-red-600/30">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-slate-500 dark:text-slate-400">
                    v{APP_VERSION}
                  </span>
                  <span className="text-xs font-bold text-blue-600 dark:text-red-400">
                    →
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full bg-blue-600 text-white dark:bg-red-600 text-xs font-heading font-black tracking-wider uppercase">
                    v{latestRelease.version}
                  </span>
                </div>

                <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-[10px] font-mono font-bold">
                  {latestRelease.hostingProvider === 'github'
                    ? 'Hosted on GitHub Releases CDN (Free Forever)'
                    : 'External CDN Hosting'}
                </span>
              </div>

              <div className="mt-3 flex items-center gap-4 text-xs font-mono text-slate-600 dark:text-slate-300">
                <span>File: {latestRelease.fileName}</span>
                {latestRelease.fileSizeBytes > 0 && (
                  <span>Size: {formatBytes(latestRelease.fileSizeBytes)}</span>
                )}
                <span>Platform: {latestRelease.platform.toUpperCase()}</span>
              </div>
            </div>

            {/* Release Notes */}
            <div className="space-y-2">
              <span className="text-xs font-heading font-black uppercase tracking-wider text-slate-400">
                WHAT'S NEW IN THIS RELEASE:
              </span>
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#0c0e12] border border-slate-200 dark:border-white/10 text-xs text-slate-700 dark:text-slate-300 leading-relaxed max-h-40 overflow-y-auto whitespace-pre-wrap font-medium">
                {latestRelease.releaseNotes ||
                  '• High-speed Capacitor performance optimizations\n• POS Sales & Recycle Bin persistence updates\n• Direct offline-first check-in telemetry\n• Android 14/15 package compatibility patches'}
              </div>
            </div>

            {/* Android Native Installation Steps */}
            <div className="p-4 rounded-2xl bg-blue-500/5 dark:bg-red-950/20 border border-blue-500/20 dark:border-red-900/30 space-y-2 text-xs">
              <div className="flex items-center gap-2 font-heading font-black uppercase tracking-wider text-blue-600 dark:text-red-400">
                <Info className="w-4 h-4 shrink-0" />
                <span>HOW INSTALLATION WORKS ON ANDROID:</span>
              </div>
              <ol className="list-decimal list-inside space-y-1 text-slate-600 dark:text-slate-300">
                <li>Tap <strong>Start Download &amp; Install</strong> below.</li>
                <li>Your Android device downloads the package via Android Download Manager.</li>
                <li>Swipe down your status bar notifications and tap the finished file to install.</li>
                <li>All gym database logs, POS transactions, and settings remain completely intact.</li>
              </ol>
            </div>

            {/* Download Progress Bar (When Active) */}
            {isDownloading && (
              <div className="space-y-2 p-4 rounded-2xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 animate-fade-in">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-slate-600 dark:text-slate-300 flex items-center gap-2">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600 dark:text-red-500" />
                    {downloadStatusText || 'Downloading...'}
                  </span>
                  <span className="font-bold text-blue-600 dark:text-red-500">
                    {downloadProgress}%
                  </span>
                </div>
                <div className="w-full h-2.5 rounded-full bg-slate-200 dark:bg-neutral-700 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-red-600 dark:to-rose-600 transition-all duration-300 rounded-full"
                    style={{ width: `${downloadProgress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-white/5">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyApkLink}
                  className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-white/10 text-xs font-heading font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer"
                >
                  {copiedLink ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Direct Link</span>
                    </>
                  )}
                </button>

                <a
                  href={latestRelease.downloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-white/10 text-xs font-heading font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open URL</span>
                </a>
              </div>

              <div className="flex items-center gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setIsUpdateModalOpen(false)}
                  disabled={isDownloading}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 text-xs font-heading uppercase tracking-wider cursor-pointer disabled:opacity-50"
                >
                  Dismiss
                </button>

                <button
                  type="button"
                  onClick={handleStartUpdateDownload}
                  disabled={isDownloading}
                  className="py-2.5 px-5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-red-600 dark:to-rose-700 text-white text-xs font-heading font-black tracking-wider uppercase shadow-lg shadow-blue-500/25 dark:shadow-red-600/30 hover:scale-105 active:scale-98 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <Download className={`w-4 h-4 ${isDownloading ? 'animate-bounce' : ''}`} />
                  <span>{isDownloading ? 'DOWNLOADING...' : 'START DOWNLOAD & INSTALL'}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* ─── FREE FOREVER HOSTING CONFIGURATION MODAL ─── */}
      <Modal
        isOpen={isHostingModalOpen}
        onClose={() => setIsHostingModalOpen(false)}
        title="App Update Hosting & CDN Configuration"
      >
        <div className="space-y-5 text-left text-slate-900 dark:text-slate-100 py-1">
          {/* Explanation Banner */}
          <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 flex items-start gap-3 text-xs">
            <Sparkles className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="font-heading font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                100% FREE FOREVER HOSTING (ZERO SUPABASE STORAGE)
              </h4>
              <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                We distribute APK releases via free external hosting providers. With GitHub Releases, you get up to <strong>2.0 GB per APK</strong>, unlimited downloads worldwide, and 0 cents cost forever.
              </p>
            </div>
          </div>

          {/* Provider Selection */}
          <div className="space-y-2">
            <span className="text-xs font-heading font-black uppercase tracking-wider text-slate-400">
              CHOOSE EXTERNAL HOSTING SERVICE:
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() =>
                  setTempHostingConfig({ ...tempHostingConfig, provider: 'github' })
                }
                className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
                  tempHostingConfig.provider === 'github'
                    ? 'bg-blue-500/10 dark:bg-red-600/10 border-blue-500 dark:border-red-600 shadow-md ring-2 ring-blue-500/30'
                    : 'bg-white dark:bg-white/5 border-slate-200 dark:border-white/10 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-heading font-black text-xs uppercase tracking-wider text-slate-900 dark:text-white">
                    GitHub Releases
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-mono text-[9px] font-bold uppercase">
                    RECOMMENDED
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-normal">
                  2GB per APK limit • Free forever • Fast global CDN • Automated releases
                </p>
              </button>

              <button
                type="button"
                onClick={() =>
                  setTempHostingConfig({ ...tempHostingConfig, provider: 'custom' })
                }
                className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
                  tempHostingConfig.provider === 'custom'
                    ? 'bg-blue-500/10 dark:bg-red-600/10 border-blue-500 dark:border-red-600 shadow-md ring-2 ring-blue-500/30'
                    : 'bg-white dark:bg-white/5 border-slate-200 dark:border-white/10 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-heading font-black text-xs uppercase tracking-wider text-slate-900 dark:text-white">
                    Custom CDN / Direct URL
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400 font-mono text-[9px] font-bold uppercase">
                    FREE UP TO 500MB
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-normal">
                  Direct HTTPS file URL from any static host or personal file server
                </p>
              </button>
            </div>
          </div>

          {/* Configuration Inputs */}
          {tempHostingConfig.provider === 'github' ? (
            <div className="space-y-3 p-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10">
              <label className="block text-xs font-heading font-black uppercase tracking-wider text-slate-600 dark:text-slate-300">
                GitHub Repository (owner/repo):
              </label>
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-slate-400 shrink-0" />
                <input
                  type="text"
                  value={tempHostingConfig.githubRepo}
                  onChange={(e) =>
                    setTempHostingConfig({
                      ...tempHostingConfig,
                      githubRepo: e.target.value,
                    })
                  }
                  placeholder="adrianangeles2212/palomar-gym"
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-neutral-900 border border-slate-200 dark:border-white/10 text-xs font-mono text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-normal">
                Format: <code className="font-mono text-blue-600 dark:text-red-400">username/repository-name</code>. The app calls GitHub's public releases API without requiring any secret tokens.
              </p>
            </div>
          ) : (
            <div className="space-y-3 p-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10">
              <label className="block text-xs font-heading font-black uppercase tracking-wider text-slate-600 dark:text-slate-300">
                Direct External APK Download URL:
              </label>
              <input
                type="url"
                value={tempHostingConfig.customApkUrl}
                onChange={(e) =>
                  setTempHostingConfig({
                    ...tempHostingConfig,
                    customApkUrl: e.target.value,
                  })
                }
                placeholder="https://my-cdn.com/releases/WolfPalomar-v0.25.0.apk"
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-neutral-900 border border-slate-200 dark:border-white/10 text-xs font-mono text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              />

              <div className="grid grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="block text-[11px] font-heading font-bold uppercase tracking-wider text-slate-500 mb-1">
                    Release Version
                  </label>
                  <input
                    type="text"
                    value={tempHostingConfig.customVersion}
                    onChange={(e) =>
                      setTempHostingConfig({
                        ...tempHostingConfig,
                        customVersion: e.target.value,
                      })
                    }
                    placeholder="0.25.0"
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-neutral-900 border border-slate-200 dark:border-white/10 text-xs font-mono text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-heading font-bold uppercase tracking-wider text-slate-500 mb-1">
                    Approx Size (MB)
                  </label>
                  <input
                    type="number"
                    value={tempHostingConfig.customFileSizeMb}
                    onChange={(e) =>
                      setTempHostingConfig({
                        ...tempHostingConfig,
                        customFileSizeMb: parseFloat(e.target.value) || 0,
                      })
                    }
                    placeholder="45"
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-neutral-900 border border-slate-200 dark:border-white/10 text-xs font-mono text-slate-900 dark:text-white"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Test Connection Button & Result */}
          <div className="flex items-center justify-between gap-3 pt-1">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={testingHost}
              className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-white/10 text-xs font-heading font-bold uppercase tracking-wider flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${testingHost ? 'animate-spin' : ''}`} />
              <span>{testingHost ? 'Testing Host...' : 'Test Connection'}</span>
            </button>

            <button
              type="button"
              onClick={() => setIsGuideModalOpen(true)}
              className="text-xs font-heading font-bold text-blue-600 dark:text-red-400 hover:underline flex items-center gap-1 cursor-pointer"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>Step-by-Step Publishing Guide</span>
            </button>
          </div>

          {testHostResult && (
            <div
              className={`p-3.5 rounded-xl border text-xs space-y-1.5 animate-fade-in ${
                testHostResult.success
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300'
                  : 'bg-red-500/10 border-red-500/30 text-red-800 dark:text-red-300'
              }`}
            >
              <p className="font-bold flex items-center gap-1.5">
                {testHostResult.success ? (
                  <Check className="w-4 h-4 text-emerald-500" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-red-500" />
                )}
                <span>{testHostResult.message}</span>
              </p>
              {testHostResult.data && (
                <div className="font-mono text-[11px] opacity-90 pl-5 space-y-0.5">
                  {testHostResult.data.tag && <div>Tag: {testHostResult.data.tag}</div>}
                  {testHostResult.data.assetName && <div>Asset: {testHostResult.data.assetName}</div>}
                  {testHostResult.data.size && <div>Size: {testHostResult.data.size}</div>}
                  {testHostResult.data.url && (
                    <div className="truncate text-[10px] opacity-75">
                      URL: {testHostResult.data.url}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Footer Actions */}
          <div className="flex justify-end gap-3 pt-3 border-t border-slate-100 dark:border-white/5">
            <button
              type="button"
              onClick={() => setIsHostingModalOpen(false)}
              className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 text-xs font-heading uppercase tracking-wider cursor-pointer"
            >
              Cancel
            </button>
            <Button
              onClick={handleSaveHosting}
              className="bg-[#123c73] dark:bg-[#bf0202] text-white cursor-pointer px-5 font-heading text-xs uppercase tracking-wider"
            >
              Save &amp; Check Updates
            </Button>
          </div>
        </div>
      </Modal>

      {/* ─── FREE FOREVER HOSTING GUIDE MODAL ─── */}
      <Modal
        isOpen={isGuideModalOpen}
        onClose={() => setIsGuideModalOpen(false)}
        title="How to Release APKs for Free Forever"
      >
        <div className="space-y-4 text-left text-slate-900 dark:text-slate-100 py-1 text-xs">
          <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
            Follow these 3 easy steps whenever you build a new version of Wolf Palomar Gym Android app:
          </p>

          <div className="space-y-3">
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 space-y-1">
              <div className="font-heading font-black text-blue-600 dark:text-red-400 uppercase tracking-wider">
                Step 1: Generate your APK in Android Studio
              </div>
              <p className="text-slate-600 dark:text-slate-300">
                Run <code className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-neutral-800 font-mono">npm run build &amp;&amp; npx cap sync</code>, then in Android Studio select <strong>Build &gt; Build Bundle(s) / APK(s) &gt; Build APK(s)</strong>.
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 space-y-1">
              <div className="font-heading font-black text-blue-600 dark:text-red-400 uppercase tracking-wider">
                Step 2: Create a GitHub Release
              </div>
              <p className="text-slate-600 dark:text-slate-300">
                Go to your GitHub repository (e.g. <code>adrianangeles2212/palomar-gym</code>), click <strong>Releases &gt; Draft a new release</strong>.
              </p>
              <ul className="list-disc list-inside pl-2 space-y-1 text-slate-500 dark:text-slate-400">
                <li>Tag version: <strong>v0.25.0</strong> (matching package.json)</li>
                <li>Title: <strong>v0.25.0 Release</strong></li>
                <li>Drag and drop your <strong>WolfPalomarGym.apk</strong> into the release attachments box.</li>
                <li>Click <strong>Publish release</strong>.</li>
              </ul>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 space-y-1">
              <div className="font-heading font-black text-blue-600 dark:text-red-400 uppercase tracking-wider">
                Step 3: Instant Automatic App Detection
              </div>
              <p className="text-slate-600 dark:text-slate-300">
                All installed Capacitor terminals and phones will automatically detect the new release upon opening, and staff can tap <strong>Download &amp; Install Update</strong> directly. Zero storage costs forever!
              </p>
            </div>
          </div>

          <div className="flex justify-end pt-3 border-t border-slate-100 dark:border-white/5">
            <Button
              onClick={() => setIsGuideModalOpen(false)}
              className="bg-[#123c73] dark:bg-[#bf0202] text-white cursor-pointer px-4 font-heading text-xs tracking-wider"
            >
              Got It
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default SystemInformation;
