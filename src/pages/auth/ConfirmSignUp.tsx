//src/pages/auth/ConfirmSignUp.tsx
import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, CheckCircle2, ShieldAlert, User as UserIcon, Loader2 } from 'lucide-react';
import { toast } from 'react-toastify';
import { supabase } from '../../lib/supabase/client';
import { useAuthStore } from '../../stores/authStore';

// UI components
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Modal } from '../../components/ui/Modal';

const confirmSchema = z.object({
  password: z.string().min(6, { message: 'Password must be at least 6 characters' }).optional().or(z.literal('')),
  confirmPassword: z.string().optional().or(z.literal('')),
}).refine((data) => {
  if (data.password && data.password !== data.confirmPassword) {
    return false;
  }
  return true;
}, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

type ConfirmFormValues = z.infer<typeof confirmSchema>;

export const ConfirmSignUp: React.FC = () => {
  const navigate = useNavigate();
  const { user, profile, checkSession, logout, initialized } = useAuthStore() as any;
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [showSuccessModal, setShowSuccessModal] = useState<boolean>(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<ConfirmFormValues>({
    resolver: zodResolver(confirmSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  const watchPassword = watch('password');
  const watchConfirmPassword = watch('confirmPassword');

  // Sync session state on mount to ensure background URL parsing has completed
  useEffect(() => {
    checkSession();
  }, [checkSession]);

  // Secure Lock: Prevent active logged-in users from manually bypassing page controls
  useEffect(() => {
    if (!initialized) return;

    // Only redirect if they are logged in under a fully activated 'active' account
    if (user && profile?.status === 'active') {
      const targetRoute = profile?.role === 'staff' ? '/sales/register' : '/dashboard';
      navigate(targetRoute, { replace: true });
    }
  }, [initialized, user, profile, navigate]);

  const onConfirmSubmit = async (data: ConfirmFormValues) => {
    if (!user) return;
    setIsSubmitting(true);

    try {
      // 1. If password was provided, update their auth credentials
      if (data.password && data.password.trim() !== '') {
        const { error: passwordError } = await supabase.auth.updateUser({
          password: data.password.trim()
        });
        if (passwordError) throw passwordError;
      }

      // 2. Set account status to active inside the profiles table
      const { error: dbError } = await supabase
        .from('profiles')
        .update({ status: 'active' })
        .eq('id', user.id);

      if (dbError) throw dbError;

      // 3. Clear transient stores, sign out, and trigger completion modal
      await logout();
      setShowSuccessModal(true);
    } catch (err: any) {
      toast.error(err.message || 'Failed to complete registration.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!initialized) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-white dark:bg-[#0f1012] select-none font-sans text-slate-900 dark:text-slate-100 font-body">
        <Loader2 className="w-8 h-8 animate-spin text-[#1b365d] dark:text-[#bf0202]" />
        <p className="text-xs font-heading tracking-widest text-slate-500 dark:text-slate-400 uppercase mt-4">
          Verifying Account...
        </p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-white dark:bg-[#0f1012] p-4 text-center font-sans text-slate-900 dark:text-slate-100 font-body select-none">
        <Card>
          <div className="p-8 space-y-4 max-w-sm">
            <h3 className="text-lg font-heading text-red-500 uppercase tracking-wider">Verification Expired</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-normal font-bold">
              This verification link has already been used, is invalid, or has expired. Please request a new registration link from your administrator.
            </p>
            <Button onClick={() => navigate('/login')}>Return to Login</Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="relative w-full h-screen overflow-hidden bg-white dark:bg-[#0f1012] flex items-center justify-center p-4 text-slate-900 dark:text-slate-100 font-body select-none">
      <Card>
        <div className="flex flex-col justify-between h-full bg-transparent p-6 lg:bg-neutral-50/95 lg:dark:bg-[#141414]/95 lg:border lg:border-slate-200 lg:dark:border-white/5 lg:p-8 lg:rounded-4xl lg:shadow-2xl">
          
          <div>
            <div className="text-center brand text-2xl font-heading tracking-[0.08em] mb-1 text-slate-900 dark:text-white">
              CONFIRM SIGNUP
            </div>
            <p className="text-center font-heading text-[10px] tracking-[2.4px] text-[#1b365d] dark:text-blue-400 uppercase opacity-90 mb-6">
              GYM MANAGEMENT SYSTEM
            </p>

            <div className="flex flex-col items-center gap-3 mb-6 bg-slate-100 dark:bg-neutral-900/40 p-4 border border-slate-200 dark:border-white/5 rounded-2xl">
              <div className="w-12 h-12 rounded-full overflow-hidden bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-xs">
                <UserIcon className="w-5 h-5 text-slate-400" />
              </div>
              <div className="text-center">
                <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                  {profile?.username || 'User'}
                </h4>
                <p className="text-[10px] font-mono text-slate-400 mt-0.5">{user?.email}</p>
              </div>
            </div>

            <form onSubmit={handleSubmit(onConfirmSubmit)} className="space-y-4">
              <p className="text-center text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-bold">
                Activate your account. You can optionally set a new secure password below, or leave it blank to maintain your current keys.
              </p>

              <Input
                {...register('password')}
                type={showPassword ? 'text' : 'password'}
                label="Choose Password (Optional)"
                error={!!errors.password}
                isPopulated={!!watchPassword}
              />

              <Input
                {...register('confirmPassword')}
                type={showPassword ? 'text' : 'password'}
                label="Confirm Password"
                error={!!errors.confirmPassword}
                isPopulated={!!watchConfirmPassword}
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

              {errors.confirmPassword && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-[10px] text-red-500 font-mono text-center">
                  {errors.confirmPassword.message}
                </div>
              )}

              <Button type="submit" loading={isSubmitting} loadingLabel="ACTIVATING...">
                Activate & Finish Signup
              </Button>
            </form>
          </div>

          <div className="space-y-4 mt-6">
            <div className="protocol-notice-box p-3 bg-slate-100 dark:bg-red-950/10 border border-slate-200 dark:border-[#a63429] rounded-xl text-left">
              <div className="notice-header flex items-center gap-1.5 text-[10px] font-bold text-[#1b365d] dark:text-[#bf0202] tracking-wider mb-1 font-heading">
                <ShieldAlert className="w-4 h-4 text-[#1b365d] dark:text-[#bf0202]" />
                <span>ACTIVATION PROTOCOL</span>
              </div>
              <p className="notice-body text-[9px] text-slate-900 dark:text-slate-400 leading-relaxed font-bold">
                Confirming this page will permanently activate your registration. You will be redirected to the login panel to enter the system.
              </p>
            </div>
            <button
              type="button"
              onClick={async () => {
                await logout();
                navigate('/login', { replace: true });
              }}
              className="w-full text-center text-xs font-bold text-slate-500 hover:text-slate-800 dark:hover:text-white transition-all cursor-pointer"
            >
              Cancel & Return to Login
            </button>
          </div>

        </div>
      </Card>

      {/* SUCCESS MODAL */}
      <Modal
        isOpen={showSuccessModal}
        onClose={() => { setShowSuccessModal(false); navigate('/login', { replace: true }); }}
        title="Account Activated!"
      >
        <div className="space-y-6 font-body text-center animate-slide-up">
          <CheckCircle2 className="w-16 h-16 mx-auto text-emerald-500 dark:text-emerald-400 animate-bounce" />
          <div>
            <h4 className="text-sm font-bold text-slate-900 dark:text-white">Registration Complete</h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mt-2 font-bold text-center">
              Your account has been successfully verified and activated. Please log in using your newly configured credentials.
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