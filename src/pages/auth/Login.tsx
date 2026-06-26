import React, { useState, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, useLocation } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, ShieldAlert, CheckCircle2, Sun, Moon } from 'lucide-react';
import { toast } from 'react-toastify';
import { supabase } from '../../lib/supabase/client';
import { useAuthStore } from '../../stores/authStore';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Card } from '../../components/ui/Card';
import pkg from '../../../package.json';

// ─── Asset Imports ────────────────────────────────────────────────────────────
import carousel1 from '../../assets/1-carousel.webp';
import carousel2 from '../../assets/2-carousel.webp';
import carousel3 from '../../assets/3-carousel.webp';
import carousel4 from '../../assets/4-carousel.webp';
import carousel5 from '../../assets/5-carousel.webp';
import carousel6 from '../../assets/6-carousel.webp';
import landscapeLogo from '../../assets/landscape-logo.webp';

const CAROUSEL_IMAGES = [carousel1, carousel2, carousel3, carousel4, carousel5, carousel6];
const TYPEWRITER_PHRASES = ['SECURE.', 'RELIABLE.', 'STRENGTH.', 'LIMITS.', 'ENDURANCE.', 'CAPACITY.'];
const APP_VERSION = pkg.version || '2.0.0B';

// ─── Zod Schemas ──────────────────────────────────────────────────────────────
const loginSchema = z.object({
  email: z.string().email({ message: 'Please enter a valid email address' }),
  password: z.string().min(6, { message: 'Password must be at least 6 characters' }),
  agree: z.boolean().refine((val) => val === true, {
    message: 'You must agree to the Terms and Privacy Policy',
  }),
});

const recoverySchema = z.object({
  email: z.string().email({ message: 'Please enter a valid authorized email' }),
});

type LoginFormValues = z.infer<typeof loginSchema>;
type RecoveryFormValues = z.infer<typeof recoverySchema>;

