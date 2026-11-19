// src/pages/auth/OAuthCallback.tsx
import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'react-toastify';
import { Button } from '../../components/ui/Button';
import { supabase } from '../../lib/supabase/client';
import { markPendingNewLogin, useAuthStore } from '../../stores/authStore';
import {
  swapNoemailWithGoogleIdentity,
  waitForPersistedOAuthSession,
} from '../../lib/oauthCallback';

export const OAuthCallback: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const hasStartedRef = useRef(false);

  const [statusMessage, setStatusMessage] = useState(
    'Verifying Google authentication...'
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDone, setIsDone] = useState(false);

  useEffect(() => {
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;

    const processOAuthCallback = async () => {
      try {
        const searchParams = new URLSearchParams(location.search);
        const hashRaw = location.hash.startsWith('#')
          ? location.hash.slice(1)
          : location.hash;
        const hashParams = new URLSearchParams(hashRaw);

        const oauthError =
          searchParams.get('error_description') ||
          hashParams.get('error_description') ||
          searchParams.get('error') ||
          hashParams.get('error');
        const oauthErrorCode =
          searchParams.get('error_code') || hashParams.get('error_code');

        if (oauthError) {
          let friendly = oauthError.replace(/\+/g, ' ');
          if (oauthErrorCode === 'signup_disabled') {
            friendly =
              'This Google account has not been registered or linked yet. Please sign in with your username/password and link Google inside Personal Account settings.';
          }
          setErrorMessage(friendly);
          toast.error(friendly, { toastId: 'oauth-callback-error' });
          return;
        }

        const intent = searchParams.get('intent') || 'login';
        const requestedNext = searchParams.get('next');

        // Mark pending OAuth login so session claiming executes cleanly without false conflict logout
        markPendingNewLogin();
        useAuthStore.getState().setLoginInProgress(true);

        setStatusMessage('Persisting secure session...');
        const session = await waitForPersistedOAuthSession(
          location.search,
          location.hash
        );

        if (!session?.user) {
          setErrorMessage(
            'Could not verify a persisted Google sign-in session. Please try signing in again.'
          );
          return;
        }

        // Persist single-session claim in both user_metadata and localStorage first
        setStatusMessage('Securing active terminal session...');
        await useAuthStore.getState().claimActiveSession(session.user.id);

        // Check for @palomargym.noemail placeholder account and swap to verified Google email
        setStatusMessage('Checking account email configuration...');
        const swapResult = await swapNoemailWithGoogleIdentity(session.user);

        if (swapResult.errorMessage) {
          toast.error(swapResult.errorMessage, {
            toastId: 'oauth-email-swap-error',
          });
        } else if (swapResult.swapped && swapResult.newEmail) {
          toast.success(
            swapResult.wasNoemail
              ? `Account upgraded! Login email switched to ${swapResult.newEmail}.`
              : `Account email synchronized to ${swapResult.newEmail}.`,
            { toastId: 'oauth-email-swap-success' }
          );
        }

        // Hydrate store with the latest refreshed session & profile before routing
        await supabase.auth.refreshSession().catch(() => {});
        useAuthStore.getState().setLoginInProgress(false);
        await useAuthStore.getState().checkSession();

        // Clean URL query/hash params before navigating
        if (typeof window !== 'undefined') {
          window.history.replaceState(null, '', window.location.pathname);
        }

        setIsDone(true);

        if (intent === 'link') {
          setStatusMessage('Google account linked! Returning to settings...');
          const target =
            requestedNext && requestedNext.startsWith('/')
              ? requestedNext
              : '/settings/personal-account';
          navigate(target, { replace: true });
          return;
        }

        setStatusMessage('Authentication verified. Preparing workspace...');
        const profile = useAuthStore.getState().profile;
        const alreadyGreeted =
          typeof window !== 'undefined' &&
          sessionStorage.getItem('palomar_greeting_shown') === 'true';

        if (!alreadyGreeted) {
          navigate('/login', { replace: true });
        } else {
          const target =
            requestedNext && requestedNext.startsWith('/')
              ? requestedNext
              : profile?.role === 'staff'
                ? '/cash-management'
                : '/dashboard';
          navigate(target, { replace: true });
        }
      } catch (err: any) {
        useAuthStore.getState().setLoginInProgress(false);
        const msg =
          err?.message || 'Unexpected error during Google verification.';
        setErrorMessage(msg);
        toast.error(msg, { toastId: 'oauth-callback-exception' });
      } finally {
        useAuthStore.getState().setLoginInProgress(false);
      }
    };

    processOAuthCallback();
  }, [location.search, location.hash, navigate]);

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-slate-50 dark:bg-[#0f1012] p-4 select-none">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#161920] p-7 sm:p-8 shadow-2xl text-center space-y-5">
        {errorMessage ? (
          <>
            <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-500 flex items-center justify-center mx-auto">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div className="space-y-1.5">
              <h1 className="font-heading text-base font-extrabold uppercase tracking-wider text-slate-900 dark:text-white">
                Verification Failed
              </h1>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                {errorMessage}
              </p>
            </div>
            <Button
              type="button"
              onClick={() => navigate('/login', { replace: true })}
            >
              Return to Login
            </Button>
          </>
        ) : (
          <>
            <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto">
              {isDone ? (
                <CheckCircle2 className="w-6 h-6 text-emerald-500" />
              ) : (
                <ShieldCheck className="w-6 h-6" />
              )}
            </div>
            <div className="space-y-1.5">
              <h1 className="font-heading text-base font-extrabold uppercase tracking-wider text-slate-900 dark:text-white">
                Google Account Verification
              </h1>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                {statusMessage}
              </p>
            </div>
            {!isDone && (
              <div className="flex items-center justify-center gap-2 pt-1 text-[11px] font-mono text-slate-500 dark:text-slate-400">
                <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                <span>Synchronizing session state...</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
