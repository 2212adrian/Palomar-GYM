import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, useLocation } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, Loader2, ShieldAlert, CheckCircle2, Sun, Moon } from 'lucide-react';
import { toast } from 'react-toastify';
import { supabase } from '../../lib/supabase/client';
import { useAuthStore } from '../../stores/authStore';

// Dynamic version retrieval from package.json
import pkg from '../../../package.json';

// Asset Imports for Vite Processing
import carousel1 from '../../assets/1-carousel.webp';
import carousel2 from '../../assets/2-carousel.webp';
import carousel3 from '../../assets/3-carousel.webp';
import carousel4 from '../../assets/4-carousel.webp';
import carousel5 from '../../assets/5-carousel.webp';
import carousel6 from '../../assets/6-carousel.webp';
import landscapeLogo from '../../assets/landscape-logo.webp';

const carouselImages = [carousel1, carousel2, carousel3, carousel4, carousel5, carousel6];

// Form Schemas
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

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { checkSession, user, initialized, error: storeError, setError } = useAuthStore();

  // Layout & UI States
  const [isReady, setIsReady] = useState(false); // Controls the contraction intro animation
  const [isFlipped, setIsFlipped] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);
  const [isRecoverySubmitting, setIsRecoverySubmitting] = useState(false);
  
  // Theme Management with 3-Color Preview Sync
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('theme');
      if (saved === 'dark' || saved === 'light') return saved;
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'dark';
  });

  // Modals
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showWelcomeOverlay, setShowWelcomeOverlay] = useState(false);
  const [welcomeUser, setWelcomeUser] = useState<{ name: string; email: string; avatar?: string } | null>(null);

  // Carousel & Typewriter
  const [activeSlide, setActiveSlide] = useState(0);
  const [typewriterText, setTypewriterText] = useState('');
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);

  const from = (location.state as any)?.from?.pathname || '/dashboard';
  const phrases = ['SECURE.', 'RELIABLE.', 'STRENGTH.', 'LIMITS.', 'ENDURANCE.', 'CAPACITY.'];
  const appVersion = pkg.version || '2.0.0B';

  // Form setups
  const {
    register: registerLogin,
    handleSubmit: handleLoginSubmit,
    formState: { errors: loginErrors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '', agree: true },
  });

  const {
    register: registerRecovery,
    handleSubmit: handleRecoverySubmit,
    formState: { errors: recoveryErrors },
  } = useForm<RecoveryFormValues>({
    resolver: zodResolver(recoverySchema),
    defaultValues: { email: '' },
  });

  // Theme Sync effect
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
      root.classList.remove('light');
    } else {
      root.classList.add('light');
      root.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Session Protection check (Forces logged-in users back to dashboard)
  useEffect(() => {
    if (initialized && user) {
      navigate('/dashboard', { replace: true });
    }
  }, [initialized, user, navigate]);

  // Deduplicates "ACCESS DENIED" alerts using a static toastId
  useEffect(() => {
    if (storeError) {
      toast.error(storeError, { toastId: 'unauthorized-access-toast' });
      setError(null); // Clear error flag after alerting
      setIsGoogleSubmitting(false);
    }
  }, [storeError, setError]);

  // Shrink Reveal Transition on Mount
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsReady(true);
    }, 150);
    return () => clearTimeout(timer);
  }, []);

  // Background Carousel Loop
  useEffect(() => {
    const slideTimer = setInterval(() => {
      setActiveSlide((prev) => (prev + 1) % carouselImages.length);
    }, 5000);
    return () => clearInterval(slideTimer);
  }, []);

  // Typewriter Loop Script
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const currentPhrase = phrases[phraseIndex];

    const tick = () => {
      if (!isDeleting) {
        setTypewriterText(currentPhrase.substring(0, typewriterText.length + 1));
        if (typewriterText === currentPhrase) {
          timer = setTimeout(() => setIsDeleting(true), 1500);
        } else {
          timer = setTimeout(tick, 100);
        }
      } else {
        setTypewriterText(currentPhrase.substring(0, typewriterText.length - 1));
        if (typewriterText === '') {
          setIsDeleting(false);
          setPhraseIndex((prev) => (prev + 1) % phrases.length);
        } else {
          timer = setTimeout(tick, 50);
        }
      }
    };

    timer = setTimeout(tick, isDeleting ? 40 : 100);
    return () => clearTimeout(timer);
  }, [typewriterText, isDeleting, phraseIndex]);

  // Native Credentials Login submission
  const onLoginSubmit = async (data: LoginFormValues) => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      const { data: authData, error } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });

      if (error) throw error;

      await checkSession();
      const loggedInUser = useAuthStore.getState().user;

      // Handle the block condition manually if session check didn't route first
      if (!loggedInUser) {
        setIsSubmitting(false);
        return;
      }

      // Fetch fallback metadata directly from Auth record since profiles table is removed
      const displayName = loggedInUser.user_metadata?.full_name || 
                          loggedInUser.user_metadata?.name || 
                          loggedInUser.email?.split('@')[0] || 
                          'Authorized User';

      setWelcomeUser({
        name: displayName,
        email: authData.user?.email || '',
        avatar: loggedInUser.user_metadata?.avatar_url || undefined,
      });
      setShowWelcomeOverlay(true);

      setTimeout(() => {
        toast.success('System coordinates loaded.');
        navigate(from, { replace: true });
      }, 2500);

    } catch (err: any) {
      toast.error(err.message || 'Verification rejected by system firewall.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Recovery submission
  const onRecoverySubmit = async (data: RecoveryFormValues) => {
    setIsRecoverySubmitting(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(data.email, {
        redirectTo: `${window.location.origin}/forgot-password`,
      });
      if (error) throw error;
      setShowSuccessModal(true);
    } catch (err: any) {
      toast.error(err.message || 'Unable to register recovery request.');
    } finally {
      setIsRecoverySubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsGoogleSubmitting(true);
    try {
      const appUrl = import.meta.env.VITE_APP_URL || window.location.origin;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${appUrl}/dashboard`,
        },
      });
      if (error) throw error;
    } catch (err: any) {
      toast.error(err.message || 'OAuth handshake parameters invalid.');
      setIsGoogleSubmitting(false);
    }
  };

  // Prevent flash of screen before session initialization checks complete
  if (!initialized) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-white dark:bg-[#0f1012]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-rose-600 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-screen overflow-hidden bg-white dark:bg-[#0f1012] select-none font-sans text-slate-900 dark:text-slate-100">
      
      {/* FLOATING CORNER THEME CONTROLLER & COLOR PREVIEW SQUARES */}
      <button
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        className="absolute top-4 right-4 z-50 flex items-center gap-3 bg-white/80 dark:bg-neutral-900/80 border border-slate-200 dark:border-white/10 rounded-full px-4 py-2.5 shadow-lg backdrop-blur-md cursor-pointer hover:opacity-95"
      >
        {/* Colors displayed as touching, contiguous squares */}
        <div className="flex border border-slate-300 dark:border-white/15 rounded-sm overflow-hidden" aria-hidden="true">
          {theme === 'dark' ? (
            <>
              <span className="w-3.5 h-3.5 bg-[#0f1012]" title="Bg: Black" />
              <span className="w-3.5 h-3.5 bg-[#bf0202]" title="Primary: Red" />
              <span className="w-3.5 h-3.5 bg-[#13161a]" title="Surface: Gray" />
            </>
          ) : (
            <>
              <span className="w-3.5 h-3.5 bg-[#ffffff]" title="Bg: White" />
              <span className="w-3.5 h-3.5 bg-[#1b365d]" title="Primary: Blue" />
              <span className="w-3.5 h-3.5 bg-[#f3f4f6]" title="Surface: Light Gray" />
            </>
          )}
        </div>

        <span className="text-slate-700 dark:text-slate-300 text-[10px] font-black tracking-widest flex items-center gap-1">
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

      {/* SPLIT CONTAINER */}
      <div className={`flex w-full h-full auth-split-container ${isReady ? 'is-ready' : ''}`}>
        
        {/* LEFT OPERATIVE INTERFACE */}
        <div className="auth-left flex flex-col items-center justify-center z-10 px-4">
          
          {/* MOBILE LOGO (outside of card boundary with curved edges) */}
          <img 
            src="/favicon.svg" 
            alt="Palomar Logo" 
            className="block lg:hidden w-28 h-28 object-contain rounded-3xl border border-slate-200 dark:border-white/5 bg-white dark:bg-[#141414] p-3 shadow-xl mb-6 mx-auto" 
          />

          {/* DESKTOP LOGO (placed above card with clean breathing room, not stuck) */}
          <div className="hidden lg:block mb-8 shrink-0 relative z-20">
            <img 
              src={landscapeLogo} 
              alt="Palomar Logo" 
              className="w-52 h-auto object-contain rounded-2xl shadow-xl border border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-[#141414] p-3 transition-all duration-500" 
            />
          </div>

          <div className="flip-card">
            <div className={`flip-card-inner ${isFlipped ? 'flipped' : ''}`}>
              
              {/* CARD FRONT: LOGIN SECTION */}
              {/* Responsive toggle: containerless on mobile (transparent, borderless, shadowless) */}
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
                      v{appVersion}
                    </span>
                  </div>

                  <form onSubmit={handleLoginSubmit(onLoginSubmit)} className="space-y-4 font-body">
                    {/* Email Input */}
                    <div className="field-wrap">
                      <input
                        {...registerLogin('email')}
                        type="email"
                        className={`field-input ${loginErrors.email ? 'shake-error' : ''}`}
                        placeholder=" "
                        autoComplete="email"
                      />
                      <label className="field-label">
                        <Mail className="w-4 h-4 text-slate-400" />
                        <span>Email Address</span>
                      </label>
                    </div>

                    {/* Password Input */}
                    <div className="field-wrap relative">
                      <input
                        {...registerLogin('password')}
                        type={showPassword ? 'text' : 'password'}
                        className={`field-input ${loginErrors.password ? 'shake-error' : ''}`}
                        placeholder=" "
                        autoComplete="current-password"
                      />
                      <label className="field-label">
                        <Lock className="w-4 h-4 text-slate-400" />
                        <span>Password</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="field-visibility-toggle"
                      >
                        {showPassword ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
                      </button>
                    </div>

                    {/* Checkbox agreement fields */}
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
                          I agree to the <a href="#" className="text-[#1b365d] dark:text-sky-400 hover:underline">Terms & Conditions</a> and <a href="#" className="text-[#1b365d] dark:text-sky-400 hover:underline">Privacy Policy</a>.
                        </span>
                      </label>
                    </div>

                    {/* Sign In Button */}
                    <button type="submit" disabled={isSubmitting || isGoogleSubmitting} className="w-full font-heading text-white bg-[#1b365d] hover:bg-[#112246] dark:bg-[#bf0202] dark:hover:bg-[#9c0202] disabled:opacity-50 py-3.5 rounded-xl uppercase tracking-wider text-sm transition-all duration-200">
                      {isSubmitting ? <Loader2 className="w-5 h-5 mx-auto animate-spin" /> : 'Login Now'}
                    </button>

                    {/* Google Sign In */}
                    <button
                      type="button"
                      onClick={handleGoogleLogin}
                      disabled={isSubmitting || isGoogleSubmitting}
                      className="google-login-btn w-full font-heading text-xs"
                    >
                      <svg className="w-4 h-4 text-[#ea4335] shrink-0" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                      </svg>
                      <span>Continue With Google</span>
                    </button>
                  </form>
                </div>

                {/* Bottom navigation links and notification parameters */}
                <div className="space-y-4 mt-4 font-body">
                  <div className="flex items-center justify-center text-xs font-bold text-slate-400">
                    <button onClick={() => setIsFlipped(true)} className="hover:text-slate-800 dark:hover:text-white hover:underline transition-all">
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

              {/* CARD BACK: PASSWORD RECOVERY SECTION */}
              <div className="flip-card-back flex flex-col justify-between h-full bg-transparent border-none shadow-none lg:bg-neutral-50/95 lg:dark:bg-[#141414]/95 lg:border lg:border-slate-200 lg:dark:border-white/5 lg:p-8 lg:rounded-4xl lg:shadow-2xl">
                <div>
                  <div className="text-center brand text-2xl font-heading tracking-[0.08em] mb-1 text-slate-900 dark:text-white pt-2 lg:pt-0">
                    RECOVERY MODE
                  </div>
                  <p className="desc text-center text-xs text-slate-900 dark:text-slate-400 mb-6 leading-relaxed font-bold">
                    Enter authorized email coordinates to request administrative authentication.
                  </p>

                  <form onSubmit={handleRecoverySubmit(onRecoverySubmit)} className="space-y-4 font-body">
                    <div className="field-wrap">
                      <input
                        {...registerRecovery('email')}
                        type="email"
                        className={`field-input ${recoveryErrors.email ? 'shake-error' : ''}`}
                        placeholder=" "
                        autoComplete="email"
                      />
                      <label className="field-label">
                        <Mail className="w-4 h-4 text-slate-400" />
                        <span>Email Address</span>
                      </label>
                    </div>

                    <button type="submit" disabled={isRecoverySubmitting} className="w-full font-heading text-white bg-[#1b365d] hover:bg-[#112246] dark:bg-[#bf0202] dark:hover:bg-[#9c0202] disabled:opacity-50 py-3.5 rounded-xl uppercase tracking-wider text-sm transition-all duration-200">
                      {isRecoverySubmitting ? <Loader2 className="w-5 h-5 mx-auto animate-spin" /> : 'Send Security OTP'}
                    </button>
                  </form>
                </div>

                <div className="space-y-4 font-body">
                  <div className="protocol-notice-box p-3 bg-slate-100 dark:bg-red-950/10 border border-slate-200 dark:border-[#a63429] rounded-xl text-left">
                    <div className="notice-header flex items-center gap-1.5 text-[10px] font-bold text-[#1b365d] dark:text-blue-400 tracking-wider mb-1 font-heading">
                      <ShieldAlert className="w-4 h-4 text-[#1b365d] dark:text-[#bf0202]" />
                      <span>RECOVERY PROTOCOL</span>
                    </div>
                    <p className="notice-body text-[9px] text-slate-900 dark:text-slate-400 leading-relaxed font-bold">
                      Recovery Mode transmits a secure password reset hyperlink directly to your documented dashboard.
                    </p>
                  </div>

                  <button onClick={() => setShowExitConfirm(true)} className="w-full text-center text-xs font-bold text-slate-900 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all">
                    Already have credentials? Back to Login
                  </button>

                  <div className="text-center text-[9px] text-slate-900 dark:text-slate-500 font-bold">
                    © {new Date().getFullYear()} WOLF PALOMAR.
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* RIGHT SIDE CAROUSEL & TYPING TEXT */}
        <div className="auth-right flex-0 opacity-0 relative overflow-hidden hidden lg:block shrink-0 w-162.5">
          <div className="carousel-bg-wrapper absolute inset-0">
            {carouselImages.map((image, index) => (
              <img
                key={index}
                src={image}
                alt={`Gym slide view ${index + 1}`}
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
              <span className="cursor text-[#031d7d] dark:text-[#bf0202] animate-[blink_0.8s_infinite]">|</span>
            </h2>

            <div className="description-expandable-container bg-black/50 border border-white/10 p-6 rounded-2xl max-w-lg transition-all duration-300 backdrop-blur-md shadow-2xl font-body">
              <p className="text-xs text-slate-200 leading-relaxed">
                The ultimate terminal for Palomar Gym administrative control. Encrypted, fast, and precise.
                <span className="block mt-4 text-[11px] text-slate-400 line-clamp-3 leading-relaxed font-body">
                  Wolf OS provides end-to-end telemetry for modern fitness centers. Managing membership lifecycles, financial encryption, and real-time staff coordination.
                </span>
              </p>
              <div className="text-[8px] text-[#031d7d] dark:text-[#bf0202] tracking-widest font-heading uppercase mt-4">
                CONNECTED PROTOCOL TERMINAL
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* --- EXIT RECOVERY MODAL --- */}
      {showExitConfirm && (
        <div className="fixed inset-0 z-12000 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setShowExitConfirm(false)} />
          <div className="relative bg-slate-50 dark:bg-[#17191c] border border-slate-200 dark:border-white/10 rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl space-y-4 font-body">
            {/* Modal Titles use standard Freshman, but buttons use standard readable Inter to eliminate text compression */}
            <h3 className="text-lg font-heading text-slate-900 dark:text-white uppercase tracking-wider">Abandon Recovery?</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-bold">
              If you leave recovery, you must re-verify credentials. Are you sure you want to discard this operation?
            </p>
            <div className="flex gap-3 mt-4">
              <button onClick={() => setShowExitConfirm(false)} className="flex-1 bg-slate-200 dark:bg-[#1a1a1a] border border-slate-300 dark:border-white/10 text-slate-700 dark:text-slate-300 py-3.5 rounded-xl font-bold font-body text-xs uppercase tracking-widest hover:bg-slate-300 dark:hover:bg-neutral-800 transition-all cursor-pointer">
                Stay
              </button>
              <button
                onClick={() => {
                  setShowExitConfirm(false);
                  setIsFlipped(false);
                }}
                className="flex-1 bg-[#031d7d] dark:bg-[#bf0202] text-white py-3.5 rounded-xl font-bold font-body text-xs uppercase tracking-widest hover:opacity-95 transition-all cursor-pointer shadow-lg"
              >
                Go Back
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- SUCCESS MODAL --- */}
      {showSuccessModal && (
        <div className="fixed inset-0 z-12000 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md" />
          <div className="relative bg-slate-50 dark:bg-[#17191c] border border-slate-200 dark:border-white/10 rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl space-y-6 font-body">
            <CheckCircle2 className="w-16 h-16 mx-auto text-emerald-500 dark:text-emerald-400 animate-bounce" />
            <div className="space-y-2">
              <h3 className="text-lg font-heading text-slate-900 dark:text-white uppercase tracking-wider">Link Transmitted</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-bold">
                If the email coordinate exists, reset parameters have been successfully sent.
              </p>
            </div>
            <button
              onClick={() => {
                setShowSuccessModal(false);
                setIsFlipped(false);
              }}
              className="w-full font-body bg-[#031d7d] dark:bg-[#bf0202] text-white py-3.5 rounded-xl font-bold uppercase tracking-widest text-xs hover:opacity-90 transition-all cursor-pointer"
            >
              Return to Login
            </button>
          </div>
        </div>
      )}

      {/* --- SUCCESS WELCOME OVERLAY --- */}
      {showWelcomeOverlay && welcomeUser && (
        <div className="fixed inset-0 z-13000 flex items-center justify-center bg-black/90 backdrop-blur-xl">
          <div className="welcome-box max-w-sm w-full text-center p-8 space-y-6">
            <div className="w-20 h-20 mx-auto rounded-full border-2 border-indigo-500/50 p-1 bg-neutral-900 shadow-xl">
              {welcomeUser.avatar ? (
                <img src={welcomeUser.avatar} alt="User" className="w-full h-full rounded-full object-cover" />
              ) : (
                <div className="w-full h-full rounded-full bg-indigo-600 flex items-center justify-center text-white text-3xl font-bold">
                  {welcomeUser.name[0].toUpperCase()}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <div className="text-[10px] font-heading text-rose-500 tracking-[3px] uppercase">Secure Terminal</div>
              <h3 className="text-2xl font-bold text-white uppercase">{welcomeUser.name}</h3>
              <p className="text-xs text-slate-400">{welcomeUser.email}</p>
            </div>
            <div className="text-xs text-slate-300 font-body leading-relaxed">
              Welcome back. Initializing your secure workspace session parameters...
            </div>
            <div className="h-1.5 w-32 bg-neutral-800 rounded-full mx-auto overflow-hidden">
              <div className="h-full bg-[#031d7d] dark:bg-[#bf0202] animate-[loading_2.5s_ease-in-out_infinite]" />
            </div>
          </div>
        </div>
      )}

    </div>
  );
};