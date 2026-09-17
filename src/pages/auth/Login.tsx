// src/pages/auth/Login.tsx
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, useLocation } from 'react-router-dom';
import { SecurityCaptchaModal } from './SecurityCaptchaModal';
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  Sun,
  Moon,
  User,
  ChevronDown,
  Download,
  Clock,
  ArrowLeft,
  RefreshCw,
  Send,
} from 'lucide-react';
import { toast } from 'react-toastify';
import { supabase } from '../../lib/supabase/client';
import { useAuthStore } from '../../stores/authStore';
import { logAudit } from '../../lib/supabase/audit';
import { usePWAInstall } from '../../hooks/usePWAInstall';

// Capacitor core import
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';

// Reusable UI Components from src/components/ui/
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Card } from '../../components/ui/Card';
import {
  AgreementDocumentViewer,
  type AgreementDocument,
} from '../../components/ui/AgreementDocumentViewer';

// Download Page component mounted directly below the Login section
import { DownloadPage } from '../download/DownloadPage';

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

const CAROUSEL_IMAGES = [
  carousel1,
  carousel2,
  carousel3,
  carousel4,
  carousel5,
  carousel6,
];
const TYPEWRITER_PHRASES = [
  'SECURE.',
  'RELIABLE.',
  'STRENGTH.',
  'LIMITS.',
  'ENDURANCE.',
  'CAPACITY.',
];
const APP_VERSION = pkg.version;

// ─── Captcha & Brute-Force Constants ──────────────────────────────────────────
const HCAPTCHA_SITE_KEY =
  (import.meta as any).env?.VITE_HCAPTCHA_SITE_KEY ||
  '10000000-ffff-ffff-ffff-000000000001'; // Default test key
const FAILED_ATTEMPTS_STORAGE_KEY = 'palomar_login_failed_attempts';
const MAX_FAILED_ATTEMPTS_THRESHOLD = 5;
const FAILED_ATTEMPTS_TTL_MS = 60 * 60 * 1000; // 1 hour (3600000 ms)

interface FailedAttemptsRecord {
  count: number;
  lastFailedAt: number;
}

const getStoredFailedAttempts = (): number => {
  if (typeof window === 'undefined') return 0;
  try {
    const raw = localStorage.getItem(FAILED_ATTEMPTS_STORAGE_KEY);
    if (!raw) return 0;
    const record: FailedAttemptsRecord = JSON.parse(raw);
    const now = Date.now();
    if (now - record.lastFailedAt > FAILED_ATTEMPTS_TTL_MS) {
      localStorage.removeItem(FAILED_ATTEMPTS_STORAGE_KEY);
      return 0;
    }
    return record.count || 0;
  } catch {
    localStorage.removeItem(FAILED_ATTEMPTS_STORAGE_KEY);
    return 0;
  }
};

const recordFailedAttempt = (): number => {
  if (typeof window === 'undefined') return 0;
  try {
    const raw = localStorage.getItem(FAILED_ATTEMPTS_STORAGE_KEY);
    const now = Date.now();
    let record: FailedAttemptsRecord = raw
      ? JSON.parse(raw)
      : { count: 0, lastFailedAt: now };

    if (now - record.lastFailedAt > FAILED_ATTEMPTS_TTL_MS) {
      record = { count: 1, lastFailedAt: now };
    } else {
      record.count = (record.count || 0) + 1;
      record.lastFailedAt = now;
    }

    localStorage.setItem(FAILED_ATTEMPTS_STORAGE_KEY, JSON.stringify(record));
    return record.count;
  } catch {
    return 0;
  }
};

const resetFailedAttempts = () => {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(FAILED_ATTEMPTS_STORAGE_KEY);
};

