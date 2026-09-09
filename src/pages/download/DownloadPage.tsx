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
  WifiOff,
  Sparkles,
  Layers,
  CheckCircle2,
  Info,
  Copy,
  Check,
  Star,
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

  const loadReleaseData = useCallback(async () => {
    try {
      const rel = await fetchLatestRelease(appVersion, 'android');
      if (rel) setAndroidRelease(rel);
    } catch (e) {
      console.warn('Failed to fetch release info:', e);
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

  // 1-Click PWA Install (PC / Web)
  const handleInstallWindows = async () => {
    if (isInstalled) {
      toast.info('Palomar GYM is already installed on this device.');
      return;
    }

    if (isInstallable) {
      const success = await install();
      if (success) {
        toast.success('Palomar GYM successfully installed!');
      }
    } else {
      setShowWindowsHelp(true);
    }
  };

  // Android APK Direct Download
  const handleDownloadAndroid = async () => {
    if (!androidRelease) {
      toast.info('Connecting to download mirror, please wait...');
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
        'Download started! Check your phone notifications to install the app.'
      );
    } catch (err: any) {
      toast.error(
        'Download failed: ' +
          (err?.message || 'Please check your internet connection')
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
      toast.success('Download link copied to clipboard!');
      setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      toast.error('Could not copy download link.');
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
              v{effectiveVersion}
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
          GET THE{' '}
          <span className="text-blue-600 dark:text-red-600">WOLF PALOMAR</span>{' '}
          APP
        </h1>
        <p className="max-w-xl mx-auto text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed font-medium">
          Fast, smooth, and designed for daily gym use. We highly recommend the
          Android Phone App for staff and mobile devices, or the Web App for
          front desk computers.
        </p>
      </section>

      {/* ─── APPS GRID ─── */}
      <section className="px-4 sm:px-8 max-w-4xl mx-auto mt-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
          {/* Card 1: Android App (HIGHLY RECOMMENDED) */}
          <div className="relative flex flex-col justify-between bg-white dark:bg-[#161920] border-2 border-emerald-500/70 dark:border-emerald-500/60 rounded-3xl p-6 shadow-xl shadow-emerald-500/5 transition-all">
            {/* Recommendation Ribbon */}
            <div className="absolute -top-3.5 left-6 bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-[10px] font-heading font-black tracking-widest uppercase px-3 py-1 rounded-full shadow-md flex items-center gap-1.5">
              <Star className="w-3 h-3 fill-white" />
              <span>HIGHLY RECOMMENDED</span>
            </div>

            <div className="pt-2">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-2xl">
                  <Smartphone className="w-7 h-7" />
                </div>
                <span className="px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 text-[10px] font-mono font-bold uppercase tracking-wider border border-emerald-200/60 dark:border-emerald-900/40">
                  Android Phone &amp; Tablet
                </span>
              </div>

              <h2 className="text-lg font-heading font-black uppercase tracking-wider text-slate-900 dark:text-white mb-1.5">
                Android Phone App
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-4">
                The fastest and most convenient version for coaches, trainers,
                and staff. Works directly on your phone, opens instantly, and
                saves you mobile data.
              </p>

              <div className="space-y-2 py-3 border-y border-slate-100 dark:border-white/5 mb-4 text-xs">
                <div className="flex justify-between text-slate-600 dark:text-slate-400">
                  <span>Works on:</span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    Android 8.0 or newer
                  </span>
                </div>
                <div className="flex justify-between text-slate-600 dark:text-slate-400">
                  <span>Download Size:</span>
                  <span className="font-bold text-slate-900 dark:text-white font-mono">
                    {androidRelease?.fileSizeBytes
                      ? formatBytes(androidRelease.fileSizeBytes)
                      : '42.8 MB'}
                  </span>
                </div>
                <div className="flex justify-between text-slate-600 dark:text-slate-400">
                  <span>Best For:</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">
                    Daily Phone &amp; Mobile Use
                  </span>
                </div>
              </div>

              {/* Collapsible Version Notes */}
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

            <div className="space-y-2 pt-2">
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
                    : 'DOWNLOAD ANDROID APP'}
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
                        LINK COPIED TO CLIPBOARD
                      </span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-slate-500" />
                      <span>COPY DOWNLOAD LINK</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Card 2: PC & Desktop Web App (PWA) */}
          <div className="flex flex-col justify-between bg-white dark:bg-[#161920] border border-slate-200 dark:border-white/10 rounded-3xl p-6 shadow-sm hover:border-blue-500/50 dark:hover:border-red-600/50 transition-all">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-blue-500/10 dark:bg-red-600/10 text-blue-600 dark:text-red-500 rounded-2xl">
                  <Monitor className="w-7 h-7" />
                </div>
                <span className="px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 text-[10px] font-mono font-bold uppercase tracking-wider border border-blue-200/60 dark:border-blue-900/40">
                  {isWindows ? 'Windows PC / Laptop' : 'PC & Browser App'}
                </span>
              </div>

              <h2 className="text-lg font-heading font-black uppercase tracking-wider text-slate-900 dark:text-white mb-1.5">
                Web App (Computer &amp; PC)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-5">
                Installs directly onto your Windows PC or desktop. It opens in
                its own clean window without browser tabs or address bars,
                perfect for reception desks.
              </p>

              <div className="space-y-2 py-3 border-y border-slate-100 dark:border-white/5 mb-6 text-xs">
                <div className="flex justify-between text-slate-600 dark:text-slate-400">
                  <span>Device:</span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    Windows 10 / 11, Mac, PC
                  </span>
                </div>
                <div className="flex justify-between text-slate-600 dark:text-slate-400">
                  <span>Installation:</span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    1-Click Direct Install
                  </span>
                </div>
                <div className="flex justify-between text-slate-600 dark:text-slate-400">
                  <span>Status:</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">
                    {isInstalled
                      ? 'Already Installed'
                      : isInstallable
                        ? 'Ready to Install'
                        : 'Supported on Chrome & Edge'}
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
                  <span>INSTALL ON THIS PC</span>
                </>
              ) : (
                <>
                  <Monitor className="w-4 h-4" />
                  <span>HOW TO INSTALL ON PC</span>
                </>
              )}
            </button>
          </div>
        </div>
      </section>

      {/* ─── REAL ADVANTAGES (PLAIN, EASY-TO-UNDERSTAND BENEFITS) ─── */}
      <section className="px-4 sm:px-8 max-w-4xl mx-auto mt-12">
        <div className="text-center mb-6">
          <h3 className="text-base sm:text-lg font-heading font-black uppercase tracking-wider text-slate-900 dark:text-white">
            Why Install the App Instead of Using a Regular Browser?
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Installing the app gives you 3 big advantages every day:
          </p>
        </div>

        <div className="p-6 rounded-3xl bg-white dark:bg-[#12151c] border border-slate-200 dark:border-white/10 shadow-sm">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {/* Advantage 1: Saves Data */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#161920] border border-slate-200/60 dark:border-white/5 flex flex-col justify-start">
              <div className="w-9 h-9 rounded-xl bg-blue-500/10 dark:bg-red-600/10 text-blue-600 dark:text-red-500 flex items-center justify-center mb-3">
                <Sparkles className="w-5 h-5" />
              </div>
              <h4 className="font-heading font-bold text-xs uppercase text-slate-900 dark:text-white mb-1">
                Saves Your Mobile Data
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                The app stores images and pages directly on your device. You
                don&apos;t have to keep redownloading the same heavy files every
                time you open it, cutting down internet and mobile data usage.
              </p>
            </div>

            {/* Advantage 2: Clean Interface */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#161920] border border-slate-200/60 dark:border-white/5 flex flex-col justify-start">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-3">
                <Layers className="w-5 h-5" />
              </div>
              <h4 className="font-heading font-bold text-xs uppercase text-slate-900 dark:text-white mb-1">
                Cleaner Full-Screen Look
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                Runs like a real software without annoying browser tabs, website
                address bars, or accidentally closing the tab. Everything looks
                neat, professional, and easy to tap.
              </p>
            </div>

            {/* Advantage 3: Design Stays Intact Even Offline */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#161920] border border-slate-200/60 dark:border-white/5 flex flex-col justify-start">
              <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center mb-3">
                <WifiOff className="w-5 h-5" />
              </div>
              <h4 className="font-heading font-bold text-xs uppercase text-slate-900 dark:text-white mb-1">
                Design Stays When Offline
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                If your Wi-Fi or mobile data drops momentarily, the app design
                and layout stay intact without crashing or showing an ugly
                &quot;No Internet&quot; browser error page.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── SIMPLE PC INSTALLATION HELP MODAL ─── */}
      <Modal
        isOpen={showWindowsHelp}
        onClose={() => setShowWindowsHelp(false)}
        title="How to Install on your Computer"
        className="max-w-md text-left p-6 z-[9999]"
      >
        <div className="space-y-4 text-xs text-slate-600 dark:text-slate-300">
          <div className="p-3.5 rounded-2xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/40 flex items-start gap-2.5">
            <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              Use <strong>Google Chrome</strong> or{' '}
              <strong>Microsoft Edge</strong> on your PC or Laptop to install
              with 1 click.
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <span className="w-5 h-5 rounded-full bg-blue-600 dark:bg-red-600 text-white font-bold flex items-center justify-center text-[10px] shrink-0 mt-0.5">
                1
              </span>
              <span>
                Look at the right side of your browser URL bar at the very top
                for the small{' '}
                <strong>Install App icon (⊕ or a monitor with an arrow)</strong>
                .
              </span>
            </div>

            <div className="flex items-start gap-3">
              <span className="w-5 h-5 rounded-full bg-blue-600 dark:bg-red-600 text-white font-bold flex items-center justify-center text-[10px] shrink-0 mt-0.5">
                2
              </span>
              <span>
                Click <strong>Install</strong>. Palomar Gym will immediately
                open in its own clean window and add an icon to your desktop!
              </span>
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <Button onClick={() => setShowWindowsHelp(false)}>
              Understood
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default DownloadPage;
