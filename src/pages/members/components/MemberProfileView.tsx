// src/pages/members/components/MemberProfileView.tsx

import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import {
  X,
  ShieldAlert,
  UserCheck,
  UserX,
  Trash2,
  Lock,
  Pencil,
  Save,
  ShieldCheck,
  FileSignature,
  Receipt as ReceiptIcon,
  Eye,
  AlertOctagon,
  CreditCard,
  RefreshCw,
  User,
  Clock,
  QrCode,
  CalendarCheck,
  Camera,
  CheckCircle2,
  AlertTriangle,
  Check,
  Undo2,
} from 'lucide-react';
import { IntakeWizardModal } from './SubscriptionPlan';
import {
  memberService,
  subscriptionService,
  cardService,
  settingsService,
  DEFAULT_SETTINGS,
} from '../memberService';
import type {
  Member,
  Subscription,
  MemberCard,
  Receipt,
  AttendanceRecord,
  MembershipSettings,
} from '../../../types/members';
import { toast } from 'react-toastify';
import { Modal } from '../../../components/ui/Modal';
import {
  OfficialReceipt,
  type ReceiptData,
} from '../../../components/ui/OfficialReceipt';
import cardTemplateImg from '../../../assets/Member-Card-Template.webp';
import { useAuthStore } from '../../../stores/authStore';
import { isSuperAdmin } from '../../../constants/auth';
import { supabase } from '../../../lib/supabase/client';
import { Table, type Column } from '../../../components/ui/Table';
import { MemberAvatar, MemberPhotoModal } from './MemberAvatar';
import { useCashSessionStore } from '../../../stores/useCashSessionStore';

interface MemberProfileViewProps {
  member: Member;
  onClose: () => void;
  onMutationSuccess: () => void;
}

