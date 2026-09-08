// src/pages/download/DownloadPage.tsx

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Smartphone,
  Monitor,
  Download,
  ArrowUp,
  Sun,
  Moon,
  Zap,
  HardDrive,
  ShieldCheck,
  CheckCircle2,
  Info,
  Copy,
  Check,
  Globe,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { toast } from 'react-toastify';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { usePWAInstall } from '../../hooks/usePWAInstall';

import landscapeLogoDark from '../../assets/landscape-logo-dark.webp';
import landscapeLogoLight from '../../assets/landscape-logo-light.webp';
import pkg from '../../../package.json';

import {
  fetchLatestRelease,
  executeAppUpdate,
  formatBytes,
  type AppReleaseInfo,
} from '../../lib/appUpdateService';

interface DownloadPageProps {
  standalone?: boolean;
  onBackToLogin?: () => void;
  theme?: 'dark' | 'light';
  onToggleTheme?: () => void;
  gymLogo?: string;
  appVersion?: string;
}

export const DownloadPage: React.FC<DownloadPageProps> = ({
  standalone = false,
  onBackToLogin,
  theme = 'dark',
  onToggleTheme,
  gymLogo,
  appVersion = pkg.version,
}) => {
  const navigate = useNavigate();
  const { isInstallable, isInstalled, isWindows, install } = usePWAInstall();

  const [androidRelease, setAndroidRelease] = useState<AppReleaseInfo | null>(
    null
  );
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [showWindowsHelp, setShowWindowsHelp] = useState<boolean>(false);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [showNotes, setShowNotes] = useState<boolean>(false);

  const defaultLogo = useMemo(() => {
    return theme === 'dark' ? landscapeLogoDark : landscapeLogoLight;
  }, [theme]);

  const activeLogo = gymLogo || defaultLogo;

  // Fetch only the real Android APK release hosted on Catbox
  const loadReleaseData = useCallback(async () => {
    try {
      const rel = await fetchLatestRelease(appVersion, 'android');
      if (rel) setAndroidRelease(rel);
    } catch (e) {
      console.warn('Failed to fetch Catbox release info:', e);
    }
  }, [appVersion]);

  useEffect(() => {
    loadReleaseData();
  }, [loadReleaseData]);

  const handleBack = () => {
    if (onBackToLogin) {
      onBackToLogin();
    } else if (standalone) {
      navigate('/login');
    }
  };

  // 1-Click Windows PWA Install
  const handleInstallWindows = async () => {
    if (isInstalled) {
      toast.info('Palomar GYM is already installed on this PC.');
      return;
    }

    if (isInstallable) {
      const success = await install();
      if (success) {
        toast.success('Palomar GYM successfully installed to your desktop!');
      }
    } else {
      setShowWindowsHelp(true);
    }
  };

  // Android APK Direct Download from Catbox CDN
  const handleDownloadAndroid = async () => {
    if (!androidRelease) {
      toast.info('Connecting to Catbox CDN mirror, retrying...');
      loadReleaseData();
      return;
    }

    try {
      setIsDownloading(true);
      setDownloadProgress(20);
      await executeAppUpdate(androidRelease, (pct) => {
        setDownloadProgress(pct);
      });
      toast.success(
        'Download started! Check your device notifications to complete installation.'
      );
    } catch (err: any) {
      toast.error(
        'Download failed: ' + (err?.message || 'Check your internet connection')
      );
    } finally {
      setIsDownloading(false);
      setDownloadProgress(0);
    }
  };

  const handleCopyLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedLink(true);
      toast.success('Direct Catbox APK URL copied to clipboard!');
      setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      toast.error('Could not copy URL.');
    }
  };

  const effectiveVersion = androidRelease?.version || appVersion;

  return (
    <div className="w-full min-h-screen bg-slate-50 dark:bg-[#0c0e12] text-slate-900 dark:text-slate-100 font-body transition-colors duration-300 pb-16 relative">
      {/* ─── NAVIGATION BAR ─── */}
      <header className="sticky top-0 z-40 w-full bg-white/80 dark:bg-[#0c0e12]/80 backdrop-blur-md border-b border-slate-200 dark:border-white/10 px-4 sm:px-8 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleBack}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-blue-50 dark:bg-red-950/40 border border-blue-200 dark:border-red-900/50 text-blue-600 dark:text-red-500 hover:bg-blue-600 hover:text-white dark:hover:bg-red-600 dark:hover:text-white transition-all cursor-pointer font-heading font-black text-xs tracking-wider"
            >
              <ArrowUp className="w-4 h-4 -rotate-90" />
              <span>RETURN TO LOGIN</span>
            </button>

            <img
              src={activeLogo}
              alt="Wolf Palomar"
              className="h-8 sm:h-9 object-contain hidden sm:block"
            />
          </div>

          <div className="flex items-center gap-3">
            <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 font-semibold">
              v{effectiveVersion} STABLE
            </span>

            {onToggleTheme && (
              <button
                type="button"
                onClick={onToggleTheme}
                className="p-2 rounded-xl bg-slate-100 dark:bg-neutral-800 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:opacity-90 transition-all cursor-pointer"
                aria-label="Toggle Theme"
              >
                {theme === 'dark' ? (
                  <Sun className="w-4 h-4 text-amber-400" />
                ) : (
                  <Moon className="w-4 h-4 text-indigo-500" />
                )}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ─── HERO HEADER ─── */}
      <section className="px-4 sm:px-8 pt-10 pb-6 max-w-4xl mx-auto text-center">
        <h1 className="text-2xl sm:text-4xl font-heading font-black uppercase tracking-wider text-slate-900 dark:text-white mb-2">
          INSTALL{' '}
          <span className="text-blue-600 dark:text-red-600">WOLF PALOMAR</span>{' '}
          APPS
        </h1>
        <p className="max-w-xl mx-auto text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed font-medium">
          Official clients for reception terminals, coaches, and attendance
          turnstiles. High-speed direct downloads powered by Catbox CDN.
        </p>
      </section>

      {/* ─── FOCUSED APPS GRID (ANDROID & WINDOWS) ─── */}
      <section className="px-4 sm:px-8 max-w-4xl mx-auto mt-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Card 1: Windows Desktop PWA */}
          <div className="flex flex-col justify-between bg-white dark:bg-[#161920] border border-slate-200 dark:border-white/10 rounded-3xl p-6 shadow-sm hover:border-blue-500/50 dark:hover:border-red-600/50 transition-all">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-blue-500/10 dark:bg-red-600/10 text-blue-600 dark:text-red-500 rounded-2xl">
                  <Monitor className="w-7 h-7" />
                </div>
                <span className="px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 text-[10px] font-mono font-bold uppercase tracking-wider border border-blue-200/60 dark:border-blue-900/40">
                  {isWindows ? 'Windows 10 / 11' : 'Desktop PWA'}
                </span>
              </div>

              <h2 className="text-lg font-heading font-black uppercase tracking-wider text-slate-900 dark:text-white mb-1.5">
                Windows Front Desk App
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-5">
                Runs in a clean, borderless standalone window with taskbar
                pinning, instant front-camera QR barcode scanning, and offline
                local cache.
              </p>

              <div className="space-y-2 py-3 border-y border-slate-100 dark:border-white/5 mb-6 text-xs">
                <div className="flex justify-between text-slate-600 dark:text-slate-400">
                  <span>Type:</span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    Desktop Application
                  </span>
                </div>
                <div className="flex justify-between text-slate-600 dark:text-slate-400">
                  <span>Status:</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">
                    {isInstalled
                      ? 'Already Installed'
                      : isInstallable
                        ? 'Ready to Install'
                        : 'Web Supported'}
                  </span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleInstallWindows}
              className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 dark:bg-red-600 dark:hover:bg-red-700 text-white font-heading font-black text-xs tracking-wider uppercase transition-all shadow-md active:scale-98 flex items-center justify-center gap-2 cursor-pointer"
            >
              {isInstalled ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                  <span>ALREADY INSTALLED ON THIS PC</span>
                </>
              ) : isInstallable ? (
                <>
                  <Download className="w-4 h-4" />
                  <span>INSTALL WINDOWS APP</span>
                </>
              ) : (
                <>
                  <Monitor className="w-4 h-4" />
                  <span>INSTALL ON PC</span>
                </>
              )}
            </button>
          </div>

          {/* Card 2: Android Native APK (Powered by Catbox) */}
          <div className="flex flex-col justify-between bg-white dark:bg-[#161920] border border-slate-200 dark:border-white/10 rounded-3xl p-6 shadow-sm hover:border-blue-500/50 dark:hover:border-red-600/50 transition-all">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-2xl">
                  <Smartphone className="w-7 h-7" />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-[10px] font-mono font-bold uppercase flex items-center gap-1">
                    <Globe className="w-3 h-3" />
                    Catbox CDN
                  </span>
                  <span className="px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 text-[10px] font-mono font-bold uppercase tracking-wider border border-emerald-200/60 dark:border-emerald-900/40">
                    v{effectiveVersion}
                  </span>
                </div>
              </div>

              <h2 className="text-lg font-heading font-black uppercase tracking-wider text-slate-900 dark:text-white mb-1.5">
                Android Terminal Client
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-4">
                Capacitor native build for mobile phones, tablets, and handheld
                barcode scanners with hardware camera acceleration.
              </p>

              <div className="space-y-2 py-3 border-y border-slate-100 dark:border-white/5 mb-4 text-xs">
                <div className="flex justify-between text-slate-600 dark:text-slate-400">
                  <span>File Size:</span>
                  <span className="font-bold text-slate-900 dark:text-white font-mono">
                    {androidRelease?.fileSizeBytes
                      ? formatBytes(androidRelease.fileSizeBytes)
                      : '42.8 MB'}
                  </span>
                </div>
                <div className="flex justify-between text-slate-600 dark:text-slate-400">
                  <span>Mirror:</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                    Direct Catbox Link
                  </span>
                </div>
                <div className="flex justify-between text-slate-600 dark:text-slate-400">
                  <span>System:</span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    Android 8.0 or newer
                  </span>
                </div>
              </div>

              {/* Collapsible Release Notes */}
              {androidRelease?.releaseNotes && (
                <div className="mb-4">
                  <button
                    type="button"
                    onClick={() => setShowNotes(!showNotes)}
                    className="flex items-center justify-between w-full text-[11px] font-bold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors py-1 cursor-pointer"
                  >
                    <span>What&apos;s new in v{effectiveVersion}</span>
                    {showNotes ? (
                      <ChevronUp className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5" />
                    )}
                  </button>
                  {showNotes && (
                    <div className="mt-1.5 p-3 rounded-xl bg-slate-50 dark:bg-black/20 border border-slate-200/60 dark:border-white/5 text-[11px] text-slate-600 dark:text-slate-400 whitespace-pre-wrap leading-relaxed">
                      {androidRelease.releaseNotes}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <button
                type="button"
                onClick={handleDownloadAndroid}
                disabled={isDownloading}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-heading font-black text-xs tracking-wider uppercase transition-all shadow-md active:scale-98 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Download
                  className={`w-4 h-4 ${isDownloading ? 'animate-bounce' : ''}`}
                />
                <span>
                  {isDownloading
                    ? `DOWNLOADING (${downloadProgress}%)...`
                    : 'DOWNLOAD ANDROID APK'}
                </span>
              </button>

              {androidRelease?.downloadUrl && (
                <button
                  type="button"
                  onClick={() => handleCopyLink(androidRelease.downloadUrl)}
                  className="w-full py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 font-heading font-bold text-[11px] tracking-wider uppercase transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {copiedLink ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                      <span className="text-emerald-600 dark:text-emerald-400">
                        DIRECT LINK COPIED
                      </span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-slate-500" />
                      <span>COPY DIRECT APK LINK</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ─── TERMINAL FEATURES ─── */}
      <section className="px-4 sm:px-8 max-w-4xl mx-auto mt-12">
        <div className="p-6 rounded-3xl bg-white dark:bg-[#12151c] border border-slate-200 dark:border-white/10">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#161920] border border-slate-200/60 dark:border-white/5">
              <Zap className="w-5 h-5 text-blue-600 dark:text-red-500 mb-2" />
              <h4 className="font-heading font-bold text-xs uppercase text-slate-900 dark:text-white">
                Instant QR Scanning
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                Reads member check-in QR codes in under 200ms using any USB or
                built-in camera.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#161920] border border-slate-200/60 dark:border-white/5">
              <HardDrive className="w-5 h-5 text-emerald-600 dark:text-emerald-400 mb-2" />
              <h4 className="font-heading font-bold text-xs uppercase text-slate-900 dark:text-white">
                Offline Auto-Cache
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                Stores logs locally during internet cuts and automatically syncs
                when back online.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#161920] border border-slate-200/60 dark:border-white/5">
              <ShieldCheck className="w-5 h-5 text-amber-600 dark:text-amber-400 mb-2" />
              <h4 className="font-heading font-bold text-xs uppercase text-slate-900 dark:text-white">
                Turnstile Protection
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                Rejects double taps within configured anti-passback cooldown
                intervals.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── WINDOWS PWA HELP MODAL ─── */}
      <Modal
        isOpen={showWindowsHelp}
        onClose={() => setShowWindowsHelp(false)}
        title="Install Palomar GYM on Windows"
        className="max-w-md text-left p-6 z-[9999]"
      >
        <div className="space-y-4 text-xs text-slate-600 dark:text-slate-300">
          <div className="p-3.5 rounded-2xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/40 flex items-start gap-2.5">
            <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              To install directly to your Windows desktop, use{' '}
              <strong>Google Chrome</strong> or <strong>Microsoft Edge</strong>.
            </p>
          </div>

          <div className="space-y-2.5">
            <div className="flex items-start gap-2.5">
              <span className="w-5 h-5 rounded-full bg-blue-600 dark:bg-red-600 text-white font-bold flex items-center justify-center text-[10px] shrink-0 mt-0.5">
                1
              </span>
              <span>
                Look at the right side of the URL / address bar at the top of
                your browser for the <strong>Install App (⊕)</strong> icon.
              </span>
            </div>

            <div className="flex items-start gap-2.5">
              <span className="w-5 h-5 rounded-full bg-blue-600 dark:bg-red-600 text-white font-bold flex items-center justify-center text-[10px] shrink-0 mt-0.5">
                2
              </span>
              <span>
                Click <strong>Install</strong>. The app will immediately launch
                in its own standalone desktop window.
              </span>
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <Button onClick={() => setShowWindowsHelp(false)}>Got It</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default DownloadPage;
