//src/pages/auth/Login.tsx
import React, { useState, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, useLocation } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, ShieldAlert, CheckCircle2, Sun, Moon } from 'lucide-react';
import { toast } from 'react-toastify';
import { supabase } from '../../lib/supabase/client';
import { useAuthStore } from '../../stores/authStore';
import { logAudit } from '../../lib/supabase/audit';

// Capacitor core import
import { Capacitor } from '@capacitor/core';

// Reusable UI Components from src/components/ui/
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Card } from '../../components/ui/Card';

// Dynamic version retrieval from package.json
import pkg from '../../../package.json';

// ─── Asset Imports ────────────────────────────────────────────────────────────
import carousel1 from '../../assets/1-carousel.webp';
import carousel2 from '../../assets/2-carousel.webp';
import carousel3 from '../../assets/3-carousel.webp';
import carousel4 from '../../assets/4-carousel.webp';
import carousel5 from '../../assets/5-carousel.webp';
import carousel6 from '../../assets/6-carousel.webp';
import landscapeLogo from '../../assets/landscape-logo.webp';
import googleIcon from '../../assets/Google_Icon.webp';
import hexagonBg from '../../assets/textures/hexagons.svg';

const CAROUSEL_IMAGES = [carousel1, carousel2, carousel3, carousel4, carousel5, carousel6];
const TYPEWRITER_PHRASES = ['SECURE.', 'RELIABLE.', 'STRENGTH.', 'LIMITS.', 'ENDURANCE.', 'CAPACITY.'];
const APP_VERSION = pkg.version || '2.0.0B';

