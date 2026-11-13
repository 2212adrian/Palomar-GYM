// src/components/common/VersionUpdateManager.tsx
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import {
  fetchLatestRelease,
  getInstalledAppVersion,
  isNewerVersion,
  executeAppUpdate,
  formatBytes,
  type AppReleaseInfo,
} from '../../lib/appUpdateService';
import { Download, RefreshCw, Sparkles, X } from 'lucide-react';
import { toast } from 'react-toastify';
import pkg from '../../../package.json';

const NATIVE_INSTALLED_VER_KEY = 'palomar_native_installed_ver';

export const VersionUpdateManager: React.FC = () => {
  const [availableRelease, setAvailableRelease] = useState<AppReleaseInfo | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [currentVersion, setCurrentVersion] = useState<string>(pkg.version);
  const isCheckingRef = useRef(false);

  // Force restart webview to pull latest assets
  const forceRestartWebview = useCallback(async () => {
    try {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const reg of registrations) {
          await reg.update().catch(() => {});
        }
      }
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k).catch(() => {})));
      }
    } catch (err) {
      console.warn('[VersionUpdateManager] Cache purge error:', err);
    }

    const cleanBaseUrl = window.location.origin + window.location.pathname;
    window.location.replace(`${cleanBaseUrl}?reload=${Date.now()}`);
  }, []);

  const checkVersionMismatch = useCallback(async () => {
    if (isCheckingRef.current) return;
    isCheckingRef.current = true;

    try {
      // Check launch URL if opened via custom scheme or deep link
      try {
        const launchUrlObj = await CapApp.getLaunchUrl();
        if (launchUrlObj?.url) {
          console.debug('[VersionUpdateManager] Launched with URL:', launchUrlObj.url);
        }
      } catch {}

      const isNative = Capacitor.isNativePlatform();
      const info = await getInstalledAppVersion(pkg.version);
      const runningVer = info.version || pkg.version;
      setCurrentVersion(runningVer);

      // Check if native APK was newly updated
      if (isNative) {
        const previousStoredVer = localStorage.getItem(NATIVE_INSTALLED_VER_KEY);
        if (previousStoredVer && isNewerVersion(runningVer, previousStoredVer)) {
          // An APK update was just installed! Update storage, purge caches, and force restart
          localStorage.setItem(NATIVE_INSTALLED_VER_KEY, runningVer);
          toast.success(
            `Palomar Gym successfully upgraded to v${runningVer}. Reloading interface...`,
            { autoClose: 2500 }
          );
          setTimeout(() => {
            forceRestartWebview();
          }, 1200);
          return;
        }
        localStorage.setItem(NATIVE_INSTALLED_VER_KEY, runningVer);
      }

      // Fetch latest release from server
      const latest = await fetchLatestRelease(runningVer, isNative ? 'android' : 'web');
      if (latest && latest.isNewer) {
        setAvailableRelease(latest);
        setIsModalOpen(true);
      } else {
        setAvailableRelease(null);
      }
    } catch (err) {
      console.debug('[VersionUpdateManager] Version check skipped:', err);
    } finally {
      isCheckingRef.current = false;
    }
  }, [forceRestartWebview]);

  // Set up listeners on mount
  useEffect(() => {
    // Initial check
    checkVersionMismatch();

    let appStateListener: any;
    const registerAppStateListener = async () => {
      try {
        appStateListener = await CapApp.addListener('appStateChange', (state) => {
          if (state.isActive) {
            checkVersionMismatch();
          }
        });
      } catch {}
    };

    registerAppStateListener();

    // Check periodically every 15 minutes when app is running
    const intervalTimer = setInterval(() => {
      checkVersionMismatch();
    }, 15 * 60 * 1000);

    return () => {
      clearInterval(intervalTimer);
      if (appStateListener) {
        appStateListener.remove();
      }
    };
  }, [checkVersionMismatch]);

  const handleDownloadAndInstall = async () => {
    if (!availableRelease) return;
    setIsUpdating(true);
    setDownloadProgress(0);

    try {
      const result = await executeAppUpdate(availableRelease, (percent) => {
        setDownloadProgress(percent);
      });

      if (result.permissionRequired) {
        toast.info(result.message);
      } else if (result.success) {
        toast.success(result.message);
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to download update.');
    } finally {
      setIsUpdating(false);
      setDownloadProgress(null);
    }
  };

  if (!isModalOpen || !availableRelease) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="bg-white dark:bg-[#151921] border border-blue-500/30 rounded-2xl max-w-md w-full shadow-2xl overflow-hidden p-6 relative flex flex-col gap-4 text-slate-900 dark:text-slate-100">
        <button
          type="button"
          onClick={() => setIsModalOpen(false)}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-200 p-1 rounded-lg"
          title="Dismiss notification"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-500 shrink-0">
            <Sparkles className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h3 className="font-heading text-sm font-bold tracking-wider uppercase">
              New Version Available
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              v{availableRelease.version} is ready to install (current: v{currentVersion})
            </p>
          </div>
        </div>

        <div className="bg-slate-50 dark:bg-black/30 border border-slate-200 dark:border-white/5 rounded-xl p-3.5 space-y-2 text-xs">
          <div className="flex justify-between items-center text-[11px] text-slate-500 dark:text-slate-400 font-mono">
            <span>Size: {formatBytes(availableRelease.fileSizeBytes)}</span>
            <span>Platform: {availableRelease.platform}</span>
          </div>
          <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
            {availableRelease.releaseNotes ||
              'Stability updates, performance improvements, and offline synchronization upgrades.'}
          </p>
        </div>

        {downloadProgress !== null && (
          <div className="space-y-1.5">
            <div className="flex justify-between text-[11px] font-mono">
              <span>Downloading update...</span>
              <span>{downloadProgress}%</span>
            </div>
            <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
              <div
                className="bg-blue-600 h-full transition-all duration-300"
                style={{ width: `${downloadProgress}%` }}
              />
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2 pt-2">
          <button
            type="button"
            onClick={handleDownloadAndInstall}
            disabled={isUpdating}
            className="flex-1 py-2.5 px-4 bg-(--color-primary) hover:bg-(--color-primary-hover) disabled:opacity-50 text-white rounded-xl text-xs font-heading font-bold uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-md transition-all active:scale-95"
          >
            {isUpdating ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Downloading...</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                <span>Download & Install</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={forceRestartWebview}
            className="py-2.5 px-4 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-heading font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer transition-all active:scale-95"
            title="Purges cached assets and reloads webview"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Force Restart</span>
          </button>
        </div>
      </div>
    </div>
  );
};
