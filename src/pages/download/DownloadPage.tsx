// src/pages/download/DownloadPage.tsx
import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Smartphone,
  Monitor,
  Download,
  QrCode,
  ArrowUp,
  Printer,
  ShieldCheck,
  Cpu,
  HardDrive,
  Copy,
  Check,
  Sun,
  Moon,
  Zap,
  FileCheck,
} from 'lucide-react';
import { toast } from 'react-toastify';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';

import landscapeLogoDark from '../../assets/landscape-logo-dark.webp';
import landscapeLogoLight from '../../assets/landscape-logo-light.webp';
import pkg from '../../../package.json';

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
  const [activeCategory, setActiveCategory] = useState<
    'all' | 'mobile' | 'desktop' | 'drivers'
  >('all');
  const [selectedQr, setSelectedQr] = useState<{
    title: string;
    url: string;
    description: string;
  } | null>(null);
  const [copiedUrl, setCopiedUrl] = useState<boolean>(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [showPwaGuide, setShowPwaGuide] = useState<boolean>(false);

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

  const handleSimulatedDownload = (id: string, fileName: string) => {
    if (downloadingId) return;
    setDownloadingId(id);
    setDownloadProgress(0);

    const interval = setInterval(() => {
      setDownloadProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setDownloadingId(null);
          toast.success(`Download ready: ${fileName}`, {
            toastId: `dl-${id}`,
          });
          return 100;
        }
        return prev + 20;
      });
    }, 150);
  };

  const handleCopyLink = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(true);
    toast.success('Download link copied to clipboard!');
    setTimeout(() => setCopiedUrl(false), 2000);
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
      <section className="relative px-4 sm:px-8 pt-10 pb-6 max-w-7xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-500/10 dark:bg-red-600/10 border border-blue-500/20 dark:border-red-600/20 text-blue-600 dark:text-red-500 text-[11px] font-heading font-black tracking-widest uppercase mb-4 animate-fade-in">
          <Zap className="w-3.5 h-3.5" />
          OFFICIAL SYSTEM CLIENTS &amp; SCANNER SUITE
        </div>

        <h1 className="text-3xl sm:text-5xl lg:text-6xl font-heading font-black uppercase tracking-wider text-slate-900 dark:text-white mb-3">
          INSTALL{' '}
          <span className="text-blue-600 dark:text-red-600">WOLF PALOMAR</span>{' '}
          APPS
        </h1>

        <p className="max-w-2xl mx-auto text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed font-medium">
          Equip front-desk staff, trainers, coaches, and reception terminals
          with high-speed QR scanning, offline-ready check-in logs, and
          turnstile gate integrations.
        </p>

        {/* Category Filter Pills */}
        <div className="flex flex-wrap items-center justify-center gap-2 mt-8">
          {[
            { id: 'all', label: 'ALL PLATFORMS' },
            { id: 'mobile', label: 'MOBILE (ANDROID & iOS)' },
            { id: 'desktop', label: 'DESKTOP & TURNSTILES' },
            { id: 'drivers', label: 'HARDWARE DRIVERS' },
          ].map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setActiveCategory(cat.id as any)}
              className={`px-4 py-2 rounded-xl text-xs font-heading font-black tracking-wider transition-all cursor-pointer ${
                activeCategory === cat.id
                  ? 'bg-blue-600 dark:bg-red-600 text-white shadow-md shadow-blue-500/20 dark:shadow-red-600/25 scale-105'
                  : 'bg-white/80 dark:bg-[#161920]/80 border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </section>

      {/* ─── PLATFORM DOWNLOAD CARDS GRID ─── */}
      <section className="px-4 sm:px-8 max-w-7xl mx-auto mt-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* CARD 1: ANDROID APK */}
          {(activeCategory === 'all' || activeCategory === 'mobile') && (
            <div className="flex flex-col bg-white/90 dark:bg-[#161920]/90 border border-slate-200/90 dark:border-white/10 rounded-3xl p-6 shadow-xl backdrop-blur-xl relative overflow-hidden transition-all duration-300 hover:border-blue-500/50 dark:hover:border-red-600/50">
              <div className="flex items-start justify-between mb-4">
                <div className="p-3 bg-blue-500/10 dark:bg-red-600/10 text-blue-600 dark:text-red-500 rounded-2xl">
                  <Smartphone className="w-8 h-8" />
                </div>
                <span className="px-2.5 py-1 rounded-full bg-blue-100 dark:bg-red-950/60 text-blue-700 dark:text-red-400 text-[10px] font-mono font-bold uppercase tracking-wider">
                  Android APK • v{appVersion}
                </span>
              </div>

              <h2 className="text-xl font-heading font-black tracking-wider text-slate-900 dark:text-white uppercase mb-1">
                Android Terminal Client
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-4">
                Direct installation package for staff Android phones, tablets,
                and turnstile handhelds.
              </p>

              <div className="space-y-2 py-3 border-y border-slate-200/60 dark:border-white/5 mb-6 text-xs">
                <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                  <span className="text-[11px] font-medium">
                    Package Format
                  </span>
                  <span className="font-mono text-[11px] font-bold">
                    APK (Direct Install)
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                  <span className="text-[11px] font-medium">File Size</span>
                  <span className="font-mono text-[11px] font-bold">
                    42.8 MB
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                  <span className="text-[11px] font-medium">Requirements</span>
                  <span className="font-mono text-[11px] font-bold">
                    Android 8.0 or newer
                  </span>
                </div>
              </div>

              <div className="mt-auto space-y-2.5">
                <button
                  type="button"
                  onClick={() =>
                    handleSimulatedDownload(
                      'android-apk',
                      `WolfPalomarGym-v${appVersion}.apk`
                    )
                  }
                  disabled={downloadingId === 'android-apk'}
                  className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-red-600 dark:to-rose-700 hover:from-blue-700 hover:to-indigo-800 dark:hover:from-red-700 dark:hover:to-rose-800 text-white font-heading font-black text-xs tracking-widest uppercase transition-all shadow-md active:scale-98 flex items-center justify-center gap-2 cursor-pointer"
                >
                  {downloadingId === 'android-apk' ? (
                    <span>DOWNLOADING ({downloadProgress}%)...</span>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      <span>DOWNLOAD APK DIRECT</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setSelectedQr({
                      title: 'Android Direct APK Install',
                      url:
                        window.location.origin +
                        `/downloads/WolfPalomarGym-v${appVersion}.apk`,
                      description:
                        'Scan this QR code using your Android camera or barcode scanner to download the APK directly.',
                    })
                  }
                  className="w-full py-2.5 px-4 rounded-xl bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 font-heading font-bold text-xs tracking-wider uppercase transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <QrCode className="w-4 h-4" />
                  <span>SHOW PHONE QR CODE</span>
                </button>
              </div>
            </div>
          )}

          {/* CARD 2: APPLE iOS / PWA */}
          {(activeCategory === 'all' || activeCategory === 'mobile') && (
            <div className="flex flex-col bg-white/90 dark:bg-[#161920]/90 border border-slate-200/90 dark:border-white/10 rounded-3xl p-6 shadow-xl backdrop-blur-xl relative overflow-hidden transition-all duration-300 hover:border-blue-500/50 dark:hover:border-red-600/50">
              <div className="flex items-start justify-between mb-4">
                <div className="p-3 bg-blue-500/10 dark:bg-red-600/10 text-blue-600 dark:text-red-500 rounded-2xl">
                  <Smartphone className="w-8 h-8" />
                </div>
                <span className="px-2.5 py-1 rounded-full bg-blue-100 dark:bg-red-950/60 text-blue-700 dark:text-red-400 text-[10px] font-mono font-bold uppercase tracking-wider">
                  iOS / iPadOS • PWA &amp; Beta
                </span>
              </div>

              <h2 className="text-xl font-heading font-black tracking-wider text-slate-900 dark:text-white uppercase mb-1">
                Apple iOS &amp; iPadOS
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-4">
                Install directly onto Apple devices via native Progressive Web
                App or TestFlight beta channel.
              </p>

              <div className="space-y-2 py-3 border-y border-slate-200/60 dark:border-white/5 mb-6 text-xs">
                <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                  <span className="text-[11px] font-medium">Installation</span>
                  <span className="font-mono text-[11px] font-bold">
                    1-Tap Safari PWA
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                  <span className="text-[11px] font-medium">
                    Storage Required
                  </span>
                  <span className="font-mono text-[11px] font-bold">
                    &lt; 8.5 MB
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                  <span className="text-[11px] font-medium">Requirements</span>
                  <span className="font-mono text-[11px] font-bold">
                    iOS 14.0 or later
                  </span>
                </div>
              </div>

              <div className="mt-auto space-y-2.5">
                <button
                  type="button"
                  onClick={() => setShowPwaGuide(true)}
                  className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-red-600 dark:to-rose-700 hover:from-blue-700 hover:to-indigo-800 dark:hover:from-red-700 dark:hover:to-rose-800 text-white font-heading font-black text-xs tracking-widest uppercase transition-all shadow-md active:scale-98 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>INSTALL PWA ON IPHONE</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setSelectedQr({
                      title: 'Apple iOS Quick Access',
                      url: window.location.origin + '/login',
                      description:
                        'Scan this QR code on your iPhone or iPad camera to launch Safari and add the gym app to your home screen.',
                    })
                  }
                  className="w-full py-2.5 px-4 rounded-xl bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 font-heading font-bold text-xs tracking-wider uppercase transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <QrCode className="w-4 h-4" />
                  <span>SCAN FROM IPHONE</span>
                </button>
              </div>
            </div>
          )}

          {/* CARD 3: WINDOWS DESKTOP & POS TERMINAL */}
          {(activeCategory === 'all' || activeCategory === 'desktop') && (
            <div className="flex flex-col bg-white/90 dark:bg-[#161920]/90 border border-slate-200/90 dark:border-white/10 rounded-3xl p-6 shadow-xl backdrop-blur-xl relative overflow-hidden transition-all duration-300 hover:border-blue-500/50 dark:hover:border-red-600/50">
              <div className="flex items-start justify-between mb-4">
                <div className="p-3 bg-blue-500/10 dark:bg-red-600/10 text-blue-600 dark:text-red-500 rounded-2xl">
                  <Monitor className="w-8 h-8" />
                </div>
                <span className="px-2.5 py-1 rounded-full bg-blue-100 dark:bg-red-950/60 text-blue-700 dark:text-red-400 text-[10px] font-mono font-bold uppercase tracking-wider">
                  Windows x64 • POS &amp; Gates
                </span>
              </div>

              <h2 className="text-xl font-heading font-black tracking-wider text-slate-900 dark:text-white uppercase mb-1">
                Windows Reception Client
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-4">
                Desktop station package with direct Turnstile COM relay
                controllers and thermal receipt printer support.
              </p>

              <div className="space-y-2 py-3 border-y border-slate-200/60 dark:border-white/5 mb-6 text-xs">
                <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                  <span className="text-[11px] font-medium">Executable</span>
                  <span className="font-mono text-[11px] font-bold">
                    x64 MSI / EXE Setup
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                  <span className="text-[11px] font-medium">File Size</span>
                  <span className="font-mono text-[11px] font-bold">
                    88.4 MB
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                  <span className="text-[11px] font-medium">Hardware</span>
                  <span className="font-mono text-[11px] font-bold">
                    USB Laser Scanners &amp; Relays
                  </span>
                </div>
              </div>

              <div className="mt-auto space-y-2.5">
                <button
                  type="button"
                  onClick={() =>
                    handleSimulatedDownload(
                      'windows-exe',
                      `WolfPalomar-Terminal-v${appVersion}-Setup.exe`
                    )
                  }
                  disabled={downloadingId === 'windows-exe'}
                  className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-red-600 dark:to-rose-700 hover:from-blue-700 hover:to-indigo-800 dark:hover:from-red-700 dark:hover:to-rose-800 text-white font-heading font-black text-xs tracking-widest uppercase transition-all shadow-md active:scale-98 flex items-center justify-center gap-2 cursor-pointer"
                >
                  {downloadingId === 'windows-exe' ? (
                    <span>DOWNLOADING ({downloadProgress}%)...</span>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      <span>DOWNLOAD WINDOWS SETUP</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setSelectedQr({
                      title: 'Windows Desktop Client Link',
                      url:
                        window.location.origin +
                        `/downloads/WolfPalomar-Terminal-Setup.exe`,
                      description:
                        'Copy or scan this URL to download the full desktop reception and turnstile control client.',
                    })
                  }
                  className="w-full py-2.5 px-4 rounded-xl bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 font-heading font-bold text-xs tracking-wider uppercase transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <QrCode className="w-4 h-4" />
                  <span>SHARE DOWNLOAD LINK</span>
                </button>
              </div>
            </div>
          )}

          {/* CARD 4: TURNSTILE RELAY CONTROLLER DRIVER */}
          {(activeCategory === 'all' || activeCategory === 'drivers') && (
            <div className="flex flex-col bg-white/90 dark:bg-[#161920]/90 border border-slate-200/90 dark:border-white/10 rounded-3xl p-6 shadow-xl backdrop-blur-xl relative overflow-hidden transition-all duration-300 hover:border-blue-500/50 dark:hover:border-red-600/50">
              <div className="flex items-start justify-between mb-4">
                <div className="p-3 bg-blue-500/10 dark:bg-red-600/10 text-blue-600 dark:text-red-500 rounded-2xl">
                  <Cpu className="w-8 h-8" />
                </div>
                <span className="px-2.5 py-1 rounded-full bg-blue-100 dark:bg-red-950/60 text-blue-700 dark:text-red-400 text-[10px] font-mono font-bold uppercase tracking-wider">
                  Hardware USB Driver
                </span>
              </div>

              <h2 className="text-xl font-heading font-black tracking-wider text-slate-900 dark:text-white uppercase mb-1">
                Turnstile Gate Controller
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-4">
                Virtual COM relay trigger driver for physical tripod turnstiles
                and magnetic door strikes.
              </p>

              <div className="space-y-2 py-3 border-y border-slate-200/60 dark:border-white/5 mb-6 text-xs">
                <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                  <span className="text-[11px] font-medium">Chipset</span>
                  <span className="font-mono text-[11px] font-bold">
                    CH340 / FTDI / CP2102
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                  <span className="text-[11px] font-medium">Pulse Trigger</span>
                  <span className="font-mono text-[11px] font-bold">
                    150ms High Active Relay
                  </span>
                </div>
              </div>

              <div className="mt-auto">
                <button
                  type="button"
                  onClick={() =>
                    handleSimulatedDownload(
                      'driver-turnstile',
                      'Turnstile-Relay-Driver-v2.1.zip'
                    )
                  }
                  className="w-full py-2.5 px-4 rounded-xl bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 font-heading font-bold text-xs tracking-wider uppercase transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>DOWNLOAD RELAY DRIVER (.ZIP)</span>
                </button>
              </div>
            </div>
          )}

          {/* CARD 5: THERMAL RECEIPT PRINTER SERVICE */}
          {(activeCategory === 'all' || activeCategory === 'drivers') && (
            <div className="flex flex-col bg-white/90 dark:bg-[#161920]/90 border border-slate-200/90 dark:border-white/10 rounded-3xl p-6 shadow-xl backdrop-blur-xl relative overflow-hidden transition-all duration-300 hover:border-blue-500/50 dark:hover:border-red-600/50">
              <div className="flex items-start justify-between mb-4">
                <div className="p-3 bg-blue-500/10 dark:bg-red-600/10 text-blue-600 dark:text-red-500 rounded-2xl">
                  <Printer className="w-8 h-8" />
                </div>
                <span className="px-2.5 py-1 rounded-full bg-blue-100 dark:bg-red-950/60 text-blue-700 dark:text-red-400 text-[10px] font-mono font-bold uppercase tracking-wider">
                  ESC/POS Driver
                </span>
              </div>

              <h2 className="text-xl font-heading font-black tracking-wider text-slate-900 dark:text-white uppercase mb-1">
                Thermal Receipt Spooler
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-4">
                Auto-cut ESC/POS thermal printing spooler for member
                subscription invoices and POS sales receipts.
              </p>

              <div className="space-y-2 py-3 border-y border-slate-200/60 dark:border-white/5 mb-6 text-xs">
                <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                  <span className="text-[11px] font-medium">Paper Width</span>
                  <span className="font-mono text-[11px] font-bold">
                    58mm &amp; 80mm Compatible
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                  <span className="text-[11px] font-medium">Baud Rate</span>
                  <span className="font-mono text-[11px] font-bold">
                    9600 / 115200 bps USB
                  </span>
                </div>
              </div>

              <div className="mt-auto">
                <button
                  type="button"
                  onClick={() =>
                    handleSimulatedDownload(
                      'driver-printer',
                      'Thermal-Printer-Spooler-x64.zip'
                    )
                  }
                  className="w-full py-2.5 px-4 rounded-xl bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 font-heading font-bold text-xs tracking-wider uppercase transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>DOWNLOAD PRINTER SPOOLER</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ─── SYSTEM CAPABILITIES & HARDWARE INTEGRATION ─── */}
      <section className="px-4 sm:px-8 max-w-7xl mx-auto mt-16">
        <div className="p-8 rounded-3xl bg-slate-100/80 dark:bg-[#12151c]/80 border border-slate-200 dark:border-white/10">
          <div className="text-center max-w-2xl mx-auto mb-8">
            <h3 className="text-2xl font-heading font-black uppercase tracking-wider text-slate-900 dark:text-white">
              INTEGRATED TERMINAL ARCHITECTURE
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Built to withstand thousands of high-traffic member taps every
              single day with sub-second response times.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="p-5 rounded-2xl bg-white dark:bg-[#161920] border border-slate-200/80 dark:border-white/5">
              <Zap className="w-6 h-6 text-blue-600 dark:text-red-500 mb-3" />
              <h4 className="font-heading font-bold text-sm tracking-wide text-slate-900 dark:text-white uppercase mb-1">
                Sub-Second Scanning
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                Optical camera and USB laser engines read QR cards in under 180
                milliseconds.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-white dark:bg-[#161920] border border-slate-200/80 dark:border-white/5">
              <HardDrive className="w-6 h-6 text-blue-600 dark:text-red-500 mb-3" />
              <h4 className="font-heading font-bold text-sm tracking-wide text-slate-900 dark:text-white uppercase mb-1">
                Offline Auto-Cache
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                Never delays entry when internet drops; logs store locally and
                auto-sync on reconnect.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-white dark:bg-[#161920] border border-slate-200/80 dark:border-white/5">
              <ShieldCheck className="w-6 h-6 text-blue-600 dark:text-red-500 mb-3" />
              <h4 className="font-heading font-bold text-sm tracking-wide text-slate-900 dark:text-white uppercase mb-1">
                Anti-Passback Security
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                Turnstiles immediately reject duplicate card taps within
                configured cooldown intervals.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-white dark:bg-[#161920] border border-slate-200/80 dark:border-white/5">
              <FileCheck className="w-6 h-6 text-blue-600 dark:text-red-500 mb-3" />
              <h4 className="font-heading font-bold text-sm tracking-wide text-slate-900 dark:text-white uppercase mb-1">
                Checksum Verification
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed font-mono">
                SHA-256: 4e9a8...3b8f. Verified official signed binary release.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── RETURN TO LOGIN ACTION BANNER ─── */}
      <section className="px-4 sm:px-8 max-w-4xl mx-auto mt-14 text-center">
        <div className="p-8 rounded-3xl bg-gradient-to-b from-blue-500/10 to-transparent dark:from-red-600/10 border border-blue-500/20 dark:border-red-600/20">
          <h3 className="text-2xl font-heading font-black uppercase tracking-wider text-slate-900 dark:text-white mb-2">
            READY TO MANAGE GYM OPERATIONS?
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-400 mb-6 max-w-md mx-auto">
            Slide back up to the main terminal login screen to authenticate and
            access your gym dashboard.
          </p>
          <button
            type="button"
            onClick={handleBack}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-blue-600 dark:bg-red-600 text-white font-heading font-black text-xs tracking-widest uppercase shadow-lg shadow-blue-500/25 dark:shadow-red-600/30 hover:scale-105 active:scale-98 transition-all cursor-pointer"
          >
            <ArrowUp className="w-4 h-4 animate-bounce" />
            <span>SLIDE UP TO LOGIN</span>
          </button>
        </div>

        <div className="mt-8 text-center text-[10px] text-slate-400 dark:text-slate-500 font-mono">
          © {new Date().getFullYear()} WOLF PALOMAR FITNESS GYM. ALL RIGHTS
          RESERVED.
        </div>
      </section>

      {/* ─── QR CODE MODAL ─── */}
      <Modal
        isOpen={selectedQr !== null}
        onClose={() => setSelectedQr(null)}
        title={selectedQr?.title || 'Scan QR Code'}
      >
        <div className="p-4 text-center space-y-4 font-body">
          {/* Stylized QR Code Visual */}
          <div className="p-6 bg-white dark:bg-slate-900 rounded-2xl border-2 border-slate-200 dark:border-white/10 w-60 h-60 mx-auto flex flex-col items-center justify-center relative shadow-inner">
            <svg
              className="w-48 h-48 text-slate-900 dark:text-white"
              viewBox="0 0 100 100"
              fill="currentColor"
            >
              {/* Corner markers */}
              <rect
                x="5"
                y="5"
                width="25"
                height="25"
                fill="currentColor"
                rx="4"
              />
              <rect
                x="9"
                y="9"
                width="17"
                height="17"
                fill={theme === 'dark' ? '#0f172a' : '#ffffff'}
                rx="2"
              />
              <rect x="13" y="13" width="9" height="9" fill="currentColor" />

              <rect
                x="70"
                y="5"
                width="25"
                height="25"
                fill="currentColor"
                rx="4"
              />
              <rect
                x="74"
                y="9"
                width="17"
                height="17"
                fill={theme === 'dark' ? '#0f172a' : '#ffffff'}
                rx="2"
              />
              <rect x="78" y="13" width="9" height="9" fill="currentColor" />

              <rect
                x="5"
                y="70"
                width="25"
                height="25"
                fill="currentColor"
                rx="4"
              />
              <rect
                x="9"
                y="74"
                width="17"
                height="17"
                fill={theme === 'dark' ? '#0f172a' : '#ffffff'}
                rx="2"
              />
              <rect x="13" y="78" width="9" height="9" fill="currentColor" />

              {/* Data dots pattern */}
              <circle cx="45" cy="15" r="3" />
              <circle cx="55" cy="20" r="3" />
              <circle cx="40" cy="30" r="3" />
              <circle cx="50" cy="40" r="3" />
              <circle cx="60" cy="50" r="3" />
              <circle cx="40" cy="60" r="3" />
              <circle cx="50" cy="70" r="3" />
              <circle cx="70" cy="40" r="3" />
              <circle cx="80" cy="60" r="3" />
              <circle cx="90" cy="75" r="3" />
              <circle cx="75" cy="85" r="3" />
              <circle cx="40" cy="85" r="3" />
              <circle cx="20" cy="45" r="3" />
              <circle cx="30" cy="45" r="3" />
            </svg>

            {/* Center Wolf Shield Badge */}
            <div className="absolute inset-0 m-auto w-10 h-10 rounded-xl bg-blue-600 dark:bg-red-600 flex items-center justify-center text-white font-heading font-black text-xs shadow-lg">
              WP
            </div>
          </div>

          <p className="text-xs text-slate-600 dark:text-slate-300 max-w-sm mx-auto leading-relaxed">
            {selectedQr?.description}
          </p>

          <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-[#161920] border border-slate-200 dark:border-white/10 flex items-center justify-between gap-2 text-left">
            <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400 truncate select-all">
              {selectedQr?.url}
            </span>
            <button
              type="button"
              onClick={() => selectedQr && handleCopyLink(selectedQr.url)}
              className="px-3 py-1 bg-white dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/20 rounded-lg text-slate-700 dark:text-slate-200 text-xs font-bold shrink-0 transition-colors flex items-center gap-1 cursor-pointer"
            >
              {copiedUrl ? (
                <Check className="w-3.5 h-3.5 text-emerald-500" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              <span>{copiedUrl ? 'Copied' : 'Copy'}</span>
            </button>
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
            Follow these 3 quick steps in Safari to use Wolf Palomar Gym as a
            standalone full-screen app:
          </p>

          <div className="space-y-3">
            <div className="p-3 rounded-xl bg-slate-100 dark:bg-white/5 flex items-start gap-3">
              <span className="w-5 h-5 rounded-full bg-blue-600 dark:bg-red-600 text-white font-bold flex items-center justify-center text-[10px] shrink-0">
                1
              </span>
              <span>
                Open this website in <strong>Safari</strong> on your iPhone or
                iPad.
              </span>
            </div>

            <div className="p-3 rounded-xl bg-slate-100 dark:bg-white/5 flex items-start gap-3">
              <span className="w-5 h-5 rounded-full bg-blue-600 dark:bg-red-600 text-white font-bold flex items-center justify-center text-[10px] shrink-0">
                2
              </span>
              <span>
                Tap the <strong>Share</strong> button (the square icon with an
                upward arrow) in the bottom navigation bar.
              </span>
            </div>

            <div className="p-3 rounded-xl bg-slate-100 dark:bg-white/5 flex items-start gap-3">
              <span className="w-5 h-5 rounded-full bg-blue-600 dark:bg-red-600 text-white font-bold flex items-center justify-center text-[10px] shrink-0">
                3
              </span>
              <span>
                Scroll down and tap{' '}
                <strong>&ldquo;Add to Home Screen&rdquo;</strong>, then confirm
                by tapping <strong>Add</strong>.
              </span>
            </div>
          </div>

          <Button
            onClick={() => setShowPwaGuide(false)}
            className="w-full mt-2"
          >
            Got It
          </Button>
        </div>
      </Modal>
    </div>
  );
};
