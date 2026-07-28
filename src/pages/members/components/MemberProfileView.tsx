// src/pages/members/components/MemberProfileView.tsx

import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, ShieldAlert, Calendar, UserCheck, UserX, Trash2, Lock, Pencil, Save,
  ShieldCheck, FileSignature, Receipt as ReceiptIcon, Eye, AlertOctagon, CreditCard 
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

  // Evaluate Void Subscription eligibility (Admin role, 24-hour window & unconsumed check-in)
  // Inside MemberProfileView.tsx:

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
      // Re-authenticate admin credentials if signed in via Supabase
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
      setRefreshKey(prev => prev + 1); // Refresh profile view immediately
      onMutationSuccess();
    } catch (err: any) {
      toast.error(err.message || 'Failed to void subscription.');
    } finally {
      setIsVerifyingVoid(false);
    }
  };

  const handleOpenReceipt = (receipt: Receipt) => {
    const data: ReceiptData = {
      receiptType: receipt.customer_type === 'Walk-In' ? 'walkin' : 'subscription',
      receiptNo: receipt.id,
      customerName: receipt.customer_name || localMember.full_name,
      customerType: receipt.customer_type,
      planType: receipt.item_description,
      basePrice: receipt.amount,
      paymentMethod: receipt.payment_method.toLowerCase(),
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
    <div className="fixed inset-0 z-110 flex items-center justify-end bg-black/60 backdrop-blur-xs font-body text-xs text-(--color-text)">
      <div className="w-full sm:max-w-2xl h-full bg-(--bg-card) border-l border-(--border-color) shadow-2xl flex flex-col justify-between overflow-hidden">
        
        {/* HEADER */}
        <div className="p-4 sm:p-6 border-b border-(--border-color) space-y-4 select-none relative bg-(--bg-page)">
          <button 
            onClick={onClose} 
            className="absolute right-4 top-4 p-2 rounded-xl bg-(--bg-card) border border-(--border-color) text-slate-500 hover:text-(--color-text) transition-all cursor-pointer shadow-xs z-10"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-3 sm:gap-4 text-left pt-2 pr-8">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-[#123c73] dark:bg-[#bf0202] text-white flex items-center justify-center font-heading text-xl sm:text-2xl font-extrabold shadow-md shrink-0">
              {(localMember.full_name || 'M')[0]}
            </div>
            <div className="space-y-1 overflow-hidden">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm sm:text-base font-bold text-(--color-text) leading-none truncate">{localMember.full_name}</h3>
                <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${
                  localMember.status === 'Active' 
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' 
                    : localMember.status === 'Suspended'
                    ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                    : 'bg-slate-500/10 text-slate-500 border-slate-500/20'
                }`}>{localMember.status || 'Active'}</span>

                {isMinor && (
                  <span className="px-2 py-0.5 rounded text-[9px] font-bold font-mono bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                    MINOR ({calculatedAge} YRS)
                  </span>
                )}
              </div>
              <p className="font-mono text-[10px] text-slate-500 dark:text-slate-400 leading-none truncate">
                {localMember.member_id} • Registered {registrationDateText}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 pt-2">
            <div className="p-2.5 sm:p-3 bg-(--bg-card) border border-(--border-color) rounded-xl text-center shadow-xs">
              <span className="text-[8px] font-bold text-slate-400 uppercase block leading-none">TOTAL SPENT</span>
              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 font-mono block mt-1.5 leading-none">
                ₱{stats.totalSpent.toLocaleString()}
              </span>
            </div>
            <div className="p-2.5 sm:p-3 bg-(--bg-card) border border-(--border-color) rounded-xl text-center shadow-xs">
              <span className="text-[8px] font-bold text-slate-400 uppercase block leading-none">CHECK-INS</span>
              <span className="text-xs font-bold text-(--color-text) block mt-1.5 leading-none">{stats.totalVisits} visits</span>
            </div>
            <div className="p-2.5 sm:p-3 bg-(--bg-card) border border-(--border-color) rounded-xl text-center shadow-xs">
              <span className="text-[8px] font-bold text-slate-400 uppercase block leading-none">ACTIVE PLAN</span>
              <span className="text-xs font-bold text-blue-600 dark:text-blue-400 truncate block mt-1.5 leading-none">
                {stats.activeContract ? stats.activeContract.plan_name : 'No Active Plan'}
              </span>
            </div>
            <div className="p-2.5 sm:p-3 bg-(--bg-card) border border-(--border-color) rounded-xl text-center shadow-xs">
              <span className="text-[8px] font-bold text-slate-400 uppercase block leading-none">CARDS REISSUED</span>
              <span className="text-xs font-bold text-amber-600 dark:text-amber-400 block mt-1.5 leading-none">
                {stats.cardReplacements} cards
              </span>
            </div>
          </div>
        </div>

        {/* TABS BAR - RESPONSIVE SCROLLABLE */}
        <div className="flex border-b border-(--border-color) bg-(--bg-card) px-2 sm:px-4 select-none overflow-x-auto whitespace-nowrap scrollbar-none">
          {['Overview', 'Contracts & Billing', 'Cards', 'Attendance', 'Notes'].map(tab => (
            <button 
              key={tab} 
              onClick={() => setActiveTab(tab as any)}
              className={`py-3 px-3 sm:px-3.5 font-heading text-[10px] tracking-wider uppercase font-black cursor-pointer border-b-2 transition-all shrink-0 ${
                activeTab === tab 
                  ? 'border-b-[#123c73] dark:border-b-[#bf0202] text-[#123c73] dark:text-white' 
                  : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* TAB CONTENTS */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'Overview' && (
            <div className="space-y-4 text-left animate-fade-in">
              
              {!stats.activeContract && (
  <div className="p-3.5 bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 rounded-2xl flex justify-between items-center select-none shadow-xs">
    <div>
      <span className="font-heading font-bold text-amber-500 text-xs block">No Active Subscription (Profile Only)</span>
      <span className="text-[9px] text-slate-400 font-medium block">Member has no active membership contract.</span>
    </div>

    <button
      type="button"
      onClick={() => setIsWizardOpen(true)}
      className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-[9px] font-heading font-bold uppercase tracking-wider cursor-pointer border-none shadow-sm flex items-center gap-1.5 shrink-0 transition-colors"
    >
      <CreditCard className="w-3.5 h-3.5" />
      <span>Subscribe Plan</span>
    </button>
  </div>
)}

              {/* READ / INLINE EDIT GRID */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Personal Bio Card */}
                <div className="p-4 bg-(--bg-page) border border-(--border-color) rounded-2xl space-y-3">
                  <div className="flex justify-between items-center">
                    <h4 className="font-heading text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5 font-bold">
                      <Calendar className="w-3.5 h-3.5 text-blue-500" /> Personal Bio Details
                    </h4>
                    {isEditing && (
                      <span className="text-[8px] font-mono font-bold bg-blue-500/10 text-blue-500 px-2 py-0.5 rounded uppercase">
                        Editing Active
                      </span>
                    )}
                  </div>

                  {!isEditing ? (
                    <div className="space-y-2 text-xs font-semibold">
                      <div>
                        <span className="text-slate-400 text-[9px] uppercase font-bold block">Full Name</span>
                        <span className="text-(--color-text) font-bold">{localMember.full_name || 'N/A'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[9px] uppercase font-bold block">Gender / Age</span>
                        <span className="text-(--color-text)">{localMember.gender || 'N/A'} • {calculatedAge ? `${calculatedAge} yrs old (${isMinor ? 'Minor' : 'Adult'})` : 'N/A'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[9px] uppercase font-bold block">Birthdate</span>
                        <span className="text-(--color-text) font-mono">{localMember.birthday || 'N/A'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[9px] uppercase font-bold block">Contact Phone</span>
                        <span className="text-(--color-text) font-mono">{localMember.phone || 'N/A'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[9px] uppercase font-bold block">Email Address</span>
                        <span className="text-(--color-text) truncate block">{localMember.email || 'N/A'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[9px] uppercase font-bold block">Home Address</span>
                        <span className="text-(--color-text) leading-snug block">{localMember.address || 'N/A'}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2 text-xs font-semibold">
                      <div>
                        <label className="text-slate-400 text-[9px] uppercase font-bold block">Full Name *</label>
                        <input
                          type="text"
                          value={editFullName}
                          onChange={e => setEditFullName(e.target.value)}
                          className="w-full p-2 bg-(--bg-card) border border-(--border-color) rounded-lg outline-none font-bold text-xs"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-slate-400 text-[9px] uppercase font-bold block">Gender</label>
                          <select
                            value={editGender}
                            onChange={e => setEditGender(e.target.value)}
                            className="w-full p-2 bg-(--bg-card) border border-(--border-color) rounded-lg outline-none text-xs"
                          >
                            <option value="Male">Male</option>
                            <option value="Female">Female</option>
                            <option value="Non-Binary">Non-Binary</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-slate-400 text-[9px] uppercase font-bold block">Birthday</label>
                          <input
                            type="date"
                            value={editBirthday}
                            onChange={e => setEditBirthday(e.target.value)}
                            className="w-full p-2 bg-(--bg-card) border border-(--border-color) rounded-lg outline-none text-xs font-mono"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-slate-400 text-[9px] uppercase font-bold block">Contact Phone *</label>
                        <input
    type="text"
    value={editPhone}
    onChange={e => setEditPhone(e.target.value.replace(/\D/g, ''))}
    maxLength={11}
    className="w-full p-2 bg-(--bg-card) border border-(--border-color) rounded-lg outline-none font-mono text-xs"
    placeholder="09171234567"
  />
                      </div>
                      <div>
                        <label className="text-slate-400 text-[9px] uppercase font-bold block">Email Address</label>
                        <input
                          type="email"
                          value={editEmail}
                          onChange={e => setEditEmail(e.target.value)}
                          className="w-full p-2 bg-(--bg-card) border border-(--border-color) rounded-lg outline-none text-xs"
                        />
                      </div>
                      <div>
                        <label className="text-slate-400 text-[9px] uppercase font-bold block">Home Address</label>
                        <input
                          type="text"
                          value={editAddress}
                          onChange={e => setEditAddress(e.target.value)}
                          className="w-full p-2 bg-(--bg-card) border border-(--border-color) rounded-lg outline-none text-xs"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Emergency Contact */}
                <div className="p-4 bg-(--bg-page) border border-(--border-color) rounded-2xl space-y-3">
                  <h4 className="font-heading text-[10px] text-rose-500 uppercase tracking-wider flex items-center gap-1.5 font-bold">
                    <ShieldAlert className="w-3.5 h-3.5" /> Emergency Contact
                  </h4>

                  {!isEditing ? (
                    <div className="space-y-2 text-xs font-semibold">
                      <div>
                        <span className="text-slate-400 text-[9px] uppercase font-bold block">Contact Person</span>
                        <span className="text-(--color-text) font-bold">{localMember.emergency_contact_name || 'N/A'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[9px] uppercase font-bold block">Relationship</span>
                        <span className="text-(--color-text)">{localMember.relationship || 'N/A'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[9px] uppercase font-bold block">Emergency Phone</span>
                        <span className="text-(--color-text) font-mono">{localMember.emergency_contact_phone || 'N/A'}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2 text-xs font-semibold">
                      <div>
                        <label className="text-slate-400 text-[9px] uppercase font-bold block">Contact Name</label>
                        <input
                          type="text"
                          value={editEmergencyName}
                          onChange={e => setEditEmergencyName(e.target.value)}
                          className="w-full p-2 bg-(--bg-card) border border-(--border-color) rounded-lg outline-none text-xs font-bold"
                        />
                      </div>
                      <div>
                        <div>
  <label className="text-slate-400 text-[9px] uppercase font-bold block">Relationship</label>
  <select
     value={editRelationship}
    onChange={e => setEditRelationship(e.target.value)}
  className="w-full p-2.5 border border-(--border-color) bg-slate-100 dark:bg-zinc-900 rounded-xl text-xs text-(--color-text) outline-none cursor-pointer font-medium"
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
                      </div>
                      <div>
                        <label className="text-slate-400 text-[9px] uppercase font-bold block">Emergency Phone</label>
                        <input
    type="text"
    value={editEmergencyPhone}
    onChange={e => setEditEmergencyPhone(e.target.value.replace(/\D/g, ''))}
    maxLength={11}
    className="w-full p-2 bg-(--bg-card) border border-(--border-color) rounded-lg outline-none font-mono text-xs"
    placeholder="09181234567"
  />
                      </div>
                    </div>
                  )}
                </div>

              </div>

              {/* SAVE EDITS BANNER */}
              {isEditing && (
                <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-2xl flex flex-wrap justify-between items-center gap-2">
                  <span className="text-xs font-semibold text-blue-500">Editing member profile details.</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setIsEditing(false)}
                      className="px-3 py-1.5 bg-slate-200 dark:bg-zinc-800 text-slate-700 dark:text-slate-300 rounded-lg text-[9px] font-heading font-bold uppercase cursor-pointer border-none"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveProfileChanges}
                      className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[9px] font-heading font-bold uppercase cursor-pointer border-none shadow-md flex items-center gap-1"
                    >
                      <Save className="w-3 h-3" /> Save Changes
                    </button>
                  </div>
                </div>
              )}

              {/* PARENT / GUARDIAN VERIFICATION PANEL */}
              {(isMinor || extMember.parent_name) && (
                <div className="p-4 bg-(--bg-page) border border-amber-500/30 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between border-b border-(--border-color) pb-2">
                    <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-widest flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-amber-500" /> Parent / Legal Guardian Verification
                    </span>
                    <span className="text-[8px] font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 font-bold">
                      ✓ E-Consent Verified
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs font-semibold">
                    <div>
                      <span className="text-[9px] text-slate-400 uppercase font-bold block">Parent Name</span>
                      <span className="text-amber-600 dark:text-amber-300 font-bold">{extMember.parent_name || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-400 uppercase font-bold block">Relationship</span>
                      <span className="text-(--color-text)">{extMember.parent_relationship || 'Father/Mother/Guardian'}</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-400 uppercase font-bold block">Parent Contact Phone</span>
                      <span className="text-amber-600 dark:text-amber-300 font-mono font-bold">{extMember.parent_phone || 'N/A'}</span>
                    </div>
                    {extMember.parent_email && (
                      <div className="col-span-2">
                        <span className="text-[9px] text-slate-400 uppercase font-bold block">Parent Email</span>
                        <span className="text-(--color-text) truncate block">{extMember.parent_email}</span>
                      </div>
                    )}
                    {extMember.consent_date && (
                      <div>
                        <span className="text-[9px] text-slate-400 uppercase font-bold block">Consent Timestamp</span>
                        <span className="text-slate-500 dark:text-slate-400 font-mono text-[10px]">
                          {new Date(extMember.consent_date).toLocaleDateString()}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* DIGITAL SIGNATURE PREVIEWS */}
                  {(extMember.applicant_signature || extMember.parent_signature) && (
                    <div className="grid grid-cols-2 gap-3 pt-2 border-t border-(--border-color)">
                      <div>
                        <span className="text-[9px] text-slate-400 font-bold uppercase block mb-1 flex items-center gap-1">
                          <FileSignature className="w-3 h-3 text-blue-500" /> Applicant Signature
                        </span>
                        {extMember.applicant_signature ? (
                          <div className="p-1 bg-white rounded-lg border border-slate-300 h-16 flex items-center justify-center">
                            <img src={extMember.applicant_signature} alt="Applicant Signature" className="max-h-full max-w-full object-contain" />
                          </div>
                        ) : (
                          <div className="p-2 bg-(--bg-card) rounded-lg border border-(--border-color) text-[10px] text-slate-400 italic text-center">
                            No e-signature attached
                          </div>
                        )}
                      </div>

                      <div>
                        <span className="text-[9px] text-slate-400 font-bold uppercase block mb-1 flex items-center gap-1">
                          <FileSignature className="w-3 h-3 text-amber-500" /> Parent/Guardian Signature
                        </span>
                        {extMember.parent_signature ? (
                          <div className="p-1 bg-white rounded-lg border border-slate-300 h-16 flex items-center justify-center">
                            <img src={extMember.parent_signature} alt="Parent Signature" className="max-h-full max-w-full object-contain" />
                          </div>
                        ) : (
                          <div className="p-2 bg-(--bg-card) rounded-lg border border-(--border-color) text-[10px] text-slate-400 italic text-center">
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

          {/* TAB 2: COMBINED CONTRACTS & BILLING */}
          {activeTab === 'Contracts & Billing' && (
            <div className="space-y-4 text-left animate-fade-in">
              <div className="space-y-2">
                <span className="text-[9px] font-heading font-black tracking-widest text-slate-400 uppercase block">
                  SUBSCRIPTION CONTRACTS
                </span>
                {subHistory.length === 0 ? (
                  <div className="p-6 bg-(--bg-page) border border-(--border-color) rounded-2xl text-center text-slate-400">
                    No subscription agreements recorded for this client.
                  </div>
                ) : (
                  subHistory.map((sub: Subscription) => (
                    <div key={sub.id} className="p-3.5 bg-(--bg-page) rounded-xl border border-(--border-color) flex justify-between items-center text-left">
                      <div>
                        <h5 className="font-bold text-(--color-text) font-semibold">{sub.plan_name}</h5>
                        <span className="font-mono text-[9px] text-slate-400 block mt-0.5">
                          {sub.id} • {new Date(sub.start_date).toLocaleDateString()} to {new Date(sub.end_date).toLocaleDateString()}
                        </span>
                        {sub.status === 'Voided' && sub.void_reason && (
                          <span className="text-[8px] font-mono text-rose-400 block mt-1">
                            Void Reason: {sub.void_reason} ({sub.voided_by || 'Admin'})
                          </span>
                        )}
                      </div>
                      <span className={`px-2.5 py-1 rounded-full text-[8px] font-mono font-bold uppercase border ${
                        sub.status === 'Active' 
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' 
                          : sub.status === 'Voided'
                          ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
                          : 'bg-slate-200 dark:bg-zinc-800 text-slate-500 border-slate-300 dark:border-zinc-700'
                      }`}>{sub.status}</span>
                    </div>
                  ))
                )}
              </div>

              {/* DANGER ZONE: VOID SUBSCRIPTION (ADMINISTRATOR ONLY) */}
              {isAdmin && stats.activeContract && (
                <div className="pt-4 border-t border-(--border-color) space-y-3 select-none">
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-heading font-black tracking-widest text-rose-500 uppercase">
                      DANGER ZONE
                    </span>
                    <div className="h-px flex-1 bg-rose-500/20" />
                  </div>

                  {!voidEligibility.eligible ? (
                    <div className="p-3 bg-zinc-900/80 border border-zinc-800 rounded-xl text-left space-y-1">
                      <div className="flex items-center gap-1.5 text-slate-400 font-bold text-[10px] uppercase">
                        <Lock className="w-3.5 h-3.5 text-slate-400" />
                        <span>Void Subscription Unavailable</span>
                      </div>
                      <p className="text-[9.5px] text-slate-400 font-sans leading-relaxed">
                        🔒 {voidEligibility.reason}
                      </p>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between p-3.5 bg-rose-500/5 border border-rose-500/20 rounded-xl">
                      <div className="text-left space-y-0.5">
                        <span className="font-bold text-xs text-rose-400 block">Void Active Subscription</span>
                        <span className="text-[9px] text-slate-400 block">
                          Cancel current agreement while preserving complete audit and financial history.
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsVoidModalOpen(true)}
                        className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-[9px] font-heading font-bold uppercase tracking-wider cursor-pointer border-none shadow-sm transition-colors shrink-0"
                      >
                        Void Subscription
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-2 pt-2 border-t border-(--border-color)">
                <span className="text-[9px] font-heading font-black tracking-widest text-slate-400 uppercase block flex items-center gap-1">
                  <ReceiptIcon className="w-3.5 h-3.5 text-emerald-500" /> INVOICES & PAYMENTS LOG
                </span>
                {invoices.length === 0 ? (
                  <div className="p-6 bg-(--bg-page) border border-(--border-color) rounded-2xl text-center text-slate-400">
                    No official receipt invoices stored for this client.
                  </div>
                ) : (
                  invoices.map((r: Receipt) => (
                    <div key={r.id} className="p-3.5 bg-(--bg-page) rounded-xl border border-(--border-color) flex justify-between items-center text-left">
                      <div>
                        <h5 className="font-bold text-(--color-text) font-semibold">{r.item_description}</h5>
                        <span className="font-mono text-[9px] text-slate-400 block mt-0.5">
                          {r.id} • {r.payment_method} • {new Date(r.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        <span className="font-mono font-black text-emerald-600 dark:text-emerald-400 text-xs">
                          ₱{r.amount.toLocaleString()}.00
                        </span>

                        <button
                          type="button"
                          onClick={() => handleOpenReceipt(r)}
                          className="px-2.5 py-1 bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/20 rounded-lg text-[9px] font-heading font-bold uppercase tracking-wider cursor-pointer transition-colors flex items-center gap-1"
                          title="View Official Receipt"
                        >
                          <Eye className="w-3 h-3" />
                          <span>Receipt</span>
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 3: CARDS (CONNECTED TO DIGITAL QR CARD PREVIEW) */}
          {activeTab === 'Cards' && (
            <div className="space-y-4 text-left animate-fade-in">
              {currentCard ? (
                <div className="p-4 bg-(--bg-page) rounded-2xl border border-(--border-color) space-y-4">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-(--border-color) pb-3">
                    <div className="space-y-0.5">
                      <span className="text-[8px] font-bold text-red-600 dark:text-red-400 uppercase tracking-widest block">ACTIVE SECURITY CREDENTIAL</span>
                      <h5 className="text-sm font-bold text-(--color-text) font-mono">{currentCard.card_number}</h5>
                      <p className="text-[10px] text-slate-400 font-mono">
                        Hardware Type: <strong>{currentCard.card_type}</strong> • Version: {currentCard.version}.0 • Issued: {new Date(currentCard.issued_at).toLocaleDateString()}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setIsDigitalQrModalOpen(true)}
                      className="px-3.5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl font-heading text-[9px] font-bold uppercase tracking-wider cursor-pointer shadow-sm flex items-center gap-1.5 transition-colors border-none shrink-0"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Print Digital Badge</span>
                    </button>
                  </div>

                  {/* ATHLETIC DIGITAL QR CARD PREVIEW */}
                  <div className="p-3 bg-black rounded-2xl border border-zinc-800 text-white text-left space-y-2.5 max-w-sm mx-auto shadow-xl select-none">
                    <div className="text-center space-y-0.5">
                      <div className="font-heading font-black text-xs uppercase text-white leading-none">WOLF PALOMAR GYM</div>
                      <div className="font-heading font-extrabold text-[9px] uppercase text-red-600 leading-none">MUAYTHAI BOXING</div>
                    </div>
                    
                    <div className="h-px bg-red-600 w-full" />
                    
                    <div className="grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-5 bg-white p-1.5 rounded-lg flex items-center justify-center">
                        <img 
                          src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(localMember.member_id)}`} 
                          alt="Card QR Code" 
                          className="w-16 h-16 block"
                        />
                      </div>
                      <div className="col-span-7 space-y-1 text-left">
                        <div className="text-[10px] font-bold text-white uppercase truncate">{localMember.full_name}</div>
                        <div className="text-[9px] font-mono text-zinc-400">{localMember.phone || 'N/A'}</div>
                        <div className="text-[8px] font-mono text-red-500 font-bold uppercase">{stats.activeContract?.plan_name || 'NO ACTIVE PLAN'}</div>
                      </div>
                    </div>

                    <div className="h-px bg-red-600 w-full" />

                    <div className="flex justify-between items-center text-[6.5px] font-bold text-zinc-400">
                      <span>NON-REFUNDABLE</span>
                      <span>NON-TRANSFERRABLE</span>
                    </div>
                  </div>

                </div>
              ) : (
                <div className="p-6 bg-(--bg-page) border border-(--border-color) rounded-2xl text-center text-slate-400">
                  No active physical security card assigned to this client.
                </div>
              )}

              <div className="flex gap-2 select-none">
                <button onClick={() => {
                  const reason = prompt('Specify replacement card reason:');
                  if (!reason) return;
                  try {
                    cardService.replace(localMember.member_id, reason, 'Admin Staff');
                    toast.success('Access card re-issued.');
                    onMutationSuccess();
                  } catch (err: any) {
                    toast.error(err.message);
                  }
                }} className="flex-1 py-2.5 bg-[#123c73] dark:bg-[#bf0202] hover:opacity-90 text-white font-bold rounded-xl font-heading tracking-wider uppercase border-none cursor-pointer">
                  Reissue Card Token
                </button>
              </div>
            </div>
          )}

          {/* TAB 4: ATTENDANCE */}
          {activeTab === 'Attendance' && (
            <div className="space-y-3 text-left animate-fade-in">
              <span className="text-[9px] font-heading font-black tracking-widest text-slate-400 uppercase block">
                FACILITY CHECK-IN LOGS
              </span>

              {attendanceLogs.length === 0 ? (
                <div className="p-8 bg-(--bg-page) border border-(--border-color) rounded-2xl text-center text-slate-400">
                  No check-in visits recorded for this member.
                </div>
              ) : (
                attendanceLogs.map((att: AttendanceRecord) => (
                  <div key={att.id} className="p-3.5 bg-(--bg-page) rounded-xl border border-(--border-color) flex justify-between items-center">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-(--color-text)">{att.plan_name || 'Standard Pass'}</span>
                        <span className="text-[9px] font-mono text-slate-400">({att.payment_method})</span>
                      </div>
                      <span className="font-mono text-[9px] text-slate-500 dark:text-slate-400 block">
                        Checked in at: {new Date(att.check_in_time).toLocaleString()} • Staff: {att.staff_name}
                      </span>
                    </div>

                    <div className="text-right">
                      <span className={`font-mono text-xs font-black ${
                        att.entry_fee > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'
                      }`}>
                        {att.entry_fee > 0 ? `₱${att.entry_fee.toFixed(2)}` : 'FREE (₱0)'}
                      </span>
                      <span className="text-[8px] font-mono text-slate-400 block uppercase">Paid Check-In</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* TAB 5: NOTES */}
          {activeTab === 'Notes' && (
            <div className="space-y-3 text-left animate-fade-in">
              <label className="text-[10px] uppercase text-slate-400 font-bold block">Internal Medical & Staff Remarks</label>
              <textarea 
                value={notes} 
                onChange={e => setNotes(e.target.value)} 
                rows={5} 
                className="w-full p-3 border border-(--border-color) bg-(--bg-page) rounded-2xl text-(--color-text) outline-none focus:border-(--color-primary) text-xs font-semibold leading-relaxed" 
                placeholder="Enter internal details (visible only to receptionists)..."
              />
              <button onClick={handleUpdateNotes} className="px-5 py-2.5 bg-[#123c73] dark:bg-[#bf0202] hover:opacity-90 text-white font-bold rounded-xl font-heading text-[9px] tracking-wider uppercase border-none cursor-pointer">
                Save Notes
              </button>
            </div>
          )}

        </div>

        {/* FOOTER ACTIONS - RESPONSIVE LAYOUT */}
        <div className="p-4 border-t border-(--border-color) bg-(--bg-page) flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 select-none w-full">
          
          <div className="flex items-center gap-2">
            {/* EDIT DETAILS BUTTON */}
            <div className="relative group flex-1 sm:flex-initial">
              <button
                type="button"
                disabled={hasActiveSubscription}
                onClick={() => {
                  setActiveTab('Overview');
                  setIsEditing(!isEditing);
                }}
                className={`w-full sm:w-auto px-3.5 py-2.5 rounded-xl flex items-center justify-center gap-1.5 text-[9px] font-heading font-bold transition-all border-none ${
                  hasActiveSubscription
                    ? 'bg-slate-200 dark:bg-zinc-800 text-slate-400 cursor-not-allowed opacity-50'
                    : isEditing
                    ? 'bg-blue-600 text-white shadow-md cursor-pointer'
                    : 'bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/20 cursor-pointer'
                }`}
              >
                {hasActiveSubscription ? <Lock className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
                <span>{isEditing ? 'Cancel Edit' : 'Edit Details'}</span>
              </button>

              {hasActiveSubscription && (
                <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block w-48 p-2 bg-zinc-900 text-white text-[9px] rounded-lg shadow-xl z-20 pointer-events-none font-sans font-medium">
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
                className={`w-full sm:w-auto px-3.5 py-2.5 rounded-xl flex items-center justify-center gap-1.5 text-[9px] font-heading font-bold transition-all border-none ${
                  hasActiveSubscription
                    ? 'bg-slate-200 dark:bg-zinc-800 text-slate-400 cursor-not-allowed opacity-50'
                    : 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/20 cursor-pointer'
                }`}
              >
                {hasActiveSubscription ? <Lock className="w-3.5 h-3.5" /> : <Trash2 className="w-3.5 h-3.5" />}
                <span>Delete Member</span>
              </button>

              {hasActiveSubscription && (
                <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block w-48 p-2 bg-zinc-900 text-white text-[9px] rounded-lg shadow-xl z-20 pointer-events-none font-sans font-medium">
                  🔒 Member cannot be deleted while an active subscription contract exists.
                </div>
              )}
            </div>
          </div>

          {/* STATUS ACTION TOGGLE */}
          <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-(--border-color)">
            <span className="text-[10px] font-bold text-slate-400 uppercase font-mono">
              Status: <strong className={localMember.status === 'Active' ? 'text-emerald-500' : 'text-amber-500'}>{localMember.status || 'Active'}</strong>
            </span>

            <button 
              type="button"
              onClick={() => setIsStatusModalOpen(true)} 
              className={`px-4 py-2.5 rounded-xl cursor-pointer flex items-center justify-center gap-1.5 text-[9px] font-heading font-bold border-none transition-all shadow-xs ${
                localMember.status === 'Active'
                  ? 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                  : 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-md'
              }`}
            >
              {localMember.status === 'Active' ? (
                <>
                  <UserX className="w-3.5 h-3.5 text-amber-500" />
                  <span>Suspend Member</span>
                </>
              ) : (
                <>
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>Activate Member</span>
                </>
              )}
            </button>
          </div>

        </div>

      </div>

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
        <div className="space-y-4 text-left">
          <p className="text-xs text-slate-600 dark:text-slate-300 font-medium leading-relaxed">
            Are you sure you want to {localMember.status === 'Active' ? 'suspend' : 'activate'} membership profile for{' '}
            <strong className="text-slate-900 dark:text-white font-bold">{localMember.full_name}</strong>?
          </p>

          <div className="flex gap-3 justify-end pt-2">
            <button
              type="button"
              onClick={() => setIsStatusModalOpen(false)}
              className="px-4 py-2.5 bg-slate-200 dark:bg-zinc-800 hover:bg-slate-300 dark:hover:bg-zinc-700 text-slate-700 dark:text-slate-300 rounded-xl text-[9px] font-heading font-bold uppercase tracking-wider cursor-pointer border-none"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleStatusToggleConfirm}
              className={`px-5 py-2.5 text-white rounded-xl text-[9px] font-heading font-bold uppercase tracking-wider cursor-pointer border-none shadow-md ${
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
        <div className="space-y-4 text-left">
          <p className="text-xs text-slate-600 dark:text-slate-300 font-medium leading-relaxed">
            Are you sure you want to delete profile for{' '}
            <strong className="text-slate-900 dark:text-white font-bold">{localMember.full_name}</strong>?
          </p>
          <p className="text-[10px] text-slate-400 font-mono">
            This record will be moved to the Member Recycle Bin.
          </p>

          <div className="flex gap-3 justify-end pt-2">
            <button
              type="button"
              onClick={() => setIsDeleteModalOpen(false)}
              className="px-4 py-2.5 bg-slate-200 dark:bg-zinc-800 hover:bg-slate-300 dark:hover:bg-zinc-700 text-slate-700 dark:text-slate-300 rounded-xl text-[9px] font-heading font-bold uppercase tracking-wider cursor-pointer border-none"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDeleteMemberConfirm}
              className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-[9px] font-heading font-bold uppercase tracking-wider cursor-pointer border-none shadow-md"
            >
              Confirm Delete
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
          <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-300 text-[10px] space-y-1">
            <p className="font-bold flex items-center gap-1.5">
              <AlertOctagon className="w-4 h-4 text-rose-400 shrink-0" />
              <span>This will cancel the current subscription while keeping it in the system for audit history.</span>
            </p>
            <p className="text-rose-400/80 font-mono text-[9px]">
              This action cannot be undone.
            </p>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] uppercase font-bold text-slate-400 block">
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
            <label className="text-[10px] uppercase font-bold text-slate-400 block">
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
            <label className="text-[10px] uppercase font-bold text-slate-400 block">
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
                <Eye className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="flex gap-3 justify-end pt-2 border-t border-(--border-color)">
            <button
              type="button"
              onClick={() => setIsVoidModalOpen(false)}
              className="px-4 py-2.5 bg-slate-200 dark:bg-zinc-800 hover:bg-slate-300 dark:hover:bg-zinc-700 text-slate-700 dark:text-slate-300 rounded-xl text-[9px] font-heading font-bold uppercase tracking-wider cursor-pointer border-none"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!voidReason || !adminPassword.trim() || isVerifyingVoid}
              onClick={handleConfirmVoidSubscription}
              className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-[9px] font-heading font-bold uppercase tracking-wider cursor-pointer border-none shadow-md transition-all flex items-center gap-1.5"
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
    </div>,
    document.body
  );
};