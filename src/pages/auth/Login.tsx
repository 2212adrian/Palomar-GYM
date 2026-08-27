// src/pages/auth/Login.tsx
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, useLocation } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, ShieldAlert, CheckCircle2, Sun, Moon, User } from 'lucide-react';
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
import landscapeLogoDark from '../../assets/landscape-logo-dark.webp';
import landscapeLogoLight from '../../assets/landscape-logo-light.webp';
import googleIcon from '../../assets/Google_Icon.webp';

const CAROUSEL_IMAGES = [carousel1, carousel2, carousel3, carousel4, carousel5, carousel6];
const TYPEWRITER_PHRASES = ['SECURE.', 'RELIABLE.', 'STRENGTH.', 'LIMITS.', 'ENDURANCE.', 'CAPACITY.'];
const APP_VERSION = pkg.version;

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

function getInitialTheme(): 'dark' | 'light' {
  if (typeof window === 'undefined') return 'dark';
  const saved = localStorage.getItem('theme');
  if (saved === 'dark' || saved === 'light') return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

// ─── Memoized Typewriter Component ──────────────────────────────────────────
const TypewriterText: React.FC<{ phrases: string[] }> = React.memo(({ phrases }) => {
  const [typewriterText, setTypewriterText] = useState<string>('');
  const [phraseIndex, setPhraseIndex] = useState<number>(0);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  useEffect(() => {
    const current = phrases[phraseIndex] || phrases[0];
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
          setPhraseIndex((p) => (p + 1) % phrases.length);
        } else {
          timer = setTimeout(tick, 25);
        }
      }
    };

    timer = setTimeout(tick, isDeleting ? 20 : 50);
    return () => clearTimeout(timer);
  }, [typewriterText, isDeleting, phraseIndex, phrases]);

  return (
    <>
      <span className="text-blue-500 dark:text-red-600">{typewriterText}</span>
      <span className="text-blue-500 dark:text-red-600 animate-[blink_0.8s_infinite]">|</span>
    </>
  );
});

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { checkSession, user, initialized, error: storeError, setError } = useAuthStore() as any;

  const from = (location.state as any)?.from?.pathname || '/dashboard';
  const safeFrom = from === '/login' ? '/dashboard' : from;

  const isPreview = new URLSearchParams(location.search).get('preview') === 'true';
  const [gymConfig, setGymConfig] = useState<any>(null);

  const activeGymAddress = gymConfig?.gymAddress || '123 Sample Street, Barangay Central, Quezon City, Metro Manila';
  const activeContactName1 = gymConfig?.contactName1 || 'Staff Ryan';
  const activeContactNumber1 = gymConfig?.contactNumber1 || '09762607481';
  const activeContactName2 = gymConfig?.contactName2 || 'Admin Wolf';
  const activeContactNumber2 = gymConfig?.contactNumber2 || '09123456789';
  const activeEmailAddress = gymConfig?.emailAddress || 'contact@wolfpalomargym.com';

  const [isAssetPreloaded, setIsAssetPreloaded] = useState<boolean>(false);
  const [isReady, setIsReady] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('loginIntroPlayed') === 'true';
    }
    return false;
  });
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);
  const [curtainClosing, setCurtainClosing] = useState<boolean>(false);
  const [isFlipped, setIsFlipped] = useState<boolean>(false);
  const [theme, setTheme] = useState<'dark' | 'light'>(getInitialTheme);

  const [isMobile, setIsMobile] = useState<boolean>(
    typeof window !== 'undefined' ? window.innerWidth < 640 : false
  );

  const defaultLogo = useMemo(() => {
    return theme === 'dark' ? landscapeLogoDark : landscapeLogoLight;
  }, [theme]);

  const activeLogo = gymConfig?.gymLogo || defaultLogo;

  const activeCarouselImages = useMemo(() => {
    return (gymConfig?.carouselImages && Array.isArray(gymConfig.carouselImages) && gymConfig.carouselImages.length > 0)
      ? gymConfig.carouselImages 
      : CAROUSEL_IMAGES;
  }, [gymConfig?.carouselImages]);

  const activeGymDescription = gymConfig?.gymDescription || 'This terminal is exclusively for authorized staff members including trainers and coaches, as well as family members with administrative privileges.';

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleResize = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState<boolean>(false);
  const [showPassword, setShowPassword] = useState<boolean>(false);

  const [shakeEmail, setShakeEmail] = useState<boolean>(false);
  const [shakePassword, setShakePassword] = useState<boolean>(false);
  const [shakeRecovery, setShakeRecovery] = useState<boolean>(false);

  const [recoveryEmail, setRecoveryEmail] = useState<string>('');
  const [isRecoverySubmitting, setIsRecoverySubmitting] = useState<boolean>(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);

  const [showExitConfirm, setShowExitConfirm] = useState<boolean>(false);
  const [showSuccessModal, setShowSuccessModal] = useState<boolean>(false);

  const [activeSlide, setActiveSlide] = useState<number>(0);

  const carouselBgRef = useRef<HTMLDivElement>(null);
  const mouseCoordinates = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const lerpedCoordinates = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const rafId = useRef<number | null>(null);
  const isHovering = useRef<boolean>(true);

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

  const dynamicLabel = useMemo(() => {
    if (!watchIdentifier || watchIdentifier.trim().length === 0) {
      return 'Username / Email Address';
    }
    return watchIdentifier.includes('@') ? 'Email Address' : 'Username';
  }, [watchIdentifier]);

  useEffect(() => {
    sessionStorage.removeItem('outroActive');
    sessionStorage.removeItem('playDashboardIntro');
    setIsLoggingIn(false);
    setCurtainClosing(false);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    root.classList.toggle('light', theme === 'light');
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    if (isPreview) return;
    const isOutroActive = sessionStorage.getItem('outroActive') === 'true';
    if (initialized && user && !isLoggingIn && !isOutroActive) {
      const userProfile = (useAuthStore.getState() as any).profile;
      const fromPath = (location.state as any)?.from?.pathname || '/dashboard';
      const safeFromPath = fromPath === '/login' ? '/dashboard' : fromPath;
      const targetRoute = userProfile?.role === 'staff' ? '/sales' : safeFromPath;
      navigate(targetRoute, { replace: true });
    }
  }, [initialized, user, navigate, isLoggingIn, location.state, isPreview]);

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

  useEffect(() => {
    if (storeError) {
      toast.error(storeError, { toastId: 'unauthorized-access-toast' });
      setError(null);
      setIsGoogleSubmitting(false);
    }
  }, [storeError, setError]);

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

  // Carousel slide timer
  useEffect(() => {
    if (!isAssetPreloaded || isLoggingIn) return;
    const interval = setInterval(() => {
      setActiveSlide((p) => (p + 1) % activeCarouselImages.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [gymConfig, activeCarouselImages.length, isAssetPreloaded, isLoggingIn]);

  // Parallax Effect - Robust multi-mount / refresh fix
  useEffect(() => {
    if (!initialized || !isReady || !isAssetPreloaded) return;

    const isTouch = window.matchMedia('(pointer: coarse)').matches;
    if (isTouch) return;

    const tick = () => {
      const bg = carouselBgRef.current;
      if (!bg) {
        rafId.current = requestAnimationFrame(tick);
        return;
      }

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

    const startAnimation = () => {
      if (!rafId.current) {
        rafId.current = requestAnimationFrame(tick);
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      const x = e.clientX / window.innerWidth - 0.5;
      const y = e.clientY / window.innerHeight - 0.5;
      mouseCoordinates.current = { x, y };
      startAnimation();
    };

    const handleMouseEnter = () => {
      isHovering.current = true;
      startAnimation();
    };

    const handleMouseLeave = () => {
      isHovering.current = false;
      startAnimation();
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    document.addEventListener('mouseenter', handleMouseEnter, { passive: true });
    document.addEventListener('mouseleave', handleMouseLeave, { passive: true });

    // Kick-off animation loop on mount / refresh
    startAnimation();

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseenter', handleMouseEnter);
      document.removeEventListener('mouseleave', handleMouseLeave);
      if (rafId.current) {
        cancelAnimationFrame(rafId.current);
        rafId.current = null;
      }
    };
  }, [initialized, isReady, isAssetPreloaded]);

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

  const handleGoogleLogin = async () => {
    if (isPreview) return;
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

  const onLoginSubmit = async (data: LoginFormValues) => {
    if (isSubmitting || isPreview) return;
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
        await logAudit(
          'USER_LOGIN_FAILED',
          `Deactivated user "${targetName}" attempted to log in.`,
          loggedInUser?.id ?? undefined
        );

        await supabase.auth.signOut();
        toast.error('This account has been deactivated. Please contact an administrator.');
        return;
      }

      await logAudit(
        'USER_LOGIN',
        `User "${targetName}" logged in successfully.`,
        loggedInUser?.id ?? undefined
      );

      toast.success(`Welcome back, ${targetName}!`, {
        toastId: 'login-success-toast',
      });

      sessionStorage.setItem('outroActive', 'true');
      sessionStorage.setItem('playDashboardIntro', 'true');
      setIsLoggingIn(true);

      // Trigger closing curtain animation across screen
      setTimeout(() => {
        setCurtainClosing(true);
      }, 20);

      await checkSession();

      setTimeout(() => {
        sessionStorage.removeItem('outroActive');
        const userProfile = (useAuthStore.getState() as any).profile;
        const targetRoute = userProfile?.role === 'staff' ? '/sales' : safeFrom;
        navigate(targetRoute, { replace: true });
      }, 600);
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
    if (isPreview) return;
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

  const renderLoginForm = () => (
    <div className="w-full font-body select-text">
      <div className="flex justify-center pt-2 mb-3 relative z-20">
        <img 
          src={activeLogo} 
          alt="Wolf Palomar Logo" 
          className="h-16 sm:h-20 object-contain drop-shadow-lg transition-all duration-300 transform hover:scale-105" 
        />
      </div>

      <div className="text-center relative z-20 mb-4 sm:mb-2">
        <h1 className="text-2xl sm:text-3xl font-heading font-black tracking-wider text-slate-900 dark:text-white uppercase mb-0.5 select-none">
          LOGIN
        </h1>
        <p className="font-heading text-[10px] sm:text-[11px] tracking-[2.5px] font-bold text-blue-600 dark:text-red-500 uppercase select-none">
          GYM MANAGEMENT SYSTEM
        </p>
      </div>

      <form onSubmit={handlePreLoginSubmit} className="space-y-3 font-body relative z-20 pointer-events-auto">
        <div className="relative z-30">
          <Input
            {...registerLogin('usernameOrEmail')}
            type="text"
            label={dynamicLabel}
            icon={<User className="w-4 h-4 text-slate-400 dark:text-slate-400" />}
            error={!!loginErrors.usernameOrEmail}
            shake={shakeEmail}
            touched={touchedLogin.usernameOrEmail}
            isPopulated={!!watchIdentifier}
            disabled={isSubmitting || isLoggingIn}
            className="bg-white/80 dark:bg-[#161920]/90 border-slate-200 dark:border-white/10 focus:border-blue-600 dark:focus:border-red-600 rounded-xl backdrop-blur-md transition-all shadow-sm focus:shadow-blue-500/10 dark:focus:shadow-red-500/10 select-text pointer-events-auto"
          />
        </div>

        <div className="relative z-30">
          <Input
            {...registerLogin('password')}
            type={showPassword ? 'text' : 'password'}
            label="Password"
            icon={<Lock className="w-4 h-4 text-slate-400 dark:text-slate-400" />}
            error={!!loginErrors.password}
            shake={shakePassword}
            touched={touchedLogin.password}
            isPopulated={!!watchPassword}
            disabled={isSubmitting || isLoggingIn}
            className="bg-white/80 dark:bg-[#161920]/90 border-slate-200 dark:border-white/10 focus:border-blue-600 dark:focus:border-red-600 rounded-xl backdrop-blur-md transition-all shadow-sm focus:shadow-blue-500/10 dark:focus:shadow-red-500/10 select-text pointer-events-auto"
            rightElement={
              <button
                type="button"
                onClick={() => setShowPassword((p) => !p)}
                className="field-visibility-toggle cursor-pointer text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded transition-colors"
                aria-label="Toggle password visibility"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            }
          />
        </div>

        <div className="flex items-center gap-2 pt-1 pb-1">
          <input 
            type="checkbox" 
            id="loginAgreement" 
            {...registerLogin('agree')} 
            className="styled-checkbox accent-blue-600 dark:accent-red-600 rounded cursor-pointer w-3.5 h-3.5 pointer-events-auto" 
          />
          <label htmlFor="loginAgreement" className="checkbox-label cursor-pointer select-none">
            <span className="text-[10px] sm:text-[11px] text-slate-700 dark:text-slate-300 font-medium">
              I agree to the <a href="#" className="text-blue-600 dark:text-red-500 font-bold hover:underline">Terms &amp; Conditions</a> and <a href="#" className="text-blue-600 dark:text-red-500 font-bold hover:underline">Privacy Policy</a>.
            </span>
          </label>
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-3 px-4 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 dark:from-red-600 dark:via-rose-600 dark:to-red-700 hover:from-blue-700 hover:to-indigo-800 dark:hover:from-red-700 dark:hover:to-rose-800 text-white font-heading font-black tracking-widest text-xs uppercase rounded-xl shadow-md hover:shadow-lg hover:shadow-blue-500/20 dark:hover:shadow-red-600/25 active:scale-[0.99] transition-all cursor-pointer flex items-center justify-center gap-2 border border-blue-400/20 dark:border-red-400/20 select-none pointer-events-auto"
        >
          {isSubmitting ? (
            <span className="flex items-center gap-2">
              <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              VERIFYING...
            </span>
          ) : (
            'LOGIN NOW'
          )}
        </button>

        <div className="flex items-center my-2 gap-3 select-none">
          <div className="flex-1 border-t border-slate-300/60 dark:border-white/10" />
          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono font-bold uppercase">or</span>
          <div className="flex-1 border-t border-slate-300/60 dark:border-white/10" />
        </div>

        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={isGoogleSubmitting}
          className="w-full py-2.5 px-4 bg-white/80 dark:bg-[#161920]/80 border border-slate-200/80 dark:border-white/10 hover:bg-white dark:hover:bg-white/10 text-slate-800 dark:text-white font-heading font-bold text-[11px] tracking-wider uppercase rounded-xl backdrop-blur-md transition-all shadow-xs cursor-pointer flex items-center justify-center gap-2 select-none pointer-events-auto"
        >
          <img src={googleIcon} alt="Google" className="w-4 h-4 object-contain" />
          <span>CONTINUE WITH GOOGLE</span>
        </button>
      </form>

      <div className="space-y-3 pt-3 relative z-20 font-body">
        <div className="p-3 bg-blue-50/70 dark:bg-red-950/30 border border-blue-500/20 dark:border-red-600/30 backdrop-blur-md rounded-xl text-left shadow-xs">
          <div className="flex items-center gap-1.5 text-[10px] font-heading font-bold text-blue-600 dark:text-red-500 tracking-wider mb-1 uppercase select-none">
            <ShieldAlert className="w-3.5 h-3.5 text-blue-600 dark:text-red-500 shrink-0" />
            <span>ACCESS PROTOCOL</span>
          </div>
          <p className="text-[9.5px] text-slate-600 dark:text-slate-300 leading-relaxed font-medium">
            {activeGymDescription}
          </p>
        </div>

        <div className="text-center text-[12px] font-bold text-slate-500 dark:text-slate-400 select-none">
          <button 
            type="button"
            onClick={() => { setIsFlipped(true); resetRecovery(); }} 
            className="hover:text-blue-600 dark:hover:text-red-500 hover:underline transition-colors cursor-pointer pointer-events-auto"
          >
            Forgot Password?
          </button>
        </div>

        <div className="text-center text-[9px] text-slate-400 dark:text-slate-500 font-mono font-medium tracking-tight select-none">
          © {new Date().getFullYear()} WOLF PALOMAR. All Rights Reserved.
        </div>
      </div>
    </div>
  );

  const renderRecoveryForm = () => (
    <div className="w-full font-body select-text">
      <div className="flex justify-center pt-2 mb-3 relative z-20">
        <img 
          src={activeLogo} 
          alt="Wolf Palomar Logo" 
          className="h-16 sm:h-20 object-contain drop-shadow-lg transition-all duration-300 transform hover:scale-105" 
        />
      </div>

      <div className="text-center relative z-20">
        <h1 className="text-2xl sm:text-3xl font-heading font-black tracking-wider text-slate-900 dark:text-white uppercase mb-1 select-none">
          RECOVERY MODE
        </h1>
        
        <div className="flex items-center justify-center gap-1.5 mb-4 select-none">
          <div className="w-10 h-1 bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-red-600 dark:to-rose-600 rounded-full transition-colors duration-500" />
          <div className="w-1.5 h-1.5 bg-blue-600 dark:bg-red-600 rounded-full transition-colors duration-500" />
        </div>

        <div className="animate-slide-up">
          <p className="desc text-center text-xs text-slate-600 dark:text-slate-300 mb-5 leading-relaxed font-bold select-none">
            Enter your authorized account email below to receive a secure password reset link.
          </p>
          
          <form onSubmit={handlePreRecoverySubmit} className="space-y-4 font-body pointer-events-auto">
            <div className="relative z-30">
              <Input
                {...registerRecovery('email')}
                type="email"
                label="Email Address"
                icon={<Mail className="w-4 h-4 text-slate-400 dark:text-slate-400" />}
                error={!!recoveryErrors.email}
                shake={shakeRecovery}
                touched={touchedRecovery.email}
                isPopulated={!!watchRecoveryEmail}
                disabled={isRecoverySubmitting}
                className="bg-white/80 dark:bg-[#161920]/90 border-slate-200 dark:border-white/10 focus:border-blue-600 dark:focus:border-red-600 rounded-xl backdrop-blur-md transition-all shadow-sm focus:shadow-blue-500/10 dark:focus:shadow-red-500/10 select-text pointer-events-auto"
              />
            </div>
            
            {recoveryError && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-[10px] text-red-500 font-mono text-center select-none">
                {recoveryError}
              </div>
            )}
            
            <button
              type="submit"
              disabled={isRecoverySubmitting}
              className="w-full py-3 px-4 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 dark:from-red-600 dark:via-rose-600 dark:to-red-700 hover:from-blue-700 hover:to-indigo-800 dark:hover:from-red-700 dark:hover:to-rose-800 text-white font-heading font-black tracking-widest text-xs uppercase rounded-xl shadow-md hover:shadow-lg hover:shadow-blue-500/20 dark:hover:shadow-red-600/25 active:scale-[0.99] transition-all cursor-pointer flex items-center justify-center gap-2 border border-blue-400/20 dark:border-red-400/20 select-none pointer-events-auto"
            >
              {isRecoverySubmitting ? 'DISPATCHING LINK...' : 'SEND RESET LINK'}
            </button>
          </form>
        </div>
      </div>

      <div className="space-y-4 font-body mt-4">
        <div className="p-3 bg-blue-50/70 dark:bg-red-950/30 border border-blue-500/20 dark:border-red-600/30 backdrop-blur-md rounded-xl text-left transition-colors duration-500">
          <div className="flex items-center gap-1.5 text-[10px] font-heading font-bold text-blue-600 dark:text-red-500 tracking-wider mb-1 uppercase select-none">
            <ShieldAlert className="w-3.5 h-3.5 text-blue-600 dark:text-red-500 shrink-0" />
            <span>RECOVERY PROTOCOL</span>
          </div>
          <p className="text-[9.5px] text-slate-600 dark:text-slate-300 leading-relaxed font-medium">
            Please check your inbox and click the reset link to establish new login credentials.
          </p>
        </div>

        <button 
          type="button"
          onClick={handleBackToLoginClick} 
          className="w-full text-center text-xs text-slate-500 dark:text-slate-400 cursor-pointer font-body font-medium group transition-all duration-300 transform hover:scale-[1.01] active:scale-[0.99] hover:text-slate-800 dark:hover:text-slate-200 select-none pointer-events-auto"
        >
          Already have credentials?{' '}
          <span className="text-blue-600 dark:text-red-400 font-bold underline decoration-transparent group-hover:decoration-blue-600 dark:group-hover:decoration-red-400 underline-offset-4 transition-all duration-300">
            Back to Login
          </span>
        </button>

        <div className="text-center text-[9px] text-slate-400 dark:text-slate-500 font-mono font-medium tracking-tight select-none">
          © {new Date().getFullYear()} WOLF PALOMAR. All Rights Reserved.
        </div>
      </div>
    </div>
  );

  // Exclude `user` when `isLoggingIn` is true to prevent quick unmount before curtain outro
  if (!isPreview && (!initialized || (user && !isLoggingIn))) {
    return (
      <div className="relative min-h-screen w-full flex flex-col items-center justify-center bg-slate-50 dark:bg-[#0c0e12] text-slate-900 dark:text-slate-100 font-sans transition-colors duration-300 select-none overflow-hidden">
        {/* Ambient Radial Glow Orb */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-blue-500/10 dark:bg-red-600/10 rounded-full blur-3xl pointer-events-none animate-pulse" />
        
        <div className="relative z-10 flex flex-col items-center max-w-sm px-6 text-center space-y-5 animate-fade-in">
          {/* Branded Gym Logo */}
          <img 
            src={activeLogo} 
            alt="Wolf Palomar Logo" 
            className="h-16 sm:h-20 object-contain drop-shadow-xl animate-pulse" 
          />

          {/* Verification Spinner & Subtitle */}
          <div className="flex flex-col items-center space-y-3 pt-2">
            <div className="relative flex items-center justify-center">
              <div className="w-9 h-9 rounded-full border-2 border-blue-600/20 dark:border-red-600/20 border-t-blue-600 dark:border-t-red-600 animate-spin" />
              <ShieldAlert className="w-4 h-4 text-blue-600 dark:text-red-500 absolute" />
            </div>

            <div className="space-y-1">
              <h2 className="text-xs font-heading font-black tracking-widest uppercase text-slate-800 dark:text-slate-200">
                {user ? 'Redirecting to System...' : 'Checking Credentials...'}
              </h2>
              <p className="text-[10px] font-mono text-slate-400 dark:text-slate-500 tracking-wider uppercase">
                Verifying active session
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-screen overflow-hidden bg-[var(--bg-page,#0c0e12)] bg-slate-900 dark:bg-[#0c0e12] font-sans text-[var(--color-text)] font-body">
      
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0);    }
        }
        @keyframes liquidFloat1 {
          0%, 100% { transform: translate(0px, 0px) scale(1); }
          50% { transform: translate(30px, -40px) scale(1.12); }
        }
        @keyframes liquidFloat2 {
          0%, 100% { transform: translate(0px, 0px) scale(1); }
          50% { transform: translate(-35px, 25px) scale(1.18); }
        }
        .animate-slide-up { animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .animate-liquid-1 { animation: liquidFloat1 16s ease-in-out infinite; }
        .animate-liquid-2 { animation: liquidFloat2 20s ease-in-out infinite; }
      `}} />

      {/* Ambient Mobile Liquid Background Orbs */}
      <div className="block sm:hidden absolute inset-0 z-0 overflow-hidden pointer-events-none select-none">
        <div className="animate-liquid-1 absolute -top-24 -left-20 w-80 h-80 rounded-full bg-gradient-to-br from-blue-400/25 via-indigo-400/20 to-sky-300/30 dark:from-red-600/25 dark:via-rose-800/15 dark:to-indigo-950/30 blur-3xl" />
        <div className="animate-liquid-2 absolute -bottom-28 -right-20 w-96 h-96 rounded-full bg-gradient-to-tl from-indigo-500/20 via-blue-300/20 to-purple-400/15 dark:from-rose-950/30 dark:via-red-900/20 dark:to-indigo-900/20 blur-3xl" />
      </div>

      {/* Live Preview Mode Overlay Banner */}
      {isPreview && (
        <div className="absolute top-0 inset-x-0 z-[200] bg-blue-600 text-white text-[10px] font-heading tracking-widest uppercase py-2 text-center shadow-md animate-slide-up flex items-center justify-center gap-2 select-none">
          <span>✨ Live Brand Preview Mode (Form Inputs &amp; Actions Disabled)</span>
          <button 
            onClick={() => window.close()} 
            className="px-2 py-0.5 bg-white/15 hover:bg-white/25 rounded text-[9px] font-bold cursor-pointer transition-colors pointer-events-auto"
          >
            Close Preview
          </button>
        </div>
      )}

      {/* Theme Toggle Switch */}
      <button
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        className={`absolute top-4 right-4 z-[200] flex items-center gap-2.5 bg-white/80 dark:bg-neutral-900/80 border border-slate-200/80 dark:border-white/10 rounded-full px-3.5 py-2 shadow-lg backdrop-blur-xl cursor-pointer hover:opacity-95 transition-all duration-700 ease-out select-none pointer-events-auto ${
          isLoggingIn
            ? 'opacity-0 translate-y-4 pointer-events-none'
            : isReady
              ? 'opacity-100 translate-y-0'
              : 'opacity-0 -translate-y-4 pointer-events-none'
        }`}
      >
        <div className="flex border border-slate-300 dark:border-white/15 rounded-sm overflow-hidden" aria-hidden="true">
          {theme === 'dark' ? (
            <>
              <span className="w-3 h-3 bg-[#0c0e12]" />
              <span className="w-3 h-3 bg-[#dc2626]" />
              <span className="w-3 h-3 bg-[#161920]" />
            </>
          ) : (
            <>
              <span className="w-3 h-3 bg-[#f0f4f8]" />
              <span className="w-3 h-3 bg-[#2563eb]" />
              <span className="w-3 h-3 bg-[#ffffff]" />
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

      {/* ─── MAIN SPLIT CONTAINER ─── */}
      <div className={`relative z-10 flex w-full h-full auth-split-container ${isReady ? 'is-ready' : ''} ${isPreview ? 'pointer-events-none' : ''}`}>

        {/* SIBLING 1: LEFT COLUMN / LOGIN */}
        <div 
          className={`auth-left h-full flex flex-col items-center justify-center relative px-5 mr-5 sm:px-0 transition-all duration-700 ${
            isLoggingIn 
              ? 'opacity-0 pointer-events-none' 
              : isFlipped 
                ? 'opacity-0 pointer-events-none' 
                : 'opacity-100 pointer-events-auto'
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
          <div 
            className="absolute top-0 left-0 w-full h-full rotate-0 inset-0 z-0 pointer-events-none opacity-[0.12] dark:opacity-[0.08] dark:invert sm:-top-20 sm:-left-12 sm:w-[110%] sm:h-[120%] sm:rotate-7"
          />

          {!isMobile ? (
            <div className="w-[420px] max-w-full relative z-10">
              <Card 
                isLoggingIn={isLoggingIn} 
                className="w-full h-auto shadow-2xl border border-slate-200/80 dark:border-white/10 bg-white/90 dark:bg-[#12151c]/90 backdrop-blur-2xl rounded-4xl relative z-10 overflow-hidden"
                badgeText={`v${APP_VERSION}`}
                showWave={true}
              >
                {renderLoginForm()}
              </Card>
            </div>
          ) : (
            <div className="w-full max-w-md mx-auto relative z-10 py-6 my-auto max-h-screen overflow-y-auto overflow-x-hidden scrollbar-none">
              {renderLoginForm()}
            </div>
          )}
        </div>

        {/* SIBLING 2: RIGHT PANEL (Carousel & Gym Details) */}
        <div 
          className={`auth-right h-full relative overflow-hidden hidden lg:block -ml-[2px] pl-[2px] select-none transition-all duration-700 ${
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
            {isAssetPreloaded && activeCarouselImages.map((image: string, index: number) => (
              <img
                key={index}
                src={image}
                alt={`Gym view ${index + 1}`}
                className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ease-in-out ${
                  activeSlide === index ? 'opacity-100' : 'opacity-0'
                }`}
              />
            ))}
          </div>

          <div className="carousel-overlay absolute inset-y-0 -left-2 -right-2 z-2 pointer-events-none" />
          
          <div className="carousel-content relative z-3 h-full flex flex-col justify-center px-24 w-162.5 shrink-0 select-none">
            <h2 className="text-7xl font-heading leading-[0.9] uppercase text-white mb-6 h-32 tracking-wider drop-shadow-md">
              BEYOND <br />
              <TypewriterText phrases={TYPEWRITER_PHRASES} />
            </h2>
            
            <Card expandable={true} variant="glass" className="max-w-lg h-auto">
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
              <div className="block group-[.expanded]:hidden text-[8px] text-blue-400 dark:text-red-500 tracking-widest font-heading uppercase mt-4">
                CLICK TO EXPAND GYM INFORMATION
              </div>
              <div className="hidden group-[.expanded]:block text-[8px] text-blue-400 dark:text-red-500 tracking-widest font-heading uppercase mt-4">
                CLICK TO COLLAPSE GYM INFORMATION
              </div>
            </Card>
          </div>

          <div className="auth-divider-line auth-line-left pointer-events-none" />
          <div className="auth-divider-line auth-line-right pointer-events-none" />
        </div>

        {/* SIBLING 3: RECOVERY VIEW */}
        <div 
          className={`absolute top-0 left-0 lg:left-auto lg:right-0 h-full w-full lg:w-[42vw] flex flex-col items-center justify-center shrink-0 px-5 transition-all duration-700 ${
            isFlipped && !isLoggingIn 
              ? 'pointer-events-auto opacity-100 z-20' 
              : 'pointer-events-none opacity-0 invisible z-0'
          }`}
          style={{
            transform:
              isFlipped
                ? 'translateX(0) scale(1)'
                : 'translateX(100%) scale(0.95)',
          }}
        >
          <div 
            className="absolute top-0 left-0 w-full h-full rotate-0 inset-0 z-0 pointer-events-none opacity-[0.18] dark:opacity-[0.1] dark:invert transition-opacity duration-300 sm:-top-14 sm:left-4 sm:w-[110%] sm:h-[110%] sm:-rotate-7"
          />

          {!isMobile ? (
            <div className="w-[420px] max-w-full relative z-10">
              <Card
                isLoggingIn={isLoggingIn}
                className="w-full h-auto shadow-2xl border border-slate-200/80 dark:border-white/10 bg-white/90 dark:bg-[#12151c]/90 backdrop-blur-2xl rounded-4xl relative z-10 overflow-hidden"
                showWave={true}
              >
                {renderRecoveryForm()}
              </Card>
            </div>
          ) : (
            <div className="w-full max-w-md mx-auto relative z-10 py-6 my-auto max-h-screen overflow-y-auto overflow-x-hidden scrollbar-none">
              {renderRecoveryForm()}
            </div>
          )}
        </div>

      </div>

      {/* LOGIN SUCCESS OUTRO CURTAIN */}
{isLoggingIn && (
  <div
    className={`fixed inset-0 z-[16000] pointer-events-none transition-transform duration-[1400ms] ease-[cubic-bezier(0.77,0,0.175,1)] ${
      curtainClosing ? 'translate-x-8' : '-translate-x-[250%]'
    }`}
  >
    <div className="relative w-full h-full bg-[var(--bg-page,#f0f4f8)] bg-slate-100 dark:bg-[#0c0e12]">
      
      {/* Leading white/red line that sweeps off-screen */}
      <div className="absolute top-0 -right-8 h-full w-[2px] sm:w-[3px] bg-white dark:bg-red-100 shadow-[0_0_15px_rgba(255,255,255,1)] dark:shadow-[0_0_15px_rgba(255,100,100,1)]" />
    </div>
  </div>
)}

      {/* MODALS */}
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

      <Modal
        isOpen={showSuccessModal}
        onClose={() => { setShowSuccessModal(false); setIsFlipped(false); resetRecovery(); }}
        title="Recovery Link Sent"
      >
        <div className="space-y-6 font-body text-center select-text">
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