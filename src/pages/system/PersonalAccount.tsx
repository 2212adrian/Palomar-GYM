//src/pages/system/PersonalAccount.tsx
import React, { useState, useRef, useEffect } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { supabase } from '../../lib/supabase/client';
import { logAudit } from '../../lib/supabase/audit';
import { toast } from 'react-toastify';
import { 
  User as UserIcon, 
  Camera, 
  Trash2, 
  Loader2, 
  Mail 
} from 'lucide-react';

// Exported to be reused across other user settings components
export const AvatarImage: React.FC<{ src: string | null | undefined; className?: string; fallbackIcon?: React.ReactNode }> = ({ src, className, fallbackIcon }) => {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const resolveSrc = async () => {
      if (!src) {
        setUrl(null);
        return;
      }
      if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('blob:')) {
        setUrl(src);
        return;
      }
      const cleanPath = src.startsWith('/') ? src.slice(1) : src;
      try {
        const { data, error } = await supabase.storage
          .from('avatars')
          .createSignedUrl(cleanPath, 86400);

        if (error || !data?.signedUrl) {
          const { data: pubData } = supabase.storage.from('avatars').getPublicUrl(cleanPath);
          setUrl(pubData?.publicUrl || null);
        } else {
          setUrl(data.signedUrl);
        }
      } catch (err) {
        const { data: pubData } = supabase.storage.from('avatars').getPublicUrl(cleanPath);
        setUrl(pubData?.publicUrl || null);
      }
    };
    resolveSrc();
  }, [src]);

  if (!url) {
    return <>{fallbackIcon || <UserIcon className="w-4 h-4 text-slate-400" />}</>;
  }

  return <img src={url} alt="Profile avatar" className={className || "w-full h-full object-cover"} />;
};

// Exported image compressor utility
export const compressImage = (file: File, targetSizeBytes: number): Promise<File> => {
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

          const compressedFile = new File([blob], file.name.replace(/\.[^/.]+$/, '.jpg'), {
            type: 'image/jpeg',
            lastModified: Date.now(),
          });

          resolve(compressedFile);
        };

        executeAdaptiveCompression().catch(reject);
      };
      img.onerror = () => reject(new Error('Failed to render loaded picture template'));
    };
    reader.onerror = () => reject(new Error('Failed to read selected image data stream'));
  });
};