// ─── Zod Schemas ──────────────────────────────────────────────────────────────
const loginSchema = z.object({
  usernameOrEmail: z
    .string()
    .min(3, { message: 'Please enter a valid username or email' }),
  password: z
    .string()
    .min(6, { message: 'Password must be at least 6 characters' }),
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
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

// ─── Memoized Typewriter Component ──────────────────────────────────────────
const TypewriterText: React.FC<{ phrases: string[] }> = React.memo(
  ({ phrases }) => {
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
        <span className="text-blue-500 dark:text-red-600">
          {typewriterText}
        </span>
        <span className="text-blue-500 dark:text-red-600 animate-[blink_0.8s_infinite]">
          |
        </span>
      </>
    );
  }
);

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    checkSession,
    user,
    initialized,
    error: storeError,
    setError,
  } = useAuthStore() as any;

  // ─── PWA & Native Capacitor Detection ───────────────────────────────────────
  const { isInstalled: isPwaInstalled } = usePWAInstall();

  const isStandalonePWA = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: window-controls-overlay)').matches ||
      (window.navigator as any).standalone === true
    );
  }, []);

  const isAppOrPwaInstalled =
    Capacitor.isNativePlatform() || isPwaInstalled || isStandalonePWA;

  const from = (location.state as any)?.from?.pathname || '/dashboard';
  const safeFrom = from === '/login' ? '/dashboard' : from;

  const isPreview =
    new URLSearchParams(location.search).get('preview') === 'true';
  const [gymConfig, setGymConfig] = useState<any>(null);

  const activeGymAddress =
    gymConfig?.gymAddress ||
    '123 Sample Street, Barangay Central, Quezon City, Metro Manila';
  const activeContactName1 = gymConfig?.contactName1 || 'Staff Ryan';
  const activeContactNumber1 = gymConfig?.contactNumber1 || '09762607481';
  const activeContactName2 = gymConfig?.contactName2 || 'Admin Wolf';
  const activeContactNumber2 = gymConfig?.contactNumber2 || '09123456789';
  const activeEmailAddress =
    gymConfig?.emailAddress || 'contact@wolfpalomargym.com';

  const [isAssetPreloaded, setIsAssetPreloaded] = useState<boolean>(false);
  const [isReady, setIsReady] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('loginIntroPlayed') === 'true';
    }
    return false;
  });
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);
  const [loginStarted, setLoginStarted] = useState<boolean>(false);
  const [loginResting, setLoginResting] = useState<boolean>(false);

  // Horizontal Flip state (Login <-> Forgot Password)
  const [isFlipped, setIsFlipped] = useState<boolean>(false);

  // Vertical Slide state (Login Screen <-> Download Page)
  const [isDownloadOpen, setIsDownloadOpen] = useState<boolean>(false);

  const [theme, setTheme] = useState<'dark' | 'light'>(getInitialTheme);

  const [isMobile, setIsMobile] = useState<boolean>(
    typeof window !== 'undefined' ? window.innerWidth < 640 : false
  );

  // ─── CAPTCHA ON-DEMAND (ACTIVATES ONLY AFTER 5 FAILED ATTEMPTS) ──────────────
  const [failedAttempts, setFailedAttempts] = useState<number>(
    getStoredFailedAttempts
  );
  const [isCaptchaModalOpen, setIsCaptchaModalOpen] = useState<boolean>(false);
  const [pendingCaptchaAction, setPendingCaptchaAction] =
    useState<LoginFormValues | null>(null);

  // Periodic check to verify 1-hour expiration
  useEffect(() => {
    const checkExpiry = () => {
      const current = getStoredFailedAttempts();
      if (current !== failedAttempts) {
        setFailedAttempts(current);
      }
    };

    const interval = setInterval(checkExpiry, 10000);
    return () => clearInterval(interval);
  }, [failedAttempts]);

  const defaultLogo = useMemo(() => {
    return theme === 'dark' ? landscapeLogoDark : landscapeLogoLight;
  }, [theme]);

  const activeLogo = gymConfig?.gymLogo || defaultLogo;

  const activeCarouselImages = useMemo(() => {
    return gymConfig?.carouselImages &&
      Array.isArray(gymConfig.carouselImages) &&
      gymConfig.carouselImages.length > 0
      ? gymConfig.carouselImages
      : CAROUSEL_IMAGES;
  }, [gymConfig?.carouselImages]);

  const activeGymDescription =
    gymConfig?.gymDescription ||
    'Welcome to Wolf Palomar Gym, where strength meets endurance. Our state-of-the-art facilities and expert trainers are here to help you achieve your fitness goals. Join us and experience a community that values health, wellness, and personal growth.';

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleResize = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isDownloadOpen) {
          setIsDownloadOpen(false);
        } else if (isFlipped) {
          setIsFlipped(false);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDownloadOpen, isFlipped]);

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
              carouselImages: data.carousel_images,
            };
          }
        } catch (err: any) {
          console.warn(
            'Could not read cloud configuration, using default branding assets:',
            err.message
          );
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

  const isSubmittingRef = useRef<boolean>(false);
  const isResendingRef = useRef<boolean>(false);

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState<boolean>(false);
  const [showPassword, setShowPassword] = useState<boolean>(false);

  const [shakeEmail, setShakeEmail] = useState<boolean>(false);
  const [shakePassword, setShakePassword] = useState<boolean>(false);
  const [shakeRecovery, setShakeRecovery] = useState<boolean>(false);

  const [recoveryEmail, setRecoveryEmail] = useState<string>('');
  const [isRecoverySubmitting, setIsRecoverySubmitting] =
    useState<boolean>(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);

  // Recovery Mode Step & Code States (6 DIGITS)
  const [recoveryStep, setRecoveryStep] = useState<'request' | 'verify'>(
    'request'
  );
  const [recoveryCode, setRecoveryCode] = useState<string[]>([
    '',
    '',
    '',
    '',
    '',
    '',
  ]);
  const [recoveryNewPassword, setRecoveryNewPassword] = useState<string>('');
  const [recoveryConfirmPassword, setRecoveryConfirmPassword] =
    useState<string>('');
  const [showRecoveryPassword, setShowRecoveryPassword] =
    useState<boolean>(false);
  const [showRecoveryConfirmPassword, setShowRecoveryConfirmPassword] =
    useState<boolean>(false);
  const [isVerifyingRecovery, setIsVerifyingRecovery] =
    useState<boolean>(false);
  const recoveryInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // ─── TWO-FACTOR EMAIL VERIFICATION (2FA) STATES (6 DIGITS) ───
  const [is2FAMode, setIs2FAMode] = useState<boolean>(false);
  const [isOtpDispatched, setIsOtpDispatched] = useState<boolean>(false);
  const [twoFactorEmail, setTwoFactorEmail] = useState<string>('');
  const [twoFactorTargetName, setTwoFactorTargetName] = useState<string>('');
  const [twoFactorUserId, setTwoFactorUserId] = useState<string>('');
  const [twoFactorTargetRoute, setTwoFactorTargetRoute] =
    useState<string>('/dashboard');
  const [twoFactorCode, setTwoFactorCode] = useState<string[]>([
    '',
    '',
    '',
    '',
    '',
    '',
  ]);
  const [twoFactorAttempts, setTwoFactorAttempts] = useState<number>(0);
  const [isVerifying2FA, setIsVerifying2FA] = useState<boolean>(false);
  const [isResending2FA, setIsResending2FA] = useState<boolean>(false);
  const [twoFactorResendCooldown, setTwoFactorResendCooldown] =
    useState<number>(0);
  const [twoFactorExpiresAt, setTwoFactorExpiresAt] = useState<number>(0);
  const [timeRemainingSeconds, setTimeRemainingSeconds] = useState<number>(600);
  const [shake2FA, setShake2FA] = useState<boolean>(false);
  const twoFactorInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const [showExitConfirm, setShowExitConfirm] = useState<boolean>(false);
  const [showSuccessModal, setShowSuccessModal] = useState<boolean>(false);
  const [agreementDocument, setAgreementDocument] =
    useState<AgreementDocument | null>(null);

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
    defaultValues: {
      usernameOrEmail:
        typeof window === 'undefined'
          ? ''
          : localStorage.getItem('palomar_remembered_login') || '',
      password: '',
      agree:
        typeof window !== 'undefined' &&
        !!localStorage.getItem('palomar_user_agreement_accepted'),
    },
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
  const watchAgreement = watchLogin('agree');
  const watchRecoveryEmail = watchRecovery('email');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (watchIdentifier && watchIdentifier.trim()) {
      localStorage.setItem('palomar_remembered_login', watchIdentifier.trim());
    } else {
      localStorage.removeItem('palomar_remembered_login');
    }
  }, [watchIdentifier]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (watchAgreement) {
      localStorage.setItem(
        'palomar_user_agreement_accepted',
        JSON.stringify({
          version: '2026-08-30',
          acceptedAt: new Date().toISOString(),
        })
      );
    } else {
      localStorage.removeItem('palomar_user_agreement_accepted');
    }
  }, [watchAgreement]);

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
    setLoginStarted(false);
    setLoginResting(false);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    root.classList.toggle('light', theme === 'light');
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Protected auto-navigation for already authenticated visits
  useEffect(() => {
    if (isPreview) return;
    const isOutroActive = sessionStorage.getItem('outroActive') === 'true';
    if (initialized && user && !isLoggingIn && !isOutroActive && !is2FAMode) {
      const userProfile = (useAuthStore.getState() as any).profile;
      const fromPath = (location.state as any)?.from?.pathname || '/dashboard';
      const safeFromPath = fromPath === '/login' ? '/dashboard' : fromPath;
      const targetRoute =
        userProfile?.role === 'staff' ? '/sales' : safeFromPath;
      navigate(targetRoute, { replace: true });
    }
  }, [
    initialized,
    user,
    navigate,
    isLoggingIn,
    location.state,
    isPreview,
    is2FAMode,
  ]);

  // 2FA Cooldown Timer Effect
  useEffect(() => {
    if (!is2FAMode || twoFactorResendCooldown <= 0) return;
    const timer = setInterval(() => {
      setTwoFactorResendCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [is2FAMode, twoFactorResendCooldown]);

  // 2FA Code Expiration Countdown (10 min)
  useEffect(() => {
    if (!is2FAMode || !twoFactorExpiresAt) return;
    const tick = () => {
      const remaining = Math.max(
        0,
        Math.floor((twoFactorExpiresAt - Date.now()) / 1000)
      );
      setTimeRemainingSeconds(remaining);
      if (remaining === 0) {
        toast.warn('Verification code expired. Please request a new code.');
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [is2FAMode, twoFactorExpiresAt]);

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const query = new URLSearchParams(window.location.search);
    const errorDesc =
      hash.get('error_description') || query.get('error_description');
    const errorCode = hash.get('error_code') || query.get('error_code');

    if (errorDesc) {
      let msg = errorDesc.replace(/\+/g, ' ');
      if (errorCode === 'signup_disabled') {
        msg =
          'This account has not been registered. Please contact an administrator.';
      }
      toast.error(msg, { toastId: 'unauthorized-access-toast' });
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);

  useEffect(() => {
    try {
      const saved2FA = sessionStorage.getItem('palomar_2fa_pending');
      if (saved2FA) {
        const parsed = JSON.parse(saved2FA);
        if (
          parsed?.email &&
          parsed?.expiresAt &&
          parsed.expiresAt > Date.now()
        ) {
          setTwoFactorEmail(parsed.email);
          setTwoFactorTargetName(parsed.targetName || '');
          setTwoFactorUserId(parsed.userId || '');
          setTwoFactorTargetRoute(parsed.targetRoute || '/');
          setTwoFactorExpiresAt(parsed.expiresAt);
          setIsOtpDispatched(Boolean(parsed.isDispatched));
          const remainingSec = Math.max(
            0,
            Math.floor((parsed.expiresAt - Date.now()) / 1000)
          );
          setTimeRemainingSeconds(remainingSec);
          const cdRemaining = parsed.cooldownUntil
            ? Math.max(
                0,
                Math.floor((parsed.cooldownUntil - Date.now()) / 1000)
              )
            : 0;
          setTwoFactorResendCooldown(cdRemaining);
          setTwoFactorCode(['', '', '', '', '', '']);
          setIs2FAMode(true);
        } else {
          sessionStorage.removeItem('palomar_2fa_pending');
        }
      }
    } catch {
      sessionStorage.removeItem('palomar_2fa_pending');
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

  useEffect(() => {
    if (!isAssetPreloaded || isLoggingIn) return;
    const interval = setInterval(() => {
      setActiveSlide((p) => (p + 1) % activeCarouselImages.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [gymConfig, activeCarouselImages.length, isAssetPreloaded, isLoggingIn]);

  useEffect(() => {
    if (
      !initialized ||
      !isReady ||
      !isAssetPreloaded ||
      isLoggingIn ||
      isDownloadOpen
    )
      return;

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
    document.addEventListener('mouseenter', handleMouseEnter, {
      passive: true,
    });
    document.addEventListener('mouseleave', handleMouseLeave, {
      passive: true,
    });

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
  }, [initialized, isReady, isAssetPreloaded, isLoggingIn, isDownloadOpen]);

  const triggerShake = (
    setter: React.Dispatch<React.SetStateAction<boolean>>
  ) => {
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
    if (!watchAgreement) {
      toast.error(
        'Please agree to the Terms & Conditions and Privacy Policy first.'
      );
      return;
    }
    setIsGoogleSubmitting(true);
    try {
      const isNative = Capacitor.isNativePlatform();
      const redirectTo = isNative
        ? 'com.wolfpalomar.gymmanagement://login'
        : `${window.location.origin}/dashboard`;

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
          options: { redirectTo },
        });
        if (error) throw error;
      }
    } catch (err: any) {
      toast.error(err.message || 'OAuth handshake parameters invalid.');
      setIsGoogleSubmitting(false);
    }
  };

  // ─── LOGIN SUBMIT (CHALLENGED ONLY IF >= 5 FAILED ATTEMPTS) ──────────────────
  const onLoginSubmit = async (data: LoginFormValues) => {
    if (isSubmittingRef.current || isPreview) return;

    const currentFailures = getStoredFailedAttempts();
    if (currentFailures >= MAX_FAILED_ATTEMPTS_THRESHOLD) {
      setPendingCaptchaAction(data);
      setIsCaptchaModalOpen(true);
      return;
    }

    // Direct login attempt without captcha
    await executeLogin(data);
  };

  const executeLogin = async (data: LoginFormValues, captchaToken?: string) => {
    isSubmittingRef.current = true;
    setIsSubmitting(true);
    setShakeEmail(false);
    setShakePassword(false);

    try {
      const finalEmail = data.usernameOrEmail.includes('@')
        ? data.usernameOrEmail.trim().toLowerCase()
        : `${data.usernameOrEmail.trim().toLowerCase()}@palomargym.noemail`;

      sessionStorage.setItem('outroActive', 'true');
      sessionStorage.setItem('playDashboardIntro', 'true');

      const loginOptions: { captchaToken?: string } = {};
      if (captchaToken) {
        loginOptions.captchaToken = captchaToken;
      }

      const { error = null } = await supabase.auth.signInWithPassword({
        email: finalEmail,
        password: data.password,
        options: loginOptions,
      });

      if (error) throw error;

      // Reset failed attempts on success
      resetFailedAttempts();
      setFailedAttempts(0);

      const loggedInUser = (await supabase.auth.getUser()).data.user;
      const { data: dbProfile } = await supabase
        .from('profiles')
        .select('status, username, email_verification_enabled, role')
        .eq('id', loggedInUser?.id)
        .maybeSingle();

      const userStatus =
        dbProfile?.status || loggedInUser?.user_metadata?.status;
      const targetName =
        dbProfile?.username ||
        loggedInUser?.user_metadata?.full_name ||
        loggedInUser?.email ||
        data.usernameOrEmail;

      if (userStatus === 'inactive') {
        sessionStorage.removeItem('outroActive');
        sessionStorage.removeItem('playDashboardIntro');
        setIsLoggingIn(false);
        setLoginStarted(false);
        setLoginResting(false);

        await logAudit(
          'USER_LOGIN_FAILED',
          `Deactivated user "${targetName}" attempted to log in.`,
          loggedInUser?.id ?? undefined
        );

        await supabase.auth.signOut();
        toast.error(
          'This account has been deactivated. Please contact an administrator.'
        );
        return;
      }

      // Check if 2-step verification after login is enabled
      const is2FAEnabled =
        (dbProfile?.email_verification_enabled === true ||
          loggedInUser?.user_metadata?.email_verification_enabled === true) &&
        !finalEmail.endsWith('@palomargym.noemail');

      if (is2FAEnabled) {
        sessionStorage.removeItem('outroActive');
        sessionStorage.removeItem('playDashboardIntro');
        setIsLoggingIn(false);
        setLoginStarted(false);
        setLoginResting(false);

        await supabase.auth.signOut();

        const calculatedRoute =
          dbProfile?.role === 'staff' ? '/sales' : safeFrom;
        const expiresAt = Date.now() + 10 * 60 * 1000;
        const cooldownUntil = Date.now() + 60 * 1000;

        // Auto-dispatch OTP directly without any Captcha
        let autoDispatched = false;
        try {
          const { error: otpError } = await supabase.auth.signInWithOtp({
            email: finalEmail,
            options: {
              shouldCreateUser: false,
            },
          });
          if (!otpError) {
            autoDispatched = true;
          }
        } catch {
          // Handled gracefully below
        }

        sessionStorage.setItem(
          'palomar_2fa_pending',
          JSON.stringify({
            email: finalEmail,
            targetName,
            userId: loggedInUser?.id || '',
            targetRoute: calculatedRoute,
            expiresAt,
            cooldownUntil,
            isDispatched: autoDispatched,
          })
        );

        setTwoFactorEmail(finalEmail);
        setTwoFactorTargetName(targetName);
        setTwoFactorUserId(loggedInUser?.id || '');
        setTwoFactorTargetRoute(calculatedRoute);
        setIs2FAMode(true);
        setIsOtpDispatched(autoDispatched);
        setTwoFactorCode(['', '', '', '', '', '']);
        setTwoFactorAttempts(0);
        setTwoFactorExpiresAt(expiresAt);
        setTimeRemainingSeconds(600);
        setTwoFactorResendCooldown(autoDispatched ? 60 : 0);

        if (autoDispatched) {
          toast.info(
            `Security verification: A 6-digit code has been sent to ${maskEmail(finalEmail)}.`
          );
          setTimeout(() => {
            twoFactorInputRefs.current[0]?.focus();
          }, 60);
        } else {
          toast.info(
            `Two-step verification active. Please confirm to send your code.`
          );
        }
        return;
      }

      setIsLoggingIn(true);
      setLoginStarted(false);
      setLoginResting(false);

      setTimeout(() => {
        setLoginStarted(true);
      }, 20);

      setTimeout(() => {
        setLoginResting(true);
      }, 1100);

      await logAudit(
        'USER_LOGIN',
        `User "${targetName}" logged in successfully.`,
        loggedInUser?.id ?? undefined
      );

      toast.success(`Welcome back, ${targetName}!`, {
        toastId: 'login-success-toast',
      });

      await checkSession();

      setTimeout(() => {
        sessionStorage.removeItem('outroActive');
        const userProfile = (useAuthStore.getState() as any).profile;
        const targetRoute = userProfile?.role === 'staff' ? '/sales' : safeFrom;
        navigate(targetRoute, { replace: true });
      }, 1500);
    } catch (err: any) {
      sessionStorage.removeItem('outroActive');
      sessionStorage.removeItem('playDashboardIntro');
      setIsLoggingIn(false);
      setLoginStarted(false);
      setLoginResting(false);

      const updatedAttempts = recordFailedAttempt();
      setFailedAttempts(updatedAttempts);

      if (updatedAttempts >= MAX_FAILED_ATTEMPTS_THRESHOLD) {
        toast.error(
          'Multiple failed attempts detected. CAPTCHA verification is now required.'
        );
      } else {
        toast.error(
          err.message ||
            'Invalid username, email, or password. Please try again.'
        );
      }

      setLoginValue('password', '');
      triggerShake(setShakePassword);
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  // ─── TWO-FACTOR EMAIL VERIFICATION HELPERS & ACTIONS (6 DIGITS) ───
  const maskEmail = (emailStr: string) => {
    if (!emailStr.includes('@')) return emailStr;
    const [local, domain] = emailStr.split('@');
    if (local.length <= 2) return `${local[0]}*@${domain}`;
    return `${local[0]}${'*'.repeat(Math.min(local.length - 2, 5))}${local[local.length - 1]}@${domain}`;
  };

  const formatTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleDigitChange = (index: number, val: string) => {
    const cleaned = val.replace(/\D/g, '');
    if (!cleaned) {
      const next = [...twoFactorCode];
      next[index] = '';
      setTwoFactorCode(next);
      return;
    }

    const digit = cleaned.slice(-1);
    const next = [...twoFactorCode];
    next[index] = digit;
    setTwoFactorCode(next);

    if (index < 5) {
      twoFactorInputRefs.current[index + 1]?.focus();
    } else {
      const fullCode = next.join('');
      if (fullCode.length === 6) {
        verify2FACode(fullCode);
      }
    }
  };

  const handleDigitKeyDown = (
    index: number,
    e: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (e.key === 'Backspace') {
      if (!twoFactorCode[index] && index > 0) {
        const next = [...twoFactorCode];
        next[index - 1] = '';
        setTwoFactorCode(next);
        twoFactorInputRefs.current[index - 1]?.focus();
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      twoFactorInputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 5) {
      twoFactorInputRefs.current[index + 1]?.focus();
    }
  };

  const handleDigitPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '');
    if (!pasted) return;

    const cleanDigits = pasted.slice(0, 6);
    const next = Array.from({ length: 6 }, (_, i) => cleanDigits[i] || '');
    setTwoFactorCode(next);

    const focusIdx = Math.min(cleanDigits.length, 5);
    setTimeout(() => {
      twoFactorInputRefs.current[focusIdx]?.focus();
    }, 20);

    if (cleanDigits.length === 6) {
      verify2FACode(cleanDigits);
    }
  };

  const verify2FACode = async (codeToVerify?: string) => {
    const fullCode = codeToVerify || twoFactorCode.join('');
    if (fullCode.length !== 6) {
      toast.error('Please enter the complete 6-digit verification code.');
      return;
    }

    setIsVerifying2FA(true);
    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: twoFactorEmail,
        token: fullCode,
        type: 'email',
      });

      if (verifyError) throw verifyError;

      await logAudit(
        '2FA_LOGIN_SUCCESS',
        `User "${twoFactorTargetName}" completed email verification.`,
        twoFactorUserId || undefined
      );

      toast.success(
        `Verification complete. Welcome back, ${twoFactorTargetName}!`,
        { toastId: 'login-success-toast' }
      );

      sessionStorage.removeItem('palomar_2fa_pending');
      sessionStorage.setItem('outroActive', 'true');
      sessionStorage.setItem('playDashboardIntro', 'true');

      setIsLoggingIn(true);
      setLoginStarted(false);
      setLoginResting(false);

      setTimeout(() => {
        setLoginStarted(true);
      }, 20);

      setTimeout(() => {
        setLoginResting(true);
      }, 1100);

      await checkSession();

      setTimeout(() => {
        sessionStorage.removeItem('outroActive');
        navigate(twoFactorTargetRoute, { replace: true });
      }, 1500);
    } catch (err: any) {
      triggerShake(setShake2FA);
      setTwoFactorAttempts((prev) => {
        const next = prev + 1;
        if (next >= 5) {
          sessionStorage.removeItem('palomar_2fa_pending');
          toast.error(
            'Too many failed attempts. For security, please log in again.'
          );
          setIs2FAMode(false);
          setTwoFactorCode(['', '', '', '', '', '']);
          return 0;
        }
        return next;
      });

      toast.error(
        err.message ||
          'Invalid or expired verification code. Please verify and try again.'
      );
      setTwoFactorCode(['', '', '', '', '', '']);
      twoFactorInputRefs.current[0]?.focus();
    } finally {
      setIsVerifying2FA(false);
    }
  };

  // Direct OTP resend without Captcha
  const handleResend2FACode = async () => {
    if (twoFactorResendCooldown > 0 || isResending2FA || isResendingRef.current)
      return;

    isResendingRef.current = true;
    setIsResending2FA(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: twoFactorEmail,
        options: { shouldCreateUser: false },
      });

      if (error) {
        const match = error.message?.match(/after\s+(\d+)\s+seconds/i);
        if (match) {
          setTwoFactorResendCooldown(parseInt(match[1], 10));
          return;
        }
        throw error;
      }

      const expiresAt = Date.now() + 10 * 60 * 1000;
      const cooldownUntil = Date.now() + 60 * 1000;

      try {
        const saved = sessionStorage.getItem('palomar_2fa_pending');
        if (saved) {
          const parsed = JSON.parse(saved);
          parsed.expiresAt = expiresAt;
          parsed.cooldownUntil = cooldownUntil;
          parsed.isDispatched = true;
          sessionStorage.setItem('palomar_2fa_pending', JSON.stringify(parsed));
        }
      } catch {
        // ignore
      }

      setIsOtpDispatched(true);
      setTwoFactorResendCooldown(60);
      setTwoFactorExpiresAt(expiresAt);
      setTimeRemainingSeconds(600);
      setTwoFactorCode(['', '', '', '', '', '']);
      toast.success(
        `A new verification code was sent to ${maskEmail(twoFactorEmail)}`
      );
      setTimeout(() => {
        twoFactorInputRefs.current[0]?.focus();
      }, 50);
    } catch (err: any) {
      toast.error(err.message || 'Failed to dispatch verification code.');
    } finally {
      isResendingRef.current = false;
      setIsResending2FA(false);
    }
  };

  const handleCancel2FA = async () => {
    await supabase.auth.signOut();
    sessionStorage.removeItem('palomar_2fa_pending');
    setIs2FAMode(false);
    setIsOtpDispatched(false);
    setTwoFactorCode(['', '', '', '', '', '']);
    setTwoFactorEmail('');
    setTwoFactorTargetName('');
    setTwoFactorAttempts(0);
    sessionStorage.removeItem('outroActive');
    sessionStorage.removeItem('playDashboardIntro');
  };

  const onInvalidLoginSubmit = () => {
    if (loginErrors.usernameOrEmail) triggerShake(setShakeEmail);
    if (loginErrors.password) triggerShake(setShakePassword);
    if (loginErrors.agree)
      toast.error(
        'Please agree to the Terms & Conditions and Privacy Policy to continue.'
      );
  };

  const onInvalidRecoverySubmit = () => triggerShake(setShakeRecovery);

  // Recovery email dispatch without Captcha
  const onRecoverySubmit = async (data: RecoveryFormValues) => {
    if (isPreview || isRecoverySubmitting) return;
    await requestResetLink(data.email);
  };

  const requestResetLink = async (email: string) => {
    setRecoveryError(null);
    setIsRecoverySubmitting(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/forgot-password`,
      });
      if (error) throw error;

      setRecoveryEmail(email);
      setRecoveryStep('verify');
      setRecoveryCode(['', '', '', '', '', '']);
      setShowSuccessModal(true);
      toast.success(`Verification code dispatched to ${email}.`);
    } catch (err: any) {
      setRecoveryError(
        err.message || 'Failed to dispatch recovery instructions.'
      );
      triggerShake(setShakeRecovery);
    } finally {
      setIsRecoverySubmitting(false);
    }
  };

  // ─── GENERAL CAPTCHA MODAL HANDLER ──────────────────────────────────────────
  const handleCaptchaVerified = async (token: string) => {
    setIsCaptchaModalOpen(false);
    if (pendingCaptchaAction) {
      const dataToSubmit = pendingCaptchaAction;
      setPendingCaptchaAction(null);
      await executeLogin(dataToSubmit, token);
    }
  };

  // ─── RECOVERY CODE DIGIT HANDLERS (6 DIGITS) ────────────────────────────────
  const handleRecoveryDigitChange = (index: number, val: string) => {
    const cleaned = val.replace(/\D/g, '');
    if (!cleaned) {
      const next = [...recoveryCode];
      next[index] = '';
      setRecoveryCode(next);
      return;
    }

    const digit = cleaned.slice(-1);
    const next = [...recoveryCode];
    next[index] = digit;
    setRecoveryCode(next);

    if (index < 5) {
      recoveryInputRefs.current[index + 1]?.focus();
    }
  };

  const handleRecoveryDigitKeyDown = (
    index: number,
    e: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (e.key === 'Backspace') {
      if (!recoveryCode[index] && index > 0) {
        const next = [...recoveryCode];
        next[index - 1] = '';
        setRecoveryCode(next);
        recoveryInputRefs.current[index - 1]?.focus();
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      recoveryInputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 5) {
      recoveryInputRefs.current[index + 1]?.focus();
    }
  };

  const handleRecoveryDigitPaste = (
    e: React.ClipboardEvent<HTMLInputElement>
  ) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '');
    if (!pasted) return;

    const cleanDigits = pasted.slice(0, 6);
    const next = Array.from({ length: 6 }, (_, i) => cleanDigits[i] || '');
    setRecoveryCode(next);

    const focusIdx = Math.min(cleanDigits.length, 5);
    setTimeout(() => {
      recoveryInputRefs.current[focusIdx]?.focus();
    }, 20);
  };

  const handleVerifyRecoveryOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const fullCode = recoveryCode.join('');
    if (fullCode.length !== 6) {
      toast.error('Please enter the complete 6-digit recovery code.');
      return;
    }
    if (!recoveryNewPassword || recoveryNewPassword.length < 6) {
      toast.error('New password must be at least 6 characters.');
      return;
    }
    if (recoveryNewPassword !== recoveryConfirmPassword) {
      toast.error('Passwords do not match.');
      return;
    }

    setIsVerifyingRecovery(true);
    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: recoveryEmail,
        token: fullCode,
        type: 'recovery',
      });
      if (verifyError) throw verifyError;

      const { error: updateError } = await supabase.auth.updateUser({
        password: recoveryNewPassword,
      });
      if (updateError) throw updateError;

      await supabase.auth.signOut();
      toast.success(
        'Password updated successfully! Please log in with your new password.',
        { toastId: 'recovery-success-toast' }
      );
      setRecoveryStep('request');
      setIsFlipped(false);
      resetRecovery();
      setRecoveryNewPassword('');
      setRecoveryConfirmPassword('');
      setRecoveryCode(['', '', '', '', '', '']);
    } catch (err: any) {
      toast.error(
        err.message ||
          'Failed to verify recovery code or update password. Please check the code and try again.'
      );
    } finally {
      setIsVerifyingRecovery(false);
    }
  };

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
    setRecoveryStep('request');
    setRecoveryNewPassword('');
    setRecoveryConfirmPassword('');
    setRecoveryCode(['', '', '', '', '', '']);
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

      <form
        onSubmit={handlePreLoginSubmit}
        className="space-y-3 font-body relative z-20 pointer-events-auto"
      >
        <div className="relative z-30">
          <Input
            {...registerLogin('usernameOrEmail')}
            type="text"
            label={dynamicLabel}
            icon={
              <User className="w-4 h-4 text-slate-400 dark:text-slate-400" />
            }
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
            icon={
              <Lock className="w-4 h-4 text-slate-400 dark:text-slate-400" />
            }
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
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            }
          />
        </div>

        <div className="checkbox-group pt-1 pb-1">
          <input
            type="checkbox"
            id="loginAgreement"
            {...registerLogin('agree')}
            className="styled-checkbox"
          />
          <label
            htmlFor="loginAgreement"
            className="checkbox-label cursor-pointer select-none"
          >
            <span className="checkbox-ui" aria-hidden="true" />
            <span className="text-[10px] sm:text-[11px] text-slate-700 dark:text-slate-300 font-medium">
              I agree to the{' '}
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  setAgreementDocument('terms');
                }}
                className="text-blue-600 dark:text-red-500 font-bold hover:underline cursor-pointer"
              >
                Terms &amp; Conditions
              </button>{' '}
              and{' '}
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  setAgreementDocument('privacy');
                }}
                className="text-blue-600 dark:text-red-500 font-bold hover:underline cursor-pointer"
              >
                Privacy Policy
              </button>
              .
            </span>
          </label>
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-3 px-4 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 dark:from-red-600 dark:via-rose-600 dark:to-red-700 hover:from-blue-700 hover:to-indigo-800 dark:hover:from-red-700 dark:hover:to-rose-800 text-white font-heading font-black tracking-widest text-xs uppercase rounded-xl shadow-md hover:shadow-lg hover:shadow-blue-500/20 dark:hover:shadow-red-600/25 active:scale-[0.99] transition-all cursor-pointer flex items-center justify-center gap-2 border border-blue-400/20 dark:border-red-400/20 select-none pointer-events-auto disabled:opacity-60 disabled:cursor-not-allowed"
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
          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono font-bold uppercase">
            or
          </span>
          <div className="flex-1 border-t border-slate-300/60 dark:border-white/10" />
        </div>

        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={isGoogleSubmitting}
          className="w-full py-2.5 px-4 bg-white/80 dark:bg-[#161920]/80 border border-slate-200/80 dark:border-white/10 hover:bg-white dark:hover:bg-white/10 text-slate-800 dark:text-white font-heading font-bold text-[11px] tracking-wider uppercase rounded-xl backdrop-blur-md transition-all shadow-xs cursor-pointer flex items-center justify-center gap-2 select-none pointer-events-auto"
        >
          <img
            src={googleIcon}
            alt="Google"
            className="w-4 h-4 object-contain"
          />
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
            onClick={() => {
              setIsFlipped(true);
              resetRecovery();
            }}
            className="hover:text-blue-600 dark:hover:text-red-500 hover:underline transition-colors cursor-pointer pointer-events-auto"
          >
            Forgot Password?
          </button>
        </div>

        <div className="text-center text-[9px] text-slate-400 dark:text-slate-500 font-mono font-medium tracking-tight select-none">
          © {new Date().getFullYear()} WOLF PALOMAR. All Rights Reserved.
        </div>
      </div>

      <AgreementDocumentViewer
        isOpen={agreementDocument !== null}
        onClose={() => setAgreementDocument(null)}
        initialDocument={agreementDocument || 'terms'}
      />
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

        {recoveryStep === 'request' ? (
          <div className="animate-slide-up">
            <p className="desc text-center text-xs text-slate-600 dark:text-slate-300 mb-5 leading-relaxed font-bold select-none">
              Enter your authorized account email below to receive a secure
              recovery code and reset link.
            </p>

            <form
              onSubmit={handlePreRecoverySubmit}
              className="space-y-4 font-body pointer-events-auto"
            >
              <div className="relative z-30">
                <Input
                  {...registerRecovery('email')}
                  type="email"
                  label="Email Address"
                  icon={
                    <Mail className="w-4 h-4 text-slate-400 dark:text-slate-400" />
                  }
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
                className="w-full py-3 px-4 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 dark:from-red-600 dark:via-rose-600 dark:to-red-700 hover:from-blue-700 hover:to-indigo-800 dark:hover:from-red-700 dark:hover:to-rose-800 text-white font-heading font-black tracking-widest text-xs uppercase rounded-xl shadow-md hover:shadow-lg hover:shadow-blue-500/20 dark:hover:shadow-red-600/25 active:scale-[0.99] transition-all cursor-pointer flex items-center justify-center gap-2 border border-blue-400/20 dark:border-red-400/20 select-none pointer-events-auto disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isRecoverySubmitting
                  ? 'DISPATCHING RECOVERY CODE...'
                  : 'SEND RECOVERY CODE'}
              </button>
            </form>
          </div>
        ) : (
          <div className="animate-slide-up text-left">
            <p className="text-center text-xs text-slate-600 dark:text-slate-300 mb-4 leading-relaxed font-bold select-none">
              Enter the verification code sent to{' '}
              <span className="font-mono text-slate-900 dark:text-white font-bold">
                {recoveryEmail || 'your email'}
              </span>{' '}
              to set up your new password:
            </p>

            <form
              onSubmit={handleVerifyRecoveryOtp}
              className="space-y-3 font-body pointer-events-auto"
            >
              {!recoveryEmail && (
                <div className="relative z-30">
                  <Input
                    type="email"
                    label="Email Address"
                    value={recoveryEmail}
                    onChange={(e) => setRecoveryEmail(e.target.value)}
                    icon={<Mail className="w-4 h-4 text-slate-400" />}
                    required
                  />
                </div>
              )}

              {/* Recovery Code Inputs (6 digits) */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1.5 uppercase tracking-wider text-center">
                  Verification Code (6 digits)
                </label>
                <div className="flex justify-center items-center gap-1.5 sm:gap-2 my-2">
                  {recoveryCode.map((digit, idx) => (
                    <input
                      key={`rec-6-${idx}`}
                      ref={(el) => {
                        recoveryInputRefs.current[idx] = el;
                      }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) =>
                        handleRecoveryDigitChange(idx, e.target.value)
                      }
                      onKeyDown={(e) => handleRecoveryDigitKeyDown(idx, e)}
                      onPaste={idx === 0 ? handleRecoveryDigitPaste : undefined}
                      disabled={isVerifyingRecovery}
                      className="w-9.5 h-12 sm:w-11 sm:h-13 text-base sm:text-lg text-center font-bold font-mono rounded-xl bg-white/90 dark:bg-[#161920] border-2 border-slate-200 dark:border-white/10 text-slate-900 dark:text-white focus:border-blue-600 dark:focus:border-red-600 focus:ring-2 focus:ring-blue-500/20 dark:focus:ring-red-500/20 outline-none transition-all shadow-sm"
                      autoFocus={idx === 0}
                    />
                  ))}
                </div>
              </div>

              {/* New Password & Confirm Password */}
              <div className="space-y-2">
                <Input
                  type={showRecoveryPassword ? 'text' : 'password'}
                  label="New Password"
                  value={recoveryNewPassword}
                  onChange={(e) => setRecoveryNewPassword(e.target.value)}
                  icon={<Lock className="w-4 h-4 text-slate-400" />}
                  placeholder="At least 6 characters"
                  required
                  rightElement={
                    <button
                      type="button"
                      onClick={() => setShowRecoveryPassword((p) => !p)}
                      className="field-visibility-toggle cursor-pointer"
                    >
                      {showRecoveryPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  }
                />

                <Input
                  type={showRecoveryConfirmPassword ? 'text' : 'password'}
                  label="Confirm New Password"
                  value={recoveryConfirmPassword}
                  onChange={(e) => setRecoveryConfirmPassword(e.target.value)}
                  icon={<Lock className="w-4 h-4 text-slate-400" />}
                  placeholder="Repeat new password"
                  required
                  rightElement={
                    <button
                      type="button"
                      onClick={() => setShowRecoveryConfirmPassword((p) => !p)}
                      className="field-visibility-toggle cursor-pointer"
                    >
                      {showRecoveryConfirmPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  }
                />
              </div>

              <button
                type="submit"
                disabled={
                  isVerifyingRecovery ||
                  recoveryCode.join('').length !== 6 ||
                  !recoveryNewPassword
                }
                className="w-full py-3 px-4 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 dark:from-red-600 dark:via-rose-600 dark:to-red-700 hover:from-blue-700 hover:to-indigo-800 dark:hover:from-red-700 dark:hover:to-rose-800 text-white font-heading font-black tracking-widest text-xs uppercase rounded-xl shadow-md hover:shadow-lg hover:shadow-blue-500/20 dark:hover:shadow-red-600/25 active:scale-[0.99] transition-all cursor-pointer flex items-center justify-center gap-2 border border-blue-400/20 dark:border-red-400/20 disabled:opacity-50 disabled:cursor-not-allowed select-none pointer-events-auto mt-2"
              >
                {isVerifyingRecovery ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>UPDATING ACCESS...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>VERIFY CODE & UPDATE PASSWORD</span>
                  </>
                )}
              </button>

              <div className="flex items-center justify-between text-xs pt-2">
                <button
                  type="button"
                  onClick={() => setRecoveryStep('request')}
                  className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer font-medium"
                >
                  ← Change Email
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (recoveryEmail) {
                      requestResetLink(recoveryEmail);
                    }
                  }}
                  disabled={isRecoverySubmitting}
                  className="font-semibold text-blue-600 dark:text-red-400 hover:underline cursor-pointer disabled:opacity-50"
                >
                  Resend Code
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      <div className="space-y-4 font-body mt-4">
        <div className="p-3 bg-blue-50/70 dark:bg-red-950/30 border border-blue-500/20 dark:border-red-600/30 backdrop-blur-md rounded-xl text-left transition-colors duration-500">
          <div className="flex items-center gap-1.5 text-[10px] font-heading font-bold text-blue-600 dark:text-red-500 tracking-wider mb-1 uppercase select-none">
            <ShieldAlert className="w-3.5 h-3.5 text-blue-600 dark:text-red-500 shrink-0" />
            <span>RECOVERY PROTOCOL</span>
          </div>
          <p className="text-[9.5px] text-slate-600 dark:text-slate-300 leading-relaxed font-medium">
            Enter the verification code sent to your email and set your new
            password to restore access.
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

  const render2FAVerificationForm = () => (
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
          SECURITY CODE
        </h1>

        <div className="flex items-center justify-center gap-1.5 mb-3 select-none">
          <div className="w-10 h-1 bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-red-600 dark:to-rose-600 rounded-full transition-colors duration-500" />
          <div className="w-1.5 h-1.5 bg-blue-600 dark:bg-red-600 rounded-full transition-colors duration-500" />
        </div>

        <p className="text-center text-xs text-slate-600 dark:text-slate-300 mb-1 leading-relaxed font-bold select-none">
          Two-step email verification is enabled.
        </p>

        {!isOtpDispatched ? (
          <div className="space-y-4 my-4 animate-slide-up">
            <p className="text-center text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
              Please confirm to receive your 6-digit verification code at{' '}
              <span className="font-semibold text-slate-800 dark:text-slate-200 font-mono">
                {maskEmail(twoFactorEmail)}
              </span>
              .
            </p>

            <button
              type="button"
              onClick={handleResend2FACode}
              disabled={isResending2FA}
              className="w-full py-3 px-4 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 dark:from-red-600 dark:via-rose-600 dark:to-red-700 hover:from-blue-700 hover:to-indigo-800 dark:hover:from-red-700 dark:hover:to-rose-800 text-white font-heading font-black tracking-widest text-xs uppercase rounded-xl shadow-md hover:shadow-lg hover:shadow-blue-500/20 dark:hover:shadow-red-600/25 active:scale-[0.99] transition-all cursor-pointer flex items-center justify-center gap-2 border border-blue-400/20 dark:border-red-400/20 disabled:opacity-50 disabled:cursor-not-allowed select-none"
            >
              {isResending2FA ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>DISPATCHING CODE...</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>SEND VERIFICATION CODE</span>
                </>
              )}
            </button>
          </div>
        ) : (
          <div className="animate-slide-up">
            <p className="text-center text-[11px] text-slate-500 dark:text-slate-400 mb-2 leading-snug">
              A 6-digit verification code has been dispatched to{' '}
              <span className="font-semibold text-slate-800 dark:text-slate-200 font-mono">
                {maskEmail(twoFactorEmail)}
              </span>
              .
            </p>

            {twoFactorAttempts > 0 && (
              <p className="text-[11px] text-red-500 font-semibold mb-2">
                Incorrect code. {5 - twoFactorAttempts}{' '}
                {5 - twoFactorAttempts === 1 ? 'attempt' : 'attempts'} remaining
                before lockout.
              </p>
            )}

            {/* OTP Inputs (6 digits) */}
            <div
              className={`flex justify-center items-center gap-1.5 sm:gap-2 my-4 ${
                shake2FA ? 'animate-shake' : ''
              }`}
            >
              {twoFactorCode.map((digit, idx) => (
                <input
                  key={`2fa-6-${idx}`}
                  ref={(el) => {
                    twoFactorInputRefs.current[idx] = el;
                  }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleDigitChange(idx, e.target.value)}
                  onKeyDown={(e) => handleDigitKeyDown(idx, e)}
                  onPaste={idx === 0 ? handleDigitPaste : undefined}
                  disabled={isVerifying2FA}
                  className="w-9.5 h-12 sm:w-11 sm:h-13 text-base sm:text-lg text-center font-bold font-mono rounded-xl bg-white/90 dark:bg-[#161920] border-2 border-slate-200 dark:border-white/10 text-slate-900 dark:text-white focus:border-blue-600 dark:focus:border-red-600 focus:ring-2 focus:ring-blue-500/20 dark:focus:ring-red-500/20 outline-none transition-all shadow-sm"
                  autoFocus={idx === 0}
                />
              ))}
            </div>

            {/* Expiry & Resend Actions */}
            <div className="flex items-center justify-between text-xs px-2 mb-5 font-medium text-slate-500 dark:text-slate-400">
              <div className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>
                  Expires in{' '}
                  <strong className="font-mono text-slate-700 dark:text-slate-300">
                    {formatTime(timeRemainingSeconds)}
                  </strong>
                </span>
              </div>

              <button
                type="button"
                onClick={handleResend2FACode}
                disabled={twoFactorResendCooldown > 0 || isResending2FA}
                className="flex items-center gap-1 font-semibold text-blue-600 dark:text-red-400 hover:underline disabled:opacity-50 disabled:no-underline cursor-pointer disabled:cursor-not-allowed"
              >
                <RefreshCw
                  className={`w-3 h-3 ${isResending2FA ? 'animate-spin' : ''}`}
                />
                <span>
                  {twoFactorResendCooldown > 0
                    ? `Resend (${twoFactorResendCooldown}s)`
                    : 'Resend Code'}
                </span>
              </button>
            </div>

            {/* Verification Submit Button */}
            <button
              type="button"
              onClick={() => verify2FACode()}
              disabled={isVerifying2FA || twoFactorCode.join('').length !== 6}
              className="w-full py-3 px-4 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 dark:from-red-600 dark:via-rose-600 dark:to-red-700 hover:from-blue-700 hover:to-indigo-800 dark:hover:from-red-700 dark:hover:to-rose-800 text-white font-heading font-black tracking-widest text-xs uppercase rounded-xl shadow-md hover:shadow-lg hover:shadow-blue-500/20 dark:hover:shadow-red-600/25 active:scale-[0.99] transition-all cursor-pointer flex items-center justify-center gap-2 border border-blue-400/20 dark:border-red-400/20 disabled:opacity-50 disabled:cursor-not-allowed select-none"
            >
              {isVerifying2FA ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>VERIFYING CODE...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>VERIFY & COMPLETE LOGIN</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* Back to password login */}
        <div className="mt-4 pt-4 border-t border-slate-200/80 dark:border-white/10">
          <button
            type="button"
            onClick={handleCancel2FA}
            className="flex items-center justify-center gap-1.5 w-full text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Cancel and return to password sign-in</span>
          </button>
        </div>
      </div>
    </div>
  );

  const isOutroActive =
    typeof window !== 'undefined' &&
    sessionStorage.getItem('outroActive') === 'true';

  if (
    !isPreview &&
    (!initialized || (user && !isLoggingIn && !isOutroActive && !is2FAMode))
  ) {
    return (
      <div className="relative min-h-screen w-full flex flex-col items-center justify-center bg-slate-50 dark:bg-[#0c0e12] text-slate-900 dark:text-slate-100 font-sans transition-colors duration-300 select-none overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-blue-500/10 dark:bg-red-600/10 rounded-full blur-3xl pointer-events-none animate-pulse" />

        <div className="relative z-10 flex flex-col items-center max-w-sm px-6 text-center space-y-5 animate-fade-in">
          <img
            src={activeLogo}
            alt="Wolf Palomar Logo"
            className="h-16 sm:h-20 object-contain drop-shadow-xl animate-pulse"
          />

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
      <style
        dangerouslySetInnerHTML={{
          __html: `
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
      `,
        }}
      />

      {/* ─── GLOBAL VERTICAL SLIDING WRAPPER (LOGIN <-> DOWNLOAD) ─── */}
      <div
        className="w-full h-full transition-transform duration-700 ease-[cubic-bezier(0.77,0,0.175,1)] will-change-transform"
        style={{
          transform: isDownloadOpen ? 'translateY(-100%)' : 'translateY(0%)',
        }}
      >
        {/* ========================================================================= */}
        {/* SECTION 1: AUTH VIEWPORT (LOGIN, RECOVERY & CAROUSEL)                      */}
        {/* ========================================================================= */}
        <div className="relative w-full h-screen shrink-0 overflow-hidden">
          {/* Ambient Mobile Liquid Background Orbs */}
          <div className="block sm:hidden absolute inset-0 z-0 overflow-hidden pointer-events-none select-none">
            <div className="animate-liquid-1 absolute -top-24 -left-20 w-80 h-80 rounded-full bg-gradient-to-br from-blue-400/25 via-indigo-400/20 to-sky-300/30 dark:from-red-600/25 dark:via-rose-800/15 dark:to-indigo-950/30 blur-3xl" />
            <div className="animate-liquid-2 absolute -bottom-28 -right-20 w-96 h-96 rounded-full bg-gradient-to-tl from-indigo-500/20 via-blue-300/20 to-purple-400/15 dark:from-rose-950/30 dark:via-red-900/20 dark:to-indigo-900/20 blur-3xl" />
          </div>

          {/* Live Preview Mode Overlay Banner */}
          {isPreview && (
            <div className="absolute top-0 inset-x-0 z-[200] bg-blue-600 text-white text-[10px] font-heading tracking-widest uppercase py-2 text-center shadow-md animate-slide-up flex items-center justify-center gap-2 select-none">
              <span>
                ✨ Live Brand Preview Mode (Form Inputs &amp; Actions Disabled)
              </span>
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
            <div
              className="flex border border-slate-300 dark:border-white/15 rounded-sm overflow-hidden"
              aria-hidden="true"
            >
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
            </span>
          </button>

          {/* ─── MAIN SPLIT CONTAINER ─── */}
          <div
            className={`relative z-10 flex w-full h-full auth-split-container ${isReady ? 'is-ready' : ''} ${isPreview ? 'pointer-events-none' : ''}`}
          >
            {/* LEFT COLUMN / LOGIN */}
            <div
              className={`auth-left h-full flex flex-col items-center justify-center relative px-5 mr-5 sm:px-0 transition-all duration-700 ease-out ${
                isLoggingIn
                  ? 'opacity-0 scale-95 translate-y-2 pointer-events-none filter blur-[1px]'
                  : isFlipped
                    ? 'opacity-0 pointer-events-none'
                    : 'opacity-100 pointer-events-auto'
              }`}
              style={{
                transformStyle: 'flat',
                transform: isLoggingIn
                  ? 'scale(0.95) translateY(8px)'
                  : isFlipped
                    ? 'translateX(-100%) scale(0.95)'
                    : 'translateX(0) scale(1)',
              }}
            >
              <div className="absolute top-0 left-0 w-full h-full rotate-0 inset-0 z-0 pointer-events-none opacity-[0.12] dark:opacity-[0.08] dark:invert sm:-top-20 sm:-left-12 sm:w-[110%] sm:h-[120%] sm:rotate-7" />

              {!isMobile ? (
                <div className="w-[420px] max-w-full relative z-10">
                  <Card
                    isLoggingIn={isLoggingIn}
                    className="w-full h-auto shadow-2xl border border-slate-200/80 dark:border-white/10 bg-white/90 dark:bg-[#12151c]/90 backdrop-blur-2xl rounded-4xl relative z-10 overflow-hidden"
                    badgeText={`v${APP_VERSION}`}
                    showWave={true}
                  >
                    {is2FAMode
                      ? render2FAVerificationForm()
                      : renderLoginForm()}
                  </Card>
                </div>
              ) : (
                <div className="w-full max-w-md mx-auto relative z-10 py-6 my-auto max-h-screen overflow-y-auto overflow-x-hidden scrollbar-none">
                  {is2FAMode ? render2FAVerificationForm() : renderLoginForm()}
                </div>
              )}
            </div>

            {/* RIGHT PANEL (Carousel & Gym Details) */}
            <div
              className={`auth-right h-full relative overflow-hidden hidden lg:block -ml-[2px] pl-[2px] select-none transition-all duration-700 ${
                isLoggingIn ? 'opacity-90' : 'opacity-100'
              } ${isFlipped ? 'carousel-flipped' : ''}`}
              style={{
                transformStyle: 'flat',
                transform: isFlipped ? 'translateX(-43vw)' : 'translateX(0)',
              }}
            >
              <div
                ref={carouselBgRef}
                className="carousel-bg-wrapper absolute inset-0 bg-[#0c0e12]"
                style={{
                  willChange: 'transform',
                  backgroundPosition: 'center',
                  backgroundSize: 'cover',
                  transform: 'scale(1.12)',
                }}
              >
                {isAssetPreloaded &&
                  activeCarouselImages.map((image: string, index: number) => (
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

              <div
                className={`carousel-content relative z-3 h-full flex flex-col justify-center px-24 w-162.5 shrink-0 select-none transition-all duration-700 ease-out ${
                  isLoggingIn
                    ? 'opacity-0 scale-95 translate-y-3 filter blur-[1px]'
                    : 'opacity-100'
                }`}
              >
                <h2 className="text-7xl font-heading leading-[0.9] uppercase text-white mb-6 h-32 tracking-wider drop-shadow-md">
                  BEYOND <br />
                  <TypewriterText phrases={TYPEWRITER_PHRASES} />
                </h2>

                <Card
                  expandable={true}
                  variant="glass"
                  className="max-w-lg h-auto"
                >
                  <p className="text-xs text-slate-200 leading-relaxed font-bold">
                    {activeGymDescription}
                    <span className="hidden group-[.expanded]:block mt-4 text-[11px] text-slate-400 leading-relaxed font-body font-normal animate-slide-up space-y-3">
                      <span className="block border-t border-white/10 pt-3">
                        <strong className="text-white uppercase tracking-wider text-[9px] block mb-0.5">
                          LOCATION
                        </strong>
                        <span className="text-slate-300">
                          {activeGymAddress}
                        </span>
                      </span>
                      <span className="block">
                        <strong className="text-white uppercase tracking-wider text-[9px] block mb-0.5">
                          DIRECT SUPPORT
                        </strong>
                        <span className="text-slate-300">
                          {activeContactName1}: {activeContactNumber1}
                          {activeContactName2 &&
                            ` | ${activeContactName2}: ${activeContactNumber2}`}
                        </span>
                      </span>
                      <span className="block">
                        <strong className="text-white uppercase tracking-wider text-[9px] block mb-0.5">
                          EMAIL COMMUNICATIONS
                        </strong>
                        <span className="text-slate-300">
                          {activeEmailAddress}
                        </span>
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

              {/* System Copyright Footers */}
              <div
                className={`absolute bottom-3 sm:bottom-4 left-8 sm:left-12 z-10 pointer-events-auto select-none transition-all duration-700 ease-out ${
                  isFlipped && !isLoggingIn
                    ? 'opacity-100 translate-x-0'
                    : 'opacity-0 -translate-x-4 pointer-events-none'
                }`}
              >
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/45 dark:bg-black/60 backdrop-blur-md border border-white/10 text-white/70 text-[10px] sm:text-[11px] font-mono shadow-lg hover:border-white/20 transition-all">
                  <span className="font-bold text-white tracking-normal sm:tracking-wide">
                    © {new Date().getFullYear()} Wolf Palomar Fitness GYM
                  </span>
                  <span className="text-white/30">|</span>
                  <span className="text-white/60 tracking-normal sm:tracking-wide">
                    All Rights Reserved.
                  </span>
                </div>
              </div>

              <div
                className={`absolute bottom-3 sm:bottom-4 right-8 sm:right-12 z-10 pointer-events-auto select-none transition-all duration-700 ease-out ${
                  !isFlipped && !isLoggingIn
                    ? 'opacity-100 translate-x-0'
                    : 'opacity-0 translate-x-4 pointer-events-none'
                }`}
              >
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/45 dark:bg-black/60 backdrop-blur-md border border-white/10 text-white/70 text-[10px] sm:text-[11px] font-mono shadow-lg hover:border-white/20 transition-all">
                  <span className="font-bold text-white tracking-normal sm:tracking-wide">
                    © {new Date().getFullYear()} Wolf Palomar Fitness GYM
                  </span>
                  <span className="text-white/30">|</span>
                  <span className="text-white/60 tracking-normal sm:tracking-wide">
                    All Rights Reserved.
                  </span>
                </div>
              </div>
            </div>

            {/* RECOVERY VIEW */}
            <div
              className={`absolute top-0 left-0 lg:left-auto lg:right-0 h-full w-full lg:w-[42vw] flex flex-col items-center justify-center shrink-0 px-5 transition-all duration-700 ease-out ${
                isFlipped && !isLoggingIn
                  ? 'pointer-events-auto opacity-100 z-20'
                  : 'pointer-events-none opacity-0 z-0'
              }`}
              style={{
                transformStyle: 'flat',
                transform: isFlipped
                  ? 'translateX(0) scale(1)'
                  : 'translateX(100%) scale(0.95)',
              }}
            >
              <div className="absolute top-0 left-0 w-full h-full rotate-0 inset-0 z-0 pointer-events-none opacity-[0.18] dark:opacity-[0.1] dark:invert transition-opacity duration-300 sm:-top-14 sm:left-4 sm:w-[110%] sm:h-[110%] sm:-rotate-7" />

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

          {/* Indicator Button */}
          {!isLoggingIn && !isAppOrPwaInstalled && (
            <div
              className={`absolute bottom-3 sm:bottom-4 inset-x-0 z-40 flex justify-center pointer-events-none transition-all duration-700 ease-out ${
                isReady
                  ? 'opacity-100 translate-y-0'
                  : 'opacity-0 translate-y-4'
              }`}
            >
              <button
                type="button"
                onClick={() => setIsDownloadOpen(true)}
                className="pointer-events-auto group flex items-center gap-2.5 px-5 py-2.5 rounded-full bg-white/85 dark:bg-[#161920]/90 border border-slate-200/90 dark:border-white/10 shadow-lg hover:shadow-xl dark:shadow-red-950/20 backdrop-blur-xl transition-all duration-300 transform hover:-translate-y-0.5 active:translate-y-0 text-slate-800 dark:text-slate-200 hover:text-blue-600 dark:hover:text-red-500 cursor-pointer select-none"
                aria-label="Slide down to download apps and terminal client"
              >
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 dark:bg-red-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-600 dark:bg-red-600" />
                </span>

                <Download className="w-3.5 h-3.5 text-blue-600 dark:text-red-500" />

                <span className="text-[10.5px] font-heading font-black tracking-widest uppercase">
                  DOWNLOAD APPS
                </span>

                <ChevronDown className="w-4 h-4 text-blue-600 dark:text-red-500 transition-transform duration-300 group-hover:translate-y-0.5 animate-bounce" />
              </button>
            </div>
          )}
        </div>

        {/* SECTION 2: DOWNLOAD VIEWPORT */}
        <div className="relative w-full h-screen shrink-0 overflow-y-auto overflow-x-hidden scrollbar-none">
          <DownloadPage
            standalone={false}
            onBackToLogin={() => setIsDownloadOpen(false)}
            theme={theme}
            onToggleTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            gymLogo={activeLogo}
            appVersion={APP_VERSION}
          />
        </div>
      </div>

      {/* SEAMLESS INTRO / OUTRO FLUIDISM CURTAIN */}
      {isLoggingIn && (
        <div
          className={`fixed inset-0 z-[16000] pointer-events-none transition-transform duration-[1500ms] ease-[cubic-bezier(0.77,0,0.175,1)] ${
            loginStarted
              ? 'translate-x-0 scale-x-[-1]'
              : '-translate-x-[250%] scale-x-[-1]'
          }`}
        >
          <div className="relative w-full h-full bg-[var(--bg-page,#f0f4f8)] bg-slate-100 dark:bg-[#0c0e12]">
            <div
              className={`absolute top-0 right-full -translate-x-4 sm:-translate-x-10 h-full origin-right transition-transform duration-[1300ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
                loginResting ? 'scale-x-100' : 'scale-x-[2.5] sm:scale-x-[8]'
              }`}
            >
              <div className="absolute top-0 right-8 sm:right-16 h-full w-8 sm:w-16 blur-xl sm:blur-2xl opacity-80 bg-gradient-to-l from-transparent to-blue-600 dark:to-red-600" />
              <div className="absolute top-0 right-5 sm:right-10 h-full w-4 sm:w-8 bg-[#123c73] dark:bg-[#7a0000] opacity-90" />
              <div className="absolute top-0 right-2.5 sm:right-5 h-full w-3 sm:w-6 bg-[#295c9a] dark:bg-[#a60303]" />
              <div className="absolute top-0 right-1 sm:right-2 h-full w-2 sm:w-4 bg-[#539cff] dark:bg-[#e60000] shadow-[0_0_10px_rgba(83,156,255,0.8)] sm:shadow-[0_0_20px_rgba(83,156,255,0.8)] dark:shadow-[0_0_10px_rgba(230,0,0,0.8)] dark:sm:shadow-[0_0_20px_rgba(230,0,0,0.8)]" />
              <div className="absolute top-0 right-0 h-full w-0.5 sm:w-0.75 bg-white dark:bg-red-100 shadow-[0_0_15px_rgba(255,255,255,1)] sm:shadow-[0_0_25px_rgba(255,255,255,1)] dark:shadow-[0_0_15px_rgba(255,100,100,1)] dark:sm:shadow-[0_0_25px_rgba(255,100,100,1)]" />
            </div>
          </div>
        </div>
      )}

      {/* ─── ON-DEMAND SECURITY CAPTCHA MODAL (APPEARS AFTER 5 FAILED ATTEMPTS) ─── */}
      <SecurityCaptchaModal
        isOpen={isCaptchaModalOpen}
        onClose={() => {
          setIsCaptchaModalOpen(false);
          setPendingCaptchaAction(null);
        }}
        onVerify={handleCaptchaVerified}
        siteKey={HCAPTCHA_SITE_KEY}
        theme={theme}
      />

      {/* MODALS */}
      <Modal
        isOpen={showExitConfirm}
        onClose={() => setShowExitConfirm(false)}
        title="Abandon Recovery?"
      >
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-bold font-body text-center">
          If you leave recovery, you must re-verify credentials. Discard this
          operation?
        </p>
        <div className="flex gap-3 mt-4">
          <Button variant="secondary" onClick={() => setShowExitConfirm(false)}>
            Stay
          </Button>
          <Button
            onClick={() => {
              setShowExitConfirm(false);
              setIsFlipped(false);
              resetRecovery();
            }}
          >
            Go Back
          </Button>
        </div>
      </Modal>

      <Modal
        isOpen={showSuccessModal}
        onClose={() => {
          setShowSuccessModal(false);
          setIsFlipped(false);
          resetRecovery();
        }}
        title="Recovery Link Sent"
      >
        <div className="space-y-6 font-body text-center select-text">
          <CheckCircle2 className="w-16 h-16 mx-auto text-emerald-500 dark:text-emerald-400 animate-bounce" />
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-bold">
            We have successfully sent a secure password reset link to{' '}
            <span className="font-mono text-slate-950 dark:text-white select-all">
              {recoveryEmail}
            </span>
            . Please check your inbox and follow the link to complete the reset.
          </p>
          <Button
            onClick={() => {
              setShowSuccessModal(false);
              setIsFlipped(false);
              resetRecovery();
            }}
          >
            Return to Login
          </Button>
        </div>
      </Modal>
    </div>
  );
};
