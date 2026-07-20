// src/pages/members/MembersList.tsx
import React, { useState, useEffect, useContext, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { 
  format, 
  parseISO 
} from 'date-fns';
import { useAuthStore } from '../../stores/authStore';
import { logAudit } from '../../lib/supabase/audit';
import { Table } from '../../components/ui/Table';
import type { Column } from '../../components/ui/Table';
import { useResponsiveItemsPerPage } from '../../lib/useResponsiveItemsPerPage';
import { toast } from 'react-toastify';
import { isSuperAdmin } from '../../constants/auth';

import { 
  ChevronRight, ChevronLeft, RotateCcw, Printer, Plus, Pencil, Trash2, X, Users, 
  UserCheck, AlertTriangle, UserX, UserMinus, QrCode, Award,
  Search
} from 'lucide-react';

// Separated Local Storage Component Imports
import { MemberFormModal } from './components/MemberFormModal';
import { MemberRecycleBin } from './components/MemberRecycleBin';
import { MemberQRPrintModal } from './components/MemberQRPrintModal';

// Shared Layout Header Context
import { HeaderActionsContext } from '../../routes';

interface Member {
  id: string;
  member_id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  avatar_url: string | null;
  membership_plan: string;
  expiry_date: string;
  status: 'Active' | 'Expires Soon' | 'Expired' | 'Suspended';
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

interface PlanItem {
  id: string;
  name: string;
  price: number;
  duration: string;
  features: string[];
}

const PLANS: PlanItem[] = [
  { id: 'plan-1', name: 'Monthly Plan', price: 1500, duration: '30 Days', features: ['Access to all weight equipment', 'Free locker usage', '1 Free trainer consultation'] },
  { id: 'plan-2', name: 'Regular Pass', price: 100, duration: 'Single Entry', features: ['Daily gym access', 'Valid for 24 hours'] },
  { id: 'plan-3', name: 'VIP Yearly Plan', price: 12000, duration: '365 Days', features: ['All Monthly Plan benefits', 'Unlimited sauna access', '10% supplement discount', 'Personal towel service'] },
  { id: 'plan-4', name: 'Weekly Pass', price: 500, duration: '7 Days', features: ['7 consecutive days of access', 'Free locker usage'] }
];

const INITIAL_MEMBERS: Member[] = [
  {
    id: 'member-1',
    member_id: 'WOLF-M-2026-2596',
    full_name: 'Adrian Romero Angeles',
    phone: '976207481',
    email: 'adrianangeles2212@gmail.com',
    avatar_url: null,
    membership_plan: 'Monthly Plan',
    expiry_date: '2026-08-19T00:00:00.000Z',
    status: 'Active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    deleted_at: null,
  }
];

const generateMemberId = () => {
  const year = new Date().getFullYear();
  const randomSeq = Math.floor(1000 + Math.random() * 9000);
  return `WOLF-M-${year}-${randomSeq}`;
};

interface MembersListProps {
  hideHeaderActions?: boolean;
}

export const MembersList: React.FC<MembersListProps> = ({ hideHeaderActions = false }) => {
  const { setActions } = useContext(HeaderActionsContext);
  const location = useLocation();

  const activeView = useMemo<'directory' | 'plans'>(() => {
    return location.pathname.includes('/plans') ? 'plans' : 'directory';
  }, [location]);

  const { user, profile } = useAuthStore() as any;

  const role = useMemo<'admin' | 'staff'>(() => {
    if (isSuperAdmin(user?.email)) return 'admin';
    return (profile?.role?.toLowerCase() === 'admin' ? 'admin' : 'staff');
  }, [user, profile]);

  const isAdmin = useMemo(() => {
    return role === 'admin';
  }, [role]);

  // Core Listings States
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  
  // Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('all');
  
  // Navigation & Modals Toggle States
  const [showFormModal, setShowFormModal] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false); 
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Active Plan QR Generator Preview Target
  const [selectedPreviewPlan, setSelectedPreviewPlan] = useState<PlanItem | null>(PLANS[0]);

  // Selection States for Bulk actions
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);

  // Form States (Single Edit/Create)
  const [formMemberId, setFormMemberId] = useState('');
  const [formFullName, setFormFullName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPlan, setFormPlan] = useState('Monthly Plan');
  const [formExpiryDate, setFormExpiryDate] = useState('');
  const [formStatus, setFormStatus] = useState<'Active' | 'Expires Soon' | 'Expired' | 'Suspended'>('Active');
  const [formImageUrl, setFormImageUrl] = useState('');

  const itemsPerPage = useResponsiveItemsPerPage();
  const [currentPage, setCurrentPage] = useState(1);

  // Synchronize dynamic flag changes safely in render-phase
  const hideHeaderActionsRef = useRef(hideHeaderActions);
  hideHeaderActionsRef.current = hideHeaderActions;

  // Retrieve client profiles entirely from browser local cache memory
  const fetchMembers = () => {
    try {
      setLoading(true);
      const saved = localStorage.getItem('palomar_gym_members');
      if (saved) {
        setMembers(JSON.parse(saved));
      } else {
        localStorage.setItem('palomar_gym_members', JSON.stringify(INITIAL_MEMBERS));
        setMembers(INITIAL_MEMBERS);
      }
    } catch (err) {
      console.warn('Could not load member records.', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMembers();
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 8 * 1024 * 1024) {
      toast.error('Selected file exceeds maximum limit of 8MB.');
      return;
    }

    try {
      setUploading(true);
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormImageUrl(reader.result as string);
        toast.success('Profile image processed.');
        setUploading(false);
      };
      reader.readAsDataURL(file);
    } catch {
      toast.error('Image upload failed.');
      setUploading(false);
    }
  };

  const handleCreateClick = () => {
    setIsEditing(false);
    setSelectedMemberId(null);
    setFormMemberId(generateMemberId());
    setFormFullName('');
    setFormPhone('');
    setFormEmail('');
    setFormPlan('Monthly Plan');
    const defaultExpiry = new Date();
    defaultExpiry.setDate(defaultExpiry.getDate() + 30);
    setFormExpiryDate(format(defaultExpiry, 'yyyy-MM-dd'));
    setFormStatus('Active');
    setFormImageUrl('');
    setShowFormModal(true);
  };

  const handleEditClick = (member: Member) => {
    setIsEditing(true);
    setSelectedMemberId(member.id);
    setFormMemberId(member.member_id);
    setFormFullName(member.full_name);
    setFormPhone(member.phone || '');
    setFormEmail(member.email || '');
    setFormPlan(member.membership_plan);
    setFormExpiryDate(member.expiry_date ? format(parseISO(member.expiry_date), 'yyyy-MM-dd') : '');
    setFormStatus(member.status);
    setFormImageUrl(member.avatar_url || '');
    setShowFormModal(true);
  };

  const handleSaveMember = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      setSaving(true);
      const nameClean = formFullName.trim();
      const planClean = formPlan.trim();

      if (!nameClean) {
        toast.error('Member name is required.');
        return;
      }

      const saved = localStorage.getItem('palomar_gym_members');
      const currentMembers: Member[] = saved ? JSON.parse(saved) : INITIAL_MEMBERS;

      if (isEditing && selectedMemberId) {
        const updatedMembers = currentMembers.map(m => {
          if (m.id === selectedMemberId) {
            return {
              ...m,
              member_id: formMemberId.trim(),
              full_name: nameClean,
              phone: formPhone.trim() || null,
              email: formEmail.trim() || null,
              membership_plan: planClean,
              expiry_date: formExpiryDate ? new Date(formExpiryDate).toISOString() : new Date().toISOString(),
              status: formStatus,
              avatar_url: formImageUrl.trim() || null,
              updated_at: new Date().toISOString()
            };
          }
          return m;
        });

        localStorage.setItem('palomar_gym_members', JSON.stringify(updatedMembers));
        toast.success('Member record updated.');

        await logAudit(
          'MEMBER_UPDATED',
          `Updated directory details for "${nameClean}".`,
          selectedMemberId
        );
        setSelectedMemberIds(prev => prev.filter(id => id !== selectedMemberId));
      } else {
        const newMember: Member = {
          id: `member-${Math.random().toString(36).substring(2, 9)}`,
          member_id: formMemberId.trim(),
          full_name: nameClean,
          phone: formPhone.trim() || null,
          email: formEmail.trim() || null,
          membership_plan: planClean,
          expiry_date: formExpiryDate ? new Date(formExpiryDate).toISOString() : new Date().toISOString(),
          status: formStatus,
          avatar_url: formImageUrl.trim() || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          deleted_at: null
        };

        const updatedMembers = [newMember, ...currentMembers];
        localStorage.setItem('palomar_gym_members', JSON.stringify(updatedMembers));
        toast.success('New member registered.');

        await logAudit(
          'MEMBER_CREATED',
          `Enrolled new gym member "${nameClean}" under a "${planClean}".`,
          newMember.id
        );
      }

      setShowFormModal(false);
      fetchMembers();
    } catch {
      toast.error('Failed to save parameters.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteMember = async (id: string) => {
    try {
      const saved = localStorage.getItem('palomar_gym_members');
      const currentMembers: Member[] = saved ? JSON.parse(saved) : [];
      const targetMember = currentMembers.find(p => p.id === id);

      if (targetMember) {
        const savedDeleted = localStorage.getItem('palomar_gym_members_deleted');
        const deletedList = savedDeleted ? JSON.parse(savedDeleted) : [];
        const deletedMember = {
          ...targetMember,
          deleted_at: new Date().toISOString()
        };
        localStorage.setItem('palomar_gym_members_deleted', JSON.stringify([deletedMember, ...deletedList]));

        const updatedMembers = currentMembers.filter(p => p.id !== id);
        localStorage.setItem('palomar_gym_members', JSON.stringify(updatedMembers));
        
        toast.success('Member moved to Recycle Bin.');

        await logAudit(
          'MEMBER_DELETED',
          `Moved member "${targetMember.full_name}" to Recycle Bin.`,
          id
        );
      }

      setDeleteConfirmId(null);
      fetchMembers();
    } catch {
      toast.error('Action denied.');
    }
  };

  const handleBulkDelete = async () => {
    if (selectedMemberIds.length === 0) return;

    try {
      const saved = localStorage.getItem('palomar_gym_members');
      const currentMembers: Member[] = saved ? JSON.parse(saved) : [];

      const targets = currentMembers.filter(m => selectedMemberIds.includes(m.id));
      const remaining = currentMembers.filter(m => !selectedMemberIds.includes(m.id));

      const savedDeleted = localStorage.getItem('palomar_gym_members_deleted');
      const deletedList = savedDeleted ? JSON.parse(savedDeleted) : [];

      const deletedMembers = targets.map(t => ({
        ...t,
        deleted_at: new Date().toISOString()
      }));

      localStorage.setItem('palomar_gym_members_deleted', JSON.stringify([...deletedMembers, ...deletedList]));
      localStorage.setItem('palomar_gym_members', JSON.stringify(remaining));

      toast.success(`Successfully archived ${selectedMemberIds.length} profiles.`);
      setSelectedMemberIds([]);
      fetchMembers();
    } catch {
      toast.error('Bulk deletion failed.');
    }
  };

  const stats = useMemo(() => {
    return {
      total: members.length,
      active: members.filter(p => p.status === 'Active').length,
      expiresSoon: members.filter(p => p.status === 'Expires Soon').length,
      expired: members.filter(p => p.status === 'Expired').length,
    };
  }, [members]);

  const filteredMembers = useMemo(() => {
    return members.filter((p) => {
      const query = searchQuery.toLowerCase().trim();
      const matchesSearch = query === '' || 
        p.full_name.toLowerCase().includes(query) ||
        p.member_id.toLowerCase().includes(query) ||
        (p.phone && p.phone.includes(query)) ||
        p.membership_plan.toLowerCase().includes(query);

      if (!matchesSearch) return false;

      if (selectedStatusFilter === 'all') return true;
      if (selectedStatusFilter === 'active') return p.status === 'Active';
      if (selectedStatusFilter === 'expires_soon') return p.status === 'Expires Soon';
      if (selectedStatusFilter === 'expired') return p.status === 'Expired';
      if (selectedStatusFilter === 'suspended') return p.status === 'Suspended';
      return true;
    });
  }, [members, searchQuery, selectedStatusFilter]);

  const totalItems = filteredMembers.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
  const clampedPage = Math.min(Math.max(currentPage, 1), totalPages);

  const paginatedMembers = useMemo(() => {
    const startIdx = (clampedPage - 1) * itemsPerPage;
    return filteredMembers.slice(startIdx, startIdx + itemsPerPage);
  }, [filteredMembers, clampedPage, itemsPerPage]);

  const startIndex = (clampedPage - 1) * itemsPerPage;

  const getRowStyle = (member: Member) => {
    const isSelected = selectedMemberIds.includes(member.id);
    const isSuspended = member.status === 'Suspended' || member.status === 'Expired';

    if (isSelected) {
      return 'group !bg-blue-500/10 hover:!bg-blue-500/15 border-l-2 border-blue-500 transition-colors duration-150';
    }
    if (isSuspended) {
      return 'group bg-slate-200/50 dark:bg-neutral-900/40 hover:!bg-blue-500/5 dark:hover:!bg-blue-500/10 opacity-60 text-slate-455 dark:text-slate-500 transition-colors duration-150';
    }
    return 'group hover:!bg-blue-500/5 dark:hover:!bg-blue-500/10 transition-colors duration-150';
  };

  const handleRowClick = (member: Member) => {
    setSelectedMemberIds(prev =>
      prev.includes(member.id)
        ? prev.filter(id => id !== member.id)
        : [...prev, member.id]
    );
  };

  const isSelectionActive = selectedMemberIds.length > 0;

  const columns: Column<Member>[] = [
    {
      key: 'select',
      header: isSelectionActive ? (
        <div className="flex items-center justify-center h-full w-full py-1">
          <input
            type="checkbox"
            checked={filteredMembers.length > 0 && filteredMembers.every(p => selectedMemberIds.includes(p.id))}
            onChange={(e) => {
              if (e.target.checked) {
                const currentIds = filteredMembers.map(p => p.id);
                setSelectedMemberIds(prev => Array.from(new Set([...prev, ...currentIds])));
              } else {
                const currentIds = filteredMembers.map(p => p.id);
                setSelectedMemberIds(prev => prev.filter(id => !currentIds.includes(id)));
              }
            }}
            className="w-5 h-5 rounded border-slate-300 dark:border-white/10 text-blue-600 focus:ring-blue-500 cursor-pointer accent-[#123c73] transition-transform duration-150 hover:scale-105"
            title="Toggle Select All"
          />
        </div>
      ) : null, 
      headerClassName: 'w-12 text-center',
      cellClassName: 'text-center p-0', 
      render: (item) => isSelectionActive ? ( 
        <label className="flex items-center justify-center w-full h-11 py-2 cursor-pointer transition-colors hover:bg-slate-500/5 select-none" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={selectedMemberIds.includes(item.id)}
            onChange={(e) => {
              if (e.target.checked) {
                setSelectedMemberIds(prev => [...prev, item.id]);
              } else {
                setSelectedMemberIds(prev => prev.filter(id => id !== item.id));
              }
            }}
            className="w-5 h-5 rounded border-slate-300 dark:border-white/10 text-blue-600 cursor-pointer accent-(--color-primary) transition-transform duration-150 hover:scale-110"
          />
        </label>
      ) : null
    },
    {
      key: 'full_name',
      header: 'Full Name',
      sortable: true,
      render: (item) => (
        <div className="flex items-center gap-3 py-1 text-left">
          {item.avatar_url ? (
            <img 
              src={item.avatar_url} 
              alt={item.full_name} 
              className={`w-10 h-10 rounded-xl object-cover border border-(--border-color) shrink-0 ${item.status === 'Suspended' ? 'grayscale opacity-75' : ''}`} 
            />
          ) : (
            <div className="w-10 h-10 rounded-xl bg-(--bg-page) border border-(--border-color) flex items-center justify-center text-slate-455 font-bold text-base shadow-inner shrink-0">
              {item.full_name[0]}
            </div>
          )}
          <div>
            <span className="font-semibold tracking-wide block text-sm leading-snug">{item.full_name}</span>
            {item.phone && <span className="text-[10px] text-slate-400 font-mono block mt-0.5">{item.phone}</span>}
          </div>
        </div>
      )
    },
    {
      key: 'membership_plan',
      header: 'Membership Plan',
      sortable: true,
      render: (item) => (
        <span className="font-sans font-bold text-xs opacity-90">
          {item.membership_plan}
        </span>
      )
    },
    {
      key: 'expiry_date',
      header: 'Expiration Date',
      sortable: true,
      render: (item) => {
        const expDate = parseISO(item.expiry_date);
        const rawDaysLeft = Math.ceil((expDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
        const daysLeft = isNaN(rawDaysLeft) ? 0 : rawDaysLeft;

        return (
          <div>
            <span className="block font-mono text-[11px] font-bold">{format(expDate, 'MMM dd, yyyy')}</span>
            {daysLeft > 0 ? (
              <span className={`text-[9px] font-semibold ${daysLeft <= 7 ? 'text-amber-500' : 'text-slate-400'}`}>
                {daysLeft} days remaining
              </span>
            ) : (
              <span className="text-[9px] text-red-500 font-bold leading-none">Expired</span>
            )}
          </div>
        );
      }
    },
    {
      key: 'status',
      header: 'System Status',
      sortable: true,
      render: (item) => {
        if (item.status === 'Active') {
          return (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 text-[10px] text-emerald-400 border border-emerald-500/20 rounded-full font-bold tracking-wider uppercase">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              ACTIVE
            </span>
          );
        }
        if (item.status === 'Expires Soon') {
          return (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-500/10 text-[10px] text-amber-505 border border-amber-500/20 rounded-full font-bold tracking-wider uppercase">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-450" />
              EXPIRES SOON
            </span>
          );
        }
        if (item.status === 'Suspended') {
          return (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-rose-500/10 text-[10px] text-rose-500 border border-rose-500/20 rounded-full font-bold tracking-wider uppercase">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-455" />
              SUSPENDED
            </span>
          );
        }
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-red-500/10 text-[10px] text-red-500 border border-red-500/20 rounded-full font-bold tracking-wider uppercase">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
            EXPIRED
          </span>
        );
      }
    },
    {
      key: 'actions',
      header: 'ACTIONS',
      headerClassName: 'text-right justify-end',
      cellClassName: 'text-right py-1',
      render: (item) => {
        if (!isAdmin) return <span className="text-xs text-slate-400 dark:text-slate-500 font-bold">View Only</span>;
        
        const isSelected = selectedMemberIds.includes(item.id);
        if (isSelected) return null;

        return (
          <div 
            className="flex items-center gap-2 justify-end opacity-0 group-hover:opacity-100 transition-all duration-150" 
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => handleEditClick(item)}
              className="flex items-center justify-center h-8 w-8 bg-(--color-primary)/10 hover:bg-(--color-primary) text-(--color-primary-light) hover:text-white rounded-lg transition-all duration-200 cursor-pointer font-bold border border-(--border-primary)/20 hover:scale-110 shrink-0"
              title="Edit Member Parameters"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setDeleteConfirmId(item.id)}
              className="flex items-center justify-center h-8 w-8 bg-red-500/10 hover:bg-red-655 hover:text-white rounded-lg transition-all duration-200 cursor-pointer font-bold border border-red-500/20 hover:scale-110 shrink-0"
              title="Delete Profile"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        );
      }
    }
  ];

  // Synchronize dynamic topbar actions depending on the view
  useEffect(() => {
    if (hideHeaderActions) return;

    const updateHeaderActions = () => {
      if (isAdmin && selectedMemberIds.length === 0) {
        if (activeView === 'directory') {
          setActions(
            <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto justify-end animate-fade-in">
              <button
                onClick={() => setShowRecoveryModal(true)}
                className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 dark:bg-[#161920] hover:bg-slate-200 dark:hover:bg-[#1e232d] text-(--color-text) border border-(--border-color) text-[10px] font-heading tracking-widest uppercase rounded-lg transition-all cursor-pointer animate-fade-in font-bold border-none"
                title="View and restore soft-deleted members"
              >
                <RotateCcw className="w-3.5 h-3.5 text-amber-500 animate-fade-in" />
                <span>Recycle Bin</span>
              </button>

              <button
                onClick={() => setShowPrintModal(true)}
                className="flex items-center gap-2 px-4 py-2.5 bg-[#1e232d] hover:bg-slate-800 text-white border border-white/5 text-[10px] font-heading tracking-widest uppercase rounded-lg transition-all cursor-pointer animate-fade-in font-bold border-none"
                title="Generate printable member QR cards"
              >
                <Printer className="w-3.5 h-3.5 text-blue-500 animate-fade-in" />
                <span>Print Member QRs</span>
              </button>

              <button
                onClick={handleCreateClick}
                className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500 text-white hover:bg-emerald-600 text-[10px] font-heading tracking-widest uppercase rounded-lg transition-all cursor-pointer shadow-lg shadow-emerald-500/10 animate-fade-in font-bold border-none"
              >
                <Plus className="w-3.5 h-3.5 animate-fade-in" />
                Add Member
              </button>
            </div>
          );
        } else {
          // activeView === 'plans'
          setActions(
            <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto justify-end animate-fade-in">
              <button
                onClick={() => {
                  if (selectedPreviewPlan) {
                    const printWindow = window.open('', '_blank');
                    if (printWindow) {
                      const qrImageSrc = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(`WOLF-PLAN-${selectedPreviewPlan.name.toLowerCase().replace(/\s+/g, '-')}`)}`;
                      printWindow.document.write(`
                        <html>
                          <head>
                            <title>Hardware Plan Card - Wolf Gym</title>
                            <style>
                              body { font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
                              .card { border: 2px solid #bf0202; border-radius: 20px; padding: 25px; text-align: center; width: 260px; box-shadow: 0 10px 25px rgba(0,0,0,0.15); }
                              h2 { margin: 0 0 15px; color: #bf0202; font-size: 14px; letter-spacing: 2px; }
                              p { margin: 12px 0 0; font-size: 12px; font-weight: bold; color: #1a1a1a; }
                            </style>
                          </head>
                          <body onload="window.print(); window.close();">
                            <div class="card">
                              <h2>WOLF HARDWARE CARD</h2>
                              <img src="${qrImageSrc}" alt="QR" style="width: 140px; height: 140px;" />
                              <p>${selectedPreviewPlan.name.toUpperCase()}</p>
                            </div>
                          </body>
                        </html>
                      `);
                      printWindow.document.close();
                    }
                  }
                }}
                className="flex items-center gap-2 px-4 py-2.5 bg-[#1e232d] hover:bg-slate-800 text-white border border-white/5 text-[10px] font-heading tracking-widest uppercase rounded-lg transition-all cursor-pointer animate-fade-in font-bold border-none"
              >
                <Printer className="w-3.5 h-3.5 text-blue-500 animate-fade-in" />
                <span>PRINT SELECTED CARD</span>
              </button>
            </div>
          );
        }
      } else {
        setActions(null);
      }
    };

    const timer = setTimeout(updateHeaderActions, 0);
    return () => {
      clearTimeout(timer);
      if (!hideHeaderActionsRef.current) {
        setActions(null);
      }
    };
  }, [isAdmin, selectedMemberIds.length, location.pathname, setActions, hideHeaderActions, activeView, selectedPreviewPlan]);

  return (
    <div className="relative min-h-[85vh] w-full animate-fade-in">

      {/* ─── TIMELINE CANVAS GRID SCROLLER ─── */}
      <div className="relative w-full h-full min-h-[80vh] overflow-hidden grid grid-cols-1 items-start">
        
        {/* VIEW 1: DIRECTORY LEDGER PANEL */}
        <div 
          className="w-full h-full space-y-6 pb-36"
          style={{
            gridColumn: 1,
            gridRow: 1,
            transform: activeView === 'directory' ? 'translate3d(0, 0, 0)' : 'translate3d(-101%, 0, 0)',
            opacity: activeView === 'directory' ? 1 : 0,
            pointerEvents: activeView === 'directory' ? 'auto' : 'none',
            transition: 'transform 800ms cubic-bezier(0.77, 0, 0.175, 1), opacity 800ms cubic-bezier(0.77, 0, 0.175, 1)'
          }}
        >
          {/* Overview stats cards */}
          <div className="hidden md:grid grid-cols-4 gap-4">
            <div className="p-4 bg-(--bg-card) border border-(--border-color) rounded-2xl flex items-center gap-3">
              <div className="p-2 bg-blue-500/10 rounded-lg text-blue-500 border border-blue-500/20 shrink-0">
                <Users className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block leading-none">TOTAL MEMBERS</span>
                <span className="text-xs font-extrabold text-(--color-text) font-heading tracking-wide truncate block mt-1.5 leading-none">
                  {stats.total} Profiles
                </span>
              </div>
            </div>

            <div className="p-4 bg-(--bg-card) border border-(--border-color) rounded-2xl flex items-center gap-3">
              <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-500 border border-emerald-500/20 shrink-0">
                <UserCheck className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block leading-none">ACTIVE MEMBERS</span>
                <span className="text-xs font-extrabold text-(--color-text) font-heading tracking-wide truncate block mt-1.5 leading-none">
                  {stats.active} Active
                </span>
              </div>
            </div>

            <div className="p-4 bg-(--bg-card) border border-(--border-color) rounded-2xl flex items-center gap-3">
              <div className="p-2 bg-amber-500/10 rounded-lg text-amber-500 border border-amber-500/20 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block leading-none">EXPIRING SOON</span>
                <span className="text-xs font-extrabold text-(--color-text) font-heading tracking-wide truncate block mt-1.5 leading-none">
                  {stats.expiresSoon} Members
                </span>
              </div>
            </div>

            <div className="p-4 bg-(--bg-card) border border-(--border-color) rounded-2xl flex items-center gap-3">
              <div className="p-2 bg-red-500/10 rounded-lg text-red-500 border border-red-500/20 shrink-0">
                <UserX className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block leading-none">EXPIRED LISTS</span>
                <span className="text-xs font-extrabold text-(--color-text) font-heading tracking-wide truncate block mt-1.5 leading-none">
                  {stats.expired} Expired
                </span>
              </div>
            </div>
          </div>

          {/* Filter Options toolbar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-(--bg-card) p-3 rounded-xl border border-(--border-color) shadow-xs mt-6">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search members by name, code ID, or plan category..."
                className="w-full pl-10 pr-10 py-2 border border-(--border-color) rounded-lg bg-(--bg-page) text-xs text-(--color-text) outline-none focus:border-slate-400 transition-all font-medium animate-fade-in"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-655 cursor-pointer p-0.5 rounded-full hover:bg-slate-200 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 justify-between shrink-0">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Status:</span>
              <select
                value={selectedStatusFilter}
                onChange={(e) => setSelectedStatusFilter(e.target.value)}
                className="px-3 py-1.5 bg-(--bg-page) border border-(--border-color) rounded-lg text-xs text-(--color-text) font-semibold outline-none focus:border-slate-400 transition-all cursor-pointer"
              >
                <option value="all">ALL MEMBERS</option>
                <option value="active">ACTIVE ONLY</option>
                <option value="expires_soon">EXPIRING SOON</option>
                <option value="expired">EXPIRED ONLY</option>
                <option value="suspended">SUSPENDED</option>
              </select>
            </div>
          </div>

          {/* Products Table & Mobile Cards */}
          {loading ? (
            <div className="p-1 rounded-2xl border border-(--border-color) bg-(--bg-card) overflow-x-auto w-full">
              <Table<Member>
                data={[]}
                columns={columns}
                itemsPerPage={itemsPerPage}
                loading={true}
              />
            </div>
          ) : filteredMembers.length === 0 ? (
            <div className="p-12 text-center bg-(--bg-card) border border-(--border-color) rounded-2xl space-y-4">
              <div className="w-16 h-16 bg-slate-100 dark:bg-neutral-800 rounded-full flex items-center justify-center mx-auto text-slate-455">
                <UserMinus className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h3 className="font-heading text-sm uppercase tracking-widest text-(--color-text)">No members found</h3>
                <p className="text-xs text-slate-455 max-w-xs mx-auto leading-relaxed">
                  No registered profiles match your search criteria.
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* MOBILE VIEW */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:hidden">
                {paginatedMembers.map((member) => {
                  const isSelected = selectedMemberIds.includes(member.id);
                  const isSuspended = member.status === 'Suspended' || member.status === 'Expired';
                  
                  return (
                    <div 
                      key={member.id}
                      onClick={() => handleRowClick(member)}
                      className={`p-4 border rounded-2xl relative flex flex-col gap-3 transition-all duration-150 cursor-pointer ${
                        isSelected 
                          ? 'bg-blue-500/10 border-blue-500 ring-1 ring-blue-500 shadow-sm' 
                          : isSuspended
                            ? 'bg-slate-200/50 dark:bg-neutral-900/40 opacity-60 text-slate-455 dark:text-slate-500 border-(--border-color)'
                            : 'bg-(--bg-card) border-(--border-color) hover:border-slate-300 dark:hover:border-slate-700'
                      }`}
                    >
                      <div className="flex justify-between items-center">
                        {isSelectionActive ? (
                          <label className="flex items-center gap-2 cursor-pointer py-1 pr-4" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleRowClick(member)}
                              className="w-5 h-5 rounded border-slate-300 dark:border-white/10 text-blue-600 cursor-pointer accent-[#123c73]"
                            />
                            <span className="text-[10px] font-bold uppercase select-none text-slate-505">Select</span>
                          </label>
                        ) : (
                          <div className="w-1" /> 
                        )}
                        
                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                          member.status === 'Active' 
                            ? 'bg-emerald-500/10 text-emerald-400' 
                            : member.status === 'Suspended' 
                              ? 'bg-rose-500/10 text-rose-505' 
                              : 'bg-red-500/10 text-red-500'
                        }`}>
                          {member.status}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-3 min-h-12 text-xs font-semibold">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          {member.avatar_url ? (
                            <img 
                              src={member.avatar_url} 
                              alt={member.full_name} 
                              className={`w-12 h-12 rounded-xl object-cover border border-(--border-color) shrink-0 ${isSuspended ? 'grayscale opacity-75' : ''}`} 
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-xl bg-(--bg-page) border border-(--border-color) flex items-center justify-center text-slate-400 font-bold text-lg shadow-inner shrink-0">
                              {member.full_name[0]}
                            </div>
                          )}
                          
                          <div className="min-w-0 flex-1 text-left">
                            <h4 className="font-semibold text-sm truncate leading-snug">{member.full_name}</h4>
                            <p className="font-sans font-bold text-emerald-500 text-xs mt-0.5 leading-none">{member.membership_plan}</p>
                          </div>
                        </div>

                        {isSelected && (
                          <div className="bg-white p-1 rounded-lg border border-slate-200 dark:border-white/10 shadow-sm shrink-0 w-20 h-20 flex items-center justify-center animate-scale-up">
                            <img 
                              src={`https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(member.member_id)}`} 
                              alt="QR" 
                              className="w-18 h-18"
                            />
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-2 border-t border-(--border-color) pt-2 text-[11px] leading-none">
                        <div className="space-y-1 text-left">
                          <span className="text-slate-400 dark:text-slate-500 font-semibold uppercase text-[9px] block">Expiration</span>
                          <span className="font-bold text-slate-600 dark:text-slate-355">{format(parseISO(member.expiry_date), 'MMM dd, yyyy')}</span>
                        </div>
                        
                        <div className="space-y-1 text-right">
                          <span className="text-slate-400 dark:text-slate-555 font-semibold uppercase text-[9px] block">Member QR ID</span>
                          <span className="font-mono font-bold text-slate-400 dark:text-slate-300">{member.member_id}</span>
                        </div>
                      </div>

                      {isAdmin && isSelected && selectedMemberIds.length === 1 && (
                        <div 
                          className="flex gap-2 mt-1 pt-2 border-t border-(--border-color) animate-slide-up"
                          onClick={(e) => e.stopPropagation()} 
                        >
                          <button
                            type="button"
                            onClick={() => handleEditClick(member)}
                            className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-750 transition-colors border-none"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            Edit Member
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteConfirmId(member.id)}
                            className="flex-1 py-2.5 bg-red-500/10 text-red-500 hover:bg-red-655 hover:text-white rounded-xl text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors cursor-pointer border-none"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Archive
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectedMemberIds(prev => prev.filter(id => id !== member.id))}
                            className="px-3 py-2.5 bg-slate-200 dark:bg-slate-800 text-slate-505 rounded-xl text-[10px] font-bold uppercase tracking-wider flex items-center justify-center cursor-pointer hover:bg-slate-350 transition-colors border-none"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* DESKTOP SPREADSHEET VIEW */}
              <div className="hidden md:block p-1 rounded-2xl border border-(--border-color) bg-(--bg-card) overflow-x-auto lg:overflow-x-visible w-full">
                <Table<Member>
                  data={paginatedMembers}
                  columns={columns}
                  itemsPerPage={itemsPerPage}
                  loading={false}
                  getRowClassName={getRowStyle}
                  onRowClick={handleRowClick} 
                />
              </div>

              {/* CARD MULTI-ITEM AUTOMATED PAGINATION CONTROLS */}
              {totalItems > 0 && totalPages > 1 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-4 px-1 py-2 text-xs font-body animate-fade-in">
                  <span className="text-slate-500 dark:text-slate-400">
                    Showing <span className="font-semibold text-slate-900 dark:text-white">{startIndex + 1}</span> to{' '}
                    <span className="font-semibold text-slate-900 dark:text-white">{Math.min(startIndex + itemsPerPage, totalItems)}</span> of{' '}
                    <span className="font-semibold text-slate-900 dark:text-white">{totalItems}</span> entries
                  </span>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                      disabled={clampedPage === 1}
                      className="p-1.5 border border-(--border-color) rounded-lg hover:bg-slate-100 dark:hover:bg-neutral-800 text-slate-700 dark:text-slate-300 disabled:opacity-40 disabled:pointer-events-none transition-all cursor-pointer inline-flex items-center justify-center bg-transparent"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>

                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                      <button
                        key={page}
                        type="button"
                        onClick={() => setCurrentPage(page)}
                        className={`px-3 py-1.5 rounded-lg font-mono font-semibold transition-all cursor-pointer border-none ${
                          clampedPage === page
                            ? 'bg-[#1b365d] dark:bg-[#bf0202] text-white'
                            : 'border border-(--border-color) text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-neutral-800 bg-transparent'
                        }`}
                      >
                        {page}
                      </button>
                    ))}

                    <button
                      type="button"
                      onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                      disabled={clampedPage === totalPages}
                      className="p-1.5 border border-(--border-color) rounded-lg hover:bg-slate-100 dark:hover:bg-neutral-800 text-slate-700 dark:text-slate-300 disabled:opacity-40 disabled:pointer-events-none transition-all cursor-pointer inline-flex items-center justify-center bg-transparent"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* VIEW 2: MEMBERSHIP PLANS PANEL */}
        <div 
          className="w-full h-full space-y-6 pb-36 text-xs text-slate-500"
          style={{
            gridColumn: 1,
            gridRow: 1,
            transform: activeView === 'plans' ? 'translate3d(0, 0, 0)' : 'translate3d(101%, 0, 0)',
            opacity: activeView === 'plans' ? 1 : 0,
            pointerEvents: activeView === 'plans' ? 'auto' : 'none',
            transition: 'transform 800ms cubic-bezier(0.77, 0, 0.175, 1), opacity 800ms cubic-bezier(0.77, 0, 0.175, 1)'
          }}
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start mt-4">
            {/* Left list of custom plans */}
            <div className="md:col-span-2 space-y-3">
              <span className="text-[10px] font-heading tracking-widest text-[#123c73] dark:text-[#bf0202] uppercase font-bold block text-left">
                SELECTABLE CATALOG PLANS
              </span>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {PLANS.map(plan => {
                  const isSelected = selectedPreviewPlan?.id === plan.id;
                  return (
                    <div
                      key={plan.id}
                      onClick={() => setSelectedPreviewPlan(plan)}
                      className={`p-5 rounded-2xl border text-left cursor-pointer transition-all duration-300 ${
                        isSelected
                          ? 'bg-blue-500/10 border-blue-500 ring-1 ring-blue-500 shadow-md scale-[1.02]'
                          : 'bg-(--bg-card) border-(--border-color) hover:border-slate-300 dark:hover:border-zinc-700'
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <h4 className="font-heading text-sm font-bold tracking-wide text-slate-800 dark:text-white uppercase truncate">
                          {plan.name}
                        </h4>
                        <Award className={`w-5 h-5 shrink-0 ${isSelected ? 'text-blue-500' : 'text-slate-400'}`} />
                      </div>

                      <div className="flex items-baseline gap-1.5 mt-3 select-none leading-none">
                        <span className="text-xl font-mono font-black text-emerald-500">
                          ₱{plan.price}
                        </span>
                        <span className="text-[10px] font-bold text-slate-455">
                          / {plan.duration}
                        </span>
                      </div>

                      <ul className="mt-4 space-y-1.5 border-t border-(--border-color) pt-3 text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                        {plan.features.map((f, idx) => (
                          <li key={idx} className="flex items-center gap-1.5 truncate">
                            <span className="w-1 h-1 bg-emerald-500 rounded-full" />
                            <span>{f}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right dynamic QR Code Preview Card */}
            {selectedPreviewPlan && (
              <div className="p-6 bg-(--bg-card) border border-(--border-color) rounded-2xl flex flex-col items-center justify-center text-center space-y-4 shadow-md sticky top-6 animate-scale-up select-none">
                <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-zinc-800 border border-(--border-color) flex items-center justify-center text-(--color-primary-light) shrink-0">
                  <QrCode className="w-6 h-6" />
                </div>

                <div className="space-y-1">
                  <span className="text-[8px] font-heading font-black tracking-widest text-[#bf0202] uppercase leading-none block">
                    PLAN QR SIGNATURE
                  </span>
                  <h4 className="font-heading text-sm font-black tracking-wider text-slate-900 dark:text-white uppercase pt-1 leading-none">
                    {selectedPreviewPlan.name}
                  </h4>
                  <p className="text-[9px] text-slate-400 font-medium font-sans leading-none pt-0.5">
                    Generates access card tags for turnstiles
                  </p>
                </div>

                {/* Scannable SVG Frame Container */}
                <div className="p-3 bg-white border border-slate-200 dark:border-white/10 rounded-2xl shadow-inner flex items-center justify-center w-40 h-40">
                  <img 
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(`WOLF-PLAN-${selectedPreviewPlan.name.toLowerCase().replace(/\s+/g, '-')}`)}`} 
                    alt="Plan QR" 
                    className="w-36 h-36"
                  />
                </div>

                <div className="space-y-1 border-t border-(--border-color) pt-4 w-full text-[10px] leading-relaxed">
                  <div className="flex justify-between font-mono">
                    <span className="text-slate-400">Card Identifier:</span>
                    <span className="font-bold text-slate-700 dark:text-slate-300">
                      WOLF-PLAN-{selectedPreviewPlan.name.toLowerCase().substring(0, 4)}...
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Default Expiry:</span>
                    <span className="font-bold text-slate-700 dark:text-slate-300">{selectedPreviewPlan.duration}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Sticky portal-pinned bulk operations action-bar */}
      {selectedMemberIds.length > 0 && createPortal(
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-100 flex items-center justify-between gap-4 p-3 px-5 bg-slate-900/95 dark:bg-[#121315]/95 text-white border border-white/5 rounded-2xl shadow-2xl backdrop-blur-md animate-slide-up w-[calc(100vw-32px)] max-w-lg leading-none select-none">
          <div className="flex items-center gap-2">
            <span className="w-5.5 h-5.5 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[10px] font-black animate-pulse">
              {selectedMemberIds.length}
            </span>
            <span className="text-[10px] font-heading font-black tracking-widest uppercase">Members Selected</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowPrintModal(true)}
              className="p-2 px-3.5 bg-slate-800 hover:bg-slate-700 text-[10px] font-heading font-extrabold tracking-wider uppercase rounded-xl transition-all flex items-center gap-1.5 cursor-pointer border-none"
              title="Print QR Codes for selected members"
            >
              <Printer className="w-3.5 h-3.5 text-blue-400" />
              <span>Print QRs</span>
            </button>
            <button
              onClick={handleBulkDelete}
              className="p-2 px-3.5 bg-red-600 hover:bg-red-700 text-[10px] font-heading font-extrabold tracking-wider uppercase rounded-xl transition-all flex items-center gap-1.5 cursor-pointer border-none text-white font-bold"
              title="Archive selected member accounts"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Archive</span>
            </button>
            <button
              onClick={() => setSelectedMemberIds([])}
              className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white cursor-pointer hover:bg-slate-750 transition-colors border-none"
              title="Clear selection"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* ───── FORM MODAL (z-48 layout safe) ───── */}
      {showFormModal && (
        <MemberFormModal 
          isEditing={isEditing}
          formMemberId={formMemberId}
          setFormMemberId={setFormMemberId}
          formFullName={formFullName}
          setFormFullName={setFormFullName}
          formPhone={formPhone}
          setFormPhone={setFormPhone}
          formEmail={formEmail}
          setFormEmail={setFormEmail}
          formPlan={formPlan}
          setFormPlan={setFormPlan}
          formExpiryDate={formExpiryDate}
          setFormExpiryDate={setFormExpiryDate}
          formStatus={formStatus}
          setFormStatus={setFormStatus}
          formImageUrl={formImageUrl}
          saving={saving}
          uploading={uploading}
          onFileUpload={handleFileUpload}
          onSave={handleSaveMember}
          onClose={() => setShowFormModal(false)}
          generateMemberId={generateMemberId}
        />
      )}

      {/* ───── RESTORATION RECYCLE BIN (z-48 layout safe) ───── */}
      {showRecoveryModal && (
        <MemberRecycleBin
          isOpen={showRecoveryModal}
          onClose={() => setShowRecoveryModal(false)}
          onRestoreSuccess={fetchMembers}
        />
      )}

      {/* ───── SINGLE REMOVAL CONFIRM MODAL (z-48 layout safe) ───── */}
      {deleteConfirmId && (() => {
        const targetMember = members.find(p => p.id === deleteConfirmId);
        if (!targetMember) return null;
        return (
          <div className="fixed inset-0 z-48 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in text-xs text-(--color-text)">
            <div className="bg-(--bg-card) border border-(--border-color) rounded-3xl w-full max-w-md shadow-2xl p-6 text-center space-y-5 animate-scale-up">
              <div className="w-14 h-14 bg-red-500/10 border border-red-500/20 text-red-500 rounded-full flex items-center justify-center mx-auto">
                <Trash2 className="w-6 h-6" />
              </div>

              <div className="space-y-1">
                <h4 className="font-heading text-sm tracking-wider uppercase text-red-500">Confirm Archival</h4>
                <p className="text-slate-455 text-[11px] font-medium leading-relaxed">
                  Are you sure you want to move this member profile into the system Recycle Bin?
                </p>
              </div>

              <div className="p-4 bg-slate-100 dark:bg-[#1e232d] border border-(--border-color) rounded-2xl flex items-center gap-4 text-left">
                {targetMember.avatar_url ? (
                  <img src={targetMember.avatar_url} alt="" className="w-12 h-12 rounded-xl object-cover border" />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-(--bg-page) border flex items-center justify-center text-slate-400 font-heading text-lg">
                    {targetMember.full_name[0]}
                  </div>
                )}
                <div>
                  <h5 className="font-extrabold text-sm">{targetMember.full_name}</h5>
                  <span className="font-mono text-[10px] text-slate-455 block mt-0.5">{targetMember.member_id}</span>
                </div>
              </div>

              <div className="flex items-center justify-center gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setDeleteConfirmId(null)}
                  className="px-4 py-2.5 border border-(--border-color) bg-(--bg-card) text-slate-500 hover:text-slate-200 rounded-xl text-[10px] font-heading tracking-wider uppercase cursor-pointer"
                >
                  No, Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteMember(targetMember.id)}
                  className="px-5 py-2.5 bg-red-900 hover:bg-red-700 text-white rounded-xl text-[10px] font-heading tracking-wider uppercase cursor-pointer transition-all font-bold shadow-lg border-none"
                >
                  Archive Record
                </button>
              </div>
            </div>
          </div>
        );
      })()}
        
      {/* ───── QR PRINT MODAL (z-48 layout safe) ───── */}
      {showPrintModal && (
        <MemberQRPrintModal 
          selectedIds={selectedMemberIds}
          members={members}
          onClose={() => setShowPrintModal(false)}
        />
      )}
    </div>
  );
};

export default MembersList;
