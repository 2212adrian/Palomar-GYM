//src/pages/system/PersonalAccount.tsx
import React, { useState, useRef, useEffect } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { supabase } from '../../lib/supabase/client';
import { logAudit } from '../../lib/supabase/audit';
import { buildAppUrl } from '../../lib/appUrl';
import { toast } from 'react-toastify';
import { isSuperAdmin } from '../../constants/auth';
import googleIcon from '../../assets/Google_Icon.webp';
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
  KeyRound,
  Link2,
  Unlink,
  Copy,
  Check,
} from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';

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
  const [isCheckingUsername, setIsCheckingUsername] = useState(false);
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);

  // Detect whether this account already has an assigned password (e.g. email/password vs Google OAuth)
  const isInitialNoPassword = React.useMemo(() => {
    if (!user) return false;
    const rawProviders = user.app_metadata?.providers;
    const singleProvider = user.app_metadata?.provider;
    const providers: string[] = Array.isArray(rawProviders)
      ? rawProviders
      : singleProvider
        ? [singleProvider]
        : [];
    const identities: any[] = user.identities || [];
    const hasEmail =
      providers.includes('email') ||
      identities.some((id: any) => id.provider === 'email');
    const isGoogle =
      providers.includes('google') ||
      identities.some((id: any) => id.provider === 'google');
    return isGoogle && !hasEmail;
  }, [user]);

  const [identities, setIdentities] = useState<any[]>(user?.identities || []);

  useEffect(() => {
    let isMounted = true;
    const fetchIdentities = async () => {
      try {
        const { data, error } = await supabase.auth.getUserIdentities();
        if (!error && data?.identities && isMounted) {
          setIdentities(data.identities);
          return;
        }
      } catch {}

      if (isMounted && user?.identities) {
        setIdentities(user.identities);
      }
    };

    fetchIdentities();
    return () => {
      isMounted = false;
    };
  }, [user]);

  const googleIdentity = React.useMemo(() => {
    if (!identities || identities.length === 0) {
      if (user?.identities) {
        return user.identities.find((id: any) => id.provider === 'google') || null;
      }
      return null;
    }
    return identities.find((id: any) => id.provider === 'google') || null;
  }, [identities, user?.identities]);

  const isGoogleLinked = React.useMemo(() => {
    if (!user) return false;
    if (googleIdentity) return true;
    const rawProviders = user.app_metadata?.providers;
    const singleProvider = user.app_metadata?.provider;
    const providers: string[] = Array.isArray(rawProviders)
      ? rawProviders
      : singleProvider
        ? [singleProvider]
        : [];
    return (
      providers.includes('google') ||
      (identities && identities.some((id: any) => id.provider === 'google'))
    );
  }, [user, googleIdentity, identities]);

  const [hasPassword, setHasPassword] = useState<boolean>(!isInitialNoPassword);

  useEffect(() => {
    let isMounted = true;
    const checkPasswordStatus = async () => {
      if (!user) return;
      try {
        const { data, error } = await supabase.rpc('check_user_has_password');
        if (!error && typeof data === 'boolean' && isMounted) {
          setHasPassword(data);
          return;
        }
      } catch {}

      if (isMounted) {
        setHasPassword(!isInitialNoPassword);
      }
    };

    checkPasswordStatus();
    return () => {
      isMounted = false;
    };
  }, [user, isInitialNoPassword]);

  useEffect(() => {
    let isMounted = true;
    const syncGoogleEmailIfNeeded = async () => {
      if (!user || !googleIdentity) return;

      const currentEmail = user.email || '';
      const googleEmail =
        googleIdentity.identity_data?.email || googleIdentity.email;

      if (!googleEmail) return;

      if (
        currentEmail.endsWith('@palomargym.noemail') ||
        (isGoogleLinked &&
          currentEmail.toLowerCase() !== googleEmail.toLowerCase() &&
          currentEmail.includes('@palomargym.noemail'))
      ) {
        try {
          const { data, error } = await supabase.rpc(
            'sync_linked_google_email'
          );
          if (!error && data?.success && data?.updated && isMounted) {
            await checkSession();
            toast.success(
              `Google account linked! Account email updated to ${data.new_email}.`
            );
            await logAudit(
              'GOOGLE_ACCOUNT_EMAIL_BOUND',
              `User bound Google account. Account email updated from "${data.old_email}" to "${data.new_email}".`,
              user.id
            );
          }
        } catch (err) {
          console.warn('Failed to sync linked Google email:', err);
        }
      }
    };

    syncGoogleEmailIfNeeded();

    return () => {
      isMounted = false;
    };
  }, [user, googleIdentity, isGoogleLinked, checkSession]);

  // Username change confirmation modal state
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [verifyPassword, setVerifyPassword] = useState('');

  // Password fields state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  // Google link/unlink state
  const [isLinkingGoogle, setIsLinkingGoogle] = useState(false);
  const [isUnlinkingGoogle, setIsUnlinkingGoogle] = useState(false);
  const [isUnlinkConfirmOpen, setIsUnlinkConfirmOpen] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState(false);

  const [isSendingResetEmail, setIsSendingResetEmail] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isToggling2FA, setIsToggling2FA] = useState(false);
  const [show2FAInfoModal, setShow2FAInfoModal] = useState(false);
  const [isDisable2FAModalOpen, setIsDisable2FAModalOpen] = useState(false);
  const [disable2FAPassword, setDisable2FAPassword] = useState('');
  const [showDisable2FAPassword, setShowDisable2FAPassword] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (profile?.username) {
      setUsername(profile.username);
    }
  }, [profile?.username]);

  const current2FAState = Boolean(
    profile?.email_verification_enabled ??
      user?.user_metadata?.email_verification_enabled ??
      false
  );
  const [is2FAEnabled, setIs2FAEnabled] = useState<boolean>(current2FAState);

  useEffect(() => {
    setIs2FAEnabled(
      Boolean(
        profile?.email_verification_enabled ??
          user?.user_metadata?.email_verification_enabled ??
          false
      )
    );
  }, [
    profile?.email_verification_enabled,
    user?.user_metadata?.email_verification_enabled,
  ]);

  const isNonEmailAccount =
    user?.email?.endsWith('@palomargym.noemail') ?? false;

  const executeToggle2FA = async (nextState: boolean) => {
    try {
      setIsToggling2FA(true);

      const { error: authError } = await supabase.auth.updateUser({
        data: { email_verification_enabled: nextState },
      });
      if (authError) throw authError;

      if (user?.id) {
        const { error: dbError } = await supabase
          .from('profiles')
          .update({ email_verification_enabled: nextState })
          .eq('id', user.id);
        if (dbError) {
          console.warn('Profiles database update note:', dbError.message);
        }
      }

      setIs2FAEnabled(nextState);

      useAuthStore.setState((state) => {
        const updatedProfile = state.profile
          ? { ...state.profile, email_verification_enabled: nextState }
          : null;
        if (updatedProfile) {
          try {
            localStorage.setItem(
              'palomar_cached_profile',
              JSON.stringify(updatedProfile)
            );
          } catch {}
        }
        return {
          user: state.user
            ? {
                ...state.user,
                user_metadata: {
                  ...state.user.user_metadata,
                  email_verification_enabled: nextState,
                },
              }
            : null,
          profile: updatedProfile,
        };
      });

      await logAudit(
        '2FA_SETTING_CHANGED',
        `User ${nextState ? 'enabled' : 'disabled'} 6-digit email verification after login.`,
        user?.id ?? undefined
      );

      await checkSession();

      toast.success(
        nextState
          ? 'Email verification after login is now ENABLED.'
          : 'Email verification after login has been DISABLED.'
      );
      setIsDisable2FAModalOpen(false);
      setDisable2FAPassword('');
      setShowDisable2FAPassword(false);
    } catch (err: any) {
      toast.error(
        err.message || 'Failed to update email verification configuration.'
      );
    } finally {
      setIsToggling2FA(false);
    }
  };

  const handleToggle2FA = async () => {
    if (isNonEmailAccount) {
      toast.warn(
        'Email verification requires a standard external email address. This account uses a local username handle.'
      );
      return;
    }

    if (is2FAEnabled) {
      setDisable2FAPassword('');
      setShowDisable2FAPassword(false);
      setIsDisable2FAModalOpen(true);
      return;
    }

    await executeToggle2FA(true);
  };

  const handleConfirmDisable2FA = async () => {
    if (hasPassword && !disable2FAPassword.trim()) {
      toast.error('Please enter your password to authorize this action.');
      return;
    }

    try {
      setIsToggling2FA(true);
      if (hasPassword) {
        const isValid = await verifyCurrentPassword(disable2FAPassword);
        if (!isValid) {
          toast.error('Authorization failed. Incorrect password.');
          return;
        }
      }

      await executeToggle2FA(false);
    } catch {
      toast.error('Authorization failed. Incorrect password.');
    } finally {
      setIsToggling2FA(false);
    }
  };

  const getRawMetadataPath = (): string | null => {
    if (!user?.user_metadata?.avatar_url) return null;
    return user.user_metadata.avatar_url;
  };

  const verifyCurrentPassword = async (password: string): Promise<boolean> => {
    try {
      const { data: isValidPassword, error: authError } = await supabase.rpc(
        'verify_user_password',
        { entered_password: password }
      );
      if (!authError && typeof isValidPassword === 'boolean') {
        return isValidPassword;
      }
    } catch {
      // Fall through to authentication check
    }

    if (user?.email) {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password,
      });
      return !signInError;
    }

    return false;
  };

  const handleCopyEmail = async () => {
    if (!user?.email) return;
    try {
      await navigator.clipboard.writeText(user.email);
      setCopiedEmail(true);
      toast.success('Email copied to clipboard');
      setTimeout(() => setCopiedEmail(false), 2000);
    } catch {
      toast.error('Failed to copy email');
    }
  };

  const handleLinkGoogle = async () => {
    try {
      setIsLinkingGoogle(true);
      const redirectUri = buildAppUrl('/system/settings?tab=personal');
      const { error } = await supabase.auth.linkIdentity({
        provider: 'google',
        options: {
          redirectTo: redirectUri,
        },
      });

      if (error) {
        if (
          error.message?.toLowerCase().includes('manual linking is disabled')
        ) {
          toast.error(
            'Manual linking is disabled in your Supabase project. Enable "Manual Linking" in Supabase Dashboard > Authentication > Advanced/Providers.'
          );
          return;
        }
        throw error;
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to initiate Google account link.');
    } finally {
      setIsLinkingGoogle(false);
    }
  };

  const handleUnlinkGoogle = async () => {
    if (!hasPassword) {
      toast.error(
        'You must set an account password first before disconnecting Google to avoid losing account access.'
      );
      return;
    }

    try {
      setIsUnlinkingGoogle(true);

      let targetIdentity = googleIdentity;
      if (!targetIdentity) {
        const { data: idData } = await supabase.auth.getUserIdentities();
        targetIdentity =
          idData?.identities?.find((id: any) => id.provider === 'google') || null;
      }

      if (!targetIdentity) {
        toast.error('Could not locate linked Google credentials to disconnect.');
        return;
      }

      const { error } = await supabase.auth.unlinkIdentity(targetIdentity);
      if (error) throw error;

      const { data: revertData, error: revertError } = await supabase.rpc(
        'revert_user_to_local_email'
      );
      if (revertError) {
        console.warn('Could not revert to local email:', revertError.message);
      }

      const newLocalEmail =
        revertData?.local_email ||
        `${profile?.username
          ?.toLowerCase()
          .replace(/[^a-z0-9]/g, '')}@palomargym.noemail`;

      await logAudit(
        'GOOGLE_ACCOUNT_UNLINKED',
        `User unlinked Google identity. Account email reverted to local handle "${newLocalEmail}".`,
        user?.id ?? undefined
      );

      const { data: updatedIdentities } = await supabase.auth.getUserIdentities();
      if (updatedIdentities?.identities) {
        setIdentities(updatedIdentities.identities);
      } else {
        setIdentities((prev) => prev.filter((id) => id.provider !== 'google'));
      }

      await checkSession();
      toast.success(
        `Google account disconnected. Login ID reverted to ${newLocalEmail}.`
      );
      setIsUnlinkConfirmOpen(false);
    } catch (err: any) {
      toast.error(err.message || 'Failed to disconnect Google account.');
    } finally {
      setIsUnlinkingGoogle(false);
    }
  };

  const handleInitiateUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUsername = username.trim();

    if (!cleanUsername) {
      toast.error('Username cannot be empty');
      return;
    }

    if (
      cleanUsername.toLowerCase() === (profile?.username || '').toLowerCase()
    ) {
      toast.info('No changes made to username.');
      return;
    }

    try {
      setIsCheckingUsername(true);

      const { data: existingUser, error: checkError } = await supabase
        .from('profiles')
        .select('id, username')
        .ilike('username', cleanUsername)
        .neq('id', user?.id || '')
        .maybeSingle();

      if (checkError) throw checkError;

      if (existingUser) {
        toast.error(
          `The username "${cleanUsername}" is already taken. Please choose another.`
        );
        return;
      }

      setVerifyPassword('');
      setIsConfirmModalOpen(true);
    } catch (err: any) {
      toast.error(err.message || 'Failed to check username availability.');
    } finally {
      setIsCheckingUsername(false);
    }
  };

  const handleConfirmUpdateProfile = async () => {
    if (hasPassword && !verifyPassword.trim()) {
      toast.error('Please enter your password to authorize this action.');
      return;
    }

    const cleanUsername = username.trim();
    if (!cleanUsername) {
      toast.error('Username cannot be empty.');
      return;
    }

    try {
      setIsUpdatingProfile(true);

      if (hasPassword) {
        const isValid = await verifyCurrentPassword(verifyPassword);
        if (!isValid) {
          toast.error('Authorization failed. Incorrect password.');
          return;
        }
      }

      const { data: existingUser } = await supabase
        .from('profiles')
        .select('id')
        .ilike('username', cleanUsername)
        .neq('id', user?.id || '')
        .maybeSingle();

      if (existingUser) {
        toast.error(
          `The username "${cleanUsername}" is already taken. Please choose another.`
        );
        setIsConfirmModalOpen(false);
        return;
      }

      const oldUsername = profile?.username || '';

      const { error: authError } = await supabase.auth.updateUser({
        data: { full_name: cleanUsername },
      });
      if (authError) throw authError;

      const { error: dbError } = await supabase
        .from('profiles')
        .update({ username: cleanUsername })
        .eq('id', user?.id);
      if (dbError) throw dbError;

      if (user?.email?.endsWith('@palomargym.noemail')) {
        await supabase.rpc('revert_user_to_local_email');
      }

      await logAudit(
        'PROFILE_UPDATED',
        `User updated display username from "${oldUsername}" to "${cleanUsername}".`,
        user?.id ?? undefined
      );

      await checkSession();
      toast.success('Username updated successfully');
      setIsConfirmModalOpen(false);
      setVerifyPassword('');
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
    if (hasPassword && !currentPassword) {
      toast.error('Please enter your current password.');
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

      // 1. Verify current password only if one was previously assigned
      if (hasPassword) {
        const isCurrentValid = await verifyCurrentPassword(currentPassword);
        if (!isCurrentValid) {
          toast.error('Incorrect current password.');
          return;
        }
      }

      // 2. Submit new password to Supabase Auth
      const updatePayload: { password: string; current_password?: string } = {
        password: newPassword,
      };
      if (hasPassword) {
        updatePayload.current_password = currentPassword;
      }

      const { error } = await supabase.auth.updateUser(updatePayload);

      if (error) {
        const errorMsg = error.message?.toLowerCase() || '';
        if (
          errorMsg.includes('current password') ||
          errorMsg.includes('reauthentication') ||
          errorMsg.includes('invalid')
        ) {
          toast.error('Incorrect current password.');
        } else {
          toast.error(error.message || 'Failed to update password');
        }
        return;
      }

      // AUDIT LOG
      await logAudit(
        hasPassword ? 'USER_PASSWORD_UPDATED' : 'USER_PASSWORD_CREATED',
        hasPassword
          ? 'User manually updated their account password.'
          : 'User created their initial account password (linked to Google account).',
        user?.id ?? undefined
      );

      setHasPassword(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setShowCurrentPassword(false);
      setShowNewPassword(false);
      setShowConfirmPassword(false);
      toast.success(
        hasPassword
          ? 'Password updated successfully'
          : 'Password created successfully! You can now sign in with either your password or Google.'
      );
    } catch (err: any) {
      toast.error(hasPassword ? 'Incorrect current password.' : 'Failed to set password.');
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

      await logAudit(
        'PASSWORD_RESET_REQUESTED',
        `User requested a password reset email dispatched to "${user.email}".`,
        user?.id ?? undefined
      );

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

      await logAudit(
        'USER_AVATAR_UPDATED',
        'User successfully updated their account profile photo.',
        user?.id ?? undefined
      );

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

      await logAudit(
        'USER_AVATAR_REMOVED',
        'User removed their account profile photo.',
        user?.id ?? undefined
      );

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

                <p className="text-[10px] text-slate-500 mt-1.5 font-mono">
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

            {/* Display Email Address */}
            <div className="pt-4 border-t border-(--border-color) space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                <span>Account Email</span>
                {isNonEmailAccount ? (
                  <span className="text-[10px] font-mono text-amber-500 lowercase font-semibold">
                    local staff id
                  </span>
                ) : (
                  <span className="text-[10px] font-mono text-slate-400 lowercase">
                    {user?.email_confirmed_at ? 'verified' : 'unconfirmed'}
                  </span>
                )}
              </label>
              <div className="flex items-center gap-2 p-2.5 bg-(--bg-page) border border-(--border-color) rounded-lg">
                <Mail className="w-4 h-4 text-slate-400 shrink-0" />
                <span className="text-xs font-mono text-(--color-text) truncate flex-1 font-medium select-all">
                  {user?.email || 'No email attached'}
                </span>
                {user?.email && (
                  <button
                    type="button"
                    onClick={handleCopyEmail}
                    className="p-1 hover:bg-(--bg-card) text-slate-400 hover:text-(--color-text) rounded transition-colors cursor-pointer shrink-0"
                    title="Copy email address"
                    aria-label="Copy email address"
                  >
                    {copiedEmail ? (
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* Display Username Form */}
            <form
              onSubmit={handleInitiateUpdateProfile}
              className="space-y-4 pt-2"
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
                  disabled={isSuperAdmin(user?.email) || isCheckingUsername}
                  className="w-full px-3 py-2.5 border border-(--border-color) rounded-lg text-sm bg-(--bg-page) text-(--color-text) outline-none focus:ring-1 focus:ring-(--color-primary) focus:border-(--color-primary) transition-all disabled:opacity-60 disabled:cursor-not-allowed font-medium"
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
                    isCheckingUsername ||
                    isUpdatingProfile ||
                    !username.trim() ||
                    username.trim() === profile?.username
                  }
                  className="w-full flex items-center justify-center px-4 py-2.5 bg-(--color-primary) hover:opacity-95 text-white rounded-lg text-xs font-heading tracking-widest uppercase transition-all disabled:opacity-50 disabled:pointer-events-none cursor-pointer border border-(--color-primary)"
                >
                  {isCheckingUsername ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" />
                      Checking availability...
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
                {hasPassword ? 'Update Credentials' : 'Set Account Password'}
              </h3>
              <p className="text-xs text-slate-400 mt-1 font-semibold">
                {hasPassword
                  ? 'Manually configure your login security passwords.'
                  : 'You currently sign in via Google. Add a password to also log in with email and password anytime.'}
              </p>
            </div>

            {/* Connected Sign-In Methods Status */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div className="p-3.5 rounded-xl border border-(--border-color) bg-(--bg-page) flex flex-col justify-between gap-3 shadow-xs">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-white dark:bg-zinc-800 border border-(--border-color) flex items-center justify-center p-1.5 shrink-0 shadow-xs">
                      <img
                        src={googleIcon}
                        alt="Google logo"
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <div className="min-w-0">
                      <span className="text-xs font-bold text-(--color-text) block leading-tight truncate">
                        Google Account
                      </span>
                      <span className="text-[10px] text-slate-400 block truncate font-mono">
                        {isGoogleLinked ? 'Connected via Google' : 'Not linked'}
                      </span>
                    </div>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase tracking-wider shrink-0 border ${
                      isGoogleLinked
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                        : 'bg-slate-500/10 text-slate-400 border-slate-500/20'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        isGoogleLinked ? 'bg-emerald-500' : 'bg-slate-400'
                      }`}
                    />
                    {isGoogleLinked ? 'Connected' : 'Disconnected'}
                  </span>
                </div>

                {isGoogleLinked ? (
                  <button
                    type="button"
                    onClick={() => {
                      setIsUnlinkConfirmOpen(true);
                    }}
                    disabled={isUnlinkingGoogle}
                    className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <Unlink className="w-3.5 h-3.5" />
                    <span>Unlink Google Account</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleLinkGoogle}
                    disabled={isLinkingGoogle}
                    className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-(--border-color) bg-(--bg-card) hover:opacity-90 text-(--color-text) text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {isLinkingGoogle ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Link2 className="w-3.5 h-3.5 text-(--color-primary)" />
                    )}
                    <span>Link Google Account</span>
                  </button>
                )}
              </div>

              <div className="p-3.5 rounded-xl border border-(--border-color) bg-(--bg-page) flex flex-col justify-between gap-3 shadow-xs">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-(--bg-input) border border-(--border-color) flex items-center justify-center shrink-0 shadow-xs text-slate-500 dark:text-slate-400">
                      <KeyRound className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-xs font-bold text-(--color-text) block leading-tight truncate">
                        Account Password
                      </span>
                      <span className="text-[10px] text-slate-400 block truncate font-mono">
                        {hasPassword ? 'Protected with password' : 'No password assigned'}
                      </span>
                    </div>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase tracking-wider shrink-0 border ${
                      hasPassword
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                        : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        hasPassword ? 'bg-emerald-500' : 'bg-amber-500'
                      }`}
                    />
                    {hasPassword ? 'Connected' : 'Not Set'}
                  </span>
                </div>

                <div className="text-[11px] text-slate-400 font-medium">
                  {hasPassword
                    ? 'Login available with email & password.'
                    : 'Set a password below to enable password login.'}
                </div>
              </div>
            </div>

            {!hasPassword && (
              <div className="p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-blue-600 dark:text-blue-400 flex items-start gap-2.5 animate-fade-in">
                <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                <span className="leading-relaxed">
                  No existing password is required because this account was created through Google. Enter a new password below to add password-based login.
                </span>
              </div>
            )}

            <form onSubmit={handleUpdatePassword} className="space-y-4">
              <div className="grid gap-4">
                {/* Current Password Field (Only shown if user already has an assigned password) */}
                {hasPassword && (
                  <div className="grid gap-1.5">
                    <label
                      htmlFor="current-password"
                      className="text-xs font-bold uppercase tracking-wider text-slate-450"
                    >
                      Current Password
                    </label>
                    <div className="relative">
                      <input
                        id="current-password"
                        type={showCurrentPassword ? 'text' : 'password'}
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        className="w-full pl-3 pr-10 py-2.5 border border-(--border-color) rounded-lg text-sm bg-(--bg-page) text-(--color-text) outline-none focus:ring-1 focus:ring-(--color-primary) focus:border-(--color-primary) transition-all"
                        placeholder="Enter current password"
                        autoComplete="current-password"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowCurrentPassword((prev) => !prev)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-(--color-text) transition-colors cursor-pointer p-1 focus:outline-none"
                        tabIndex={-1}
                        aria-label={
                          showCurrentPassword
                            ? 'Hide current password'
                            : 'Show current password'
                        }
                      >
                        {showCurrentPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {/* New Password and Confirm Password Row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* New Password Field */}
                  <div className="grid gap-1.5">
                    <label
                      htmlFor="new-password"
                      className="text-xs font-bold uppercase tracking-wider text-slate-450"
                    >
                      {hasPassword ? 'New Password' : 'Password'}
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
                      {hasPassword ? 'Confirm New Password' : 'Confirm Password'}
                    </label>
                    <div className="relative">
                      <input
                        id="confirm-password"
                        type={showConfirmPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full pl-3 pr-10 py-2.5 border border-(--border-color) rounded-lg text-sm bg-(--bg-page) text-(--color-text) outline-none focus:ring-1 focus:ring-(--color-primary) focus:border-(--color-primary) transition-all"
                        placeholder="Re-type password"
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
              </div>

              <button
                type="submit"
                disabled={
                  isUpdatingPassword ||
                  (hasPassword && !currentPassword) ||
                  !newPassword ||
                  !confirmPassword
                }
                className="w-full flex items-center justify-center px-5 py-2.5 bg-(--color-primary) hover:opacity-95 text-white rounded-lg text-xs font-heading tracking-widest uppercase transition-all disabled:opacity-50 disabled:pointer-events-none cursor-pointer border border-(--color-primary)"
              >
                {isUpdatingPassword ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" />
                    {hasPassword ? 'Updating credentials...' : 'Setting password...'}
                  </>
                ) : (
                  hasPassword ? 'Update Password' : 'Set Password'
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

      {/* Confirmation Modal: Password Verification for Username Change */}
      <Modal
        isOpen={isConfirmModalOpen}
        onClose={() => {
          if (!isUpdatingProfile) {
            setIsConfirmModalOpen(false);
            setVerifyPassword('');
          }
        }}
        title="Confirm Username Change"
      >
        <div className="space-y-4 font-body text-left">
          <div className="p-4 bg-amber-500/10 dark:bg-amber-500/5 border border-amber-500/30 rounded-xl flex items-start gap-3.5 text-xs font-bold leading-snug">
            <ShieldAlert className="w-7 h-7 sm:w-8 sm:h-8 shrink-0 text-amber-600 dark:text-amber-500 mt-0.5" />
            <div className="space-y-1">
              <span className="block font-heading tracking-wider uppercase text-[10px] text-amber-700 dark:text-amber-400 font-extrabold">
                SECURITY VERIFICATION REQUIRED
              </span>
              <span className="block text-slate-700 dark:text-slate-300 font-medium leading-relaxed">
                Updating your account username modifies your system display
                identity. Please enter your account password to authorize this
                update.
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-normal font-semibold">
              You are updating your display username:
            </p>
            <div className="flex items-center gap-2.5 text-xs text-(--color-text) font-bold bg-(--bg-page) p-3 rounded-lg border border-(--border-color)">
              <span className="text-slate-400 line-through">
                {profile?.username || 'Current'}
              </span>
              <span className="text-slate-400 font-bold">→</span>
              <span className="text-(--color-primary) dark:text-(--color-primary-light) font-semibold tracking-wide">
                {username.trim()}
              </span>
            </div>
          </div>

          {hasPassword ? (
            <div className="grid gap-1.5 pt-1">
              <label
                htmlFor="verifyUsernamePasswordInput"
                className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200 flex items-center gap-1.5"
              >
                <Lock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-500" />
                Confirm Account Password
              </label>
              <input
                id="verifyUsernamePasswordInput"
                type="password"
                disabled={isUpdatingProfile}
                placeholder="Enter your password to authorize change..."
                value={verifyPassword}
                onChange={(e) => setVerifyPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (
                    e.key === 'Enter' &&
                    verifyPassword.trim() &&
                    !isUpdatingProfile
                  ) {
                    handleConfirmUpdateProfile();
                  }
                }}
                className="w-full px-4 py-2.5 border border-(--border-color) rounded-lg text-sm bg-(--bg-page) text-(--color-text) placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-(--color-primary)/20 focus:border-(--color-primary) transition-all font-medium disabled:opacity-50"
              />
            </div>
          ) : (
            <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl text-xs text-blue-600 dark:text-blue-400 flex items-center gap-2">
              <Info className="w-4 h-4 shrink-0" />
              <span>Signed in via Google. Password verification is not required.</span>
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-2">
            <Button
              variant="secondary"
              disabled={isUpdatingProfile}
              className="w-full sm:w-auto !py-2.5 !px-5 justify-center text-xs font-heading tracking-wider"
              onClick={() => {
                setIsConfirmModalOpen(false);
                setVerifyPassword('');
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmUpdateProfile}
              loading={isUpdatingProfile}
              disabled={isUpdatingProfile || (hasPassword && !verifyPassword.trim())}
              loadingLabel="SAVING USERNAME..."
              className="w-full sm:w-auto !py-2.5 !px-5 justify-center font-heading text-xs tracking-wider uppercase shadow-md transition-colors bg-(--color-primary) hover:opacity-95 text-white cursor-pointer border-(--color-primary)"
            >
              Confirm & Save
            </Button>
          </div>
        </div>
      </Modal>

      {/* Confirmation Modal: Password Verification for Disabling 2FA */}
      <Modal
        isOpen={isDisable2FAModalOpen}
        onClose={() => {
          if (!isToggling2FA) {
            setIsDisable2FAModalOpen(false);
            setDisable2FAPassword('');
            setShowDisable2FAPassword(false);
          }
        }}
        title="Disable Email Verification"
      >
        <div className="space-y-4 font-body text-left">
          <div className="p-4 bg-rose-500/10 dark:bg-rose-500/5 border border-rose-500/30 rounded-xl flex items-start gap-3.5 text-xs font-bold leading-snug">
            <ShieldAlert className="w-7 h-7 sm:w-8 sm:h-8 shrink-0 text-rose-600 dark:text-rose-500 mt-0.5" />
            <div className="space-y-1">
              <span className="block font-heading tracking-wider uppercase text-[10px] text-rose-700 dark:text-rose-400 font-extrabold">
                SECURITY WARNING
              </span>
              <span className="block text-slate-700 dark:text-slate-300 font-medium leading-relaxed">
                Disabling email verification lowers account protection. Any sign-in will only require your password. Please enter your account password to confirm this action.
              </span>
            </div>
          </div>

          {hasPassword ? (
            <div className="grid gap-1.5 pt-1">
              <label
                htmlFor="verifyDisable2FAPasswordInput"
                className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200 flex items-center gap-1.5"
              >
                <Lock className="w-3.5 h-3.5 text-rose-600 dark:text-rose-500" />
                Confirm Account Password
              </label>
              <div className="relative">
                <input
                  id="verifyDisable2FAPasswordInput"
                  type={showDisable2FAPassword ? 'text' : 'password'}
                  disabled={isToggling2FA}
                  placeholder="Enter your current password..."
                  value={disable2FAPassword}
                  onChange={(e) => setDisable2FAPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (
                      e.key === 'Enter' &&
                      disable2FAPassword.trim() &&
                      !isToggling2FA
                    ) {
                      handleConfirmDisable2FA();
                    }
                  }}
                  className="w-full pl-4 pr-10 py-2.5 border border-(--border-color) rounded-lg text-sm bg-(--bg-page) text-(--color-text) placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition-all font-medium disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => setShowDisable2FAPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-(--color-text) transition-colors cursor-pointer p-1 focus:outline-none"
                  tabIndex={-1}
                  aria-label={
                    showDisable2FAPassword ? 'Hide password' : 'Show password'
                  }
                >
                  {showDisable2FAPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          ) : (
            <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl text-xs text-blue-600 dark:text-blue-400 flex items-center gap-2">
              <Info className="w-4 h-4 shrink-0" />
              <span>Signed in via Google. Password verification is not required.</span>
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-2">
            <Button
              variant="secondary"
              disabled={isToggling2FA}
              className="w-full sm:w-auto !py-2.5 !px-5 justify-center text-xs font-heading tracking-wider"
              onClick={() => {
                setIsDisable2FAModalOpen(false);
                setDisable2FAPassword('');
                setShowDisable2FAPassword(false);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmDisable2FA}
              loading={isToggling2FA}
              disabled={isToggling2FA || (hasPassword && !disable2FAPassword.trim())}
              loadingLabel="DISABLING..."
              className="w-full sm:w-auto !py-2.5 !px-5 justify-center font-heading text-xs tracking-wider uppercase shadow-md transition-colors bg-rose-600 hover:bg-rose-700 text-white cursor-pointer border-rose-600"
            >
              Confirm & Turn Off
            </Button>
          </div>
        </div>
      </Modal>

      {/* Unlink Google Confirmation Modal */}
      <Modal
        isOpen={isUnlinkConfirmOpen}
        onClose={() => {
          if (!isUnlinkingGoogle) {
            setIsUnlinkConfirmOpen(false);
          }
        }}
        title="Unlink Google Account"
      >
        <div className="space-y-4 font-body text-left">
          {!hasPassword ? (
            <div className="p-4 bg-rose-500/10 dark:bg-rose-500/5 border border-rose-500/30 rounded-xl flex items-start gap-3.5 text-xs font-bold leading-snug">
              <ShieldAlert className="w-7 h-7 sm:w-8 sm:h-8 shrink-0 text-rose-600 dark:text-rose-500 mt-0.5" />
              <div className="space-y-1">
                <span className="block font-heading tracking-wider uppercase text-[10px] text-rose-700 dark:text-rose-400 font-extrabold">
                  CANNOT DISCONNECT GOOGLE YET
                </span>
                <span className="block text-slate-700 dark:text-slate-300 font-medium leading-relaxed">
                  You currently have no password set on this account. If you disconnect Google now, you will lose access. Please create an account password using the form on this page first.
                </span>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="p-4 bg-amber-500/10 dark:bg-amber-500/5 border border-amber-500/30 rounded-xl flex items-start gap-3.5 text-xs font-bold leading-snug">
                <ShieldAlert className="w-7 h-7 sm:w-8 sm:h-8 shrink-0 text-amber-600 dark:text-amber-500 mt-0.5" />
                <div className="space-y-1">
                  <span className="block font-heading tracking-wider uppercase text-[10px] text-amber-700 dark:text-amber-400 font-extrabold">
                    DISCONNECT GOOGLE SIGN-IN
                  </span>
                  <span className="block text-slate-700 dark:text-slate-300 font-medium leading-relaxed">
                    You will no longer be able to log in with one-click Google Sign-In using this Google account.
                  </span>
                </div>
              </div>

              <div className="p-3 bg-(--bg-page) border border-(--border-color) rounded-xl space-y-1 text-xs">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  Login Identifier After Disconnect:
                </span>
                <span className="font-mono text-xs font-bold text-amber-600 dark:text-amber-400 block select-all">
                  {profile?.username
                    ? `${profile.username.toLowerCase().replace(/[^a-z0-9]/g, '')}@palomargym.noemail`
                    : 'username@palomargym.noemail'}
                </span>
                <p className="text-[11px] text-slate-400 font-medium mt-1">
                  Your account will revert to a local username-based account. You will log in using this identifier and your account password.
                </p>
              </div>
            </div>
          )}

          <p className="text-xs text-slate-500 dark:text-slate-400">
            You can re-link this or another Google account at any time from this page.
          </p>

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-2">
            <Button
              variant="secondary"
              disabled={isUnlinkingGoogle}
              className="w-full sm:w-auto !py-2.5 !px-5 justify-center text-xs font-heading tracking-wider"
              onClick={() => setIsUnlinkConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleUnlinkGoogle}
              loading={isUnlinkingGoogle}
              disabled={isUnlinkingGoogle || !hasPassword}
              loadingLabel="DISCONNECTING..."
              className="w-full sm:w-auto !py-2.5 !px-5 justify-center font-heading text-xs tracking-wider uppercase shadow-md transition-colors bg-red-600 hover:bg-red-700 text-white cursor-pointer border-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Confirm Disconnect
            </Button>
          </div>
        </div>
      </Modal>

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
