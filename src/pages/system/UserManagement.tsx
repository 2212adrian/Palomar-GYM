// src/pages/system/UserManagement.tsx
import React, { useState, useRef, useEffect } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { supabase } from '../../lib/supabase/client';
import { logAudit } from '../../lib/supabase/audit';
import { useResponsiveItemsPerPage } from '../../lib/useResponsiveItemsPerPage';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Table } from '../../components/ui/Table';
import type { Column } from '../../components/ui/Table';
import { toast } from 'react-toastify';
import { AvatarImage, compressImage } from './PersonalAccount';
import { SUPERADMIN_EMAIL } from '../../constants/auth';
import { buildAppUrl } from '../../lib/appUrl';
import {
  Loader2,
  Trash2,
  ShieldAlert,
  Edit3,
  KeyRound,
  ShieldCheck,
  Camera,
  User,
  Mail,
  UserCheck,
} from 'lucide-react';

interface DraftChange {
  role?: 'admin' | 'staff';
  status?: 'active' | 'inactive';
}

export const UserManagement: React.FC = () => {
  const { user, profile } = useAuthStore();
  const userRole = profile?.role || user?.app_metadata?.role || 'staff';

  // ─── Superadmin identity resolution (Pure ENV / Constant fallback) ──────
  const superAdminEmail = (
    import.meta.env.VITE_SUPERADMIN_EMAIL || SUPERADMIN_EMAIL
  )
    .trim()
    .toLowerCase();

  const viewerEmail = (user?.email || '').trim().toLowerCase();
  const viewerIsSuperAdmin = Boolean(
    viewerEmail && viewerEmail === superAdminEmail
  );

  const isAdmin = userRole === 'admin' || viewerIsSuperAdmin;

  // Profiles list directories state
  const [usersList, setUsersList] = useState<any[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [isDeletingUser, setIsDeletingUser] = useState<string | null>(null);
  const [isSendingReset, setIsSendingReset] = useState<string | null>(null);

  // Edit User Profile (Username & Avatar) Modal states
  const [isEditProfileModalOpen, setIsEditProfileModalOpen] = useState(false);
  const [editTargetUser, setEditTargetUser] = useState<any | null>(null);
  const [editUsername, setEditUsername] = useState('');
  const [editAvatarFile, setEditAvatarFile] = useState<File | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [removeExistingAvatar, setRemoveExistingAvatar] = useState(false);
  const [isSavingUser, setIsSavingUser] = useState(false);
  const editFileInputRef = useRef<HTMLInputElement>(null);

  // Local draft changes state
  const [drafts, setDrafts] = useState<Record<string, DraftChange>>({});
  const [isSaving, setIsSaving] = useState(false);

  // ─── Pre-Register User Modal states (Dual Options: Email vs Non-Email) ───
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [accountType, setAccountType] = useState<'email' | 'noemail'>('email');
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState<'admin' | 'staff'>('staff');
  const [newUserAvatar, setNewUserAvatar] = useState<File | null>(null);
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const modalFileInputRef = useRef<HTMLInputElement>(null);

  // Deletion Modal fields
  const [isDeleteModalOpen, setDeleteModalOpen] = useState<boolean>(false);
  const [deleteTargetUser, setDeleteTargetUser] = useState<any | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState<string>('');

  const fetchUsers = async () => {
    if (!isAdmin) return;
    try {
      setIsLoadingUsers(true);
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('username', { ascending: true });

      if (error) throw error;
      setUsersList(data || []);
    } catch (err: any) {
      console.warn('Failed to retrieve system profiles:', err);
    } finally {
      setIsLoadingUsers(false);
    }
  };

  useEffect(() => {
    if (!isAdmin) return;
    fetchUsers();

    if (user?.id && profile?.status === 'pending') {
      supabase
        .from('profiles')
        .update({ status: 'active' })
        .eq('id', user.id)
        .then(() => {
          useAuthStore.setState((state) => ({
            profile: state.profile
              ? { ...state.profile, status: 'active' }
              : null,
          }));
          fetchUsers();
        });
    }

    const directoryChannel = supabase
      .channel('profiles-directory-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles' },
        () => {
          fetchUsers();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(directoryChannel);
    };
  }, [isAdmin]);

  const isDirty = Object.keys(drafts).length > 0;

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('settings-dirty-state', {
        detail: { isDirty, isSaving },
      })
    );
  }, [isDirty, isSaving]);

  useEffect(() => {
    return () => {
      window.dispatchEvent(
        new CustomEvent('settings-dirty-state', {
          detail: { isDirty: false, isSaving: false },
        })
      );
    };
  }, []);

  const handleSaveAllDrafts = async (
    currentDrafts: Record<string, DraftChange>
  ) => {
    const keys = Object.keys(currentDrafts);
    if (keys.length === 0) return;

    try {
      setIsSaving(true);
      const updatePromises = keys.map(async (id) => {
        const draft = currentDrafts[id];
        const target = usersList.find((u) => u.id === id);
        if (!target) return;

        const payload: Record<string, any> = {};
        if (draft.role !== undefined) payload.role = draft.role;
        if (draft.status !== undefined) payload.status = draft.status;

        const { error } = await supabase
          .from('profiles')
          .update(payload)
          .eq('id', id);

        if (error) throw error;

        const auditChanges = [];
        if (draft.role !== undefined && draft.role !== target.role) {
          auditChanges.push(`Role: "${target.role}" -> "${draft.role}"`);
        }
        if (draft.status !== undefined && draft.status !== target.status) {
          auditChanges.push(
            `Status: "${target.status || 'active'}" -> "${draft.status}"`
          );
        }

        await logAudit(
          'USER_STATUS_TOGGLED',
          `Modified staff credentials for "${target.username}" (${target.email}): ${auditChanges.join(', ')}.`,
          id
        );
      });

      await Promise.all(updatePromises);
      toast.success(`Successfully saved edits for ${keys.length} accounts.`);
      setDrafts({});
      fetchUsers();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save edits.');
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    const handleSaveTrigger = () => {
      handleSaveAllDrafts(drafts);
    };
    window.addEventListener('trigger-rates-save', handleSaveTrigger);
    return () =>
      window.removeEventListener('trigger-rates-save', handleSaveTrigger);
  }, [drafts, usersList]);

  useEffect(() => {
    const handleCancelTrigger = () => {
      setDrafts({});
      toast.info('Changes discarded.');
    };
    window.addEventListener('trigger-rates-cancel', handleCancelTrigger);
    return () =>
      window.removeEventListener('trigger-rates-cancel', handleCancelTrigger);
  }, []);

  const handleCreateUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newUserName.trim();

    if (!cleanName) {
      toast.error('User name / Display identity is required.');
      return;
    }

    let finalEmail = '';
    let finalPassword = '';

    if (accountType === 'email') {
      finalEmail = newUserEmail.trim().toLowerCase();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(finalEmail) || finalEmail.endsWith('.noemail')) {
        toast.error(
          'Please enter a valid, standard email address for email-based registration.'
        );
        return;
      }
      finalPassword =
        Math.random().toString(36).slice(-10) +
        'A1!' +
        Date.now().toString().slice(-4);
    } else {
      // Non-email / Local format: uses username@palomargym.noemail
      const cleanSlug = cleanName.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!cleanSlug) {
        toast.error('Username must contain letters or numbers.');
        return;
      }
      finalEmail = `${cleanSlug}@palomargym.noemail`;

      if (!newUserPassword || newUserPassword.length < 6) {
        toast.error(
          'Initial password must be at least 6 characters long for local accounts.'
        );
        return;
      }
      finalPassword = newUserPassword;
    }

    try {
      setIsCreatingUser(true);

      const { data, error } = await supabase.rpc('admin_register_user', {
        new_email: finalEmail,
        new_password: finalPassword,
        new_name: cleanName,
        new_role: newUserRole,
      });

      if (error) throw error;

      const registeredUserId = data?.id || data?.user_id || data;

      await logAudit(
        'USER_PRE_REGISTERED',
        `Pre-registered user "${cleanName}" (${finalEmail}) with role "${newUserRole}".`,
        registeredUserId
      );

      if (accountType === 'email') {
        const { error: resendError } = await supabase.auth.resend({
          type: 'signup',
          email: finalEmail,
          options: {
            emailRedirectTo: buildAppUrl('/confirm-signup'),
          },
        });

        if (resendError) {
          console.warn(
            'SMTP confirmation dispatch bypassed:',
            resendError.message
          );
          toast.info(
            `Account registered, but verification email could not be sent: ${resendError.message}`
          );
        } else {
          toast.success(
            `Pre-registration successful! Verification email sent to ${finalEmail}`
          );
        }
      } else {
        toast.success(
          `Local account created for "${cleanName}"! (ID: ${finalEmail})`
        );
      }

      if (newUserAvatar && registeredUserId) {
        try {
          const processedFile = await compressImage(
            newUserAvatar,
            100 * 1024
          ).catch(() => newUserAvatar);
          const fileExt = processedFile.name.split('.').pop() || 'jpg';
          const filePath = `${registeredUserId}/avatar-${Date.now()}.${fileExt}`;

          const { error: uploadError } = await supabase.storage
            .from('avatars')
            .upload(filePath, processedFile, {
              cacheControl: '3600',
              upsert: true,
            });

          if (uploadError) throw uploadError;

          await supabase
            .from('profiles')
            .update({ avatar_url: filePath })
            .eq('id', registeredUserId);
        } catch (avatarErr) {
          console.warn('Optional avatar photo upload skipped', avatarErr);
        }
      }

      setIsCreateModalOpen(false);
      setNewUserName('');
      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserRole('staff');
      setNewUserAvatar(null);

      fetchUsers();
    } catch (err: any) {
      const errMsg = err.message || '';
      if (
        errMsg.includes('users_email_partial_key') ||
        errMsg.includes('duplicate key value')
      ) {
        toast.error(
          'An account with this username or email already exists in the system.'
        );
      } else {
        toast.error(err.message || 'Failed to pre-register system user.');
      }
    } finally {
      setIsCreatingUser(false);
    }
  };

  const handleDeleteUserClick = (targetUser: any) => {
    if (targetUser.id === user?.id) {
      toast.error('You cannot delete your own session account.');
      return;
    }
    setDeleteTargetUser(targetUser);
    setDeleteConfirmText('');
    setDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTargetUser) return;

    try {
      setIsDeletingUser(deleteTargetUser.id);

      if (deleteTargetUser.avatar_url) {
        const cleanPath = deleteTargetUser.avatar_url.includes('/avatars/')
          ? deleteTargetUser.avatar_url.split('/avatars/').pop()
          : deleteTargetUser.avatar_url;

        if (cleanPath) {
          const { error: storageError } = await supabase.storage
            .from('avatars')
            .remove([cleanPath]);

          if (storageError) {
            console.warn(
              'Optional avatar storage cleanup skipped:',
              storageError.message
            );
          }
        }
      }

      const { error } = await supabase.rpc('admin_delete_user', {
        target_user_id: deleteTargetUser.id,
      });

      if (error) throw error;

      await logAudit(
        'USER_DELETED',
        `Permanently deleted staff/admin account "${deleteTargetUser.email}".`,
        deleteTargetUser.id
      );

      toast.success(
        `Account for "${deleteTargetUser.username}" deleted successfully.`
      );
      setDeleteModalOpen(false);
      setDeleteTargetUser(null);
      setDeleteConfirmText('');
      fetchUsers();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete user.');
    } finally {
      setIsDeletingUser(null);
    }
  };

  const handleSendResetPassword = async (targetUser: any) => {
    const email = targetUser.email;
    if (!email || email.endsWith('@palomargym.noemail')) {
      toast.warn(
        `"${targetUser.username}" is a local username-only account and has no external email.`
      );
      return;
    }

    try {
      setIsSendingReset(targetUser.id);
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: buildAppUrl('/forgot-password'),
      });

      if (error) throw error;

      await logAudit(
        'ADMIN_PASSWORD_RESET_SENT',
        `Admin sent password reset link to "${email}" for user "${targetUser.username}".`,
        user?.id ?? undefined
      );

      toast.success(`Password reset link successfully sent to ${email}!`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to send password reset email.');
    } finally {
      setIsSendingReset(null);
    }
  };

  const handleOpenEditProfile = (targetUser: any) => {
    setEditTargetUser(targetUser);
    setEditUsername(targetUser.username || '');
    setEditAvatarFile(null);
    setAvatarPreviewUrl(null);
    setRemoveExistingAvatar(false);
    setIsEditProfileModalOpen(true);
  };

  const handleAvatarFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      toast.error('File exceeds the 8MB limit.');
      return;
    }
    setEditAvatarFile(file);
    setRemoveExistingAvatar(false);
    setAvatarPreviewUrl(URL.createObjectURL(file));
  };

  const handleSaveProfileChanges = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTargetUser) return;

    const targetEmail =
      editTargetUser.id === user?.id ? user?.email : editTargetUser.email;

    if (isSuperAdminRow(targetEmail)) {
      toast.error(
        'Superadmin credentials are permanently locked and must be configured in Personal Account.'
      );
      setIsEditProfileModalOpen(false);
      return;
    }

    const trimmed = editUsername.trim();
    if (trimmed.length < 3) {
      toast.error('Username must be at least 3 characters long.');
      return;
    }

    try {
      setIsSavingUser(true);
      let newAvatarPath = editTargetUser.avatar_url;
      let avatarChanged = false;

      // 1. Process Avatar Photo Changes
      if (editAvatarFile) {
        const processedFile = await compressImage(
          editAvatarFile,
          100 * 1024
        ).catch(() => editAvatarFile);
        const fileExt = processedFile.name.split('.').pop() || 'jpg';
        newAvatarPath = `${editTargetUser.id}/avatar-${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(newAvatarPath, processedFile, {
            cacheControl: '3600',
            upsert: true,
          });

        if (uploadError) throw uploadError;

        if (editTargetUser.avatar_url) {
          const oldPath = editTargetUser.avatar_url.includes('/avatars/')
            ? editTargetUser.avatar_url.split('/avatars/').pop()
            : editTargetUser.avatar_url;
          if (oldPath) {
            await supabase.storage
              .from('avatars')
              .remove([oldPath])
              .catch(() => {});
          }
        }

        avatarChanged = true;
      } else if (removeExistingAvatar && editTargetUser.avatar_url) {
        const oldPath = editTargetUser.avatar_url.includes('/avatars/')
          ? editTargetUser.avatar_url.split('/avatars/').pop()
          : editTargetUser.avatar_url;
        if (oldPath) {
          await supabase.storage
            .from('avatars')
            .remove([oldPath])
            .catch(() => {});
        }
        newAvatarPath = null;
        avatarChanged = true;
      }

      // 2. Update Username if modified
      const usernameChanged =
        trimmed.toLowerCase() !== editTargetUser.username?.toLowerCase();

      if (usernameChanged) {
        const { error: rpcError } = await supabase.rpc(
          'admin_update_username',
          {
            target_user_id: editTargetUser.id,
            new_username: trimmed,
          }
        );

        if (rpcError) {
          const { error: fallbackError } = await supabase
            .from('profiles')
            .update({ username: trimmed })
            .eq('id', editTargetUser.id);

          if (fallbackError) throw fallbackError;
        }
      }

      // 3. Update Avatar URL in profiles table if modified
      if (avatarChanged) {
        const { error: profileError } = await supabase
          .from('profiles')
          .update({ avatar_url: newAvatarPath })
          .eq('id', editTargetUser.id);

        if (profileError) throw profileError;
      }

      const auditNotes = [];
      if (usernameChanged)
        auditNotes.push(
          `Username: "${editTargetUser.username}" -> "${trimmed}"`
        );
      if (avatarChanged)
        auditNotes.push(
          newAvatarPath ? 'Uploaded new profile photo' : 'Removed profile photo'
        );

      await logAudit(
        'ADMIN_EDIT_USER_PROFILE',
        `Admin updated profile for user "${editTargetUser.username}" (${editTargetUser.id}): ${auditNotes.join(', ')}.`,
        user?.id ?? undefined
      );

      toast.success(`Profile for "${trimmed}" updated successfully!`);
      setIsEditProfileModalOpen(false);
      setEditTargetUser(null);
      setEditAvatarFile(null);
      setAvatarPreviewUrl(null);
      setRemoveExistingAvatar(false);
      fetchUsers();
    } catch (err: any) {
      console.error('Save profile error:', err);
      const msg = err.message || '';
      if (msg.includes('unique') || msg.includes('duplicate')) {
        toast.error('This username is already taken. Please choose another.');
      } else {
        toast.error(err.message || 'Failed to update profile.');
      }
    } finally {
      setIsSavingUser(false);
    }
  };

  const handleToggleUserStatus = (
    targetId: string,
    currentStatus: 'active' | 'inactive' | 'pending',
    targetRole: string
  ) => {
    if (targetId === user?.id) {
      toast.error('You cannot change your own account status.');
      return;
    }

    if (targetRole === 'admin' && !viewerIsSuperAdmin) {
      toast.error(
        'Administrator account statuses can only be modified by the Superadmin.'
      );
      return;
    }

    setDrafts((prev) => {
      const draft = prev[targetId] || {};
      const targetUser = usersList.find((u) => u.id === targetId);
      const originalStatus = targetUser?.status || 'active';

      const effectiveCurrent = draft.status || currentStatus;
      const nextStatus: 'active' | 'inactive' =
        effectiveCurrent === 'active' ? 'inactive' : 'active';

      const updatedDraft: DraftChange = { ...draft, status: nextStatus };

      if (
        updatedDraft.status === originalStatus &&
        (updatedDraft.role === undefined ||
          updatedDraft.role === (targetUser?.role || 'staff'))
      ) {
        const { [targetId]: _, ...rest } = prev;
        return rest;
      }

      return { ...prev, [targetId]: updatedDraft };
    });
  };

  const handleToggleUserRole = (
    targetId: string,
    currentRole: 'admin' | 'staff'
  ) => {
    if (targetId === user?.id) {
      toast.error('You cannot change your own permission role.');
      return;
    }

    setDrafts((prev) => {
      const draft = prev[targetId] || {};
      const targetUser = usersList.find((u) => u.id === targetId);
      const originalRole = targetUser?.role || 'staff';

      const nextRole: 'admin' | 'staff' =
        (draft.role || currentRole) === 'admin' ? 'staff' : 'admin';

      const updatedDraft: DraftChange = { ...draft, role: nextRole };

      if (
        updatedDraft.role === originalRole &&
        (updatedDraft.status === undefined ||
          updatedDraft.status === (targetUser?.status || 'active'))
      ) {
        const { [targetId]: _, ...rest } = prev;
        return rest;
      }

      return { ...prev, [targetId]: updatedDraft };
    });
  };

  const isSuperAdminRow = (rowEmail?: string | null) =>
    Boolean(rowEmail && rowEmail.trim().toLowerCase() === superAdminEmail);

  const systemUsers = usersList.filter((u) => {
    if (viewerIsSuperAdmin) return true;
    const rowEmail = u.id === user?.id ? user?.email : u.email;
    return !isSuperAdminRow(rowEmail);
  });

  const currentUserIncluded = systemUsers.some((u) => u.id === user?.id);
  if (!currentUserIncluded && profile) {
    systemUsers.unshift({
      id: user?.id,
      username: profile.username || 'Current User',
      role: profile.role,
      avatar_url: profile.avatar_url,
      email: user?.email,
      is_self: true,
    });
  }

  const columns: Column<any>[] = [
    {
      key: 'username',
      header: 'User Name',
      sortable: true,
      render: (u) => {
        const isSelfUser = u.id === user?.id;

        return (
          <div className="font-bold text-(--color-text) flex items-center gap-3">
            <div className="w-8 h-8 rounded-full overflow-hidden bg-(--bg-input) flex items-center justify-center text-xs border border-(--border-color) shrink-0">
              <AvatarImage src={u.avatar_url} />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <span className="text-(--color-text) opacity-90">
                  {u.username || 'System Account'}
                </span>
                {isSelfUser && (
                  <span className="text-[8px] bg-(--color-primary) text-white rounded px-1.5 py-0.5 font-mono uppercase font-bold tracking-wider">
                    YOU
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      },
    },
    {
      key: 'email',
      header: 'Email Address',
      sortable: true,
      render: (u) => {
        const isSelfUser = u.id === user?.id;
        const displayEmail = (isSelfUser ? user?.email : u.email) || '—';
        const isNoEmail = displayEmail.endsWith('@palomargym.noemail');

        return (
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs max-w-45 truncate block text-slate-400">
              {displayEmail}
            </span>
            {isNoEmail && (
              <span className="text-[9px] bg-amber-500/10 text-amber-500 border border-amber-500/20 px-1.5 py-0.5 rounded font-mono font-semibold">
                No-Email (Local)
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: 'role',
      header: 'Role',
      sortable: true,
      render: (u) => {
        const isSelfUser = u.id === user?.id;
        const displayEmail = (isSelfUser ? user?.email : u.email) || '—';

        if (isSuperAdminRow(displayEmail)) {
          return (
            <span className="text-[9px] font-heading tracking-widest px-2 py-1 rounded-full uppercase bg-amber-500/10 text-amber-500 border border-amber-500/20 font-bold">
              superadmin
            </span>
          );
        }

        const draft = drafts[u.id];
        const isModified =
          draft && draft.role !== undefined && draft.role !== u.role;
        const currentRole = draft?.role || u.role || 'staff';

        const getRoleBadge = (role: string) => (
          <span
            className={`text-[9px] font-heading tracking-widest px-2 py-1 rounded-full uppercase font-bold transition-all ${
              role === 'admin'
                ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
            }`}
          >
            {role}
          </span>
        );

        if (isSelfUser) {
          return getRoleBadge(u.role || 'staff');
        }

        return (
          <button
            type="button"
            onClick={() => handleToggleUserRole(u.id, u.role || 'staff')}
            title="Click to toggle account role draft"
            className="hover:opacity-85 cursor-pointer text-left transition-opacity"
          >
            {isModified ? (
              <div className="flex items-center gap-1.5">
                <span className="opacity-40 line-through scale-90 origin-left block">
                  {getRoleBadge(u.role || 'staff')}
                </span>
                <span className="text-[10px] text-blue-500 font-bold">→</span>
                <span className="animate-pulse block">
                  {getRoleBadge(currentRole)}
                </span>
              </div>
            ) : (
              getRoleBadge(currentRole)
            )}
          </button>
        );
      },
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (u) => {
        const isSelfUser = u.id === user?.id;

        const draft = drafts[u.id];
        const isModified =
          draft && draft.status !== undefined && draft.status !== u.status;
        const currentStatus = draft?.status || u.status || 'pending';

        const getStatusBadge = (status: string) => {
          if (status === 'inactive') {
            return (
              <span className="flex items-center gap-1.5 text-xs text-rose-500 font-semibold">
                <span className="w-1.5 h-1.5 bg-rose-500 rounded-full" />
                Inactive
              </span>
            );
          } else if (status === 'pending') {
            return (
              <span className="flex items-center gap-1.5 text-xs text-amber-500 font-semibold">
                <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse" />
                Pending
              </span>
            );
          } else {
            return (
              <span className="flex items-center gap-1.5 text-xs text-emerald-500 font-semibold">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                Active
              </span>
            );
          }
        };

        if (isSelfUser) {
          return getStatusBadge(u.status || 'active');
        }

        return (
          <button
            type="button"
            onClick={() =>
              handleToggleUserStatus(
                u.id,
                u.status || 'pending',
                u.role || 'staff'
              )
            }
            title="Click to toggle account status draft"
            className="cursor-pointer hover:opacity-80 transition-opacity outline-none text-left"
          >
            {isModified ? (
              <div className="flex items-center gap-1.5">
                <span className="opacity-40 line-through scale-90 origin-left block">
                  {getStatusBadge(u.status || 'active')}
                </span>
                <span className="text-[10px] text-blue-500 font-bold">→</span>
                <span className="animate-pulse block">
                  {getStatusBadge(currentStatus)}
                </span>
              </div>
            ) : (
              getStatusBadge(currentStatus)
            )}
          </button>
        );
      },
    },
    {
      key: 'actions',
      header: 'Actions',
      headerClassName: 'text-right',
      cellClassName: 'text-right',
      render: (u) => {
        const isSelfUser = u.id === user?.id;
        if (isSelfUser) {
          return (
            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono pr-2">
              Active Session
            </span>
          );
        }

        const isTargetSuperAdmin = isSuperAdminRow(u.email);
        const isProtectedAdmin =
          u.role === 'admin' && u.status === 'active' && !viewerIsSuperAdmin;
        const isNoEmailAccount =
          !u.email || u.email.endsWith('@palomargym.noemail');

        return (
          <div className="flex items-center justify-end gap-1.5">
            {/* Action 1: Edit Profile (Username & Profile Photo) */}
            {!isTargetSuperAdmin && (
              <button
                type="button"
                onClick={() => handleOpenEditProfile(u)}
                title={`Edit profile picture & username for ${u.username}`}
                aria-label={`Edit profile for ${u.username}`}
                className="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100/90 dark:bg-slate-900/60 hover:bg-blue-500/10 hover:border-blue-500/30 text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 flex items-center justify-center transition-all cursor-pointer shadow-xs active:scale-95"
              >
                <Edit3 className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Action 2: Send Reset Password (Requires Email) */}
            <button
              type="button"
              onClick={() => handleSendResetPassword(u)}
              disabled={isSendingReset === u.id || isNoEmailAccount}
              title={
                isNoEmailAccount
                  ? 'Local accounts have no external email'
                  : `Send password reset email to ${u.email}`
              }
              aria-label={`Send password reset to ${u.username}`}
              className={`w-8 h-8 rounded-lg border flex items-center justify-center transition-all shadow-xs active:scale-95 ${
                isNoEmailAccount
                  ? 'border-slate-200 dark:border-slate-800/40 bg-slate-50 dark:bg-transparent text-slate-400 dark:text-slate-600 opacity-40 cursor-not-allowed'
                  : 'border-slate-200 dark:border-slate-800 bg-slate-100/90 dark:bg-slate-900/60 hover:bg-emerald-500/10 hover:border-emerald-500/30 text-slate-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 cursor-pointer disabled:opacity-50'
              }`}
            >
              {isSendingReset === u.id ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-500 dark:text-emerald-400" />
              ) : (
                <KeyRound className="w-3.5 h-3.5" />
              )}
            </button>

            {/* Action 3: Delete Account */}
            {isTargetSuperAdmin ? (
              <div
                title="Superadmin account protected"
                className="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-800/40 bg-slate-50 dark:bg-transparent text-slate-400 dark:text-slate-600 opacity-40 flex items-center justify-center cursor-not-allowed"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
              </div>
            ) : isProtectedAdmin ? (
              <div
                title="Admin accounts can only be deleted by the Superadmin"
                className="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-800/40 bg-slate-50 dark:bg-transparent text-slate-400 dark:text-slate-600 opacity-40 flex items-center justify-center cursor-not-allowed"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => handleDeleteUserClick(u)}
                disabled={isDeletingUser === u.id}
                title={`Delete user account ${u.username}`}
                aria-label={`Delete user account ${u.username}`}
                className="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100/90 dark:bg-slate-900/60 hover:bg-rose-500/10 hover:border-rose-500/30 text-slate-600 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-500 flex items-center justify-center transition-all cursor-pointer shadow-xs active:scale-95 disabled:opacity-50"
              >
                {isDeletingUser === u.id ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-500" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
              </button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-8 font-body text-(--color-text)">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-heading tracking-widest uppercase text-(--color-text)">
            User Management
          </h2>
          <p className="text-sm text-slate-400 mt-1 font-medium">
            Pre-register staff accounts and manage system user permissions.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap self-start sm:self-auto">
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="px-4 py-2.5 bg-(--color-primary) hover:opacity-90 text-white text-[10px] font-heading tracking-widest uppercase rounded-lg transition-all cursor-pointer"
          >
            + Pre-Register User
          </button>
        </div>
      </div>

      {/* Table Container */}
      <div className="p-1 rounded-2xl border border-(--border-color) bg-(--bg-card) overflow-x-auto lg:overflow-x-visible w-full">
        <Table<any>
          data={systemUsers}
          columns={columns}
          searchKeys={['username', 'email', 'role', 'status']}
          searchPlaceholder="Search system users..."
          defaultSortKey="username"
          defaultSortDirection="asc"
          itemsPerPage={useResponsiveItemsPerPage()}
          loading={isLoadingUsers}
          loadingLabel="Retrieving system user profiles..."
        />
      </div>

      {/* Edit User Profile (Photo & Username) Modal */}
      <Modal
        isOpen={isEditProfileModalOpen}
        onClose={() => {
          setIsEditProfileModalOpen(false);
          setEditTargetUser(null);
          setEditAvatarFile(null);
          setAvatarPreviewUrl(null);
        }}
        title="Edit User Profile"
      >
        <form
          onSubmit={handleSaveProfileChanges}
          className="text-left w-full space-y-4 font-body"
        >
          {/* Avatar Photo Section */}
          <div className="flex flex-col items-center gap-3 p-4 rounded-2xl bg-(--bg-card) border border-(--border-color)">
            <div className="relative group w-20 h-20 rounded-full overflow-hidden border-2 border-(--border-color) bg-(--bg-input) flex items-center justify-center shadow-md">
              {avatarPreviewUrl ? (
                <img
                  src={avatarPreviewUrl}
                  alt="Avatar Preview"
                  className="w-full h-full object-cover"
                />
              ) : editTargetUser?.avatar_url && !removeExistingAvatar ? (
                <AvatarImage src={editTargetUser.avatar_url} />
              ) : (
                <div className="w-full h-full bg-slate-800 flex items-center justify-center text-xl font-bold text-white uppercase">
                  {editUsername ? (
                    editUsername.charAt(0)
                  ) : (
                    <User className="w-8 h-8 text-slate-400" />
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => editFileInputRef.current?.click()}
                className="px-3 py-1.5 rounded-lg border border-(--border-color) bg-(--bg-input) hover:opacity-90 text-[10px] font-heading uppercase tracking-wider text-(--color-text) cursor-pointer transition-all flex items-center gap-1.5"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>
                  {editAvatarFile ||
                  (editTargetUser?.avatar_url && !removeExistingAvatar)
                    ? 'Change Photo'
                    : 'Upload Photo'}
                </span>
              </button>

              {(editAvatarFile ||
                (editTargetUser?.avatar_url && !removeExistingAvatar)) && (
                <button
                  type="button"
                  onClick={() => {
                    setEditAvatarFile(null);
                    setAvatarPreviewUrl(null);
                    setRemoveExistingAvatar(true);
                  }}
                  className="px-2.5 py-1.5 rounded-lg border border-red-500/20 bg-red-500/10 text-red-500 hover:bg-red-500/20 text-[10px] font-heading uppercase tracking-wider cursor-pointer transition-all flex items-center gap-1"
                  title="Remove Photo"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Remove</span>
                </button>
              )}
            </div>

            <input
              ref={editFileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarFileSelect}
            />
          </div>

          {/* Username Section */}
          <div className="field-wrap">
            <input
              type="text"
              id="editTargetUsername"
              placeholder=" "
              required
              value={editUsername}
              onChange={(e) => setEditUsername(e.target.value)}
              className="field-input text-xs"
            />
            <label htmlFor="editTargetUsername" className="field-label text-xs">
              Account Username
            </label>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                setIsEditProfileModalOpen(false);
                setEditTargetUser(null);
                setEditAvatarFile(null);
                setAvatarPreviewUrl(null);
              }}
              className="flex-1 px-4 py-2.5 bg-(--bg-input) text-(--color-text) text-[10px] font-heading tracking-wider uppercase rounded-xl hover:opacity-90 transition-all cursor-pointer text-center"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSavingUser || !editUsername.trim()}
              className="flex-1 px-4 py-2.5 bg-(--color-primary) text-white text-[10px] font-heading tracking-wider uppercase rounded-xl hover:opacity-90 transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isSavingUser ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </button>
          </div>
        </form>
      </Modal>

      {/* Confirmation Overlay Portals */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setDeleteModalOpen(false);
          setDeleteTargetUser(null);
          setDeleteConfirmText('');
        }}
        title="Confirm User Deletion"
      >
        {deleteTargetUser && (
          <div className="space-y-4 font-body text-left">
            <p className="text-xs text-slate-400 leading-normal font-bold">
              Are you sure you want to permanently delete user{' '}
              <strong className="text-(--color-text) font-extrabold font-heading">
                "{deleteTargetUser.username}"
              </strong>
              ? This action cannot be undone.
            </p>

            {deleteTargetUser.status !== 'pending' ? (
              <div className="space-y-2">
                <label
                  htmlFor="deleteConfirmInput"
                  className="text-[10px] font-bold uppercase tracking-wider text-slate-400"
                >
                  To confirm, type the username{' '}
                  <span className="font-mono text-(--color-text) select-all font-extrabold">
                    {deleteTargetUser.username}
                  </span>{' '}
                  below:
                </label>
                <input
                  id="deleteConfirmInput"
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="Type username to verify"
                  className="w-full px-4 py-3 border border-(--border-color) rounded-xl text-xs bg-(--bg-page) text-(--color-text) outline-none focus:ring-1 focus:ring-red-500 transition-all font-semibold"
                />
              </div>
            ) : (
              <p className="text-[11px] text-amber-500 font-bold bg-amber-500/5 border border-amber-500/10 p-3 rounded-xl">
                * Note: Since this invitation status is pending, no input
                verification is required to discard it.
              </p>
            )}

            <div className="flex gap-3 pt-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setDeleteModalOpen(false);
                  setDeleteTargetUser(null);
                  setDeleteConfirmText('');
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleConfirmDelete}
                loading={isDeletingUser === deleteTargetUser.id}
                loadingLabel="DELETING..."
                disabled={
                  deleteTargetUser.status !== 'pending' &&
                  deleteConfirmText !== deleteTargetUser.username &&
                  deleteConfirmText !== deleteTargetUser.email
                }
                className="bg-red-600 hover:bg-red-700 text-white font-heading text-xs tracking-wider uppercase shadow-md cursor-pointer disabled:opacity-50"
              >
                Confirm Delete
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ─── Pre-Register Modal (Dual Options: Email vs Non-Email / Local) ─── */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => {
          setIsCreateModalOpen(false);
          setNewUserName('');
          setNewUserEmail('');
          setNewUserPassword('');
          setNewUserAvatar(null);
        }}
        title="Pre-Register Account"
      >
        <form
          onSubmit={handleCreateUserSubmit}
          className="text-left w-full space-y-4 font-body"
        >
          {/* Account Mode Switcher Tabs */}
          <div className="grid grid-cols-2 gap-1.5 p-1 bg-(--bg-input) rounded-xl border border-(--border-color)">
            <button
              type="button"
              onClick={() => setAccountType('email')}
              className={`py-2 px-3 text-[10px] font-heading uppercase tracking-wider rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                accountType === 'email'
                  ? 'bg-(--color-primary) text-white font-bold shadow-xs'
                  : 'text-slate-400 hover:text-(--color-text)'
              }`}
            >
              <Mail className="w-3.5 h-3.5" />
              <span>Email-Based</span>
            </button>
            <button
              type="button"
              onClick={() => setAccountType('noemail')}
              className={`py-2 px-3 text-[10px] font-heading uppercase tracking-wider rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                accountType === 'noemail'
                  ? 'bg-(--color-primary) text-white font-bold shadow-xs'
                  : 'text-slate-400 hover:text-(--color-text)'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>Username Only</span>
            </button>
          </div>

          {/* Mode Banner Description */}
          {accountType === 'email' ? (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-blue-600 dark:text-blue-400 font-medium">
              <Mail className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                Standard invitation. An automated verification and signup email
                will be sent to the recipient inbox.
              </span>
            </div>
          ) : (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-600 dark:text-amber-400 font-medium">
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                Local staff ID account. Generates an internal{' '}
                <code>@palomargym.noemail</code> identity with direct password
                login.
              </span>
            </div>
          )}

          {/* User Name Field */}
          <div className="field-wrap">
            <input
              type="text"
              id="newUserName"
              placeholder=" "
              required
              value={newUserName}
              onChange={(e) => setNewUserName(e.target.value)}
              className="field-input text-xs"
            />
            <label htmlFor="newUserName" className="field-label text-xs">
              {accountType === 'email'
                ? 'Display Full Name'
                : 'Account Username / Staff ID'}
            </label>
          </div>

          {/* Email vs Password Switch */}
          {accountType === 'email' ? (
            <div className="field-wrap">
              <input
                type="email"
                id="newUserEmail"
                placeholder=" "
                required
                value={newUserEmail}
                onChange={(e) => setNewUserEmail(e.target.value)}
                className="field-input text-xs"
              />
              <label htmlFor="newUserEmail" className="field-label text-xs">
                Email Address (Required)
              </label>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="field-wrap">
                <input
                  type="password"
                  id="newUserPassword"
                  placeholder=" "
                  required
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                  className="field-input text-xs"
                />
                <label
                  htmlFor="newUserPassword"
                  className="field-label text-xs"
                >
                  Initial Password (Min. 6 chars)
                </label>
              </div>
              <p className="text-[10px] text-slate-400 font-mono">
                Assigned system identifier:{' '}
                <span className="text-(--color-text) font-semibold">
                  {newUserName.trim()
                    ? `${newUserName
                        .trim()
                        .toLowerCase()
                        .replace(/[^a-z0-9]/g, '')}@palomargym.noemail`
                    : 'username@palomargym.noemail'}
                </span>
              </p>
            </div>
          )}

          {/* Permission Role Selector */}
          <div className="grid gap-1.5">
            <label
              htmlFor="newUserRole"
              className="text-[10px] font-bold uppercase tracking-wider text-slate-400"
            >
              Assigned Permissions
            </label>
            <select
              id="newUserRole"
              value={newUserRole}
              onChange={(e) =>
                setNewUserRole(e.target.value as 'admin' | 'staff')
              }
              title="Select assigned permission role levels"
              aria-label="Select assigned permission role levels"
              className="w-full px-3 py-2.5 border border-(--border-color) rounded-xl text-xs bg-(--bg-page) text-(--color-text) uppercase font-bold tracking-wider outline-none focus:ring-1 focus:ring-(--color-primary) transition-all cursor-pointer"
            >
              <option value="staff">Staff Member</option>
              <option value="admin">Administrator</option>
            </select>
          </div>

          {/* Profile Photo (Optional) */}
          <div className="flex flex-col items-center gap-2 border border-dashed border-(--border-color) p-4 rounded-xl bg-(--bg-card)">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 text-center">
              Profile Photo (Optional)
            </span>
            <div className="flex items-center gap-3 w-full justify-center">
              <button
                type="button"
                onClick={() => modalFileInputRef.current?.click()}
                className="px-3 py-1.5 border border-(--border-color) bg-(--bg-input) rounded-lg hover:opacity-90 text-[10px] font-heading uppercase tracking-widest text-(--color-text) transition-colors cursor-pointer"
              >
                {newUserAvatar ? 'Change' : 'Select'}
              </button>
              {newUserAvatar && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-slate-400 max-w-30 truncate">
                    {newUserAvatar.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => setNewUserAvatar(null)}
                    title="Remove uploaded photo selection"
                    aria-label="Remove uploaded photo selection"
                    className="text-red-500 hover:text-red-700 p-1 rounded-md cursor-pointer flex items-center justify-center"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span className="sr-only">Remove photo</span>
                  </button>
                </div>
              )}
            </div>
            <input
              type="file"
              id="modal-avatar-upload"
              ref={modalFileInputRef}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  if (file.size > 8 * 1024 * 1024) {
                    toast.error('File exceeds the 8MB limit.');
                    return;
                  }
                  setNewUserAvatar(file);
                }
              }}
              className="hidden"
              accept="image/*"
              title="Upload optional profile picture"
              aria-label="Upload optional profile picture"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                setIsCreateModalOpen(false);
                setNewUserName('');
                setNewUserEmail('');
                setNewUserPassword('');
                setNewUserAvatar(null);
              }}
              className="flex-1 px-4 py-2.5 bg-(--bg-input) text-(--color-text) text-[10px] font-heading tracking-wider uppercase rounded-xl hover:opacity-90 transition-all cursor-pointer text-center"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={
                isCreatingUser ||
                !newUserName.trim() ||
                (accountType === 'email'
                  ? !newUserEmail.trim()
                  : !newUserPassword.trim())
              }
              className="flex-1 px-4 py-2.5 bg-(--color-primary) text-white text-[10px] font-heading tracking-wider uppercase rounded-xl hover:opacity-90 transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isCreatingUser ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Registering...
                </>
              ) : (
                'Register'
              )}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
