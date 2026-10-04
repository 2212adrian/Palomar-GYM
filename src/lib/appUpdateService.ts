// src/lib/appUpdateService.ts

import { App as CapApp } from '@capacitor/app';
import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { saveAs } from 'file-saver';
import { supabase } from './supabase/client';

export interface AppReleaseInfo {
  id?: string;
  version: string;
  downloadUrl: string;
  fileSizeBytes: number;
  releaseNotes: string;
  platform: 'android' | 'ios' | 'windows' | string;
  environment: 'development' | 'production' | string;
  isNewer: boolean;
  storageHost: string;
  publishedAt?: string;
  updatedAt?: string;
  fileName: string;
  tagName: string;
}

export interface DownloadProgress {
  percent: number;
  loadedBytes: number;
  totalBytes: number;
}

export interface AppInstallerPluginInterface {
  canRequestPackageInstalls(): Promise<{ value: boolean }>;
  openInstallPermissionSettings(): Promise<void>;
  downloadAndInstall(options: { url: string; fileName: string }): Promise<{
    success: boolean;
    permissionRequired?: boolean;
    message?: string;
  }>;
  installApk(options: { fileName: string }): Promise<{
    success: boolean;
    permissionRequired?: boolean;
    message?: string;
  }>;
  addListener(
    eventName: 'downloadProgress',
    listenerFunc: (progress: DownloadProgress) => void
  ): Promise<PluginListenerHandle>;
  removeAllListeners(): Promise<void>;
}

export const NativeAppInstaller = registerPlugin<AppInstallerPluginInterface>('AppInstaller');

/**
 * Format raw bytes into human-readable sizes (e.g., 42.8 MB)
 */
export const formatBytes = (bytes: number, decimals = 1): string => {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
};

/**
 * Compare semantic versions. Returns true if candidate is strictly newer than current.
 */
export const isNewerVersion = (candidate: string, current: string): boolean => {
  if (!candidate || !current) return false;

  const sanitize = (v: string) =>
    String(v)
      .trim()
      .replace(/^v/i, '')
      .split('-')[0]
      .split('.')
      .map((part) => parseInt(part, 10) || 0);

  const [cMaj = 0, cMin = 0, cPatch = 0] = sanitize(candidate);
  const [curMaj = 0, curMin = 0, curPatch = 0] = sanitize(current);

  if (cMaj > curMaj) return true;
  if (cMaj < curMaj) return false;
  if (cMin > curMin) return true;
  if (cMin < curMin) return false;
  return cPatch > curPatch;
};

/**
 * Compare semantic versions. Returns true if candidate is strictly older than current.
 */
export const isOlderVersion = (candidate: string, current: string): boolean => {
  if (!candidate || !current) return false;
  return isNewerVersion(current, candidate);
};

/**
 * Detect the actual installed/running version on the current device.
 * On Capacitor Android/iOS, queries the native package manager (`CapApp.getInfo()`)
 * so that if an older APK (e.g., v0.18.0) is installed on Android, it reports
 * the true native APK version rather than a cached value.
 */
export const getInstalledAppVersion = async (
  fallbackVersion: string
): Promise<{
  version: string;
  build?: string;
  isNative: boolean;
  platform: string;
}> => {
  const isNative = Capacitor.isNativePlatform();
  const platform = Capacitor.getPlatform();
  const cleanFallback = String(fallbackVersion || '0.0.0').replace(/^v/i, '');

  if (isNative) {
    try {
      const info = await CapApp.getInfo();
      const nativeVer = info?.version ? String(info.version).replace(/^v/i, '') : '';
      // If native version is valid and not the generic "1.0.0" fallback when package.json wasn't read
      if (nativeVer && nativeVer !== '1.0.0') {
        return {
          version: nativeVer,
          build: info.build,
          isNative: true,
          platform,
        };
      }
    } catch {
      // Fallback to bundled package.json version
    }
  }

  return {
    version: cleanFallback,
    isNative,
    platform,
  };
};

const isUsableDownloadUrl = (url?: string | null): boolean => {
  if (!url) return false;
  const trimmed = url.trim();
  return (
    trimmed.startsWith('http') &&
    !trimmed.includes('paste-your-download-link-here.com')
  );
};