export const MemberProfileView: React.FC<MemberProfileViewProps> = ({
  member,
  onClose,
  onMutationSuccess,
}) => {
  const { user, profile } = useAuthStore() as any;
  const { isSessionOpen } = useCashSessionStore();

  // Role resolution
  const role = useMemo<'admin' | 'staff'>(() => {
    if (isSuperAdmin(user?.email)) return 'admin';
    return profile?.role?.toLowerCase() === 'admin' ? 'admin' : 'staff';
  }, [user, profile]);

  const isAdmin = role === 'admin';

  // Local state to keep UI updated dynamically
  const [localMember, setLocalMember] = useState<Member>(member);

  // Suspended & Session Check
  const isSuspended = localMember.status === 'Suspended';
  const isEnrollDisabled = !isSessionOpen || isSuspended;

  const handleEnrollOrRenewClick = () => {
    if (isSuspended) {
      toast.error(
        'Cannot enroll or renew subscription: Member account is currently suspended. Activate member first.',
        { toastId: 'member-suspended-enroll-block' }
      );
      return;
    }
    if (!isSessionOpen) {
      toast.warning(
        'Cannot enroll or renew subscription: Cash drawer session is closed. Open a cash session in Cash Management first.',
        { toastId: 'cash-session-closed-enroll-block' }
      );
      return;
    }
    setIsWizardOpen(true);
  };

  const [activeTab, setActiveTab] = useState<
    'Overview' | 'Contracts & Billing' | 'Cards' | 'Attendance' | 'Notes'
  >('Overview');
  const [notes, setNotes] = useState(member.notes || '');

  // Custom Modal States
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [, setIsDigitalQrModalOpen] = useState(false);
  const [selectedReceiptData, setSelectedReceiptData] =
    useState<ReceiptData | null>(null);

  const [isWizardOpen, setIsWizardOpen] = useState(false);

  // Void Subscription Modal & Verification State
  const [isVoidModalOpen, setIsVoidModalOpen] = useState(false);
  const [targetVoidSub, setTargetVoidSub] = useState<Subscription | null>(null);
  const [voidReason, setVoidReason] = useState('Wrong membership selected');
  const [voidNotes, setVoidNotes] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [showAdminPassword, setShowAdminPassword] = useState(false);
  const [isVerifyingVoid, setIsVerifyingVoid] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Card Reissue & Unbind Modal States
  const [isReissueModalOpen, setIsReissueModalOpen] = useState(false);
  const [isUnbindModalOpen, setIsUnbindModalOpen] = useState(false);

  // Physical Card Claim & Undo Claim Modal States
  const [isMarkClaimModalOpen, setIsMarkClaimModalOpen] = useState(false);
  const [isUndoClaimModalOpen, setIsUndoClaimModalOpen] = useState(false);
  const [claimNotesInput, setClaimNotesInput] = useState('');
  const [isClaimingInProfile, setIsClaimingInProfile] = useState(false);
  const [isUndoingClaim, setIsUndoingClaim] = useState(false);

  const [settings, setSettings] =
    useState<MembershipSettings>(DEFAULT_SETTINGS);
  const [isPayCardModalOpen, setIsPayCardModalOpen] = useState(false);
  const [payCardMethod, setPayCardMethod] = useState<'Cash' | 'GCash'>('Cash');
  const [payCardGcashRef, setPayCardGcashRef] = useState('');
  const cardFeeAmount = settings.card_printing_fee || 10;
  const [payCardAmountPaid, setPayCardAmountPaid] =
    useState<number>(cardFeeAmount);
  const [isPayingCard, setIsPayingCard] = useState(false);

  useEffect(() => {
    if (settings.card_printing_fee) {
      setPayCardAmountPaid(settings.card_printing_fee);
    }
  }, [settings.card_printing_fee]);

  // Inline Profile Edit State
  const [isEditing, setIsEditing] = useState(false);
  const [editFullName, setEditFullName] = useState(member.full_name || '');
  const [editPhone, setEditPhone] = useState(member.phone || '');
  const [editEmail, setEditEmail] = useState(member.email || '');
  const [editGender, setEditGender] = useState(member.gender || 'Male');
  const [editBirthday, setEditBirthday] = useState(member.birthday || '');
  const [editAddress, setEditAddress] = useState(member.address || '');
  const [editEmergencyName, setEditEmergencyName] = useState(
    member.emergency_contact_name || ''
  );
  const [editRelationship, setEditRelationship] = useState(
    member.relationship || ''
  );
  const [editEmergencyPhone, setEditEmergencyPhone] = useState(
    member.emergency_contact_phone || ''
  );
  const [showSignatures, setShowSignatures] = useState(false);

  // Supabase Async Collections State
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [cards, setCards] = useState<MemberCard[]>([]);
  const [selectedCardFormat, setSelectedCardFormat] = useState<'QR' | 'Manual'>(
    'QR'
  );

  const loadProfileCollections = async () => {
    try {
      const [subsData, cardsData, { data: rcptsData }, { data: attData }] =
        await Promise.all([
          subscriptionService.getByMemberId(localMember.member_id),
          cardService.getAll(),
          supabase
            .from('receipts')
            .select('*')
            .eq('member_id', localMember.member_id)
            .order('created_at', { ascending: false }),
          supabase
            .from('attendance')
            .select('*')
            .eq('member_id', localMember.member_id)
            .order('check_in_time', { ascending: false }),
        ]);

      const loadedSubs = subsData || [];
      setSubscriptions(loadedSubs);
      setCards(
        (cardsData || []).filter(
          (c: MemberCard) => c.member_id === localMember.member_id
        )
      );
      setReceipts((rcptsData || []) as Receipt[]);
      setAttendance((attData || []) as AttendanceRecord[]);
    } catch (err) {
      console.error('Error loading member profile details:', err);
    }
  };

  useEffect(() => {
    settingsService.load().then(setSettings).catch(console.warn);
  }, []);

  useEffect(() => {
    loadProfileCollections();
  }, [localMember.member_id, refreshKey]);

  useEffect(() => {
    if (!localMember.member_id) return;

    const channel = supabase
      .channel(`realtime-member-profile-${localMember.member_id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'receipts' },
        () => loadProfileCollections()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'subscriptions' },
        () => loadProfileCollections()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'attendance' },
        () => loadProfileCollections()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'cards' },
        () => loadProfileCollections()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'member_cards' },
        () => loadProfileCollections()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [localMember.member_id]);

  useEffect(() => {
    setLocalMember(member);
    setEditFullName(member.full_name || '');
    setEditPhone(member.phone || '');
    setEditEmail(member.email || '');
    setEditGender(member.gender || 'Male');
    setEditBirthday(member.birthday || '');
    setEditAddress(member.address || '');
    setEditEmergencyName(member.emergency_contact_name || '');
    setEditRelationship(member.relationship || '');
    setEditEmergencyPhone(member.emergency_contact_phone || '');
    setNotes(member.notes || '');
    setIsEditing(false);
  }, [member]);

  useEffect(() => {
    const handleSync = () => setRefreshKey((prev) => prev + 1);
    window.addEventListener('palomar_logbook_updated', handleSync);
    window.addEventListener('storage', handleSync);
    return () => {
      window.removeEventListener('palomar_logbook_updated', handleSync);
      window.removeEventListener('storage', handleSync);
    };
  }, []);

  const activeContract = useMemo(() => {
    const now = Date.now();
    return subscriptions.find((s: Subscription) => {
      if (s.member_id !== localMember.member_id || s.status === 'Voided')
        return false;
      const startMs = new Date(s.start_date).getTime();
      const endMs = new Date(s.end_date).getTime();
      return startMs <= now && endMs >= now;
    });
  }, [subscriptions, localMember.member_id]);

  const queuedContract = useMemo(() => {
    const now = Date.now();
    return subscriptions.find((s: Subscription) => {
      if (s.member_id !== localMember.member_id || s.status === 'Voided')
        return false;
      const startMs = new Date(s.start_date).getTime();
      return startMs > now;
    });
  }, [subscriptions, localMember.member_id]);

  const latestContract = useMemo(() => {
    const validSubs = subscriptions
      .filter(
        (s: Subscription) =>
          s.member_id === localMember.member_id && s.status !== 'Voided'
      )
      .sort(
        (a, b) =>
          new Date(b.created_at || b.start_date).getTime() -
          new Date(a.created_at || a.start_date).getTime()
      );
    return validSubs[0];
  }, [subscriptions, localMember.member_id]);

  const targetSubForDisplay = activeContract || latestContract;

  const isRecentlyExpired = useMemo(() => {
    if (!targetSubForDisplay || activeContract) return false;
    const endMs = new Date(targetSubForDisplay.end_date).getTime();
    const now = Date.now();
    if (isNaN(endMs) || endMs >= now) return false;

    const daysExpired = Math.floor((now - endMs) / (1000 * 60 * 60 * 24));
    return daysExpired <= 7;
  }, [targetSubForDisplay, activeContract]);

  const expiredDaysText = useMemo(() => {
    if (!isRecentlyExpired || !targetSubForDisplay) return null;
    const endMs = new Date(targetSubForDisplay.end_date).getTime();
    const now = Date.now();
    const daysExpired = Math.floor((now - endMs) / (1000 * 60 * 60 * 24));
    return daysExpired === 0 ? '-1 day ago' : `-${daysExpired} days ago`;
  }, [isRecentlyExpired, targetSubForDisplay]);
  const stats = useMemo(() => {
    return {
      totalSpent: receipts.reduce(
        (acc: number, curr: Receipt) => acc + Number(curr.amount || 0),
        0
      ),
      totalVisits: attendance.length,
      cardReplacements: cards.filter((c: MemberCard) => !!c.replaced_at).length,
      activeContract,
    };
  }, [receipts, attendance, cards, activeContract]);

  const attendanceLogs = useMemo(() => {
    return [...attendance].sort(
      (a: AttendanceRecord, b: AttendanceRecord) =>
        new Date(b.check_in_time).getTime() -
        new Date(a.check_in_time).getTime()
    );
  }, [attendance]);

  const totalAttendanceValue = useMemo(() => {
    return attendance.reduce(
      (acc, curr) => acc + (Number(curr.entry_fee) || 0),
      0
    );
  }, [attendance]);

  const currentCard = useMemo(() => {
    return cards.find((c: MemberCard) => c.status === 'Active');
  }, [cards]);

  useEffect(() => {
    if (currentCard?.card_type === 'Manual') {
      setSelectedCardFormat('Manual');
    } else {
      setSelectedCardFormat('QR');
    }
  }, [currentCard]);

  const handleConfirmReissueToken = async () => {
    try {
      if (currentCard) {
        await cardService.replace(
          localMember.member_id,
          'Card Reissued / Replacement',
          'Admin Staff'
        );
        toast.success('Access card re-issued with fresh security token.');
      } else {
        await cardService.issue(localMember.member_id, 'QR', 'Admin Staff');
        toast.success('New digital QR credential token issued.');
      }
      setIsReissueModalOpen(false);
      setRefreshKey((prev) => prev + 1);
      await loadProfileCollections();
      onMutationSuccess();
    } catch (err: any) {
      toast.error(err.message || 'Failed to reissue card token.');
    }
  };

  const handleConfirmUnbindCard = async () => {
    try {
      if (currentCard) {
        const { error } = await supabase
          .from('cards')
          .update({
            status: 'Deactivated',
            updated_at: new Date().toISOString(),
          })
          .eq('id', currentCard.id);

        if (error) throw error;

        toast.success(
          `Card ${currentCard.card_number} unbinded. Member now has no registered card.`
        );
      }
      setIsUnbindModalOpen(false);
      setRefreshKey((prev) => prev + 1);
      await loadProfileCollections();
      onMutationSuccess();
    } catch (err: any) {
      toast.error(err.message || 'Failed to unbind card.');
    }
  };

  const handleConfirmMarkClaimed = async () => {
    if (!currentCard) return;
    setIsClaimingInProfile(true);
    try {
      await cardService.markClaimed(
        localMember.member_id,
        user?.email || 'Admin Staff',
        claimNotesInput
      );
      toast.success(
        `Physical card for ${localMember.full_name} marked as CLAIMED.`
      );
      setIsMarkClaimModalOpen(false);
      setClaimNotesInput('');
      setRefreshKey((prev) => prev + 1);
      await loadProfileCollections();
      onMutationSuccess();
    } catch (err: any) {
      toast.error(err.message || 'Failed to mark card as claimed.');
    } finally {
      setIsClaimingInProfile(false);
    }
  };

  const handleConfirmUndoClaim = async () => {
    if (!currentCard) return;
    setIsUndoingClaim(true);
    try {
      const { error } = await supabase
        .from('cards')
        .update({
          claim_status: 'UNCLAIMED',
          claimed_at: null,
          claimed_by: null,
          claim_notes: null,
          updated_at: new Date().toISOString(),
        })
        .eq('member_id', localMember.member_id)
        .eq('status', 'Active');

      if (error) throw error;

      toast.info(
        `Card for ${localMember.full_name} reverted to UNCLAIMED (Pending Pickup).`
      );
      setIsUndoClaimModalOpen(false);
      setRefreshKey((prev) => prev + 1);
      await loadProfileCollections();
      onMutationSuccess();
    } catch (err: any) {
      toast.error(err.message || 'Failed to revert card claim status.');
    } finally {
      setIsUndoingClaim(false);
    }
  };

  const handleConfirmPayCard = async () => {
    if (!currentCard) return;
    if (!isSessionOpen) {
      toast.error(
        'Cannot process card fee: Cash drawer session is closed. Open a cash session in Cash Management first.'
      );
      return;
    }
    setIsPayingCard(true);
    try {
      const fee = cardFeeAmount;
      await cardService.payCard(
        localMember.member_id,
        fee,
        payCardMethod,
        user?.email || 'Admin Staff',
        undefined,
        payCardMethod === 'GCash' ? payCardGcashRef : undefined
      );
      toast.success(
        `Physical card fee (₱${fee.toFixed(2)}) recorded and marked as PAID.`
      );
      setIsPayCardModalOpen(false);
      setRefreshKey((prev) => prev + 1);
      await loadProfileCollections();
      onMutationSuccess();
    } catch (err: any) {
      toast.error(err.message || 'Failed to record card fee payment.');
    } finally {
      setIsPayingCard(false);
    }
  };

  const getSubscriptionCreationTime = (sub: Subscription): number => {
    if (sub.created_at) {
      const isoStr =
        typeof sub.created_at === 'string'
          ? sub.created_at.replace(' ', 'T')
          : sub.created_at;
      const t = new Date(isoStr).getTime();
      if (!isNaN(t)) return t;
    }
    if (sub.start_date) {
      const t = new Date(sub.start_date).getTime();
      if (!isNaN(t)) return t;
    }
    return Date.now();
  };

  const getVoidEligibility = (sub?: Subscription | null) => {
    if (!sub) {
      return {
        eligible: false,
        reason: 'No subscription record selected for voiding.',
      };
    }

    const createdTime = getSubscriptionCreationTime(sub);
    const nowTime = Date.now();
    const hoursDiff = (nowTime - createdTime) / (1000 * 60 * 60);

    if (hoursDiff > 24) {
      return {
        eligible: false,
        reason:
          'Subscriptions may only be voided within 24 hours of creation to preserve accounting records.',
      };
    }

    const hasFacilityVisitsAfterSub = attendanceLogs.some(
      (att: AttendanceRecord) => {
        if (
          att.customer_type === 'New Membership' ||
          att.customer_type === 'Walk-In'
        )
          return false;
        const checkInTime = new Date(att.check_in_time).getTime();
        return checkInTime > createdTime + 60000;
      }
    );

    if (hasFacilityVisitsAfterSub) {
      return {
        eligible: false,
        reason:
          'This subscription has already been used for facility visits and can no longer be voided.',
      };
    }

    return { eligible: true, reason: '' };
  };

  const hasActiveSubscription = !!activeContract;

  useEffect(() => {
    if (hasActiveSubscription) {
      setIsEditing(false);
    }
  }, [hasActiveSubscription]);

  const calculatedAge = useMemo(() => {
    const bday = isEditing ? editBirthday : localMember.birthday;
    if (!bday) return 0;
    const birthDate = new Date(bday);
    if (isNaN(birthDate.getTime())) return 0;
    const today = new Date();
    let calculated = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (
      monthDiff < 0 ||
      (monthDiff === 0 && today.getDate() < birthDate.getDate())
    ) {
      calculated--;
    }
    return calculated >= 0 ? calculated : 0;
  }, [localMember.birthday, editBirthday, isEditing]);

  const isMinor = useMemo(
    () => calculatedAge >= 12 && calculatedAge < 18,
    [calculatedAge]
  );

  const handleUpdateNotes = async () => {
    try {
      const trimmedNotes = notes.trim();
      await memberService.update(
        localMember.id,
        { notes: trimmedNotes },
        'Admin Staff'
      );
      setLocalMember((prev) => ({ ...prev, notes: trimmedNotes }));
      toast.success('Internal notes saved.');
      onMutationSuccess();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleSaveProfileChanges = async () => {
    if (hasActiveSubscription) {
      toast.error('Cannot edit profile while an active subscription exists.');
      return;
    }

    if (!editFullName.trim() || !editPhone.trim()) {
      toast.warning('Full Name and Contact Phone are required.');
      return;
    }

    try {
      const updatedFields = {
        full_name: editFullName.trim(),
        phone: editPhone.trim(),
        email: editEmail.trim(),
        gender: editGender,
        birthday: editBirthday,
        address: editAddress.trim(),
        emergency_contact_name: editEmergencyName.trim(),
        relationship: editRelationship.trim(),
        emergency_contact_phone: editEmergencyPhone.trim(),
      };

      await memberService.update(localMember.id, updatedFields, 'Admin Staff');
      setLocalMember((prev) => ({ ...prev, ...updatedFields }));
      toast.success('Member profile details updated successfully.');
      setIsEditing(false);
      onMutationSuccess();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update member profile.');
    }
  };

  const [isPhotoModalOpen, setIsPhotoModalOpen] = useState(false);

  const handleAvatarSaved = async (newUrl: string) => {
    try {
      await memberService.update(
        localMember.id,
        { image_url: newUrl },
        user?.email || 'Admin Staff'
      );
      setLocalMember((prev) => ({
        ...prev,
        image_url: newUrl,
        avatar_url: newUrl,
      }));
      onMutationSuccess();
      toast.success('Member photo updated successfully.');
    } catch (err: any) {
      toast.error('Failed to update photo: ' + err.message);
    }
  };

  const handleStatusToggleConfirm = async () => {
    const nextStatus = localMember.status === 'Active' ? 'Suspended' : 'Active';

    try {
      await memberService.update(
        localMember.id,
        { status: nextStatus },
        'Admin Staff'
      );
      setLocalMember((prev) => ({ ...prev, status: nextStatus }));
      toast.success(`Member status set to ${nextStatus}.`);
      onMutationSuccess();
      setIsStatusModalOpen(false);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDeleteMemberConfirm = async () => {
    if (hasActiveSubscription) {
      toast.error('Cannot delete member while an active subscription exists.');
      return;
    }

    try {
      await memberService.archive(
        localMember.id,
        'Profile archived by staff',
        'Admin Staff'
      );
      toast.success(
        `Profile for ${localMember.full_name} moved to Recycle Bin.`
      );
      setIsDeleteModalOpen(false);
      onMutationSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete member profile.');
    }
  };

  const handleConfirmVoidSubscription = async () => {
    if (!targetVoidSub || !isAdmin) return;
    if (!voidReason) {
      toast.warning('Please select a reason for voiding.');
      return;
    }
    if (!adminPassword.trim()) {
      toast.warning('Admin password is required to verify this action.');
      return;
    }

    setIsVerifyingVoid(true);
    try {
      if (user?.email) {
        const { error } = await supabase.auth.signInWithPassword({
          email: user.email,
          password: adminPassword.trim(),
        });
        if (error) {
          toast.error(
            'Admin password verification failed. Please check your password.'
          );
          setIsVerifyingVoid(false);
          return;
        }
      }

      await subscriptionService.void(
        targetVoidSub.id,
        voidReason,
        voidNotes.trim(),
        user?.email || profile?.full_name || 'Administrator'
      );

      toast.success('Subscription successfully voided.');
      setIsVoidModalOpen(false);
      setTargetVoidSub(null);
      setAdminPassword('');
      setVoidNotes('');

      await loadProfileCollections();

      window.dispatchEvent(new Event('palomar_logbook_updated'));
      setRefreshKey((prev) => prev + 1);
      onMutationSuccess();
    } catch (err: any) {
      toast.error(err.message || 'Failed to void subscription.');
    } finally {
      setIsVerifyingVoid(false);
    }
  };

  const handleOpenReceipt = (receipt: Receipt) => {
    const payMethod = receipt.payment_method || 'Cash';
    const isGCash =
      typeof payMethod === 'string' &&
      payMethod.toLowerCase().includes('gcash');

    const gcashFee =
      (receipt as any).gcash_fee ??
      (receipt as any).gcashFee ??
      (isGCash ? 10 : 0);

    const rawAmount = receipt.amount || 0;

    const cardFee =
      (receipt as any).card_fee ??
      (receipt as any).cardFee ??
      (rawAmount -
        ((receipt as any).base_price ??
          (isGCash ? rawAmount - gcashFee : rawAmount)) >
      0
        ? rawAmount - ((receipt as any).base_price ?? rawAmount) - gcashFee
        : 0);

    const computedBasePrice =
      (receipt as any).base_price ??
      (receipt as any).basePrice ??
      (rawAmount - gcashFee - cardFee > 0
        ? rawAmount - gcashFee - cardFee
        : rawAmount);

    const gcashRefNo =
      (receipt as any).gcash_ref_no ??
      (receipt as any).gcashRefNo ??
      (receipt as any).reference_number ??
      (receipt as any).referenceNumber ??
      '';

    const data: ReceiptData = {
      receiptType:
        receipt.customer_type === 'Walk-In' ? 'walkin' : 'subscription',
      receiptNo: receipt.id,
      customerName: receipt.customer_name || localMember.full_name,
      customerType: receipt.customer_type,
      planType: receipt.item_description,
      basePrice: computedBasePrice,
      gcashFee: gcashFee,
      cardFee: cardFee,
      paymentMethod: payMethod,
      gcashRefNo: gcashRefNo,
      transactionDate: receipt.created_at || new Date().toISOString(),
      processedBy: 'Admin Staff',
    };
    setSelectedReceiptData(data);
  };

  const extMember = localMember as any;

  const registrationDateText = useMemo(() => {
    if (!localMember.created_at) return 'N/A';
    const dateObj = new Date(localMember.created_at);
    return isNaN(dateObj.getTime()) ? 'N/A' : dateObj.toLocaleDateString();
  }, [localMember.created_at]);

  const receiptColumns = useMemo<Column<Receipt>[]>(
    () => [
      {
        key: 'id',
        header: 'Receipt #',
        sortable: true,
        render: (r) => (
          <span className="font-mono font-bold text-xs text-(--color-text)">
            {r.id}
          </span>
        ),
      },
      {
        key: 'item_description',
        header: 'Item / Plan',
        sortable: true,
        render: (r) => (
          <span className="font-bold text-xs text-(--color-text)">
            {r.item_description}
          </span>
        ),
      },
      {
        key: 'payment_method',
        header: 'Payment',
        sortable: true,
        render: (r) => (
          <div className="flex flex-col text-[10px]">
            <span className="font-semibold text-slate-600 dark:text-slate-300">
              {r.payment_method}
            </span>
            {r.gcash_ref_no && (
              <span className="font-mono text-slate-400 text-[9px]">
                Ref: {r.gcash_ref_no}
              </span>
            )}
          </div>
        ),
      },
      {
        key: 'amount',
        header: 'Amount',
        sortable: true,
        render: (r) => (
          <span className="font-mono font-black text-xs text-emerald-600 dark:text-emerald-400">
            ₱
            {Number(r.amount).toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>
        ),
      },
      {
        key: 'created_at',
        header: 'Date',
        sortable: true,
        render: (r) => (
          <span className="font-mono text-[10px] text-slate-400">
            {new Date(r.created_at || Date.now()).toLocaleDateString()}
          </span>
        ),
      },
      {
        key: 'actions',
        header: 'Action',
        headerClassName: 'text-right',
        cellClassName: 'text-right',
        render: (r) => (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleOpenReceipt(r);
            }}
            className="px-2.5 py-1 bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/20 rounded-lg text-[10px] font-heading font-bold uppercase tracking-wider cursor-pointer transition-colors inline-flex items-center gap-1"
            title="View Official Receipt"
          >
            <Eye className="w-3 h-3" />
            <span>View</span>
          </button>
        ),
      },
    ],
    []
  );

  const attendanceColumns = useMemo<Column<AttendanceRecord>[]>(
    () => [
      {
        key: 'check_in_time',
        header: 'Check-In Time',
        sortable: true,
        render: (att) => (
          <span className="font-mono font-bold text-xs text-(--color-text)">
            {new Date(att.check_in_time).toLocaleString()}
          </span>
        ),
      },
      {
        key: 'plan_name',
        header: 'Pass / Plan',
        sortable: true,
        render: (att) => (
          <span className="font-bold text-xs text-(--color-text)">
            {att.plan_name || 'Standard Pass'}
          </span>
        ),
      },
      {
        key: 'payment_method',
        header: 'Payment',
        sortable: true,
        render: (att) => (
          <span className="font-semibold text-slate-600 dark:text-slate-300 text-xs">
            {att.payment_method || 'Cash'}
          </span>
        ),
      },
      {
        key: 'entry_fee',
        header: 'Entry Fee',
        sortable: true,
        render: (att) => (
          <span
            className={`font-mono font-black text-xs ${
              att.entry_fee > 0
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-slate-400'
            }`}
          >
            {att.entry_fee > 0
              ? `₱${Number(att.entry_fee).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              : 'NO CHARGE (₱0)'}
          </span>
        ),
      },
      {
        key: 'staff_name',
        header: 'Staff',
        sortable: true,
        render: (att) => (
          <span className="font-mono text-xs text-slate-400">
            {att.staff_name || 'System'}
          </span>
        ),
      },
    ],
    []
  );

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[250] flex items-end sm:items-center justify-end bg-black/70 backdrop-blur-xs font-body text-xs text-(--color-text)"
      onClick={onClose}
    >
      <motion.div
        initial={{ x: '100%', y: 0 }}
        animate={{ x: 0, y: 0 }}
        exit={{ x: '100%', y: 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        className="w-full sm:max-w-2xl h-[92vh] sm:h-full bg-white dark:bg-[#16181a] border-t sm:border-t-0 sm:border-l border-(--border-color) rounded-t-3xl sm:rounded-none shadow-2xl flex flex-col justify-between overflow-hidden relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* COMPACT HEADER WITH CLICKABLE AVATAR */}
        <div className="p-4 sm:p-5 border-b border-(--border-color) space-y-3 select-none bg-(--bg-page) shrink-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-mono font-bold text-slate-400 uppercase tracking-widest">
              MEMBER PROFILE
            </span>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-(--bg-card) border border-(--border-color) text-slate-500 hover:text-(--color-text) transition-all cursor-pointer shadow-xs"
              title="Close panel"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-3 text-left">
            <div className="relative group">
              <MemberAvatar
                src={localMember.image_url || localMember.avatar_url}
                name={localMember.full_name}
                size={60}
                roundedClassName="rounded-2xl shadow-md border-2 border-white/20"
                isEditable={true}
                onEditClick={() => setIsPhotoModalOpen(true)}
                badgeTooltip="Click to view and change member photo"
              />
              <button
                type="button"
                onClick={() => setIsPhotoModalOpen(true)}
                className="absolute -bottom-1 -right-1 p-1 bg-blue-600 hover:bg-blue-500 text-white rounded-lg shadow-md cursor-pointer border border-white/20 transition-transform active:scale-95"
                title="Change photo"
              >
                <Camera className="w-3 h-3" />
              </button>
            </div>

            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <h3 className="text-base sm:text-lg font-bold text-(--color-text) leading-tight truncate">
                  {localMember.full_name}
                </h3>
                <span
                  className={`px-2 py-0.5 rounded-full text-[9px] font-heading font-black uppercase tracking-wider border ${
                    localMember.status === 'Active'
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                      : localMember.status === 'Suspended'
                        ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                        : 'bg-slate-500/10 text-slate-500 border-slate-500/20'
                  }`}
                >
                  {localMember.status || 'Active'}
                </span>

                {isMinor && (
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-bold font-mono bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                    Minor ({calculatedAge} yrs)
                  </span>
                )}
              </div>
              <p className="font-mono text-xs text-slate-400 truncate">
                {localMember.member_id} • Registered {registrationDateText}
              </p>
            </div>
          </div>

          {/* STATS CAROUSEL */}
          <div className="flex sm:grid sm:grid-cols-4 gap-2.5 overflow-x-auto scrollbar-none pt-1">
            <div className="min-w-32.5 flex-1 p-2.5 bg-(--bg-card) border border-(--border-color) rounded-2xl text-center shadow-xs shrink-0">
              <span className="text-[9px] font-bold text-slate-400 uppercase block">
                Total Spent
              </span>
              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 font-mono block mt-1">
                ₱{stats.totalSpent.toLocaleString()}
              </span>
            </div>

            <div className="min-w-27.5 flex-1 p-2.5 bg-(--bg-card) border border-(--border-color) rounded-2xl text-center shadow-xs shrink-0">
              <span className="text-[9px] font-bold text-slate-400 uppercase block">
                Check-ins
              </span>
              <span className="text-xs font-bold text-(--color-text) block mt-1">
                {stats.totalVisits} visits
              </span>
            </div>

            {/* Stats Carousel Plan Card */}
            <div className="min-w-35 flex-1 p-2.5 bg-(--bg-card) border border-(--border-color) rounded-2xl text-center shadow-xs shrink-0">
              <span className="text-[9px] font-bold text-slate-400 uppercase block">
                Active Plan
              </span>
              <span
                className={`text-xs font-bold truncate block mt-1 ${
                  activeContract
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : isRecentlyExpired
                      ? 'text-rose-600 dark:text-rose-400'
                      : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                {activeContract
                  ? 'Active'
                  : targetSubForDisplay?.status === 'Voided'
                    ? 'Voided'
                    : isRecentlyExpired
                      ? 'Expired'
                      : 'No Subscription'}
              </span>
            </div>

            <div className="min-w-27.5 flex-1 p-2.5 bg-(--bg-card) border border-(--border-color) rounded-2xl text-center shadow-xs shrink-0">
              <span className="text-[9px] font-bold text-slate-400 uppercase block">
                Reissued
              </span>
              <span className="text-xs font-bold text-amber-600 dark:text-amber-400 block mt-1">
                {stats.cardReplacements} cards
              </span>
            </div>
          </div>
        </div>

        {/* STICKY HORIZONTAL TABS BAR */}
        <div className="sticky top-0 z-20 border-b border-(--border-color) bg-(--bg-card) px-3 sm:px-4 flex items-center gap-1.5 overflow-x-auto whitespace-nowrap scrollbar-none py-2 select-none shrink-0">
          {[
            'Overview',
            'Contracts & Billing',
            'Cards',
            'Attendance',
            'Notes',
          ].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`min-h-9.5 px-3.5 py-2 rounded-xl text-xs font-heading font-bold uppercase tracking-wider transition-all shrink-0 cursor-pointer ${
                activeTab === tab
                  ? 'bg-[#123c73] dark:bg-[#bf0202] text-white shadow-xs'
                  : 'bg-slate-500/5 border border-(--border-color) text-slate-400 hover:text-(--color-text)'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* TAB CONTENTS CONTAINER */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 pb-28 sm:pb-8">
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'Overview' && (
            <div className="space-y-4 text-left animate-fade-in">
              {/* RENEW / SUBSCRIBE BANNER */}
              {(!activeContract || queuedContract) && (
                <div
                  className={`p-4 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 select-none shadow-xs border ${
                    expiredDaysText
                      ? 'bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400'
                      : queuedContract
                        ? 'bg-blue-500/10 border-blue-500/20 text-blue-600 dark:text-blue-400'
                        : 'bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400'
                  }`}
                >
                  <div className="space-y-0.5">
                    <span className="font-heading font-bold text-xs block">
                      {expiredDaysText
                        ? `Subscription Expired (${expiredDaysText})`
                        : queuedContract
                          ? `Renewal Scheduled: ${queuedContract.plan_name}`
                          : 'No Active Subscription (Profile Only)'}
                    </span>
                    <span className="text-xs text-slate-400 font-medium block">
                      {expiredDaysText
                        ? 'This contract expired. Renew to grant gym check-in access.'
                        : queuedContract
                          ? `Scheduled to activate on ${new Date(queuedContract.start_date).toLocaleDateString()}.`
                          : 'Enroll this member to grant gym facility check-in access.'}
                    </span>
                  </div>

                  {!queuedContract && (
                    <button
                      type="button"
                      onClick={handleEnrollOrRenewClick}
                      title={
                        isSuspended
                          ? 'Member account is suspended. Activate member first.'
                          : !isSessionOpen
                            ? 'Cash drawer session is closed. Open a cash session in Cash Management.'
                            : expiredDaysText
                              ? 'Renew Subscription'
                              : 'Subscribe Plan'
                      }
                      className={`w-full sm:w-auto min-h-11 px-4 py-2.5 rounded-xl text-xs font-heading font-bold uppercase tracking-wider border-none shadow-sm flex items-center justify-center gap-2 shrink-0 transition-colors ${
                        isEnrollDisabled
                          ? 'bg-slate-400 dark:bg-zinc-700 text-white/70 opacity-60 cursor-not-allowed'
                          : 'bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer'
                      }`}
                    >
                      {isEnrollDisabled ? (
                        <Lock className="w-4 h-4" />
                      ) : (
                        <CreditCard className="w-4 h-4" />
                      )}
                      <span>
                        {expiredDaysText
                          ? 'Renew Subscription'
                          : 'Subscribe Plan'}
                      </span>
                    </button>
                  )}
                </div>
              )}

              {/* PHYSICAL MEMBERSHIP CARD TRACKING WIDGET */}
              <div className="p-4 bg-(--bg-page) border border-(--border-color) rounded-2xl space-y-3 shadow-xs">
                <div className="flex justify-between items-center border-b border-(--border-color) pb-2.5">
                  <h4 className="font-heading text-xs text-slate-600 dark:text-slate-300 uppercase tracking-wider flex items-center gap-2 font-bold">
                    <CreditCard className="w-4 h-4 text-blue-500" /> Physical
                    Membership Card
                  </h4>
                  {currentCard && currentCard.card_type !== 'None' && (
                    <span className="text-[10px] font-mono font-bold text-slate-400">
                      Token: {currentCard.card_number}
                    </span>
                  )}
                </div>

                {!currentCard || currentCard.card_type === 'None' ? (
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
                    <span className="text-slate-400">
                      No security badge registered for this member.
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        if (isSuspended) {
                          toast.error(
                            'Cannot issue card: Member account is suspended.'
                          );
                          return;
                        }
                        if (!isSessionOpen) {
                          toast.warning(
                            'Cannot issue card: Cash drawer session is closed. Open a cash session in Cash Management first.'
                          );
                          return;
                        }
                        setActiveTab('Cards');
                      }}
                      className={`px-3.5 py-2 rounded-xl text-xs font-heading font-bold uppercase transition-colors ${
                        isEnrollDisabled
                          ? 'bg-slate-400 dark:bg-zinc-700 text-white/70 opacity-60 cursor-not-allowed'
                          : 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer'
                      }`}
                    >
                      Issue Card
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3 text-xs">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div className="p-3 bg-(--bg-card) border border-(--border-color) rounded-xl flex items-center justify-between">
                        <span className="text-slate-400 font-medium">
                          Payment:
                        </span>
                        {currentCard.payment_status === 'PAID' ? (
                          <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />{' '}
                            PAID (₱{currentCard.card_fee_paid || cardFeeAmount}
                            .00)
                          </span>
                        ) : (
                          <span className="font-mono font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />{' '}
                            UNPAID (₱0.00)
                          </span>
                        )}
                      </div>

                      <div className="p-3 bg-(--bg-card) border border-(--border-color) rounded-xl flex items-center justify-between">
                        <span className="text-slate-400 font-medium">
                          Claim Status:
                        </span>
                        {currentCard.claim_status === 'CLAIMED' ? (
                          <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />{' '}
                            CLAIMED & HANDED OVER
                          </span>
                        ) : currentCard.claim_status === 'UNCLAIMED' ? (
                          <span className="font-mono font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />{' '}
                            PENDING PICKUP
                          </span>
                        ) : (
                          <span className="font-mono font-medium text-slate-400">
                            DIGITAL ONLY
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1 border-t border-(--border-color)">
                      <div className="text-[11px] text-slate-400">
                        {currentCard.claimed_at ? (
                          <span>
                            Claimed on{' '}
                            {new Date(
                              currentCard.claimed_at
                            ).toLocaleDateString()}{' '}
                            {currentCard.claimed_by
                              ? `by ${currentCard.claimed_by}`
                              : ''}
                          </span>
                        ) : currentCard.payment_status === 'PAID' ? (
                          <span className="text-amber-600 dark:text-amber-400 font-medium">
                            Card fee paid. Ready for handover at the front desk.
                          </span>
                        ) : (
                          <span>
                            Card printing fee of ₱{cardFeeAmount}.00 has not
                            been paid yet.
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        {currentCard.payment_status === 'PAID' &&
                          currentCard.claim_status === 'UNCLAIMED' && (
                            <button
                              type="button"
                              onClick={() => {
                                setClaimNotesInput('');
                                setIsMarkClaimModalOpen(true);
                              }}
                              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-heading font-bold uppercase cursor-pointer flex items-center gap-1.5 shadow-xs"
                            >
                              <Check className="w-3.5 h-3.5" /> Mark as Claimed
                            </button>
                          )}

                        {currentCard.claim_status === 'CLAIMED' && (
                          <button
                            type="button"
                            onClick={() => setIsUndoClaimModalOpen(true)}
                            className="px-3 py-2 bg-slate-500/10 hover:bg-amber-500/20 text-slate-600 dark:text-slate-300 hover:text-amber-600 dark:hover:text-amber-400 border border-(--border-color) rounded-xl text-xs font-heading font-bold uppercase cursor-pointer flex items-center gap-1.5 transition-colors"
                            title="Accidentally marked as claimed? Revert back to Unclaimed state"
                          >
                            <Undo2 className="w-3.5 h-3.5 text-amber-500" />
                            <span>Undo Claim</span>
                          </button>
                        )}

                        {currentCard.payment_status !== 'PAID' && (
                          <button
                            type="button"
                            onClick={() => setIsPayCardModalOpen(true)}
                            className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-heading font-bold uppercase cursor-pointer flex items-center gap-1.5 shadow-xs"
                          >
                            <CreditCard className="w-3.5 h-3.5" /> Pay Card Fee
                            (₱{cardFeeAmount})
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => setActiveTab('Cards')}
                          className="px-3 py-2 bg-slate-200 dark:bg-zinc-800 hover:bg-slate-300 dark:hover:bg-zinc-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-heading font-bold uppercase cursor-pointer"
                        >
                          Manage Card
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* PERSONAL BIO & EMERGENCY CONTACT CARDS */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Personal Bio Card */}
                <div className="p-4 bg-(--bg-page) border border-(--border-color) rounded-2xl space-y-3 shadow-xs">
                  <div className="flex justify-between items-center border-b border-(--border-color) pb-2.5">
                    <h4 className="font-heading text-xs text-slate-600 dark:text-slate-300 uppercase tracking-wider flex items-center gap-2 font-bold">
                      <User className="w-4 h-4 text-blue-500" /> Personal
                      Information
                    </h4>
                    {isEditing && (
                      <span className="text-[10px] font-mono font-bold bg-blue-500/10 text-blue-500 px-2 py-0.5 rounded-full uppercase">
                        Editing
                      </span>
                    )}
                  </div>

                  {!isEditing ? (
                    <div className="space-y-2.5 text-xs">
                      <div className="flex justify-between items-center py-1 border-b border-dashed border-(--border-color)">
                        <span className="text-slate-400">Full Name</span>
                        <span className="text-(--color-text) font-bold">
                          {localMember.full_name || 'N/A'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-1 border-b border-dashed border-(--border-color)">
                        <span className="text-slate-400">Gender / Age</span>
                        <span className="text-(--color-text) font-medium">
                          {localMember.gender || 'N/A'} •{' '}
                          {calculatedAge
                            ? `${calculatedAge} yrs (${isMinor ? 'Minor' : 'Adult'})`
                            : 'N/A'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-1 border-b border-dashed border-(--border-color)">
                        <span className="text-slate-400">Birthdate</span>
                        <span className="text-(--color-text) font-mono">
                          {localMember.birthday || 'N/A'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-1 border-b border-dashed border-(--border-color)">
                        <span className="text-slate-400">Contact Phone</span>
                        <span className="text-(--color-text) font-mono">
                          {localMember.phone || 'N/A'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-1 border-b border-dashed border-(--border-color)">
                        <span className="text-slate-400">Email</span>
                        <span className="text-(--color-text) truncate max-w-45">
                          {localMember.email || 'N/A'}
                        </span>
                      </div>
                      <div className="pt-1">
                        <span className="text-slate-400 block mb-0.5">
                          Home Address
                        </span>
                        <span className="text-(--color-text) font-medium leading-snug block">
                          {localMember.address || 'N/A'}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3 text-xs">
                      <div>
                        <label className="text-slate-400 text-xs font-medium block mb-1">
                          Full Name *
                        </label>
                        <input
                          type="text"
                          value={editFullName}
                          onChange={(e) => setEditFullName(e.target.value)}
                          className="w-full p-2.5 bg-(--bg-card) border border-(--border-color) rounded-xl font-bold text-xs outline-none"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-slate-400 text-xs font-medium block mb-1">
                            Gender
                          </label>
                          <select
                            value={editGender}
                            onChange={(e) => setEditGender(e.target.value)}
                            className="w-full p-2.5 bg-(--bg-card) border border-(--border-color) rounded-xl text-xs outline-none"
                          >
                            <option value="Male">Male</option>
                            <option value="Female">Female</option>
                            <option value="Non-Binary">Non-Binary</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-slate-400 text-xs font-medium block mb-1">
                            Birthday
                          </label>
                          <input
                            type="date"
                            value={editBirthday}
                            onChange={(e) => setEditBirthday(e.target.value)}
                            className="w-full p-2.5 bg-(--bg-card) border border-(--border-color) rounded-xl font-mono text-xs outline-none"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-slate-400 text-xs font-medium block mb-1">
                          Contact Phone *
                        </label>
                        <input
                          type="text"
                          value={editPhone}
                          onChange={(e) =>
                            setEditPhone(e.target.value.replace(/\D/g, ''))
                          }
                          maxLength={11}
                          className="w-full p-2.5 bg-(--bg-card) border border-(--border-color) rounded-xl font-mono text-xs outline-none"
                          placeholder="09171234567"
                        />
                      </div>
                      <div>
                        <label className="text-slate-400 text-xs font-medium block mb-1">
                          Email Address
                        </label>
                        <input
                          type="email"
                          value={editEmail}
                          onChange={(e) => setEditEmail(e.target.value)}
                          className="w-full p-2.5 bg-(--bg-card) border border-(--border-color) rounded-xl text-xs outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-slate-400 text-xs font-medium block mb-1">
                          Home Address
                        </label>
                        <input
                          type="text"
                          value={editAddress}
                          onChange={(e) => setEditAddress(e.target.value)}
                          className="w-full p-2.5 bg-(--bg-card) border border-(--border-color) rounded-xl text-xs outline-none"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Emergency Contact Card */}
                <div className="p-4 bg-(--bg-page) border border-(--border-color) rounded-2xl space-y-3 shadow-xs">
                  <h4 className="font-heading text-xs text-rose-500 uppercase tracking-wider flex items-center gap-2 font-bold border-b border-(--border-color) pb-2.5">
                    <ShieldAlert className="w-4 h-4 text-rose-500" /> Emergency
                    Contact
                  </h4>

                  {!isEditing ? (
                    <div className="space-y-2.5 text-xs">
                      <div className="flex justify-between items-center py-1 border-b border-dashed border-(--border-color)">
                        <span className="text-slate-400">Contact Person</span>
                        <span className="text-(--color-text) font-bold">
                          {localMember.emergency_contact_name || 'N/A'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-1 border-b border-dashed border-(--border-color)">
                        <span className="text-slate-400">Relationship</span>
                        <span className="text-(--color-text) font-medium">
                          {localMember.relationship || 'N/A'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-1">
                        <span className="text-slate-400">Emergency Phone</span>
                        <span className="text-(--color-text) font-mono">
                          {localMember.emergency_contact_phone || 'N/A'}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3 text-xs">
                      <div>
                        <label className="text-slate-400 text-xs font-medium block mb-1">
                          Contact Name
                        </label>
                        <input
                          type="text"
                          value={editEmergencyName}
                          onChange={(e) => setEditEmergencyName(e.target.value)}
                          className="w-full p-2.5 bg-(--bg-card) border border-(--border-color) rounded-xl font-bold text-xs outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-slate-400 text-xs font-medium block mb-1">
                          Relationship
                        </label>
                        <select
                          value={editRelationship}
                          onChange={(e) => setEditRelationship(e.target.value)}
                          className="w-full p-2.5 border border-(--border-color) bg-(--bg-card) rounded-xl text-xs text-(--color-text) outline-none cursor-pointer font-medium"
                        >
                          <option value="">Select Relationship *</option>
                          <optgroup label="Immediate Family">
                            <option value="Mother">Mother</option>
                            <option value="Father">Father</option>
                            <option value="Spouse / Partner">
                              Spouse / Partner
                            </option>
                            <option value="Husband">Husband</option>
                            <option value="Wife">Wife</option>
                            <option value="Brother">Brother</option>
                            <option value="Sister">Sister</option>
                            <option value="Son">Son</option>
                            <option value="Daughter">Daughter</option>
                          </optgroup>
                          <optgroup label="Extended Family">
                            <option value="Grandmother">Grandmother</option>
                            <option value="Grandfather">Grandfather</option>
                            <option value="Aunt">Aunt</option>
                            <option value="Uncle">Uncle</option>
                            <option value="Cousin">Cousin</option>
                            <option value="Relative">Other Relative</option>
                          </optgroup>
                          <optgroup label="Guardian & Other">
                            <option value="Legal Guardian">
                              Legal Guardian
                            </option>
                            <option value="Friend / Colleague">
                              Friend / Colleague
                            </option>
                            <option value="Other">Other</option>
                          </optgroup>
                        </select>
                      </div>
                      <div>
                        <label className="text-slate-400 text-xs font-medium block mb-1">
                          Emergency Phone
                        </label>
                        <input
                          type="text"
                          value={editEmergencyPhone}
                          onChange={(e) =>
                            setEditEmergencyPhone(
                              e.target.value.replace(/\D/g, '')
                            )
                          }
                          maxLength={11}
                          className="w-full p-2.5 bg-(--bg-card) border border-(--border-color) rounded-xl font-mono text-xs outline-none"
                          placeholder="09181234567"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* SAVE EDITS BANNER */}
              {isEditing && (
                <div className="p-3.5 bg-blue-500/10 border border-blue-500/20 rounded-2xl flex flex-wrap justify-between items-center gap-2">
                  <span className="text-xs font-semibold text-blue-500">
                    Editing member profile details.
                  </span>
                  <div className="flex gap-2 w-full sm:w-auto">
                    <button
                      type="button"
                      onClick={() => setIsEditing(false)}
                      className="flex-1 sm:flex-initial px-4 py-2 bg-slate-200 dark:bg-zinc-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-heading font-bold uppercase cursor-pointer border-none"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveProfileChanges}
                      className="flex-1 sm:flex-initial px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-heading font-bold uppercase cursor-pointer border-none shadow-md flex items-center justify-center gap-1.5"
                    >
                      <Save className="w-3.5 h-3.5" /> Save Changes
                    </button>
                  </div>
                </div>
              )}

              {/* PARENT / GUARDIAN VERIFICATION PANEL */}
              {(isMinor || extMember.parent_name) && (
                <div className="p-4 bg-(--bg-page) border border-amber-500/30 rounded-2xl space-y-3 shadow-xs">
                  <div className="flex items-center justify-between border-b border-(--border-color) pb-2.5">
                    <span className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-widest flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-amber-500" /> Parent
                      / Guardian Consent
                    </span>
                    <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20 font-bold">
                      ✓ E-Consent Verified
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                    <div className="flex justify-between items-center py-1 border-b border-dashed border-(--border-color)">
                      <span className="text-slate-400">Parent Name</span>
                      <span className="text-amber-600 dark:text-amber-300 font-bold">
                        {extMember.parent_name || 'N/A'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-dashed border-(--border-color)">
                      <span className="text-slate-400">Relationship</span>
                      <span className="text-(--color-text) font-medium">
                        {extMember.parent_relationship || 'Guardian'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-dashed border-(--border-color)">
                      <span className="text-slate-400">Parent Phone</span>
                      <span className="text-amber-600 dark:text-amber-300 font-mono font-bold">
                        {extMember.parent_phone || 'N/A'}
                      </span>
                    </div>
                    {extMember.parent_email && (
                      <div className="flex justify-between items-center py-1 border-b border-dashed border-(--border-color)">
                        <span className="text-slate-400">Parent Email</span>
                        <span className="text-(--color-text) truncate max-w-40">
                          {extMember.parent_email}
                        </span>
                      </div>
                    )}
                  </div>

                  {(extMember.applicant_signature ||
                    extMember.parent_signature) && (
                    <div className="pt-2 border-t border-(--border-color) space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-400 font-bold">
                          Digital Signatures
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowSignatures(!showSignatures)}
                          className="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/20 rounded-xl text-xs font-bold uppercase tracking-wider cursor-pointer flex items-center gap-1.5 transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>
                            {showSignatures
                              ? 'Hide Signatures'
                              : 'View Signatures'}
                          </span>
                        </button>
                      </div>

                      {showSignatures && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 animate-fade-in">
                          <div>
                            <span className="text-[10px] text-slate-400 font-bold uppercase block mb-1 flex items-center gap-1">
                              <FileSignature className="w-3.5 h-3.5 text-blue-500" />{' '}
                              Applicant Signature
                            </span>
                            {extMember.applicant_signature ? (
                              <div className="p-2 bg-white rounded-xl border border-slate-300 h-20 flex items-center justify-center">
                                <img
                                  src={extMember.applicant_signature}
                                  alt="Applicant Signature"
                                  className="max-h-full max-w-full object-contain"
                                />
                              </div>
                            ) : (
                              <div className="p-3 bg-(--bg-card) rounded-xl border border-(--border-color) text-xs text-slate-400 italic text-center">
                                No e-signature attached
                              </div>
                            )}
                          </div>

                          <div>
                            <span className="text-[10px] text-slate-400 font-bold uppercase block mb-1 flex items-center gap-1">
                              <FileSignature className="w-3.5 h-3.5 text-amber-500" />{' '}
                              Parent Signature
                            </span>
                            {extMember.parent_signature ? (
                              <div className="p-2 bg-white rounded-xl border border-slate-300 h-20 flex items-center justify-center">
                                <img
                                  src={extMember.parent_signature}
                                  alt="Parent Signature"
                                  className="max-h-full max-w-full object-contain"
                                />
                              </div>
                            ) : (
                              <div className="p-3 bg-(--bg-card) rounded-xl border border-(--border-color) text-xs text-slate-400 italic text-center">
                                No e-signature attached
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: CONTRACTS & BILLING */}
          {activeTab === 'Contracts & Billing' && (
            <div className="space-y-6 text-left animate-fade-in">
              {/* STATUS SUBSCRIPTION */}
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-(--border-color) pb-2">
                  <span className="text-xs font-heading font-bold tracking-wider text-slate-600 dark:text-slate-300 uppercase flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-blue-500" />
                    STATUS SUBSCRIPTION
                  </span>
                  {targetSubForDisplay && (
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase border ${
                        activeContract
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                          : isRecentlyExpired
                            ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
                            : 'bg-slate-500/10 text-slate-500 border-slate-500/20'
                      }`}
                    >
                      {activeContract
                        ? 'ACTIVE'
                        : isRecentlyExpired
                          ? `EXPIRED (${expiredDaysText})`
                          : 'NO SUBSCRIPTION'}
                    </span>
                  )}
                </div>

                {!targetSubForDisplay ? (
                  <div className="p-6 bg-(--bg-page) border border-(--border-color) rounded-2xl text-center space-y-2">
                    <p className="text-xs text-slate-400">
                      No subscription contract found for this member.
                    </p>
                    <button
                      type="button"
                      onClick={handleEnrollOrRenewClick}
                      title={
                        isSuspended
                          ? 'Member account is suspended. Activate member first.'
                          : !isSessionOpen
                            ? 'Cash drawer session is closed. Open a cash session in Cash Management.'
                            : 'Enroll Subscription'
                      }
                      className={`px-3.5 py-1.5 text-xs font-heading font-bold uppercase rounded-xl border-none transition-colors flex items-center justify-center gap-1.5 mx-auto ${
                        isEnrollDisabled
                          ? 'bg-slate-400 dark:bg-zinc-700 text-white/70 opacity-60 cursor-not-allowed'
                          : 'bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer'
                      }`}
                    >
                      {isEnrollDisabled ? (
                        <Lock className="w-3.5 h-3.5" />
                      ) : null}
                      <span>Enroll Subscription</span>
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* CURRENT SUBSCRIPTION */}
                    <div
                      className={`p-4 rounded-2xl space-y-2.5 shadow-xs relative overflow-hidden border ${
                        activeContract
                          ? 'bg-emerald-500/5 dark:bg-emerald-500/10 border-emerald-500/30'
                          : expiredDaysText
                            ? 'bg-rose-500/5 dark:bg-rose-500/10 border-rose-500/30'
                            : 'bg-amber-500/5 dark:bg-amber-500/10 border-amber-500/30'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-(--border-color) pb-2">
                        <div className="flex items-center gap-2">
                          {activeContract ? (
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                          ) : (
                            <Clock className="w-4 h-4 text-rose-500 shrink-0" />
                          )}
                          <h5 className="font-bold text-sm text-(--color-text)">
                            {targetSubForDisplay.plan_name ||
                              (targetSubForDisplay.plan_type === 'yearly'
                                ? 'Yearly Membership'
                                : 'Monthly Membership')}
                          </h5>
                        </div>

                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase tracking-wider border ${
                            activeContract
                              ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                              : 'bg-rose-500/20 text-rose-600 dark:text-rose-400 border-rose-500/30'
                          }`}
                        >
                          {activeContract
                            ? 'Active Contract'
                            : `Expired (${expiredDaysText})`}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                        <div>
                          <span className="text-[10px] text-slate-400 font-bold uppercase block">
                            Contract ID
                          </span>
                          <span className="font-mono text-xs font-bold text-(--color-text) block">
                            {targetSubForDisplay.id}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 font-bold uppercase block">
                            Receipt #
                          </span>
                          <span className="font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400 block">
                            {targetSubForDisplay.receipt_number || 'N/A'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 font-bold uppercase block">
                            Price Paid
                          </span>
                          <span className="font-mono text-xs font-black text-(--color-text) block">
                            ₱
                            {Number(
                              targetSubForDisplay.price || 0
                            ).toLocaleString()}
                            .00 ({targetSubForDisplay.payment_method})
                          </span>
                        </div>
                        <div className="col-span-2 sm:col-span-3 pt-1 border-t border-(--border-color) flex flex-wrap justify-between items-center text-[11px]">
                          <span className="text-slate-400 font-mono">
                            Validity:{' '}
                            <strong>
                              {new Date(
                                targetSubForDisplay.start_date
                              ).toLocaleDateString()}
                            </strong>{' '}
                            to{' '}
                            <strong>
                              {new Date(
                                targetSubForDisplay.end_date
                              ).toLocaleDateString()}
                            </strong>
                          </span>
                          {activeContract ? (
                            <span className="font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                              {Math.max(
                                0,
                                Math.ceil(
                                  (new Date(
                                    targetSubForDisplay.end_date
                                  ).getTime() -
                                    Date.now()) /
                                    (1000 * 60 * 60 * 24)
                                )
                              )}{' '}
                              Days Remaining
                            </span>
                          ) : (
                            <span className="font-bold text-rose-500 font-mono">
                              Expired {expiredDaysText}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Benefit Fee Note */}
                      <div className="p-2 bg-slate-500/10 rounded-xl text-[10px] font-mono flex items-center justify-between text-slate-400">
                        <span>Check-In Entry Benefit:</span>
                        <strong className="text-(--color-text) font-bold">
                          {targetSubForDisplay.plan_type === 'yearly'
                            ? `Yearly Sub Entry (₱${settings.yearly_member_checkin_fee})`
                            : `Monthly Sub Entry (₱${settings.monthly_member_checkin_fee})`}
                        </strong>
                      </div>
                    </div>

                    {/* QUEUED RENEWAL CONTRACT CARD */}
                    {queuedContract && (
                      <div className="p-4 rounded-2xl bg-blue-500/5 border border-blue-500/30 space-y-2.5 shadow-xs relative overflow-hidden">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-blue-500/20 pb-2">
                          <div className="flex items-center gap-2">
                            <CalendarCheck className="w-4 h-4 text-blue-500 shrink-0" />
                            <h5 className="font-bold text-sm text-(--color-text)">
                              Upcoming Queued Renewal:{' '}
                              {queuedContract.plan_name ||
                                (queuedContract.plan_type === 'yearly'
                                  ? 'Yearly Membership'
                                  : 'Monthly Membership')}
                            </h5>
                          </div>

                          <span className="px-2.5 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase tracking-wider bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/30">
                            Queued Plan
                          </span>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                          <div>
                            <span className="text-[10px] text-slate-400 font-bold uppercase block">
                              Scheduled Start
                            </span>
                            <span className="font-mono text-xs font-bold text-blue-600 dark:text-blue-400 block">
                              {new Date(
                                queuedContract.start_date
                              ).toLocaleDateString()}
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 font-bold uppercase block">
                              Receipt #
                            </span>
                            <span className="font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400 block">
                              {queuedContract.receipt_number || 'N/A'}
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 font-bold uppercase block">
                              Amount Paid
                            </span>
                            <span className="font-mono text-xs font-black text-(--color-text) block">
                              ₱
                              {Number(
                                queuedContract.price || 0
                              ).toLocaleString()}
                              .00
                            </span>
                          </div>
                          <div className="col-span-2 sm:col-span-3 pt-1 border-t border-(--border-color) flex justify-between items-center text-[11px] font-mono text-slate-400">
                            <span>
                              Scheduled Validity:{' '}
                              <strong>
                                {new Date(
                                  queuedContract.start_date
                                ).toLocaleDateString()}
                              </strong>{' '}
                              to{' '}
                              <strong>
                                {new Date(
                                  queuedContract.end_date
                                ).toLocaleDateString()}
                              </strong>
                            </span>
                            <span className="font-bold text-blue-500">
                              Will activate automatically
                            </span>
                          </div>
                        </div>

                        <div className="p-2 bg-blue-500/10 rounded-xl text-[10px] font-mono flex items-center justify-between text-blue-600 dark:text-blue-400">
                          <span>Upcoming Entry Benefit:</span>
                          <strong className="font-bold">
                            {queuedContract.plan_type === 'yearly'
                              ? `Yearly Sub Entry (₱${settings.yearly_member_checkin_fee})`
                              : `Monthly Sub Entry (₱${settings.monthly_member_checkin_fee})`}
                          </strong>
                        </div>
                      </div>
                    )}

                    {/* RENEW / EXTEND PLAN BUTTON */}
                    {!queuedContract && (
                      <div className="pt-2">
                        <button
                          type="button"
                          onClick={handleEnrollOrRenewClick}
                          title={
                            isSuspended
                              ? 'Member account is suspended. Activate member first.'
                              : !isSessionOpen
                                ? 'Cash drawer session is closed. Open a cash session in Cash Management.'
                                : activeContract
                                  ? 'Schedule Plan Renewal / Extension'
                                  : 'Renew Subscription'
                          }
                          className={`px-4 py-2.5 rounded-xl text-xs font-heading font-bold uppercase tracking-wider border-none shadow-sm flex items-center gap-2 transition-colors ${
                            isEnrollDisabled
                              ? 'bg-slate-400 dark:bg-zinc-700 text-white/70 opacity-60 cursor-not-allowed'
                              : 'bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer'
                          }`}
                        >
                          {isEnrollDisabled ? (
                            <Lock className="w-4 h-4" />
                          ) : (
                            <CreditCard className="w-4 h-4" />
                          )}
                          <span>
                            {activeContract
                              ? 'Schedule Plan Renewal / Extension'
                              : 'Renew Subscription'}
                          </span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* DANGER ZONE: VOID SUBSCRIPTION (ADMIN ONLY) */}
              {isAdmin && (activeContract || queuedContract) && (
                <div className="pt-2 border-t border-(--border-color) space-y-3 select-none">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-heading font-bold tracking-wider text-rose-600 dark:text-rose-400 uppercase">
                      DANGER ZONE
                    </span>
                    <div className="h-px flex-1 bg-rose-500/20" />
                  </div>

                  {(() => {
                    const subToVoid = queuedContract || activeContract;
                    const eligibility = getVoidEligibility(subToVoid);

                    if (!eligibility.eligible) {
                      return (
                        <div className="p-3.5 bg-slate-100 dark:bg-zinc-900/80 border border-slate-200 dark:border-zinc-800 rounded-2xl text-left space-y-1">
                          <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 font-bold text-xs uppercase">
                            <Lock className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                            <span>Void Subscription Unavailable</span>
                          </div>
                          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                            🔒 {eligibility.reason}
                          </p>
                        </div>
                      );
                    }

                    return (
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 bg-rose-500/5 dark:bg-rose-500/10 border border-rose-500/20 rounded-2xl gap-3">
                        <div className="text-left space-y-0.5">
                          <span className="font-bold text-xs text-rose-600 dark:text-rose-400 block">
                            Void{' '}
                            {queuedContract
                              ? 'Queued Renewal'
                              : 'Active Subscription'}
                          </span>
                          <span className="text-xs text-slate-500 dark:text-slate-400 block">
                            Cancel contract ({subToVoid?.id}) and purge its
                            specific receipt while keeping historical receipts
                            safe.
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setTargetVoidSub(subToVoid || null);
                            setIsVoidModalOpen(true);
                          }}
                          className="w-full sm:w-auto min-h-11 px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-heading font-bold uppercase tracking-wider cursor-pointer border-none shadow-sm transition-colors shrink-0 flex items-center justify-center gap-1.5"
                        >
                          <span>Void Contract</span>
                        </button>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* INVOICES & RECEIPTS TABLE */}
              <div className="space-y-3 pt-4 border-t border-(--border-color)">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-heading font-bold tracking-wider text-slate-600 dark:text-slate-300 uppercase flex items-center gap-2">
                    <ReceiptIcon className="w-4 h-4 text-emerald-500" />
                    INVOICES & RECEIPTS
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">
                    {receipts.length}{' '}
                    {receipts.length === 1 ? 'Record' : 'Records'}
                  </span>
                </div>

                {receipts.length === 0 ? (
                  <div className="p-6 bg-(--bg-page) border border-(--border-color) rounded-2xl text-center text-slate-400 text-xs">
                    No official receipt invoices stored for this client.
                  </div>
                ) : (
                  <Table<Receipt>
                    data={receipts}
                    columns={receiptColumns}
                    itemsPerPage={5}
                    searchKeys={['id', 'item_description', 'payment_method']}
                    searchPlaceholder="Search receipt # or description..."
                  />
                )}
              </div>
            </div>
          )}

          {/* TAB 3: CARDS & DIGITAL CARD */}
          {activeTab === 'Cards' &&
            (() => {
              const cardExpIso =
                currentCard?.expires_at ||
                (currentCard?.issued_at
                  ? new Date(
                      new Date(currentCard.issued_at).setFullYear(
                        new Date(currentCard.issued_at).getFullYear() + 3
                      )
                    ).toISOString()
                  : null);

              const cardExpDateStr = cardExpIso
                ? new Date(cardExpIso).toLocaleDateString()
                : '3 YEARS FROM ISSUE';

              const isCardExpired = cardExpIso
                ? new Date(cardExpIso) < new Date()
                : false;

              const issueDateStr = currentCard?.issued_at
                ? new Date(currentCard.issued_at).toLocaleDateString()
                : new Date().toLocaleDateString();

              const qrPayload =
                currentCard?.card_number || localMember.member_id;
              const qrImg = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(qrPayload)}`;

              const handleSwitchCardTypeInDb = async (
                type: 'QR' | 'Manual'
              ) => {
                try {
                  await cardService.issue(
                    localMember.member_id,
                    type,
                    'Admin Staff'
                  );
                  toast.success(`Member security card format set to ${type}.`);
                  setSelectedCardFormat(type);
                  setRefreshKey((prev) => prev + 1);
                  await loadProfileCollections();
                  onMutationSuccess();
                } catch (err: any) {
                  toast.error(err.message || 'Failed to update card format.');
                }
              };

              return (
                <div className="space-y-4 text-left animate-fade-in">
                  {/* CARD TYPE FORMAT SEGMENTED SWITCHER */}
                  <div className="grid grid-cols-2 gap-2 bg-(--bg-page) p-1.5 rounded-2xl border border-(--border-color) shadow-xs">
                    <button
                      type="button"
                      onClick={() => setSelectedCardFormat('QR')}
                      className={`py-2.5 px-3 rounded-xl font-heading text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-all ${
                        selectedCardFormat === 'QR'
                          ? 'bg-[#123c73] dark:bg-[#bf0202] text-white shadow-md'
                          : 'text-slate-400 hover:text-(--color-text)'
                      }`}
                    >
                      <QrCode className="w-4 h-4" />
                      <span>Digital QR Card</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSelectedCardFormat('Manual')}
                      className={`py-2.5 px-3 rounded-xl font-heading text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-all ${
                        selectedCardFormat === 'Manual'
                          ? 'bg-amber-600 text-white shadow-md'
                          : 'text-slate-400 hover:text-(--color-text)'
                      }`}
                    >
                      <CreditCard className="w-4 h-4" />
                      <span>Manual Card</span>
                    </button>
                  </div>

                  {currentCard ? (
                    <div className="p-4 bg-(--bg-page) rounded-2xl border border-(--border-color) space-y-4 shadow-xs">
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-(--border-color) pb-3">
                        <div className="space-y-0.5">
                          <span className="text-[10px] font-bold text-red-600 dark:text-red-400 uppercase tracking-widest block">
                            REGISTERED CREDENTIAL TOKEN
                          </span>
                          <h5 className="text-xs sm:text-sm font-bold text-(--color-text) font-mono break-all">
                            {qrPayload}
                          </h5>
                          <p className="text-xs text-slate-400 font-mono">
                            Registered Format:{' '}
                            <strong>{currentCard.card_type}</strong> • Version:{' '}
                            {currentCard.version}.0
                          </p>
                        </div>

                        <div className="flex gap-2 w-full sm:w-auto">
                          {currentCard.card_type !== selectedCardFormat && (
                            <button
                              type="button"
                              onClick={() =>
                                handleSwitchCardTypeInDb(selectedCardFormat)
                              }
                              className="flex-1 sm:flex-initial min-h-11 px-3.5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-heading text-xs font-bold uppercase tracking-wider cursor-pointer shadow-sm flex items-center justify-center gap-1.5 transition-colors border-none"
                              title="Update registered card type in database"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                              <span>Set as Registered</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => setIsDigitalQrModalOpen(true)}
                            className="flex-1 sm:flex-initial min-h-11 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-heading text-xs font-bold uppercase tracking-wider cursor-pointer shadow-sm flex items-center justify-center gap-2 transition-colors border-none shrink-0"
                          >
                            <Eye className="w-4 h-4" />
                            <span>Print Card</span>
                          </button>
                        </div>
                      </div>

                      {/* DYNAMIC DISPLAY: DIGITAL QR CARD VS MANUAL TEMPLATE ASSET */}
                      {selectedCardFormat === 'QR' ? (
                        <div className="mx-auto w-full max-w-sm sm:max-w-md bg-black text-white rounded-2xl border border-zinc-800 p-4 shadow-2xl relative overflow-hidden font-sans text-left select-none space-y-3.5">
                          <div className="text-center space-y-0.5">
                            <h4 className="font-heading font-black text-base tracking-widest text-white uppercase leading-none">
                              WOLF PALOMAR GYM
                            </h4>
                            <div className="h-0.5 bg-red-600 my-1 mx-auto w-[92%]" />
                            <div className="font-heading font-extrabold text-xs text-red-600 tracking-wider uppercase leading-none">
                              MUAYTHAI BOXING
                            </div>
                            <p className="text-[10px] text-zinc-400 font-medium font-mono leading-tight pt-0.5">
                              6B Judge A. Roldan St., Navotas City, Metro Manila
                            </p>
                          </div>

                          <div className="flex items-center gap-3 pt-1">
                            <div className="bg-white p-2 rounded-xl w-24 h-24 sm:w-28 sm:h-28 shrink-0 flex items-center justify-center relative shadow-md">
                              <img
                                src={qrImg}
                                alt="Member QR Payload"
                                className="w-full h-full object-contain"
                                style={{ opacity: isCardExpired ? 0.2 : 1 }}
                              />
                              {isCardExpired && (
                                <div className="absolute inset-0 bg-red-600/90 rounded-xl flex flex-col items-center justify-center text-white text-[9px] font-black uppercase text-center leading-tight">
                                  <span>EXPIRED</span>
                                  <span>BADGE</span>
                                </div>
                              )}
                            </div>

                            <div className="flex-1 space-y-1.5 min-w-0">
                              <div>
                                <span className="text-[9px] font-black text-zinc-400 uppercase block mb-0.5 tracking-wider">
                                  FULL NAME
                                </span>
                                <div className="bg-white text-black font-extrabold text-xs px-2.5 py-1 rounded-md truncate uppercase">
                                  {localMember.full_name}
                                </div>
                              </div>

                              <div>
                                <span className="text-[9px] font-black text-zinc-400 uppercase block mb-0.5 tracking-wider">
                                  CONTACT
                                </span>
                                <div className="bg-white text-black font-extrabold text-xs px-2.5 py-1 rounded-md truncate font-mono">
                                  {localMember.phone || 'N/A'}
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-1.5 pt-0.5">
                                <div>
                                  <span className="text-[8px] font-black text-zinc-400 uppercase block">
                                    ISSUED
                                  </span>
                                  <div className="bg-white text-black font-extrabold text-[10px] py-1 text-center rounded-md font-mono truncate">
                                    {issueDateStr}
                                  </div>
                                </div>

                                <div>
                                  <span className="text-[8px] font-black text-zinc-400 uppercase block">
                                    EXPIRATION
                                  </span>
                                  <div
                                    className={`bg-white font-extrabold text-[10px] py-1 text-center rounded-md font-mono truncate ${
                                      isCardExpired
                                        ? 'text-red-600'
                                        : 'text-black'
                                    }`}
                                  >
                                    {cardExpDateStr}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-3 pt-2">
                          <div className="w-full max-w-sm sm:max-w-md aspect-[1.586/1] rounded-2xl overflow-hidden border border-zinc-800 shadow-2xl bg-black p-1.5 flex items-center justify-center">
                            <img
                              src={cardTemplateImg}
                              alt="Manual Member Card Template Asset"
                              className="w-full h-full object-contain block"
                            />
                          </div>
                          <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">
                            Manual Card Template Asset • Official Gym Print
                            Layout
                          </span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="p-6 bg-(--bg-page) border border-(--border-color) rounded-2xl text-center text-slate-400 space-y-3">
                      <p>
                        No active security card assigned to this client yet.
                      </p>
                      <button
                        type="button"
                        onClick={() =>
                          handleSwitchCardTypeInDb(selectedCardFormat)
                        }
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-heading font-bold uppercase cursor-pointer"
                      >
                        Issue {selectedCardFormat} Security Card
                      </button>
                    </div>
                  )}

                  {/* PHYSICAL MEMBERSHIP CARD LIFECYCLE & CLAIM STATUS PANEL */}
                  {currentCard && (
                    <div className="p-4 bg-(--bg-page) rounded-2xl border border-(--border-color) space-y-3 shadow-xs">
                      <div className="flex items-center justify-between border-b border-(--border-color) pb-2">
                        <h5 className="text-xs font-heading font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                          <CreditCard className="w-4 h-4 text-blue-500" />
                          PHYSICAL CARD PAYMENT & CLAIM TRACKING
                        </h5>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase border ${
                            currentCard.payment_status === 'PAID' &&
                            currentCard.claim_status === 'CLAIMED'
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                              : currentCard.payment_status === 'PAID' &&
                                  currentCard.claim_status === 'UNCLAIMED'
                                ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30'
                                : 'bg-slate-500/10 text-slate-400 border-slate-500/30'
                          }`}
                        >
                          {currentCard.payment_status === 'PAID' &&
                          currentCard.claim_status === 'CLAIMED'
                            ? '✓ PAID & CLAIMED'
                            : currentCard.payment_status === 'PAID' &&
                                currentCard.claim_status === 'UNCLAIMED'
                              ? '⚠ PAID • READY FOR PICKUP'
                              : 'UNPAID'}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                        {/* Payment Status Card */}
                        <div className="p-3 bg-(--bg-card) border border-(--border-color) rounded-xl space-y-1.5">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                            Card Fee Payment (₱{cardFeeAmount}.00)
                          </span>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400">Status:</span>
                            {currentCard.payment_status === 'PAID' ? (
                              <span className="font-bold text-emerald-600 dark:text-emerald-400 font-mono flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />{' '}
                                PAID (₱
                                {currentCard.card_fee_paid || cardFeeAmount}.00)
                              </span>
                            ) : (
                              <span className="font-bold text-amber-600 dark:text-amber-400 font-mono flex items-center gap-1">
                                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />{' '}
                                UNPAID (₱0.00)
                              </span>
                            )}
                          </div>
                          {currentCard.receipt_number && (
                            <div className="flex items-center justify-between pt-1 border-t border-dashed border-(--border-color)">
                              <span className="text-slate-400 text-[11px]">
                                Official Receipt:
                              </span>
                              <span className="font-mono text-[11px] font-bold text-blue-500">
                                {currentCard.receipt_number}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Claim Status Card */}
                        <div className="p-3 bg-(--bg-card) border border-(--border-color) rounded-xl space-y-1.5">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                            Handover & Claim State
                          </span>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400">
                              Claim Status:
                            </span>
                            {currentCard.claim_status === 'CLAIMED' ? (
                              <span className="font-bold text-emerald-600 dark:text-emerald-400 font-mono flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />{' '}
                                RELEASED TO MEMBER
                              </span>
                            ) : currentCard.claim_status === 'UNCLAIMED' ? (
                              <span className="font-bold text-amber-600 dark:text-amber-400 font-mono flex items-center gap-1">
                                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />{' '}
                                UNCLAIMED (At Front Desk)
                              </span>
                            ) : (
                              <span className="text-slate-400 font-mono">
                                NOT APPLICABLE
                              </span>
                            )}
                          </div>
                          {currentCard.claimed_at && (
                            <div className="flex items-center justify-between pt-1 border-t border-dashed border-(--border-color) text-[11px]">
                              <span className="text-slate-400">
                                Released On:
                              </span>
                              <span className="font-mono text-slate-300">
                                {new Date(
                                  currentCard.claimed_at
                                ).toLocaleDateString()}{' '}
                                {currentCard.claimed_by
                                  ? `(${currentCard.claimed_by})`
                                  : ''}
                              </span>
                            </div>
                          )}
                          {currentCard.claim_notes && (
                            <p className="text-[10px] text-slate-400 italic pt-0.5">
                              "{currentCard.claim_notes}"
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ACTION BUTTONS: CLAIM, UNDO CLAIM, PAY FEE, REISSUE TOKEN & UNBIND CARD */}
                  {currentCard && (
                    <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                      {currentCard.payment_status === 'PAID' &&
                      currentCard.claim_status === 'UNCLAIMED' ? (
                        <button
                          type="button"
                          onClick={() => {
                            setClaimNotesInput('');
                            setIsMarkClaimModalOpen(true);
                          }}
                          className="min-h-[44px] px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl font-heading text-xs tracking-wider uppercase border-none cursor-pointer flex items-center justify-center gap-1.5 shadow-md transition-all"
                        >
                          <Check className="w-4 h-4" />
                          <span>Mark as Claimed</span>
                        </button>
                      ) : currentCard.claim_status === 'CLAIMED' ? (
                        <button
                          type="button"
                          onClick={() => setIsUndoClaimModalOpen(true)}
                          className="min-h-[44px] px-3.5 py-2.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30 font-bold rounded-xl font-heading text-xs tracking-wider uppercase cursor-pointer flex items-center justify-center gap-1.5 transition-all shadow-xs"
                          title="Revert claim state back to Unclaimed"
                        >
                          <Undo2 className="w-4 h-4 text-amber-500" />
                          <span>Undo Claim</span>
                        </button>
                      ) : currentCard.payment_status !== 'PAID' ? (
                        <button
                          type="button"
                          onClick={() => setIsPayCardModalOpen(true)}
                          className="min-h-[44px] px-3.5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl font-heading text-xs tracking-wider uppercase border-none cursor-pointer flex items-center gap-1.5 shadow-md transition-all"
                        >
                          <CreditCard className="w-4 h-4" />
                          <span>Pay Card Fee (₱{cardFeeAmount})</span>
                        </button>
                      ) : (
                        <div className="min-h-[44px] px-3.5 py-2.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-bold rounded-xl font-heading text-xs tracking-wider uppercase flex items-center justify-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Claim Completed</span>
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => setIsReissueModalOpen(true)}
                        className="min-h-[44px] px-3.5 py-2.5 bg-[#123c73] dark:bg-[#bf0202] hover:opacity-90 text-white font-bold rounded-xl font-heading text-xs tracking-wider uppercase border-none cursor-pointer flex items-center justify-center gap-2 shadow-md transition-all"
                      >
                        <RefreshCw className="w-4 h-4" />
                        <span>Reissue Token</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setIsUnbindModalOpen(true)}
                        className="min-h-[44px] px-3.5 py-2.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/20 font-bold rounded-xl font-heading text-xs tracking-wider uppercase cursor-pointer flex items-center justify-center gap-2 transition-all shadow-xs"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>Unbind Card</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}

          {/* TAB 4: ATTENDANCE */}
          {activeTab === 'Attendance' && (
            <div className="space-y-4 text-left animate-fade-in">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-(--border-color) pb-2">
                <span className="text-xs font-heading font-bold tracking-wider text-slate-600 dark:text-slate-300 uppercase flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-500" />
                  FACILITY CHECK-IN LOGS
                </span>

                <div className="flex items-center gap-2 text-xs font-mono">
                  <span className="px-2.5 py-1 rounded-xl bg-slate-500/10 text-slate-400 border border-slate-500/20 font-bold">
                    Visits: {attendance.length}
                  </span>
                  <span className="px-2.5 py-1 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-bold">
                    Total: ₱
                    {totalAttendanceValue.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
              </div>

              {attendance.length === 0 ? (
                <div className="p-8 bg-(--bg-page) border border-(--border-color) rounded-2xl text-center text-slate-400 text-xs">
                  No check-in visits recorded for this member.
                </div>
              ) : (
                <Table<AttendanceRecord>
                  data={attendanceLogs}
                  columns={attendanceColumns}
                  itemsPerPage={5}
                  searchKeys={[
                    'plan_name',
                    'payment_method',
                    'staff_name',
                    'receipt_number',
                    'check_in_time',
                  ]}
                  searchPlaceholder="Search visits by plan, staff, payment..."
                />
              )}
            </div>
          )}

          {/* TAB 5: NOTES */}
          {activeTab === 'Notes' && (
            <div className="space-y-3 text-left animate-fade-in">
              <label className="text-xs font-bold text-slate-400 uppercase block">
                Internal Medical & Staff Remarks
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={6}
                className="w-full p-3.5 border border-(--border-color) bg-(--bg-page) rounded-2xl text-(--color-text) outline-none focus:border-blue-500 text-xs font-semibold leading-relaxed"
                placeholder="Enter internal notes visible to reception staff..."
              />
              <button
                onClick={handleUpdateNotes}
                className="w-full sm:w-auto min-h-[44px] px-6 py-2.5 bg-[#123c73] dark:bg-[#bf0202] text-white font-bold rounded-xl font-heading text-xs tracking-wider uppercase border-none cursor-pointer flex items-center justify-center gap-2 shadow-md"
              >
                <span>Save Notes</span>
              </button>
            </div>
          )}
        </div>

        {/* FOOTER ACTIONS */}
        <div className="p-3.5 sm:p-4 border-t border-(--border-color) bg-(--bg-card) shrink-0 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 select-none z-30 shadow-2xl pb-20 sm:pb-4">
          <div className="flex items-center justify-between gap-3 w-full sm:w-auto">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-400 font-mono">
                Status:
              </span>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-heading font-black uppercase tracking-wider border ${
                  localMember.status === 'Active'
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                    : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                }`}
              >
                {localMember.status || 'Active'}
              </span>
            </div>

            <button
              type="button"
              onClick={() => setIsStatusModalOpen(true)}
              className={`min-h-[44px] px-4 py-2.5 rounded-xl cursor-pointer flex items-center justify-center gap-2 text-xs font-heading font-bold border-none transition-all shadow-md active:scale-95 ${
                localMember.status === 'Active'
                  ? 'bg-amber-500 hover:bg-amber-600 text-white'
                  : 'bg-emerald-500 hover:bg-emerald-600 text-white'
              }`}
            >
              {localMember.status === 'Active' ? (
                <>
                  <UserX className="w-4 h-4" />
                  <span>Suspend Member</span>
                </>
              ) : (
                <>
                  <UserCheck className="w-4 h-4" />
                  <span>Activate Member</span>
                </>
              )}
            </button>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-t-0 border-(--border-color)">
            <div className="relative group flex-1 sm:flex-initial">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('Overview');
                  setIsEditing(!isEditing);
                }}
                className={`w-full sm:w-auto min-h-[44px] px-4 py-2.5 rounded-xl flex items-center justify-center gap-2 text-xs font-heading font-bold transition-all border-none cursor-pointer ${
                  isEditing
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/20'
                }`}
              >
                {isEditing ? (
                  <>
                    <X className="w-4 h-4" />
                    <span>CANCEL EDITING</span>
                  </>
                ) : (
                  <>
                    <Pencil className="w-4 h-4" />
                    <span>EDIT DETAILS</span>
                  </>
                )}
              </button>
            </div>

            <div className="relative group flex-1 sm:flex-initial">
              <button
                type="button"
                disabled={hasActiveSubscription}
                onClick={() => setIsDeleteModalOpen(true)}
                className={`w-full sm:w-auto min-h-[44px] px-4 py-2.5 rounded-xl flex items-center justify-center gap-2 text-xs font-heading font-bold transition-all border-none ${
                  hasActiveSubscription
                    ? 'bg-slate-200 dark:bg-zinc-800 text-slate-400 cursor-not-allowed opacity-50'
                    : 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/20 cursor-pointer'
                }`}
              >
                {hasActiveSubscription ? (
                  <Lock className="w-4 h-4" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                <span>Delete Member</span>
              </button>

              {hasActiveSubscription && (
                <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block w-52 p-2 bg-zinc-900 text-white text-[10px] rounded-lg shadow-xl z-20 pointer-events-none font-sans font-medium">
                  🔒 Member cannot be deleted while an active subscription
                  contract exists.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* PROFILE PICTURE VIEW & CHANGE MODAL */}
        {isPhotoModalOpen && (
          <MemberPhotoModal
            isOpen={isPhotoModalOpen}
            onClose={() => setIsPhotoModalOpen(false)}
            memberName={localMember.full_name}
            memberId={localMember.member_id}
            currentImageUrl={localMember.image_url || localMember.avatar_url}
            onSaveSuccess={handleAvatarSaved}
          />
        )}

        {/* OFFICIAL RECEIPT MODAL */}
        {selectedReceiptData && (
          <OfficialReceipt
            isOpen={!!selectedReceiptData}
            onClose={() => setSelectedReceiptData(null)}
            data={selectedReceiptData}
            showPrintButton={true}
            showDownloadButton={true}
          />
        )}

        {/* STATUS CHANGE CONFIRMATION MODAL */}
        <Modal
          isOpen={isStatusModalOpen}
          onClose={() => setIsStatusModalOpen(false)}
          title={
            localMember.status === 'Active'
              ? 'SUSPEND MEMBER'
              : 'ACTIVATE MEMBER'
          }
        >
          <div className="space-y-4 text-left font-body">
            <p className="text-xs text-slate-600 dark:text-slate-300 font-medium leading-relaxed">
              Are you sure you want to{' '}
              {localMember.status === 'Active' ? 'suspend' : 'activate'}{' '}
              membership profile for{' '}
              <strong className="text-slate-900 dark:text-white font-bold">
                {localMember.full_name}
              </strong>
              ?
            </p>

            <div className="flex gap-3 justify-end pt-2">
              <button
                type="button"
                onClick={() => setIsStatusModalOpen(false)}
                className="px-4 py-2.5 bg-slate-200 dark:bg-zinc-800 hover:bg-slate-300 dark:hover:bg-zinc-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-heading font-bold uppercase tracking-wider cursor-pointer border-none"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleStatusToggleConfirm}
                className={`px-5 py-2.5 text-white rounded-xl text-xs font-heading font-bold uppercase tracking-wider cursor-pointer border-none shadow-md ${
                  localMember.status === 'Active'
                    ? 'bg-amber-500 hover:bg-amber-600'
                    : 'bg-emerald-500 hover:bg-emerald-600'
                }`}
              >
                Confirm{' '}
                {localMember.status === 'Active' ? 'Suspension' : 'Activation'}
              </button>
            </div>
          </div>
        </Modal>

        {/* DELETE MEMBER CONFIRMATION MODAL */}
        <Modal
          isOpen={isDeleteModalOpen}
          onClose={() => setIsDeleteModalOpen(false)}
          title="DELETE MEMBER PROFILE"
        >
          <div className="space-y-4 text-left font-body">
            <p className="text-xs text-slate-600 dark:text-slate-300 font-medium leading-relaxed">
              Are you sure you want to delete profile for{' '}
              <strong className="text-slate-900 dark:text-white font-bold">
                {localMember.full_name}
              </strong>
              ?
            </p>
            <p className="text-xs text-slate-400 font-mono">
              This record will be moved to the Member Recycle Bin.
            </p>

            <div className="flex gap-3 justify-end pt-2">
              <button
                type="button"
                onClick={() => setIsDeleteModalOpen(false)}
                className="px-4 py-2.5 bg-slate-200 dark:bg-zinc-800 hover:bg-slate-300 dark:hover:bg-zinc-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-heading font-bold uppercase tracking-wider cursor-pointer border-none"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteMemberConfirm}
                className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-heading font-bold uppercase tracking-wider cursor-pointer border-none shadow-md"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </Modal>

        {/* REISSUE CARD TOKEN CONFIRMATION MODAL */}
        <Modal
          isOpen={isReissueModalOpen}
          onClose={() => setIsReissueModalOpen(false)}
          title="REISSUE SECURITY CARD TOKEN"
        >
          <div className="space-y-4 text-left font-body">
            <div className="p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-600 dark:text-amber-400 text-xs space-y-1">
              <p className="font-bold flex items-center gap-1.5">
                <AlertOctagon className="w-4 h-4 shrink-0 text-amber-500" />
                <span>Warning: Active Card Deactivation</span>
              </p>
              <p className="text-xs text-slate-400 leading-relaxed">
                Generating a fresh token will immediately{' '}
                <strong>
                  deactivate {localMember.full_name}'s current card (
                  {currentCard?.card_number || 'N/A'})
                </strong>
                .
              </p>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 font-medium">
              Are you sure you want to proceed with issuing a replacement card
              token for{' '}
              <strong className="text-slate-900 dark:text-white font-bold">
                {localMember.full_name}
              </strong>
              ?
            </p>

            <div className="flex gap-3 justify-end pt-2 border-t border-(--border-color)">
              <button
                type="button"
                onClick={() => setIsReissueModalOpen(false)}
                className="px-4 py-2.5 bg-slate-200 dark:bg-zinc-800 hover:bg-slate-300 dark:hover:bg-zinc-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-heading font-bold uppercase tracking-wider cursor-pointer border-none"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmReissueToken}
                className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-heading font-bold uppercase tracking-wider cursor-pointer border-none shadow-md flex items-center gap-1.5"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Confirm Reissue Token</span>
              </button>
            </div>
          </div>
        </Modal>

        {/* UNBIND CARD CONFIRMATION MODAL */}
        <Modal
          isOpen={isUnbindModalOpen}
          onClose={() => setIsUnbindModalOpen(false)}
          title="UNBIND SECURITY CARD"
        >
          <div className="space-y-4 text-left font-body">
            <div className="p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-600 dark:text-amber-400 text-xs space-y-1">
              <p className="font-bold flex items-center gap-1.5">
                <AlertOctagon className="w-4 h-4 shrink-0 text-amber-500" />
                <span>Deactivate Credential Card</span>
              </p>
              <p className="text-xs text-slate-400 leading-relaxed">
                Unbinding will immediately revoke and deactivate card{' '}
                <strong>{currentCard?.card_number}</strong>. The profile will
                return to <strong>"No Card Registered"</strong> status.
              </p>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 font-medium">
              Are you sure you want to unbind the security card from{' '}
              <strong className="text-slate-900 dark:text-white font-bold">
                {localMember.full_name}
              </strong>
              ?
            </p>

            <div className="flex gap-3 justify-end pt-2 border-t border-(--border-color)">
              <button
                type="button"
                onClick={() => setIsUnbindModalOpen(false)}
                className="px-4 py-2.5 bg-slate-200 dark:bg-zinc-800 hover:bg-slate-300 dark:hover:bg-zinc-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-heading font-bold uppercase tracking-wider cursor-pointer border-none"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmUnbindCard}
                className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-heading font-bold uppercase tracking-wider cursor-pointer border-none shadow-md flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>Confirm Unbind</span>
              </button>
            </div>
          </div>
        </Modal>

        {/* VOID SUBSCRIPTION CONFIRMATION MODAL */}
        <Modal
          isOpen={isVoidModalOpen}
          onClose={() => {
            setIsVoidModalOpen(false);
            setTargetVoidSub(null);
          }}
          title="VOID SUBSCRIPTION CONTRACT"
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (voidReason && adminPassword.trim() && !isVerifyingVoid) {
                handleConfirmVoidSubscription();
              }
            }}
            className="space-y-4 text-left font-body"
          >
            <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-700 dark:text-rose-300 text-xs space-y-1">
              <p className="font-bold flex items-center gap-1.5">
                <AlertOctagon className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                <span>
                  This will cancel contract {targetVoidSub?.id} and purge its
                  receipt ({targetVoidSub?.receipt_number || 'N/A'}). Past
                  receipts will not be affected.
                </span>
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-400 block">
                Reason for Voiding *
              </label>
              <select
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                className="w-full p-2.5 bg-(--bg-page) border border-(--border-color) rounded-xl text-xs text-(--color-text) outline-none cursor-pointer font-medium"
              >
                <option value="Wrong membership selected">
                  Wrong membership selected
                </option>
                <option value="Wrong member">Wrong member</option>
                <option value="Duplicate registration">
                  Duplicate registration
                </option>
                <option value="Incorrect payment">Incorrect payment</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-400 block">
                Additional Notes (Optional)
              </label>
              <textarea
                value={voidNotes}
                onChange={(e) => setVoidNotes(e.target.value)}
                rows={2}
                placeholder="Enter internal explanation..."
                className="w-full p-2.5 bg-(--bg-page) border border-(--border-color) rounded-xl text-xs text-(--color-text) outline-none font-medium"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-400 block">
                Admin Password Verification *
              </label>
              <div className="relative">
                <input
                  type={showAdminPassword ? 'text' : 'password'}
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder="Re-enter your account password"
                  className="w-full p-2.5 pr-10 bg-(--bg-page) border border-(--border-color) rounded-xl text-xs text-(--color-text) outline-none font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowAdminPassword(!showAdminPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
                >
                  <Eye className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex gap-3 justify-end pt-2 border-t border-(--border-color)">
              <button
                type="button"
                onClick={() => {
                  setIsVoidModalOpen(false);
                  setTargetVoidSub(null);
                }}
                className="px-4 py-2.5 bg-slate-200 dark:bg-zinc-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-heading font-bold uppercase tracking-wider cursor-pointer border-none"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={
                  !voidReason || !adminPassword.trim() || isVerifyingVoid
                }
                className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-xs font-heading font-bold uppercase tracking-wider cursor-pointer border-none shadow-md transition-all flex items-center gap-1.5"
              >
                {isVerifyingVoid ? 'Verifying...' : 'Void Subscription'}
              </button>
            </div>
          </form>
        </Modal>

        {/* MARK AS CLAIMED / RELEASE PHYSICAL CARD MODAL */}
        <Modal
          isOpen={isMarkClaimModalOpen}
          onClose={() => setIsMarkClaimModalOpen(false)}
          title="RELEASE PHYSICAL MEMBERSHIP CARD"
        >
          <div className="space-y-4 text-left font-body">
            <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-700 dark:text-emerald-300 text-xs space-y-1">
              <p className="font-bold flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>Card Handover Verification</span>
              </p>
              <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
                Confirm that the printed physical card has been handed over
                directly to <strong>{localMember.full_name}</strong>.
              </p>
            </div>

            <div className="p-3 bg-(--bg-page) border border-(--border-color) rounded-xl text-xs space-y-1 font-mono">
              <div className="flex justify-between">
                <span className="text-slate-400">Card Token:</span>
                <span className="font-bold text-(--color-text)">
                  {currentCard?.card_number || 'N/A'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Fee Payment:</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">
                  PAID (₱{currentCard?.card_fee_paid || 50}.00)
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Staff In-Charge:</span>
                <span className="text-(--color-text)">
                  {user?.email || 'Admin Staff'}
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-400 block">
                Handover Notes / Verification (Optional)
              </label>
              <input
                type="text"
                value={claimNotesInput}
                onChange={(e) => setClaimNotesInput(e.target.value)}
                placeholder="e.g. Handed over at front desk with signed waiver"
                className="w-full p-2.5 bg-(--bg-page) border border-(--border-color) rounded-xl text-xs text-(--color-text) outline-none font-medium"
              />
            </div>

            <div className="flex gap-3 justify-end pt-2 border-t border-(--border-color)">
              <button
                type="button"
                onClick={() => setIsMarkClaimModalOpen(false)}
                className="px-4 py-2.5 bg-slate-200 dark:bg-zinc-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-heading font-bold uppercase tracking-wider cursor-pointer border-none"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isClaimingInProfile}
                onClick={handleConfirmMarkClaimed}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-xl text-xs font-heading font-bold uppercase tracking-wider cursor-pointer border-none shadow-md flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>
                  {isClaimingInProfile ? 'Updating...' : 'Confirm Card Claimed'}
                </span>
              </button>
            </div>
          </div>
        </Modal>

        {/* UNDO CLAIM CONFIRMATION MODAL */}
        <Modal
          isOpen={isUndoClaimModalOpen}
          onClose={() => setIsUndoClaimModalOpen(false)}
          title="UNDO CARD CLAIM STATUS"
        >
          <div className="space-y-4 text-left font-body">
            <div className="p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-700 dark:text-amber-300 text-xs space-y-1">
              <p className="font-bold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                <span>Revert Claimed Card State</span>
              </p>
              <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
                This will revert the physical card status for{' '}
                <strong>{localMember.full_name}</strong> back to{' '}
                <strong>PAID • UNCLAIMED (Pending Pickup)</strong> and clear
                handover timestamps.
              </p>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 font-medium">
              Was this card marked as claimed by mistake? Confirming will make
              the card available for pickup/handover again at the front desk.
            </p>

            <div className="flex gap-3 justify-end pt-2 border-t border-(--border-color)">
              <button
                type="button"
                onClick={() => setIsUndoClaimModalOpen(false)}
                className="px-4 py-2.5 bg-slate-200 dark:bg-zinc-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-heading font-bold uppercase tracking-wider cursor-pointer border-none"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isUndoingClaim}
                onClick={handleConfirmUndoClaim}
                className="px-5 py-2.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white rounded-xl text-xs font-heading font-bold uppercase tracking-wider cursor-pointer border-none shadow-md flex items-center gap-1.5"
              >
                <Undo2 className="w-4 h-4" />
                <span>
                  {isUndoingClaim ? 'Reverting...' : 'Confirm Undo Claim'}
                </span>
              </button>
            </div>
          </div>
        </Modal>

        {/* PAY PHYSICAL CARD FEE MODAL */}
        <Modal
          isOpen={isPayCardModalOpen}
          onClose={() => setIsPayCardModalOpen(false)}
          title="PAY PHYSICAL CARD PRINTING FEE"
        >
          <div className="space-y-4 text-left font-body">
            <div className="p-3.5 bg-blue-500/10 border border-blue-500/20 rounded-xl text-blue-600 dark:text-blue-300 text-xs space-y-1">
              <p className="font-bold flex items-center gap-1.5">
                <CreditCard className="w-4 h-4 text-blue-500 shrink-0" />
                <span>Physical Card Printing Fee</span>
              </p>
              <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
                Collect <strong>₱{cardFeeAmount}.00</strong> card fee for{' '}
                <strong>{localMember.full_name}</strong>. Upon payment, status
                will update to <strong>PAID • UNCLAIMED</strong> ready for
                handover.
              </p>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-slate-400 font-bold block mb-1">
                  Payment Method
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPayCardMethod('Cash')}
                    className={`p-2.5 rounded-xl border text-xs font-bold uppercase cursor-pointer flex items-center justify-center gap-2 ${
                      payCardMethod === 'Cash'
                        ? 'bg-emerald-600 text-white border-emerald-500'
                        : 'bg-(--bg-page) text-slate-400 border-(--border-color)'
                    }`}
                  >
                    <span>Cash</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPayCardMethod('GCash')}
                    className={`p-2.5 rounded-xl border text-xs font-bold uppercase cursor-pointer flex items-center justify-center gap-2 ${
                      payCardMethod === 'GCash'
                        ? 'bg-blue-600 text-white border-blue-500'
                        : 'bg-(--bg-page) text-slate-400 border-(--border-color)'
                    }`}
                  >
                    <span>GCash</span>
                  </button>
                </div>
              </div>

              {payCardMethod === 'Cash' ? (
                <div className="space-y-1">
                  <label className="text-slate-400 font-bold block">
                    Amount Tendered (₱)
                  </label>
                  <input
                    type="number"
                    value={payCardAmountPaid}
                    onChange={(e) =>
                      setPayCardAmountPaid(Number(e.target.value) || 0)
                    }
                    min={cardFeeAmount}
                    className="w-full p-2.5 bg-(--bg-page) border border-(--border-color) rounded-xl font-mono text-sm text-(--color-text) outline-none"
                  />
                  {payCardAmountPaid > cardFeeAmount && (
                    <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-mono pt-1">
                      Change: ₱{(payCardAmountPaid - cardFeeAmount).toFixed(2)}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-1">
                  <label className="text-slate-400 font-bold block">
                    GCash Reference Number (Optional)
                  </label>
                  <input
                    type="text"
                    value={payCardGcashRef}
                    onChange={(e) => setPayCardGcashRef(e.target.value)}
                    placeholder="e.g. 100234589"
                    className="w-full p-2.5 bg-(--bg-page) border border-(--border-color) rounded-xl font-mono text-xs text-(--color-text) outline-none"
                  />
                </div>
              )}
            </div>

            <div className="flex gap-3 justify-end pt-2 border-t border-(--border-color)">
              <button
                type="button"
                onClick={() => setIsPayCardModalOpen(false)}
                className="px-4 py-2.5 bg-slate-200 dark:bg-zinc-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-heading font-bold uppercase tracking-wider cursor-pointer border-none"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={
                  isPayingCard ||
                  (payCardMethod === 'Cash' &&
                    payCardAmountPaid < cardFeeAmount)
                }
                onClick={handleConfirmPayCard}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-xl text-xs font-heading font-bold uppercase tracking-wider cursor-pointer border-none shadow-md flex items-center gap-1.5"
              >
                <CreditCard className="w-4 h-4" />
                <span>
                  {isPayingCard
                    ? 'Processing...'
                    : `Record Payment (₱${cardFeeAmount}.00)`}
                </span>
              </button>
            </div>
          </div>
        </Modal>

        {/* INTAKE SUBSCRIPTION WIZARD MODAL */}
        {isWizardOpen && (
          <IntakeWizardModal
            isOpen={isWizardOpen}
            initialIntakeMode="Manual"
            prefillMember={localMember}
            onClose={() => setIsWizardOpen(false)}
            onComplete={() => {
              setIsWizardOpen(false);
              setRefreshKey((prev) => prev + 1);
              onMutationSuccess();
            }}
          />
        )}
      </motion.div>
    </motion.div>,
    document.body
  );
};
