// src/pages/system/SystemInformation/SystemInformation.tsx
import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck,
  Scale,
  RefreshCw,
  Code2,
  Phone,
  Mail,
  CheckCircle2,
  Database,
  Cloud,
  ChevronRight,
  Download,
  FileText,
  Smartphone,
  Monitor,
  AlertCircle,
  Sparkles,
} from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Modal } from '../../../components/ui/Modal';
import {
  AgreementDocumentViewer,
  type AgreementDocument,
} from '../../../components/ui/AgreementDocumentViewer';
import { VersionChangelogModal } from '../../../components/ui/WhatsNewModal';

import pkg from '../../../../package.json';
import {
  formatBytes,
  fetchLatestRelease,
  executeAppUpdate,
  reloadPwaApp,
  getInstalledAppVersion,
  isNewerVersion,
  triggerDirectDownload,
  NativeAppInstaller,
  type AppReleaseInfo,
} from '../../../lib/appUpdateService';
import { supabase } from '../../../lib/supabase/client';
import { toast } from 'react-toastify';
import { useAuthStore } from '../../../stores/authStore';
import { useNotificationStore } from '../../../stores/useNotificationStore';

export const SystemInformation: React.FC = () => {
  const BUNDLED_VERSION = String(pkg.version || '0.0.0').replace(/^v/i, '');
  const isNativePlatform = Capacitor.isNativePlatform();
  const runtimePlatform = Capacitor.getPlatform();

  const [installedVersion, setInstalledVersion] =
    useState<string>(BUNDLED_VERSION);
  const [latestRelease, setLatestRelease] = useState<AppReleaseInfo | null>(
    null
  );
  const [isLoadingRelease, setIsLoadingRelease] = useState<boolean>(true);
  const [isUpdatingApp, setIsUpdatingApp] = useState<boolean>(false);
  const [needsInstallPermission, setNeedsInstallPermission] =
    useState<boolean>(false);
  const [downloadProgress, setDownloadProgress] = useState<{
    percent: number;
    loadedBytes: number;
    totalBytes: number;
  } | null>(null);

  const [activeModal, setActiveModal] = useState<
    AgreementDocument | 'developer' | null
  >(null);
  const [isReloadingCore, setIsReloadingCore] = useState<boolean>(false);
  const [isReleaseDetailsOpen, setIsReleaseDetailsOpen] = useState<boolean>(false);

  // Storage and DB Gauges (Live from Supabase RPCs with safe defaults)
  const [totalDbBytes, setTotalDbBytes] = useState<number>(17.6 * 1024 * 1024);
  const [totalStorageBytes, setTotalStorageBytes] = useState<number>(
    207.6 * 1024
  );
  const maxDbBytes = 500 * 1024 * 1024;
  const maxStorageBytes = 1 * 1024 * 1024 * 1024;

  const loadSystemReleaseAndTelemetry = useCallback(
    async (showNotice = false) => {
      setIsLoadingRelease(true);
      try {
        // 1. Resolve true installed version (queries native Android package info on Capacitor)
        const deviceInfo = await getInstalledAppVersion(BUNDLED_VERSION);
        const currentVer = deviceInfo.version || BUNDLED_VERSION;
        setInstalledVersion(currentVer);

        // 2. Query Supabase app_releases table for latest release
        const release = await fetchLatestRelease(currentVer, 'android');
        if (release) {
          setLatestRelease(release);
          if (showNotice) {
            if (isNewerVersion(release.version, currentVer)) {
              toast.info(
                `Update available: v${release.version} (Installed: v${currentVer})`,
                { toastId: 'sysinfo-update-found' }
              );
            } else {
              toast.success(
                `System is up to date (Installed: v${currentVer}).`,
                { toastId: 'sysinfo-up-to-date' }
              );
            }
          }
        } else if (showNotice) {
          toast.info(`Current release v${currentVer} verified.`);
        }
      } catch (err) {
        console.warn('Failed to query app_releases from Supabase:', err);
      } finally {
        setIsLoadingRelease(false);
      }

      // 3. Fetch live Database & Storage telemetry from Supabase RPCs
      try {
        const [dbRes, storageRes] = await Promise.allSettled([
          supabase.rpc('get_database_size_bytes'),
          supabase.rpc('get_storage_size_bytes'),
        ]);

        if (
          dbRes.status === 'fulfilled' &&
          !dbRes.value.error &&
          Number(dbRes.value.data) > 0
        ) {
          setTotalDbBytes(Number(dbRes.value.data));
        }
        if (
          storageRes.status === 'fulfilled' &&
          !storageRes.value.error &&
          Number(storageRes.value.data) >= 0
        ) {
          setTotalStorageBytes(Number(storageRes.value.data));
        }
      } catch {
        // Keep last known values if offline
      }
    },
    [BUNDLED_VERSION]
  );

  useEffect(() => {
    loadSystemReleaseAndTelemetry(false);

    // Subscribe to realtime changes on public.app_releases
    const channel = supabase
      .channel('system_info_app_releases_sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'app_releases' },
        () => {
          loadSystemReleaseAndTelemetry(false);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadSystemReleaseAndTelemetry]);

  const remoteVersion = latestRelease?.version || BUNDLED_VERSION;
  // If latest release is older than installed version then do not validate as update to latest
  const isUpdateAvailable = Boolean(
    latestRelease && isNewerVersion(latestRelease.version, installedVersion)
  );

  const hasValidDownloadUrl = Boolean(
    latestRelease?.downloadUrl &&
      latestRelease.downloadUrl.startsWith('http') &&
      !latestRelease.downloadUrl.includes('paste-your-download-link-here.com')
  );

  const handleUpdateToLatest = async () => {
    if (isUpdatingApp) return;

    // Guard: If latest release is older than or equal to installed version, do not validate as update
    if (!latestRelease || !isNewerVersion(latestRelease.version, installedVersion)) {
      toast.info(`System is already on the latest version (Installed: v${installedVersion}).`, {
        toastId: 'already-latest-version',
      });
      return;
    }

    // On Web / PWA without native Android container:
    // If the user is on web and an update is available, reload PWA caches/service worker
    if (!isNativePlatform && isUpdateAvailable) {
      setIsUpdatingApp(true);
      try {
        toast.info(`Updating web application to v${remoteVersion}...`, {
          toastId: 'web-updating',
        });
        await reloadPwaApp();
      } finally {
        setIsUpdatingApp(false);
      }
      return;
    }

    // Native Android or APK Download flow from app_releases
    if (!latestRelease || !hasValidDownloadUrl) {
      toast.info('Checking Supabase app_releases for latest package...');
      await loadSystemReleaseAndTelemetry(true);
      return;
    }

    setIsUpdatingApp(true);
    setNeedsInstallPermission(false);
    setDownloadProgress({
      percent: 0,
      loadedBytes: 0,
      totalBytes: latestRelease.fileSizeBytes || 0,
    });

    try {
      const result = await executeAppUpdate(
        latestRelease,
        (percent, loadedBytes = 0, totalBytes = 0) => {
          setDownloadProgress({
            percent,
            loadedBytes,
            totalBytes: totalBytes || latestRelease.fileSizeBytes || 0,
          });
        }
      );

      if (result.permissionRequired) {
        setNeedsInstallPermission(true);
        toast.warning(result.message, { autoClose: 7000 });
      } else if (result.success) {
        toast.success(result.message);
      } else {
        toast.info(result.message);
      }
    } catch (err: any) {
      console.error('Update installation error:', err);
      if (latestRelease.downloadUrl) {
        triggerDirectDownload(latestRelease.downloadUrl, latestRelease.fileName);
        toast.info(
          'Opened direct APK download link. Install the package once downloaded.'
        );
      } else {
        toast.error(err?.message || 'Unable to start application update.');
      }
    } finally {
      setIsUpdatingApp(false);
      setTimeout(() => setDownloadProgress(null), 2500);
    }
  };

  const handleOpenAndroidPermissionSettings = async () => {
    try {
      await NativeAppInstaller.openInstallPermissionSettings();
    } catch {
      toast.info(
        "Please enable 'Install unknown apps' for this app in Android Settings."
      );
    }
  };

  const handleReloadCore = async () => {
    if (isReloadingCore) return;
    setIsReloadingCore(true);
    try {
      await loadSystemReleaseAndTelemetry(true);

      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const reg of registrations) {
          await reg.update().catch(() => {});
        }
      }
      const authState = useAuthStore.getState();
      await Promise.allSettled([
        authState.checkSession(),
        useNotificationStore
          .getState()
          .fetchNotifications(
            authState.user?.email,
            authState.profile?.role,
            false
          ),
      ]);
      toast.success('Application core and release telemetry refreshed.', {
        toastId: 'reload-core-success',
      });
    } catch {
      toast.info('System status refreshed.');
    } finally {
      setIsReloadingCore(false);
    }
  };

  const dbUsagePercent = Math.min(100, (totalDbBytes / maxDbBytes) * 100);
  const storageUsagePercent = Math.min(
    100,
    (totalStorageBytes / maxStorageBytes) * 100
  );

  return (
    <div className="w-full space-y-6 font-body text-(--color-text)">
      {/* Page Header */}
      <div>
        <h2 className="text-lg sm:text-xl font-heading tracking-widest uppercase text-(--color-text)">
          System Information
        </h2>
        <p className="text-xs sm:text-sm text-slate-400 mt-1 font-medium">
          Application specifications, live Supabase release updates, storage
          health, and facility legal documentation.
        </p>
      </div>

      {/* Two-Column Balanced Layout Grid: 7 cols (Left) / 5 cols (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 items-start">
        {/* LEFT COLUMN: Specifications & App Release Updater Card (7 Cols) */}
        <div className="lg:col-span-7 space-y-5 sm:space-y-6">
          {/* Build Specifications & App Release Updater Card */}
          <div className="bg-(--bg-card) border border-(--border-color) p-4 sm:p-5 rounded-2xl space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-heading tracking-widest uppercase text-(--color-text)">
                  Build Specifications
                </h3>
                <p className="text-xs text-slate-400 mt-0.5 font-semibold">
                  Active runtime environment and live Supabase{' '}
                  <span className="font-mono">app_releases</span> status.
                </p>
              </div>
              <span
                className={`self-start sm:self-auto shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-heading font-black uppercase tracking-wider border ${
                  isUpdateAvailable
                    ? 'bg-amber-500/15 text-amber-500 border-amber-500/30'
                    : 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30'
                }`}
              >
                {isUpdateAvailable ? (
                  <>
                    <AlertCircle className="w-3 h-3" />
                    <span>Update Available</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3 h-3" />
                    <span>Up to Date</span>
                  </>
                )}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 pt-2 border-t border-(--border-color) text-xs">
              <div className="flex items-center justify-between py-1.5 border-b border-(--border-color)">
                <span className="text-slate-400 font-medium">Installed Version</span>
                <span
                  className={`font-mono font-bold ${
                    isUpdateAvailable ? 'text-amber-500' : 'text-emerald-500'
                  }`}
                >
                  v{installedVersion}
                </span>
              </div>

              <div className="flex items-center justify-between py-1.5 border-b border-(--border-color)">
                <span className="text-slate-400 font-medium">Latest Release</span>
                <span className="font-mono font-bold text-emerald-500 flex items-center gap-1.5">
                  {isLoadingRelease ? (
                    <RefreshCw className="w-3 h-3 animate-spin text-slate-400" />
                  ) : null}
                  <span>v{remoteVersion}</span>
                </span>
              </div>

              <div className="flex items-center justify-between py-1.5 border-b border-(--border-color)">
                <span className="text-slate-400 font-medium">Release Package</span>
                <span className="font-mono text-[11px] font-bold text-(--color-text) truncate max-w-[150px] text-right">
                  {latestRelease?.fileSizeBytes && latestRelease.fileSizeBytes > 0
                    ? `${formatBytes(latestRelease.fileSizeBytes)} • `
                    : ''}
                  {latestRelease?.storageHost || 'GitHub'}
                </span>
              </div>

              <div className="flex items-center justify-between py-1.5 border-b border-(--border-color)">
                <span className="text-slate-400 font-medium">Environment</span>
                <span className="font-mono font-bold text-(--color-text) uppercase">
                  {latestRelease?.environment ||
                    import.meta.env.MODE ||
                    'Production'}
                </span>
              </div>

              <div className="flex items-center justify-between py-1.5 border-b border-(--border-color)">
                <span className="text-slate-400 font-medium">Framework</span>
                <span className="font-mono font-bold text-(--color-text)">
                  React 19 + Vite 6
                </span>
              </div>

              <div className="flex items-center justify-between py-1.5 border-b border-(--border-color)">
                <span className="text-slate-400 font-medium">Runtime Platform</span>
                <span className="font-mono font-bold text-(--color-text) inline-flex items-center gap-1.5 uppercase">
                  {isNativePlatform ? (
                    <>
                      <Smartphone className="w-3.5 h-3.5 text-emerald-500" />
                      <span>Capacitor {runtimePlatform}</span>
                    </>
                  ) : (
                    <>
                      <Monitor className="w-3.5 h-3.5 text-blue-500" />
                      <span>Web / PWA</span>
                    </>
                  )}
                </span>
              </div>
            </div>

            {/* Release Notes / Update Banner when a release is fetched from app_releases (Clickable) */}
            {latestRelease && (
              <div
                onClick={() => setIsReleaseDetailsOpen(true)}
                className={`group p-3.5 rounded-xl border text-left space-y-2 transition-all cursor-pointer ${
                  isUpdateAvailable
                    ? 'bg-amber-500/10 hover:bg-amber-500/15 border-amber-500/30 hover:border-amber-500/50'
                    : 'bg-(--bg-page) hover:bg-(--bg-card) border-(--border-color) hover:border-(--color-primary)/40'
                }`}
                title="Click to view full release notes and changelog details"
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-[11px] font-heading font-black uppercase tracking-wider text-(--color-text) flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    <span>
                      {isUpdateAvailable
                        ? `New Release v${latestRelease.version} Ready`
                        : `Release v${latestRelease.version} Notes`}
                    </span>
                  </span>
                  <div className="flex items-center gap-1.5">
                    {latestRelease.publishedAt && (
                      <span className="text-[10px] font-mono text-slate-400">
                        {new Date(latestRelease.publishedAt).toLocaleDateString(
                          'en-GB',
                          {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          }
                        )}
                      </span>
                    )}
                    <span className="text-[10px] text-(--color-primary) font-heading font-bold uppercase tracking-wider flex items-center gap-0.5 group-hover:translate-x-0.5 transition-transform">
                      <span>Details</span>
                      <ChevronRight className="w-3 h-3" />
                    </span>
                  </div>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-300 leading-relaxed whitespace-pre-wrap line-clamp-3">
                  {latestRelease.releaseNotes}
                </p>
              </div>
            )}

            {/* Live Download Progress Bar */}
            {downloadProgress && (
              <div className="space-y-1.5 p-3 rounded-xl bg-(--bg-page) border border-(--border-color)">
                <div className="flex items-center justify-between text-[11px] font-mono font-bold">
                  <span className="text-(--color-text)">
                    Downloading v{remoteVersion}...
                  </span>
                  <span className="text-emerald-500">
                    {downloadProgress.percent}%
                  </span>
                </div>
                <div className="w-full h-2 bg-(--bg-card) border border-(--border-color) rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all duration-200"
                    style={{ width: `${downloadProgress.percent}%` }}
                  />
                </div>
                {downloadProgress.totalBytes > 0 && (
                  <p className="text-[10px] font-mono text-slate-400 text-right">
                    {formatBytes(downloadProgress.loadedBytes)} /{' '}
                    {formatBytes(downloadProgress.totalBytes)}
                  </p>
                )}
              </div>
            )}

            {/* Android Unknown Sources Permission Helper */}
            {needsInstallPermission && isNativePlatform && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-2 text-left">
                <p className="text-[11px] text-amber-500 font-semibold leading-snug">
                  Android requires permission to install APK updates from this
                  app. Enable &quot;Allow from this source&quot; and tap Update
                  again.
                </p>
                <button
                  type="button"
                  onClick={handleOpenAndroidPermissionSettings}
                  className="w-full py-2.5 px-3 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-heading font-black uppercase tracking-widest cursor-pointer transition-all"
                >
                  Open Android Install Settings
                </button>
              </div>
            )}

            {/* Version Status Summary Banner */}
            {!isUpdateAvailable && (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                <div className="text-left">
                  <p className="text-xs font-heading font-black uppercase tracking-wider text-emerald-500">
                    Your version is up to date
                  </p>
                  <p className="text-[11px] text-slate-400 font-mono">
                    Version v{installedVersion} is currently the newest available release.
                  </p>
                </div>
              </div>
            )}

            {/* Update & Action Buttons */}
            <div className="space-y-2.5">
              {isUpdateAvailable && (
                <button
                  type="button"
                  onClick={handleUpdateToLatest}
                  disabled={isUpdatingApp}
                  className="w-full min-h-[42px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-heading font-black tracking-widest uppercase transition-all cursor-pointer disabled:opacity-60 shadow-md bg-(--color-primary) hover:bg-(--color-primary-hover) text-white"
                >
                  <Download
                    className={`w-4 h-4 ${isUpdatingApp ? 'animate-bounce' : ''}`}
                  />
                  <span>
                    {isUpdatingApp
                      ? downloadProgress
                        ? `Updating (${downloadProgress.percent}%)...`
                        : 'Updating to Latest...'
                      : `Update to Latest (v${remoteVersion})`}
                  </span>
                </button>
              )}

              {/* Install Android App Option */}
              {hasValidDownloadUrl && latestRelease && (
                <button
                  type="button"
                  onClick={() =>
                    triggerDirectDownload(
                      latestRelease.downloadUrl,
                      latestRelease.fileName
                    )
                  }
                  className="w-full min-h-[42px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-heading font-black tracking-widest uppercase transition-all cursor-pointer bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                >
                  <Smartphone className="w-4 h-4" />
                  <span>Download Android App</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleReloadCore}
                disabled={isReloadingCore || isLoadingRelease}
                className="w-full min-h-[42px] inline-flex items-center justify-center gap-2 px-4 py-2.5 border border-(--border-color) bg-(--bg-input) text-(--color-text) opacity-90 hover:opacity-100 rounded-xl text-xs font-heading tracking-widest uppercase transition-all cursor-pointer disabled:opacity-60"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${
                    isReloadingCore || isLoadingRelease ? 'animate-spin' : ''
                  }`}
                />
                <span>
                  {isReloadingCore
                    ? 'Checking for Updates...'
                    : 'Check for Updates'}
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Service Health, Resource Utilization & Documentation (5 Cols) */}
        <div className="lg:col-span-5 space-y-5 sm:space-y-6">
          {/* Infrastructure & Resource Allocation Card */}
          <div className="bg-(--bg-card) border border-(--border-color) p-4 sm:p-5 rounded-2xl space-y-4">
            <div>
              <h3 className="text-sm font-heading tracking-widest uppercase text-(--color-text)">
                Resource Utilization
              </h3>
              <p className="text-xs text-slate-400 mt-0.5 font-semibold">
                Database volume allocations and cloud asset storage pools.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-3 pt-2 border-t border-(--border-color)">
              {/* Database Utilization Gauge */}
              <div className="space-y-2 p-3 bg-(--bg-page) border border-(--border-color) rounded-xl">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1 truncate">
                    <Database className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                    Database
                  </span>
                  <span className="text-[10px] font-mono font-bold text-slate-400">
                    {dbUsagePercent.toFixed(1)}%
                  </span>
                </div>
                <div>
                  <div className="flex items-baseline justify-between mb-1.5 truncate">
                    <span className="text-sm font-heading font-black text-(--color-text)">
                      {formatBytes(totalDbBytes)}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      / {formatBytes(maxDbBytes)}
                    </span>
                  </div>
                  <div className="w-full h-2 bg-(--bg-card) border border-(--border-color) rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all duration-500"
                      style={{ width: `${dbUsagePercent}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Storage Buckets Gauge */}
              <div className="space-y-2 p-3 bg-(--bg-page) border border-(--border-color) rounded-xl">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1 truncate">
                    <Cloud className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                    Storage
                  </span>
                  <span className="text-[10px] font-mono font-bold text-slate-400">
                    {storageUsagePercent.toFixed(1)}%
                  </span>
                </div>
                <div>
                  <div className="flex items-baseline justify-between mb-1.5 truncate">
                    <span className="text-sm font-heading font-black text-(--color-text)">
                      {formatBytes(totalStorageBytes)}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      / {formatBytes(maxStorageBytes)}
                    </span>
                  </div>
                  <div className="w-full h-2 bg-(--bg-card) border border-(--border-color) rounded-full overflow-hidden">
                    <div
                      className="h-full bg-sky-500 rounded-full transition-all duration-500"
                      style={{ width: `${storageUsagePercent}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Legal Documentation & Developer Card */}
          <div className="bg-(--bg-card) border border-(--border-color) p-4 sm:p-5 rounded-2xl space-y-3">
            <div>
              <h3 className="text-sm font-heading tracking-widest uppercase text-(--color-text)">
                Documentation &amp; Support
              </h3>
              <p className="text-xs text-slate-400 mt-0.5 font-semibold">
                Facility terms, agreements, and support contacts.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-(--border-color)">
              <button
                type="button"
                onClick={() => setActiveModal('agreement')}
                className="p-2.5 bg-(--bg-page) border border-(--border-color) rounded-xl flex items-center justify-between hover:border-(--color-primary) transition-all cursor-pointer text-left min-h-[42px]"
              >
                <div className="flex items-center gap-2 truncate">
                  <FileText className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                  <span className="text-[11px] font-bold text-(--color-text) truncate">
                    Agreement
                  </span>
                </div>
                <ChevronRight className="w-3 h-3 text-slate-400 shrink-0" />
              </button>

              <button
                type="button"
                onClick={() => setActiveModal('terms')}
                className="p-2.5 bg-(--bg-page) border border-(--border-color) rounded-xl flex items-center justify-between hover:border-(--color-primary) transition-all cursor-pointer text-left min-h-[42px]"
              >
                <div className="flex items-center gap-2 truncate">
                  <Scale className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                  <span className="text-[11px] font-bold text-(--color-text) truncate">
                    Terms
                  </span>
                </div>
                <ChevronRight className="w-3 h-3 text-slate-400 shrink-0" />
              </button>

              <button
                type="button"
                onClick={() => setActiveModal('privacy')}
                className="p-2.5 bg-(--bg-page) border border-(--border-color) rounded-xl flex items-center justify-between hover:border-(--color-primary) transition-all cursor-pointer text-left min-h-[42px]"
              >
                <div className="flex items-center gap-2 truncate">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <span className="text-[11px] font-bold text-(--color-text) truncate">
                    Privacy
                  </span>
                </div>
                <ChevronRight className="w-3 h-3 text-slate-400 shrink-0" />
              </button>

              <button
                type="button"
                onClick={() => setActiveModal('developer')}
                className="p-2.5 bg-(--bg-page) border border-(--border-color) rounded-xl flex items-center justify-between hover:border-(--color-primary) transition-all cursor-pointer text-left min-h-[42px]"
              >
                <div className="flex items-center gap-2 truncate">
                  <Code2 className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <span className="text-[11px] font-bold text-(--color-text) truncate">
                    Developer
                  </span>
                </div>
                <ChevronRight className="w-3 h-3 text-slate-400 shrink-0" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Full Release Notes & Changelog Modal */}
      {latestRelease && (
        <VersionChangelogModal
          isOpen={isReleaseDetailsOpen}
          onClose={() => setIsReleaseDetailsOpen(false)}
          version={latestRelease.version}
          fallbackNotes={latestRelease.releaseNotes}
        />
      )}

      {/* Shared Modals */}
      <AgreementDocumentViewer
        isOpen={
          activeModal === 'agreement' ||
          activeModal === 'terms' ||
          activeModal === 'privacy'
        }
        onClose={() => setActiveModal(null)}
        initialDocument={
          activeModal === 'agreement' ||
          activeModal === 'terms' ||
          activeModal === 'privacy'
            ? activeModal
            : 'agreement'
        }
      />

      {/* Developer Modal */}
      <Modal
        isOpen={activeModal === 'developer'}
        onClose={() => setActiveModal(null)}
        title="About Developer"
      >
        <div className="space-y-4 font-body text-left text-xs">
          <div className="p-3 bg-(--bg-page) border border-(--border-color) rounded-xl flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-(--color-primary)/10 border border-(--color-primary)/20 flex items-center justify-center text-(--color-primary) shrink-0">
              <Code2 className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-heading tracking-wider uppercase text-(--color-text) text-sm font-bold">
                Adrian R. Angeles
              </h4>
              <p className="text-xs text-(--color-primary-light) font-bold tracking-wider">
                Lead Software Developer
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="font-bold text-xs uppercase tracking-wider text-(--color-text)">
              Direct Inquiries
            </h4>
            <div className="space-y-2">
              <a
                href="tel:09762607481"
                className="flex items-center gap-2.5 p-2.5 rounded-lg border border-(--border-color) bg-(--bg-page) text-(--color-text) hover:border-(--color-primary) transition-colors"
              >
                <Phone className="w-4 h-4 text-(--color-primary)" />
                <span className="font-mono text-xs">09762607481</span>
              </a>
              <a
                href="mailto:adrianangeles2213@gmail.com"
                className="flex items-center gap-2.5 p-2.5 rounded-lg border border-(--border-color) bg-(--bg-page) text-(--color-text) hover:border-(--color-primary) transition-colors"
              >
                <Mail className="w-4 h-4 text-emerald-500" />
                <span className="font-mono text-xs">
                  adrianangeles2213@gmail.com
                </span>
              </a>
            </div>
          </div>

          <div className="pt-2">
            <button
              type="button"
              onClick={() => setActiveModal(null)}
              className="w-full py-2.5 bg-(--bg-input) text-(--color-text) rounded-xl font-heading text-xs uppercase tracking-wider hover:opacity-90 transition-all cursor-pointer text-center"
            >
              Close
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default SystemInformation;
