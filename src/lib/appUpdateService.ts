// src/lib/appUpdateService.ts

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
    v
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
 * Fetch the latest active release from Supabase app_releases matching current environment (dev/prod)
 */
export const fetchLatestRelease = async (
  currentAppVersion: string,
  targetPlatform: 'android' | 'ios' | 'windows' | string = 'android',
  targetEnv: string = import.meta.env.MODE || 'production'
): Promise<AppReleaseInfo | null> => {
  try {
    const { data, error } = await supabase
      .from('app_releases')
      .select('*')
      .eq('platform', targetPlatform)
      .eq('environment', targetEnv)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data || !data.download_url) {
      return null;
    }

    const cleanVersion = data.version.replace(/^v/i, '');
    const isDev = targetEnv === 'development';
    const fallbackFileName = `palomar-gym-v${cleanVersion}${isDev ? '-dev' : ''}.apk`;
    const fileName = data.file_name || fallbackFileName;

    const releaseInfo: AppReleaseInfo = {
      id: data.id,
      version: cleanVersion,
      tagName: `v${cleanVersion}`,
      fileName,
      downloadUrl: data.download_url,
      fileSizeBytes: Number(data.file_size_bytes || 0),
      releaseNotes: data.release_notes || 'Stability enhancements and performance updates.',
      publishedAt: data.created_at,
      platform: data.platform || targetPlatform,
      environment: data.environment || targetEnv,
      isNewer: isNewerVersion(cleanVersion, currentAppVersion),
      storageHost: data.storage_host || 'Catbox CDN',
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
): Promise<{ success: boolean; message: string }> => {
  if (!release.downloadUrl) {
    throw new Error('Release download URL is missing.');
  }

  const isNative = Capacitor.isNativePlatform();
  const platform = Capacitor.getPlatform();

  // ─── NATIVE ANDROID DIRECT INSTALL FLOW ───
  if (isNative && platform === 'android') {
    let progressListener: PluginListenerHandle | null = null;

    if (onProgress) {
      progressListener = await NativeAppInstaller.addListener('downloadProgress', (data: DownloadProgress) => {
        onProgress(data.percent, data.loadedBytes, data.totalBytes);
      });
    }

    try {
      const result = await NativeAppInstaller.downloadAndInstall({
        url: release.downloadUrl,
        fileName: release.fileName,
      });

      if (result.permissionRequired) {
        return {
          success: false,
          message: "Please allow 'Install unknown apps' in the system settings, then tap Download again.",
        };
      }

      return {
        success: true,
        message: 'Installer launched. Please confirm the installation prompt.',
      };
    } finally {
      if (progressListener) {
        await progressListener.remove().catch(() => {});
      }
    }
  }

  // ─── DESKTOP / BROWSER / PWA DOWNLOAD FLOW (UNCHANGED) ───
  if (onProgress) onProgress(5, 0, release.fileSizeBytes);

  const response = await fetch(release.downloadUrl);
  if (!response.ok) throw new Error(`HTTP error ${response.status}`);

  const contentLength = response.headers.get('content-length');
  const total = contentLength ? parseInt(contentLength, 10) : release.fileSizeBytes;

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
    if (onProgress) onProgress(100, release.fileSizeBytes, release.fileSizeBytes);
  }

  return {
    success: true,
    message: `Saved as ${release.fileName}.`,
  };
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