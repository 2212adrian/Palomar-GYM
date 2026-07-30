// src/pages/members/components/MemberProfileView.tsx

import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { 
  X, ShieldAlert, Calendar, UserCheck, UserX, Trash2, Lock, Pencil, Save,
  ShieldCheck, FileSignature, Receipt as ReceiptIcon, Eye, AlertOctagon, CreditCard, RefreshCw,
  User, Phone, Mail, MapPin, HeartHandshake, Clock
} from 'lucide-react';
import { IntakeWizardModal } from './SubscriptionPlan';
import { memberService, subscriptionService, cardService, prototypeStorage, STORAGE_KEYS } from '../memberService';
import type { Member, Subscription, MemberCard, Receipt, AttendanceRecord } from '../../../types/members';
import { toast } from 'react-toastify';
import { Modal } from '../../../components/ui/Modal';
import { OfficialReceipt, type ReceiptData } from '../../../components/ui/OfficialReceipt';
import { DigitalQRCardModal } from './DigitalQRCardModal';
import { useAuthStore } from '../../../stores/authStore';
import { isSuperAdmin } from '../../../constants/auth';
import { supabase } from '../../../lib/supabase/client';

interface MemberProfileViewProps {
  member: Member;
  onClose: () => void;
  onMutationSuccess: () => void;
}