export const PersonalAccount: React.FC = () => {
  const { user, profile, checkSession } = useAuthStore();
  const [username, setUsername] = useState(profile?.username || '');
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [isSendingResetEmail, setIsSendingResetEmail] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isSuperAdmin = user?.email === 'wolf.palomar@gmail.com';

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
        data: { full_name: newUsername }
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
    if (!currentPassword) {
      toast.error('Please enter your current password to confirm changes.');
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
        password: newPassword
      });

      if (error) throw error;

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
        redirectTo: `${window.location.origin}/forgot-password`,
      });

      if (error) throw error;

      // ─── AUDIT LOG: Recovery Reset Email Dispatched ──────────────────────────
      await logAudit(
        'PASSWORD_RESET_REQUESTED',
        `User requested a password reset email dispatched to "${user.email}".`,
        user?.id ?? undefined
      );
      // ──────────────────────────────────────────────────────────────────────────

      toast.success(`A password reset link has been dispatched to ${user.email}`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to dispatch recovery link.');
    } finally {
      setIsSendingResetEmail(false);
    }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const maxOriginalSize = 20 * 1024 * 1024; 
    if (file.size > maxOriginalSize) {
      toast.error('File size exceeds the maximum allowed 20MB limit.');
      return;
    }

    try {
      setIsUploadingAvatar(true);
      const originalMB = (file.size / (1024 * 1024)).toFixed(2);
      
      const compressionToastId = toast.info(`Processing image of size ${originalMB} MB...`, {
        autoClose: false,
        isLoading: true,
      });

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
        console.warn('Fallback: Canvas compression failed, uploading original image.', err);
        toast.update(compressionToastId, {
          render: 'Optimization process bypassed. Uploading original picture file...',
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
        .upload(filePath, processedFile, { cacheControl: '3600', upsert: true });

      if (uploadError) {
        console.error('Upload Error Details:', uploadError);
        throw new Error('Could not upload image. Confirm that the "avatars" bucket exists.');
      }

      const { error: updateError } = await supabase.auth.updateUser({
        data: { avatar_url: filePath }
      });

      if (updateError) throw updateError;

      await supabase.from('profiles').update({ avatar_url: filePath }).eq('id', user?.id);

      if (oldAvatarPath) {
        const cleanOldPath = oldAvatarPath.includes('/avatars/') ? oldAvatarPath.split('/avatars/').pop() : oldAvatarPath;
        if (cleanOldPath) {
          const { error: deleteError } = await supabase.storage
            .from('avatars')
            .remove([cleanOldPath]);
          if (deleteError) {
            console.warn('Failed to delete old avatar file:', deleteError.message);
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
        data: { avatar_url: null }
      });

      if (updateError) throw updateError;

      await supabase.from('profiles').update({ avatar_url: null }).eq('id', user?.id);

      const cleanOldPath = oldPath.includes('/avatars/') ? oldPath.split('/avatars/').pop() : oldPath;
      if (cleanOldPath) {
        const { error: deleteError } = await supabase.storage
          .from('avatars')
          .remove([cleanOldPath]);
        if (deleteError) {
          console.warn('Failed to remove avatar from storage:', deleteError.message);
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
    <div className="space-y-6 font-body">
      <div>
        <h2 className="text-xl font-heading tracking-widest uppercase text-slate-900 dark:text-slate-100">Personal Account</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Update your identity settings and credentials.
        </p>
      </div>

      {/* Two-Column Layout Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* LEFT COLUMN: Profile Info & Email Recovery (5 Cols) */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* Avatar & Username Card */}
          <div className="bg-slate-50/30 dark:bg-neutral-900/10 border border-slate-200 dark:border-white/5 p-5 rounded-2xl space-y-5">
            <div className="flex flex-col sm:flex-row items-center gap-5">
              <div className="relative group">
                <div className="w-20 h-20 rounded-full overflow-hidden bg-slate-100 dark:bg-[#13161a] border border-slate-200 dark:border-white/10 flex items-center justify-center">
                  <AvatarImage 
                    src={profile?.avatar_url || user?.user_metadata?.avatar_url} 
                    fallbackIcon={<UserIcon className="w-8 h-8 text-slate-400 dark:text-slate-500" />} 
                  />
                </div>
                
                <button 
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingAvatar}
                  className="absolute bottom-0 right-0 p-1.5 bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white rounded-full border border-white dark:border-[#141414] shadow-md transition-colors cursor-pointer disabled:opacity-50"
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
                <h4 className="font-heading tracking-wider uppercase text-slate-900 dark:text-slate-100 text-base leading-tight">{profile?.username}</h4>
                <p className="text-xs text-[#1b365d] dark:text-[#bf0202] mt-0.5 capitalize font-bold tracking-widest">
                  {isSuperAdmin ? 'Superadmin Account' : `${profile?.role} Account`}
                </p>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 font-mono">Max size 20MB.</p>
                
                {profile?.avatar_url && (
                  <button
                    type="button"
                    onClick={handleRemoveAvatar}
                    disabled={isUploadingAvatar}
                    className="mt-2 text-xs font-semibold text-red-600 dark:text-red-500 hover:text-red-700 dark:hover:text-red-400 transition-colors inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Remove Photo
                  </button>
                )}
              </div>
            </div>

            {/* Display Username Form */}
            <form onSubmit={handleUpdateProfile} className="space-y-4 pt-5 border-t border-slate-200 dark:border-white/5">
              <div className="grid gap-1.5">
                <label htmlFor="username" className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Display Username
                </label>
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 dark:border-white/10 rounded-lg text-sm bg-white dark:bg-[#13161a] text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-1 focus:ring-slate-950 dark:focus:ring-[#bf0202] focus:border-slate-950 dark:focus:border-[#bf0202] transition-all"
                  placeholder="Enter username"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={isUpdatingProfile || username.trim() === profile?.username}
                className="w-full flex items-center justify-center px-4 py-2.5 bg-[#1b365d] dark:bg-[#bf0202] hover:opacity-95 text-white rounded-lg text-xs font-heading tracking-widest uppercase transition-all disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
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
            </form>
          </div>

          {/* Quick Password Reset Card */}
          <div className="bg-slate-50/30 dark:bg-neutral-900/10 border border-slate-200 dark:border-white/5 p-5 rounded-2xl space-y-3">
            <div>
              <h3 className="text-sm font-heading tracking-widest uppercase text-slate-900 dark:text-slate-100">Reset Password</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                Send a secure link to your email so you can easily choose a new password.
              </p>
            </div>
            <button
              type="button"
              onClick={handleSendResetEmail}
              disabled={isSendingResetEmail}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 border border-slate-300 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-neutral-800 text-slate-800 dark:text-slate-200 rounded-lg text-xs font-heading tracking-widest uppercase transition-all cursor-pointer disabled:opacity-50"
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

        {/* RIGHT COLUMN: Manual Security Credentials (7 Cols) */}
        <div className="lg:col-span-7 bg-slate-50/30 dark:bg-neutral-900/10 border border-slate-200 dark:border-white/5 p-5 rounded-2xl space-y-5">
          <div>
            <h3 className="text-sm font-heading tracking-widest uppercase text-slate-900 dark:text-slate-100">Update Credentials</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Manually configure your login security passwords.
            </p>
          </div>

          <form onSubmit={handleUpdatePassword} className="space-y-4">
            <div className="grid gap-4">
              <div className="grid gap-1.5">
                <label htmlFor="current-password" className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Current Password
                </label>
                <input
                  id="current-password"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 dark:border-white/10 rounded-lg text-sm bg-white dark:bg-[#13161a] text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-1 focus:ring-slate-950 dark:focus:ring-[#bf0202] focus:border-slate-950 dark:focus:border-[#bf0202] transition-all"
                  placeholder="Enter your current password"
                />
              </div>

              <div className="grid gap-1.5">
                <label htmlFor="new-password" className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  New Password
                </label>
                <input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 dark:border-white/10 rounded-lg text-sm bg-white dark:bg-[#13161a] text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-1 focus:ring-slate-950 dark:focus:ring-[#bf0202] focus:border-slate-950 dark:focus:border-[#bf0202] transition-all"
                  placeholder="Minimum 6 characters"
                />
              </div>

              <div className="grid gap-1.5">
                <label htmlFor="confirm-password" className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Confirm New Password
                </label>
                <input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 dark:border-white/10 rounded-lg text-sm bg-white dark:bg-[#13161a] text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-1 focus:ring-slate-950 dark:focus:ring-[#bf0202] focus:border-slate-950 dark:focus:border-[#bf0202] transition-all"
                  placeholder="Re-type new password"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isUpdatingPassword || !currentPassword || !newPassword || !confirmPassword}
              className="w-full flex items-center justify-center px-5 py-2.5 bg-[#1b365d] dark:bg-[#bf0202] hover:opacity-95 text-white rounded-lg text-xs font-heading tracking-widest uppercase transition-all disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
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

      </div>
    </div>
  );
};