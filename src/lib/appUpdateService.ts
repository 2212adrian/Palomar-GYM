// src/lib/appUpdateService.ts

import { Capacitor } from '@capacitor/core';
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
 * Handles 'v0.24.2', '0.24.2', etc.
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
      .eq('environment', targetEnv) // 👈 isolates dev from prod
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
 * Execute update download and package installation for Android Capacitor or Web
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

  try {
    if (isNative && platform === 'android') {
      // ─── CAPACITOR ANDROID NATIVE DOWNLOAD ───
      // Uses system browser/download manager to trigger APK installation
      if (onProgress) onProgress(50, release.fileSizeBytes * 0.5, release.fileSizeBytes);

      const opened = window.open(release.downloadUrl, '_system');
      if (!opened) {
        window.location.href = release.downloadUrl;
      }

      if (onProgress) onProgress(100, release.fileSizeBytes, release.fileSizeBytes);

      return {
        success: true,
        message: 'Download started in Android notifications. Tap it when done to install.',
      };
    } else {
      // ─── DESKTOP / BROWSER / PWA DOWNLOAD ───
      // Uses fetch + blob + saveAs to guarantee the proper filename (e.g. palomar-gym-v0.24.2.apk)
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

        // 👈 Cast chunks as `unknown as BlobPart[]` to satisfy TypeScript 5.5+ DOM types
        const blob = new Blob(chunks as unknown as BlobPart[], { 
          type: 'application/vnd.android.package-archive' 
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
    }
  } catch (err: any) {
    console.error('Blob update error, falling back to direct redirect:', err);
    triggerDirectDownload(release.downloadUrl, release.fileName);
    return {
      success: true,
      message: 'Initiated direct download link.',
    };
  }
};

/**
 * Trigger immediate direct file download or open external link
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