export const MemberProfileView: React.FC<MemberProfileViewProps> = ({
  member,
  onClose,
  onMutationSuccess
}) => {
  const { user, profile } = useAuthStore() as any;

  // Role resolution
  const role = useMemo<'admin' | 'staff'>(() => {
    if (isSuperAdmin(user?.email)) return 'admin';
    return profile?.role?.toLowerCase() === 'admin' ? 'admin' : 'staff';
  }, [user, profile]);

  const isAdmin = role === 'admin';

  // Local state to keep UI updated dynamically without needing to reopen panel
  const [localMember, setLocalMember] = useState<Member>(member);

  const [activeTab, setActiveTab] = useState<'Overview' | 'Contracts & Billing' | 'Cards' | 'Attendance' | 'Notes'>('Overview');
  const [notes, setNotes] = useState(member.notes || '');

  // Custom Modal States
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDigitalQrModalOpen, setIsDigitalQrModalOpen] = useState(false);
  const [selectedReceiptData, setSelectedReceiptData] = useState<ReceiptData | null>(null);

  const [isWizardOpen, setIsWizardOpen] = useState(false);

  // Void Subscription Modal & Verification State
  const [isVoidModalOpen, setIsVoidModalOpen] = useState(false);
  const [voidReason, setVoidReason] = useState('Wrong membership selected');
  const [voidNotes, setVoidNotes] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [showAdminPassword, setShowAdminPassword] = useState(false);
  const [isVerifyingVoid, setIsVerifyingVoid] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Inline Profile Edit State
  const [isEditing, setIsEditing] = useState(false);
  const [editFullName, setEditFullName] = useState(member.full_name || '');
  const [editPhone, setEditPhone] = useState(member.phone || '');
  const [editEmail, setEditEmail] = useState(member.email || '');
  const [editGender, setEditGender] = useState(member.gender || 'Male');
  const [editBirthday, setEditBirthday] = useState(member.birthday || '');
  const [editAddress, setEditAddress] = useState(member.address || '');
  const [editEmergencyName, setEditEmergencyName] = useState(member.emergency_contact_name || '');
  const [editRelationship, setEditRelationship] = useState(member.relationship || '');
  const [editEmergencyPhone, setEditEmergencyPhone] = useState(member.emergency_contact_phone || '');
  const [showSignatures, setShowSignatures] = useState(false);

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

  // Auto-refresh profile collections when subscriptions/receipts change
  useEffect(() => {
    const handleSync = () => {
      setRefreshKey(prev => prev + 1);
    };
    window.addEventListener('palomar_logbook_updated', handleSync);
    window.addEventListener('storage', handleSync);
    return () => {
      window.removeEventListener('palomar_logbook_updated', handleSync);
      window.removeEventListener('storage', handleSync);
    };
  }, []);

  const stats = useMemo(() => {
    const subs = prototypeStorage.getCollection<Subscription>(STORAGE_KEYS.SUBSCRIPTIONS).filter((s: Subscription) => s.member_id === localMember.member_id);
    const rcpts = prototypeStorage.getCollection<Receipt>(STORAGE_KEYS.RECEIPTS).filter((r: Receipt) => r.member_id === localMember.member_id);
    const atts = prototypeStorage.getCollection<AttendanceRecord>(STORAGE_KEYS.ATTENDANCE).filter((a: AttendanceRecord) => a.member_id === localMember.member_id);
    const crds = prototypeStorage.getCollection<MemberCard>(STORAGE_KEYS.CARDS).filter((c: MemberCard) => c.member_id === localMember.member_id);

    return {
      totalContracts: subs.length,
      totalSpent: rcpts.reduce((acc: number, curr: Receipt) => acc + curr.amount, 0),
      totalVisits: atts.length,
      cardReplacements: crds.filter((c: MemberCard) => !!c.replaced_at).length,
      activeContract: subs.find((s: Subscription) => s.status === 'Active')
    };
  }, [localMember, refreshKey]);

  const attendanceLogs = useMemo(() => {
    const list = prototypeStorage.getCollection<AttendanceRecord>(STORAGE_KEYS.ATTENDANCE);
    return list
      .filter((a: AttendanceRecord) => a.member_id === localMember.member_id)
      .sort((a, b) => new Date(b.check_in_time).getTime() - new Date(a.check_in_time).getTime());
  }, [localMember, refreshKey]);

  // Reissue Confirmation Modal State
  const [isReissueModalOpen, setIsReissueModalOpen] = useState(false);

  // Confirmed Reissue Execution Handler
  const handleConfirmReissueToken = () => {
    try {
      if (currentCard) {
        cardService.replace(localMember.member_id, 'Card Reissued / Replacement', 'Admin Staff');
        toast.success('Access card re-issued with fresh security token.');
      } else {
        cardService.issue(localMember.member_id, 'QR', 'Admin Staff');
        toast.success('New digital QR credential token issued.');
      }
      setIsReissueModalOpen(false);
      setRefreshKey(prev => prev + 1);
      onMutationSuccess();
    } catch (err: any) {
      toast.error(err.message || 'Failed to reissue card token.');
    }
  };

  const voidEligibility = useMemo(() => {
    const activeSub = stats.activeContract;
    if (!activeSub) {
      return { eligible: false, reason: 'No active subscription contract found.' };
    }

    const createdTime = new Date(activeSub.created_at || activeSub.start_date).getTime();
    const nowTime = new Date().getTime();
    const hoursDiff = (nowTime - createdTime) / (1000 * 60 * 60);

    if (hoursDiff > 24) {
      return {
        eligible: false,
        reason: 'Subscriptions may only be voided within 24 hours of creation to preserve membership and financial records.'
      };
    }

    const hasFacilityVisitsAfterSub = attendanceLogs.some((att) => {
      if (att.customer_type === 'New Membership') return false;
      const checkInTime = new Date(att.check_in_time).getTime();
      return checkInTime > createdTime;
    });

    if (hasFacilityVisitsAfterSub) {
      return {
        eligible: false,
        reason: 'This subscription has already been used for facility visits and can no longer be voided.'
      };
    }

    return { eligible: true, reason: '' };
  }, [stats.activeContract, attendanceLogs]);

  // Lock rule: Edit and Delete are locked when an active subscription contract exists
  const hasActiveSubscription = !!stats.activeContract;

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
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      calculated--;
    }
    return calculated >= 0 ? calculated : 0;
  }, [localMember.birthday, editBirthday, isEditing]);

  const isMinor = useMemo(() => calculatedAge >= 12 && calculatedAge < 18, [calculatedAge]);

  const handleUpdateNotes = () => {
    try {
      const trimmedNotes = notes.trim();
      memberService.update(localMember.id, { notes: trimmedNotes }, 'Admin Staff');
      setLocalMember(prev => ({ ...prev, notes: trimmedNotes }));
      toast.success('Internal notes saved.');
      onMutationSuccess();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleSaveProfileChanges = () => {
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

      memberService.update(localMember.id, updatedFields, 'Admin Staff');
      setLocalMember(prev => ({ ...prev, ...updatedFields }));
      toast.success('Member profile details updated successfully.');
      setIsEditing(false);
      onMutationSuccess();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update member profile.');
    }
  };

  const handleStatusToggleConfirm = () => {
    const nextStatus = localMember.status === 'Active' ? 'Suspended' : 'Active';

    try {
      memberService.update(localMember.id, { status: nextStatus }, 'Admin Staff');
      setLocalMember(prev => ({ ...prev, status: nextStatus }));
      toast.success(`Member status set to ${nextStatus}.`);
      onMutationSuccess();
      setIsStatusModalOpen(false);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDeleteMemberConfirm = () => {
    if (hasActiveSubscription) {
      toast.error('Cannot delete member while an active subscription exists.');
      return;
    }

    try {
      memberService.archive(localMember.id, 'Profile archived by staff', 'Admin Staff');
      toast.success(`Profile for ${localMember.full_name} moved to Recycle Bin.`);
      setIsDeleteModalOpen(false);
      onMutationSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete member profile.');
    }
  };

  // Void Subscription Execution with Admin Password Verification
  const handleConfirmVoidSubscription = async () => {
    if (!stats.activeContract || !isAdmin) return;
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
          password: adminPassword.trim()
        });
        if (error) {
          toast.error('Admin password verification failed. Please check your password.');
          setIsVerifyingVoid(false);
          return;
        }
      }

      subscriptionService.void(
        stats.activeContract.id,
        voidReason,
        voidNotes.trim(),
        user?.email || profile?.full_name || 'Administrator'
      );

      toast.success('Subscription successfully voided.');
      setIsVoidModalOpen(false);
      setAdminPassword('');
      setVoidNotes('');
      setRefreshKey(prev => prev + 1);
      onMutationSuccess();
    } catch (err: any) {
      toast.error(err.message || 'Failed to void subscription.');
    } finally {
      setIsVerifyingVoid(false);
    }
  };

  const handleOpenReceipt = (receipt: Receipt) => {
    const payMethod = receipt.payment_method || 'Cash';
    const isGCash = typeof payMethod === 'string' && payMethod.toLowerCase().includes('gcash');

    const gcashFee = (receipt as any).gcash_fee 
      ?? (receipt as any).gcashFee 
      ?? (isGCash ? 10 : 0);

    const rawAmount = receipt.amount || 0;
    
    const cardFee = (receipt as any).card_fee 
      ?? (receipt as any).cardFee 
      ?? (rawAmount - ((receipt as any).base_price ?? (isGCash ? rawAmount - gcashFee : rawAmount)) > 0 
          ? rawAmount - ((receipt as any).base_price ?? rawAmount) - gcashFee 
          : 0);

    const computedBasePrice = (receipt as any).base_price 
      ?? (receipt as any).basePrice 
      ?? (rawAmount - gcashFee - cardFee > 0 ? rawAmount - gcashFee - cardFee : rawAmount);

    const gcashRefNo = (receipt as any).gcash_ref_no 
      ?? (receipt as any).gcashRefNo 
      ?? (receipt as any).reference_number 
      ?? (receipt as any).referenceNumber 
      ?? '';

    const data: ReceiptData = {
      receiptType: receipt.customer_type === 'Walk-In' ? 'walkin' : 'subscription',
      receiptNo: receipt.id,
      customerName: receipt.customer_name || localMember.full_name,
      customerType: receipt.customer_type,
      planType: receipt.item_description,
      basePrice: computedBasePrice,
      gcashFee: gcashFee,
      cardFee: cardFee,
      paymentMethod: payMethod,
      gcashRefNo: gcashRefNo,
      transactionDate: receipt.created_at,
      processedBy: 'Admin Staff',
    };
    setSelectedReceiptData(data);
  };

  const currentCard = useMemo(() => {
    const list = prototypeStorage.getCollection<MemberCard>(STORAGE_KEYS.CARDS);
    return list.find((c: MemberCard) => c.member_id === localMember.member_id && c.status === 'Active');
  }, [localMember, refreshKey]);

  const subHistory = useMemo(() => {
    const list = prototypeStorage.getCollection<Subscription>(STORAGE_KEYS.SUBSCRIPTIONS);
    return list.filter((s: Subscription) => s.member_id === localMember.member_id);
  }, [localMember, refreshKey]);

  const invoices = useMemo(() => {
    const list = prototypeStorage.getCollection<Receipt>(STORAGE_KEYS.RECEIPTS);
    return list.filter((r: Receipt) => r.member_id === localMember.member_id);
  }, [localMember, refreshKey]);

  const extMember = localMember as any;

  const registrationDateText = useMemo(() => {
    if (!localMember.created_at) return 'N/A';
    const dateObj = new Date(localMember.created_at);
    if (isNaN(dateObj.getTime())) return 'N/A';
    return dateObj.toLocaleDateString();
  }, [localMember.created_at]);

  return createPortal(
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-end bg-black/70 backdrop-blur-xs font-body text-xs text-(--color-text)"
      onClick={onClose}
    >
      <motion.div 
        initial={{ y: '100%', x: 0 }}
        animate={{ y: 0, x: 0 }}
        exit={{ y: '100%', x: 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        className="w-full sm:max-w-2xl h-[92vh] sm:h-full bg-(--bg-card) border-t sm:border-t-0 sm:border-l border-(--border-color) rounded-t-3xl sm:rounded-none shadow-2xl flex flex-col justify-between overflow-hidden relative"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* COMPACT HEADER (NO BACK BUTTON) */}
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
            <div className="w-13 h-13 sm:w-16 sm:h-16 rounded-2xl bg-[#123c73] dark:bg-[#bf0202] text-white flex items-center justify-center font-heading text-lg sm:text-2xl font-black shadow-md shrink-0">
              {(localMember.full_name || 'M')[0]}
            </div>
            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <h3 className="text-base sm:text-lg font-bold text-(--color-text) leading-tight truncate">
                  {localMember.full_name}
                </h3>
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-heading font-black uppercase tracking-wider border ${
                  localMember.status === 'Active' 
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' 
                    : localMember.status === 'Suspended'
                    ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                    : 'bg-slate-500/10 text-slate-500 border-slate-500/20'
                }`}>{localMember.status || 'Active'}</span>

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

          {/* SWIPEABLE HORIZONTAL STATS CAROUSEL ON MOBILE */}
          <div className="flex sm:grid sm:grid-cols-4 gap-2.5 overflow-x-auto scrollbar-none pt-1">
            <div className="min-w-[130px] flex-1 p-2.5 bg-(--bg-card) border border-(--border-color) rounded-2xl text-center shadow-xs shrink-0">
              <span className="text-[9px] font-bold text-slate-400 uppercase block">Total Spent</span>
              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 font-mono block mt-1">
                ₱{stats.totalSpent.toLocaleString()}
              </span>
            </div>

            <div className="min-w-[110px] flex-1 p-2.5 bg-(--bg-card) border border-(--border-color) rounded-2xl text-center shadow-xs shrink-0">
              <span className="text-[9px] font-bold text-slate-400 uppercase block">Check-ins</span>
              <span className="text-xs font-bold text-(--color-text) block mt-1">{stats.totalVisits} visits</span>
            </div>

            <div className="min-w-[140px] flex-1 p-2.5 bg-(--bg-card) border border-(--border-color) rounded-2xl text-center shadow-xs shrink-0">
              <span className="text-[9px] font-bold text-slate-400 uppercase block">Active Plan</span>
              <span className="text-xs font-bold text-blue-600 dark:text-blue-400 truncate block mt-1">
                {stats.activeContract ? stats.activeContract.plan_name : 'Profile Only'}
              </span>
            </div>

            <div className="min-w-[110px] flex-1 p-2.5 bg-(--bg-card) border border-(--border-color) rounded-2xl text-center shadow-xs shrink-0">
              <span className="text-[9px] font-bold text-slate-400 uppercase block">Reissued</span>
              <span className="text-xs font-bold text-amber-600 dark:text-amber-400 block mt-1">
                {stats.cardReplacements} cards
              </span>
            </div>
          </div>
        </div>

        {/* STICKY HORIZONTAL TABS BAR */}
        <div className="sticky top-0 z-20 border-b border-(--border-color) bg-(--bg-card) px-3 sm:px-4 flex items-center gap-1.5 overflow-x-auto whitespace-nowrap scrollbar-none py-2 select-none shrink-0">
          {['Overview', 'Contracts & Billing', 'Cards', 'Attendance', 'Notes'].map(tab => (
            <button 
              key={tab} 
              onClick={() => setActiveTab(tab as any)}
              className={`min-h-[38px] px-3.5 py-2 rounded-xl text-xs font-heading font-bold uppercase tracking-wider transition-all shrink-0 cursor-pointer ${
                activeTab === tab 
                  ? 'bg-[#123c73] dark:bg-[#bf0202] text-white shadow-xs' 
                  : 'bg-slate-500/5 border border-(--border-color) text-slate-400 hover:text-(--color-text)'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* TAB CONTENTS CONTAINER WITH GENERATED SAFE-AREA BOTTOM PADDING */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 pb-28 sm:pb-8">
          
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'Overview' && (
            <div className="space-y-4 text-left animate-fade-in">
              
              {/* SUBSCRIBE BANNER FOR PROFILE ONLY MEMBERS */}
              {!stats.activeContract && (
                <div className="p-4 bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 select-none shadow-xs">
                  <div className="space-y-0.5">
                    <span className="font-heading font-bold text-amber-500 text-xs block">
                      No Active Subscription (Profile Only)
                    </span>
                    <span className="text-xs text-slate-400 font-medium block">
                      Enroll this member to grant gym facility check-in access.
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsWizardOpen(true)}
                    className="w-full sm:w-auto min-h-[44px] px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-heading font-bold uppercase tracking-wider cursor-pointer border-none shadow-sm flex items-center justify-center gap-2 shrink-0 transition-colors"
                  >
                    <CreditCard className="w-4 h-4" />
                    <span>Subscribe Plan</span>
                  </button>
                </div>
              )}

              {/* PERSONAL BIO & EMERGENCY CONTACT CARDS */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Personal Bio Card */}
                <div className="p-4 bg-(--bg-page) border border-(--border-color) rounded-2xl space-y-3 shadow-xs">
                  <div className="flex justify-between items-center border-b border-(--border-color) pb-2.5">
                    <h4 className="font-heading text-xs text-slate-600 dark:text-slate-300 uppercase tracking-wider flex items-center gap-2 font-bold">
                      <User className="w-4 h-4 text-blue-500" /> Personal Information
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
                        <span className="text-(--color-text) font-bold">{localMember.full_name || 'N/A'}</span>
                      </div>
                      <div className="flex justify-between items-center py-1 border-b border-dashed border-(--border-color)">
                        <span className="text-slate-400">Gender / Age</span>
                        <span className="text-(--color-text) font-medium">
                          {localMember.gender || 'N/A'} • {calculatedAge ? `${calculatedAge} yrs (${isMinor ? 'Minor' : 'Adult'})` : 'N/A'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-1 border-b border-dashed border-(--border-color)">
                        <span className="text-slate-400">Birthdate</span>
                        <span className="text-(--color-text) font-mono">{localMember.birthday || 'N/A'}</span>
                      </div>
                      <div className="flex justify-between items-center py-1 border-b border-dashed border-(--border-color)">
                        <span className="text-slate-400">Contact Phone</span>
                        <span className="text-(--color-text) font-mono">{localMember.phone || 'N/A'}</span>
                      </div>
                      <div className="flex justify-between items-center py-1 border-b border-dashed border-(--border-color)">
                        <span className="text-slate-400">Email</span>
                        <span className="text-(--color-text) truncate max-w-[180px]">{localMember.email || 'N/A'}</span>
                      </div>
                      <div className="pt-1">
                        <span className="text-slate-400 block mb-0.5">Home Address</span>
                        <span className="text-(--color-text) font-medium leading-snug block">{localMember.address || 'N/A'}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3 text-xs">
                      <div>
                        <label className="text-slate-400 text-xs font-medium block mb-1">Full Name *</label>
                        <input
                          type="text"
                          value={editFullName}
                          onChange={e => setEditFullName(e.target.value)}
                          className="w-full p-2.5 bg-(--bg-card) border border-(--border-color) rounded-xl font-bold text-xs outline-none"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-slate-400 text-xs font-medium block mb-1">Gender</label>
                          <select
                            value={editGender}
                            onChange={e => setEditGender(e.target.value)}
                            className="w-full p-2.5 bg-(--bg-card) border border-(--border-color) rounded-xl text-xs outline-none"
                          >
                            <option value="Male">Male</option>
                            <option value="Female">Female</option>
                            <option value="Non-Binary">Non-Binary</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-slate-400 text-xs font-medium block mb-1">Birthday</label>
                          <input
                            type="date"
                            value={editBirthday}
                            onChange={e => setEditBirthday(e.target.value)}
                            className="w-full p-2.5 bg-(--bg-card) border border-(--border-color) rounded-xl font-mono text-xs outline-none"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-slate-400 text-xs font-medium block mb-1">Contact Phone *</label>
                        <input
                          type="text"
                          value={editPhone}
                          onChange={e => setEditPhone(e.target.value.replace(/\D/g, ''))}
                          maxLength={11}
                          className="w-full p-2.5 bg-(--bg-card) border border-(--border-color) rounded-xl font-mono text-xs outline-none"
                          placeholder="09171234567"
                        />
                      </div>
                      <div>
                        <label className="text-slate-400 text-xs font-medium block mb-1">Email Address</label>
                        <input
                          type="email"
                          value={editEmail}
                          onChange={e => setEditEmail(e.target.value)}
                          className="w-full p-2.5 bg-(--bg-card) border border-(--border-color) rounded-xl text-xs outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-slate-400 text-xs font-medium block mb-1">Home Address</label>
                        <input
                          type="text"
                          value={editAddress}
                          onChange={e => setEditAddress(e.target.value)}
                          className="w-full p-2.5 bg-(--bg-card) border border-(--border-color) rounded-xl text-xs outline-none"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Emergency Contact Card */}
                <div className="p-4 bg-(--bg-page) border border-(--border-color) rounded-2xl space-y-3 shadow-xs">
                  <h4 className="font-heading text-xs text-rose-500 uppercase tracking-wider flex items-center gap-2 font-bold border-b border-(--border-color) pb-2.5">
                    <ShieldAlert className="w-4 h-4 text-rose-500" /> Emergency Contact
                  </h4>

                  {!isEditing ? (
                    <div className="space-y-2.5 text-xs">
                      <div className="flex justify-between items-center py-1 border-b border-dashed border-(--border-color)">
                        <span className="text-slate-400">Contact Person</span>
                        <span className="text-(--color-text) font-bold">{localMember.emergency_contact_name || 'N/A'}</span>
                      </div>
                      <div className="flex justify-between items-center py-1 border-b border-dashed border-(--border-color)">
                        <span className="text-slate-400">Relationship</span>
                        <span className="text-(--color-text) font-medium">{localMember.relationship || 'N/A'}</span>
                      </div>
                      <div className="flex justify-between items-center py-1">
                        <span className="text-slate-400">Emergency Phone</span>
                        <span className="text-(--color-text) font-mono">{localMember.emergency_contact_phone || 'N/A'}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3 text-xs">
                      <div>
                        <label className="text-slate-400 text-xs font-medium block mb-1">Contact Name</label>
                        <input
                          type="text"
                          value={editEmergencyName}
                          onChange={e => setEditEmergencyName(e.target.value)}
                          className="w-full p-2.5 bg-(--bg-card) border border-(--border-color) rounded-xl font-bold text-xs outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-slate-400 text-xs font-medium block mb-1">Relationship</label>
                        <select
                          value={editRelationship}
                          onChange={e => setEditRelationship(e.target.value)}
                          className="w-full p-2.5 border border-(--border-color) bg-(--bg-card) rounded-xl text-xs text-(--color-text) outline-none cursor-pointer font-medium"
                        >
                          <option value="">Select Relationship *</option>
                          
                          <optgroup label="Immediate Family">
                            <option value="Mother">Mother</option>
                            <option value="Father">Father</option>
                            <option value="Spouse / Partner">Spouse / Partner</option>
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
                            <option value="Legal Guardian">Legal Guardian</option>
                            <option value="Friend / Colleague">Friend / Colleague</option>
                            <option value="Other">Other</option>
                          </optgroup>
                        </select>
                      </div>
                      <div>
                        <label className="text-slate-400 text-xs font-medium block mb-1">Emergency Phone</label>
                        <input
                          type="text"
                          value={editEmergencyPhone}
                          onChange={e => setEditEmergencyPhone(e.target.value.replace(/\D/g, ''))}
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
                  <span className="text-xs font-semibold text-blue-500">Editing member profile details.</span>
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
                      <ShieldCheck className="w-4 h-4 text-amber-500" /> Parent / Guardian Consent
                    </span>
                    <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20 font-bold">
                      ✓ E-Consent Verified
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                    <div className="flex justify-between items-center py-1 border-b border-dashed border-(--border-color)">
                      <span className="text-slate-400">Parent Name</span>
                      <span className="text-amber-600 dark:text-amber-300 font-bold">{extMember.parent_name || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-dashed border-(--border-color)">
                      <span className="text-slate-400">Relationship</span>
                      <span className="text-(--color-text) font-medium">{extMember.parent_relationship || 'Guardian'}</span>
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-dashed border-(--border-color)">
                      <span className="text-slate-400">Parent Phone</span>
                      <span className="text-amber-600 dark:text-amber-300 font-mono font-bold">{extMember.parent_phone || 'N/A'}</span>
                    </div>
                    {extMember.parent_email && (
                      <div className="flex justify-between items-center py-1 border-b border-dashed border-(--border-color)">
                        <span className="text-slate-400">Parent Email</span>
                        <span className="text-(--color-text) truncate max-w-[160px]">{extMember.parent_email}</span>
                      </div>
                    )}
                  </div>

                  {/* TOGGLE SIGNATURES SHOW/HIDE BUTTON */}
                  {(extMember.applicant_signature || extMember.parent_signature) && (
                    <div className="pt-2 border-t border-(--border-color) space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-400 font-bold">Digital Signatures</span>
                        <button
                          type="button"
                          onClick={() => setShowSignatures(!showSignatures)}
                          className="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/20 rounded-xl text-xs font-bold uppercase tracking-wider cursor-pointer flex items-center gap-1.5 transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>{showSignatures ? 'Hide Signatures' : 'View Signatures'}</span>
                        </button>
                      </div>

                      {showSignatures && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 animate-fade-in">
                          <div>
                            <span className="text-[10px] text-slate-400 font-bold uppercase block mb-1 flex items-center gap-1">
                              <FileSignature className="w-3.5 h-3.5 text-blue-500" /> Applicant Signature
                            </span>
                            {extMember.applicant_signature ? (
                              <div className="p-2 bg-white rounded-xl border border-slate-300 h-20 flex items-center justify-center">
                                <img src={extMember.applicant_signature} alt="Applicant Signature" className="max-h-full max-w-full object-contain" />
                              </div>
                            ) : (
                              <div className="p-3 bg-(--bg-card) rounded-xl border border-(--border-color) text-xs text-slate-400 italic text-center">
                                No e-signature attached
                              </div>
                            )}
                          </div>

                          <div>
                            <span className="text-[10px] text-slate-400 font-bold uppercase block mb-1 flex items-center gap-1">
                              <FileSignature className="w-3.5 h-3.5 text-amber-500" /> Parent Signature
                            </span>
                            {extMember.parent_signature ? (
                              <div className="p-2 bg-white rounded-xl border border-slate-300 h-20 flex items-center justify-center">
                                <img src={extMember.parent_signature} alt="Parent Signature" className="max-h-full max-w-full object-contain" />
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

          {/* TAB 2: COMBINED CONTRACTS & BILLING */}
          {activeTab === 'Contracts & Billing' && (
            <div className="space-y-4 text-left animate-fade-in">
              <div className="space-y-3">
                <span className="text-xs font-heading font-bold tracking-wider text-slate-400 uppercase block">
                  SUBSCRIPTION CONTRACTS
                </span>
                {subHistory.length === 0 ? (
                  <div className="p-6 bg-(--bg-page) border border-(--border-color) rounded-2xl text-center text-slate-400">
                    No subscription agreements recorded for this client.
                  </div>
                ) : (
                  subHistory.map((sub: Subscription) => (
                    <div key={sub.id} className="p-4 bg-(--bg-page) rounded-2xl border border-(--border-color) space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <h5 className="font-bold text-sm text-(--color-text)">{sub.plan_name}</h5>
                        <span className={`px-2.5 py-1 rounded-full text-[9px] font-mono font-bold uppercase border ${
                          sub.status === 'Active' 
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' 
                            : sub.status === 'Voided'
                            ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
                            : 'bg-slate-200 dark:bg-zinc-800 text-slate-500 border-slate-300 dark:border-zinc-700'
                        }`}>{sub.status}</span>
                      </div>

                      <div className="text-xs text-slate-400 font-mono space-y-0.5">
                        <p>ID: {sub.id}</p>
                        <p>Validity: {new Date(sub.start_date).toLocaleDateString()} to {new Date(sub.end_date).toLocaleDateString()}</p>
                      </div>

                      {sub.status === 'Voided' && sub.void_reason && (
                        <div className="p-2 bg-rose-500/10 rounded-xl border border-rose-500/20 text-[10px] text-rose-400 font-mono">
                          Void Reason: {sub.void_reason} ({sub.voided_by || 'Admin'})
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>

              {/* DANGER ZONE: VOID SUBSCRIPTION (ADMINISTRATOR ONLY) */}
              {isAdmin && stats.activeContract && (
                <div className="pt-4 border-t border-(--border-color) space-y-3 select-none">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-heading font-bold tracking-wider text-rose-500 uppercase">
                      DANGER ZONE
                    </span>
                    <div className="h-px flex-1 bg-rose-500/20" />
                  </div>

                  {!voidEligibility.eligible ? (
                    <div className="p-3.5 bg-zinc-900/80 border border-zinc-800 rounded-2xl text-left space-y-1">
                      <div className="flex items-center gap-1.5 text-slate-400 font-bold text-xs uppercase">
                        <Lock className="w-4 h-4 text-slate-400" />
                        <span>Void Subscription Unavailable</span>
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        🔒 {voidEligibility.reason}
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 bg-rose-500/5 border border-rose-500/20 rounded-2xl gap-3">
                      <div className="text-left space-y-0.5">
                        <span className="font-bold text-xs text-rose-400 block">Void Active Subscription</span>
                        <span className="text-xs text-slate-400 block">
                          Cancel agreement while preserving financial audit records.
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsVoidModalOpen(true)}
                        className="w-full sm:w-auto min-h-[44px] px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-heading font-bold uppercase tracking-wider cursor-pointer border-none shadow-sm transition-colors shrink-0 flex items-center justify-center gap-1.5"
                      >
                        <span>Void Subscription</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* INVOICES LIST */}
              <div className="space-y-3 pt-3 border-t border-(--border-color)">
                <span className="text-xs font-heading font-bold tracking-wider text-slate-400 uppercase block flex items-center gap-1.5">
                  <ReceiptIcon className="w-4 h-4 text-emerald-500" /> Invoices & Receipts
                </span>
                {invoices.length === 0 ? (
                  <div className="p-6 bg-(--bg-page) border border-(--border-color) rounded-2xl text-center text-slate-400">
                    No official receipt invoices stored for this client.
                  </div>
                ) : (
                  invoices.map((r: Receipt) => (
                    <div key={r.id} className="p-4 bg-(--bg-page) rounded-2xl border border-(--border-color) flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                      <div className="space-y-1">
                        <h5 className="font-bold text-sm text-(--color-text)">{r.item_description}</h5>
                        <p className="font-mono text-xs text-slate-400">
                          {r.id} • {r.payment_method} • {new Date(r.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      
                      <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-(--border-color)">
                        <span className="font-mono font-black text-emerald-600 dark:text-emerald-400 text-sm">
                          ₱{r.amount.toLocaleString()}.00
                        </span>

                        <button
                          type="button"
                          onClick={() => handleOpenReceipt(r)}
                          className="min-h-[38px] px-3.5 py-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/20 rounded-xl text-xs font-heading font-bold uppercase tracking-wider cursor-pointer transition-colors flex items-center gap-1.5"
                          title="View Official Receipt"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Receipt</span>
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 3: CARDS & DIGITAL SECURITY BADGES */}
          {activeTab === 'Cards' && (() => {
            const expDateStr = stats.activeContract?.end_date 
              ? new Date(stats.activeContract.end_date).toLocaleDateString() 
              : 'NO ACTIVE PLAN';
            const isExp = stats.activeContract?.end_date 
              ? new Date(stats.activeContract.end_date) < new Date() 
              : false;
            const issueDateStr = currentCard?.issued_at 
              ? new Date(currentCard.issued_at).toLocaleDateString() 
              : new Date().toLocaleDateString();

            const qrPayload = `${localMember.member_id}:${stats.activeContract?.end_date || 'NO_PLAN'}:${currentCard ? new Date(currentCard.issued_at).getTime() : Date.now()}`;
            const qrImg = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(qrPayload)}`;

            return (
              <div className="space-y-4 text-left animate-fade-in">
                {currentCard ? (
                  <div className="p-4 bg-(--bg-page) rounded-2xl border border-(--border-color) space-y-4 shadow-xs">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-(--border-color) pb-3">
                      <div className="space-y-0.5">
                        <span className="text-[10px] font-bold text-red-600 dark:text-red-400 uppercase tracking-widest block">ACTIVE CREDENTIAL BADGE</span>
                        <h5 className="text-sm font-bold text-(--color-text) font-mono">{currentCard.card_number}</h5>
                        <p className="text-xs text-slate-400 font-mono">
                          Hardware Type: <strong>{currentCard.card_type}</strong> • Version: {currentCard.version}.0
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => setIsDigitalQrModalOpen(true)}
                        className="w-full sm:w-auto min-h-[44px] px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-heading text-xs font-bold uppercase tracking-wider cursor-pointer shadow-sm flex items-center justify-center gap-2 transition-colors border-none shrink-0"
                      >
                        <Eye className="w-4 h-4" />
                        <span>Print Digital Badge</span>
                      </button>
                    </div>

                    {/* RESPONSIVE GYM CREDENTIAL CARD DISPLAY */}
                    <div className="mx-auto w-full max-w-sm sm:max-w-md bg-black text-white rounded-2xl border border-zinc-800 p-4 shadow-2xl relative overflow-hidden font-sans text-left select-none space-y-3.5">
                      
                      {/* BRANDING HEADER */}
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

                      {/* CARD BODY: QR CODE + MEMBER DETAILS */}
                      <div className="flex items-center gap-3 pt-1">
                        
                        {/* QR CODE BOX */}
                        <div className="bg-white p-2 rounded-xl w-24 h-24 sm:w-28 sm:h-28 shrink-0 flex items-center justify-center relative shadow-md">
                          <img 
                            src={qrImg} 
                            alt="Member QR" 
                            className="w-full h-full object-contain"
                            style={{ opacity: isExp ? 0.2 : 1 }}
                          />
                          {isExp && (
                            <div className="absolute inset-0 bg-red-600/90 rounded-xl flex flex-col items-center justify-center text-white text-[9px] font-black uppercase text-center leading-tight">
                              <span>EXPIRED</span>
                            </div>
                          )}
                        </div>

                        {/* MEMBER DETAILS */}
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
                              <span className="text-[8px] font-black text-zinc-400 uppercase block">ISSUED</span>
                              <div className="bg-white text-black font-extrabold text-[10px] py-1 text-center rounded-md font-mono truncate">
                                {issueDateStr}
                              </div>
                            </div>

                            <div>
                              <span className="text-[8px] font-black text-zinc-400 uppercase block">EXPIRATION</span>
                              <div className={`bg-white font-extrabold text-[10px] py-1 text-center rounded-md font-mono truncate ${
                                isExp ? 'text-red-600' : 'text-black'
                              }`}>
                                {expDateStr}
                              </div>
                            </div>
                          </div>

                        </div>

                      </div>

                    </div>

                  </div>
                ) : (
                  <div className="p-6 bg-(--bg-page) border border-(--border-color) rounded-2xl text-center text-slate-400">
                    No active physical security card assigned to this client.
                  </div>
                )}

                {/* REISSUE CARD TOKEN BUTTON */}
                <div className="pt-2">
                  <button 
                    type="button"
                    onClick={() => setIsReissueModalOpen(true)} 
                    className="w-full min-h-[44px] px-4 py-2.5 bg-[#123c73] dark:bg-[#bf0202] hover:opacity-90 text-white font-bold rounded-xl font-heading text-xs tracking-wider uppercase border-none cursor-pointer flex items-center justify-center gap-2 shadow-md transition-all"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span>Reissue Card Security Token</span>
                  </button>
                </div>
              </div>
            );
          })()}

          {/* TAB 4: ATTENDANCE */}
          {activeTab === 'Attendance' && (
            <div className="space-y-3 text-left animate-fade-in">
              <span className="text-xs font-heading font-bold tracking-wider text-slate-400 uppercase block">
                FACILITY CHECK-IN LOGS
              </span>

              {attendanceLogs.length === 0 ? (
                <div className="p-8 bg-(--bg-page) border border-(--border-color) rounded-2xl text-center text-slate-400">
                  No check-in visits recorded for this member.
                </div>
              ) : (
                attendanceLogs.map((att: AttendanceRecord) => (
                  <div key={att.id} className="p-4 bg-(--bg-page) rounded-2xl border border-(--border-color) flex flex-col sm:flex-row justify-between sm:items-center gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-(--color-text)">{att.plan_name || 'Standard Pass'}</span>
                        <span className="text-xs font-mono text-slate-400">({att.payment_method})</span>
                      </div>
                      <span className="font-mono text-xs text-slate-400 block">
                        Checked in: {new Date(att.check_in_time).toLocaleString()} • Staff: {att.staff_name}
                      </span>
                    </div>

                    <div className="text-left sm:text-right">
                      <span className={`font-mono text-xs font-black ${
                        att.entry_fee > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'
                      }`}>
                        {att.entry_fee > 0 ? `₱${att.entry_fee.toFixed(2)}` : 'FREE (₱0)'}
                      </span>
                    </div>
                  </div>
                ))
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
                onChange={e => setNotes(e.target.value)} 
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

        {/* FOOTER ACTIONS - ELEVATED CLEAR OF SYSTEM NAVBAR */}
        <div className="p-3.5 sm:p-4 border-t border-(--border-color) bg-(--bg-card) shrink-0 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 select-none z-30 shadow-2xl pb-20 sm:pb-4">
          
          {/* STATUS & SUSPEND/ACTIVATE ACTION BUTTON */}
          <div className="flex items-center justify-between gap-3 w-full sm:w-auto">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-400 font-mono">Status:</span>
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-heading font-black uppercase tracking-wider border ${
                localMember.status === 'Active' 
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' 
                  : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
              }`}>
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

          {/* EDIT & DELETE BUTTONS ROW */}
          <div className="flex items-center gap-2 w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-t-0 border-(--border-color)">
            {/* EDIT DETAILS BUTTON */}
            <div className="relative group flex-1 sm:flex-initial">
              <button
                type="button"
                disabled={hasActiveSubscription}
                onClick={() => {
                  setActiveTab('Overview');
                  setIsEditing(!isEditing);
                }}
                className={`w-full sm:w-auto min-h-[44px] px-4 py-2.5 rounded-xl flex items-center justify-center gap-2 text-xs font-heading font-bold transition-all border-none ${
                  hasActiveSubscription
                    ? 'bg-slate-200 dark:bg-zinc-800 text-slate-400 cursor-not-allowed opacity-50'
                    : isEditing
                    ? 'bg-blue-600 text-white shadow-md cursor-pointer'
                    : 'bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/20 cursor-pointer'
                }`}
              >
                {hasActiveSubscription ? <Lock className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
                <span>{isEditing ? 'Cancel Edit' : 'Edit Details'}</span>
              </button>

              {hasActiveSubscription && (
                <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block w-52 p-2 bg-zinc-900 text-white text-[10px] rounded-lg shadow-xl z-20 pointer-events-none font-sans font-medium">
                  🔒 Profile details are locked while an active subscription contract exists.
                </div>
              )}
            </div>

            {/* DELETE BUTTON */}
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
                {hasActiveSubscription ? <Lock className="w-4 h-4" /> : <Trash2 className="w-4 h-4" />}
                <span>Delete Member</span>
              </button>

              {hasActiveSubscription && (
                <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block w-52 p-2 bg-zinc-900 text-white text-[10px] rounded-lg shadow-xl z-20 pointer-events-none font-sans font-medium">
                  🔒 Member cannot be deleted while an active subscription contract exists.
                </div>
              )}
            </div>
          </div>

        </div>

      </motion.div>

      {/* ─── DIGITAL QR BADGE MODAL ─── */}
      {isDigitalQrModalOpen && (
        <DigitalQRCardModal
          member={localMember}
          subscription={stats.activeContract}
          card={currentCard}
          onClose={() => setIsDigitalQrModalOpen(false)}
        />
      )}

      {/* ─── OFFICIAL RECEIPT MODAL ─── */}
      {selectedReceiptData && (
        <OfficialReceipt
          isOpen={!!selectedReceiptData}
          onClose={() => setSelectedReceiptData(null)}
          data={selectedReceiptData}
          showPrintButton={true}
          showDownloadButton={true}
        />
      )}

      {/* ─── STATUS CHANGE CONFIRMATION MODAL ─── */}
      <Modal
        isOpen={isStatusModalOpen}
        onClose={() => setIsStatusModalOpen(false)}
        title={localMember.status === 'Active' ? 'SUSPEND MEMBER' : 'ACTIVATE MEMBER'}
      >
        <div className="space-y-4 text-left font-body">
          <p className="text-xs text-slate-600 dark:text-slate-300 font-medium leading-relaxed">
            Are you sure you want to {localMember.status === 'Active' ? 'suspend' : 'activate'} membership profile for{' '}
            <strong className="text-slate-900 dark:text-white font-bold">{localMember.full_name}</strong>?
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
                localMember.status === 'Active' ? 'bg-amber-500 hover:bg-amber-600' : 'bg-emerald-500 hover:bg-emerald-600'
              }`}
            >
              Confirm {localMember.status === 'Active' ? 'Suspension' : 'Activation'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ─── DELETE MEMBER CONFIRMATION MODAL ─── */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title="DELETE MEMBER PROFILE"
      >
        <div className="space-y-4 text-left font-body">
          <p className="text-xs text-slate-600 dark:text-slate-300 font-medium leading-relaxed">
            Are you sure you want to delete profile for{' '}
            <strong className="text-slate-900 dark:text-white font-bold">{localMember.full_name}</strong>?
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

      {/* ─── REISSUE CARD TOKEN CONFIRMATION MODAL ─── */}
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
              Generating a fresh token will immediately <strong>deactivate {localMember.full_name}'s current card ({currentCard?.card_number || 'N/A'})</strong>.
            </p>
          </div>

          <p className="text-xs text-slate-600 dark:text-slate-300 font-medium">
            Are you sure you want to proceed with issuing a replacement card token for <strong className="text-slate-900 dark:text-white font-bold">{localMember.full_name}</strong>?
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

      {/* ─── VOID SUBSCRIPTION CONFIRMATION MODAL (ADMIN ONLY) ─── */}
      <Modal
        isOpen={isVoidModalOpen}
        onClose={() => setIsVoidModalOpen(false)}
        title="VOID SUBSCRIPTION"
      >
        <div className="space-y-4 text-left font-body">
          <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-300 text-xs space-y-1">
            <p className="font-bold flex items-center gap-1.5">
              <AlertOctagon className="w-4 h-4 text-rose-400 shrink-0" />
              <span>This will cancel the current subscription while keeping it in audit history.</span>
            </p>
            <p className="text-rose-400/80 font-mono text-[10px]">
              This action cannot be undone.
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
              <option value="Wrong membership selected">Wrong membership selected</option>
              <option value="Wrong member">Wrong member</option>
              <option value="Duplicate registration">Duplicate registration</option>
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
              placeholder="Enter internal explanation for audit trail..."
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
              onClick={() => setIsVoidModalOpen(false)}
              className="px-4 py-2.5 bg-slate-200 dark:bg-zinc-800 hover:bg-slate-300 dark:hover:bg-zinc-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-heading font-bold uppercase tracking-wider cursor-pointer border-none"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!voidReason || !adminPassword.trim() || isVerifyingVoid}
              onClick={handleConfirmVoidSubscription}
              className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-xs font-heading font-bold uppercase tracking-wider cursor-pointer border-none shadow-md transition-all flex items-center gap-1.5"
            >
              {isVerifyingVoid ? 'Verifying...' : 'Void Subscription'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ─── INTAKE SUBSCRIPTION WIZARD MODAL ─── */}
      {isWizardOpen && (
        <IntakeWizardModal
          isOpen={isWizardOpen}
          initialIntakeMode="Manual"
          prefillMember={localMember}
          onClose={() => setIsWizardOpen(false)}
          onComplete={() => {
            setIsWizardOpen(false);
            setRefreshKey(prev => prev + 1);
            onMutationSuccess();
          }}
        />
      )}
    </motion.div>,
    document.body
  );
};