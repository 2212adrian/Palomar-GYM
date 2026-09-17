//src/pages/system/PersonalAccount.tsx
import React, { useState, useRef, useEffect } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { supabase } from '../../lib/supabase/client';
import { logAudit } from '../../lib/supabase/audit';
import { buildAppUrl } from '../../lib/appUrl';
import { toast } from 'react-toastify';
import { isSuperAdmin } from '../../constants/auth';
import {
  User as UserIcon,
  Camera,
  Trash2,
  Loader2,
  Mail,
  ShieldCheck,
  ShieldAlert,
  Lock,
  Info,
  Eye,
  EyeOff,
} from 'lucide-react';
import { Modal } from '../../components/ui/Modal';

// Exported to be reused across other user settings components
export const AvatarImage: React.FC<{
  src: string | null | undefined;
  className?: string;
  fallbackIcon?: React.ReactNode;
}> = ({ src, className, fallbackIcon }) => {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const resolveSrc = async () => {
      if (!src) {
        setUrl(null);
        return;
      }
      if (
        src.startsWith('http://') ||
        src.startsWith('https://') ||
        src.startsWith('blob:')
      ) {
        setUrl(src);
        return;
      }
      const cleanPath = src.startsWith('/') ? src.slice(1) : src;
      try {
        const { data, error } = await supabase.storage
          .from('avatars')
          .createSignedUrl(cleanPath, 86400);

        if (error || !data?.signedUrl) {
          const { data: pubData } = supabase.storage
            .from('avatars')
            .getPublicUrl(cleanPath);
          setUrl(pubData?.publicUrl || null);
        } else {
          setUrl(data.signedUrl);
        }
      } catch (err) {
        const { data: pubData } = supabase.storage
          .from('avatars')
          .getPublicUrl(cleanPath);
        setUrl(pubData?.publicUrl || null);
      }
    };
    resolveSrc();
  }, [src]);

  if (!url) {
    return (
      <>{fallbackIcon || <UserIcon className="w-4 h-4 text-slate-400" />}</>
    );
  }

  return (
    <img
      src={url}
      alt="Profile avatar"
      className={className || 'w-full h-full object-cover'}
    />
  );
};

// Exported image compressor utility
export const compressImage = (
  file: File,
  targetSizeBytes: number
): Promise<File> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        const maxDimension = 1000;
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to parse 2D canvas configuration context'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);

        const getBlobAtQuality = (quality: number): Promise<Blob> => {
          return new Promise((resolveBlob) => {
            canvas.toBlob(
              (blob) => {
                if (blob) resolveBlob(blob);
              },
              'image/jpeg',
              quality
            );
          });
        };

        const executeAdaptiveCompression = async () => {
          let currentQuality = 0.85;
          let blob = await getBlobAtQuality(currentQuality);

          if (blob.size > targetSizeBytes) {
            currentQuality = 0.6;
            blob = await getBlobAtQuality(currentQuality);
          }
          if (blob.size > targetSizeBytes) {
            currentQuality = 0.35;
            blob = await getBlobAtQuality(currentQuality);
          }

          const compressedFile = new File(
            [blob],
            file.name.replace(/\.[^/.]+$/, '.jpg'),
            {
              type: 'image/jpeg',
              lastModified: Date.now(),
            }
          );

          resolve(compressedFile);
        };

        executeAdaptiveCompression().catch(reject);
      };
      img.onerror = () =>
        reject(new Error('Failed to render loaded picture template'));
    };
    reader.onerror = () =>
      reject(new Error('Failed to read selected image data stream'));
  });
};

