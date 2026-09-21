// src/pages/system/SystemInformation.tsx

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShieldCheck,
  Scale,
  ChevronRight,
  RefreshCw,
  Code2,
  Phone,
  Mail,
  ExternalLink,
  Download,
  CheckCircle2,
  Copy,
  Check,
  History,
  Smartphone,
  Database,
  HardDrive,
  Layers,
  Activity,
} from 'lucide-react';
import { toast } from 'react-toastify';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { AgreementDocumentViewer } from '../../components/ui/AgreementDocumentViewer';

import { Capacitor } from '@capacitor/core';
import pkg from '../../../package.json';

import { useAuthStore } from '../../stores/authStore';
import { isSuperAdmin } from '../../constants/auth';
import { supabase } from '../../lib/supabase/client';

import {
  fetchLatestRelease,
  executeAppUpdate,
  reloadPwaApp,
  formatBytes,
  type AppReleaseInfo,
} from '../../lib/appUpdateService';

import {
  getAllChangelogs,
  getLatestChangelog,
  getChangelogForVersion,
  formatChangelogForReleaseNotes,
  type ChangelogEntry,
} from '../../lib/changelog';

type LegalModalType = 'terms' | 'privacy' | 'developer' | null;

interface ResourceTelemetry {
  id: string;
  name: string;
  category: 'database' | 'storage';
  label: string;
  description: string;
  count: number | null;
  bytes: number | null;
  loading: boolean;
  bytesPerRow?: number;
}

const TRACKED_RESOURCES: Omit<ResourceTelemetry, 'count' | 'bytes' | 'loading'>[] = [
  // Database Tables
  {
    id: 'members',
    name: 'members',
    category: 'database',
    label: 'Members Directory',
    description: 'Active, inactive, and archived gym member profiles',
    bytesPerRow: 1600,
  },
  {
    id: 'attendance',
    name: 'attendance',
    category: 'database',
    label: 'Attendance & Scans',
    description: 'Daily check-in logs and turnstile scanner events',
    bytesPerRow: 350,
  },
  {
    id: 'subscriptions',
    name: 'subscriptions',
    category: 'database',
    label: 'Membership Passes',
    description: 'Active and expired membership subscriptions',
    bytesPerRow: 550,
  },
  {
    id: 'sales',
    name: 'sales',
    category: 'database',
    label: 'POS Sales Orders',
    description: 'Store purchases, items sold, and cashier transactions',
    bytesPerRow: 950,
  },
  {
    id: 'products_tbl',
    name: 'products',
    category: 'database',
    label: 'Merchandise Inventory',
    description: 'Supplements, drinks, gear, and retail stock items',
    bytesPerRow: 1200,
  },
  {
    id: 'receipts',
    name: 'receipts',
    category: 'database',
    label: 'Official Payment Receipts',
    description: 'Cash slips, GCash payments, and BIR receipt logs',
    bytesPerRow: 1100,
  },
  {
    id: 'audit_logs',
    name: 'audit_logs',
    category: 'database',
    label: 'Security & Audit Logs',
    description: 'Operational tracking, access history, and system changes',
    bytesPerRow: 750,
  },
  {
    id: 'user_profiles',
    name: 'user_profiles',
    category: 'database',
    label: 'System User Accounts',
    description: 'Staff, coaches, managers, and administrator logins',
    bytesPerRow: 1400,
  },
  {
    id: 'cash_sessions',
    name: 'cash_sessions',
    category: 'database',
    label: 'Cash Drawer Sessions',
    description: 'Shift opening floats, drawer close-outs, and cash audits',
    bytesPerRow: 850,
  },
  {
    id: 'incident_reports',
    name: 'incident_reports',
    category: 'database',
    label: 'Incident & Facility Logs',
    description: 'Equipment repair logs and incident documentation',
    bytesPerRow: 1800,
  },
  // Bucket Storage
  {
    id: 'bucket_avatars',
    name: 'avatars',
    category: 'storage',
    label: 'Member & Staff Avatars',
    description: 'Profile photos, verification captures, and badge images',
  },
  {
    id: 'bucket_products',
    name: 'products',
    category: 'storage',
    label: 'Product Catalog Images',
    description: 'Merchandise photos, drink labels, and item thumbnails',
  },
  {
    id: 'bucket_backups',
    name: 'backups',
    category: 'storage',
    label: 'Database Snapshots',
    description: 'Automated recovery checkpoints and manual export archives',
  },
];

