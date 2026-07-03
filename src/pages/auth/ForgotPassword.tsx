//src/pages/auth/ForgotPassword.tsx
import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { 
  Mail, 
  Lock, 
  Eye, 
  EyeOff, 
  ShieldAlert, 
  CheckCircle2, 
  ArrowLeft, 
  Sun, 
  Moon, 
  Loader2,
  User as UserIcon 
} from 'lucide-react';
import { toast } from 'react-toastify';
import { supabase } from '../../lib/supabase/client';

import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';

import axiomTexture from '../../assets/textures/hexagons.svg';

interface RecoveryUserInfo {
  id: string;
  email: string;
  username: string;
}

// --- Zod Validation Schemas ---
const requestSchema = z.object({
  email: z.string().email({ message: 'Please enter a valid authorized email address' }),
});

const resetPasswordSchema = z.object({
  password: z.string().min(6, { message: 'Password must be at least 6 characters long' }),
  confirmPassword: z.string().min(6, { message: 'Confirm password must be at least 6 characters long' }),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

type RequestFormValues = z.infer<typeof requestSchema>;
type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;

function getInitialTheme(): 'dark' | 'light' {
  if (typeof window === 'undefined') return 'dark';
  const saved = localStorage.getItem('theme');
  if (saved === 'dark' || saved === 'light') return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

// Memory tracking variable for the local blob URL to safely revoke it [2]
let activeLocalBlobUrl: string | null = null;

export const ForgotPassword: React.FC = () => {
  const navigate = useNavigate();
  const [theme, setTheme] = useState<'dark' | 'light'>(getInitialTheme);
  
  // States to differentiate direct request mode vs active recovery state
  const checkSession = useAuthStore((state) => state.checkSession);
  const [isRecoveryState, setIsRecoveryState] = useState<boolean>(false);
  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  
  // Profile extraction states
  const [recoveryUser, setRecoveryUser] = useState<RecoveryUserInfo | null>(null);
  const [localAvatarUrl, setLocalAvatarUrl] = useState<string>('');

  // Password visual controls
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState<boolean>(false);
  
  // Modal State
  const [showSuccessModal, setShowSuccessModal] = useState<boolean>(false);

  // --- Dynamic Theme Syncing ---
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    root.classList.toggle('light', theme === 'light');
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Clean up Blob memory leaks when the component unmounts [2]
  useEffect(() => {
    return () => {
      if (activeLocalBlobUrl) {
        URL.revokeObjectURL(activeLocalBlobUrl);
        activeLocalBlobUrl = null;
      }
    };
  }, []);

  // --- Secure Session & Active Profile Handler ---
  useEffect(() => {
    const handleUrlSessionParsing = async () => {
      try {
        setIsInitializing(true);

        const hash = window.location.hash.substring(1);
        const params = new URLSearchParams(hash);
        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');

        let isVerifiedSession = false;

        // Secure Lock: ONLY allow access to the password setup page if a valid token is present in the hash
        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) throw error;
          isVerifiedSession = true;
        } else {
          // No token detected. Block entry to recovery state and show the standard request form
          isVerifiedSession = false;
        }

        if (isVerifiedSession) {
          const { data: { user } } = await supabase.auth.getUser();
          
          if (user) {
            setIsRecoveryState(true);
            setRecoveryUser({
              id: user.id,
              email: user.email || '',
              username: user.user_metadata?.full_name || user.email?.split('@')[0] || 'User',
            });

            // Securely fetch and download private avatar files from the private bucket [2]
            const avatarPath = user.user_metadata?.avatar_url || '';
            if (avatarPath && !avatarPath.startsWith('http')) {
              try {
                const { data: imageBlob, error: downloadError } = await supabase.storage
                  .from('avatars')
                  .download(avatarPath);

                if (!downloadError && imageBlob) {
                  if (activeLocalBlobUrl) {
                    URL.revokeObjectURL(activeLocalBlobUrl);
                  }
                  const localUrl = URL.createObjectURL(imageBlob);
                  setLocalAvatarUrl(localUrl);
                  activeLocalBlobUrl = localUrl;
                }
              } catch (err) {
                console.warn('Failed to load private avatar in recovery view:', err);
              }
            } else if (avatarPath.startsWith('http')) {
              setLocalAvatarUrl(avatarPath);
            }

            toast.success('Secure recovery session verified. Choose your new password.');
          }
        }
      } catch (err: any) {
        console.error('Session parsing failed:', err.message);
        toast.error('The recovery session link is invalid or has expired.');
      } finally {
        setIsInitializing(false);
      }
    };

    handleUrlSessionParsing();
  }, []);

  // --- Form Hooks ---
  const {
    register: registerRequest,
    handleSubmit: handleRequestSubmit,
    watch: watchRequest,
    setValue: setRequestValue,
    formState: { errors: requestErrors, touchedFields: touchedRequest },
  } = useForm<RequestFormValues>({
    resolver: zodResolver(requestSchema),
    defaultValues: { email: '' },
  });

  const {
    register: registerReset,
    handleSubmit: handleResetSubmit,
    watch: watchReset,
    formState: { errors: resetErrors, touchedFields: touchedReset },
  } = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  const watchRequestEmail = watchRequest('email');
  const watchNewPassword = watchReset('password');
  const watchConfirmPassword = watchReset('confirmPassword');

  const normaliseEmail = (val: string) => {
    if (val && !val.includes('@')) {
      // Standardize local username recovery requests to the preferred domain
      setRequestValue('email', `${val.trim()}@palomargym.noemail`, { shouldValidate: true });
    }
  };

  // --- Handler: Request Recovery Link ---
  const onRequestRecoveryLink = async (data: RequestFormValues) => {
    try {
      setIsSubmitting(true);
      const { error } = await supabase.auth.resetPasswordForEmail(data.email, {
        redirectTo: `${window.location.origin}/forgot-password`,
      });

      if (error) throw error;

      toast.success(`A recovery email has been sent to ${data.email}`);
      navigate('/login');
    } catch (err: any) {
      toast.error(err.message || 'Failed to dispatch recovery instructions.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- Handler: Set New Password & Terminate Other Devices Globally ---
  const onSetNewPasswordSubmit = async (data: ResetPasswordFormValues) => {
    try {
      setIsSubmitting(true);
      
      // 1. Update the password on Supabase Auth
      const { error } = await supabase.auth.updateUser({
        password: data.password,
      });
      if (error) throw error;

      // 2. Mark the account status as 'active' inside profiles table
      if (recoveryUser?.id) {
        const { error: dbError } = await supabase
          .from('profiles')
          .update({ status: 'active' })
          .eq('id', recoveryUser.id);
          
        if (dbError) {
          console.warn('Failed to update status to active on password update:', dbError.message);
        }
      }

      // 3. Terminate all current and alternative device sessions globally [1.1.1, 1.1.2]
      const { error: signOutError } = await supabase.auth.signOut({ scope: 'global' });
      if (signOutError) {
        console.warn('Sign out other sessions warned:', signOutError.message);
      }

      // Syncs your local store to clear the user session from memory [2]
      await checkSession(); 

      setShowSuccessModal(true);
    } catch (err: any) {
      toast.error(err.message || 'Failed to update credentials.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePreRequestSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    normaliseEmail(watchRequestEmail);
    handleRequestSubmit(onRequestRecoveryLink)(e);
  };

  return (
    <div className="relative w-full h-screen overflow-hidden bg-[#f8fafc] dark:bg-[#0f1012] select-none flex items-center justify-center px-4 transition-colors duration-700 font-sans">
      
      {/* Background Texture Overlay */}
      <div 
        className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05] pointer-events-none" 
        style={{ backgroundImage: `url(${axiomTexture})`, backgroundSize: '180px' }}
      />

      {/* Theme Swapper Toggle */}
      <button
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        className="absolute top-4 right-4 z-50 flex items-center gap-3 bg-white/80 dark:bg-[#141414]/80 border border-slate-200 dark:border-white/10 rounded-full px-4 py-2.5 shadow-lg backdrop-blur-md cursor-pointer hover:opacity-95 transition-all duration-500"
      >
        <span className="text-slate-700 dark:text-slate-300 text-[10px] font-heading tracking-widest flex items-center gap-1.5">
          {theme === 'dark' ? (
            <><Sun className="w-3.5 h-3.5 text-amber-400" /><span>LIGHT</span></>
          ) : (
            <><Moon className="w-3.5 h-3.5 text-indigo-400" /><span>DARK</span></>
          )}
        </span>
      </button>

      {/* System Access Card Wrapper */}
      <div className="w-full max-w-md relative z-10 animate-[slideUp_0.4s_cubic-bezier(0.16,1,0.3,1)_forwards]">
        
        <div className="bg-white dark:bg-[#141414]/95 border border-slate-200 dark:border-white/5 rounded-3xl shadow-2xl p-6 sm:p-8 flex flex-col justify-between transition-all duration-500">
          
          {isInitializing ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <Loader2 className="w-8 h-8 animate-spin text-[#1b365d] dark:text-[#bf0202]" />
              <p className="text-xs font-heading tracking-widest text-slate-500 dark:text-slate-400 uppercase">
                Verifying Credentials...
              </p>
            </div>
          ) : (
            <>
              <div>
                <div className="text-center font-heading text-2xl tracking-[0.08em] mb-1 text-slate-900 dark:text-white">
                  {isRecoveryState ? 'RESTORE ACCESS' : 'RECOVERY MODE'}
                </div>
                <p className="text-center font-heading text-[10px] tracking-[2.4px] text-[#1b365d] dark:text-blue-400 uppercase opacity-90 mb-6">
                  GYM MANAGEMENT SYSTEM
                </p>

                {/* ── FLOW A: SET NEW PASSWORD ── */}
                {isRecoveryState ? (
                  <div className="space-y-6 font-body">
                    
                    {/* User Profile Info Card Header */}
                    <div className="flex flex-col items-center space-y-3 pb-6 border-b border-slate-200 dark:border-white/5 mb-2">
                      <div className="w-20 h-20 rounded-full overflow-hidden bg-slate-100 dark:bg-[#13161a] border border-slate-200 dark:border-white/10 flex items-center justify-center shadow-inner relative">
                        {localAvatarUrl ? (
                          <img src={localAvatarUrl} alt="Recovery Profile" className="w-full h-full object-cover" />
                        ) : (
                          <UserIcon className="w-8 h-8 text-slate-400 dark:text-slate-500" />
                        )}
                      </div>
                      <div className="text-center">
                        <h3 className="text-sm font-heading tracking-wider uppercase text-slate-900 dark:text-slate-100">
                          {recoveryUser?.username}
                        </h3>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 select-all">
                          {recoveryUser?.email}
                        </p>
                      </div>
                    </div>

                    <form onSubmit={handleResetSubmit(onSetNewPasswordSubmit)} className="space-y-4">
                      <p className="text-center text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-bold">
                        Confirm your new password. Saving will update your access on all devices.
                      </p>

                      <Input
                        {...registerReset('password')}
                        type={showPassword ? 'text' : 'password'}
                        label="New Password"
                        icon={<Lock className="w-4 h-4 text-slate-400" />}
                        error={!!resetErrors.password}
                        touched={touchedReset.password}
                        isPopulated={!!watchNewPassword}
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

                      <Input
                        {...registerReset('confirmPassword')}
                        type={showConfirmPassword ? 'text' : 'password'}
                        label="Confirm New Password"
                        icon={<Lock className="w-4 h-4 text-slate-400" />}
                        error={!!resetErrors.confirmPassword}
                        touched={touchedReset.confirmPassword}
                        isPopulated={!!watchConfirmPassword}
                        rightElement={
                          <button
                            type="button"
                            onClick={() => setShowConfirmPassword((p) => !p)}
                            className="field-visibility-toggle cursor-pointer"
                            aria-label="Toggle password confirmation visibility"
                          >
                            {showConfirmPassword ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
                          </button>
                        }
                      />

                      {resetErrors.confirmPassword && (
                        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-[10px] text-red-500 font-mono text-center">
                          {resetErrors.confirmPassword.message}
                        </div>
                      )}

                      <Button type="submit" loading={isSubmitting} loadingLabel="UPDATING KEYS...">
                        Save Password & Exit
                      </Button>
                    </form>
                  </div>
                ) : (
                  
                  // ── FLOW B: STANDARD REQUEST LINK ──
                  <form onSubmit={handlePreRequestSubmit} className="space-y-4 font-body">
                    <p className="text-center text-xs text-slate-500 dark:text-slate-400 mb-6 leading-relaxed font-bold">
                      Enter your verified email. We will transmit a secure password-reset link [2].
                    </p>

                    <Input
                      {...registerRequest('email')}
                      type="email"
                      label="Email Address"
                      icon={<Mail className="w-4 h-4 text-slate-400" />}
                      error={!!requestErrors.email}
                      touched={touchedRequest.email}
                      isPopulated={!!watchRequestEmail}
                    />

                    {requestErrors.email && (
                      <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-[10px] text-red-500 font-mono text-center">
                        {requestErrors.email.message}
                      </div>
                    )}

                    <Button type="submit" loading={isSubmitting} loadingLabel="DISPATCHING LINK...">
                      Send Reset Instructions
                    </Button>
                  </form>
                )}
              </div>

              {/* Card Footer Actions */}
              <div className="space-y-4 mt-6 font-body">
                <div className="protocol-notice-box p-3 bg-slate-100 dark:bg-red-950/10 border border-slate-200 dark:border-[#a63429] rounded-xl text-left">
                  <div className="notice-header flex items-center gap-1.5 text-[10px] font-bold text-[#1b365d] dark:text-[#bf0202] tracking-wider mb-1 font-heading">
                    <ShieldAlert className="w-4 h-4 text-[#1b365d] dark:text-[#bf0202]" />
                    <span>VERIFICATION PROTOCOL</span>
                  </div>
                  <p className="notice-body text-[9px] text-slate-900 dark:text-slate-400 leading-relaxed font-bold">
                    This terminal resets security keys dynamically via secure tokens. Verify the origin domain of links before entering your updated credentials.
                  </p>
                </div>

                <div className="flex items-center justify-center text-xs font-bold text-slate-400">
                  <button 
                    onClick={() => navigate('/login')} 
                    className="hover:text-slate-800 dark:hover:text-white hover:underline transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    Back to System Entry
                  </button>
                </div>

                <div className="text-center text-[9px] text-slate-900 dark:text-slate-500 font-bold">
                  © {new Date().getFullYear()} WOLF PALOMAR. All Rights Reserved.
                </div>
              </div>
            </>
          )}

        </div>
      </div>

      {/* ── SUCCESS MODAL: SYSTEM TERMINATION ACCESS RESTORED ── */}
      <Modal
        isOpen={showSuccessModal}
        onClose={() => { setShowSuccessModal(false); navigate('/login', { replace: true }); }}
        title="Security Access Restored"
      >
        <div className="space-y-6 font-body text-center">
          <CheckCircle2 className="w-16 h-16 mx-auto text-emerald-500 dark:text-emerald-400 animate-bounce" />
          <div>
            <h4 className="text-sm font-bold text-slate-900 dark:text-white">Credentials Updated</h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mt-2 font-bold">
              Your password has been successfully updated. All other active system sessions on other devices have been terminated. Please log in again.
            </p>
          </div>
          <Button onClick={() => { setShowSuccessModal(false); navigate('/login', { replace: true }); }}>
            Return to Login
          </Button>
        </div>
      </Modal>

    </div>
  );
};