export const PersonalAccount: React.FC = () => {
  const { user, profile, checkSession } = useAuthStore();
  const [username, setUsername] = useState(profile?.username || '');
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);

  // Password fields state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  const [isSendingResetEmail, setIsSendingResetEmail] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isToggling2FA, setIsToggling2FA] = useState(false);
  const [show2FAInfoModal, setShow2FAInfoModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const is2FAEnabled =
    profile?.email_verification_enabled ??
    user?.user_metadata?.email_verification_enabled ??
    false;
  const isNonEmailAccount =
    user?.email?.endsWith('@palomargym.noemail') ?? false;

  const handleToggle2FA = async () => {
    if (isNonEmailAccount) {
      toast.warn(
        'Email verification requires a standard external email address. This account uses a local username handle.'
      );
      return;
    }

    const nextState = !is2FAEnabled;
    try {
      setIsToggling2FA(true);

      // 1. Persist to Supabase Auth user metadata
      const { error: authError } = await supabase.auth.updateUser({
        data: { email_verification_enabled: nextState },
      });
      if (authError) throw authError;

      // 2. Persist to public.profiles table
      if (user?.id) {
        const { error: dbError } = await supabase
          .from('profiles')
          .update({ email_verification_enabled: nextState })
          .eq('id', user.id);
        if (dbError) {
          console.warn('Profiles database update note:', dbError.message);
        }
      }

      // 3. Log Audit trail
      await logAudit(
        '2FA_SETTING_CHANGED',
        `User ${nextState ? 'enabled' : 'disabled'} 6-digit email verification after login.`,
        user?.id ?? undefined
      );

      // 4. Synchronize active state
      await checkSession();

      toast.success(
        nextState
          ? 'Email verification after login is now ENABLED.'
          : 'Email verification after login has been DISABLED.'
      );
    } catch (err: any) {
      toast.error(
        err.message || 'Failed to update email verification configuration.'
      );
    } finally {
      setIsToggling2FA(false);
    }
  };

  const getRawMetadataPath = (): string | null => {
    if (!user?.user_metadata?.avatar_url) return null;
    return user.user_metadata.avatar_url;
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      toast.error('Username cannot be empty');
      return;
    }

    try {
      setIsUpdatingProfile(true);
      const oldUsername = profile?.username || '';
      const newUsername = username.trim();

      const { error: authError } = await supabase.auth.updateUser({
        data: { full_name: newUsername },
      });
      if (authError) throw authError;

      const { error: dbError } = await supabase
        .from('profiles')
        .update({ username: newUsername })
        .eq('id', user?.id);
      if (dbError) throw dbError;

      // ─── AUDIT LOG: Display Username Updated ─────────────────────────────────
      await logAudit(
        'PROFILE_UPDATED',
        `User updated display username from "${oldUsername}" to "${newUsername}".`,
        user?.id ?? undefined
      );
      // ──────────────────────────────────────────────────────────────────────────

      await checkSession();
      toast.success('Username updated successfully');
    } catch (err: any) {
      toast.error(err.message || 'Failed to update username');
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user?.email) {
      toast.error('No email address detected on this session.');
      return;
    }
    if (!newPassword || !confirmPassword) {
      toast.error('Please fill in all password fields.');
      return;
    }
    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match.');
      return;
    }

    try {
      setIsUpdatingPassword(true);

      const { error } = await supabase.auth.updateUser({
        password: newPassword,
        current_password: currentPassword,
      });

      if (error) {
        toast.error(error.message || 'Failed to update password');
        return;
      }

      // ─── AUDIT LOG: Manual Password Update ───────────────────────────────────
      await logAudit(
        'USER_PASSWORD_UPDATED',
        'User manually updated their account password.',
        user?.id ?? undefined
      );
      // ──────────────────────────────────────────────────────────────────────────

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setShowCurrentPassword(false);
      setShowNewPassword(false);
      setShowConfirmPassword(false);
      toast.success('Password updated successfully');
    } catch (err: any) {
      toast.error(err.message || 'Failed to update password');
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const handleSendResetEmail = async () => {
    if (!user?.email) {
      toast.error('No email address detected on this session.');
      return;
    }

    try {
      setIsSendingResetEmail(true);
      const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: buildAppUrl('/forgot-password'),
      });

      if (error) throw error;

      // ─── AUDIT LOG: Recovery Reset Email Dispatched ──────────────────────────
      await logAudit(
        'PASSWORD_RESET_REQUESTED',
        `User requested a password reset email dispatched to "${user.email}".`,
        user?.id ?? undefined
      );
      // ──────────────────────────────────────────────────────────────────────────

      toast.success(
        `A password reset link has been dispatched to ${user.email}`
      );
    } catch (err: any) {
      toast.error(err.message || 'Failed to dispatch recovery link.');
    } finally {
      setIsSendingResetEmail(false);
    }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const maxOriginalSize = 8 * 1024 * 1024;
    if (file.size > maxOriginalSize) {
      toast.error('File size exceeds the maximum allowed 8MB limit.');
      return;
    }

    try {
      setIsUploadingAvatar(true);
      const originalMB = (file.size / (1024 * 1024)).toFixed(2);

      const compressionToastId = toast.info(
        `Processing image of size ${originalMB} MB...`,
        {
          autoClose: false,
          isLoading: true,
        }
      );

      let processedFile = file;
      const targetSizingBytes = 100 * 1024;

      try {
        processedFile = await compressImage(file, targetSizingBytes);
        const processedSizeKB = (processedFile.size / 1024).toFixed(0);

        toast.update(compressionToastId, {
          render: `Optimized! Compressed from ${originalMB} MB down to ${processedSizeKB} KB.`,
          type: 'success',
          isLoading: false,
          autoClose: 3500,
        });
      } catch (err) {
        console.warn(
          'Fallback: Canvas compression failed, uploading original image.',
          err
        );
        toast.update(compressionToastId, {
          render:
            'Optimization process bypassed. Uploading original picture file...',
          type: 'warning',
          isLoading: false,
          autoClose: 2000,
        });
      }

      const fileExt = processedFile.name.split('.').pop() || 'jpg';
      const fileName = `avatar-${Date.now()}.${fileExt}`;
      const filePath = `${user?.id}/${fileName}`;

      const oldAvatarPath = getRawMetadataPath();

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, processedFile, {
          cacheControl: '3600',
          upsert: true,
        });

      if (uploadError) {
        console.error('Upload Error Details:', uploadError);
        throw new Error(
          'Could not upload image. Confirm that the "avatars" bucket exists.'
        );
      }

      const { error: updateError } = await supabase.auth.updateUser({
        data: { avatar_url: filePath },
      });

      if (updateError) throw updateError;

      await supabase
        .from('profiles')
        .update({ avatar_url: filePath })
        .eq('id', user?.id);

      if (oldAvatarPath) {
        const cleanOldPath = oldAvatarPath.includes('/avatars/')
          ? oldAvatarPath.split('/avatars/').pop()
          : oldAvatarPath;
        if (cleanOldPath) {
          const { error: deleteError } = await supabase.storage
            .from('avatars')
            .remove([cleanOldPath]);
          if (deleteError) {
            console.warn(
              'Failed to delete old avatar file:',
              deleteError.message
            );
          }
        }
      }

      // ─── AUDIT LOG: Avatar Photo Uploaded ────────────────────────────────────
      await logAudit(
        'USER_AVATAR_UPDATED',
        'User successfully updated their account profile photo.',
        user?.id ?? undefined
      );
      // ──────────────────────────────────────────────────────────────────────────

      await checkSession();
      toast.success('Profile avatar updated successfully!');
    } catch (err: any) {
      toast.error(err.message || 'Failed to update profile picture');
    } finally {
      setIsUploadingAvatar(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemoveAvatar = async () => {
    const oldPath = getRawMetadataPath();
    if (!oldPath) return;

    try {
      setIsUploadingAvatar(true);

      const { error: updateError } = await supabase.auth.updateUser({
        data: { avatar_url: null },
      });

      if (updateError) throw updateError;

      await supabase
        .from('profiles')
        .update({ avatar_url: null })
        .eq('id', user?.id);

      const cleanOldPath = oldPath.includes('/avatars/')
        ? oldPath.split('/avatars/').pop()
        : oldPath;
      if (cleanOldPath) {
        const { error: deleteError } = await supabase.storage
          .from('avatars')
          .remove([cleanOldPath]);
        if (deleteError) {
          console.warn(
            'Failed to remove avatar from storage:',
            deleteError.message
          );
        }
      }

      // ─── AUDIT LOG: Avatar Photo Removed ─────────────────────────────────────
      await logAudit(
        'USER_AVATAR_REMOVED',
        'User removed their account profile photo.',
        user?.id ?? undefined
      );
      // ──────────────────────────────────────────────────────────────────────────

      await checkSession();
      toast.success('Profile picture removed');
    } catch (err: any) {
      toast.error(err.message || 'Failed to remove profile picture');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  return (
    <div className="space-y-6 font-body text-(--color-text)">
      <div>
        <h2 className="text-xl font-heading tracking-widest uppercase text-(--color-text)">
          Personal Account
        </h2>
        <p className="text-sm text-slate-400 mt-1 font-medium">
          Update your identity settings and credentials.
        </p>
      </div>

      {/* Two-Column Layout Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: Profile Info & Email Recovery (5 Cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Avatar & Username Card */}
          <div className="bg-(--bg-card) border border-(--border-color) p-5 rounded-2xl space-y-5">
            <div className="flex flex-col sm:flex-row items-center gap-5">
              <div className="relative group">
                <div className="w-20 h-20 rounded-full overflow-hidden bg-(--bg-page) border border-(--border-color) flex items-center justify-center">
                  <AvatarImage
                    src={profile?.avatar_url || user?.user_metadata?.avatar_url}
                    fallbackIcon={
                      <UserIcon className="w-8 h-8 text-slate-500" />
                    }
                  />
                </div>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingAvatar}
                  className="absolute bottom-0 right-0 p-1.5 bg-(--color-primary) hover:opacity-90 text-white rounded-full border border-(--border-color) shadow-md transition-colors cursor-pointer disabled:opacity-50"
                  title="Change profile photo"
                  aria-label="Change profile photo"
                >
                  {isUploadingAvatar ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Camera className="w-3.5 h-3.5" />
                  )}
                </button>

                <input
                  type="file"
                  id="avatar-upload"
                  ref={fileInputRef}
                  onChange={handleAvatarChange}
                  className="hidden"
                  accept="image/*"
                  title="Upload profile photo file"
                  aria-label="Upload profile photo file"
                />
              </div>

              <div className="text-center sm:text-left flex flex-col items-center sm:items-start">
                <h4 className="font-heading tracking-wider uppercase text-(--color-text) text-base leading-tight">
                  {profile?.username}
                </h4>
                <p className="text-xs text-(--color-primary-light) mt-0.5 capitalize font-bold tracking-widest">
                  {isSuperAdmin(user?.email)
                    ? 'Superadmin Account'
                    : `${profile?.role} Account`}
                </p>
                <p className="text-[10px] text-slate-500 mt-1 font-mono">
                  Max size 8MB.
                </p>

                {profile?.avatar_url && (
                  <button
                    type="button"
                    onClick={handleRemoveAvatar}
                    disabled={isUploadingAvatar}
                    className="mt-2 text-xs font-semibold text-red-500 hover:text-red-400 transition-colors inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Remove Photo
                  </button>
                )}
              </div>
            </div>

            {/* Display Username Form */}
            <form
              onSubmit={handleUpdateProfile}
              className="space-y-4 pt-5 border-t border-(--border-color)"
            >
              <div className="grid gap-1.5">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="username"
                    className="text-xs font-bold uppercase tracking-wider text-slate-400"
                  >
                    Display Username
                  </label>
                  {isSuperAdmin(user?.email) && (
                    <span className="text-[10px] text-amber-500 font-medium">
                      Locked
                    </span>
                  )}
                </div>
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={isSuperAdmin(user?.email)}
                  className="w-full px-3 py-2.5 border border-(--border-color) rounded-lg text-sm bg-(--bg-page) text-(--color-text) outline-none focus:ring-1 focus:ring-(--color-primary) focus:border-(--color-primary) transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                  placeholder="Enter username"
                  required
                />
                {isSuperAdmin(user?.email) && (
                  <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                    Superadmin username is permanently locked and cannot be
                    changed.
                  </p>
                )}
              </div>
              {!isSuperAdmin(user?.email) && (
                <button
                  type="submit"
                  disabled={
                    isUpdatingProfile || username.trim() === profile?.username
                  }
                  className="w-full flex items-center justify-center px-4 py-2.5 bg-(--color-primary) hover:opacity-95 text-white rounded-lg text-xs font-heading tracking-widest uppercase transition-all disabled:opacity-50 disabled:pointer-events-none cursor-pointer border border-(--color-primary)"
                >
                  {isUpdatingProfile ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" />
                      Saving changes...
                    </>
                  ) : (
                    'Save Username'
                  )}
                </button>
              )}
            </form>
          </div>

          {/* Quick Password Reset Card */}
          <div className="bg-(--bg-card) border border-(--border-color) p-5 rounded-2xl space-y-3">
            <div>
              <h3 className="text-sm font-heading tracking-widest uppercase text-(--color-text)">
                Reset Password
              </h3>
              <p className="text-xs text-slate-450 mt-1 leading-relaxed font-semibold">
                Send a secure link to your email so you can easily choose a new
                password.
              </p>
            </div>
            <button
              type="button"
              onClick={handleSendResetEmail}
              disabled={isSendingResetEmail}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 border border-(--border-color) bg-(--bg-input) text-(--color-text) opacity-90 hover:opacity-100 rounded-lg text-xs font-heading tracking-widest uppercase transition-all cursor-pointer disabled:opacity-50"
            >
              {isSendingResetEmail ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Mail className="w-3.5 h-3.5" />
              )}
              <span>Email Me a Reset Link</span>
            </button>
          </div>
        </div>

        {/* RIGHT COLUMN: Manual Security Credentials & Email Verification (7 Cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Update Credentials Card */}
          <div className="bg-(--bg-card) border border-(--border-color) p-5 rounded-2xl space-y-5">
            <div>
              <h3 className="text-sm font-heading tracking-widest uppercase text-(--color-text)">
                Update Credentials
              </h3>
              <p className="text-xs text-slate-400 mt-1 font-semibold">
                Manually configure your login security passwords.
              </p>
            </div>

            <form onSubmit={handleUpdatePassword} className="space-y-4">
              <div className="grid gap-4">
                {/* New Password Field */}
                <div className="grid gap-1.5">
                  <label
                    htmlFor="new-password"
                    className="text-xs font-bold uppercase tracking-wider text-slate-450"
                  >
                    New Password
                  </label>
                  <div className="relative">
                    <input
                      id="new-password"
                      type={showNewPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full pl-3 pr-10 py-2.5 border border-(--border-color) rounded-lg text-sm bg-(--bg-page) text-(--color-text) outline-none focus:ring-1 focus:ring-(--color-primary) focus:border-(--color-primary) transition-all"
                      placeholder="Minimum 6 characters"
                      autoComplete="new-password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword((prev) => !prev)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-(--color-text) transition-colors cursor-pointer p-1 focus:outline-none"
                      tabIndex={-1}
                      aria-label={
                        showNewPassword ? 'Hide password' : 'Show password'
                      }
                    >
                      {showNewPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Confirm New Password Field */}
                <div className="grid gap-1.5">
                  <label
                    htmlFor="confirm-password"
                    className="text-xs font-bold uppercase tracking-wider text-slate-450"
                  >
                    Confirm New Password
                  </label>
                  <div className="relative">
                    <input
                      id="confirm-password"
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full pl-3 pr-10 py-2.5 border border-(--border-color) rounded-lg text-sm bg-(--bg-page) text-(--color-text) outline-none focus:ring-1 focus:ring-(--color-primary) focus:border-(--color-primary) transition-all"
                      placeholder="Re-type new password"
                      autoComplete="new-password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((prev) => !prev)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-(--color-text) transition-colors cursor-pointer p-1 focus:outline-none"
                      tabIndex={-1}
                      aria-label={
                        showConfirmPassword ? 'Hide password' : 'Show password'
                      }
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={
                  isUpdatingPassword || !newPassword || !confirmPassword
                }
                className="w-full flex items-center justify-center px-5 py-2.5 bg-(--color-primary) hover:opacity-95 text-white rounded-lg text-xs font-heading tracking-widest uppercase transition-all disabled:opacity-50 disabled:pointer-events-none cursor-pointer border border-(--color-primary)"
              >
                {isUpdatingPassword ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" />
                    Updating credentials...
                  </>
                ) : (
                  'Update Password'
                )}
              </button>
            </form>
          </div>

          {/* Email Verification Switch Card */}
          <div className="bg-(--bg-card) border border-(--border-color) p-5 rounded-2xl">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-heading tracking-widest uppercase text-(--color-text)">
                  Email Verification
                </h3>
                <button
                  type="button"
                  onClick={() => setShow2FAInfoModal(true)}
                  className="text-slate-400 hover:text-(--color-primary) transition-colors cursor-pointer"
                  title="How verification protects your account"
                >
                  <Info className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Toggle Switch */}
              <button
                type="button"
                role="switch"
                aria-checked={is2FAEnabled}
                onClick={handleToggle2FA}
                disabled={isToggling2FA || isNonEmailAccount}
                title={
                  isNonEmailAccount
                    ? 'Requires external email address'
                    : is2FAEnabled
                      ? 'Click to disable'
                      : 'Click to enable'
                }
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${
                  is2FAEnabled
                    ? 'bg-emerald-500'
                    : 'bg-slate-300 dark:bg-neutral-700'
                }`}
              >
                {isToggling2FA ? (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <Loader2 className="w-3 h-3 text-white animate-spin" />
                  </span>
                ) : (
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      is2FAEnabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                )}
              </button>
            </div>

            {/* Explanation ONLY shown when enabled */}
            {is2FAEnabled && (
              <div className="mt-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-600 dark:text-emerald-400 flex items-start gap-2.5 animate-fade-in">
                <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <p className="font-semibold text-(--color-text)">
                    Two-step email verification is active.
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                    A secure verification code will be sent to{' '}
                    <span className="font-mono font-bold text-(--color-text)">
                      {user?.email}
                    </span>{' '}
                    whenever you sign in.
                  </p>
                </div>
              </div>
            )}

            {isNonEmailAccount && (
              <div className="mt-3 flex items-start gap-2 p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-[11px] text-amber-600 dark:text-amber-400 font-medium leading-normal">
                <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>
                  This account has no external email address attached. Add an
                  email to enable 2-step verification.
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 2FA Info Modal */}
      <Modal
        isOpen={show2FAInfoModal}
        onClose={() => setShow2FAInfoModal(false)}
        title="Email Verification Security"
      >
        <div className="text-left space-y-4 font-body text-xs text-slate-600 dark:text-slate-300">
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-600 dark:text-emerald-400 flex items-start gap-2.5">
            <Lock className="w-4 h-4 shrink-0 mt-0.5 text-emerald-500" />
            <span>
              Two-step verification adds an extra layer of defense against
              unauthorized logins by requiring access to your email inbox.
            </span>
          </div>

          <div className="space-y-2">
            <h4 className="font-bold text-xs uppercase tracking-wider text-(--color-text)">
              How it works
            </h4>
            <ul className="space-y-2 text-slate-500 dark:text-slate-400 list-disc list-inside">
              <li>
                When you sign in with your password, the system dispatches a
                verification code to your registered email address.
              </li>
              <li>Codes are single-use and expire in 10 minutes.</li>
              <li>
                5 consecutive incorrect attempts will trigger an automatic
                security lockout.
              </li>
            </ul>
          </div>

          <div className="pt-2">
            <button
              type="button"
              onClick={() => setShow2FAInfoModal(false)}
              className="w-full py-2.5 bg-(--bg-input) text-(--color-text) rounded-xl font-heading text-xs uppercase tracking-wider hover:opacity-90 transition-all cursor-pointer text-center"
            >
              Close
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