// ─── Theme initialiser (runs once, before first render) ──────────────────────
function getInitialTheme(): 'dark' | 'light' {
  if (typeof window === 'undefined') return 'dark';
  const saved = localStorage.getItem('theme');
  if (saved === 'dark' || saved === 'light') return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

// ─── Component ────────────────────────────────────────────────────────────────
export const Login: React.FC = () => {
  const navigate  = useNavigate();
  const location  = useLocation();
  const { checkSession, user, initialized, error: storeError, setError } = useAuthStore();

  const from = (location.state as any)?.from?.pathname || '/dashboard';

  // ── Layout / reveal ──────────────────────────────────────────────────────
  const [isReady,       setIsReady]       = useState(false);
  const [isFlipped,     setIsFlipped]     = useState(false);
  const [isLoggingIn,   setIsLoggingIn]   = useState(false); // locks redirect, triggers outro

  // ── Auth submit states ───────────────────────────────────────────────────
  const [isSubmitting,       setIsSubmitting]       = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);

  // ── Password visibility ──────────────────────────────────────────────────
  const [showPassword,    setShowPassword]    = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  // ── Shake animations ─────────────────────────────────────────────────────
  const [shakeEmail,    setShakeEmail]    = useState(false);
  const [shakePassword, setShakePassword] = useState(false);
  const [shakeRecovery, setShakeRecovery] = useState(false);

  // ── Recovery flow ────────────────────────────────────────────────────────
  const [recoveryStep,        setRecoveryStep]        = useState<'email' | 'otp'>('email');
  const [recoveryEmail,       setRecoveryEmail]       = useState('');
  const [recoveryStatusText,  setRecoveryStatusText]  = useState('Connecting...');
  const [isRecoverySubmitting,setIsRecoverySubmitting]= useState(false);
  const [otpDigits,           setOtpDigits]           = useState<string[]>(['', '', '', '', '', '']);
  const [newPassword,         setNewPassword]         = useState('');
  const [resendTimer,         setResendTimer]         = useState(60);
  const [recoveryError,       setRecoveryError]       = useState<string | null>(null);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  // ── Modals ───────────────────────────────────────────────────────────────
  const [showExitConfirm,  setShowExitConfirm]  = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  // ── Welcome overlay ──────────────────────────────────────────────────────
  // (removed — Dashboard replays the login intro animation instead)

  // ── Carousel ─────────────────────────────────────────────────────────────
  const [activeSlide, setActiveSlide] = useState(0);

  // ── Typewriter ───────────────────────────────────────────────────────────
  const [typewriterText, setTypewriterText] = useState('');
  const [phraseIndex,    setPhraseIndex]    = useState(0);
  const [isDeleting,     setIsDeleting]     = useState(false);

  // ── Theme ────────────────────────────────────────────────────────────────
  const [theme, setTheme] = useState<'dark' | 'light'>(getInitialTheme);

  // ─── Effects ──────────────────────────────────────────────────────────────

  // Theme sync
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark',  theme === 'dark');
    root.classList.toggle('light', theme === 'light');
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Session guard — skip redirect while outro animation is running
  useEffect(() => {
    if (initialized && user && !isLoggingIn) {
      navigate('/dashboard', { replace: true });
    }
  }, [initialized, user, navigate, isLoggingIn]);

  // Capture forwarded OAuth errors from URL hash / query params
  useEffect(() => {
    const hash  = new URLSearchParams(window.location.hash.slice(1));
    const query = new URLSearchParams(window.location.search);
    const errorDesc = hash.get('error_description') || query.get('error_description');
    const errorCode = hash.get('error_code')        || query.get('error_code');

    if (errorDesc) {
      let msg = errorDesc.replace(/\+/g, ' ');
      if (errorCode === 'signup_disabled') {
        msg = 'This account has not been registered. Please contact an administrator.';
      }
      toast.error(msg, { toastId: 'unauthorized-access-toast' });
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);

  // Deduplicate store errors (e.g. access-denied from Google OAuth)
  useEffect(() => {
    if (storeError) {
      toast.error(storeError, { toastId: 'unauthorized-access-toast' });
      setError(null);
      setIsGoogleSubmitting(false);
    }
  }, [storeError, setError]);

  // Shrink-reveal on mount
  useEffect(() => {
    const t = setTimeout(() => setIsReady(true), 150);
    return () => clearTimeout(t);
  }, []);

  // Carousel auto-advance
  useEffect(() => {
    const t = setInterval(() => setActiveSlide((p) => (p + 1) % CAROUSEL_IMAGES.length), 5000);
    return () => clearInterval(t);
  }, []);

  // OTP resend countdown
  useEffect(() => {
    if (resendTimer > 0 && recoveryStep === 'otp') {
      const t = setTimeout(() => setResendTimer((p) => p - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [resendTimer, recoveryStep]);

  // Typewriter loop
  useEffect(() => {
    const current = TYPEWRITER_PHRASES[phraseIndex];
    let t: ReturnType<typeof setTimeout>;

    const tick = () => {
      if (!isDeleting) {
        setTypewriterText(current.substring(0, typewriterText.length + 1));
        if (typewriterText === current) {
          t = setTimeout(() => setIsDeleting(true), 2500);
        } else {
          t = setTimeout(tick, 50);
        }
      } else {
        setTypewriterText(current.substring(0, typewriterText.length - 1));
        if (typewriterText === '') {
          setIsDeleting(false);
          setPhraseIndex((p) => (p + 1) % TYPEWRITER_PHRASES.length);
        } else {
          t = setTimeout(tick, 25);
        }
      }
    };

    t = setTimeout(tick, isDeleting ? 20 : 50);
    return () => clearTimeout(t);
  }, [typewriterText, isDeleting, phraseIndex]);

  // ─── Forms ────────────────────────────────────────────────────────────────
  const {
    register: registerLogin,
    handleSubmit: handleLoginSubmit,
    setValue: setLoginValue,
    watch: watchLogin,
    formState: { errors: loginErrors, touchedFields: touchedLogin },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '', agree: true },
  });

  const {
    register: registerRecovery,
    handleSubmit: handleRecoverySubmit,
    setValue: setRecoveryValue,
    watch: watchRecovery,
    formState: { errors: recoveryErrors, touchedFields: touchedRecovery },
  } = useForm<RecoveryFormValues>({
    resolver: zodResolver(recoverySchema),
    defaultValues: { email: '' },
  });

  const watchEmail         = watchLogin('email');
  const watchPassword      = watchLogin('password');
  const watchRecoveryEmail = watchRecovery('email');

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /** One-shot shake: sets flag, clears after animation duration */
  const triggerShake = (setter: React.Dispatch<React.SetStateAction<boolean>>) => {
    setter(true);
    setTimeout(() => setter(false), 500);
  };

  /** Auto-append @gmail.com if the user typed without a domain */
  const normaliseEmail = (
    val: string,
    setter: (field: any, val: string, opts?: any) => void,
    field: any,
  ) => {
    if (val && !val.includes('@')) {
      setter(field, `${val.trim()}@gmail.com`, { shouldValidate: true });
    }
  };

  /** Reset recovery state back to initial */
  const resetRecovery = () => {
    setRecoveryStep('email');
    setOtpDigits(['', '', '', '', '', '']);
    setNewPassword('');
    setRecoveryError(null);
  };

  // ─── Auth handlers ────────────────────────────────────────────────────────

  const handleGoogleLogin = async () => {
    setIsGoogleSubmitting(true);
    try {
      const appUrl = import.meta.env.VITE_APP_URL || window.location.origin;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${appUrl}/dashboard` },
      });
      if (error) throw error;
    } catch (err: any) {
      toast.error(err.message || 'OAuth handshake parameters invalid.');
      setIsGoogleSubmitting(false);
    }
  };

  const onLoginSubmit = async (data: LoginFormValues) => {
  if (isSubmitting) return;
  setIsSubmitting(true);
  setShakeEmail(false);
  setShakePassword(false);

  try {
    const { error } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });
    if (error) throw error;

    // 1. Lock session redirects and trigger the reversed Outro Animation
    sessionStorage.setItem('outroActive', 'true');
    sessionStorage.setItem('playDashboardIntro', 'true'); // Flag for dashboard intro
    setIsLoggingIn(true); // Fades and scales down login card & logos
    setIsReady(false);    // Smoothly expands left panel back to 100% width

    await checkSession();
    const loggedInUser = useAuthStore.getState().user;

    if (!loggedInUser) {
      setIsSubmitting(false);
      setIsLoggingIn(false);
      setIsReady(true);
      sessionStorage.removeItem('outroActive');
      return;
    }

    // 2. Wait exactly 1.8s for the slide transition to complete (Left panel covers screen)
    setTimeout(() => {
      sessionStorage.removeItem('outroActive');
      navigate(from, { replace: true });
    }, 1800); // <-- Change this timeout to 1800ms to allow the full outro animation to complete

  } catch (err: any) {
    toast.error(err.message || 'Invalid email or password.');
    setLoginValue('password', '');
    triggerShake(setShakePassword);
  } finally {
    setIsSubmitting(false);
  }
};

  const onInvalidLoginSubmit = () => {
    if (loginErrors.email)    triggerShake(setShakeEmail);
    if (loginErrors.password) triggerShake(setShakePassword);
  };

  const onInvalidRecoverySubmit = () => triggerShake(setShakeRecovery);

  // ─── Recovery handlers ────────────────────────────────────────────────────

  const requestOtp = async (email: string) => {
    setRecoveryError(null);
    setIsRecoverySubmitting(true);
    setRecoveryStatusText('Connecting...');

    await new Promise((r) => setTimeout(r, 1000));
    setRecoveryStatusText('Verifying...');
    await new Promise((r) => setTimeout(r, 800));

    try {
      const res = await fetch('/.netlify/functions/auth-recovery', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action: 'send-otp', email }),
      });

      const ct = res.headers.get('content-type');
      if (!ct?.includes('application/json')) {
        throw new Error('Local server connection error. Please try again.');
      }

      const resData = await res.json();

      // Rate-limited — sync timer and jump straight to OTP entry
      if (res.status === 429) {
        setRecoveryEmail(email);
        setRecoveryStep('otp');
        setResendTimer(resData.remaining_seconds || 60);
        throw new Error('Please wait for the cooldown timer before requesting another code.');
      }

      if (!res.ok) throw new Error('We could not verify this email. Please try again.');

      setRecoveryEmail(email);
      setRecoveryStep('otp');
      setResendTimer(60);
      setOtpDigits(['', '', '', '', '', '']);
      toast.info('Verification code sent to your email.');

    } catch (err: any) {
      setRecoveryError(err.message);
      triggerShake(setShakeRecovery);
    } finally {
      setIsRecoverySubmitting(false);
    }
  };

  const onRecoverySubmit = async (data: RecoveryFormValues) => requestOtp(data.email);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setRecoveryError(null);
    setIsRecoverySubmitting(true);
    setRecoveryStatusText('Verifying code...');

    const otp = otpDigits.join('');
    if (otp.length !== 6 || !newPassword) {
      setRecoveryError('Please enter your verification code and new password.');
      setIsRecoverySubmitting(false);
      return;
    }

    try {
      const res = await fetch('/.netlify/functions/auth-recovery', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          action:       'verify-otp',
          email:        recoveryEmail,
          otp,
          new_password: newPassword,
        }),
      });

      const ct = res.headers.get('content-type');
      if (!ct?.includes('application/json')) throw new Error('Connection error. Please try again.');
      await res.json();
      if (!res.ok) throw new Error('Code verification failed. Please try again.');

      setShowSuccessModal(true);

    } catch (err: any) {
      setRecoveryError(err.message || 'Verification failed. Please try again.');
      setOtpDigits(['', '', '', '', '', '']);
      otpRefs.current[0]?.focus();
    } finally {
      setIsRecoverySubmitting(false);
    }
  };

  // ─── Email normalisation wrappers ─────────────────────────────────────────

  const handlePreLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    normaliseEmail(watchEmail, setLoginValue, 'email');
    handleLoginSubmit(onLoginSubmit, onInvalidLoginSubmit)(e);
  };

  const handlePreRecoverySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    normaliseEmail(watchRecoveryEmail, setRecoveryValue, 'email');
    handleRecoverySubmit(onRecoverySubmit, onInvalidRecoverySubmit)(e);
  };

  // ─── OTP input handlers ───────────────────────────────────────────────────

  const handleOtpChange = (index: number, val: string) => {
    if (!/^\d*$/.test(val)) return;
    const next = [...otpDigits];
    next[index] = val.slice(-1);
    setOtpDigits(next);
    if (val && index < 5) otpRefs.current[index + 1]?.focus();
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if      (e.key === 'Backspace'   && !otpDigits[index] && index > 0) otpRefs.current[index - 1]?.focus();
    else if (e.key === 'ArrowLeft'   && index > 0)                       otpRefs.current[index - 1]?.focus();
    else if (e.key === 'ArrowRight'  && index < 5)                       otpRefs.current[index + 1]?.focus();
  };

  const handleOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').trim();
    if (!/^\d{6}$/.test(pasted)) return;
    setOtpDigits(pasted.split(''));
    otpRefs.current[5]?.focus();
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="relative w-full h-screen overflow-hidden bg-white dark:bg-[#0f1012] select-none font-sans text-slate-900 dark:text-slate-100">

      {/* Keyframe injection */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0);    }
        }
        .animate-slide-up { animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
      `}} />

      {/* ── Theme toggle ─────────────────────────────────────────────────── */}
      <button
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        className="absolute top-4 right-4 z-50 flex items-center gap-3 bg-white/80 dark:bg-neutral-900/80 border border-slate-200 dark:border-white/10 rounded-full px-4 py-2.5 shadow-lg backdrop-blur-md cursor-pointer hover:opacity-95"
      >
        {/* Palette preview squares */}
        <div className="flex border border-slate-300 dark:border-white/15 rounded-sm overflow-hidden" aria-hidden="true">
          {theme === 'dark' ? (
            <>
              <span className="w-3.5 h-3.5 bg-[#0f1012]" />
              <span className="w-3.5 h-3.5 bg-[#bf0202]" />
              <span className="w-3.5 h-3.5 bg-[#13161a]" />
            </>
          ) : (
            <>
              <span className="w-3.5 h-3.5 bg-[#ffffff]" />
              <span className="w-3.5 h-3.5 bg-[#1b365d]" />
              <span className="w-3.5 h-3.5 bg-[#f3f4f6]" />
            </>
          )}
        </div>
        <span className="text-slate-700 dark:text-slate-300 text-[10px] font-black tracking-widest flex items-center gap-1">
          {theme === 'dark' ? (
            <><Sun  className="w-3.5 h-3.5 text-amber-400"  /><span>LIGHT</span></>
          ) : (
            <><Moon className="w-3.5 h-3.5 text-indigo-400" /><span>DARK</span></>
          )}
        </span>
      </button>

      {/* ── Split container ───────────────────────────────────────────────── */}
      <div className={`flex w-full h-full auth-split-container ${isReady ? 'is-ready' : ''}`}>

        {/* ── LEFT PANEL ─────────────────────────────────────────────────── */}
        <div className="auth-left flex flex-col items-center justify-center z-10 px-4">

          {/* Mobile logo */}
          <img 
  src="/favicon.svg" 
  alt="Palomar Logo" 
  className={`block lg:hidden w-28 h-28 object-contain rounded-3xl border border-slate-200 dark:border-white/5 bg-white dark:bg-[#141414] p-3 shadow-xl mb-6 mx-auto animate-slide-up transition-all duration-500 ${isLoggingIn ? 'opacity-0 scale-95 pointer-events-none' : ''}`} 
/>


          {/* Desktop logo */}
          <div className="hidden lg:block mb-8 shrink-0 relative z-20 animate-slide-up">
  <img 
    src={landscapeLogo} 
    alt="Palomar Logo" 
    className={`w-52 h-auto object-contain rounded-2xl shadow-xl border border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-[#141414] p-3 transition-all duration-500 ${isLoggingIn ? 'opacity-0 scale-95 pointer-events-none' : ''}`} 
  />
</div>

          {/* ── Flip card ──────────────────────────────────────────────── */}
          <Card isFlipped={isFlipped} isLoggingIn={isLoggingIn}>

            {/* ── FRONT: Login ─────────────────────────────────────────── */}
            <div className="flip-card-front flex flex-col justify-between h-full bg-transparent border-none shadow-none lg:bg-neutral-50/95 lg:dark:bg-[#141414]/95 lg:border lg:border-slate-200 lg:dark:border-white/5 lg:p-8 lg:rounded-4xl lg:shadow-2xl">

              {/* Header */}
              <div>
                <div className="text-center brand text-2xl font-heading tracking-[0.08em] mb-1 text-slate-900 dark:text-white pt-2 lg:pt-0">
                  LOGIN
                </div>
                <p className="text-center font-heading text-[10px] tracking-[2.4px] text-[#1b365d] dark:text-blue-400 uppercase opacity-90 mb-2">
                  GYM MANAGEMENT SYSTEM
                </p>
                <div className="flex justify-center mb-6">
                  <span className="text-[9px] text-slate-500 dark:text-slate-300 tracking-widest border border-blue-500/30 dark:border-rose-500/30 bg-blue-500/5 dark:bg-rose-500/10 rounded-full px-3 py-1 font-mono uppercase">
                    v{APP_VERSION}
                  </span>
                </div>

                {/* Login form */}
                <form onSubmit={handlePreLoginSubmit} className="space-y-4 font-body">
                  <Input
                    {...registerLogin('email')}
                    type="email"
                    label="Email Address"
                    icon={<Mail className="w-4 h-4 text-slate-400" />}
                    error={!!loginErrors.email}
                    shake={shakeEmail}
                    touched={touchedLogin.email}
                    isPopulated={!!watchEmail}
                  />

                  <Input
                    {...registerLogin('password')}
                    type={showPassword ? 'text' : 'password'}
                    label="Password"
                    icon={<Lock className="w-4 h-4 text-slate-400" />}
                    error={!!loginErrors.password}
                    shake={shakePassword}
                    touched={touchedLogin.password}
                    isPopulated={!!watchPassword}
                    rightElement={
                      <button
                        type="button"
                        onClick={() => setShowPassword((p) => !p)}
                        className="field-visibility-toggle cursor-pointer"
                        aria-label="Toggle password visibility"
                      >
                        {showPassword ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
                      </button>
                    }
                  />

                  {/* Agreement checkbox */}
                  <div className="flex items-start gap-2.5 my-2">
                    <input
                      type="checkbox"
                      id="loginAgreement"
                      {...registerLogin('agree')}
                      className="styled-checkbox"
                    />
                    <label htmlFor="loginAgreement" className="checkbox-label">
                      <span className="checkbox-ui" />
                      <span className="text-[10px] text-slate-900 dark:text-slate-400 font-bold">
                        I agree to the{' '}
                        <a href="#" className="text-[#1b365d] dark:text-sky-400 hover:underline">Terms & Conditions</a>
                        {' '}and{' '}
                        <a href="#" className="text-[#1b365d] dark:text-sky-400 hover:underline">Privacy Policy</a>.
                      </span>
                    </label>
                  </div>

                  <Button type="submit" loading={isSubmitting} loadingLabel="VERIFYING...">
                    Login Now
                  </Button>

                  {/* Google OAuth */}
                  <Button
                    type="button"
                    variant="google"
                    onClick={handleGoogleLogin}
                    loading={isGoogleSubmitting}
                  >
                    <svg className="w-4 h-4 text-[#ea4335] shrink-0" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                    </svg>
                    <span>Continue With Google</span>
                  </Button>
                </form>
              </div>

              {/* Footer */}
              <div className="space-y-4 mt-4 font-body">
                <div className="flex items-center justify-center text-xs font-bold text-slate-400">
                  <button
                    onClick={() => { setIsFlipped(true); setRecoveryStep('email'); setRecoveryError(null); }}
                    className="hover:text-slate-800 dark:hover:text-white hover:underline transition-all cursor-pointer"
                  >
                    Forgot Password?
                  </button>
                </div>

                <div className="protocol-notice-box p-3 bg-slate-100 dark:bg-red-950/10 border border-slate-200 dark:border-[#a63429] rounded-xl text-left">
                  <div className="notice-header flex items-center gap-1.5 text-[10px] font-bold text-[#1b365d] dark:text-blue-400 tracking-wider mb-1 font-heading">
                    <ShieldAlert className="w-4 h-4 text-[#1b365d] dark:text-[#bf0202]" />
                    <span>ACCESS PROTOCOL</span>
                  </div>
                  <p className="notice-body text-[9px] text-slate-900 dark:text-slate-400 leading-relaxed font-bold">
                    This terminal is exclusively for authorized staff members including trainers and coaches, as well as family members with administrative privileges.
                  </p>
                </div>

                <div className="text-center text-[9px] text-slate-900 dark:text-slate-500 font-bold">
                  © {new Date().getFullYear()} WOLF PALOMAR. All Rights Reserved.
                </div>
              </div>
            </div>

            {/* ── BACK: Recovery ────────────────────────────────────────── */}
            <div className="flip-card-back flex flex-col justify-between h-full bg-transparent border-none shadow-none lg:bg-neutral-50/95 lg:dark:bg-[#141414]/95 lg:border lg:border-slate-200 lg:dark:border-white/5 lg:p-8 lg:rounded-4xl lg:shadow-2xl">

              <div>
                <div className="text-center brand text-2xl font-heading tracking-[0.08em] mb-1 text-slate-900 dark:text-white pt-2 lg:pt-0">
                  RECOVERY MODE
                </div>

                {/* Step 1: Email */}
                {recoveryStep === 'email' ? (
                  <div className="animate-slide-up">
                    <p className="desc text-center text-xs text-slate-900 dark:text-slate-400 mb-6 leading-relaxed font-bold">
                      Enter authorized email to receive security key.
                    </p>
                    <form onSubmit={handlePreRecoverySubmit} className="space-y-4 font-body">
                      <Input
                        {...registerRecovery('email')}
                        type="email"
                        label="Email Address"
                        icon={<Mail className="w-4 h-4 text-slate-400" />}
                        error={!!recoveryErrors.email}
                        shake={shakeRecovery}
                        touched={touchedRecovery.email}
                        isPopulated={!!watchRecoveryEmail}
                      />
                      {recoveryError && (
                        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-[10px] text-red-500 font-mono text-center">
                          {recoveryError}
                        </div>
                      )}
                      <Button type="submit" loading={isRecoverySubmitting} loadingLabel="TRANSMITTING...">
                        Send Security OTP
                      </Button>
                    </form>
                  </div>

                ) : (
                  /* Step 2: OTP + new password */
                  <form onSubmit={handlePasswordChange} className="space-y-4 font-body animate-slide-up">
                    <p className="desc text-center text-xs text-slate-900 dark:text-slate-400 mb-2 leading-relaxed font-bold">
                      Enter the 6-digit code sent to your email.
                    </p>

                    {/* OTP digit inputs */}
                    <div className="flex justify-between gap-1.5 px-2 my-3">
                      {otpDigits.map((digit, idx) => (
                        <input
                          key={idx}
                          ref={(el) => { otpRefs.current[idx] = el; }}
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          autoComplete="one-time-code"
                          maxLength={1}
                          value={digit}
                          onChange={(e) => handleOtpChange(idx, e.target.value)}
                          onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                          onPaste={handleOtpPaste}
                          onFocus={(e) => e.target.select()}
                          placeholder="0"
                          aria-label={`OTP digit ${idx + 1}`}
                          className="w-10 h-12 text-center text-xl font-bold bg-slate-200 dark:bg-neutral-800 text-slate-900 dark:text-white border border-slate-300 dark:border-white/10 rounded-lg focus:outline-none focus:border-[#1b365d] dark:focus:border-[#bf0202]"
                        />
                      ))}
                    </div>

                    {/* New password */}
                    <div className="field-wrap relative">
                      <input
                        id="recoveryNewPassword"
                        type={showNewPassword ? 'text' : 'password'}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="field-input"
                        placeholder=" "
                        aria-label="New password"
                        required
                      />
                      <label htmlFor="recoveryNewPassword" className="field-label">
                        <Lock className="w-4 h-4 text-slate-400" />
                        <span>Enter your new password</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowNewPassword((p) => !p)}
                        className="field-visibility-toggle cursor-pointer"
                        aria-label="Toggle new password visibility"
                      >
                        {showNewPassword ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
                      </button>
                    </div>

                    {recoveryError && (
                      <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-[10px] text-red-500 font-mono text-center">
                        {recoveryError}
                      </div>
                    )}

                    <Button
                      type="submit"
                      loading={isRecoverySubmitting}
                      loadingLabel="TRANSMITTING..."
                      loadingSubtitle={recoveryStatusText}
                    >
                      Restore System Access
                    </Button>
                  </form>
                )}
              </div>

              {/* Recovery footer */}
              <div className="space-y-4 font-body mt-4">
                {/* Context notice box */}
                <div className="protocol-notice-box p-3 bg-slate-100 dark:bg-red-950/10 border border-slate-200 dark:border-[#a63429] rounded-xl text-left animate-slide-up">
                  <div className="notice-header flex items-center gap-1.5 text-[10px] font-bold text-[#1b365d] dark:text-blue-400 tracking-wider mb-1 font-heading">
                    <ShieldAlert className="w-4 h-4 text-[#1b365d] dark:text-[#bf0202]" />
                    <span>{recoveryStep === 'email' ? 'RECOVERY PROTOCOL' : 'VERIFICATION STEP'}</span>
                  </div>
                  <p className="notice-body text-[9px] text-slate-900 dark:text-slate-400 leading-relaxed font-bold">
                    {recoveryStep === 'email'
                      ? 'Recovery Mode transmits a secure OTP (One-Time Password) to your registered email address. This is used to request password changes and restore access to your account.'
                      : 'Enter the 6-digit code sent to your email. Verify the code first, then enter your new password below to complete the reset.'}
                  </p>
                </div>

                <div className="flex flex-col items-center gap-2">
                  {recoveryStep === 'otp' && (
                    <div className="text-center text-[11px] font-bold animate-slide-up font-body">
                      {resendTimer > 0 ? (
                        <span className="text-slate-400">Wait {resendTimer}s to resend code</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => requestOtp(recoveryEmail)}
                          className="text-[#1b365d] dark:text-[#bf0202] hover:underline cursor-pointer"
                        >
                          Resend code
                        </button>
                      )}
                    </div>
                  )}

                  <button
                    onClick={() => setShowExitConfirm(true)}
                    className="w-full text-center text-xs font-bold text-slate-900 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all cursor-pointer"
                  >
                    Already have credentials? Back to Login
                  </button>
                </div>

                <div className="text-center text-[9px] text-slate-900 dark:text-slate-500 font-bold">
                  © {new Date().getFullYear()} WOLF PALOMAR.
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* ── RIGHT PANEL: Carousel ──────────────────────────────────────── */}
        <div className="auth-right flex-0 opacity-0 relative overflow-hidden hidden lg:block shrink-0 w-162.5">
          <div className="carousel-bg-wrapper absolute inset-0">
            {CAROUSEL_IMAGES.map((image, index) => (
              <img
                key={index}
                src={image}
                alt={`Gym view ${index + 1}`}
                className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1500 ${
                  activeSlide === index ? 'opacity-100' : 'opacity-0'
                }`}
              />
            ))}
          </div>

          <div className="carousel-overlay absolute inset-0 z-2" />

          <div className="carousel-content relative z-3 h-full flex flex-col justify-center px-24 w-162.5 shrink-0 select-none">
            <h2 className="text-7xl font-heading leading-[0.9] uppercase text-white mb-6 h-32 tracking-wider">
              BEYOND <br />
              <span className="text-[#031d7d] dark:text-[#bf0202]">{typewriterText}</span>
              <span className="text-[#031d7d] dark:text-[#bf0202] animate-[blink_0.8s_infinite]">|</span>
            </h2>

            <div className="bg-black/50 border border-white/10 p-6 rounded-2xl max-w-lg transition-all duration-300 backdrop-blur-md shadow-2xl font-body">
              <p className="text-xs text-slate-200 leading-relaxed">
                The ultimate terminal for Palomar Gym administrative control. Encrypted, fast, and precise.
                <span className="block mt-4 text-[11px] text-slate-400 line-clamp-3 leading-relaxed">
                  Wolf OS provides end-to-end telemetry for modern fitness centers — managing membership lifecycles, financial encryption, and real-time staff coordination.
                </span>
              </p>
              <div className="text-[8px] text-[#031d7d] dark:text-[#bf0202] tracking-widest font-heading uppercase mt-4">
                CONNECTED PROTOCOL TERMINAL
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── MODAL: Exit recovery confirm ──────────────────────────────────── */}
      <Modal isOpen={showExitConfirm} onClose={() => setShowExitConfirm(false)} title="Abandon Recovery?">
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-bold font-body text-center">
          If you leave recovery, you must re-verify credentials. Discard this operation?
        </p>
        <div className="flex gap-3 mt-4">
          <Button variant="secondary" onClick={() => setShowExitConfirm(false)}>Stay</Button>
          <Button onClick={() => { setShowExitConfirm(false); setIsFlipped(false); resetRecovery(); }}>
            Go Back
          </Button>
        </div>
      </Modal>

      {/* ── MODAL: Recovery success ───────────────────────────────────────── */}
      <Modal
        isOpen={showSuccessModal}
        onClose={() => { setShowSuccessModal(false); setIsFlipped(false); resetRecovery(); }}
        title="Access Restored"
      >
        <div className="space-y-6 font-body text-center">
          <CheckCircle2 className="w-16 h-16 mx-auto text-emerald-500 dark:text-emerald-400 animate-bounce" />
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-bold">
            Your password has been successfully updated.
          </p>
          <Button onClick={() => { setShowSuccessModal(false); setIsFlipped(false); resetRecovery(); }}>
            Return to Login
          </Button>
        </div>
      </Modal>

      {/* No welcome overlay — Dashboard replays login intro animation instead */}
    </div>
  );
};