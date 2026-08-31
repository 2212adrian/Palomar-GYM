// src/pages/members/MembersList.tsx

import React, { useState, useMemo, useEffect, useContext, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { 
  Users, Eye, CreditCard, RotateCcw, Plus, Search, Settings,
  X, UserX, UserCheck, QrCode, Filter, MoreVertical, Printer, Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Skeleton from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';

import { Table } from '../../components/ui/Table';
import type { Column } from '../../components/ui/Table';
import { Button } from '../../components/ui/Button';
import { useResponsiveItemsPerPage } from '../../lib/useResponsiveItemsPerPage';
import { HeaderActionsContext } from '../../routes';
import { supabase } from '../../lib/supabase/client';

// Import Shared Types
import type { 
  Member, Subscription, MemberCard, OnlineRegistration
} from '../../types/members';

// Import Services
import { memberService, subscriptionService, cardService } from './memberService';

// Import Modals & Views
import { OnlineQueue } from './components/OnlineQueue';
import { MemberProfileView } from './components/MemberProfileView';
import { MemberRecycleBin } from './components/MemberRecycleBin';
import { StaffPlansConsole, IntakeWizardModal } from './components/SubscriptionPlan'; 
import { DigitalQRCardModal } from './components/DigitalQRCardModal';
import { ManualCardTemplateModal } from './components/ManualCardTemplateModal';
import { MemberCardPrintModal } from './components/MemberCardPrintModal';
import { MemberAvatar } from './components/MemberAvatar';
import { toast } from 'react-toastify';

interface MembersListProps {
  hideHeaderActions?: boolean;
}

type FilterChip = 
  | 'all' 
  | 'suspended' 
  | 'with_sub' 
  | 'expiring' 
  | 'expired' 
  | 'has_card' 
  | 'no_card';

export const MembersList: React.FC<MembersListProps> = ({ hideHeaderActions = false }) => {
  const { setActions } = useContext(HeaderActionsContext);
  const location = useLocation();
  const navigate = useNavigate();
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const hasTriggeredRenewRef = useRef<boolean>(false);

  const isPlansPath = useMemo(() => {
    return location.pathname.includes('/plans');
  }, [location.pathname]);

  const [activeTab, setActiveTab] = useState<'Directory' | 'Queue'>('Directory');
  const [members, setMembers] = useState<Member[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [cards, setCards] = useState<MemberCard[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeChip, setActiveChip] = useState<FilterChip>('all');
  
  // Selection state for multi-select batch operations
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);

  // Modals state
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [isRecycleOpen, setIsRecycleOpen] = useState(false);
  const [selectedProfileMember, setSelectedProfileMember] = useState<Member | null>(null);
  const [wizardPrefillMember, setWizardPrefillMember] = useState<Member | undefined>(undefined);
  const [wizardPrefill, setWizardPrefill] = useState<OnlineRegistration | undefined>(undefined);

  // Mobile Action Sheet State
  const [mobileActionSheetMember, setMobileActionSheetMember] = useState<Member | null>(null);

  // Card modal state
  const [qrModalMember, setQrModalMember] = useState<Member | null>(null);
  const [manualModalMember, setManualModalMember] = useState<Member | null>(null);
  const [showBatchCardModal, setShowBatchCardModal] = useState<boolean>(false);

  // Action Menu state (Desktop Dropdown)
  const [openActionMenuId, setOpenActionMenuId] = useState<string | null>(null);

  // Mobile Pagination State
  const [mobilePage, setMobilePage] = useState(1);

  const itemsPerPage = useResponsiveItemsPerPage();

  const fetchMembers = useCallback(async () => {
    setLoading(true);
    try {
      const [membersData, subsData, cardsData] = await Promise.all([
        memberService.getAll(),
        subscriptionService.getAll(),
        cardService.getAll()
      ]);
      setMembers(membersData);
      setSubscriptions(subsData);
      setCards(cardsData);
    } catch (err: any) {
      console.error('Error fetching members data:', err);
      toast.error(err.message || 'Failed to load member records');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel('realtime-members-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'receipts' }, () => fetchMembers())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'subscriptions' }, () => fetchMembers())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'members' }, () => fetchMembers())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchMembers]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers, activeTab]);

  useEffect(() => {
    if (isPlansPath) {
      setActiveTab('Directory');
    }
  }, [isPlansPath]);

  // Launch Print Modal pre-selecting all "No Card Issued" members if no checkboxes selected
  const handleOpenPrintModal = useCallback(() => {
    if (selectedMemberIds.length === 0) {
      const unissuedIds = members.filter(m => {
        const c = cards.find((card: MemberCard) => card.member_id === m.member_id && card.status === 'Active');
        return !c || c.card_type === 'None';
      }).map(m => m.id);
      setSelectedMemberIds(unissuedIds);
    }
    setShowBatchCardModal(true);
  }, [selectedMemberIds, members, cards]);

  // Custom Event Listeners for Header Actions Sync
  useEffect(() => {
    const handlePrintEvent = () => handleOpenPrintModal();
    const handleRecycleEvent = () => setIsRecycleOpen(true);
    const handleWizardEvent = () => {
      setWizardPrefillMember(undefined);
      setWizardPrefill(undefined);
      setIsWizardOpen(true);
    };

    window.addEventListener('trigger-member-print', handlePrintEvent);
    window.addEventListener('trigger-member-recycle', handleRecycleEvent);
    window.addEventListener('trigger-member-wizard', handleWizardEvent);

    return () => {
      window.removeEventListener('trigger-member-print', handlePrintEvent);
      window.removeEventListener('trigger-member-recycle', handleRecycleEvent);
      window.removeEventListener('trigger-member-wizard', handleWizardEvent);
    };
  }, [handleOpenPrintModal]);

  // Keyboard Shortcut: Focus Search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === '/' && document.activeElement !== searchInputRef.current) {
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes((document.activeElement?.tagName || ''))) return;
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Reset mobile page on query change
  useEffect(() => {
    setMobilePage(1);
  }, [searchQuery, activeChip]);

  // Handle Automatic Renew from Dashboard or external redirection
  useEffect(() => {
    if (loading || members.length === 0 || hasTriggeredRenewRef.current) return;

    const searchParams = new URLSearchParams(location.search);
    const renewMemberId = searchParams.get('renewMemberId') || (location.state as any)?.renewMemberId;
    const memberName = searchParams.get('memberName') || (location.state as any)?.memberName;

    if (renewMemberId || memberName) {
      const targetMember = members.find(m => 
        (renewMemberId && (m.member_id === renewMemberId || m.id === renewMemberId)) ||
        (memberName && m.full_name?.toLowerCase().trim() === memberName.toLowerCase().trim())
      );

      if (targetMember) {
        hasTriggeredRenewRef.current = true;
        setSearchQuery(targetMember.full_name || targetMember.member_id);

        const now = Date.now();
        const memberActiveSubs = subscriptions.filter(s => {
          if (s.member_id !== targetMember.member_id || s.status === 'Voided') return false;
          if (!s.end_date) return false;
          const endMs = new Date(s.end_date).getTime();
          return endMs >= now;
        });

        if (memberActiveSubs.length > 1) {
          toast.warning(`Cannot auto-renew: ${targetMember.full_name} has ${memberActiveSubs.length} active subscriptions. Please manage contracts individually.`);
          navigate('/members/list', { replace: true, state: {} });
        } else {
          setWizardPrefillMember(targetMember);
          setIsWizardOpen(true);
          toast.info(`Opening renewal wizard for ${targetMember.full_name}`);
          navigate('/members/list', { replace: true, state: {} });
        }
      }
    }
  }, [loading, members, subscriptions, location.search, location.state, navigate]);

  /**
   * Resolves currently active subscription for a member where start_date <= now <= end_date
   */
  const getActiveSubscription = useCallback((memberId: string): Subscription | undefined => {
    const now = Date.now();
    return subscriptions.find((s: Subscription) => {
      if (s.member_id !== memberId || s.status === 'Voided') return false;
      const startMs = new Date(s.start_date).getTime();
      const endMs = new Date(s.end_date).getTime();
      return startMs <= now && endMs >= now;
    });
  }, [subscriptions]);

  /**
   * Finds any queued/scheduled renewal subscription for a member that starts in the future
   */
  const getQueuedSubscription = useCallback((memberId: string): Subscription | undefined => {
    const now = Date.now();
    return subscriptions.find((s: Subscription) => {
      if (s.member_id !== memberId || s.status === 'Voided') return false;
      const startMs = new Date(s.start_date).getTime();
      return startMs > now;
    });
  }, [subscriptions]);

  /**
   * Gets the most recent subscription record for details display
   */
  const getLatestSubscriptionRecord = useCallback((memberId: string): Subscription | undefined => {
    const memberSubs = subscriptions
      .filter((s: Subscription) => s.member_id === memberId && s.status !== 'Voided')
      .sort((a, b) => new Date(b.created_at || b.start_date).getTime() - new Date(a.created_at || a.start_date).getTime());
    
    return memberSubs[0];
  }, [subscriptions]);

  const getActiveCard = useCallback((memberId: string): MemberCard | undefined => {
    return cards.find((c: MemberCard) => c.member_id === memberId && c.status === 'Active');
  }, [cards]);

  // Subscription Details Formatter
  const getSubscriptionDetails = useCallback((memberId: string) => {
    const activeSub = getActiveSubscription(memberId);
    const queuedSub = getQueuedSubscription(memberId);
    const latestSub = getLatestSubscriptionRecord(memberId);

    if (!activeSub && !latestSub) {
      return {
        hasSub: false,
        canRenew: true,
        planName: 'Profile Only',
        statusLabel: 'No Subscription',
        badgeStyle: 'bg-slate-500/10 text-slate-600 dark:text-slate-300 border-slate-500/30',
        dotColor: 'bg-slate-400',
        subscribedAt: null,
        queuedPlan: null
      };
    }

    const targetSub = activeSub || latestSub!;
    const endMs = new Date(targetSub.end_date).getTime();
    const now = Date.now();
    const isPast = !isNaN(endMs) && endMs < now;

    // 1. EXPIRED CONTRACT STATE
    if (isPast) {
      return {
        hasSub: false,
        canRenew: true,
        planName: targetSub.plan_name || (targetSub.plan_type === 'yearly' ? 'Yearly Membership' : 'Monthly Membership'),
        statusLabel: 'Expired',
        badgeStyle: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/40 font-extrabold',
        dotColor: 'bg-rose-500',
        subscribedAt: targetSub.start_date ? new Date(targetSub.start_date).toLocaleDateString() : null,
        queuedPlan: null
      };
    }

    // 2. TRULY ACTIVE CONTRACT STATE
    const diffDays = Math.ceil((endMs - now) / (1000 * 60 * 60 * 24));
    
    let badgeStyle = 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border-emerald-500/40 font-bold';
    let statusLabel = `${diffDays} Days remaining`;
    let dotColor = 'bg-emerald-500';

    if (diffDays <= 3) {
      badgeStyle = 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/40 font-extrabold';
      statusLabel = `${diffDays} Days Left (Renew)`;
      dotColor = 'bg-amber-500';
    } else if (diffDays <= 7) {
      badgeStyle = 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/40 font-bold';
      statusLabel = `${diffDays} Days Left`;
      dotColor = 'bg-amber-500';
    }

    const subDate = new Date(targetSub.created_at || targetSub.start_date);
    const dateFormatted = !isNaN(subDate.getTime())
      ? `${subDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
      : null;

    return {
      hasSub: true,
      canRenew: diffDays <= 30 && !queuedSub,
      planName: targetSub.plan_name || (targetSub.plan_type === 'yearly' ? 'Yearly Membership' : 'Monthly Membership'),
      statusLabel,
      badgeStyle,
      dotColor,
      subscribedAt: dateFormatted,
      queuedPlan: queuedSub ? (queuedSub.plan_name || (queuedSub.plan_type === 'yearly' ? 'Yearly Membership' : 'Monthly Membership')) : null
    };
  }, [getActiveSubscription, getQueuedSubscription, getLatestSubscriptionRecord]);

  // Metric Summary Calculations
  const stats = useMemo(() => {
    const now = Date.now();
    let activeSubsCount = 0;
    let expiringSoonCount = 0;

    subscriptions.forEach((s: Subscription) => {
      if (s.status !== 'Voided') {
        const startMs = new Date(s.start_date).getTime();
        const endMs = new Date(s.end_date).getTime();
        if (startMs <= now && endMs >= now) {
          activeSubsCount++;
          const diffDays = Math.ceil((endMs - now) / (1000 * 60 * 60 * 24));
          if (diffDays >= 0 && diffDays <= 7) {
            expiringSoonCount++;
          }
        }
      }
    });

    return {
      total: members.length,
      activeSubscriptions: activeSubsCount,
      expiringSoon: expiringSoonCount,
      suspendedMembers: members.filter(m => m.status === 'Suspended').length,
    };
  }, [members, subscriptions]);

  // Broadcast Members Telemetry to Topbar
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('members-kpi-update', {
        detail: stats
      })
    );
  }, [stats]);

  // Chip Filter Counts
  const chipCounts = useMemo(() => {
    const now = Date.now();

    return {
      all: members.length,
      suspended: members.filter(m => m.status === 'Suspended').length,
      with_sub: members.filter(m => !!getActiveSubscription(m.member_id)).length,
      expiring: members.filter(m => {
        const sub = getActiveSubscription(m.member_id);
        if (!sub) return false;
        const diffDays = Math.ceil((new Date(sub.end_date).getTime() - now) / (1000 * 60 * 60 * 24));
        return diffDays >= 0 && diffDays <= 7;
      }).length,
      expired: members.filter(m => {
        const activeSub = getActiveSubscription(m.member_id);
        if (activeSub) return false;
        const latestSub = getLatestSubscriptionRecord(m.member_id);
        if (!latestSub) return false;
        return new Date(latestSub.end_date).getTime() < now;
      }).length,
      has_card: members.filter(m => {
        const card = getActiveCard(m.member_id);
        return card && card.card_type !== 'None';
      }).length,
      no_card: members.filter(m => {
        const card = getActiveCard(m.member_id);
        return !card || card.card_type === 'None';
      }).length,
    };
  }, [members, getActiveSubscription, getLatestSubscriptionRecord, getActiveCard]);

  // Filtered Members
  const filteredMembers = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const now = Date.now();

    return members.filter((m: Member) => {
      const fullName = (m.full_name || '').toLowerCase();
      const memberId = (m.member_id || '').toLowerCase();
      const phone = (m.phone || '').toLowerCase();
      const email = (m.email || '').toLowerCase();

      const matchesSearch = q === '' ||
        fullName.includes(q) ||
        memberId.includes(q) ||
        phone.includes(q) ||
        email.includes(q);

      if (!matchesSearch) return false;

      switch (activeChip) {
        case 'suspended':
          return m.status === 'Suspended';
        case 'with_sub':
          return !!getActiveSubscription(m.member_id);
        case 'expiring': {
          const sub = getActiveSubscription(m.member_id);
          if (!sub) return false;
          const diffDays = Math.ceil((new Date(sub.end_date).getTime() - now) / (1000 * 60 * 60 * 24));
          return diffDays >= 0 && diffDays <= 7;
        }
        case 'expired': {
          const activeSub = getActiveSubscription(m.member_id);
          if (activeSub) return false;
          const latestSub = getLatestSubscriptionRecord(m.member_id);
          if (!latestSub) return false;
          return new Date(latestSub.end_date).getTime() < now;
        }
        case 'has_card': {
          const card = getActiveCard(m.member_id);
          return card && card.card_type !== 'None';
        }
        case 'no_card': {
          const card = getActiveCard(m.member_id);
          return !card || card.card_type === 'None';
        }
        case 'all':
        default:
          return true;
      }
    });
  }, [members, searchQuery, activeChip, getActiveSubscription, getLatestSubscriptionRecord, getActiveCard]);

  const isAllSelected = filteredMembers.length > 0 && filteredMembers.every(m => selectedMemberIds.includes(m.id));
  const isSomeSelected = selectedMemberIds.length > 0 && !isAllSelected;

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedMemberIds([]);
    } else {
      setSelectedMemberIds(filteredMembers.map(m => m.id));
    }
  };

  // Mobile Paginated Slice
  const totalMobilePages = Math.ceil(filteredMembers.length / itemsPerPage) || 1;
  const paginatedMobileMembers = useMemo(() => {
    const start = (mobilePage - 1) * itemsPerPage;
    return filteredMembers.slice(start, start + itemsPerPage);
  }, [filteredMembers, mobilePage, itemsPerPage]);

  const handleToggleSuspend = async (memberItem: Member) => {
    const nextStatus = memberItem.status === 'Active' ? 'Suspended' : 'Active';
    try {
      await memberService.update(memberItem.id, { status: nextStatus }, 'Admin Staff');
      toast.success(`Member set to ${nextStatus}.`);
      fetchMembers();
    } catch (err: any) {
      toast.error(err.message || 'Action failed.');
    }
  };

  const isSelectionActive = selectedMemberIds.length > 0;

  const handleRowClick = (member: Member) => {
    setSelectedMemberIds(prev =>
      prev.includes(member.id)
        ? prev.filter(id => id !== member.id)
        : [...prev, member.id]
    );
  };

  const getRowStyle = (member: Member) => {
    const isSelected = selectedMemberIds.includes(member.id);
    const isSuspended = member.status === 'Suspended';

    if (isSelected) {
      return 'group !bg-blue-500/10 hover:!bg-blue-500/15 border-l-2 border-blue-500 transition-colors duration-150 cursor-pointer';
    }
    if (isSuspended) {
      return 'group bg-amber-500/10 dark:bg-amber-500/15 hover:!bg-amber-500/20 border-l-2 border-amber-500 text-amber-950 dark:text-amber-200 transition-colors duration-150 cursor-pointer';
    }
    return 'group hover:!bg-blue-500/5 dark:hover:!bg-blue-500/10 transition-colors duration-150 cursor-pointer';
  };

  // COMPACT & ULTRA-LEGIBLE TABLE COLUMNS (OPTIMIZED ROW HEIGHT)
  const columns: Column<Member>[] = [
    {
      key: 'select',
      header: (
        <div className="flex items-center justify-center h-full w-full py-0.5">
          <input
            type="checkbox"
            ref={(el) => {
              if (el) el.indeterminate = isSomeSelected;
            }}
            checked={isAllSelected}
            onChange={handleToggleSelectAll}
            className="w-4 h-4 rounded border-slate-300 dark:border-white/10 text-blue-600 focus:ring-blue-500 cursor-pointer accent-[#123c73] transition-transform duration-150 hover:scale-105"
            title="Toggle Select All"
          />
        </div>
      ),
      headerClassName: 'w-10 text-center',
      cellClassName: 'text-center p-0',
      render: (item) => (
        <label 
          className="flex items-center justify-center w-full h-10 py-1 cursor-pointer transition-colors hover:bg-slate-500/5 select-none" 
          onClick={(e) => e.stopPropagation()}
        >
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
            className="w-4 h-4 rounded border-slate-300 dark:border-white/10 text-blue-600 cursor-pointer accent-[#123c73] transition-transform duration-150 hover:scale-110"
          />
        </label>
      )
    },
    {
      key: 'full_name',
      header: 'Member / ID',
      sortable: true,
      render: (item) => (
        <div className="flex items-center gap-2.5 py-0.5 text-left">
          <MemberAvatar
            src={item.image_url || item.avatar_url}
            name={item.full_name}
            size={38}
            roundedClassName="rounded-xl"
            className="shadow-xs border border-black/10 dark:border-white/10 shrink-0"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-extrabold text-xs sm:text-sm text-slate-900 dark:text-zinc-100 truncate leading-tight">
                {item.full_name}
              </span>
              {item.status === 'Suspended' && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-md text-[9px] font-mono font-black uppercase tracking-wider bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/40">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                  SUSPENDED
                </span>
              )}
            </div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono font-medium block mt-0.5 leading-none truncate">
              {item.member_id} • {item.phone}
            </span>
          </div>
        </div>
      )
    },
    {
      key: 'subscription',
      header: 'Subscription Plan',
      sortable: true,
      sortValue: (item) => {
        const sub = getActiveSubscription(item.member_id);
        return sub ? sub.plan_name : 'AAA_NO_SUB';
      },
      render: (item) => {
        const subInfo = getSubscriptionDetails(item.member_id);

        return (
          <div className="text-left leading-tight space-y-0.5 py-0.5">
            <span className="font-extrabold text-xs block text-slate-900 dark:text-zinc-100 truncate">
              {subInfo.planName}
            </span>

            <div className="flex flex-wrap items-center gap-1">
              <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono font-extrabold uppercase border ${subInfo.badgeStyle}`}>
                {subInfo.statusLabel}
              </span>
              {subInfo.queuedPlan && (
                <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase border bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30" title="Queued renewal after current plan expires">
                  Queued: {subInfo.queuedPlan}
                </span>
              )}
            </div>
          </div>
        );
      }
    },
    {
      key: 'card_printed',
      header: 'Card Status',
      sortable: true,
      sortValue: (item) => {
        const cardObj = getActiveCard(item.member_id);
        if (!cardObj || cardObj.card_type === 'None') return 'AAA_NO_CARD';
        return cardObj.card_type;
      },
      render: (item) => {
        const cardObj = getActiveCard(item.member_id);
        if (!cardObj || cardObj.card_type === 'None') {
          return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-extrabold bg-slate-500/10 text-slate-500 dark:text-slate-400 border border-slate-500/25">
              No Card Issued
            </span>
          );
        }
        const isQr = cardObj.card_type === 'QR';
        return (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (isQr) {
                setQrModalMember(item);
              } else {
                setManualModalMember(item);
              }
            }}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-extrabold border cursor-pointer hover:opacity-80 transition-opacity ${
              isQr 
                ? 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/40' 
                : 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/40'
            }`}
            title="Click to view & print card"
          >
            {isQr ? <QrCode className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" /> : <CreditCard className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />}
            <span>{isQr ? 'Digital QR Card' : 'Manual Card'}</span>
          </button>
        );
      }
    },
    {
      key: 'actions',
      header: 'Actions',
      cellClassName: 'text-right min-w-[200px]',
      render: (item) => {
        const subInfo = getSubscriptionDetails(item.member_id);

        return (
          <div 
            className="opacity-90 group-hover/row:opacity-100 transition-opacity duration-150 flex items-center justify-end gap-1.5 select-none relative"
            onClick={(e) => e.stopPropagation()}
          >
            {subInfo.canRenew && (
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setWizardPrefillMember(item);
                  setIsWizardOpen(true);
                }}
                className="px-2.5 py-1 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-600 hover:text-white rounded-lg cursor-pointer border border-emerald-500/30 inline-flex items-center gap-1 text-[10px] font-heading tracking-wider uppercase font-extrabold transition-colors shadow-xs"
                title="Enroll or renew member subscription contract"
              >
                <CreditCard className="w-3 h-3" /> {subInfo.hasSub ? 'Renew' : 'Subscribe'}
              </button>
            )}
            
            <button 
              onClick={(e) => {
                e.stopPropagation();
                setSelectedProfileMember(item);
              }}
              className="px-2.5 py-1 bg-blue-500/10 text-blue-700 dark:text-blue-300 hover:bg-blue-600 hover:text-white rounded-lg cursor-pointer border border-blue-500/30 inline-flex items-center gap-1 text-[10px] font-heading tracking-wider uppercase font-extrabold transition-colors shadow-xs"
              title="See profile details"
            >
              <Eye className="w-3 h-3" /> Profile
            </button>

            {/* FULL DESKTOP 3-DOT DROPDOWN MENU */}
            <div className="relative">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenActionMenuId(openActionMenuId === item.id ? null : item.id);
                }}
                className="p-1.5 rounded-lg border border-(--border-color) bg-(--bg-page) text-slate-400 hover:text-(--color-text) cursor-pointer transition-colors shadow-xs"
                title="More Options"
              >
                <MoreVertical className="w-3.5 h-3.5" />
              </button>

              {openActionMenuId === item.id && (
                <div 
                  onClick={(e) => e.stopPropagation()}
                  className="absolute right-0 top-full mt-1.5 w-48 bg-(--bg-card) border border-(--border-color) rounded-2xl shadow-xl z-30 p-1.5 space-y-1 font-body text-xs text-left animate-fade-in"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setOpenActionMenuId(null);
                      setSelectedProfileMember(item);
                    }}
                    className="w-full px-3.5 py-2 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-xl flex items-center gap-2.5 text-xs font-bold text-(--color-text) cursor-pointer"
                  >
                    <Eye className="w-4 h-4 text-blue-500" />
                    <span>View Workspace</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setOpenActionMenuId(null);
                      setQrModalMember(item);
                    }}
                    className="w-full px-3.5 py-2 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-xl flex items-center gap-2.5 text-xs font-bold text-(--color-text) cursor-pointer"
                  >
                    <QrCode className="w-4 h-4 text-blue-500" />
                    <span>Digital QR Card</span>
                  </button>

                  <div className="border-t border-(--border-color) my-1" />

                  <button
                    type="button"
                    onClick={() => {
                      setOpenActionMenuId(null);
                      handleToggleSuspend(item);
                    }}
                    className="w-full px-3.5 py-2 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-xl flex items-center gap-2.5 text-xs font-bold text-amber-600 dark:text-amber-400 cursor-pointer"
                  >
                    {item.status === 'Active' ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                    <span>{item.status === 'Active' ? 'Suspend Member' : 'Activate Member'}</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      }
    }
  ];

  // Header Actions Sync
  useEffect(() => {
    if (hideHeaderActions || isPlansPath) {
      return;
    }

    setActions(
      <div className="flex flex-wrap items-center gap-1.5 lg:gap-3 w-full sm:w-auto justify-end animate-fade-in select-none">
        {activeTab === 'Directory' && (
          <>
            <Button
              onClick={handleOpenPrintModal}
              variant="secondary"
              className="py-1.5 px-2.5 lg:py-2 lg:px-3.5 !w-auto text-[11px] lg:text-xs flex items-center gap-1 lg:gap-1.5 cursor-pointer font-bold animate-fade-in whitespace-nowrap"
              title="Open full member credential card print workspace"
            >
              <Printer className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-red-500 shrink-0" />
              <span>PRINT MEMBER CARDS</span>
            </Button>

            <Button
              onClick={() => setIsRecycleOpen(true)}
              variant="secondary"
              className="py-1.5 px-2.5 lg:py-2 lg:px-3.5 !w-auto text-[11px] lg:text-xs flex items-center gap-1 lg:gap-1.5 cursor-pointer font-bold animate-fade-in whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-amber-500 shrink-0" />
              <span>RECYCLE BIN</span>
            </Button>

            <Button
              onClick={() => { 
                setWizardPrefillMember(undefined); 
                setWizardPrefill(undefined); 
                setIsWizardOpen(true); 
              }}
              variant="primary"
              className="py-1.5 px-2.5 lg:py-2 lg:px-3.5 !w-auto text-[11px] lg:text-xs flex items-center gap-1 lg:gap-1.5 shadow-md cursor-pointer animate-fade-in whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5 lg:w-4 lg:h-4 shrink-0" />
              <span>ENROLL MEMBER</span>
            </Button>
          </>
        )}
      </div>
    );

    return () => {
      if (!hideHeaderActions && !isPlansPath) {
        setActions(null);
      }
    };
  }, [activeTab, setActions, hideHeaderActions, isPlansPath, members, handleOpenPrintModal]);

  useEffect(() => {
    const handleClickOutside = () => setOpenActionMenuId(null);
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  // Auto-open expiring member from notification redirection
  useEffect(() => {
    if (location.state?.openMemberId && members.length > 0) {
      const targetMember = members.find(
        (m) => m.member_id === location.state.openMemberId || m.id === location.state.openMemberId
      );
      if (targetMember) {
        setActiveChip('expiring');
        setSelectedProfileMember(targetMember);
        setSearchQuery(targetMember.full_name);
        toast.info(`Viewing expiring member: "${targetMember.full_name}"`, { toastId: `expiring-${targetMember.id}` });
        window.history.replaceState({}, document.title);
      }
    }
  }, [location.state, members]);

  return (
    <div className="relative min-h-[85vh] w-full animate-fade-in text-xs md:text-sm text-(--color-text)">
      
      {isPlansPath ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2 border-b border-(--border-color) pb-4 select-none">
            <Settings className="w-5 h-5 text-(--color-primary-light)" />
            <h2 className="font-heading text-base tracking-wider uppercase text-slate-800 dark:text-white">Active Counter Plan Catalog</h2>
          </div>
          <StaffPlansConsole />
        </div>
      ) : (
        <>
          {/* TOP SWITCH TABS */}
          <div className="flex border-b border-(--border-color) bg-(--bg-card) p-1 rounded-t-3xl select-none">
            {[
              { id: 'Directory', icon: Users, label: 'Members Directory' },
              { id: 'Queue', icon: CreditCard, label: 'Online Registration Queue' }
            ].map(item => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id as any)}
                  className={`flex-1 py-3 px-4 font-heading text-xs md:text-sm tracking-wider uppercase font-extrabold cursor-pointer flex items-center justify-center gap-2 transition-all ${
                    activeTab === item.id 
                      ? 'border-b-2 border-[#123c73] dark:border-[#bf0202] text-slate-900 dark:text-white' 
                      : 'border-b-2 border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
                  }`}
                >
                  <Icon className="w-4 h-4 md:w-4.5 md:h-4.5" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-3 md:mt-4 space-y-3 md:space-y-4">
            {activeTab === 'Directory' && (
              <div className="space-y-3 md:space-y-4 pb-40 md:pb-24">

                {/* SEARCH & STREAMLINED CHIP FILTERS TOOLBAR */}
                <div className="space-y-2.5 bg-(--bg-card) p-3 md:p-3.5 rounded-2xl border border-(--border-color) shadow-xs">
                  
                  <div className="relative w-full">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      ref={searchInputRef}
                      type="text"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Search profiles by Name, ID, Phone, or Email..."
                      className="w-full pl-10 pr-10 py-2 border border-(--border-color) bg-(--bg-page) rounded-xl outline-none font-bold text-xs md:text-sm text-(--color-text) focus:border-blue-500 transition-all"
                    />

                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-md text-slate-400 hover:text-(--color-text) cursor-pointer"
                        title="Clear search query"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 overflow-x-auto whitespace-nowrap scrollbar-none pb-0.5 select-none">
                    <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider flex items-center gap-1 shrink-0 pr-1">
                      <Filter className="w-3 h-3" /> Filters:
                    </span>

                    {[
                      { id: 'all', label: 'All', count: chipCounts.all },
                      { id: 'with_sub', label: 'Subscription', count: chipCounts.with_sub },
                      { id: 'expiring', label: 'Expiring', count: chipCounts.expiring },
                      { id: 'expired', label: 'Expired', count: chipCounts.expired },
                      { id: 'has_card', label: 'Has Card', count: chipCounts.has_card },
                      { id: 'no_card', label: 'No Card', count: chipCounts.no_card },
                      { id: 'suspended', label: 'Suspended', count: chipCounts.suspended },
                    ].map(chip => (
                      <button
                        key={chip.id}
                        type="button"
                        onClick={() => setActiveChip(chip.id as FilterChip)}
                        className={`px-3 py-1.5 rounded-xl text-[11px] font-heading font-extrabold uppercase tracking-wider cursor-pointer border transition-all flex items-center gap-1.5 shrink-0 ${
                          activeChip === chip.id
                            ? 'bg-[#123c73] dark:bg-[#bf0202] text-white border-transparent shadow-xs'
                            : 'bg-(--bg-page) border-(--border-color) text-slate-500 hover:text-(--color-text)'
                        }`}
                      >
                        <span>{chip.label}</span>
                        <span className={`px-1.5 py-0.2 rounded-full font-mono text-[10px] font-bold ${
                          activeChip === chip.id
                            ? 'bg-white/20 text-white'
                            : 'bg-slate-200 dark:bg-zinc-800 text-slate-500 dark:text-slate-400'
                        }`}>
                          {chip.count}
                        </span>
                      </button>
                    ))}
                  </div>

                </div>

                {/* DESKTOP TABLE VIEW (HIGH DENSITY COMPACT ROWS) */}
                <div className="hidden md:block p-1 bg-(--bg-card) border border-(--border-color) rounded-2xl overflow-hidden shadow-xs">
                  {loading ? (
                    <div className="p-4 space-y-2">
                      <div className="flex items-center justify-between pb-2 border-b border-(--border-color) px-3">
                        <Skeleton height={14} width={120} />
                        <Skeleton height={14} width={140} />
                        <Skeleton height={14} width={110} />
                        <Skeleton height={28} width={70} />
                      </div>
                      {Array.from({ length: 8 }).map((_, idx) => (
                        <div key={idx} className="flex items-center justify-between py-2 px-3 border-b border-(--border-color)/40 last:border-none">
                          <div className="flex items-center gap-2.5 w-1/3">
                            <Skeleton circle width={38} height={38} className="shrink-0" />
                            <div className="space-y-1 flex-1">
                              <Skeleton height={14} width="70%" />
                              <Skeleton height={10} width="50%" />
                            </div>
                          </div>
                          <div className="w-1/3 space-y-1">
                            <Skeleton height={14} width="65%" />
                            <Skeleton height={16} width={90} borderRadius={6} />
                          </div>
                          <div className="w-1/5">
                            <Skeleton height={24} width={105} borderRadius={8} />
                          </div>
                          <div className="flex items-center justify-end gap-1.5">
                            <Skeleton height={28} width={65} borderRadius={8} />
                            <Skeleton height={28} width={60} borderRadius={8} />
                            <Skeleton height={28} width={28} borderRadius={8} />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : filteredMembers.length === 0 ? (
                    <div className="p-10 text-center space-y-2.5">
                      <div className="w-10 h-10 rounded-2xl bg-slate-100 dark:bg-zinc-800 text-slate-400 mx-auto flex items-center justify-center">
                        <Search className="w-5 h-5" />
                      </div>
                      <h4 className="font-heading font-bold text-sm text-(--color-text)">No members match query</h4>
                      <p className="text-xs text-slate-400 max-w-sm mx-auto">
                        {searchQuery || activeChip !== 'all'
                          ? 'Try modifying your search keywords or reset chip filters.'
                          : 'No member records enrolled in system databases yet.'}
                      </p>
                      {(searchQuery || activeChip !== 'all') && (
                        <button
                          type="button"
                          onClick={() => {
                            setSearchQuery('');
                            setActiveChip('all');
                          }}
                          className="px-3.5 py-1.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-xl font-heading text-[10px] font-bold uppercase tracking-wider cursor-pointer border border-blue-500/20"
                        >
                          Clear Filters
                        </button>
                      )}
                    </div>
                  ) : (
                    <Table<Member>
                      data={filteredMembers}
                      columns={columns}
                      itemsPerPage={itemsPerPage}
                      loading={false}
                      getRowClassName={getRowStyle}
                      onRowClick={handleRowClick}
                    />
                  )}

                  {/* QUICK ACTION: ENROLL NEW MEMBER BUTTON (DESKTOP & TABLET) */}
                  <motion.button
                    whileHover={{ scale: 1.006 }}
                    whileTap={{ scale: 0.985 }}
                    type="button"
                    onClick={() => {
                      setWizardPrefillMember(undefined);
                      setWizardPrefill(undefined);
                      setIsWizardOpen(true);
                    }}
                    className="hidden sm:flex w-full py-3 px-4 rounded-2xl bg-[#123c73] hover:bg-[#0e2f5a] dark:bg-[#bf0202] dark:hover:bg-[#a10202] text-white font-heading font-black text-xs sm:text-sm tracking-wider uppercase items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all duration-200 cursor-pointer border border-white/10 group mt-3 select-none"
                  >
                    <div className="w-5 h-5 rounded-lg bg-white/15 flex items-center justify-center group-hover:rotate-90 transition-transform duration-300 shrink-0">
                      <Plus className="w-3.5 h-3.5 text-white" />
                    </div>
                    <span>ENROLL NEW MEMBER</span>
                  </motion.button>
                </div>

                {/* MOBILE CARD LIST VIEW (< MD) */}
                <div className="block md:hidden space-y-2.5">
                  {loading ? (
                    <div className="space-y-2.5">
                      {Array.from({ length: 4 }).map((_, idx) => (
                        <div key={idx} className="p-3.5 rounded-2xl border border-(--border-color) bg-(--bg-card) space-y-2.5">
                          <div className="flex items-center justify-between gap-2.5">
                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                              <Skeleton circle width={38} height={38} className="shrink-0" />
                              <div className="flex-1 space-y-1">
                                <Skeleton height={14} width="65%" />
                                <Skeleton height={10} width="40%" />
                              </div>
                            </div>
                            <Skeleton height={20} width={60} borderRadius={16} />
                          </div>
                          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-(--border-color)">
                            <Skeleton height={20} width="80%" />
                            <Skeleton height={20} width="60%" />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : filteredMembers.length === 0 ? (
                    <div className="p-8 text-center space-y-2.5 bg-(--bg-card) border border-(--border-color) rounded-2xl">
                      <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-zinc-800 text-slate-400 mx-auto flex items-center justify-center">
                        <Search className="w-5 h-5" />
                      </div>
                      <h4 className="font-heading font-bold text-xs text-(--color-text)">No members match query</h4>
                      <p className="text-xs text-slate-400 max-w-xs mx-auto">
                        Modify search or filter chips to find profiles.
                      </p>
                      {(searchQuery || activeChip !== 'all') && (
                        <button
                          type="button"
                          onClick={() => {
                            setSearchQuery('');
                            setActiveChip('all');
                          }}
                          className="px-3 py-1.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-xl font-heading text-[10px] font-bold uppercase tracking-wider border border-blue-500/20"
                        >
                          Clear Filters
                        </button>
                      )}
                    </div>
                  ) : (
                    <>
                      {/* Select All Row on Mobile */}
                      {isSelectionActive && (
                        <div className="flex items-center justify-between px-3 py-1.5 bg-slate-500/10 border border-(--border-color) rounded-xl select-none min-h-[44px]">
                          <label 
                            className="flex items-center gap-2.5 cursor-pointer py-1.5 px-2 -ml-1 rounded-lg hover:bg-slate-500/10 active:scale-[0.98] transition-all flex-1"
                            onClick={handleToggleSelectAll}
                          >
                            <input
                              type="checkbox"
                              ref={(el) => {
                                if (el) el.indeterminate = isSomeSelected;
                              }}
                              checked={isAllSelected}
                              onChange={() => {}} 
                              className="w-4 h-4 rounded border-slate-300 dark:border-white/20 text-blue-600 accent-[#123c73] cursor-pointer shrink-0"
                            />
                            <span className="text-xs font-bold text-(--color-text)">
                              Selected Members <span className="font-mono text-slate-400 font-normal">({selectedMemberIds.length}/{filteredMembers.length})</span>
                            </span>
                          </label>

                          <button
                            type="button"
                            onClick={() => setSelectedMemberIds([])}
                            className="text-[11px] font-bold text-rose-500 uppercase tracking-wider px-2.5 py-1.5 hover:bg-rose-500/10 rounded-lg active:scale-95 transition-all shrink-0"
                          >
                            Deselect All
                          </button>
                        </div>
                      )}

                      {/* Mobile Cards Map */}
                      {paginatedMobileMembers.map((member) => {
                        const subInfo = getSubscriptionDetails(member.member_id);
                        const cardObj = getActiveCard(member.member_id);
                        const isSelected = selectedMemberIds.includes(member.id);
                        const isSuspended = member.status === 'Suspended';
                        const isQr = cardObj && cardObj.card_type === 'QR';

                        return (
                          <div
                            key={member.id}
                            onClick={() => handleRowClick(member)}
                            className={`p-3.5 rounded-2xl border transition-all select-none space-y-2.5 relative ${
                              isSelected
                                ? 'bg-blue-500/10 dark:bg-blue-500/15 border-blue-500 shadow-md'
                                : isSuspended
                                ? 'bg-amber-500/10 dark:bg-amber-500/15 border-amber-500/40 text-amber-950 dark:text-amber-200'
                                : 'bg-(--bg-card) border-(--border-color) shadow-xs active:scale-[0.99]'
                            }`}
                          >
                            {/* Card Header: Checkbox + Avatar + Details + Status */}
                            <div className="flex items-start justify-between gap-2.5">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={(e) => {
                                    e.stopPropagation();
                                    handleRowClick(member);
                                  }}
                                  className="w-4 h-4 rounded border-slate-300 dark:border-white/10 text-blue-600 accent-[#123c73] shrink-0 cursor-pointer"
                                />

                                <MemberAvatar
                                  src={member.image_url || member.avatar_url}
                                  name={member.full_name}
                                  size={40}
                                  roundedClassName="rounded-xl"
                                  className="shadow-xs shrink-0"
                                />

                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <h3 className="font-heading font-extrabold text-sm text-(--color-text) truncate leading-tight">
                                      {member.full_name}
                                    </h3>
                                    {isSuspended && (
                                      <span className="px-1.5 py-0.2 rounded text-[8px] font-mono font-black uppercase tracking-wider bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/40 shrink-0">
                                        SUSPENDED
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-xs font-mono text-slate-400 block mt-0.5 truncate font-medium">
                                    {member.member_id}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Plan & Security Details Grid */}
                            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-(--border-color)">
                              <div className="space-y-0.5">
                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">PLAN</span>
                                <span className="font-extrabold text-xs text-(--color-text) block truncate">{subInfo.planName}</span>
                                <div className="flex flex-wrap items-center gap-1 pt-0.5">
                                  <span className={`inline-block px-1.5 py-0.5 rounded text-[8px] font-mono font-extrabold uppercase border ${subInfo.badgeStyle}`}>
                                    {subInfo.statusLabel}
                                  </span>
                                  {subInfo.queuedPlan && (
                                    <span className="inline-block px-1.5 py-0.5 rounded text-[8px] font-mono font-bold uppercase border bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20">
                                      Queued: {subInfo.queuedPlan}
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="space-y-0.5 text-right">
                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">BADGE STATUS</span>
                                <div>
                                  {!cardObj || cardObj.card_type === 'None' ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[8px] font-semibold bg-slate-500/10 text-slate-500 border border-slate-500/20">
                                      No Card Issued
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (isQr) {
                                          setQrModalMember(member);
                                        } else {
                                          setManualModalMember(member);
                                        }
                                      }}
                                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[8px] font-bold border ${
                                        isQr
                                          ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20'
                                          : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                                      }`}
                                    >
                                      {isQr ? <QrCode className="w-3 h-3 text-blue-500" /> : <CreditCard className="w-3 h-3 text-amber-500" />}
                                      <span>{isQr ? 'QR Badge' : 'Manual Badge'}</span>
                                    </button>
                                  )}
                                </div>
                                <span className="text-[10px] text-slate-400 font-mono block mt-0.5">
                                  {member.phone || 'No phone'}
                                </span>
                              </div>
                            </div>

                            {/* Card Action Buttons Bar */}
                            <div className="flex items-center gap-2 pt-2 border-t border-(--border-color)">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedProfileMember(member);
                                }}
                                className="flex-1 min-h-[40px] px-3 py-1.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500 hover:text-white rounded-xl text-xs font-heading font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 border border-blue-500/20 transition-colors"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>Profile</span>
                              </button>

                              {subInfo.canRenew && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setWizardPrefillMember(member);
                                    setIsWizardOpen(true);
                                  }}
                                  className="flex-1 min-h-[40px] px-3 py-1.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500 hover:text-white rounded-xl text-xs font-heading font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 border border-emerald-500/20 transition-colors"
                                >
                                  <CreditCard className="w-3.5 h-3.5" />
                                  <span>{subInfo.hasSub ? 'Renew' : 'Subscribe'}</span>
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setMobileActionSheetMember(member);
                                }}
                                className="min-h-[40px] min-w-[40px] px-2.5 py-1.5 bg-(--bg-page) text-slate-400 border border-(--border-color) rounded-xl flex items-center justify-center hover:text-(--color-text)"
                                title="More Actions"
                              >
                                <MoreVertical className="w-4 h-4" />
                              </button>
                            </div>

                          </div>
                        );
                      })}

                      {/* Mobile Pagination Navigation */}
                      {totalMobilePages > 1 && (
                        <div className="flex items-center justify-between pt-2.5 pb-2 select-none">
                          <span className="text-xs text-slate-400 font-mono">
                            Page {mobilePage} of {totalMobilePages}
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              disabled={mobilePage === 1}
                              onClick={() => setMobilePage(p => Math.max(1, p - 1))}
                              className="px-3 py-1.5 rounded-xl border border-(--border-color) bg-(--bg-card) text-xs font-bold disabled:opacity-40"
                            >
                              Prev
                            </button>
                            <button
                              disabled={mobilePage === totalMobilePages}
                              onClick={() => setMobilePage(p => Math.min(totalMobilePages, p + 1))}
                              className="px-3 py-1.5 rounded-xl border border-(--border-color) bg-(--bg-card) text-xs font-bold disabled:opacity-40"
                            >
                              Next
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>

              </div>
            )}

            {activeTab === 'Queue' && (
              <OnlineQueue 
                onApproveLaunchWizard={(reg) => {
                  setWizardPrefill(reg);
                  setWizardPrefillMember(undefined);
                  setIsWizardOpen(true);
                }} 
              />
            )}
          </div>
        </>
      )}

      {/* 1. DESKTOP / TABLET FLOATING MULTI-SELECT BAR */}
      {isSelectionActive && (
        <div className="hidden md:flex fixed md:bottom-25 lg:bottom-6 left-1/2 -translate-x-1/2 z-[60] bg-(--bg-card) text-(--color-text) px-5 py-2.5 rounded-2xl shadow-2xl border border-(--border-color) items-center gap-4 animate-slide-up select-none">
          <div className="flex items-center gap-2 pr-2 border-r border-(--border-color)">
            <span className="w-6 h-6 rounded-full bg-[#123c73] dark:bg-[#bf0202] text-white font-mono font-bold text-xs flex items-center justify-center">
              {selectedMemberIds.length}
            </span>
            <span className="font-heading text-xs font-bold uppercase tracking-wider text-(--color-text)">
              Selected
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowBatchCardModal(true)}
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 dark:bg-red-600 dark:hover:bg-red-700 text-white rounded-xl text-xs font-heading font-bold uppercase tracking-wider cursor-pointer flex items-center gap-1.5 transition-colors shadow-md border-none"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Member Cards</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedMemberIds([])}
              className="p-2 rounded-xl text-slate-400 hover:text-(--color-text) hover:bg-slate-100 dark:hover:bg-zinc-800 cursor-pointer transition-colors"
              title="Clear selection"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* 2. MOBILE MULTI-SELECT BOTTOM BAR */}
      <AnimatePresence>
        {isSelectionActive && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="md:hidden fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] left-3 right-3 z-[210] bg-(--bg-card) text-(--color-text) p-3 rounded-2xl shadow-2xl border border-(--border-color) flex items-center justify-between gap-3 select-none"
          >
            <div className="flex items-center gap-2.5">
              <span className="w-7 h-7 rounded-xl bg-[#123c73] dark:bg-[#bf0202] text-white font-mono font-bold text-xs flex items-center justify-center shadow-xs">
                {selectedMemberIds.length}
              </span>
              <div>
                <span className="font-heading text-xs font-bold uppercase tracking-wider block text-(--color-text) leading-none">
                  Selected
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedMemberIds([])}
                  className="text-[10px] text-slate-400 hover:text-rose-500 font-bold underline cursor-pointer mt-0.5"
                >
                  Clear Selection
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowBatchCardModal(true)}
              className="px-4 py-2 bg-blue-600 dark:bg-red-600 text-white rounded-xl text-xs font-heading font-bold uppercase tracking-wider cursor-pointer flex items-center gap-2 shadow-md active:scale-95 transition-transform"
            >
              <Printer className="w-4 h-4" />
              <span>Print Cards</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 3. MOBILE DIRECT ACTION BOTTOM BAR */}
      {activeTab === 'Directory' && !isSelectionActive && createPortal(
        <div className="md:hidden fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] left-3 right-3 h-14 bg-(--bg-card)/95 backdrop-blur-xl border border-(--border-color) rounded-2xl flex items-center justify-between px-3.5 z-[190] shadow-2xl">
          <div className="flex items-center gap-2 text-xs font-heading font-bold text-(--color-text) select-none min-w-0 pr-2">
            <div className="flex items-center gap-1 text-[#123c73] dark:text-[#bf0202] shrink-0">
              <Users className="w-3.5 h-3.5" />
              <span className="text-[11px]">{stats.total} Members</span>
            </div>
            <span className="text-slate-300 dark:text-zinc-700">•</span>
            <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 truncate">
              <UserCheck className="w-3.5 h-3.5 shrink-0" />
              <span className="text-[11px] truncate">{stats.activeSubscriptions} Active</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setIsRecycleOpen(true)}
              className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 border border-amber-500/20 flex items-center justify-center cursor-pointer transition-colors active:scale-95"
              title="Recycle Bin"
            >
              <Trash2 className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={handleOpenPrintModal}
              className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 border border-blue-500/20 flex items-center justify-center cursor-pointer transition-colors active:scale-95"
              title="Print Cards"
            >
              <Printer className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => {
                setWizardPrefillMember(undefined);
                setWizardPrefill(undefined);
                setIsWizardOpen(true);
              }}
              className="h-9 px-3 rounded-xl bg-[#123c73] dark:bg-[#bf0202] text-white flex items-center justify-center gap-1 text-xs font-heading font-bold uppercase tracking-wider shadow-md border border-white/10 cursor-pointer active:scale-95 transition-transform"
              title="Enroll Member"
            >
              <Plus className="w-4 h-4" />
              <span className="text-[10px] hidden xs:inline">Enroll</span>
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* 4. MOBILE SLIDE-UP ACTION SHEET */}
      <AnimatePresence>
        {mobileActionSheetMember && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileActionSheetMember(null)}
              className="md:hidden fixed inset-0 bg-black/60 backdrop-blur-xs z-50"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-(--bg-card) border-t border-(--border-color) rounded-t-3xl p-5 shadow-2xl space-y-4 pb-20"
            >
              <div className="w-12 h-1.5 rounded-full bg-slate-300 dark:bg-zinc-700 mx-auto" />

              <div className="flex items-center gap-3 border-b border-(--border-color) pb-4">
                <div className="w-11 h-11 rounded-2xl bg-[#123c73] dark:bg-[#bf0202] text-white flex items-center justify-center font-heading text-sm font-black shrink-0">
                  {(mobileActionSheetMember.full_name || 'M')[0]}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-heading font-bold text-base text-(--color-text) truncate">
                    {mobileActionSheetMember.full_name}
                  </h3>
                  <span className="text-xs font-mono text-slate-400 block">
                    {mobileActionSheetMember.member_id} • {mobileActionSheetMember.phone}
                  </span>
                </div>
              </div>

              <div className="space-y-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    const target = mobileActionSheetMember;
                    setMobileActionSheetMember(null);
                    setSelectedProfileMember(target);
                  }}
                  className="w-full p-3.5 bg-(--bg-page) rounded-2xl flex items-center gap-3 text-xs font-heading font-bold uppercase tracking-wider text-(--color-text) active:scale-[0.98]"
                >
                  <Eye className="w-4 h-4 text-blue-500" />
                  <span>View Member Profile Workspace</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const target = mobileActionSheetMember;
                    setMobileActionSheetMember(null);
                    setQrModalMember(target);
                  }}
                  className="w-full p-3.5 bg-(--bg-page) rounded-2xl flex items-center gap-3 text-xs font-heading font-bold uppercase tracking-wider text-(--color-text) active:scale-[0.98]"
                >
                  <QrCode className="w-4 h-4 text-blue-500" />
                  <span>Digital QR Card</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const target = mobileActionSheetMember;
                    setMobileActionSheetMember(null);
                    setWizardPrefillMember(target);
                    setIsWizardOpen(true);
                  }}
                  className="w-full p-3.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 rounded-2xl flex items-center gap-3 text-xs font-heading font-bold uppercase tracking-wider active:scale-[0.98]"
                >
                  <CreditCard className="w-4 h-4" />
                  <span>Enroll or Renew Subscription</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const target = mobileActionSheetMember;
                    setMobileActionSheetMember(null);
                    handleToggleSuspend(target);
                  }}
                  className="w-full p-3.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 rounded-2xl flex items-center gap-3 text-xs font-heading font-bold uppercase tracking-wider active:scale-[0.98]"
                >
                  {mobileActionSheetMember.status === 'Active' ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                  <span>{mobileActionSheetMember.status === 'Active' ? 'Suspend Member Access' : 'Reactivate Member Access'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setMobileActionSheetMember(null)}
                  className="w-full p-3.5 bg-slate-500/10 text-slate-400 rounded-2xl text-xs font-heading font-bold uppercase tracking-wider text-center mt-2"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* MODALS */}
      {isWizardOpen && (
        <IntakeWizardModal 
          isOpen={isWizardOpen}
          initialIntakeMode="Manual"
          prefillData={wizardPrefill}
          prefillMember={wizardPrefillMember}
          onClose={() => { 
            setIsWizardOpen(false); 
            setWizardPrefill(undefined); 
            setWizardPrefillMember(undefined);
          }}
          onComplete={fetchMembers}
        />
      )}

      {isRecycleOpen && (
        <MemberRecycleBin 
          isOpen={isRecycleOpen}
          onClose={() => setIsRecycleOpen(false)}
          onRestoreSuccess={fetchMembers}
        />
      )}

      <AnimatePresence>
        {selectedProfileMember && (
          <MemberProfileView 
            member={selectedProfileMember}
            onClose={() => setSelectedProfileMember(null)}
            onMutationSuccess={fetchMembers}
          />
        )}
      </AnimatePresence>

      {/* SINGLE CARD MODALS */}
      {qrModalMember && (
        <DigitalQRCardModal
          member={qrModalMember}
          subscription={getActiveSubscription(qrModalMember.member_id)}
          card={getActiveCard(qrModalMember.member_id)}
          onClose={() => setQrModalMember(null)}
          onOpenPrintModal={(memberId) => {
            setQrModalMember(null);
            setSelectedMemberIds([memberId]);
            setShowBatchCardModal(true);
          }}
        />
      )}

      {manualModalMember && (
        <ManualCardTemplateModal
          member={manualModalMember}
          onClose={() => setManualModalMember(null)}
        />
      )}

      {/* BATCH MULTI-SELECT MEMBER CARD PRINT WORKSPACE MODAL */}
      {showBatchCardModal && (
        <MemberCardPrintModal
          members={members}
          initialSelectedIds={selectedMemberIds}
          onClose={() => setShowBatchCardModal(false)}
        />
      )}

    </div>
  );
};

export default MembersList;