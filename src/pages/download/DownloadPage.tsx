// src/pages/download/DownloadPage.tsx
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Smartphone,
  Monitor,
  Download,
  ArrowUp,
  ShieldCheck,
  Cpu,
  HardDrive,
  Copy,
  Sun,
  Moon,
  Zap,
  FileCheck,
  RefreshCw,
  Search,
  CheckCircle2,
  Sparkles,
  HelpCircle,
} from 'lucide-react';
import { toast } from 'react-toastify';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { usePWAInstall } from '../../hooks/usePWAInstall';

import landscapeLogoDark from '../../assets/landscape-logo-dark.webp';
import landscapeLogoLight from '../../assets/landscape-logo-light.webp';
import pkg from '../../../package.json';

// External Free Forever Update & Release Service
import {
  fetchAllDynamicReleases,
  executeAppUpdate,
  triggerDirectDownload,
  formatBytes,
  getHostingSettings,
  type DynamicReleasePackage,
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

  const [activeCategory, setActiveCategory] = useState<
    'all' | 'mobile' | 'desktop' | 'drivers'
  >('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [showPwaGuide, setShowPwaGuide] = useState<boolean>(false);
  const [showWindowsPwaGuide, setShowWindowsPwaGuide] = useState<boolean>(false);

  // Dynamic Live Releases State
  const [packages, setPackages] = useState<DynamicReleasePackage[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [latestReleaseDate, setLatestReleaseDate] = useState<string>('Latest Build');
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const loadDynamicReleases = useCallback(async (showToast = false) => {
    setIsRefreshing(true);
    try {
      const result = await fetchAllDynamicReleases(appVersion);
      setPackages(result.packages);
      setLatestReleaseDate(result.latestReleaseDate);
      if (showToast) {
        toast.success(`Dynamic releases synced (${result.packages.length} packages active)`);
      }
    } catch (e: any) {
      console.warn('Could not load dynamic releases:', e);
      if (showToast) {
        toast.error('Failed to sync latest releases');
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [appVersion]);

  useEffect(() => {
    loadDynamicReleases(false);
  }, [loadDynamicReleases]);

  const hostingConfig = useMemo(() => getHostingSettings(), []);

  const defaultLogo = useMemo(() => {
    return theme === 'dark' ? landscapeLogoDark : landscapeLogoLight;
  }, [theme]);

  const activeLogo = gymLogo || defaultLogo;

  const handleBack = () => {
    if (onBackToLogin) {
      onBackToLogin();
    } else if (standalone) {
      navigate('/login');
    }
  };

  const handleDownloadPackage = async (pkgItem: DynamicReleasePackage) => {
    if (downloadingId) return;

    // Handle Windows PWA install flow
    if (pkgItem.id === 'windows-pwa') {
      if (isInstallable) {
        setDownloadingId(pkgItem.id);
        setDownloadProgress(50);
        const success = await install();
        setDownloadProgress(100);
        setTimeout(() => {
          setDownloadingId(null);
          setDownloadProgress(0);
        }, 500);

        if (success) {
          toast.success('Palomar GYM installed to Windows desktop!');
        } else {
          toast.info('Installation was cancelled.');
        }
      } else if (isInstalled) {
        toast.info('Palomar GYM is already installed on your system.');
      } else {
        setShowWindowsPwaGuide(true);
      }
      return;
    }

    // Handle iOS Safari PWA walkthrough
    if (pkgItem.platform === 'ios') {
      setShowPwaGuide(true);
      return;
    }

    setDownloadingId(pkgItem.id);
    setDownloadProgress(20);

    try {
      if (pkgItem.platform === 'android') {
        // Execute Capacitor or Android browser direct APK download
        const targetRelease: AppReleaseInfo = {
          version: pkgItem.version,
          tagName: `v${pkgItem.version}`,
          fileName: pkgItem.fileName,
          downloadUrl: pkgItem.downloadUrl,
          fileSizeBytes: pkgItem.fileSizeBytes,
          releaseNotes: pkgItem.description,
          publishedAt: new Date().toISOString(),
          platform: 'android',
          hostingProvider: pkgItem.hostingProvider,
          isNewer: false,
        };

        await executeAppUpdate(targetRelease, (pct) => {
          setDownloadProgress(pct);
        });
        toast.success(`Download started: ${pkgItem.fileName}`);
      } else {
        // Desktop / Drivers direct trigger
        setDownloadProgress(60);
        triggerDirectDownload(pkgItem.downloadUrl, pkgItem.fileName);
        setDownloadProgress(100);
        toast.success(`Initiated download for ${pkgItem.fileName}`);
      }
    } catch (err: any) {
      toast.error('Download failed: ' + (err?.message || 'Unknown error'));
    } finally {
      setTimeout(() => {
        setDownloadingId(null);
        setDownloadProgress(0);
      }, 800);
    }
  };

  const handleCopyLink = (url: string) => {
    navigator.clipboard.writeText(url);
    toast.success('Download link copied to clipboard!');
  };

  // Filtered packages based on Category + Search
  const filteredPackages = useMemo(() => {
    return packages.filter((item) => {
      const matchesCategory =
        activeCategory === 'all' || item.category === activeCategory;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.fileName.toLowerCase().includes(q) ||
        item.badge.toLowerCase().includes(q);
      return matchesCategory && matchesSearch;
    });
  }, [packages, activeCategory, searchQuery]);

  const getPlatformIcon = (platform: string) => {
    switch (platform) {
      case 'android':
      case 'ios':
        return <Smartphone className="w-8 h-8" />;
      case 'windows':
        return <Monitor className="w-8 h-8" />;
      case 'drivers':
        return <Cpu className="w-8 h-8" />;
      default:
        return <Download className="w-8 h-8" />;
    }
  };

  return (
    <div className="w-full min-h-screen bg-[var(--bg-page,#0c0e12)] bg-slate-900 dark:bg-[#0c0e12] text-slate-900 dark:text-slate-100 font-body transition-colors duration-500 pb-20 relative select-text">
      {/* ─── STICKY NAVIGATION BAR ─── */}
      <header className="sticky top-0 z-50 w-full bg-white/80 dark:bg-[#0c0e12]/80 backdrop-blur-xl border-b border-slate-200/80 dark:border-white/10 px-4 sm:px-8 py-3 transition-colors duration-500">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={handleBack}
              className="group flex items-center gap-2 px-3 py-1.5 rounded-xl bg-blue-50 dark:bg-red-950/40 border border-blue-200 dark:border-red-900/50 text-blue-600 dark:text-red-500 hover:bg-blue-600 hover:text-white dark:hover:bg-red-600 dark:hover:text-white transition-all cursor-pointer font-heading font-black text-xs tracking-wider"
              title="Return to login screen"
            >
              <ArrowUp className="w-4 h-4 transition-transform group-hover:-translate-y-0.5" />
              <span>RETURN TO LOGIN</span>
            </button>

            <img
              src={activeLogo}
              alt="Wolf Palomar"
              className="h-9 sm:h-11 object-contain hidden sm:block"
            />
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden md:inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 dark:bg-white/5 border border-slate-300 dark:border-white/10 text-[10px] font-mono uppercase tracking-widest text-slate-600 dark:text-slate-400">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              BUILD v{appVersion} STABLE
            </span>

            {onToggleTheme && (
              <button
                type="button"
                onClick={onToggleTheme}
                className="flex items-center gap-2 bg-slate-100 dark:bg-[#161920] border border-slate-200 dark:border-white/10 rounded-full px-3 py-1.5 text-xs font-heading font-black tracking-wider text-slate-700 dark:text-slate-300 hover:opacity-90 transition-all cursor-pointer"
                aria-label="Toggle visual theme"
              >
                {theme === 'dark' ? (
                  <>
                    <Sun className="w-3.5 h-3.5 text-amber-400" />
                    <span>LIGHT</span>
                  </>
                ) : (
                  <>
                    <Moon className="w-3.5 h-3.5 text-indigo-400" />
                    <span>DARK</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ─── HERO HEADER SECTION ─── */}
      <section className="relative px-4 sm:px-8 pt-8 pb-4 max-w-7xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-500/10 dark:bg-red-600/10 border border-blue-500/20 dark:border-red-600/20 text-blue-600 dark:text-red-500 text-[10px] sm:text-[11px] font-heading font-black tracking-widest uppercase mb-3 animate-fade-in">
          <Zap className="w-3.5 h-3.5" />
          OFFICIAL SYSTEM CLIENTS &amp; SCANNER SUITE
        </div>

        <h1 className="text-2xl sm:text-4xl lg:text-5xl font-heading font-black uppercase tracking-wider text-slate-900 dark:text-white mb-2">
          INSTALL <span className="text-blue-600 dark:text-red-600">WOLF PALOMAR</span> APPS
        </h1>

        <p className="max-w-2xl mx-auto text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed font-medium">
          Equip front-desk staff, trainers, coaches, and reception terminals with high-speed QR scanning, offline-ready check-in logs, and turnstile gate integrations.
        </p>

        {/* ─── LIVE DYNAMIC RELEASES TELEMETRY BAR ─── */}
        <div className="mt-6 max-w-4xl mx-auto p-3 sm:p-3.5 rounded-2xl bg-white/70 dark:bg-[#161920]/70 border border-slate-200/80 dark:border-white/10 shadow-sm backdrop-blur-md flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-left">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-blue-500/10 dark:bg-red-600/10 text-blue-600 dark:text-red-500 shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-heading font-black text-xs uppercase tracking-wider text-slate-900 dark:text-white">
                  LIVE RELEASE REGISTRY
                </span>
                <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-[9px] font-mono font-bold uppercase tracking-wider">
                  CDN ACTIVE
                </span>
                <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                  Updated: {latestReleaseDate}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Hosting: {hostingConfig.provider === 'github' ? 'GitHub Releases (Free Forever CDN, Zero Supabase Storage)' : 'Custom CDN Host'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
            <button
              type="button"
              onClick={() => loadDynamicReleases(true)}
              disabled={isRefreshing}
              className="py-1.5 px-3 rounded-xl bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 font-heading font-bold text-xs tracking-wider uppercase transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              title="Fetch latest release data from CDN"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>{isRefreshing ? 'SYNCING...' : 'SYNC RELEASES'}</span>
            </button>
          </div>
        </div>

        {/* ─── FILTERS & SEARCH ROW ─── */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 max-w-7xl mx-auto mt-6">
          {/* Category Filter Pills */}
          <div className="flex flex-wrap items-center justify-center md:justify-start gap-1.5 w-full md:w-auto">
            {[
              { id: 'all', label: `ALL PLATFORMS (${packages.length})` },
              {
                id: 'mobile',
                label: `MOBILE (${packages.filter((p) => p.category === 'mobile').length})`,
              },
              {
                id: 'desktop',
                label: `DESKTOP (${packages.filter((p) => p.category === 'desktop').length})`,
              },
              {
                id: 'drivers',
                label: `DRIVERS (${packages.filter((p) => p.category === 'drivers').length})`,
              },
            ].map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategory(cat.id as any)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-heading font-black tracking-wider transition-all cursor-pointer whitespace-nowrap ${
                  activeCategory === cat.id
                    ? 'bg-blue-600 dark:bg-red-600 text-white shadow-md shadow-blue-500/20 dark:shadow-red-600/25'
                    : 'bg-white/80 dark:bg-[#161920]/80 border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Quick Search Input */}
          <div className="relative w-full md:w-72">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search installers or drivers..."
              className="w-full pl-8 pr-8 py-1.5 rounded-xl bg-white/80 dark:bg-[#161920]/80 border border-slate-200 dark:border-white/10 text-xs text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:focus:ring-red-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </section>

      {/* ─── DYNAMIC PLATFORM DOWNLOAD CARDS GRID ─── */}
      <section className="px-4 sm:px-8 max-w-7xl mx-auto mt-6">
        {/* Windows PWA Installation Callout Card */}
        <div className="mb-6 p-4 sm:p-5 rounded-3xl bg-gradient-to-r from-blue-600/10 via-indigo-600/10 to-blue-500/5 dark:from-red-600/15 dark:via-rose-600/10 dark:to-transparent border border-blue-500/20 dark:border-red-600/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="p-3 rounded-2xl bg-blue-600 dark:bg-red-600 text-white shrink-0 mt-0.5 sm:mt-0 shadow-lg shadow-blue-500/25 dark:shadow-red-600/25">
              <Monitor className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="font-heading font-black text-sm uppercase tracking-wider text-slate-900 dark:text-white">
                  WINDOWS DESKTOP APP (PWA)
                </h4>
                <span className="px-2.5 py-0.5 rounded-full bg-blue-500/10 dark:bg-red-600/20 text-blue-600 dark:text-red-400 text-[10px] font-bold uppercase tracking-wider border border-blue-500/20 dark:border-red-600/30">
                  {isWindows ? 'Windows 10 / 11 Detected' : 'Windows 10 / 11 Native'}
                </span>
                {isInstalled && (
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold uppercase tracking-wider border border-emerald-500/20 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Installed
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 max-w-xl leading-relaxed">
                Install Palomar GYM directly to your Windows desktop with custom taskbar icon, borderless window frame, front-desk camera scanner, and offline local cache.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0 w-full sm:w-auto">
            <button
              type="button"
              onClick={async () => {
                if (isInstallable) {
                  const success = await install();
                  if (success) toast.success('Palomar GYM installed to Windows desktop!');
                } else if (isInstalled) {
                  toast.info('Palomar GYM is already installed on your system.');
                } else {
                  setShowWindowsPwaGuide(true);
                }
              }}
              className="flex-1 sm:flex-initial px-4 py-2.5 rounded-xl bg-blue-600 dark:bg-red-600 hover:bg-blue-700 dark:hover:bg-red-700 text-white font-heading font-black text-xs tracking-wider uppercase shadow-md active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              {isInstalled ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" />
                  <span>ALREADY INSTALLED</span>
                </>
              ) : isInstallable ? (
                <>
                  <Download className="w-3.5 h-3.5" />
                  <span>INSTALL TO WINDOWS (1-CLICK)</span>
                </>
              ) : (
                <>
                  <Monitor className="w-3.5 h-3.5" />
                  <span>INSTALL WINDOWS APP</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => setShowWindowsPwaGuide(true)}
              className="px-3 py-2.5 rounded-xl bg-white dark:bg-white/10 hover:bg-slate-100 dark:hover:bg-white/20 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-200 text-xs font-bold transition-all cursor-pointer"
              title="View Windows installation guide"
            >
              <HelpCircle className="w-4 h-4" />
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className="h-80 rounded-3xl bg-slate-200/50 dark:bg-white/5 border border-slate-200 dark:border-white/10 p-6"
              />
            ))}
          </div>
        ) : filteredPackages.length === 0 ? (
          <div className="p-12 text-center rounded-3xl bg-white/50 dark:bg-[#161920]/50 border border-slate-200 dark:border-white/10">
            <p className="text-sm font-heading font-bold uppercase text-slate-500 dark:text-slate-400">
              No packages match &ldquo;{searchQuery}&rdquo;
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setActiveCategory('all');
              }}
              className="mt-3 text-xs text-blue-600 dark:text-red-500 font-bold hover:underline cursor-pointer"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredPackages.map((pkgItem) => (
              <div
                key={pkgItem.id}
                className="flex flex-col bg-white/90 dark:bg-[#161920]/90 border border-slate-200/90 dark:border-white/10 rounded-3xl p-5 sm:p-6 shadow-xl backdrop-blur-xl relative overflow-hidden transition-all duration-300 hover:border-blue-500/50 dark:hover:border-red-600/50"
              >
                {/* Header Icon & Dynamic Badge */}
                <div className="flex items-start justify-between mb-3">
                  <div className="p-3 bg-blue-500/10 dark:bg-red-600/10 text-blue-600 dark:text-red-500 rounded-2xl">
                    {getPlatformIcon(pkgItem.platform)}
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-blue-100 dark:bg-red-950/60 text-blue-700 dark:text-red-400 text-[10px] font-mono font-bold uppercase tracking-wider">
                    {pkgItem.badge}
                  </span>
                </div>

                <h2 className="text-lg sm:text-xl font-heading font-black tracking-wider text-slate-900 dark:text-white uppercase mb-1">
                  {pkgItem.name}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-4 min-h-[36px]">
                  {pkgItem.description}
                </p>

                {/* Dynamic Package Specs */}
                <div className="space-y-2 py-3 border-y border-slate-200/60 dark:border-white/5 mb-5 text-xs">
                  <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                    <span className="text-[11px] font-medium">Format</span>
                    <span className="font-mono text-[11px] font-bold">{pkgItem.format}</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                    <span className="text-[11px] font-medium">File Size</span>
                    <span className="font-mono text-[11px] font-bold">
                      {formatBytes(pkgItem.fileSizeBytes)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                    <span className="text-[11px] font-medium">Requirements</span>
                    <span className="font-mono text-[11px] font-bold truncate max-w-[170px]">
                      {pkgItem.requirements}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                    <span className="text-[11px] font-medium">Hosting</span>
                    <span className="font-mono text-[11px] font-bold text-emerald-600 dark:text-emerald-400 truncate max-w-[170px]">
                      {pkgItem.hostingProvider}
                    </span>
                  </div>
                </div>

                {/* Features list */}
                {pkgItem.features && pkgItem.features.length > 0 && (
                  <div className="space-y-1 mb-5">
                    {pkgItem.features.slice(0, 3).map((feat, idx) => (
                      <div key={idx} className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                        <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                        <span className="truncate">{feat}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Dynamic Actions */}
                <div className="mt-auto space-y-2">
                  <button
                    type="button"
                    onClick={() => handleDownloadPackage(pkgItem)}
                    disabled={downloadingId === pkgItem.id}
                    className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-red-600 dark:to-rose-700 hover:from-blue-700 hover:to-indigo-800 dark:hover:from-red-700 dark:hover:to-rose-800 text-white font-heading font-black text-xs tracking-widest uppercase transition-all shadow-md active:scale-98 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {downloadingId === pkgItem.id ? (
                      <span>DOWNLOADING ({downloadProgress}%)...</span>
                    ) : pkgItem.id === 'windows-pwa' ? (
                      isInstalled ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" />
                          <span>ALREADY INSTALLED ON WINDOWS</span>
                        </>
                      ) : isInstallable ? (
                        <>
                          <Monitor className="w-3.5 h-3.5" />
                          <span>1-CLICK INSTALL WINDOWS APP</span>
                        </>
                      ) : (
                        <>
                          <Monitor className="w-3.5 h-3.5" />
                          <span>INSTALL WINDOWS APP (PWA)</span>
                        </>
                      )
                    ) : pkgItem.platform === 'ios' ? (
                      <>
                        <Smartphone className="w-3.5 h-3.5" />
                        <span>INSTALL PWA ON IPHONE</span>
                      </>
                    ) : (
                      <>
                        <Download className="w-3.5 h-3.5" />
                        <span>
                          {pkgItem.platform === 'android'
                            ? 'DOWNLOAD APK DIRECT'
                            : pkgItem.category === 'drivers'
                            ? 'DOWNLOAD USB DRIVER'
                            : 'DOWNLOAD INSTALLER (EXE)'}
                        </span>
                      </>
                    )}
                  </button>

                  {/* Secondary Action: Windows Guide, iOS Guide, or Copy Direct Link (All QR codes removed) */}
                  {pkgItem.id === 'windows-pwa' ? (
                    <button
                      type="button"
                      onClick={() => setShowWindowsPwaGuide(true)}
                      className="w-full py-2 px-4 rounded-xl bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 font-heading font-bold text-xs tracking-wider uppercase transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <HelpCircle className="w-3.5 h-3.5 text-blue-500 dark:text-red-500" />
                      <span>WINDOWS INSTALL GUIDE</span>
                    </button>
                  ) : pkgItem.platform === 'ios' ? (
                    <button
                      type="button"
                      onClick={() => setShowPwaGuide(true)}
                      className="w-full py-2 px-4 rounded-xl bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 font-heading font-bold text-xs tracking-wider uppercase transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <HelpCircle className="w-3.5 h-3.5 text-blue-500 dark:text-red-500" />
                      <span>SAFARI SETUP GUIDE</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleCopyLink(pkgItem.downloadUrl)}
                      className="w-full py-2 px-4 rounded-xl bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 font-heading font-bold text-xs tracking-wider uppercase transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>COPY DOWNLOAD LINK</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ─── SYSTEM CAPABILITIES & HARDWARE INTEGRATION ─── */}
      <section className="px-4 sm:px-8 max-w-7xl mx-auto mt-14">
        <div className="p-6 sm:p-8 rounded-3xl bg-slate-100/80 dark:bg-[#12151c]/80 border border-slate-200 dark:border-white/10">
          <div className="text-center max-w-2xl mx-auto mb-8">
            <h3 className="text-xl sm:text-2xl font-heading font-black uppercase tracking-wider text-slate-900 dark:text-white">
              INTEGRATED TERMINAL ARCHITECTURE
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Built to withstand thousands of high-traffic member taps every single day with sub-second response times.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <div className="p-5 rounded-2xl bg-white dark:bg-[#161920] border border-slate-200/80 dark:border-white/5">
              <Zap className="w-5 h-5 text-blue-600 dark:text-red-500 mb-2.5" />
              <h4 className="font-heading font-bold text-xs tracking-wide text-slate-900 dark:text-white uppercase mb-1">
                Sub-Second Scanning
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                Optical camera and USB laser engines read QR cards in under 180 milliseconds.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-white dark:bg-[#161920] border border-slate-200/80 dark:border-white/5">
              <HardDrive className="w-5 h-5 text-blue-600 dark:text-red-500 mb-2.5" />
              <h4 className="font-heading font-bold text-xs tracking-wide text-slate-900 dark:text-white uppercase mb-1">
                Offline Auto-Cache
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                Never delays entry when internet drops; logs store locally and auto-sync on reconnect.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-white dark:bg-[#161920] border border-slate-200/80 dark:border-white/5">
              <ShieldCheck className="w-5 h-5 text-blue-600 dark:text-red-500 mb-2.5" />
              <h4 className="font-heading font-bold text-xs tracking-wide text-slate-900 dark:text-white uppercase mb-1">
                Anti-Passback Security
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                Turnstiles immediately reject duplicate card taps within configured cooldown intervals.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-white dark:bg-[#161920] border border-slate-200/80 dark:border-white/5">
              <FileCheck className="w-5 h-5 text-blue-600 dark:text-red-500 mb-2.5" />
              <h4 className="font-heading font-bold text-xs tracking-wide text-slate-900 dark:text-white uppercase mb-1">
                Checksum Verification
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed font-mono">
                SHA-256 verified official binaries hosted on external global CDN.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── RETURN TO LOGIN ACTION BANNER ─── */}
      <section className="px-4 sm:px-8 max-w-4xl mx-auto mt-12 text-center">
        <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-b from-blue-500/10 to-transparent dark:from-red-600/10 border border-blue-500/20 dark:border-red-600/20">
          <h3 className="text-xl sm:text-2xl font-heading font-black uppercase tracking-wider text-slate-900 dark:text-white mb-2">
            READY TO MANAGE GYM OPERATIONS?
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-400 mb-5 max-w-md mx-auto">
            Slide back up to the main terminal login screen to authenticate and access your gym dashboard.
          </p>
          <button
            type="button"
            onClick={handleBack}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 dark:bg-red-600 text-white font-heading font-black text-xs tracking-widest uppercase shadow-lg shadow-blue-500/25 dark:shadow-red-600/30 hover:scale-105 active:scale-98 transition-all cursor-pointer"
          >
            <ArrowUp className="w-3.5 h-3.5 animate-bounce" />
            <span>SLIDE UP TO LOGIN</span>
          </button>
        </div>

        <div className="mt-6 text-center text-[10px] text-slate-400 dark:text-slate-500 font-mono">
          © {new Date().getFullYear()} WOLF PALOMAR FITNESS GYM. ALL RIGHTS RESERVED.
        </div>
      </section>

      {/* ─── WINDOWS PWA INSTALL WALKTHROUGH MODAL ─── */}
      <Modal
        isOpen={showWindowsPwaGuide}
        onClose={() => setShowWindowsPwaGuide(false)}
        title="Install Palomar GYM on Windows (PWA)"
      >
        <div className="p-4 space-y-4 font-body text-xs text-slate-600 dark:text-slate-300">
          <p className="leading-relaxed font-medium">
            Run Palomar GYM as a standalone Windows desktop app with its own taskbar shortcut, borderless window, fast camera scanner, and offline data cache.
          </p>

          <div className="space-y-3">
            <div className="p-3 rounded-xl bg-slate-100 dark:bg-white/5 flex items-start gap-3">
              <span className="w-5 h-5 rounded-full bg-blue-600 dark:bg-red-600 text-white font-bold flex items-center justify-center text-[10px] shrink-0">
                1
              </span>
              <div>
                <strong className="text-slate-900 dark:text-white block mb-0.5">
                  Using Microsoft Edge or Google Chrome:
                </strong>
                <span>
                  Look at the right side of the browser URL / address bar for the{' '}
                  <strong>Install App (⊕)</strong> or computer monitor icon.
                </span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-100 dark:bg-white/5 flex items-start gap-3">
              <span className="w-5 h-5 rounded-full bg-blue-600 dark:bg-red-600 text-white font-bold flex items-center justify-center text-[10px] shrink-0">
                2
              </span>
              <div>
                <strong className="text-slate-900 dark:text-white block mb-0.5">
                  Or via the Browser Menu:
                </strong>
                <span>
                  Click the menu (<strong>⋯</strong> in Edge or <strong>⋮</strong> in Chrome) →{' '}
                  <strong>Apps</strong> / <strong>Save &amp; Share</strong> → select{' '}
                  <strong>&ldquo;Install Palomar GYM&rdquo;</strong>.
                </span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-100 dark:bg-white/5 flex items-start gap-3">
              <span className="w-5 h-5 rounded-full bg-blue-600 dark:bg-red-600 text-white font-bold flex items-center justify-center text-[10px] shrink-0">
                3
              </span>
              <div>
                <strong className="text-slate-900 dark:text-white block mb-0.5">
                  Pin to Taskbar &amp; Launch:
                </strong>
                <span>
                  Click <strong>Install</strong> when prompted. The app opens instantly in a native window with no browser address bar!
                </span>
              </div>
            </div>
          </div>

          <div className="pt-2 flex items-center gap-3">
            {isInstallable && (
              <Button
                onClick={async () => {
                  const success = await install();
                  if (success) {
                    setShowWindowsPwaGuide(false);
                    toast.success('Palomar GYM installed to Windows desktop!');
                  }
                }}
                className="flex-1"
              >
                Install Now (1-Click)
              </Button>
            )}
            <Button
              variant="secondary"
              onClick={() => setShowWindowsPwaGuide(false)}
              className={isInstallable ? 'w-auto' : 'w-full'}
            >
              Got It
            </Button>
          </div>
        </div>
      </Modal>

      {/* ─── iOS PWA INSTALL WALKTHROUGH MODAL ─── */}
      <Modal
        isOpen={showPwaGuide}
        onClose={() => setShowPwaGuide(false)}
        title="Add to Home Screen (iOS / iPad)"
      >
        <div className="p-4 space-y-4 font-body text-xs text-slate-600 dark:text-slate-300">
          <p className="leading-relaxed font-medium">
            Follow these 3 quick steps in Safari to use Wolf Palomar Gym as a standalone full-screen app:
          </p>

          <div className="space-y-3">
            <div className="p-3 rounded-xl bg-slate-100 dark:bg-white/5 flex items-start gap-3">
              <span className="w-5 h-5 rounded-full bg-blue-600 dark:bg-red-600 text-white font-bold flex items-center justify-center text-[10px] shrink-0">
                1
              </span>
              <span>
                Open this website in <strong>Safari</strong> on your iPhone or iPad.
              </span>
            </div>

            <div className="p-3 rounded-xl bg-slate-100 dark:bg-white/5 flex items-start gap-3">
              <span className="w-5 h-5 rounded-full bg-blue-600 dark:bg-red-600 text-white font-bold flex items-center justify-center text-[10px] shrink-0">
                2
              </span>
              <span>
                Tap the <strong>Share</strong> button (the square icon with an upward arrow) in the bottom navigation bar.
              </span>
            </div>

            <div className="p-3 rounded-xl bg-slate-100 dark:bg-white/5 flex items-start gap-3">
              <span className="w-5 h-5 rounded-full bg-blue-600 dark:bg-red-600 text-white font-bold flex items-center justify-center text-[10px] shrink-0">
                3
              </span>
              <span>
                Scroll down and tap <strong>&ldquo;Add to Home Screen&rdquo;</strong>, then confirm by tapping <strong>Add</strong>.
              </span>
            </div>
          </div>

          <Button onClick={() => setShowPwaGuide(false)} className="w-full mt-2">
            Got It
          </Button>
        </div>
      </Modal>
    </div>
  );
};