/**
 * Fetch the latest active release from Supabase `app_releases` table.
 * Intelligently evaluates all active rows in `app_releases` so that version checks
 * on Capacitor Android and Web never miss a newer release due to environment
 * ('production' vs 'development') or platform ('web' vs 'android') mismatches.
 */
export const fetchLatestRelease = async (
  currentAppVersion: string,
  targetPlatform: 'android' | 'ios' | 'windows' | 'web' | string = 'android',
  targetEnv: string = import.meta.env.MODE || 'production'
): Promise<AppReleaseInfo | null> => {
  try {
    const { data: rows, error } = await supabase
      .from('app_releases')
      .select('*')
      .order('updated_at', { ascending: false })
      .order('created_at', { ascending: false });

    if (error || !rows || rows.length === 0) {
      return null;
    }

    // Keep rows where is_active is true or null (not explicitly deactivated)
    const activeRows = rows.filter((r: any) => r.is_active !== false);
    const pool = activeRows.length > 0 ? activeRows : rows;

    const normalizedPlatform =
      !targetPlatform || targetPlatform.toLowerCase() === 'web'
        ? 'android'
        : targetPlatform.toLowerCase();

    const platformMatches = pool.filter(
      (r: any) => String(r.platform || 'android').toLowerCase() === normalizedPlatform
    );

    const candidates = platformMatches.length > 0 ? platformMatches : pool;

    // Sort candidates:
    // 1. Highest semantic version first (so v0.18.1 beats v0.18.0 regardless of dev/prod row)
    // 2. Usable download URL preferred
    // 3. Matching environment preferred
    // 4. Most recent updated_at / created_at
    const sorted = [...candidates].sort((a: any, b: any) => {
      const verA = String(a.version || '0.0.0').replace(/^v/i, '');
      const verB = String(b.version || '0.0.0').replace(/^v/i, '');

      if (verA !== verB) {
        return isNewerVersion(verA, verB) ? -1 : 1;
      }

      const urlA = isUsableDownloadUrl(a.download_url) ? 1 : 0;
      const urlB = isUsableDownloadUrl(b.download_url) ? 1 : 0;
      if (urlA !== urlB) return urlB - urlA;

      const envA = String(a.environment || '').toLowerCase() === targetEnv.toLowerCase() ? 1 : 0;
      const envB = String(b.environment || '').toLowerCase() === targetEnv.toLowerCase() ? 1 : 0;
      if (envA !== envB) return envB - envA;

      const timeA = new Date(a.updated_at || a.created_at || 0).getTime();
      const timeB = new Date(b.updated_at || b.created_at || 0).getTime();
      return timeB - timeA;
    });

    const best = sorted[0];
    if (!best) return null;

    // If the highest-version row doesn't have a usable download_url, check if another row has one
    const fallbackUrlRow = sorted.find((r: any) => isUsableDownloadUrl(r.download_url));
    const resolvedDownloadUrl = isUsableDownloadUrl(best.download_url)
      ? best.download_url
      : fallbackUrlRow?.download_url || best.download_url || '';

    const cleanVersion = String(best.version || currentAppVersion)
      .trim()
      .replace(/^v/i, '');
    const cleanCurrent = String(currentAppVersion || '0.0.0')
      .trim()
      .replace(/^v/i, '');
    const resolvedEnv = best.environment || targetEnv;
    const isDev = resolvedEnv === 'development';
    const fallbackFileName = `palomar-gym-v${cleanVersion}${isDev ? '-dev' : ''}.apk`;
    const fileName = best.file_name || fallbackFileName;

    const releaseInfo: AppReleaseInfo = {
      id: best.id,
      version: cleanVersion,
      tagName: `v${cleanVersion}`,
      fileName,
      downloadUrl: resolvedDownloadUrl,
      fileSizeBytes: Number(best.file_size_bytes || fallbackUrlRow?.file_size_bytes || 0),
      releaseNotes:
        best.release_notes ||
        'Stability enhancements, security updates, and performance improvements.',
      publishedAt: best.updated_at || best.created_at,
      updatedAt: best.updated_at || best.created_at,
      platform: best.platform || normalizedPlatform,
      environment: resolvedEnv,
      isNewer: isNewerVersion(cleanVersion, cleanCurrent),
      storageHost: best.storage_host || 'Host Service CDN',
    };

    return releaseInfo;
  } catch (err) {
    console.error('Failed to fetch release from Supabase:', err);
    return null;
  }
};

/**
 * Execute update download and package installation
 */
