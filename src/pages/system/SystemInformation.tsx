// src/pages/settings/SystemInformation.tsx

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Database,
  ShieldCheck,
  Scale,
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
  Download,
  CheckCircle2,
  Copy,
  Check,
  ChevronDown,
} from 'lucide-react';
import { toast } from 'react-toastify';
import { supabase } from '../../lib/supabase/client';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Table } from '../../components/ui/Table';
import type { Column } from '../../components/ui/Table';
import { AgreementDocumentViewer } from '../../components/ui/AgreementDocumentViewer';

import { Capacitor } from '@capacitor/core';
import pkg from '../../../package.json';

import {
  fetchLatestRelease,
  executeAppUpdate,
  reloadPwaApp,
  formatBytes,
  type AppReleaseInfo,
} from '../../lib/appUpdateService';

import {
  getLatestChangelog,
  getChangelogForVersion,
  formatChangelogForReleaseNotes,
} from '../../lib/changelog';

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
    label: 'Members List',
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
  app_releases: {
    label: 'App Release Packages',
    purpose: 'app release builds, OTA deployment metadata, and version history',
    status: 'System',
  },
};

export const SystemInformation: React.FC = () => {
  const [activeModal, setActiveModal] = useState<LegalModalType>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Storage telemetry states
  const [, setRpcSupported] = useState<boolean>(false);
  const [dbSizeBytes, setDbSizeBytes] = useState<number | null>(null);
  const [storageSizeBytes, setStorageSizeBytes] = useState<number | null>(null);

  const [dbTables, setDbTables] = useState<
    Array<{ table_name: string; record_count: number; size_bytes: number }>
  >([]);

  // Platform & Update States
  const isNative = useMemo(() => Capacitor.isNativePlatform(), []);
  const currentNativePlatform = useMemo(() => Capacitor.getPlatform(), []);
  const [checkingUpdate, setCheckingUpdate] = useState<boolean>(false);
  const [latestRelease, setLatestRelease] = useState<AppReleaseInfo | null>(
    null
  );
  const [hasUpdate, setHasUpdate] = useState<boolean>(false);
  const [copiedUrl, setCopiedUrl] = useState<boolean>(false);

  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState<boolean>(false);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [downloadStatusText, setDownloadStatusText] = useState<string>('');

  // Changelog expand state - displays only ONE version (latest release)
  const [isChangelogOpen, setIsChangelogOpen] = useState<boolean>(false);
  const latestChangelog = useMemo(() => getLatestChangelog(), []);

  const handlePwaRefresh = async () => {
    toast.info('Refreshing application to apply the latest build...');
    await reloadPwaApp();
  };

  const APP_VERSION = pkg.version;

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
    return 'Production';
  }, [isNative, currentNativePlatform]);

  // Check for updates via Host Service CDN / Supabase
  const checkForAppUpdate = useCallback(
    async (isManualTrigger = false) => {
      try {
        setCheckingUpdate(true);
        const targetPlatform =
          currentNativePlatform === 'ios' ? 'ios' : 'android';
        const remoteInfo = await fetchLatestRelease(
          APP_VERSION,
          targetPlatform
        );

        if (remoteInfo) {
          setLatestRelease(remoteInfo);
          setHasUpdate(remoteInfo.isNewer);

          if (isManualTrigger) {
            if (remoteInfo.isNewer) {
              toast.info(
                `New update v${remoteInfo.version} is available via download link!`
              );
            } else {
              toast.success('Your app is already up to date.');
            }
          }
        } else {
          setHasUpdate(false);
          if (isManualTrigger) toast.success('Your app is already up to date.');
        }
      } catch (err: any) {
        if (isManualTrigger) toast.error('Could not check for updates.');
      } finally {
        setCheckingUpdate(false);
      }
    },
    [APP_VERSION, currentNativePlatform]
  );

  const handleOpenUpdateModal = () => {
    if (!latestRelease) {
      checkForAppUpdate(true);
      return;
    }
    setDownloadProgress(0);
    setDownloadStatusText('Ready to install');
    setIsUpdateModalOpen(true);
  };

  const handleStartUpdateDownload = async () => {
    if (!latestRelease) return;

    try {
      setIsDownloading(true);
      setDownloadProgress(20);
      setDownloadStatusText('Connecting to Host Service CDN...');

      await executeAppUpdate(latestRelease, (percent) => {
        setDownloadProgress(percent);
        if (percent < 50) {
          setDownloadStatusText('Downloading APK package...');
        } else if (percent < 90) {
          setDownloadStatusText('Transferring file to installer...');
        } else {
          setDownloadStatusText('Initiating Android system installer...');
        }
      });

      toast.success(
        isNative
          ? 'Download complete! Check your notification bar to tap and install.'
          : 'Update package downloaded successfully from Host Service CDN.'
      );
    } catch (err: any) {
      toast.error(
        'Download failed: ' + (err.message || 'Please check connection')
      );
    } finally {
      setIsDownloading(false);
    }
  };

  const handleCopyApkUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(true);
      toast.success('Direct Host Service CDN APK URL copied to clipboard!');
      setTimeout(() => setCopiedUrl(false), 2500);
    } catch {
      toast.error('Failed to copy download link.');
    }
  };

  const fetchSystemStats = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const tableKeys = Object.keys(tableDisplayMapping);

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
      setError(err.message || 'Error occurred while syncing metrics.');
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

    const dbAllocatedCap = 500 * 1024 * 1024;
    const dbPct = Math.min(
      100,
      parseFloat(((dbSize / dbAllocatedCap) * 100).toFixed(2))
    );

    const bucketAllocatedCap = 1024 * 1024 * 1024;
    const bucketPct = Math.min(
      100,
      parseFloat(((storageSize / bucketAllocatedCap) * 100).toFixed(2))
    );

    return [
      {
        title: 'DATABASE USAGE',
        value: formatBytes(dbSize),
        limitText: '500 MB',
        subtext: `${dbPct}% of allocated Postgres storage capacity used`,
        progress: Math.max(1, dbPct),
        icon: <Database className="w-5 h-5" />,
        colorClass:
          'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
        barColorClass: 'bg-emerald-500',
      },
      {
        title: 'MEDIA & FILE STORAGE',
        value: formatBytes(storageSize),
        limitText: '1 GB',
        subtext: `${bucketPct}% of allocated bucket storage used`,
        progress: Math.max(1, bucketPct),
        icon: <Cloud className="w-5 h-5" />,
        colorClass:
          'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
        barColorClass: 'bg-blue-500',
      },
    ];
  }, [dbSizeBytes, storageSizeBytes]);

  const appDetails: AppInfo[] = [
    { label: 'System Version', value: `v${APP_VERSION}` },
    {
      label: 'Latest Available',
      value: latestRelease ? `v${latestRelease.version}` : `v${APP_VERSION}`,
    },
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
          'Database record directory',
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
          <div className="h-5 w-10 bg-slate-200 dark:bg-neutral-700 rounded-md animate-pulse" />
        ) : (
          <span className="font-mono text-xs text-slate-900 dark:text-white font-bold bg-slate-100 dark:bg-neutral-800 px-2.5 py-1 rounded-md border border-slate-200 dark:border-white/10">
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
          <div className="h-4 w-14 bg-slate-200 dark:bg-neutral-700 rounded-md animate-pulse" />
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
              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
              : item.status === 'Operational'
                ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20'
                : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
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

  const registryItems = useMemo(() => {
    const getCount = (name: string) =>
      dbTables.find((t) => t.table_name === name)?.record_count || 0;
    return [
      {
        name: 'Members List',
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
    <div className="space-y-4 sm:space-y-5 font-body text-slate-800 dark:text-slate-100 p-0 sm:p-1 relative">
      {/* ─── HEADER ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <span className="text-[10px] font-heading tracking-widest text-[#123c73] dark:text-red-500 uppercase font-black">
            System / Configurations
          </span>
          <h1 className="text-xl sm:text-2xl font-heading tracking-widest uppercase text-slate-900 dark:text-slate-100 mt-0.5">
            System Information
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 max-w-2xl leading-relaxed">
            Application specifications, live database record telemetry, and
            developer contacts.
          </p>
        </div>
      </div>

      {/* ─── SYSTEM UPDATE BANNER ─── */}
      {hasUpdate && latestRelease ? (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-transparent dark:from-red-600/15 dark:via-rose-600/10 dark:to-transparent border border-blue-500/30 dark:border-red-600/30 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 dark:bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-600 dark:bg-red-600" />
              </span>
              <span className="px-2 py-0.5 rounded-full bg-blue-600 dark:bg-red-600 text-white font-heading font-black text-[9px] tracking-wider uppercase">
                NEW UPDATE AVAILABLE • v{latestRelease.version}
              </span>
              <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 font-semibold">
                Current: v{APP_VERSION} → New: v{latestRelease.version}
              </span>
            </div>

            <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
              {isNative
                ? `A newer version of the gym terminal is ready to install from Host Service CDN (${formatBytes(latestRelease.fileSizeBytes)}). No rate limits, direct download.`
                : `A newer version of the web app is ready (v${latestRelease.version}). Refresh the page to apply the latest build immediately.`}
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {isNative ? (
              <button
                type="button"
                onClick={handleOpenUpdateModal}
                className="py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 dark:bg-red-600 dark:hover:bg-red-700 text-white font-heading font-black text-xs tracking-wider uppercase shadow-md active:scale-98 transition-all flex items-center gap-2 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>INSTALL UPDATE</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handlePwaRefresh}
                className="py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 dark:bg-red-600 dark:hover:bg-red-700 text-white font-heading font-black text-xs tracking-wider uppercase shadow-md active:scale-98 transition-all flex items-center gap-2 cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                <span>REFRESH APP</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => checkForAppUpdate(true)}
              disabled={checkingUpdate}
              className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-white/10 transition-all cursor-pointer disabled:opacity-50"
              title="Re-check"
            >
              <RefreshCw
                className={`w-4 h-4 ${checkingUpdate ? 'animate-spin' : ''}`}
              />
            </button>
          </div>
        </div>
      ) : (
        <div className="p-3.5 sm:p-4 rounded-2xl bg-white dark:bg-[#161920] border border-slate-200 dark:border-white/10 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-heading font-black text-xs uppercase tracking-wider text-slate-900 dark:text-white">
                  SYSTEM UP TO DATE
                </h3>
                <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-[10px] font-mono font-bold uppercase">
                  v{APP_VERSION} STABLE
                </span>
                <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500">
                  • Verified via Host Service CDN
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Your gym terminal is running the latest production build.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => checkForAppUpdate(true)}
            disabled={checkingUpdate}
            className="py-1.5 px-3 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 font-heading font-bold text-xs tracking-wider uppercase transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0 self-start sm:self-center"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${checkingUpdate ? 'animate-spin' : ''}`}
            />
            <span>CHECK FOR UPDATES</span>
          </button>
        </div>
      )}

      {/* Subtle, non-obvious expandable update log button (Only display one version only) */}
      <div className="flex items-center justify-between px-1">
        <button
          type="button"
          onClick={() => setIsChangelogOpen(!isChangelogOpen)}
          className="text-[11px] font-mono text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors flex items-center gap-1.5 cursor-pointer py-1 select-none"
          title="Toggle version release notes"
        >
          <ChevronDown
            className={`w-3.5 h-3.5 transition-transform duration-200 ${
              isChangelogOpen
                ? 'rotate-180 text-blue-600 dark:text-red-500'
                : ''
            }`}
          />
          <span>
            {isChangelogOpen ? 'Hide' : 'View'} release logs (v
            {latestChangelog.version})
          </span>
        </button>

        {isChangelogOpen && (
          <span className="text-[10px] font-mono text-slate-400">
            Displaying latest version only
          </span>
        )}
      </div>

      {/* Expandable Single-Version Changelog View (Only display one version only) */}
      {isChangelogOpen && (
        <div className="p-4 rounded-2xl bg-white dark:bg-[#161920] border border-slate-200 dark:border-white/10 shadow-xs space-y-3 animate-fade-in text-left">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-white/10">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-md bg-blue-600/10 dark:bg-red-600/10 text-blue-600 dark:text-red-400 font-mono font-bold text-xs">
                v{latestChangelog.version}
              </span>
              <span className="text-[11px] font-mono text-slate-400 dark:text-slate-500">
                Released: {latestChangelog.date}
              </span>
            </div>
            <span className="text-[9px] font-mono uppercase tracking-wider text-slate-400">
              Single Version View
            </span>
          </div>

          {latestChangelog.summary && (
            <p className="text-xs text-slate-600 dark:text-slate-300 font-medium">
              {latestChangelog.summary}
            </p>
          )}

          <div className="space-y-2">
            {latestChangelog.sections.map((section, sIdx) => (
              <div key={sIdx} className="space-y-1.5">
                <span className="text-[10px] font-heading font-black uppercase tracking-wider text-slate-400">
                  {section.type}
                </span>
                <ul className="space-y-1 pl-3 border-l-2 border-slate-200 dark:border-white/10">
                  {section.items.map((item, iIdx) => (
                    <li
                      key={iIdx}
                      className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed font-normal"
                    >
                      • {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="p-3.5 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-500 font-semibold">
          ⚠️ {error}
        </div>
      )}

      {/* SECTION 1: Storage Capacity Displays */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {displayedMetrics.map((metric, idx) => (
          <div
            key={idx}
            className="p-4 sm:p-5 bg-white dark:bg-[#161920] border border-slate-200 dark:border-white/10 rounded-2xl space-y-3 shadow-xs"
          >
            <div className="flex items-center justify-between">
              <div
                className={`p-2 rounded-xl border shrink-0 ${metric.colorClass}`}
              >
                {metric.icon}
              </div>
              <div className="flex items-center gap-1.5 font-mono">
                <span className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white">
                  {loading ? (
                    <span className="inline-block h-5 w-20 bg-slate-200 dark:bg-neutral-700 rounded animate-pulse" />
                  ) : (
                    metric.value
                  )}
                </span>
                {metric.limitText && (
                  <span className="text-xs text-slate-400 font-bold font-sans">
                    / {metric.limitText}
                  </span>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                {metric.title}
              </span>
              <div className="w-full h-1.5 bg-slate-100 dark:bg-neutral-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${metric.barColorClass}`}
                  style={{ width: `${metric.progress}%` }}
                />
              </div>
              <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 block mt-0.5">
                {metric.subtext}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* SECTION 2: Build Metadata & Core Directory Telemetry */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-5 p-4 sm:p-5 bg-white dark:bg-[#161920] border border-slate-200 dark:border-white/10 rounded-2xl space-y-3 shadow-xs flex flex-col justify-between">
          <div className="flex items-center gap-2.5 pb-2 border-b border-slate-100 dark:border-white/10">
            <Cpu className="w-4 h-4 text-blue-500 dark:text-red-500" />
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
          <div className="flex items-center gap-2 pt-2 text-[10px] text-slate-400 dark:text-slate-500 font-medium border-t border-slate-100 dark:border-white/10">
            <Layers className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            <span>Row Level Security (RLS) active and verified.</span>
          </div>
        </div>

        <div className="lg:col-span-7 p-4 sm:p-5 bg-white dark:bg-[#161920] border border-slate-200 dark:border-white/10 rounded-2xl space-y-3 shadow-xs">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-white/10">
            <div className="flex items-center gap-2.5">
              <Database className="w-4 h-4 text-amber-500" />
              <h3 className="font-heading text-xs font-black uppercase tracking-wider text-slate-900 dark:text-slate-100">
                Count of Records
              </h3>
            </div>
            <span className="text-[9px] font-heading font-black tracking-widest px-2 py-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 rounded-md">
              LIVE
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {registryItems.map((metric, idx) => (
              <div
                key={idx}
                className="p-3 bg-slate-50 dark:bg-black/20 border border-slate-200/60 dark:border-white/5 rounded-xl flex items-center justify-between gap-2.5 text-xs"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="p-1.5 rounded-lg border bg-white dark:bg-neutral-900 border-slate-200 dark:border-white/10">
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
                <span className="px-2 py-0.5 bg-white dark:bg-neutral-900 text-xs font-mono text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-white/10 rounded-md font-bold">
                  {loading ? (
                    <span className="inline-block h-3.5 w-6 bg-slate-200 dark:bg-neutral-700 rounded animate-pulse" />
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
      <div className="p-1 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#161920] overflow-x-auto w-full shadow-xs">
        <Table<RecordBreakdownItem>
          data={recordBreakdownData}
          columns={columns}
          itemsPerPage={8}
          loading={false}
        />
      </div>

      {/* SECTION 4: Legal & Policy Documents + Developer Information */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
        <div
          onClick={() => setActiveModal('terms')}
          className="p-4 bg-white dark:bg-[#161920] border border-slate-200 dark:border-white/10 rounded-2xl flex items-center justify-between gap-3 cursor-pointer hover:border-blue-500 dark:hover:border-red-500 transition-all group shadow-xs"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 rounded-xl">
              <Scale className="w-5 h-5" />
            </div>
            <div className="text-left">
              <p className="text-xs font-bold text-slate-800 dark:text-slate-200 group-hover:text-blue-600 dark:group-hover:text-red-400 transition-colors">
                Terms of Service
              </p>
              <p className="text-[9px] text-slate-400 font-semibold mt-0.5">
                Facility rules &amp; payments
              </p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-1 transition-transform" />
        </div>

        <div
          onClick={() => setActiveModal('privacy')}
          className="p-4 bg-white dark:bg-[#161920] border border-slate-200 dark:border-white/10 rounded-2xl flex items-center justify-between gap-3 cursor-pointer hover:border-emerald-500 dark:hover:border-red-500 transition-all group shadow-xs"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 rounded-xl">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div className="text-left">
              <p className="text-xs font-bold text-slate-800 dark:text-slate-200 group-hover:text-emerald-600 dark:group-hover:text-red-400 transition-colors">
                Privacy Policy
              </p>
              <p className="text-[9px] text-slate-400 font-semibold mt-0.5">
                RA 10173 data protection
              </p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-1 transition-transform" />
        </div>

        <div
          onClick={() => setActiveModal('developer')}
          className="p-4 bg-white dark:bg-[#161920] border border-slate-200 dark:border-white/10 rounded-2xl flex items-center justify-between gap-3 cursor-pointer hover:border-amber-500 dark:hover:border-red-500 transition-all group shadow-xs"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 rounded-xl">
              <Code2 className="w-5 h-5" />
            </div>
            <div className="text-left">
              <p className="text-xs font-bold text-slate-800 dark:text-slate-200 group-hover:text-amber-600 dark:group-hover:text-red-400 transition-colors">
                About Developer
              </p>
              <p className="text-[9px] text-slate-400 font-semibold mt-0.5">
                Adrian R. Angeles
              </p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-1 transition-transform" />
        </div>
      </div>

      {/* ─── UNIFIED LEGAL & POLICY DOCUMENT VIEWER (AGREEMENT DOCUMENT VIEWER) ─── */}
      <AgreementDocumentViewer
        isOpen={activeModal === 'terms' || activeModal === 'privacy'}
        onClose={() => setActiveModal(null)}
        initialDocument={activeModal === 'terms' ? 'terms' : 'privacy'}
      />

      {/* ─── MODALS: Developer Info ─── */}
      <Modal
        isOpen={activeModal === 'developer'}
        onClose={() => setActiveModal(null)}
        title="About Developer"
        className="max-w-lg text-left p-6 sm:p-8 z-[9999]"
      >
        <div className="space-y-4 text-xs text-slate-600 dark:text-slate-300">
          <div className="p-4 bg-slate-50 dark:bg-neutral-800 border border-slate-200 dark:border-white/10 rounded-2xl flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-[#123c73] dark:bg-red-600 text-white font-heading font-black text-lg flex items-center justify-center shrink-0">
              AA
            </div>
            <div>
              <h3 className="font-heading font-bold text-sm text-slate-900 dark:text-white uppercase">
                Adrian R. Angeles
              </h3>
              <p className="text-xs text-blue-600 dark:text-red-400 font-semibold">
                Lead Software Developer
              </p>
              <p className="text-[10px] text-slate-400 mt-0.5">
                Wolf Palomar Management System
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <a
              href="tel:09762607481"
              className="p-3 bg-blue-500/10 hover:bg-blue-500/15 border border-blue-500/25 rounded-xl flex items-center gap-2.5 text-blue-600 dark:text-blue-400 transition-colors"
            >
              <Phone className="w-4 h-4 shrink-0" />
              <div className="min-w-0">
                <span className="block text-[9px] uppercase font-bold text-slate-500 dark:text-slate-400">
                  Mobile
                </span>
                <span className="font-mono text-xs font-bold text-slate-900 dark:text-white">
                  09762607481
                </span>
              </div>
            </a>

            <a
              href="mailto:adrianangeles2213@gmail.com"
              className="p-3 bg-emerald-500/10 hover:bg-emerald-500/15 border border-emerald-500/25 rounded-xl flex items-center gap-2.5 text-emerald-600 dark:text-emerald-400 transition-colors"
            >
              <Mail className="w-4 h-4 shrink-0" />
              <div className="min-w-0">
                <span className="block text-[9px] uppercase font-bold text-slate-500 dark:text-slate-400">
                  Email
                </span>
                <span className="font-mono text-xs font-bold text-slate-900 dark:text-white truncate block">
                  adrianangeles2213@gmail.com
                </span>
              </div>
            </a>

            <a
              href="https://facebook.com/WukwukTwo"
              target="_blank"
              rel="noopener noreferrer"
              className="p-3 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 rounded-xl flex items-center justify-between gap-2.5 text-slate-700 dark:text-slate-200 sm:col-span-2 transition-colors"
            >
              <span className="font-semibold text-xs">Facebook Profile</span>
              <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
            </a>
          </div>
        </div>

        <div className="flex justify-end pt-4 mt-4 border-t border-slate-100 dark:border-white/10">
          <Button
            onClick={() => setActiveModal(null)}
            className="bg-[#123c73] dark:bg-red-600 text-white cursor-pointer px-4 font-heading text-xs tracking-wider"
          >
            Close
          </Button>
        </div>
      </Modal>

      {/* ─── APP UPDATE CONFIRMATION MODAL (HOST SERVICE CDN POWERED) ─── */}
      <Modal
        isOpen={isUpdateModalOpen && !!latestRelease}
        onClose={() => {
          if (!isDownloading) setIsUpdateModalOpen(false);
        }}
        title="Install Application Update"
        className="max-w-md w-full text-left p-5 sm:p-6 z-[9999]"
      >
        {latestRelease && (
          <div className="space-y-4 text-left text-slate-900 dark:text-slate-100">
            {/* Version Transition Box */}
            <div className="p-3.5 rounded-2xl bg-slate-100 dark:bg-neutral-800 border border-slate-200 dark:border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-slate-500 dark:text-slate-400">
                  v{APP_VERSION}
                </span>
                <span className="text-xs font-bold text-blue-600 dark:text-red-500">
                  →
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-blue-600 dark:bg-red-600 text-white text-xs font-heading font-black tracking-wider uppercase">
                  v{latestRelease.version}
                </span>
              </div>
              <span className="text-xs font-mono text-slate-600 dark:text-slate-400 font-bold">
                {formatBytes(latestRelease.fileSizeBytes)}
              </span>
            </div>

            {/* Release Notes */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-heading font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                What&apos;s new in this release:
              </span>
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-black/30 border border-slate-200/80 dark:border-white/10 text-xs text-slate-700 dark:text-slate-300 leading-relaxed max-h-36 overflow-y-auto whitespace-pre-wrap font-medium">
                {latestRelease.releaseNotes ||
                  formatChangelogForReleaseNotes(
                    getChangelogForVersion(latestRelease.version)
                  )}
              </div>
            </div>

            {/* Direct URL Copy Fallback */}
            <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-100 dark:bg-neutral-800/80 border border-slate-200 dark:border-white/10">
              <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 truncate">
                {latestRelease.downloadUrl}
              </span>
              <button
                type="button"
                onClick={() => handleCopyApkUrl(latestRelease.downloadUrl)}
                className="p-1.5 rounded-lg bg-white dark:bg-neutral-700 hover:bg-slate-200 dark:hover:bg-neutral-600 text-slate-700 dark:text-slate-200 transition-colors shrink-0 cursor-pointer"
                title="Copy Direct Link"
              >
                {copiedUrl ? (
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            </div>

            {/* Download Progress Bar */}
            {isDownloading && (
              <div className="space-y-2 p-3.5 rounded-xl bg-slate-100 dark:bg-neutral-800 border border-slate-200 dark:border-white/10 animate-fade-in">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-slate-700 dark:text-slate-300 flex items-center gap-2">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600 dark:text-red-500" />
                    {downloadStatusText || 'Downloading update...'}
                  </span>
                  <span className="font-bold text-blue-600 dark:text-red-500">
                    {downloadProgress}%
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-neutral-700 overflow-hidden">
                  <div
                    className="h-full bg-blue-600 dark:bg-red-600 transition-all duration-300 rounded-full"
                    style={{ width: `${downloadProgress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-white/10">
              <button
                type="button"
                onClick={() => setIsUpdateModalOpen(false)}
                disabled={isDownloading}
                className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 text-xs font-heading uppercase font-bold tracking-wider cursor-pointer disabled:opacity-50"
              >
                Later
              </button>

              <button
                type="button"
                onClick={handleStartUpdateDownload}
                disabled={isDownloading}
                className="py-2.5 px-5 rounded-xl bg-blue-600 hover:bg-blue-700 dark:bg-red-600 dark:hover:bg-red-700 text-white text-xs font-heading font-black tracking-wider uppercase shadow-md active:scale-98 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Download
                  className={`w-4 h-4 ${isDownloading ? 'animate-bounce' : ''}`}
                />
                <span>{isDownloading ? 'Downloading...' : 'Install Now'}</span>
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default SystemInformation;
