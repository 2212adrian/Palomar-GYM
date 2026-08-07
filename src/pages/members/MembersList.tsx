// src/pages/members/MembersList.tsx

import React, { useState, useMemo, useEffect, useContext, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { 
  Users, Eye, CreditCard, RotateCcw, Plus, Search, Settings,
  X, Award, Clock, UserX, UserCheck, QrCode, Filter, MoreVertical, Printer, Sparkles
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
  const searchInputRef = useRef<HTMLInputElement | null>(null);

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

  // Action Menu state (Desktop)
  const [openActionMenuId, setOpenActionMenuId] = useState<string | null>(null);

  // Mobile Bottom Bar / FAB State
  const [isMobileActionsOpen, setIsMobileActionsOpen] = useState(false);

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
   * Gets the most recent subscription record (active, expired, or scheduled) for details display
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

  // Latest Member Subscription Info Calculation
  const latestSubscriptionInfo = useMemo(() => {
    if (!subscriptions.length || !members.length) return null;

    const validSubs = subscriptions.filter(s => s.status !== 'Voided');
    if (!validSubs.length) return null;

    const sorted = [...validSubs].sort((a, b) => {
      const timeA = new Date(a.created_at || a.start_date).getTime();
      const timeB = new Date(b.created_at || b.start_date).getTime();
      return timeB - timeA;
    });

    const latestSub = sorted[0];
    if (!latestSub) return null;

    const member = members.find(m => m.member_id === latestSub.member_id);
    if (!member) return null;

    const subDate = new Date(latestSub.created_at || latestSub.start_date);
    const isValidDate = !isNaN(subDate.getTime());

    const dateStr = isValidDate
      ? subDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : 'N/A';
    const timeStr = isValidDate
      ? subDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
      : 'N/A';

    return {
      subscription: latestSub,
      member,
      dateStr,
      timeStr,
      planName: latestSub.plan_name || (latestSub.plan_type === 'yearly' ? 'Yearly Membership' : 'Monthly Membership'),
      price: latestSub.price,
      paymentMethod: latestSub.payment_method
    };
  }, [subscriptions, members]);

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
        statusLabel: 'No Active Contract',
        badgeStyle: 'bg-slate-500/10 text-slate-500 border-slate-500/20',
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
    badgeStyle: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20 font-bold',
    dotColor: 'bg-rose-500',
    subscribedAt: targetSub.start_date ? new Date(targetSub.start_date).toLocaleDateString() : null,
    queuedPlan: null
  };
}

    // 2. TRULY ACTIVE CONTRACT STATE
    const diffDays = Math.ceil((endMs - now) / (1000 * 60 * 60 * 24));
    
    let badgeStyle = 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20';
    let statusLabel = `${diffDays} Days remaining`;
    let dotColor = 'bg-emerald-500';

    if (diffDays <= 3) {
      badgeStyle = 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20';
      statusLabel = `${diffDays} Days Left (Renew)`;
      dotColor = 'bg-amber-500';
    } else if (diffDays <= 7) {
      badgeStyle = 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20';
      statusLabel = `${diffDays} Days Left`;
      dotColor = 'bg-amber-500';
    }

    const subDate = new Date(targetSub.created_at || targetSub.start_date);
    const dateFormatted = !isNaN(subDate.getTime())
      ? `${subDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
      : null;

    return {
      hasSub: true,
      canRenew: diffDays <= 30 && !queuedSub, // Can renew if <= 30 days left and no queued plan yet
      planName: targetSub.plan_name || (targetSub.plan_type === 'yearly' ? 'Yearly Membership' : 'Monthly Membership'),
      statusLabel,
      badgeStyle,
      dotColor,
      subscribedAt: dateFormatted,
      queuedPlan: queuedSub ? (queuedSub.plan_name || (queuedSub.plan_type === 'yearly' ? 'Yearly Membership' : 'Monthly Membership')) : null
    };
  }, [getActiveSubscription, getQueuedSubscription, getLatestSubscriptionRecord]);

  // Metric Calculations
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
        if (activeSub) return false; // If has active sub, not expired
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
      return 'group bg-slate-200/50 dark:bg-zinc-900/40 hover:!bg-blue-500/5 dark:hover:!bg-blue-500/10 opacity-60 text-slate-400 transition-colors duration-150 cursor-pointer';
    }
    return 'group hover:!bg-blue-500/5 dark:hover:!bg-blue-500/10 transition-colors duration-150 cursor-pointer';
  };

  const columns: Column<Member>[] = [
    {
      key: 'select',
      header: isSelectionActive ? (
        <div className="flex items-center justify-center h-full w-full py-1">
          <input
            type="checkbox"
            checked={filteredMembers.length > 0 && filteredMembers.every(m => selectedMemberIds.includes(m.id))}
            onChange={(e) => {
              if (e.target.checked) {
                const currentIds = filteredMembers.map(m => m.id);
                setSelectedMemberIds(prev => Array.from(new Set([...prev, ...currentIds])));
              } else {
                const currentIds = filteredMembers.map(m => m.id);
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
            className="w-5 h-5 rounded border-slate-300 dark:border-white/10 text-blue-600 cursor-pointer accent-[#123c73] transition-transform duration-150 hover:scale-110"
          />
        </label>
      ) : null
    },
    {
      key: 'full_name',
      header: 'Member / ID',
      sortable: true,
      render: (item) => (
        <div className="flex items-center gap-3 py-1 text-left">
          <div className="w-9 h-9 rounded-xl bg-[#123c73] dark:bg-[#bf0202] text-white flex items-center justify-center font-heading text-xs font-bold shadow-xs shrink-0">
            {(item.full_name || 'M')[0]}
          </div>
          <div className="min-w-0">
            <span className="font-bold block text-xs text-(--color-text) truncate">{item.full_name}</span>
            <span className="text-[10px] text-slate-400 font-mono block mt-0.5 leading-none truncate">
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
        const isLatest = latestSubscriptionInfo?.member.id === item.id;

        return (
          <div className="text-left leading-tight space-y-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-sans font-bold text-xs block text-(--color-text)">{subInfo.planName}</span>
              {isLatest && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full text-[8px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 animate-pulse">
                  <Sparkles className="w-2.5 h-2.5 text-emerald-500" /> Latest
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <span className={`inline-block px-2 py-0.5 rounded text-[8px] font-mono font-bold uppercase border ${subInfo.badgeStyle}`}>
                {subInfo.statusLabel}
              </span>
              {subInfo.queuedPlan && (
                <span className="inline-block px-2 py-0.5 rounded text-[8px] font-mono font-bold uppercase border bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20" title="Queued renewal after current plan expires">
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
      header: 'Security Badge',
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
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[8px] font-semibold bg-slate-500/10 text-slate-500 border border-slate-500/20">
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
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[8px] font-bold border cursor-pointer hover:opacity-80 transition-opacity ${
              isQr 
                ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20' 
                : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
            }`}
            title="Click to view & print card"
          >
            {isQr ? <QrCode className="w-3 h-3 text-blue-500" /> : <CreditCard className="w-3 h-3 text-amber-500" />}
            <span>{isQr ? 'Digital QR Badge' : 'Manual Badge'}</span>
          </button>
        );
      }
    },
    {
      key: 'status',
      header: 'System Status',
      sortable: true,
      render: (item) => (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider border ${
          item.status === 'Active' 
            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' 
            : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
        }`}>
          {item.status}
        </span>
      )
    },
    {
      key: 'actions',
      header: 'Actions',
      cellClassName: 'text-right min-w-[180px]',
      render: (item) => {
        const subInfo = getSubscriptionDetails(item.member_id);

        return (
          <div 
            className="opacity-0 group-hover/row:opacity-100 transition-opacity duration-150 flex items-center justify-end gap-1.5 select-none relative"
            onClick={(e) => e.stopPropagation()}
          >
            {subInfo.canRenew && (
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setWizardPrefillMember(item);
                  setIsWizardOpen(true);
                }}
                className="p-1.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500 hover:text-white rounded-lg cursor-pointer border border-emerald-500/20 inline-flex items-center gap-1 text-[9px] font-heading tracking-wider uppercase font-bold transition-colors"
                title="Enroll or renew member subscription contract"
              >
                <CreditCard className="w-3.5 h-3.5" /> {subInfo.hasSub ? 'Renew' : 'Subscribe'}
              </button>
            )}
            
            <button 
              onClick={(e) => {
                e.stopPropagation();
                setSelectedProfileMember(item);
              }}
              className="p-1.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500 hover:text-white rounded-lg cursor-pointer border border-blue-500/20 inline-flex items-center gap-1 text-[9px] font-heading tracking-wider uppercase font-bold transition-colors"
              title="See profile details"
            >
              <Eye className="w-3.5 h-3.5" /> Profile
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenActionMenuId(openActionMenuId === item.id ? null : item.id);
                }}
                className="p-1.5 rounded-lg border border-(--border-color) bg-(--bg-page) text-slate-400 hover:text-(--color-text) cursor-pointer"
              >
                <MoreVertical className="w-3.5 h-3.5" />
              </button>

              {openActionMenuId === item.id && (
                <div 
                  onClick={(e) => e.stopPropagation()}
                  className="absolute right-0 top-full mt-1 w-44 bg-(--bg-card) border border-(--border-color) rounded-2xl shadow-xl z-30 p-1.5 space-y-1 font-body text-xs text-left animate-fade-in"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setOpenActionMenuId(null);
                      setSelectedProfileMember(item);
                    }}
                    className="w-full px-3 py-2 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-xl flex items-center gap-2 text-[10px] font-bold text-(--color-text) cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5 text-blue-500" />
                    <span>View Workspace</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setOpenActionMenuId(null);
                      setQrModalMember(item);
                    }}
                    className="w-full px-3 py-2 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-xl flex items-center gap-2 text-[10px] font-bold text-(--color-text) cursor-pointer"
                  >
                    <QrCode className="w-3.5 h-3.5 text-blue-500" />
                    <span>Digital QR Card</span>
                  </button>

                  <div className="border-t border-(--border-color) my-1" />

                  <button
                    type="button"
                    onClick={() => {
                      setOpenActionMenuId(null);
                      handleToggleSuspend(item);
                    }}
                    className="w-full px-3 py-2 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-xl flex items-center gap-2 text-[10px] font-bold text-amber-600 dark:text-amber-400 cursor-pointer"
                  >
                    {item.status === 'Active' ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
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

  // Header Actions Sync (PRINT MEMBER CARDS BUTTON)
  useEffect(() => {
    if (hideHeaderActions || isPlansPath) {
      return;
    }

    setActions(
      <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto justify-end animate-fade-in select-none">
        {activeTab === 'Directory' && (
          <>
            <Button
              onClick={handleOpenPrintModal}
              variant="secondary"
              className="py-2 px-3.5 w-auto! text-xs flex items-center gap-1.5 cursor-pointer font-bold animate-fade-in"
              title="Open full member credential card print workspace"
            >
              <Printer className="w-4 h-4 text-red-500" />
              <span>PRINT MEMBER CARDS</span>
            </Button>

            <Button
              onClick={() => setIsRecycleOpen(true)}
              variant="secondary"
              className="py-2 px-3.5 w-auto! text-xs flex items-center gap-1.5 cursor-pointer font-bold animate-fade-in"
            >
              <RotateCcw className="w-4 h-4 text-amber-500" />
              <span>RECYCLE BIN</span>
            </Button>

            <Button
              onClick={() => { 
                setWizardPrefillMember(undefined); 
                setWizardPrefill(undefined); 
                setIsWizardOpen(true); 
              }}
              variant="primary"
              className="py-2 px-3.5 w-auto! text-xs flex items-center gap-1.5 shadow-md cursor-pointer animate-fade-in"
            >
              <Plus className="w-4 h-4" />
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

  return (
    <div className="relative min-h-[85vh] w-full animate-fade-in text-xs text-(--color-text)">
      
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
                  className={`flex-1 py-3 px-2 font-heading text-[10px] md:text-xs tracking-wider uppercase font-black cursor-pointer flex items-center justify-center gap-1.5 transition-all ${
                    activeTab === item.id 
                      ? 'border-b-2 border-[#123c73] dark:border-[#bf0202] text-slate-900 dark:text-white' 
                      : 'border-b-2 border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-4 md:mt-6 space-y-4 md:space-y-6">
            {activeTab === 'Directory' && (
              <div className="space-y-4 md:space-y-6 pb-40 md:pb-24">
                
                {/* 1. DESKTOP STATS GRID */}
                <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-4 gap-4 select-none">
                  <div className="p-4 bg-(--bg-card) border border-(--border-color) rounded-2xl flex items-center gap-3.5 shadow-xs hover:-translate-y-0.5 transition-all">
                    <div className="p-3 bg-blue-500/10 rounded-xl text-blue-500 border border-blue-500/20 shrink-0">
                      <Users className="w-6 h-6" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">TOTAL MEMBERS</span>
                      <span className="text-base font-heading font-black text-(--color-text) block leading-tight">
                        {stats.total}
                      </span>
                      <span className="text-[9px] font-mono text-slate-400 block truncate">Registered Profiles</span>
                    </div>
                  </div>

                  <div className="p-4 bg-(--bg-card) border border-(--border-color) rounded-2xl flex items-center gap-3.5 shadow-xs hover:-translate-y-0.5 transition-all">
                    <div className="p-3 bg-emerald-500/10 rounded-xl text-emerald-500 border border-emerald-500/20 shrink-0">
                      <Award className="w-6 h-6" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">ONGOING SUBSCRIPTION</span>
                      <span className="text-base font-heading font-black text-emerald-600 dark:text-emerald-400 block leading-tight">
                        {stats.activeSubscriptions}
                      </span>
                      <span className="text-[9px] font-mono text-emerald-600/70 dark:text-emerald-400/70 block truncate">Active Contracts</span>
                    </div>
                  </div>

                  <div className="p-4 bg-(--bg-card) border border-(--border-color) rounded-2xl flex items-center gap-3.5 shadow-xs hover:-translate-y-0.5 transition-all">
                    <div className="p-3 bg-amber-500/10 rounded-xl text-amber-500 border border-amber-500/20 shrink-0">
                      <Clock className="w-6 h-6" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">EXPIRING SOON</span>
                      <span className="text-base font-heading font-black text-amber-600 dark:text-amber-400 block leading-tight">
                        {stats.expiringSoon}
                      </span>
                      <span className="text-[9px] font-mono text-amber-600/70 dark:text-amber-400/70 block truncate">Within 7 Days</span>
                    </div>
                  </div>

                  <div className="p-4 bg-(--bg-card) border border-(--border-color) rounded-2xl flex items-center gap-3.5 shadow-xs hover:-translate-y-0.5 transition-all">
                    <div className="p-3 bg-rose-500/10 rounded-xl text-rose-500 border border-rose-500/20 shrink-0">
                      <UserX className="w-6 h-6" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">SUSPENDED</span>
                      <span className="text-base font-heading font-black text-rose-600 dark:text-rose-400 block leading-tight">
                        {stats.suspendedMembers}
                      </span>
                      <span className="text-[9px] font-mono text-rose-600/70 dark:text-rose-400/70 block truncate">Locked Profiles</span>
                    </div>
                  </div>
                </div>

                {/* 2. MOBILE COMPACT 2X2 STATS GRID (< MD) */}
                <div className="grid grid-cols-2 gap-2.5 md:hidden select-none">
                  <div className="p-3 bg-(--bg-card) border border-(--border-color) rounded-2xl flex items-center gap-3 h-19">
                    <div className="p-2.5 bg-blue-500/10 rounded-xl text-blue-500 border border-blue-500/20 shrink-0">
                      <Users className="w-4.5 h-4.5" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-sm font-heading font-black text-(--color-text) block leading-tight">
                        {stats.total}
                      </span>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block leading-tight mt-0.5">MEMBERS</span>
                    </div>
                  </div>

                  <div className="p-3 bg-(--bg-card) border border-(--border-color) rounded-2xl flex items-center gap-3 h-19">
                    <div className="p-2.5 bg-emerald-500/10 rounded-xl text-emerald-500 border border-emerald-500/20 shrink-0">
                      <Award className="w-4.5 h-4.5" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-sm font-heading font-black text-emerald-600 dark:text-emerald-400 block leading-tight">
                        {stats.activeSubscriptions}
                      </span>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block leading-tight mt-0.5">ACTIVE</span>
                    </div>
                  </div>

                  <div className="p-3 bg-(--bg-card) border border-(--border-color) rounded-2xl flex items-center gap-3 h-19">
                    <div className="p-2.5 bg-amber-500/10 rounded-xl text-amber-500 border border-amber-500/20 shrink-0">
                      <Clock className="w-4.5 h-4.5" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-sm font-heading font-black text-amber-600 dark:text-amber-400 block leading-tight">
                        {stats.expiringSoon}
                      </span>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block leading-tight mt-0.5">EXPIRING</span>
                    </div>
                  </div>

                  <div className="p-3 bg-(--bg-card) border border-(--border-color) rounded-2xl flex items-center gap-3 h-19">
                    <div className="p-2.5 bg-rose-500/10 rounded-xl text-rose-500 border border-rose-500/20 shrink-0">
                      <UserX className="w-4.5 h-4.5" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-sm font-heading font-black text-rose-600 dark:text-rose-400 block leading-tight">
                        {stats.suspendedMembers}
                      </span>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block leading-tight mt-0.5">LOCKED</span>
                    </div>
                  </div>
                </div>

                {/* 🌟 MOST RECENT SUBSCRIBER HIGHLIGHT CARD */}
                {latestSubscriptionInfo && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 bg-gradient-to-r from-blue-900/15 via-(--bg-card) to-emerald-900/10 border border-blue-500/20 dark:border-blue-500/30 rounded-2xl shadow-xs relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-4 select-none group"
                  >
                    <div className="absolute -right-10 -bottom-10 w-36 h-36 bg-blue-500/10 dark:bg-red-500/10 rounded-full blur-2xl pointer-events-none group-hover:bg-blue-500/20 transition-all duration-500" />

                    <div className="flex items-center gap-3.5 min-w-0 relative z-10">
                      {/* Pulsing Avatar */}
                      <div className="relative shrink-0">
                        <div className="w-11 h-11 md:w-12 md:h-12 rounded-2xl bg-gradient-to-br from-[#123c73] to-blue-600 dark:from-[#bf0202] dark:to-red-700 text-white flex items-center justify-center font-heading text-base font-black shadow-md">
                          {(latestSubscriptionInfo.member.full_name || 'M')[0]}
                        </div>
                        <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500 border-2 border-(--bg-card)"></span>
                        </span>
                      </div>

                      <div className="min-w-0 space-y-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                            <Sparkles className="w-3 h-3 text-emerald-500" /> MOST RECENT SUBSCRIBER
                          </span>
                          <span className="text-[10px] font-mono text-slate-400">
                            {latestSubscriptionInfo.member.member_id}
                          </span>
                        </div>

                        <h3 className="font-heading font-bold text-sm md:text-base text-(--color-text) truncate">
                          {latestSubscriptionInfo.member.full_name}
                        </h3>

                        <div className="flex items-center gap-2.5 text-[11px] font-medium text-slate-400 flex-wrap">
                          <span className="font-bold text-blue-600 dark:text-blue-400 flex items-center gap-1">
                            <Award className="w-3.5 h-3.5" />
                            {latestSubscriptionInfo.planName}
                          </span>
                          <span>•</span>
                          <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                            ₱{latestSubscriptionInfo.price?.toLocaleString()}
                          </span>
                          <span>•</span>
                          <span className="font-mono flex items-center gap-1 text-(--color-text)">
                            <Clock className="w-3.5 h-3.5 text-amber-500" />
                            {latestSubscriptionInfo.dateStr} at <strong className="text-amber-600 dark:text-amber-400 font-bold">{latestSubscriptionInfo.timeStr}</strong>
                          </span>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setSelectedProfileMember(latestSubscriptionInfo.member)}
                      className="w-full md:w-auto px-4 py-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 rounded-xl text-xs font-heading font-bold uppercase tracking-wider border border-blue-500/20 transition-all cursor-pointer flex items-center justify-center gap-2 shrink-0 relative z-10 active:scale-95"
                    >
                      <Eye className="w-4 h-4" />
                      <span>View Member</span>
                    </button>
                  </motion.div>
                )}

                {/* SEARCH & STREAMLINED CHIP FILTERS TOOLBAR */}
                <div className="space-y-3 bg-(--bg-card) p-3 md:p-3.5 rounded-2xl border border-(--border-color) shadow-xs">
                  
                  <div className="relative w-full">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      ref={searchInputRef}
                      type="text"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Search profiles by Name, ID, Phone, or Email..."
                      className="w-full pl-10 pr-10 py-2.5 border border-(--border-color) bg-(--bg-page) rounded-xl outline-none font-medium text-xs text-(--color-text) focus:border-blue-500 transition-all"
                    />

                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-md text-slate-400 hover:text-(--color-text) cursor-pointer"
                        title="Clear search query"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap scrollbar-none pb-1 select-none">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1 shrink-0 pr-1">
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
                        className={`px-3 py-1.5 rounded-xl text-[10px] font-heading font-bold uppercase tracking-wider cursor-pointer border transition-all flex items-center gap-1.5 shrink-0 ${
                          activeChip === chip.id
                            ? 'bg-[#123c73] dark:bg-[#bf0202] text-white border-transparent shadow-xs'
                            : 'bg-(--bg-page) border-(--border-color) text-slate-400 hover:text-(--color-text)'
                        }`}
                      >
                        <span>{chip.label}</span>
                        <span className={`px-1.5 py-0.2 rounded-full font-mono text-[9px] ${
                          activeChip === chip.id
                            ? 'bg-white/20 text-white'
                            : 'bg-slate-200 dark:bg-zinc-800 text-slate-500'
                        }`}>
                          {chip.count}
                        </span>
                      </button>
                    ))}
                  </div>

                </div>

                {/* DESKTOP TABLE VIEW (HIDDEN ON MOBILE) */}
                <div className="hidden md:block p-1 bg-(--bg-card) border border-(--border-color) rounded-2xl overflow-hidden shadow-xs">
                  {loading ? (
                    <div className="p-6 space-y-3">
                      <Skeleton height={20} count={6} baseColor="var(--border-color)" />
                    </div>
                  ) : filteredMembers.length === 0 ? (
                    <div className="p-12 text-center space-y-3">
                      <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-zinc-800 text-slate-400 mx-auto flex items-center justify-center">
                        <Search className="w-6 h-6" />
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
                          className="px-4 py-2 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-xl font-heading text-[10px] font-bold uppercase tracking-wider cursor-pointer border border-blue-500/20"
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
                </div>

                {/* MOBILE CARD LIST VIEW (< MD) */}
                <div className="block md:hidden space-y-3">
                  {loading ? (
                    <div className="p-4 space-y-3">
                      <Skeleton height={110} count={4} borderRadius={16} baseColor="var(--border-color)" />
                    </div>
                  ) : filteredMembers.length === 0 ? (
                    <div className="p-8 text-center space-y-3 bg-(--bg-card) border border-(--border-color) rounded-2xl">
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
                          className="px-3.5 py-1.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-xl font-heading text-[10px] font-bold uppercase tracking-wider border border-blue-500/20"
                        >
                          Clear Filters
                        </button>
                      )}
                    </div>
                  ) : (
                    <>
                      {/* Select All Row on Mobile when Multi-Select Active */}
                      {isSelectionActive && (
                        <div className="flex items-center justify-between px-3 py-2 bg-slate-500/10 border border-(--border-color) rounded-xl select-none">
                          <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-(--color-text)">
                            <input
                              type="checkbox"
                              checked={filteredMembers.every(m => selectedMemberIds.includes(m.id))}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedMemberIds(filteredMembers.map(m => m.id));
                                } else {
                                  setSelectedMemberIds([]);
                                }
                              }}
                              className="w-4 h-4 rounded border-slate-300 text-blue-600 accent-[#123c73]"
                            />
                            <span>Select All Loaded ({filteredMembers.length})</span>
                          </label>

                          <button
                            type="button"
                            onClick={() => setSelectedMemberIds([])}
                            className="text-[10px] font-bold text-rose-500 uppercase tracking-wider"
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
                        const isLatest = latestSubscriptionInfo?.member.id === member.id;

                        return (
                          <div
                            key={member.id}
                            onClick={() => handleRowClick(member)}
                            className={`p-4 rounded-2xl border transition-all select-none space-y-3 relative ${
                              isSelected
                                ? 'bg-blue-500/10 dark:bg-blue-500/15 border-blue-500 shadow-md'
                                : isSuspended
                                ? 'bg-slate-200/50 dark:bg-zinc-900/40 border-(--border-color) opacity-70'
                                : 'bg-(--bg-card) border-(--border-color) shadow-xs active:scale-[0.99]'
                            }`}
                          >
                            {/* Card Header: Checkbox + Avatar + Details + Status */}
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-center gap-3 min-w-0">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={(e) => {
                                    e.stopPropagation();
                                    handleRowClick(member);
                                  }}
                                  className="w-5 h-5 rounded border-slate-300 dark:border-white/10 text-blue-600 accent-[#123c73] shrink-0 cursor-pointer"
                                />

                                <div className="w-11 h-11 rounded-2xl bg-[#123c73] dark:bg-[#bf0202] text-white flex items-center justify-center font-heading text-sm font-black shadow-xs shrink-0">
                                  {(member.full_name || 'M')[0]}
                                </div>

                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <h3 className="font-heading font-bold text-sm text-(--color-text) truncate leading-tight">
                                      {member.full_name}
                                    </h3>
                                    {isLatest && (
                                      <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full text-[8px] font-black uppercase bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                                        <Sparkles className="w-2.5 h-2.5 text-emerald-500" /> Latest Sub
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-xs font-mono text-slate-400 block mt-0.5 truncate">
                                    {member.member_id}
                                  </span>
                                </div>
                              </div>

                              {/* Status Pill */}
                              <span className={`px-2.5 py-1 rounded-full text-[9px] font-heading font-black uppercase tracking-wider border shrink-0 flex items-center gap-1 ${
                                isSuspended
                                  ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                                  : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                              }`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${isSuspended ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                                {member.status}
                              </span>
                            </div>

                            {/* Plan & Security Details Grid */}
                            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-(--border-color)">
                              <div className="space-y-1">
                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">PLAN</span>
                                <span className="font-bold text-xs text-(--color-text) block truncate">{subInfo.planName}</span>
                                <div className="flex flex-wrap items-center gap-1">
                                  <span className={`inline-block px-2 py-0.5 rounded text-[8px] font-mono font-bold uppercase border ${subInfo.badgeStyle}`}>
                                    {subInfo.statusLabel}
                                  </span>
                                  {subInfo.queuedPlan && (
                                    <span className="inline-block px-2 py-0.5 rounded text-[8px] font-mono font-bold uppercase border bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20">
                                      Queued: {subInfo.queuedPlan}
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="space-y-1 text-right">
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
                                      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[8px] font-bold border ${
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
                                <span className="text-[10px] text-slate-400 font-mono block mt-1">
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
                                className="flex-1 min-h-[44px] px-3 py-2 bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500 hover:text-white rounded-xl text-xs font-heading font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 border border-blue-500/20 transition-colors"
                              >
                                <Eye className="w-4 h-4" />
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
                                  className="flex-1 min-h-[44px] px-3 py-2 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500 hover:text-white rounded-xl text-xs font-heading font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 border border-emerald-500/20 transition-colors"
                                >
                                  <CreditCard className="w-4 h-4" />
                                  <span>{subInfo.hasSub ? 'Renew' : 'Subscribe'}</span>
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setMobileActionSheetMember(member);
                                }}
                                className="min-h-[44px] min-w-[44px] px-3 py-2 bg-(--bg-page) text-slate-400 border border-(--border-color) rounded-xl flex items-center justify-center hover:text-(--color-text)"
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
                        <div className="flex items-center justify-between pt-3 pb-2 select-none">
                          <span className="text-xs text-slate-400 font-mono">
                            Page {mobilePage} of {totalMobilePages}
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              disabled={mobilePage === 1}
                              onClick={() => setMobilePage(p => Math.max(1, p - 1))}
                              className="px-3.5 py-2 rounded-xl border border-(--border-color) bg-(--bg-card) text-xs font-bold disabled:opacity-40"
                            >
                              Prev
                            </button>
                            <button
                              disabled={mobilePage === totalMobilePages}
                              onClick={() => setMobilePage(p => Math.min(totalMobilePages, p + 1))}
                              className="px-3.5 py-2 rounded-xl border border-(--border-color) bg-(--bg-card) text-xs font-bold disabled:opacity-40"
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
      <div className="hidden md:flex fixed md:bottom-25 lg:bottom-6 left-1/2 -translate-x-1/2 z-[60] bg-(--bg-card) text-(--color-text) px-5 py-3 rounded-2xl shadow-2xl border border-(--border-color) items-center gap-4 animate-slide-up select-none">
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
            className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 dark:bg-red-600 dark:hover:bg-red-700 text-white rounded-xl text-[10px] font-heading font-bold uppercase tracking-wider cursor-pointer flex items-center gap-1.5 transition-colors shadow-md border-none"
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

      {/* 2. MOBILE MULTI-SELECT BOTTOM ACTION SHEET (< MD) */}
      <AnimatePresence>
        {isSelectionActive && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="md:hidden fixed bottom-20 left-3 right-3 z-50 bg-(--bg-card) text-(--color-text) p-3 rounded-2xl shadow-2xl border border-(--border-color) flex items-center justify-between gap-3 select-none"
          >
            <div className="flex items-center gap-2.5">
              <span className="w-7 h-7 rounded-xl bg-[#123c73] dark:bg-[#bf0202] text-white font-mono font-bold text-xs flex items-center justify-center shadow-xs">
                {selectedMemberIds.length}
              </span>
              <div>
                <span className="font-heading text-xs font-bold uppercase tracking-wider block text-(--color-text) leading-none">
                  Members Selected
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
              className="px-4 py-2.5 bg-blue-600 dark:bg-red-600 text-white rounded-xl text-xs font-heading font-bold uppercase tracking-wider cursor-pointer flex items-center gap-2 shadow-md active:scale-95 transition-transform"
            >
              <Printer className="w-4 h-4" />
              <span>Print Cards</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 3. MOBILE COMPACT BOTTOM DIRECTORY BAR & EXPANDABLE FAB (< MD) */}
      {activeTab === 'Directory' && (
        <>
          {/* Backdrop for FAB Menu */}
          <AnimatePresence>
            {isMobileActionsOpen && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsMobileActionsOpen(false)}
                className="md:hidden fixed inset-0 bg-black/60 backdrop-blur-xs z-35"
              />
            )}
          </AnimatePresence>

          {/* Expanded FAB Menu Items */}
          <div className="md:hidden fixed bottom-36 right-4 z-40 flex flex-col items-end gap-2.5 select-none">
            <AnimatePresence>
              {isMobileActionsOpen && (
                <motion.div 
                  initial={{ opacity: 0, y: 15, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 15, scale: 0.9 }}
                  className="flex flex-col items-end gap-2 mb-1"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setIsMobileActionsOpen(false);
                      setIsRecycleOpen(true);
                    }}
                    className="flex items-center gap-2.5 px-4 py-3 bg-(--bg-card) text-(--color-text) border border-(--border-color) text-xs font-heading tracking-widest uppercase rounded-2xl shadow-xl active:scale-95 transition-transform"
                  >
                    <RotateCcw className="w-4 h-4 text-amber-500" />
                    <span>Recycle Bin</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsMobileActionsOpen(false);
                      handleOpenPrintModal();
                    }}
                    className="flex items-center gap-2.5 px-4 py-3 bg-(--bg-card) text-(--color-text) border border-(--border-color) text-xs font-heading tracking-widest uppercase rounded-2xl shadow-xl active:scale-95 transition-transform"
                  >
                    <Printer className="w-4 h-4 text-red-500" />
                    <span>Print Cards</span>
                  </button>
                  
                  <button
                    type="button"
                    onClick={() => {
                      setIsMobileActionsOpen(false);
                      setWizardPrefillMember(undefined);
                      setWizardPrefill(undefined);
                      setIsWizardOpen(true);
                    }}
                    className="flex items-center gap-2.5 px-4 py-3 bg-[#123c73] dark:bg-[#bf0202] text-white text-xs font-heading tracking-widest uppercase rounded-2xl shadow-xl active:scale-95 transition-transform"
                  >
                    <Plus className="w-4 h-4 text-emerald-400" />
                    <span>Enroll Member</span>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Floating Mobile Bottom Directory Bar */}
          <div className="md:hidden fixed bottom-20 left-3 right-3 h-14 bg-(--bg-card)/95 backdrop-blur-xl border border-(--border-color) rounded-2xl flex items-center justify-between px-4 z-40 shadow-2xl">
            <div className="flex items-center gap-2.5 text-xs font-heading font-bold text-(--color-text) select-none">
              <div className="flex items-center gap-1.5">
                <Users className="w-4 h-4 text-[#123c73] dark:text-[#bf0202]" />
                <span>{stats.total} Members</span>
              </div>
              <span className="text-slate-300 dark:text-zinc-700">•</span>
              <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                <UserCheck className="w-4 h-4" />
                <span>{stats.activeSubscriptions} Active</span>
              </div>
            </div>

            <motion.button
              type="button"
              whileTap={{ scale: 0.9 }}
              onClick={() => setIsMobileActionsOpen(!isMobileActionsOpen)}
              className="flex items-center justify-center w-10 h-10 text-white rounded-xl cursor-pointer bg-[#123c73] dark:bg-[#bf0202] shadow-md border border-white/10"
              title="Quick Actions"
            >
              <Plus className={`w-5 h-5 transition-transform duration-200 ${isMobileActionsOpen ? 'rotate-45' : ''}`} />
            </motion.button>
          </div>
        </>
      )}

      {/* 4. MOBILE SLIDE-UP ACTION SHEET FOR INDIVIDUAL MEMBER (< MD) */}
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
              {/* Sheet Drag Pill */}
              <div className="w-12 h-1.5 rounded-full bg-slate-300 dark:bg-zinc-700 mx-auto" />

              {/* Member Header */}
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

              {/* Menu Options List */}
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
                  <span>Digital QR Security Badge</span>
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
