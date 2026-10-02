// src/components/layouts/AppFooter.tsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Scale,
  ShieldCheck,
  Code2,
  Phone,
  Mail,
  MapPin,
  ChevronRight,
  ChevronDown,
  ExternalLink,
  CheckCircle2,
  FileText,
  Download,
  UserPlus,
  LogIn,
  KeyRound,
  CreditCard,
  Building2,
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { isSuperAdmin } from '../../constants/auth';
import { SIDEBAR_NAV_STRUCTURE } from '../../constants/navigation';
import { TABS as SETTINGS_TABS, TAB_URL_MAP } from '../../pages/system/Settings';
import {
  settingsService,
  DEFAULT_SETTINGS,
} from '../../pages/members/memberService';
import type { MembershipSettings } from '../../types/members';
import { supabase } from '../../lib/supabase/client';
import {
  AgreementDocumentViewer,
  type AgreementDocument,
} from '../ui/AgreementDocumentViewer';
import { Modal } from '../ui/Modal';
import {
  fetchLatestRelease,
  getInstalledAppVersion,
} from '../../lib/appUpdateService';
import { Capacitor } from '@capacitor/core';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import pkg from '../../../package.json';

import landscapeLogoDark from '../../assets/landscape-logo-dark.webp';
import landscapeLogoLight from '../../assets/landscape-logo-light.webp';

interface LiveGymFooterConfig {
  gymName: string;
  gymDescription: string;
  gymAddress: string;
  contactName1: string;
  contactNumber1: string;
  contactName2: string;
  contactNumber2: string;
  emailAddress: string;
  gymLogo: string;
}

const DEFAULT_FOOTER_GYM_CONFIG: LiveGymFooterConfig = {
  gymName: 'WOLF PALOMAR GYM',
  gymDescription:
    'Welcome to Wolf Palomar Gym, where strength meets endurance. Our state-of-the-art facilities and expert trainers are here to help you achieve your fitness goals.',
  gymAddress: '123 Sample Street, Barangay Central, Quezon City, Metro Manila',
  contactName1: 'Staff Ryan',
  contactNumber1: '09762607481',
  contactName2: 'Admin Wolf',
  contactNumber2: '09123456789',
  emailAddress: 'contact@wolfpalomargym.com',
  gymLogo: '',
};

interface AppFooterProps {
  variant?: 'system' | 'public';
  onAcceptAgreement?: () => void;
  className?: string;
}

