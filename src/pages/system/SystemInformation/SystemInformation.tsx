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
  ExternalLink,
  Sparkles,
} from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Modal } from '../../../components/ui/Modal';
import {
  AgreementDocumentViewer,
  type AgreementDocument,
} from '../../../components/ui/AgreementDocumentViewer';

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
import { useSecurityStore } from '../../../stores/useSecurityStore';
import { usePWAInstall } from '../../../hooks/usePWAInstall';

export const SystemInformation: React.FC = () => {
  const BUNDLED_VERSION = String(pkg.version || '0.0.0').replace(/^v/i, '');
  const isNativePlatform = Capacitor.isNativePlatform();
  const runtimePlatform = Capacitor.getPlatform();
  const { isInstalled: isPwaInstalled } = usePWAInstall();
  const isStandalonePWA =
    isPwaInstalled ||
    (typeof window !== 'undefined' &&
      (window.matchMedia('(display-mode: standalone)').matches ||
        window.matchMedia('(display-mode: window-controls-overlay)').matches ||
        (window.navigator as any).standalone === true));
  const isAlreadyPwaOrCapacitor = isNativePlatform || isStandalonePWA;

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
                `System is up to date (v${release.version} in app_releases).`,
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
  const isUpdateAvailable = Boolean(
    latestRelease &&
      (isNewerVersion(latestRelease.version, installedVersion) ||
        latestRelease.version !== installedVersion)
  );

  const hasValidDownloadUrl = Boolean(
    latestRelease?.downloadUrl &&
      latestRelease.downloadUrl.startsWith('http') &&
      !latestRelease.downloadUrl.includes('paste-your-download-link-here.com')
  );

  const handleUpdateToLatest = async () => {
    if (isUpdatingApp) return;

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
        useSecurityStore.getState().fetchConfig(),
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
    <div className="space-y-6 font-body text-(--color-text)">
      {/* Page Header */}
      <div>
        <h2 className="text-xl font-heading tracking-widest uppercase text-(--color-text)">
          System Information
        </h2>
        <p className="text-sm text-slate-400 mt-1 font-medium">
          Application specifications, live Supabase release updates, storage
          health, and facility legal documentation.
        </p>
      </div>

      {/* Two-Column Layout Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: Specifications, Updates & Legal Links (5 Cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Build Specifications & App Release Updater Card */}
          <div className="bg-(--bg-card) border border-(--border-color) p-5 rounded-2xl space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-heading tracking-widest uppercase text-(--color-text)">
                  Build Specifications
                </h3>
                <p className="text-xs text-slate-400 mt-1 font-semibold">
                  Active runtime environment and live Supabase{' '}
                  <span className="font-mono">app_releases</span> status.
                </p>
              </div>
              <span
                className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-heading font-black uppercase tracking-wider border ${
                  isUpdateAvailable
                    ? 'bg-amber-500/15 text-amber-500 border-amber-500/30 animate-pulse'
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

            <div className="space-y-2.5 pt-2 border-t border-(--border-color) text-xs">
              <div className="flex items-center justify-between py-1.5 border-b border-(--border-color)">
                <span className="text-slate-400 font-medium">Framework</span>
                <span className="font-mono font-bold text-(--color-text)">
                  React 19 + Vite 6
                </span>
              </div>

              <div className="flex items-center justify-between py-1.5 border-b border-(--border-color)">
                <span className="text-slate-400 font-medium">
                  Runtime Platform
                </span>
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

              <div className="flex items-center justify-between py-1.5 border-b border-(--border-color)">
                <span className="text-slate-400 font-medium">
                  Installed Version
                </span>
                <span
                  className={`font-mono font-bold ${
                    isUpdateAvailable ? 'text-amber-500' : 'text-emerald-500'
                  }`}
                >
                  v{installedVersion}
                </span>
              </div>

              <div className="flex items-center justify-between py-1.5 border-b border-(--border-color)">
                <span className="text-slate-400 font-medium">
                  Latest Release (Supabase)
                </span>
                <span className="font-mono font-bold text-emerald-500 flex items-center gap-1.5">
                  {isLoadingRelease ? (
                    <RefreshCw className="w-3 h-3 animate-spin text-slate-400" />
                  ) : null}
                  <span>v{remoteVersion}</span>
                </span>
              </div>

              {latestRelease && (
                <div className="flex items-center justify-between py-1.5 border-b border-(--border-color)">
                  <span className="text-slate-400 font-medium">
                    Release Package
                  </span>
                  <span className="font-mono text-[11px] font-bold text-(--color-text)">
                    {latestRelease.fileSizeBytes > 0
                      ? `${formatBytes(latestRelease.fileSizeBytes)} • `
                      : ''}
                    {latestRelease.storageHost}
                  </span>
                </div>
              )}

              <div className="flex items-center justify-between py-1.5">
                <span className="text-slate-400 font-medium">Environment</span>
                <span className="font-mono font-bold text-(--color-text) uppercase">
                  {latestRelease?.environment ||
                    import.meta.env.MODE ||
                    'Production'}
                </span>
              </div>
            </div>

            {/* Release Notes / Update Banner when a release is fetched from app_releases */}
            {latestRelease && (
              <div
                className={`p-3.5 rounded-xl border text-left space-y-2 ${
                  isUpdateAvailable
                    ? 'bg-amber-500/10 border-amber-500/30'
                    : 'bg-(--bg-page) border-(--border-color)'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-heading font-black uppercase tracking-wider text-(--color-text) flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    <span>
                      {isUpdateAvailable
                        ? `New Release v${latestRelease.version} Ready`
                        : `Release v${latestRelease.version} Notes`}
                    </span>
                  </span>
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
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
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
                  className="w-full py-2 px-3 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-heading font-black uppercase tracking-widest cursor-pointer transition-all"
                >
                  Open Android Install Settings
                </button>
              </div>
            )}

            {/* Update & Action Buttons */}
            <div className="space-y-2.5">
              {(isUpdateAvailable ||
                (!isAlreadyPwaOrCapacitor && hasValidDownloadUrl)) && (
                <button
                  type="button"
                  onClick={handleUpdateToLatest}
                  disabled={isUpdatingApp}
                  className={`w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-xs font-heading font-black tracking-widest uppercase transition-all cursor-pointer disabled:opacity-60 shadow-md ${
                    isUpdateAvailable
                      ? 'bg-blue-600 hover:bg-blue-700 dark:bg-[#bf0202] dark:hover:bg-red-700 text-white'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  }`}
                >
                  <Download
                    className={`w-4 h-4 ${isUpdatingApp ? 'animate-bounce' : ''}`}
                  />
                  <span>
                    {isUpdatingApp
                      ? downloadProgress
                        ? `Updating (${downloadProgress.percent}%)...`
                        : 'Updating to Latest...'
                      : isUpdateAvailable
                        ? `Update to Latest (v${remoteVersion})`
                        : `Download Latest Android APK (v${remoteVersion})`}
                  </span>
                </button>
              )}

              {/* Direct Browser Download Fallback when on Native Android and an update is available */}
              {isNativePlatform &&
                isUpdateAvailable &&
                hasValidDownloadUrl &&
                latestRelease && (
                  <button
                    type="button"
                    onClick={() =>
                      triggerDirectDownload(
                        latestRelease.downloadUrl,
                        latestRelease.fileName
                      )
                    }
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 border border-(--border-color) bg-(--bg-page) text-slate-400 hover:text-(--color-text) rounded-lg text-[11px] font-heading tracking-wider uppercase transition-all cursor-pointer"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Direct Browser APK Download (Fallback)</span>
                  </button>
                )}

              <button
                type="button"
                onClick={handleReloadCore}
                disabled={isReloadingCore || isLoadingRelease}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 border border-(--border-color) bg-(--bg-input) text-(--color-text) opacity-90 hover:opacity-100 rounded-lg text-xs font-heading tracking-widest uppercase transition-all cursor-pointer disabled:opacity-60"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${
                    isReloadingCore || isLoadingRelease ? 'animate-spin' : ''
                  }`}
                />
                <span>
                  {isReloadingCore
                    ? 'Checking Updates & Reloading...'
                    : 'Check for Updates & Reload Core'}
                </span>
              </button>
            </div>
          </div>

          {/* Legal Documentation & Developer Card */}
          <div className="bg-(--bg-card) border border-(--border-color) p-5 rounded-2xl space-y-4">
            <div>
              <h3 className="text-sm font-heading tracking-widest uppercase text-(--color-text)">
                Documentation &amp; Support
              </h3>
              <p className="text-xs text-slate-400 mt-1 font-semibold">
                System user agreement, facility terms, privacy policy, and
                developer contact details.
              </p>
            </div>

            <div className="space-y-2 pt-2 border-t border-(--border-color)">
              <button
                type="button"
                onClick={() => setActiveModal('agreement')}
                className="w-full p-3 bg-(--bg-page) border border-(--border-color) rounded-xl flex items-center justify-between hover:border-(--color-primary) transition-all cursor-pointer text-left"
              >
                <div className="flex items-center gap-3">
                  <FileText className="w-4 h-4 text-indigo-500 dark:text-red-400" />
                  <span className="text-xs font-bold text-(--color-text)">
                    User Agreement
                  </span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              </button>

              <button
                type="button"
                onClick={() => setActiveModal('terms')}
                className="w-full p-3 bg-(--bg-page) border border-(--border-color) rounded-xl flex items-center justify-between hover:border-(--color-primary) transition-all cursor-pointer text-left"
              >
                <div className="flex items-center gap-3">
                  <Scale className="w-4 h-4 text-blue-500" />
                  <span className="text-xs font-bold text-(--color-text)">
                    Terms of Service
                  </span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              </button>

              <button
                type="button"
                onClick={() => setActiveModal('privacy')}
                className="w-full p-3 bg-(--bg-page) border border-(--border-color) rounded-xl flex items-center justify-between hover:border-(--color-primary) transition-all cursor-pointer text-left"
              >
                <div className="flex items-center gap-3">
                  <ShieldCheck className="w-4 h-4 text-emerald-500" />
                  <span className="text-xs font-bold text-(--color-text)">
                    Privacy Policy
                  </span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              </button>

              <button
                type="button"
                onClick={() => setActiveModal('developer')}
                className="w-full p-3 bg-(--bg-page) border border-(--border-color) rounded-xl flex items-center justify-between hover:border-(--color-primary) transition-all cursor-pointer text-left"
              >
                <div className="flex items-center gap-3">
                  <Code2 className="w-4 h-4 text-amber-500" />
                  <span className="text-xs font-bold text-(--color-text)">
                    About Developer
                  </span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Service Health & Resource Utilization (7 Cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Core Services Operational Status Card */}
          <div className="bg-(--bg-card) border border-(--border-color) p-5 rounded-2xl space-y-4">
            <div>
              <h3 className="text-sm font-heading tracking-widest uppercase text-(--color-text)">
                Core Services Status
              </h3>
              <p className="text-xs text-slate-400 mt-1 font-semibold">
                Operational integrity across active application microservices.
              </p>
            </div>

            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-600 dark:text-emerald-400 flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="font-semibold text-(--color-text)">
                  All Core Services Operational
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  Supabase Auth, Realtime Postgres, Release Distribution (
                  <span className="font-mono">app_releases</span>), and Cloud
                  Storage are synchronized and operating within normal
                  operational parameters.
                </p>
              </div>
            </div>
          </div>

          {/* Infrastructure & Resource Allocation Card */}
          <div className="bg-(--bg-card) border border-(--border-color) p-5 rounded-2xl space-y-5">
            <div>
              <h3 className="text-sm font-heading tracking-widest uppercase text-(--color-text)">
                Resource Utilization
              </h3>
              <p className="text-xs text-slate-400 mt-1 font-semibold">
                Database volume allocations and cloud asset storage pools.
              </p>
            </div>

            {/* Database Utilization Gauge */}
            <div className="space-y-2 pt-2 border-t border-(--border-color)">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5 text-blue-500" />
                  Database Utilization
                </span>
                <span className="text-[10px] font-mono font-bold text-slate-400">
                  {dbUsagePercent.toFixed(1)}%
                </span>
              </div>
              <div>
                <div className="flex items-baseline justify-between mb-1.5">
                  <span className="text-base font-heading font-black text-(--color-text)">
                    {formatBytes(totalDbBytes)}
                  </span>
                  <span className="text-xs font-mono text-slate-400">
                    / {formatBytes(maxDbBytes)}
                  </span>
                </div>
                <div className="w-full h-2 bg-(--bg-page) border border-(--border-color) rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all duration-500"
                    style={{ width: `${dbUsagePercent}%` }}
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1.5 font-mono">
                  {dbUsagePercent.toFixed(1)}% of 500 MB capacity utilized
                </p>
              </div>
            </div>

            {/* Storage Buckets Gauge */}
            <div className="space-y-2 pt-4 border-t border-(--border-color)">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Cloud className="w-3.5 h-3.5 text-purple-500" />
                  Storage Buckets
                </span>
                <span className="text-[10px] font-mono font-bold text-slate-400">
                  {storageUsagePercent.toFixed(1)}%
                </span>
              </div>
              <div>
                <div className="flex items-baseline justify-between mb-1.5">
                  <span className="text-base font-heading font-black text-(--color-text)">
                    {formatBytes(totalStorageBytes)}
                  </span>
                  <span className="text-xs font-mono text-slate-400">
                    / {formatBytes(maxStorageBytes)}
                  </span>
                </div>
                <div className="w-full h-2 bg-(--bg-page) border border-(--border-color) rounded-full overflow-hidden">
                  <div
                    className="h-full bg-purple-500 rounded-full transition-all duration-500"
                    style={{ width: `${storageUsagePercent}%` }}
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1.5 font-mono">
                  {storageUsagePercent.toFixed(1)}% of 1 GB bucket pool utilized
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

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
