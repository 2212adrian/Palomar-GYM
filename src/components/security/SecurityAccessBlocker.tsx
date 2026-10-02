// src/components/security/SecurityAccessBlocker.tsx
import React, { useState } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  Globe,
  MapPin,
  Wifi,
  RefreshCw,
  LogOut,
  AlertTriangle,
  KeyRound,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { toast } from 'react-toastify';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { supabase } from '../../lib/supabase/client';
import { buildAppUrl } from '../../lib/appUrl';
import { useAuthStore, markPendingNewLogin } from '../../stores/authStore';
import { useSecurityStore } from '../../stores/useSecurityStore';
import {
  type SecurityAccessCheckResult,
  checkIsSuperAdminUser,
} from '../../lib/securityAccessService';
import googleIcon from '../../assets/Google_Icon.webp';

interface SecurityAccessBlockerProps {
  checkResult: SecurityAccessCheckResult;
  onRetry: () => Promise<void>;
}

export const SecurityAccessBlocker: React.FC<SecurityAccessBlockerProps> = ({
  checkResult,
  onRetry,
}) => {
  const { user, checkSession, claimActiveSession, setLoginInProgress } =
    useAuthStore();
  const { config, fetchConfig, runVerification } = useSecurityStore();
  const [retrying, setRetrying] = useState(false);

  // Superadmin emergency login state (when logged out on /login)
  const [showSuperadminLogin, setShowSuperadminLogin] = useState(false);
  const [saIdentifier, setSaIdentifier] = useState('');
  const [saPassword, setSaPassword] = useState('');
  const [showSaPassword, setShowSaPassword] = useState(false);
  const [saSubmitting, setSaSubmitting] = useState(false);
  const [saGoogleSubmitting, setSaGoogleSubmitting] = useState(false);
  const [saError, setSaError] = useState<string | null>(null);

  const handleRetry = async () => {
    setRetrying(true);
    try {
      // 1. Force fetch latest security config from database to check if restrictions were disabled
      const latestCfg = await fetchConfig();
      const allDisabled =
        !latestCfg.location_restriction_enabled &&
        !latestCfg.wifi_restriction_enabled &&
        !latestCfg.ip_restriction_enabled;

      if (allDisabled) {
        toast.success('Facility security restrictions are disabled. Access granted.');
        return;
      }

      // 2. Re-evaluate terminal connection against the freshly fetched config
      await onRetry();

      const updatedResult = useSecurityStore.getState().checkResult;
      if (updatedResult?.allowed) {
        toast.success('Connection verified! Terminal access unlocked.');
      } else {
        toast.warning(
          'Terminal still does not meet active facility security requirements.',
          { toastId: 'security-recheck-blocked' }
        );
      }
    } finally {
      setRetrying(false);
    }
  };

  const handleSuperadminSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaError(null);

    const rawId = saIdentifier.trim().toLowerCase();
    if (!rawId || !saPassword) {
      setSaError('Please enter your Superadmin email and password.');
      return;
    }

    const candidateEmails = rawId.includes('@')
      ? [rawId]
      : [`${rawId}@gmail.com`, `${rawId}@palomargym.noemail`];

    setSaSubmitting(true);
    setLoginInProgress(true);
    try {
      let signedInEmail: string | null = null;
      let lastAuthErr: any = null;

      for (const emailToTry of candidateEmails) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: emailToTry,
          password: saPassword,
        });
        if (!error && data.user) {
          signedInEmail = data.user.email || emailToTry;
          lastAuthErr = null;
          break;
        }
        lastAuthErr = error;
      }

      if (lastAuthErr || !signedInEmail) {
        throw new Error(
          lastAuthErr?.message || 'Invalid Superadmin credentials.'
        );
      }

      // Strictly verify that the authenticated account is the Superadmin
      const isSuper = await checkIsSuperAdminUser(signedInEmail);
      if (!isSuper) {
        await supabase.auth.signOut();
        setSaError(
          'Access Denied: Only the Superadmin account can log in while terminal security restrictions are enforced.'
        );
        toast.error(
          'Access Denied: Non-superadmin accounts cannot bypass terminal restrictions.'
        );
        return;
      }

      await claimActiveSession();
      setLoginInProgress(false);
      await checkSession();
      await runVerification('admin', signedInEmail);
      toast.success('Superadmin verified. Terminal restriction bypassed.');
    } catch (err: any) {
      setSaError(
        err.message || 'Authentication failed. Verify your Superadmin credentials.'
      );
    } finally {
      setLoginInProgress(false);
      setSaSubmitting(false);
    }
  };

  const handleSuperadminGoogleSignIn = async () => {
    setSaError(null);
    setSaGoogleSubmitting(true);
    try {
      markPendingNewLogin();
      sessionStorage.setItem('palomar_superadmin_bypass_oauth', 'true');
      const isNative = Capacitor.isNativePlatform();
      const redirectTo = isNative
        ? 'com.wolfpalomar.gymmanagement://login'
        : buildAppUrl('/login');

      if (isNative) {
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo,
            skipBrowserRedirect: true,
          },
        });
        if (error) throw error;
        if (data?.url) {
          await Browser.open({ url: data.url, windowName: '_system' });
        }
      } else {
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo,
            queryParams: {
              access_type: 'offline',
              prompt: 'select_account',
            },
          },
        });
        if (error) throw error;
      }
    } catch (err: any) {
      sessionStorage.removeItem('palomar_superadmin_bypass_oauth');
      setSaError(err.message || 'Google authentication failed.');
      setSaGoogleSubmitting(false);
    }
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      // Ignore signOut error
    }
    window.location.href = '/login';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/90 dark:bg-black/95 backdrop-blur-md p-4 select-none overflow-y-auto">
      <div className="max-w-lg w-full bg-white dark:bg-[#121316] border border-slate-200 dark:border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 text-center animate-fade-in my-8">
        {/* Shield Icon */}
        <div className="w-18 h-18 bg-red-500/10 text-red-600 dark:text-red-500 rounded-2xl flex items-center justify-center mx-auto border border-red-500/20 shadow-inner">
          <ShieldAlert className="w-10 h-10" />
        </div>

        {/* Title and Explanation */}
        <div className="space-y-2">
          <span className="text-[10px] font-heading font-black tracking-widest uppercase text-red-600 dark:text-red-400">
            Facility Security Policy Active
          </span>
          <h2 className="text-xl sm:text-2xl font-heading tracking-widest text-slate-900 dark:text-white uppercase">
            Restricted Terminal Access
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-medium">
            This terminal is protected by facility access controls. Anonymous
            visitors and staff terminals must connect through the gym's
            authorized network and perimeter to access authentication.
          </p>
        </div>

        {/* Diagnostic Status Cards */}
        <div className="space-y-3 text-left">
          {/* Strategy 1: Gym Router Public IP Check */}
          {config.ip_restriction_enabled && (
            <div
              className={`p-3.5 rounded-2xl border flex items-start gap-3 text-xs ${
                checkResult.ipPassed
                  ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-800 dark:text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/20 text-rose-800 dark:text-rose-300'
              }`}
            >
              <div className="p-1.5 rounded-lg bg-white/50 dark:bg-black/30 shrink-0 mt-0.5">
                <Globe className="w-4 h-4 text-blue-500" />
              </div>
              <div className="space-y-0.5 flex-1">
                <div className="flex items-center justify-between">
                  <span className="font-heading font-bold uppercase tracking-wider">
                    Gym Router IP Verification
                  </span>
                  <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded-full bg-white dark:bg-black/50 border">
                    {checkResult.ipPassed ? 'PASSED' : 'BLOCKED'}
                  </span>
                </div>
                <p className="text-[11px] opacity-90 leading-tight">
                  Terminal IP:{' '}
                  <strong className="font-mono">
                    {checkResult.currentIP || 'Unknown'}
                  </strong>
                </p>
              </div>
            </div>
          )}

          {/* Wi-Fi Interface Check */}
          {config.wifi_restriction_enabled && (
            <div
              className={`p-3.5 rounded-2xl border flex items-start gap-3 text-xs ${
                checkResult.wifiPassed
                  ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-800 dark:text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/20 text-rose-800 dark:text-rose-300'
              }`}
            >
              <div className="p-1.5 rounded-lg bg-white/50 dark:bg-black/30 shrink-0 mt-0.5">
                <Wifi className="w-4 h-4 text-blue-500" />
              </div>
              <div className="space-y-0.5 flex-1">
                <div className="flex items-center justify-between">
                  <span className="font-heading font-bold uppercase tracking-wider">
                    Authorized Wi-Fi Network
                  </span>
                  <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded-full bg-white dark:bg-black/50 border">
                    {checkResult.wifiPassed ? 'PASSED' : 'BLOCKED'}
                  </span>
                </div>
                <p className="text-[11px] opacity-90 leading-tight">
                  {checkResult.isWifi
                    ? `Connected via Wi-Fi${checkResult.activeSsid ? ` (${checkResult.activeSsid})` : ''}.`
                    : 'Device is not connected to a physical local Wi-Fi network.'}
                </p>
              </div>
            </div>
          )}

          {/* Location Geofence Check */}
          {config.location_restriction_enabled && (
            <div
              className={`p-3.5 rounded-2xl border flex items-start gap-3 text-xs ${
                checkResult.locationPassed
                  ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-800 dark:text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/20 text-rose-800 dark:text-rose-300'
              }`}
            >
              <div className="p-1.5 rounded-lg bg-white/50 dark:bg-black/30 shrink-0 mt-0.5">
                <MapPin className="w-4 h-4 text-red-500" />
              </div>
              <div className="space-y-0.5 flex-1">
                <div className="flex items-center justify-between">
                  <span className="font-heading font-bold uppercase tracking-wider">
                    Geofence Perimeter
                  </span>
                  <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded-full bg-white dark:bg-black/50 border">
                    {checkResult.locationPassed ? 'PASSED' : 'BLOCKED'}
                  </span>
                </div>
                <p className="text-[11px] opacity-90 leading-tight">
                  {checkResult.distanceMeters !== undefined ? (
                    <>
                      Distance: <strong>{checkResult.distanceMeters}m</strong>{' '}
                      (Max permitted: {config.geofence_radius_meters}m).
                    </>
                  ) : (
                    'Location not verified.'
                  )}
                </p>
              </div>
            </div>
          )}

          {/* Error Details */}
          {checkResult.errors.length > 0 && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300 text-[11px] space-y-1">
              <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                Connection Requirement
              </div>
              <ul className="list-disc list-inside space-y-0.5 pl-1 opacity-90">
                {checkResult.errors.map((err, idx) => (
                  <li key={idx}>{err}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="space-y-2.5 pt-2">
          <button
            type="button"
            onClick={handleRetry}
            disabled={retrying}
            className="w-full py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-heading font-black tracking-widest uppercase transition-all shadow-md active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
          >
            <RefreshCw
              className={`w-4 h-4 ${retrying ? 'animate-spin' : ''}`}
            />
            <span>
              {retrying ? 'Checking Security State...' : 'Re-check Connection'}
            </span>
          </button>

          {/* Superadmin Bypass Login Option when logged out on /login */}
          {!user && (
            <div className="pt-2 border-t border-slate-200/80 dark:border-white/10">
              <button
                type="button"
                onClick={() => {
                  setShowSuperadminLogin((prev) => !prev);
                  setSaError(null);
                }}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200/80 dark:bg-white/5 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 text-[11px] font-heading font-bold tracking-wider uppercase transition-all flex items-center justify-between cursor-pointer border border-slate-200/60 dark:border-white/10"
              >
                <span className="flex items-center gap-2">
                  <KeyRound className="w-3.5 h-3.5 text-amber-500" />
                  <span>Superadmin Emergency Sign-In</span>
                </span>
                {showSuperadminLogin ? (
                  <ChevronUp className="w-4 h-4 opacity-70" />
                ) : (
                  <ChevronDown className="w-4 h-4 opacity-70" />
                )}
              </button>

              {showSuperadminLogin && (
                <div className="mt-3 p-4 rounded-2xl bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 text-left space-y-3 animate-fade-in">
                  <div className="flex items-start gap-2 text-[11px] text-slate-600 dark:text-slate-400">
                    <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <span>
                      Anonymous & regular staff logins remain blocked on this
                      terminal. Only the verified <strong>Superadmin</strong>{' '}
                      account can sign in here to manage or bypass restrictions.
                    </span>
                  </div>

                  {saError && (
                    <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-300 text-[11px] font-medium">
                      {saError}
                    </div>
                  )}

                  <form onSubmit={handleSuperadminSignIn} className="space-y-2.5">
                    <div className="relative">
                      <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        value={saIdentifier}
                        onChange={(e) => setSaIdentifier(e.target.value)}
                        placeholder="Superadmin Email or Username"
                        autoComplete="username"
                        className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-white dark:bg-[#18191d] border border-slate-200 dark:border-white/10 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500/40"
                      />
                    </div>

                    <div className="relative">
                      <Lock className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type={showSaPassword ? 'text' : 'password'}
                        value={saPassword}
                        onChange={(e) => setSaPassword(e.target.value)}
                        placeholder="Superadmin Password"
                        autoComplete="current-password"
                        className="w-full pl-9 pr-9 py-2.5 rounded-xl bg-white dark:bg-[#18191d] border border-slate-200 dark:border-white/10 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500/40"
                      />
                      <button
                        type="button"
                        onClick={() => setShowSaPassword((p) => !p)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                        tabIndex={-1}
                      >
                        {showSaPassword ? (
                          <EyeOff className="w-3.5 h-3.5" />
                        ) : (
                          <Eye className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>

                    <button
                      type="submit"
                      disabled={saSubmitting || saGoogleSubmitting}
                      className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-200 text-white dark:text-slate-900 rounded-xl text-xs font-heading font-black tracking-wider uppercase transition-all cursor-pointer disabled:opacity-50"
                    >
                      {saSubmitting
                        ? 'Verifying Superadmin...'
                        : 'Sign In as Superadmin'}
                    </button>
                  </form>

                  <div className="relative flex py-1 items-center">
                    <div className="grow border-t border-slate-200 dark:border-white/10"></div>
                    <span className="shrink mx-2 text-[10px] font-heading uppercase tracking-widest text-slate-400">
                      Or
                    </span>
                    <div className="grow border-t border-slate-200 dark:border-white/10"></div>
                  </div>

                  <button
                    type="button"
                    onClick={handleSuperadminGoogleSignIn}
                    disabled={saSubmitting || saGoogleSubmitting}
                    className="w-full py-2.5 px-3 bg-white hover:bg-slate-50 dark:bg-[#18191d] dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 rounded-xl text-xs font-heading font-bold text-slate-800 dark:text-white flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                  >
                    <img
                      src={googleIcon}
                      alt="Google"
                      className="w-4 h-4 object-contain"
                    />
                    <span>
                      {saGoogleSubmitting
                        ? 'Redirecting to Google...'
                        : 'Continue with Google (Superadmin)'}
                    </span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Only display sign out if user has an existing session */}
          {user && (
            <button
              type="button"
              onClick={handleLogout}
              className="w-full py-2.5 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 text-xs font-heading font-bold tracking-wider uppercase transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