export const executeAppUpdate = async (
  release: AppReleaseInfo,
  onProgress?: (percent: number, loadedBytes?: number, totalBytes?: number) => void
): Promise<{ success: boolean; permissionRequired?: boolean; message: string }> => {
  if (!release.downloadUrl || !isUsableDownloadUrl(release.downloadUrl)) {
    throw new Error('Release download URL is not configured in app_releases.');
  }

  const isNative = Capacitor.isNativePlatform();
  const platform = Capacitor.getPlatform();

  // ─── NATIVE ANDROID DIRECT INSTALL FLOW ───
  if (isNative && platform === 'android') {
    let progressListener: PluginListenerHandle | null = null;

    if (onProgress) {
      try {
        progressListener = await NativeAppInstaller.addListener(
          'downloadProgress',
          (data: DownloadProgress) => {
            onProgress(data.percent, data.loadedBytes, data.totalBytes);
          }
        );
      } catch {
        // Ignore listener registration error
      }
    }

    try {
      const result = await NativeAppInstaller.downloadAndInstall({
        url: release.downloadUrl,
        fileName: release.fileName || `palomar-gym-v${release.version}.apk`,
      });

      if (result.permissionRequired) {
        return {
          success: false,
          permissionRequired: true,
          message:
            "Please allow 'Install unknown apps' in Android settings, then tap Update again.",
        };
      }

      return {
        success: true,
        message: 'Installer launched. Please confirm the installation prompt.',
      };
    } catch (nativeErr) {
      console.warn(
        'NativeAppInstaller download failed, falling back to direct system download:',
        nativeErr
      );
      triggerDirectDownload(release.downloadUrl, release.fileName);
      return {
        success: true,
        message:
          'Update download started in system browser. Open the downloaded APK notification to install.',
      };
    } finally {
      if (progressListener) {
        await progressListener.remove().catch(() => {});
      }
    }
  }

  // ─── DESKTOP / BROWSER / PWA DOWNLOAD FLOW (WITH CORS FALLBACK) ───
  try {
    if (onProgress) onProgress(5, 0, release.fileSizeBytes);

    const response = await fetch(release.downloadUrl);
    if (!response.ok) throw new Error(`HTTP error ${response.status}`);

    const contentLength = response.headers.get('content-length');
    const total = contentLength
      ? parseInt(contentLength, 10)
      : release.fileSizeBytes;

    if (response.body && total > 0) {
      const reader = response.body.getReader();
      let received = 0;
      const chunks: Uint8Array[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          received += value.length;
        }
        if (onProgress) {
          const percent = Math.min(100, Math.round((received / total) * 100));
          onProgress(percent, received, total);
        }
      }

      const blob = new Blob(chunks as unknown as BlobPart[], {
        type: 'application/vnd.android.package-archive',
      });
      saveAs(blob, release.fileName);
    } else {
      const blob = await response.blob();
      saveAs(blob, release.fileName);
      if (onProgress)
        onProgress(100, release.fileSizeBytes, release.fileSizeBytes);
    }

    return {
      success: true,
      message: `Saved as ${release.fileName}.`,
    };
  } catch {
    // Fallback to direct anchor download if CDN blocks fetch via CORS
    if (onProgress)
      onProgress(100, release.fileSizeBytes, release.fileSizeBytes);
    triggerDirectDownload(release.downloadUrl, release.fileName);
    return {
      success: true,
      message: `Download started for ${release.fileName}.`,
    };
  }
};

/**
 * Reloads the PWA / Web application to apply pending updates.
 * Updates service workers and clears caches where applicable.
 */
export const reloadPwaApp = async (): Promise<void> => {
  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const reg of registrations) {
        await reg.update().catch(() => {});
      }
    }
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key).catch(() => {})));
    }
  } catch (err) {
    console.warn('[PWA] Service worker update check error:', err);
  } finally {
    // Reload page from server
    window.location.reload();
  }
};

/**
 * Trigger immediate direct file download or open external link (fallback)
 */
export const triggerDirectDownload = (url: string, fileName?: string): void => {
  try {
    if (Capacitor.isNativePlatform()) {
      const opened = window.open(url, '_system');
      if (!opened) window.location.href = url;
    } else {
      const link = document.createElement('a');
      link.href = url;
      if (fileName) link.download = fileName;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  } catch {
    window.location.href = url;
  }
};