// ─── Zod Schemas ──────────────────────────────────────────────────────────────
const loginSchema = z.object({
  usernameOrEmail: z.string().min(3, { message: 'Please enter a valid username or email' }),
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

// ─── Theme initializer (runs once, before first render) ──────────────────────
function getInitialTheme(): 'dark' | 'light' {
  if (typeof window === 'undefined') return 'dark';
  const saved = localStorage.getItem('theme');
  if (saved === 'dark' || saved === 'light') return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { checkSession, user, initialized, error: storeError, setError } = useAuthStore() as any;

  const from = (location.state as any)?.from?.pathname || '/dashboard';
  const safeFrom = from === '/login' ? '/dashboard' : from;

  // ─── Detect Sandboxed Preview Mode ────────────────────────────────────────
  const isPreview = new URLSearchParams(location.search).get('preview') === 'true';
  const [gymConfig, setGymConfig] = useState<any>(null);
  const [loadedImages, setLoadedImages] = useState<Record<string, boolean>>({});

  // Dynamic fallbacks matching gym_profile database schema default values
  const activeGymAddress = gymConfig?.gymAddress || '123 Sample Street, Barangay Central, Quezon City, Metro Manila';
  const activeContactName1 = gymConfig?.contactName1 || 'Staff Ryan';
  const activeContactNumber1 = gymConfig?.contactNumber1 || '09762607481';
  const activeContactName2 = gymConfig?.contactName2 || 'Admin Wolf';
  const activeContactNumber2 = gymConfig?.contactNumber2 || '09123456789';
  const activeEmailAddress = gymConfig?.emailAddress || 'contact@wolfpalomargym.com';

  // ─── Resolve Dynamic Media Assets (Declared first to prevent scoping errors) ───
  const activeLogo = gymConfig?.gymLogo || landscapeLogo;

  const activeCarouselImages = (gymConfig?.carouselImages && Array.isArray(gymConfig.carouselImages) && gymConfig.carouselImages.length > 0)
    ? gymConfig.carouselImages 
    : CAROUSEL_IMAGES;

  const activeGymDescription = gymConfig?.gymDescription || 'This terminal is exclusively for authorized staff members including trainers and coaches, as well as family members with administrative privileges.';

  // Retrieve active config (from database, or local draft if in Preview mode)
  useEffect(() => {
    const loadBranding = async () => {
      let activeConfig = null;

      if (isPreview) {
        const savedDraft = localStorage.getItem('palomar_gym_profile_draft');
        if (savedDraft) {
          try {
            activeConfig = JSON.parse(savedDraft);
          } catch (e) {
            console.warn('Failed to parse local draft configuration.');
          }
        }
      }

      if (!activeConfig) {
        try {
          const { data, error } = await supabase
            .from('gym_profile')
            .select('*')
            .eq('id', 1)
            .single();

          if (error) throw error;
          if (data) {
            activeConfig = {
              gymName: data.gym_name,
              gymDescription: data.gym_description,
              gymAddress: data.gym_address,
              contactName1: data.contact_name_1,
              contactNumber1: data.contact_number_1,
              contactName2: data.contact_name_2,
              contactNumber2: data.contact_number_2,
              emailAddress: data.email_address,
              gymLogo: data.gym_logo,
              carouselImages: data.carousel_images
            };
          }
        } catch (err: any) {
          console.warn('Could not read cloud configuration, using default branding assets:', err.message);
          const savedProduction = localStorage.getItem('palomar_gym_profile');
          if (savedProduction) {
            try {
              activeConfig = JSON.parse(savedProduction);
            } catch (e) {
              console.warn('Local storage fallback parsed unsuccessfully.');
            }
          }
        }
      }

      if (activeConfig) {
        setGymConfig(activeConfig);
      }
      setIsAssetPreloaded(true);
    };

    loadBranding();
  }, [isPreview]);

  // ─── Core UI States ────────────────────────────────────────────────────────
  const [isAssetPreloaded, setIsAssetPreloaded] = useState<boolean>(false);
  const [isReady, setIsReady] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('loginIntroPlayed') === 'true';
    }
    return false;
  });
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);
  const [isFlipped, setIsFlipped] = useState<boolean>(false);
  const [theme, setTheme] = useState<'dark' | 'light'>(getInitialTheme);

  // ─── Submitting & Visual Error States ──────────────────────────────────────
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState<boolean>(false);
  const [showPassword, setShowPassword] = useState<boolean>(false);

  const [shakeEmail, setShakeEmail] = useState<boolean>(false);
  const [shakePassword, setShakePassword] = useState<boolean>(false);
  const [shakeRecovery, setShakeRecovery] = useState<boolean>(false);

  // ─── Password Recovery States (Simplified) ──────────────────────────────────
  const [recoveryEmail, setRecoveryEmail] = useState<string>('');
  const [isRecoverySubmitting, setIsRecoverySubmitting] = useState<boolean>(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);

  // ─── Modal States ──────────────────────────────────────────────────────────
  const [showExitConfirm, setShowExitConfirm] = useState<boolean>(false);
  const [showSuccessModal, setShowSuccessModal] = useState<boolean>(false);

  // ─── Carousel & Typewriter States ──────────────────────────────────────────
  const [activeSlide, setActiveSlide] = useState<number>(0);
  const [typewriterText, setTypewriterText] = useState<string>('');
  const [phraseIndex, setPhraseIndex] = useState<number>(0);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // ─── Refs ──────────────────────────────────────────────────────────────────
  const carouselBgRef = useRef<HTMLDivElement>(null);
  const mouseCoordinates = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const lerpedCoordinates = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const rafId = useRef<number | null>(null);
  const isHovering = useRef<boolean>(true);

  // ─── Form Setup ────────────────────────────────────────────────────────────
  const {
    register: registerLogin,
    handleSubmit: handleLoginSubmit,
    setValue: setLoginValue,
    watch: watchLogin,
    formState: { errors: loginErrors, touchedFields: touchedLogin },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { usernameOrEmail: '', password: '', agree: true },
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

  const watchIdentifier = watchLogin('usernameOrEmail');
  const watchPassword = watchLogin('password');
  const watchRecoveryEmail = watchRecovery('email');

  // Dynamic input label swapping
  const dynamicLabel = watchIdentifier && watchIdentifier.includes('@')
    ? 'Email Address'
    : 'Username';

  // ─── Clear Stale Transition States on Mount ────────────────────────────────
  useEffect(() => {
    sessionStorage.removeItem('outroActive');
    sessionStorage.removeItem('playDashboardIntro');
    setIsLoggingIn(false);
  }, []);

  // ─── Theme Sync ───────────────────────────────────────────────────────────
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    root.classList.toggle('light', theme === 'light');
    localStorage.setItem('theme', theme);
  }, [theme]);

  // ─── Session Guard (Bypassed entirely in preview mode) ────────────────────
  useEffect(() => {
    if (isPreview) return; // Prevent session routing inside sandbox
    const isOutroActive = sessionStorage.getItem('outroActive') === 'true';
    if (initialized && user && !isLoggingIn && !isOutroActive) {
      const userProfile = (useAuthStore.getState() as any).profile;
      
      const fromPath = (location.state as any)?.from?.pathname || '/dashboard';
      const safeFromPath = fromPath === '/login' ? '/dashboard' : fromPath;
      
      const targetRoute = userProfile?.role === 'staff' ? '/sales' : safeFromPath;
      navigate(targetRoute, { replace: true });
    }
  }, [initialized, user, navigate, isLoggingIn, location.state, isPreview]);

  // ─── Handle OAuth Errors in URL ───────────────────────────────────────────
  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const query = new URLSearchParams(window.location.search);
    const errorDesc = hash.get('error_description') || query.get('error_description');
    const errorCode = hash.get('error_code') || query.get('error_code');

    if (errorDesc) {
      let msg = errorDesc.replace(/\+/g, ' ');
      if (errorCode === 'signup_disabled') {
        msg = 'This account has not been registered. Please contact an administrator.';
      }
      toast.error(msg, { toastId: 'unauthorized-access-toast' });
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);

  // ─── Deduplicate Auth Store Errors ────────────────────────────────────────
  useEffect(() => {
    if (storeError) {
      toast.error(storeError, { toastId: 'unauthorized-access-toast' });
      setError(null);
      setIsGoogleSubmitting(false);
    }
  }, [storeError, setError]);

  // ─── Intro Transition Activation ──────────────────────────────────────────
  useEffect(() => {
    const hasLoggedOut = 
      (location.state as any)?.loggedOut || 
      new URLSearchParams(location.search).has('logout');
    
    if (hasLoggedOut) {
      sessionStorage.removeItem('loginIntroPlayed');
      navigate(location.pathname, { replace: true, state: {} });
      return;
    }

    const isIntroPlayed = sessionStorage.getItem('loginIntroPlayed') === 'true';

    if (isIntroPlayed || isPreview) {
      setIsReady(true);
      return;
    }

    setIsReady(false);
    const timer = setTimeout(() => {
      setIsReady(true);
      sessionStorage.setItem('loginIntroPlayed', 'true');
    }, 150);

    return () => clearTimeout(timer);
  }, [location.search, location.state, navigate, isPreview]);

  // ─── Carousel Cycle ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!isAssetPreloaded) return;
    const interval = setInterval(() => {
      setActiveSlide((p) => (p + 1) % activeCarouselImages.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [gymConfig, activeCarouselImages.length, isAssetPreloaded]);

  // ─── Typewriter Loop ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!isAssetPreloaded) return;
    const current = TYPEWRITER_PHRASES[phraseIndex];
    let timer: ReturnType<typeof setTimeout>;

    const tick = () => {
      if (!isDeleting) {
        setTypewriterText(current.substring(0, typewriterText.length + 1));
        if (typewriterText === current) {
          timer = setTimeout(() => setIsDeleting(true), 2500);
        } else {
          timer = setTimeout(tick, 50);
        }
      } else {
        setTypewriterText(current.substring(0, typewriterText.length - 1));
        if (typewriterText === '') {
          setIsDeleting(false);
          setPhraseIndex((p) => (p + 1) % TYPEWRITER_PHRASES.length);
        } else {
          timer = setTimeout(tick, 25);
        }
      }
    };

    timer = setTimeout(tick, isDeleting ? 20 : 50);
    return () => clearTimeout(timer);
  }, [typewriterText, isDeleting, phraseIndex, isAssetPreloaded]);

  // ─── Flat Parallax System (Hardware Optimized & Pointer Coarse Aware) ──────
  useEffect(() => {
    const isTouch = window.matchMedia('(pointer: coarse)').matches;
    if (isTouch) return;

    const bg = carouselBgRef.current;
    if (!bg) return;

    const tick = () => {
      const targetX = isHovering.current ? mouseCoordinates.current.x : 0;
      const targetY = isHovering.current ? mouseCoordinates.current.y : 0;

      const dx = targetX - lerpedCoordinates.current.x;
      const dy = targetY - lerpedCoordinates.current.y;

      lerpedCoordinates.current.x += dx * 0.08;
      lerpedCoordinates.current.y += dy * 0.08;

      const translateX = -lerpedCoordinates.current.x * 50;
      const translateY = -lerpedCoordinates.current.y * 50;

      bg.style.transform = `translate3d(${translateX}px, ${translateY}px, 0) scale(1.12)`;

      const threshold = 0.0001;
      if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) {
        lerpedCoordinates.current.x = targetX;
        lerpedCoordinates.current.y = targetY;

        const finalTransX = -targetX * 50;
        const finalTransY = -targetY * 50;
        bg.style.transform = `translate3d(${finalTransX}px, ${finalTransY}px, 0) scale(1.12)`;

        rafId.current = null;
      } else {
        rafId.current = requestAnimationFrame(tick);
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      const x = e.clientX / window.innerWidth - 0.5;
      const y = e.clientY / window.innerHeight - 0.5;
      mouseCoordinates.current = { x, y };

      if (!rafId.current) {
        rafId.current = requestAnimationFrame(tick);
      }
    };

    const handleMouseEnter = () => {
      isHovering.current = true;
      if (!rafId.current) {
        rafId.current = requestAnimationFrame(tick);
      }
    };

    const handleMouseLeave = () => {
      isHovering.current = false;
      if (!rafId.current) {
        rafId.current = requestAnimationFrame(tick);
      }
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    document.addEventListener('mouseenter', handleMouseEnter, { passive: true });
    document.addEventListener('mouseleave', handleMouseLeave, { passive: true });

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseenter', handleMouseEnter);
      document.removeEventListener('mouseleave', handleMouseLeave);
      if (rafId.current) {
        cancelAnimationFrame(rafId.current);
      }
    };
  }, []);

  // ─── Helpers ──────────────────────────────────────────────────────────────
  const triggerShake = (setter: React.Dispatch<React.SetStateAction<boolean>>) => {
    setter(true);
    setTimeout(() => setter(false), 500);
  };

  const normaliseEmail = (
    val: string,
    setter: (field: any, val: string, opts?: any) => void,
    field: any
  ) => {
    if (val && !val.includes('@')) {
      setter(field, `${val.trim()}@gmail.com`, { shouldValidate: true });
    }
  };

  const resetRecovery = () => {
    setRecoveryEmail('');
    setRecoveryError(null);
  };

  // ─── Auth Submission Logic ───────────────────────────────────────────────
  const handleGoogleLogin = async () => {
    if (isPreview) return; // Disable OAuth in sandbox preview
    setIsGoogleSubmitting(true);
    try {
      const isNative = Capacitor.isNativePlatform();
      const redirectTo = isNative
        ? 'com.wolfpalomar.gymmanagement://login'
        : `${window.location.origin}/dashboard`;

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo },
      });
      if (error) throw error;
    } catch (err: any) {
      toast.error(err.message || 'OAuth handshake parameters invalid.');
      setIsGoogleSubmitting(false);
    }
  };

  // 2. Insert into the onLoginSubmit function inside src/pages/auth/Login.tsx
  const onLoginSubmit = async (data: LoginFormValues) => {
    if (isSubmitting || isPreview) return; // Disable logins in sandbox preview
    setIsSubmitting(true);
    setShakeEmail(false);
    setShakePassword(false);

    try {
      const finalEmail = data.usernameOrEmail.includes('@')
        ? data.usernameOrEmail.trim().toLowerCase()
        : `${data.usernameOrEmail.trim().toLowerCase()}@palomargym.noemail`;

      const { error = null } = await supabase.auth.signInWithPassword({
        email: finalEmail,
        password: data.password,
      });

      if (error) throw error;
      
      const loggedInUser = (await supabase.auth.getUser()).data.user;
      const { data: dbProfile } = await supabase
        .from('profiles')
        .select('status, full_name')
        .eq('id', loggedInUser?.id)
        .maybeSingle();

      const userStatus = dbProfile?.status || loggedInUser?.user_metadata?.status;
      const targetName = dbProfile?.full_name || loggedInUser?.email || data.usernameOrEmail;

      if (userStatus === 'inactive') {
        // Audit a failed login attempt due to a deactivated profile before signing out
        await logAudit(
          'USER_LOGIN_FAILED',
          `Deactivated user "${targetName}" attempted to log in.`,
           loggedInUser?.id ?? undefined
        );

        await supabase.auth.signOut();
        toast.error('This account has been deactivated. Please contact an administrator.');
        return;
      }

      // ─── AUDIT LOG: Successful Login ─────────────────────────────────────────
      await logAudit(
        'USER_LOGIN',
        `User "${targetName}" logged in successfully.`,
         loggedInUser?.id ?? undefined
      );
      // ──────────────────────────────────────────────────────────────────────────

      sessionStorage.setItem('outroActive', 'true');
      sessionStorage.setItem('playDashboardIntro', 'true');
      setIsLoggingIn(true);
      setIsReady(false);

      await checkSession();

      setTimeout(() => {
        sessionStorage.removeItem('outroActive');
        const userProfile = (useAuthStore.getState() as any).profile;
        const targetRoute = userProfile?.role === 'staff' ? '/sales' : safeFrom;
        navigate(targetRoute, { replace: true });
      }, 1800);
    } catch (err: any) {
      toast.error(err.message || 'Invalid username, email, or password.');
      setLoginValue('password', '');
      triggerShake(setShakePassword);
    } finally {
      setIsSubmitting(false);
    }
  };

  const onInvalidLoginSubmit = () => {
    if (loginErrors.usernameOrEmail) triggerShake(setShakeEmail);
    if (loginErrors.password) triggerShake(setShakePassword);
  };

  const onInvalidRecoverySubmit = () => triggerShake(setShakeRecovery);

  const requestResetLink = async (email: string) => {
    if (isPreview) return; // Disable recovery emails in sandbox preview
    setRecoveryError(null);
    setIsRecoverySubmitting(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/forgot-password`,
      });
      if (error) throw error;

      setRecoveryEmail(email);
      setShowSuccessModal(true);
    } catch (err: any) {
      setRecoveryError(err.message || 'Failed to dispatch recovery instructions.');
      triggerShake(setShakeRecovery);
    } finally {
      setIsRecoverySubmitting(false);
    }
  };

  const onRecoverySubmit = async (data: RecoveryFormValues) => requestResetLink(data.email);

  const handlePreLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleLoginSubmit(onLoginSubmit, onInvalidLoginSubmit)(e);
  };

  const handlePreRecoverySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    normaliseEmail(watchRecoveryEmail, setRecoveryValue, 'email');
    handleRecoverySubmit(onRecoverySubmit, onInvalidRecoverySubmit)(e);
  };

  const handleBackToLoginClick = () => {
    setIsFlipped(false);
    resetRecovery();
  };

  return (
    <div className="relative w-full h-screen overflow-hidden bg-(--bg-page) select-none font-sans text-(--color-text) font-body">
      
      {/* ─── Hardware Accelerated Hexagon Pattern Background Overlay ─── */}
      <div 
        className="absolute inset-0 z-0 pointer-events-none opacity-[0.04] dark:opacity-[0.02] mix-blend-normal"
        style={{ 
          backgroundImage: `url(${hexagonBg})`,
          backgroundRepeat: 'repeat',
          backgroundSize: '280px 280px',
        }}
      />

      {/* Dynamic Keyframes */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0);    }
        }
        .animate-slide-up { animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
      `}} />

      {/* ── Live Preview Mode Overlay Banner ── */}
      {isPreview && (
        <div className="absolute top-0 inset-x-0 z-200 bg-blue-600 text-white text-[10px] font-heading tracking-widest uppercase py-2 text-center shadow-md animate-slide-up flex items-center justify-center gap-2">
          <span>✨ Live Brand Preview Mode (Form Inputs & Actions Disabled)</span>
          <button 
            onClick={() => window.close()} 
            className="px-2 py-0.5 bg-white/15 hover:bg-white/25 rounded text-[9px] font-bold cursor-pointer transition-colors"
            style={{ pointerEvents: 'auto' }}
          >
            Close Preview
          </button>
        </div>
      )}

      {/* ── Theme Toggle (Bypasses parent pointerEvents to be clickable in Preview) ── */}
      <button
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        className={`absolute top-4 right-4 z-200 flex items-center gap-3 bg-white/80 dark:bg-neutral-900/80 border border-slate-200 dark:border-white/10 rounded-full px-4 py-2.5 shadow-lg backdrop-blur-md cursor-pointer hover:opacity-95 transition-all duration-700 ease-out ${
          isLoggingIn
            ? 'opacity-0 translate-y-4 pointer-events-none'
            : isReady
              ? 'opacity-100 translate-y-0'
              : 'opacity-0 -translate-y-4 pointer-events-none'
        }`}
        style={{ pointerEvents: 'auto' }}
      >
        <div className="flex border border-slate-300 dark:border-white/15 rounded-sm overflow-hidden" aria-hidden="true">
          {theme === 'dark' ? (
            <>
              <span className="w-3.5 h-3.5 bg-[#0c0e12]" />
              <span className="w-3.5 h-3.5 bg-[#bf0202]" />
              <span className="w-3.5 h-3.5 bg-[#161920]" />
            </>
          ) : (
            <>
              <span className="w-3.5 h-3.5 bg-[#f0f4f8]" />
              <span className="w-3.5 h-3.5 bg-[#123c73]" />
              <span className="w-3.5 h-3.5 bg-[#ffffff]" />
            </>
          )}
        </div>
        <span className="text-slate-700 dark:text-slate-300 text-[10px] font-black tracking-widest flex items-center gap-1 font-body">
          {theme === 'dark' ? (
            <><Sun className="w-3.5 h-3.5 text-amber-400" /><span>LIGHT</span></>
          ) : (
            <><Moon className="w-3.5 h-3.5 text-indigo-400" /><span>DARK</span></>
          )}
        </span>
      </button>

      {/* ─── SPLIT CONTAINER (Disabled mouse actions dynamically if in Preview) ─── */}
      <div className={`relative z-10 flex w-full h-full auth-split-container ${isReady ? 'is-ready' : ''} ${isPreview ? 'pointer-events-none' : ''}`}>

        {/* ── SIBLING 1: LEFT COLUMN ── */}
        <div 
          className={`auth-left h-full flex flex-col items-center justify-center ${
            isLoggingIn 
              ? 'opacity-0 pointer-events-none' 
              : isFlipped 
                ? 'opacity-0 pointer-events-none' 
                : 'opacity-100'
          }`}
          style={{ 
            transformStyle: 'flat',
            transform: isLoggingIn 
              ? 'translateX(0)' 
              : isFlipped 
                ? 'translateX(-101%)' 
                : 'translateX(0)' 
          }}
        >
          {/* Mobile Logo */}
          <div className="block lg:hidden mx-auto animate-slide-up">
            <Card isLoggingIn={isLoggingIn} className="w-32 h-32">
              <div className="w-50 h-50 bg-white dark:bg-[#141414]/95 border border-slate-200 dark:border-white/5 rounded-3xl shadow-xl p-3 flex items-center justify-center">
                <img src="/favicon.svg" alt="Palomar Logo" className="w-full h-full object-contain" />
              </div>
            </Card>
          </div>

          {/* Desktop Logo */}
          <div className="hidden lg:block mb-8 shrink-0 relative z-20 animate-slide-up">
            <Card isLoggingIn={isLoggingIn} className="w-56 h-40">
              <div className="w-full h-full bg-white dark:bg-[#141414]/95 border border-slate-200 dark:border-white/5 rounded-3xl shadow-xl p-4 flex items-center justify-center transition-all duration-500">
                <img src={activeLogo} alt="Palomar Logo" className="w-full h-full object-contain rounded-2xl" />
              </div>
            </Card>
          </div>

         {/* Login Card */}
          <Card isLoggingIn={isLoggingIn}>
            <div className="flip-card-front flex flex-col justify-between h-full bg-transparent border-none shadow-none lg:bg-neutral-50/95 lg:dark:bg-[#141414]/95 lg:border lg:border-slate-200 lg:dark:border-white/5 lg:p-8 lg:rounded-4xl lg:shadow-2xl">
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

                <form onSubmit={handlePreLoginSubmit} className="space-y-4 font-body">
                  <Input
                    {...registerLogin('usernameOrEmail')}
                    type="text"
                    label={dynamicLabel}
                    icon={<Mail className="w-4 h-4 text-slate-400" />}
                    error={!!loginErrors.usernameOrEmail}
                    shake={shakeEmail}
                    touched={touchedLogin.usernameOrEmail}
                    isPopulated={!!watchIdentifier}
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
                  <div className="flex items-start gap-2.5 my-2">
                    <input type="checkbox" id="loginAgreement" {...registerLogin('agree')} className="styled-checkbox" />
                    <label htmlFor="loginAgreement" className="checkbox-label">
                      <span className="checkbox-ui" />
                      <span className="text-[10px] text-slate-900 dark:text-slate-400 font-bold">
                        I agree to the <a href="#" className="text-[#1b365d] dark:text-sky-400 hover:underline">Terms & Conditions</a> and <a href="#" className="text-[#1b365d] dark:text-sky-400 hover:underline">Privacy Policy</a>.
                      </span>
                    </label>
                  </div>
                  <Button type="submit" loading={isSubmitting} loadingLabel="VERIFYING...">Login Now</Button>
                  <Button type="button" variant="google" onClick={handleGoogleLogin} loading={isGoogleSubmitting}>
                    {/* Updated to imported Google webp icon asset */}
                    <img src={googleIcon} alt="Google Icon" className="w-4 h-4 shrink-0 object-contain" />
                    <span>Continue With Google</span>
                  </Button>
                </form>
              </div>
              <div className="space-y-4 mt-4 font-body">
                <div className="flex items-center justify-center text-xs font-bold text-slate-400">
                  <button onClick={() => { setIsFlipped(true); resetRecovery(); }} className="hover:text-slate-800 dark:hover:text-white hover:underline transition-all cursor-pointer">
                    Forgot Password?
                  </button>
                </div>
                <div className="protocol-notice-box p-3 bg-slate-100 dark:bg-red-950/10 border border-slate-200 dark:border-[#a63429] rounded-xl text-left">
                  <div className="notice-header flex items-center gap-1.5 text-[10px] font-bold text-[#1b365d] dark:text-blue-400 tracking-wider mb-1 font-heading">
                    <ShieldAlert className="w-4 h-4 text-[#1b365d] dark:text-[#bf0202]" />
                    <span>ACCESS PROTOCOL</span>
                  </div>
                  <p className="notice-body text-[9px] text-slate-900 dark:text-slate-400 leading-relaxed font-bold">
                    {activeGymDescription}
                  </p>
                </div>
                <div className="text-center text-[9px] text-slate-900 dark:text-slate-500 font-bold">
                  © {new Date().getFullYear()} WOLF PALOMAR. All Rights Reserved.
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* ── SIBLING 2: RIGHT PANEL ── */}
        <div 
          className={`auth-right h-full relative overflow-hidden hidden lg:block -ml-[2px] pl-[2px] ${
            isLoggingIn ? 'opacity-0 pointer-events-none' : 'opacity-100'
          } ${isFlipped ? 'carousel-flipped' : ''}`}
          style={{ 
            transformStyle: 'flat',
            transform: isLoggingIn ? 'translateX(0)' : isFlipped ? 'translateX(-43vw)' : 'translateX(0)' 
          }}
        >
          <div 
            ref={carouselBgRef}
            className="carousel-bg-wrapper absolute inset-0 bg-[#0c0e12]"
            style={{
              willChange: 'transform',
              backgroundPosition: 'center',
              backgroundSize: 'cover',
              transform: 'scale(1.12)'
            }}
          >
            {isAssetPreloaded && activeCarouselImages.map((image: string, index: number) => {
  const isCurrent = activeSlide === index;
  const isImgLoaded = loadedImages[image];
  return (
    <img
      key={index}
      src={image}
      alt={`Gym view ${index + 1}`}
      onLoad={() => setLoadedImages(prev => ({ ...prev, [image]: true }))}
      className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1500 ease-in-out ${
        isCurrent && isImgLoaded ? 'opacity-100' : 'opacity-0'
      }`}
      style={{
        willChange: 'opacity',
        transitionProperty: 'opacity',
      }}
    />
  );
})}
          </div>
          <div 
            className="carousel-overlay absolute inset-y-0 -left-2 -right-2 z-2" 
            style={{
              willChange: 'transform',
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
              transform: 'translate3d(0, 0, 0)'
            }}
          />
          <div 
            className="carousel-content relative z-3 h-full flex flex-col justify-center px-24 w-162.5 shrink-0 select-none"
            style={{ transformStyle: 'flat' }}
          >
            <h2 className="text-7xl font-heading leading-[0.9] uppercase text-white mb-6 h-32 tracking-wider">
              BEYOND <br />
              <span className="text-[#031d7d] dark:text-[#bf0202]">{typewriterText}</span>
              <span className="text-[#031d7d] dark:text-[#bf0202] animate-[blink_0.8s_infinite]">|</span>
            </h2>
            <Card expandable={true} className="max-w-lg h-auto">
              <div className="bg-black/50 border border-white/10 p-6 rounded-2xl shadow-2xl backdrop-blur-md transition-all duration-300 font-body text-left">
                <p className="text-xs text-slate-200 leading-relaxed font-bold">
                  {activeGymDescription}
                  <span className="hidden group-[.expanded]:block mt-4 text-[11px] text-slate-400 leading-relaxed font-body font-normal animate-slide-up space-y-3">
                    <span className="block border-t border-white/10 pt-3">
                      <strong className="text-white uppercase tracking-wider text-[9px] block mb-0.5">LOCATION</strong>
                      <span className="text-slate-300">{activeGymAddress}</span>
                    </span>
                    <span className="block">
                      <strong className="text-white uppercase tracking-wider text-[9px] block mb-0.5">DIRECT SUPPORT</strong>
                      <span className="text-slate-300">
                        {activeContactName1}: {activeContactNumber1}
                        {activeContactName2 && ` | ${activeContactName2}: ${activeContactNumber2}`}
                      </span>
                    </span>
                    <span className="block">
                      <strong className="text-white uppercase tracking-wider text-[9px] block mb-0.5">EMAIL COMMUNICATIONS</strong>
                      <span className="text-slate-300">{activeEmailAddress}</span>
                    </span>
                  </span>
                </p>
                <div className="block group-[.expanded]:hidden text-[8px] text-[#031d7d] dark:text-[#bf0202] tracking-widest font-heading uppercase mt-4">
                  CLICK TO EXPAND GYM INFORMATION
                </div>
                <div className="hidden group-[.expanded]:block text-[8px] text-[#031d7d] dark:text-[#bf0202] tracking-widest font-heading uppercase mt-4">
                  CLICK TO COLLAPSE GYM INFORMATION
                </div>
              </div>
            </Card>
          </div>

          {/* Glowing divider lines nested inside the RIGHT PANEL (one left, one right) */}
          <div className="auth-divider-line auth-line-left" />
          <div className="auth-divider-line auth-line-right" />
        </div>

        {/* ── SIBLING 3: ABSOLUTE RECOVERY CARD ── */}
        <div 
          className="absolute top-0 left-0 lg:left-auto lg:right-0 h-full w-full lg:w-[42vw] flex flex-col items-center justify-center shrink-0 px-4"
          style={{
            transformStyle: 'flat',
            transform: isLoggingIn 
              ? 'fixed inset-0 z-50 bg-[var(--bg-page)]' 
              : isFlipped 
                ? 'translateX(0) scale(1)' 
                : 'translateX(100%) scale(0.95)',
            opacity: isLoggingIn ? 1 : isFlipped ? 1 : 0,
            pointerEvents: isFlipped && !isLoggingIn ? 'auto' : 'none',
            transition: 'transform 1.2s cubic-bezier(0.77, 0, 0.175, 1), opacity 1.2s cubic-bezier(0.77, 0, 0.175, 1)'
          }}
        >
          <Card isLoggingIn={isLoggingIn}>
            <div className="flip-card-front flex flex-col justify-between h-full bg-transparent border-none shadow-none lg:bg-neutral-50/95 lg:dark:bg-[#141414]/95 lg:border lg:border-slate-200 lg:dark:border-white/5 lg:p-8 lg:rounded-4xl lg:shadow-2xl font-body">
              <div>
                <div className="text-center brand text-2xl font-heading tracking-[0.08em] mb-1 text-slate-900 dark:text-white pt-2 lg:pt-0">
                  RECOVERY MODE
                </div>
                <div className="animate-slide-up">
                  <p className="desc text-center text-xs text-slate-900 dark:text-slate-400 mb-6 leading-relaxed font-bold">
                    Enter authorized email. We will send you secure password-reset link to your email inbox.
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
                      <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-[10px] text-red-500 font-mono text-center">
                        {recoveryError}
                      </div>
                    )}
                    
                    <Button type="submit" loading={isRecoverySubmitting} loadingLabel="DISPATCHING LINK...">
                      Change Password
                    </Button>
                  </form>
                </div>
              </div>
              <div className="space-y-4 font-body mt-4">
                <div className="protocol-notice-box p-3 bg-slate-100 dark:bg-red-950/10 border border-slate-200 dark:border-[#a63429] rounded-xl text-left animate-slide-up">
                  <div className="notice-header flex items-center gap-1.5 text-[10px] font-bold text-[#1b365d] dark:text-[#bf0202] tracking-wider mb-1 font-heading">
                    <ShieldAlert className="w-4 h-4 text-[#1b365d] dark:text-[#bf0202]" />
                    <span>RECOVERY PROTOCOL</span>
                  </div>
                  <p className="notice-body text-[9px] text-slate-900 dark:text-slate-400 leading-relaxed font-bold">
                    We will send a secure password reset link to your email address. Please check your inbox and follow the link to complete the reset.
                  </p>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <button 
                    type="button"
                    onClick={handleBackToLoginClick} 
                    className="w-full text-center text-xs font-bold text-slate-900 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all cursor-pointer font-body"
                  >
                    Already have credentials? Back to Login
                  </button>
                </div>
                <div className="text-center text-[9px] text-slate-900 dark:text-slate-500 font-bold font-body">
                  © {new Date().getFullYear()} WOLF PALOMAR.
                </div>
              </div>
            </div>
          </Card>
        </div>

      </div>

      {/* RIGHT PANEL: Dynamic Spacer */}
      <div className="flex-1 h-full" />

      {/* ── MODAL: Exit recovery confirm ── */}
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

      {/* ── MODAL: Recovery success ── */}
       <Modal
        isOpen={showSuccessModal}
        onClose={() => { setShowSuccessModal(false); setIsFlipped(false); resetRecovery(); }}
        title="Recovery Link Sent"
      >
        <div className="space-y-6 font-body text-center">
          <CheckCircle2 className="w-16 h-16 mx-auto text-emerald-500 dark:text-emerald-400 animate-bounce" />
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-bold">
            We have successfully sent a secure password reset link to <span className="font-mono text-slate-950 dark:text-white select-all">{recoveryEmail}</span>. Please check your inbox and follow the link to complete the reset.
          </p>
          <Button onClick={() => { setShowSuccessModal(false); setIsFlipped(false); resetRecovery(); }}>
            Return to Login
          </Button>
        </div>
      </Modal>

    </div>
  );
};