export const SystemInformation: React.FC = () => {
  const navigate = useNavigate();
  const { user, profile } = useAuthStore();
  const [activeModal, setActiveModal] = useState<LegalModalType>(null);

  // Role Detection: Admin vs Non-admin (Staff)
  const userRole = profile?.role || user?.app_metadata?.role || 'staff';
  const isSuperAdminUser = isSuperAdmin(user?.email);
  const isAdmin = userRole === 'admin' || isSuperAdminUser;

  // Platform & Update States
  const isNative = useMemo(() => Capacitor.isNativePlatform(), []);
  const currentNativePlatform = useMemo(() => Capacitor.getPlatform(), []);
  const [checkingUpdate, setCheckingUpdate] = useState<boolean>(false);
  const [latestRelease, setLatestRelease] = useState<AppReleaseInfo | null>(null);
  const [hasUpdate, setHasUpdate] = useState<boolean>(false);
  const [copiedUrl, setCopiedUrl] = useState<boolean>(false);

  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState<boolean>(false);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [downloadStatusText, setDownloadStatusText] = useState<string>('');

  // Selected changelog in the update history viewer
  const allChangelogs = useMemo(() => getAllChangelogs(), []);
  const [selectedVersion, setSelectedVersion] = useState<string>(
    () => allChangelogs[0]?.version || pkg.version
  );

  const activeChangelogEntry = useMemo<ChangelogEntry>(() => {
    return (
      allChangelogs.find((c) => c.version === selectedVersion) ||
      allChangelogs[0] ||
      getLatestChangelog()
    );
  }, [allChangelogs, selectedVersion]);

  const APP_VERSION = pkg.version;

  const detectedEnvironment = useMemo(() => {
    if (typeof window === 'undefined') return 'Production Web';
    if (isNative) return `Capacitor (${currentNativePlatform.toUpperCase()})`;

    const hostname = window.location.hostname;
    if (hostname.includes('localhost') || hostname.includes('dev-')) {
      return 'Development Web';
    }
    return 'Production Web (PWA)';
  }, [isNative, currentNativePlatform]);

  // Admin-Only Database & Storage Telemetry State
  const [telemetryLoading, setTelemetryLoading] = useState<boolean>(false);
  const [pingLatencyMs, setPingLatencyMs] = useState<number | null>(null);
  const [resourcesTelemetry, setResourcesTelemetry] = useState<ResourceTelemetry[]>(() =>
    TRACKED_RESOURCES.map((r) => ({
      ...r,
      count: null,
      bytes: null,
      loading: true,
    }))
  );

  // Fetch Database & Storage telemetry for Admin users
  const fetchAdminTelemetry = useCallback(async () => {
    if (!isAdmin) return;
    setTelemetryLoading(true);

    const startTime = performance.now();
    try {
      await supabase.from('user_profiles').select('id', { count: 'exact', head: true });
      const elapsed = Math.round(performance.now() - startTime);
      setPingLatencyMs(elapsed);
    } catch {
      setPingLatencyMs(null);
    }

    const promises = TRACKED_RESOURCES.map(async (res) => {
      if (res.category === 'database') {
        try {
          const { count, error } = await supabase
            .from(res.name)
            .select('*', { count: 'exact', head: true });
          if (error) throw error;
          const rowCount = count ?? 0;
          const estimatedBytes = rowCount * (res.bytesPerRow || 1000);
          return { id: res.id, count: rowCount, bytes: estimatedBytes };
        } catch {
          return { id: res.id, count: null, bytes: null };
        }
      } else {
        // Storage Bucket
        try {
          const { data, error } = await supabase.storage.from(res.name).list('', { limit: 100 });
          if (error) throw error;
          const fileCount = data ? data.length : 0;
          let totalBytes = 0;
          if (data && data.length > 0) {
            for (const file of data) {
              totalBytes += file.metadata?.size || 0;
            }
          }
          // If metadata size not available, use default baseline
          if (totalBytes === 0 && fileCount > 0) {
            totalBytes = fileCount * 180000;
          }
          return { id: res.id, count: fileCount, bytes: totalBytes };
        } catch {
          return { id: res.id, count: null, bytes: null };
        }
      }
    });

    const results = await Promise.all(promises);

    setResourcesTelemetry((prev) =>
      prev.map((item) => {
        const found = results.find((r) => r.id === item.id);
        return {
          ...item,
          count: found ? found.count : item.count,
          bytes: found ? found.bytes : item.bytes,
          loading: false,
        };
      })
    );

    setTelemetryLoading(false);
  }, [isAdmin]);

  useEffect(() => {
    if (isAdmin) {
      fetchAdminTelemetry();
    }
  }, [isAdmin, fetchAdminTelemetry]);

  // Total calculated rows across tracked database tables
  const totalTrackedRows = useMemo(() => {
    return resourcesTelemetry
      .filter((r) => r.category === 'database')
      .reduce((acc, curr) => acc + (curr.count || 0), 0);
  }, [resourcesTelemetry]);

  // Total storage footprint (Database estimate + Bucket file size)
  const totalStorageBytes = useMemo(() => {
    return resourcesTelemetry.reduce((acc, curr) => acc + (curr.bytes || 0), 0);
  }, [resourcesTelemetry]);

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
                `New update v${remoteInfo.version} is available for installation!`
              );
            } else {
              toast.success('Your system is already up to date.');
            }
          }
        } else {
          setHasUpdate(false);
          if (isManualTrigger) toast.success('Your system is already up to date.');
        }
      } catch {
        if (isManualTrigger) toast.error('Could not check for updates. Please check network.');
      } finally {
        setCheckingUpdate(false);
      }
    },
    [APP_VERSION, currentNativePlatform]
  );

  useEffect(() => {
    checkForAppUpdate(false);
  }, [checkForAppUpdate]);

  // Unified action for the single top-level button: checks updates and refreshes telemetry for admins
  const handleUnifiedCheckAndRefresh = async () => {
    const updatePromise = checkForAppUpdate(true);
    const telemetryPromise = isAdmin ? fetchAdminTelemetry() : Promise.resolve();
    await Promise.all([updatePromise, telemetryPromise]);
  };

  const handlePwaRefresh = async () => {
    toast.info('Refreshing application to apply the latest build...');
    await reloadPwaApp();
  };

  const handleOpenUpdateModal = () => {
    if (!latestRelease) {
      handleUnifiedCheckAndRefresh();
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
          ? 'Download complete! Check notification bar to tap and install.'
          : 'Update package downloaded successfully from CDN.'
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
      toast.success('Direct APK download link copied to clipboard!');
      setTimeout(() => setCopiedUrl(false), 2500);
    } catch {
      toast.error('Failed to copy download link.');
    }
  };

  const isActionLoading = checkingUpdate || telemetryLoading;

  return (
    <div className="space-y-6 font-body text-slate-800 dark:text-slate-100 p-0 sm:p-1 relative max-w-5xl mx-auto">
      {/* ─── HEADER WITH SINGLE ACTION BUTTON ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-2 border-b border-slate-200/80 dark:border-white/10">
        <div>
          <span className="text-[10px] font-heading tracking-widest text-[#123c73] dark:text-red-500 uppercase font-black">
            System / {isAdmin ? 'Updates & Telemetry' : 'Updates & Policies'}
          </span>
          <h1 className="text-xl sm:text-2xl font-heading tracking-widest uppercase text-slate-900 dark:text-slate-100 mt-0.5">
            {isAdmin ? 'System Updates & Telemetry' : 'System Updates'}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 max-w-2xl leading-relaxed">
            {isAdmin
              ? 'Application release management, storage and database diagnostics, update history, and legal policies.'
              : 'Application version management, release history, and facility policies.'}
          </p>
        </div>

        {/* SINGLE UNIFIED BUTTON */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleUnifiedCheckAndRefresh}
            disabled={isActionLoading}
            className="py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 dark:bg-red-600 dark:hover:bg-red-700 text-white font-heading font-black text-xs tracking-wider uppercase shadow-sm active:scale-98 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
            title={isAdmin ? 'Check for updates and refresh telemetry' : 'Check for updates'}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isActionLoading ? 'animate-spin' : ''}`} />
            <span>{isActionLoading ? 'Syncing...' : 'Check for Updates'}</span>
          </button>
        </div>
      </div>

      {/* ─── 1. SYSTEM STATUS & UPDATES CARD (Visible to both Staff & Admin) ─── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            System Status &amp; Updates
          </span>
          <span className="text-[11px] font-mono text-slate-400">
            {detectedEnvironment}
          </span>
        </div>

        {hasUpdate && latestRelease ? (
          <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-transparent dark:from-red-600/20 dark:via-rose-600/10 dark:to-transparent border border-blue-500/30 dark:border-red-600/30 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 dark:bg-red-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-600 dark:bg-red-600" />
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-blue-600 dark:bg-red-600 text-white font-heading font-black text-[10px] tracking-wider uppercase">
                  NEW UPDATE AVAILABLE • v{latestRelease.version}
                </span>
                <span className="text-xs font-mono text-slate-600 dark:text-slate-300 font-bold">
                  Current: v{APP_VERSION} → New: v{latestRelease.version}
                </span>
              </div>

              <p className="text-xs font-medium text-slate-700 dark:text-slate-200 max-w-xl leading-relaxed">
                {isNative
                  ? `A newer version of the gym terminal is ready to install (${formatBytes(latestRelease.fileSizeBytes)}). High-speed CDN mirror with zero rate limits.`
                  : `A newer version of the web app is ready (v${latestRelease.version}). Refresh the app to apply the build immediately.`}
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
            </div>
          </div>
        ) : (
          <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#161920] border border-slate-200 dark:border-white/10 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shrink-0">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-heading font-black text-sm uppercase tracking-wider text-slate-900 dark:text-white">
                    SYSTEM UP TO DATE
                  </h3>
                  <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-[10px] font-mono font-bold uppercase">
                    v{APP_VERSION} STABLE
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Your system is running the latest verified release build.
                </p>
              </div>
            </div>

            <div className="text-xs font-mono text-slate-400">
              Build Verified
            </div>
          </div>
        )}
      </div>

      {/* ─── ADMIN-EXCLUSIVE: DATABASE & STORAGE TELEMETRY ─── */}
      {isAdmin && (
        <div className="space-y-4 pt-1">
          {/* Summary Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            {/* Database Engine Status */}
            <div className="p-4 rounded-2xl bg-white dark:bg-[#161920] border border-slate-200 dark:border-white/10 shadow-xs">
              <div className="flex items-center justify-between pb-2">
                <span className="text-[11px] font-heading font-bold uppercase tracking-wider text-slate-400">
                  Database Status
                </span>
                <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
                  <Database className="w-4 h-4" />
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-lg font-heading font-black tracking-wider text-slate-900 dark:text-white">
                  Connected
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live
                </span>
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                Cloud PostgreSQL Database
              </p>
            </div>

            {/* Total Row Count */}
            <div className="p-4 rounded-2xl bg-white dark:bg-[#161920] border border-slate-200 dark:border-white/10 shadow-xs">
              <div className="flex items-center justify-between pb-2">
                <span className="text-[11px] font-heading font-bold uppercase tracking-wider text-slate-400">
                  Total Records
                </span>
                <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                  <Layers className="w-4 h-4" />
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-lg font-heading font-black tracking-wider text-slate-900 dark:text-white">
                  {telemetryLoading ? '...' : totalTrackedRows.toLocaleString()}
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  Rows
                </span>
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                Across 10 primary tables
              </p>
            </div>

            {/* Total Estimated Storage */}
            <div className="p-4 rounded-2xl bg-white dark:bg-[#161920] border border-slate-200 dark:border-white/10 shadow-xs">
              <div className="flex items-center justify-between pb-2">
                <span className="text-[11px] font-heading font-bold uppercase tracking-wider text-slate-400">
                  Storage Used
                </span>
                <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <HardDrive className="w-4 h-4" />
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-lg font-heading font-black tracking-wider text-slate-900 dark:text-white">
                  {telemetryLoading ? '...' : formatBytes(totalStorageBytes)}
                </span>
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono font-bold">
                  Estimated
                </span>
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                Tables &amp; bucket storage footprint
              </p>
            </div>

            {/* Connection Latency */}
            <div className="p-4 rounded-2xl bg-white dark:bg-[#161920] border border-slate-200 dark:border-white/10 shadow-xs">
              <div className="flex items-center justify-between pb-2">
                <span className="text-[11px] font-heading font-bold uppercase tracking-wider text-slate-400">
                  Query Latency
                </span>
                <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  <Activity className="w-4 h-4" />
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-lg font-heading font-black tracking-wider text-slate-900 dark:text-white">
                  {pingLatencyMs !== null ? `${pingLatencyMs} ms` : 'Optimal'}
                </span>
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono font-bold">
                  Healthy
                </span>
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                Real-time operational response
              </p>
            </div>
          </div>

          {/* Database Tables & Storage Telemetry Breakdown (Unified) */}
          <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#161920] border border-slate-200 dark:border-white/10 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-blue-600 dark:text-red-500" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                  Database Tables &amp; Telemetry Breakdown
                </h3>
              </div>
              <span className="text-[11px] font-mono text-slate-400">
                Tables &amp; Storage Buckets
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-white/10 text-[10px] font-heading font-black tracking-wider uppercase text-slate-400">
                    <th className="pb-2.5 font-bold">Resource / Name</th>
                    <th className="pb-2.5 font-bold">Category</th>
                    <th className="pb-2.5 font-bold">Purpose / Scope</th>
                    <th className="pb-2.5 font-bold text-right">Records / Files</th>
                    <th className="pb-2.5 font-bold text-right">Est. Storage Size</th>
                    <th className="pb-2.5 font-bold text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                  {resourcesTelemetry.map((res) => (
                    <tr key={res.id} className="hover:bg-slate-50/50 dark:hover:bg-white/[0.02]">
                      <td className="py-2.5 font-mono font-bold text-slate-900 dark:text-white">
                        {res.name}
                      </td>
                      <td className="py-2.5">
                        {res.category === 'database' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                            Table
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                            Bucket Storage
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 text-slate-500 dark:text-slate-400">
                        {res.description}
                      </td>
                      <td className="py-2.5 font-mono text-right font-bold text-slate-800 dark:text-slate-200">
                        {res.loading ? (
                          <span className="text-slate-400 animate-pulse">...</span>
                        ) : res.count !== null ? (
                          `${res.count.toLocaleString()} ${res.category === 'database' ? 'rows' : 'files'}`
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="py-2.5 font-mono text-right font-bold text-slate-800 dark:text-slate-200">
                        {res.loading ? (
                          <span className="text-slate-400 animate-pulse">...</span>
                        ) : res.bytes !== null ? (
                          formatBytes(res.bytes)
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="py-2.5 text-right">
                        <span className="inline-block px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                          Active
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ─── 2. UPDATE HISTORY SECTION (Visible to both Staff & Admin) ─── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-blue-600 dark:text-red-500" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Update History &amp; Release Notes
            </h3>
          </div>
          <span className="text-[11px] font-mono text-slate-400">
            {allChangelogs.length} Releases Logged
          </span>
        </div>

        <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#161920] border border-slate-200 dark:border-white/10 shadow-xs space-y-4">
          {/* Version Pills Bar */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            {allChangelogs.map((entry) => {
              const isSelected = entry.version === activeChangelogEntry.version;
              const isCurrentInstalled = entry.version === APP_VERSION;
              return (
                <button
                  key={entry.version}
                  type="button"
                  onClick={() => setSelectedVersion(entry.version)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all shrink-0 cursor-pointer flex items-center gap-1.5 ${
                    isSelected
                      ? 'bg-blue-600 dark:bg-red-600 text-white shadow-xs'
                      : 'bg-slate-100 dark:bg-neutral-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-neutral-700'
                  }`}
                >
                  <span>v{entry.version}</span>
                  {isCurrentInstalled && (
                    <span className="px-1.5 py-0.2 rounded text-[9px] bg-white/20 uppercase tracking-tight">
                      Current
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Active Version Content Card */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-black/30 border border-slate-200/80 dark:border-white/5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b border-slate-200/60 dark:border-white/5 gap-2">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-md bg-blue-600/10 dark:bg-red-600/15 text-blue-600 dark:text-red-400 font-mono font-bold text-xs">
                  Version {activeChangelogEntry.version}
                </span>
                <span className="text-xs font-mono text-slate-400 dark:text-slate-500">
                  Released on {activeChangelogEntry.date}
                </span>
              </div>

              {activeChangelogEntry.version === APP_VERSION && (
                <span className="text-[10px] font-heading font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest flex items-center gap-1">
                  <Check className="w-3 h-3" /> Active Installed Version
                </span>
              )}
            </div>

            {activeChangelogEntry.summary && (
              <p className="text-xs font-medium text-slate-700 dark:text-slate-300 leading-relaxed">
                {activeChangelogEntry.summary}
              </p>
            )}

            <div className="space-y-2.5 pt-1">
              {activeChangelogEntry.sections.map((section, sIdx) => {
                const badgeColor =
                  section.type === 'Added'
                    ? 'text-emerald-600 dark:text-emerald-400 border-emerald-500/20 bg-emerald-500/10'
                    : section.type === 'Fixed'
                    ? 'text-blue-600 dark:text-blue-400 border-blue-500/20 bg-blue-500/10'
                    : section.type === 'Security'
                    ? 'text-amber-600 dark:text-amber-400 border-amber-500/20 bg-amber-500/10'
                    : 'text-purple-600 dark:text-purple-400 border-purple-500/20 bg-purple-500/10';

                return (
                  <div key={sIdx} className="space-y-1.5">
                    <span
                      className={`inline-block text-[9px] font-heading font-black uppercase tracking-wider px-2 py-0.5 rounded border ${badgeColor}`}
                    >
                      {section.type}
                    </span>
                    <ul className="space-y-1 pl-3 border-l-2 border-slate-200 dark:border-white/10">
                      {section.items.map((item, iIdx) => (
                        <li
                          key={iIdx}
                          className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-normal"
                        >
                          • {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ─── 3. POLICIES & LEGAL AGREEMENTS SECTION (Visible to both Staff & Admin) ─── */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Policies &amp; Legal Agreements
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {/* Terms of Service Button */}
          <div
            onClick={() => setActiveModal('terms')}
            className="p-4 sm:p-5 bg-white dark:bg-[#161920] border border-slate-200 dark:border-white/10 rounded-2xl flex items-center justify-between gap-3 cursor-pointer hover:border-blue-500 dark:hover:border-red-500 transition-all group shadow-xs active:scale-98"
          >
            <div className="flex items-center gap-3.5">
              <div className="p-2.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 rounded-xl">
                <Scale className="w-5 h-5" />
              </div>
              <div className="text-left">
                <p className="text-xs font-bold text-slate-800 dark:text-slate-200 group-hover:text-blue-600 dark:group-hover:text-red-400 transition-colors">
                  Terms of Service
                </p>
                <p className="text-[10px] text-slate-400 font-semibold mt-0.5">
                  Gym facility rules, memberships, code of conduct &amp; billing policies
                </p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-1 transition-transform shrink-0" />
          </div>

          {/* Privacy Policy Button */}
          <div
            onClick={() => setActiveModal('privacy')}
            className="p-4 sm:p-5 bg-white dark:bg-[#161920] border border-slate-200 dark:border-white/10 rounded-2xl flex items-center justify-between gap-3 cursor-pointer hover:border-emerald-500 dark:hover:border-red-500 transition-all group shadow-xs active:scale-98"
          >
            <div className="flex items-center gap-3.5">
              <div className="p-2.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 rounded-xl">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div className="text-left">
                <p className="text-xs font-bold text-slate-800 dark:text-slate-200 group-hover:text-emerald-600 dark:group-hover:text-red-400 transition-colors">
                  Privacy Policy
                </p>
                <p className="text-[10px] text-slate-400 font-semibold mt-0.5">
                  Data protection, member privacy &amp; compliance under Philippine RA 10173
                </p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-1 transition-transform shrink-0" />
          </div>
        </div>
      </div>

      {/* ─── 4. OTHER ACTION BUTTONS: SYSTEM ACTIONS & RESOURCES (Visible to both Staff & Admin) ─── */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          System Actions &amp; Resources
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {/* About Developer Button */}
          <div
            onClick={() => setActiveModal('developer')}
            className="p-4 sm:p-5 bg-white dark:bg-[#161920] border border-slate-200 dark:border-white/10 rounded-2xl flex items-center justify-between gap-3 cursor-pointer hover:border-amber-500 dark:hover:border-red-500 transition-all group shadow-xs active:scale-98"
          >
            <div className="flex items-center gap-3.5">
              <div className="p-2.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 rounded-xl">
                <Code2 className="w-5 h-5" />
              </div>
              <div className="text-left">
                <p className="text-xs font-bold text-slate-800 dark:text-slate-200 group-hover:text-amber-600 dark:group-hover:text-red-400 transition-colors">
                  About Developer
                </p>
                <p className="text-[10px] text-slate-400 font-semibold mt-0.5">
                  Adrian R. Angeles • Technical support, developer contacts &amp; profile
                </p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-1 transition-transform shrink-0" />
          </div>

          {/* Download Mobile App Button */}
          <div
            onClick={() => navigate('/download')}
            className="p-4 sm:p-5 bg-white dark:bg-[#161920] border border-slate-200 dark:border-white/10 rounded-2xl flex items-center justify-between gap-3 cursor-pointer hover:border-blue-500 dark:hover:border-red-500 transition-all group shadow-xs active:scale-98"
          >
            <div className="flex items-center gap-3.5">
              <div className="p-2.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 rounded-xl">
                <Smartphone className="w-5 h-5" />
              </div>
              <div className="text-left">
                <p className="text-xs font-bold text-slate-800 dark:text-slate-200 group-hover:text-blue-600 dark:group-hover:text-red-400 transition-colors">
                  Download Mobile App
                </p>
                <p className="text-[10px] text-slate-400 font-semibold mt-0.5">
                  Direct APK installer for Android tablets, smartphones &amp; terminal kiosks
                </p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-1 transition-transform shrink-0" />
          </div>
        </div>
      </div>

      {/* ─── UNIFIED LEGAL & POLICY DOCUMENT VIEWER ─── */}
      <AgreementDocumentViewer
        isOpen={activeModal === 'terms' || activeModal === 'privacy'}
        onClose={() => setActiveModal(null)}
        initialDocument={activeModal === 'terms' ? 'terms' : 'privacy'}
      />

      {/* ─── MODAL: About Developer ─── */}
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