// Formal title-casing helper for navigation links
const toTitleCase = (str: string): string => {
  if (!str) return '';
  const minorWords = ['and', '&', 'or', 'of', 'in', 'to', 'for', 'at', 'on'];
  return str
    .split(' ')
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (index !== 0 && minorWords.includes(lower)) {
        return lower;
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
};

export const AppFooter: React.FC<AppFooterProps> = ({
  variant,
  onAcceptAgreement,
  className = '',
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile } = useAuthStore();

  const APP_VERSION = pkg.version;
  const isAuthenticated = Boolean(user);
  const resolvedVariant = variant || (isAuthenticated ? 'system' : 'public');
  const isCollapsible = resolvedVariant === 'system';

  const { isInstalled: isPwaInstalled } = usePWAInstall();
  const isAlreadyPwaOrCapacitor = useMemo(() => {
    const isStandalone =
      typeof window !== 'undefined' &&
      (window.matchMedia('(display-mode: standalone)').matches ||
        window.matchMedia('(display-mode: window-controls-overlay)').matches ||
        (window.navigator as any).standalone === true);
    return Capacitor.isNativePlatform() || isPwaInstalled || isStandalone;
  }, [isPwaInstalled]);

  const [isFooterExpanded, setIsFooterExpanded] = useState<boolean>(false);
  const showExpandedFooter = !isCollapsible || isFooterExpanded;

  const [displayVersion, setDisplayVersion] = useState<string>(APP_VERSION);
  const [latestCloudVersion, setLatestCloudVersion] = useState<string | null>(
    null
  );

  const userRole: 'admin' | 'staff' = useMemo(() => {
    if (
      user?.email &&
      (isSuperAdmin(user.email) ||
        user.email.toLowerCase() === 'wolfpalomargym@gmail.com')
    ) {
      return 'admin';
    }
    if (profile?.role === 'admin') return 'admin';
    return 'staff';
  }, [user?.email, profile?.role]);

  const isAdmin = userRole === 'admin';

  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof document === 'undefined') return true;
    return document.documentElement.classList.contains('dark');
  });

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    return () => observer.disconnect();
  }, []);

  const [gymConfig, setGymConfig] = useState<LiveGymFooterConfig>(
    DEFAULT_FOOTER_GYM_CONFIG
  );
  const [rates, setRates] = useState<MembershipSettings>(DEFAULT_SETTINGS);

  const [agreementDoc, setAgreementDoc] = useState<AgreementDocument | null>(
    null
  );
  const [showDeveloperModal, setShowDeveloperModal] = useState<boolean>(false);
  const [isAgreementAccepted, setIsAgreementAccepted] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return Boolean(localStorage.getItem('palomar_user_agreement_accepted'));
  });

  useEffect(() => {
    const syncAccepted = () => {
      setIsAgreementAccepted(
        Boolean(localStorage.getItem('palomar_user_agreement_accepted'))
      );
    };
    window.addEventListener('palomar-agreement-accepted', syncAccepted);
    window.addEventListener('storage', syncAccepted);
    return () => {
      window.removeEventListener('palomar-agreement-accepted', syncAccepted);
      window.removeEventListener('storage', syncAccepted);
    };
  }, []);

  const fetchLiveFooterData = useCallback(async () => {
    try {
      const installedInfo = await getInstalledAppVersion(APP_VERSION);
      setDisplayVersion(installedInfo.version);
      const releaseCheck = await fetchLatestRelease(
        installedInfo.version,
        installedInfo.platform
      );
      if (releaseCheck?.version) {
        setLatestCloudVersion(releaseCheck.version);
      }
    } catch {
      // Fallback
    }

    try {
      const { data, error } = await supabase
        .from('gym_profile')
        .select('*')
        .eq('id', 1)
        .maybeSingle();

      if (!error && data) {
        const nextConfig: LiveGymFooterConfig = {
          gymName: data.gym_name || DEFAULT_FOOTER_GYM_CONFIG.gymName,
          gymDescription:
            data.gym_description || DEFAULT_FOOTER_GYM_CONFIG.gymDescription,
          gymAddress: data.gym_address || DEFAULT_FOOTER_GYM_CONFIG.gymAddress,
          contactName1:
            data.contact_name_1 || DEFAULT_FOOTER_GYM_CONFIG.contactName1,
          contactNumber1:
            data.contact_number_1 || DEFAULT_FOOTER_GYM_CONFIG.contactNumber1,
          contactName2:
            data.contact_name_2 || DEFAULT_FOOTER_GYM_CONFIG.contactName2,
          contactNumber2:
            data.contact_number_2 || DEFAULT_FOOTER_GYM_CONFIG.contactNumber2,
          emailAddress:
            data.email_address || DEFAULT_FOOTER_GYM_CONFIG.emailAddress,
          gymLogo: data.gym_logo || '',
        };
        setGymConfig(nextConfig);
      } else {
        const cached = localStorage.getItem('palomar_gym_profile');
        if (cached) {
          const parsed = JSON.parse(cached);
          setGymConfig((prev) => ({
            gymName: parsed.gymName || prev.gymName,
            gymDescription: parsed.gymDescription || prev.gymDescription,
            gymAddress: parsed.gymAddress || prev.gymAddress,
            contactName1: parsed.contactName1 || prev.contactName1,
            contactNumber1: parsed.contactNumber1 || prev.contactNumber1,
            contactName2: parsed.contactName2 || prev.contactName2,
            contactNumber2: parsed.contactNumber2 || prev.contactNumber2,
            emailAddress: parsed.emailAddress || prev.emailAddress,
            gymLogo: parsed.gymLogo || prev.gymLogo,
          }));
        }
      }
    } catch {
      // Fallback
    }

    try {
      const loadedRates = await settingsService.load();
      setRates(loadedRates);
    } catch {
      // Offline fallback
    }
  }, [APP_VERSION]);

  useEffect(() => {
    fetchLiveFooterData();

    const channel = supabase
      .channel('app_footer_live_sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'gym_profile' },
        fetchLiveFooterData
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rates_config' },
        fetchLiveFooterData
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'app_releases' },
        fetchLiveFooterData
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchLiveFooterData]);

  // Derived links with formal Title Case capitalization
  const consoleNavLinks = useMemo(() => {
    const links: { name: string; path: string; description?: string }[] = [];

    for (const item of SIDEBAR_NAV_STRUCTURE) {
      if (item.roles && !item.roles.includes(userRole)) continue;

      if (item.children && item.children.length > 0) {
        for (const child of item.children) {
          if (child.roles && !child.roles.includes(userRole)) continue;
          links.push({
            name: toTitleCase(child.name),
            path: child.path,
            description: child.description,
          });
        }
      } else if (item.path) {
        links.push({
          name: toTitleCase(item.name),
          path: item.path,
          description: item.section,
        });
      }
    }

    return links;
  }, [userRole]);

  const settingsNavLinks = useMemo(() => {
    return SETTINGS_TABS.filter((tab) => !tab.adminOnly || isAdmin).map(
      (tab) => ({
        name: toTitleCase(tab.label),
        path: `/settings/${TAB_URL_MAP[tab.id]}`,
        description: tab.description,
      })
    );
  }, [isAdmin]);

  const publicPortalLinks = useMemo(() => {
    const links = [
      {
        name: 'Online Pre-Registration',
        path: '/register',
        icon: UserPlus,
      },
    ];

    if (!isAlreadyPwaOrCapacitor) {
      links.push({
        name: 'Download App & Client',
        path: '/download',
        icon: Download,
      });
    }

    if (!isAuthenticated) {
      links.push(
        {
          name: 'Staff & Admin Login',
          path: '/login',
          icon: LogIn,
        },
        {
          name: 'Account Recovery',
          path: '/forgot-password',
          icon: KeyRound,
        }
      );
    }

    return links;
  }, [isAuthenticated, isAlreadyPwaOrCapacitor]);

  const hasCustomLogo = Boolean(gymConfig.gymLogo?.trim());
  const activeLogo =
    gymConfig.gymLogo || (isDark ? landscapeLogoDark : landscapeLogoLight);

  const handleNavigate = (path: string) => {
    if (location.pathname === path) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    navigate(path);
  };

  const handleAcceptFromModal = () => {
    setIsAgreementAccepted(true);
    if (onAcceptAgreement) {
      onAcceptAgreement();
    }
  };

  return (
    <footer
      className={`w-full mt-5 sm:mt-6 border border-slate-200/80 dark:border-white/10 bg-white/90 dark:bg-[#11141b]/95 backdrop-blur-md rounded-2xl sm:rounded-3xl p-4 sm:p-5 lg:p-6 lg:pb-6 text-slate-700 dark:text-slate-300 font-body transition-all select-none shadow-xs ${className}`}
    >
      {/* COLLAPSIBLE HEADER BAR */}
      {isCollapsible && (
        <div
          className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
            showExpandedFooter
              ? 'pb-3.5 mb-4 border-b border-slate-200/80 dark:border-white/10'
              : ''
          }`}
        >
          <div className="flex items-center justify-between sm:justify-start gap-3 min-w-0">
            <div className="flex items-center gap-2.5 min-w-0 flex-wrap">
              <img
                src={activeLogo}
                alt={gymConfig.gymName}
                className="h-7 sm:h-8 w-auto object-contain shrink-0"
              />
              {hasCustomLogo && (
                <span className="font-heading text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white truncate">
                  {gymConfig.gymName}
                </span>
              )}
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-600/10 dark:bg-red-500/15 text-[9px] font-mono font-bold uppercase tracking-widest text-blue-600 dark:text-red-400 shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                v{displayVersion}
                {latestCloudVersion &&
                  latestCloudVersion !== displayVersion && (
                    <span className="text-amber-600 dark:text-amber-400 ml-1">
                      (Latest v{latestCloudVersion})
                    </span>
                  )}
              </span>
              {!isFooterExpanded && (
                <span className="hidden lg:inline text-[10px] font-mono text-slate-500 dark:text-slate-400 truncate">
                  • © {new Date().getFullYear()} {gymConfig.gymName}
                </span>
              )}
            </div>

            {/* Mobile Toggle Button */}
            <button
              type="button"
              onClick={() => setIsFooterExpanded((prev) => !prev)}
              aria-expanded={isFooterExpanded}
              className="sm:hidden inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-white/5 hover:bg-blue-600/10 dark:hover:bg-red-500/15 border border-slate-200/80 dark:border-white/10 text-[10px] font-heading font-black uppercase tracking-wider text-slate-800 dark:text-slate-200 transition-all cursor-pointer shrink-0"
            >
              <span>{isFooterExpanded ? 'Collapse' : 'Details'}</span>
              <ChevronDown
                className={`w-3.5 h-3.5 text-blue-600 dark:text-red-400 transition-transform duration-200 ${
                  isFooterExpanded ? 'rotate-180' : ''
                }`}
              />
            </button>
          </div>

          {/* Quick Legal Pills + Toggle Button */}
          <div className="flex flex-wrap items-center justify-between sm:justify-end gap-1.5 sm:gap-2">
            {!isFooterExpanded && (
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setAgreementDoc('agreement')}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-600/10 dark:bg-red-500/15 hover:bg-blue-600/20 dark:hover:bg-red-500/25 border border-blue-500/30 dark:border-red-500/30 text-[10px] font-bold text-blue-700 dark:text-red-300 transition-colors cursor-pointer"
                >
                  <FileText className="w-3 h-3 shrink-0" />
                  <span>User Agreement</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAgreementDoc('terms')}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-white/5 hover:bg-slate-200/80 dark:hover:bg-white/10 border border-slate-200/70 dark:border-white/10 text-[10px] font-bold text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
                >
                  <Scale className="w-3 h-3 text-blue-600 dark:text-blue-400 shrink-0" />
                  <span>Terms</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAgreementDoc('privacy')}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-white/5 hover:bg-slate-200/80 dark:hover:bg-white/10 border border-slate-200/70 dark:border-white/10 text-[10px] font-bold text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
                >
                  <ShieldCheck className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>Privacy</span>
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => setIsFooterExpanded((prev) => !prev)}
              aria-expanded={isFooterExpanded}
              className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-slate-100 dark:bg-white/5 hover:bg-blue-600/10 dark:hover:bg-red-500/15 border border-slate-200/80 dark:border-white/10 text-[10px] font-heading font-black uppercase tracking-wider text-slate-800 dark:text-slate-200 transition-all cursor-pointer shrink-0"
            >
              <span>
                {isFooterExpanded ? 'Hide Footer' : 'Show Full Footer'}
              </span>
              <ChevronDown
                className={`w-3.5 h-3.5 text-blue-600 dark:text-red-400 transition-transform duration-200 ${
                  isFooterExpanded ? 'rotate-180' : ''
                }`}
              />
            </button>
          </div>
        </div>
      )}

      {/* EXPANDED CONTENT: Balanced 3-column tablet & 12-column desktop grid */}
      {showExpandedFooter && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-12 gap-5 sm:gap-6 lg:gap-7">
            {/* SECTION 1: Facility Information (Full width banner on tablet, col-span-4 on desktop) */}
            <div className="col-span-1 md:col-span-3 lg:col-span-4 space-y-3 text-left md:p-4 lg:p-0 rounded-2xl md:bg-slate-50/70 md:dark:bg-white/[0.02] lg:bg-transparent lg:dark:bg-transparent md:border md:border-slate-200/70 md:dark:border-white/5 lg:border-none">
              {!isCollapsible ? (
                <div className="flex items-center gap-2.5 flex-wrap">
                  <img
                    src={activeLogo}
                    alt={gymConfig.gymName}
                    className="h-8 sm:h-9 w-auto object-contain shrink-0"
                  />
                  {hasCustomLogo && (
                    <h3 className="font-heading text-xs sm:text-sm font-black uppercase tracking-wider text-slate-900 dark:text-white truncate">
                      {gymConfig.gymName}
                    </h3>
                  )}
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-blue-600/10 dark:bg-red-500/15 text-[9px] font-mono font-bold uppercase tracking-widest text-blue-600 dark:text-red-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    v{latestCloudVersion || displayVersion}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2 pb-1 border-b border-slate-200/60 dark:border-white/10 lg:border-none">
                  <Building2 className="w-3.5 h-3.5 text-blue-600 dark:text-red-400 shrink-0" />
                  <h4 className="font-heading text-[11px] font-black uppercase tracking-wider text-slate-900 dark:text-white">
                    Facility Information
                  </h4>
                </div>
              )}

              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                {gymConfig.gymDescription}
              </p>

              {/* Contact Information in a horizontal tablet grid, vertical desktop stack */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 gap-2 pt-1 text-[11px]">
                <div className="flex items-start gap-2 p-2 rounded-lg bg-slate-100/60 dark:bg-white/[0.03] lg:bg-transparent lg:dark:bg-transparent text-slate-600 dark:text-slate-300">
                  <MapPin className="w-3.5 h-3.5 text-blue-600 dark:text-red-400 shrink-0 mt-0.5" />
                  <span className="leading-snug">{gymConfig.gymAddress}</span>
                </div>

                <div className="flex flex-col gap-1.5 p-2 rounded-lg bg-slate-100/60 dark:bg-white/[0.03] lg:bg-transparent lg:dark:bg-transparent">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    {gymConfig.contactNumber1 && (
                      <a
                        href={`tel:${gymConfig.contactNumber1}`}
                        className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-red-400 transition-colors font-mono text-[11px]"
                      >
                        <Phone className="w-3 h-3 text-emerald-500 shrink-0" />
                        <span>
                          {gymConfig.contactName1}: {gymConfig.contactNumber1}
                        </span>
                      </a>
                    )}

                    {gymConfig.contactNumber2 && (
                      <a
                        href={`tel:${gymConfig.contactNumber2}`}
                        className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-red-400 transition-colors font-mono text-[11px]"
                      >
                        <Phone className="w-3 h-3 text-blue-500 shrink-0" />
                        <span>
                          {gymConfig.contactName2}: {gymConfig.contactNumber2}
                        </span>
                      </a>
                    )}
                  </div>

                  {gymConfig.emailAddress && (
                    <a
                      href={`mailto:${gymConfig.emailAddress}`}
                      className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-red-400 transition-colors font-mono text-[11px] truncate"
                    >
                      <Mail className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      <span className="truncate">{gymConfig.emailAddress}</span>
                    </a>
                  )}
                </div>
              </div>
            </div>

            {/* SECTION 2: Primary Console Navigation */}
            <div className="col-span-1 md:col-span-1 lg:col-span-3 border-t md:border-t-0 pt-3 md:pt-0 border-slate-200/70 dark:border-white/10 text-left">
              <div className="flex items-center gap-2 pb-1.5 border-b border-slate-200/60 dark:border-white/10">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-600 dark:bg-red-500" />
                <h4 className="font-heading text-[11px] font-black uppercase tracking-wider text-slate-900 dark:text-white">
                  {resolvedVariant === 'system' && isAuthenticated
                    ? 'Console Navigation'
                    : 'Portal Navigation'}
                </h4>
              </div>

              <div className="flex flex-col gap-1 pt-2.5">
                {resolvedVariant === 'system' && isAuthenticated
                  ? consoleNavLinks.map((item) => {
                      const isActive = location.pathname === item.path;
                      return (
                        <button
                          key={item.path}
                          type="button"
                          onClick={() => handleNavigate(item.path)}
                          className={`group flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left text-xs transition-all cursor-pointer ${
                            isActive
                              ? 'bg-blue-600/10 dark:bg-red-500/15 text-blue-600 dark:text-red-400 font-bold'
                              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white font-medium'
                          }`}
                        >
                          <span className="truncate">{item.name}</span>
                          <ChevronRight className="w-3 h-3 opacity-50 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all shrink-0" />
                        </button>
                      );
                    })
                  : publicPortalLinks.map((item) => {
                      const Icon = item.icon;
                      const isActive = location.pathname === item.path;
                      return (
                        <button
                          key={item.path}
                          type="button"
                          onClick={() => handleNavigate(item.path)}
                          className={`group flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-xs font-medium transition-all cursor-pointer ${
                            isActive
                              ? 'bg-blue-600/10 dark:bg-red-500/15 text-blue-600 dark:text-red-400 font-bold'
                              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white'
                          }`}
                        >
                          <Icon className="w-3.5 h-3.5 shrink-0 text-blue-600 dark:text-red-400" />
                          <span className="truncate">{item.name}</span>
                        </button>
                      );
                    })}
              </div>
            </div>

            {/* SECTION 3: System & Portal OR Live Rates */}
            <div className="col-span-1 md:col-span-1 lg:col-span-2 border-t md:border-t-0 pt-3 md:pt-0 border-slate-200/70 dark:border-white/10 text-left">
              <div className="flex items-center gap-2 pb-1.5 border-b border-slate-200/60 dark:border-white/10">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-600 dark:bg-red-500" />
                <h4 className="font-heading text-[11px] font-black uppercase tracking-wider text-slate-900 dark:text-white">
                  {resolvedVariant === 'system' && isAuthenticated
                    ? 'System & Portal'
                    : 'Live Facility Rates'}
                </h4>
              </div>

              <div className="flex flex-col gap-1 pt-2.5">
                {resolvedVariant === 'system' && isAuthenticated ? (
                  <>
                    {settingsNavLinks.map((tab) => {
                      const isActive = location.pathname === tab.path;
                      return (
                        <button
                          key={tab.path}
                          type="button"
                          onClick={() => handleNavigate(tab.path)}
                          className={`group flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left text-xs transition-all cursor-pointer ${
                            isActive
                              ? 'bg-blue-600/10 dark:bg-red-500/15 text-blue-600 dark:text-red-400 font-bold'
                              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white font-medium'
                          }`}
                        >
                          <span className="truncate">{tab.name}</span>
                          <ChevronRight className="w-3 h-3 opacity-50 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all shrink-0" />
                        </button>
                      );
                    })}
                    {publicPortalLinks.map((pub) => (
                      <button
                        key={pub.path}
                        type="button"
                        onClick={() => handleNavigate(pub.path)}
                        className="group flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white transition-all cursor-pointer"
                      >
                        <span className="truncate">{pub.name}</span>
                        <ExternalLink className="w-3 h-3 opacity-60 shrink-0" />
                      </button>
                    ))}
                  </>
                ) : (
                  <div className="space-y-1.5 text-[11px]">
                    <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-100/80 dark:bg-white/5">
                      <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                        <CreditCard className="w-3 h-3 text-emerald-500 shrink-0" />
                        Monthly Plan
                      </span>
                      <span className="font-mono font-bold text-slate-900 dark:text-white">
                        ₱{rates.monthly_plan_price.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-100/80 dark:bg-white/5">
                      <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                        <CreditCard className="w-3 h-3 text-blue-500 shrink-0" />
                        Yearly Plan
                      </span>
                      <span className="font-mono font-bold text-slate-900 dark:text-white">
                        ₱{rates.yearly_plan_price.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-100/80 dark:bg-white/5">
                      <span className="text-slate-500 dark:text-slate-400">
                        Walk-In / Student
                      </span>
                      <span className="font-mono font-bold text-slate-900 dark:text-white">
                        ₱{rates.regular_walkin_fee} / ₱{rates.student_walkin_fee}
                      </span>
                    </div>
                    <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-100/80 dark:bg-white/5">
                      <span className="text-slate-500 dark:text-slate-400">
                        Yearly Check-In
                      </span>
                      <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        ₱{rates.yearly_member_checkin_fee}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* SECTION 4: Legal & Documentation */}
            <div className="col-span-1 md:col-span-1 lg:col-span-3 border-t md:border-t-0 pt-3 md:pt-0 border-slate-200/70 dark:border-white/10 text-left">
              <div className="flex items-center gap-2 pb-1.5 border-b border-slate-200/60 dark:border-white/10">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-600 dark:bg-red-500" />
                <h4 className="font-heading text-[11px] font-black uppercase tracking-wider text-slate-900 dark:text-white">
                  Legal &amp; Documentation
                </h4>
              </div>

              <div className="flex flex-col gap-2 pt-2.5">
                <button
                  type="button"
                  onClick={() => setAgreementDoc('agreement')}
                  className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-blue-600/10 dark:bg-red-500/15 hover:bg-blue-600/20 dark:hover:bg-red-500/25 border border-blue-500/30 dark:border-red-500/30 text-xs font-bold text-blue-700 dark:text-red-300 transition-all cursor-pointer text-left"
                >
                  <span className="flex items-center gap-2 truncate">
                    <FileText className="w-3.5 h-3.5 text-blue-600 dark:text-red-400 shrink-0" />
                    <span className="truncate">User Agreement</span>
                  </span>
                  {isAgreementAccepted ? (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-[9px] font-black uppercase shrink-0">
                      <CheckCircle2 className="w-2.5 h-2.5" />
                      Accepted
                    </span>
                  ) : (
                    <span className="text-[9px] font-heading font-black uppercase tracking-wider underline shrink-0">
                      Review
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setAgreementDoc('terms')}
                  className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-slate-100/90 dark:bg-white/5 hover:bg-blue-600/10 dark:hover:bg-red-500/15 border border-slate-200/80 dark:border-white/10 text-xs font-bold text-slate-800 dark:text-slate-200 transition-all cursor-pointer text-left"
                >
                  <span className="flex items-center gap-2 truncate">
                    <Scale className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                    <span className="truncate">Terms &amp; Conditions</span>
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                </button>

                <button
                  type="button"
                  onClick={() => setAgreementDoc('privacy')}
                  className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-slate-100/90 dark:bg-white/5 hover:bg-emerald-500/10 border border-slate-200/80 dark:border-white/10 text-xs font-bold text-slate-800 dark:text-slate-200 transition-all cursor-pointer text-left"
                >
                  <span className="flex items-center gap-2 truncate">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span className="truncate">Privacy Policy</span>
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                </button>

                <button
                  type="button"
                  onClick={() => setShowDeveloperModal(true)}
                  className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-slate-100/90 dark:bg-white/5 hover:bg-amber-500/10 border border-slate-200/80 dark:border-white/10 text-xs font-bold text-slate-800 dark:text-slate-200 transition-all cursor-pointer text-left"
                >
                  <span className="flex items-center gap-2 truncate">
                    <Code2 className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    <span className="truncate">About Developer</span>
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                </button>
              </div>
            </div>
          </div>

          {/* Bottom Copyright & Compliance (Cleanly padded above the floating navigation dock) */}
          <div className="mt-6 pt-3.5 border-t border-slate-200/80 dark:border-white/10 flex flex-col sm:flex-row items-center justify-between gap-2 text-[10px] text-slate-500 dark:text-slate-400 font-mono">
            <div className="text-center sm:text-left">
              © {new Date().getFullYear()} {gymConfig.gymName} • All Rights Reserved.
            </div>
            <div className="text-center sm:text-right text-[9px] sm:text-[10px] text-slate-400 dark:text-slate-500">
              RA 10173 (Data Privacy) • RA 7394 (Consumer Act) • RA 11313 (Safe Spaces)
            </div>
          </div>
        </>
      )}

      {/* Shared Agreement Document Modal */}
      <AgreementDocumentViewer
        isOpen={agreementDoc !== null}
        onClose={() => setAgreementDoc(null)}
        initialDocument={agreementDoc || 'agreement'}
        onAccept={handleAcceptFromModal}
      />

      {/* Shared Developer Modal */}
      <Modal
        isOpen={showDeveloperModal}
        onClose={() => setShowDeveloperModal(false)}
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
              onClick={() => setShowDeveloperModal(false)}
              className="w-full py-2.5 bg-(--bg-input) text-(--color-text) rounded-xl font-heading text-xs uppercase tracking-wider hover:opacity-90 transition-all cursor-pointer text-center"
            >
              Close
            </button>
          </div>
        </div>
      </Modal>
    </footer>
  );
};

export default AppFooter;